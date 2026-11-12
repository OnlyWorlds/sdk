// The report profile (schema-dist profiles/report.md, rule 9, serial 120): reports grouped into threads by their
// `parent_narrative`, read as written. A report is a Narrative with supertype `Report` and the room's mark; a board
// entry is a Narrative with supertype `Board` and the mark; both are room pairs, matched by room.ts's reader (the
// trim, the fold and the mark by presence), never a second copy. A thread is ordered by `created_at` as the message
// profile orders messages (message.ts). The fixture, profiles/report.fixture.json, is this file's own test.

import { fold, isRoomElement } from './room';
import { inCreatedOrder } from './message';

/** What a report's parent is: none served, a report, a board entry, an id whose element is not held, another element, or the report itself. */
export type OwReportParentKind = 'none' | 'report' | 'board' | 'missing' | 'other' | 'self';

/** One group: the parent's id, whether it is a report (a thread) or a board entry (the talks under it), and the reports that name it, in rule 9's order. */
export interface OwReportGroup {
  parent: string;
  kind: 'report' | 'board';
  /** The ids of the reports that name the parent, by `created_at` (equal times keep the list's order; unreadable times last). The parent is not among them. */
  reports: string[];
}

/** A lint: `chain` on a report whose parent is a report that itself names a report (itself included); `self` on a report that names itself. */
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

/** The parent's id as written: a non-empty string, else none. */
function parentOf(el: Body): string | null {
  const parent = el.parent_narrative;
  return typeof parent === 'string' && parent !== '' ? parent : null;
}

/**
 * Reports grouped into threads (the report profile's rule 9). Give it the Narratives as the reader is served them,
 * in the order served. A report is a Narrative with supertype `Report` that carries the room's mark `x_room_of`
 * (`isRoomElement`); a board entry is one with supertype `Board` and the mark. Without the mark either is lore.
 *
 * `parents`: for each report, what its `parent_narrative` names: `none` (absent, null, empty or not a string),
 * `self`, `missing` (an id whose element is not in the list: a folder or an export without it, an id that dangles),
 * `report`, `board`, or `other` (any other element, a Narrative with supertype `Report` or `Board` and no mark
 * included; a stub, which serves no mark, reads `other` too). `groups`: one per parent that is a report or a board
 * entry, the reports that name it ordered by `created_at` as an instant (equal times keep the list's order; one
 * that cannot be read as a date and time after every one that can), never by id or by the text of the time. A
 * report with no parent, or whose parent is missing, other or itself, is a thread of one and in no group.
 * `lints`: `self` on a report that names itself; `chain` on a report whose parent is a report that itself names a
 * report (itself included). The reader never walks further up a chain: such a report is shown under the parent it
 * names. It never guesses a thread from names, days or text.
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
    if (kind === 'report') {
      const up = parentOf(byId.get(parentOf(report) as string) as Body);
      if (up !== null && roomKindOf(byId.get(up)) === 'report') lints.push({ kind: 'chain', report: id });
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
