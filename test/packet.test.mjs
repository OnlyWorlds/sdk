/**
 * The packet profile (schema-dist profiles/packet.md, serial 136): every state case and asker case of
 * codegen/schema-dist/profiles/packet.fixture.json, vendored with the distribution, as its own test, then the package's
 * own cases. Runs against the compiled public bundle (dist), same as the other tests.
 *
 * The fixture's want, in this package's spelling: states -> states, shown -> shown, open_work -> openWork,
 * elements -> elements (each entry's id), askers -> askers, lints -> lints, waiting_on -> waitingOn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { askerOf, isOpenWork, workOf, workStateOf } from '../dist/index.js';

const FIXTURE = process.env.OW_PACKET_FIXTURE ?? fileURLToPath(new URL('../codegen/schema-dist/profiles/packet.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no packet fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

/** A list compared as a set (the fixture's Order note). */
const asSet = (list) => list.map((v) => (typeof v === 'string' ? v : JSON.stringify(v, Object.keys(v).sort()))).sort();
/** A map of lists, each list compared as a set. */
const mapOfSets = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, asSet(v)]));

test('the fixture is the packet profile\'s, with its two lists', () => {
  assert.equal(doc.profile, 'packet');
  assert.ok(Array.isArray(doc.state_cases) && Array.isArray(doc.asker_cases), 'the fixture holds no state_cases or asker_cases list');
  assert.equal(doc.state_cases.length, 11, `the fixture holds ${doc.state_cases.length} state cases, serial 138 has 11`);
  assert.equal(doc.asker_cases.length, 14, `the fixture holds ${doc.asker_cases.length} asker cases, serial 138 has 14`);
});

for (const [i, c] of doc.state_cases.entries()) {
  const name = typeof c?.name === 'string' ? c.name : `case ${i}`;
  test(`packet fixture, states: ${name}`, () => {
    const got = workOf(c.items, doc.world, doc.source_world);
    const want = c.want;
    assert.deepEqual(got.states, want.states, `${name}: states`);
    assert.deepEqual(asSet(got.shown), asSet(want.shown), `${name}: shown`);
    assert.deepEqual(mapOfSets(got.openWork), mapOfSets(want.open_work), `${name}: openWork`);
    for (const [item, ids] of Object.entries(want.elements ?? {})) {
      assert.deepEqual(got.elements[item].map((e) => e.id), ids, `${name}: elements of ${item}, in order`);
    }
    // The one-item readers answer as the list reader does. `states` keys only the work items, so an element given
    // that is no work item has no key there and its one-item state is null (serial 138's case).
    for (const item of c.items) {
      const state = Object.hasOwn(want.states, item.id) ? want.states[item.id] : null;
      assert.equal(workStateOf(item), state, `${name}: workStateOf ${item.id}`);
      assert.equal(isOpenWork(item), state === 'open' || state === 'taken', `${name}: isOpenWork ${item.id}`);
    }
  });
}

for (const [i, c] of doc.asker_cases.entries()) {
  const name = typeof c?.name === 'string' ? c.name : `case ${i}`;
  test(`packet fixture, askers: ${name}`, () => {
    const got = workOf(c.items, doc.world, doc.source_world);
    const want = c.want;
    assert.deepEqual(got.askers, want.askers, `${name}: askers`);
    assert.deepEqual(asSet(got.lints), asSet(want.lints), `${name}: lints`);
    assert.deepEqual(mapOfSets(got.waitingOn), mapOfSets(want.waiting_on), `${name}: waitingOn`);
    for (const item of c.items) assert.equal(askerOf(item, doc.world), want.askers[item.id], `${name}: askerOf ${item.id}`);
  });
}

// The cases below are the package's own: the fixture does not hold them, the page's rule implies them.
const WORLD = { id: 'w', characters: ['c1', 'C2'], others: ['loc'] };
let n = 0;
const item = (fields) => ({
  id: `i${++n}`, type: 'relation', supertype: 'Work item', subtype: 'open', name: 'Work',
  x_packet_elements: [{ type: 'location', id: 'loc', reason: 'Why.' }], x_packet_source: { server: null, world: 'w' }, ...fields,
});

