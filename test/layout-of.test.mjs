/**
 * The map-space profile's layout reading (schema-dist profiles/map-space.md, rules 8 to 10, serial 110): every case
 * of the fixture's `layout_cases`, vendored with the distribution, as its own test, the whole answer of each case
 * compared as a value and as bytes (key order held). Each case is read as the page says: `map` is the case's row with
 * that id, `maps` its Map rows, `pins` its Pin rows. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layoutOf, mapSpace } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/map-space.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no map-space fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const cases = doc.layout_cases ?? [];

// The Map rows a case reads: the one its `map` id names, or, for a row with no string id, each position `map_index`
// lists (serial 111); the answer is the case's `want` for each.
function rowsRead(c) {
  if (c.map_index !== undefined) {
    assert.ok(c.map === undefined, `${c.name}: both map and map_index`);
    assert.ok(Array.isArray(c.map_index) && c.map_index.length > 0, `${c.name}: map_index is a list of positions`);
    return c.map_index.map((i) => {
      const row = c.elements[i];
      assert.ok(row && row.type === 'map', `${c.name}: map_index ${i} is no Map row`);
      return row;
    });
  }
  assert.ok(typeof c.map === 'string' && c.map !== '', `${c.name}: neither a map id nor map_index`);
  const map = c.elements.find((e) => e.type === 'map' && e.id === c.map);
  assert.ok(map, `${c.name}: no Map row with the case's id`);
  return [map];
}

function readAll(c) {
  return rowsRead(c).map((map) => layoutOf(map, c.elements.filter((e) => e.type === 'map'), c.elements.filter((e) => e.type === 'pin')));
}

test('the fixture holds the layout reading\'s cases', () => {
  assert.equal(doc.profile, 'map-space');
  assert.equal(cases.length, 29, `the fixture holds ${cases.length} layout cases, serial 127 has 29`);
  assert.equal(new Set(cases.map((c) => c.name)).size, cases.length, 'two layout cases share a name');
});

for (const c of cases) {
  test(`layout fixture: ${c.name}`, () => {
    for (const got of readAll(c)) {
      assert.deepStrictEqual(got, c.want);
      // Byte for byte, key order included.
      assert.equal(JSON.stringify(got), JSON.stringify(c.want));
    }
  });
}

test('every answer holds its three keys in order, and the map-space reading carries no layout key', () => {
  for (const c of cases) {
    for (const got of readAll(c)) assert.deepEqual(Object.keys(got), ['layout', 'ground', 'hand']);
    assert.deepEqual(Object.keys(mapSpace(c.elements)), ['maps', 'zones', 'pins', 'out']);
  }
});

// Beyond the fixture: the page's readings the cases do not exercise.
const M = 'm1';
const trail = { type: 'map', id: M, x_layout: { method: 'trail-by-place' } };

test('hand is in code point order, never UTF-16 order', () => {
  // U+FF5E sorts before U+1F600 by code point; as UTF-16 units the surrogate D83D sorts first.
  const low = String.fromCodePoint(0xff5e);
  const high = String.fromCodePoint(0x1f600);
  const pins = [high, low].map((id) => ({ type: 'pin', id, map: M, x_hand: true }));
  assert.deepStrictEqual(layoutOf(trail, [trail], pins).hand, [low, high]);
  assert.deepStrictEqual(layoutOf({ ...trail, x_layout: { method: 'hand' } }, [], pins).hand, [low, high]);
});

test('a row without a non-empty string id is no Pin, and of two rows with one id the last served is read', () => {
  const pins = [
    { type: 'pin', map: M, x_hand: true },
    { type: 'pin', id: '', map: M, x_hand: true },
    { type: 'pin', id: 7, map: M, x_hand: true },
    null,
    'p',
    { type: 'pin', id: 'p1', map: M, x_hand: true },
    { type: 'pin', id: 'p1', map: 'other', x_hand: true },
    { type: 'pin', id: 'p2', map: M },
    { type: 'pin', id: 'p2', map: M, x_hand: true },
  ];
  assert.deepStrictEqual(layoutOf(trail, [trail], pins), { layout: 'trail-by-place', ground: null, hand: ['p2'] });
});

test('a Map row without an id is no Map, and an x_layout that is a list is no layout', () => {
  const pins = [{ type: 'pin', id: 'p1', map: M, x_hand: true }];
  const none = { layout: null, ground: null, hand: [] };
  assert.deepStrictEqual(layoutOf({ type: 'map', x_layout: { method: 'hand' } }, [], pins), none);
  assert.deepStrictEqual(layoutOf({ type: 'map', id: M, x_layout: [{ method: 'hand' }] }, [], pins), none);
});

test('a ground named by a Map row the reader cannot read as an element is no ground', () => {
  const grounded = { ...trail, x_layout: { method: 'trail-by-place', settings: { ground: { map: 'g' } } } };
  assert.equal(layoutOf(grounded, [grounded, { type: 'map', id: 'g' }], []).ground, 'g');
  assert.equal(layoutOf(grounded, [grounded, { type: 'map', name: 'g' }], []).ground, null);
  assert.equal(layoutOf({ ...grounded, x_layout: { method: 'trail-by-place', settings: { ground: 'g' } } }, [{ type: 'map', id: 'g' }], []).ground, null);
});

test('layoutOf is pure: the rows are not moved, and the answer is the caller\'s own', () => {
  const c = cases.find((x) => x.name === 'board-every-pin-is-hand');
  const before = JSON.stringify(c.elements);
  const [got] = readAll(c);
  got.hand.push('planted');
  assert.equal(JSON.stringify(c.elements), before);
  assert.deepStrictEqual(readAll(c)[0], c.want);
});

test('layoutOf refuses what is not a Map and two lists', () => {
  assert.throws(() => layoutOf(null, [], []), TypeError);
  assert.throws(() => layoutOf([trail], [], []), TypeError);
  assert.throws(() => layoutOf(trail, null, []), TypeError);
  assert.throws(() => layoutOf(trail, [], { pins: [] }), TypeError);
});
