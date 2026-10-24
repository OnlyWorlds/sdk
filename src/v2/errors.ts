/**
 * keel v2 engine absorbed from an earlier v2 client (ow-v2-client v0.9.0),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * keel error envelope handling. The error contract is part of the contract:
 * envelopes carry a machine `code` and a `doc_url` fragment anchored at
 * onlyworlds.github.io/api/errors -- surface both, always. The live wire
 * envelope also carries `type` and `param` (fixtures P4a/P2c); both are
 * surfaced on the thrown error.
 */

import type { OwProposal, OwProposalConflict, OwResyncReason } from './types';
import { refuseUnknownOptions } from '../options';

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
  /** Offending field/param named by the envelope (a 422/400's field; `API-Pin` on a 401 PIN refusal), else null. */
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
   * A request with this Idempotency-Key is still running (409 `idempotency_in_flight`):
   * two sends of one create or bulk overlapped. Nothing was written by this one.
   * Wait `retryAfter` seconds (keel sends 1) and send again with the SAME key and body: once
   * the first has answered, that retry replays its answer. Not a key conflict (see above).
   */
  get isIdempotencyInFlight(): boolean {
    return this.status === 409 && this.code === 'idempotency_in_flight';
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

  /**
   * `/changes` refused the cursor (409 `resync_required`): what this key may see changed
   * (a guest's slice moved; an element hidden from a contributor was unhidden; the key's role
   * moved to or from guest or contributor, whose cursors have other shapes). Drop
   * the stored cursor and walk again from the start. What to do with what the local copy holds
   * that the new walk does not name is `resyncReason`'s: `role`, keep it; `view`, drop it.
   * Without a reason (keel's hidden mark off), keep it: a reset never empties a copy (keel PR
   * 104, the Captain's ruling: sharing is forward-only). Never empty the copy on your own.
   */
  get isResyncRequired(): boolean {
    return this.status === 409 && this.code === 'resync_required';
  }

  /**
   * Why `/changes` refused the cursor, from the 409 `resync_required` envelope's `reason`
   * (only while keel's hidden mark is on): `role` (this key's own role or
   * membership moved: keep what the local copy holds that the new walk does not name; it is
   * out of view now, not gone) or `view` (something left this key's view: a delete, a hide, an
   * unhide, a Character change; drop what the new walk does not name). When both happened
   * since the cursor, keel says `role`. Undefined for any other error, or when keel sends no
   * reason.
   */
  get resyncReason(): OwResyncReason | undefined {
    if (!this.isResyncRequired) return undefined;
    const env = this.detail && typeof this.detail === 'object' ? (this.detail as { error?: unknown }) : undefined;
    const nested = env?.error && typeof env.error === 'object' ? (env.error as { reason?: unknown }) : undefined;
    const reason = nested?.reason;
    return reason === 'role' || reason === 'view' ? reason : undefined;
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
   * A member key tried what only the owner may do: `patchWorld`, even with a co-builder's
   * key (403 `owner_only`, keel D72; sharing's publish, republish and revoke answer
   * contributors and guests with the same code). Retrying will not help. The owner's own
   * key never sees it.
   */
  get isOwnerOnly(): boolean {
    return this.status === 403 && this.code === 'owner_only';
  }

  /**
   * A member key sent `viewAs` (403 `view_as_owner_only`): reading as another
   * reader is the owner's, from a key with no member. Retrying will not help. Only while
   * keel's hidden mark is on; until then `viewAs` is an unknown parameter (422).
   */
  get isViewAsOwnerOnly(): boolean {
    return this.status === 403 && this.code === 'view_as_owner_only';
  }

  /**
   * An element write carried `known_of` (422 `known_of_not_writable`, `param` known_of; keel
   * PR 117), true or false: the key marks a stub and is never written. Drop it and send only
   * the fields you mean. This client never sends it (`known_of` is stripped, a stub is a
   * TypeError before sending), so it reaches you only through `request()`. `/bulk` never
   * throws for it: the item's slot carries the code, and its siblings apply.
   */
  get isKnownOfNotWritable(): boolean {
    return this.status === 422 && this.code === 'known_of_not_writable';
  }

  /**
   * A `patch` or `editLinks` sent with `ifMatch` found the element moved past that
   * `change_seq` (412 `precondition_failed`): nothing was written and nothing
   * merged. The error is an OwPreconditionFailedError; its `current` is the element as it
   * is now, so no second read is needed.
   */
  get isPreconditionFailed(): boolean {
    return this.status === 412 && this.code === 'precondition_failed';
  }

  /** 404 `not_found`: no such element or route, or a join code that is unknown, used, revoked or expired. */
  get isNotFound(): boolean {
    return this.status === 404 && this.code === 'not_found';
  }

  /**
   * redeemJoin on a table: the picked Character is one a live seat in the
   * world already plays (422 `character_taken`, `param` character). Pick another from a fresh
   * previewJoin, whose `characters` mark each `taken`. The code is not spent.
   */
  get isCharacterTaken(): boolean {
    return this.status === 422 && this.code === 'character_taken';
  }

  /**
   * setMyCharacter, or the member PATCH's `character`: the picked Character is
   * hidden (422 `character_hidden`, `param` character). Unhide it first, or pick another.
   */
  get isCharacterHidden(): boolean {
    return this.status === 422 && this.code === 'character_hidden';
  }

  /**
   * The `character` sent was refused (422 `invalid_request`, `param` character). On redeemJoin
   * at a table: the pick is off the link's list, hidden or deleted since the
   * link was made, or missing, or sent to a table with no list (send `name` instead); one
   * answer for all, so read previewJoin again and pick from its `characters`. The code is not
   * spent. On createWorldLink: a `character` keel refused (not a Character of the world, a
   * hidden one, or any `character` on a table). Never true for another param's 422, nor for
   * `character_taken` (see isCharacterTaken).
   */
  get isCharacterInvalid(): boolean {
    return this.status === 422 && this.code === 'invalid_request' && this.param === 'character';
  }

  /**
   * redeemJoin: the world already has its 50 live players (422 `world_full`),
   * at any player link, a table's or a link for one's. Nothing is spent; a place frees when the
   * owner removes a player.
   */
  get isWorldFull(): boolean {
    return this.status === 422 && this.code === 'world_full';
  }

  /** acceptJoin: the account is already a member of that world (409 `already_member`). The code is not spent. */
  get isAlreadyMember(): boolean {
    return this.status === 409 && this.code === 'already_member';
  }

  /** acceptJoin: the account has no PIN yet, and a member writes with their own (409 `pin_required`). The code is not spent. */
  get isPinRequired(): boolean {
    return this.status === 409 && this.code === 'pin_required';
  }

  /**
   * A daily allowance is used up (429 `quota_exceeded`): the world's image tickets, its file
   * tickets (200 a day), or the account's asks. See retryAfter.
   */
  get isQuotaExceeded(): boolean {
    return this.status === 429 && this.code === 'quota_exceeded';
  }

  /**
   * createFileTicket / uploadFile: the file is over the 25 MB a file may be (413
   * `file_too_large`, `param` size); the message gives both sizes. Nothing was
   * issued. Not the upload host's 413 `too_large` (bytes past a ticket's `max_bytes`).
   */
  get isFileTooLarge(): boolean {
    return this.status === 413 && this.code === 'file_too_large';
  }

  /**
   * createFileTicket / uploadFile: the world's files have no room for this one (403
   * `files_full`: 250 MB a world); the message gives the world's use, its cap and
   * the file's size. Remove a file, or ask the owner. Nothing was issued.
   */
  get isFilesFull(): boolean {
    return this.status === 403 && this.code === 'files_full';
  }

  /** ask: the proxy is switched off, or paused for the day by the server-wide cap (503 `ask_unavailable`). Not counted. */
  get isAskUnavailable(): boolean {
    return this.status === 503 && this.code === 'ask_unavailable';
  }

  /** ask: the model gave no answer (502 `ask_failed`). Not counted; try again in a moment. */
  get isAskFailed(): boolean {
    return this.status === 502 && this.code === 'ask_failed';
  }

  /**
   * patch, upsert or editLinks became a proposal (202): the world takes an agent seat's
   * writes as proposals (`agent_writes_proposed`), so the element did not change. The error is an
   * OwProposedError; its `proposal` is the row a keeper accepts or declines. Not a failure to retry:
   * the write is waiting for a person.
   */
  get isProposed(): boolean {
    return this.status === 202 && this instanceof OwProposedError;
  }

  /**
   * propose named a field the proposer's own view of the element does not hold (422
   * `field_not_visible`, `param` names it): the element reaches this key only as a
   * stub (known_of), and a proposal changes only what its proposer can read.
   */
  get isFieldNotVisible(): boolean {
    return this.status === 422 && this.code === 'field_not_visible';
  }

  /**
   * propose: this proposer already has 5 open proposals on the element, or 50 in the world (422
   * `too_many_open`). Wait for a keeper to decide, or withdraw one; a lapsed proposal
   * no longer counts.
   */
  get isTooManyOpen(): boolean {
    return this.status === 422 && this.code === 'too_many_open';
  }

  /**
   * acceptProposal found a proposed field moved since the proposal was made (409
   * `stale_proposal`). Nothing was written and the proposal stays open. The error is an
   * OwStaleProposalError: `conflicts` lists each moved field with its `base` and `current` values,
   * and `current` is the element as it is now. A change to a field the proposal does not name
   * does not count. The proposer proposes again on the current text.
   */
  get isStaleProposal(): boolean {
    return this.status === 409 && this.code === 'stale_proposal';
  }

  /**
   * While the world takes agent seats' writes as proposals, an agent seat's key tried
   * what it may not: delete an element it did not create, or accept or decline a proposal (403
   * `proposed_only`). On any world, reviewNewElement by the member the mark names is the same 403.
   * Retrying will not help; a person decides.
   */
  get isProposedOnly(): boolean {
    return this.status === 403 && this.code === 'proposed_only';
  }

  /**
   * acceptProposal or declineProposal on the key's own proposal (403 `own_proposal`):
   * another keeper (the owner or a co-builder) decides it. Retrying will not help.
   */
  get isOwnProposal(): boolean {
    return this.status === 403 && this.code === 'own_proposal';
  }

  /**
   * reviewNewElement on an element that carries no `x_review_proposed` mark (422 `not_proposed`):
   * nothing to settle. Someone settled it already, or it was never written as proposed.
   */
  get isNotProposed(): boolean {
    return this.status === 422 && this.code === 'not_proposed';
  }
}

/**
 * 412 `precondition_failed`: the element changed since the `change_seq` sent as
 * `ifMatch`. `current` is the element as it is now, as this key sees it (keel sends it beside
 * the error envelope; null if a response ever lacks it). The check is per element and the
 * server never merges: compare the copy you edited from with `current`; when the fields you
 * changed are not the ones that moved, re-send with `ifMatch: current.change_seq`; when the
 * same field moved on both sides, ask the user which to keep.
 */
export class OwPreconditionFailedError extends OwApiError {
  readonly current: Record<string, unknown> | null;

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
    super(status, code, message, docUrl, detail, type, param, retryAfter);
    this.name = 'OwPreconditionFailedError';
    const cur = detail && typeof detail === 'object' ? (detail as { current?: unknown }).current : undefined;
    this.current = cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : null;
  }
}

