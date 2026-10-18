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
  OwUploadedImage, OwWorldMeta, OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwMember,
  OwSortAnswer, OwSortNote, OwSortRef, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwJoined, OwAgentJoined, OwPlayerJoined,
  OwSignedIn,
} from './types';
import { keyedId } from './keyed-id';
import { OwApiError, OwNetworkError, OwSignInError, errorFromResponse, parseErrorEnvelope, parseRetryAfter } from './errors';
import { detectKeyKind, OwKeyKind } from './keys';

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

  constructor(config: OwClientConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.apiPin = config.apiPin || undefined;
    this.keyKind = config.apiKey ? detectKeyKind(config.apiKey) : 'none';
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
   */
  async getWorld(): Promise<OwWorldMeta> {
    return this.request('GET', '/world/') as Promise<OwWorldMeta>;
  }

  /** PATCH /world -- partial world-meta update. */
  async patchWorld(partial: Record<string, unknown>): Promise<OwWorldMeta> {
    return this.request('PATCH', '/world/', { body: sanitizePayload(partial) }) as Promise<OwWorldMeta>;
  }

  // -- Who am I, and who is here ---------------------------------------------

  /**
   * GET /me -- who this world key is: the world, read or write scope, the kind (owner,
   * person, agent, player), the role, the membership id (what `created_by` holds for what this key
   * creates; null for the owner) and the member's Character. A world key's call; an account
   * token is a TypeError before sending.
   */
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

  /** GET /{type}/ -- one cursor page. */
  async list(type: ElementType | string, params: ListParams = {}): Promise<OwPage> {
    const query = buildQuery({
      limit: params.limit ?? this.pageSize,
      cursor: params.cursor,
      expand: params.expand?.join(','),
      fields: params.fields?.join(','),
      ...params.filter,
    });
    return this.request('GET', `/${type}/`, { query }) as Promise<OwPage>;
  }

  /** Cursor-walk every page of a type. Politeness: uses config pageSize. */
  async *listAll(type: ElementType | string, params: Omit<ListParams, 'cursor'> = {}): AsyncGenerator<OwElement> {
    let cursor: string | undefined;
    do {
      const page = await this.list(type, { ...params, cursor });
      for (const el of page.data) yield el;
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);
  }

  /** GET /{type}/{id}/ -- optional one-level stub expansion / sparse fields. */
  async get(type: ElementType | string, id: string, opts: Pick<ListParams, 'expand' | 'fields'> = {}): Promise<OwElement> {
    const query = buildQuery({ expand: opts.expand?.join(','), fields: opts.fields?.join(',') });
    return this.request('GET', `/${type}/${id}/`, { query }) as Promise<OwElement>;
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
    const body = sanitizePayload(element);
    if (body.id === undefined || body.id === null || body.id === '') {
      body.id = opts.idempotencyKey ? keyedId(opts.idempotencyKey, 0) : mintUuid();
    }
    return this.request('POST', `/${type}/`, {
      write: true,
      body,
      idempotencyKey: opts.idempotencyKey,
    }) as Promise<OwElement>;
  }

  /** PUT /{type}/{id}/ -- upsert-by-client-id. The local-first write primitive. */
  async upsert(type: ElementType | string, id: string, element: OwElement | Record<string, unknown>): Promise<OwElement> {
    return this.request('PUT', `/${type}/${id}/`, { write: true, body: sanitizePayload(element) }) as Promise<OwElement>;
  }

  /**
   * PATCH /{type}/{id}/ -- partial update. DESTRUCTIVE on sent fields: arrays
   * replace wholesale, omitted fields stay untouched. For link arrays prefer
   * editLinks() -- atomic server-side merge, no read-before-write.
   *
   * `ifMatch` (keel #210): the element's `change_seq` as you read it. The update lands
   * only if nobody changed the element since; otherwise nothing is written and this throws
   * an OwPreconditionFailedError (412) whose `current` is the element as it is now. Omit
   * it for today's unconditional write.
   */
  async patch(
    type: ElementType | string,
    id: string,
    partial: Record<string, unknown>,
    opts: { ifMatch?: number } = {},
  ): Promise<OwElement> {
    return this.request('PATCH', `/${type}/${id}/`, { write: true, body: sanitizePayload(partial), ifMatch: opts.ifMatch }) as Promise<OwElement>;
  }

  /**
   * DELETE /{type}/{id}/ -- idempotent (204 on absent). Server writes a
   * tombstone AND scrubs the id from every other element's links in the same
   * transaction -- no client-side unlink pass needed, ever.
   */
  async delete(type: ElementType | string, id: string): Promise<void> {
    await this.request('DELETE', `/${type}/${id}/`, { write: true, allowEmpty: true });
  }

  /**
   * POST /{type}/{id}/links/{field} with {add, remove} -- atomic link merge.
   * Dedupes, tolerates already-present/already-absent ids. Returns the FULL
   * updated element (fixture P5). Use this for all relationship editing; it
   * retires the read-merge-PATCH dance. `ifMatch` works as on patch(): a link write
   * moves the element too.
   */
  async editLinks(
    type: ElementType | string,
    id: string,
    field: string,
    edit: OwLinkEdit,
    opts: { ifMatch?: number } = {},
  ): Promise<OwElement> {
    return this.request('POST', `/${type}/${id}/links/${field}`, { write: true, body: edit, ifMatch: opts.ifMatch }) as Promise<OwElement>;
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
   * An element without an id gets one, as `create` mints it, by its position in `items`: with an
   * `idempotencyKey`, derived from the key and the position (the ids the Python package mints),
   * so a retry with the same key and items sends the same body; without one, a
   * fresh UUIDv7. Ids you supply are kept.
   */
  async bulk(items: OwBulkItem[], opts: { atomic?: boolean; idempotencyKey?: string } = {}): Promise<OwBulkResponse> {
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
      body,
      idempotencyKey: opts.idempotencyKey,
      replayAware: true,
    }) as Promise<OwBulkResponse>;
  }

  // -- Changes feed --------------------------------------------------------

  /**
   * GET /changes -- one page of the world's ordered change feed.
   * Cursor is OPAQUE: persist verbatim, never parse or build one (a guest's has
   * another shape than everyone else's).
   * Zero/absent cursor = full export (byte-aligned with the Folder Format).
   * Reset rule: a 409 `resync_required` (err.isResyncRequired) means the key's
   * view changed (a guest's, or its role): drop the cursor, walk from zero, and
   * replace the local copy rather than merging into it.
   * Citizenship: heaviest route on the platform; default page size is polite.
   * keel sends the cursor of a page at the head as a number (an empty page, for anyone
   * but a guest); it is handed back as a string, like every cursor here.
   */
  async changes(opts: { since?: string; limit?: number } = {}): Promise<OwChangesPage> {
    const query = buildQuery({ since: opts.since, limit: opts.limit ?? this.changesPageSize });
    const page = await this.request('GET', '/changes/', { query }) as Omit<OwChangesPage, 'cursor'> & { cursor: string | number };
    return { ...page, cursor: String(page.cursor) };
  }

  /**
   * GET /changes?head=true -- where the feed is now, without a page: no element is read.
   * `head` is the world's change_seq; `cursor` is a position to pass as `since` that
   * re-sends nothing at the head (a guest's carries its view's epoch). The cheap "anything
   * new?" for a poll: compare `head` with the head you last APPLIED (not the previous
   * poll's, so a missed tick never drops a change) and walk changesAll only when it moved;
   * a head below yours means the server rewound: walk again from zero. `epoch` is a
   * guest's view epoch (null for other keys): it can move with `head` unchanged, so walk on
   * either move. keel returns the owner's cursor as a number; it is handed back as a
   * string, like every cursor here.
   */
  async changesHead(): Promise<{ head: number; cursor: string; epoch: number | null }> {
    const page = await this.request('GET', '/changes/', { query: buildQuery({ head: 'true' }) }) as { head: number; cursor: string | number; epoch?: number | null };
    return { head: page.head, cursor: String(page.cursor), epoch: page.epoch ?? null };
  }

  /**
   * Walk the feed from `since` (or from zero = full export) to the current
   * tail, yielding ops in order. Returns the final cursor via the generator's
   * return value; persist it for the next incremental pull (with the last page's
   * `head` and `epoch`: the view epoch the walk ran under, for a guest).
   */
  async *changesAll(since?: string): AsyncGenerator<OwChange, { cursor: string; head: number; epoch: number | null }> {
    let cursor = since;
    let page: OwChangesPage;
    do {
      page = await this.changes({ since: cursor });
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

  // -- Joining a world by link (keel #212) ----------------------------------

  /**
   * POST /join/preview -- what a join code holds, without using it: who invites, to
   * which world, in what role, and `reader` (`person`: accept it with acceptJoin;
   * `agent`: an AI agent redeems it at POST /join). Sends no credential, whatever key
   * this client holds. Every bad code (unknown, used, revoked, expired) is the same
   * 404 `not_found` (`err.isNotFound`). `code` is the part of the link after `#`.
   */
  async previewJoin(code: string): Promise<OwJoinPreview> {
    return this.request('POST', '/join/preview', { auth: false, body: { code } }) as Promise<OwJoinPreview>;
  }

  /**
   * POST /join -- redeem a join code that needs no account: a player's (a friend reading as
   * a guest, keel #353) or an AI agent's. Sends no credential, whatever key this client holds.
   * 201 with `kind` telling the two answers apart: `player` gives a read key (`ow_r_`, no PIN)
   * and the Character it reads as; `agent` gives a seat's write key, secret and `.env` lines.
   * Both are shown once, and the code is spent: a lost answer cannot be replayed (the owner
   * sees the row never used, and makes a new link). `name` (a player's, optional: the
   * Character's name or "Player" when left out) and `agentName` (an agent's, required for an
   * agent code). Every bad code is the same 404 `not_found`; a person's code is redeemed with
   * acceptJoin instead.
   */
  async redeemJoin(code: string, opts: { name?: string; agentName?: string } = {}): Promise<OwJoined> {
    const body: Record<string, unknown> = { code };
    if (opts.name !== undefined) body.name = opts.name;
    if (opts.agentName !== undefined) body.agent_name = opts.agentName;
    return this.request('POST', '/join', { auth: false, body }) as Promise<OwJoined>;
  }

  // -- Signing in with a password (keel #211) --------------------------------

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
   * (`err.isAlreadyMember`). Accepting needs no account PIN, for any role (keel #297,
   * ed73c90); a write key for the membership waits for one (`pin_required`). A refusal
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
   * `ow_a_` token owns (keel C1): `reader` is required (`person`, accepted with acceptJoin;
   * `agent`, redeemed at POST /join; `player`, a friend with no account, redeemed with
   * redeemJoin for a read key, keel #353); `role` defaults to contributor (a player link is
   * guest, and refuses any other), `days` (1, 7 or 30) to 7; `withCharacter` (agent links
   * only) to true; `character` (player links only) a Character's id or `new` (the default):
   * whoever opens the link first reads as it, until removed. 201 with the code, shown in this
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
    },
  ): Promise<OwCreatedWorldLink> {
    if (this.keyKind !== 'account') {
      throw new TypeError('createWorldLink needs an account token (ow_a_): only the world\'s owner makes links');
    }
    const body: Record<string, unknown> = { reader: opts.reader };
    if (opts.role !== undefined) body.role = opts.role;
    if (opts.days !== undefined) body.days = opts.days;
    if (opts.inviterName !== undefined) body.inviter_name = opts.inviterName;
    if (opts.withCharacter !== undefined) body.with_character = opts.withCharacter;
    if (opts.character !== undefined) body.character = opts.character;
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

  // -- Seats for your own AI (keel #355, D106) ------------------------------

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

  // -- Ask your world (keel #159) -------------------------------------------

  /**
   * POST /account/ask -- a question about a world the account owns or is in, answered by
   * keel's AI proxy from `context` only (build it with buildAskContext from the elements
   * the user sees). The answer is "The world doesn't say." when the context does not hold
   * it. Needs the client's `ow_a_` token (a world key is a TypeError before sending).
   * Refusals: 429 `quota_exceeded` (`err.isQuotaExceeded`, the account's token rating used up for the day;
   * Retry-After runs to midnight UTC), 503 `ask_unavailable` (`err.isAskUnavailable`:
   * switched off, or paused for the day), 502 `ask_failed` (`err.isAskFailed`); none of
   * them counts. 422 for a question over 500 characters or context past its limits.
   */
  async ask(req: { worldId: string; question: string; context: string[] }): Promise<OwAskAnswer> {
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
      /** A `change_seq` to send as `If-Match` (keel #210); a whole number, else TypeError before sending. */
      /** An element write (create, put, patch, delete, links, bulk): where an agent client sends X-OW-Agent. */
      write?: boolean;
      ifMatch?: number;
    } = {},
  ): Promise<T> {
    if (opts.ifMatch !== undefined && !(Number.isInteger(opts.ifMatch) && opts.ifMatch >= 0)) {
      throw new TypeError(`ifMatch must be a whole number (an element's change_seq), got ${String(opts.ifMatch)}`);
    }
    if (opts.auth !== false && this.keyKind === 'none') {
      throw new TypeError(`${method} ${path} needs a key, and this client holds none: without one, only health, previewJoin, redeemJoin and signInWithPassword work`);
    }
    const url = `${this.baseUrl}${path}${opts.query ? `?${opts.query}` : ''}`;
    const headers: Record<string, string> = {};
    if (opts.auth !== false) {
      if (this.keyKind === 'account') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      } else {
        headers['API-Key'] = this.apiKey;
        if (this.apiPin) headers['API-Pin'] = this.apiPin;
      }
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;
    // keel #299 (D104): presence is the declaration, the value is never stored. Opt-in only, and
    // on the element writes alone, the operations keel's document declares it on.
    if (this.agent && opts.write) headers['X-OW-Agent'] = '1';

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (cause) {
      throw new OwNetworkError(`OnlyWorlds request failed: ${method} ${path}`, cause);
    }

    if (!res.ok) throw await errorFromResponse(res);
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
 * Read-only fields the API must never receive on a write.
 *
 * LAW (do not "improve"): this is a BLACKLIST and must never become a
 * whitelist. Namespaced extension fields (atlas_* / shadow_* / x_*) MUST pass
 * through writes untouched — every tool that round-trips its own state through
 * other tools depends on it (e.g. tangle's x_tangle_battle). A whitelist would
 * silently strip them and corrupt cross-tool state. Consumer-review-upheld
 * (2026-07-18, reaffirmed 2026-07-23).
 */
const READ_ONLY_FIELDS = ['world', 'type', 'created_at', 'updated_at', 'change_seq'] as const;

/**
 * Strip fields the API rejects on write. WIRE-CORRECTED (fixtures P3a/P3b/P6):
 * beyond `world` (world identity comes from the key), the server 422s on
 * created_at / type / change_seq. Round-tripped read bodies carry all five, so
 * stripping (rather than throwing) keeps a read body directly writable.
 */
function sanitizePayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return payload;
  const rest: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const field of READ_ONLY_FIELDS) delete rest[field];
  return rest;
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

/** An image's object key: the key as given, or the path of a full image_url without its leading slash. */
function objectKey(keyOrUrl: string): string {
  if (!/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return decodeURIComponent(new URL(keyOrUrl).pathname.replace(/^\/+/, ''));
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
