// The report profile (schema-dist profiles/report.md, rule 9, serial 120): reports grouped into threads by their
// `parent_narrative`, read as written; and the talks a report is shown with (serial 135), read by room.ts's reader. A report is a Narrative with supertype `Report` and the room's mark; a board
// entry is a Narrative with supertype `Board` and the mark; both are room pairs, matched by room.ts's reader (the
// trim, the fold and the mark by presence), never a second copy. A thread is ordered by `created_at` as the message
// profile orders messages (message.ts). The fixture, profiles/report.fixture.json, is this file's own test.

import { fold, isRoomElement, isWhiteSpaceAt, namedTalks, trimWhiteSpace } from './room';
import type { OwTalk } from './room';
import { inCreatedOrder } from './message';
import { findOwLinks, type OwAddressReading } from './address';
import { refuseUnknownOptions } from './options';

/** What a report's parent is: none served, a report, a board entry, an id whose element is not held, another element, or the report itself. */
export type OwReportParentKind = 'none' | 'report' | 'board' | 'missing' | 'other' | 'self';

/** One group: the parent's id, whether it is a report (a thread) or a board entry (the talks under it), and the reports that name it, in rule 9's order. */
export interface OwReportGroup {
  parent: string;
  kind: 'report' | 'board';
  /** The ids of the reports that name the parent, by `created_at` (equal times keep the list's order; unreadable times last). The parent is not among them. */
  reports: string[];
}

/** A lint: `chain` on a report whose parent is a report that itself names another report; `self` on a report that names itself. */
export interface OwReportLint {
  kind: 'chain' | 'self';
  report: string;
}

/** `reportThreadsOf`'s answer. */
export interface OwReportThreads {
  /** For each report given, by its id, what its parent is. */
  parents: Record<string, OwReportParentKind>;
  /** One per parent that is a report or a board entry and that some report names; in no rule order. */
  groups: OwReportGroup[];
  /** In no rule order. */
  lints: OwReportLint[];
}

type Body = Record<string, unknown>;

/** The two room pairs this reader tells apart. */
const REPORT_PAIR = { type: 'narrative', supertype: 'Report' } as const;
const BOARD_PAIR = { type: 'narrative', supertype: 'Board' } as const;

const isBody = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `'report'` or `'board'` for a room element of that pair (the pair AND the mark), else null. */
function roomKindOf(el: Body | undefined): 'report' | 'board' | null {
  if (el === undefined || !isRoomElement(el as { type?: string; supertype?: string | null; x_room_of?: unknown })) return null;
  const type = fold(el.type as string);
  const supertype = fold(el.supertype as string);
  if (type === fold(REPORT_PAIR.type) && supertype === fold(REPORT_PAIR.supertype)) return 'report';
  if (type === fold(BOARD_PAIR.type) && supertype === fold(BOARD_PAIR.supertype)) return 'board';
  return null;
}

/** The parent's id as written, never trimmed; none when it is no string or is empty once trimmed (room.ts's White_Space trim). */
function parentOf(el: Body): string | null {
  const parent = el.parent_narrative;
  return typeof parent === 'string' && trimWhiteSpace(parent) !== '' ? parent : null;
}

/**
 * Reports grouped into threads (the report profile's rule 9). Give it the Narratives as the reader is served them,
 * in the order served. A report is a Narrative with supertype `Report` that carries the room's mark `x_room_of`
 * (`isRoomElement`); a board entry is one with supertype `Board` and the mark. Without the mark either is lore.
 *
 * Only reports are read as children: a message or any other element that names a report is in no part of the answer.
 *
 * `parents`: for each report, what its `parent_narrative` names: `none` (absent, null, not a string, or empty once
 * trimmed of White_Space, as the room profile trims; a parent with content is read as written, never trimmed),
 * `self`, `missing` (an id whose element is not in the list: a folder or an export without it, an id that dangles),
 * `report`, `board`, or `other` (any other element, a Narrative with supertype `Report` or `Board` and no mark
 * included; a stub is read as it is served: one without the mark reads `other`). `groups`: one per parent that is
 * a report or a board entry, the reports that name it ordered by `created_at` as an instant (equal times keep the
 * list's order; one that cannot be read as a date and time after every one that can), never by id or by the text
 * of the time. A report with no parent, or whose parent is missing, other or itself, is a thread of one and in no
 * group.
 * `lints`: `self` on a report that names itself; `chain` on a report whose parent is a report that itself names
 * another report the reader holds (with the mark). A report that names itself reads as naming no parent: it still
 * heads the group of the reports that name it, and none of them is a chain; nor is a report whose parent names an
 * id not held, or a Narrative with supertype `Report` and no mark. The reader never walks further up a chain:
 * such a report is shown under the parent it names. It never guesses a thread from names, days or text.
 *
 * Groups and lints come in no rule order (compare them as sets); the order inside a group is the rule's. Elements
 * that are not objects, or carry no non-empty string `id`, are skipped; of two with one id, the first is read.
 * A thread takes nothing away from where a report hangs: its `relations` and `events` still hold it. Pure.
 */
