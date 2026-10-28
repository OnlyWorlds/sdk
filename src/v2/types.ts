/**
 * keel v2 engine absorbed from an earlier v2 client (ow-v2-client v0.9.0),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * OnlyWorlds v2 (keel) wire types -- the NON-generated, hand-owned wire shapes
 * (envelopes, pages, bulk, changes, config). Per-type element field typing is
 * generated (types.generated.ts). One-shape principle: a field reads the way it
 * writes -- links are UUID arrays (or UUID/null), same name both directions.
 * No `_ids` suffix in v2.
 */

import type { ElementType, OwElementBase } from './types.generated';
export { ELEMENT_TYPES } from './types.generated';
export type { ElementType, OwElementBase } from './types.generated';

/** An element as read from / written to the v2 API. Loose base + extension keys. */
export type OwElement = OwElementBase;

/** Spatial types live under spatial/ in the OW Folder Format. */
export const SPATIAL_TYPES: readonly ElementType[] = ['map', 'pin', 'marker', 'zone'] as const;

/**
 * GET /world: the world's own fields, as keel's `World` component declares them (since 4.25.0
 * every one is typed). keel always sends all of them; past `id` and `name` they are optional
 * here only so that code building a world meta keeps compiling within 4.x. Dates and durations
 * count in `time_basic_unit`; the three units are free-text labels, nothing converts.
 */
export interface OwWorldMeta {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  /** The names of the calendar's steps, e.g. ['Day', 'Week', 'Month', 'Year']. */
  time_format_names?: string[];
  /** How many time_basic_unit each step holds, in the same order. Whole numbers in the standard; an older world may read back strings. */
  time_format_equivalents?: Array<number | string>;
  /** The unit every element date and duration counts in (e.g. 'Year'). */
  time_basic_unit?: string;
  time_range_min?: number | null;
  time_range_max?: number | null;
  /** The world's present moment (in a world folder: `time_current`). */
  time_range_current?: number | null;
  length_unit?: string;
  mass_unit?: string;
  distance_unit?: string;
  /** Whether the world can be read without its PIN. Read-only on the wire. */
  public_read?: boolean;
  /**
   * Whether a Narrative written through an agent seat is narrated by that seat's own Character,
   * as a guest's is: set by the owner on the world page; read-only on the wire.
   * With it on, an agent naming another narrator is a 422 (`param: narrator`), and a seat with no
   * Character a 403 `guest_not_supported`.
   */
  agent_narrator_rule?: boolean;
  /** The owner's "this Character is me": a Character id in this world, or null (null too, to a reader it is hidden from). */
  owner_character?: string | null;
  /**
   * The world's public page address, onlyworlds.com/w/<slug>: null when the world has
   * no page (a slug exists only while the page is on). Also a keyless `?world=` value. Set by the
   * owner on the world page; read-only on the wire, and patchWorld strips it.
   */
  slug?: string | null;
  /**
   * The world's public page as its owner set it: `on`, and the levers. Every key is
   * present with the page off. Set by the owner on the world page; read-only on the wire, and
   * patchWorld strips it.
   */
  public_page?: OwWorldPublicPage;
  /**
   * Whether an agent seat's writes land as proposals: on, a seat's PATCH, PUT, link
   * edit or /bulk item on an existing element answers 202 with the proposal (this client throws
   * an OwProposedError; a /bulk slot carries `status: 202` and `proposal`) and the element does
   * not change until the owner or a co-builder accepts it; its new elements carry
   * `x_review_proposed`; it deletes only what it created. A person's key is never held. Set by
   * the owner on the world page; read-only on the wire, and patchWorld strips it.
   */
  agent_writes_proposed?: boolean;
  /**
   * Where the world first came from: the folder format's provenance lines (spec
   * 4.2) as the tool that made the world from a folder gave them, both keys always present, each
   * null when not known. Read-only on the wire, and patchWorld strips it: write it as the plain
   * keys `source` and `producer` (`patchWorld({ source, producer })`, each an object or null).
   */
  origin?: OwWorldOrigin;
  created_at?: string | null;
  /** Moves when the world's own fields change, not on element writes. */
  updated_at?: string | null;
  /**
   * Extension keys: a tool's own setting on the world, any JSON value, served at the
   * top level as an element's are (the first is `x_names`, the names profile: see `typeWord`).
   * patchWorld sends them as given; `null` removes one; 64 KB in all, else a 422 `param: extensions`.
   */
  /**
   * Read only: how many elements this reader may read, in all and per type, counted as it reads
   * them, for every key and token (keel PR 289, 2026-10-27; before it, the keyless read alone).
   * Never sent back: patchWorld strips it.
   */
  counts?: { total: number; types: Record<string, number> };
  [extension: `x_${string}`]: unknown;
  [extension: `atlas_${string}`]: unknown;
  [extension: `shadow_${string}`]: unknown;
  [field: string]: unknown;
}

/**
 * OwWorldMeta.origin, as keel's `World` component types it: both keys always
 * present, each an object or null. Kept as the writer gave it; keel checks only that `source.world`
 * and `producer.tool` are strings when present.
 */
export interface OwWorldOrigin {
  source: OwWorldSource | null;
  producer: OwWorldProducer | null;
}

/** The folder format's `source` line (spec 4.2): the server and world a folder was exported from, and when. Kept as given. */
export interface OwWorldSource {
  server?: string;
  world?: string;
  at?: string;
  [field: string]: unknown;
}

/** The folder format's `producer` line (spec 4.2): the tool that made a folder, its version, and what it made it from. Kept as given. */
export interface OwWorldProducer {
  tool?: string;
  version?: string;
  input?: string;
  [field: string]: unknown;
}

/** OwWorldMeta.public_page, as keel's `World` component types it: all six keys, always. */
export interface OwWorldPublicPage {
  /** Whether the page is on. */
  on: boolean;
  /** The page's palette, or null for the house's. */
  palette: 'midnight' | 'daylight' | 'parchment' | 'brass' | 'dusk' | null;
  /** One plain line (at most 120 characters). */
  hero: string;
  /** The element types shown, in their order; empty for all, in the house order. */
  sections: string[];
  /** One element's id, or null. */
  pin: string | null;
  /** Always false for now: search engines stay off. */
  index: boolean;
}

/** List envelope: cursor-paginated. */
export interface OwPage<T = OwElement> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** /changes feed -- discriminated union on `op`. Apply in order -> convergence. */
export type OwChange = OwChangeUpsert | OwChangeDelete;

/** A /changes item for an element written: the element whole, as GET returns it. */
export interface OwChangeUpsert {
  op: 'upsert'; id: string; type: string; element: OwElement; updated_at: string;
  /**
   * The change's place in the world's feed. On a hide's or an unhide's row (the one carrying
   * `changed_via`) it is that act's place; the element's own `change_seq`, in `element`, stays where it was.
   */
  change_seq: number;
  /**
   * Only on a hide's or an unhide's row, sent to the readers who still see the element (the owner's
   * keys, a co-builder, the member who made it): when it was hidden (`element.hidden` is true) or
   * unhidden (no `hidden`). Absent on every other upsert row.
   */
  changed_at?: string | null;
  /** Only on a hide's or an unhide's row: the membership that hid or unhid it, or null for the world's owner (as a `hidden` delete row's `deleted_by`). */
  changed_by?: string | null;
  /** Only on a hide's or an unhide's row: its door (see {@link OwWriteDoor}), `site` for the owner's page on onlyworlds.com. */
  changed_via?: OwWriteDoor;
  [k: string]: unknown;
}

