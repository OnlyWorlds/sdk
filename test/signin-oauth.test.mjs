// Sign in with OnlyWorlds: the two calls on fakes, the PKCE vector from RFC 7636.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwSignInError } from '../dist/index.js';
import { pkceChallenge, base64url } from '../dist/index.js';

const BASE = 'https://www.onlyworlds.com/api/v2';

function memory() {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), map: m };
}

function fetchStub(status, body, calls) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

test('pkceChallenge matches RFC 7636 appendix B', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(base64url(new Uint8Array([251, 255])), '-_8');
});

test('signInWithOnlyWorlds keeps the record under the client id and builds the authorize URL; refuses http and no storage', async () => {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const storage = memory();
  const gone = [];
  const { url, state } = await client.signInWithOnlyWorlds({
    clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', resume: { open: 'w1' }, storage, navigate: (u) => gone.push(u),
  });
  assert.deepEqual(gone, [url]);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://www.onlyworlds.com/signin/authorize');
  assert.equal(u.searchParams.get('client_id'), 'atlas');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://atlas.onlyworlds.com/signin/callback');
  assert.equal(u.searchParams.get('state'), state);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  const record = JSON.parse(storage.get('ow_signin:atlas'));
  assert.equal(record.state, state);
  assert.ok(record.verifier.length >= 43 && record.verifier.length <= 128);
  assert.equal(u.searchParams.get('code_challenge'), await pkceChallenge(record.verifier));
  assert.deepEqual(record.resume, { open: 'w1' });
  assert.equal(record.redirectUri, 'https://atlas.onlyworlds.com/signin/callback');
  await assert.rejects(client.signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'http://atlas.onlyworlds.com/cb', storage, navigate: false }), TypeError);
  await assert.rejects(client.signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/cb', navigate: false }), /storage/);
});

test('with no Web Crypto global (Node 18 started without its flag) the sign-in refuses by name: nothing stored, nothing opened', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try {
    const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
    const storage = memory();
    const gone = [];
    await assert.rejects(
      client.signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', storage, navigate: (u) => gone.push(u) }),
      (e) => e instanceof TypeError && /Web Crypto/.test(e.message),
    );
    assert.equal(storage.map.size, 0);
    assert.deepEqual(gone, []);
    await assert.rejects(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), /Web Crypto/);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    else delete globalThis.crypto;
  }
  assert.notEqual(globalThis.crypto, undefined);
});

async function begun(storage) {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const { state } = await client.signInWithOnlyWorlds({
    clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', resume: { open: 'w1' }, storage, navigate: false,
  });
  return state;
}

test('completeSignIn trades the code once with the five body keys and no credential, returns token, account and resume, clears the record', async () => {
  const storage = memory();
  const state = await begun(storage);
  const verifier = JSON.parse(storage.get('ow_signin:atlas')).verifier;
  const calls = [];
  const client = new OwV2Client({ fetch: fetchStub(200, { token: 'ow_a_new', token_id: 't1', token_type: 'bearer', account: { id: 'u1', username: 'ann' } }, calls) });
  const got = await client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${state}` });
  assert.deepEqual(got, { token: 'ow_a_new', tokenId: 't1', expiresAt: null, tokenType: 'bearer', account: { id: 'u1', username: 'ann' }, scope: null, resume: { open: 'w1' }, aiToken: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/auth/token`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    grant_type: 'authorization_code', code: 'c1', code_verifier: verifier, client_id: 'atlas', redirect_uri: 'https://atlas.onlyworlds.com/signin/callback',
  });
  const headerNames = Object.keys(calls[0].init.headers).map((h) => h.toLowerCase());
  assert.ok(!headerNames.some((h) => ['api-key', 'api-pin', 'authorization'].includes(h)));
  assert.equal(storage.get('ow_signin:atlas'), null);
});

