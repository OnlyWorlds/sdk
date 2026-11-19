/**
 * The room profile (schema-dist profiles/room.md, serial 45): ROOM_PAIRS against the
 * fixture's pairs, and isRoomElement (the pair AND the mark x_room_of) on every conformance
 * case in codegen/schema-dist/profiles/room.fixture.json, vendored with the distribution.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOM_PAIRS, isRoomElement, talksOf } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/room.fixture.json', import.meta.url));
const WORLD = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';

function loadFixture() {
  assert.ok(existsSync(FIXTURE), `no room fixture at ${FIXTURE}`);
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  assert.equal(doc.profile, 'room');
  return doc;
}

test('ROOM_PAIRS is the fixture\'s pairs, in its order, and the mark is x_room_of', () => {
  const doc = loadFixture();
  assert.deepEqual(ROOM_PAIRS.map(p => ({ ...p })), doc.pairs);
  assert.equal(ROOM_PAIRS.length, 10);
  assert.equal(doc.mark.field, 'x_room_of');
});

test('isRoomElement answers every case of the room fixture', (t) => {
  const { cases } = loadFixture();
  const wrong = [];
  for (const c of cases) {
    const got = isRoomElement(c.element);
    if (got !== c.in_room) wrong.push(`${c.name}: ${JSON.stringify(c.element)} gave ${got}, the fixture says ${c.in_room}`);
  }
  t.diagnostic(`the room fixture: ${cases.length} cases run, ${wrong.length} disagreeing, from ${FIXTURE}`);
  assert.deepEqual(wrong, []);
  assert.equal(cases.length, 48, `the fixture holds ${cases.length} cases, serial 131 has 48`);
});

test('isRoomElement: an element without a string type, supertype or mark is not in the room', () => {
  assert.equal(isRoomElement({}), false);
  assert.equal(isRoomElement({ type: 'narrative', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ supertype: 'Message', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: '   ', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: 'Message' }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: 'Message', x_room_of: null }), false);
});

test('isRoomElement reads the mark by presence, never by its value (room.md, serial 83)', () => {
  const NBSP = String.fromCodePoint(0xa0);
  const msg = (mark) => ({ type: 'narrative', supertype: 'Message', x_room_of: mark });
  // Any value but null counts: a number, an object, a list, false, a world id that is not this one.
  assert.equal(isRoomElement(msg(7)), true);
  assert.equal(isRoomElement(msg(0)), true);
  assert.equal(isRoomElement(msg(false)), true);
  assert.equal(isRoomElement(msg({ world: WORLD })), true);
  assert.equal(isRoomElement(msg(['x'])), true);
  assert.equal(isRoomElement(msg(`  ${WORLD}  `)), true);
  // Since serial 126: an empty list or an empty object is absent too (a compact reader leaves both out).
  assert.equal(isRoomElement(msg({})), false);
  assert.equal(isRoomElement(msg([])), false);
  // A string counts only when something is left after the White_Space trim.
  assert.equal(isRoomElement(msg('')), false);
  assert.equal(isRoomElement(msg(` ${NBSP}\t`)), false);
  assert.equal(isRoomElement(msg(String.fromCodePoint(0x1f))), true);
  assert.equal(isRoomElement(msg(String.fromCodePoint(0xfeff))), true);
});

test('isRoomElement folds case by Unicode simple case folding, as the Python package does', () => {
  // U+017F LATIN SMALL LETTER LONG S simple-folds to "s"; toLowerCase() leaves it.
  const LONG_S = String.fromCodePoint(0x17f);
  assert.equal(isRoomElement({ type: 'NARRATIVE', supertype: `Me${LONG_S}${LONG_S}age`, x_room_of: WORLD }), true);
  assert.equal(isRoomElement({ type: 'Relation', supertype: '\tWORK ITEM\n', x_room_of: WORLD }), true);
});

test('isRoomElement trims Unicode White_Space at both ends and nothing else (room.md, dist.47)', () => {
  const IDEO = String.fromCodePoint(0x3000); // IDEOGRAPHIC SPACE, White_Space
  const NBSP = String.fromCodePoint(0xa0); // NO-BREAK SPACE, White_Space
  const PARA = String.fromCodePoint(0x2029); // PARAGRAPH SEPARATOR, White_Space
  const BOM = String.fromCodePoint(0xfeff); // a byte order mark, not White_Space
  const ZWSP = String.fromCodePoint(0x200b); // ZERO WIDTH SPACE, not White_Space
  assert.equal(isRoomElement({ type: 'narrative', supertype: ` Message${IDEO}`, x_room_of: WORLD }), true);
  assert.equal(isRoomElement({ type: `${NBSP}narrative${PARA}`, supertype: 'Message', x_room_of: WORLD }), true);
  // A byte order mark stays, so the word is not the pair's (JavaScript's trim() strips it).
  assert.equal(isRoomElement({ type: 'narrative', supertype: `${BOM}Message`, x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: `${BOM}narrative`, supertype: 'Message', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: `${ZWSP}Message`, x_room_of: WORLD }), false);
  // Nothing inside the value is touched.
  assert.equal(isRoomElement({ type: 'relation', supertype: `Work${IDEO}item`, x_room_of: WORLD }), false);
});

test('isRoomElement trims exactly the code points of Unicode White_Space, swept over the whole BMP', () => {
  const WS = /^\p{White_Space}$/u;
  const wrong = [];
  for (let cp = 0; cp <= 0xffff; cp++) {
    const ch = String.fromCharCode(cp);
    const got = isRoomElement({ type: 'narrative', supertype: `${ch}Message${ch}`, x_room_of: WORLD });
    if (got !== WS.test(ch)) wrong.push(cp.toString(16));
  }
  assert.deepEqual(wrong, []);
});

// ---- The talk on an Object or a Construct (room.md, serial 135): talksOf ----

/** Talks compare as a set (the fixture says so); the order is checked apart, by inFirstPlace. */
const asSet = (list) => list.map((v) => JSON.stringify(v, Object.keys(v).sort())).sort();

