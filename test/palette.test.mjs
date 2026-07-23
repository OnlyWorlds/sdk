/**
 * Palette invariants — gates the hand-authored ELEMENT_FAMILIES map against
 * the generated type registry until the YAML `family:` key makes it generated.
 * Runs against the compiled public bundle (dist), same as v2-client tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEMENT_TYPES, ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER,
  familyOf, elementColor,
} from '../dist/index.js';

// Hexes of record — Orrery product/schema/element-palette-measurements.md
// (Skeld, 2026-07-22; ruled by Captain). Any change here must re-run the CVD
// validator first.
const RULED = {
  agents: { light: '#2a78d6', dark: '#3987e5' },
  world: { light: '#008300', dark: '#008300' },
  abstract: { light: '#e87ba4', dark: '#d55181' },
  temporal: { light: '#eda100', dark: '#c98500' },
};

test('every generated element type has a family, and no stray keys exist', () => {
  const mapped = Object.keys(ELEMENT_FAMILIES).sort();
  const generated = [...ELEMENT_TYPES].sort();
  assert.deepEqual(mapped, generated);
  assert.equal(generated.length, 22);
});

test('family values are only the four ruled families', () => {
  const allowed = new Set(FAMILY_ORDER);
  for (const [type, fam] of Object.entries(ELEMENT_FAMILIES)) {
    assert.ok(allowed.has(fam), `${type} → ${fam} is not a ruled family`);
  }
  assert.deepEqual([...FAMILY_ORDER], ['agents', 'world', 'abstract', 'temporal']);
});

test('hexes match the measurements of record, both modes', () => {
  assert.deepEqual(FAMILY_COLORS, RULED);
});

test('family membership matches the ruling exactly', () => {
  const expect = {
    agents: ['character', 'creature', 'species', 'family', 'collective', 'institution'],
    world: ['location', 'object', 'construct', 'map', 'pin', 'marker', 'zone'],
    abstract: ['ability', 'trait', 'title', 'language', 'law'],
    temporal: ['event', 'narrative', 'phenomenon', 'relation'],
  };
  for (const [fam, types] of Object.entries(expect)) {
    for (const t of types) assert.equal(familyOf(t), fam, `${t} should be ${fam}`);
  }
});

test('elementColor resolves per mode and defaults to dark', () => {
  assert.equal(elementColor('character', 'light'), '#2a78d6');
  assert.equal(elementColor('character', 'dark'), '#3987e5');
  assert.equal(elementColor('character'), '#3987e5'); // dark default — both live consumers are dark-surface
  assert.equal(elementColor('location', 'light'), elementColor('location', 'dark')); // world green identical by ruling
});
