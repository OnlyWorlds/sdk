/**
 * The calendar amendment (schema-dist serial 68, profiles/calendar.md): version 2's leap keys `except` and `offset` on an intercalary entry, a version-1 reader's
 * refusal of a version-2 value, and an up era's open end skipping down eras.
 *
 * Witnessed against another implementation: test/fixtures/legendkeeper-calendars.json holds five of
 * LegendKeeper's preset calendars as configs and, for each probed day, LegendKeeper's own reading of
 * it (year, era, month, day), read back from events made on each calendar through its API. Gregorian
 * (every 4, not every 100, yet every 400, no year 0) and Harptos (every 4, no year 0) need version 2;
 * the others are version 1. LegendKeeper adds a leap day to the end of its month; the profile names it
 * as its own day, so a probe on that day matches when the step reads as the leap day.
 *
 * Also replays the vendored calendar fixture (codegen/schema-dist/profiles/calendar.fixture.json),
 * which no test read before 4.76.0. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  breakdownStep, formatStep, readCalendarConfig, readCalendarValue, validateCalendarConfig, eraForStep,
  yearLength, yearStartStep, absoluteYear, intercalaryInYear, parseDate, isParseError, worldCalendars,
} from '../dist/index.js';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const LK = read('./fixtures/legendkeeper-calendars.json');
const FIXTURE = read('../codegen/schema-dist/profiles/calendar.fixture.json');

for (const cal of LK.calendars) {
  test(`LegendKeeper's ${cal.name}: every probed day reads as LegendKeeper reads it`, () => {
    const cfg = cal.config;
    assert.deepEqual(validateCalendarConfig(cfg), []);
    assert.ok(readCalendarConfig(cfg), 'the config reads');
    assert.ok(cal.probes.length > 70, 'the probe is there');
    const misses = [];
    for (const [step, year, era, month, day] of cal.probes) {
      const b = breakdownStep(cfg, step);
      const leap = Object.entries(cal.leap_days).find(([, m]) => m.month === month && day === m.length + 1);
      const want = leap ? [year, era, leap[0], 1] : [year, era, month, day];
      const got = b.intercalary != null ? [b.year, b.era?.name, b.intercalary, 1] : [b.year, b.era?.name, b.monthName, b.day];
      if (JSON.stringify(got) !== JSON.stringify(want)) misses.push(`${step}: ${JSON.stringify(got)} for ${JSON.stringify(want)}`);
    }
    assert.deepEqual(misses, []);
  });
}

test('a version-2 value reads as version 1 would without its leap keys, and the keys change the leap years', () => {
  const greg = LK.calendars.find((c) => c.name === 'Gregorian').config;
  const leap = greg.intercalary.find((i) => i.every_years);
  // 1900 (index 1899) is not a leap year, 2000 (index 1999) is, 1999 (index 1998) is not: offset 1, except [100, 400].
  assert.equal(intercalaryInYear(greg, leap, 1899), false);
  assert.equal(intercalaryInYear(greg, leap, 1999), true);
  assert.equal(intercalaryInYear(greg, leap, 1998), false);
  assert.equal(intercalaryInYear(greg, leap, 2003), true);
  assert.equal(yearLength(greg, 1899), 365);
  assert.equal(yearLength(greg, 1999), 366);
  // The same keys under version 1 are unknown keys: ignored, the plain every-4 rule from index 0.
  const v1 = { ...greg, version: 1 };
  assert.ok(readCalendarConfig(v1));
  assert.equal(intercalaryInYear(v1, leap, 1899), false);
  assert.equal(intercalaryInYear(v1, leap, 1900), true);
  assert.equal(yearLength(v1, 1900), 366);
  // A writer is told the keys need version 2.
  assert.match(validateCalendarConfig(v1).join(' '), /version 2/);
});

test('the closed-form year starts equal the sum of year lengths, both sides of 0', () => {
  for (const cal of LK.calendars) {
    const cfg = cal.config;
    let start = 0;
    for (let y = 0; y < 1300; y++) {
      assert.equal(yearStartStep(cfg, y), start, `${cal.name} year ${y}`);
      start += yearLength(cfg, y);
    }
    start = 0;
    for (let y = -1; y > -1300; y--) {
      start -= yearLength(cfg, y);
      assert.equal(yearStartStep(cfg, y), start, `${cal.name} year ${y}`);
    }
    // ±1e12 steps (about 2.7 billion years): the year search seeds on the mean year, except chain
    // included, and corrects at most 10,000 laps, so a seed that ignored the chain would land outside.
    for (const step of [-1e12, -500000, -146097, -1, 0, 1, 146097, 730484, 1000000, 1e12]) {
      const y = absoluteYear(cfg, step);
      assert.ok(yearStartStep(cfg, y) <= step && step < yearStartStep(cfg, y + 1), `${cal.name} step ${step}`);
    }
  }
});

test('a version-2 date parses back to its step', () => {
  const greg = LK.calendars.find((c) => c.name === 'Gregorian').config;
  for (const step of [0, 59, 365, 730484, 730484 + 59, -1, -366]) {
    const words = formatStep(greg, step);
    const back = parseDate(greg, words);
    assert.ok(!isParseError(back), `${words}: ${back.error}`);
    assert.equal(back.step, step, words);
  }
});

test('version 2 refuses a leap rule it cannot read, by name; version 3 is not a calendar', () => {
  const base = { version: 2, grain: 'day', bundles: { months: { names: ['A', 'B'], lengths: [10, 10] } } };
  const withLeap = (extra) => ({ ...base, intercalary: [{ name: 'L', after_month: 1, every_years: 4, ...extra }] });
  for (const [extra, why] of [
    [{ except: [100, 250] }, 'not a multiple of the one before'],
    [{ except: [400, 100] }, 'not ascending'],
    [{ except: [4] }, 'not above every_years (the profile\'s own refusal example)'],
    [{ except: [6] }, 'not a multiple of every_years'],
    [{ except: 100 }, 'not a list'],
    [{ except: [100.5] }, 'not whole'],
    [{ offset: 0.5 }, 'offset not whole'],
    [{ offset: '1' }, 'offset not a number'],
  ]) {
    assert.equal(readCalendarConfig(withLeap(extra)), null, why);
    assert.notDeepEqual(validateCalendarConfig(withLeap(extra)), [], why);
  }
  const noPeriod = { ...base, intercalary: [{ name: 'L', after_month: 1, offset: 1 }] };
  assert.equal(readCalendarConfig(noPeriod), null, 'offset without every_years');
  assert.ok(readCalendarConfig(withLeap({ except: [100, 400], offset: -3 })), 'a negative offset is whole');
  assert.ok(readCalendarConfig(withLeap({ except: null, offset: null })), 'null is absent');
  assert.equal(readCalendarConfig({ ...base, version: 3 }), null);
});

test('an up era with no end runs to the next up era, past a down era listed after it', () => {
  const after = { name: 'After', abbrev: 'AF', start: 0 };
  const before = { name: 'Before', abbrev: 'BF', start: 0, direction: 'down' };
  const cfg = { version: 1, grain: 'year', eras: [after, before] };
  assert.equal(eraForStep(cfg, 5)?.name, 'After');
  assert.equal(formatStep(cfg, 5), '6 AF');
  assert.equal(formatStep(cfg, -1), '1 BF');
  // List order no longer decides it.
  assert.equal(formatStep({ ...cfg, eras: [before, after] }, 5), '6 AF');
  // A later up era still ends it.
  const later = { ...cfg, eras: [after, before, { name: 'Third', abbrev: 'TH', start: 10 }] };
  assert.equal(eraForStep(later, 9)?.name, 'After');
  assert.equal(eraForStep(later, 10)?.name, 'Third');
});

test('the vendored calendar fixture: every case reads as written', () => {
  assert.equal(FIXTURE.profile, 'atlas_calendar');
  assert.equal(FIXTURE.cases.length, 76, 'serial 90 carries 76 cases');
  assert.equal(FIXTURE.cases.reduce((n, c) => n + (c.steps?.length ?? 0), 0), 209, 'serial 90 carries 209 steps');
  assert.equal(FIXTURE.cases.filter((c) => !c.valid).length, 42, 'serial 90 carries 42 values a reader must refuse');
  // Serial 69 added the days around Leap Day in 1900, 2000 and 2100 (12 steps) to the Gregorian case.
  assert.equal(FIXTURE.cases.find((c) => c.name === 'v2-except-chain-gregorian')?.steps.length, 29, 'the Gregorian case holds 29 steps');
  // Serial 89: one case carries a world's elements and the ids a reader finds a calendar on.
  assert.deepEqual(FIXTURE.cases.filter((c) => c.elements).map((c) => c.name), ['found-by-the-field-never-by-type']);
  const failed = [];
  for (const c of FIXTURE.cases) {
    const cfg = readCalendarValue(c.value);
    let ok = (cfg != null) === c.valid;
    if (c.elements && JSON.stringify(worldCalendars(c.elements).map((w) => w.id)) !== JSON.stringify(c.found)) ok = false;
    for (const s of (ok && cfg ? c.steps ?? [] : [])) {
      const b = breakdownStep(cfg, s.step);
      const got = { absYear: b.absYear, year: b.year, era: b.era?.name ?? null, month: b.month, monthName: b.monthName, day: b.day, intercalary: b.intercalary, weekday: b.weekday };
      if (formatStep(cfg, s.step) !== s.words || JSON.stringify(got) !== JSON.stringify(s.breakdown)) ok = false;
    }
    if (!ok) failed.push(c.name);
  }
  assert.deepEqual(failed, []);
});
