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
  assert.equal(ROOM_PAIRS.length, 8);
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
  assert.ok(cases.length >= 23, `the fixture holds ${cases.length} cases`);
});

test('isRoomElement: an element without a string type, supertype or mark is not in the room', () => {
  assert.equal(isRoomElement({}), false);
  assert.equal(isRoomElement({ type: 'narrative', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ supertype: 'Message', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: '   ', x_room_of: WORLD }), false);
  assert.equal(isRoomElement({ type: 'narrative', supertype: 'Message', x_room_of: 7 }), false);
});

test('isRoomElement folds case by Unicode simple case folding, as the Python package does', () => {
  // U+017F LATIN SMALL LETTER LONG S simple-folds to "s"; toLowerCase() leaves it.
  const LONG_S = String.fromCodePoint(0x17f);
  assert.equal(isRoomElement({ type: 'NARRATIVE', supertype: `Me${LONG_S}${LONG_S}age`, x_room_of: WORLD }), true);
  assert.equal(isRoomElement({ type: 'Relation', supertype: '\tWORK ITEM\n', x_room_of: WORLD }), true);
});
