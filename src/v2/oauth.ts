/**
 * Sign in with OnlyWorlds: OAuth 2.1's authorization code with PKCE (S256) for public clients
 * (live 2026-10-22).
 *
 * Two calls. `beginSignIn` mints `state` and a PKCE verifier, keeps them under the client id in a
 * storage the page shares with its callback (sessionStorage by default), and hands back the
 * authorize URL (sending the browser there where a `location` exists). `completeSignIn` runs on the
 * callback page: it checks `state` and that the page is the registered return address, takes the
 * code out of the address bar, trades it at `POST /api/v2/auth/token` with no credential, and
 * returns the token with the account and the `resume` the tool parked before the redirect. The
 * SDK keeps nothing: the record is cleared once a return carries its state (success or refusal; a
 * return with another state leaves it pending), and the token is the tool's to store.
 */

import { OwSignInError, parseRetryAfter } from './errors';

/** Where the pending sign-in's record lives between the two pages: string in, string out. */
export interface OwSignInStorage {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface OwSignInBegin {
  /** The `client_id` keel's registry lists the tool under (`GET /api/v2/auth/clients`). */
  clientId: string;
  /**
   * The registered return address, the exact string; never built from `location.origin`. A web tool's
   * is `https:`. A tool registered as a native app may also use a loopback address, registered without
   * a port (`http://127.0.0.1/<path>` or `http://[::1]/<path>`) and passed here with the port the app
   * bound for this sign-in (`http://127.0.0.1:53682/<path>`, 1 to 65535), or its own scheme, exactly as
   * registered (`obsidian://onlyworlds-signin`). `localhost`, a loopback without its port, userinfo, a
   * query and a fragment are refused.
   */
  redirectUri: string;
  /** Small JSON the tool wants back after the redirect (an open link, a pending join code). */
  resume?: unknown;
  /** Defaults to `globalThis.sessionStorage`; without one (Node) the option is required. */
  storage?: OwSignInStorage;
  /** How the browser is sent: a function taking the URL, or `false` to only return it. Default: `location.assign` where there is one. */
  navigate?: ((url: string) => void) | false;
  /**
   * `'world:read'` for a tool that only reads: the token the sign-in gives is read-only. It reads
   * everything the account reads, and every write (a world key minted, a world made, another token
   * minted, an AI call) is refused with 403 `permission_error`, except revoking the token itself.
   * Left out, the token writes as the account does. The one value there is; any other is refused
   * before anything is sent. `completeSignIn` answers the scope the server granted.
   */
  scope?: 'world:read';
}

export interface OwSignInBegun {
  /** The authorize URL: `https://www.onlyworlds.com/signin/authorize?...`. */
  url: string;
  state: string;
}

export interface OwSignInComplete {
  clientId: string;
  storage?: OwSignInStorage;
  /**
   * The callback page's address; defaults to `location.href`, which is then cleaned of `code` and
   * `state`. A native app passes the address its loopback server or scheme handler received, and
   * the window's history is left alone.
   */
  url?: string;
  /**
   * Also ask the exchange for an AI door token for these AI uses (their slugs, as `aiUses()` lists
   * them): 1 to 8, each one path segment. It comes back as `aiToken`. The exchange spends the code
   * whatever it answers, so a list the SDK can see is wrong is refused before anything is sent; a
   * name the server does not run is its 422, and then the code is spent.
   */
  aiUses?: string[];
  /** With `aiUses` only: the AI door token ends this many minutes after the exchange (1 to 1440), or at midnight UTC if that comes first. */
  aiLifetimeMinutes?: number;
}

/**
 * An AI door token: an `ow_a_` token that opens only `aiUses()` and the AI uses it names (`ai()`),
 * as the person and on their token rating; another use answers 403 `use_not_granted`
 * (`err.isUseNotGranted`), every other route 401 `wrong_audience` (`err.isWrongAudience`). It ends at
 * `expiresAt` (midnight UTC at the latest), then answers 401 `key_revoked`. A client built on it may
 * revoke it with `revokeAccountToken(tokenId)`; revoking it touches no other token, and revoking the
 * account token beside it leaves it live.
 */
export interface OwAiToken {
  /** The `ow_a_` AI door token, shown only here. */
  token: string;
  tokenId: string;
  tokenType: 'bearer';
  audience: 'ai';
  /** The uses it opens, as the server took them (each once, in the order sent). */
  aiUses: string[];
  /** When it stops working (ISO 8601). */
  expiresAt: string;
}

const AI_USES_MAX = 8;
const AI_LIFETIME_MAX_MINUTES = 1440;
/** A use's name as `ai()` takes it in its path: one segment, no slash, no escape, no dot first (client.ts's PATH_VALUE). */
const AI_USE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * The AI door token's two options as the server will read them, checked before sending (shared by
 * completeSignIn and mintAiToken): `uses` 1 to 8 non-empty strings, each one path segment;
 * `minutes` a whole number 1 to 1440, only with `uses`. Returns the body keys to send.
 */
