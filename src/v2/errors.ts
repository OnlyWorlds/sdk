/**
 * keel v2 engine absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * keel error envelope handling. The error contract is part of the contract:
 * envelopes carry a machine `code` and a `doc_url` fragment anchored at
 * onlyworlds.github.io/api/errors -- surface both, always. The live wire
 * envelope also carries `type` and `param` (fixtures P4a/P2c); both are
 * surfaced on the thrown error.
 */

/**
 * Auth codes are distinguishable by design; client recovery UX differs per code.
 * `world_gone` is RESERVED: keel's spec promises it but the server never emits it (a deleted
 * world's keys go with it, so the key reads as unknown: 401 `invalid_credentials`). Kept so
 * the client is ready if keel ever remembers deleted worlds' key hashes.
 */
export type OwAuthErrorCode = 'invalid_credentials' | 'key_revoked' | 'world_gone';

export class OwApiError extends Error {
  readonly status: number;
  /** Machine error code from the keel envelope, e.g. 'invalid_credentials'. */
  readonly code: string | null;
  /** Error family from the envelope, e.g. 'invalid_request', 'not_found'. */
  readonly type: string | null;
  /** Offending field/param named by the envelope (422/400), else null. */
  readonly param: string | null;
  /** Documentation link from the envelope -- show it to users/logs verbatim. */
  readonly docUrl: string | null;
  /** Raw parsed envelope (or body text when the body wasn't JSON). */
  readonly detail: unknown;
  /**
   * Seconds to wait before retrying, from the `Retry-After` header (a delay in
   * seconds or an HTTP date), else null. keel sends it on 503 `server_busy`
   * (admission control, D71) and 429 `rate_limited`. This client never retries
   * on its own; the value is here so callers can back off politely.
   * Readable in browsers too: keel exposes `Retry-After` over CORS and its
   * admission gate's 503 carries CORS headers (keel `4949406`, 2026-09-28).
   */
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string | null,
    message: string,
    docUrl: string | null,
    detail: unknown,
    type: string | null = null,
    param: string | null = null,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'OwApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.param = param;
    this.docUrl = docUrl;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }

  get isAuthError(): boolean {
    return this.code === 'invalid_credentials' || this.code === 'key_revoked' || this.code === 'world_gone';
  }

  /** 422s/400s name the offending param/field -- typos error loudly platform-wide. */
  get isValidationError(): boolean {
    return this.status === 422 || this.status === 400;
  }

  /**
   * Same Idempotency-Key replayed with a different payload (409 `idempotency_error`).
   * Through 4.2.0 this was true for ANY 409, which misread an id conflict as a key
   * conflict: keel also answers 409 `id_conflict` (see isIdConflict).
   */
  get isIdempotencyConflict(): boolean {
    return this.status === 409 && this.code === 'idempotency_error';
  }

  /**
   * The id is already taken (409 `id_conflict`): a create with an id that exists
   * (keel D39), or a PUT whose id belongs to another world (D70). Retrying will not
   * help; the id is the problem. `/bulk` never throws for this: it answers 200 with a
   * per-item slot `{status: 409, error: {code: 'id_conflict'}}` — check the slot.
   */
  get isIdConflict(): boolean {
    return this.status === 409 && this.code === 'id_conflict';
  }

  /** keel's admission control turned the request away (503 `server_busy`); see retryAfter. */
  get isBusy(): boolean {
    return this.status === 503 && this.code === 'server_busy';
  }

  /**
   * A contributor tried to change, replace, relink or delete an element someone else
   * created (403 `not_author`, keel D72 membership phase 2). Retrying will not help; the
   * element is not theirs. `/bulk` never throws for this: it answers 200 with a per-item
   * slot `{status: 403, error: {code: 'not_author'}}`. Owners and co-builders never see it.
   */
  get isNotAuthor(): boolean {
    return this.status === 403 && this.code === 'not_author';
  }

  /**
   * A contributor tried a world-level change: `patchWorld`, or publishing a show page
   * (403 `owner_only`, keel D72 membership phase 2). Retrying will not help; only the
   * owner may. Owners and co-builders never see it.
   */
  get isOwnerOnly(): boolean {
    return this.status === 403 && this.code === 'owner_only';
  }
}

/** Network-level failure (fetch rejected) -- no envelope to parse. */
export class OwNetworkError extends Error {
  readonly cause2: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'OwNetworkError';
    this.cause2 = cause;
  }
}

/** The live wire error envelope: error.{type, code, message, param?, doc_url?}. */
interface OwErrorBody {
  type?: string;
  code?: string;
  message?: string;
  param?: string | null;
  doc_url?: string;
}

interface EnvelopeShape {
  code?: string;
  type?: string;
  param?: string | null;
  error?: string | OwErrorBody;
  message?: string;
  detail?: unknown;
  doc_url?: string;
}

/** Parse a wire envelope into OwApiError parts (exported for the error type-tests). */
/** Parse the platform ERROR envelope into an OwApiError. (Renamed from parseEnvelope in 4.0 —
 *  distinct from the world-export envelope, which is a different artifact entirely.) */
export function parseErrorEnvelope(status: number, body: unknown, retryAfter: number | null = null): OwApiError {
  const env = (body && typeof body === 'object' ? body : {}) as EnvelopeShape;
  const nested = typeof env.error === 'object' && env.error !== null ? env.error : undefined;
  const code = env.code ?? nested?.code ?? (typeof env.error === 'string' ? env.error : null) ?? null;
  const type = env.type ?? nested?.type ?? null;
  const param = env.param ?? nested?.param ?? null;
  const docUrl = env.doc_url ?? nested?.doc_url ?? null;
  const message =
    env.message ?? nested?.message ??
    (typeof env.detail === 'string' ? env.detail : undefined) ??
    `OnlyWorlds API error ${status}${code ? ` (${code})` : ''}`;
  return new OwApiError(status, code, message, docUrl, body, type, param, retryAfter);
}

/** `Retry-After` as seconds: a non-negative delay, or an HTTP date turned into one. Else null. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (value == null) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  // Only an IMF-fixdate ("Wed, 21 Oct 2015 07:28:00 GMT") goes to Date.parse: V8 parses
  // "1.5", "-1" or "+5" leniently into a date, which would read as "retry now".
  if (!/[A-Za-z]/.test(v)) return null;
  const when = Date.parse(v);
  if (Number.isNaN(when)) return null;
  return Math.max(0, Math.ceil((when - now) / 1000));
}

/** Build an OwApiError from a non-2xx response, tolerating non-JSON bodies. */
export async function errorFromResponse(res: Response): Promise<OwApiError> {
  let body: unknown = null;
  let text = '';
  try {
    text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }
  return parseErrorEnvelope(res.status, body, parseRetryAfter(res.headers?.get?.('Retry-After') ?? null));
}
