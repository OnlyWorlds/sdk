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
import { ROOM_PAIRS, isRoomElement } from '../dist/index.js';

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
  assert.equal(ROOM_PAIRS.length, 9);
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
  assert.equal(cases.length, 32, `the fixture holds ${cases.length} cases, serial 88 has 32`);
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
  assert.equal(isRoomElement(msg({})), true);
  assert.equal(isRoomElement(msg([])), true);
  assert.equal(isRoomElement(msg(`  ${WORLD}  `)), true);
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