export function aiTokenParams(method: string, uses: unknown, minutes: unknown): Record<string, unknown> {
  if (uses === undefined) {
    if (minutes !== undefined) throw new TypeError(`${method}: the AI token's lifetime goes with its uses: send aiUses too. Nothing was sent.`);
    return {};
  }
  if (!Array.isArray(uses) || uses.length < 1 || uses.length > AI_USES_MAX) {
    throw new TypeError(`${method}: the AI uses are a list of 1 to ${AI_USES_MAX} use names, got ${JSON.stringify(uses)}. Nothing was sent.`);
  }
  for (const u of uses) {
    if (typeof u !== 'string' || !AI_USE_SLUG.test(u)) {
      throw new TypeError(`${method}: ${JSON.stringify(u)} is not an AI use's name (one path segment, as aiUses() lists them). Nothing was sent.`);
    }
  }
  const body: Record<string, unknown> = { ai_uses: [...uses] };
  if (minutes !== undefined) {
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > AI_LIFETIME_MAX_MINUTES) {
      throw new TypeError(`${method}: the AI token's lifetime is a whole number of minutes, 1 to ${AI_LIFETIME_MAX_MINUTES}, got ${JSON.stringify(minutes)}. Nothing was sent.`);
    }
    body.ai_lifetime_minutes = minutes;
  }
  return body;
}

/** The answer's `ai_token`, or null when it is missing or not the shape the server documents. */
function readAiToken(v: unknown): OwAiToken | null {
  const t = v as { token?: unknown; token_id?: unknown; ai_uses?: unknown; expires_at?: unknown } | null;
  if (!t || typeof t !== 'object' || typeof t.token !== 'string' || t.token === '' || typeof t.token_id !== 'string' || t.token_id === ''
    || !Array.isArray(t.ai_uses) || !t.ai_uses.every((u) => typeof u === 'string') || typeof t.expires_at !== 'string' || t.expires_at === '') return null;
  return { token: t.token, tokenId: t.token_id, tokenType: 'bearer', audience: 'ai', aiUses: [...t.ai_uses] as string[], expiresAt: t.expires_at };
}

/** What `completeSignIn` returns: the account token, shown only here, and what the tool parked. */
export interface OwSignInResult {
  /** An `ow_a_` account token: keep it, it is the only copy (the SDK stores none). */
  token: string;
  /**
   * The token's id: a tool done with the token revokes it with `DELETE /account/tokens/{tokenId}`,
   * sending the token itself as the bearer. Null from a server that does not send it yet.
   */
  tokenId: string | null;
  /**
   * When the token stops working (ISO 8601), for a tool whose registration asks for a lifetime; null
   * for one with none, whose token works until it is revoked, and from a server that does not send it.
   */
  expiresAt: string | null;
  tokenType: 'bearer';
  account: { id: string; username: string };
  /**
   * `'world:read'` when the server granted a read-only token (the sign-in asked `scope: 'world:read'`):
   * every write but revoking the token itself is refused with 403 `permission_error`. Null when the
   * answer carries no scope: the token writes as the account does, which is also what a server that
   * does not know scopes answers, so a tool that asked for read-only reads it here.
   */
  scope: 'world:read' | null;
  /** The `resume` given to `beginSignIn`, or null. */
  resume: unknown;
  /**
   * The AI door token, when `aiUses` asked for one; null when none was asked, and from a server that
   * answered none (the account token above is good either way).
   */
  aiToken: OwAiToken | null;
}

