/**
 * A world's invite links (keel C1, 48c10d4): createWorldLink, listWorldLinks and
 * revokeWorldLink send the account Bearer to /account/worlds/{id}/links, send only the
 * options that are set, and refuse a world key before sending. Runs against dist.
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
  id: 'l1', reader: 'person', role: 'contributor', label: '', inviter_name: 'Titus', with_character: false,
  last4: 'Ab3_', created_at: '2026-10-15T14:00:00Z', expires_at: '2026-10-22T14:00:00Z', uses: 0, status: 'pending',
};
const CREATED = { ...ROW, code: 'ow_j_secretAb3_', link: 'https://www.onlyworlds.com/join#ow_j_secretAb3_', line: 'Titus invites you to Moppetopia: https://www.onlyworlds.com/join#ow_j_secretAb3_' };

test('createWorldLink: POST with the account Bearer; reader always, the rest only when set', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.createWorldLink('w 1', { reader: 'person' }), CREATED);
  const { url, init } = f.calls[0];
  assert.match(url, /\/api\/v2\/account\/worlds\/w%201\/links$/);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.deepEqual(JSON.parse(init.body), { reader: 'person' });
});

test('createWorldLink: each option in keel\'s spelling', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createWorldLink('w1', { reader: 'agent', role: 'guest', days: 30, inviterName: 'Titus', withCharacter: false });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { reader: 'agent', role: 'guest', days: 30, inviter_name: 'Titus', with_character: false });
  await c.createWorldLink('w1', { reader: 'player', preview: true });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { reader: 'player', preview: true });
});

test('createWorldLink: a table (keel #422 PR 2) sends max_uses and characters in keel\'s spelling, the list in the order given', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createWorldLink('w1', { reader: 'player', maxUses: 4, characters: ['c2', 'c1', 'c3'] });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { reader: 'player', max_uses: 4, characters: ['c2', 'c1', 'c3'] });
  await c.createWorldLink('w1', { reader: 'player', maxUses: 6 });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { reader: 'player', max_uses: 6 }, 'no list: each player names a fresh Character');
  await c.createWorldLink('w1', { reader: 'player', maxUses: 6, characters: [] });
  assert.deepEqual(JSON.parse(f.calls[2].init.body), { reader: 'player', max_uses: 6, characters: [] }, 'an empty list is sent as given');
});

test('createWorldLink: a link for one sends exactly what it sent before the table', async () => {
  const f = fake(201, CREATED);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createWorldLink('w1', { reader: 'player', character: 'c1', preview: true });
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0].init.body)), ['reader', 'character', 'preview']);
  await c.createWorldLink('w1', { reader: 'person', role: 'guest', days: 7 });
  assert.deepEqual(Object.keys(JSON.parse(f.calls[1].init.body)), ['reader', 'role', 'days']);
});

test('createWorldLink and listWorldLinks: a table\'s row comes back with max_uses, characters and uses as keel sent them', async () => {
  const TABLE = {
    ...ROW, reader: 'player', role: 'guest', with_character: true, preview: true, character: null,
    uses: 2, max_uses: 4,
    characters: [{ id: 'c2', name: 'Ysolde', taken: true }, { id: 'c1', name: null, taken: false }],
  };
  const f = fake(201, { ...TABLE, code: CREATED.code, link: CREATED.link, line: CREATED.line });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const made = await c.createWorldLink('w1', { reader: 'player', maxUses: 4, characters: ['c2', 'c1'] });
  assert.equal(made.max_uses, 4);
  assert.deepEqual(made.characters.map((x) => x.id), ['c2', 'c1']);
  const g = fake(200, { data: [TABLE, ROW] });
  const rows = await new OwV2Client({ apiKey: 'ow_a_acct', fetch: g.fetch }).listWorldLinks('w1');
  assert.deepEqual(rows, [TABLE, ROW]);
  assert.equal(rows[0].characters[1].name, null, 'a deleted Character\'s name is null');
  assert.equal('max_uses' in rows[1], false, 'a link for one has no table keys');
});

test('listWorldLinks: GET, the rows unwrapped from { data }', async () => {
  const f = fake(200, { data: [ROW] });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.listWorldLinks('w1'), [ROW]);
  assert.match(f.calls[0].url, /\/api\/v2\/account\/worlds\/w1\/links$/);
  assert.equal(f.calls[0].init.method, 'GET');
});

test('revokeWorldLink: DELETE the link by id; a 204 resolves', async () => {
  const f = fake(204);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.equal(await c.revokeWorldLink('w1', 'l1'), undefined);
  assert.match(f.calls[0].url, /\/api\/v2\/account\/worlds\/w1\/links\/l1$/);
  assert.equal(f.calls[0].init.method, 'DELETE');
});

test('the three link methods: a world key is a TypeError before anything is sent', async () => {
  const f = fake(200, {});
  const c = new OwV2Client({ apiKey: 'ow_w_world', apiPin: '1234', fetch: f.fetch });
  await assert.rejects(c.createWorldLink('w1', { reader: 'person' }), TypeError);
  await assert.rejects(c.listWorldLinks('w1'), TypeError);
  await assert.rejects(c.revokeWorldLink('w1', 'l1'), TypeError);
  assert.equal(f.calls.length, 0);
});
