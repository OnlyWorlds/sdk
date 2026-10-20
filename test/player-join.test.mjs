/**
 * A friend with only a link (keel #353): redeemJoin posts the code to /join with no credential
 * whatever key the client holds, sends only the names that are set, and returns the answer whose
 * `kind` tells a player's read key from an agent's seat; createWorldLink makes a player link.
 * Runs against dist.
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

const PLAYER = {
  kind: 'player', key: 'ow_r_playerkey', role: 'guest',
  world: { id: 'w1', name: 'Moppetopia', description: '' },
  character: { id: 'c1', name: 'Ysolde' },
};
const credentials = (init) => Object.keys(init.headers ?? {}).filter((h) => ['api-key', 'api-pin', 'authorization'].includes(h.toLowerCase()));

test('redeemJoin: POST /join with the code and no credential, from any client', async () => {
  for (const auth of [{ apiKey: 'ow_a_acct' }, { apiKey: 'ow_w_world', apiPin: '1234' }]) {
    const f = fake(201, PLAYER);
    const c = new OwV2Client({ ...auth, fetch: f.fetch });
    const got = await c.redeemJoin('ow_j_code');
    assert.equal(got.kind, 'player');
    const { url, init } = f.calls[0];
    assert.match(url, /\/api\/v2\/join\/?$/);
    assert.equal(init.method, 'POST');
    assert.deepEqual(credentials(init), [], `no credential with ${auth.apiKey.slice(0, 5)}`);
    assert.deepEqual(JSON.parse(init.body), { code: 'ow_j_code' });
  }
});

test('redeemJoin: a player\'s name and an agent\'s name in keel\'s spelling, only when set', async () => {
  const f = fake(201, PLAYER);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.redeemJoin('ow_j_code', { name: 'Ana' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_code', name: 'Ana' });
  await c.redeemJoin('ow_j_code', { agentName: 'Quill' });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { code: 'ow_j_code', agent_name: 'Quill' });
});

test('redeemJoin on a table (keel #422 PR 2): the pick as character, with or without a name; a link for one sends no new key', async () => {
  const f = fake(201, PLAYER);
  const c = new OwV2Client({ fetch: f.fetch });
  await c.redeemJoin('ow_j_code', { character: 'c2' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_code', character: 'c2' });
  await c.redeemJoin('ow_j_code', { character: 'c2', name: 'Ana' });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { code: 'ow_j_code', name: 'Ana', character: 'c2' });
  await c.redeemJoin('ow_j_code', { name: 'Ana' });
  assert.deepEqual(JSON.parse(f.calls[2].init.body), { code: 'ow_j_code', name: 'Ana' }, 'no list (name_required): the name alone');
  await c.redeemJoin('ow_j_code');
  assert.deepEqual(JSON.parse(f.calls[3].init.body), { code: 'ow_j_code' });
});

test('previewJoin: a table\'s preview comes back with max_uses, uses_left, name_required and characters as keel sent them', async () => {
  const BASE = {
    reader: 'player', world: { name: 'Moppetopia', description: '' }, invited_by: 'Titus', owner_character: null,
    role: 'guest', with_character: true, expires_at: '2026-10-27T14:00:00+00:00',
  };
  const TABLE = {
    ...BASE, max_uses: 4, uses_left: 3, name_required: false,
    characters: [
      { id: 'c2', name: 'Ysolde', image_url: 'https://media.onlyworlds.com/y.webp', taken: false },
      { id: 'c1', name: 'Bram', image_url: null, taken: true },
    ],
  };
  for (const body of [TABLE, { ...BASE, max_uses: 6, uses_left: 6, name_required: true, characters: [] }, BASE]) {
    const f = fake(200, body);
    const got = await new OwV2Client({ fetch: f.fetch }).previewJoin('ow_j_code');
    assert.deepEqual(got, body);
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_code' });
  }
});

test('422 character_taken is isCharacterTaken, and a 422 off the list is not', async () => {
  const env = (code, param) => ({ error: { type: 'invalid_request', code, message: code, param,
    doc_url: `https://onlyworlds.github.io/api/errors#${code}` } });
  const thrown = async (status, body) => {
    const f = fake(status, body);
    try { await new OwV2Client({ fetch: f.fetch }).redeemJoin('ow_j_code', { character: 'c1' }); } catch (err) { return err; }
    assert.fail('expected a throw');
  };
  const taken = await thrown(422, env('character_taken', 'character'));
  assert.equal(taken.isCharacterTaken, true);
  assert.equal(taken.param, 'character');
  assert.equal(taken.isValidationError, true);
  assert.equal(taken.isCharacterInvalid, false, 'taken is not invalid');
  const offList = await thrown(422, env('invalid_request', 'character'));
  assert.equal(offList.isCharacterTaken, false);
  assert.equal(offList.param, 'character');
  const gone = await thrown(404, { error: { type: 'not_found', code: 'not_found', message: 'x', param: null, doc_url: null } });
  assert.equal(gone.isCharacterTaken, false);
  assert.equal(gone.isNotFound, true, 'the last place taken first is the one 404');
  assert.equal(gone.isCharacterInvalid, false);
  const otherStatus = await thrown(409, env('character_taken', 'character'));
  assert.equal(otherStatus.isCharacterTaken, false, 'the code on another status is not it');
  const full = await thrown(422, env('world_full', null));
  assert.equal(full.isWorldFull, true);
  assert.equal(full.isCharacterTaken, false);
  assert.equal(full.isCharacterInvalid, false);
  assert.equal(taken.isWorldFull, false, 'a taken pick is not a full world');
  assert.equal(offList.isWorldFull, false);
  assert.equal((await thrown(409, env('world_full', null))).isWorldFull, false, 'the code on another status is not it');
});

test('422 invalid_request with param character is isCharacterInvalid; any other invalid_request is not', async () => {
  const env = (code, param) => ({ error: { type: 'invalid_request', code, message: code, param,
    doc_url: `https://onlyworlds.github.io/api/errors#${code}` } });
  const thrown = async (status, body) => {
    const f = fake(status, body);
    try { await new OwV2Client({ fetch: f.fetch }).redeemJoin('ow_j_code', { character: 'c9' }); } catch (err) { return err; }
    assert.fail('expected a throw');
  };
  const offList = await thrown(422, env('invalid_request', 'character'));
  assert.equal(offList.isCharacterInvalid, true);
  assert.equal(offList.isCharacterTaken, false);
  for (const param of ['name', 'characters', 'max_uses', null]) {
    const other = await thrown(422, env('invalid_request', param));
    assert.equal(other.isCharacterInvalid, false, `param ${param}`);
  }
  const full = await thrown(422, env('invalid_request', null));
  assert.equal(full.isCharacterInvalid, false, 'a full world (no param) is not a refused pick');
  assert.equal((await thrown(400, env('invalid_request', 'character'))).isCharacterInvalid, false, 'only the 422');
  assert.equal((await thrown(422, env('invalid_link', 'character'))).isCharacterInvalid, false, 'only the code invalid_request');
});

test('a client with no key: preview and redeem work, sending none; any keyed call is a TypeError before sending', async () => {
  const f = fake(201, PLAYER);
  const c = new OwV2Client({ fetch: f.fetch });
  assert.equal(c.keyKind, 'none');
  assert.equal((await c.redeemJoin('ow_j_code', { name: 'Ana' })).kind, 'player');
  await c.previewJoin('ow_j_code');
  assert.deepEqual(f.calls.map((x) => credentials(x.init)), [[], []]);
  for (const call of [() => c.list('character'), () => c.getWorld(), () => c.me(), () => c.createSeat('w1', { name: 'x' })]) {
    await assert.rejects(call(), TypeError);
  }
  assert.equal(f.calls.length, 2, 'nothing sent for the keyed calls');
  assert.equal(new OwV2Client({ apiKey: '', fetch: f.fetch }).keyKind, 'none', 'an empty key is no key');
});

test('createWorldLink: a player link with its Character', async () => {
  const f = fake(201, {});
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createWorldLink('w1', { reader: 'player', character: 'c1' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { reader: 'player', character: 'c1' });
});