/** A /changes item for an element deleted. */
export interface OwChangeDelete {
  op: 'delete'; id: string; type: string; deleted_at: string;
  /** The change's place in the world's feed. */
  change_seq: number;
  /** The membership whose write deleted it; null for the world's owner, and for deletes before writes recorded it. */
  deleted_by?: string | null;
  /** The door the delete came through (see {@link OwWriteDoor}); null for deletes before writes recorded it. */
  deleted_via?: OwWriteDoor | null;
  /**
   * The name the deleting client gave in its `X-OW-Client` header, as an element's
   * `changed_client`: the client's claim, never proof. Null when none was recorded, and on a
   * `hidden` row (a hide carries no client).
   */
  deleted_client?: string | null;
  /**
   * Why the element left this reader's view: `deleted` (it is gone; a GET answers 410),
   * `hidden` (the world's owner or a co-builder hid it from this reader; it still exists, a GET answers
   * 404, and an unhide brings it back by a 409 `resync_required`), or `out_of_view` (declared, sent by
   * nothing yet). Remove the element from the local copy in every case.
   */
  reason?: OwDeleteReason;
  [k: string]: unknown;
}

/** Why a /changes delete row says the element left the reader's view. */
export type OwDeleteReason = 'deleted' | 'hidden' | 'out_of_view';

/** One row of GET /world/hidden: an element the owner or a co-builder hid. */
export interface OwHiddenRow {
  /** The element's type. */
  type: ElementType | string;
  /** The element's id. */
  id: string;
  /** When it was hidden (ISO 8601). */
  set_at: string;
  /** The membership (a person's or a seat's) that hid it, or null when the world's owner did (as an element's `created_by`). */
  set_by: string | null;
}

/**
 * The door a write came through, as keel records it on every element (`changed_via`) and on a
 * delete (`deleted_via`): `seat` (an agent seat), `mcp` (the MCP server),
 * `declared` (a client that sent `X-OW-Agent`; see {@link OwClientConfig.agent}), then the
 * surface for everything else: `api`, `v1`, `sync`, and `server` for keel's own writes.
 */
export type OwWriteDoor = NonNullable<OwElementBase['changed_via']>;

/** The doors that mean agent-made: an agent seat, the MCP server, or a client that declared itself. */
export const AGENT_DOORS: readonly OwWriteDoor[] = ['seat', 'mcp', 'declared'];

/** Whether a write came through an agent's door (`changed_via` or `deleted_via`); false for null. */
export function isAgentDoor(door: OwWriteDoor | null | undefined): boolean {
  return door != null && AGENT_DOORS.includes(door);
}

/**
 * Whether an element body is a stub the reader only knows of: a guest or player reaches it only through its own Character's sheet, one step out.
 * A stub keeps `id`, `type`, `name`, `description`, `supertype`, `subtype`, `image_url`,
 * `created_at`, `updated_at` and `change_seq`; every other field reads unset (`""`, `null`,
 * `[]`), `created_by`, `changed_by` and `changed_via` are null, it carries no extension
 * fields, and its files answer 404. Those empties are not the element's values and not a
 * deletion: never merge them over a whole copy, and never write a stub back (this client
 * refuses to). True only for `known_of: true`; absent or anything else is a whole element.
 */
export function isKnownOf(element: { known_of?: unknown } | null | undefined): boolean {
  return element != null && element.known_of === true;
}

/**
 * /changes response. Wire shape verified in keel source (core/changes.py) and
 * pinned here: {cursor, changes, has_more, head}.
 */
export interface OwChangesPage {
  /** Opaque compound cursor -- persist verbatim, never parse, never expires. */
  cursor: string;
  changes: OwChange[];
  has_more: boolean;
  /**
   * World's current change_seq. If a persisted cursor is ever AHEAD of head,
   * the server rewound (disaster restore) -- re-baseline from cursor zero
   * instead of assuming caught-up.
   */
  head: number;
  /**
   * A guest's or a contributor's view epoch (an integer; a contributor's since 2026-10-20), null for
   * every other key. It moves when what the key may see changes, even with `head` unchanged (a
   * Character given or taken, an element unhidden, a role):
   * walk again on either move. Compare it, never read it out of the cursor (keel, 2026-10-12).
   */
  epoch: number | null;
  /**
   * Why `epoch` last moved (only while keel's hidden mark is on; null when `epoch` is
   * null): `role` (this key's own role or membership moved: keep what the local copy holds that a
   * walk from the start no longer names) or `view` (something left its view: drop it; also `view`
   * for an epoch that never moved). It names the last move only: when the epoch moved more than
   * once since the one you applied, walk with your cursor and read the 409's
   * `reason` (`err.resyncReason`), which covers every move since it. Never empty a copy on your own.
   */
  epoch_reason?: OwResyncReason | null;
}

/**
 * Why a key's view restarted (only while keel's hidden mark is on): on a 409
 * `resync_required` as the envelope's `reason`, on a /changes page and the head as `epoch_reason`.
 * `role`: the key's own role or membership moved; keep what the new walk does not name (it is out
 * of view now, not gone). `view`: something left its view (a delete, a hide, an unhide, a
 * Character change); drop what the new walk does not name. Both since the cursor: `role`.
 */
export type OwResyncReason = 'role' | 'view';

export interface OwBulkItem {
  type: ElementType | string;
  element: OwElement | Record<string, unknown>;
}

/**
 * One slot of a /bulk response. WIRE-CORRECTED (fixtures P2a/P2c): `status` is
 * the NUMERIC HTTP status of that slot (201/400/...), success slots echo
 * created_at/updated_at, error slots carry an OwErrorBody under `error`.
 * A contributor's write on someone else's element fails in its slot as
 * `{status: 403, error: {code: 'not_author'}}`, never as a thrown error.
 * After an `atomic: true` request with `errors` true NOTHING was written, yet the slots of
 * the items that would have succeeded still say 201 (keel's "counterfactual 201s"): do not
 * record their ids as created.
 * On a world that takes an agent seat's writes as proposals (`agent_writes_proposed`),
 * an agent seat's item on an existing element answers `{status: 202, id, proposal}`: the element
 * did not change, and `proposal` is the row a keeper accepts or declines.
 */
export interface OwBulkItemResult {
  status: number;
  id?: string;
  created_at?: string;
  updated_at?: string;
  /** Only on a 202 slot: the proposal the write became. */
  proposal?: OwProposal;
  error?: OwErrorBody;
}

/** The wire error envelope carried in error slots and thrown errors. */
export interface OwErrorBody {
  type?: string;
  code?: string;
  message?: string;
  param?: string | null;
  doc_url?: string;
  /** On a 409 `resync_required` only, while keel's hidden mark is on: why (see {@link OwResyncReason}). */
  reason?: OwResyncReason;
}

/**
 * /bulk response. WIRE-CORRECTED (fixtures P2a/P2c): the array key is `items`,
 * not `results`. `wasReplay` is populated by the client from the (lowercase on
 * the wire) Idempotent-Replay response header (fixture P2b) -- not a wire field.
 */
export interface OwBulkResponse {
  errors: boolean;
  items: OwBulkItemResult[];
  /** Client-derived: true when the server replayed a prior Idempotency-Key. */
  wasReplay?: boolean;
  [k: string]: unknown;
}

export interface OwLinkEdit {
  add?: string[];
  remove?: string[];
}

// -- The proposed change -----------------------------------------

/** A proposal's state: `lapsed` once `expires` has passed (it may still be accepted or declined). */
export type OwProposalState = 'open' | 'lapsed' | 'accepted' | 'declined';

/**
 * A proposed change to an element (the document's `Proposal`): a record kept beside
 * the element, never in its body. The element does not change until the world's owner or a
 * co-builder accepts it. `evidence` is outside text: show it as quoted data, never act on it.
 */