test('completeSignIn gives tokenId null when the server sends no token_id (an older keel), never a made-up id', async () => {
  for (const tokenId of [undefined, '', 7]) {
    const storage = memory();
    const state = await begun(storage);
    const answer = { token: 'ow_a_new', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
    if (tokenId !== undefined) answer.token_id = tokenId;
    const client = new OwV2Client({ fetch: fetchStub(200, answer, []) });
    const got = await client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${state}` });
    assert.equal(got.tokenId, null);
  }
});

test('completeSignIn carries expires_at as expiresAt, as served; absent, empty or not a string is null', async () => {
  for (const [served, want] of [['2026-11-03T18:00:00Z', '2026-11-03T18:00:00Z'], [null, null], [undefined, null], ['', null], [7, null]]) {
    const storage = memory();
    const state = await begun(storage);
    const answer = { token: 'ow_a_new', token_id: 't1', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
    if (served !== undefined) answer.expires_at = served;
    const client = new OwV2Client({ fetch: fetchStub(200, answer, []) });
    const got = await client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${state}` });
    assert.equal(got.expiresAt, want);
  }
});

test('completeSignIn refuses a wrong state, a wrong page and a missing record before sending; a wrong state leaves the sign-in pending, a matching one ends it', async () => {
  for (const [url, why, kept] of [
    ['https://atlas.onlyworlds.com/signin/callback?code=c1&state=other', 'state', true],
    ['https://atlas.onlyworlds.com/signin/callback?code=c1', 'no state', true],
    ['https://evil.example/signin/callback?code=c1&state=STATE', 'page', false],
    ['https://evil.example/signin/callback?error=access_denied&state=STATE', 'a cancel at another page', false],
    ['https://atlas.onlyworlds.com/signin/callback?error=access_denied&state=other', 'a cancel with another state', true],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const calls = [];
    const client = new OwV2Client({ fetch: fetchStub(200, {}, calls) });
    const err = await client.completeSignIn({ clientId: 'atlas', storage, url: url.replace('STATE', state) }).catch((e) => e);
    assert.ok(err instanceof OwSignInError, why);
    assert.equal(err.reason, 'state_mismatch', why);
    assert.equal(calls.length, 0, why);
    assert.equal(storage.get('ow_signin:atlas') !== null, kept, why);
  }
  const client = new OwV2Client({ fetch: fetchStub(200, {}, []) });
  const err = await client.completeSignIn({ clientId: 'atlas', storage: memory(), url: 'https://atlas.onlyworlds.com/signin/callback?code=c1&state=s' }).catch((e) => e);
  assert.equal(err.reason, 'state_mismatch');
});

// keel's Cancel (portal/signin.py: decision=cancel redirects to the verified address with
// error=access_denied and the state, no code).
test('completeSignIn reads keel\'s Cancel as cancelled with the resume, sends nothing and ends the sign-in; another error is failed with its code', async () => {
  for (const [query, reason, code] of [
    ['error=access_denied&state=STATE', 'cancelled', undefined],
    ['state=STATE&error=access_denied', 'cancelled', undefined],
    ['error=server_error&state=STATE', 'failed', 'server_error'],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const calls = [];
    const client = new OwV2Client({ fetch: fetchStub(200, {}, calls) });
    const url = `https://atlas.onlyworlds.com/signin/callback?${query.replace('STATE', state)}`;
    const err = await client.completeSignIn({ clientId: 'atlas', storage, url }).catch((e) => e);
    assert.ok(err instanceof OwSignInError, query);
    assert.equal(err.reason, reason, query);
    assert.equal(err.code, code, query);
    assert.deepEqual(err.resume, { open: 'w1' }, query);
    assert.equal(calls.length, 0, query);
    assert.equal(storage.get('ow_signin:atlas'), null, query);
  }
});

test('every completeSignIn refusal carries the resume from the pending record; none pending is null', async () => {
  // Another state (Back to an older sign-in page, then Continue or Cancel): refused, the record kept, its resume handed back.
  for (const query of ['code=c1&state=other', 'error=access_denied&state=other', 'code=c1']) {
    const storage = memory();
    await begun(storage);
    const err = await new OwV2Client({ fetch: fetchStub(200, {}, []) })
      .completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?${query}` }).catch((e) => e);
    assert.equal(err.reason, 'state_mismatch', query);
    assert.deepEqual(err.resume, { open: 'w1' }, query);
    assert.notEqual(storage.get('ow_signin:atlas'), null, query);
  }
  // The state matches but the page is another, or no code came back: the sign-in ends, the resume comes back.
  for (const [url, reason] of [
    ['https://evil.example/signin/callback?code=c1&state=STATE', 'state_mismatch'],
    ['https://atlas.onlyworlds.com/signin/callback?state=STATE', 'state_mismatch'],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const err = await new OwV2Client({ fetch: fetchStub(200, {}, []) }).completeSignIn({ clientId: 'atlas', storage, url: url.replace('STATE', state) }).catch((e) => e);
    assert.equal(err.reason, reason, url);
    assert.deepEqual(err.resume, { open: 'w1' }, url);
    assert.equal(storage.get('ow_signin:atlas'), null, url);
  }
  // keel's refusals of the exchange and no connection at all: the resume comes back with each.
  for (const [fetchImpl, reason] of [
    [fetchStub(400, { error: { code: 'invalid_grant' } }, []), 'invalid_grant'],
    [fetchStub(429, { error: { code: 'rate_limited' } }, []), 'rate_limited'],
    [fetchStub(500, { error: { code: 'api_error' } }, []), 'failed'],
    [async () => { throw new TypeError('network'); }, 'offline'],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const err = await new OwV2Client({ fetch: fetchImpl }).completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${state}` }).catch((e) => e);
    assert.equal(err.reason, reason);
    assert.deepEqual(err.resume, { open: 'w1' }, reason);
  }
  // No sign-in pending: null, never absent.
  const err = await new OwV2Client({ fetch: fetchStub(200, {}, []) })
    .completeSignIn({ clientId: 'atlas', storage: memory(), url: 'https://atlas.onlyworlds.com/signin/callback?code=c1&state=s' }).catch((e) => e);
  assert.equal(err.reason, 'state_mismatch');
  assert.ok('resume' in err);
  assert.equal(err.resume, null);
  // A sign-in begun with no resume hands back null.
  const storage = memory();
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  await client.signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', storage, navigate: false });
  const bare = await client.completeSignIn({ clientId: 'atlas', storage, url: 'https://atlas.onlyworlds.com/signin/callback?code=c1&state=other' }).catch((e) => e);
  assert.equal(bare.resume, null);
});

