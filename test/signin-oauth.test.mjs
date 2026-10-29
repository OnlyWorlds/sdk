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
  assert.deepEqual(got, { token: 'ow_a_new', tokenId: 't1', expiresAt: null, tokenType: 'bearer', account: { id: 'u1', username: 'ann' }, resume: { open: 'w1' } });
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
    ['https://atlas.onlyworlds.com/signin/callback?error=access_denied&state=STATE', 'cancelled', false],
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
