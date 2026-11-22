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
import { CHARTER_PAIRS, FIELD_SCHEMA, charterOf, designPartsOf, domainsOf, isCharterElement, readingAidOf } from '../dist/index.js';

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
  assert.equal(doc.cases.length, 61, `the fixture holds ${doc.cases.length} cases, serial 145 has 61`);
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
  // Its own parse of the fixture: the shared `doc` has been through the reader in the tests above, so a reader
  // that writes into the world has written before this test looks, and before would equal after.
  const world = JSON.parse(readFileSync(FIXTURE, 'utf8')).worlds.harbour;
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
  assert.deepEqual(got.guide, { id: guide, type: 'construct', name: 'Start here' });
  // By folded name and id alone: ash row, the Archive, The Docks (not the Guide's Archive, Docks).
  assert.deepEqual(got.domains.map(d => d.name), ['ash row', 'the Archive', 'The Docks']);
});

test('charterOf refuses a world without an elements list and a reader without a rung', () => {
  assert.throws(() => charterOf({}, { rung: 'owner' }), TypeError);
  assert.throws(() => charterOf({ elements: [] }, { rung: 'keeper' }), TypeError);
});

test('readingAidOf: each of the fixture\'s pairs to its aid, folded, the whole word, the mark never read', () => {
  assert.equal(doc.pairs.length, 3);
  for (const p of doc.pairs) assert.equal(readingAidOf({ type: p.type, supertype: p.supertype }), p.aid, `${p.type}/${p.supertype}`);
  assert.equal(readingAidOf({ type: 'law', supertype: ' charter ' }), 'charter');
  assert.equal(readingAidOf({ type: 'LAW', supertype: 'CHARTER　' }), 'charter');
  assert.equal(readingAidOf({ type: 'law', supertype: 'Guide' }), null);
  assert.equal(readingAidOf({ type: 'law', supertype: 'Charters' }), null);
  assert.equal(readingAidOf({ type: 'object', supertype: 'Domain' }), null);
  // Unmarked, so lore to isCharterElement, and still the pair of a charter.
  const unmarked = { type: 'law', supertype: 'Charter' };
  assert.equal(isCharterElement(unmarked), false);
  assert.equal(readingAidOf(unmarked), 'charter');
  assert.equal(readingAidOf({ ...unmarked, x_charter_of: null }), 'charter');
  for (const bad of [null, undefined, 'law/charter', 7, ['law', 'Charter'], { type: 'law' }, { type: 'law', supertype: null }, { supertype: 'Charter' }]) {
    assert.equal(readingAidOf(bad), null, JSON.stringify(bad));
  }
});

test('charterOf: the owner reading as the public reads a closed world as the public does, nothing', () => {
  const world = doc.worlds.harbour;
  assert.deepEqual(charterOf(world, { rung: 'owner', as: { rung: 'public' } }), { charter: null, guide: null, domains: [] });
});

// ---- The design state (charter.md, serial 135): designPartsOf ----

/** Design parts compare as a set (the fixture says so). */
const asSet = (list) => list.map((v) => JSON.stringify(v, Object.keys(v).sort())).sort();

test('the charter fixture holds its design_cases list', () => {
  assert.ok(Array.isArray(doc.design_cases), 'the fixture holds no design_cases list');
  assert.equal(doc.design_cases.length, 19, `the fixture holds ${doc.design_cases.length} design cases, serial 141 has 19`);
});

for (const [i, c] of (doc.design_cases ?? []).entries()) {
  const name = typeof c?.name === 'string' ? c.name : `case ${i}`;
  test(`charter fixture, designPartsOf: ${name}`, () => {
    const world = worldOf(c);
    const reader = world.readers[c.reader];
    assert.ok(reader, `no reader ${c.reader}`);
    assert.ok(Array.isArray(c.want), `${name}: no want list`);
    assert.deepEqual(asSet(designPartsOf(world, reader)), asSet(c.want));
  });
}