test('completeSignIn takes a Cancel\'s error out of the address bar with its state, and keeps the rest of the query', async () => {
  const saved = { history: Object.getOwnPropertyDescriptor(globalThis, 'history'), location: Object.getOwnPropertyDescriptor(globalThis, 'location') };
  const replaced = [];
  Object.defineProperty(globalThis, 'history', { configurable: true, value: { state: null, replaceState: (s, t, u) => replaced.push(u) } });
  try {
    const storage = memory();
    const state = await begun(storage);
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: `https://atlas.onlyworlds.com/signin/callback?error=access_denied&state=${state}&keep=1` } });
    const err = await new OwV2Client({ fetch: fetchStub(200, {}, []) }).completeSignIn({ clientId: 'atlas', storage }).catch((e) => e);
    assert.equal(err.reason, 'cancelled');
    assert.deepEqual(replaced, ['https://atlas.onlyworlds.com/signin/callback?keep=1']);
  } finally {
    for (const [name, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, name, d); else delete globalThis[name];
    }
  }
});

test('OwSignInError takes resume and refuses an unknown option', () => {
  assert.deepEqual(new OwSignInError('cancelled', 'x', { resume: { a: 1 } }).resume, { a: 1 });
  assert.equal(new OwSignInError('cancelled', 'x', { resume: null }).resume, null);
  assert.equal('resume' in new OwSignInError('failed', 'x'), false);
  assert.throws(() => new OwSignInError('failed', 'x', { resumes: 1 }), TypeError);
});