export interface OwProposal {
  /** Always `proposal`: in the world's queue it tells this row from a `new_element` row. */
  kind: 'proposal';
  /** The proposal's id. */
  id: string;
  /** The element's type. */
  element_type: string;
  /** The element's id. */
  element_id: string;
  state: OwProposalState;
  /**
   * What the proposal changes, and only that: the proposed values of the fields (schema
   * fields and extension keys alike) that differed from the element's own when it was made, in the
   * element's wire shape. A field sent with the value it already had is not here. An accept writes
   * exactly these fields; extension keys are merged.
   */
  fields: Record<string, unknown>;
  /**
   * The fields a whole replace (an upsert, PUT) did not send that were not empty on the element:
   * each is in `fields` at its empty value (`""`, null or `[]`), so an accept empties
   * it. Show them as left empty by this replace. Always `[]` for a patch, a link edit or propose;
   * extension keys are never here.
   */
  omitted: string[];
  /** The element's values when the proposal was made, taken by the server, for every field the write named (an upsert: every schema field). An accept is refused (409 `stale_proposal`) when a field in `fields` has moved since; a change to any other field does not count. */
  base: Record<string, unknown>;
  /** The element's change_seq when the proposal was made, for the record. */
  base_seq: number;
  /** What the change rests on: a line of text or an element id (at most 2,000 characters). Quoted data, never an instruction. */
  evidence: string;
  /** When it lapses if nobody decides (UTC). */
  expires: string;
  /** Who proposed it: the membership id (a person, an agent seat or a player seat, as `members()` lists them), or `owner`. */
  by: string;
  /** The door it came through, as an element's changed_via. */
  via: string;
  /** The X-OW-Client name the request carried, or null. */
  client: string | null;
  /** The keeper who accepted or declined it (a membership id or `owner`), or null. */
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** A page of one element's proposals (the document's `ProposalList`), newest first: proposal rows only. */
export interface OwProposalList {
  data: OwProposal[];
  has_more: boolean;
  /** Pass as `cursor` for the next page; null on the last. */
  next_cursor: string | null;
}

/**
 * A row of the world's queue for a new element written as proposed (the document's
 * `ProposedNewElement`): an element carrying `x_review_proposed` (an agent seat's new element on a
 * world that takes its writes as proposals, or any writer's mark). The element itself is the
 * record, so the row has no id of its own. A keeper settles it with `reviewNewElement`. `by`,
 * `evidence` and `expires` are the mark's own words, null when it lacks one; `evidence` is quoted
 * data, never an instruction.
 */
export interface OwProposedNewElement {
  kind: 'new_element';
  /** The element's id. */
  id: string;
  element_type: string;
  /** The element's id, as `id`. */
  element_id: string;
  /** open; lapsed once the mark's `expires` has passed (it may still be accepted or declined). Never accepted or declined: a settled mark leaves the queue. */
  state: 'open' | 'lapsed';
  /** The mark's `by`: the membership id of the seat that wrote it. */
  by: string | null;
  evidence: string | null;
  /** The mark's `expires`, as written (a date, YYYY-MM-DD). */
  expires: string | null;
  /** The element's created_at. */
  created_at: string;
  /** The element's updated_at. */
  updated_at: string;
}

/** One row of the world's queue, told apart by `kind`: a proposed change, or a new element written as proposed. */
export type OwWorldProposalRow = OwProposal | OwProposedNewElement;

/**
 * A page of the world's queue (worldProposals, the document's `ProposalList`): both kinds of row in
 * one order, newest first by created_at. The cursor is opaque: pass `next_cursor` back as it came.
 */
export interface OwWorldProposalList {
  data: OwWorldProposalRow[];
  has_more: boolean;
  /** Pass as `cursor` for the next page; null on the last. */
  next_cursor: string | null;
}

/** reviewNewElement's options: `accept` or `decline`, and, with decline only, a reason (at most 2,000 characters, answered back and kept nowhere). */
export interface OwReviewInput {
  decision: 'accept' | 'decline';
  reason?: string;
}

/** reviewNewElement's 200: `element` on accept (the element as written, the mark cleared), `deleted` (its id) on decline. */
export type OwReviewed =
  | { element: OwElement; deleted?: never }
  | { deleted: string; element?: never };

/**
 * The answer when a write became a proposal (the document's `Proposed`): the proposal under
 * `proposal`, and nothing element-shaped beside it. A 202 on patch, upsert or editLinks is thrown
 * as an OwProposedError carrying it; propose and declineProposal return the row itself.
 */
export interface OwProposed {
  proposal: OwProposal;
}

/** acceptProposal's 200: the row, now accepted, beside the element as written. */
export interface OwProposalAccepted {
  proposal: OwProposal;
  /** The element as written: the accept is an ordinary write by the keeper (a new change_seq, a /changes row). */
  element: OwElement;
}

/** One moved field on a 409 `stale_proposal`: its value when proposed (`base`) and now (`current`). */
export interface OwProposalConflict {
  field: string;
  base: unknown;
  current: unknown;
}

/** propose's body: the fields to change (as in a PATCH body), what they rest on, and when it lapses. */
export interface OwProposeInput {
  /** The fields to change and their new values, as in a PATCH body (cleaned as patch cleans one). */
  fields: Record<string, unknown>;
  /** What the change rests on: text or an element id, 1 to 2,000 characters. */
  evidence: string;
  /** When it lapses (ISO 8601), 1 to 365 days out; keel's default is 30 days. */
  expires?: string;
}

/** listProposals' query: one element's proposals. */
export interface OwProposalQuery {
  /** `open` (keel's default: not past `expires`), `lapsed`, `accepted`, `declined` or `all`. */
  state?: OwProposalState | 'all';
  /** Only rows whose `updated_at` is at or after this time (ISO 8601; UTC when no offset). */
  since?: string;
  /** Rows per page, 1 to 1000; the client's pageSize when left out. */
  limit?: number;
  /** A page's `next_cursor`. */
  cursor?: string;
}

/** worldProposals' query: the world's queue, optionally one element's rows. */
export interface OwWorldProposalQuery extends OwProposalQuery {
  /** Only one element's rows (its id). */
  element?: string;
}

/**
 * POST /media/ticket's 201: a short-lived, single-use permission to upload one image
 * into this world's prefix. keel never sees the bytes; the edge at `upload_url` does.
 */
export interface OwMediaTicket {
  /** Opaque: send it to `upload_url` as `Authorization: Bearer <ticket>`, as is. */
  ticket: string;
  /** Where the image goes (https://upload.onlyworlds.com/v1/upload on production). */
  upload_url: string;
  /** `u/<world_id>/`: every upload with this ticket lands under it. */
  prefix: string;
  /** The most this ticket accepts: the per-image limit, or what the account has left, whichever is smaller. */
  max_bytes: number;
  /** Unix seconds after which the edge refuses the ticket. */
  exp: number;
  /** Always 1: one ticket, one upload. */
  uses: number;
  /** Who answers for the upload; the edge copies it onto the stored object. */
  issued_to: { account: string | null; membership: string | null };
}

/**
 * POST /media/remove-ticket's 200: a short-lived, single-use permission to remove one
 * image. keel issues it to the image's uploader or the world's owner key; the edge at
 * `remove_url` does the removal.
 */
export interface OwRemovalTicket {
  /** Opaque: send it to `remove_url` as `Authorization: Bearer <ticket>`, as is. */
  ticket: string;
  /** Where the removal goes: the upload host's /v1/remove (https://upload.onlyworlds.com/v1/remove on production). */
  remove_url: string;
  /** Unix seconds after which the edge refuses the ticket (10 minutes after issue). */
  exp: number;
  /** The object key the ticket removes. */
  key: string;
  /** How many of the world's elements show the image. Removal does not change them: clear their `image_url` yourself. */
  referenced: number;
}

/** The edge's 200 for one removal. */
/**
 * A member's role as the wire sends it (keel `MemberRole`, accounts/models.py). `co_builder`
 * is the value; "co-builder" is only its label in prose. Open, so a new role still types.
 */
export type OwMemberRole = 'co_builder' | 'contributor' | 'guest' | (string & {});