export function reportThreadsOf(narratives: readonly object[]): OwReportThreads {
  const parents: Record<string, OwReportParentKind> = {};
  const groups: OwReportGroup[] = [];
  const lints: OwReportLint[] = [];
  if (!Array.isArray(narratives)) return { parents, groups, lints };

  const byId = new Map<string, Body>();
  for (const el of narratives) {
    if (isBody(el) && typeof el.id === 'string' && el.id !== '' && !byId.has(el.id)) byId.set(el.id, el);
  }
  const reports = [...byId.values()].filter(el => roomKindOf(el) === 'report');

  const kindOf = (report: Body): OwReportParentKind => {
    const parent = parentOf(report);
    if (parent === null) return 'none';
    if (parent === report.id) return 'self';
    const target = byId.get(parent);
    if (target === undefined) return 'missing';
    return roomKindOf(target) ?? 'other';
  };

  const members = new Map<string, Body[]>();
  for (const report of reports) {
    const id = report.id as string;
    const kind = kindOf(report);
    // defineProperty, so an id such as __proto__ is a key like any other.
    Object.defineProperty(parents, id, { value: kind, enumerable: true, writable: true, configurable: true });
    if (kind === 'report' || kind === 'board') {
      const parent = parentOf(report) as string;
      const list = members.get(parent);
      if (list) list.push(report);
      else members.set(parent, [report]);
    }
    if (kind === 'self') lints.push({ kind: 'self', report: id });
    // A chain: the parent is a report whose own parent reads `report`. One that names itself reads `self`, as naming
    // no parent, so a report under it is no chain.
    if (kind === 'report' && kindOf(byId.get(parentOf(report) as string) as Body) === 'report') {
      lints.push({ kind: 'chain', report: id });
    }
  }
  for (const [parent, list] of members) {
    groups.push({
      parent,
      kind: roomKindOf(byId.get(parent)) as 'report' | 'board',
      reports: inCreatedOrder(list).map(r => r.id as string),
    });
  }
  return { parents, groups, lints };
}

/**
 * The talks a reader shows a report with (schema-dist profiles/report.md, serial 135): `{type: 'object', id}` for each id in
 * the report's `objects` and `{type: 'construct', id}` for each in its `constructs`, its entries read as the room profile reads
 * a line's (`talksOf`): an entry that is not a string, or is empty once trimmed of White_Space, names nothing, a field that is
 * not a list names nothing, and every other entry is an id as written, untrimmed and with its case; each once, in first
 * place, objects before constructs. A report is a Narrative with supertype `Report` and the room's mark `x_room_of`, both;
 * any other Narrative (a Report without the mark, a line in the room, a board entry) answers `[]`.
 *
 * These fields hold every Object and Construct the report touched or changed, so the answer is every talk it is shown with,
 * old reports included; none of them is named as the talk the report closed, which the report alone cannot tell. Pure.
 */
export function reportTalksOf(narrative: unknown): OwTalk[] {
  if (!isBody(narrative) || roomKindOf(narrative) !== 'report') return [];
  return namedTalks(narrative);
}

// ---- A line of `consequences` (the report profile's lines rulings: what a line is, its address, its shown words) ----

/** What `readReportLine` answers for one line of a report's `consequences`. */
export interface OwReportLine {
  /** The line as read. */
  line: string;
  /** The words a reader shows: the line without its address where nothing the writer wrote is lost, else the whole line. */
  words: string;
  /** The element the line names, written `ow://<type>/<id>` (the id lowercase), or null when no address in it names an element of this world. */
  address: string | null;
  /** What `parseOwLink` reads in the address as written, or null. */
  reading: OwAddressReading | null;
  /** Where the address stands in the line (JavaScript string indexes, as `findOwLinks` counts them), or null. */
  start: number | null;
  end: number | null;
}

/** The options `readReportLine` and `readReportLines` take. */
export interface OwReportLineOptions {
  /** This world's id, lowercase as the world holds it. An address's world is read lowercase (its hex in either case) and compared with this exactly; without it, only an address with no world names an element here. */
  world?: string | null;
}

const REPORT_LINE_KEYS = ['world'] as const;
/** The closing marks, character by character (the lines rulings: a `?` is no closing mark, since it starts a query after an address). */
const CLOSING: ReadonlySet<string> = new Set(['.', ',', ';', ':', '!', ')', ']', '}', "'", '"', '\u2019', '\u201d', '\u00bb']);
/** The pairs an address may stand in, each opener with its closer. */
const PAIRS: ReadonlyMap<string, string> = new Map([['(', ')'], ['[', ']'], ['"', '"'], ["'", "'"], ['\u201c', '\u201d'], ['\u2018', '\u2019'], ['\u00ab', '\u00bb']]);

function worldOption(fn: string, options: OwReportLineOptions | undefined): string | null {
  if (options !== undefined && (options === null || typeof options !== 'object')) throw new TypeError(`${fn}: options must be an object`);
  refuseUnknownOptions(fn, options, REPORT_LINE_KEYS);
  const world = options?.world ?? null;
  if (world !== null && typeof world !== 'string') throw new TypeError(`${fn}: world must be a string (this world's id) or null`);
  return world;
}