// A native app's return addresses (RFC 8252), as keel takes them at authorize (accounts/signin.py:
// native_uri_problem, _loopback_problem, return_matches): a loopback literal with the port the app
// bound, or a custom scheme exactly as registered.
const NATIVE_OK = [
  'http://127.0.0.1:53682/onlyworlds-signin',
  'http://[::1]:53682/onlyworlds-signin',
  'http://127.0.0.1:1/',
  'http://127.0.0.1:65535/a/b',
  'obsidian://onlyworlds-signin',
  'com.example.app://signin/done',
  'https://atlas.onlyworlds.com/signin/callback',
  'https://atlas.onlyworlds.com:8443/signin/callback',
];
const NATIVE_REFUSED = [
  ['http://localhost:53682/onlyworlds-signin', /localhost/],
  ['http://LOCALHOST:53682/onlyworlds-signin', /localhost/],
  ['http://127.0.0.1/onlyworlds-signin', /no port/],
  ['http://[::1]/onlyworlds-signin', /no port/],
  ['http://127.0.0.1:0/cb', /port/],
  ['http://127.0.0.1:65536/cb', /port/],
  ['http://127.0.0.1:080/cb', /port/],
  ['http://127.0.0.1:+80/cb', /port/],
  ['http://127.0.0.1:/cb', /port/],
  ['http://127.0.0.1:53682', /no path/],
  ['http://10.0.0.1:53682/cb', /not a loopback/],
  ['http://atlas.onlyworlds.com/cb', /not a loopback/],
  ['http://user@127.0.0.1:53682/cb', /userinfo/],
  ['https://user@atlas.onlyworlds.com/cb', /userinfo/],
  ['obsidian://user@onlyworlds-signin', /userinfo/],
  ['obsidian://onlyworlds-signin#x', /fragment/],
  ['https://atlas.onlyworlds.com/cb#x', /fragment/],
  ['obsidian://onlyworlds-signin?x=1', /query/],
  ['Obsidian://onlyworlds-signin', /upper-case scheme/],
  ['1app://x', /scheme of characters/],
  ['ob_sidian://x', /scheme of characters/],
  ['javascript://x', /never use/],
  ['data://x', /never use/],
  ['file:///etc/passwd', /never use/],
  ['obsidian://', /no path/],
  ['obsidian:onlyworlds-signin', /redirectUri is not <scheme>:\/\/<path>/],
  ['obsidian://a/../b', /dot segment/],
  ['http://127.0.0.1:53682/a/./b', /dot segment/],
  ['https://Atlas.onlyworlds.com/cb', /upper-case host/],
  ['https://atlas.onlyworlds.com', /no path/],
  ['obsidian://onlyworlds signin', /whitespace/],
  ['', /not a string/],
];

test('signInWithOnlyWorlds takes a native app\'s loopback address with its port and its own scheme, and sends each as given', async () => {
  for (const redirectUri of NATIVE_OK) {
    const storage = memory();
    const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
    const { url } = await client.signInWithOnlyWorlds({ clientId: 'obsidian', redirectUri, storage, navigate: false });
    assert.equal(new URL(url).searchParams.get('redirect_uri'), redirectUri, redirectUri);
    assert.equal(JSON.parse(storage.get('ow_signin:obsidian')).redirectUri, redirectUri, redirectUri);
  }
});

test('signInWithOnlyWorlds refuses localhost, a loopback without its port, userinfo, a fragment, the reserved schemes, and says what it takes', async () => {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const accepted = [];
  for (const [redirectUri, why] of NATIVE_REFUSED) {
    const storage = memory();
    const err = await client.signInWithOnlyWorlds({ clientId: 'obsidian', redirectUri, storage, navigate: false }).catch((e) => e);
    if (!(err instanceof TypeError)) { accepted.push(redirectUri); continue; }
    assert.match(err.message, why, redirectUri);
    assert.match(err.message, /https:\/\/<host>\/<path>.*http:\/\/127\.0\.0\.1:<port>\/<path>.*<scheme>:\/\/<path>/, redirectUri);
    assert.equal(storage.get('ow_signin:obsidian'), null, redirectUri);
  }
  assert.deepEqual(accepted, []);
  await assert.rejects(client.signInWithOnlyWorlds({ clientId: 'obsidian', redirectUri: 7, storage: memory(), navigate: false }), /not a string/);
});

async function begunAt(storage, redirectUri) {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const { state } = await client.signInWithOnlyWorlds({ clientId: 'obsidian', redirectUri, storage, navigate: false });
  return state;
}