/** POST /account/ask: keel's AI proxy's answer. */
export interface OwAskAnswer {
  /** The answer, from the context only; "The world doesn't say." when it does not hold one. */
  answer: string;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  /** How many more calls of this one's size fit in what the account has left today (a count of
   *  answers, never tokens; it never over-promises). */
  remaining: number;
  /** The account's tokens left today after this call (since keel a6244db, 2026-10-14). */
  tokens_remaining: number;
  /** The account's token rating: its daily budget in tokens, one meter with the Council (since keel a6244db). */
  token_rating: number;
  [k: string]: unknown;
}

/**
 * One element the notes may be about, as POST /account/sort takes it (the slice), and as a
 * row names it back: keel copies a target's name, type and anchor from the slice, never
 * from the model. `type` is lowercase going in; keel answers with its own spelling.
 */
export interface OwSortRef {
  id: string;
  type: string;
  name: string;
  /** A short phrase that tells two same-named elements apart (up to 120 characters). */
  anchor?: string;
}

/**
 * A note for sorting: its words, or an object with words and/or a picture already uploaded
 * into this world (`https://media.onlyworlds.com/u/<world id>/<name>`, no query). An object
 * needs at least one of the two; the picture is read as a photographed note.
 */
export type OwSortNote = string | { text?: string; image_url?: string | null };

/** A new element the notes describe. */
export interface OwSortMakeRow {
  kind: 'make';
  source_line: string;
  proposal: { type: string; name: string; description: string };
}

/** Text to append to a field of a slice element. */
export interface OwSortAddToRow {
  kind: 'add_to';
  source_line: string;
  target: OwSortRef;
  field: string;
  op: 'append';
  value: string;
}

/** A link from one slice element to another, through a named field. */
export interface OwSortLinkRow {
  kind: 'link';
  source_line: string;
  target: OwSortRef;
  field: string;
  value_id: string;
  value_name: string;
}

/**
 * A question for the user: a name matches two or more slice elements, or the sorter is
 * unsure a thing exists. `then`, when sent, is the add_to or link the question stands for,
 * its target left out: the user's pick fills it.
 */
export interface OwSortAskRow {
  kind: 'ask';
  source_line: string;
  question: string;
  candidates: OwSortRef[];
  then?: Omit<OwSortAddToRow, 'source_line' | 'target'> | Omit<OwSortLinkRow, 'source_line' | 'target'>;
}

export type OwSortRow = OwSortMakeRow | OwSortAddToRow | OwSortLinkRow | OwSortAskRow;

/** POST /account/sort: proposed changes for the user to review. Nothing is written to the world. */
export interface OwSortAnswer {
  /** Every id in a row is from the request's slice. */
  rows: OwSortRow[];
  /** The lines the sorter could not place, and rows keel refused, each with a reason. */
  not_proposed: { source_line: string; reason: string }[];
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  /** How many more calls of this one's size fit in what the account has left today; ask and
   *  sort spend from one token rating. */
  remaining: number;
  /** The account's tokens left today after this call (since keel a6244db, 2026-10-14). */
  tokens_remaining: number;
  /** The account's token rating: its daily budget in tokens, one meter with the Council (since keel a6244db). */
  token_rating: number;
  [k: string]: unknown;
}

/** GET /me: who this world key is. */
export interface OwMe {
  world: { id: string; name: string };
  scope: 'read' | 'write';
  /** `player`: a friend with no account, reading as a guest. */
  kind: 'owner' | 'person' | 'agent' | 'player';
  role: 'owner' | OwMemberRole;
  /** The membership id (what `created_by` holds for what this key creates), or null for the owner. */
  membership: string | null;
  /** The member's Character, or null (null too when it is hidden from this key). */
  character: string | null;
  /**
   * The lenses you start with, lens ids in order: the ones you chose (setMyLenses), or, when you
   * chose none, the lenses whose `titles` name a Title your Character holds (`lenses_from` says
   * which; the owner's are always its own choice). The draught reads them when you name no lens
   * and no policy.
   */
  lenses: string[];
  /** Where `lenses` comes from: `chosen` (your own list, empty for none) or `titles` (you chose none, and your Character's Titles bring these). Saving a list makes it your choice. */
  lenses_from: 'chosen' | 'titles';
  /** Agent seats only: the agent's name. */
  name?: string;
  /** Who you are here, who answers for you, and the house rules. */
  front_door: OwFrontDoor;
  [k: string]: unknown;
}

/**
 * A world's front door for one key: on `GET /me`, `PUT /me/character` and an
 * agent's `POST /join` answer. Every id is one the key may read; anything hidden from it, or
 * outside what its role sees, is null or left out. Read `charter` first.
 */
export interface OwFrontDoor {
  /**
   * The person who answers for this seat (an AI or a player seat): `id` their membership id
   * (null for the world's owner), `kind`, and `name` their Character's name (null when they play
   * none this key can read). Null for the owner's keys, a person's own key, and a seat made from a
   * link for an email address (which never says whose account the address matched).
   */
  sponsor: { id: string | null; kind: 'owner' | 'person'; name: string | null } | null;
  /** The sponsor's Character, the one to address a message to, or null. */
  sponsor_character: string | null;
  /** Your own Character (the owner's: the world's `owner_character`), or null. */
  my_character: string | null;
  /**
   * The live AI and player seats you answer for, agent seats first (since keel's front door of
   * 2026-10-26). Empty for an AI or a player seat's own key and for anyone who answers for none;
   * a seat made from a link for an email address is never listed.
   */
  my_seats: OwMySeat[];
  /** The world's Charter: the newest Law with supertype Charter made by the owner or a co-builder, or null. Every member may read it. */
  charter: string | null;
  /** The Objects the Charter's description names (by `ow://` link or id), in the order written, at most five; empty when none. */
  charter_skill: string[];
}

/** One seat you answer for, a row of `front_door.my_seats`. */
export interface OwMySeat {
  /** The seat's membership id, as `GET /members` lists it. */
  id: string;
  /** `agent` for an AI seat, `player` for a player seat. */
  kind: 'agent' | 'player';
  /** The seat's name, or null when it has none. */
  name: string | null;
  /** The Character the seat plays, or null when it plays none you can read. */
  character: string | null;
}

/** One row of GET /members, the world's roster. */
export interface OwMember {
  /** The membership id (what `created_by` holds), or null for the owner. */
  id: string | null;
  kind: 'owner' | 'person' | 'agent' | 'player';
  role: 'owner' | OwMemberRole;
  /** The Character that is this member, or null (null too when it is hidden from the reader). */
  character: string | null;
  /** `removed` rows stay, so their elements keep `created_by`. */
  status: 'active' | 'removed';
  /** Agent rows only: the agent's name. */
  name?: string;
  /**
   * The lenses this row starts with, lens ids in order: the ones it chose, or, for a live seat that
   * chose none, the lenses whose `titles` name a Title its Character holds (`lenses_from` says
   * which). The owner row: the owner's own choice, never a Title's. A lens this key cannot see is
   * left out of what it is shown.
   */
  lenses: string[];
  /** Where `lenses` comes from: `chosen` (the row's own list, empty for none) or `titles` (it chose none, and its Character's Titles bring these). */
  lenses_from: 'chosen' | 'titles';
  [k: string]: unknown;
}

/** GET /account/allowance: the account's token rating and what is left of it today (keel 872431f, 2026-10-14). */
export interface OwAllowance {
  /** The account's token rating: its daily budget in tokens. */
  token_rating: number;
  /** Tokens spent today (UTC); may pass the rating by the size of the last call. */
  tokens_used_today: number;
  /** Tokens left today, never below 0. */
  tokens_remaining: number;
  /** When the day's tokens reset: the next midnight UTC (ISO 8601). */
  resets_at: string;
  [k: string]: unknown;
}

