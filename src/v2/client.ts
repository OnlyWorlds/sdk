/**
 * keel v2 engine absorbed from an earlier v2 client (ow-v2-client v0.9.0),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * OwV2Client -- thin typed fetch client for the keel v2 API.
 *
 * Deliberately thin: no caching, no sync state, no retry policy -- those belong
 * to callers (sync engines, tools, games). What IS encoded here is the wire
 * contract and its safety rails: payload read-only-field stripping, opaque
 * cursors, idempotency headers, doc_url-bearing errors, polite page sizes, and
 * client-side UUID minting so idempotent retries are structurally safe.
 */

import type { ElementType } from './types.generated';
import type {
  ListParams, OwBulkItem, OwBulkResponse, OwChange, OwChangesPage,
  OwClientConfig, OwElement, OwLinkEdit, OwMediaTicket, OwPage, OwRemovalTicket, OwRemovedImage,
  OwUploadedImage, OwWorldMeta, OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwMember, OwWorldLenses,
  OwSortAnswer, OwSortNote, OwSortRef, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwMemberLenses, OwAccountWorld, OwMintedKey, OwDraught, OwDraughtCompact, OwDraughtPolicy, OwHiddenRow, OwJoined, OwAgentJoined, OwPlayerJoined,
  OwSignedIn, OwFileKind, OwFileRow, OwWorldFiles, OwFileTicket, OwUploadedFile, OwFileDownload,
  OwResyncReason, OwProposal, OwProposalList, OwProposed, OwProposalAccepted, OwProposeInput, OwProposalQuery, OwWorldProposalQuery,
  OwWorldProposalList, OwReviewInput, OwReviewed, OwCreateAccountWorldInput, OwCreatedAccountWorld,
} from './types';
import { keyedId } from './keyed-id';
import { unknownKey } from '../options';
import { OwApiError, OwNetworkError, OwProposedError, OwSignInError, errorFromResponse, parseErrorEnvelope, parseRetryAfter } from './errors';
import { detectKeyKind, OwKeyKind } from './keys';
import { beginSignIn, completeSignIn as completeOAuthSignIn, type OwSignInBegin, type OwSignInBegun, type OwSignInComplete, type OwSignInResult } from './oauth';

const DEFAULT_BASE_URL = 'https://www.onlyworlds.com/api/v2';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CHANGES_PAGE_SIZE = 100;

export class OwV2Client {
  readonly baseUrl: string;
  readonly keyKind: OwKeyKind;
  readonly pageSize: number;
  readonly changesPageSize: number;

  private readonly apiKey: string;
  private readonly apiPin: string | undefined;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly agent: boolean;
  /** The name sent as X-OW-Client on element writes, checked at construction. */
  private readonly clientName: string;
  /** The conditional head poll's state, per instance. */
  private readonly headPoll = new HeadPollState();
  /** The world an account token or a keyless client reads (`world=`); undefined otherwise. */
  private readonly world: string | undefined;

