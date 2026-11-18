/**
 * trimAndFold and byCodePoint: names compared as the profiles compare them (room.md's "trimmed and without regard
 * to case, defined once"; ordered by code point). Each case is a place where a language's own function answers
 * differently: JavaScript's trim() strips a byte order mark, toLowerCase() leaves the long s, and the < operator
 * compares UTF-16 units. Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimAndFold, byCodePoint, isRoomElement } from '../dist/index.js';

const cp = (...points) => String.fromCodePoint(...points);

// The 25 code points of Unicode's White_Space property (PropList.txt).
const WHITE_SPACE = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];

test('trimAndFold trims each White_Space code point at either end, and nothing inside', () => {
  for (const w of WHITE_SPACE) {
    assert.equal(trimAndFold(`${cp(w)}in design${cp(w)}`), 'in design', `U+${w.toString(16)}`);
  }
  assert.equal(trimAndFold(WHITE_SPACE.map(w => cp(w)).join('') + 'Locked' + WHITE_SPACE.map(w => cp(w)).join('')), 'locked');
  assert.equal(trimAndFold(`in${cp(0x3000)}design`), `in${cp(0x3000)}design`);
  assert.equal(trimAndFold(''), '');
  assert.equal(trimAndFold(WHITE_SPACE.map(w => cp(w)).join('')), '');
});

test('trimAndFold keeps what is no White_Space, where a language trim takes it', () => {
  // JavaScript's trim() strips U+FEFF; Python's strip() strips U+001C to U+001F. None is White_Space.
  for (const keep of [0xfeff, 0x200b, 0x180e, 0x1c, 0x1d, 0x1e, 0x1f]) {
    assert.equal(trimAndFold(`${cp(keep)}locked`), `${cp(keep)}locked`, `leading U+${keep.toString(16)}`);
    assert.equal(trimAndFold(`locked${cp(keep)}`), `locked${cp(keep)}`, `trailing U+${keep.toString(16)}`);
  }
  assert.notEqual(trimAndFold(`${cp(0xfeff)}in design`), `${cp(0xfeff)}in design`.trim());
});

test('trimAndFold folds by the simple rows only, never by lower-casing or full folding', () => {
  assert.equal(trimAndFold(`ME${cp(0x17f, 0x17f)}AGE`), 'message'); // the long s folds to s; toLowerCase leaves it
  assert.notEqual(`ME${cp(0x17f, 0x17f)}AGE`.toLowerCase(), 'message');
  assert.equal(trimAndFold(`${cp(0x212a)}ing`), 'king'); // the Kelvin sign folds to k
  assert.equal(trimAndFold(`Me${cp(0xdf)}age`), `me${cp(0xdf)}age`); // the sharp s has only a full folding
  assert.equal(trimAndFold(cp(0x131)), cp(0x131)); // the dotless i has no row
  assert.equal(trimAndFold(cp(0x130)), cp(0x130)); // the dotted capital I has only F and T rows
  assert.equal(trimAndFold(`te${cp(0xfb06)}`), `te${cp(0xfb06)}`); // the st ligature: full folding only
  assert.equal(trimAndFold(cp(0x10400)), cp(0x10428)); // an astral letter folds by its row
  assert.equal(trimAndFold('LOCKED'), 'locked');
});

test('trimAndFold is the fold isRoomElement matches pairs by', () => {
  const room = { id: '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e01', x_room_of: '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f' };
  assert.equal(trimAndFold(`${cp(0x85)}NARRATIVE${cp(0x3000)}`), 'narrative');
  assert.equal(isRoomElement({ ...room, type: `${cp(0x85)}NARRATIVE${cp(0x3000)}`, supertype: `ME${cp(0x17f, 0x17f)}AGE` }), true);
  assert.equal(isRoomElement({ ...room, type: `${cp(0xfeff)}narrative`, supertype: 'Message' }), false);
});

test('trimAndFold refuses a value that is no string', () => {
  for (const [bad, word] of [[null, 'null'], [undefined, 'undefined'], [7, 'number'], [[], 'an array'], [{}, 'object'], [true, 'boolean']]) {
    assert.throws(() => trimAndFold(bad), (e) => e instanceof TypeError && e.message === `trimAndFold takes a string, not ${word}`, String(word));
  }
});

test('byCodePoint orders by code point, where UTF-16 units part from it', () => {
  const astral = cp(0x10428), fullWidth = cp(0xff5a);
  assert.ok(astral < fullWidth, 'UTF-16 units put the astral letter first');
  assert.ok(byCodePoint(fullWidth, astral) < 0);
  assert.ok(byCodePoint(astral, fullWidth) > 0);
  assert.deepEqual([astral, fullWidth, 'z', 'Z'].sort(byCodePoint), ['Z', 'z', fullWidth, astral]);
  assert.equal(byCodePoint('', ''), 0);
  assert.equal(byCodePoint('abc', 'abc'), 0);
  assert.ok(byCodePoint('ab', 'abc') < 0);
  assert.ok(byCodePoint('abc', 'ab') > 0);
  assert.ok(byCodePoint('Zebra', 'apple') < 0, 'by code point, never a collation');
});

test('names ordered as the profiles order them: folds by code point, ties by id', () => {
  const rows = [
    { id: 'b2', name: ' apple' },
    { id: 'a1', name: `${cp(0x2003)}APPLE` },
    { id: 'c3', name: cp(0x10400) },
    { id: 'd4', name: cp(0xff3a) },
  ];
  const order = [...rows].sort((x, y) => byCodePoint(trimAndFold(x.name), trimAndFold(y.name)) || byCodePoint(x.id, y.id));
  assert.deepEqual(order.map(r => r.id), ['a1', 'b2', 'd4', 'c3']);
});
