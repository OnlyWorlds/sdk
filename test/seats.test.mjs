/**
 * Seats for your own AI: createSeat, listSeats and removeSeat send the
 * account Bearer to /account/worlds/{id}/seats, send only the options that are set, never an
 * Idempotency-Key (keel's rule: a replay would keep the key), and refuse a world key before
 * sending. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const text = body === undefined ? '' : JSON.stringify(body);
    return { ok: status < 300, status, headers: new Headers(), async text() { return text; }, async json() { return body; } };
  };
  return { fetch, calls };
}

const ROW = {
  id: 's1', name: 'Quill', role: 'contributor', kind: 'agent', character: 'c1', sponsor: 'titus',
  joined_at: '2026-10-16T15:50:00Z', last_active: null,
};
const CREATED = {
  world: { id: 'w1', name: 'Moppetopia' },
  seat: { id: 's1', name: 'Quill', role: 'contributor', kind: 'agent' },
  character: 'c1', key: 'ow_w_seatkey', pin: 'ow_s_secret',
  env: 'OW_API_KEY=ow_w_seatkey\nOW_API_PIN=ow_s_secret\nOW_WORLD=w1\nOW_CHARACTER=c1\nOW_API_BASE=https://www.onlyworlds.com/api/v2\n',
};

test('createSeat: POST with the account Bearer; name always, the rest only when set; no Idempotency-Key', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.createSeat('w1', { name: 'Quill' }), CREATED);
  const { url, init } = f.calls[0];
  assert.match(url, /\/api\/v2\/account\/worlds\/w1\/seats$/);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.deepEqual(JSON.parse(init.body), { name: 'Quill' });
  assert.equal(Object.keys(init.headers).some((h) => h.toLowerCase() === 'idempotency-key'), false);
});

test('createSeat: role and character in keel\'s spelling', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createSeat('w1', { name: 'Quill', role: 'guest', character: 'mine' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { name: 'Quill', role: 'guest', character: 'mine' });
});

test('listSeats: GET, the rows unwrapped from { data }', async () => {
  const f = fake(200, { data: [ROW] });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.listSeats('w1'), [ROW]);
  assert.match(f.calls[0].url, /\/api\/v2\/account\/worlds\/w1\/seats$/);
  assert.equal(f.calls[0].init.method, 'GET');
});

test('removeSeat: DELETE the seat by id; a 204 resolves', async () => {
  const f = fake(204);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.equal(await c.removeSeat('w1', 's1'), undefined);
  assert.match(f.calls[0].url, /\/api\/v2\/account\/worlds\/w1\/seats\/s1$/);
  assert.equal(f.calls[0].init.method, 'DELETE');
});

test('rekeySeat: POST .../seats/{id}/key with no body and no Idempotency-Key; the new key comes back', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.rekeySeat('w1', 's1'), CREATED);
  const { url, init } = f.calls[0];
  assert.match(url, /\/api\/v2\/account\/worlds\/w1\/seats\/s1\/key$/);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, undefined);
  assert.equal(Object.keys(init.headers).some((h) => h.toLowerCase() === 'idempotency-key'), false);
});

test('the four seat methods: a world key is a TypeError before anything is sent', async () => {
  const f = fake(200, {});
  const c = new OwV2Client({ apiKey: 'ow_w_world', apiPin: '1234', fetch: f.fetch });
  await assert.rejects(c.createSeat('w1', { name: 'Quill' }), TypeError);
  await assert.rejects(c.listSeats('w1'), TypeError);
  await assert.rejects(c.rekeySeat('w1', 's1'), TypeError);
  await assert.rejects(c.removeSeat('w1', 's1'), TypeError);
  assert.equal(f.calls.length, 0);
});
