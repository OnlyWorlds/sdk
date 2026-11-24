/**
 * `@onlyworlds/sdk/calendar`: the calendar names as one file with no import, for a page with no build step. Held
 * here: the built file imports nothing (so nothing bare, and no chunk beside it), its declarations import nothing,
 * every name in it is a name of the main entry, and the two answer the same. Runs against the compiled bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as root from '../dist/index.js';
import * as calendar from '../dist/calendar.js';

const read = (name) => readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the package names the entry, with its types, for every resolution', () => {
  assert.deepEqual(pkg.exports['./calendar'], { types: './dist/calendar.d.ts', import: './dist/calendar.js' });
  assert.deepEqual(pkg.typesVersions['*'].calendar, ['dist/calendar.d.ts']);
});

test('dist/calendar.js is one file: no import, static or dynamic, and no export from another file', () => {
  const js = read('calendar.js');
  assert.equal(js.match(/^\s*import\s/gm), null, 'a static import');
  assert.equal(js.match(/\bimport\s*\(/g), null, 'a dynamic import');
  assert.equal(js.match(/\bfrom\s*['"]/g), null, 'an import or an export from another file');
  assert.equal(js.match(/\brequire\s*\(/g), null, 'a require');
  assert.ok(js.length < 60000, `${js.length} characters: the entry grew past a calendar`);
});

test('dist/calendar.d.ts imports nothing either', () => {
  const dts = read('calendar.d.ts');
  assert.equal(dts.match(/^\s*import\s/gm), null);
  assert.equal(dts.match(/\bfrom\s*['"]/g), null);
});

test('every name of the entry is a name of the main entry, of the same kind', () => {
  const names = Object.keys(calendar).sort();
  assert.ok(names.length >= 29, `${names.length} names`);
  for (const name of names) {
    assert.ok(name in root, `${name} is not in the main entry`);
    assert.equal(typeof calendar[name], typeof root[name], name);
  }
  for (const name of ['formatStep', 'parseDate', 'breakdownStep', 'readCalendarConfig', 'validateCalendarConfig', 'worldCalendars', 'resolveCalendar']) {
    assert.equal(typeof calendar[name], 'function', name);
  }
  assert.equal(calendar.CALENDAR_SUPERTYPE, root.CALENDAR_SUPERTYPE);
  assert.equal(calendar.CALENDAR_FIELD, root.CALENDAR_FIELD);
});

const CONFIG = {
  version: 1,
  grain: 'day',
  eras: [
    { name: 'Old Count', abbrev: 'OC', start: -3600, restart: true, closed: true },
    { name: 'Freehold Tally', abbrev: 'FT', start: 0, restart: true },
  ],
  bundles: {
    months: {
      names: ['Sowmarch', 'Thistlewane', 'Greening', 'Suncrest', 'Longhay', 'Ashfall', 'Rootdeep', 'Frostwake', 'Bellmoot', 'Hearthtide', 'Graytide', 'Coldmark'],
      lengths: [30, 28, 32, 30, 31, 29, 30, 28, 32, 30, 29, 31],
    },
    week: { length: 6, names: ['Ondel', 'Tresk', 'Mireth', 'Aldun', 'Volk', 'Hearth'], mode: 'free' },
  },
  format: '{day} {month}, Year {year} {era}',
};

test('the entry and the main entry answer the same: a calendar read, and every step of eleven years said and read back', () => {
  assert.deepEqual(calendar.validateCalendarConfig(CONFIG), root.validateCalendarConfig(CONFIG));
  assert.deepEqual(calendar.validateCalendarConfig({ version: 1 }), root.validateCalendarConfig({ version: 1 }));
  let said = 0;
  for (let step = -3700; step <= 360; step++) {
    const a = calendar.formatStep(CONFIG, step);
    assert.equal(a, root.formatStep(CONFIG, step), `step ${step}`);
    assert.deepEqual(calendar.breakdownStep(CONFIG, step), root.breakdownStep(CONFIG, step), `step ${step}`);
    assert.deepEqual(calendar.parseDate(CONFIG, a), root.parseDate(CONFIG, a), `step ${step}: ${a}`);
    if (a !== '') said++;
  }
  assert.ok(said > 4000, `${said} steps said`);
  assert.equal(calendar.formatStep(CONFIG, 0), '1 Sowmarch, Year 1 FT');
});

test('worldCalendars reads the same Constructs from either entry', () => {
  const elements = [
    { type: 'construct', id: 'c1', name: 'The Tally', supertype: calendar.CALENDAR_SUPERTYPE, [calendar.CALENDAR_FIELD]: CONFIG },
    { type: 'construct', id: 'c2', name: 'Not one', supertype: 'Guide' },
    { type: 'character', id: 'k', name: 'Kira' },
  ];
  assert.deepEqual(calendar.worldCalendars(elements), root.worldCalendars(elements));
});
