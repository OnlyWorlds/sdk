/**
 * keel v2 engine absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
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
  OwClientConfig, OwElement, OwLinkEdit, OwPage, OwWorldMeta,
} from './types';
import { OwNetworkError, errorFromResponse, parseErrorEnvelope } from './errors';
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

  constructor(config: OwClientConfig) {
    if (!config.apiKey) throw new Error('OwV2Client: apiKey is required');
    this.apiKey = config.apiKey;
    this.apiPin = config.apiPin || undefined;
    this.keyKind = detectKeyKind(config.apiKey);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    this.changesPageSize = config.changesPageSize ?? DEFAULT_CHANGES_PAGE_SIZE;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
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
   * POST /{type}/ -- create. Mints an RFC-4122 UUID for element.id when the
   * caller omits one (design ruling D29d) so a retry carrying the same
   * Idempotency-Key is structurally safe. Callers MAY still supply their own id.
   */
  async create(type: ElementType | string, element: OwElement | Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<OwElement> {
    const body = sanitizePayload(element);
    if (body.id === undefined || body.id === null || body.id === '') {
      body.id = mintUuid();
    }
    return this.request('POST', `/${type}/`, {
      body,
      idempotencyKey: opts.idempotencyKey,
    }) as Promise<OwElement>;
  }

  /** PUT /{type}/{id}/ -- upsert-by-client-id. The local-first write primitive. */
  async upsert(type: ElementType | string, id: string, element: OwElement | Record<string, unknown>): Promise<OwElement> {
    return this.request('PUT', `/${type}/${id}/`, { body: sanitizePayload(element) }) as Promise<OwElement>;
  }

  /**
   * PATCH /{type}/{id}/ -- partial update. DESTRUCTIVE on sent fields: arrays
   * replace wholesale, omitted fields stay untouched. For link arrays prefer
   * editLinks() -- atomic server-side merge, no read-before-write.
   */
  async patch(type: ElementType | string, id: string, partial: Record<string, unknown>): Promise<OwElement> {
    return this.request('PATCH', `/${type}/${id}/`, { body: sanitizePayload(partial) }) as Promise<OwElement>;
  }

  /**
   * DELETE /{type}/{id}/ -- idempotent (204 on absent). Server writes a
   * tombstone AND scrubs the id from every other element's links in the same
   * transaction -- no client-side unlink pass needed, ever.
   */
  async delete(type: ElementType | string, id: string): Promise<void> {
    await this.request('DELETE', `/${type}/${id}/`, { allowEmpty: true });
  }

  /**
   * POST /{type}/{id}/links/{field} with {add, remove} -- atomic link merge.
   * Dedupes, tolerates already-present/already-absent ids. Returns the FULL
   * updated element (fixture P5). Use this for all relationship editing; it
   * retires the read-merge-PATCH dance.
   */
  async editLinks(type: ElementType | string, id: string, field: string, edit: OwLinkEdit): Promise<OwElement> {
    return this.request('POST', `/${type}/${id}/links/${field}`, { body: edit }) as Promise<OwElement>;
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
   */
  async bulk(items: OwBulkItem[], opts: { atomic?: boolean; idempotencyKey?: string } = {}): Promise<OwBulkResponse> {
    const body = {
      items: items.map((it) => ({ type: it.type, element: sanitizePayload(it.element) })),
      atomic: opts.atomic ?? false,
    };
    return this.request('POST', '/bulk/', {
      body,
      idempotencyKey: opts.idempotencyKey,
      replayAware: true,
    }) as Promise<OwBulkResponse>;
  }

  // -- Changes feed --------------------------------------------------------

  /**
   * GET /changes -- one page of the world's ordered change feed.
   * Cursor is OPAQUE and never expires: persist verbatim, never parse.
   * Zero/absent cursor = full export (byte-aligned with the Folder Format).
   * Rewind rule: if your persisted position is ahead of page.head, the server
   * was restored -- re-baseline from cursor zero; do not assume caught-up.
   * Citizenship: heaviest route on the platform; default page size is polite.
   */
  async changes(opts: { since?: string; limit?: number } = {}): Promise<OwChangesPage> {
    const query = buildQuery({ since: opts.since, limit: opts.limit ?? this.changesPageSize });
    return this.request('GET', '/changes/', { query }) as Promise<OwChangesPage>;
  }

  /**
   * Walk the feed from `since` (or from zero = full export) to the current
   * tail, yielding ops in order. Returns the final cursor via the generator's
   * return value; persist it for the next incremental pull.
   */
  async *changesAll(since?: string): AsyncGenerator<OwChange, { cursor: string; head: number }> {
    let cursor = since;
    let page: OwChangesPage;
    do {
      page = await this.changes({ since: cursor });
      for (const op of page.changes) yield op;
      cursor = page.cursor;
    } while (page.has_more);
    return { cursor: page.cursor, head: page.head };
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
    } = {},
  ): Promise<T> {
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
 * (Temper 2026-07-18, reaffirmed §5-A 2026-07-23).
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

/** Case-insensitive read of the (lowercase-on-wire) Idempotent-Replay header. */
function readReplayHeader(headers: Headers): boolean {
  const v = headers.get('Idempotent-Replay');
  return v != null && v.toLowerCase() === 'true';
}

/** Mint an RFC-4122 v4 UUID; native crypto.randomUUID with a getRandomValues fallback. */
function mintUuid(): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
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
