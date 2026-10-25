#!/usr/bin/env node
/**
 * The calendar amendment's conformance cases, in profiles/calendar.fixture.json's shape, generated
 * from this build's kernel (dist): words are formatStep's, breakdown breakdownStep's with the era's
 * name. The LegendKeeper cases take their steps from test/fixtures/legendkeeper-calendars.json and
 * assert, before writing, that each step reads as LegendKeeper read it.
 *
 *   npm run build && node scripts/calendar-fixture-cases.mjs <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { breakdownStep, formatStep, readCalendarValue } from '../dist/index.js';

const LK = JSON.parse(readFileSync(new URL('../test/fixtures/legendkeeper-calendars.json', import.meta.url), 'utf8'));
const lk = (name) => LK.calendars.find((c) => c.name === name);

function stepsOf(value, steps) {
  const cfg = readCalendarValue(value);
  if (!cfg) throw new Error('not a calendar: ' + JSON.stringify(value));
  return steps.map((step) => {
    const b = breakdownStep(cfg, step);
    return { step, words: formatStep(cfg, step), breakdown: { absYear: b.absYear, year: b.year, era: b.era?.name ?? null, month: b.month, monthName: b.monthName, day: b.day, intercalary: b.intercalary, weekday: b.weekday } };
  });
}

/** Probe steps of a LegendKeeper calendar, each checked against LegendKeeper's reading. */
function witnessed(name, pick) {
  const cal = lk(name);
  const rows = cal.probes.filter(([step]) => pick.includes(step));
  if (rows.length !== pick.length) throw new Error(`${name}: ${pick.length - rows.length} picked steps not in the probe`);
  for (const [step, year, era, month, day] of rows) {
    const b = breakdownStep(cal.config, step);
    const leap = Object.entries(cal.leap_days).find(([, m]) => m.month === month && day === m.length + 1);
    const want = leap ? [year, era, leap[0], 1] : [year, era, month, day];
    const got = b.intercalary != null ? [b.year, b.era?.name, b.intercalary, 1] : [b.year, b.era?.name, b.monthName, b.day];
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${name} ${step}: ${got} for ${want}`);
  }
  return { value: cal.config, steps: stepsOf(cal.config, pick) };
}

// `skip`: probes added after a case was published, kept out of the stride so its sampled steps stay as published.
const sample = (name, n, skip = []) => {
  const probes = lk(name).probes.filter(([s]) => !skip.includes(s));
  const steps = probes.map(([s]) => s);
  const leapish = probes.filter(([, , , month, day]) => Object.values(lk(name).leap_days).some((m) => m.month === month && day >= m.length)).map(([s]) => s);
  return [...new Set([...steps.filter((_, i) => i % Math.ceil(steps.length / n) === 0), ...leapish])].sort((a, b) => a - b);
};

const base = { version: 2, grain: 'day', bundles: { months: { names: ['Frost', 'Thaw'], lengths: [10, 10] } } };
const leapEntry = (extra) => ({ ...base, intercalary: [{ name: 'Leap', after_month: 2, every_years: 4, ...extra }] });

const cases = [];
// The century years, after Leap Day: a reader whose days ignore `except` while its year count keeps it
// misreads only these (1900 and 2100 have no Leap Day, 2000 does; found by a mutant in the Unity reader).
const CENTURIES = [693653, 693654, 693655, 693959, 730177, 730178, 730179, 730484, 766702, 766703, 766704, 767008];
const g = witnessed('Gregorian', [...new Set([...sample('Gregorian', 14, CENTURIES), ...CENTURIES])].sort((a, b) => a - b));
cases.push({ name: 'v2-except-chain-gregorian', why: 'version 2: every_years 4, except [100, 400], offset 1 (no year 0): LegendKeeper\'s Gregorian; every step read back from LegendKeeper as it shows it (its leap day is the 29th of February, ours the day named Leap Day after February)', value: g.value, valid: true, steps: g.steps });
const h = witnessed('Harptos', sample('Harptos', 14));
cases.push({ name: 'v2-offset-harptos', why: 'version 2: every_years 4, offset 1 (no year 0): Shieldsmeet in displayed years 4, 8, ... (year index 3, 7, ...), after Midsummer; every step read back from LegendKeeper', value: h.value, valid: true, steps: h.steps });
const small = leapEntry({ except: [8], offset: 2 });
cases.push({ name: 'v2-except-offset-small', why: 'every 4 except every 8, read on year index + 2: the leap day falls in index 2, 10, 18, -6 (Y = 4, 12, 20, -4) and not in index 6, 14, -2 (Y = 8, 16, 0)', value: small, valid: true, steps: stepsOf(small, [40, 60, 61, 80, 140, 141, 160, 180, 181, 200, 221, 222, 300, 301, 380, 381, 382, 383, -20, -21, -40, -41, -60, -61, -101, -102, -121]) });
const v1keys = { ...small, version: 1 };
cases.push({ name: 'v1-ignores-leap-keys', why: 'a version-1 value carrying except and offset reads them as unknown keys: the plain rule, every 4 from index 0', value: v1keys, valid: true, steps: stepsOf(v1keys, [20, 40, 41, 80, 81, 100]) });
cases.push({ name: 'refuse-version', why: 'version is neither 1 nor 2', value: { version: 3, grain: 'day', bundles: { months: { names: ['Frost', 'Thaw'], lengths: [10, 10] } } }, valid: false });
for (const [name, extra, why] of [
  ['refuse-except-not-chain', { except: [100, 250] }, 'an except that is not a multiple of the one before'],
  ['refuse-except-descending', { except: [400, 100] }, 'an except list not ascending'],
  ['refuse-except-not-multiple', { except: [6] }, 'an except that is not a multiple of every_years'],
  ['refuse-except-equal-period', { except: [4] }, 'an except not larger than every_years (every 4, not every 4: a rule that selects no year)'],
  ['refuse-except-not-list', { except: 100 }, 'except present and not a list'],
  ['refuse-offset-fraction', { offset: 0.5 }, 'an offset that is not a whole number'],
]) cases.push({ name, why, value: leapEntry(extra), valid: false });
cases.push({ name: 'refuse-offset-without-period', why: 'offset on an entry with no every_years', value: { ...base, intercalary: [{ name: 'Leap', after_month: 2, offset: 1 }] }, valid: false });
const temper = { version: 1, grain: 'year', eras: [{ name: 'After', abbrev: 'AF', start: 0 }, { name: 'Before', abbrev: 'BF', start: 0, direction: 'down' }] };
cases.push({ name: 'era-up-skips-down', why: 'an up era with no end runs to the next up era\'s start and skips a down era: listed before a down era with the same pivot, it still holds every step from 0 (it was empty before the amendment)', value: temper, valid: true, steps: stepsOf(temper, [-2, -1, 0, 5, 100]) });
const overlap = { version: 1, grain: 'month', bundles: { year: { steps: 10 } }, eras: [{ name: 'Rise', start: 0 }, { name: 'Toward', abbrev: 'TW', start: 100, direction: 'down' }] };
cases.push({ name: 'era-overlap-down-later-start', why: 'a down era (pivot 100, no end) overlaps an up era from 0: the later start (the down era) wins below 100; from step 100 the up era holds again, its open end skipping the down era', value: overlap, valid: true, steps: stepsOf(overlap, [-1, 0, 50, 99, 100, 150]) });

writeFileSync(process.argv[2], JSON.stringify({ amends: 'profiles/calendar.fixture.json: replaces refuse-version and era-overlap-down-later-start, adds the rest', generated_by: 'sdk scripts/calendar-fixture-cases.mjs', cases }, null, 1) + '\n');
console.log(cases.length, 'cases;', cases.reduce((n, c) => n + (c.steps?.length ?? 0), 0), 'steps');