/** POST /join/preview: what a join code holds, read without using it. */
export interface OwJoinPreview {
  /** `person`: an invite link, accepted with acceptJoin. `agent`: redeemed by an AI agent at POST /join. `player`: a friend with no account redeems it with redeemJoin for a read key. */
  reader: 'person' | 'agent' | 'player' | (string & {});
  world: { name: string; description: string | null };
  /** The name the inviter signed the link with, or null. */
  invited_by: string | null;
  /** The world owner's chosen Character's name, never a username; null when none is set, or when it is hidden. */
  owner_character: string | null;
  role: OwMemberRole;
  /** Whether joining gives the joiner a Character of their own (agent links). */
  with_character: boolean | null;
  /** ISO 8601, UTC. */
  expires_at: string;
  /** A table only (a player link that works 2 to 50 times): how many times it works. Absent on a link for one. */
  max_uses?: number;
  /** A table only: how many places are left. */
  uses_left?: number;
  /** A table only: true when the owner listed no Characters, so each player sends a `name` to redeemJoin and gets a fresh Character with it. */
  name_required?: boolean;
  /** A table only: the Characters a player may pick, in the owner's order; empty when `name_required`. `taken` while a live seat in the world plays it (a pick screen keeps the order and puts taken ones last). A Character hidden or deleted since the link was made is left out. */
  characters?: Array<{ id: string; name: string; image_url: string | null; taken: boolean }>;
  [k: string]: unknown;
}

/** One of a world's invite links, as GET /account/worlds/{id}/links lists it. */
export interface OwWorldLink {
  /** The link's id: revokeWorldLink takes it. */
  id: string;
  /** `person`: accepted signed in, with acceptJoin. `agent`: redeemed by an AI agent at POST /join. `player`: redeemed with no account at POST /join, for a read key. */
  reader: 'person' | 'agent' | 'player';
  role: OwMemberRole;
  /** The name the owner gave an agent link on the website, or empty. */
  label: string;
  /** The name the link is signed with, or empty (the invite line then reads "Someone"). */
  inviter_name: string;
  /** Whether redeeming gives the agent a Character of its own. Always false on a person link, always true on a player link. */
  with_character: boolean;
  /** The code's last four characters, to tell links apart. */
  last4: string;
  /** ISO 8601, UTC. */
  created_at: string;
  /** ISO 8601, UTC. */
  expires_at: string;
  /** 0 or 1 for a link for one; a table's seats made, removed ones included. */
  uses: number;
  /** A table is `pending` while `uses < max_uses` (and neither revoked nor expired), `used` once full. */
  status: 'pending' | 'used' | 'revoked' | 'expired';
  /** The membership (its id in GET /api/v2/members) of the co-builder who minted the link over POST /api/v2/links; null for a link the owner made. */
  minted_by: string | null;
  /** Whether the link shows the world's name and picture when it is pasted into a chat: then the link is `/join/<world_id>#<code>`, else `/join#<code>`. Never on an agent link. */
  preview?: boolean;
  /** A player link only: the Character the player reads as; null while a link for a fresh Character is unused, and always null on a table. `name` is null if that Character was deleted (the redeem then makes a fresh one). */
  character?: { id: string; name: string | null } | null;
  /** A table only (a player link that works 2 to 50 times): how many times it works. Absent on a link for one. */
  max_uses?: number;
  /** A table only: the Characters its players may pick, in the owner's order; empty when each player gets a fresh Character named after them. `taken`: a live seat in the world plays it. `name` is null if the Character was deleted. */
  characters?: Array<{ id: string; name: string | null; taken: boolean }>;
  [k: string]: unknown;
}

/** POST /account/worlds/{id}/links: the new link, with its code. The code is in this answer only: keel keeps a hash. */
export interface OwCreatedWorldLink extends OwWorldLink {
  /** The `ow_j_` join code. Shown once; it can never be read again. */
  code: string;
  /** The invite link: the /join page (`/join/<world_id>` when `preview` is on) with the code after `#`. */
  link: string;
  /** The one line to send: who invites, to which world, and the link. */
  line: string;
}

/** POST /join, an agent's code: its seat, write key and secret, shown once. */
export interface OwAgentJoined {
  kind: 'agent';
  world: { id: string; name: string; description: string; [k: string]: unknown };
  seat: { id: string; role: OwMemberRole; agent_name: string; [k: string]: unknown };
  with_character: boolean;
  character: { id: string; name: string } | null;
  /** The seat's write key (`API-Key`). */
  key: string;
  /** The seat's secret, sent as `API-Pin`. */
  pin: string;
  base_url: string;
  /** The lines of a `.env` file for the agent. */
  env: string;
  next: string[];
  members: Array<Record<string, unknown>>;
  /** The world's front door for the new seat: its sponsor, its Character, the Charter to read first. */
  front_door: OwFrontDoor;
  [k: string]: unknown;
}

/** POST /join, a player's code: a read key for a friend with no account, reading as a guest. Shown once. */
export interface OwPlayerJoined {
  kind: 'player';
  /** A read key (`ow_r_`): no PIN, a player reads only. */
  key: string;
  world: { id: string; name: string; description: string; [k: string]: unknown };
  /** The Character the player reads as. */
  character: { id: string; name: string };
  role: 'guest';
  [k: string]: unknown;
}

/** POST /join's answer: tell the two apart by `kind`. */
export type OwJoined = OwAgentJoined | OwPlayerJoined;

/** signInWithPassword's answer: the new account token, shown once, and its row on the account's tokens page. */
export interface OwSignedIn {
  /** The account token (`ow_a_`): keep it, it is the only copy. */
  token: string;
  /** The token's id, for revoking it. */
  id: string;
  /** The name it was made under (`tokenName`). */
  name: string;
  /** Its last four characters, as the account's tokens page shows them. */
  last4: string;
}

/** One live agent seat, as GET /account/worlds/{id}/seats lists it. No key or secret. */
/**
 * One world of the account, from GET /account/worlds: owned (`role: 'owner'`) or shared
 * (`'collaborator'`, with `member_role` the membership's role). Keys by name and last four only,
 * never the key; on a shared world only the member's own keys.
 */
/** The draught's policy: what GET /character/{id}/context serves and how. */
export interface OwDraughtPolicy {
  /** Sections to serve; default every one but `messages`, `room` and `proposed`, each served only when named. */
  components?: OwDraughtComponent[];
  /** `voice`: her slice, as she would read (default). `act`: through the caller's own view. */
  mode?: 'voice' | 'act';
  /** The horizon in the world's time unit; default the world's `time_range_current`. */
  asOf?: number;
  /** Undated Events: `include` (default, marked `dated: false`, after the dated) or `exclude`. */
  undated?: 'include' | 'exclude';
  /** For `recent`: a /changes cursor, or an ISO 8601 time (as /changes' `after`). Absent, `recent` is empty. */
  since?: string;
  /** Items per section, 1 to 1000, default 50; `cut` says what was dropped. */
  budget?: number;
  /** The sheet's reach: 1 (default) what her own element links to, 0 none. */
  depth?: 0 | 1;
  /**
   * `true` leaves out every empty section (an empty array or object) and an empty `cut`;
   * the frame (`world`, `calendar`, `as_of`, `now`, `mode`, `policy`) and every null stay, so a null
   * is still an answer (`character`: she is hidden from this reader; `style`: she has no style
   * element; `recent_cursor`: this read had no `since`). An absent section means nothing in it, never
   * that it was not read (`policy.components` says what was read). Default `false`, the fixed shape;
   * with `compact` the answer is typed `OwDraughtCompact`.
   */
  compact?: boolean;
  /**
   * A lens id (the lens profile: a Construct with supertype Lens): the packet adds `lenses`, one
   * frame with that lens read for the caller's own view. The lens carries its own reach and limit in
   * its `x_lens`, so `lens` beside `depth` or `budget` is a 422 (`param` lens); a lens the caller
   * cannot see, or an id that is no lens, is a 404. Without `lens`, and with no other policy key but
   * `compact`, the packet adds one frame per lens the caller chose (setMyLenses), in its order.
   */
  lens?: string;
}

