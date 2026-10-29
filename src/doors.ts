// The door history of an element: which tools wrote it, newest first, each with the time of its last
// write there. The API serves every element a `doors` field (to a world's members only): one key per
// tool that wrote it, the name the tool sent in `X-OW-Client` or else the door word of that write
// (`site`, `api`, `mcp`, ...), each value the `updated_at` that write left. Pure and DOM-free: a UI's
// "Last shaped in Atlas" line reads the first entry, a trail reads them all, doorWhere gives an entry's
// "in Atlas", and the Python package's doors_of and door_where answer the shared fixture,
// test/fixtures/doors.fixture.json, the same way.

import type { OwTool } from './openers';
import { TOOLS } from './tools.generated';
import { isAgentDoor, type OwWriteDoor } from './v2/types';

/** One tool that wrote an element, as `doorsOf` reads it. */
export interface OwDoor {
  /** The key: the tool's client name (`X-OW-Client`), or the door word of a write that named no client (`site`, `api`, `mcp`, `seat`, `declared`, `v1`, `sync`, `server`). */
  door: string;
  /** The time of this door's last write, exactly as served (ISO 8601 with an offset). */
  at: string;
  /** The tools list's row whose `client` is `door`, as its `id` and `name`; null for a door word or a client the list does not hold. */
  tool: { id: string; name: string } | null;
  /** True on the one entry whose `at` is the element's `updated_at`: the door of its last write. */
  last: boolean;
  /** `doors` when the entry comes from the `doors` field; `last-write` when it is read from `changed_client` or `changed_via` and `updated_at`, for an element without `doors`. */
  from: 'doors' | 'last-write';
}

/** A time as an instant: whole seconds since 1970-01-01T00:00:00Z, and the fraction's digits with trailing zeros cut. */
interface Instant {
  seconds: number;
  fraction: string;
}

const TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|([+-])([0-9]{2}):([0-9]{2}))$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const fail = (what: string): never => {
  throw new TypeError(`doorsOf: ${what}`);
};

/** Days from 1970-01-01 to a date of the proleptic Gregorian calendar. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The instant a time names, or null when it is not one: `YYYY-MM-DDTHH:MM:SS`, an optional fraction, then `Z` or `+HH:MM`/`-HH:MM`. */
function instantOf(value: unknown): Instant | null {
  if (typeof value !== 'string') return null;
  const m = TIME.exec(value);
  if (m === null) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (day < 1 || day > (month === 2 && leap ? 29 : MONTH_DAYS[month - 1])) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  let offset = 0;
  if (m[8] !== 'Z') {
    const oh = Number(m[10]);
    const om = Number(m[11]);
    if (oh > 23 || om > 59) return null;
    offset = (m[9] === '-' ? -1 : 1) * (oh * 3600 + om * 60);
  }
  const seconds = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset;
  return { seconds, fraction: (m[7] ?? '').replace(/0+$/, '') };
}

/** Negative when `a` is earlier, positive when later, 0 for the same instant, at the fraction's full precision. */
function compareInstants(a: Instant, b: Instant): number {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const fa = a.fraction.padEnd(width, '0');
  const fb = b.fraction.padEnd(width, '0');
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

/** Two strings by Unicode code point (not UTF-16 code unit, not locale). */
function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a, (c) => c.codePointAt(0) as number);
  const cb = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    if (ca[i] !== cb[i]) return ca[i] < cb[i] ? -1 : 1;
  }
  return ca.length - cb.length;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Which tools wrote `element`, newest first: one entry per key of its `doors` field, each `{ door, at,
 * tool, last, from }`. Returns data only, no words or formatted dates; a UI's "Last shaped in Atlas" line
 * reads the first entry, a trail reads them all.
 *
 * - From `doors`: every key that is a non-empty string, with a value that is a time, is an entry
 *   (`from: 'doors'`, `at` the value as served). An entry that is not one is skipped, never thrown on.
 * - Order: newest first, times compared as instants at their full precision (an offset and the
 *   microseconds count; never as strings). Entries at the same instant go by key, by Unicode code point.
 * - Without `doors`, or with no valid entry in it: one entry from the last write, its door
 *   `changed_client` if that is a non-empty string, else `changed_via`; `at` is `updated_at`, `from` is
 *   `last-write`. With neither door, or no valid `updated_at`, the result is empty: a public reader,
 *   served none of these fields, gets `[]`.
 * - `tool`: the first row of `tools` whose `client` is the door, as `{ id, name }`; else null.
 * - `last`: true on the first entry whose `at` is the same instant as `updated_at`, false on the rest.
 *   When no entry is `last`, the last write came through no door the field records: the server moves
 *   `updated_at` on a restore or a scrub, which no door writes. Without a valid `updated_at`, no entry is
 *   `last`.
 *
 * A time is `YYYY-MM-DDTHH:MM:SS`, an optional `.` and fraction digits, then `Z` or `+HH:MM`/`-HH:MM`,
 * with a real calendar date and clock; anything else is not one. Who wrote it is the caller's: compare
 * `changed_by` with the reader's membership for "by you" on the `last` entry.
 *
 * A TypeError when `element` is not an object (null, an array, a string) or `tools` is not an array;
 * nothing else throws. `tools` defaults to `TOOLS`, the tools list baked into this release.
 */
