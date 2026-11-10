/**
 * The AI door: client.aiUses reads GET /account/ai, client.ai calls POST /account/ai/{use} with the use's
 * own body as given, the client's name, an Idempotency-Key when asked, and reads the replay header. Every
 * refusal is thrown once, never retried. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwApiError } from '../dist/index.js';

function fake(script) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = typeof script === 'function' ? script(calls.length) : script;
    return { ok: r.status < 300, status: r.status, headers: new Headers(r.headers ?? {}), async text() { return JSON.stringify(r.body); }, async json() { return r.body; } };
  };
  return { fetch, calls };
}

const USE = {
  slug: 'ask', owner: 'lantern', provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low',
  prompt_sha256: 'a'.repeat(64), needs_world: true, input_caps: { question: 500, context: 12000 }, output_cap: 600,
  structured: false, price_tokens: null, ceiling: null, calls_left: null, on: true, can_pay: true,
};
const METER = { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 300, output_tokens: 12 }, remaining: 49, tokens_remaining: 49000, token_rating: 50000, paid_by: 'rating', use_remaining: null };
const ASK = { world_id: 'w1', question: 'Who holds Balkonon?', context: ['Mira Thel (character)'] };

test('client.aiUses: GET /account/ai with the account Bearer, the uses as served', async () => {
  const f = fake({ status: 200, body: { uses: [USE] } });
  const uses = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).aiUses();
  const { url, init } = f.calls[0];
  assert.ok(url.endsWith('/api/v2/account/ai'), url);
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.equal(init.headers['X-OW-Client'], undefined, 'a read carries no client name');
  assert.deepEqual(uses, [USE]);
});

test('client.ai: POST /account/ai/{use}, the body sent as given, the client name, no key unless asked', async () => {
  const f = fake({ status: 200, body: { answer: 'Mira Thel.', ...METER } });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch, client: 'lantern' });
  const r = await c.ai('ask', ASK);
  const { url, init } = f.calls[0];
  assert.ok(url.endsWith('/api/v2/account/ai/ask'), url);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.equal(init.headers['X-OW-Client'], 'lantern');
  assert.equal(init.headers['Idempotency-Key'], undefined);
  assert.equal(init.headers['X-OW-Agent'], undefined, 'the document declares no agent header on the door');
  assert.deepEqual(JSON.parse(init.body), ASK);
  assert.equal(r.answer, 'Mira Thel.');
  assert.equal(r.use_remaining, null);
  assert.equal(r.wasReplay, false);
});

test('client.ai: any listed use by its slug, its body untouched', async () => {
  const f = fake({ status: 200, body: { rows: [], ...METER, use_remaining: 2 } });
  const body = { world_id: 'w1', notes: ['a note', { text: '', image_url: 'https://media.onlyworlds.com/u/w1/x.webp' }], slice: [{ id: 'e1', type: 'character', name: 'Mira' }], extra_key: 1 };
  const r = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).ai('sub-helm', body);
  assert.ok(f.calls[0].url.endsWith('/api/v2/account/ai/sub-helm'));
  assert.deepEqual(JSON.parse(f.calls[0].init.body), body, 'the use\'s own body: nothing renamed, nothing dropped');
  assert.equal(r.use_remaining, 2);
});

test('client.ai: the idempotency key is sent, and a replay reads wasReplay', async () => {
  const f = fake({ status: 200, body: { answer: 'x', ...METER }, headers: { 'idempotent-replay': 'true' } });
  const r = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).ai('ask', ASK, { idempotencyKey: 'k-1' });
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], 'k-1');
  assert.equal(r.wasReplay, true);
});

test('client.ai and aiUses: refused before sending', async () => {
  const f = fake({ status: 200, body: {} });
  const acct = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const world = new OwV2Client({ apiKey: 'ow_w_key', fetch: f.fetch });
  await assert.rejects(world.ai('ask', ASK), TypeError);
  await assert.rejects(world.aiUses(), TypeError);
  for (const slug of ['', 'ask/../sort', 'ask%2Fx', 'a b', '../ask', 'ask?x=1', 7, null]) {
    await assert.rejects(acct.ai(slug, ASK), (e) => e instanceof TypeError && /one path segment/.test(e.message), String(slug));
  }
  for (const body of [null, [], 'text', 3, undefined]) {
    await assert.rejects(acct.ai('ask', body), TypeError, String(body));
  }
  for (const idempotencyKey of ['', 'x'.repeat(201), 5, null]) {
    await assert.rejects(acct.ai('ask', ASK, { idempotencyKey }), TypeError, String(idempotencyKey));
  }
  await assert.rejects(acct.ai('ask', ASK, { idempotencykey: 'k' }), TypeError, 'an unknown option is refused by name');
  await assert.rejects(acct.aiUses({ limit: 5 }), TypeError);
  assert.equal(f.calls.length, 0);
  // the cap is the document's: 200 characters pass
  await acct.ai('ask', ASK, { idempotencyKey: 'x'.repeat(200) });
  assert.equal(f.calls.length, 1);
  // counted in code points, as keel counts: 101 astral characters are 202 UTF-16 units and pass the cap
  const astral = String.fromCodePoint(0x1f30d);
  await assert.rejects(acct.ai('ask', ASK, { idempotencyKey: astral.repeat(201) }), TypeError);
  const err = await acct.ai('ask', ASK, { idempotencyKey: astral.repeat(101) }).catch((e) => e);
  assert.ok(!(err instanceof TypeError && /idempotencyKey/.test(err.message)), 'a key of 101 code points is not refused by the cap');
});

test('client.ai: answer_not_parsed carries the refused answers in order, rows out of shape left out', async () => {
  const refusals = [
    { word: 'not_json', stop_reason: 'end_turn', output_tokens: 212 },
    { word: 'bogus', stop_reason: 7, output_tokens: 3 },
    { word: 'empty', stop_reason: 'max_tokens', output_tokens: 1024 },
    null,
  ];
  const body = { error: { type: 'invalid_request', code: 'answer_not_parsed', param: 'answer', message: 'm', refusals } };
  const f = fake({ status: 422, body });
  const err = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).ai('lens', { world_id: 'w', sentence: 's' }).catch((e) => e);
  assert.ok(err instanceof OwApiError && err.isAnswerNotParsed);
  assert.deepEqual(err.refusals, [
    { word: 'not_json', stop_reason: 'end_turn', output_tokens: 212 },
    { word: 'empty', stop_reason: 'max_tokens', output_tokens: 1024 },
  ]);
  // no list: undefined; another code carrying a list: undefined
  const bare = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: fake({ status: 422, body: { error: { type: 'x', code: 'answer_not_parsed', param: 'answer', message: 'm' } } }).fetch })
    .ai('lens', { world_id: 'w', sentence: 's' }).catch((e) => e);
  assert.equal(bare.refusals, undefined);
  const other = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: fake({ status: 422, body: { error: { type: 'x', code: 'invalid_request', message: 'm', refusals } } }).fetch })
    .ai('lens', { world_id: 'w', sentence: 's' }).catch((e) => e);
  assert.equal(other.refusals, undefined);
});

test('client.ai: each refusal by its code, thrown once, never retried', async () => {
  const getters = ['isUseCeiling', 'isUseInFlight', 'isQuotaExceeded', 'isRateLimited', 'isOwnKeyRefused', 'isAskUnavailable', 'isAskFailed', 'isAnswerNotParsed'];
  const cases = [
    [429, 'use_ceiling', 'isUseCeiling', 'use', '7200'],
    [429, 'use_in_flight', 'isUseInFlight', 'use', '2'],
    [429, 'quota_exceeded', 'isQuotaExceeded', null, '3600'],
    [429, 'too_many_requests', 'isRateLimited', null, '30'],
    [422, 'own_key_refused', 'isOwnKeyRefused', null, null],
    [503, 'ask_unavailable', 'isAskUnavailable', 'use', null],
    [502, 'ask_failed', 'isAskFailed', null, null],
    [422, 'answer_not_parsed', 'isAnswerNotParsed', 'answer', null],
  ];
  for (const [status, code, getter, param, retry] of cases) {
    const f = fake({ status, body: { error: { type: 'x', code, param, message: 'm' } }, headers: retry ? { 'Retry-After': retry } : {} });
    await assert.rejects(new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).ai('ask', ASK, { idempotencyKey: 'k' }), (e) => {
      const others = getters.filter((g) => g !== getter);
      return e instanceof OwApiError && e[getter] === true && others.every((g) => !e[g]) && e.param === param
        && (retry === null || e.retryAfter === Number(retry));
    }, code);
    assert.equal(f.calls.length, 1, `${code}: sent once, never retried`);
  }
  // a 409 in flight on the key is thrown as it came, the same key never re-sent by the client
  const f = fake({ status: 409, body: { error: { type: 'x', code: 'idempotency_in_flight', message: 'm' } }, headers: { 'Retry-After': '1' } });
  await assert.rejects(new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch }).ai('ask', ASK, { idempotencyKey: 'k' }), (e) => e instanceof OwApiError && e.status === 409 && e.code === 'idempotency_in_flight' && !e.isUseInFlight);
  assert.equal(f.calls.length, 1);
});