  constructor(config: OwClientConfig = {}) {
    // The constructor's options object refuses an unknown key like every other (4.52.0's rule):
    // a typo here would otherwise fall back to a default without a sound (`clinet` → 'sdk').
    only('new OwV2Client', config, CLIENT_CONFIG_KEYS);
    this.clientName = clientNameOf(config.client);
    this.apiKey = config.apiKey ?? '';
    this.apiPin = config.apiPin || undefined;
    this.keyKind = config.apiKey ? detectKeyKind(config.apiKey) : 'none';
    this.world = worldOf(config.world, this.keyKind);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    this.changesPageSize = config.changesPageSize ?? DEFAULT_CHANGES_PAGE_SIZE;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.agent = config.agent === true;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('OwV2Client: no fetch available -- supply config.fetch');
    }
  }

  // -- Health & world meta -------------------------------------------------

  /** GET /health -- unauthenticated liveness pulse. */
  async health(): Promise<unknown> {
    return this.request('GET', '/health/', { auth: false });
  }

  /**
   * GET /world -- world meta (name, calendar/time fields, public_read).
   * GOTCHA (by server design): world-meta edits do NOT appear in /changes and
   * do not bump change_seq. Poll getWorld().updated_at for meta freshness.
   * On a client with `world` set (an account token or no key), it reads that world, sending `world=<id>`;
   * every read carries `counts`, as that reader may read. `signal` is passed to fetch as given.
   */
  async getWorld(opts: { signal?: AbortSignal } = {}): Promise<OwWorldMeta> {
    only('getWorld', opts, ['signal']);
    return this.request('GET', '/world/', { worldRead: true, ...withSignal(opts.signal) }) as Promise<OwWorldMeta>;
  }

  /**
   * PATCH /world -- partial world-meta update. The element write's server-managed keys are
   * stripped, and so are the world's own read-only ones (WORLD_READ_ONLY_FIELDS: `slug` and
   * `public_page`; `agent_writes_proposed`; set on the world page, not here;
   * `origin`; `id`), so a `getWorld()` body can be sent back. The world's origin is
   * written as `source` and `producer` (each an object or null, served under `origin`);
   * extension keys (`x_*`, `atlas_*`, `shadow_*`) are sent as given, and `null` removes one.
   */
  async patchWorld(partial: Record<string, unknown>): Promise<OwWorldMeta> {
    const body = sanitizePayload(partial);
    for (const field of WORLD_READ_ONLY_FIELDS) delete body[field];
    return this.request('PATCH', '/world/', { body }) as Promise<OwWorldMeta>;
  }

  // -- Who am I, and who is here ---------------------------------------------

  /**
   * GET /me -- who this world key is: the world, read or write scope, the kind (owner,
   * person, agent, player), the role, the membership id (what `created_by` holds for what this key
   * creates; null for the owner) and the member's Character. A world key's call; an account
   * token is a TypeError before sending.
   */
  /**
   * PUT /me/character -- pick the roster Character that is you in this world, or none.
   * A person member's write key with its PIN; answers GET /me's body. 422 for a hidden
   * Character (`character_hidden`, `err.isCharacterHidden`), a guest's pick it did not make, or a
   * taken Character (`invalid_request`, `param` character); 404 for one this key cannot see; 403 for
   * an agent seat, a player, the owner (whose own is the world's `owner_character`, set with
   * patchWorld) or a read key. A guest's view resets once.
   */
  async setMyCharacter(character: string | null): Promise<OwMe> {
    if (this.keyKind === 'account') {
      throw new TypeError('setMyCharacter needs a world key: an account token is not a member of one world');
    }
    return this.request('PUT', '/me/character', { write: true, body: { character } }) as Promise<OwMe>;
  }

  /**
   * PUT /me/lenses -- choose the lenses this key's holder starts with: lens ids in order, 0 to 20,
   * repeats dropped by keel; an empty list is a choice too (the draught then adds no frame), and keeps
   * a seat off its Titles' lenses. `null` goes back to never chosen: a seat playing a Character then
   * starts with its Titles' lenses (`lenses_from` says where a list comes from); on the owner's own
   * keys `null` is the empty list. Any write
   * key of the world, with its PIN, sets its own holder's list: a person member's, an agent seat's, or
   * on the owner's keys the owner's own; answers GET /me's body. The draught reads the list whenever it
   * is given no lens and no policy. 404 for a lens this key cannot see; 422 `not_a_lens`,
   * `lens_is_template` or `lens_hidden` (`param` lenses); 403 for a read key. A lens only narrows what
   * the holder may already read. An account token sets your own list in the world the client's
   * `world` names (`world=<id>`, the Bearer token, no PIN); without `world` set it is a TypeError
   * before sending. A world key sends no `world`: the key names its world.
   */
  async setMyLenses(lensIds: string[] | null): Promise<OwMe> {
    if (lensIds !== null && !Array.isArray(lensIds)) {
      throw new TypeError('setMyLenses: lensIds is a list of lens ids ([] for none, null for never chosen). Nothing was sent.');
    }
    return this.request('PUT', '/me/lenses', { accountToken: 'world', body: { lenses: lensIds } }) as Promise<OwMe>;
  }

  /**
   * GET /world/{worldId}/lenses -- every lens in the world this key can see, templates included and
   * marked, each with its recipe echoed (`x_lens`, defaults filled in), the Titles it is the default
   * for and whether this key chose it. `resolve: true` adds each lens's `reading` for this key: the kept
   * rows, the cut by reason, the mail part. The owner also gets `chosen_by`, `health` and the two counts
   * of what a reader cannot see; with `resolve`, the owner may `readAs` another reader (`guest`,
   * `contributor`, `co-builder`, `public`, or a membership id of this world). A co-builder, or the
   * account that sponsors an agent's or a player's seat, may `readAs` that seat by its membership id;
   * that reading is judged by the narrower view: the seat's rows within the caller's own view, and
   * what the caller cannot see counted under `not_visible`, never named. 403 `read_as_owner_only`
   * from any other key, 422 without `resolve`. `worldId` is the key's own world
   * (another is a 404). An account token reads the world `worldId` names, as its owner or as its
   * member there: the Bearer token alone, no `world=` (the client's `world` is not needed). Served
   * `Cache-Control: private, no-store`.
   */
  async worldLenses(worldId: string, opts: { resolve?: boolean; readAs?: string } = {}): Promise<OwWorldLenses> {
    only('worldLenses', opts, ['resolve', 'readAs']);
    if (opts.resolve !== undefined && typeof opts.resolve !== 'boolean') {
      throw new TypeError('worldLenses: resolve is true or false. Nothing was sent.');
    }
    const query = buildQuery({ resolve: opts.resolve, read_as: opts.readAs });
    return this.request('GET', `/world/${encodeURIComponent(worldId)}/lenses`, { query, accountToken: 'path' }) as Promise<OwWorldLenses>;
  }

  async me(): Promise<OwMe> {
    if (this.keyKind === 'account') {
      throw new TypeError('me needs a world key: an account token is not a member of one world');
    }
    return this.request('GET', '/me/') as Promise<OwMe>;
  }

  /**
   * GET /members -- the world's roster: each member's id (null for the owner), kind, role,
   * Character and status (`removed` rows stay, so their elements keep `created_by`). Returns
   * the rows; keel sends them as `{ data }` with no paging. A world key's call.
   */
  async members(): Promise<OwMember[]> {
    if (this.keyKind === 'account') {
      throw new TypeError('members needs a world key: an account token is not a member of one world');
    }
    const page = (await this.request('GET', '/members/')) as { data?: OwMember[] };
    return page.data ?? [];
  }

  // -- Element CRUD --------------------------------------------------------

  /**
   * GET /{type}/ -- one cursor page. On a client with `world` set (an account token or no key), it
   * reads that world, sending `world=<id>` beside the page's own parameters.
   */
  async list(type: ElementType | string, params: ListParams = {}): Promise<OwPage> {
    only('list', params, LIST_PARAM_KEYS, LIST_FILTER_HINT);
    if (params.filter && Object.prototype.hasOwnProperty.call(params.filter, 'world')) {
      // `world` is the client's, set at construction: in a filter it would go out twice, or to a world key that 422s it.
      throw new TypeError('list: `world` is not a filter; an account token or no key names its world with the client option (new OwV2Client({ world })). Nothing was sent.');
    }
    const query = buildQuery({
      limit: params.limit ?? this.pageSize,
      cursor: params.cursor,
      expand: params.expand?.join(','),
      fields: params.fields?.join(','),
      ids: params.ids?.join(','),
      created_by: params.createdBy,
      ...params.filter,
      as: params.viewAs,
    });
    return this.request('GET', `/${type}/`, { query, worldRead: true, ...withSignal(params.signal) }) as Promise<OwPage>;
  }

  /**
   * GET /character/{id}/context -- the draught: what one Character knows, as the
   * recorded world holds it, in one read: her element, what she holds and sits in, her open work,
   * how she works, the Events she was in, the Narratives she knows, everything else that names
   * her, her sheet, what changed around her (`since`), and who plays whom; the world's name and
   * calendar beside; the room's messages (`messages`), its other elements (`room`) and
   * elements written as proposed (`proposed`) only when `components` names them. Each
   * row carries the list route's body for the same reader as `element`, beside `via`, `her_links`
   * and `grade`; nothing is inferred. The owner's keys, co-builders and contributors for any
   * Character they can see; a player seat or a guest for its own Character only (another id is
   * 404). `asOf` is a filter on the elements' own dates, not time travel. A `cut` that is not
   * empty means the serving is partial (`cut.proposed` also counts proposed elements left out because
   * the component was not named). `compact: true` leaves out every empty section and an empty `cut`,
   * the frame and every null kept, and leaves out each element body's empty fields (`null`, `""`,
   * `[]`, `{}`; `id`, `type` and `name` always stay), answered as `OwDraughtCompact`. A Message
   * without the room mark is placed as any Narrative unless `messages` is named, when it is there
   * and in no other section; a room-marked Message is in `messages` or nowhere. `lens` (a lens id)
   * adds `lenses`, one frame with that lens read for this key's own view (beside `depth` or `budget`
   * a 422); with no policy key but `compact`, the packet adds one frame per lens chosen with
   * setMyLenses. Served `Cache-Control: private, no-store`.
   */
  draught(characterId: string, policy?: OwDraughtPolicy & { compact?: false }): Promise<OwDraught>;
  draught(characterId: string, policy: OwDraughtPolicy): Promise<OwDraughtCompact>;
  async draught(characterId: string, policy: OwDraughtPolicy = {}): Promise<OwDraught | OwDraughtCompact> {
    only('draught', policy, ['components', 'mode', 'asOf', 'undated', 'since', 'budget', 'depth', 'compact', 'lens']);
    if (policy.compact !== undefined && typeof policy.compact !== 'boolean') {
      throw new TypeError('draught: compact is true or false. Nothing was sent.');
    }
    const query = buildQuery({
      components: policy.components?.join(','),
      mode: policy.mode,
      as_of: policy.asOf,
      undated: policy.undated,
      since: policy.since,
      budget: policy.budget,
      depth: policy.depth,
      compact: policy.compact,
      lens: policy.lens,
    });
    return this.request('GET', `/character/${characterId}/context`, { query }) as Promise<OwDraught | OwDraughtCompact>;
  }

  /**
   * Cursor-walk every page of a type. Politeness: uses config pageSize. On a client with `world`
   * set, every page is read from that world, as list() reads it.
   */
  async *listAll(type: ElementType | string, params: Omit<ListParams, 'cursor'> = {}): AsyncGenerator<OwElement> {
    // Its own list, not list()'s: listAll walks from the first page, so a `cursor` it was handed would be overwritten unread.
    only('listAll', params, LIST_ALL_PARAM_KEYS, LIST_FILTER_HINT);
    let cursor: string | undefined;
    do {
      const page = await this.list(type, { ...params, cursor });
      for (const el of page.data) yield el;
      const next = page.has_more && page.next_cursor ? page.next_cursor : undefined;
      if (next !== undefined && next === cursor) {
        // A page that hands back the cursor it was asked with would be read again forever.
        throw new OwNetworkError(`listAll: GET /${type}/ answered the cursor it was sent, with more to come; the walk stopped rather than read the same page again`, null);
      }
      cursor = next;
    } while (cursor);
  }

  /**
   * GET /{type}/{id}/ -- optional one-level stub expansion / sparse fields, and `viewAs` (the owner reads as
   * another reader; see ListParams.viewAs). On a client with `world` set (an account token or no key),
   * it reads that world, sending `world=<id>`.
   */
  async get(type: ElementType | string, id: string, opts: Pick<ListParams, 'expand' | 'fields' | 'viewAs' | 'signal'> = {}): Promise<OwElement> {
    only('get', opts, ['expand', 'fields', 'viewAs', 'signal']);
    const query = buildQuery({ expand: opts.expand?.join(','), fields: opts.fields?.join(','), as: opts.viewAs });
    return this.request('GET', `/${type}/${id}/`, { query, worldRead: true, ...withSignal(opts.signal) }) as Promise<OwElement>;
  }

  /**
   * POST /{type}/ -- create one element, minting an id on the client when you leave id out.
   * With an `idempotencyKey`, the minted id is derived from the key (a UUIDv5, the same one the
   * Python package mints), so a retry with the same key and element sends the same body and keel
   * replays its first answer: nothing is written twice, and the stored 201 comes back. Without a
   * key, a fresh UUIDv7. You may still supply your own id. A new create meant to write again
   * (an undo that re-creates) needs a new key, or none: within 24 h a reused key only replays.
   * `name` is the one required field, and required means the key is present: `''` and
   * `null` are accepted and stored as `''` (nameless Markers exist).
   */
  async create(type: ElementType | string, element: OwElement | Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<OwElement> {
    only('create', opts, ['idempotencyKey']);
    refuseKnownOf(element, 'create');
    const body = sanitizePayload(element);
    if (body.id === undefined || body.id === null || body.id === '') {
      body.id = opts.idempotencyKey ? keyedId(opts.idempotencyKey, 0) : mintUuid();
    }
    return this.request('POST', `/${type}/`, {
      write: true,
      elementWrite: true,
      body,
      idempotencyKey: opts.idempotencyKey,
    }) as Promise<OwElement>;
  }

  /**
   * PUT /{type}/{id}/ -- upsert-by-client-id. The local-first write primitive. A known-of
   * stub (`known_of: true`, see isKnownOf) is a TypeError before sending, here and on every
   * element write: a PUT of one would blank every field it does not keep.
   * An agent seat's PUT on an existing element, in a world that takes its writes as proposals,
   * answers 202 and is thrown as an OwProposedError: the element did not change.
   */
  async upsert(type: ElementType | string, id: string, element: OwElement | Record<string, unknown>): Promise<OwElement> {
    refuseKnownOf(element, 'upsert');
    return this.request('PUT', `/${type}/${id}/`, { write: true, elementWrite: true, proposable: true, body: sanitizePayload(element) }) as Promise<OwElement>;
  }

  /**
   * PATCH /{type}/{id}/ -- partial update. DESTRUCTIVE on sent fields: arrays
   * replace wholesale, omitted fields stay untouched. For link arrays prefer
   * editLinks() -- atomic server-side merge, no read-before-write.
   *
   * `ifMatch`: the element's `change_seq` as you read it. The update lands
   * only if nobody changed the element since; otherwise nothing is written and this throws
   * an OwPreconditionFailedError (412) whose `current` is the element as it is now. Omit
   * it for today's unconditional write.
   *
   * In a world that takes an agent seat's writes as proposals (the world's
   * `agent_writes_proposed`), a seat's patch answers 202 with `{proposal}`, never an element:
   * this throws an OwProposedError (`err.isProposed`, the row under `err.proposal`) and the
   * element did not change. If-Match is checked first: a stale one is still a 412.
   */
  async patch(
    type: ElementType | string,
    id: string,
    partial: Record<string, unknown>,
    opts: { ifMatch?: number } = {},
  ): Promise<OwElement> {
    only('patch', opts, ['ifMatch']);
    refuseKnownOf(partial, 'patch');
    return this.request('PATCH', `/${type}/${id}/`, { write: true, elementWrite: true, proposable: true, body: sanitizePayload(partial), ifMatch: opts.ifMatch }) as Promise<OwElement>;
  }

  /**
   * DELETE /{type}/{id}/ -- idempotent (204 on absent). Server writes a
   * tombstone AND scrubs the id from every other element's links in the same
   * transaction -- no client-side unlink pass needed, ever.
   *
   * `ifMatch` (as on patch()): the element's `change_seq` as you read it. The delete
   * lands only if nothing changed since; otherwise an OwPreconditionFailedError (412) whose
   * `current` is the element as it is now, and nothing is deleted. On an element already gone it
   * is the idempotent 204. Under a world's proposals switch a delete is never a proposal.
   */
  async delete(type: ElementType | string, id: string, opts: { ifMatch?: number } = {}): Promise<void> {
    only('delete', opts, ['ifMatch']);
    await this.request('DELETE', `/${type}/${id}/`, { write: true, elementWrite: true, allowEmpty: true, ifMatch: opts.ifMatch });
  }

  /**
   * POST /{type}/{id}/links/{field} with {add, remove} -- atomic link merge.
   * Dedupes, tolerates already-present/already-absent ids. Returns the FULL
   * updated element (fixture P5). Use this for all relationship editing; it
   * retires the read-merge-PATCH dance. `ifMatch` works as on patch(): a link write
   * moves the element too. A 202 (an agent seat's link edit that became a proposal)
   * is thrown as an OwProposedError, as on patch().
   */
  async editLinks(
    type: ElementType | string,
    id: string,
    field: string,
    edit: OwLinkEdit,
    opts: { ifMatch?: number } = {},
  ): Promise<OwElement> {
    only('editLinks', opts, ['ifMatch']);
    only('editLinks', edit, ['add', 'remove'], 'The edit is { add?: string[], remove?: string[] }.');
    return this.request('POST', `/${type}/${id}/links/${field}`, { write: true, elementWrite: true, proposable: true, body: edit, ifMatch: opts.ifMatch }) as Promise<OwElement>;
  }

  /**
   * POST /{type}/{id}/adopt with {member} -- change who made an element.
   * `member` is a membership id of this world (a person or an AI seat, as `members()` lists
   * them) or `'owner'`, which sets `created_by` to null. The world's owner key or a
   * co-builder's (a person's or a seat's) with its PIN; a contributor's is 403 `not_author`
   * (`err.isNotAuthor`), a member id the world lacks 404. Nothing else in the element changes,
   * but the write stamps `changed_by` and `changed_via` and takes a new `change_seq`, so the
   * feed carries the element with its new `created_by`. Returns the updated element. A
   * contributor only changes what it created, so this hands it an element someone else made,
   * or takes one back; when the element is hidden, or the member is a guest, the old and the
   * new maker may each get a `view` reset on the feed.
   */
  async adopt(type: ElementType | string, id: string, member: string | 'owner'): Promise<OwElement> {
    if (typeof member !== 'string' || member === '') throw new TypeError('adopt: member must be a membership id or "owner"');
    return this.request('POST', `/${type}/${id}/adopt`, { write: true, elementWrite: true, body: { member } }) as Promise<OwElement>;
  }

  // -- Bulk ----------------------------------------------------------------

  /**
   * POST /bulk -- up to ~1000 items. Partial success by default (HTTP 200
   * always; inspect per-slot numeric `status` + top-level `errors` flag);
   * atomic:true for all-or-nothing. Link validation runs against batch U
   * database -- send in any order, cycles included; no client topo-sort.
   * Success slots echo server-authoritative timestamps: set your sync baseline
   * from this response alone. When an idempotencyKey is replayed, the returned
   * response carries wasReplay:true (read from the Idempotent-Replay header).
   * After an atomic:true request with errors:true NOTHING was written, yet the slots of
   * the items that would have succeeded still say 201 with the ids and timestamps they
   * would have had (keel's "counterfactual 201s"): do not record those ids as created.
   * An agent seat's item on an existing element, in a world that takes its writes as
   * proposals, answers a slot `{status: 202, id, proposal}`: never thrown, the
   * element unchanged, the slot's `proposal` the row a keeper decides.
   * An element without an id gets one, as `create` mints it, by its position in `items`: with an
   * `idempotencyKey`, derived from the key and the position (the ids the Python package mints),
   * so a retry with the same key and items sends the same body; without one, a
   * fresh UUIDv7. Ids you supply are kept.
   */
  async bulk(items: OwBulkItem[], opts: { atomic?: boolean; idempotencyKey?: string } = {}): Promise<OwBulkResponse> {
    only('bulk', opts, ['atomic', 'idempotencyKey']);
    // A stub anywhere refuses the whole call before sending (never a skipped slot:
    // the response's slots line up with `items`).
    items.forEach((it, index) => refuseKnownOf(it.element, `bulk: items[${index}]`));
    const body = {
      items: items.map((it, index) => {
        const element = sanitizePayload(it.element);
        if (element.id === undefined || element.id === null || element.id === '') {
          element.id = opts.idempotencyKey ? keyedId(opts.idempotencyKey, index) : mintUuid();
        }
        return { type: it.type, element };
      }),
      atomic: opts.atomic ?? false,
    };
    return this.request('POST', '/bulk/', {
      write: true,
      elementWrite: true,
      body,
      idempotencyKey: opts.idempotencyKey,
      replayAware: true,
    }) as Promise<OwBulkResponse>;
  }

  // -- Changes feed --------------------------------------------------------

  /**
   * GET /changes -- one page of the world's ordered change feed.
   * Cursor is OPAQUE: persist verbatim, never parse or build one (a guest's and a
   * contributor's carry their view's epoch, since 2026-10-20 for a contributor).
   * Zero/absent cursor = full export (byte-aligned with the Folder Format).
   * Reset rule: a 409 `resync_required` (err.isResyncRequired) means the key's
   * view changed (a guest's slice, an element unhidden from a contributor, or its role): drop
   * the cursor and walk from zero. For what the local copy holds that the walk no longer names,
   * read err.resyncReason (while keel's hidden mark is on): `role`, keep it; `view`,
   * drop it (as for a delete row with reason `hidden`). Without a reason, keep it (keel's own
   * words; sharing is forward-only). Never empty a copy on your own.
   * Citizenship: heaviest route on the platform; default page size is polite.
   * keel sends the cursor of a page at the head as a number (an empty page, for a key
   * whose cursor carries no epoch); it is handed back as a string, like every cursor here.
   * `after`: only the changes made at or after an ISO 8601 time (`updated_at` of an
   * upsert, `deleted_at` of a delete; no offset means UTC). A filter, not a position: the order,
   * `cursor`, `has_more` and `head` are as without it, so to read the whole window pass the cursor
   * back as `since` with the same `after` until `has_more` is false (`changesAll` does). "Since
   * yesterday" by the clock; a kept cursor is still the exact "since my last visit". Anything
   * that is not a date and time is a 422 naming `after`.
   */
  async changes(opts: { since?: string; limit?: number; after?: string } = {}): Promise<OwChangesPage> {
    only('changes', opts, ['since', 'limit', 'after']);
    const query = buildQuery({ since: opts.since, limit: opts.limit ?? this.changesPageSize, after: opts.after });
    const page = await this.headPoll.feedRead(() => this.request('GET', '/changes/', { query })) as Omit<OwChangesPage, 'cursor'> & { cursor: string | number };
    return { ...page, cursor: String(page.cursor) };
  }

  /**
   * GET /changes?head=true -- where the feed is now, without a page: no element is read.
   * `head` is the world's change_seq; `cursor` is a position to pass as `since` that
   * re-sends nothing at the head (a guest's or a contributor's carries its view's epoch). The cheap "anything
   * new?" for a poll: compare `head` with the head you last APPLIED (not the previous
   * poll's, so a missed tick never drops a change) and walk changesAll only when it moved;
   * a head below yours means the server rewound: walk again from zero. `epoch` is a
   * guest's or a contributor's view epoch (null for other keys): it can move with `head` unchanged, so walk on
   * either move. `epoch_reason` (while keel's hidden mark is on; absent otherwise)
   * says why the epoch last moved, `role` or `view` (see OwChangesPage.epoch_reason).
   * keel returns the owner's cursor as a number; it is handed back as a
   * string, like every cursor here.
   *
   * Conditional (4.57.0): keel tags the answer with an ETag that covers the head and
   * the epoch, so a view change moves it too. The client keeps the last tag and sends it as
   * If-None-Match on its next head read. When nothing moved, keel answers 304 with no body, and
   * this returns the `head`, `cursor` and `epoch` from the last 200 with `unchanged: true`
   * (no `epoch_reason`); every 200 says `unchanged: false`. keel refunds a 304 against the
   * request budget, so a poll that mostly sees nothing costs little. A poller: read the head,
   * sleep when `unchanged`, walk changesAll when `head` or `epoch` moved past what you applied.
   * The interval is yours; the client never sleeps or polls on its own. The tag is kept per
   * client instance and sent back exactly as received (`W/` and quotes included), never
   * compared; a 409 `resync_required` from this or from changes/changesAll clears it, so the
   * next head read is a full 200 (with `epoch_reason`). A 304 while no tag is held is an
   * OwApiError (status 304): the client never makes up a head.
   */
  async changesHead(): Promise<{ head: number; cursor: string; epoch: number | null; unchanged: boolean; epoch_reason?: OwResyncReason | null }> {
    const seen: { status: number; etag: string | null } = { status: 0, etag: null };
    const poll = this.headPoll;
    const page = await poll.feedRead(() => this.request('GET', '/changes/', {
      query: buildQuery({ head: 'true' }),
      ifNoneMatch: poll.tag,
      onEtag: (etag, status) => { seen.etag = etag; seen.status = status; },
    })) as { head: number; cursor: string | number; epoch?: number | null; epoch_reason?: OwResyncReason | null } | null;
    if (seen.status === 304) {
      if (!poll.held) {
        throw new OwApiError(304, null, 'GET /changes?head=true answered 304 Not Modified while nothing is held: no head read has answered 200 on this client, so there is no head to return', null, null);
      }
      return { ...poll.held, unchanged: true };
    }
    const tip = { head: page!.head, cursor: String(page!.cursor), epoch: page!.epoch ?? null };
    poll.tag = seen.etag || undefined;
    poll.held = tip;
    const out: { head: number; cursor: string; epoch: number | null; unchanged: boolean; epoch_reason?: OwResyncReason | null } =
      { ...tip, unchanged: false };
    if (page!.epoch_reason !== undefined) out.epoch_reason = page!.epoch_reason;
    return out;
  }

  /**
   * Walk the feed from `since` (or from zero = full export) to the current
   * tail, yielding ops in order. Returns the final cursor via the generator's
   * return value; persist it for the next incremental pull (with the last page's
   * `head` and `epoch`: the view epoch the walk ran under, for a guest or a contributor).
   */
  async *changesAll(since?: string, opts: { after?: string } = {}): AsyncGenerator<OwChange, { cursor: string; head: number; epoch: number | null }> {
    only('changesAll', opts, ['after']);
    let cursor = since;
    let page: OwChangesPage;
    do {
      page = await this.changes({ since: cursor, after: opts.after });
      for (const op of page.changes) yield op;
      cursor = page.cursor;
    } while (page.has_more);
    return { cursor: page.cursor, head: page.head, epoch: page.epoch ?? null };
  }

  // -- Images ---------------------------------------------------------------

  /**
   * POST /media/ticket -- permission to upload ONE image into this world (a write
   * key and its PIN; no body). Short-lived (`exp`), single-use, counted toward the
   * world's daily limit. Use it directly to upload yourself (for progress, say):
   * POST the bytes to `upload_url` with `Authorization: Bearer <ticket>`. Otherwise
   * call uploadImage(), which does both steps. Refusals: 403 `storage_full` (the
   * account's image storage is used up), 429 `quota_exceeded` (the world's daily
   * limit; Retry-After) as well as the wrong-PIN 429 `rate_limited`, 503
   * `media_unavailable`.
   */
  async createMediaTicket(): Promise<OwMediaTicket> {
    return this.request('POST', '/media/ticket') as Promise<OwMediaTicket>;
  }

  /**
   * Upload one image and get its permanent public URL: a ticket from the API, then the
   * bytes straight to the media edge (the API never sees them). Pass a ticket from
   * createMediaTicket() to use it instead of fetching one. Returns the edge's 201;
   * set `url` as an element's `image_url` yourself (`patch(type, id, { image_url })`).
   *
   * webp, png, jpeg or avif, read from the bytes (never SVG or gif). `key` names the
   * object (it must start with the ticket's `prefix`; without it the edge picks one).
   * An image larger than the ticket's `max_bytes` throws 413 `too_large` before any
   * byte is sent. The edge's refusals arrive as OwApiError with its code: 401
   * `ticket_expired` / `ticket_used` / `ticket_invalid`, 400 `bad_key`, 409 `exists`,
   * 413 `too_large`, 415 `unsupported_type`, 502 `write_failed` (nothing stored; the
   * ticket is still unspent). A ticket is spent once the upload succeeds: a retry
   * needs a new one.
   */
  async uploadImage(
    image: Blob | ArrayBuffer | ArrayBufferView,
    opts: { key?: string; ticket?: OwMediaTicket } = {},
  ): Promise<OwUploadedImage> {
    only('uploadImage', opts, ['key', 'ticket']);
    const ticket = opts.ticket ?? await this.createMediaTicket();
    const size = typeof Blob !== 'undefined' && image instanceof Blob ? image.size : (image as ArrayBuffer).byteLength;
    if (size > ticket.max_bytes) {
      throw new OwApiError(413, 'too_large', `Image is ${size} bytes; this ticket accepts at most ${ticket.max_bytes}. Nothing was sent.`,
        null, { error: 'too_large', max_bytes: ticket.max_bytes, got: size });
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${ticket.ticket}` };
    if (opts.key) headers['X-Key'] = opts.key;
    let res: Response;
    try {
      res = await this.fetchImpl(ticket.upload_url, { method: 'POST', headers, body: image as BodyInit });
    } catch (cause) {
      throw new OwNetworkError(`OnlyWorlds image upload failed: POST ${ticket.upload_url}`, cause);
    }
    if (!res.ok) throw await errorFromResponse(res);
    return await res.json() as OwUploadedImage;
  }

  /**
   * POST /media/remove-ticket -- permission to remove ONE image (a write key and its
   * PIN). The image's uploader may remove it, and so may the world's owner key; an
   * agent seat answers as its sponsor. Only images uploaded with a ticket qualify.
   * `key` is the object key, or the whole image_url (the part after the host is taken).
   * The reply's `referenced` counts the world's elements still showing the image.
   * Refusals: 403 `permission_error` (neither uploader nor owner), 404 `not_found`
   * (no removable image under this key), 409 `removal_in_flight` (a ticket for this
   * image is already out) and 409 `upload_pending` (an upload is not yet recorded), both
   * with Retry-After.
   */
  async createRemovalTicket(key: string): Promise<OwRemovalTicket> {
    return this.request('POST', '/media/remove-ticket', { body: { key: objectKey(key) } }) as Promise<OwRemovalTicket>;
  }

  /**
   * Remove one uploaded image: a removal ticket from the API, then the removal at the
   * edge (the API key never leaves for the edge). Pass the object key or the whole
   * image_url, or a ticket from createRemovalTicket() to use it instead of fetching one.
   * The bytes go back to the uploading account's storage.
   *
   * Removal does not touch elements: clear or replace their `image_url` yourself (the
   * ticket's `referenced` says how many there are). A copy already cached by the network
   * or a browser can keep answering for a while (`cache: 'may_linger'`). The edge's
   * refusals arrive as OwApiError with its code: 401 `ticket_expired` / `ticket_used` /
   * `ticket_invalid`, 403 `not_removable`, 502 `remove_failed` (nothing removed; the
   * ticket is still unspent).
   */
  async removeImage(keyOrUrl: string, opts: { ticket?: OwRemovalTicket } = {}): Promise<OwRemovedImage> {
    only('removeImage', opts, ['ticket']);
    const ticket = opts.ticket ?? await this.createRemovalTicket(keyOrUrl);
    let res: Response;
    try {
      res = await this.fetchImpl(ticket.remove_url, { method: 'POST', headers: { Authorization: `Bearer ${ticket.ticket}` } });
    } catch (cause) {
      throw new OwNetworkError(`OnlyWorlds image removal failed: POST ${ticket.remove_url}`, cause);
    }
    if (!res.ok) throw await errorFromResponse(res);
    return await res.json() as OwRemovedImage;
  }

  // -- Files on elements ---------------------------------------------

  /**
   * GET /{type}/{id}/files -- the element's files, newest first: each with its name, kind,
   * size in bytes, label (or null), who added it (`added_by.agent` is true when an agent did)
   * and when. Any key that may read the element; a file is seen by whoever may see its
   * element, and an element the key cannot see answers 404 `not_found`. Returns the rows
   * (keel sends them as `{ data }`, with no paging). Files never ride on the element: they
   * are not in its body, its `change_seq` or /changes.
   */
  async listFiles(type: ElementType | string, id: string): Promise<OwFileRow[]> {
    const page = await this.request('GET', `/${type}/${encodeURIComponent(id)}/files`) as { data?: OwFileRow[] };
    return page.data ?? [];
  }

  /**
   * GET /world/files -- every file in the world this key may see, newest first, each with its
   * element's `element_type` and `element_id`; and the world's total, `used_bytes` of
   * `cap_bytes` (for a line like "41 MB of 250 MB"). `used_bytes` counts all the world's
   * files, also those on elements this key cannot see. Any key.
   */
  async worldFiles(): Promise<OwWorldFiles> {
    return this.request('GET', '/world/files') as Promise<OwWorldFiles>;
  }

  /**
   * POST /{type}/{id}/files -- permission to upload ONE file onto this element: a write key
   * (and its PIN) that may change the element. `name` is the file's name with its extension;
   * `kind` is read from that extension when you leave it out (a TypeError, before anything
   * is sent, when the extension is not one of .pdf .txt .md .markdown .json .csv .yaml .yml
   * .toml .zip); `size` is the file's size in bytes; `label` (at most 80 characters) is a
   * field of the element's type the file belongs to, or your own words. Short-lived (`exp`,
   * 10 minutes) and single-use. Sends no Idempotency-Key, by keel's rule: the single-use
   * ticket is the idempotency, and a second call is a second ticket.
   *
   * Use it directly to send the bytes yourself: POST them, raw, to `upload_url` with
   * `Authorization: Bearer <ticket>`. Otherwise call uploadFile(), which does both steps.
   * Refusals: 413 `file_too_large` (`err.isFileTooLarge`: over 25 MB, `param` size), 403
   * `files_full` (`err.isFilesFull`: the world's 250 MB has no room for it) or `not_author`
   * (a contributor's key on an element someone else made), 422 `invalid_request` (`param`
   * names kind, name, size or label), 429 `quota_exceeded` (`err.isQuotaExceeded`: the
   * world's 200 tickets a day are used up) or `rate_limited` (wrong PINs), both with
   * `retryAfter`; 503 `media_unavailable`.
   */
  async createFileTicket(
    type: ElementType | string,
    id: string,
    req: { name: string; kind?: OwFileKind; size: number; label?: string | null },
  ): Promise<OwFileTicket> {
    only('createFileTicket', req, ['name', 'kind', 'size', 'label']);
    const { name, size } = req;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('createFileTicket needs the file\'s name, with its extension');
    }
    const kind = req.kind ?? requireFileKind(name);
    const body: Record<string, unknown> = { name, kind, size };
    if (req.label !== undefined) body.label = req.label;
    // An agent client declares itself here, the one files route keel's document lists it on:
    // the upload's added_by.agent then reads true.
    return this.request('POST', `/${type}/${encodeURIComponent(id)}/files`, { body, write: true }) as Promise<OwFileTicket>;
  }

  /**
   * Attach one file to an element: a ticket from the API (createFileTicket), then the bytes
   * straight to the upload host (the API never sees them, and the key and PIN never leave
   * for the host). Takes a File, a Blob, an ArrayBuffer or a Uint8Array. Returns the host's
   * 201 (`key`, `fid`: the file's id, `bytes`, `type`, `etag`). The file appears in
   * listFiles once the host has reported it to the API, which can be a moment after this
   * returns.
   *
   * `name` defaults to a File's own name (anything else needs one: a TypeError before
   * anything is sent); `kind` is read from the name's extension when left out, as
   * createFileTicket reads it; `size` is the byte length; `label` as createFileTicket's.
   * Pass a `ticket` from createFileTicket() to use it instead of fetching one (then `name`,
   * `kind` and `label` are not needed: the ticket already carries them).
   *
   * `onProgress(loaded, total)` reports the bytes sent. fetch cannot report an upload's
   * progress, so where XMLHttpRequest exists (a browser) the bytes go through it, with a
   * call for each progress event; elsewhere (Node), the bytes go through fetch and
   * onProgress is called once, with (total, total), when the upload has succeeded. Without
   * onProgress, the bytes always go through fetch (config.fetch when you set one).
   *
   * A file larger than the ticket's `max_bytes` throws 413 `too_large` before any byte is
   * sent. The API's refusals are createFileTicket's; the upload host's arrive as OwApiError
   * with its code: 401 `ticket_expired` / `ticket_invalid` / `ticket_used`, 409 `exists`
   * (the ticket's file is already stored: an earlier send with this ticket succeeded, so the
   * file is there), 413 `too_large`, 415 `unsupported_type` (the bytes are not the kind:
   * a pdf must start as one, a text file must be UTF-8 with no NUL in its first 8 KB, a zip
   * must be a world's own bundle; nothing is stored and the ticket is still unspent), 502
   * `write_failed` (nothing stored; the ticket is still unspent). A ticket is spent once the
   * upload succeeds: another file needs a new one.
   */
  async uploadFile(
    type: ElementType | string,
    id: string,
    file: Blob | ArrayBuffer | ArrayBufferView,
    opts: {
      name?: string;
      kind?: OwFileKind;
      label?: string | null;
      ticket?: OwFileTicket;
      onProgress?: (loaded: number, total: number) => void;
    } = {},
  ): Promise<OwUploadedFile> {
    only('uploadFile', opts, ['name', 'kind', 'label', 'ticket', 'onProgress']);
    const size = typeof Blob !== 'undefined' && file instanceof Blob ? file.size : (file as ArrayBuffer).byteLength;
    let ticket = opts.ticket;
    if (!ticket) {
      const name = opts.name ?? fileNameOf(file);
      if (typeof name !== 'string' || name.trim() === '') {
        throw new TypeError('uploadFile needs a name (with its extension) for anything but a File: pass opts.name');
      }
      ticket = await this.createFileTicket(type, id, { name, kind: opts.kind, size, label: opts.label });
    }
    if (size > ticket.max_bytes) {
      throw new OwApiError(413, 'too_large', `File is ${size} bytes; this ticket accepts at most ${ticket.max_bytes}. Nothing was sent.`,
        null, { error: 'too_large', max_bytes: ticket.max_bytes, got: size });
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${ticket.ticket}` };
    const onProgress = opts.onProgress;
    const XHR = (globalThis as { XMLHttpRequest?: XhrConstructor }).XMLHttpRequest;
    let res: Response;
    if (onProgress && typeof XHR === 'function') {
      res = await xhrUpload(XHR, ticket.upload_url, headers, file, size, onProgress);
    } else {
      try {
        res = await this.fetchImpl(ticket.upload_url, { method: 'POST', headers, body: file as BodyInit });
      } catch (cause) {
        throw new OwNetworkError(`OnlyWorlds file upload failed: POST ${ticket.upload_url}`, cause);
      }
    }
    if (!res.ok) throw await errorFromResponse(res);
    const uploaded = await res.json() as OwUploadedFile;
    if (onProgress && typeof XHR !== 'function') onProgress(size, size);
    return uploaded;
  }

  /**
   * GET /{type}/{id}/files/{fileId}/download -- a link to the file and when it stops
   * working: `url` (the file as an attachment, from the download host), `exp` (unix
   * seconds, 5 minutes after issue), and the file's `name`, `kind` and `size`. The link is
   * the credential: anyone holding it can fetch the file until `exp`, more than once. So
   * ask for it when the file is opened, use it at once, and never store or share it. Any
   * key that may read the element.
   */
  async fileDownloadLink(type: ElementType | string, id: string, fileId: string): Promise<OwFileDownload> {
    return this.request('GET', `/${type}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download`) as Promise<OwFileDownload>;
  }

  /**
   * DELETE /{type}/{id}/files/{fileId} -- remove a file for real: it leaves the lists and
   * the world's total at once, and its bytes are deleted from the store. The world's owner
   * key may, and so may the key of whoever added it (an agent seat answers as its sponsor);
   * any other key is 403 `permission_error`. A file that is not there is 404 `not_found`.
   * Deleting an element removes its files too.
   */
  async removeFile(type: ElementType | string, id: string, fileId: string): Promise<void> {
    await this.request('DELETE', `/${type}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`);
  }

  // -- Joining a world by link ----------------------------------

  /**
   * POST /join/preview -- what a join code holds, without using it: who invites, to
   * which world, in what role, and `reader` (`person`: accept it with acceptJoin;
   * `agent`: an AI agent redeems it at POST /join). Sends no credential, whatever key
   * this client holds. Every bad code (unknown, used, revoked, expired) is the same
   * 404 `not_found` (`err.isNotFound`). `code` is the part of the link after `#`. A table
   * adds `max_uses`, `uses_left`, `name_required` and `characters`, the
   * pick screen's list; a link for one answers without them.
   */
  async previewJoin(code: string): Promise<OwJoinPreview> {
    return this.request('POST', '/join/preview', { auth: false, body: { code } }) as Promise<OwJoinPreview>;
  }

  /**
   * POST /join -- redeem a join code that needs no account: a player's (a friend reading as
   * a guest) or an AI agent's. Sends no credential, whatever key this client holds.
   * 201 with `kind` telling the two answers apart: `player` gives a read key (`ow_r_`, no PIN)
   * and the Character it reads as; `agent` gives a seat's write key, secret and `.env` lines.
   * Both are shown once, and the code is spent: a lost answer cannot be replayed (the owner
   * sees the row never used, and makes a new link). `name` (a player's, optional: the
   * Character's name or "Player" when left out) and `agentName` (an agent's, required for an
   * agent code). Every bad code is the same 404 `not_found`; a person's code is redeemed with
   * acceptJoin instead.
   *
   * A table (a player code whose preview carries `max_uses`) seats one player
   * per redeem, until `uses_left` is 0. With a list, `character` is the player's pick, the `id`
   * of one of the preview's `characters` not `taken`: a Character a live seat already plays is
   * 422 `character_taken` (`err.isCharacterTaken`; pick another), one off the list, hidden or
   * deleted since, or none sent, is 422 `invalid_request`, param `character`
   * (`err.isCharacterInvalid`; read the preview again). With no list
   * (`name_required`), send `name` and no `character`: the player's fresh Character takes the
   * name (missing: 422, param `name`). A world with its 50 players is 422 `world_full` (`err.isWorldFull`);
   * the last place taken by someone else first is the one 404. A refusal spends nothing. A link
   * for one ignores `character`.
   */
  async redeemJoin(code: string, opts: { name?: string; agentName?: string; character?: string } = {}): Promise<OwJoined> {
    only('redeemJoin', opts, ['name', 'agentName', 'character']);
    const body: Record<string, unknown> = { code };
    if (opts.name !== undefined) body.name = opts.name;
    if (opts.agentName !== undefined) body.agent_name = opts.agentName;
    if (opts.character !== undefined) body.character = opts.character;
    return this.request('POST', '/join', { auth: false, body }) as Promise<OwJoined>;
  }

  // -- Signing in with a password --------------------------------

  /**
   * Sign in with an email address (or a username) and password, and get a new account token
   * (`ow_a_`) for this device, named `tokenName` (say, "Lantern on iPhone"): the name the
   * account's tokens page lists it under, where it can be revoked. Pass exactly one of
   * `email` and `username`; both or neither is a TypeError before anything is sent.
   *
   * Works on a client with no key, and sends no key whatever this client holds. Three
   * requests: a sign-in at keel's sign-in service (`{baseUrl}/auth/app/v1/auth/login`), which
   * answers with a short-lived session; `POST /account/tokens` with that session, which mints
   * the token; then the session is ended, whether the mint worked or not. Only the token is
   * kept: the password is sent once and held nowhere, and the session never leaves this call.
   * Store the token as you would any account token, and make a client with it
   * (`new OwV2Client({ apiKey: token })`).
   *
   * A refusal is an `OwSignInError` whose `reason` says why: `invalid_credentials` (wrong
   * email, username or password), `email_unverified` (the account's email address is not
   * confirmed yet), `rate_limited` (too many attempts; `retryAfter` when keel sent it),
   * `offline` (keel was not reached), `mint_failed` (signed in, but no token was made) or
   * `failed` (anything else, with keel's message). The password is never in an error.
   */
  async signInWithPassword(opts: {
    email?: string;
    username?: string;
    password: string;
    tokenName: string;
  }): Promise<OwSignedIn> {
    only('signInWithPassword', opts, ['email', 'username', 'password', 'tokenName']);
    const { email, username, password, tokenName } = opts ?? ({} as typeof opts);
    const login = typeof email === 'string' ? email.trim() : '';
    const user = typeof username === 'string' ? username.trim() : '';
    if (Boolean(login) === Boolean(user)) {
      throw new TypeError('signInWithPassword takes exactly one of email and username');
    }
    if (typeof password !== 'string' || password === '') {
      throw new TypeError('signInWithPassword needs a password');
    }
    if (typeof tokenName !== 'string' || tokenName.trim() === '') {
      throw new TypeError('signInWithPassword needs a tokenName: the name the new token is listed under');
    }

    const auth = `${this.baseUrl}/auth/app/v1`;
    // Any text keel sends back is shown only if it does not hold the password.
    const safe = (text: unknown, fallback: string): string =>
      typeof text === 'string' && text !== '' && !text.includes(password) ? text : fallback;

    let res: Response;
    try {
      res = await this.fetchImpl(`${auth}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(login ? { email: login, password } : { username: user, password }),
      });
    } catch {
      // No cause attached: a fetch's failure can carry the request, and the request holds the password.
      throw new OwSignInError('offline', 'OnlyWorlds could not be reached: signing in needs a connection.');
    }

    const retryAfter = parseRetryAfter(res.headers?.get?.('Retry-After') ?? null) ?? undefined;
    if (res.status === 429) {
      // allauth's 429 may be an HTML page: the status alone says it.
      throw new OwSignInError('rate_limited', 'Too many sign-in attempts. Wait a while, then try again.', {
        status: 429, retryAfter,
      });
    }

    const body = await readJsonBody(res) as {
      meta?: { session_token?: unknown };
      errors?: Array<{ code?: unknown; message?: unknown }>;
      data?: { flows?: Array<{ id?: unknown; is_pending?: unknown }> };
    } | null;
    const sessionToken = body?.meta?.session_token;
    const session = typeof sessionToken === 'string' && sessionToken !== '' ? sessionToken : undefined;

    if (!res.ok || !session) {
      // A pending flow can still hand out a session: it is ended too.
      if (session) await endAuthSession(this.fetchImpl, auth, session);
      const errors = Array.isArray(body?.errors) ? body!.errors : [];
      const codes = errors.map((e) => e?.code).filter((c): c is string => typeof c === 'string');
      const first = errors.find((e) => typeof e?.message === 'string')?.message;
      const code = codes.find((c) => !c.includes(password));
      const status = res.status;
      const mismatch = codes.find((c) => c === 'email_password_mismatch' || c === 'username_password_mismatch');
      if (mismatch) {
        throw new OwSignInError('invalid_credentials',
          safe(first, 'The email address and/or password you specified are not correct.'), { status, code: mismatch });
      }
      if (codes.includes('too_many_login_attempts')) {
        throw new OwSignInError('rate_limited',
          safe(first, 'Too many failed sign-in attempts. Try again later.'), { status, code: 'too_many_login_attempts', retryAfter });
      }
      const flows = Array.isArray(body?.data?.flows) ? body!.data!.flows! : [];
      if (status === 401 && flows.some((f) => f?.id === 'verify_email' && f?.is_pending === true)) {
        throw new OwSignInError('email_unverified',
          'Confirm the account\'s email address first: the link is in the mail onlyworlds.com sent.', { status, code });
      }
      throw new OwSignInError('failed',
        safe(first, res.ok ? 'Signing in did not work: onlyworlds.com sent no session.' : `Signing in did not work (${status}).`),
        { status, code });
    }

    try {
      let minted: Response;
      try {
        minted = await this.fetchImpl(`${this.baseUrl}/account/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Token': session },
          body: JSON.stringify({ name: tokenName }),
        });
      } catch {
        throw new OwSignInError('offline', 'The connection dropped after signing in: no token was made. Try again.');
      }
      const row = await readJsonBody(minted) as Record<string, unknown> | null;
      const token = row?.token;
      if (minted.status !== 201 || typeof token !== 'string' || token === '') {
        // keel's envelope: { error: { code, message, ... } }.
        const err = row && typeof row.error === 'object' && row.error !== null
          ? row.error as { code?: unknown; message?: unknown } : undefined;
        const said = err?.code;
        const code = typeof said === 'string' && !said.includes(password) ? said : undefined;
        throw new OwSignInError('mint_failed',
          safe(err?.message, `Signed in, but no token was made (${minted.status}). Try again.`),
          { status: minted.status, code });
      }
      return {
        token,
        id: typeof row!.id === 'string' ? row!.id : '',
        name: typeof row!.name === 'string' ? row!.name : tokenName,
        last4: typeof row!.last4 === 'string' ? row!.last4 : token.slice(-4),
      };
    } finally {
      await endAuthSession(this.fetchImpl, auth, session);
    }
  }

  /**
   * POST /account/join -- accept an invite link's code as the account this client's
   * `ow_a_` token belongs to: 201 with the new membership. Refusals: 404 `not_found`
   * (every bad code, and a code made for an AI agent) and 409 `already_member`
   * (`err.isAlreadyMember`). Accepting needs no account PIN, for any role; a write key for the membership waits for one (`pin_required`). A refusal
   * never spends the code. A world key here is a TypeError before anything is sent.
   */
  async acceptJoin(code: string): Promise<OwJoinedMembership> {
    if (this.keyKind !== 'account') {
      throw new TypeError('acceptJoin needs an account token (ow_a_): a world key cannot join a world');
    }
    return this.request('POST', '/account/join', { body: { code } }) as Promise<OwJoinedMembership>;
  }

  /**
   * POST /account/worlds/{worldId}/links -- a new invite link for a world this client's
   * `ow_a_` token owns: `reader` is required (`person`, accepted with acceptJoin;
   * `agent`, redeemed at POST /join; `player`, a friend with no account, redeemed with
   * redeemJoin for a read key); `role`, when left out, is keel's default: guest for a
   * person link, contributor for an agent link (a player link is guest, and refuses any other), `days` (1, 7 or 30) to 7; `withCharacter` (agent links
   * only) to true; `character` (player links only) a Character's id or `new` (the default):
   * whoever opens the link first reads as it, until removed. `preview` (person and player links)
   * to false: true puts the world's id in the link's path, so a chat that unfurls it
   * shows the world's name and picture (the code stays after `#`); true on an agent link is
   * 422, param `preview`. `maxUses` (person and player links; an agent link takes none) to 1, a
   * link for one. On a person link 2 to 50 lets in that many accounts, each
   * joining once with the link's role, until every use is taken, it expires or it is revoked;
   * who already joined stays. On a player link 2 to 50 makes a table, one
   * link that seats that many players, each picking one of
   * `characters` (Character ids of the world, in the order a pick screen shows them; a hidden
   * one is 422, param `characters`). `characters` empty or left out: each player names a fresh
   * Character after themselves. A table takes no `character`, not even `new` (422, param
   * `character`), and `characters` on a link for one is 422, even empty. A table counts once
   * against the 50 pending invites; its seats count against the world's 50 players as each is
   * made, so a full world refuses the pick, never the link. 201 with the code, shown in this
   * answer only. Owner only: anyone else, and a world that doesn't exist, gets 404
   * `not_found` (`err.isNotFound`). A world key is a TypeError before anything is sent.
   */
  async createWorldLink(
    worldId: string,
    opts: {
      reader: 'person' | 'agent' | 'player';
      role?: OwMemberRole;
      days?: 1 | 7 | 30;
      inviterName?: string;
      withCharacter?: boolean;
      character?: string;
      preview?: boolean;
      maxUses?: number;
      characters?: string[];
    },
  ): Promise<OwCreatedWorldLink> {
    only('createWorldLink', opts, ['reader', 'role', 'days', 'inviterName', 'withCharacter', 'character', 'preview', 'maxUses', 'characters']);
    if (this.keyKind !== 'account') {
      throw new TypeError('createWorldLink needs an account token (ow_a_): only the world\'s owner makes links');
    }
    const body: Record<string, unknown> = { reader: opts.reader };
    if (opts.role !== undefined) body.role = opts.role;
    if (opts.days !== undefined) body.days = opts.days;
    if (opts.inviterName !== undefined) body.inviter_name = opts.inviterName;
    if (opts.withCharacter !== undefined) body.with_character = opts.withCharacter;
    if (opts.character !== undefined) body.character = opts.character;
    if (opts.preview !== undefined) body.preview = opts.preview;
    if (opts.maxUses !== undefined) body.max_uses = opts.maxUses;
    if (opts.characters !== undefined) body.characters = opts.characters;
    return this.request('POST', `/account/worlds/${encodeURIComponent(worldId)}/links`, { body }) as Promise<OwCreatedWorldLink>;
  }

  /**
   * GET /account/worlds/{worldId}/links -- the world's invite links, without their codes:
   * each with its status (pending, used, revoked or expired) and uses. Owner only, as
   * createWorldLink. Needs the client's `ow_a_` token.
   */
  async listWorldLinks(worldId: string): Promise<OwWorldLink[]> {
    if (this.keyKind !== 'account') {
      throw new TypeError('listWorldLinks needs an account token (ow_a_): only the world\'s owner sees its links');
    }
    const page = await this.request('GET', `/account/worlds/${encodeURIComponent(worldId)}/links`) as { data: OwWorldLink[] };
    return page.data;
  }

  /**
   * DELETE /account/worlds/{worldId}/links/{linkId} -- revoke a link: its code no longer
   * works. A used, revoked or expired link answers the same and stays as it was; whoever
   * joined with it stays a member (remove them from the roster). Owner only, as
   * createWorldLink. Needs the client's `ow_a_` token.
   */
  async revokeWorldLink(worldId: string, linkId: string): Promise<void> {
    if (this.keyKind !== 'account') {
      throw new TypeError('revokeWorldLink needs an account token (ow_a_): only the world\'s owner revokes links');
    }
    await this.request('DELETE', `/account/worlds/${encodeURIComponent(worldId)}/links/${encodeURIComponent(linkId)}`);
  }

  // -- Seats for your own AI ------------------------------

  /**
   * POST /account/worlds/{worldId}/seats -- a seat for your own AI in a world you own or are a
   * member of: its own membership, write key and `ow_s_` secret, no join link. You answer for
   * it, and its writes are marked as an agent's. `name` is required (1 to 80 characters);
   * `role` is at most your own (the owner may give any; default contributor, or your own role
   * when that is lower); `character` is `new` (default: a Character of its own), `none`, or
   * `mine` (members only: it plays the Character you play). 201 with `key`, `pin` and the
   * `.env` lines in `env`, shown in this answer only. Sends no Idempotency-Key, by keel's rule:
   * a replay would have to keep the key. If the answer is lost, listSeats shows the seat without
   * its key: rekeySeat gives it a new one (or removeSeat and make another). Needs the client's `ow_a_` token.
   */
  async createSeat(
    worldId: string,
    opts: { name: string; role?: OwMemberRole; character?: 'new' | 'none' | 'mine' },
  ): Promise<OwSeatCreated> {
    only('createSeat', opts, ['name', 'role', 'character']);
    if (this.keyKind !== 'account') {
      throw new TypeError('createSeat needs an account token (ow_a_): a seat is made by the person who answers for it');
    }
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.role !== undefined) body.role = opts.role;
    if (opts.character !== undefined) body.character = opts.character;
    return this.request('POST', `/account/worlds/${encodeURIComponent(worldId)}/seats`, { body }) as Promise<OwSeatCreated>;
  }

  /**
   * GET /account/worlds/{worldId}/seats -- the live agent seats you can see: your own AI's, or,
   * as the world's owner, every seat. No keys or secrets. Needs the client's `ow_a_` token.
   */
  async listSeats(worldId: string): Promise<OwSeat[]> {
    if (this.keyKind !== 'account') {
      throw new TypeError('listSeats needs an account token (ow_a_)');
    }
    const page = await this.request('GET', `/account/worlds/${encodeURIComponent(worldId)}/seats`) as { data: OwSeat[] };
    return page.data;
  }

  /**
   * POST /account/worlds/{worldId}/seats/{seatId}/key -- a new key and secret for a seat whose AI
   * lost its own: its sponsor or the world's owner may. The old key and secret stop at once;
   * nothing else about the seat changes. 201 with the same shape as createSeat (`key`, `pin`,
   * `env`), shown in this answer only. No Idempotency-Key, by keel's rule: if this answer is lost
   * too, ask for another new key. Needs the client's `ow_a_` token.
   */
  async rekeySeat(worldId: string, seatId: string): Promise<OwSeatCreated> {
    if (this.keyKind !== 'account') {
      throw new TypeError('rekeySeat needs an account token (ow_a_)');
    }
    return this.request('POST', `/account/worlds/${encodeURIComponent(worldId)}/seats/${encodeURIComponent(seatId)}/key`) as Promise<OwSeatCreated>;
  }

  /**
   * DELETE /account/worlds/{worldId}/seats/{seatId} -- remove an agent seat: its sponsor or the
   * world's owner may. Its key and secret stop at once; a Character it made that nobody touched
   * goes with it, any other stays. Needs the client's `ow_a_` token.
   */
  async removeSeat(worldId: string, seatId: string): Promise<void> {
    if (this.keyKind !== 'account') {
      throw new TypeError('removeSeat needs an account token (ow_a_)');
    }
    await this.request('DELETE', `/account/worlds/${encodeURIComponent(worldId)}/seats/${encodeURIComponent(seatId)}`);
  }

  /**
   * PATCH /account/worlds/{worldId}/members/{memberId} with `lenses` alone -- set the lenses a row
   * starts with: lens ids in order, 0 to 20, repeats dropped by keel; an empty list is a choice too,
   * and keeps a seat off its Titles' lenses, while `null` puts the row back to never chosen (a seat
   * playing a Character then starts with its Titles' lenses; for `'owner'`, `null` is the empty list).
   * A member sets its own row (any role), an agent's or a player's seat it answers for (its sponsor),
   * or any seat as a co-builder; the owner sets any seat, and its own list with `'owner'` as
   * `memberId`. Any other row is a 404; the owner naming a person's row is a 422 (a person sets its
   * own, with setMyLenses). Each id must be a lens of this world that you and the row's holder can
   * both see: one either cannot see is the same 404, a Construct that is no lens 422 `not_a_lens`, a
   * template 422 `lens_is_template`, a hidden lens 422 `lens_hidden` (`param` lenses); a lens already
   * in the row's list is kept, hidden or not. A lens in the list that you cannot see stays at its
   * place, outside the 20, and the answer's `lenses` is the list as you are shown it, with
   * `x_served_trimmed` naming `lenses` when one was kept. The answer is `{id, role, kind, lenses}`
   * (keel's `MemberLenses`), `id` null and `role` and `kind` `owner` for the owner's own list. The body is `{ lenses }` and
   * nothing else: a role, Character or sponsor change is not sent here. Needs the client's `ow_a_` token.
   */
  async setMemberLenses(worldId: string, memberId: string, lensIds: string[] | null): Promise<OwMemberLenses> {
    if (this.keyKind !== 'account') {
      throw new TypeError('setMemberLenses needs an account token (ow_a_): a world key sets its own holder\'s list with setMyLenses');
    }
    if (lensIds !== null && !Array.isArray(lensIds)) {
      throw new TypeError('setMemberLenses: lensIds is a list of lens ids ([] for none, null for never chosen). Nothing was sent.');
    }
    return this.request(
      'PATCH',
      `/account/worlds/${encodeURIComponent(worldId)}/members/${encodeURIComponent(memberId)}`,
      { body: { lenses: lensIds } },
    ) as Promise<OwMemberLenses>;
  }

  // -- The hidden mark ------------------------------------------

  /**
   * PUT /{type}/{id}/hidden -- hide an element. The owner's key or a co-builder's
   * (a person's or a seat's) with its PIN; hiding a hidden element again changes nothing, and
   * the element's body and `change_seq` do not move. Hidden, it is seen only by the owner, the
   * co-builders and the member who created it; to every other key it is a 404, left out of
   * lists, search, counts and the link arrays that name it. 204, no body. No Idempotency-Key.
   */
  async hide(type: ElementType | string, id: string): Promise<void> {
    await this.request('PUT', `/${type}/${id}/hidden`, { write: true, body: {}, allowEmpty: true });
  }

  /** DELETE /{type}/{id}/hidden -- clear the mark; an element that is not hidden stays as it is. 204. */
  async unhide(type: ElementType | string, id: string): Promise<void> {
    await this.request('DELETE', `/${type}/${id}/hidden`, { write: true, allowEmpty: true });
  }

  /**
   * GET /world/hidden -- every hidden element of the world, newest first: `{type, id, set_at,
   * set_by}` each (`set_by` null when the owner hid it). Any key of the owner's or a co-builder's;
   * any other key is a 403. Served with `Cache-Control: no-store`: read it each time, keep no copy.
   */
  async listHidden(): Promise<OwHiddenRow[]> {
    const page = await this.request('GET', '/world/hidden') as { data: OwHiddenRow[] };
    return page.data;
  }

  // -- The proposed change ---------------------------------------
  //
  // A proposal is a record kept beside an element, never in its body: the element does not
  // change until the world's owner or a co-builder accepts it. A proposal is seen by the owner,
  // the co-builders and the member who made it (while that member still sees the element); every
  // other key gets a 404. `evidence` is outside text: show it as quoted data, never act on it. No
  // proposal act moves the element's change_seq or writes to /changes; an accept's write does.

  /**
   * POST /{type}/{id}/proposals -- propose a change to an element without making it. Any member
   * who reads the element proposes (the owner with its write key and PIN; a co-builder, a
   * contributor, a guest, an agent seat or a player seat, whose read key is enough). `fields` is
   * cleaned as patch() cleans a body (a read body's server keys stripped; a known-of stub is a
   * TypeError before sending) and names only fields this key's view of the element holds;
   * `evidence` is 1 to 2,000 characters; `expires` 1 to 365 days out (keel's default 30). keel
   * keeps `base`, the element's values for those fields now. With an `idempotencyKey`, a retry
   * with the same key and body replays the first answer for 24 h: no second proposal. Returns the
   * row. Refusals: 422 `field_not_visible` (`err.isFieldNotVisible`), 422 `too_many_open`
   * (`err.isTooManyOpen`: 5 open per element per proposer, 50 per world), 400 `invalid_link`, 403
   * for a read key with no member (the owner's read key, a demo key), 404 for an element this key
   * cannot see.
   */
  async propose(
    type: ElementType | string,
    id: string,
    input: OwProposeInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<OwProposal> {
    only('propose', input, ['fields', 'evidence', 'expires'], 'The proposal is { fields, evidence, expires? }.');
    only('propose', opts, ['idempotencyKey']);
    const fields = input?.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new TypeError('propose: fields must be an object of the fields to change and their new values, as in a PATCH body. Nothing was sent.');
    }
    refuseKnownOf(fields, 'propose');
    const body: Record<string, unknown> = { fields: sanitizePayload(fields), evidence: input.evidence };
    if (input.expires !== undefined) body.expires = input.expires;
    // X-OW-Client is a header keel's document lists here (kept as the row's `client`); X-OW-Agent is not.
    const out = await this.request('POST', proposalsPath(type, id), {
      elementWrite: true,
      body,
      idempotencyKey: opts.idempotencyKey,
    }) as OwProposed;
    return out.proposal;
  }

  /**
   * GET /{type}/{id}/proposals -- one element's proposals, newest first: every row for the
   * owner's and a co-builder's keys, a member's own for any other. `state` is `open` by keel's
   * default (not past `expires`), or `lapsed`, `accepted`, `declined`, `all`; `since` keeps rows
   * whose `updated_at` is at or after it; `limit` defaults to the client's pageSize. Any member
   * key that reads the element, a read key included.
   */
  async listProposals(type: ElementType | string, id: string, opts: OwProposalQuery = {}): Promise<OwProposalList> {
    only('listProposals', opts, ['state', 'since', 'limit', 'cursor']);
    const query = buildQuery({ state: opts.state, since: opts.since, limit: opts.limit ?? this.pageSize, cursor: opts.cursor });
    return this.request('GET', proposalsPath(type, id), { query }) as Promise<OwProposalList>;
  }

  /**
   * GET /world/proposals -- the world's queue, newest first by created_at, two kinds of row told
   * apart by `kind`: `proposal`, a proposed change to an element (OwProposal), and
   * `new_element`, an element written as proposed, carrying `x_review_proposed`
   * (OwProposedNewElement: settle it with reviewNewElement). A marked element is listed under
   * `open`, `lapsed` and `all`, never `accepted` or `declined`; keel reads at most the 500 newest.
   * Every row for the owner's and a co-builder's keys, a member's own for any other. The query is
   * listProposals', plus `element` (one element's rows, by id). The cursor is opaque: pass
   * `next_cursor` back as it came. Any member key, a read key included; a read key with no member
   * (a demo key, the owner's read key) and the keyless public view get a 404.
   */
  async worldProposals(opts: OwWorldProposalQuery = {}): Promise<OwWorldProposalList> {
    only('worldProposals', opts, ['state', 'since', 'element', 'limit', 'cursor']);
    const query = buildQuery({
      state: opts.state, since: opts.since, element: opts.element, limit: opts.limit ?? this.pageSize, cursor: opts.cursor,
    });
    return this.request('GET', '/world/proposals', { query }) as Promise<OwWorldProposalList>;
  }

  /**
   * POST /{type}/{id}/proposals/{pid}/accept -- write the proposal's fields to the element as one
   * ordinary write by this key (`changed_by` is the keeper, a new change_seq, a /changes row), and
   * the row turns accepted. The world's owner key or a co-builder's, with its PIN; never the
   * proposer's own (403 `own_proposal`, `err.isOwnProposal`), never an agent seat's while the
   * world holds them (403 `proposed_only`, `err.isProposedOnly`). Refused with nothing written when
   * a proposed field moved since (409 `stale_proposal`: an OwStaleProposalError carrying
   * `conflicts` and `current`; the row stays open) or a proposed link names an element deleted
   * since (400 `invalid_link`). A lapsed proposal may still be accepted; a decided one is a 422.
   * Returns the row and the element as written.
   */
  async acceptProposal(type: ElementType | string, id: string, pid: string): Promise<OwProposalAccepted> {
    return this.request('POST', `${proposalsPath(type, id)}/${encodeURIComponent(pid)}/accept`, { elementWrite: true }) as Promise<OwProposalAccepted>;
  }

  /**
   * POST /{type}/{id}/proposals/{pid}/decline -- the row turns declined, with an optional
   * `reason` (at most 2,000 characters); the element does not change. The same keys and refusals
   * as acceptProposal, but no stale check. Returns the row.
   */
  async declineProposal(type: ElementType | string, id: string, pid: string, opts: { reason?: string } = {}): Promise<OwProposal> {
    only('declineProposal', opts, ['reason']);
    const body = opts.reason !== undefined ? { reason: opts.reason } : undefined;
    const out = await this.request('POST', `${proposalsPath(type, id)}/${encodeURIComponent(pid)}/decline`, { body }) as OwProposed;
    return out.proposal;
  }

  /**
   * DELETE /{type}/{id}/proposals/{pid} -- the proposer takes back its own undecided proposal,
   * with any of its keys: the row goes. 204. A keeper's key on another member's row is a 403;
   * any other key a 404; a decided row a 422.
   */
  async withdrawProposal(type: ElementType | string, id: string, pid: string): Promise<void> {
    await this.request('DELETE', `${proposalsPath(type, id)}/${encodeURIComponent(pid)}`, { allowEmpty: true });
  }

  /**
   * POST /{type}/{id}/review -- settle a new element written as proposed, one carrying
   * `x_review_proposed` (the queue's `new_element` row). The owner's key or a
   * co-builder's, with its PIN. `{ decision: 'accept' }` clears the mark (a write by you: a new
   * change_seq, one /changes row) and answers `{ element }`; `{ decision: 'decline', reason? }`
   * deletes the element (a tombstone, the links to it scrubbed, its open proposals dropped) and
   * answers `{ deleted }`, its id; the reason is answered back and kept nowhere. Refusals: 422
   * `not_proposed` (`err.isNotProposed`: the element carries no mark), 403 `proposed_only`
   * (`err.isProposedOnly`: the seat the mark names, or an agent seat under the world's switch), 403
   * for any key but a keeper's. A proposed change to an existing element is decided with
   * acceptProposal or declineProposal instead.
   */
  async reviewNewElement(type: ElementType | string, id: string, opts: OwReviewInput): Promise<OwReviewed> {
    only('reviewNewElement', opts, ['decision', 'reason'], 'The review is { decision, reason? }.');
    if (opts?.decision !== 'accept' && opts?.decision !== 'decline') {
      throw new TypeError(`reviewNewElement: decision must be 'accept' or 'decline', got ${JSON.stringify(opts?.decision) ?? String(opts?.decision)}. Nothing was sent.`);
    }
    // keel takes `{decision: accept}` or `{decision: decline, reason?}`: a reason with an accept is its 422
    if (opts.reason !== undefined && opts.decision !== 'decline') {
      throw new TypeError('reviewNewElement: a reason goes with a decline only. Nothing was sent.');
    }
    const body: Record<string, unknown> = { decision: opts.decision };
    if (opts.reason !== undefined) body.reason = opts.reason;
    // X-OW-Client is a header keel's document lists here; X-OW-Agent is not.
    const path = `/${type}/${encodeURIComponent(id)}/review`;
    const answer = await this.request('POST', path, { elementWrite: true, body });
    // the key the decision settles: an accept answers { element }, a decline { deleted }
    const settled = opts.decision === 'accept' ? 'element' : 'deleted';
    if (answer === null || typeof answer !== 'object' || !(settled in answer)) {
      throw new TypeError(`reviewNewElement: POST ${path} answered no ${settled}: ${JSON.stringify(answer)?.slice(0, 200)}`);
    }
    return answer as OwReviewed;
  }

  // -- The account's worlds and keys (account token) -----------------------

  /**
   * GET /account/worlds -- every world the account owns or is a member of, with its keys by
   * name and last four (a member sees only their own keys on a shared world). Account token only.
   */
  async listAccountWorlds(): Promise<OwAccountWorld[]> {
    if (this.keyKind !== 'account') {
      throw new TypeError('listAccountWorlds needs an account token (ow_a_)');
    }
    const page = await this.request('GET', '/account/worlds') as { data: OwAccountWorld[] };
    return page.data;
  }

  /**
   * POST /account/worlds -- make a world on the account, with its one write key. `name` is required
   * (1 to 255 characters, not blank; keel trims it). `pin` only while the account has no PIN (4
   * digits, 1000-9999): it becomes the account PIN and the write wall on every world of the
   * account. An account with a PIN must leave it out. Either mistake is a 422 with `param: 'pin'`
   * (`err.param`) and nothing made, so a tool that cannot tell which account it holds sends without
   * `pin` first and, on that 422, again with it. `keyName` names the write key as the website's key
   * list shows it (1 to 80 characters, trimmed; null or left out: no name). `source` and `producer`
   * are the folder format's provenance lines (spec 4.2), each an object or null, from a tool that
   * makes the world from a folder: kept on the World as given, served by getWorld() as `origin`.
   * Only the keys given are sent, `keyName` as `key_name`. 201: the world's row, as
   * listAccountWorlds lists it, with the full write key once in `key`. Account token only; no
   * Idempotency-Key (keel's document declares none): if the answer is lost, the world is in
   * listAccountWorlds, and mintWorldKey gives it a key.
   */
  async createAccountWorld(opts: OwCreateAccountWorldInput): Promise<OwCreatedAccountWorld> {
    only('createAccountWorld', opts, ['name', 'pin', 'keyName', 'source', 'producer']);
    if (this.keyKind !== 'account') {
      throw new TypeError('createAccountWorld needs an account token (ow_a_)');
    }
    if (typeof opts?.name !== 'string') {
      throw new TypeError('createAccountWorld: name is required, the world\'s name as a string. Nothing was sent.');
    }
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.pin !== undefined) body.pin = opts.pin;
    if (opts.keyName !== undefined) body.key_name = opts.keyName;
    if (opts.source !== undefined) body.source = opts.source;
    if (opts.producer !== undefined) body.producer = opts.producer;
    return this.request('POST', '/account/worlds', { body }) as Promise<OwCreatedAccountWorld>;
  }

  /**
   * POST /account/worlds/{id}/keys -- mint a world key, `scope` `'write'` (the default) or
   * `'read'`, `name` as the key list shows it (at most 255 characters). The full key comes back
   * once in `key`. The owner mints a world key; a member mints their own member key, 409
   * `pin_required` (`err.isPinRequired`) for a write key while the account has no PIN. Account
   * token only; no Idempotency-Key. `keep: true` keeps the key across a sign-out: revoking the token
   * that minted it leaves it live (a tool that stores a key on the device passes it), while
   * disconnecting the tool, or a replayed sign-in code, still takes it; the answer says `kept`.
   * Without it, revoking the token revokes the keys it minted unless the tool holds another live token.
   */
  async mintWorldKey(worldId: string, opts: { scope?: 'read' | 'write'; name?: string; keep?: boolean } = {}): Promise<OwMintedKey> {
    only('mintWorldKey', opts, ['scope', 'name', 'keep']);
    if (opts.keep !== undefined && typeof opts.keep !== 'boolean') {
      throw new TypeError(`mintWorldKey: keep is true or false, got ${JSON.stringify(opts.keep)}. Nothing was sent.`);
    }
    if (this.keyKind !== 'account') {
      throw new TypeError('mintWorldKey needs an account token (ow_a_)');
    }
    const body: Record<string, unknown> = {};
    if (opts.scope !== undefined) body.scope = opts.scope;
    if (opts.name !== undefined) body.name = opts.name;
    if (opts.keep !== undefined) body.keep = opts.keep;
    return this.request('POST', `/account/worlds/${encodeURIComponent(worldId)}/keys`, { write: true, body }) as Promise<OwMintedKey>;
  }

  /**
   * DELETE /account/worlds/{worldId}/keys/{keyId} -- revoke a world key, by the `id` mintWorldKey
   * returned: from then on it answers 401 `key_revoked`. The owner revokes any of the world's keys,
   * a member only their own; any other id is a 404 (`err.isNotFound`). Revoking a revoked key
   * changes nothing and answers the same 204, so a tool that signs out can revoke its key without
   * knowing whether it already did. An account token already revoked or expired is a 401
   * (`err.isAuthError`): the key was not revoked and still reads. `signal` (an AbortSignal, e.g.
   * `AbortSignal.timeout(5000)`) and `keepalive` go to fetch as given: with `keepalive: true` a
   * browser finishes the revoke after the tab that sent it closes; an abort rejects with an
   * OwNetworkError whose `cause2` is the abort. Account token only.
   */
  async revokeWorldKey(
    worldId: string,
    keyId: string,
    opts: { signal?: AbortSignal; keepalive?: boolean } = {},
  ): Promise<void> {
    only('revokeWorldKey', opts, ['signal', 'keepalive']);
    if (this.keyKind !== 'account') {
      throw new TypeError('revokeWorldKey needs an account token (ow_a_)');
    }
    const send: { signal?: AbortSignal; keepalive?: boolean } = {};
    if (opts.signal !== undefined) send.signal = opts.signal;
    if (opts.keepalive !== undefined) send.keepalive = opts.keepalive;
    await this.request('DELETE', `/account/worlds/${encodeURIComponent(worldId)}/keys/${encodeURIComponent(keyId)}`, send);
  }

  // -- Sign in with OnlyWorlds (OAuth 2.1 code + PKCE) ----------------------

  /**
   * Start Sign in with OnlyWorlds from a tool's page: mint `state` and a PKCE verifier, keep them
   * under `clientId` in `storage` (sessionStorage by default; in Node pass one), and send the
   * browser to `https://www.onlyworlds.com/signin/authorize` (or only return the URL with
   * `navigate: false`). `redirectUri` is the registered return address as a string, `https:`
   * only, never built from `location.origin`: a tool's registration is read at
   * `GET /api/v2/auth/clients`. `resume` is small JSON handed back by `completeSignIn`. No request
   * is sent; any client, keyless included.
   */
  async signInWithOnlyWorlds(opts: OwSignInBegin): Promise<OwSignInBegun> {
    only('signInWithOnlyWorlds', opts, ['clientId', 'redirectUri', 'resume', 'storage', 'navigate']);
    return beginSignIn(this.baseUrl, opts);
  }

  /**
   * Finish Sign in with OnlyWorlds on the callback page: check `state` against the record and the
   * page against the registered address, take `code` and `state` out of the address bar, trade
   * the code once at `POST /auth/token` with the PKCE verifier and no credential, and return the
   * `ow_a_` token with the account and `resume`. The record is cleared on success and on refusal;
   * the SDK keeps no token: the tool does. Refusals are `OwSignInError`: `state_mismatch` (no
   * pending sign-in, a different state, or the wrong page; nothing sent), `invalid_grant` (keel's
   * 400: used, expired, or another client's code), `rate_limited`, `offline`, `failed`.
   */
  async completeSignIn(opts: OwSignInComplete): Promise<OwSignInResult> {
    only('completeSignIn', opts, ['clientId', 'storage', 'url']);
    return completeOAuthSignIn(this.baseUrl, this.fetchImpl, opts);
  }

  // -- Ask your world -------------------------------------------

  /**
   * POST /account/ask -- a question about a world the account owns or is in, answered by
   * keel's AI proxy from `context` only (build it with buildAskContext from the elements
   * the user sees; it leaves proposed, hidden and room elements out unless asked). The answer is "The world doesn't say." when the context does not hold
   * it. Needs the client's `ow_a_` token (a world key is a TypeError before sending).
   * Refusals: 429 `quota_exceeded` (`err.isQuotaExceeded`, the account's token rating used up for the day;
   * Retry-After runs to midnight UTC), 503 `ask_unavailable` (`err.isAskUnavailable`:
   * switched off, or paused for the day), 502 `ask_failed` (`err.isAskFailed`); none of
   * them counts. 422 for a question over 500 characters or context past its limits.
   */
  async ask(req: { worldId: string; question: string; context: string[] }): Promise<OwAskAnswer> {
    only('ask', req, ['worldId', 'question', 'context']);
    if (this.keyKind !== 'account') {
      throw new TypeError('ask needs an account token (ow_a_): the proxy meters per account');
    }
    return this.request('POST', '/account/ask', {
      body: { world_id: req.worldId, question: req.question, context: req.context },
    }) as Promise<OwAskAnswer>;
  }

  /**
   * POST /account/sort -- the user's unsorted notes, and the elements the app's own search
   * found for them (`slice`: id, lowercase type, name, optional anchor; build it from
   * lookupWorld's hits), sorted by the same proxy as ask into rows to review: `make`, `add_to`,
   * `link`, `ask`. Nothing is written; the app applies what the user accepts. Every id in a
   * row is from the slice; keel moves any other row to `not_proposed` with its reason.
   * The same account token, token rating (it spends the tokens it uses) and refusals as ask. 422
   * names the param: notes 1 to 8, each up to 4,000 characters and 16,000 in all (text
   * only), at most four pictures, each uploaded into this world; slice up to 100, names up
   * to 200 characters, anchors up to 120.
   */
  async sort(req: { worldId: string; notes: OwSortNote[]; slice: OwSortRef[] }): Promise<OwSortAnswer> {
    only('sort', req, ['worldId', 'notes', 'slice']);
    if (this.keyKind !== 'account') {
      throw new TypeError('sort needs an account token (ow_a_): the proxy meters per account');
    }
    return this.request('POST', '/account/sort', {
      body: { world_id: req.worldId, notes: req.notes, slice: req.slice },
    }) as Promise<OwSortAnswer>;
  }

  /**
   * GET /account/allowance -- the account's token rating, the one daily meter ask, sort and
   * the Council spend from (keel 872431f): the rating, what is used and left today, and
   * when it resets (the next midnight UTC). Spends nothing. Needs the client's `ow_a_` token.
   */
  async allowance(): Promise<OwAllowance> {
    if (this.keyKind !== 'account') {
      throw new TypeError('allowance needs an account token (ow_a_): the allowance is per account');
    }
    return this.request('GET', '/account/allowance') as Promise<OwAllowance>;
  }

  // -- Core request machinery ----------------------------------------------

  /**
   * Raw authenticated request against this client's baseUrl. Public since 4.0
   * so auxiliary resources can ride the same transport — it structurally
   * satisfies `TokenTransport` (`new TokenResource(client)`). Prefer the typed
   * methods for element CRUD; this is the escape hatch, and it does NOT apply
   * sanitizePayload — callers own their body shape.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: {
      query?: string;
      body?: unknown;
      idempotencyKey?: string;
      auth?: boolean;
      allowEmpty?: boolean;
      replayAware?: boolean;
      /** A `change_seq` to send as `If-Match`; a whole number, else TypeError before sending. */
      /** A write keel's document lists X-OW-Agent on (the element writes, hide and unhide, the file ticket, setMyCharacter, mintWorldKey): where an agent client sends it. */
      write?: boolean;
      /** One of the writes keel reads X-OW-Client on (create, put, patch, delete, links, bulk, adopt, propose, accept): where the client's name goes. */
      elementWrite?: boolean;
      /**
       * A write keel may answer 202 with `{proposal}` (put, patch, links): a 202 then
       * throws an OwProposedError instead of returning a body that is not the element.
       */
      proposable?: boolean;
      ifMatch?: number;
      /** A tag to send as `If-None-Match` exactly as given (the head read): unlike ifMatch, nothing is quoted or checked. */
      ifNoneMatch?: string;
      /**
       * Called with every response's `ETag` header (as received, null when absent) and status, before
       * the body is read. With it given, a 304 Not Modified returns null instead of throwing.
       */
      onEtag?: (etag: string | null, status: number) => void;
      /** Passed to fetch as given: aborting it rejects with an OwNetworkError whose `cause2` is the abort. */
      signal?: AbortSignal;
      /** Passed to fetch as given: a browser finishes the request after the page closes. */
      keepalive?: boolean;
      /**
       * A GET keel serves an account token, or no key, with `world=<id>` (element list and get, search,
       * the world GET). On a client with `world` set, `world=<id>` is added to the query. On an
       * account client every other route but /account, and on a keyless client every other route
       * that needs a credential, is a TypeError before sending.
       */
      worldRead?: boolean;
      /**
       * A route keel's document declares the account token on beside the world key (worldLenses,
       * setMyLenses): an account client sends it with its Bearer token. `'path'`: the path names the
       * world, and nothing is added. `'world'`: the world is named with `world=<id>`, added from the
       * client's `world`, and an account client without `world` set is a TypeError before sending.
       * A world key sends as without it; a keyless client is still refused.
       */
      accountToken?: 'path' | 'world';
    } = {},
  ): Promise<T> {
    only('request', opts, REQUEST_OPTION_KEYS);
    if (opts.ifMatch !== undefined && !(Number.isInteger(opts.ifMatch) && opts.ifMatch >= 0)) {
      throw new TypeError(`ifMatch must be a whole number (an element's change_seq), got ${String(opts.ifMatch)}`);
    }
    if (opts.accountToken !== undefined && opts.accountToken !== 'path' && opts.accountToken !== 'world') {
      throw new TypeError(`accountToken is 'path' or 'world', got ${JSON.stringify(opts.accountToken) ?? String(opts.accountToken)}. Nothing was sent.`);
    }
    // The one rule for what an account token or no key may send, read from the request itself.
    const worldRead = opts.auth !== false && opts.worldRead === true && method.toUpperCase() === 'GET';
    const accountToken = opts.auth !== false && this.keyKind === 'account' ? opts.accountToken : undefined;
    if (opts.auth !== false && this.keyKind === 'none' && !(worldRead && this.world !== undefined)) {
      throw new TypeError(`${method} ${path} needs a key, and this client holds none: without one, only health, previewJoin, redeemJoin and signInWithPassword work, and list, listAll, get and getWorld with \`world\` set`);
    }
    if (opts.auth !== false && this.keyKind === 'account' && !ACCOUNT_ROUTE.test(path)) {
      if (!worldRead && accountToken === undefined) {
        throw new TypeError(`${method} ${path} needs a world key: an account token sends the /account routes, worldLenses and setMyLenses, and with \`world\` set reads a world through list, listAll, get and getWorld only. Nothing was sent.`);
      }
      if (worldRead && this.world === undefined) {
        throw new TypeError(`${method} ${path}: an account token reads a world only with \`world\` set (new OwV2Client({ apiKey, world })), through list, listAll, get and getWorld. Nothing was sent.`);
      }
      if (accountToken === 'world' && this.world === undefined) {
        throw new TypeError(`${method} ${path}: an account token names the world it sends to with \`world\`: set it (new OwV2Client({ apiKey, world })). Nothing was sent.`);
      }
    }
    let query = opts.query ?? '';
    if ((worldRead || accountToken === 'world') && this.world !== undefined) {
      const world = `world=${encodeURIComponent(this.world)}`;
      query = query ? `${query}&${world}` : world;
    }
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {};
    if (opts.auth !== false) {
      if (this.keyKind === 'account') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      } else if (this.keyKind !== 'none') {
        // A keyless client reaches here only for a world read with `world` set: no credential at all.
        headers['API-Key'] = this.apiKey;
        // The PIN only where keel checks it (ruled 2026-10-22): keel verifies a PIN
        // wherever it is sent (argon2, 64 MiB each), and scripts reading with it OOM-killed staging on
        // a cold cache (2026-10-22). Sent on every write (any method but GET), on GET /me, the
        // test-connection read, and on every request of a 10-digit legacy key, which
        // needs it on reads of a world with a PIN (v1 parity). Never on any other read.
        const read = method.toUpperCase() === 'GET';
        const me = path === '/me/' || path === '/me';
        if (this.apiPin && (!read || me || this.keyKind === 'legacy')) headers['API-Pin'] = this.apiPin;
      }
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;
    if (opts.ifNoneMatch !== undefined) headers['If-None-Match'] = opts.ifNoneMatch;
    // X-OW-Agent: presence is the declaration, the value is never stored. Opt-in only, and
    // on the element writes alone, the operations keel's document declares it on.
    if (this.agent && opts.write) headers['X-OW-Agent'] = '1';
    // X-OW-Client: the client's own name, on the seven element writes keel reads it on, never on a
    // read, nor on the other writes (hide, the file ticket, setMyCharacter, a key), where keel ignores it.
    if (opts.elementWrite) headers['X-OW-Client'] = this.clientName;

    let res: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      };
      if (opts.signal !== undefined) init.signal = opts.signal;
      if (opts.keepalive !== undefined) init.keepalive = opts.keepalive;
      res = await this.fetchImpl(url, init);
    } catch (cause) {
      throw new OwNetworkError(`OnlyWorlds request failed: ${method} ${path}`, cause);
    }

    if (opts.onEtag) {
      opts.onEtag(res.headers?.get?.('ETag') ?? null, res.status);
      // A 304 has no body: the caller that asked for the tag reads the status it was handed.
      if (res.status === 304) return null as T;
    }
    if (!res.ok) throw await errorFromResponse(res);
    if (opts.proposable && res.status === 202) throw await proposedFromResponse(res, method, path);
    if (res.status === 204 || opts.allowEmpty) {
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    }
    const parsed = await res.json();
    // Bulk: surface server-side idempotent replay. The header arrives lowercase
    // on the wire (fixture P2b); Headers.get is case-insensitive regardless.
    if (opts.replayAware && parsed && typeof parsed === 'object') {
      (parsed as OwBulkResponse).wasReplay = readReplayHeader(res.headers);
    }
    return parsed as T;
  }
}

