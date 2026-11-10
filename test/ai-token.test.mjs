/**
 * The AI door token: completeSignIn's aiUses and aiLifetimeMinutes (sent in the code exchange, the
 * answer's ai_token read as aiToken), mintAiToken (POST /account/tokens with ai_uses), and the two
 * refusals' predicates. Every list the SDK can see is wrong is refused before anything is sent, and in
 * completeSignIn before the pending sign-in is touched, so the code is never spent on it. Runs against
 * the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwApiError } from '../dist/index.js';

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

async function begun(storage) {
  const client = new OwV2Client({ fetch: async () => { throw new Error('no fetch expected'); } });
  const { state } = await client.signInWithOnlyWorlds({
    clientId: 'subs', redirectUri: 'https://subs.onlyworlds.com/visit/', storage, navigate: false,
  });
  return state;
}

const SIGNED = { token: 'ow_a_acct', token_id: 't1', token_type: 'bearer', expires_at: null, account: { id: 'u1', username: 'ann' } };
const AI = { token: 'ow_a_narrow', token_id: 't2', token_type: 'bearer', audience: 'ai', ai_uses: ['ask', 'sort'], expires_at: '2026-11-10T00:00:00+00:00' };

test('completeSignIn with aiUses: the exchange sends ai_uses and ai_lifetime_minutes, and aiToken comes back beside the account token', async () => {
  const storage = memory();
  const state = await begun(storage);
  const calls = [];
  const client = new OwV2Client({ fetch: fetchStub(200, { ...SIGNED, ai_token: AI }, calls) });
  const got = await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}`, aiUses: ['ask', 'sort'], aiLifetimeMinutes: 480 });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.ai_uses, ['ask', 'sort']);
  assert.equal(sent.ai_lifetime_minutes, 480);
  assert.deepEqual(Object.keys(sent).sort(), ['ai_lifetime_minutes', 'ai_uses', 'client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
  assert.equal(got.token, 'ow_a_acct');
  assert.equal(got.tokenId, 't1');
  assert.deepEqual(got.aiToken, { token: 'ow_a_narrow', tokenId: 't2', tokenType: 'bearer', audience: 'ai', aiUses: ['ask', 'sort'], expiresAt: '2026-11-10T00:00:00+00:00' });
});

test('completeSignIn without aiUses sends neither key, and aiToken is null even when the server answers one', async () => {
  const storage = memory();
  const state = await begun(storage);
  const calls = [];
  const client = new OwV2Client({ fetch: fetchStub(200, { ...SIGNED, ai_token: AI }, calls) });
  const got = await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}` });
  const sent = JSON.parse(calls[0].init.body);
  assert.ok(!('ai_uses' in sent) && !('ai_lifetime_minutes' in sent));
  assert.equal(got.aiToken, null);
});

test('completeSignIn with aiUses and a lifetime left out sends ai_uses only', async () => {
  const storage = memory();
  const state = await begun(storage);
  const calls = [];
  const client = new OwV2Client({ fetch: fetchStub(200, { ...SIGNED, ai_token: AI }, calls) });
  await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}`, aiUses: ['ask'] });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.ai_uses, ['ask']);
  assert.ok(!('ai_lifetime_minutes' in sent));
});

test('completeSignIn asked for an AI token the answer lacks or malforms: the account token stands, aiToken is null', async () => {
  for (const ai of [undefined, null, {}, { ...AI, token: '' }, { ...AI, token_id: 7 }, { ...AI, ai_uses: 'ask' }, { ...AI, ai_uses: [1] }, { ...AI, expires_at: null }]) {
    const storage = memory();
    const state = await begun(storage);
    const body = ai === undefined ? SIGNED : { ...SIGNED, ai_token: ai };
    const client = new OwV2Client({ fetch: fetchStub(200, body, []) });
    const got = await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}`, aiUses: ['ask'] });
    assert.equal(got.token, 'ow_a_acct', JSON.stringify(ai));
    assert.equal(got.aiToken, null, JSON.stringify(ai));
  }
});

const BAD = [
  [{ aiUses: [] }, /1 to 8/],
  [{ aiUses: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }, /1 to 8/],
  [{ aiUses: 'ask' }, /1 to 8/],
  [{ aiUses: [''] }, /not an AI use/],
  [{ aiUses: ['ask/../sort'] }, /not an AI use/],
  [{ aiUses: ['.ask'] }, /not an AI use/],
  [{ aiUses: [7] }, /not an AI use/],
  [{ aiUses: ['ask'], aiLifetimeMinutes: 0 }, /1 to 1440/],
  [{ aiUses: ['ask'], aiLifetimeMinutes: 1441 }, /1 to 1440/],
  [{ aiUses: ['ask'], aiLifetimeMinutes: 1.5 }, /1 to 1440/],
  [{ aiUses: ['ask'], aiLifetimeMinutes: true }, /1 to 1440/],
  [{ aiUses: ['ask'], aiLifetimeMinutes: '60' }, /1 to 1440/],
  [{ aiLifetimeMinutes: 60 }, /send aiUses too/],
];

test('completeSignIn refuses an AI token list it can see is wrong before sending, and leaves the sign-in pending', async () => {
  for (const [opts, words] of BAD) {
    const storage = memory();
    const state = await begun(storage);
    const pending = storage.get('ow_signin:subs');
    const calls = [];
    const client = new OwV2Client({ fetch: fetchStub(200, SIGNED, calls) });
    const err = await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}`, ...opts }).catch((e) => e);
    assert.ok(err instanceof TypeError, JSON.stringify(opts));
    assert.match(err.message, words, JSON.stringify(opts));
    assert.match(err.message, /Nothing was sent/);
    assert.equal(calls.length, 0, JSON.stringify(opts));
    assert.equal(storage.get('ow_signin:subs'), pending, `${JSON.stringify(opts)}: the pending sign-in is kept`);
  }
});

test('completeSignIn: the server\'s 422 for a use it does not run reads as failed, with its status, code and param', async () => {
  for (const [param, want] of [['ai_uses', 'ai_uses'], ['ai_lifetime_minutes', 'ai_lifetime_minutes'], [undefined, undefined], ['', undefined]]) {
    const storage = memory();
    const state = await begun(storage);
    const error = { type: 'invalid_request_error', code: 'invalid_request', message: 'refused' };
    if (param !== undefined) error.param = param;
    const client = new OwV2Client({ fetch: fetchStub(422, { error }, []) });
    const err = await client.completeSignIn({ clientId: 'subs', storage, url: `https://subs.onlyworlds.com/visit/?code=c1&state=${state}`, aiUses: ['nope'] }).catch((e) => e);
    assert.equal(err.reason, 'failed', String(param));
    assert.equal(err.status, 422, String(param));
    assert.equal(err.code, 'invalid_request', String(param));
    assert.equal(err.param, want, String(param));
  }
});

const MINTED = { id: 't3', name: 'subs, AI uses', last4: 'abcd', last_used_at: null, revoked: false, expires_at: '2026-11-10T00:00:00+00:00', keys_minted: 0, audience: 'ai', ai_uses: ['ask'], token: 'ow_a_minted' };

test('mintAiToken: POST /account/tokens with ai_uses, the lifetime and the name as given, the row with its token as served', async () => {
  const calls = [];
  const client = new OwV2Client({ apiKey: 'ow_a_acct', fetch: fetchStub(201, MINTED, calls) });
  const got = await client.mintAiToken(['ask'], { lifetimeMinutes: 60, name: 'night' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/account/tokens`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ai_uses: ['ask'], ai_lifetime_minutes: 60, name: 'night' });
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bearer ow_a_acct');
  assert.deepEqual(got, MINTED);
  calls.length = 0;
  await client.mintAiToken(['ask']);
  assert.deepEqual(JSON.parse(calls[0].init.body), { ai_uses: ['ask'] });
});

test('mintAiToken refuses before sending: a wrong list, a lifetime out of range, a bad name, an unknown option, a world key', async () => {
  const calls = [];
  const client = new OwV2Client({ apiKey: 'ow_a_acct', fetch: fetchStub(201, MINTED, calls) });
  for (const [opts, words] of BAD) {
    const err = await client.mintAiToken(opts.aiUses, opts.aiLifetimeMinutes === undefined ? {} : { lifetimeMinutes: opts.aiLifetimeMinutes }).catch((e) => e);
    assert.ok(err instanceof TypeError, JSON.stringify(opts));
    assert.match(err.message, opts.aiUses === undefined ? /1 to 8/ : words, JSON.stringify(opts));
  }
  for (const name of [7, 'x'.repeat(256)]) {
    const err = await client.mintAiToken(['ask'], { name }).catch((e) => e);
    assert.ok(err instanceof TypeError && /name/.test(err.message), String(name).slice(0, 10));
  }
  await assert.rejects(client.mintAiToken(['ask'], { lifetime: 60 }), TypeError);
  // no uses at all: never a POST that would mint a full account token
  await assert.rejects(client.mintAiToken(), /1 to 8/);
  await assert.rejects(client.mintAiToken(undefined, { name: 'x' }), /1 to 8/);
  const keyed = new OwV2Client({ apiKey: 'ow_w_key', fetch: fetchStub(201, MINTED, calls) });
  await assert.rejects(keyed.mintAiToken(['ask']), /needs an account token/);
  assert.equal(calls.length, 0);
});

test('isUseNotGranted is the 403 use_not_granted and isWrongAudience the 401 wrong_audience, each on its own', async () => {
  const cases = [
    [403, 'use_not_granted', true, false],
    [401, 'wrong_audience', false, true],
    [403, 'permission_error', false, false],
    [401, 'key_revoked', false, false],
    [404, 'use_not_granted', false, false],
  ];
  for (const [status, code, notGranted, wrongAudience] of cases) {
    const client = new OwV2Client({ apiKey: 'ow_a_narrow', fetch: fetchStub(status, { error: { type: 'permission_error', code, message: 'm', param: 'use' } }, []) });
    const err = await client.ai('sort', { world_id: 'w1', notes: ['a'] }).catch((e) => e);
    assert.ok(err instanceof OwApiError, `${status} ${code}`);
    assert.equal(err.isUseNotGranted, notGranted, `${status} ${code}`);
    assert.equal(err.isWrongAudience, wrongAudience, `${status} ${code}`);
  }
});
