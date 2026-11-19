/**
 * The map-space profile's frame reading (schema-dist profiles/map-space.md, rules 13 and 14): every case of the
 * fixture's `frame_cases`, vendored with the distribution, as its own test. Each case is read as the page says: `map`
 * is the last Map row served with the case's id (or each row `map_index` lists), `maps` every row of the case, of
 * which the reader keeps the Maps itself, and `point` the case's. A number in `parent_frame` and in `points` compares
 * as a 64-bit float, exactly and with no tolerance (so 0 and -0 are one number); every other part as written, key
 * order included. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { carryOf, layoutOf, mapSpace } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/map-space.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no map-space fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const cases = doc.frame_cases ?? [];

function rowsRead(c) {
  if (c.map_index !== undefined) {
    assert.ok(c.map === undefined, `${c.name}: both map and map_index`);
    assert.ok(Array.isArray(c.map_index) && c.map_index.length > 0, `${c.name}: map_index is a list of positions`);
    return c.map_index.map((i) => {
      assert.ok(c.elements[i] !== undefined, `${c.name}: map_index ${i} is past the elements`);
      return c.elements[i];
    });
  }
  assert.ok(typeof c.map === 'string' && c.map !== '', `${c.name}: neither a map id nor map_index`);
  const rows = c.elements.filter((e) => e.type === 'map' && e.id === c.map);
  assert.ok(rows.length > 0, `${c.name}: no Map row with the case's id`);
  return [rows[rows.length - 1]];
}

// Exactly equal, numbers as 64-bit floats (=== on numbers), everything else as written, key order held.
function same(got, want, path) {
  if (typeof want === 'number') {
    assert.equal(typeof got, 'number', `${path}: a number`);
    assert.ok(got === want, `${path}: ${got} is not ${want}`);
    return;
  }
  if (Array.isArray(want)) {
    assert.ok(Array.isArray(got), `${path}: a list`);
    assert.equal(got.length, want.length, `${path}: length`);
    want.forEach((w, i) => same(got[i], w, `${path}[${i}]`));
    return;
  }
  if (want !== null && typeof want === 'object') {
    assert.ok(got !== null && typeof got === 'object' && !Array.isArray(got), `${path}: an object`);
    assert.deepEqual(Object.keys(got), Object.keys(want), `${path}: keys in order`);
    for (const k of Object.keys(want)) same(got[k], want[k], `${path}.${k}`);
    return;
  }
  assert.equal(got, want, path);
}

test('the fixture holds the frame reading\'s cases', () => {
  assert.equal(doc.profile, 'map-space');
  assert.equal(cases.length, 66, `the fixture holds ${cases.length} frame cases, the frame's serial has 66`);
  assert.equal(new Set(cases.map((c) => c.name)).size, cases.length, 'two frame cases share a name');
});

for (const c of cases) {
  test(`frame fixture: ${c.name}`, () => {
    for (const row of rowsRead(c)) same(carryOf(row, c.point, c.elements), c.want, 'answer');
  });
}

test('every answer holds its four keys in order, and the other two readings carry no frame key', () => {
  for (const c of cases) {
    for (const row of rowsRead(c)) assert.deepEqual(Object.keys(carryOf(row, c.point, c.elements)), ['parent_frame', 'lint', 'points', 'stop']);
    const space = mapSpace(c.elements);
    for (const m of space.maps) assert.ok(!('parent_frame' in m) && !('x_parent_frame' in m), `${c.name}: a map-space entry carries a frame key`);
  }
});

test('carryOf refuses a point that is not two finite numbers, and a map that is not one element', () => {
  const m = { type: 'map', id: 'a', width: 10, height: 10 };
  for (const bad of [[1], [1, 2, 3], ['1', 2], [1, Number.NaN], [1, Infinity], null, undefined, {}]) {
    assert.throws(() => carryOf(m, bad, [m]), TypeError);
  }
  assert.throws(() => carryOf(null, [1, 2], []), TypeError);
  assert.throws(() => carryOf(m, [1, 2], null), TypeError);
  assert.ok(typeof layoutOf === 'function');
});
