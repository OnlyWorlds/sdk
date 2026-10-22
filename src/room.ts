// The room profile (schema-dist profiles/room.md, serial 45): which elements a parlor puts in
// a world, told apart by type and supertype together with the mark x_room_of. ROOM_PAIRS and
// ROOM_MARK are generated from the vendored dist; this file holds only the matcher, so a tool
// that keeps its own copy of the pairs can drop it for these exports.

import { ROOM_MARK, ROOM_PAIRS } from './v2/types.generated';
import { simpleCaseFold } from './world-file';

export { ROOM_PAIRS };

const fold = (text: string): string => simpleCaseFold(text.trim());

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
 * Case is folded with Unicode simple case folding (simpleCaseFold, the table the `.owworld`
 * reader uses), the same fold as the Python package's `is_room_element`.
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
