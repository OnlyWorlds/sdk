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
  /** The `resume` given to `beginSignIn`, or null. */
  resume: unknown;
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
  storage.set(RECORD_PREFIX + clientId, JSON.stringify({ state, verifier, redirectUri, resume }));
  const url = new URL(sitePage(baseUrl, '/signin/authorize'));
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
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
  let record: { state?: unknown; verifier?: unknown; redirectUri?: unknown; resume?: unknown } | null = null;
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
      }),
    });
  } catch {
    throw new OwSignInError('offline', 'OnlyWorlds could not be reached: signing in needs a connection.');
  }
  const retryAfter = parseRetryAfter(res.headers?.get?.('Retry-After') ?? null) ?? undefined;
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const errCode = typeof err?.code === 'string' ? err.code : undefined;
  const errMessage = typeof err?.message === 'string' ? err.message : undefined;
  if (res.status === 429) {
    throw new OwSignInError('rate_limited', errMessage ?? 'Too many sign-in attempts. Wait a while, then try again.', { status: 429, code: errCode, retryAfter });
  }
  if (res.status === 400 && errCode === 'invalid_grant') {
    throw new OwSignInError('invalid_grant', errMessage ?? 'The sign-in code could not be exchanged: it was used, expired, or made for another tool. Start again.', { status: 400, code: errCode });
  }
  const ok = body as { token?: unknown; token_id?: unknown; expires_at?: unknown; token_type?: unknown; account?: { id?: unknown; username?: unknown } } | null;
  if (!res.ok || typeof ok?.token !== 'string' || ok.token === '' || typeof ok.account?.id !== 'string') {
    throw new OwSignInError('failed', errMessage ?? `Signing in did not work (${res.status}).`, { status: res.status, code: errCode });
  }
  return {
    token: ok.token,
    tokenId: typeof ok.token_id === 'string' && ok.token_id !== '' ? ok.token_id : null,
    expiresAt: typeof ok.expires_at === 'string' && ok.expires_at !== '' ? ok.expires_at : null,
    tokenType: 'bearer',
    account: { id: ok.account.id, username: typeof ok.account.username === 'string' ? ok.account.username : '' },
    resume: record.resume ?? null,
  };
}