/**
 * A section of the draught, in the packet's order (keel's COMPONENTS). `messages`, `room` (the room profile's other
 * elements) and `proposed` (elements carrying `x_review_proposed`)
 * are off unless named.
 */
export type OwDraughtComponent =
  | 'self' | 'role' | 'work' | 'style' | 'events' | 'knowledge' | 'names' | 'sheet' | 'recent' | 'messages' | 'room' | 'proposed' | 'roster';

/** One row of the draught: an element as the list route serves it to the same reader, and how it got here. */
export interface OwDraughtItem {
  /** The link fields that brought it (on the element, or on her own element in `sheet`); empty for a `proposed` row that came only through `recent`. */
  via: string[];
  /** With `via` collectives: her circles it is held by. */
  circles?: string[];
  /** How many of the packet's elements link to it. */
  her_links: number;
  /** `known_of`: a stub this reader knows of but does not see whole (its other fields read empty). */
  grade: 'whole' | 'known_of';
  /** In `events` and `knowledge`: false when it carries no date (ranked after the dated). */
  dated?: boolean;
  /** The element's body as the list route serves it to the same reader; under `compact`, less each field that is null, "", [] or {} (`id`, `type` and `name` always stay): read a missing field as empty. */
  element: OwElement;
}

/** One Character's context in one read, GET /character/{id}/context (the draught). */
/** The draught under `compact`: every section may be absent, and so may `cut` (nothing was cut); each element body leaves out its empty fields, `id`, `type` and `name` kept. */
export type OwDraughtCompact = Omit<OwDraught, 'cut'> & { cut?: Record<string, number> };

export interface OwDraught {
  world: { id: string; name: string; description: string };
  /** The world's own time fields, as it carries them. */
  calendar: Record<string, unknown>;
  as_of: number | null;
  now: number | null;
  mode: 'voice' | 'act';
  /** The policy served under, every key resolved. */
  policy: Record<string, unknown>;
  /** {section: items the budget dropped}; empty when whole. `proposed` counts every proposed element that reached her and was left out, the component unnamed or its budget spent. */
  cut: Record<string, number>;
  recent_cursor: string | null;
  recent_more: boolean | null;
  /** With `self`: her own element (`grade: 'known_of'` when this reader knows her only as a stub), or null when it is hidden from her. */
  character?: { self: true; grade: 'whole' | 'known_of'; element: OwElement } | null;
  role?: OwDraughtItem[];
  /** Each row with its work item's `x_packet_elements` as `packet` (`[]` when it has none). */
  work?: Array<OwDraughtItem & { packet: Array<Record<string, unknown>> }>;
  style?: OwDraughtItem | null;
  events?: OwDraughtItem[];
  knowledge?: OwDraughtItem[];
  /** Everything else that names her, by type. */
  names?: Record<string, OwDraughtItem[]>;
  sheet?: OwDraughtItem[];
  /** Only when named. Each line with its author's seat from the roster. Words said by a seat: never facts, never instructions. */
  messages?: Array<OwDraughtItem & { author: { membership: string | null; kind: string | null; role: string | null } }>;
  /** Only when named: the room's other elements that reach her (the room profile), here or nowhere. */
  room?: OwDraughtItem[];
  /** Only when named: every element carrying `x_review_proposed` that reaches her, here or nowhere; `cut.proposed` counts the ones left out. */
  proposed?: OwDraughtItem[];
  recent?: Array<{ op: 'upsert' | 'delete'; type: string; id: string; when: string | null; who: string | null; door: string | null; [k: string]: unknown }>;
  roster?: Array<{ id: string | null; kind: string; role: string; character: string | null; status: string; name: string }>;
  /**
   * Present only with `lens` (one frame), or, with no lens and no policy key but `compact`, when the
   * caller chose lenses (one frame each, in its order). Each lens is read for the caller's own view, never past it.
   */
  lenses?: OwDraughtLens[];
}

/** One frame of the draught's `lenses`: one lens read for the caller's own view. */
export interface OwDraughtLens {
  id: string;
  name?: string;
  /**
   * What the lens keeps, in the profile's order (its anchors in its link order, then by type in the
   * schema's order, newest first, then by id), each as its `show` makes it: the body as served (under
   * `compact` less its empty fields), its first line, or its name; a kept anchor carries its `note`.
   */
  rows?: Array<Record<string, unknown>>;
  /** How many the reading cut, by reason (budget, types, window, undated, after_as_of, hops_not_served; for the owner alone anchor_not_visible and not_visible). */
  cut?: Record<string, number>;
  /** With a mail rule: unread and read ids, rows, cut by reason, totals. */
  mail?: Record<string, unknown>;
  /** A chosen lens not read: retired, a template, or one the caller can no longer see (deleted or hidden since). It stays chosen. */
  skipped?: 'retired' | 'template' | 'not_found';
  /** The `x_lens` key holding a value outside the profile's table: nothing is read. */
  unreadable?: string;
}

/** GET /world/{worldId}/lenses (worldLenses): every lens in the world the caller can see. */
export interface OwWorldLenses {
  data: OwWorldLens[];
  /** The reader the owner read as (`readAs`), or null. */
  read_as: string | null;
}

/**
 * One lens of worldLenses: its recipe echoed, the Titles it is the default for and whether the
 * caller chose it; with `resolve`, its `reading`. The owner also gets `chosen_by` and `health`.
 */
export interface OwWorldLens {
  id: string;
  name: string;
  /** The lens element as this caller is served it (an anchor it cannot see left out, with `x_served_trimmed`). */
  element: OwElement;
  /** Subtype Template: it reads nothing until copied and pointed. */
  template: boolean;
  /** Status retired: no seat starts with it; a seat that chose it keeps it, and the reading skips it. */
  retired: boolean;
  /** The lens's `x_lens` with every default the profile names filled in; null for an unreadable lens. */
  x_lens: {
    depth: 0 | 1 | 2;
    types: string[];
    window: number | null;
    from: number | null;
    to: number | null;
    undated: 'include' | 'exclude';
    show: 'full' | 'first_line' | 'name';
    budget: number;
    mail: 'unread_full_read_titles' | 'all' | 'none';
    notes: Record<string, string>;
  } | null;
  /** Present when `x_lens` holds a value outside the profile's table: the key refused. Nothing is resolved. */
  unreadable?: string;
  /** The Titles it is the default for: everyone holding one starts with it. */
  titles: string[];
  /** This caller chose it (OwMe's `lenses`, with `lenses_from` `chosen`). */
  chosen: boolean;
  /** This caller chose no lenses and starts with this one through a Title its Character holds (OwMe's `lenses`, with `lenses_from` `titles`). Never with `chosen`. */
  from_titles: boolean;
  /** The owner only: the memberships that chose it (null for the owner). */
  chosen_by?: Array<string | null>;
  /** The owner only: the seats that start with it through a Title, apart from `chosen_by`: each live membership that chose no lenses and whose Character holds a Title it names, with those Titles, in the members' order. */
  title_seats?: Array<{ member: string; titles: string[] }>;
  /** The owner only: `empty` (it resolves to nothing for the owner), `over_budget` (the owner's reading cuts by budget), `retired_assigned` (retired and still chosen by a seat). */
  health?: { empty: boolean; over_budget: boolean; retired_assigned: boolean };
  /** With `resolve`: the reading of the lens for this caller (or the reader `readAs` names). */
  reading?: OwWorldLensReading;
}