// -- Helpers ---------------------------------------------------------------

/**
 * The conditional head poll's state, one per client: the last head read's ETag,
 * exactly as received, sent back as If-None-Match, and the head, cursor and epoch that 200
 * answered, which a 304 hands back. Kept off the client's own methods, which the wire gate
 * holds to routes.
 */
class HeadPollState {
  tag: string | undefined;
  held: { head: number; cursor: string; epoch: number | null } | undefined;

  /** A read of /changes: a 409 `resync_required` drops the tag and the held head, then is thrown as is. */
  async feedRead<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (err) {
      if (err instanceof OwApiError && err.isResyncRequired) {
        this.tag = undefined;
        this.held = undefined;
      }
      throw err;
    }
  }
}

/**
 * Read-only fields the API must never receive on a write.
 *
 * LAW (do not "improve"): this is a BLACKLIST and must never become a
 * whitelist. Namespaced extension fields (atlas_* / shadow_* / x_*) MUST pass
 * through writes untouched — every tool that round-trips its own state through
 * other tools depends on it (e.g. tangle's x_tangle_battle). A whitelist would
 * silently strip them and corrupt cross-tool state. Consumer-review-upheld
 * (2026-07-18, reaffirmed 2026-07-23).
 */
const READ_ONLY_FIELDS = ['world', 'type', 'created_at', 'updated_at', 'change_seq', 'known_of'] as const;

