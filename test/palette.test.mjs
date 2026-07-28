/**
 * Palette invariants — gates the hand-authored ELEMENT_FAMILIES map against
 * the generated type registry until the YAML `family:` key makes it generated.
 * Runs against the compiled public bundle (dist), same as v2-client tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELEMENT_TYPES, ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER,
  familyOf, elementColor,
} from '../dist/index.js';

// ★ Hexes of record, read from the PINNED DISTRIBUTION rather than restated here.
//
// Until 2026-07-28 this block was a hand-copied literal, so the test proved the
// palette equalled itself — two copies in one repo agreeing, which is not
// evidence about anything. `presentation.json` now publishes the colour values
// (schema-dist serial 6), so the assertion below compares the shipped palette
// against the distribution, the same way `codegen:check` compares the generated
// types against the schema. The vendored tree is itself hash-verified by
// `npm run schema:verify` against the manifest AND against the hash recorded at
// pin time, so this chain terminates in something that cannot quietly drift.
//
// Two shape notes that would make a naive compare fail for the wrong reason:
// the values are {light, dark} PAIRS, and `colors.order` is meaningful — the
// family order is the CVD-safety mechanism of the source palette, not sugar.
const PRESENTATION = JSON.parse(
  readFileSync(new URL('../codegen/schema-dist/presentation.json', import.meta.url), 'utf8'),
);
const RULED = PRESENTATION.colors.families;
const RULED_ORDER = PRESENTATION.colors.order;

test('★ the distribution is WELL-FORMED before anything is compared against it', () => {
  // A checker that silently reads an empty object passes vacuously against
  // nothing. Skeld's own control for this same palette did exactly that an hour
  // before this test was written: a regex parsed one source to `{}`, and `{}`
  // compares unequal to everything, so it reported drift that did not exist. It
  // printed the counts it had parsed, which is the only reason that was an
  // anecdote instead of an incident. Assert the shape before trusting the values.
  assert.equal(typeof PRESENTATION.colors, 'object');
  assert.equal(Object.keys(RULED).length, 4, 'presentation.json must carry exactly 4 families');
  assert.equal(RULED_ORDER.length, 4);
  for (const [fam, pair] of Object.entries(RULED)) {
    assert.match(pair.light, /^#[0-9a-f]{6}$/, `${fam}.light is not a hex`);
    assert.match(pair.dark, /^#[0-9a-f]{6}$/, `${fam}.dark is not a hex`);
  }
});

test('★ FAMILY_COLORS equals the pinned distribution, not a restatement of itself', () => {
  assert.deepEqual(FAMILY_COLORS, RULED);
});

test('★ FAMILY_ORDER equals the distribution order — the order IS the CVD mechanism', () => {
  assert.deepEqual([...FAMILY_ORDER], RULED_ORDER);
});

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
