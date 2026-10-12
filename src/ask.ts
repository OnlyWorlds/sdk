/**
 * Context for keel's AI proxy (POST /api/v2/account/ask, Keel #159): the elements a
 * question is about, as text, within the proxy's limits. The caller passes the
 * elements it shows the user, in its own order, and gets back exactly which were sent:
 * the answer's sources are what the user saw, never a second lookup's.
 *
 *   const hits = lookupWorld(index, question).slice(0, 8);   // what the screen lists
 *   const { context, kept } = buildAskContext(hits, index);
 *   const reply = await account.ask({ worldId, question, context });
 *
 * The limits are keel's (accounts/ask.py), counted the way keel counts (characters,
 * not UTF-16 units): at most 8 items, 2,000 characters each, 12,000 in all.
 */

import { renderElement, type OwLookupElement, type OwLookupHit, type OwWorldIndex } from './lookup';

/** keel's limits on one ask. */
export const ASK_LIMITS = { questionMax: 500, itemsMax: 8, itemMax: 2000, totalMax: 12000 } as const;

export interface OwAskContext {
  /** The texts to send as `context`, in the order given. */
  context: string[];
  /** Ids of the elements sent, in order (one per `context` item). */
  kept: string[];
  /** Ids of the elements left out: past the 8th, or from the first one the 12,000 total could not hold. */
  dropped: string[];
  /** Ids among `kept` whose text was cut to 2,000 characters. */
  truncated: string[];
}

const chars = (s: string): number => [...s].length;
const cut = (s: string, n: number): string => [...s].slice(0, n).join('');

/**
 * Turn the elements on screen into the proxy's `context`. Takes lookup hits or plain
 * elements, keeps their order, renders each with `renderElement`, cuts a text over
 * 2,000 characters, and stops at the 8th or at the first one the 12,000 total cannot
 * hold, so what is sent is always the top of the list as shown.
 */
export function buildAskContext<T extends OwLookupElement>(
  items: Array<OwLookupHit<T> | T>,
  index: OwWorldIndex<T>,
): OwAskContext {
  const out: OwAskContext = { context: [], kept: [], dropped: [], truncated: [] };
  let total = 0;
  let full = false;
  for (const item of items) {
    const el = (item && typeof item === 'object' && 'element' in item ? (item as OwLookupHit<T>).element : item) as T;
    if (full || out.context.length >= ASK_LIMITS.itemsMax) { out.dropped.push(el.id); continue; }
    let text = renderElement(el, index);
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
