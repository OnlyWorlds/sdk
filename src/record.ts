// The record profile (schema-dist profiles/record.md, serial 102): a game's run kept in the world its Characters
// live in. The run is an Event carrying the mark x_record ({tool, played_at, version?, seed?, outcome?, seats?}),
// the game's own tally beside it under its own prefix; who took part is the Event's `characters` alone; a Narrative
// that lists the Event in `events` and names a Character as protagonist or narrator is that Character's story of
// it. A run or a story the review profile reads as proposed (proposedMarkOf: an empty mark is settled; serial 103) is
// not read until a keeper settles it. `played_at` is read by the message page's grammar (message.ts's timeKey, serial
// 123), never a grammar of its own. `recordsOf` reads the elements as the reader is served them; the fixture,
// profiles/record.fixture.json, is this file's own test. The Python package's `records_of` gives the same answers.

import { byCodePoint, compareKeys, timeKey } from './message';
import { proposedMarkOf } from './review';

/** The Event's field that carries the record's mark. */
export const RECORD_FIELD = 'x_record';

/** A record's mark as read: the required two as written, each optional member null when unset, seats an object. */
export interface OwRecordMark {
  /** The game, in the tools list's id form (`[a-z0-9-]`, 1 to 32). */
  tool: string;
  /** When the run was played, as written: real time (never world time), a time the message grammar reads (`instantOf`). */
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
const OUTCOME = /^[a-z]{1,24}$/;

type Body = Record<string, unknown>;
const isObject = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);
const unsetOr = (v: unknown, test: (v: unknown) => boolean): boolean => v === undefined || v === null || test(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// Code point order, as the page says: JavaScript's < is UTF-16 order, which differs above the BMP.
const cp = byCodePoint;
/**
 * `played_at` read by the message page's grammar (serial 123: one grammar for a time, `instantOf`'s), as [whole
 * seconds, milliseconds] for the record's order to the millisecond (a fraction truncated past three digits); null
 * when it cannot be read, which is no mark. Never Date.parse: it reads a time with no zone as local time.
 */
function playedKey(s: string): [number, number] | null {
  const key = timeKey(s);
  return key === null ? null : [key[0], Math.floor(key[1] / 1000)];
}
/** Proposed exactly when the review profile's reader says so (serial 103): an empty mark ({}, "", []) is settled. */
const proposed = (el: Body): boolean => proposedMarkOf(el) !== null;

/**
 * The record's mark on an element, read: the mark when the element is an Event whose `x_record` has the profile's
 * shape, else null. A broken writer never shows as a record: a missing or malformed `tool`, a `played_at` the
 * message page's grammar cannot read (`instantOf`'s, serial 123: seconds required, `T` and `Z` in either case, an
 * offset or no zone read), or an optional member that is anything but its kind, null or absent, is no mark.
 */
export function recordMarkOf(element: unknown): OwRecordMark | null {
  if (!isObject(element) || element.type !== 'event') return null;
  const m = element[RECORD_FIELD];
  if (!isObject(m)) return null;
  if (!isString(m.tool) || !TOOL.test(m.tool)) return null;
  if (!isString(m.played_at) || playedKey(m.played_at) === null) return null;
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
 * `played_at` read as an instant to the millisecond (a fraction truncated past three digits; ties by the Event's id in
 * code point order), each with the stories that are theirs. An id no record
 * names, or one in no element, reads an empty list. `elements` is the world as this reader is served it.
 */
export function recordsOf(characterId: string, elements: readonly unknown[]): OwRecord[] {
  if (typeof characterId !== 'string') throw new TypeError('recordsOf: characterId must be a string');
  if (!Array.isArray(elements)) throw new TypeError('recordsOf: elements must be an array');
  // This Character's stories, by each Event they name (once per Narrative, however often it names it): one pass over
  // the world, then a lookup per record, where each record rescanned the whole world through 4.124.0.
  const storiesOf = new Map<unknown, OwRecordStory[]>();
  for (const n of elements) {
    if (!isObject(n) || n.type !== 'narrative' || !isString(n.id) || proposed(n)) continue;
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
    // An Event or a Narrative whose id is not a string is never read (serial 103): no entry without an id.
    if (!mark || !isString((ev as Body).id) || proposed(ev as Body) || !list((ev as Body).characters).includes(characterId)) continue;
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
  out.sort((a, b) => compareKeys(playedKey(b.played_at) as [number, number], playedKey(a.played_at) as [number, number]) || cp(a.event.id, b.event.id));
  return out;
}