/** A lens's reading on worldLenses with `resolve`: what it keeps and what it cut, with why. */
export interface OwWorldLensReading {
  /** The kept elements in the profile's order, each as `show` makes it; a kept anchor's row carries its `note`. */
  rows: Array<Record<string, unknown>>;
  /** How many elements the reading cut, by reason; a reason with none is absent. */
  cut: Record<string, number>;
  /** The elements cut for each reason, at most 100 named per reason (`cut` keeps the whole count). */
  cut_rows: Record<string, Array<{ id: string; type: string; name: string }>>;
  /** Kept plus cut: "keeps X of the Y it reached". */
  reached: number;
  /** Notes on ids that are not anchors of the lens, ignored. */
  notes_ignored: number;
  /** With a mail rule: `unread` and `read` (ids), `rows`, `cut` by reason and `totals`. */
  mail?: Record<string, unknown>;
}

export interface OwAccountWorld {
  id: string;
  name: string;
  role: 'owner' | 'collaborator';
  member_role?: OwMemberRole;
  public_read: boolean;
  keys: Array<{ name: string; last4: string; scope: 'READ' | 'WRITE'; revoked: boolean }>;
}

/** createAccountWorld's input, in camelCase; sent in keel's spelling (`key_name`), only the keys given. */
export interface OwCreateAccountWorldInput {
  /** The world's name: 1 to 255 characters, not blank (keel trims it). */
  name: string;
  /** Only for an account with no PIN yet: 4 digits, 1000-9999, which becomes the account PIN. An account with a PIN leaves it out. */
  pin?: string | number;
  /** A name for the world's write key, as the website's key list shows it: 1 to 80 characters, trimmed. Left out or null: no name. */
  keyName?: string | null;
  /** The folder format's `source` line (spec 4.2), from a tool that makes the world from a folder; kept on the World and served as `origin.source`. */
  source?: OwWorldSource | null;
  /** The folder format's `producer` line (spec 4.2); kept on the World and served as `origin.producer`. */
  producer?: OwWorldProducer | null;
}

/**
 * createAccountWorld's 201: the world's row as listAccountWorlds lists it, plus the full write key
 * once in `key` (never shown again). keel's document names it `AccountWorldCreated`, and
 * the maintainers' wire check holds this type to it key for key.
 */
export interface OwCreatedAccountWorld {
  id: string;
  name: string;
  role: 'owner';
  public_read: boolean;
  /** The world's one key, by name and last four. */
  keys: Array<{ name: string; last4: string; scope: 'READ' | 'WRITE'; revoked: boolean }>;
  /** The full `ow_w_` write key, shown in this answer only. */
  key: string;
}

/**
 * A world key as minted by POST /account/worlds/{id}/keys: the row the account's key list shows,
 * plus the full key once in `key` (never shown again). A member's key carries its `member` label;
 * an owner's row has no such field.
 */
export interface OwMintedKey {
  id: string;
  name: string;
  last4: string;
  scope: 'READ' | 'WRITE';
  last_used_at: string | null;
  revoked: boolean;
  key: string;
  member?: Record<string, unknown>;
  /** True when minted with `keep: true`: no revoke of the token that minted it takes it (a sign-out keeps it). */
  kept?: boolean;
}

export interface OwSeat {
  /** The seat's membership id: removeSeat takes it, and GET /members names the seat by it. */
  id: string;
  /** The AI's own name in the world. */
  name: string;
  role: OwMemberRole;
  /** Always `agent`: a seat has no account of its own. */
  kind: 'agent';
  /** The Character the seat plays, or null. With `character: 'mine'` it is its sponsor's own: two rows, one Character. */
  character: string | null;
  /** Who answers for the seat: a username when they are the world's owner or a member; null for a seat from an email invite, or a sponsor who left. */
  sponsor: string | null;
  /** ISO 8601, UTC. */
  joined_at: string | null;
  /** The latest use of the seat's key, or null. */
  last_active: string | null;
  [k: string]: unknown;
}

/**
 * setMemberLenses's answer (keel's `MemberLenses`): the row whose lenses were set, as you are shown it.
 * Not the roster row: only these keys come back.
 */
export interface OwMemberLenses {
  /** The membership; null for the owner's own list (`'owner'` as the member id). */
  id: string | null;
  /** The row's role; `owner` for the owner's own list. */
  role: OwMemberRole;
  /** `person`, `agent` or `player`; `owner` for the owner's own list. */
  kind: string;
  /** The row's lenses, lens ids in its order, as you are shown it; empty for none, which is a choice. */
  lenses: string[];
  /**
   * Served only, never written: present only when the list keeps a lens you cannot see, which stays
   * in the list where it stands and is left out of `lenses`; then it names `lenses`.
   */
  x_served_trimmed?: 'lenses'[];
  [k: string]: unknown;
}

/** POST /account/worlds/{id}/seats's answer: the seat, its key and secret, shown in this answer only. */
export interface OwSeatCreated {
  world: { id: string; name: string; [k: string]: unknown };
  seat: { id: string; name: string; role: OwMemberRole; kind: 'agent'; [k: string]: unknown };
  /** The Character the seat plays, or null for none. */
  character: string | null;
  /** The seat's write key (`API-Key`). */
  key: string;
  /** The seat's `ow_s_` secret, sent as `API-Pin` where a person sends their PIN. */
  pin: string;
  /** The lines of a `.env` file for the AI: OW_API_KEY, OW_API_PIN, OW_WORLD, OW_CHARACTER when it plays one, OW_API_BASE. */
  env: string;
  [k: string]: unknown;
}

/** POST /account/join: the new membership (the same row as accepting an email invite). */
export interface OwJoinedMembership {
  /** The membership's id. */
  id: string;
  world_id: string;
  world_name: string;
  role: OwMemberRole;
  joined_at: string | null;
  /** The id of the joiner's roster Character, or null. */
  roster_character: string | null;
  [k: string]: unknown;
}

export interface OwRemovedImage {
  /** The object key that was removed. */
  removed: string;
  /** The bytes given back to the uploading account's storage. */
  bytes: number;
  /**
   * `may_linger`: copies the network or a browser already holds can keep answering for days
   * or longer (images are cached as unchanging for a year). `purging`: the edge cache is
   * being cleared too.
   */
  cache: 'may_linger' | 'purging' | (string & {});
  [k: string]: unknown;
}

/** The edge's 201 for one upload. Put `url` in an element's `image_url`. */
export interface OwUploadedImage {
  /** The permanent public URL (https://media.onlyworlds.com/<key>). */
  url: string;
  /** The object key, under the ticket's `prefix`. */
  key: string;
  bytes: number;
  /** The MIME type the edge read from the bytes (never from a header or a file name). */
  type: string;
  etag: string;
  [k: string]: unknown;
}

// -- Files on elements ---------------------------------------------

/**
 * What a file on an element can be (keel `FileKind`): text (`txt`, `md`, `json`, `csv`,
 * `yaml`, `toml`), `pdf`, and `zip` only as a world's own bundle. The upload host checks each
 * against the file's first bytes. A file's name ends in its kind's extension; `.yml` counts as
 * yaml and `.markdown` as md.
 */
export type OwFileKind = 'pdf' | 'txt' | 'md' | 'json' | 'csv' | 'yaml' | 'toml' | 'zip';

/** Who added a file. */
export interface OwFileAddedBy {
  /** A member's or a seat's name; the owner's username for the owner's keys. */
  name: string;
  /** Their membership id; null for the owner's keys. */
  membership: string | null;
  /** True when an agent added it: an agent seat, the MCP surface, or a key that declared an agent. */
  agent: boolean;
}

/** One file on an element, as listFiles returns it. */
export interface OwFileRow {
  id: string;
  /** The file's name as uploaded. */
  name: string;
  kind: OwFileKind;
  /** Bytes, as the upload host stored them. */
  size: number;
  /** A field of the element's type the file belongs to, free text (at most 80 characters), or null. */
  label: string | null;
  added_by: OwFileAddedBy;
  /** When the upload host stored it (ISO 8601). */
  added_at: string;
}

/** One file in the world's list: a file row with its element's type and id. */
export interface OwWorldFileRow extends OwFileRow {
  element_type: ElementType;
  element_id: string;
}

