/**
 * The review profile (schema-dist profiles/review.md): proposedMarkOf (the mark as a reader that shows a
 * world shows it, rules 1, 2 and 4) and handsOnAsProposed (what a reader that hands a world on leaves out,
 * rules 1 and 4). The profile has no fixture yet; these cases are the Python package's too
 * (tests/test_review.py), case for case. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSED_MARK, proposedMarkOf, handsOnAsProposed, buildAskContext, buildWorldIndex } from '../dist/index.js';

const TODAY = '2026-10-26';
const el = (mark) => (mark === undefined ? { id: 'a', name: 'A' } : { id: 'a', name: 'A', x_review_proposed: mark });

// [what, the mark (undefined: no key), proposedMarkOf's answer, handsOnAsProposed's answer]
const CASES = [
  ['no key', undefined, null, false],
  ['null: settled', null, null, false],
  ['a string: not a mark, a doubt', 'yes', null, true],
  ['an array: not a mark, a doubt', [], null, true],
  ['false: a value, a doubt', false, null, true],
  ['zero: a value, a doubt', 0, null, true],
  ['an empty object', {}, { by: null, expires: null, lapsed: false }, true],
  ['a whole mark, open', { by: 'm1', evidence: 'seen', expires: '2026-11-01' }, { by: 'm1', expires: '2026-11-01', lapsed: false }, true],
  ['trimmed by and expires', { by: '  m1 ', expires: ' 2026-11-01 ' }, { by: 'm1', expires: '2026-11-01', lapsed: false }, true],
  ['lapses on its own day', { by: 'm1', expires: TODAY }, { by: 'm1', expires: TODAY, lapsed: true }, true],
  ['lapsed before today', { by: 'm1', expires: '2026-10-01' }, { by: 'm1', expires: '2026-10-01', lapsed: true }, true],
  ['an expires not shaped as a day', { by: 'm1', expires: '2026-1-1' }, { by: 'm1', expires: null, lapsed: false }, true],
  ['a blank or non-string by', { by: '   ', expires: 7 }, { by: null, expires: null, lapsed: false }, true],
];

// The two languages' own defaults disagree here: JavaScript's trim() strips a byte order mark, Python's
// strip() strips U+001C, and neither is White_Space; Python's \d matches non-ASCII digits. Both readers
// trim by White_Space and read ASCII digits, so each of these is kept or refused the same in both.
const FS = String.fromCharCode(0x1c);
const BOM = String.fromCharCode(0xfeff);
const ARABIC_DAY = [0x662, 0x660, 0x662, 0x666].map((c) => String.fromCharCode(c)).join('') + '-10-01';
CASES.push(
  ['a by wrapped in U+001C keeps it', { by: `${FS}m1${FS}` }, { by: `${FS}m1${FS}`, expires: null, lapsed: false }, true],
  ['a by wrapped in a byte order mark keeps it', { by: `${BOM}m1` }, { by: `${BOM}m1`, expires: null, lapsed: false }, true],
  ['an expires in Arabic-Indic digits is no day', { by: 'm1', expires: ARABIC_DAY }, { by: 'm1', expires: null, lapsed: false }, true],
  ['an expires wrapped in a no-break space is trimmed', { expires: `${String.fromCharCode(0xa0)}2026-10-01` }, { by: null, expires: '2026-10-01', lapsed: true }, true],
);

test('the mark key is the profile\'s', () => {
  assert.equal(PROPOSED_MARK, 'x_review_proposed');
});

for (const [what, mark, shown, handedOn] of CASES) {
  test(`review: ${what}`, () => {
    assert.deepEqual(proposedMarkOf(el(mark), TODAY), shown);
    assert.equal(handsOnAsProposed(el(mark)), handedOn);
  });
}

test('review: not an element reads as settled', () => {
  for (const v of [null, undefined, 'x', 3]) {
    assert.equal(proposedMarkOf(v, TODAY), null);
    assert.equal(handsOnAsProposed(v), false);
  }
});

test('review: today must be a day', () => {
  assert.throws(() => proposedMarkOf(el({}), '26-10-2026'), TypeError);
  assert.throws(() => proposedMarkOf(el({}), 20261026), TypeError);
  assert.throws(() => proposedMarkOf(el({}), ARABIC_DAY), TypeError);
  assert.doesNotThrow(() => proposedMarkOf(el({}))); // today in UTC by default
});

test('review: buildAskContext leaves out what handsOnAsProposed says, a doubt included', () => {
  const els = [
    { id: 'a', type: 'character', name: 'Settled' },
    { id: 'b', type: 'character', name: 'Marked', x_review_proposed: { by: 'm1' } },
    { id: 'c', type: 'character', name: 'Doubted', x_review_proposed: 'yes' },
  ];
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.deepEqual(r.kept, ['a']);
  assert.deepEqual([...r.leftOut.proposed].sort(), ['b', 'c']);
});