/**
 * The world's own read-only keys, stripped by patchWorld on top of READ_ONLY_FIELDS: the public
 * page's two (set on the world page), `public_read` (the same 422, keel's recipe) and
 * `agent_narrator_rule` (the owner's switch on the world page; a 422 naming it, measured on
 * staging 2026-10-22), and `agent_writes_proposed` (the owner's switch on the world page,
 * readOnly in keel's `World`), `origin` (served on GET, an unknown key on PATCH, a 422;
 * it is written as the plain keys `source` and `producer`, which pass) and `id` (readOnly in keel's
 * `World`, and not a key PATCH takes: the same 422). `owner_character` is accepted by the server and
 * left in. The extension keys (`x_*`, `atlas_*`, `shadow_*`) pass, as on an element write. Kept
 * apart so an element write never loses a field of these names.
 */
// `counts` rides only a keyless GET /world and is an unknown key to PATCH.
const WORLD_READ_ONLY_FIELDS = ['id', 'slug', 'public_page', 'public_read', 'agent_narrator_rule', 'agent_writes_proposed', 'origin', 'counts'] as const;

/** The proposals of one element: /{type}/{id}/proposals. */
function proposalsPath(type: string, id: string): string {
  return `/${type}/${encodeURIComponent(id)}/proposals`;
}

