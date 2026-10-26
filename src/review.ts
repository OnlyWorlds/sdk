/**
 * The review profile's proposed mark (schema-dist profiles/review.md): an element whose
 * `x_review_proposed` is an object was written as proposed (an AI seat's new element on a world
 * whose keeper reviews them) and is not canon until a keeper settles it: accept writes the mark
 * null, decline deletes the element.
 *
 * Two readings, as the profile's rule 1 and rule 4 give them. A reader that shows a world to its
 * people shows the mark when it is an object (`proposedMarkOf`); any other value is not a mark and
 * is reported by a lint, never repaired. A reader that hands a world on leaves out every element
 * whose `x_review_proposed` is anything but absent or null (`handsOnAsProposed`), so a doubt never
 * reaches an AI as canon.
 */

import { trimWhiteSpace } from './room';

/** The review profile's proposed mark, an extension key. */
export const PROPOSED_MARK = 'x_review_proposed';

/** A proposed element's mark as a reader shows it. */
export interface OwProposedMark {
  /** The membership or seat that proposed it, trimmed of Unicode White_Space as the room profile trims, when the mark names one. */
  by: string | null;
  /** The day it lapses (YYYY-MM-DD), trimmed, when the mark gives one in that shape. */
  expires: string | null;
  /** `expires` has come (on or before `today`): shown as lapsed, never deleted on its own (rule 2). */
  lapsed: boolean;
}

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Today as the profile writes a day, in UTC: keel reads a proposal as lapsed from midnight UTC of its `expires` day. */
function todayDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The proposed mark of an element as a reader that shows a world shows it, or null for a settled
 * element: `x_review_proposed` absent, null, or a value that is not an object (an array included).
 * `today` is a day as the profile writes one (YYYY-MM-DD), by default today in UTC; anything else
 * is a TypeError.
 */
export function proposedMarkOf(element: unknown, today?: string): OwProposedMark | null {
  if (today !== undefined && (typeof today !== 'string' || !DAY.test(today))) {
    throw new TypeError(`proposedMarkOf: today is a day as YYYY-MM-DD; got ${JSON.stringify(today) ?? String(today)}.`);
  }
  if (!element || typeof element !== 'object') return null;
  const v = (element as Record<string, unknown>)[PROPOSED_MARK];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const by = typeof m.by === 'string' && trimWhiteSpace(m.by) ? trimWhiteSpace(m.by) : null;
  const expires = typeof m.expires === 'string' && DAY.test(trimWhiteSpace(m.expires)) ? trimWhiteSpace(m.expires) : null;
  return { by, expires, lapsed: expires !== null && expires <= (today ?? todayDay()) };
}

/**
 * Whether a reader that hands a world on (a pack, a context packet, an AI's context) leaves this
 * element out as proposed: `x_review_proposed` with any value but absent or null, a value that is
 * not a proper mark included (a doubt, counted with the proposed).
 */
export function handsOnAsProposed(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const v = (element as Record<string, unknown>)[PROPOSED_MARK];
  return v !== undefined && v !== null;
}
