/**
 * by-links-3d, a 3D layout method read from a world's graph and its Maps and Pins. The method's shared fixture
 * (test/fixtures/layout/by-links-3d.fixture.json, its sha256 pinned here) gives each case's input and the answer the
 * reference implementation gives; the fixture's head (`call`, `compare`) says how a case is run and compared:
 *   exact    every element placed centre, with or map: each of x, y, z the same double (Object.is: -0 is not 0); and
 *            every ids, how, group, part, held and centres entry
 *   within   every element placed arm, link or shelf that is not held: each of x, y, z within 1e-9 of a rest, since
 *            those are placed with the runtime's cosine and sine
 *   held     every element answered as held: the very double the case's input.held gives for it
 *   refused  the call throws before anything runs, with the case's code, on a TypeError or a RangeError
 *   unplaced each case of the unplaced suite: unplacedByLinks3d answers the same ids in the same order
 * Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { layoutByLinks3d, unplacedByLinks3d, BY_LINKS_3D_REST } from '../dist/index.js';

const bytes = readFileSync(new URL('./fixtures/layout/by-links-3d.fixture.json', import.meta.url));
const fx = JSON.parse(bytes.toString('utf8'));
const FIXTURE_SHA = 'b29606c379633a5fa13f35f71d449b67cb417013c2bfc223024650c7945edb37';
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

test('the fixture is the one the method\'s reference made', () => {
  assert.equal(sha(bytes), FIXTURE_SHA);
  assert.equal(fx.method, 'by-links-3d');
  assert.equal(fx.rest, BY_LINKS_3D_REST);
  assert.deepEqual(Object.keys(fx.compare), ['exact', 'within', 'held', 'refused', 'unplaced']);
});

test('the baked directions table is codegen/layout/directions.json, the table the fixture names', () => {
  const json = readFileSync(new URL('../codegen/layout/directions.json', import.meta.url));
  assert.equal(sha(json), fx.table_sha256);
  const text = readFileSync(new URL('../src/layout-directions.generated.ts', import.meta.url), 'utf8');
  const start = text.indexOf('= {');
  const end = text.lastIndexOf('};');
  assert.ok(start > 0 && end > start, 'the generated module holds one literal');
  // deepStrictEqual compares numbers with Object.is, so a -0 written as 0 fails here
  assert.deepStrictEqual(JSON.parse(text.slice(start + 2, end + 1)), JSON.parse(json.toString('utf8')).directions);
});

for (const c of fx.cases) {
  const kind = c.want.refused !== undefined ? `refused, ${c.want.refused}` : `${c.want.ids.length} elements`;
  test(`by-links-3d: ${c.name} (${kind})`, () => {
    assert.equal(c.steps, 300, 'every case runs at the method\'s own 300 steps');
    if (c.want.refused !== undefined) {
      assert.throws(() => run(clone(c.input)), (err) => {
        assert.ok(err instanceof ERROR_CLASS[c.want.refused], `a ${ERROR_CLASS[c.want.refused].name}, got ${err && err.constructor.name}`);
        assert.equal(err.code, c.want.refused);
        return true;
      });
      return;
    }
    const want = c.want;
    const got = run(clone(c.input));
    assert.equal(got.method, 'by-links-3d');
    assert.deepEqual(got.ids, want.ids);
    for (const key of ['how', 'group', 'part', 'held', 'centres']) assert.deepEqual(got[key], want[key], key);
    assert.ok(got.points instanceof Float64Array);
    assert.equal(got.points.length, want.points.length);
    const tolerance = 1e-9 * fx.rest;
    const off = [];
    want.ids.forEach((id, i) => {
      for (let a = 0; a < 3; a++) {
        const v = got.points[3 * i + a], w = want.points[3 * i + a];
        let same;
        if (want.held[i] === true) {
          const h = c.input.held[id][a];
          same = Object.is(v, h) && Object.is(w, h);
        } else if (EXACT.has(want.how[i])) same = Object.is(v, w);
        else same = Math.abs(v - w) <= tolerance;
        if (!same) off.push(`${id}.${'xyz'[a]} (${want.how[i]}${want.held[i] ? ', held' : ''}): ${fmt(v)}, want ${fmt(w)}`);
      }
    });
    assert.deepEqual(off, [], `${off.length} numbers differ`);
  });
}

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
  for (const name of ['Moppetopia', 'held: a saved answer, rounded, with heldUnit']) {
    const c = named(name);
    const base = run(clone(c.input));
    const input = clone(c.input);
    // a fixed shuffle: every third node first, then the rest reversed; the links reversed
    const nodes = input.nodes;
    input.nodes = [...nodes.filter((_, i) => i % 3 === 0), ...nodes.filter((_, i) => i % 3 !== 0).reverse()];
    input.edges = [...input.edges].reverse();
    if (input.rows) input.rows = [...input.rows].reverse();
    const got = run(input);
    assert.deepEqual(got.ids, input.nodes.map((x) => x.id));
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
  for (const name of ['a small plate taken on the second pass', 'held: a leaf beside a held leaf under a pinned parent', 'held: a saved answer, rounded, with heldUnit']) {
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

test('the function and its rest are exported, with its two types', () => {
  assert.equal(typeof layoutByLinks3d, 'function');
  assert.equal(typeof unplacedByLinks3d, 'function');
  assert.equal(BY_LINKS_3D_REST, 60);
  const dts = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  for (const name of ['OwLayoutByLinks3d', 'OwLayoutByLinks3dOptions']) {
    assert.match(dts, new RegExp(`(?:interface|type) ${name}\\b`), `${name} is declared`);
  }
  const empty = layoutByLinks3d({ nodes: [], edges: [] });
  assert.deepEqual({ ...empty, points: [...empty.points] }, { method: 'by-links-3d', ids: [], points: [], how: [], group: [], part: [], centres: [], held: [] });
});