// The cases below are the package's own: the fixture does not hold them, the page's rule implies them.
const W = 'design-world';
const OWNER = { rung: 'owner', character: null };
const CHARTER = { id: 'charter-1', type: 'law', name: 'Rules', supertype: 'Charter', x_charter_of: W, created_at: '2026-11-01T12:00:00Z' };
const part = (id, fields) => ({ id, type: 'object', name: id, created_at: '2026-11-02T12:00:00Z', ...fields });
const designWorld = (...elements) => ({ id: W, name: 'Design', hidden: [], elements: [CHARTER, ...elements] });

test('designPartsOf (the package\'s own): the subtype is trimmed of White_Space and folded, nothing inside touched', () => {
  const IDEO = String.fromCodePoint(0x3000);
  const BOM = String.fromCodePoint(0xfeff);
  const LONG_S = String.fromCodePoint(0x17f); // simple-folds to "s"
  const world = designWorld(
    part('a', { subtype: `${IDEO}LOCKED\t` }),
    part('b', { type: 'construct', subtype: `In De${LONG_S}ign` }),
    part('c', { subtype: 'in  design' }),
    part('d', { subtype: `${BOM}locked` }),
    part('e', { subtype: 'lock' }),
    part('f', { subtype: null }),
    part('g', { subtype: ['locked'] }),
  );
  assert.deepEqual(designPartsOf(world, OWNER), [
    { type: 'object', id: 'a', state: 'locked' },
    { type: 'construct', id: 'b', state: 'in design' },
  ]);
});

test('designPartsOf (the package\'s own): an element written as proposed is in no reader\'s view, so no part', () => {
  const world = designWorld(part('a', { subtype: 'locked', x_review_proposed: true }), part('b', { subtype: 'locked' }));
  assert.deepEqual(designPartsOf(world, OWNER), [{ type: 'object', id: 'b', state: 'locked' }]);
});

test('designPartsOf (the package\'s own): a hidden part is kept from a contributor, and a guest reads only what it is served whole', () => {
  const world = { ...designWorld(part('a', { subtype: 'locked' }), part('b', { subtype: 'locked' })), hidden: ['a'] };
  assert.deepEqual(designPartsOf(world, { rung: 'contributor', character: null }), [{ type: 'object', id: 'b', state: 'locked' }]);
  // A guest that holds the Charter and b whole, and a only as a stub.
  assert.deepEqual(designPartsOf({ ...world, hidden: [] }, { rung: 'guest', character: null, whole: ['charter-1', 'b'], known_of: ['a'] }), [
    { type: 'object', id: 'b', state: 'locked' },
  ]);
  // The same guest without the Charter in its view has no Charter, so no part at all.
  assert.deepEqual(designPartsOf({ ...world, hidden: [] }, { rung: 'guest', character: null, whole: ['b'], known_of: [] }), []);
});

test('designPartsOf (the package\'s own): the public reads nothing of a world that is not open, and parts of one that is', () => {
  const world = designWorld(part('a', { subtype: 'locked' }));
  assert.deepEqual(designPartsOf(world, { rung: 'public' }), []);
  assert.deepEqual(designPartsOf({ ...world, open: true }, { rung: 'public' }), [{ type: 'object', id: 'a', state: 'locked' }]);
});

test('designPartsOf refuses what charterOf refuses, by its own name', () => {
  assert.throws(() => designPartsOf({}, OWNER), (e) => e instanceof TypeError && e.message.startsWith('designPartsOf:'));
  assert.throws(() => designPartsOf({ elements: [] }, { rung: 'keeper' }), (e) => e instanceof TypeError && e.message.startsWith('designPartsOf:'));
});

test('designPartsOf is pure: the world is not moved', () => {
  const world = designWorld(part('a', { subtype: 'locked' }));
  const before = JSON.stringify(world);
  designPartsOf(world, OWNER)[0].state = 'planted';
  assert.equal(JSON.stringify(world), before);
  assert.deepEqual(designPartsOf(world, OWNER), [{ type: 'object', id: 'a', state: 'locked' }]);
});
