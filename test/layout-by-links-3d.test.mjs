/**
 * by-links-3d, a 3D layout method read from a world's graph and its Maps and Pins. The method's fixture is the layout
 * profile's own, read from the pinned distribution (codegen/schema-dist/profiles/layout-by-links-3d.fixture.json, its
 * sha256 pinned here); it gives each case's input and the answer the reference implementation gives, and its head
 * (`call`, `compare`) says how a case is run and compared:
 *   pieces   a ring piece is a piece other than the main one (the undirected pairs; the main piece the largest, a tie
 *            to the lower least id), of two nodes or more, none placed map and none in input.held
 *   exact    every ids, unplaced, how, group, part, held and centres entry; and every element not of a ring piece
 *            placed centre, with or map: each of x, y, z the same double, a zero compared by its value
 *   within   every element placed arm or link that is not held, and every element of a ring piece: each of x, y, z
 *            within 1e-9 of a rest, since those are placed with the runtime's cosine, sine and arcsine
 *   held     every element answered as held: the very double the case's input.held gives for it
 *   refused  the call throws, with the case's code, on a TypeError or a RangeError
 *   unplaced each case of the unplaced suite: unplacedByLinks3d answers the same ids in the same order
 * The replay walks every case and names each that disagrees, so one wrong case never hides another.
 * Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { layoutByLinks3d, unplacedByLinks3d, BY_LINKS_3D_REST, BY_LINKS_3D_VERSION } from '../dist/index.js';

const bytes = readFileSync(new URL('../codegen/schema-dist/profiles/layout-by-links-3d.fixture.json', import.meta.url));
const fx = JSON.parse(bytes.toString('utf8'));
const FIXTURE_SHA = 'acd6da7252493485cafc24356a84c53656d078872a28c695c0f7554009b6fb2a';
const CASES = 116;
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const EXACT = new Set(['centre', 'with', 'map']);
const ERROR_CLASS = { 'held-not-object': TypeError, 'held-not-point': TypeError, 'held-box': RangeError, 'held-unit': RangeError };
const fmt = (v) => (Object.is(v, -0) ? '-0' : String(v));

// input.held and input.heldUnit are handed only where the input has the key (a null is handed as null)
function optionsOf(input) {
  const o = {};
  if ('held' in input) o.held = input.held;
  if ('heldUnit' in input) o.heldUnit = input.heldUnit;
  return o;
}
const run = (input) => layoutByLinks3d({ nodes: input.nodes, edges: input.edges }, input.rows, optionsOf(input));

// compare.pieces: the ids of the case's ring pieces' nodes, read from the graph and the want alone
function ringIds(c) {
  const ids = c.input.nodes.map((x) => x.id);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (a) => { while (parent.get(a) !== a) a = parent.get(a); return a; };
  // code point order (JavaScript's < on strings is UTF-16 order, which differs past U+FFFF)
  const byCp = (a, b) => { const x = [...a].map((ch) => ch.codePointAt(0)), y = [...b].map((ch) => ch.codePointAt(0)); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
  for (const e of c.input.edges) {
    if (!parent.has(e.source) || !parent.has(e.target) || e.source === e.target) continue;
    const a = find(e.source), b = find(e.target);
    if (a !== b) { if (byCp(a, b) < 0) parent.set(b, a); else parent.set(a, b); }
  }
  const pieces = new Map();
  for (const id of ids) { const r = find(id); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(id); }
  let main = null;
  for (const [r, m] of pieces) if (main === null || m.length > pieces.get(main).length || (m.length === pieces.get(main).length && byCp(r, main) < 0)) main = r;
  const how = new Map(c.want.ids.map((id, i) => [id, c.want.how[i]]));
  const held = c.input.held && typeof c.input.held === 'object' ? c.input.held : {};
  const ring = new Set();
  for (const [r, m] of pieces) {
    if (r === main || m.length < 2) continue;
    if (m.some((id) => how.get(id) === 'map' || Object.hasOwn(held, id))) continue;
    for (const id of m) ring.add(id);
  }
  return ring;
}

// what one case disagrees on, as short lines; none when the port answers the case's want
function disagree(c) {
  if (c.steps !== 300) return ['steps is not 300'];
  if (c.want.refused !== undefined) {
    try { run(clone(c.input)); } catch (err) {
      const out = [];
      if (!(err instanceof ERROR_CLASS[c.want.refused])) out.push(`a ${ERROR_CLASS[c.want.refused].name}, got ${err && err.constructor.name}`);
      if (err.code !== c.want.refused) out.push(`code ${err.code}, want ${c.want.refused}`);
      return out;
    }
    return [`answered, want refused ${c.want.refused}`];
  }
  const want = c.want;
  let got;
  try { got = run(clone(c.input)); } catch (err) { return [`threw ${err && err.code ? err.code : err}`]; }
  const out = [];
  if (got.method !== 'by-links-3d') out.push(`method ${got.method}`);
  for (const key of ['ids', 'how', 'group', 'part', 'held', 'centres', 'unplaced']) {
    try { assert.deepEqual(got[key], want[key]); } catch { out.push(`${key}: ${JSON.stringify(got[key])}, want ${JSON.stringify(want[key])}`); }
  }
  if (out.length) return out;
  if (!(got.points instanceof Float64Array) || got.points.length !== want.points.length) return [`points: ${got.points.length} numbers, want ${want.points.length}`];
  const ring = ringIds(c);
  const tolerance = 1e-9 * fx.rest;
  want.ids.forEach((id, i) => {
    for (let a = 0; a < 3; a++) {
      const v = got.points[3 * i + a], w = want.points[3 * i + a];
      let same;
      if (want.held[i] === true) {
        const h = c.input.held[id][a];
        same = v === h && w === h;
      } else if (EXACT.has(want.how[i]) && !ring.has(id)) same = v === w; // a zero compared by its value
      else same = Math.abs(v - w) <= tolerance;
      if (!same) out.push(`${id}.${'xyz'[a]} (${want.how[i]}${want.held[i] ? ', held' : ''}${ring.has(id) ? ', ring' : ''}): ${fmt(v)}, want ${fmt(w)}`);
    }
  });
  return out;
}

test('the fixture is the pinned distribution\'s, and its head says what this test reads', () => {
  assert.equal(sha(bytes), FIXTURE_SHA);
  assert.equal(fx.method, 'by-links-3d');
  assert.equal(fx.rest, BY_LINKS_3D_REST);
  assert.equal(fx.ring_gap, 1.8 * BY_LINKS_3D_REST);
  assert.equal(fx.fit, 0.000001);
  assert.equal(fx.fit_band, 0.0000001);
  assert.deepEqual(Object.keys(fx.compare), ['pieces', 'exact', 'within', 'held', 'refused', 'fit', 'unplaced']);
});

test('the baked directions table is codegen/layout/directions.json, byte for byte the distribution\'s table', () => {
  const json = readFileSync(new URL('../codegen/layout/directions.json', import.meta.url));
  const dist = readFileSync(new URL('../codegen/schema-dist/profiles/layout-by-links-3d.directions.json', import.meta.url));
  assert.ok(json.equals(dist), 'codegen/layout/directions.json is the distribution\'s directions file');
  assert.equal(sha(json), fx.table_sha256);
  const text = readFileSync(new URL('../src/layout-directions.generated.ts', import.meta.url), 'utf8');
  const start = text.indexOf('= {');
  const end = text.lastIndexOf('};');
  assert.ok(start > 0 && end > start, 'the generated module holds one literal');
  // deepStrictEqual compares numbers with Object.is, so a -0 written as 0 fails here
  assert.deepStrictEqual(JSON.parse(text.slice(start + 2, end + 1)), JSON.parse(json.toString('utf8')).directions);
});

test('by-links-3d: every case of the fixture, each that disagrees named', () => {
  const wrong = [];
  for (const c of fx.cases) {
    const off = disagree(c);
    if (off.length) wrong.push(`${c.name}: ${off.length} difference(s), first ${off[0]}`);
  }
  assert.deepEqual(wrong, [], `${wrong.length} case(s) disagree`);
  assert.equal(fx.cases.length, CASES);
});

// a case with a plate, small plates and every kind of placing, for the tests below
const named = (name) => {
  const c = fx.cases.find((x) => x.name === name);
  assert.ok(c, `the fixture has the case ${name}`);
  return c;
};

test('an unknown option key is refused by name, before anything runs', () => {
  const c = named('a small plate over a place');
  assert.throws(() => layoutByLinks3d({ nodes: c.input.nodes, edges: c.input.edges }, c.input.rows, { held: null, heldUnits: 1 }),
    (err) => err instanceof TypeError && /^layoutByLinks3d: unknown option 'heldUnits'/.test(err.message));
  // the refusal comes before the held points are read: a held value that is no point is not reached
  assert.throws(() => layoutByLinks3d({ nodes: [], edges: [] }, null, { held: { a: [1] }, nope: true }),
    (err) => err instanceof TypeError && /unknown option 'nope'/.test(err.message) && err.code === undefined);
  assert.throws(() => layoutByLinks3d(null), (err) => err instanceof TypeError && /the graph is \{ nodes, edges \}/.test(err.message));
});

test('the answer follows the handed order: shuffled nodes and links give each id the same point', () => {
  for (const name of ['Moppetopia', 'held: an earlier answer rounded to whole numbers, with heldUnit', 'pieces: three rings', 'pieces: centres across held and pinned pieces']) {
    const c = named(name);
    const base = run(clone(c.input));
    const input = clone(c.input);
    // a fixed shuffle: every third node first, then the rest reversed; the links reversed
    const nodes = input.nodes;
    input.nodes = [...nodes.filter((_, i) => i % 3 === 0), ...nodes.filter((_, i) => i % 3 !== 0).reverse()];
    input.edges = [...input.edges].reverse();
    if (input.rows) input.rows = [...input.rows].reverse();
    const got = run(input);
    // the placed nodes in the order handed in; the unplaced by id, whatever the order
    assert.deepEqual(got.unplaced, base.unplaced);
    assert.deepEqual(got.ids, input.nodes.map((x) => x.id).filter((id) => !got.unplaced.includes(id)));
    const at = new Map(base.ids.map((id, i) => [id, i]));
    got.ids.forEach((id, i) => {
      const j = at.get(id);
      for (let a = 0; a < 3; a++) assert.ok(Object.is(got.points[3 * i + a], base.points[3 * j + a]), `${name}: ${id}.${'xyz'[a]}`);
      for (const key of ['how', 'group', 'part', 'held']) assert.equal(got[key][i], base[key][j], `${name}: ${id}.${key}`);
    });
    assert.deepEqual(got.centres, base.centres);
  }
});

test('the call changes none of its inputs', () => {
  for (const name of ['a small plate taken on the second pass', 'held: a leaf beside a held leaf under a pinned parent', 'held: an earlier answer rounded to whole numbers, with heldUnit']) {
    const c = named(name);
    const graph = { nodes: clone(c.input.nodes), edges: clone(c.input.edges) };
    const elements = clone(c.input.rows);
    const options = clone(optionsOf(c.input));
    const before = clone({ graph, elements, options });
    layoutByLinks3d(graph, elements, options);
    assert.deepStrictEqual({ graph, elements, options }, before, name);
  }
});

for (const c of fx.unplaced) {
  test(`unplaced: ${c.name} (${c.want.length} id(s), exact)`, () => {
    assert.deepEqual(unplacedByLinks3d(clone(c.graph), clone(c.placed)), c.want);
  });
}

test('unplaced: placed is a list or a Set, read the same; what is no id in it is passed over', () => {
  const c = fx.unplaced.find((x) => x.name === 'by-links-3d-a-node-with-no-link-and-a-node-off-the-main-piece');
  assert.equal(c.want.length, 4);
  assert.deepEqual(unplacedByLinks3d(clone(c.graph), new Set(c.placed)), c.want);
  // a Pin that stands for no element gives no id: null, undefined, '' and a number place nothing
  assert.deepEqual(unplacedByLinks3d(clone(c.graph), [null, undefined, '', 7, ...c.placed, ...c.placed]), c.want);
  assert.deepEqual(unplacedByLinks3d(clone(c.graph), new Set([null, undefined, '', 7, ...c.placed])), c.want);
  // nothing placed: every node, by id in code point order, whatever order was handed
  const ids = c.graph.nodes.map((x) => x.id);
  assert.deepEqual(unplacedByLinks3d(clone(c.graph), []), [...ids].sort());
  assert.notDeepEqual(ids, [...ids].sort());
  assert.deepEqual(unplacedByLinks3d({ nodes: [], edges: [] }, []), []);
});

test('unplaced: a placed that is no list is refused by name, and so is what the layout refuses', () => {
  const g = { nodes: [{ id: 'a', type: 'character' }], edges: [] };
  for (const placed of [undefined, null, 'a', 7, { a: true }]) {
    assert.throws(() => unplacedByLinks3d(g, placed), /^TypeError: unplacedByLinks3d: placed is a list or a Set of element ids$/);
  }
  for (const graph of [undefined, null, 'a', [], { nodes: [] }, { edges: [] }, { nodes: {}, edges: [] }]) {
    assert.throws(() => unplacedByLinks3d(graph, []), /^TypeError: unplacedByLinks3d: the graph is \{ nodes, edges \}/);
  }
  // two nodes with one id: an Error, as layoutByLinks3d's own
  const twice = { nodes: [{ id: 'a', type: 'character' }, { id: 'b', type: 'object' }, { id: 'a', type: 'location' }], edges: [] };
  assert.throws(() => layoutByLinks3d(clone(twice)), (err) => err.constructor === Error && /^layoutByLinks3d: two nodes share the id a$/.test(err.message));
  assert.throws(() => unplacedByLinks3d(clone(twice), []), (err) => err.constructor === Error && /^unplacedByLinks3d: two nodes share the id a$/.test(err.message));
});

test('the golden angle is written as the double PI * (3 - sqrt(5)) is', () => {
  const src = readFileSync(new URL('../src/layout3d/hang.ts', import.meta.url), 'utf8');
  const m = src.match(/^export const GOLD = ([0-9.]+);$/m);
  assert.ok(m, 'hang.ts writes GOLD as a number');
  assert.ok(Object.is(Number(m[1]), Math.PI * (3 - Math.sqrt(5))));
});

test('the function and its rest are exported, with its two types', () => {
  assert.equal(typeof layoutByLinks3d, 'function');
  assert.equal(typeof unplacedByLinks3d, 'function');
  assert.equal(BY_LINKS_3D_REST, 60);
  assert.equal(typeof BY_LINKS_3D_VERSION, 'number');
  const dts = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  for (const name of ['OwLayoutByLinks3d', 'OwLayoutByLinks3dOptions']) {
    assert.match(dts, new RegExp(`(?:interface|type) ${name}\\b`), `${name} is declared`);
  }
  const empty = layoutByLinks3d({ nodes: [], edges: [] });
  assert.deepEqual({ ...empty, points: [...empty.points] }, { method: 'by-links-3d', ids: [], points: [], how: [], group: [], part: [], centres: [], held: [], unplaced: [] });
});

// BY_LINKS_3D_VERSION is raised exactly when an answer moves: every case is pinned to its want under the version
// (test/fixtures/layout/by-links-3d.answers.json, written by scripts/pin-layout-answers.mjs, which refuses a moved
// answer under the same version). A fixture made again with a moved answer fails here until the version is raised.
test('BY_LINKS_3D_VERSION is the version every case of the fixture is pinned under, and no pin has moved', () => {
  const pins = JSON.parse(readFileSync(new URL('./fixtures/layout/by-links-3d.answers.json', import.meta.url), 'utf8'));
  assert.ok(Number.isSafeInteger(BY_LINKS_3D_VERSION) && BY_LINKS_3D_VERSION >= 1, 'the version is a whole number from 1');
  assert.equal(pins.version, BY_LINKS_3D_VERSION, 'the pins are under the exported version');
  const names = fx.cases.map((c) => c.name);
  assert.ok(names.length > 0, 'the fixture holds cases');
  assert.deepEqual(Object.keys(pins.answers), names, 'every case is pinned, in the fixture\x27s order, and nothing else');
  const moved = fx.cases.filter((c) => pins.answers[c.name] !== sha(JSON.stringify(c.want))).map((c) => c.name);
  assert.deepEqual(moved, [], `answers moved under BY_LINKS_3D_VERSION ${BY_LINKS_3D_VERSION}: raise it, then node scripts/pin-layout-answers.mjs`);
});
