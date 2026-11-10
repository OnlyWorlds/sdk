/**
 * trail-by-place, a layout method. The parity case is Blood Meridian: the input is what that world's own reading
 * computes (places in travel order, what hangs where), the want is the published staged layout's frame, pins (every
 * key, `by` included) and route. Then the method's own rules on its own answer, a re-run from the recipe, and the
 * refusals. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { trailByPlace, TRAIL_TIERS, roundHalfEven, mapSpace } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/layout/trail-by-place.json', import.meta.url));
const bytes = readFileSync(FIXTURE);
const fx = JSON.parse(bytes.toString('utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const FIXTURE_SHA = '73dd976db27891d7';

test('the fixture is the one both packages hold', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), FIXTURE_SHA);
});

test('Blood Meridian: frame, pins and route are the staged layout\'s, pin for pin, every key', () => {
  const got = trailByPlace(clone(fx.input));
  assert.deepEqual(got.map, fx.want.map);
  assert.equal(got.pins.length, fx.want.pins.length);
  assert.equal(JSON.stringify(got.pins), JSON.stringify(fx.want.pins));
  assert.deepEqual(got.route, fx.want.route);
});

for (const c of fx.cases) {
  test(`case: ${c.name}`, () => {
    if (c.refuse) {
      assert.throws(() => trailByPlace(clone(c.input)), (e) => e instanceof TypeError && e.message === `trailByPlace: ${c.refuse}`);
      return;
    }
    const got = trailByPlace(clone(c.input));
    const { recipe, ...rest } = got;
    assert.equal(JSON.stringify(rest), JSON.stringify(c.want));
  });
}

test('the default floors are the ones the fixture names', () => {
  assert.deepEqual(clone(TRAIL_TIERS), fx.input.tiers);
  const { tiers, ...rest } = clone(fx.input);
  assert.equal(JSON.stringify(trailByPlace(rest).pins), JSON.stringify(fx.want.pins));
  assert.ok(Object.isFrozen(TRAIL_TIERS));
});

test('the recipe runs the layout again from the Map alone', () => {
  const first = trailByPlace(clone(fx.input));
  const { places, hangers, hero } = clone(fx.input);
  const again = trailByPlace({ ...clone(first.recipe.settings), places, hangers, hero });
  assert.equal(first.recipe.method, 'trail-by-place');
  // the ground Map's id travels in the recipe, so a tool finds its picture
  assert.deepEqual(first.recipe.settings.ground, fx.input.ground);
  assert.equal(typeof first.recipe.settings.ground.map, 'string');
  assert.equal(JSON.stringify(again), JSON.stringify(first));
});

test('a ground without its map id carries none in the recipe', () => {
  const i = clone(fx.input);
  delete i.ground.map;
  assert.deepEqual(Object.keys(trailByPlace(i).recipe.settings.ground), ['width', 'height']);
});

test('the order hangers come in does not move a point', () => {
  const inp = clone(fx.input);
  inp.hangers.reverse();
  assert.equal(JSON.stringify(trailByPlace(inp).pins), JSON.stringify(fx.want.pins));
});

test('the method\'s own rules hold on its answer', () => {
  const got = trailByPlace(clone(fx.input));
  const { width, height, depth } = got.map;
  const points = new Set();
  for (const p of got.pins) {
    for (const [k, hi] of [['x', width], ['y', height], ['z', depth]]) {
      assert.ok(Number.isSafeInteger(p[k]) && p[k] >= 0 && p[k] <= hi, `${p.name}: ${k} ${p[k]}`);
    }
    const key = `${p.x},${p.y},${p.z}`;
    assert.ok(!points.has(key), `${p.name} shares ${key}`);
    points.add(key);
  }
  // nothing shares a place's own point, at any height
  const placeXY = new Set(fx.input.places.map((q) => got.pins.find((p) => p.element_id === q.id)).map((p) => `${p.x},${p.y}`));
  for (const p of got.pins) if (!fx.input.places.some((q) => q.id === p.element_id)) assert.ok(!placeXY.has(`${p.x},${p.y}`), p.name);
  // the hero stands first on its place's spiral
  const hero = got.pins.find((p) => p.element_id === fx.input.hero.id);
  assert.match(hero.by, /; 1 of \d+ on the spiral round it$/);
  // the pins read back through the map-space reader at the same points
  const mapId = '01a00000-0000-7000-8000-00000000000a';
  const rows = [{ id: mapId, type: 'map', name: 'layout', width, height, depth },
    ...got.pins.map((p, i) => ({ id: `01a00000-0000-7000-8000-${String(i).padStart(12, '0')}`, type: 'pin', name: p.name, map: mapId, element_type: p.element_type, element_id: p.element_id, x: p.x, y: p.y, z: p.z }))];
  const read = mapSpace(rows);
  assert.equal(read.pins.length, got.pins.length);
  const at = new Map(read.pins.map((q) => [q.element_id, [q.x, q.y, q.z]]));
  for (const p of got.pins) assert.deepEqual(at.get(p.element_id), [p.x, p.y, p.z], p.name);
});

test('rounding is half to even, as Python rounds', () => {
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999, 2.5001].map(roundHalfEven), [0, 2, 2, 0, -2, 2, 3]);
});

test('an input it cannot place is refused by name, nothing placed', () => {
  const bad = (mut, re) => { const i = clone(fx.input); mut(i); assert.throws(() => trailByPlace(i), re); };
  bad((i) => { i.ground.widht = 1; }, /ground: unknown option 'widht'/);
  bad((i) => { i.spirall = {}; }, /unknown option 'spirall'/);
  bad((i) => { i.ground.map = ''; }, /ground\.map is the ground Map's element id/);
  bad((i) => { i.ground.map = 7; }, /ground\.map is the ground Map's element id/);
  bad((i) => { i.places[1].pinn = [0, 0]; }, /place 1: unknown option 'pinn'/);
  bad((i) => { i.hangers[0].where = 'x'; }, /hanger 0: unknown option 'where'/);
  bad((i) => { i.places[1].parent = i.places[0].id; }, /needs exactly one of pin, between, parent; it has pin, parent/);
  bad((i) => { const p = i.places.find((q) => q.between); delete p.between; }, /it has none/);
  bad((i) => { const p = i.places.find((q) => q.between); p.between = [p.between[0], i.places.find((q) => q.parent).id]; }, /which has no pin/);
  bad((i) => { i.hangers[0].at = ['nowhere']; }, /at names nowhere, which is not one of the places/);
  bad((i) => { i.hangers[0].type = 'starship'; }, /no tier holds the kind 'starship'/);
  bad((i) => { i.hangers.push(clone(i.hangers[0])); }, /is given twice/);
  bad((i) => { i.hangers.push({ ...clone(i.hero) }); }, /is given twice/);
  bad((i) => { const [a, b] = i.places.filter((q) => q.parent); a.parent = b.id; b.parent = a.id; }, /never reaches a placed place/);
  bad((i) => { i.depth = 0; }, /depth is a whole number above 0/);
  bad((i) => { i.spiral.r0 = 0; }, /spiral is/);
  bad((i) => { i.places[1].pin = [1, 'x']; }, /pin is \[x, y\]/);
});