/**
 * 409 `stale_proposal`: acceptProposal found a proposed field moved since the
 * proposal was made. keel sends `conflicts` (one `{field, base, current}` per moved field) and
 * `current` (the element as it is now) beside the error envelope; `conflicts` is empty and
 * `current` null if a response ever lacks them. Nothing was written and the proposal stays open.
 */
export class OwStaleProposalError extends OwApiError {
  readonly conflicts: OwProposalConflict[];
  readonly current: Record<string, unknown> | null;

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
    super(status, code, message, docUrl, detail, type, param, retryAfter);
    this.name = 'OwStaleProposalError';
    const body = detail && typeof detail === 'object' ? (detail as { conflicts?: unknown; current?: unknown }) : {};
    this.conflicts = Array.isArray(body.conflicts)
      ? body.conflicts.filter((c): c is OwProposalConflict => !!c && typeof c === 'object' && typeof (c as { field?: unknown }).field === 'string')
      : [];
    this.current = body.current && typeof body.current === 'object' ? (body.current as Record<string, unknown>) : null;
  }
}

/**
 * 202 on patch, upsert or editLinks: the world takes an agent seat's writes as
 * proposals (`agent_writes_proposed`, set by its owner), so the write became a proposal and the
 * element did not change. The answer is `{proposal}`, never an element, so this client throws
 * rather than hand it back as one. `proposal` is the row; a keeper (the owner or a co-builder)
 * accepts or declines it, and the proposer may withdraw it. `status` is 202 and `code` null: it
 * is not keel's error envelope. A /bulk item never throws for it: its slot says `status: 202`
 * and carries `proposal`. The arguments are OwPreconditionFailedError's; `proposal` is read from
 * `detail` (the 202's body), and the client builds one only from a body that holds a proposal.
 */
