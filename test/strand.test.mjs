/**
 * The strand profile (schema-dist profiles/strand.md, serial 98): every case of
 * codegen/schema-dist/profiles/strand.fixture.json, vendored with the distribution, as its own test: strandOf on
 * each strand case. Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STRAND_FIELD, strandOf } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/strand.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no strand fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture is the strand profile\'s, its mark the field strandOf reads', () => {
  assert.equal(doc.profile, 'strand');
  assert.equal(doc.mark.field, STRAND_FIELD);
  assert.deepEqual(doc.mark.members, ['narrative', 'event', 'location']);
  assert.equal(doc.cases.length, 17, `the fixture holds ${doc.cases.length} cases, serial 98 has 17`);
});

/** A case's world: one of the fixture's named worlds, or the case's own. */
const worldOf = (c) => (typeof c.world === 'string' ? doc.worlds[c.world] : c.world);

for (const c of doc.cases) {
  if (c.kind === 'strand') {
    test(`strand fixture: ${c.name}`, () => {
      const world = worldOf(c);
      const reader = world.readers[c.reader];
      assert.ok(reader, `no reader ${c.reader}`);
      assert.deepEqual(strandOf(world, reader), c.want);
    });
  } else {
    test(`strand fixture: ${c.name}`, () => assert.fail(`a case of unknown kind ${c.kind}`));
  }
}

test('strandOf is pure: the world is not moved, and the strand is the caller\'s own', () => {
  const world = doc.worlds.harbour;
  const before = JSON.stringify(world);
  const got = strandOf(world, { rung: 'owner' });
  got.narrative.name = 'planted';
  assert.equal(JSON.stringify(world), before);
  assert.notEqual(strandOf(world, { rung: 'owner' }).narrative.name, 'planted');
});

test('strandOf refuses what is not a world, and a reader the lens profile does not know', () => {
  assert.throws(() => strandOf(null, { rung: 'owner' }), TypeError);
  assert.throws(() => strandOf({ x_strand: {} }, { rung: 'owner' }), TypeError);
  assert.throws(() => strandOf(doc.worlds.harbour, { rung: 'stranger' }), TypeError);
});

test('a public reader reads no strand of a world that is not open, and the open one\'s', () => {
  const world = doc.worlds.harbour;
  const empty = { narrative: null, event: null, location: null, character: null, now: null, same: null };
  assert.deepEqual(strandOf(world, { rung: 'public' }), empty);
  const owner = doc.cases.find(c => c.name === 'owner-reads-the-full-strand-two-places').want;
  assert.deepEqual(strandOf({ ...world, open: true }, { rung: 'public' }), owner);
});

test('a mark with a member missing, empty or not a string is no mark', () => {
  const world = doc.worlds.harbour;
  const m = world.x_strand;
  for (const bad of [{ ...m, event: undefined }, { ...m, location: '' }, { ...m, narrative: 7 }, [m.narrative, m.event, m.location], null]) {
    const got = strandOf({ ...world, x_strand: bad }, { rung: 'owner' });
    assert.equal(got.narrative, null, JSON.stringify(bad));
  }
});
