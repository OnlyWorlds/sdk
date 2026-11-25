/**
 * World calendars: the calendar kernel, and which calendars a world holds.
 *
 * `calendar.ts` beside this file came from Atlas's `src/core/calendar.ts` in 4.20.0, and is
 * the one copy since Atlas 245aad3 deleted its own and imports this one:
 * a kernel change is an SDK release, and Atlas's 48 kernel tests run against it there too.
 * Its contract is still Atlas's calendar design, §5 and §5b. This file adapts Atlas's
 * `src/core/calendar-lens.ts` (readCalendarValue, worldCalendars, and its resolveCalendarLens as resolveCalendar) to
 * any element shape, since the SDK has no Atlas `Element`.
 *
 * The field: a calendar is an element (a Construct by convention) carrying `atlas_calendar`.
 * Atlas owns the field, its meaning and its writes (its calendar design, §5 and §5b); every
 * other tool reads it and never writes it (a prefix names the owner, not
 * who may read). Detection keys on the field's presence, never on the supertype.
 * Everything degrades to bare numbers: a missing, dangling or malformed calendar is null,
 * never an error.
 */

import { readCalendarConfig, type CalendarConfig } from './calendar';
import { refuseUnknownOptions } from '../options';

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
 * stays null. With several calendars and no choice, nothing is guessed. An unknown option is a
 * TypeError (the caller's bug, not the world's data).
 */
export function resolveCalendar(
  elements: Iterable<OwCalendarElement>,
  activeId: string | null | undefined,
  opts?: { fallbackToOnly?: boolean },
): WorldCalendar | null {
  refuseUnknownOptions('resolveCalendar', opts, ['fallbackToOnly']);
  if (activeId === undefined && opts?.fallbackToOnly) {
    const all = worldCalendars(elements);
    return all.length === 1 ? all[0] : null;
  }
  if (!activeId) return null;
  return worldCalendars(elements).find((c) => c.id === activeId) ?? null;
}

/** The World's key that names its calendar: the id of the element that carries it. */
export const WORLD_CALENDAR_KEY = 'x_calendar';

/**
 * The calendar the world's dates speak in, by the World's own choice (the calendar profile,
 * "Which calendar speaks"). `world` is the World's keys (the body `GET /world` returns,
 * `world.json` in a folder); `elements` are the world's elements.
 *
 * - The World names, in `x_calendar`, the id of an element among `elements` that carries a
 *   calendar: that calendar speaks. The id is matched as written, letter case included.
 * - The World names anything else (an id no element has, an element with no calendar or one whose
 *   value is not a calendar, an empty string, a value that is no string): none speaks, and the
 *   dates stay bare numbers. Another calendar never speaks in its place.
 * - The World names none (the key absent or `null`): the only calendar among `elements` speaks;
 *   with several, none.
 *
 * Pass the whole world's elements: a reader that holds part of a world can miss the named
 * element or a second calendar. A tool with a person in front of it may keep that person's own
 * pick over the World's ({@link resolveCalendar}). A `world` that is not an object is a TypeError.
 *
 * `world` is typed `object` so that any World a caller holds is taken: `OwWorldMeta`, a lens or
 * strand world, or an interface of the caller's own, which TypeScript does not assign to a record type.
 */
export function speakingCalendar(
  world: object,
  elements: Iterable<OwCalendarElement>,
): WorldCalendar | null {
  if (world === null || typeof world !== 'object' || Array.isArray(world)) {
    throw new TypeError('speakingCalendar: world must be the World\'s keys, an object');
  }
  const named = Object.prototype.hasOwnProperty.call(world, WORLD_CALENDAR_KEY)
    ? (world as Readonly<Record<string, unknown>>)[WORLD_CALENDAR_KEY]
    : undefined;
  if (named === undefined || named === null) return resolveCalendar(elements, undefined, { fallbackToOnly: true });
  return typeof named === 'string' ? resolveCalendar(elements, named) : null;
}

/**
 * The old name of {@link resolveCalendar}, with the same answers: "lens" now names a cut of a
 * world, not a chosen calendar.
 *
 * @deprecated Since 4.85.0. Use `resolveCalendar`; this name leaves in 5.0.
 */
export function resolveCalendarLens(
  elements: Iterable<OwCalendarElement>,
  activeId: string | null | undefined,
  opts?: { fallbackToOnly?: boolean },
): WorldCalendar | null {
  refuseUnknownOptions('resolveCalendarLens', opts, ['fallbackToOnly']);
  return resolveCalendar(elements, activeId, opts);
}