/**
 * A 202 on a write that may become a proposal: an OwProposedError carrying the row.
 * A 202 whose body holds no proposal is an OwApiError with status 202 and the body as `detail`:
 * the client never hands back a body that is not the element, and never makes up a proposal.
 */
async function proposedFromResponse(res: Response, method: string, path: string): Promise<OwApiError> {
  const body = await readJsonBody(res);
  const proposal = body && typeof body === 'object' ? (body as { proposal?: unknown }).proposal : undefined;
  if (!proposal || typeof proposal !== 'object') {
    return new OwApiError(202, null, `${method} ${path} answered 202 without a proposal: the write was not applied, and the answer is not an element`, null, body);
  }
  return new OwProposedError(202, null,
    `${method} ${path} became a proposal (202): this world takes an agent seat's writes as proposals, so the element did not change. err.proposal is the row; the owner or a co-builder accepts or declines it.`,
    null, body);
}

/**
 * Strip fields the API rejects on write. WIRE-CORRECTED (fixtures P3a/P3b/P6):
 * beyond `world` (world identity comes from the key), the server 422s on
 * created_at / type / change_seq. Round-tripped read bodies carry all five, so
 * stripping (rather than throwing) keeps a read body directly writable.
 * `known_of` is an unknown field to keel's write path (a 422) and
 * is stripped too; a body where it is `true` never gets here (refuseKnownOf).
 */
function sanitizePayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return payload;
  const rest: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const field of READ_ONLY_FIELDS) delete rest[field];
  return rest;
}

/**
 * An element write of a known-of stub is a TypeError before
 * anything is sent. A stub's empty fields are not the element's values: stripping the
 * marker and sending the rest would turn keel's 422 into a write that blanks the
 * element (a PUT replaces it whole; a PATCH clears every field it names) for anyone
 * whose key may write it, such as an owner pushing a copy a player made.
 */
function refuseKnownOf(payload: unknown, where: string): void {
  if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).known_of === true) {
    throw new TypeError(
      `${where}: this body is a known-of stub (known_of: true), not the element: its empty fields are not its values, ` +
      'and writing it would blank them. Write from a whole copy, or send only the fields you mean to change.',
    );
  }
}

/**
 * End a sign-in session (DELETE {auth}/auth/session). allauth answers 401 once it has signed
 * out (seen on production, 2026-10-17), so the answer is never read, and a failure here never
 * turns a sign-in into a refusal.
 */
async function endAuthSession(fetchImpl: typeof globalThis.fetch, auth: string, session: string): Promise<void> {
  // Five seconds at most: the token is already minted, and a DELETE hanging on a
  // bad network must not hold the sign-in.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    await fetchImpl(`${auth}/auth/session`, { method: 'DELETE', headers: { 'X-Session-Token': session }, signal: abort.signal });
  } catch {
    // Swallowed on purpose.
  } finally {
    clearTimeout(timer);
  }
}