const RECORD_PREFIX = 'ow_signin:';

function defaultStorage(name: string): OwSignInStorage {
  const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
  if (!ss || typeof ss.getItem !== 'function') {
    throw new TypeError(`${name}: no sessionStorage here; pass storage ({get, set, remove}) to hold the pending sign-in`);
  }
  return { get: (k) => ss.getItem(k), set: (k, v) => ss.setItem(k, v), remove: (k) => ss.removeItem(k) };
}

function webCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function' || !c.subtle) {
    throw new TypeError('Sign in with OnlyWorlds needs Web Crypto (crypto.getRandomValues and crypto.subtle)');
  }
  return c;
}

/** Base64url without padding (RFC 4648 §5), as PKCE wants it. */
export function base64url(bytes: Uint8Array): string {
  // Hand-rolled: neither `btoa` (a browser global) nor `Buffer` (Node's) is assumed.
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (b1 !== undefined) out += ALPHABET[(n >> 6) & 63];
    if (b2 !== undefined) out += ALPHABET[n & 63];
  }
  return out;
}

/** The S256 code challenge of a verifier (RFC 7636 §4.2). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await webCrypto().subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function randomToken(bytes: number): string {
  const buf = new Uint8Array(bytes);
  webCrypto().getRandomValues(buf);
  return base64url(buf);
}

function sitePage(baseUrl: string, path: string): string {
  return `${new URL(baseUrl).origin}${path}`;
}

// The return addresses keel takes at authorize (its accounts/signin.py: uri_problem, native_uri_problem
// and return_matches), as the tool presents them. A native app's (RFC 8252) are a loopback literal with
// the port the app bound (registered with none, any port matching) and a custom scheme matched exactly.
// Whether the client is registered as native is keel's to check: the SDK does not read the client list.
const LOOPBACK_HOSTS = ['127.0.0.1', '[::1]'];
const REFUSED_SCHEMES = ['http', 'https', 'javascript', 'data', 'file'];
const SCHEME = /^[a-z][a-z0-9+.-]*$/;
const PORT = /^[1-9][0-9]{0,4}$/;

function pathProblem(path: string): string | null {
  const segments = path.split('/');
  if (segments.includes('.') || segments.includes('..')) return 'carries a dot segment';
  return null;
}

/** Why a presented return address is not one keel can match, or null. */
function redirectProblem(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri === '') return 'is not a string';
  for (let i = 0; i < uri.length; i++) {
    const c = uri.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return 'carries whitespace or a character outside printable ASCII';
  }
  if (uri.includes('*')) return 'carries a wildcard: a return address is exact';
  if (uri.includes('#')) return 'carries a fragment';
  if (uri.includes('?')) return 'carries a query: the code and state are the only query';
  const sep = uri.indexOf('://');
  if (sep < 0) return 'is not <scheme>://<path>';
  const scheme = uri.slice(0, sep);
  const rest = uri.slice(sep + 3);
  const slash = rest.indexOf('/');
  const netloc = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? '' : rest.slice(slash);
  if (scheme === 'https') {
    if (netloc.includes('@')) return 'carries userinfo';
    const host = netloc.split(':')[0];
    if (host === '' || host.includes('[')) return 'has no plain host';
    if (host !== host.toLowerCase()) return 'has an upper-case host';
    if (path === '') return 'has no path';
    return pathProblem(path);
  }
  if (scheme === 'http') {
    if (netloc.includes('@')) return 'carries userinfo';
    if (netloc.split(':')[0].toLowerCase() === 'localhost') return 'names localhost: a loopback return is the literal 127.0.0.1 or [::1]';
    if (LOOPBACK_HOSTS.includes(netloc)) return 'names no port: a loopback return carries the port the app bound';
    const host = LOOPBACK_HOSTS.find((h) => netloc.startsWith(h + ':'));
    if (host === undefined) return 'is http on a host that is not a loopback literal (127.0.0.1 or [::1])';
    const port = netloc.slice(host.length + 1);
    if (!PORT.test(port) || Number(port) > 65535) return 'carries a port that is not a whole number from 1 to 65535, written plainly';
    if (path === '') return 'has no path';
    return pathProblem(path);
  }
  if (scheme !== scheme.toLowerCase()) return 'has an upper-case scheme: a custom scheme is lower-case';
  if (!SCHEME.test(scheme)) return 'has a scheme of characters a scheme may not hold';
  if (REFUSED_SCHEMES.includes(scheme)) return 'uses a scheme a return address may never use';
  if (rest === '') return 'has no path after the scheme';
  if (rest.includes('@')) return 'carries userinfo';
  return pathProblem(rest);
}

