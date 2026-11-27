/**
 * readCalendarShape: the calendar read for editing, every check of readCalendarConfig but the profile's size
 * bounds (serial 149), with the first bound it passes in validateCalendarConfig's words. Held to the reader on
 * every case of the profile's fixture, and to each bound on a calendar made just past it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCalendarConfig, readCalendarShape, validateCalendarConfig } from '../dist/index.js';
import * as sub from '../dist/calendar.js';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const FIXTURE = read('../codegen/schema-dist/profiles/calendar.fixture.json');

const base = () => ({ version: 2, grain: 'day', bundles: { months: { names: ['Frost', 'Thaw'], lengths: [10, 10] } } });

test('on every case of the profile fixture, the shape is the reader where no bound is passed', () => {
  let read = 0, refused = 0;
  for (const c of FIXTURE.cases) {
    if (!('value' in c)) continue;
    const cfg = readCalendarConfig(c.value);
    const shape = readCalendarShape(c.value);
    if (cfg !== null) {
      read++;
      assert.deepEqual(shape, { config: cfg, limit: null }, c.name);
    } else {
      refused++;
      // refused by the reader: a broken shape (null here too) or a bound passed (a limit named)
      if (shape !== null) {
        assert.equal(typeof shape.limit, 'string', `${c.name}: read here, refused there, so a bound must be named`);
        assert.ok(validateCalendarConfig(shape.config).includes(shape.limit), c.name);
      }
    }
  }
  assert.ok(read > 20 && refused > 20, `the fixture reaches both sides (${read} read, ${refused} refused)`);
});

const PAST = [
  ['eras', (c) => { c.eras = Array.from({ length: 257 }, (_, i) => ({ name: `E${i}`, start: i * 10, end: i * 10 + 9 })); }, 'A calendar holds at most 256 eras'],
  ['months', (c) => { c.bundles.months = { names: Array.from({ length: 65 }, (_, i) => `M${i}`), lengths: Array(65).fill(1) }; }, 'A calendar holds at most 64 months'],
  ['week', (c) => { c.bundles.week = { length: 65, names: Array.from({ length: 65 }, (_, i) => `D${i}`) }; }, 'A week holds at most 64 steps and 64 names'],
  ['festival days', (c) => { c.intercalary = Array.from({ length: 17 }, (_, i) => ({ name: `F${i}`, after_month: 1 })); }, 'A calendar holds at most 16 festival days'],
  ['a long name', (c) => { c.bundles.months.names[0] = 'x'.repeat(257); }, 'A name or template holds at most 256 characters'],
  ['a long year', (c) => { c.bundles.months.lengths = [2 ** 52, 2 ** 52, 10]; c.bundles.months.names.push('Bloom'); }, 'A year holds at most 2^53 - 1 steps'],
];

for (const [what, make, words] of PAST) {
  test(`past the bound on ${what}: refused by the reader, read here with the bound's words`, () => {
    const c = base();
    make(c);
    assert.equal(readCalendarConfig(c), null);
    const shape = readCalendarShape(c);
    assert.ok(shape, 'the shape is read');
    assert.equal(shape.limit, words);
    assert.ok(validateCalendarConfig(shape.config).includes(words), 'the same words as the validator');
  });
}

test('a broken shape is null, bound or no bound', () => {
  for (const v of [null, 3, 'x', [], { version: 3, grain: 'day' }, { version: 2 }, { ...base(), eras: false },
    { ...base(), eras: Array.from({ length: 300 }, () => ({ name: 5, start: 0 })) }]) {
    assert.equal(readCalendarShape(v), null, JSON.stringify(v).slice(0, 60));
  }
});

test('the config is the value read, never a copy cut down to the bounds', () => {
  const c = base();
  c.eras = Array.from({ length: 300 }, (_, i) => ({ name: `E${i}`, start: i * 10, end: i * 10 + 9 }));
  const shape = readCalendarShape(c);
  assert.equal(shape.config.eras.length, 300);
});

test('the calendar subpath gives the same answers as the root', () => {
  const c = base();
  c.bundles.months.names[0] = 'x'.repeat(257);
  for (const v of [base(), c, { version: 3 }]) assert.deepEqual(sub.readCalendarShape(v), readCalendarShape(v));
});
