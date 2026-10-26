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
  assert.deepEqual(got, { token: 'ow_a_new', tokenId: 't1', tokenType: 'bearer', account: { id: 'u1', username: 'ann' }, resume: { open: 'w1' } });
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

test('completeSignIn refuses a wrong state, a wrong page and a missing record before sending; the record goes either way', async () => {
  for (const [url, why] of [
    ['https://atlas.onlyworlds.com/signin/callback?code=c1&state=other', 'state'],
    ['https://evil.example/signin/callback?code=c1&state=STATE', 'page'],
  ]) {
    const storage = memory();
    const state = await begun(storage);
    const calls = [];
    const client = new OwV2Client({ fetch: fetchStub(200, {}, calls) });
    const err = await client.completeSignIn({ clientId: 'atlas', storage, url: url.replace('STATE', state) }).catch((e) => e);
    assert.ok(err instanceof OwSignInError, why);
    assert.equal(err.reason, 'state_mismatch', why);
    assert.equal(calls.length, 0, why);
    assert.equal(storage.get('ow_signin:atlas'), null, why);
  }
  const client = new OwV2Client({ fetch: fetchStub(200, {}, []) });
  const err = await client.completeSignIn({ clientId: 'atlas', storage: memory(), url: 'https://atlas.onlyworlds.com/signin/callback?code=c1&state=s' }).catch((e) => e);
  assert.equal(err.reason, 'state_mismatch');
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
