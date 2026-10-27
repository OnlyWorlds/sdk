/**
 * The lens profile's date table and dateOf: the exported table read back against the table the vendored
 * profile states (codegen/schema-dist/profiles/lens.md, rule 8), the fixture's `date_table` and the schema's
 * own fields, and
 * dateOf on every dated type, the timeless ones and the values that are not a date. Runs against the compiled
 * public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATE_FIELD, FIELD_SCHEMA, dateOf } from '../dist/index.js';

const PROFILE = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.md', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.fixture.json', import.meta.url));

/** The profile's date table, parsed from its sentence: type to field, and the timeless types. */
function profileTable() {
  const text = readFileSync(PROFILE, 'utf8');
  const start = text.indexOf('The **date table**');
  assert.ok(start >= 0, 'the profile states its date table');
  const sentence = text.slice(start, text.indexOf('are timeless', start));
  const dated = {};
  for (const [, field, types] of sentence.matchAll(/`([a-z_]+)` \(([A-Za-z, ]+)\)/g)) {
    for (const t of types.split(',')) dated[t.trim().toLowerCase()] = field;
  }
  const timeless = sentence.match(/no date field \(([A-Za-z, ]+)\)/)[1].split(',').map(t => t.trim().toLowerCase());
  return { dated, timeless };
}

test('DATE_FIELD is the profile\'s table, every type either dated or timeless, each field an integer field', () => {
  const { dated, timeless } = profileTable();
  assert.equal(Object.keys(dated).length, 12);
  assert.equal(timeless.length, 10);
  assert.deepEqual({ ...DATE_FIELD }, dated);
  assert.deepEqual({ ...DATE_FIELD }, JSON.parse(readFileSync(FIXTURE, 'utf8')).date_table);
  assert.deepEqual([...Object.keys(dated), ...timeless].sort(), Object.keys(FIELD_SCHEMA).sort());
  for (const [type, field] of Object.entries(DATE_FIELD)) {
    assert.equal(FIELD_SCHEMA[type][field]?.type, 'integer', `${type}.${field}`);
  }
  assert.ok(Object.isFrozen(DATE_FIELD));
});

test('dateOf: the whole number in the type\'s date field, 0 included', () => {
  for (const [type, field] of Object.entries(DATE_FIELD)) {
    assert.equal(dateOf({ type, [field]: 1204 }), 1204, type);
    assert.equal(dateOf({ type, [field]: 0 }), 0, `${type} at 0`);
    assert.equal(dateOf({ type, [field]: -40 }), -40, `${type} before 0`);
  }
  assert.equal(dateOf({ type: ' Event ', start_date: 7 }), 7, 'the type is trimmed and folded');
  assert.equal(dateOf({ type: 'EVENT', start_date: 7 }), 7);
});

test('dateOf: null for the timeless, the untyped and what is not a date', () => {
  const { timeless } = profileTable();
  for (const type of timeless) assert.equal(dateOf({ type, start_date: 5, birth_date: 5, date: 5 }), null, type);
  assert.equal(dateOf({ type: 'event', birth_date: 5 }), null, 'another type\'s field');
  for (const v of [null, undefined, '12', 1.5, true, NaN, [3], { year: 3 }]) {
    assert.equal(dateOf({ type: 'event', start_date: v }), null, String(v));
  }
  assert.equal(dateOf({ type: 'event' }), null, 'absent');
  assert.equal(dateOf({ start_date: 5 }), null, 'no type');
  assert.equal(dateOf({ type: 'constructor', constructor: 5 }), null, 'an inherited key is no type');
  // The table's inherited __proto__ would name the field "[object Object]": no type reaches it.
  assert.equal(dateOf({ type: '__proto__', '[object Object]': 5 }), null, 'an inherited key is no type');
  assert.equal(dateOf({ type: 'event', known_of: true, name: 'A stub' }), null, 'a stub serves no date');
  for (const v of [null, undefined, 'event', 3, [{ type: 'event', start_date: 1 }]]) assert.equal(dateOf(v), null);
});
