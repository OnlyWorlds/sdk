/**
 * mostLinkedOf: the most linked elements of each type, a draft reading beside the landing profile. Every case of
 * test/fixtures/most-linked.fixture.json, the same file byte for byte as the Python package's
 * tests/fixtures/most-linked.fixture.json (both suites hold its sha256), answers written by hand. Runs against the
 * compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mostLinkedOf, worldGraph } from '../dist/index.js';

const FILE = fileURLToPath(new URL('./fixtures/most-linked.fixture.json', import.meta.url));
const SHA256 = '9a7b27d849cd1c268d86b754bcdb7954cb23b3ede85178023332d61e497489c4';
const raw = readFileSync(FILE);
const doc = JSON.parse(raw.toString('utf8'));

// The fixture writes options as the Python keyword; the SDK's is camelCase.
const JS_NAME = { per_type: 'perType' };
const jsOptions = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [JS_NAME[k] ?? k, v]));

test('the fixture is the shared file, byte for byte', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), SHA256);
  assert.equal(doc.profile, 'most-linked');
  assert.equal(doc.cases.length, 18, `the fixture holds ${doc.cases.length} cases`);
});

for (const c of doc.cases) {
  test(`most-linked fixture: ${c.name}`, () => {
    if (c.want.refused !== undefined) {
      const name = JS_NAME[c.want.refused] ?? c.want.refused;
      assert.throws(() => mostLinkedOf(c.graph, jsOptions(c.options)),
        (e) => e.message.includes(`'${name}'`) || e.message.startsWith(`mostLinkedOf: ${name} is`));
      return;
    }
    // Byte for byte, key order included.
    assert.equal(JSON.stringify(mostLinkedOf(c.graph, jsOptions(c.options))), JSON.stringify(c.want));
  });
}

test('no options and null options are the default', () => {
  const g = doc.cases[0].graph;
  const want = JSON.stringify(doc.cases[0].want);
  assert.equal(JSON.stringify(mostLinkedOf(g)), want);
  assert.equal(JSON.stringify(mostLinkedOf(g, null)), want);
});

test('a graph that is not one, and options that are not an object, are refused', () => {
  assert.throws(() => mostLinkedOf(null), TypeError);
  assert.throws(() => mostLinkedOf({ nodes: [] }), TypeError);
  assert.throws(() => mostLinkedOf({ nodes: [], edges: [] }, 3), TypeError);
});

test('it reads the graph it is given and changes nothing in it', () => {
  const g = doc.cases[6].graph;
  const before = JSON.stringify(g);
  mostLinkedOf(g);
  assert.equal(JSON.stringify(g), before);
});

test('through worldGraph: a hidden element and map space are not counted for a reader who is not shown them', () => {
  const elements = [
    { id: 'c1', type: 'character', name: 'Ada', friends: ['c2'] },
    { id: 'c2', type: 'character', name: 'Brin' },
    { id: 'sec', type: 'event', name: 'The Secret', characters: ['c1', 'c2'], hidden: true },
    { id: 'm1', type: 'map', name: 'Chart' },
    { id: 'p1', type: 'pin', name: 'Pin', map: 'm1', element_type: 'character', element_id: 'c1' },
  ];
  const got = mostLinkedOf(worldGraph({ elements }, { rung: 'owner' }));
  assert.deepEqual(got, {
    per_type: 3,
    by_type: { character: [{ id: 'c1', name: 'Ada', degree: 1 }, { id: 'c2', name: 'Brin', degree: 1 }] },
  });
  // The control: a graph that brings the hidden element in counts it, so the case above can see it.
  const shown = mostLinkedOf(worldGraph({ elements }, { rung: 'owner' }, { hidden: true }));
  assert.deepEqual(shown.by_type.event, [{ id: 'sec', name: 'The Secret', degree: 2 }]);
  assert.equal(shown.by_type.character[0].degree, 2);
});
