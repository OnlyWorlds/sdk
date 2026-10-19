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
   * as a guest's is (keel #298, D103): set by the owner on the world page; read-only on the wire.
   * With it on, an agent naming another narrator is a 422 (`param: narrator`), and a seat with no
   * Character a 403 `guest_not_supported`.
   */
  agent_narrator_rule?: boolean;
  /** The owner's "this Character is me": a Character id in this world, or null (null too, to a reader it is hidden from: keel #421). */
  owner_character?: string | null;
  created_at?: string | null;
  /** Moves when the world's own fields change, not on element writes. */
  updated_at?: string | null;
  [field: string]: unknown;
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
  /** The change's place in the world's feed. */
  change_seq: number;
  [k: string]: unknown;
}

/** A /changes item for an element deleted. */
export interface OwChangeDelete {
  op: 'delete'; id: string; type: string; deleted_at: string;
  /** The change's place in the world's feed. */
  change_seq: number;
  /** The membership whose write deleted it; null for the world's owner, and for deletes before writes recorded it (keel #299). */
  deleted_by?: string | null;
  /** The door the delete came through (see {@link OwWriteDoor}); null for deletes before writes recorded it. */
  deleted_via?: OwWriteDoor | null;
  /**
   * Why the element left this reader's view (keel #421): `deleted` (it is gone; a GET answers 410),
   * `hidden` (the world's owner or a co-builder hid it from this reader; it still exists, a GET answers
   * 404, and an unhide brings it back by a 409 `resync_required`), or `out_of_view` (declared, sent by
   * nothing yet). Remove the element from the local copy in every case.
   */
  reason?: OwDeleteReason;
  [k: string]: unknown;
}

/** Why a /changes delete row says the element left the reader's view (keel #421). */
export type OwDeleteReason = 'deleted' | 'hidden' | 'out_of_view';

/**
 * The door a write came through, as keel records it on every element (`changed_via`) and on a
 * delete (`deleted_via`) since keel #299: `seat` (an agent seat), `mcp` (the MCP server),
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
   * A guest's or a contributor's view epoch (an integer; a contributor's since keel #421), null for
   * every other key. It moves when what the key may see changes, even with `head` unchanged (a
   * Character given or taken, an element unhidden, a role):
   * walk again on either move. Compare it, never read it out of the cursor (keel, 2026-10-12).
   */
  epoch: number | null;
}

export interface OwBulkItem {
  type: ElementType | string;
  element: OwElement | Record<string, unknown>;
}

/**
 * One slot of a /bulk response. WIRE-CORRECTED (fixtures P2a/P2c): `status` is
 * the NUMERIC HTTP status of that slot (201/400/...), success slots echo
 * created_at/updated_at, error slots carry an OwErrorBody under `error`.
 * A contributor's write on someone else's element fails in its slot as
 * `{status: 403, error: {code: 'not_author'}}` (keel D72), never as a thrown error.
 * After an `atomic: true` request with `errors` true NOTHING was written, yet the slots of
 * the items that would have succeeded still say 201 (keel's "counterfactual 201s"): do not
 * record their ids as created.
 */
export interface OwBulkItemResult {
  status: number;
  id?: string;
  created_at?: string;
  updated_at?: string;
  error?: OwErrorBody;
}

/** The wire error envelope carried in error slots and thrown errors. */
export interface OwErrorBody {
  type?: string;
  code?: string;
  message?: string;
  param?: string | null;
  doc_url?: string;
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

/** POST /account/ask: keel's AI proxy's answer (keel #159). */
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
  /** `player`: a friend with no account, reading as a guest (keel #353). */
  kind: 'owner' | 'person' | 'agent' | 'player';
  role: 'owner' | OwMemberRole;
  /** The membership id (what `created_by` holds for what this key creates), or null for the owner. */
  membership: string | null;
  /** The member's Character, or null (null too when it is hidden from this key: keel #421). */
  character: string | null;
  /** Agent seats only: the agent's name. */
  name?: string;
  [k: string]: unknown;
}

