/**
 * dragField against the vendored distribution's pairs.json, read here at test time rather than restated:
 * every pair in both orders, every pair of the 22 types the table leaves out, the same type twice, and
 * anything that is not a type slug as written. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ELEMENT_TYPES, dragField } from '../dist/index.js';

const DOC = JSON.parse(readFileSync(new URL('../codegen/schema-dist/pairs.json', import.meta.url), 'utf8'));
const PAIRS = DOC.pairs;

test('the vendored table is version 1 and holds 113 pairs, each two type slugs in code point order', () => {
  assert.equal(DOC.version, 1);
  const keys = Object.keys(PAIRS);
  assert.equal(keys.length, 113, `pairs.json holds ${keys.length} pairs, serial 96 has 113`);
  for (const key of keys) {
    const [a, b, ...rest] = key.split('+');
    assert.deepEqual(rest, [], key);
    assert.ok(ELEMENT_TYPES.includes(a) && ELEMENT_TYPES.includes(b) && a < b, key);
  }
});

test('dragField gives every pair of the table, in both orders, as a fresh object', () => {
  for (const [key, row] of Object.entries(PAIRS)) {
    const [a, b] = key.split('+');
    const want = { on: row.on, field: row.field, holds: row.holds };
    assert.deepEqual(dragField(a, b), want, `${a}, ${b}`);
    assert.deepEqual(dragField(b, a), want, `${b}, ${a}`);
  }
  const first = dragField('character', 'location');
  assert.deepEqual(first, { on: 'character', field: 'location', holds: true });
  first.field = 'changed';
  assert.equal(dragField('character', 'location').field, 'location', 'a caller changing an answer changes no later one');
});

test('dragField is null for every pair of the 22 types the table leaves out, in both orders', () => {
  let absent = 0;
  for (const a of ELEMENT_TYPES) {
    for (const b of ELEMENT_TYPES) {
      if (a >= b || Object.prototype.hasOwnProperty.call(PAIRS, `${a}+${b}`)) continue;
      absent += 1;
      assert.equal(dragField(a, b), null, `${a}, ${b}`);
      assert.equal(dragField(b, a), null, `${b}, ${a}`);
    }
  }
  assert.equal(absent, 231 - 113, 'the 22 types make 231 pairs of two kinds, 113 of them in the table');
  assert.equal(PAIRS['law+map'], undefined, 'law and map: a pair the table leaves out');
  assert.equal(dragField('law', 'map'), null);
  assert.equal(dragField('map', 'law'), null);
});

test('dragField is null for the same type twice', () => {
  for (const t of ELEMENT_TYPES) assert.equal(dragField(t, t), null, t);
});

test('dragField is null for anything that is not one of the 22 type slugs as written', () => {
  for (const bad of ['Character', 'character ', ' character', '', 'characters', 'world', 'character+location', undefined, null, 1, {}, ['character']]) {
    assert.equal(dragField(bad, 'location'), null, JSON.stringify(bad) ?? String(bad));
    assert.equal(dragField('location', bad), null, JSON.stringify(bad) ?? String(bad));
  }
  assert.equal(dragField('constructor', 'location'), null);
  assert.equal(dragField('__proto__', 'location'), null);
});