/** A body as JSON, or null when it is empty or not JSON (allauth can answer with an HTML page). */
async function readJsonBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Case-insensitive read of the (lowercase-on-wire) Idempotent-Replay header. */
function readReplayHeader(headers: Headers): boolean {
  const v = headers.get('Idempotent-Replay');
  return v != null && v.toLowerCase() === 'true';
}

/**
 * Mint an RFC 9562 UUIDv7: 48-bit Unix milliseconds, version 7, variant 10,
 * 74 random bits. Ids THIS client mints a millisecond or more apart sort by
 * creation (while the clock does not step backwards); within one millisecond the
 * order is random. Worlds also hold v4 ids and legacy v1-server ids (`06x...`,
 * which carry nibble 7 too but are seconds-first), so never order elements by id:
 * use created_at for creation order (change_seq is last-write order). v7 is a DEFAULT, never a
 * requirement -- caller-supplied v4 ids stay valid forever (ruling,
 * 2026-09-28; keel mints v7 server-side too, layout per keel core/ids.py).
 */
function mintUuid(now: number = Date.now()): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // 48-bit big-endian ms. The two high bytes by division: bitwise ops truncate to 32 bits.
  // Floor once so every byte agrees on the same integer (a fractional or pre-1970 mocked
  // clock would otherwise floor the high bytes and truncate the low ones).
  const ms = Math.floor(now);
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
  return (
    hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
    hex[bytes[4]] + hex[bytes[5]] + '-' +
    hex[bytes[6]] + hex[bytes[7]] + '-' +
    hex[bytes[8]] + hex[bytes[9]] + '-' +
    hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
  );
}

