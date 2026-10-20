/**
 * Field labels: the house rule (sentence case, acronyms kept; OW Style, 2026-10-20),
 * seeded from Atlas's humanizeFieldName as of 1.59.1. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_ACRONYMS, FIELD_SCHEMA, fieldLabel } from '../dist/index.js';

test('fieldLabel: sentence case, acronyms kept wherever they fall', () => {
  assert.equal(fieldLabel('birth_date'), 'Birth date');
  assert.equal(fieldLabel('image_url'), 'Image URL');
  assert.equal(fieldLabel('url'), 'URL');
  assert.equal(fieldLabel('id_card'), 'ID card');
  assert.equal(fieldLabel('time_range_current'), 'Time range current');
  assert.equal(fieldLabel('name'), 'Name');
  assert.equal(fieldLabel('Mixed_CASE_Name'), 'Mixed case name');
});

test('fieldLabel takes the name as given: an extension prefix is the caller\'s to drop', () => {
  assert.equal(fieldLabel('x_mood'), 'X mood');
  assert.equal(fieldLabel('mood'), 'Mood');
});

test('FIELD_ACRONYMS is frozen and lowercase', () => {
  assert.ok(Object.isFrozen(FIELD_ACRONYMS));
  for (const a of FIELD_ACRONYMS) assert.equal(a, a.toLowerCase());
});

test('every schema field has a label that starts with a capital and holds no underscore', () => {
  let n = 0;
  for (const fields of Object.values(FIELD_SCHEMA)) {
    for (const name of Object.keys(fields)) {
      const label = fieldLabel(name);
      assert.match(label, /^[A-Z]/, name);
      assert.ok(!label.includes('_'), name);
      n++;
    }
  }
  assert.ok(n > 300, `only ${n} fields walked`);
});
