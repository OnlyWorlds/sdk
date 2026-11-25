/**
 * `JSON.parse` for text this package did not write: a world folder's file.
 *
 * Two inputs that are JSON by the grammar come back from `JSON.parse` as something a reader cannot
 * serve as written.
 *
 * A value nested very deep: where the runtime parses it, the value comes back whole and the next
 * recursive walk over it fails (`JSON.stringify` of an answer that holds it throws); where it does
 * not, the parse throws an error that is no `SyntaxError`. So the depth is refused here by one
 * number, `OUTSIDE_JSON_MAX_DEPTH`, the same in every runtime.
 *
 * A number too large for a double (`1e400`, an integer of hundreds of digits): `JSON.parse` reads
 * infinity, and `JSON.stringify` writes that back as `null`, so a reader would serve a value the
 * file does not hold.
 *
 * Both are a fault with its own name, so a caller that skips a file it cannot read can say why.
 * Not covered: an integer past 2^53 that still fits a double is read rounded, as JavaScript reads
 * every number.
 *
 * Module-internal: not in the package's exports.
 */

/**
 * The deepest nesting read: an object or array at the top is depth 1, one it holds depth 2. No
 * world data comes near it, and every supported runtime parses this deep.
 */
export const OUTSIDE_JSON_MAX_DEPTH = 200;

/** Why a text was not read: no JSON at all, nested past the line, or holding a number no double holds. */
export type OutsideJsonFault = 'not_json' | 'too_deep' | 'number_out_of_range';

export type OutsideJson = { ok: true; value: unknown } | { ok: false; fault: OutsideJsonFault };

/**
 * Whether the text opens an object or array deeper than `OUTSIDE_JSON_MAX_DEPTH`, counted in the
 * text itself as each one opens, before any parse (the folder format's rule since serial 148): so
 * each value of a repeated key counts, and a text past the line is too deep whatever else is wrong
 * with it. Brackets inside a string are not counted; a backslash in a string escapes the next
 * character.
 */
export function textTooDeep(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++; // a backslash: the next character is escaped
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) {
      inString = true;
    } else if (c === 0x7b || c === 0x5b) {
      if (++depth > OUTSIDE_JSON_MAX_DEPTH) return true;
    } else if (c === 0x7d || c === 0x5d) {
      depth--;
    }
  }
  return false;
}

/**
 * The text parsed, with the two cases above answered as a fault. A text with both is
 * `too_deep`, and so is a text past the depth that is broken too: the depth is counted first, in
 * the text (`textTooDeep`). The number check after the parse is a loop with its own stack, never
 * recursion.
 */
export function parseOutsideJson(text: string): OutsideJson {
  if (textTooDeep(text)) return { ok: false, fault: 'too_deep' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    // A runtime that cannot parse a depth throws its own error there, never a SyntaxError.
    return { ok: false, fault: err instanceof SyntaxError ? 'not_json' : 'too_deep' };
  }
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false, fault: 'number_out_of_range' };
  if (value === null || typeof value !== 'object') return { ok: true, value };
  let badNumber = false;
  const stack: object[] = [value];
  while (stack.length > 0) {
    const item = stack.pop() as object;
    const children: unknown[] = Array.isArray(item) ? item : Object.values(item);
    for (const child of children) {
      if (typeof child === 'number') {
        if (!Number.isFinite(child)) badNumber = true;
      } else if (child !== null && typeof child === 'object') {
        stack.push(child);
      }
    }
  }
  return badNumber ? { ok: false, fault: 'number_out_of_range' } : { ok: true, value };
}
