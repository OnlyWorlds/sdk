/**
 * The names profile (schema-dist profiles/names.md): typeWord on every conformance case in
 * codegen/schema-dist/profiles/names.fixture.json, vendored with the distribution. Until the serial
 * carries it, the draft beside Skeld's profile (Orrery product/schema/names.fixture.json) is read and
 * the test says so; on the serial the vendored copy wins and the draft path goes.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typeWord } from '../dist/index.js';

const VENDORED = fileURLToPath(new URL('../codegen/schema-dist/profiles/names.fixture.json', import.meta.url));
const DRAFT = 'C:/Users/Titus/Carrier/Orrery/product/schema/names.fixture.json';

function loadFixture() {
  const path = existsSync(VENDORED) ? VENDORED : DRAFT;
  assert.ok(existsSync(path), `no names fixture at ${VENDORED} or ${DRAFT}`);
  if (path === DRAFT) console.log(`# names fixture: the DRAFT at ${DRAFT}, not yet in the vendored dist`);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(doc.profile, 'x_names');
  return doc;
}

test('typeWord: every case of the names fixture', () => {
  const { cases } = loadFixture();
  assert.ok(cases.length >= 22, `the fixture holds ${cases.length} cases`);
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