test('workStateOf (the package\'s own): a state trimmed of White_Space and folded, the whole word', () => {
  const NEL = String.fromCodePoint(0x85); // NEXT LINE, White_Space
  const IDEO = String.fromCodePoint(0x3000);
  assert.equal(workStateOf(item({ subtype: ' Standing ' })), 'standing');
  assert.equal(workStateOf(item({ subtype: `${NEL}taken${NEL}` })), 'taken');
  assert.equal(workStateOf(item({ subtype: `${IDEO}DONE\t` })), 'done');
  assert.equal(workStateOf(item({ subtype: 'OPEN' })), 'open');
  assert.equal(workStateOf(item({ subtype: 'op en' })), null);
  assert.equal(workStateOf(item({ subtype: 'opened' })), null);
  assert.equal(workStateOf(item({ subtype: `${String.fromCodePoint(0x200b)}open` })), null); // a zero width space is no White_Space
});

test('workStateOf (the package\'s own): a subtype that is no string is no state', () => {
  for (const bad of [7, true, ['open'], { open: true }]) assert.equal(workStateOf(item({ subtype: bad })), null, JSON.stringify(bad));
});

test('workStateOf and isOpenWork (the package\'s own): only a work item has a state; the pair is trimmed and folded, the room mark not needed', () => {
  assert.equal(workStateOf(item({ type: ' Relation', supertype: 'WORK ITEM ' })), 'open');
  assert.equal(workStateOf(item({ x_room_of: 'w' })), 'open');
  assert.equal(workStateOf({ type: 'character', supertype: 'Work item', subtype: 'open' }), null);
  assert.equal(workStateOf(item({ supertype: 'Work items' })), null);
  assert.equal(workStateOf(item({ supertype: null })), null);
  assert.equal(isOpenWork({ type: 'relation', supertype: 'Board', subtype: 'open' }), false);
  for (const bad of [null, undefined, 'open', 7, [item({})]]) {
    assert.equal(workStateOf(bad), null, String(bad));
    assert.equal(isOpenWork(bad), false, String(bad));
  }
  // A packet before it lands carries no id, and its state reads the same.
  const { id, ...bare } = item({ subtype: 'taken' });
  assert.equal(isOpenWork(bare), true);
});

test('isOpenWork (the package\'s own): open and taken only; done, standing and no state are never open work', () => {
  assert.deepEqual(['open', ' Taken', 'done', 'standing', 'blocked', ''].map((s) => isOpenWork(item({ subtype: s }))), [true, true, false, false, false, false]);
});

test('askerOf (the package\'s own): the key as written, never the maker or actor; blank, empty and no string name no one', () => {
  assert.equal(askerOf(item({ x_packet_from: 'c1', actor: 'C2', created_by: 'm' })), 'c1');
  assert.equal(askerOf(item({ actor: 'c1', created_by: 'c1', x_packet_producer: { tool: 'c1' } })), null);
  assert.equal(askerOf(item({ x_packet_from: ' c1' })), ' c1'); // unchecked without a world: as written, never trimmed
  for (const bad of ['', '   ', '\t', null, 7, ['c1'], { id: 'c1' }]) assert.equal(askerOf(item({ x_packet_from: bad })), null, JSON.stringify(bad));
});

test('askerOf (the package\'s own): with a world, only a Character of it written exactly so', () => {
  assert.equal(askerOf(item({ x_packet_from: 'c1' }), WORLD), 'c1');
  assert.equal(askerOf(item({ x_packet_from: 'C1' }), WORLD), null); // an id in upper case names nothing
  assert.equal(askerOf(item({ x_packet_from: 'C2' }), WORLD), 'C2'); // a Character whose own id is in upper case
  assert.equal(askerOf(item({ x_packet_from: 'c2' }), WORLD), null);
  assert.equal(askerOf(item({ x_packet_from: 'c1 ' }), WORLD), null);
  assert.equal(askerOf(item({ x_packet_from: 'loc' }), WORLD), null);
  assert.equal(askerOf({ type: 'character', x_packet_from: 'c1' }, WORLD), null);
});

test('workOf (the package\'s own): an empty or blank key is a lint; an upper-case spelling of a held id names nothing and is no lint', () => {
  const items = [item({ x_packet_from: '' }), item({ x_packet_from: '   ' }), item({ x_packet_from: 'C1' }), item({ x_packet_from: 'LOC' }), item({ x_packet_from: 'loc' })];
  const got = workOf(items, WORLD);
  assert.deepEqual(Object.values(got.askers), [null, null, null, null, null]);
  assert.deepEqual(got.lints, [items[0], items[1], items[4]].map((i) => ({ kind: 'asker', item: i.id })));
});

