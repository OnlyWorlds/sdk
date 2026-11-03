/**
 * Writes against the production practice world, through the built package. Set OW_LIVE=1;
 * without it every test here skips.
 *
 * The practice world is a world anyone may write to: its key and PIN are published on the docs'
 * Keys and PINs page, and every night at 03:00 UTC it goes back to the same copy. The literals are
 * read from the docs' own file of them (contract/practice.json in the docs site's repository),
 * never copied here, so a rotated key needs no change in this repository. Each test makes what it
 * writes, names it with a fresh id, and deletes it again; a run sends a few dozen requests, under
 * the world's 60 a minute.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { OwV2Client, OwApiError, OwPreconditionFailedError } from '../dist/index.js';

const LIVE = Boolean(process.env.OW_LIVE);
const LITERALS = 'https://raw.githubusercontent.com/OnlyWorlds/onlyworlds.github.io/main/contract/practice.json';
const opts = { skip: LIVE ? false : 'set OW_LIVE=1 for the practice-world writes' };

let literals;
async function practice() {
  if (!literals) {
    // A failure here fails the run: never a silent skip.
    const r = await fetch(LITERALS, { signal: AbortSignal.timeout(20_000) });
    assert.equal(r.status, 200, `the docs' practice.json answered ${r.status}`);
    const raw = await r.json();
    literals = { key: String(raw.key), pin: String(raw.pin), worldId: String(raw.world_id) };
    assert.ok(literals.key.startsWith('ow_w_') && literals.pin && literals.worldId, 'practice.json carries key, pin and world_id');
  }
  return literals;
}
async function writer() {
  const p = await practice();
  return new OwV2Client({ apiKey: p.key, apiPin: p.pin });
}
const name = (what) => `${what} (package test ${randomUUID().slice(0, 8)})`;
async function refusal(promise) {
  try { await promise; } catch (err) { return err; }
  assert.fail('the call was expected to be refused');
}

test('the key is the practice world', opts, async () => {
  const p = await practice();
  const me = await (await writer()).me();
  assert.equal(me.world.id, p.worldId);
  assert.equal(me.world.name, 'Practice');
  assert.equal(me.scope, 'write');
});

test('a create names the client, and a replay writes once', opts, async () => {
  const ow = await writer();
  const key = randomUUID();
  const body = { name: name('Ilse the Ranger') };
  const first = await ow.create('character', { ...body }, { idempotencyKey: key });
  try {
    assert.equal(first.type, 'character');
    assert.equal(first.name, body.name);
    assert.equal(first.changed_client, 'sdk');
    assert.equal(first.changed_via, 'api');
    const again = await ow.create('character', { ...body }, { idempotencyKey: key });
    assert.equal(again.id, first.id);
    const page = await ow.list('character', { filter: { name: body.name } });
    assert.deepEqual(page.data.map((e) => e.id), [first.id]);
  } finally {
    await ow.delete('character', first.id);
  }
});

test('a stale ifMatch writes nothing', opts, async () => {
  const ow = await writer();
  const peak = await ow.create('location', { name: name('Dragon Peak') });
  try {
    const moved = await ow.patch('location', peak.id, { supertype: 'Mountain' }, { ifMatch: peak.change_seq });
    assert.ok(moved.change_seq > peak.change_seq);
    const err = await refusal(ow.patch('location', peak.id, { supertype: 'Hill' }, { ifMatch: peak.change_seq }));
    assert.ok(err instanceof OwPreconditionFailedError, String(err));
    assert.equal(err.status, 412);
    assert.equal(err.current?.supertype, 'Mountain');
    assert.equal((await ow.get('location', peak.id)).supertype, 'Mountain');
  } finally {
    await ow.delete('location', peak.id);
  }
});

test('the links route adds and removes one id, and a stale ifMatch writes nothing', opts, async () => {
  const ow = await writer();
  const guild = await ow.create('collective', { name: name('The Smiths of Harrowgate') });
  const smith = await ow.create('character', { name: name('Odo the Smith') });
  try {
    const added = await ow.editLinks('collective', guild.id, 'characters', { add: [smith.id] }, { ifMatch: guild.change_seq });
    assert.deepEqual(added.characters, [smith.id]);
    const err = await refusal(ow.editLinks('collective', guild.id, 'characters', { remove: [smith.id] }, { ifMatch: guild.change_seq }));
    assert.ok(err instanceof OwPreconditionFailedError, String(err));
    assert.deepEqual(err.current?.characters, [smith.id]);
    const removed = await ow.editLinks('collective', guild.id, 'characters', { remove: [smith.id] });
    assert.deepEqual(removed.characters, []);
  } finally {
    await ow.delete('character', smith.id);
    await ow.delete('collective', guild.id);
  }
});

test('refusals name what they refuse', opts, async () => {
  const ow = await writer();
  const misspelt = await refusal(ow.create('character', { name: name('Nobody'), nmae: 'x' }));
  assert.ok(misspelt instanceof OwApiError, String(misspelt));
  assert.equal(misspelt.status, 422);
  assert.equal(misspelt.param, 'nmae');
  const nowhere = await refusal(ow.create('character', { name: name('Nobody'), location: randomUUID() }));
  assert.ok(nowhere instanceof OwApiError, String(nowhere));
  assert.equal(nowhere.status, 400);
  assert.equal(nowhere.code, 'invalid_link');
  assert.equal(nowhere.param, 'location');
});

test('a wrong PIN is refused by name', opts, async () => {
  const p = await practice();
  const wrong = p.pin !== '1000' ? '1000' : '1001';
  const ow = new OwV2Client({ apiKey: p.key, apiPin: wrong });
  const err = await refusal(ow.create('character', { name: name('Nobody') }));
  assert.ok(err instanceof OwApiError, String(err));
  assert.equal(err.status, 401);
  assert.equal(err.code, 'invalid_credentials');
  assert.equal(err.param, 'API-Pin');
  assert.equal(err.isAuthError, true);
});

test('a deleted element reads gone', opts, async () => {
  const ow = await writer();
  const made = await ow.create('object', { name: name('Ember stone') });
  await ow.delete('object', made.id);
  const err = await refusal(ow.get('object', made.id));
  assert.ok(err instanceof OwApiError, String(err));
  assert.equal(err.status, 410);
  assert.equal(err.code, 'gone');
  assert.equal(err.isNotFound, false);
  await ow.delete('object', made.id); // a second delete is the idempotent 204
});
