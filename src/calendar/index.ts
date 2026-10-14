/**
 * World calendars: the calendar kernel, and which calendars a world holds.
 *
 * `calendar.ts` beside this file came from Atlas's `src/core/calendar.ts` in 4.20.0, and is
 * the one copy since Atlas 245aad3 deleted its own and imports this one (Temper, h37 #4472):
 * a kernel change is an SDK release, and Atlas's 48 kernel tests run against it there too.
 * Its contract is still Atlas's calendar design, §5 and §5b. This file adapts Atlas's
 * `src/core/calendar-lens.ts` (readCalendarValue, worldCalendars, resolveCalendarLens) to
 * any element shape, since the SDK has no Atlas `Element`.
 *
 * The field: a calendar is an element (a Construct by convention) carrying `atlas_calendar`.
 * Atlas owns the field, its meaning and its writes (its calendar design, §5 and §5b); every
 * other tool reads it and never writes it (Skeld, h37 #4286: a prefix names the owner, not
 * who may read). Detection keys on the field's presence, never on the supertype.
 * Everything degrades to bare numbers: a missing, dangling or malformed calendar is null,
 * never an error.
 */

import { readCalendarConfig, type CalendarConfig } from './calendar';

export * from './calendar';

/** The supertype Atlas gives a calendar Construct: convention and display only. */
export const CALENDAR_SUPERTYPE = 'calendar';

/** Atlas's field for a calendar's config (owned by Atlas: read it, never write it). */
export const CALENDAR_FIELD = 'atlas_calendar';

/** Any element: an id, a name, and the rest of its fields. */
export interface OwCalendarElement {
  id: string;
  name?: string | null;
  [field: string]: unknown;
}

export interface WorldCalendar {
  /** The calendar element's id. */
  id: string;
  /** The element's name: the calendar's display name. */
  name: string;
  config: CalendarConfig;
}

/**
 * The tolerant `atlas_calendar` read: an object or a JSON string (another tool may
 * serialize it; Atlas writes objects). Null for anything unusable. Read the field only
 * through this: a reader that took objects alone would blank a string config.
 */
export function readCalendarValue(raw: unknown): CalendarConfig | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  return readCalendarConfig(value);
}

/**
 * Every usable calendar in the world: the elements with a valid `atlas_calendar`.
 * A malformed config is skipped: a broken calendar is invisible, not an error.
 */
export function worldCalendars(elements: Iterable<OwCalendarElement>): WorldCalendar[] {
  const out: WorldCalendar[] = [];
  for (const el of elements) {
    const config = readCalendarValue(el[CALENDAR_FIELD]);
    if (!config) continue;
    out.push({ id: el.id, name: el.name || '(unnamed calendar)', config });
  }
  return out;
}

/**
 * Resolve a chosen calendar id against the elements. A null id, a dangling id or an
 * invalid config resolve to null: bare numbers.
 *
 * `fallbackToOnly`: when no calendar was ever chosen (`activeId` is `undefined`, not
 * `null`) and the world holds exactly one, use it. `null` is an explicit "no calendar" and
 * stays null. With several calendars and no choice, nothing is guessed.
 */
export function resolveCalendarLens(
  elements: Iterable<OwCalendarElement>,
  activeId: string | null | undefined,
  opts?: { fallbackToOnly?: boolean },
): WorldCalendar | null {
  if (activeId === undefined && opts?.fallbackToOnly) {
    const all = worldCalendars(elements);
    return all.length === 1 ? all[0] : null;
  }
  if (!activeId) return null;
  return worldCalendars(elements).find((c) => c.id === activeId) ?? null;
}