/** The order talksOf promises: each {type, id} once, in the place it is first named, objects before constructs. */
function inFirstPlace(element, got) {
  const want = [];
  for (const [field, type] of [['objects', 'object'], ['constructs', 'construct']]) {
    for (const id of Array.isArray(element?.[field]) ? element[field] : []) {
      if (got.some((t) => t.type === type && t.id === id) && !want.some((t) => t.type === type && t.id === id)) want.push({ type, id });
    }
  }
  assert.deepEqual(got, want, 'each talk once, in first place, objects before constructs');
}

const talkCases = loadFixture().talk_cases;

test('the room fixture holds its talk_cases list', () => {
  assert.ok(Array.isArray(talkCases), 'the fixture holds no talk_cases list');
  assert.equal(talkCases.length, 13, `the fixture holds ${talkCases.length} talk cases, serial 135 has 13`);
});

for (const [i, c] of (talkCases ?? []).entries()) {
  const name = typeof c?.name === 'string' ? c.name : `case ${i}`;
  test(`room fixture, talksOf: ${name}`, () => {
    assert.ok(Array.isArray(c.talks), `${name}: no talks list`);
    const got = talksOf(c.element);
    assert.deepEqual(asSet(got), asSet(c.talks), `${name}: talks`);
    inFirstPlace(c.element, got);
  });
}

// The cases below are the package's own: the fixture does not hold them, the page's rule implies them.
const line = (fields) => ({ id: 'line-1', type: 'narrative', supertype: 'Message', x_room_of: WORLD, ...fields });

test('talksOf (the package\'s own): an id with a space left on it is read as written, never trimmed', () => {
  assert.deepEqual(talksOf(line({ objects: [' abc', 'abc ', 'abc'] })), [
    { type: 'object', id: ' abc' }, { type: 'object', id: 'abc ' }, { type: 'object', id: 'abc' },
  ]);
});

test('talksOf (the package\'s own): an id named twice is one talk, in its first place; the same id as an Object and a Construct is two', () => {
  assert.deepEqual(talksOf(line({ objects: ['b', 'a', 'b'], constructs: ['a', 'a'] })), [
    { type: 'object', id: 'b' }, { type: 'object', id: 'a' }, { type: 'construct', id: 'a' },
  ]);
});

test('talksOf (the package\'s own): a field that is no list names nothing, the other field still read', () => {
  for (const bad of ['abc', { id: 'abc' }, 7, true, null]) {
    assert.deepEqual(talksOf(line({ objects: bad, constructs: ['c'] })), [{ type: 'construct', id: 'c' }], JSON.stringify(bad));
  }
});

test('talksOf (the package\'s own): an id in upper case keeps its case, and is another talk than its lowercase', () => {
  assert.deepEqual(talksOf(line({ constructs: ['ABC', 'abc'] })), [{ type: 'construct', id: 'ABC' }, { type: 'construct', id: 'abc' }]);
});

test('talksOf (the package\'s own): White_Space alone names nothing; a byte order mark or a zero width space is no White_Space, so it is an id', () => {
  const NBSP = String.fromCodePoint(0xa0);
  const IDEO = String.fromCodePoint(0x3000);
  const BOM = String.fromCodePoint(0xfeff);
  const ZWSP = String.fromCodePoint(0x200b);
  assert.deepEqual(talksOf(line({ objects: [`${NBSP}`, `\t${IDEO}\n`, BOM, ZWSP, [], {}, 0] })), [
    { type: 'object', id: BOM }, { type: 'object', id: ZWSP },
  ]);
});

test('talksOf (the package\'s own): the pair is trimmed and folded as isRoomElement reads it, and the mark is needed', () => {
  assert.deepEqual(talksOf({ type: ' Narrative', supertype: 'MESSAGE\t', x_room_of: WORLD, objects: ['o'] }), [{ type: 'object', id: 'o' }]);
  assert.deepEqual(talksOf({ type: 'narrative', supertype: 'Message', x_room_of: '  ', objects: ['o'] }), []);
  // A room element of another pair (a work item) is no line.
  assert.deepEqual(talksOf({ type: 'relation', supertype: 'Work item', x_room_of: WORLD, objects: ['o'] }), []);
});

test('talksOf (the package\'s own): anything that is not an element answers []', () => {
  for (const bad of [null, undefined, 'narrative', 7, [line({ objects: ['o'] })]]) assert.deepEqual(talksOf(bad), [], String(bad));
});

test('talksOf is pure: the element is not moved, and the answer is the caller\'s own', () => {
  const el = line({ objects: ['o'] });
  const before = JSON.stringify(el);
  const got = talksOf(el);
  got[0].id = 'planted';
  got.push({ type: 'object', id: 'x' });
  assert.equal(JSON.stringify(el), before);
  assert.deepEqual(talksOf(el), [{ type: 'object', id: 'o' }]);
});
