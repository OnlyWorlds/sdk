/**
 * The charter profile (schema-dist profiles/charter.md, serial 83): CHARTER_PAIRS and the fixture's tables,
 * then every case of codegen/schema-dist/profiles/charter.fixture.json, vendored with the distribution, as
 * its own test: isCharterElement on each element case, charterOf (and domainsOf) on each charter case.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARTER_PAIRS, FIELD_SCHEMA, charterOf, domainsOf, isCharterElement } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/charter.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no charter fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('CHARTER_PAIRS is the fixture\'s pairs, in its order, and its tables are what the readers read', () => {
  assert.equal(doc.profile, 'charter');
  assert.deepEqual(CHARTER_PAIRS.map(p => ({ ...p })), doc.pairs);
  assert.equal(doc.mark.field, 'x_charter_of');
  assert.equal(doc.rules_field, 'x_checks_rules');
  assert.equal(doc.skill_max, 5);
  // hub_fields: the Construct's link fields in the schema's order, the order a Domain's hubs are read in.
  const links = Object.entries(FIELD_SCHEMA.construct)
    .filter(([, f]) => f.type === 'single_link' || f.type === 'multi_link')
    .map(([field, f]) => ({ field, type: f.target }));
  assert.deepEqual(links, doc.hub_fields);
  assert.equal(doc.cases.length, 23, `the fixture holds ${doc.cases.length} cases, serial 84 has 23`);
});

/** A case's world: one of the fixture's named worlds, or the case's own. */
const worldOf = (c) => (typeof c.world === 'string' ? doc.worlds[c.world] : c.world);

for (const c of doc.cases) {
  if (c.kind === 'element') {
    test(`charter fixture, element: ${c.name}`, () => {
      assert.equal(isCharterElement(c.element), c.is_charter_element);
    });
  } else if (c.kind === 'charter') {
    test(`charter fixture, charterOf: ${c.name}`, () => {
      const world = worldOf(c);
      const reader = world.readers[c.reader];
      assert.ok(reader, `no reader ${c.reader}`);
      assert.deepEqual(charterOf(world, reader), c.want);
      assert.deepEqual(domainsOf(world, reader), c.want.domains);
    });
  } else {
    test(`charter fixture: ${c.name}`, () => assert.fail(`a case of unknown kind ${c.kind}`));
  }
}

test('charterOf is pure: the world is not moved, and the packet is the caller\'s own copy', () => {
  const world = doc.worlds.harbour;
  const before = JSON.stringify(world);
  const got = charterOf(world, world.readers.owner);
  got.charter.rules[0].rule = 'planted';
  got.domains[0].hubs.push({ type: 'object', id: 'planted' });
  assert.equal(JSON.stringify(world), before);
  assert.deepEqual(charterOf(world, world.readers.owner), doc.cases.find(c => c.name === 'harbour-owner-reads-the-whole-packet').want);
});

test('charterOf: a Guide the reader knows only as a stub names it, and orders nothing (a stub serves no constructs)', () => {
  const world = doc.worlds.harbour;
  const [guide, docks, archive, ash] = ['203', '204', '205', '206'].map(n => `019a7f00-0000-7000-8000-000000000${n}`);
  const got = charterOf(world, { rung: 'guest', character: null, whole: [docks, archive, ash], known_of: [guide] });
  assert.deepEqual(got.guide, { id: guide, name: 'Start here' });
  // By folded name and id alone: ash row, the Archive, The Docks (not the Guide's Archive, Docks).
  assert.deepEqual(got.domains.map(d => d.name), ['ash row', 'the Archive', 'The Docks']);
});

test('charterOf refuses a world without an elements list and a reader without a rung', () => {
  assert.throws(() => charterOf({}, { rung: 'owner' }), TypeError);
  assert.throws(() => charterOf({ elements: [] }, { rung: 'keeper' }), TypeError);
});

test('charterOf: the owner reading as the public reads a closed world as the public does, nothing', () => {
  const world = doc.worlds.harbour;
  assert.deepEqual(charterOf(world, { rung: 'owner', as: { rung: 'public' } }), { charter: null, guide: null, domains: [] });
});
