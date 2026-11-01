// The record profile (schema-dist profiles/record.md, serial 102): a game's run kept in the world its Characters
// live in. The run is an Event carrying the mark x_record ({tool, played_at, version?, seed?, outcome?, seats?}),
// the game's own tally beside it under its own prefix; who took part is the Event's `characters` alone; a Narrative
// that lists the Event in `events` and names a Character as protagonist or narrator is that Character's story of
// it. A run or a story still proposed (the review profile's x_review_proposed, any value but null) is not read until
// a keeper settles it. `recordsOf` reads the elements as the reader is served them; the fixture,
// profiles/record.fixture.json, is this file's own test. The Python package's `records_of` gives the same answers.

import { byCodePoint } from './lens';

/** The Event's field that carries the record's mark. */
export const RECORD_FIELD = 'x_record';

/** A record's mark as read: the required two as written, each optional member null when unset, seats an object. */
export interface OwRecordMark {
  /** The game, in the tools list's id form (`[a-z0-9-]`, 1 to 32). */
  tool: string;
  /** When the run was played: RFC 3339 in UTC, real time (never world time). */
  played_at: string;
  /** The engine's version; with `seed`, the replay. */
  version: string | null;
  /** The run's seed, a string. */
  seed: string | null;
  /** One lowercase word the game chose (`won`, `lost`, `sunk`), 1 to 24 letters. */
  outcome: string | null;
  /** Character id to the seat in the game's own words; decoration, never who took part. */
  seats: Record<string, string>;
}

/** One Character's story of a record: about them (`protagonist`), told by them (`narrator`), or both. */
export interface OwRecordStory {
  id: string;
  name: string;
  as: 'protagonist' | 'narrator' | 'both';
}

/** One record of a Character, as `recordsOf` reads it. */
export interface OwRecord {
  event: { id: string; name: string };
  tool: string;
  played_at: string;
  version: string | null;
  seed: string | null;
  outcome: string | null;
  /** This Character's seat, when the mark names one for them. */
  seat: string | null;
  /** Their stories of this run, in code point order of their ids. */
  stories: OwRecordStory[];
}

const TOOL = /^[a-z0-9-]{1,32}$/;
const PLAYED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/;
const OUTCOME = /^[a-z]{1,24}$/;

type Body = Record<string, unknown>;
const isObject = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);
const unsetOr = (v: unknown, test: (v: unknown) => boolean): boolean => v === undefined || v === null || test(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// Code point order, as the page says: JavaScript's < is UTF-16 order, which differs above the BMP.
const cp = byCodePoint;
/** A real calendar instant: month 1 to 12, the day within its month (leap years Gregorian), hour 0 to 23, minute and
 * second 0 to 59. Date.parse rolls 02-30 into March and takes 24:00, so the parts are checked here, as Python's are. */
function isInstant(s: string): boolean {
  const m = PLAYED_AT.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return days !== undefined && d >= 1 && d <= days && h <= 23 && mi <= 59 && se <= 59 && y >= 1;
}
const proposed = (el: Body): boolean => el.x_review_proposed !== undefined && el.x_review_proposed !== null;

/**
 * The record's mark on an element, read: the mark when the element is an Event whose `x_record` has the profile's
 * shape, else null. A broken writer never shows as a record: a missing or malformed `tool` or `played_at`, or an
 * optional member that is anything but its kind, null or absent, is no mark.
 */
export function recordMarkOf(element: unknown): OwRecordMark | null {
  if (!isObject(element) || element.type !== 'event') return null;
  const m = element[RECORD_FIELD];
  if (!isObject(m)) return null;
  if (!isString(m.tool) || !TOOL.test(m.tool)) return null;
  if (!isString(m.played_at) || !isInstant(m.played_at)) return null;
  if (!unsetOr(m.version, isString)) return null;
  if (!unsetOr(m.seed, isString)) return null;
  if (!unsetOr(m.outcome, (v) => isString(v) && OUTCOME.test(v))) return null;
  if (!unsetOr(m.seats, (v) => isObject(v) && Object.values(v).every(isString))) return null;
  return {
    tool: m.tool,
    played_at: m.played_at,
    version: (m.version as string | null | undefined) ?? null,
    seed: (m.seed as string | null | undefined) ?? null,
    outcome: (m.outcome as string | null | undefined) ?? null,
    seats: m.seats ? { ...(m.seats as Record<string, string>) } : {},
  };
}

/**
 * A Character's records in a world: every Event with the record mark whose `characters` names them, newest first by
 * `played_at` (ties by the Event's id in code point order), each with the stories that are theirs. An id no record
 * names, or one in no element, reads an empty list. `elements` is the world as this reader is served it.
 */
export function recordsOf(characterId: string, elements: readonly unknown[]): OwRecord[] {
  if (typeof characterId !== 'string') throw new TypeError('recordsOf: characterId must be a string');
  if (!Array.isArray(elements)) throw new TypeError('recordsOf: elements must be an array');
  // This Character's stories, by each Event they name (once per Narrative, however often it names it): one pass over
  // the world, then a lookup per record, where each record rescanned the whole world through 4.124.0.
  const storiesOf = new Map<unknown, OwRecordStory[]>();
  for (const n of elements) {
    if (!isObject(n) || n.type !== 'narrative' || proposed(n)) continue;
    const p = n.protagonist === characterId;
    const r = n.narrator === characterId;
    if (!p && !r) continue;
    const story: OwRecordStory = { id: n.id as string, name: isString(n.name) ? n.name : '', as: p && r ? 'both' : p ? 'protagonist' : 'narrator' };
    for (const e of new Set(list(n.events))) {
      const at = storiesOf.get(e);
      if (at) at.push(story); else storiesOf.set(e, [story]);
    }
  }
  const out: OwRecord[] = [];
  for (const ev of elements) {
    const mark = recordMarkOf(ev);
    if (!mark || proposed(ev as Body) || !list((ev as Body).characters).includes(characterId)) continue;
    const id = (ev as Body).id as string;
    const stories: OwRecordStory[] = (storiesOf.get(id) ?? []).map((s) => ({ ...s }));
    stories.sort((a, b) => cp(a.id, b.id));
    const name = (ev as Body).name;
    out.push({
      event: { id, name: isString(name) ? name : '' },
      tool: mark.tool,
      played_at: mark.played_at,
      version: mark.version,
      seed: mark.seed,
      outcome: mark.outcome,
      seat: isString(mark.seats[characterId]) ? mark.seats[characterId] : null,
      stories,
    });
  }
  out.sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at) || cp(a.event.id, b.event.id));
  return out;
}
