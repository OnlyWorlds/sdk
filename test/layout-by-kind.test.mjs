/**
 * by-kind and around, two layout methods read from a world's graph. The shared fixture (the same bytes in the Python
 * package, its sha256 pinned in both tests) gives each case's graph and the points the reference made.
 *
 * by-kind compares EXACTLY: every x and y with ===, never a tolerance. The method is chaotic (one anchor moved one
 * unit in the last place moves a large world's picture by a tenth of the frame), so two runtimes agree only bit for
 * bit or not at all. around compares within 1e-12: each of its points is one cosine and one sine of an angle,
 * nothing iterates, and runtimes' cosines may differ in the last place.
 * Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { layoutByKind, layoutAround, worldGraph, GROUP_ORDER, ELEMENT_GROUPS } from '../dist/index.js';

const bytes = readFileSync(new URL('./fixtures/layout/by-kind.json', import.meta.url));
const fx = JSON.parse(bytes.toString('utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const FIXTURE_SHA = '06a023eace0f906e';
const AROUND_TOLERANCE = 1e-12;

test('the fixture is the one both packages hold', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), FIXTURE_SHA);
  assert.deepEqual(Object.keys(fx.compare), ['cases', 'around']);
});

test('the fixture\'s anchors, groups and group order are the package\'s', () => {
  const vendored = JSON.parse(readFileSync(new URL('../codegen/layout/anchors.json', import.meta.url), 'utf8'));
  assert.deepEqual(fx.anchors, vendored);
  assert.deepEqual(fx.group_order, [...GROUP_ORDER]);
  assert.deepEqual(fx.groups, { ...ELEMENT_GROUPS });
});

for (const c of fx.cases) {
  test(`by-kind: ${c.name} (${c.want.length} points, exact)`, () => {
    const got = layoutByKind(clone(c.graph));
    assert.equal(got.method, 'by-kind');
    assert.equal(got.version, 1);
    assert.equal(got.points.length, c.want.length);
    let off = 0;
    got.points.forEach((p, k) => {
      assert.equal(p.id, c.graph.nodes[k].id);
      if (!(p.x === c.want[k][0] && p.y === c.want[k][1])) off++;
    });
    assert.equal(off, 0, `${off} of ${c.want.length} points differ from the fixture`);
  });
}

for (const c of fx.around) {
  test(`around: ${c.name} (${c.want.length} points, within ${AROUND_TOLERANCE})`, () => {
    const got = layoutAround(clone(c.graph), c.focus, { steps: c.steps });
    assert.equal(got.method, 'around');
    assert.equal(got.version, 1);
    assert.deepEqual(got.points.map((p) => [p.id, p.depth]), c.want.map((w) => [w[0], w[1]]));
    got.points.forEach((p, k) => {
      assert.ok(Math.abs(p.x - c.want[k][2]) <= AROUND_TOLERANCE && Math.abs(p.y - c.want[k][3]) <= AROUND_TOLERANCE,
        `${p.id}: (${p.x}, ${p.y}) against (${c.want[k][2]}, ${c.want[k][3]})`);
    });
  });
}

test('by-kind: the answer is the same twice and the graph is left as it was', () => {
  const c = fx.cases.find((x) => x.name === 'moppetopia');
  const graph = clone(c.graph);
  const before = JSON.stringify(graph);
  assert.equal(JSON.stringify(layoutByKind(graph)), JSON.stringify(layoutByKind(graph)));
  assert.equal(JSON.stringify(graph), before);
});

test('the order nodes and links are handed in moves no point: each comes back by id, in the order handed', () => {
  // a seeded shuffle, so a failure reruns the same
  let s = 99;
  const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const byId = (points) => new Map(points.map((p) => [p.id, JSON.stringify(p)]));
  for (const name of ['hyperion', 'past-324', 'a-self-link-pulls-nothing']) {
    const g = clone(fx.cases.find((x) => x.name === name).graph);
    const mixed = { nodes: shuffle(g.nodes), edges: shuffle(g.edges) };
    const got = layoutByKind(mixed);
    assert.deepEqual(got.points.map((p) => p.id), mixed.nodes.map((x) => x.id), name);
    assert.deepEqual(byId(got.points), byId(layoutByKind(g).points), name);
  }
  const c = fx.around.find((x) => x.name === 'two-steps');
  const g = clone(c.graph);
  const mixed = { nodes: shuffle(g.nodes), edges: shuffle(g.edges) };
  const got = layoutAround(mixed, c.focus, { steps: 2 });
  const order = new Map(mixed.nodes.map((x, k) => [x.id, k]));
  assert.ok(got.points.every((p, k) => k === 0 || order.get(got.points[k - 1].id) < order.get(p.id)), 'in the order handed');
  assert.deepEqual(byId(got.points), byId(layoutAround(g, c.focus, { steps: 2 }).points));
});

test('by-kind: a link pulls both ends alike, so its direction moves nothing', () => {
  const c = fx.cases.find((x) => x.name === 'two-elements-linked');
  const g = clone(c.graph);
  const flipped = { nodes: g.nodes, edges: [{ source: g.edges[0].target, target: g.edges[0].source, field: 'x', index: 0 }] };
  assert.deepEqual(layoutByKind(flipped).points.map((p) => [p.x, p.y]), c.want);
});

test('by-kind: a frame of -1 to 1 on the longer axis, centred', () => {
  for (const name of ['hyperion', 'moppetopia', 'past-324']) {
    const { points } = layoutByKind(clone(fx.cases.find((x) => x.name === name).graph));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const wx = Math.max(...xs) - Math.min(...xs);
    const wy = Math.max(...ys) - Math.min(...ys);
    assert.ok(Math.abs(Math.max(wx, wy) - 2) < 1e-12, `${name}: span ${Math.max(wx, wy)}`);
    assert.ok(Math.abs(Math.max(...xs) + Math.min(...xs)) < 1e-12 && Math.abs(Math.max(...ys) + Math.min(...ys)) < 1e-12, name);
  }
});

test('by-kind: the empty graph answers no points, one element answers 0, 0', () => {
  assert.deepEqual(layoutByKind({ nodes: [], edges: [] }), { method: 'by-kind', version: 1, points: [] });
  assert.deepEqual(layoutByKind({ nodes: [{ id: 'a', type: 'zone' }], edges: [] }).points, [{ id: 'a', x: 0, y: 0 }]);
});

test('by-kind: a link to an id that is not a node is passed over', () => {
  const c = fx.cases.find((x) => x.name === 'two-elements-linked');
  const g = clone(c.graph);
  g.edges.push({ source: g.nodes[0].id, target: 'not-a-node', field: 'friends', index: 0 });
  assert.deepEqual(layoutByKind(g).points.map((p) => [p.x, p.y]), c.want);
});

test('by-kind runs on worldGraph\'s answer as it comes', () => {
  const elements = [
    { id: '01a1d4ef-0000-7000-8000-000000000002', type: 'location', name: 'Harbour' },
    { id: '01a1d4ef-0000-7000-8000-000000000001', type: 'character', name: 'Mara', birthplace: '01a1d4ef-0000-7000-8000-000000000002' },
    { id: '01a1d4ef-0000-7000-8000-000000000003', type: 'creature', name: 'Gull', location: '01a1d4ef-0000-7000-8000-000000000002' },
  ];
  const graph = worldGraph({ elements }, { rung: 'owner' });
  const got = layoutByKind(graph);
  assert.deepEqual(got.points.map((p) => p.id), graph.nodes.map((x) => x.id));
  assert.ok(got.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const around = layoutAround(graph, '01a1d4ef-0000-7000-8000-000000000002');
  assert.deepEqual(around.points.map((p) => p.depth), [1, 0, 1]);
});

test('a graph it cannot read is refused by name', () => {
  const bad = (graph, re) => {
    assert.throws(() => layoutByKind(graph), (e) => e instanceof TypeError && re.test(e.message) && e.message.startsWith('layoutByKind: '));
    assert.throws(() => layoutAround(graph, 'a'), (e) => e instanceof TypeError && re.test(e.message) && e.message.startsWith('layoutAround: '));
  };
  bad(undefined, /the graph is \{ nodes, edges \}/);
  bad({ nodes: [] }, /the graph is \{ nodes, edges \}/);
  bad({ nodes: [null], edges: [] }, /node 0 is not an object/);
  bad({ nodes: [{ type: 'character' }], edges: [] }, /node 0 has no id/);
  bad({ nodes: [{ id: 'a', type: 'starship' }], edges: [] }, /'starship' is not one of the 22 element types/);
  bad({ nodes: [{ id: 'a', type: 'toString' }], edges: [] }, /'toString' is not one of the 22 element types/);
  bad({ nodes: [{ id: 'a', type: 'character', name: 7 }], edges: [] }, /name is a string or null/);
  bad({ nodes: [{ id: 'a', type: 'character' }, { id: 'a', type: 'location' }], edges: [] }, /the id a is a node twice/);
  bad({ nodes: [{ id: 'a', type: 'character' }], edges: [{ source: 'a' }] }, /edge 0 is not \{ source, target \}/);
  bad({ nodes: [{ id: 'a', type: 'character' }], edges: [{ source: 'a', target: 'a', field: 3 }] }, /edge 0: field is a string/);
  bad({ nodes: [{ id: 'a', type: 'character' }], edges: [{ source: 'a', target: 'a', index: NaN }] }, /edge 0: index is a number/);
});

test('around: an unknown option is refused by name before anything else, and steps is 1 or 2', () => {
  assert.throws(() => layoutAround(undefined, 'nowhere', { step: 2 }), /^TypeError: layoutAround: unknown option 'step'\. The keys are steps\.$/);
  const g = { nodes: [{ id: 'a', type: 'character' }], edges: [] };
  for (const steps of [0, 3, '2', 1.5]) assert.throws(() => layoutAround(g, 'a', { steps }), /layoutAround: steps is 1 or 2/);
  assert.throws(() => layoutAround(g, 'a', 2), /layoutAround: options is an object/);
  assert.equal(layoutAround(g, 'a', {}).points.length, 1);
  assert.equal(layoutAround(g, 'a', null).points.length, 1);
});

test('around: a focus that is not a node is a TypeError', () => {
  assert.throws(() => layoutAround({ nodes: [], edges: [] }, 'a'), (e) => e instanceof TypeError && /the focus a is not a node of the graph/.test(e.message));
  assert.throws(() => layoutAround({ nodes: [{ id: 'a', type: 'character' }], edges: [] }, 'b'), TypeError);
  assert.throws(() => layoutAround({ nodes: [{ id: 'a', type: 'character' }], edges: [] }, undefined), TypeError);
});

test('around: one step answers the focus and its neighbours only, two add theirs', () => {
  const one = fx.around.find((x) => x.name === 'one-step-of-the-same');
  const two = fx.around.find((x) => x.name === 'two-steps');
  const d1 = layoutAround(clone(one.graph), one.focus).points;
  const d2 = layoutAround(clone(two.graph), two.focus, { steps: 2 }).points;
  assert.ok(d1.every((p) => p.depth <= 1) && d1.filter((p) => p.depth === 0).length === 1);
  assert.ok(d2.some((p) => p.depth === 2));
  // the first ring is the same either way
  const ring = (ps) => ps.filter((p) => p.depth < 2).map((p) => JSON.stringify(p));
  assert.deepEqual(ring(d2), ring(d1));
});

test('around: names order by code point, never by locale', () => {
  const c = fx.around.find((x) => x.name === 'names-by-code-point-not-locale');
  const { points } = layoutAround(clone(c.graph), c.focus);
  const byId = new Map(c.graph.nodes.map((x) => [x.id, x.name]));
  // the first ring runs clockwise from the top: order the ring by angle and read the names
  const ring = points.filter((p) => p.depth === 1)
    .map((p) => ({ name: byId.get(p.id), a: (Math.atan2(p.y, p.x) + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI) }))
    .sort((p, q) => p.a - q.a).map((p) => p.name);
  assert.deepEqual(ring, ['Bea', 'Zed', 'adam', 'bea', 'Émile', 'Øyvind', '\u{1D400}lpha']);
});