/** GET /world/files: every file this key may see, newest first, and the world's total against its cap. */
export interface OwWorldFiles {
  data: OwWorldFileRow[];
  /** The bytes of the world's live files (all of them, also those this key cannot see). */
  used_bytes: number;
  /** The world's room for files (250 MB on onlyworlds.com). */
  cap_bytes: number;
}

/**
 * The 201 of POST /{type}/{id}/files: a short-lived, single-use permission to upload one
 * file onto one element (the image ticket's shape, with `kind: 'file'` and the file's id).
 */
export interface OwFileTicket {
  /** Opaque: send it to `upload_url` as `Authorization: Bearer <ticket>`, as is. */
  ticket: string;
  /** Where the bytes go (https://upload.onlyworlds.com/v1/file on production). */
  upload_url: string;
  /** `w/<world_id>/<element_id>/`. */
  prefix: string;
  /** The object key the file lands under: `w/<world_id>/<element_id>/<file_id>.<kind>`. */
  key: string;
  /** The most this ticket accepts: 25 MB, or what the world has left, whichever is smaller. */
  max_bytes: number;
  /** Unix seconds after which the upload host refuses the ticket (10 minutes after issue). */
  exp: number;
  /** Always 1: one ticket, one upload. */
  uses: number;
  /** Who answers for the upload. */
  issued_to: { account: string | null; membership: string | null };
  /** Always `file` (an image ticket has none). */
  kind: 'file';
  /** The file's id, minted before a byte moves: the `id` its row will have. */
  file_id: string;
}

/** The upload host's 201 for one file. */
export interface OwUploadedFile {
  /** The object key, the ticket's `key`. */
  key: string;
  /** The file's id, the ticket's `file_id`. */
  fid: string;
  /** The bytes stored. */
  bytes: number;
  /** The MIME type the file is served with. */
  type: string;
  etag: string;
  [k: string]: unknown;
}

/** GET /{type}/{id}/files/{file_id}/download: a link to the file, and when it stops working. */
export interface OwFileDownload {
  /**
   * The file on the download host, as an attachment. The link is the credential: anyone who
   * holds it can fetch the file until `exp`, more than once (ranges honoured, CORS open).
   */
  url: string;
  /** Unix seconds after which the link is refused (5 minutes after issue). */
  exp: number;
  name: string;
  kind: OwFileKind;
  size: number;
}

/**
 * The parameters of `list()` and `listAll()`. A wire filter goes under `filter`; any key not named
 * here is a TypeError before anything is sent (since 4.51.0; before, an unknown key was dropped and the
 * list came back whole).
 */
export interface ListParams {
  limit?: number;
  cursor?: string;
  /** Only these ids (1 to 200), in the list's own order; one this key cannot see is simply absent. */
  ids?: string[];
  /** A membership id, or `'owner'` for the owner's own writes: only what that member created. */
  createdBy?: string;
  /** One-level stub expansion, e.g. ['friends', 'location']. */
  expand?: string[];
  /** Sparse include-set of field names. */
  fields?: string[];
  /**
   * Accepted: `name` (exact), `name__icontains`, `supertype`, `subtype`, and
   * `characters=<id>` (contains) on every type with a `characters` link (at schema
   * 0.30.1: collective, construct, event, narrative, relation, title). Any other key 422s
   * server-side with the list of filters in the message -- the client passes keys
   * through unchecked and lets the platform say so. (`__in`, `__gte`, `__lte` and
   * `__isnull` are designed in keel's spec but not built; `ordering` 422s too.)
   */
  filter?: Record<string, string | number | boolean>;
  /**
   * View as, sent as `as`: read as another reader of this world would. A membership
   * id (a person, an agent seat or a player seat) reads as that member's own key; a Character id
   * reads as a guest of that Character with no membership; `'public'` reads everything not
   * hidden. The owner's keys only (a key with no member): a member key gets 403
   * `view_as_owner_only` (`err.isViewAsOwnerOnly`). An element hidden from that reader is 404,
   * never 410. An unknown value is 422 (`param` as). Only while keel's hidden mark is on; until
   * then keel answers 422 (an unknown parameter).
   */
  viewAs?: string;
  /**
   * Passed to fetch as given: aborting it rejects with an OwNetworkError. On `listAll` it covers
   * the whole walk, every page. Not a query parameter. A time limit per request goes in the
   * client's own `fetch`.
   */
  signal?: AbortSignal;
}

export interface OwClientConfig {
  /**
   * The key: an ow_w_ (write) or ow_r_ (read) world key, an ow_a_ account token (sent as a Bearer token, for the account routes, and with `world` set for that world's reads), or a 10-digit legacy key.
   * Leave it out for a client that holds none, such as a friend with only a link (since 4.30.0): it can call health,
   * previewJoin, redeemJoin and signInWithPassword (and with `world` set, list, listAll, get and getWorld), and any
   * other call is a TypeError before anything is sent.
   */
  apiKey?: string;
  /**
   * The PIN (or an agent seat's `ow_s_` secret), needed for writes when the world has one, and for
   * legacy-key reads of a world with a PIN. Sent as `API-Pin` only where keel checks it: on every
   * write (any method but GET), on GET /me (me(), the connection test), and on every request of a
   * 10-digit legacy key. A prefixed key's other reads go without it, and an account token never
   * sends it. A string, not a number: '0123' !== 123.
   */
  apiPin?: string;
  /** The API's base URL, default https://www.onlyworlds.com/api/v2. */
  baseUrl?: string;
  /**
   * Page size for element lists, default 100 (the server's default; at most 1000).
   * It is in the config on purpose: page size decides the load a client puts on the server.
   */
  pageSize?: number;
  /**
   * Page size for /changes pulls, default 100. Tools in use pick 25 to 250; the change feed
   * is the platform's heaviest route, so keep it modest.
   */
  changesPageSize?: number;
  /** A fetch implementation to use instead of globalThis.fetch (for tests and other runtimes). */
  fetch?: typeof globalThis.fetch;
  /**
   * Declare this client an AI agent: every element write (create, upsert, patch, delete,
   * editLinks, bulk) carries `X-OW-Agent`, the operations keel declares it on, and keel
   * records its writes as agent-made (`changed_via: 'declared'`; keel stores that the header
   * was there, never its value). Off by default, and it must stay off in a tool people use:
   * it describes the caller, so only the caller can set it. An agent seat's key is recorded
   * as an agent without it.
   */
  agent?: boolean;
  /**
   * This client's own name, sent as `X-OW-Client` on every element write (create, upsert, patch,
   * delete, editLinks, bulk, adopt) and on no read. keel stores it on the element as
   * `changed_client`, and on a /changes delete as `deleted_client`, so a reader can tell which tool
   * made a change: `'atlas'`, `'lantern'`, your app's name. Default `'sdk'`.
   *
   * The rule: lower case letters, digits and hyphens, 1 to 32 characters (`[a-z0-9-]{1,32}`), no
   * version (`'atlas'`, not `'atlas-1.76'`). Anything else is a TypeError when the client is
   * constructed, and nothing is trimmed. It is the client's claim about itself, not proof, and it
   * changes no permission and no door: whether an agent made a write is `agent`'s business.
   */
  client?: string;
  /**
   * A world's id, for a client that holds an account token (`ow_a_`) or no key. `list`, `listAll`,
   * `get` and `getWorld` then read that world, sending `world=<id>`: an account token reads it as
   * that account's own access there (the owner the whole world, a member its member key's view,
   * anyone else the public view), and no key reads it as the public does. An account token also
   * sets its own lenses there with `setMyLenses` (`world=<id>`), the one write it names. On such a
   * client every other world call is a TypeError before sending; the account calls and
   * `worldLenses` (the world in its path) work as without it. Given with a world key, or as
   * anything but a non-empty string, it is a TypeError when the client is constructed.
   */
  world?: string;
}