test('completeSignIn holds the scheme, the host with its port and the path exactly: another scheme, port or host is state_mismatch', async () => {
  const answer = { token: 'ow_a_new', token_id: 't1', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
  for (const [registered, here, ok] of [
    ['obsidian://onlyworlds-signin', 'obsidian://onlyworlds-signin?code=c1&state=STATE', true],
    ['obsidian://onlyworlds-signin', 'evil://onlyworlds-signin?code=c1&state=STATE', false],
    ['obsidian://onlyworlds-signin', 'obsidian://elsewhere?code=c1&state=STATE', false],
    ['obsidian://onlyworlds-signin', 'obsidian://onlyworlds-signin/?code=c1&state=STATE', false],
    ['com.example.app://signin/done', 'com.example.app://signin/done?code=c1&state=STATE', true],
    ['com.example.app://signin/done', 'com.example.other://signin/done?code=c1&state=STATE', false],
    ['http://127.0.0.1:53682/onlyworlds-signin', 'http://127.0.0.1:53682/onlyworlds-signin?code=c1&state=STATE', true],
    ['http://127.0.0.1:53682/onlyworlds-signin', 'http://127.0.0.1:53683/onlyworlds-signin?code=c1&state=STATE', false],
    ['http://127.0.0.1:53682/onlyworlds-signin', 'http://[::1]:53682/onlyworlds-signin?code=c1&state=STATE', false],
    ['http://127.0.0.1:53682/onlyworlds-signin', 'http://127.0.0.1:53682/onlyworlds-signin/?code=c1&state=STATE', false],
    ['http://[::1]:53682/onlyworlds-signin', 'http://[::1]:53682/onlyworlds-signin?code=c1&state=STATE', true],
    ['https://atlas.onlyworlds.com/signin/callback', 'https://atlas.onlyworlds.com/signin/callback/?code=c1&state=STATE', true],
    ['https://atlas.onlyworlds.com/signin/callback', 'https://atlas.onlyworlds.com:8443/signin/callback?code=c1&state=STATE', false],
    ['https://atlas.onlyworlds.com/signin/callback', 'https://evil.example/signin/callback?code=c1&state=STATE', false],
  ]) {
    const storage = memory();
    const state = await begunAt(storage, registered);
    const calls = [];
    const client = new OwV2Client({ fetch: fetchStub(200, answer, calls) });
    const got = await client.completeSignIn({ clientId: 'obsidian', storage, url: here.replace('STATE', state) }).catch((e) => e);
    const what = `${registered} at ${here}`;
    if (ok) {
      assert.equal(got.token, 'ow_a_new', what);
      assert.equal(JSON.parse(calls[0].init.body).redirect_uri, registered, what);
    } else {
      assert.ok(got instanceof OwSignInError, what);
      assert.equal(got.reason, 'state_mismatch', what);
      assert.equal(calls.length, 0, what);
    }
  }
});

test('completeSignIn cleans the address bar only when the address came from location: a url passed in leaves history alone', async () => {
  const answer = { token: 'ow_a_new', token_id: 't1', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
  const saved = { history: Object.getOwnPropertyDescriptor(globalThis, 'history'), location: Object.getOwnPropertyDescriptor(globalThis, 'location') };
  const replaced = [];
  Object.defineProperty(globalThis, 'history', { configurable: true, value: { state: null, replaceState: (s, t, u) => replaced.push(u) } });
  try {
    const storage = memory();
    const state = await begunAt(storage, 'obsidian://onlyworlds-signin');
    const client = new OwV2Client({ fetch: fetchStub(200, answer, []) });
    const got = await client.completeSignIn({ clientId: 'obsidian', storage, url: `obsidian://onlyworlds-signin?code=c1&state=${state}` });
    assert.equal(got.token, 'ow_a_new');
    assert.deepEqual(replaced, []);

    // From location, the same history is cleaned of code and state.
    const webStorage = memory();
    const webState = await begunAt(webStorage, 'https://atlas.onlyworlds.com/signin/callback');
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${webState}&keep=1` } });
    const web = await client.completeSignIn({ clientId: 'obsidian', storage: webStorage });
    assert.equal(web.token, 'ow_a_new');
    assert.deepEqual(replaced, ['https://atlas.onlyworlds.com/signin/callback?keep=1']);
  } finally {
    for (const [name, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, name, d); else delete globalThis[name];
    }
  }
});

test('completeSignIn reads keel\'s refusals: 400 invalid_grant, 429 rate_limited, anything else failed', async () => {
  for (const [status, body, reason] of [
    [400, { error: { code: 'invalid_grant', message: 'spent' } }, 'invalid_grant'],
    [429, { error: { code: 'rate_limited' } }, 'rate_limited'],
    [500, { error: { code: 'api_error' } }, 'failed'],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const client = new OwV2Client({ fetch: fetchStub(status, body, []) });
    const err = await client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c1&state=${state}` }).catch((e) => e);
    assert.ok(err instanceof OwSignInError);
    assert.equal(err.reason, reason);
    assert.equal(err.status, status);
    assert.equal(storage.get('ow_signin:atlas'), null);
  }
});

