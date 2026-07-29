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

// (e) spot-check ported values against v1 ground truth. The v1 source these were
// read from (src/types.ts) was deleted in 4.0; the values stay as a regression pin.
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

// (f) FIELD_SCHEMA became GENERATED on 2026-07-29 (codegen:check gates it against
// the pinned schema). These pin the two drifts that generating it corrected — the
// only two entries that changed, out of 467. They are regression anchors, not the
// guard: the guard is codegen:check, which compares the whole table to the schema.
test('collective.equipment targets object, not the decommissioned v1 construct', () => {
  // The founding case of the ruling table (rulings.yaml: collective-equipment-target,
  // ruled 2026-07-23). The generated path was corrected that week; this
  // hand-maintained copy in the same package shipped 'construct' for six more days.
  assert.deepEqual(FIELD_SCHEMA.collective.equipment,
    { type: 'multi_link', target: 'object' });
});

test('relation has no phantom self-link field', () => {
  // relation.relations was exported for consumers to build forms from and does not
  // exist in relation.yaml. The v2 API 422s on unknown unprefixed keys.
  assert.equal(FIELD_SCHEMA.relation.relations, undefined);
  // its real link set is intact
  assert.deepEqual(FIELD_SCHEMA.relation.events, { type: 'multi_link', target: 'event' });
});

// (g) the generic-link split is a DECLARED deviation from a naive schema read:
// pin.element is one `generic-link` in the YAML and two fields on the wire.
test('pin.element is split into the wire pair', () => {
  assert.equal(FIELD_SCHEMA.pin.element, undefined);
  assert.deepEqual(FIELD_SCHEMA.pin.element_type, { type: 'text', required: true });
  assert.deepEqual(FIELD_SCHEMA.pin.element_id,
    { type: 'single_link', target: 'any', required: true });
});