test('workOf (the package\'s own): a key naming another work item the reader is given is no Character, so a lint', () => {
  const a = item({});
  const b = item({ x_packet_from: a.id });
  assert.deepEqual(workOf([a, b], WORLD).lints, [{ kind: 'asker', item: b.id }]);
});

test('workOf (the package\'s own): open work names each item once per element; a standing item counts on none', () => {
  const twice = item({ x_packet_elements: [{ type: 'location', id: 'loc', reason: 'a' }, { type: 'location', id: 'loc', reason: 'b' }] });
  const standing = item({ subtype: 'Standing', x_packet_elements: [{ type: 'object', id: 'obj', reason: 'kept' }] });
  const got = workOf([twice, standing], WORLD);
  assert.deepEqual(got.openWork, { loc: [twice.id], obj: [] });
  // elements keeps the packet as written, both entries.
  assert.deepEqual(got.elements[twice.id].map((e) => e.reason), ['a', 'b']);
  assert.deepEqual(got.elements[standing.id], [{ type: 'object', id: 'obj', reason: 'kept' }]);
});

test('workOf (the package\'s own): an entry without its three keys is ignored, never repaired', () => {
  const it = item({ x_packet_elements: [
    { type: 'location', id: 'a' }, { id: 'b', reason: 'r' }, { type: 'location', id: 7, reason: 'r' }, { type: 'location', id: '  ', reason: 'r' },
    'c', null, { type: 'location', id: 'd', reason: 'kept' },
  ] });
  const got = workOf([it], WORLD);
  assert.deepEqual(got.elements[it.id], [{ type: 'location', id: 'd', reason: 'kept' }]);
  assert.deepEqual(got.openWork, { d: [it.id] });
  assert.deepEqual(workOf([item({ x_packet_elements: 'loc' })], WORLD).openWork, {});
});

test('workOf (the package\'s own): what is no work item, or has no id, is in no part; of two with one id the first is read', () => {
  const first = item({ id: 'same', subtype: 'open' });
  const got = workOf([{ type: 'character', id: 'x', subtype: 'open' }, item({ id: '' }), { ...item({}), id: undefined }, first, item({ id: 'same', subtype: 'done' }), null, 'i'], WORLD);
  assert.deepEqual(got.shown, ['same']);
  assert.deepEqual(got.states, { same: 'open' });
});

test('workOf (the package\'s own): every Character of the world has its waiting list, and an id such as __proto__ is a key like any other', () => {
  const world = { characters: ['__proto__', 'c1'], others: [] };
  const it = item({ id: '__proto__', x_packet_from: '__proto__', x_packet_elements: [{ type: 'location', id: '__proto__', reason: 'r' }] });
  const got = workOf([it], world);
  assert.deepEqual(Object.keys(got.waitingOn), ['__proto__', 'c1']);
  assert.deepEqual(got.waitingOn.__proto__, ['__proto__']);
  assert.deepEqual(Object.keys(got.states), ['__proto__']);
  assert.deepEqual(Object.keys(got.openWork), ['__proto__']);
});

test('workOf refuses items that are no list and a world that is no object', () => {
  assert.throws(() => workOf('items', WORLD), (e) => e instanceof TypeError && e.message.startsWith('workOf:'));
  assert.throws(() => workOf([], null), (e) => e instanceof TypeError && e.message.startsWith('workOf:'));
  assert.throws(() => workOf([], WORLD, 'source'), (e) => e instanceof TypeError && e.message.startsWith('workOf:'));
  assert.throws(() => askerOf(item({ x_packet_from: 'c1' }), 'w'), (e) => e instanceof TypeError && e.message.startsWith('askerOf:'));
});

test('workOf is pure: the items are not moved, and the answer is the caller\'s own', () => {
  // Its own parse of the fixture: the shared `doc` has been through the reader in the tests above, so a reader
  // that writes into the bodies has written before this test looks, and before would equal after.
  const own = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const items = own.state_cases[3].items;
  const before = JSON.stringify(items);
  const worldBefore = JSON.stringify(own.world);
  const got = workOf(items, own.world);
  assert.equal(JSON.stringify(items), before, 'workOf wrote into the items it was given');
  assert.equal(JSON.stringify(own.world), worldBefore, 'workOf wrote into the world it was given');
  got.elements[items[0].id][0].id = 'planted';
  assert.equal(JSON.stringify(items), before, 'a change to the answer reached the items');
});
