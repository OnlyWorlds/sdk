// The room profile (schema-dist profiles/room.md, serial 45): which elements a parlor puts in
// a world, told apart by type and supertype together with the mark x_room_of. ROOM_PAIRS and
// ROOM_MARK are generated from the vendored dist; this file holds only the matcher, so a tool
// that keeps its own copy of the pairs can drop it for these exports.

import { ROOM_MARK, ROOM_PAIRS } from './v2/types.generated';
import { simpleCaseFold } from './world-file';

export { ROOM_PAIRS };

/**
 * The 25 code points of Unicode's White_Space property (PropList.txt): U+0009 to U+000D,
 * U+0020, U+0085, U+00A0, U+1680, U+2000 to U+200A, U+2028, U+2029, U+202F, U+205F, U+3000.
 * All sit in the Basic Multilingual Plane, so one UTF-16 code unit each.
 */
const WHITE_SPACE: ReadonlySet<number> = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

/**
 * The profiles' "trimmed" (schema-dist profiles/room.md, dist.47, "Trimmed and without regard
 * to case, defined once"): leading and trailing whitespace removed, nothing inside touched.
 * Whitespace is Unicode White_Space exactly (Skeld's ruling, OW Parlor h66 #10415), so a byte
 * order mark (U+FEFF) and a zero width space (U+200B) stay. JavaScript's trim() is not used:
 * it also strips U+FEFF. The Python package's is_room_element trims by the same 25.
 */
/** Leading and trailing White_Space removed, nothing inside touched (room.md's one definition); the names profile trims by it too. Module-internal: not in the package's exports. */
export function trimWhiteSpace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && WHITE_SPACE.has(text.charCodeAt(start))) start++;
  while (end > start && WHITE_SPACE.has(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

/** Trimmed, then simple-case-folded: "trimmed and without regard to case", defined once. Module-internal. */
export const fold = (text: string): string => simpleCaseFold(trimWhiteSpace(text));

/**
 * True when the element is a room element: its type and supertype, each trimmed and compared
 * without regard to case, match one of ROOM_PAIRS, AND it carries the mark `x_room_of` as a
 * non-empty string (the id of the world or the sitting the room belongs to). Both, always:
 * a pair without the mark is lore (a novel's letters are Narratives with supertype Message),
 * and a mark without a pair is not a room element (a malformed mark: report it, never hide it).
 * The pair match is the whole word: a Narrative with supertype `Messages` is lore, and so is
 * the charter (`law` / `Charter`). A missing, null or empty supertype is never a room element.
 *
 * What it is for: a lore view (a list, a count, search, a graph, a link picker, a story's
 * context) leaves room elements out unless the person asks to see them; the room's own views,
 * and a room element opened by its id, show them whole. A tool that writes the world writes
 * room elements like any other, the mark kept byte for byte: the rule is the reader's.
 *
 * Trimmed is Unicode White_Space at both ends (trimWhiteSpace above), so a value with a
 * leading byte order mark is not a match. Case is folded with Unicode simple case folding
 * (simpleCaseFold, the table the `.owworld` reader uses), the same fold as the Python
 * package's `is_room_element`.
 */
export function isRoomElement(
  el: { type?: string; supertype?: string | null; x_room_of?: string | null },
): boolean {
  if (el == null || typeof el.type !== 'string' || typeof el.supertype !== 'string') return false;
  const mark: unknown = el[ROOM_MARK];
  if (typeof mark !== 'string' || mark === '') return false;
  const type = fold(el.type);
  const supertype = fold(el.supertype);
  return ROOM_PAIRS.some(p => fold(p.type) === type && fold(p.supertype) === supertype);
}
