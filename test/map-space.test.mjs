/**
 * The map-space profile (draft): mapSpace on every case of test/fixtures/map-space.fixture.json, the whole answer
 * of each case compared as a value and as bytes (key order held). Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapSpace } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/map-space.fixture.json', import.meta.url));
const FIXTURE_SHA256 = '06bdc30a84dde361bfba59e06fce8e6bbacb25c7164015e114118c1df25f3840';
const bytes = readFileSync(FIXTURE);
const doc = JSON.parse(bytes.toString('utf8'));

test('the fixture is the map-space profile\'s, held byte for byte', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256);
  assert.equal(doc.profile, 'map-space');
  assert.equal(doc.cases.length, 22);
});

for (const c of doc.cases) {
  test(`map-space fixture: ${c.name}`, () => {
    const got = mapSpace(c.elements);
    assert.deepEqual(got, c.want);
    // Byte for byte, key order included: the profile's stable order.
    assert.equal(JSON.stringify(got), JSON.stringify(c.want));
  });
}

test('every answer holds its four keys in order, and the same input gives the same bytes', () => {
  for (const c of doc.cases) {
    const a = mapSpace(c.elements);
    assert.deepEqual(Object.keys(a), ['maps', 'zones', 'pins', 'out']);
    assert.equal(JSON.stringify(mapSpace(c.elements)), JSON.stringify(a));
  }
});

test('mapSpace is pure: the elements are not moved, and the answer is the caller\'s own', () => {
  const c = doc.cases.find((x) => x.name === 'plan-of-record-whole');
  const before = JSON.stringify(c.elements);
  const got = mapSpace(c.elements);
  got.maps[0].id = 'planted';
  got.zones[0].points[0][0] = -1;
  assert.equal(JSON.stringify(c.elements), before);
  assert.notEqual(mapSpace(c.elements).maps[0].id, 'planted');
});

test('mapSpace refuses what is not a list of elements, and passes over rows it cannot read', () => {
  assert.throws(() => mapSpace(null), TypeError);
  assert.throws(() => mapSpace({ elements: [] }), TypeError);
  const empty = { maps: [], zones: [], pins: [], out: {} };
  assert.deepEqual(mapSpace([]), empty);
  assert.deepEqual(mapSpace([null, 3, 'x', { id: 'a' }, { type: 7 }]), empty);
});
