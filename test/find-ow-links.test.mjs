/**
 * findOwLinks: every address in a text, in order, each {start, end, reading}, read by readOwLinkAt at each place a
 * prefix starts. The start rule's cases as units (since serial 127), order and
 * no overlap, agreement with readOwLinkAt, and six hostile 1 MB texts timed. Runs against the compiled public bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../dist/index.js';

const { findOwLinks, readOwLinkAt } = sdk;
const E = '01a1d4ef-0000-7000-8000-000000000084';
const F = '01a1d4ef-0000-7000-8000-000000000085';
const W = '0193a1c2-7d3e-7f00-8a11-3c5e7b9d2f40';
const H = 'https://www.onlyworlds.com/w/';

test('the start rule, one unit each: glued to a letter, a combining mark or an underscore is prose; a hyphen, a digit or a stop is not', () => {
  for (const [name, before, n] of [
    ['hyphen', 'x-', 1],
    ['digit', '3', 1],
    ['letter', 'elb', 0],
    ['non-ascii-letter', 'café', 0],
    ['combining-mark', 'café', 0],
    ['underscore', '_', 0],
    ['astral-letter', '\u{1D49C}', 0],
    ['space', 'a ', 1],
    ['opening-bracket', '(', 1],
    ['full-stop', 'end.', 1],
    ['quote', '"', 1],
    ['start-of-text', '', 1],
  ]) {
    const text = `${before}ow://object/${E} then`;
    const got = findOwLinks(text);
    assert.equal(got.length, n, name);
    if (n) assert.deepEqual(got[0], { start: before.length, end: before.length + 48, reading: readOwLinkAt(text, before.length).reading }, name);
  }
});

test('every address in order, both forms, none overlapping, each what readOwLinkAt reads at its start', () => {
  const text = `Built the gate: elbow://object/${E}. See (ow://object/${E}) and "${H}${W}/event/${F}" then ow://${W}/object/${E}@12?lens=${F}, ow://ow://object/${F}.`;
  const got = findOwLinks(text);
  assert.deepEqual(got.map((f) => text.slice(f.start, f.end)), [
    `ow://object/${E}`,
    `${H}${W}/event/${F}`,
    `ow://${W}/object/${E}@12?lens=${F}`,
    `ow://object/${F}`,
  ]);
  for (const f of got) assert.deepEqual({ reading: f.reading, end: f.end }, readOwLinkAt(text, f.start));
  for (let i = 1; i < got.length; i++) assert.ok(got[i].start >= got[i - 1].end, 'no overlap');
});

test('nothing to find: an empty text, prose, a prefix alone; a text that is not a string is a TypeError', () => {
  assert.deepEqual(findOwLinks(''), []);
  assert.deepEqual(findOwLinks('no address here'), []);
  assert.deepEqual(findOwLinks('ow://'), []);
  assert.deepEqual(findOwLinks(H), []);
  for (const v of [null, undefined, 42, ['ow://x']]) assert.throws(() => findOwLinks(v), TypeError, String(v));
});

test('linear on hostile texts: six 1 MB shapes each read in well under two seconds', () => {
  const MB = 1 << 20;
  const fill = (unit) => unit.repeat(Math.ceil(MB / unit.length));
  const shapes = {
    'prefixes alone': fill('ow://'),
    'glued starts': fill(`elbow://object/${E} `),
    'addresses with a moment': fill(`ow://object/${E}@123 `),
    'a long run after /w/': H + 'a'.repeat(MB),
    'many ow:// then one site prefix at the end': fill('ow://x ') + H + W,
    'long paths that never read': fill(`ow://${'object/'.repeat(14)}x `),
  };
  for (const [name, text] of Object.entries(shapes)) {
    const t0 = performance.now();
    findOwLinks(text);
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${name}: ${Math.round(ms)} ms`);
  }
});
