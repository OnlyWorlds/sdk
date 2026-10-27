/**
 * The lens profile's graph section: worldGraph on the shared cases in test/fixtures/graph-edges.json (the
 * same bytes as the Python package's tests/fixtures/graph-edges.json; both suites hold its sha256), answers
 * written by hand, and the section's invariants checked on every answer. Runs against the compiled public
 * bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveLens, worldGraph } from '../dist/index.js';

const EDGES_FILE = fileURLToPath(new URL('./fixtures/graph-edges.json', import.meta.url));
const EDGES_SHA256 = 'ce8eca146b22dcabcb89d7850b3d6e3ea92f875f32689ad577d9a5da77eaa795';
const KEY = { as_of: 'asOf', map_space: 'mapSpace' };

function loadCases() {
  const bytes = readFileSync(EDGES_FILE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EDGES_SHA256);
  return JSON.parse(bytes.toString('utf8'));
}

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
  }
}

test('the shared graph cases (the Python package runs the same file), each answer held to the invariants', () => {
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
      got = { nodes: g.nodes, edges: g.edges, edges_cut: g.edgesCut, cut: g.cut };
    } catch (err) {
      got = { threw: String(err) };
    }
    try { assert.deepEqual(got, c.want); } catch { wrong.push(`${c.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(c.want)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.equal(cases.length, 26);
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
  assert.deepEqual(worldGraph({ elements: [] }, { rung: 'public' }, { rooms: false, mapSpace: null }), { nodes: [], edges: [], edgesCut: {}, cut: {} });
});