export class OwProposedError extends OwApiError {
  readonly proposal: OwProposal;

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
    super(status, code, message, docUrl, detail, type, param, retryAfter);
    this.name = 'OwProposedError';
    const p = detail && typeof detail === 'object' ? (detail as { proposal?: unknown }).proposal : undefined;
    this.proposal = p as OwProposal;
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

/**
 * Why `signInWithPassword` refused:
 * - `invalid_credentials`: keel does not know that email (or username) with that password.
 * - `email_unverified`: the account's email address is not confirmed yet; the link is in the
 *   mail onlyworlds.com sent when the account was made.
 * - `rate_limited`: too many sign-ins (a 429), or too many failed ones for this account
 *   (`too_many_login_attempts`); wait `retryAfter` seconds when it is set.
 * - `offline`: the request never reached keel.
 * - `mint_failed`: the password was right, but keel made no token; the session was still ended.
 * - `failed`: any other refusal; the message is keel's when it gave one.
 */
export type OwSignInReason =
  | 'invalid_credentials'
  | 'invalid_grant'
  | 'state_mismatch'
  | 'email_unverified'
  | 'rate_limited'
  | 'offline'
  | 'mint_failed'
  | 'failed';

/**
 * A refused `signInWithPassword`. `reason` is what to tell the user; `status` and `code` are
 * keel's answer when there was one (`code`: keel's error code, e.g. `email_password_mismatch`).
 * The password is never in the message or in any property.
 */
export class OwSignInError extends Error {
  readonly reason: OwSignInReason;
  /** The HTTP status of the refusing answer; absent when nothing came back (`offline`). */
  readonly status?: number;
  /** keel's error code, when its answer carried one. */
  readonly code?: string;
  /** Seconds to wait before trying again, from `Retry-After` (on a 429). */
  readonly retryAfter?: number;

  constructor(
    reason: OwSignInReason,
    message: string,
    opts: { status?: number; code?: string; retryAfter?: number } = {},
  ) {
    refuseUnknownOptions('OwSignInError', opts, ['status', 'code', 'retryAfter']);
    super(message);
    this.name = 'OwSignInError';
    this.reason = reason;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.code !== undefined) this.code = opts.code;
    if (opts.retryAfter !== undefined) this.retryAfter = opts.retryAfter;
  }
}

/** The live wire error envelope: error.{type, code, message, param?, doc_url?, reason?}. */
interface OwErrorBody {
  type?: string;
  code?: string;
  message?: string;
  param?: string | null;
  doc_url?: string;
  reason?: string;
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
  const Cls = status === 412 && code === 'precondition_failed' ? OwPreconditionFailedError
    : status === 409 && code === 'stale_proposal' ? OwStaleProposalError
    : OwApiError;
  return new Cls(status, code, message, docUrl, body, type, param, retryAfter);
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
