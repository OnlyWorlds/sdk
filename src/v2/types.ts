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

export interface OwWorldMeta {
  id: string;
  name: string;
  updated_at?: string;
  public_read?: boolean;
  [field: string]: unknown;
}

/** List envelope: cursor-paginated. */
export interface OwPage<T = OwElement> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** /changes feed -- discriminated union on `op`. Apply in order -> convergence. */
export type OwChange =
  | { op: 'upsert'; id: string; type: string; element: OwElement; updated_at: string; [k: string]: unknown }
  | { op: 'delete'; id: string; type: string; deleted_at: string; [k: string]: unknown };

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
}

export interface OwClientConfig {
  /** The key: an ow_w_ (write) or ow_r_ (read) world key, an ow_a_ account token (sent as a Bearer token, for the account routes), or a 10-digit legacy key. */
  apiKey: string;
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
}
