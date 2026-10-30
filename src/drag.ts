// The link a drag between two types writes: the distribution's pairs.json sidecar (schema-dist serial 95),
// baked at codegen as DRAG_PAIRS. A drawing aid like the colour groups, not part of the standard.

import { DRAG_PAIRS, ELEMENT_TYPES, type ElementType } from './v2/types.generated';

/** `dragField`'s answer: the link a drop between two types writes. */
export interface OwDragField {
  /** The type that carries the field: one of the two. */
  on: ElementType;
  /** The link field on `on` that the drop writes, naming the other element. */
  field: string;
  /** True when the drop puts one element inside the other (one square under the other); false when it only draws a line. */
  holds: boolean;
}

const TYPES: ReadonlySet<string> = new Set(ELEMENT_TYPES);

/**
 * The link a drag between an element of type `a` and one of type `b` writes, in either order, as the
 * distribution's `pairs.json` gives it: `{ on, field, holds }`, a fresh object each call. Null when
 * the pair offers no drag: the same type twice, a pair the table leaves out (same-kind pairs and
 * fields that name a role are absent by ruling), or anything that is not one of the 22 type slugs as
 * written (`'Character'` is not `'character'`). A tool that offers drags offers these and nothing
 * else, and a pair answered null draws no line.
 *
 * ```ts
 * dragField('location', 'character'); // { on: 'character', field: 'location', holds: true }
 * dragField('character', 'character'); // null
 * ```
 */
export function dragField(a: string, b: string): OwDragField | null {
  if (typeof a !== 'string' || typeof b !== 'string' || !TYPES.has(a) || !TYPES.has(b) || a === b) return null;
  const key = a < b ? `${a}+${b}` : `${b}+${a}`;
  if (!Object.prototype.hasOwnProperty.call(DRAG_PAIRS, key)) return null;
  const row = DRAG_PAIRS[key];
  return { on: row.on, field: row.field, holds: row.holds };
}
