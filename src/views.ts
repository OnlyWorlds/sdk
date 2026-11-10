// How an element is shown by its kind: the distribution's views.json sidecar (schema-dist serial 113),
// baked at codegen as VIEWS_TABLE. Presentation like the colour groups and the drag pairs, not part of
// the standard, and nothing in it says who may see or do what: that is the server's, by what it serves.

import { VIEWS_TABLE, type OwViewRow, type OwViewsTable } from './v2/types.generated';
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

/** Whether the element carries a banner's mark: `hidden` and `known_of` when true, `x_served_trimmed` when it names a field, any other mark by presence as the profiles read one. */
function carries(el: Record<string, unknown>, mark: string): boolean {
  if (mark === 'hidden' || mark === 'known_of') return own(el, mark) === true;
  if (mark === 'x_served_trimmed') {
    const v = own(el, mark);
    return Array.isArray(v) && v.length > 0;
  }
  return hasMark(el, mark);
}

/**
 * How an element is shown, by the views table baked at this release (`views.json`): the row that matches
 * it, its one sentence, and the marks to show at the head of its page.
 *
 * A row matches by its kind: a profile's pair only with that profile's mark, by the profile's own reader;
 * a type with a supertype; a type alone; types and supertypes trimmed and folded as the room profile
 * defines. The most specific row wins. The sentence is the first field the row names in `sentence` that
 * holds text after trimming, cut at its first line break and trimmed. Pass the element as the reader is
 * served it: the banners read what was served (a known-of stub, the hidden mark, a trimmed list).
 *
 * ```ts
 * viewOf({ type: 'narrative', supertype: 'Message', story: 'See you at the gate.\nBring the map.' });
 * // { row: <the message row>, sentence: 'See you at the gate.', banners: [] }
 * viewOf({ type: 'character', name: 'Ilse' }); // { row: null, sentence: null, banners: [] }
 * ```
 */
export function viewOf(element: unknown): OwView {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) return { row: null, sentence: null, banners: [] };
  const el = element as Record<string, unknown>;
  let row: OwViewRow | null = null;
  let best = 0;
  for (const r of VIEWS.rows) {
    const s = score(r, el);
    if (s > best) { best = s; row = r; }
  }
  const banners = VIEWS.banners.map((b) => b.mark).filter((m) => carries(el, m));
  if (!row) return { row: null, sentence: null, banners };
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
  return { row, sentence, banners };
}
