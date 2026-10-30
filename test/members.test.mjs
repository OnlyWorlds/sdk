/**
 * Who am I, and who is here: client.me() and client.members() send a world key to GET /me
 * and GET /members, and refuse an account token before sending. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const me = { world: { id: 'w1', name: 'Moppetopia' }, scope: 'write', kind: 'agent', role: 'guest', membership: 'm1', character: 'c1', name: 'player test' };
  const f = fake(me);
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
  assert.deepEqual(await c.me(), me);
  const { url, init } = f.calls[0];
  assert.match(url, /\/api\/v2\/me\/?$/);
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['API-Key'], 'ow_w_test');
  assert.equal(init.headers['API-Pin'], '1234');
});

test('client.me: front_door.my_seats read through as keel sends it, agent seats first', async () => {
  const seats = [
    { id: 'm7', kind: 'agent', name: 'Quill', character: 'c7' },
    { id: 'm8', kind: 'agent', name: 'Wren', character: null },
    { id: 'm9', kind: 'player', name: null, character: 'c9' },
  ];
  const me = {
    world: { id: 'w1', name: 'Moppetopia' }, scope: 'write', kind: 'person', role: 'contributor', membership: 'm2', character: 'c2',
    front_door: { sponsor: null, sponsor_character: null, my_character: 'c2', my_seats: seats, charter: 'l1', charter_skill: [] },
  };
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fake(me).fetch });
  const got = await c.me();
  assert.deepEqual(got, me);
  assert.deepEqual(got.front_door.my_seats, seats);
  assert.deepEqual(got.front_door.my_seats.map((s) => s.kind), ['agent', 'agent', 'player']);
});

test('client.me: an empty my_seats for a seat\'s own key stays an empty list', async () => {
  const me = {
    world: { id: 'w1', name: 'Moppetopia' }, scope: 'write', kind: 'agent', role: 'guest', membership: 'm7', character: 'c7', name: 'Quill',
    front_door: { sponsor: { id: 'm2', kind: 'person', name: 'Ana' }, sponsor_character: 'c2', my_character: 'c7', my_seats: [], charter: null, charter_skill: [] },
  };
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fake(me).fetch });
  const got = await c.me();
  assert.deepEqual(got.front_door.my_seats, []);
  assert.deepEqual(got, me);
});

test('the published types: OwFrontDoor\'s six keys in the document\'s order, OwMySeat\'s four', () => {
  const all = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const block = (name) => {
    const at = all.indexOf(`interface ${name} {`);
    assert.ok(at >= 0, `${name} is declared`);
    return all.slice(at, all.indexOf('\n}', at));
  };
  const keys = (src) => [...src.matchAll(/^\s{4}(\w+)(\??):/gm)].map((m) => m[1] + m[2]);
  assert.deepEqual(keys(block('OwFrontDoor')), ['sponsor', 'sponsor_character', 'my_character', 'my_seats', 'charter', 'charter_skill']);
  assert.match(block('OwFrontDoor'), /\bmy_seats: OwMySeat\[\];/);
  assert.deepEqual(keys(block('OwMySeat')), ['id', 'kind', 'name', 'character']);
  assert.match(block('OwMySeat'), /\bkind: 'agent' \| 'player';/);
  assert.match(all, /export \{[^}]*\bOwMySeat\b/);
});

test('client.members: GET /members, the rows unwrapped from { data }', async () => {
  const rows = [
    { id: null, kind: 'owner', role: 'owner', character: 'c0', status: 'active' },
    { id: 'm1', kind: 'agent', role: 'guest', character: 'c1', status: 'active', name: 'player test' },
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
