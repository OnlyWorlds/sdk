/**
 * The lens profile's graph section: worldGraph on the graph kind of codegen/schema-dist/profiles/lens.fixture.json
 * (schema-dist serial 81, vendored with the pin; the MANIFEST holds its sha256, the Python package runs the same
 * cases), the section's invariants checked on every answer, and the fixture's graph tables read back. Runs against the compiled public
 * bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIELD_SCHEMA, degreeOf, resolveLens, worldGraph } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.fixture.json', import.meta.url));
const KEY = { as_of: 'asOf', map_space: 'mapSpace' };

const loadFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const loadCases = () => loadFixture().cases.filter(c => c.kind === 'graph');

/** A case's options as worldGraph takes them (the file writes the Python package's names). */
const optionsOf = c => Object.fromEntries(Object.entries(c.options ?? {}).map(([k, v]) => [KEY[k] ?? k, v]));

/** The section's invariants on one answer. */
function invariants(g, c) {
  const ids = g.nodes.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, `${c.name}: one node per id`);
  const nodes = new Set(ids);
  const keys = g.edges.map(e => JSON.stringify([e.source, e.field, e.target, e.index]));
  assert.equal(new Set(keys).size, keys.length, `${c.name}: one edge per (source, field, target, index)`);
  for (const e of g.edges) {
    assert.ok(nodes.has(e.source) && nodes.has(e.target), `${c.name}: an edge between nodes only`);
  }
  for (const n of g.nodes.filter(n => n.known_of)) {
    assert.ok(!g.edges.some(e => e.source === n.id), `${c.name}: a known-of node has no edge out`);
  }
  const seen = c.reader.rung === 'owner' && c.reader.as ? c.reader.as.rung : c.reader.rung;
  if (seen === 'public') {
    assert.ok(!g.nodes.some(n => n.marks), `${c.name}: a public graph holds no room, hidden or proposed node`);
    for (const k of ['room', 'hidden', 'proposed']) {
      assert.ok(!(k in g.cut) && !(k in g.edgesCut), `${c.name}: a public graph has no count of ${k}`);
    }
  }
  if (c.reader.rung !== 'owner') {
    for (const k of ['hidden', 'proposed', 'not_visible', 'anchor_not_visible']) {
      assert.ok(!(k in g.cut) && !(k in g.edgesCut), `${c.name}: a reader that is not the owner has no count of ${k}`);
    }
  }
  const opts = optionsOf(c);
  assert.equal(JSON.stringify(worldGraph(c.world, c.reader, opts)), JSON.stringify(g), `${c.name}: the same input gives the same bytes`);
  if (opts.lens != null) {
    const r = resolveLens(c.world, opts.lens, c.reader, { asOf: opts.asOf, clock: opts.clock });
    assert.deepEqual([...ids].sort(), [...r.kept].sort(), `${c.name}: a lens's graph has exactly the lens's kept as its nodes`);
    assert.deepEqual(g.cut, r.cut, `${c.name}: the lens's cut rides along unchanged`);
    assert.equal(g.unreadable, r.unreadable, `${c.name}: unreadable is the lens reading's`);
    // Every link from a kept node to an element in the world is an edge or counted, read as the owner (the
    // same view, the owner's counts); less the links the view leaves out, so is every link of the reader's own.
    const ownerView = c.reader.rung === 'owner' ? c.reader : { rung: 'owner', as: c.reader };
    const go = worldGraph(c.world, ownerView, { lens: opts.lens, asOf: opts.asOf, clock: opts.clock });
    const inWorld = new Set(c.world.elements.map(el => el.id));
    const linked = v => (typeof v === 'string' && inWorld.has(v) ? 1 : 0);
    let links = 0;
    for (const n of go.nodes) {
      if (n.known_of) continue;
      const el = c.world.elements.find(x => x.id === n.id);
      for (const [field, f] of Object.entries(FIELD_SCHEMA[n.type])) {
        if (f.type === 'single_link') links += linked(el[field]);
        if (f.type === 'multi_link' && Array.isArray(el[field])) for (const t of el[field]) links += linked(t);
      }
      for (const field of ['x_lens_leads_to', 'x_spine_depends_on']) if (Array.isArray(el[field])) for (const t of el[field]) links += linked(t);
    }
    const unseen = ['not_visible', 'anchor_not_visible'];
    const sum = (counts, keep) => Object.entries(counts).filter(([k]) => keep(k)).reduce((a, [, v]) => a + v, 0);
    assert.equal(go.edges.length + sum(go.edgesCut, () => true), links, `${c.name}: every link from a kept node is an edge or counted`);
    const inView = links - sum(go.edgesCut, k => unseen.includes(k));
    assert.equal(g.edges.length + sum(g.edgesCut, k => !unseen.includes(k)), inView, `${c.name}: every link from a kept node to an element the reader sees is an edge or counted`);
  } else {
    assert.equal(g.unreadable, null, `${c.name}: unreadable is null without a lens`);
  }
}

