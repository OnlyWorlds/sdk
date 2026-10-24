/**
 * Context for keel's AI proxy (POST /api/v2/account/ask, Keel #159): the elements a
 * question is about, as text, within the proxy's limits. The caller passes the
 * elements it shows the user, in its own order, and gets back exactly which were sent:
 * the answer's sources are what the user saw, never a second lookup's.
 *
 *   const hits = lookupWorld(index, question).slice(0, 8);   // what the screen lists
 *   const { context, kept, leftOut } = buildAskContext(hits, index);
 *   const reply = await account.ask({ worldId, question, context });
 *
 * It is a reader that hands a world on, so three published rules hold here, not only in
 * the caller: an element marked proposed (the review profile, rules 1 and 4: any
 * `x_review_proposed` but absent or null, a doubt included), one marked hidden (folder
 * format §4.8: a `hidden` but absent, null or false) and a room element (the room
 * profile, rules 1 and 4: `isRoomElement`) are left out unless asked for, and listed in
 * `leftOut`. A kept proposed element carries REVIEW_PROPOSED_LABEL on its first line. A
 * kept element's link to one left out reads as not present, never by its name.
 *
 * The limits are keel's (accounts/ask.py), counted the way keel counts (characters,
 * not UTF-16 units): at most 8 items, 2,000 characters each, 12,000 in all. They apply
 * to what remains after the three rules.
 */

import { renderElement, type OwLookupElement, type OwLookupHit, type OwWorldIndex } from './lookup';
import { refuseUnknownOptions } from './options';
import { isRoomElement } from './room';
import { REVIEW_PROPOSED_LABEL } from './v2/types.generated';

export { REVIEW_PROPOSED_LABEL };

/** keel's limits on one ask. */
export const ASK_LIMITS = { questionMax: 500, itemsMax: 8, itemMax: 2000, totalMax: 12000 } as const;

export interface OwAskContextOptions {
  /**
   * Send proposed elements: those whose `x_review_proposed` is anything but absent or null
   * (the review profile; a value that is not a proper mark is a doubt, rule 4, and counts as
   * proposed). Each one sent carries REVIEW_PROPOSED_LABEL on its first line. Default false:
   * left out and listed in `leftOut.proposed`.
   */
  includeProposed?: boolean;
  /**
   * Send elements marked hidden: a `hidden` that is anything but absent, null or false (folder
   * format §4.8, the same test as writeWorldFile's `includeHidden`). Default false: left out and
   * listed in `leftOut.hidden`.
   */
  includeHidden?: boolean;
  /** Send room elements (`isRoomElement`, the room profile). Default false: left out and listed in `leftOut.room`. */
  includeRoom?: boolean;
}

/** The keys buildAskContext's options take; any other is refused by name, never dropped. */
const ASK_OPTION_KEYS: readonly (keyof OwAskContextOptions)[] = ['includeProposed', 'includeHidden', 'includeRoom'];

/** Ids left out by a mark, in the order given. An element carrying several marks is listed once, in the first of hidden, proposed, room whose `include*` is off. */
export interface OwAskLeftOut {
  proposed: string[];
  hidden: string[];
  room: string[];
}

export interface OwAskContext {
  /** The texts to send as `context`, in the order given. */
  context: string[];
  /** Ids of the elements sent, in order (one per `context` item). */
  kept: string[];
  /** Ids of the elements the limits left out: past the 8th, or from the first one the 12,000 total could not hold. Never an element `leftOut` holds. */
  dropped: string[];
  /** Ids among `kept` whose text was cut to 2,000 characters. */
  truncated: string[];
  /** Ids of the elements a mark left out (proposed, hidden, room), before the limits were counted. */
  leftOut: OwAskLeftOut;
}

const chars = (s: string): number => [...s].length;
const cut = (s: string, n: number): string => [...s].slice(0, n).join('');

/** Folder format §4.8: marked hidden unless `hidden` is absent, null or false (`"true"` and 1 count, as in writeWorldFile and the Python package's `is_hidden`). */
const isHidden = (el: OwLookupElement): boolean => el.hidden !== undefined && el.hidden !== null && el.hidden !== false;
/** The review profile: proposed unless `x_review_proposed` is absent or null; a value that is not a proper mark is a doubt, counted with the proposed (rule 4). */
const isProposed = (el: OwLookupElement): boolean => el.x_review_proposed !== undefined && el.x_review_proposed !== null;