export async function beginSignIn(baseUrl: string, opts: OwSignInBegin): Promise<OwSignInBegun> {
  const { clientId, redirectUri, resume = null } = opts ?? ({} as OwSignInBegin);
  if (typeof clientId !== 'string' || clientId === '') throw new TypeError('signInWithOnlyWorlds needs clientId');
  const scope = opts.scope;
  if (scope !== undefined && scope !== 'world:read') {
    throw new TypeError(`signInWithOnlyWorlds: scope is 'world:read' or left out, got ${JSON.stringify(scope)}. Nothing was sent.`);
  }
  const why = redirectProblem(redirectUri);
  if (why !== null) {
    throw new TypeError(`signInWithOnlyWorlds: redirectUri ${why}. Pass the registered return address as a string: `
      + 'https://<host>/<path>, or for a native app http://127.0.0.1:<port>/<path> or http://[::1]:<port>/<path> '
      + 'with the port it bound, or its own scheme, <scheme>://<path>');
  }
  const storage = opts.storage ?? defaultStorage('signInWithOnlyWorlds');
  const state = randomToken(32);
  const verifier = randomToken(32); // 43 characters of base64url: within PKCE's 43 to 128
  const challenge = await pkceChallenge(verifier);
  storage.set(RECORD_PREFIX + clientId, JSON.stringify({ state, verifier, redirectUri, resume, ...(scope ? { scope } : {}) }));
  const url = new URL(sitePage(baseUrl, '/signin/authorize'));
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (scope) url.searchParams.set('scope', scope);
  const href = url.toString();
  if (opts.navigate !== false) {
    const go = opts.navigate ?? (globalThis as { location?: Location }).location?.assign?.bind((globalThis as { location?: Location }).location);
    if (go) go(href);
  }
  return { url: href, state };
}

// The scheme, the host with its port, and the path, each exactly. Never `origin`: it is "null" for every
// scheme that is not special, so `evil://onlyworlds-signin` would match `obsidian://onlyworlds-signin`.
// A trailing slash is tolerated on https alone, where a static host may answer `/callback` by sending
// the browser to `/callback/`; a loopback or custom-scheme return reaches the app as it was registered.
function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    if (x.protocol !== y.protocol || x.host !== y.host) return false;
    if (x.protocol === 'https:') return x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
    return x.pathname === y.pathname;
  } catch {
    return false;
  }
}

