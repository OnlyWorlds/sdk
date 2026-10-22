/**
 * The names profile (schema-dist profiles/names.md): typeWord on every conformance case in
 * codegen/schema-dist/profiles/names.fixture.json, vendored with the distribution (serial 48 on) and
 * hash-checked by schema:verify. The vendored copy is the only source: absent, the test fails.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typeWord } from '../dist/index.js';

const VENDORED = fileURLToPath(new URL('../codegen/schema-dist/profiles/names.fixture.json', import.meta.url));

function loadFixture() {
  assert.ok(existsSync(VENDORED), `no names fixture at ${VENDORED}: re-vendor the pinned schema-dist`);
  const doc = JSON.parse(readFileSync(VENDORED, 'utf8'));
  assert.equal(doc.profile, 'x_names');
  return doc;
}

test('typeWord: every case of the names fixture', () => {
  const { cases } = loadFixture();
  assert.ok(cases.length >= 23, `the fixture holds ${cases.length} cases`);
  for (const c of cases) {
    const got = typeWord({ x_names: c.map }, c.type, { supertype: c.supertype ?? null, many: c.many });
    assert.equal(got, c.word, `case ${c.name}`);
  }
});

test('typeWord: no world, no map, or no x_names is the standard name', () => {
  assert.equal(typeWord(null, 'character'), null);
  assert.equal(typeWord(undefined, 'character'), null);
  assert.equal(typeWord({}, 'character'), null);
  assert.equal(typeWord({ x_names: 'Employee' }, 'character'), null);
});

test('typeWord refuses an option it does not know, before reading anything', () => {
  const world = { x_names: { version: 1, types: { character: { one: 'Employee' } } } };
  assert.throws(() => typeWord(world, 'character', { plural: true }), TypeError);
  assert.equal(typeWord(world, 'character', { many: true }), 'Employee');
});