/** One row of GET /members, the world's roster. */
export interface OwMember {
  /** The membership id (what `created_by` holds), or null for the owner. */
  id: string | null;
  kind: 'owner' | 'person' | 'agent' | 'player';
  role: 'owner' | OwMemberRole;
  /** The Character that is this member, or null (null too when it is hidden from the reader: keel #421). */
  character: string | null;
  /** `removed` rows stay, so their elements keep `created_by`. */
  status: 'active' | 'removed';
  /** Agent rows only: the agent's name. */
  name?: string;
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

/** POST /join/preview: what a join code holds, read without using it (keel #212). */
export interface OwJoinPreview {
  /** `person`: an invite link, accepted with acceptJoin. `agent`: redeemed by an AI agent at POST /join. `player`: a friend with no account redeems it with redeemJoin for a read key (keel #353). */
  reader: 'person' | 'agent' | 'player' | (string & {});
  world: { name: string; description: string | null };
  /** The name the inviter signed the link with, or null. */
  invited_by: string | null;
  /** The world owner's chosen Character's name, never a username; null when none is set, or when it is hidden (keel #421). */
  owner_character: string | null;
  role: OwMemberRole;
  /** Whether joining gives the joiner a Character of their own (agent links). */
  with_character: boolean | null;
  /** ISO 8601, UTC. */
  expires_at: string;
  [k: string]: unknown;
}

/** One of a world's invite links, as GET /account/worlds/{id}/links lists it (keel C1, 48c10d4). */
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
  /** 0 or 1: a link works once. */
  uses: number;
  status: 'pending' | 'used' | 'revoked' | 'expired';
  /** Whether the link shows the world's name and picture when it is pasted into a chat (keel #422): then the link is `/join/<world_id>#<code>`, else `/join#<code>`. Never on an agent link. */
  preview?: boolean;
  /** A player link only: the Character the player reads as; null while a link for a fresh Character is unused. `name` is null if that Character was deleted (the redeem then makes a fresh one). */
  character?: { id: string; name: string | null } | null;
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

/** POST /join, an agent's code: its seat, write key and secret, shown once (keel #212; `kind` since #353). */
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
  [k: string]: unknown;
}

/** POST /join, a player's code: a read key for a friend with no account, reading as a guest (keel #353). Shown once. */
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

/** One live agent seat, as GET /account/worlds/{id}/seats lists it (keel #355, D106). No key or secret. */
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

// -- Files on elements (keel #393) ---------------------------------------------

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

export interface ListParams {
  limit?: number;
  cursor?: string;
  /** One-level stub expansion, e.g. ['friends', 'location']. */
  expand?: string[];
  /** Sparse include-set of field names. */
  fields?: string[];
  /**
   * Accepted: `name` (exact), `name__icontains`, `supertype`, `subtype`, and
   * `characters=<id>` (contains) on every type with a `characters` link (at schema
   * 0.30.1: collective, construct, event, narrative, relation, title; keel D76d). Any other key 422s
   * server-side with the list of filters in the message -- the client passes keys
   * through unchecked and lets the platform say so. (`__in`, `__gte`, `__lte` and
   * `__isnull` are designed in keel's spec but not built; `ordering` 422s too.)
   */
  filter?: Record<string, string | number | boolean>;
  /**
   * View as (keel #421), sent as `as`: read as another reader of this world would. A membership
   * id (a person, an agent seat or a player seat) reads as that member's own key; a Character id
   * reads as a guest of that Character with no membership; `'public'` reads everything not
   * hidden. The owner's keys only (a key with no member): a member key gets 403
   * `view_as_owner_only` (`err.isViewAsOwnerOnly`). An element hidden from that reader is 404,
   * never 410. An unknown value is 422 (`param` as). Only while keel's hidden mark is on; until
   * then keel answers 422 (an unknown parameter).
   */
  viewAs?: string;
}

export interface OwClientConfig {
  /**
   * The key: an ow_w_ (write) or ow_r_ (read) world key, an ow_a_ account token (sent as a Bearer token, for the account routes), or a 10-digit legacy key.
   * Leave it out for a client that holds none, such as a friend with only a link (since 4.30.0): it can call health,
   * previewJoin, redeemJoin and signInWithPassword, and any other call is a TypeError before anything is sent.
   */
  apiKey?: string;
  /**
   * The PIN, needed for writes when the world has one, and for legacy-key reads of private worlds.
   * Prefixed keys read without a PIN. A string, not a number: '0123' !== 123.
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
}
