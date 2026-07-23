/**
 * Ported-tables invariants — gates src/v2/constants.ts (the v1 metadata tables
 * re-keyed on the v2 slug union) against the generated ELEMENT_TYPES registry,
 * plus the number→integer normalization. Runs against the compiled public
 * bundle (dist), same as the sibling v2 tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEMENT_TYPES, ELEMENT_ICONS, ELEMENT_SECTIONS, ELEMENT_LABELS,
  FIELD_SCHEMA, getElementIcon,
} from '../dist/index.js';

const SORTED_TYPES = [...ELEMENT_TYPES].sort();
const keysSorted = (obj) => Object.keys(obj).sort();

// (a) every table is keyed exactly on the element-type registry
test('ELEMENT_ICONS keys equal ELEMENT_TYPES', () => {
  assert.deepEqual(keysSorted(ELEMENT_ICONS), SORTED_TYPES);
});
test('ELEMENT_SECTIONS keys equal ELEMENT_TYPES', () => {
  assert.deepEqual(keysSorted(ELEMENT_SECTIONS), SORTED_TYPES);
});
test('ELEMENT_LABELS keys equal ELEMENT_TYPES', () => {
  assert.deepEqual(keysSorted(ELEMENT_LABELS), SORTED_TYPES);
});
test('FIELD_SCHEMA keys equal ELEMENT_TYPES', () => {
  assert.deepEqual(keysSorted(FIELD_SCHEMA), SORTED_TYPES);
});

// The FieldType union, mirrored from constants.ts (dropped 'number' in 4.0).
const FIELD_TYPES = new Set([
  'text', 'integer', 'integer_max', 'single_link', 'multi_link',
]);

// (b) the number→integer normalization is complete: no entry still carries 'number'
test('no FIELD_SCHEMA field has type "number"', () => {
  for (const [et, fields] of Object.entries(FIELD_SCHEMA)) {
    for (const [field, info] of Object.entries(fields)) {
      assert.notEqual(info.type, 'number', `${et}.${field} still typed 'number'`);
    }
  }
});

// (c) every field type is a member of the FieldType union
test('every FIELD_SCHEMA field type is in the FieldType union', () => {
  for (const [et, fields] of Object.entries(FIELD_SCHEMA)) {
    for (const [field, info] of Object.entries(fields)) {
      assert.ok(FIELD_TYPES.has(info.type), `${et}.${field} has unknown type '${info.type}'`);
    }
  }
});

// (d) getElementIcon agrees with the table for the singular form
test('getElementIcon("character") matches ELEMENT_ICONS.character', () => {
  assert.equal(getElementIcon('character'), ELEMENT_ICONS.character);
});
test('getElementIcon tolerates plural + casing', () => {
  assert.equal(getElementIcon('characters'), ELEMENT_ICONS.character);
  assert.equal(getElementIcon('Character'), ELEMENT_ICONS.character);
  assert.equal(getElementIcon('phenomena'), ELEMENT_ICONS.phenomenon);
  assert.equal(getElementIcon('nonsense'), 'help_outline');
});

// (e) spot-check ported values against v1 ground truth (read from src/types.ts by hand):
//   - character icon 'person'
//   - character 'Constitution' section (order 1) leads with 'physicality'
//   - ability.duration was type:'number' in v1 → must now be 'integer'
//   - ability.name required:true, type 'text' (byte-identical, untouched)
test('spot-check: known v1 table values survive the port', () => {
  assert.equal(ELEMENT_ICONS.character, 'person');
  assert.equal(ELEMENT_LABELS.character, 'Characters');
  assert.equal(ELEMENT_LABELS.phenomenon, 'Phenomena');

  const constitution = ELEMENT_SECTIONS.character.find((s) => s.name === 'Constitution');
  assert.ok(constitution, 'character has a Constitution section');
  assert.equal(constitution.order, 1);
  assert.equal(constitution.fields[0], 'physicality');

  // the normalized entry: v1 had type 'number', 4.0 emits 'integer'
  assert.equal(FIELD_SCHEMA.ability.duration.type, 'integer');
  // an untouched entry stays byte-identical
  assert.deepEqual(FIELD_SCHEMA.ability.name, { type: 'text', required: true });
  assert.deepEqual(FIELD_SCHEMA.ability.effects, { type: 'multi_link', target: 'phenomenon' });
});