function readOptions(opts: unknown): Required<OwAskContextOptions> {
  refuseUnknownOptions('buildAskContext', opts, ASK_OPTION_KEYS);
  const o = (opts ?? {}) as OwAskContextOptions;
  for (const k of ASK_OPTION_KEYS) {
    if (o[k] !== undefined && typeof o[k] !== 'boolean') {
      throw new TypeError(`buildAskContext: ${k} must be a boolean; got ${JSON.stringify(o[k]) ?? String(o[k])}.`);
    }
  }
  return { includeProposed: o.includeProposed === true, includeHidden: o.includeHidden === true, includeRoom: o.includeRoom === true };
}

/**
 * Turn the elements on screen into the proxy's `context`. Takes lookup hits or plain
 * elements and keeps their order. First the three marks: an element marked hidden
 * (§4.8), proposed (the review profile, a doubt included) or a room element (the room
 * profile) is left out unless its `include*` option is true, and its id goes to
 * `leftOut` (one bucket each, in the order hidden, proposed, room: a hidden proposed
 * element is listed under `hidden` only, since the owner's hide is the stronger
 * withholding and `includeProposed` alone never sends it). Then each remaining element
 * is rendered with `renderElement` (a proposed one with REVIEW_PROPOSED_LABEL on its
 * first line; a link to an element a mark leaves out, anywhere in the index, reads as
 * not present), a text over 2,000 characters is cut, and the list stops at the 8th or
 * at the first the 12,000 total cannot hold, so what is sent is always the top of the
 * list as shown. An unknown option, or one that is not a boolean, is a TypeError.
 */
export function buildAskContext<T extends OwLookupElement>(
  items: Array<OwLookupHit<T> | T>,
  index: OwWorldIndex<T>,
  opts: OwAskContextOptions = {},
): OwAskContext {
  const o = readOptions(opts);
  const markOf = (el: OwLookupElement): keyof OwAskLeftOut | null => {
    if (!o.includeHidden && isHidden(el)) return 'hidden';
    if (!o.includeProposed && isProposed(el)) return 'proposed';
    if (!o.includeRoom && isRoomElement(el as Parameters<typeof isRoomElement>[0])) return 'room';
    return null;
  };
  const withheld = (id: string): boolean => {
    const el = index.byId.get(id);
    return el !== undefined && markOf(el) !== null;
  };
  // The index as one element sees it: a link to an element left out joins the links to ids not in the set.
  const viewFor = (el: T): OwWorldIndex<T> => {
    const out = index.out.get(el.id) ?? [];
    const gone = out.filter((l) => withheld(l.id));
    if (!gone.length && !(index.inn.get(el.id) ?? []).some((l) => withheld(l.id))) return index;
    return {
      ...index,
      out: new Map([[el.id, out.filter((l) => !withheld(l.id))]]),
      inn: new Map([[el.id, (index.inn.get(el.id) ?? []).filter((l) => !withheld(l.id))]]),
      unresolved: new Map([[el.id, [...(index.unresolved.get(el.id) ?? []), ...gone]]]),
    };
  };
  const out: OwAskContext = { context: [], kept: [], dropped: [], truncated: [], leftOut: { proposed: [], hidden: [], room: [] } };
  let total = 0;
  let full = false;
  for (const item of items) {
    const el = (item && typeof item === 'object' && 'element' in item ? (item as OwLookupHit<T>).element : item) as T;
    const mark = markOf(el);
    if (mark) { out.leftOut[mark].push(el.id); continue; }
    if (full || out.context.length >= ASK_LIMITS.itemsMax) { out.dropped.push(el.id); continue; }
    let text = renderElement(el, viewFor(el));
    if (isProposed(el)) text = `[${REVIEW_PROPOSED_LABEL}] ${text}`;
    if (chars(text) > ASK_LIMITS.itemMax) { text = cut(text, ASK_LIMITS.itemMax); out.truncated.push(el.id); }
    if (total + chars(text) > ASK_LIMITS.totalMax) {
      full = true;
      out.truncated = out.truncated.filter((id) => id !== el.id);
      out.dropped.push(el.id);
      continue;
    }
    total += chars(text);
    out.context.push(text);
    out.kept.push(el.id);
  }
  return out;
}
