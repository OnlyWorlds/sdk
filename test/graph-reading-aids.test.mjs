/**
 * The graph's fifth flag, `readingAids` (schema-dist serial 104, staged before the serial: these cases are written
 * from the profile owner's sentence and give way to the fixture's own cases at the repin). The reading aids (the
 * charter, its guide, its domains, by the pair and the mark `x_charter_of`) are out of an unlensed graph by
 * default, counted `reading_aid`; the flag brings back exactly those, each marked `reading_aid`, for any signed
 * reader; a public reader is refused by name, last in the refusal order; a flag never widens a lens. Runs against
 * the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldGraph } from '../dist/index.js';

const W = '00000000-0000-4000-8000-000000000000';
const world = {
  elements: [
    { id: 'c1', type: 'title', name: 'Keeper', laws: ['l1', 'l2'] },
    { id: 'l1', type: 'law', name: 'The Charter', supertype: 'Charter', x_charter_of: W },
    { id: 'l2', type: 'law', name: 'An old charter', supertype: 'Charter' },
  ],
};

test('without the flag a charter is out, counted reading_aid; the pair without the mark is a node', () => {
  const g = worldGraph(world, { rung: 'owner' });
  assert.deepEqual(g.nodes.map(n => n.id), ['c1', 'l2']);
  assert.deepEqual(g.cut, { reading_aid: 1 });
  assert.deepEqual(g.edgesCut, { reading_aid: 1 });
});

test('readingAids brings the charter back, marked reading_aid, and its edge is an edge counted nowhere', () => {
  for (const reader of [{ rung: 'owner' }, { rung: 'contributor' }, { rung: 'guest', character: 'g1', whole: ['c1', 'l1', 'l2'] }]) {
    const g = worldGraph(world, reader, { readingAids: true });
    const ids = g.nodes.map(n => n.id);
    assert.ok(ids.includes('l1'), `${reader.rung}: the charter is a node`);
    assert.deepEqual(g.nodes.find(n => n.id === 'l1').marks, ['reading_aid'], reader.rung);
    assert.equal(g.nodes.find(n => n.id === 'l2').marks, undefined, `${reader.rung}: the unmarked pair carries no mark`);
    assert.equal(g.cut.reading_aid, undefined, reader.rung);
    assert.equal(g.edgesCut.reading_aid, undefined, reader.rung);
    if (ids.includes('c1')) assert.ok(g.edges.some(e => e.source === 'c1' && e.target === 'l1'), `${reader.rung}: the edge`);
  }
});

test('readingAids false or null reads as no flag', () => {
  for (const v of [false, null]) assert.deepEqual(worldGraph(world, { rung: 'owner' }, { readingAids: v }), worldGraph(world, { rung: 'owner' }));
});

test('a public reader asking readingAids is refused by name before anything is read, and last in the order', () => {
  const elements = [];
  Object.defineProperty(elements, 0, { get() { throw new Error('read'); }, enumerable: true });
  elements.length = 1;
  const trap = { elements };
  assert.throws(() => worldGraph(trap, { rung: 'public' }, { readingAids: true }), /public reader takes no flag; it asked readingAids/);
  assert.throws(() => worldGraph(trap, { rung: 'owner', as: { rung: 'public' } }, { readingAids: true }), /it asked readingAids/);
  assert.throws(() => worldGraph(trap, { rung: 'public' }, { mapSpace: true, readingAids: true }), /it asked mapSpace/);
  assert.throws(() => worldGraph(trap, { rung: 'public' }, { hidden: true, readingAids: true }), /hidden is the owner's alone/);
  assert.throws(() => worldGraph({ elements: [] }, { rung: 'owner' }, { readingAids: 'yes' }), /readingAids is a boolean/);
  assert.doesNotThrow(() => worldGraph({ elements: [] }, { rung: 'public' }, { readingAids: false }));
});

test('a lens that names the pair keeps the charter marked reading_aid, flag or none', () => {
  const lens = { id: 'n1', type: 'construct', supertype: 'Lens', name: 'Laws', x_lens: { types: ['title', 'law/charter', 'law'] } };
  const w = { elements: [...world.elements, lens] };
  for (const readingAids of [false, true]) {
    const g = worldGraph(w, { rung: 'owner' }, { lens: 'n1', readingAids });
    assert.deepEqual(g.nodes.map(n => [n.id, n.marks]), [['c1', undefined], ['l1', ['reading_aid']], ['l2', undefined]], String(readingAids));
  }
});

test('a flag never widens a lens: a lens that cuts the charter keeps it cut with readingAids', () => {
  const lens = { id: 'n1', type: 'construct', supertype: 'Lens', name: 'Titles', x_lens: { types: ['title'] } };
  const w = { elements: [...world.elements, lens] };
  const plain = worldGraph(w, { rung: 'owner' }, { lens: 'n1' });
  const flagged = worldGraph(w, { rung: 'owner' }, { lens: 'n1', readingAids: true });
  assert.deepEqual(flagged, plain);
  assert.ok(!flagged.nodes.some(n => n.id === 'l1'));
});
