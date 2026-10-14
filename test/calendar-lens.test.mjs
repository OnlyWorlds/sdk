/**
 * Which calendars a world holds: Atlas's tests/unit/calendar-lens.test.ts, its three
 * portable blocks (worldCalendars, readCalendarValue, resolveCalendarLens), on plain
 * elements. Atlas's chart-store and registry blocks stay in Atlas.
 */
import { describe, it, expect } from './expect.mjs';
import { worldCalendars, resolveCalendarLens, readCalendarValue, CALENDAR_FIELD } from '../dist/index.js';

const CONFIG = {
  version: 1,
  grain: 'year',
  eras: [{ name: 'Third Age', abbrev: 'TA', start: 0 }],
  format: '{year} {era}',
};

describe('worldCalendars', () => {
  it('detects by atlas_calendar presence, never by supertype', () => {
    const elements = [
      { id: 'c1', type: 'construct', name: 'Imperial Reckoning', supertype: 'calendar', atlas_calendar: CONFIG },
      // a lore-only "Calendar" Construct: no config, so no calendar
      { id: 'c2', type: 'construct', name: 'The Old Calendar', supertype: 'Calendar' },
      // a config on another type still counts: presence is the whole rule
      { id: 'c3', type: 'phenomenon', name: 'Tide Count', atlas_calendar: CONFIG },
    ];
    expect(worldCalendars(elements).map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(CALENDAR_FIELD).toBe('atlas_calendar');
  });
  it('accepts a JSON-string config and skips malformed ones', () => {
    const elements = [
      { id: 's1', type: 'construct', name: 'Stringy', atlas_calendar: JSON.stringify(CONFIG) },
      { id: 's2', type: 'construct', name: 'Broken', atlas_calendar: '{not json' },
      { id: 's3', type: 'construct', name: 'Wrong shape', atlas_calendar: { version: 9 } },
    ];
    expect(worldCalendars(elements).map((c) => c.id)).toEqual(['s1']);
  });
  it('names an unnamed calendar, and takes any iterable', () => {
    const found = worldCalendars(new Set([{ id: 'u1', name: '', atlas_calendar: CONFIG }]));
    expect(found[0].name).toBe('(unnamed calendar)');
  });
});

describe('readCalendarValue', () => {
  it('reads objects and JSON strings identically, null for junk', () => {
    expect(readCalendarValue(CONFIG)?.grain).toBe('year');
    expect(readCalendarValue(JSON.stringify(CONFIG))?.grain).toBe('year');
    expect(readCalendarValue(JSON.stringify(CONFIG))?.eras?.[0].name).toBe('Third Age');
    expect(readCalendarValue('{not json')).toBe(null);
    expect(readCalendarValue(null)).toBe(null);
    expect(readCalendarValue(42)).toBe(null);
  });
});

describe('resolveCalendarLens', () => {
  const elements = [{ id: 'c1', type: 'construct', name: 'Imperial', atlas_calendar: CONFIG }];
  it('resolves a live id and degrades dangling or null to bare numbers', () => {
    expect(resolveCalendarLens(elements, 'c1')?.name).toBe('Imperial');
    expect(resolveCalendarLens(elements, 'gone')).toBe(null);
    expect(resolveCalendarLens(elements, null)).toBe(null);
    expect(resolveCalendarLens([], 'c1')).toBe(null);
  });
  it('falls back to the only calendar when none was ever chosen', () => {
    expect(resolveCalendarLens(elements, undefined, { fallbackToOnly: true })?.name).toBe('Imperial');
  });
  it('respects an explicit no-calendar choice even when one exists', () => {
    expect(resolveCalendarLens(elements, null, { fallbackToOnly: true })).toBe(null);
  });
  it('does not guess when the world has more than one calendar', () => {
    const two = [...elements, { id: 'c2', type: 'construct', name: 'Guild', atlas_calendar: CONFIG }];
    expect(resolveCalendarLens(two, undefined, { fallbackToOnly: true })).toBe(null);
  });
  it('is opt-in: without fallbackToOnly an unchosen calendar stays bare numbers', () => {
    expect(resolveCalendarLens(elements, undefined)).toBe(null);
  });
});