export function doorsOf(element: object, tools: readonly OwTool[] = TOOLS): OwDoor[] {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) fail('the element is an object, as the API serves it');
  if (!Array.isArray(tools)) fail('tools is the tools list\'s rows, an array');
  const e = element as Record<string, unknown>;
  const toolOf = (door: string): OwDoor['tool'] => {
    const row = tools.find((r) => r !== null && typeof r === 'object' && r.client === door);
    return row === undefined ? null : { id: row.id, name: row.name };
  };

  const found: { door: string; at: string; instant: Instant }[] = [];
  const doors = e.doors;
  if (doors !== null && typeof doors === 'object' && !Array.isArray(doors)) {
    for (const [door, at] of Object.entries(doors as Record<string, unknown>)) {
      const instant = instantOf(at);
      if (door.length > 0 && instant !== null) found.push({ door, at: at as string, instant });
    }
  }
  const updated = instantOf(e.updated_at);
  if (found.length === 0) {
    const door = nonEmpty(e.changed_client) ? e.changed_client : nonEmpty(e.changed_via) ? e.changed_via : null;
    if (door === null || updated === null) return [];
    return [{ door, at: e.updated_at as string, tool: toolOf(door), last: true, from: 'last-write' }];
  }

  found.sort((a, b) => compareInstants(b.instant, a.instant) || compareCodePoints(a.door, b.door));
  let lastSeen = false;
  return found.map(({ door, at, instant }) => {
    const last = !lastSeen && updated !== null && compareInstants(instant, updated) === 0;
    if (last) lastSeen = true;
    return { door, at, tool: toolOf(door), last, from: 'doors' };
  });
}

/**
 * Where an entry of `doorsOf` wrote the element, as the words a UI shows after "Last shaped": the
 * where-phrase only.
 *
 * - A listed tool (`tool` not null): `in <tool.name>`, such as `in Atlas`. This comes first, so a door
 *   word the case's tools list holds as a client reads as that tool.
 * - `site`: `on onlyworlds.com`.
 * - An agent's door (`isAgentDoor`: `seat`, `mcp`, `declared`): `with an AI`.
 * - `server`: `by OnlyWorlds`.
 * - Anything else (`sync`, `api`, `v1`, a client the tools list does not hold, such as `sdk`): `in code`.
 *
 * Nothing about the reader or the time: "by you" and when are the caller's. A TypeError when `door` is
 * not an object, its `door` is not a string, or its `tool` is neither null nor an object with a string
 * `name`. The Python package's `door_where` gives the same words on the shared fixture.
 */
export function doorWhere(door: OwDoor): string {
  if (door === null || typeof door !== 'object' || Array.isArray(door)) throw new TypeError('doorWhere: the door is an entry of doorsOf, an object');
  if (typeof door.door !== 'string') throw new TypeError('doorWhere: the entry\'s door is a string');
  const tool: unknown = door.tool;
  if (tool != null) {
    if (typeof tool !== 'object' || typeof (tool as { name?: unknown }).name !== 'string') throw new TypeError('doorWhere: the entry\'s tool is null or { id, name }');
    return `in ${(tool as { name: string }).name}`;
  }
  if (door.door === 'site') return 'on onlyworlds.com';
  if (isAgentDoor(door.door as OwWriteDoor)) return 'with an AI';
  if (door.door === 'server') return 'by OnlyWorlds';
  return 'in code';
}