test('the fixture\'s graph cases, each answer held to the invariants', () => {
  const cases = loadCases();
  const wrong = [];
  for (const c of cases) {
    const opts = optionsOf(c);
    if (c.want.refused !== undefined) {
      const name = KEY[c.want.refused] ?? c.want.refused;
      try {
        worldGraph(c.world, c.reader, opts);
        wrong.push(`${c.name}: not refused`);
      } catch (err) {
        if (!(err instanceof TypeError) || !err.message.includes(name)) wrong.push(`${c.name}: refused as ${err}, want one naming ${name}`);
      }
      continue;
    }
    let got;
    try {
      const g = worldGraph(c.world, c.reader, opts);
      invariants(g, c);
      got = { nodes: g.nodes, edges: g.edges, edges_cut: g.edgesCut, cut: g.cut, unreadable: g.unreadable };
    } catch (err) {
      got = { threw: String(err) };
    }
    try { assert.deepEqual(got, c.want); } catch { wrong.push(`${c.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(c.want)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.equal(cases.length, 34, `the fixture holds ${cases.length} graph cases, serial 81 has 34`);
});

test('the fixture\'s graph tables, read back through the reader: flags, owner-only flags, edge reasons, declared links', () => {
  const doc = loadFixture();
  assert.deepEqual(doc.graph_flags, ['rooms', 'hidden', 'proposed', 'map_space']);
  const empty = { elements: [] };
  for (const f of doc.graph_flags) {
    const opt = { [KEY[f] ?? f]: true };
    assert.doesNotThrow(() => worldGraph(empty, { rung: 'owner' }, opt), f);
    const asked = () => worldGraph(empty, { rung: 'contributor' }, opt);
    if (doc.owner_only_flags.includes(f)) assert.throws(asked, /owner's alone/, f);
    else assert.doesNotThrow(asked, f);
    assert.throws(() => worldGraph(empty, { rung: 'public' }, opt), TypeError, f);
  }
  const reasons = new Set(doc.edges_cut_reasons);
  for (const c of loadCases()) for (const k of Object.keys(c.want.edges_cut ?? {})) assert.ok(reasons.has(k), `${c.name}: ${k}`);
  for (const f of doc.graph_links) {
    const g = worldGraph({ elements: [{ id: 'a', type: 'construct', name: 'A', [f]: ['b'] }, { id: 'b', type: 'construct', name: 'B' }] }, { rung: 'owner' });
    assert.deepEqual(g.edges, [{ source: 'a', field: f, target: 'b', index: 0 }], f);
  }
  const other = worldGraph({ elements: [{ id: 'a', type: 'construct', name: 'A', x_other_links: ['b'] }, { id: 'b', type: 'construct', name: 'B' }] }, { rung: 'owner' });
  assert.deepEqual(other.edges, []);
});

test('a refused flag is refused before anything is read', () => {
  const elements = [];
  Object.defineProperty(elements, 0, { get() { throw new Error('read'); }, enumerable: true });
  elements.length = 1;
  const world = { elements };
  assert.throws(() => worldGraph(world, { rung: 'contributor' }, { hidden: true }), /hidden is the owner's alone/);
  assert.throws(() => worldGraph(world, { rung: 'guest', whole: [] }, { proposed: true }), /proposed is the owner's alone/);
  assert.throws(() => worldGraph(world, { rung: 'public' }, { rooms: true }), /public reader takes no flag; it asked rooms/);
  assert.throws(() => worldGraph(world, { rung: 'public' }, { mapSpace: true }), /it asked mapSpace/);
  assert.throws(() => worldGraph(world, { rung: 'owner', as: { rung: 'public' } }, { rooms: true }), /it asked rooms/);
  // The same world read without a refused flag does read the elements.
  assert.throws(() => worldGraph(world, { rung: 'owner' }, { hidden: true }), /read/);
});

test('worldGraph refuses what is not a reading: an unknown option, a flag that is not a boolean, a bad reader, world or lens', () => {
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, { room: true }), /unknown option 'room'/);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, { rooms: 'yes' }), /rooms is a boolean/);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'admin' }), TypeError);
  assert.throws(() => worldGraph({}, { rung: 'owner' }), TypeError);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, { lens: 3 }), TypeError);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, { asOf: 1.5 }), TypeError);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, true), TypeError);
  assert.deepEqual(worldGraph({ elements: [] }, { rung: 'public' }, { rooms: false, mapSpace: null }), { nodes: [], edges: [], edgesCut: {}, cut: {}, unreadable: null });
});

test('degreeOf: the edges of each node, in or out, a mirror pair two, a link to itself once, every node a key', () => {
  const world = {
    elements: [
      { id: 'c1', type: 'character', name: 'Ada', friends: ['c2', 'c1'] },
      { id: 'c2', type: 'character', name: 'Bo', friends: ['c1'] },
      { id: 'r1', type: 'relation', name: 'Pact', characters: ['c1', 'c2', 'c3'] },
      { id: 'c3', type: 'character', name: 'Cy' },
      { id: 'o1', type: 'object', name: 'Lamp' },
      { id: 'constructor', type: 'object', name: 'An id like an inherited key' },
      { id: '__proto__', type: 'character', name: 'Another', objects: ['constructor'] },
    ],
  };
  const g = worldGraph(world, { rung: 'owner' });
  const d = degreeOf(g);
  assert.deepEqual(Object.keys(d), g.nodes.map((n) => n.id));
  assert.equal(d.c1, 4); // c1->c2, c2->c1, c1->c1 once, r1->c1
  assert.equal(d.c2, 3);
  assert.equal(d.r1, 3);
  assert.equal(d.c3, 1);
  assert.equal(d.o1, 0);
  assert.equal(Object.getOwnPropertyDescriptor(d, 'constructor').value, 1);
  assert.equal(Object.getOwnPropertyDescriptor(d, '__proto__').value, 1);
  assert.throws(() => degreeOf({ nodes: [] }), TypeError);
  assert.throws(() => degreeOf(null), TypeError);
});

test('degreeOf on every fixture graph case equals a direct count of its edges', () => {
  for (const c of loadCases()) {
    if (!c.want.nodes) continue;
    const d = degreeOf({ nodes: c.want.nodes, edges: c.want.edges });
    for (const n of c.want.nodes) {
      const direct = c.want.edges.filter((e) => e.source === n.id || e.target === n.id).length;
      assert.equal(d[n.id], direct, `${c.name}: ${n.id}`);
    }
  }
});
