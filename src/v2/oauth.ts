/**
 * Sign in with OnlyWorlds: OAuth 2.1's authorization code with PKCE (S256) for public clients
 * (keel PR 154, live 2026-10-22).
 *
 * Two calls. `beginSignIn` mints `state` and a PKCE verifier, keeps them under the client id in a
 * storage the page shares with its callback (sessionStorage by default), and hands back the
 * authorize URL (sending the browser there where a `location` exists). `completeSignIn` runs on the
 * callback page: it checks `state` and that the page is the registered return address, takes the
 * code out of the address bar, trades it at `POST /api/v2/auth/token` with no credential, and
 * returns the token with the account and the `resume` the tool parked before the redirect. The
 * SDK keeps nothing: the record is cleared on success and on refusal, and the token is the tool's
 * to store.
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
  /** The registered return address, the exact string, `https:` only; never built from `location.origin`. */
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
  /** The callback page's address; defaults to `location.href`. */
  url?: string;
}

/** What `completeSignIn` returns: the account token, shown only here, and what the tool parked. */
export interface OwSignInResult {
  /** An `ow_a_` account token: keep it, it is the only copy (the SDK stores none). */
  token: string;
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

export async function beginSignIn(baseUrl: string, opts: OwSignInBegin): Promise<OwSignInBegun> {
  const { clientId, redirectUri, resume = null } = opts ?? ({} as OwSignInBegin);
  if (typeof clientId !== 'string' || clientId === '') throw new TypeError('signInWithOnlyWorlds needs clientId');
  if (typeof redirectUri !== 'string' || !redirectUri.startsWith('https://')) {
    throw new TypeError('signInWithOnlyWorlds: redirectUri must be the registered https: address, as a string');
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

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
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
  const hist = (globalThis as { history?: History }).history;
  if (hist && typeof hist.replaceState === 'function' && (page.searchParams.has('code') || page.searchParams.has('state'))) {
    const clean = new URL(here);
    clean.searchParams.delete('code');
    clean.searchParams.delete('state');
    try { hist.replaceState(hist.state, '', clean.toString()); } catch { /* a page that refuses stays as it is */ }
  }

  const key = RECORD_PREFIX + clientId;
  const raw = storage.get(key);
  storage.remove(key); // success or refusal, the record goes
  let record: { state?: unknown; verifier?: unknown; redirectUri?: unknown; resume?: unknown } | null = null;
  try { record = raw ? JSON.parse(raw) : null; } catch { record = null; }
  if (!record || typeof record.state !== 'string' || typeof record.verifier !== 'string' || typeof record.redirectUri !== 'string') {
    throw new OwSignInError('state_mismatch', 'No sign-in is pending for this tool here: start again from the sign-in button.');
  }
  if (!code || !state || state !== record.state) {
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
  const ok = body as { token?: unknown; token_type?: unknown; account?: { id?: unknown; username?: unknown } } | null;
  if (!res.ok || typeof ok?.token !== 'string' || ok.token === '' || typeof ok.account?.id !== 'string') {
    throw new OwSignInError('failed', errMessage ?? `Signing in did not work (${res.status}).`, { status: res.status, code: errCode });
  }
  return {
    token: ok.token,
    tokenType: 'bearer',
    account: { id: ok.account.id, username: typeof ok.account.username === 'string' ? ok.account.username : '' },
    resume: record.resume ?? null,
  };
}
