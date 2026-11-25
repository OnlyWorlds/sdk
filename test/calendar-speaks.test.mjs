/**
 * Which calendar speaks (the calendar profile, serial 147): `speakingCalendar(world, elements)` on every case of the
 * vendored fixture that carries `speaks`, the World's keys beside the world's elements. Runs against the compiled
 * public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { speakingCalendar, WORLD_CALENDAR_KEY } from '../dist/index.js';

const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('../codegen/schema-dist/profiles/calendar.fixture.json', import.meta.url)), 'utf8'));
const CASES = FIXTURE.cases.filter((c) => 'speaks' in c);

test('every case that says which calendar speaks answers as written', () => {
  const wrong = [];
  for (const c of CASES) {
    let got;
    try {
      got = speakingCalendar(c.world, c.elements)?.id ?? null;
    } catch (err) {
      got = `threw ${err}`;
    }
    if (got !== c.speaks) wrong.push(`${c.name}: gave ${got}, the fixture says ${c.speaks}`);
  }
  assert.deepEqual(wrong, []);
  // After the cases, so a red pin never hides a case: serial 147 carries 12.
  assert.equal(CASES.length, 12, 'serial 147 carries 12 cases that say which calendar speaks');
});

const CAL = { version: 1, grain: 'day', bundles: { months: { names: ['Frost', 'Thaw'], lengths: [10, 10] } } };
const ELEMENTS = [{ id: 'a', name: 'A', atlas_calendar: CAL }, { id: 'b', name: 'B', atlas_calendar: JSON.stringify(CAL) }];

test('the key is x_calendar, read as the World\'s own key only', () => {
  assert.equal(WORLD_CALENDAR_KEY, 'x_calendar');
  assert.equal(speakingCalendar({ x_calendar: 'b' }, ELEMENTS)?.id, 'b', 'a calendar stored as a JSON string speaks');
  // A key inherited from the prototype is not the World's: none named, and two calendars leave none.
  assert.equal(speakingCalendar(Object.create({ x_calendar: 'a' }), ELEMENTS), null);
  assert.equal(speakingCalendar(JSON.parse('{"__proto__": {"x_calendar": "a"}}'), ELEMENTS), null);
  assert.equal(speakingCalendar({}, ELEMENTS.slice(0, 1))?.id, 'a', 'none named and one calendar: it speaks');
  assert.equal(speakingCalendar({ x_calendar: 7 }, ELEMENTS.slice(0, 1)), null, 'a value that is no id speaks none');
});

test('elements may be any iterable, read once per call', () => {
  function* gen() { yield* ELEMENTS; }
  assert.equal(speakingCalendar({ x_calendar: 'a' }, gen())?.id, 'a');
  assert.equal(speakingCalendar({}, gen()), null);
});

test('a world that is not an object is the caller\'s bug', () => {
  for (const w of [null, undefined, 'x_calendar', 3, ['a']]) {
    assert.throws(() => speakingCalendar(w, ELEMENTS), TypeError, String(w));
  }
});