/**
 * Every extension a file on an element may end in, to the kind it gives: keel's NAME_EXTS
 * (files/service.py), `.yml` and `.markdown` included. A file picker's accept list is
 * `Object.keys(FILE_EXTENSIONS).map((e) => '.' + e)`.
 */
export const FILE_EXTENSIONS: Readonly<Record<string, OwFileKind>> = Object.freeze({
  pdf: 'pdf', txt: 'txt', md: 'md', markdown: 'md', json: 'json',
  csv: 'csv', yaml: 'yaml', yml: 'yaml', toml: 'toml', zip: 'zip',
});

/**
 * The kind a file name's extension gives, read as keel reads it: the last path part, then
 * what follows its last dot, which must have something before it. `undefined` when there is
 * none or keel takes no file with it (uploadFile then refuses before any request).
 */
export function fileKindOf(name: string): OwFileKind | undefined {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(FILE_EXTENSIONS, ext) ? FILE_EXTENSIONS[ext] : undefined;
}

/** fileKindOf, or a TypeError naming the extensions keel takes. */
function requireFileKind(name: string): OwFileKind {
  const kind = fileKindOf(name);
  if (!kind) {
    const base = name.split(/[\\/]/).pop() ?? '';
    const allowed = Object.keys(FILE_EXTENSIONS).map((e) => `.${e}`).join(' ');
    throw new TypeError(`Cannot tell the kind of "${base}" from its name: a file on an element must end in one of ${allowed} (or pass opts.kind)`);
  }
  return kind;
}

/** A File's own name, else undefined. */
function fileNameOf(file: unknown): string | undefined {
  if (typeof Blob === 'undefined' || !(file instanceof Blob)) return undefined;
  const name = (file as { name?: unknown }).name;
  return typeof name === 'string' && name !== '' ? name : undefined;
}

type XhrConstructor = new () => XMLHttpRequest;

/**
 * POST the bytes with XMLHttpRequest, reporting upload progress (fetch cannot). Resolves with
 * a Response-shaped answer for errorFromResponse and the caller; a request that never got an
 * answer rejects with OwNetworkError. The last call to onProgress is always (total, total) on
 * a successful send.
 */
function xhrUpload(
  XHR: XhrConstructor,
  url: string,
  headers: Record<string, string>,
  body: Blob | ArrayBuffer | ArrayBufferView,
  total: number,
  onProgress: (loaded: number, total: number) => void,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XHR();
    let last = -1;
    const report = (loaded: number) => {
      last = loaded;
      onProgress(loaded, total);
    };
    const fail = (why: string) => () =>
      reject(new OwNetworkError(`OnlyWorlds file upload failed: POST ${url}`, new Error(why)));
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (xhr.upload) xhr.upload.onprogress = (e: ProgressEvent) => report(Math.min(e.loaded, total));
    xhr.onerror = fail('network error');
    xhr.onabort = fail('aborted');
    xhr.ontimeout = fail('timed out');
    xhr.onload = () => {
      const status = xhr.status;
      if (!status) {
        fail('no answer')();
        return;
      }
      const ok = status >= 200 && status < 300;
      if (ok && last !== total) report(total);
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      resolve({
        ok,
        status,
        headers: { get: (n: string) => xhr.getResponseHeader(n) },
        text: async () => text,
        json: async () => JSON.parse(text),
      } as unknown as Response);
    };
    xhr.send(body as XMLHttpRequestBodyInit);
  });
}

/** An image's object key: the key as given, or the path of a full image_url without its leading slash. */
function objectKey(keyOrUrl: string): string {
  if (!/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return decodeURIComponent(new URL(keyOrUrl).pathname.replace(/^\/+/, ''));
}

/** Every top-level key `list()` reads; a plain-JS caller's unknown key is refused by name, never dropped (W11, 2026-10-22). */
const LIST_PARAM_KEYS: readonly (keyof ListParams)[] = ['limit', 'cursor', 'ids', 'createdBy', 'expand', 'fields', 'filter', 'viewAs', 'signal'];

/** A caller's AbortSignal as request()'s option, or nothing when none was given. */
function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}
/** listAll's: list()'s without `cursor`, which the walk sets itself. */
const LIST_ALL_PARAM_KEYS: readonly (keyof ListParams)[] = LIST_PARAM_KEYS.filter(k => k !== 'cursor');
const LIST_FILTER_HINT = 'A wire filter (name, name__icontains, supertype, subtype, characters) goes under filter: { ... }.';

/** Every key `request()` reads; the escape hatch refuses any other like the typed methods (4.64.0). */
const REQUEST_OPTION_KEYS = [
  'query', 'body', 'idempotencyKey', 'auth', 'allowEmpty', 'replayAware', 'write', 'elementWrite',
  'proposable', 'ifMatch', 'ifNoneMatch', 'onEtag', 'signal', 'keepalive', 'worldRead',
  'accountToken',
] as const;

/** The account routes: /account and everything under it, which an account token sends with or without `world`. */
const ACCOUNT_ROUTE = /^\/account(?:[/?]|$)/;

/**
 * Refuse an options object's unknown key before anything is sent. TypeScript refuses it at compile
 * time; a plain-JavaScript caller had nothing until 4.51.0, and a dropped key turned a filter into the
 * whole list (99 Characters deleted on a test world, 2026-10-22), would turn `atomic` off, drop an
 * `idempotencyKey`, or widen a draught's `mode`. Only own enumerable keys are read.
 */
function only(method: string, obj: object | undefined, keys: readonly string[], hint = ''): void {
  const k = unknownKey(obj, keys);
  if (k !== undefined) {
    throw new TypeError(`${method}: unknown parameter '${k}'. ${hint ? hint + ' ' : ''}The keys are ${keys.join(', ')}. Nothing was sent.`);
  }
}

/** Every key `OwClientConfig` declares; the constructor refuses any other by name. A new option joins this list in the same commit. */
const CLIENT_CONFIG_KEYS = ['apiKey', 'apiPin', 'baseUrl', 'pageSize', 'changesPageSize', 'fetch', 'agent', 'client', 'world'] as const;

/** `world`, checked at construction: a non-empty string, on a client with an account token or no key. */
function worldOf(value: unknown, keyKind: OwKeyKind): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`OwV2Client: world is a world's id, a non-empty string; got ${JSON.stringify(value) ?? String(value)}. With it, an account token or no key reads that world through list, listAll, get and getWorld.`);
  }
  if (keyKind !== 'account' && keyKind !== 'none') {
    throw new TypeError('OwV2Client: a world key reads its own world; `world` is for an account token or no key, which read the world it names through list, listAll, get and getWorld.');
  }
  return value;
}

/** keel's rule for X-OW-Client, exact here: keel trims and stores null for anything else, this package refuses it. */
const CLIENT_NAME_RULE = /^[a-z0-9-]{1,32}$/;
const DEFAULT_CLIENT_NAME = 'sdk';

function clientNameOf(value: unknown): string {
  if (value === undefined) return DEFAULT_CLIENT_NAME;
  if (typeof value !== 'string' || !CLIENT_NAME_RULE.test(value)) {
    throw new TypeError(`OwV2Client: client must be lower case letters, digits and hyphens, 1 to 32 characters ([a-z0-9-]{1,32}), such as 'atlas'; got ${JSON.stringify(value) ?? String(value)}. It is sent as X-OW-Client on writes; leave it out for '${DEFAULT_CLIENT_NAME}'.`);
  }
  return value;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return q.toString();
}

// parseErrorEnvelope re-exported for consumers hand-parsing stored envelopes; the
// error surface discoverable to consumers reading the client.
export { parseErrorEnvelope };
