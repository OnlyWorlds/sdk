/**
 * A date with the world's calendar's words, as the hosted door gives it on `get_element` and
 * `list_elements` (keel's `mcp_server/date_labels.py`, live since 2026-11-26): `date_labels`, an object of
 * field name to words, the last key of a body that has one, only where the World names its calendar
 * in `x_calendar`.
 *
 * - The fields: a whole-number field of the body's type named `date` or ending in `_date`, in the
 *   door's own order of its integer fields. A body with no label has no key.
 * - The calendar: the element whose id the World's `x_calendar` holds as an id is written
 *   (lowercase, hyphenated, whole), in any of the 22 types; none when it is not found, carries no
 *   calendar, is proposed and undecided, or is a Read mark (a reader's own fact, never the world's
 *   content). The World naming none is no labels, even when the world holds one calendar.
 * - The words: `formatStep`'s whole output; a label that is empty, or only the number itself, is
 *   left out. An answer of more than DATES_MAX distinct dates gets none.
 * - Not mirrored: keel's own calendar gate (the bounds on a template's length, separator runs, eras,
 *   months and the year's days that keel sets for what it renders, tighter than the calendar
 *   profile's), so a calendar inside the profile's bounds but past keel's speaks here and not at the
 *   door. One past the profile's bounds does not read here either (`readCalendarValue`, since 4.212.0).
 */
import { CALENDAR_FIELD, readCalendarValue } from '../calendar/index';
import { formatStep } from '../calendar/calendar';
import { handsOnAsProposed } from '../review';
import { fold } from '../room';
import { MESSAGE_READ_MARK } from '../v2/types.generated';

type Body = Record<string, unknown>;

/** The key the labels travel under. */
export const DATE_LABELS = 'date_labels';
/** Distinct dates one answer labels, at most; past it, none (keel's DATES_MAX). */
export const DATES_MAX = 200;
/** An id as keel writes one (core.address.is_written_id): the only spelling of `x_calendar` that speaks. */
const WRITTEN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A Read mark: a Relation whose supertype is `Read`, each trimmed and folded as the room profile reads a pair. */
const isReadMark = (el: Body): boolean =>
  typeof el.type === 'string' && typeof el.supertype === 'string' &&
  fold(el.type) === fold(MESSAGE_READ_MARK.type) && fold(el.supertype) === fold(MESSAGE_READ_MARK.supertype);

/** A type's date fields, in the order its integer fields are given. */
export function dateFields(integerFields: readonly string[]): string[] {
  return integerFields.filter((f) => f === 'date' || f.endsWith('_date'));
}

/** The id the World's `x_calendar` names, when it is written as an id; else null. */
export function namedCalendarId(world: Body): string | null {
  const v = Object.prototype.hasOwnProperty.call(world, 'x_calendar') ? world.x_calendar : undefined;
  return typeof v === 'string' && WRITTEN_ID.test(v) ? v : null;
}

/**
 * Give each body of `items` ((integer fields of its type, body) pairs) its `date_labels`, in place.
 * `calendarOf` is asked once, and only when the answer holds a date to label: it answers the element
 * the World names (or null). A raise from the calendar's reading leaves every body as it was.
 */
export async function addDateLabels(
  items: ReadonlyArray<readonly [readonly string[], Body]>,
  calendarOf: () => Promise<Body | null>,
): Promise<void> {
  const fields = items.map(([ints, body]) => [dateFields(ints), body] as const);
  const dates = new Set<number>();
  for (const [fs, body] of fields) for (const f of fs) if (whole(body[f])) dates.add(body[f] as number);
  if (dates.size === 0 || dates.size > DATES_MAX) return;
  const element = await calendarOf();
  if (!element || handsOnAsProposed(element) || isReadMark(element)) return;
  const words = new Map<number, string>();
  try {
    const cfg = readCalendarValue(element[CALENDAR_FIELD]);
    if (!cfg) return;
    for (const v of [...dates].sort((a, b) => a - b)) {
      const label = formatStep(cfg, v);
      if (label && label !== String(v)) words.set(v, label);
    }
  } catch {
    return;
  }
  if (words.size === 0) return;
  for (const [fs, body] of fields) {
    const labels: Record<string, string> = {};
    for (const f of fs) {
      const v = body[f];
      if (whole(v) && words.has(v)) labels[f] = words.get(v) as string;
    }
    if (Object.keys(labels).length) body[DATE_LABELS] = labels;
  }
}
