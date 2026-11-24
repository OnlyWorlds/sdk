/**
 * pinsKnownTo: which of a map's Pins one reader knows. The shared cases (test/fixtures/pins-known-to.cases.json, the
 * same bytes the Python package's pins_known_to runs, its sha256 pinned here): the whole answer of each case, key
 * order included, and each refusal; then what the cases cannot hold: the inputs left as they were, and the answer
 * beside mapSpace's. Runs against the compiled public bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mapSpace, pinsKnownTo } from '../dist/index.js';

const CASES = new URL('./fixtures/pins-known-to.cases.json', import.meta.url);
const CASES_SHA256 = '80f66dba8aa1a009770bdcffbf457ec84b78f7e4270a2fb9cf8614a4b76e39f6';
const bytes = readFileSync(CASES);
const fixture = JSON.parse(bytes.toString('utf8'));

test('the cases file is the pinned bytes, the ones the Python package runs', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CASES_SHA256);
  assert.equal(fixture.version, 1);
  assert.equal(fixture.cases.length, 31, `${fixture.cases.length} cases`);
  assert.equal(fixture.refusals.length, 8, `${fixture.refusals.length} refusals`);
});

test('every shared case: the whole answer, key order included', () => {
  const wrong = [];
  for (const c of fixture.cases) {
    // JSON text holds the key order and every value: two answers are the same exactly when their texts are.
    const got = JSON.stringify(pinsKnownTo(c.pins, c.served));
    const want = JSON.stringify(c.want);
    if (got !== want) wrong.push(`${c.name}\n    want ${want}\n    got  ${got}`);
  }
  assert.equal(wrong.length, 0, `${wrong.length} case(s) disagree:\n  ${wrong.join('\n  ')}`);
});

test('every shared refusal: a TypeError that names the argument, and no other', () => {
  const wrong = [];
  for (const r of fixture.refusals) {
    let thrown = null;
    try { pinsKnownTo(r.pins, r.served); } catch (e) { thrown = e; }
    const other = r.refuses === 'pins' ? 'served' : 'pins';
    if (!(thrown instanceof TypeError)) wrong.push(`${r.name}: ${thrown === null ? 'answered' : `threw ${thrown}`}`);
    // "is a list": the runtime's own "pins is not iterable" is not this refusal.
    else if (!thrown.message.includes(`${r.refuses} is a list`) || thrown.message.includes(`${other} is a list`)) wrong.push(`${r.name}: "${thrown.message}" does not name ${r.refuses} alone`);
  }
  assert.equal(wrong.length, 0, `${wrong.length} refusal(s) disagree:\n  ${wrong.join('\n  ')}`);
});

test('undefined is refused like null', () => {
  assert.throws(() => pinsKnownTo(undefined, []), TypeError);
  assert.throws(() => pinsKnownTo([], undefined), TypeError);
});

test('the inputs are left as they were', () => {
  // Each case is parsed afresh from the file's bytes: a copy of the shared object would carry a write too.
  const before = JSON.parse(bytes.toString('utf8')).cases;
  const run = JSON.parse(bytes.toString('utf8')).cases;
  for (const c of run) pinsKnownTo(c.pins, c.served);
  run.forEach((c, i) => {
    assert.equal(JSON.stringify(c.pins), JSON.stringify(before[i].pins), `${c.name}: pins`);
    assert.equal(JSON.stringify(c.served), JSON.stringify(before[i].served), `${c.name}: served`);
  });
});

test('frozen inputs are read', () => {
  const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  for (const c of JSON.parse(bytes.toString('utf8')).cases) {
    assert.equal(JSON.stringify(pinsKnownTo(freeze(c.pins), freeze(c.served))), JSON.stringify(c.want), c.name);
  }
});

test('two calls answer two objects', () => {
  const pins = [{ type: 'pin', id: 'p1', map: 'm1', element_type: 'location', element_id: 'l1' }];
  const served = [{ type: 'location', id: 'l1' }];
  const a = pinsKnownTo(pins, served);
  const b = pinsKnownTo(pins, served);
  assert.notEqual(a, b);
  assert.notEqual(a.known, b.known);
  assert.notEqual(a.known[0], b.known[0]);
  assert.notEqual(a.out, b.out);
});

test('beside mapSpace: a drawing keeps the Pins both name', () => {
  const world = [
    { type: 'map', id: 'm1', width: 100, height: 100 },
    { type: 'pin', id: 'p1', map: 'm1', x: 1, y: 2, element_type: 'location', element_id: 'l1' },
    { type: 'pin', id: 'p2', map: 'm1', x: 3, y: 4, element_type: 'location', element_id: 'l2' },
    { type: 'pin', id: 'p3', map: 'm1', element_type: 'location', element_id: 'l1' }, // known, with no point
    { type: 'pin', id: 'p4', map: 'gone', x: 5, y: 6, element_type: 'location', element_id: 'l1' }, // known, on no Map
    { type: 'location', id: 'l1' },
    { type: 'location', id: 'l2' },
  ];
  const served = [{ type: 'location', id: 'l1', known_of: true }];
  const answer = pinsKnownTo(world, served);
  assert.deepEqual(answer.known.map((k) => k.pin), ['p1', 'p3', 'p4']);
  assert.equal(answer.unknown, 1);
  const how = new Map(answer.known.map((k) => [k.pin, k.how]));
  const drawn = mapSpace(world).pins.filter((p) => how.has(p.pin));
  assert.deepEqual(drawn.map((p) => [p.pin, p.x, p.y, how.get(p.pin)]), [['p1', 1, 2, 'known_of']]);
});
