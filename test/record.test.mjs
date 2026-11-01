/**
 * The record profile (schema-dist profiles/record.md, serial 102): every case of
 * codegen/schema-dist/profiles/record.fixture.json, vendored with the distribution, as its own test: recordMarkOf on
 * each mark case, recordsOf on each records case. Runs against the compiled public bundle (dist), same as the other
 * tests. OW_RECORD_FIXTURE points it at another copy of the fixture (a staged branch before the serial).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECORD_FIELD, recordMarkOf, recordsOf } from '../dist/index.js';

const FIXTURE = process.env.OW_RECORD_FIXTURE ?? fileURLToPath(new URL('../codegen/schema-dist/profiles/record.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no record fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture is the record profile\'s, its mark the field recordMarkOf reads', () => {
  assert.equal(doc.profile, 'record');
  assert.equal(doc.mark.field, RECORD_FIELD);
  assert.deepEqual(doc.mark.members, ['tool', 'played_at', 'version', 'seed', 'outcome', 'seats']);
  assert.equal(doc.cases.length, 32, `the fixture holds ${doc.cases.length} cases, serial 102 has 32`);
});

for (const c of doc.cases) {
  const world = doc.worlds[c.world];
  if (c.kind === 'mark') {
    test(`record fixture: ${c.name}`, () => {
      const el = world.elements.find((e) => e.id === c.element);
      assert.ok(el, `no element ${c.element}`);
      assert.deepEqual(recordMarkOf(el), c.want);
    });
  } else if (c.kind === 'records') {
    test(`record fixture: ${c.name}`, () => assert.deepEqual(recordsOf(c.character, world.elements), c.want));
  } else {
    test(`record fixture: ${c.name}`, () => assert.fail(`a case of unknown kind ${c.kind}`));
  }
}

test('recordsOf is pure: the elements are not moved, and the records are the caller\'s own', () => {
  const world = Object.values(doc.worlds)[0];
  const before = JSON.stringify(world);
  const who = doc.cases.find((c) => c.kind === 'records' && c.want.length).character;
  const got = recordsOf(who, world.elements);
  got[0].event.name = 'planted';
  got[0].stories.push({ id: 'x', name: 'x', as: 'both' });
  const mark = recordMarkOf(world.elements.find((e) => recordMarkOf(e)));
  mark.seats.planted = 'planted';
  assert.equal(JSON.stringify(world), before);
  assert.notEqual(recordsOf(who, world.elements)[0].event.name, 'planted');
});

test('recordsOf refuses what is not an id or a list, and reads no seat from an object\'s own machinery', () => {
  assert.throws(() => recordsOf(null, []), TypeError);
  assert.throws(() => recordsOf('a', null), TypeError);
  assert.throws(() => recordsOf('a', {}), TypeError);
  assert.deepEqual(recordsOf('a', []), []);
  const ev = { id: 'e', type: 'event', name: 'E', characters: ['toString', 'constructor'], x_record: { tool: 'subs', played_at: '2026-11-01T00:00:00Z' } };
  for (const who of ['toString', 'constructor']) assert.equal(recordsOf(who, [ev])[0].seat, null);
});

test('a played_at with seconds and a fraction orders as the instant it is', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  const got = recordsOf('c', [mk('a', '2026-11-01T00:30Z'), mk('b', '2026-11-01T00:30:00.500Z'), mk('c', '2026-11-01T00:29:59Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['b', 'a', 'c']);
});

test('played_at orders to the millisecond, a finer fraction truncated (the Python package reads it the same)', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  const got = recordsOf('c', [mk('b', '2026-11-01T00:30:00.1239Z'), mk('a', '2026-11-01T00:30:00.1231Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['a', 'b']);
});

test('a played_at that is no real calendar instant is no mark (the Python package refuses the same)', () => {
  const mk = (at) => ({ id: 'e', type: 'event', characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  for (const at of ['2026-13-01T00:00Z', '2026-02-30T00:00Z', '2026-02-29T00:00Z', '2026-11-01T24:00Z', '2026-11-01T00:60Z', '2026-11-01T00:00:60Z', '0000-01-01T00:00Z', '2026-00-01T00:00Z', '2026-11-00T00:00Z']) {
    assert.equal(recordMarkOf(mk(at)), null, at);
  }
  for (const at of ['2028-02-29T00:00Z', '2000-02-29T23:59:59.999Z', '0001-01-01T00:00Z']) assert.notEqual(recordMarkOf(mk(at)), null, at);
});
