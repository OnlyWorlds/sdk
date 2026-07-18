/**
 * keel v2 engine absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
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

export interface ListParams {
  limit?: number;
  cursor?: string;
  /** One-level stub expansion, e.g. ['friends', 'location']. */
  expand?: string[];
  /** Sparse include-set of field names. */
  fields?: string[];
  /**
   * Blessed Django-style filters: __icontains, __in, __gte, __lte, __isnull,
   * supertype/subtype equality. Unknown params 422 loudly server-side -- the
   * client passes them through and lets the platform name the typo.
   */
  filter?: Record<string, string | number | boolean>;
}

export interface OwClientConfig {
  /** ow_w_ / ow_r_ / ow_a_ prefixed key, or grandfathered 10-digit legacy key. */
  apiKey: string;
  /**
   * Optional. Required for writes when the world has a PIN, and for legacy-key
   * reads of private worlds. Prefixed keys read PIN-less. String, not number --
   * '0123' !== 123.
   */
  apiPin?: string;
  /** Default: https://www.onlyworlds.com/api/v2 */
  baseUrl?: string;
  /**
   * Page size for element lists. Default 100 (server default; max 1000).
   * Deliberately visible in config: page size is a citizenship property.
   */
  pageSize?: number;
  /**
   * Page size for /changes pulls. Default 100. Live precedents: Obsidian 100,
   * Atlas 250, MCP 25. /changes is the platform's heaviest route -- be polite.
   */
  changesPageSize?: number;
  /** Injectable for tests / fake-keel harnesses. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}
