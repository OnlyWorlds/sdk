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

/** Auth codes are distinguishable by design; client recovery UX differs per code. */
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

  constructor(
    status: number,
    code: string | null,
    message: string,
    docUrl: string | null,
    detail: unknown,
    type: string | null = null,
    param: string | null = null,
  ) {
    super(message);
    this.name = 'OwApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.param = param;
    this.docUrl = docUrl;
    this.detail = detail;
  }

  get isAuthError(): boolean {
    return this.code === 'invalid_credentials' || this.code === 'key_revoked' || this.code === 'world_gone';
  }

  /** 422s/400s name the offending param/field -- typos error loudly platform-wide. */
  get isValidationError(): boolean {
    return this.status === 422 || this.status === 400;
  }

  /** Same Idempotency-Key replayed with a different payload. */
  get isIdempotencyConflict(): boolean {
    return this.status === 409;
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
export function parseErrorEnvelope(status: number, body: unknown): OwApiError {
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
  return new OwApiError(status, code, message, docUrl, body, type, param);
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
  return parseErrorEnvelope(res.status, body);
}
