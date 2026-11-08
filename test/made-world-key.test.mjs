/**
 * mintWorldKey's idempotencyKey and signal, and madeWorldKey (GET /api/v2/account/worlds/{id}/keys/made?key=):
 * the mint sends the key as the Idempotency-Key header and is never replayed; the lookup answers the row
 * the mint made (never the key itself), null for the server's one 404, and null for a 405 from a server
 * before the lookup, when that path was only the revoke's. Shapes from the API document's made_world_key.
 * Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwNetworkError } from '../dist/index.js';

function fake(status, body, { raw } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const text = raw !== undefined ? raw : body === undefined ? '' : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: new Headers(), async text() { return text; }, async json() { return JSON.parse(text); } };
  };
  return { fetch, calls };
}

const ROW = { id: '0b8f6c1e-0000-4000-8000-000000000001', name: 'Lantern', last4: 'a1b2', scope: 'WRITE', last_used_at: null, revoked: false, kept: true };
const NOT_FOUND = { error: { type: 'not_found', code: 'not_found', message: 'Not found.', param: null, doc_url: null } };

test('madeWorldKey: GET .../keys/made with the key in the query and the account Bearer; the row comes back', async () => {
  const f = fake(200, ROW);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.madeWorldKey('w1', 'mint 1/a&b'), ROW);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://www.onlyworlds.com/api/v2/account/worlds/w1/keys/made?key=mint%201%2Fa%26b');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.calls[0].init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.equal('Idempotency-Key' in f.calls[0].init.headers, false);
});

test('madeWorldKey: a revoked key still answers, revoked true', async () => {
  const f = fake(200, { ...ROW, revoked: true });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.equal((await c.madeWorldKey('w1', 'k')).revoked, true);
});

test('madeWorldKey: the one 404 is null, none made', async () => {
  const f = fake(404, NOT_FOUND);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.equal(await c.madeWorldKey('w1', 'k'), null);
});

test('madeWorldKey: a 405 from a server before the lookup is null too, whatever its body', async () => {
  for (const f of [fake(405, undefined, { raw: '<h1>Method Not Allowed</h1>' }), fake(405, { detail: 'Method Not Allowed' })]) {
    const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
    assert.equal(await c.madeWorldKey('w1', 'k'), null);
  }
});

test('madeWorldKey: any other refusal throws, never null', async () => {
  for (const [status, code] of [[401, 'invalid_credentials'], [429, 'too_many_requests'], [500, 'server_error']]) {
    const f = fake(status, { error: { type: code, code, message: 'x', param: null, doc_url: null } });
    const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
    const err = await c.madeWorldKey('w1', 'k').then(() => assert.fail(`expected ${status} to throw`), (e) => e);
    assert.equal(err.status, status);
  }
});

test('madeWorldKey: a world key, or an empty or missing idempotency key, is a TypeError before anything is sent', async () => {
  const f = fake(200, ROW);
  await assert.rejects(new OwV2Client({ apiKey: 'ow_w_world', apiPin: '1234', fetch: f.fetch }).madeWorldKey('w1', 'k'), TypeError);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await assert.rejects(c.madeWorldKey('w1', ''), TypeError);
  await assert.rejects(c.madeWorldKey('w1'), TypeError);
  await assert.rejects(c.madeWorldKey('w1', 7), TypeError);
  assert.equal(f.calls.length, 0);
});

test('madeWorldKey: signal goes to fetch as given, and none is sent when not given', async () => {
  const f = fake(200, ROW);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const signal = new AbortController().signal;
  await c.madeWorldKey('w1', 'k', { signal });
  assert.equal(f.calls[0].init.signal, signal);
  await c.madeWorldKey('w1', 'k');
  assert.equal('signal' in f.calls[1].init, false);
});

test('mintWorldKey: idempotencyKey goes as the Idempotency-Key header, and no header is sent without it', async () => {
  const f = fake(201, { ...ROW, key: 'ow_w_secret' });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.mintWorldKey('w1', { scope: 'write', idempotencyKey: 'mint-1' });
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], 'mint-1');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { scope: 'write' });
  await c.mintWorldKey('w1');
  assert.equal('Idempotency-Key' in f.calls[1].init.headers, false);
});

test('mintWorldKey: signal goes to fetch as given; an abort rejects with an OwNetworkError', async () => {
  const f = fake(201, { ...ROW, key: 'ow_w_secret' });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const signal = new AbortController().signal;
  await c.mintWorldKey('w1', { signal });
  assert.equal(f.calls[0].init.signal, signal);
  const aborting = async (url, init) => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  const c2 = new OwV2Client({ apiKey: 'ow_a_acct', fetch: aborting });
  await assert.rejects(c2.mintWorldKey('w1', { signal: AbortSignal.abort() }), OwNetworkError);
});

test('mintWorldKey: an idempotencyKey that is not a non-empty string is a TypeError before anything is sent', async () => {
  const f = fake(201, { ...ROW, key: 'ow_w_secret' });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await assert.rejects(c.mintWorldKey('w1', { idempotencyKey: '' }), TypeError);
  await assert.rejects(c.mintWorldKey('w1', { idempotencyKey: 5 }), TypeError);
  assert.equal(f.calls.length, 0);
});
