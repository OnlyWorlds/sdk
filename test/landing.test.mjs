/**
 * The landing profile (schema-dist profiles/landing.md): every case of
 * codegen/schema-dist/profiles/landing.fixture.json, vendored with the distribution, as its own test, and the
 * profile's invariants on a real-shaped graph. Runs against the compiled public bundle (dist), same as the other
 * tests. OW_LANDING_FIXTURE points it at another copy of the fixture (a staged branch before the serial).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { landingOf } from '../dist/index.js';

const FIXTURE = process.env.OW_LANDING_FIXTURE ?? fileURLToPath(new URL('../codegen/schema-dist/profiles/landing.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no landing fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

for (const c of doc.cases) {
  test(`landing fixture: ${c.name}`, () => {
    if (c.want.refused !== undefined) {
      assert.throws(() => landingOf(c.graph, c.options), (e) => e.message.includes(`'${c.want.refused}'`) || e.message.startsWith(`landingOf: ${c.want.refused} is`));
      return;
    }
    const all = landingOf(c.graph, c.options);
    const got = c.whole ? all : Object.fromEntries(Object.keys(c.want).map((k) => [k, all[k]]));
    // Byte for byte, key order included: the profile's stable order.
    assert.equal(JSON.stringify(got), JSON.stringify(c.want));
  });
}

test('every answer holds all five keys in order, and the same input gives the same bytes', () => {
  for (const c of doc.cases) {
    if (c.want.refused !== undefined) continue;
    const a = landingOf(c.graph, c.options);
    assert.deepEqual(Object.keys(a), ['mode', 'size', 'clusters', 'unclustered', 'gaps']);
    assert.equal(JSON.stringify(landingOf(c.graph, c.options)), JSON.stringify(a));
  }
});

test('every node is in exactly one cluster or unclustered; each cluster starts with its head at 0', () => {
  for (const c of doc.cases) {
    if (c.want.refused !== undefined) continue;
    const a = landingOf(c.graph, c.options);
    const ids = [...a.clusters.flatMap((k) => k.members.map((m) => m.id)), ...a.unclustered.map((u) => u.id)];
    assert.deepEqual([...ids].sort(), c.graph.nodes.map((n) => n.id).sort(), c.name);
    for (const k of a.clusters) assert.deepEqual(k.members[0], { ...k.members[0], id: k.head, hops: 0 }, c.name);
  }
});

test('an id such as constructor is no inherited key', () => {
  const g = { nodes: [{ id: 'constructor', type: 'character' }, { id: 'toString', type: 'event' }],
    edges: [{ source: 'toString', field: 'characters', target: 'constructor', index: 0 }] };
  const a = landingOf(g, { size: 1 });
  assert.equal(a.clusters[0].head, 'constructor');
  assert.deepEqual(a.clusters[0].members.map((m) => m.id), ['constructor', 'toString']);
});

test('refused before reading: not a graph, options not an object', () => {
  assert.throws(() => landingOf(null), TypeError);
  assert.throws(() => landingOf({ nodes: [] }), TypeError);
  assert.throws(() => landingOf({ nodes: [], edges: [] }, 5), TypeError);
});