function trimEndWhiteSpace(text: string): string {
  let end = text.length;
  while (end > 0 && isWhiteSpaceAt(text, end - 1)) end--;
  return text.slice(0, end);
}

function trimStartWhiteSpace(text: string): string {
  let start = 0;
  while (start < text.length && isWhiteSpaceAt(text, start)) start++;
  return text.slice(start);
}

function readLine(line: string, world: string | null): OwReportLine {
  // The line's address: the last one that names an element of this world, from its text alone.
  const here = findOwLinks(line).filter(f => f.reading.type !== null && f.reading.id !== null
    && (f.reading.world === null || (!f.reading.worldIsSlug && world !== null && f.reading.world === world)));
  if (here.length === 0) return { line, words: line, address: null, reading: null, start: null, end: null };
  const { start, end, reading } = here[here.length - 1];
  const found = { line, words: line, address: `ow://${reading.type}/${reading.id}`, reading, start, end };
  // It leaves the words only when nothing the writer wrote is lost: canonical, no moment, no lens, standing apart.
  if (!reading.canonical || reading.moment !== null || reading.lens !== null) return found;
  let from = start;
  let to = end;
  const before = start > 0 ? line[start - 1] : '';
  if (PAIRS.has(before)) {
    // A matched pair goes with it; an opener not closed right after keeps the whole line.
    if (line[end] !== PAIRS.get(before)) return found;
    from = start - 1;
    to = end + 1;
  }
  const apartBefore = from === 0 || isWhiteSpaceAt(line, from - 1) || line[from - 1] === ':';
  const apartAfter = to === line.length || isWhiteSpaceAt(line, to) || CLOSING.has(line[to]);
  if (!apartBefore || !apartAfter) return found;
  // The White_Space on both sides goes, and one colon right before it with the White_Space before that colon.
  let left = trimEndWhiteSpace(line.slice(0, from));
  if (left.endsWith(':')) left = trimEndWhiteSpace(left.slice(0, -1));
  const right = trimStartWhiteSpace(line.slice(to));
  // Nothing stands before the address: the whole line stays, so a line never shows empty.
  if (left === '') return found;
  const words = right === '' ? left : CLOSING.has(right[0]) ? left + right : `${left} ${right}`;
  return { ...found, words };
}

/**
 * One line of a report's `consequences`, read as the report profile reads it: the element it names and the words a
 * reader shows. The line's address is the last address in it (found as the address profile finds one in prose, by
 * `findOwLinks`) that names an element of this world: an `ow://` or site address, its ids' hex in either case (the
 * prefix, the host and the type word only in lowercase), whose world is `world` or is left out, and whose type and id
 * have an element's shape. An address of another world, a slug, a world
 * alone or a lens with no element is prose, and a line with only those has no address, which is no fault. The address
 * leaves the shown words only when nothing the writer wrote is lost: it is canonical, carries no moment and no lens,
 * and stands apart (before it the line's start, White_Space or one colon; after it the line's end, White_Space or a
 * closing mark, `. , ; : ! ) ] } ' " ’ ” »`), alone or in a matched pair (`()`, `[]`, `""`, `''`, `“”`, `‘’`, `«»`).
 * Then it goes with the White_Space on both sides and one colon before it, and the two halves join with one space,
 * or none when the second is empty or begins with a closing mark. In every other shape, and when nothing stands
 * before the address, the whole line stays, still naming its element. Whether that element exists is the caller's
 * to read. The line is read as given: `readReportLines` splits and trims a whole text. A line that is not a string,
 * options that are not an object, an unknown option or a `world` that is not a string or null is a TypeError.
 *
 * ```ts
 * readReportLine("Renamed the Consul's Steinway: ow://object/01a1d4ef-0000-7000-8000-000000000084.");
 * // { words: "Renamed the Consul's Steinway.", address: 'ow://object/01a1d4ef-0000-7000-8000-000000000084', … }
 * ```
 */
export function readReportLine(line: string, options?: OwReportLineOptions): OwReportLine {
  if (typeof line !== 'string') throw new TypeError('readReportLine: line must be a string');
  return readLine(line, worldOption('readReportLine', options));
}

/**
 * Every line of a report's `consequences`, each read by `readReportLine`. The text is split at every carriage return
 * and every line feed (so CRLF is one break), each piece trimmed of Unicode White_Space at both ends, and a piece
 * empty after trimming is no line; U+2028 and U+0085 stay inside a line, and a byte order mark is no White_Space.
 * A text that is not a string is a TypeError.
 */
export function readReportLines(text: string, options?: OwReportLineOptions): OwReportLine[] {
  if (typeof text !== 'string') throw new TypeError('readReportLines: text must be a string');
  const world = worldOption('readReportLines', options);
  return text.split(/[\r\n]/).map(trimWhiteSpace).filter(l => l !== '').map(l => readLine(l, world));
}