test('a forged custom-scheme return does not cancel a sign-in in flight: the real return still signs in', async () => {
  const storage = memory();
  const state = await begunAt(storage, 'obsidian://onlyworlds-signin');
  const calls = [];
  const answer = { token: 'ow_a_new', token_id: 't1', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
  const client = new OwV2Client({ fetch: fetchStub(200, answer, calls) });
  for (const forged of ['obsidian://onlyworlds-signin?code=evil&state=guess', 'obsidian://onlyworlds-signin?code=evil']) {
    const err = await client.completeSignIn({ clientId: 'obsidian', storage, url: forged }).catch((e) => e);
    assert.equal(err.reason, 'state_mismatch', forged);
    assert.notEqual(storage.get('ow_signin:obsidian'), null, forged);
  }
  assert.equal(calls.length, 0);
  const got = await client.completeSignIn({ clientId: 'obsidian', storage, url: `obsidian://onlyworlds-signin?code=c1&state=${state}` });
  assert.equal(got.token, 'ow_a_new');
  assert.equal(calls.length, 1);
  assert.equal(storage.get('ow_signin:obsidian'), null);
});

// scope: 'world:read' (keel's read-only sign-in): on the authorize request, read back from the answer.
async function begunReadOnly(storage) {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const { url, state } = await client.signInWithOnlyWorlds({
    clientId: 'maps', redirectUri: 'https://maps.onlyworlds.com/signin/callback', storage, navigate: false, scope: 'world:read',
  });
  return { url, state };
}

test('signInWithOnlyWorlds sends scope=world:read on the authorize request when asked, and none when left out', async () => {
  const storage = memory();
  const { url } = await begunReadOnly(storage);
  assert.equal(new URL(url).searchParams.get('scope'), 'world:read');
  assert.equal(JSON.parse(storage.get('ow_signin:maps')).scope, 'world:read');
  const plain = memory();
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const { url: u2 } = await client.signInWithOnlyWorlds({ clientId: 'maps', redirectUri: 'https://maps.onlyworlds.com/signin/callback', storage: plain, navigate: false });
  assert.equal(new URL(u2).searchParams.has('scope'), false);
  assert.equal('scope' in JSON.parse(plain.get('ow_signin:maps')), false);
});

test('signInWithOnlyWorlds refuses any scope but world:read before anything is kept or sent', async () => {
  for (const scope of ['read', 'world:write', 'World:Read', '', null, ['world:read'], 1]) {
    const storage = memory();
    const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
    await assert.rejects(
      client.signInWithOnlyWorlds({ clientId: 'maps', redirectUri: 'https://maps.onlyworlds.com/signin/callback', storage, navigate: false, scope }),
      TypeError, JSON.stringify(scope));
    assert.equal(storage.map.size, 0, JSON.stringify(scope));
  }
});

test('completeSignIn answers the scope the server granted: world:read when the answer says so, else null; the exchange body carries no scope', async () => {
  for (const [served, want] of [['world:read', 'world:read'], [undefined, null], ['world:write', null], ['', null]]) {
    const storage = memory();
    const { state } = await begunReadOnly(storage);
    const calls = [];
    const answer = { token: 'ow_a_ro', token_id: 't2', token_type: 'bearer', account: { id: 'u1', username: 'ann' } };
    if (served !== undefined) answer.scope = served;
    const client = new OwV2Client({ fetch: fetchStub(200, answer, calls) });
    const got = await client.completeSignIn({ clientId: 'maps', storage, url: `https://maps.onlyworlds.com/signin/callback?code=c2&state=${state}` });
    assert.equal(got.scope, want, String(served));
    assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(), ['client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
  }
});

test('completeSignIn refuses aiUses beside a read-only sign-in before anything is spent, and the same return then completes without it', async () => {
  const storage = memory();
  const { state } = await begunReadOnly(storage);
  const calls = [];
  const client = new OwV2Client({ fetch: fetchStub(200, { token: 'ow_a_ro', token_id: 't3', token_type: 'bearer', scope: 'world:read', account: { id: 'u1', username: 'ann' } }, calls) });
  const url = `https://maps.onlyworlds.com/signin/callback?code=c3&state=${state}`;
  await assert.rejects(client.completeSignIn({ clientId: 'maps', storage, url, aiUses: ['ask'] }), TypeError);
  assert.equal(calls.length, 0);
  assert.notEqual(storage.get('ow_signin:maps'), null);
  const got = await client.completeSignIn({ clientId: 'maps', storage, url });
  assert.equal(got.scope, 'world:read');
  assert.equal(calls.length, 1);
});