export async function completeSignIn(
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch,
  opts: OwSignInComplete,
): Promise<OwSignInResult> {
  const { clientId } = opts ?? ({} as OwSignInComplete);
  if (typeof clientId !== 'string' || clientId === '') throw new TypeError('completeSignIn needs clientId');
  // checked before the address bar or the pending record is touched: a refusal here spends nothing
  const ai = aiTokenParams('completeSignIn', opts.aiUses, opts.aiLifetimeMinutes);
  const storage = opts.storage ?? defaultStorage('completeSignIn');
  const here = opts.url ?? (globalThis as { location?: Location }).location?.href;
  if (typeof here !== 'string') throw new TypeError('completeSignIn: no location here; pass url (the callback page\'s address)');
  const page = new URL(here);
  const code = page.searchParams.get('code');
  const state = page.searchParams.get('state');

  // The code is single use: out of the address bar before anything else, so a reload spends nothing.
  // Only when the address came from the address bar: a `url` passed in (a native app's loopback
  // server or scheme handler) is not this window's, and its history is left alone.
  const hist = opts.url === undefined ? (globalThis as { history?: History }).history : undefined;
  if (hist && typeof hist.replaceState === 'function' && (page.searchParams.has('code') || page.searchParams.has('state'))) {
    const clean = new URL(here);
    clean.searchParams.delete('code');
    clean.searchParams.delete('state');
    try { hist.replaceState(hist.state, '', clean.toString()); } catch { /* a page that refuses stays as it is */ }
  }

  const key = RECORD_PREFIX + clientId;
  const raw = storage.get(key);
  let record: { state?: unknown; verifier?: unknown; redirectUri?: unknown; resume?: unknown; scope?: unknown } | null = null;
  try { record = raw ? JSON.parse(raw) : null; } catch { record = null; }
  if (!record || typeof record.state !== 'string' || typeof record.verifier !== 'string' || typeof record.redirectUri !== 'string') {
    storage.remove(key);
    throw new OwSignInError('state_mismatch', 'No sign-in is pending for this tool here: start again from the sign-in button.');
  }
  // A return that does not carry this sign-in's state leaves it pending: anyone can open a custom
  // scheme's address, and a forged one must not cancel a sign-in in flight. Once the state matches,
  // the sign-in that was started here has come back, and the record goes whatever happens next.
  if (state !== record.state) {
    throw new OwSignInError('state_mismatch', 'This page was not reached from the sign-in that was started here: start again.');
  }
  // A read-only sign-in gets no AI door token, and the server would spend the code refusing it: refused
  // here, before the record goes, so the same return can be completed without aiUses.
  if (record.scope === 'world:read' && 'ai_uses' in ai) {
    throw new TypeError('completeSignIn: this sign-in asked for a read-only token (scope world:read), which gets no AI door token: leave aiUses out. Nothing was sent.');
  }
  storage.remove(key);
  if (!code) {
    throw new OwSignInError('state_mismatch', 'This page was not reached from the sign-in that was started here: start again.');
  }
  if (!samePage(here, record.redirectUri)) {
    throw new OwSignInError('state_mismatch', 'This page is not the return address the sign-in was started with.');
  }

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: record.verifier,
        client_id: clientId,
        redirect_uri: record.redirectUri,
        ...ai,
      }),
    });
  } catch {
    throw new OwSignInError('offline', 'OnlyWorlds could not be reached: signing in needs a connection.');
  }
  const retryAfter = parseRetryAfter(res.headers?.get?.('Retry-After') ?? null) ?? undefined;
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  const err = (body as { error?: { code?: unknown; message?: unknown; param?: unknown } } | null)?.error;
  const errCode = typeof err?.code === 'string' ? err.code : undefined;
  const errParam = typeof err?.param === 'string' && err.param !== '' ? err.param : undefined;
  const errMessage = typeof err?.message === 'string' ? err.message : undefined;
  if (res.status === 429) {
    throw new OwSignInError('rate_limited', errMessage ?? 'Too many sign-in attempts. Wait a while, then try again.', { status: 429, code: errCode, param: errParam, retryAfter });
  }
  if (res.status === 400 && errCode === 'invalid_grant') {
    throw new OwSignInError('invalid_grant', errMessage ?? 'The sign-in code could not be exchanged: it was used, expired, or made for another tool. Start again.', { status: 400, code: errCode, param: errParam });
  }
  const ok = body as { token?: unknown; token_id?: unknown; expires_at?: unknown; token_type?: unknown; scope?: unknown; account?: { id?: unknown; username?: unknown }; ai_token?: unknown } | null;
  if (!res.ok || typeof ok?.token !== 'string' || ok.token === '' || typeof ok.account?.id !== 'string') {
    throw new OwSignInError('failed', errMessage ?? `Signing in did not work (${res.status}).`, { status: res.status, code: errCode, param: errParam });
  }
  return {
    token: ok.token,
    tokenId: typeof ok.token_id === 'string' && ok.token_id !== '' ? ok.token_id : null,
    expiresAt: typeof ok.expires_at === 'string' && ok.expires_at !== '' ? ok.expires_at : null,
    tokenType: 'bearer',
    account: { id: ok.account.id, username: typeof ok.account.username === 'string' ? ok.account.username : '' },
    scope: ok.scope === 'world:read' ? 'world:read' : null,
    resume: record.resume ?? null,
    aiToken: 'ai_uses' in ai ? readAiToken(ok.ai_token) : null,
  };
}
