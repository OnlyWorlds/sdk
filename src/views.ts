// How an element is shown by its kind: the distribution's views.json sidecar (schema-dist serial 113),
// baked at codegen as VIEWS_TABLE. Presentation like the colour groups and the drag pairs, not part of
// the standard, and nothing in it says who may see or do what: that is the server's, by what it serves.

import { ELEMENT_SECTIONS, GENERIC_LINKS, VIEWS_TABLE, type OwViewRow, type OwViewsTable } from './v2/types.generated';
import { fold, hasMark, isCharterElement, isRoomElement, trimWhiteSpace } from './room';

export type { OwViewRow, OwViewsTable };

/** viewOf's answer for one element. */
export interface OwView {
  /** The row that shows it, the table's own (frozen) row; null when no row matches and the element draws as its type. */
  row: OwViewRow | null;
  /** The one sentence for a card, a list row or a hover; null when there is no row or no named field holds anything. */
  sentence: string | null;
  /** The marks to show at the head of its page, in order: the table's banners the element carries, then the row's own. */
  banners: string[];
  /**
   * The fields its page draws, in the order drawn (the file's document layout): the row's `lead`, then the
   * rest of the type's section fields in the standard's section order, then each `fold`; each field once,
   * and only a field that holds something (not absent, null, a string with nothing after trimming, or an
   * empty list), so an empty lead field is skipped and an empty fold draws no fold. The base fields (name,
   * description, supertype, subtype, image_url) are the page's head and appear here only where the row
   * names one in `lead` or `fold`. With no row, the type's section fields. A conversation draws each line's
   * own fields this way.
   */
  order: string[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as object)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** views.json as baked at this release, without its `_meta`, frozen throughout. Read one element's view with viewOf. */
export const VIEWS: OwViewsTable = /* @__PURE__ */ deepFreeze(VIEWS_TABLE);

const own = (el: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(el, key) ? el[key] : undefined;

const PROFILE_READERS: { readonly [profile: string]: (el: Record<string, unknown>) => boolean } = {
  room: (el) => isRoomElement(el),
  charter: (el) => isCharterElement(el),
};

/** How specifically a row matches: 3 a profile's pair with its mark, 2 a type with a supertype, 1 a type alone, 0 not at all. */
function score(row: OwViewRow, el: Record<string, unknown>): number {
  const type = own(el, 'type');
  if (typeof type !== 'string') return 0;
  const supertype = own(el, 'supertype');
  const sameSupertype = (want: string) => typeof supertype === 'string' && fold(supertype) === fold(want);
  const kind = row.kind;
  if ('profile' in kind) {
    const slash = kind.pair.indexOf('/');
    const reader = PROFILE_READERS[kind.profile];
    if (!reader || fold(type) !== fold(kind.pair.slice(0, slash)) || !sameSupertype(kind.pair.slice(slash + 1))) return 0;
    return reader(el) ? 3 : 0;
  }
  if (fold(type) !== fold(kind.type)) return 0;
  if (kind.supertype === undefined) return 1;
  return sameSupertype(kind.supertype) ? 2 : 0;
}

/**
 * Whether the element carries a banner's mark: `hidden` and `known_of` when true, `x_served_trimmed` when it
 * names a field, the two review marks when the value is an object with something in it (the review
 * profile: an empty mark is settled, and a page ignores a value that is not an object), any other mark by
 * presence as the room and charter profiles read one.
 */
function carries(el: Record<string, unknown>, mark: string): boolean {
  const v = own(el, mark);
  if (mark === 'hidden' || mark === 'known_of') return v === true;
  // it names a field: at least one string with something left after trimming (a list of blanks names none)
  if (mark === 'x_served_trimmed') return Array.isArray(v) && v.some((x) => typeof x === 'string' && trimWhiteSpace(x) !== '');
  if (mark === 'x_review_proposed' || mark === 'x_review_checked') {
    return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
  }
  return hasMark(el, mark);
}

/** A field holds nothing when absent, null, a string with nothing after trimming, an empty list, or an empty object. */
function holds(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return trimWhiteSpace(v) !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** The fields drawn, in order: lead, then the type's section fields neither lead nor fold, then fold; each once. */
function drawOrder(row: OwViewRow | null, el: Record<string, unknown>): string[] {
  const type = own(el, 'type');
  const slug = typeof type === 'string' ? fold(type) : '';
  const sections = Object.prototype.hasOwnProperty.call(ELEMENT_SECTIONS, slug)
    ? [...ELEMENT_SECTIONS[slug as keyof typeof ELEMENT_SECTIONS]].sort((a, b) => a.order - b.order).flatMap((s) => s.fields)
    : [];
  const lead = row?.lead ?? [];
  const folds = (row?.fold ?? []).map((f) => f.field);
  const drawn: string[] = [];
  // a generic link (a Pin's `element`) is one field of the order, read as its two keys: it holds something
  // only when both are strings with something left after trimming
  const generic = Object.prototype.hasOwnProperty.call(GENERIC_LINKS, slug) ? GENERIC_LINKS[slug] : {};
  const fieldHolds = (f: string): boolean => {
    if (!Object.prototype.hasOwnProperty.call(generic, f)) return holds(own(el, f));
    return generic[f].every((k) => { const v = own(el, k); return typeof v === 'string' && trimWhiteSpace(v) !== ''; });
  };
  const draw = (f: string) => { if (!drawn.includes(f) && fieldHolds(f)) drawn.push(f); };
  lead.forEach(draw);
  sections.filter((f) => !lead.includes(f) && !folds.includes(f)).forEach(draw);
  folds.forEach(draw);
  return drawn;
}

/**
 * How an element is shown, by the views table baked at this release (`views.json`): the row that matches
 * it, its one sentence, the marks to show at the head of its page, and the fields its page draws in order.
 *
 * A row matches by its kind: a profile's pair only with that profile's mark, by the profile's own reader;
 * a type with a supertype; a type alone; types and supertypes trimmed and folded as the room profile
 * defines. The most specific row wins, and where two match on one rung the first in the table does: a
 * page is never refused over the table. The sentence is the first field the row names in `sentence` that
 * holds text after trimming, cut at its first line break and trimmed. Pass the element as the reader is
 * served it: the banners read what was served (a known-of stub, the hidden mark, a trimmed list).
 *
 * ```ts
 * viewOf({ type: 'narrative', supertype: 'Message', story: 'See you at the gate.\nBring the map.' });
 * // { row: <the message row>, sentence: 'See you at the gate.', banners: [], order: ['story'] }
 * viewOf({ type: 'character', name: 'Ilse' }); // { row: null, sentence: null, banners: [], order: [] }
 * ```
 */
export function viewOf(element: unknown): OwView {
  return viewIn(VIEWS, element);
}

/**
 * viewOf against a given table. Not exported from the package: the shared fixture's tests reach it to read a
 * case against a table of the fixture's own (one at fault on purpose, two rows on one kind).
 * @internal
 */
export function viewIn(table: Pick<OwViewsTable, 'banners' | 'rows'>, element: unknown): OwView {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) return { row: null, sentence: null, banners: [], order: [] };
  const el = element as Record<string, unknown>;
  let row: OwViewRow | null = null;
  let best = 0;
  for (const r of table.rows) {
    const s = score(r, el);
    if (s > best) { best = s; row = r; } // strictly greater: on one rung the first row keeps it
  }
  const banners = table.banners.map((b) => b.mark).filter((m) => carries(el, m));
  if (!row) return { row: null, sentence: null, banners, order: drawOrder(null, el) };
  for (const m of row.banner ?? []) if (carries(el, m)) banners.push(m);
  let sentence: string | null = null;
  for (const f of row.sentence ?? []) {
    const v = own(el, f);
    if (typeof v !== 'string') continue;
    const text = trimWhiteSpace(v);
    if (text === '') continue;
    const cut = text.search(/[\n\r]/);
    sentence = trimWhiteSpace(cut < 0 ? text : text.slice(0, cut));
    break;
  }
  return { row, sentence, banners, order: drawOrder(row, el) };
}
