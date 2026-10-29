/**
 * Palette invariants — the generated colour groups (ELEMENT_GROUPS, GROUP_ORDER, GROUP_COLORS) against
 * the vendored distribution's presentation.json, and the deprecated pre-4.102.0 names through their
 * one legacy table. Runs against the compiled public bundle (dist), same as v2-client tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELEMENT_TYPES, ELEMENT_GROUPS, GROUP_COLORS, GROUP_ORDER, groupOf, elementColor,
  ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf,
} from '../dist/index.js';

// ★ The truth is read from the PINNED DISTRIBUTION rather than restated here.
//
// Until 2026-07-28 the hexes were a hand-copied literal, so the test proved the
// palette equalled itself — two copies in one repo agreeing, which is not
// evidence about anything. Since 4.102.0 the groups, their order and their hexes
// are all generated from `presentation.json`, so this compares the shipped
// bundle against the distribution, the same way `codegen:check` compares the
// generated types against the schema. The vendored tree is itself hash-verified
// by `npm run schema:verify` against the manifest AND against the hash recorded
// at pin time, so this chain terminates in something that cannot quietly drift.
//
// Two shape notes that would make a naive compare fail for the wrong reason:
// the values are {light, dark} PAIRS, and `colors.order` is meaningful — the
// group order is the CVD-safety mechanism of the source palette, not sugar.
const PRESENTATION = JSON.parse(
  readFileSync(new URL('../codegen/schema-dist/presentation.json', import.meta.url), 'utf8'),
);
const RULED = PRESENTATION.colors.families;
const RULED_ORDER = PRESENTATION.colors.order;

// The pre-4.102.0 words, written out here as a second witness to src/v2/palette.ts's table.
const LEGACY = { blue: 'agents', green: 'world', pink: 'abstract', amber: 'temporal' };

test('★ the distribution is WELL-FORMED before anything is compared against it', () => {
  // A checker that silently reads an empty object passes vacuously against
  // nothing. An earlier control for this same palette did exactly that an hour
  // before this test was written: a regex parsed one source to `{}`, and `{}`
  // compares unequal to everything, so it reported drift that did not exist. It
  // printed the counts it had parsed, which is the only reason that was an
  // anecdote instead of an incident. Assert the shape before trusting the values.
  assert.equal(typeof PRESENTATION.colors, 'object');
  assert.equal(Object.keys(RULED).length, 4, 'presentation.json must carry exactly 4 colour groups');
  assert.deepEqual(RULED_ORDER, ['blue', 'green', 'pink', 'amber']);
  assert.deepEqual(Object.keys(RULED).sort(), [...RULED_ORDER].sort());
  for (const [group, pair] of Object.entries(RULED)) {
    assert.match(pair.light, /^#[0-9a-f]{6}$/, `${group}.light is not a hex`);
    assert.match(pair.dark, /^#[0-9a-f]{6}$/, `${group}.dark is not a hex`);
  }
  assert.equal(Object.keys(PRESENTATION.types).length, 22);
});

test('★ ELEMENT_GROUPS equals the pinned distribution for every type', () => {
  assert.deepEqual(Object.keys(ELEMENT_GROUPS).sort(), [...ELEMENT_TYPES].sort());
  assert.equal(ELEMENT_TYPES.length, 22);
  for (const t of ELEMENT_TYPES) {
    assert.equal(ELEMENT_GROUPS[t], PRESENTATION.types[t].family, `${t}: ELEMENT_GROUPS against presentation.json`);
    assert.equal(groupOf(t), ELEMENT_GROUPS[t]);
  }
});

test('★ GROUP_COLORS equals the pinned distribution, not a restatement of itself', () => {
  assert.deepEqual(GROUP_COLORS, RULED);
});

test('★ GROUP_ORDER equals the distribution order — the order IS the CVD mechanism', () => {
  assert.deepEqual([...GROUP_ORDER], RULED_ORDER);
});

test('serial 86 moved two types: Construct is pink, Ability is amber', () => {
  assert.equal(groupOf('construct'), 'pink');
  assert.equal(groupOf('ability'), 'amber');
  assert.equal(elementColor('construct', 'light'), '#e87ba4');
  assert.equal(elementColor('ability', 'dark'), '#c98500');
});

test('group membership matches the ruling exactly', () => {
  const expect = {
    blue: ['character', 'creature', 'species', 'family', 'collective', 'institution'],
    green: ['location', 'object', 'map', 'pin', 'marker', 'zone'],
    pink: ['construct', 'trait', 'title', 'language', 'law'],
    amber: ['ability', 'event', 'narrative', 'phenomenon', 'relation'],
  };
  assert.equal(Object.values(expect).flat().length, 22);
  for (const [group, types] of Object.entries(expect)) {
    for (const t of types) assert.equal(groupOf(t), group, `${t} should be ${group}`);
  }
});

test('the deprecated names map through the legacy table: same membership, the pre-4.102.0 words', () => {
  assert.deepEqual(Object.keys(ELEMENT_FAMILIES), Object.keys(ELEMENT_GROUPS));
  for (const t of ELEMENT_TYPES) {
    assert.equal(ELEMENT_FAMILIES[t], LEGACY[ELEMENT_GROUPS[t]], `${t}: ELEMENT_FAMILIES through the legacy table`);
    assert.equal(familyOf(t), ELEMENT_FAMILIES[t]);
  }
  assert.equal(familyOf('construct'), 'abstract');
  assert.equal(familyOf('ability'), 'temporal');
  assert.deepEqual([...FAMILY_ORDER], ['agents', 'world', 'abstract', 'temporal']);
  assert.deepEqual([...FAMILY_ORDER], GROUP_ORDER.map(g => LEGACY[g]));
  assert.deepEqual(Object.keys(FAMILY_COLORS), [...FAMILY_ORDER]);
  for (const g of GROUP_ORDER) assert.deepEqual(FAMILY_COLORS[LEGACY[g]], GROUP_COLORS[g], `${g}: FAMILY_COLORS.${LEGACY[g]}`);
});

test('elementColor on an unknown type throws a TypeError that names it (4.2.0)', () => {
  assert.throws(() => elementColor('zzz'), { name: 'TypeError', message: /unknown element type "zzz"/ });
  assert.throws(() => elementColor(undefined, 'light'), { name: 'TypeError', message: /unknown element type "undefined"/ });
});

test('elementColor resolves per mode and defaults to dark', () => {
  assert.equal(elementColor('character', 'light'), '#2a78d6');
  assert.equal(elementColor('character', 'dark'), '#3987e5');
  assert.equal(elementColor('character'), '#3987e5'); // dark default — both live consumers are dark-surface
  assert.equal(elementColor('location', 'light'), elementColor('location', 'dark')); // the green identical by ruling
  for (const t of ELEMENT_TYPES) {
    for (const mode of ['light', 'dark']) assert.equal(elementColor(t, mode), GROUP_COLORS[ELEMENT_GROUPS[t]][mode]);
  }
});
