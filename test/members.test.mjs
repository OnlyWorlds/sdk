/**
 * Who am I, and who is here: client.me() and client.members() send a world key to GET /me
 * and GET /members, and refuse an account token before sending. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake(body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, headers: new Headers(), async text() { return JSON.stringify(body); }, async json() { return body; } };
  };
  return { fetch, calls };
}

test('client.me: GET /me with the world key and PIN, the body as keel sends it', async () => {
  const me = { world: { id: 'w1', name: 'Moppetopia' }, scope: 'write', kind: 'agent', role: 'guest', membership: 'm1', character: 'c1', name: 'Kael player test' };
  const f = fake(me);
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
  assert.deepEqual(await c.me(), me);
  const { url, init } = f.calls[0];
  assert.match(url, /\/api\/v2\/me\/?$/);
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['API-Key'], 'ow_w_test');
  assert.equal(init.headers['API-Pin'], '1234');
});

test('client.members: GET /members, the rows unwrapped from { data }', async () => {
  const rows = [
    { id: null, kind: 'owner', role: 'owner', character: 'c0', status: 'active' },
    { id: 'm1', kind: 'agent', role: 'guest', character: 'c1', status: 'active', name: 'Kael player test' },
    { id: 'm2', kind: 'person', role: 'contributor', character: null, status: 'removed' },
  ];
  const f = fake({ data: rows });
  const c = new OwV2Client({ apiKey: 'ow_r_test', fetch: f.fetch });
  assert.deepEqual(await c.members(), rows);
  assert.match(f.calls[0].url, /\/api\/v2\/members\/?$/);
});

test('client.me and client.members: an account token is a TypeError before anything is sent', async () => {
  const f = fake({});
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await assert.rejects(c.me(), TypeError);
  await assert.rejects(c.members(), TypeError);
  assert.equal(f.calls.length, 0);
});
