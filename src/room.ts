// The room profile (schema-dist profiles/room.md, serial 45; the mark by presence since serial 83): which elements a parlor puts in
// a world, told apart by type and supertype together with the mark x_room_of. ROOM_PAIRS and
// ROOM_MARK are generated from the vendored dist; this file holds only the matcher, so a tool
// that keeps its own copy of the pairs can drop it for these exports.

import { CHARTER_PAIRS, READING_AID_MARK, READING_AID_PAIRS, ROOM_MARK, ROOM_PAIRS } from './v2/types.generated';
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
 * Whitespace is Unicode White_Space exactly (ruled 2026-10-22), so a byte
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
 * A mark read by presence (room.md and charter.md, serial 83): it counts when its value is not null; a
 * string counts only when something is left after the White_Space trim, and any other value (a number, an
 * object) counts as present. The value is never compared. Module-internal.
 */
function hasMark(el: Record<string, unknown>, field: string): boolean {
  const mark = Object.prototype.hasOwnProperty.call(el, field) ? el[field] : undefined;
  if (mark === undefined || mark === null) return false;
  return typeof mark !== 'string' || trimWhiteSpace(mark) !== '';
}

/**
 * True when the element is a room element: its type and supertype, each trimmed and compared
 * without regard to case, match one of ROOM_PAIRS, AND it carries the mark `x_room_of` (the id of
 * the world or the sitting the room belongs to), read by presence: any value but null, a string only
 * when something is left after trimming, the value never compared. Both, always:
 * a pair without the mark is lore (a novel's letters are Narratives with supertype Message),
 * and a mark without a pair is not a room element (a malformed mark: report it, never hide it).
 * The pair match is the whole word: a Narrative with supertype `Messages` is lore. The charter
 * (`law` / `Charter`) is never a room element: with its own mark it is a reading aid
 * (isCharterElement), without it lore. A missing, null or empty supertype is never a room element.
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
  el: { type?: string; supertype?: string | null; x_room_of?: unknown },
): boolean {
  if (el == null || typeof el !== 'object' || typeof el.type !== 'string' || typeof el.supertype !== 'string') return false;
  if (!hasMark(el as Record<string, unknown>, ROOM_MARK)) return false;
  const type = fold(el.type);
  const supertype = fold(el.supertype);
  return ROOM_PAIRS.some(p => fold(p.type) === type && fold(p.supertype) === supertype);
}

/** The reading aids' pairs as `types` words, folded: `law/charter`, `construct/guide`, `construct/domain`. Module-internal. */
export const READING_AID_KEYS: ReadonlySet<string> = new Set(READING_AID_PAIRS.map(p => `${fold(p.type)}/${fold(p.supertype)}`));

/**
 * The reading aid's pair word (`law/charter`, `construct/guide` or `construct/domain`, folded) when the element
 * is one, else null (module-internal; the lens and graph readers read it). The mark counts when it is present
 * and not null, and a string only when something is left after trimming, as the API reads it.
 */
export function readingAidKey(element: unknown): string | null {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) return null;
  const el = element as Record<string, unknown>;
  if (typeof el.type !== 'string' || typeof el.supertype !== 'string') return null;
  const key = `${fold(el.type)}/${fold(el.supertype)}`;
  if (!READING_AID_KEYS.has(key)) return null;
  return hasMark(el, READING_AID_MARK) ? key : null;
}

/**
 * True when the element is a reading aid (schema-dist profiles/room.md, profiles/lens.md rule 4): the
 * world's charter (`law`, supertype `Charter`), its guide (`construct`, supertype `Guide`) or one of its
 * domains (`construct`, supertype `Domain`), the type and supertype each trimmed and compared without
 * regard to case, the whole word, AND the mark `x_charter_of`, the id of the world the aid belongs to. The
 * mark counts when it is present and not null; a string mark counts only when something is left after
 * trimming. Both, always: the pair without the mark is lore, and stays in every view (a kingdom's Charter
 * in a novel's world is a Law like any other).
 *
 * What it is for: a tool's front door shows the aids first; a lore view (a list, a graph, a story's
 * context) leaves them out by default. A reading aid is not a room element: `isRoomElement` answers false
 * for one, and a public reader sees it. In a lens, one reached by a hop is kept only when `types` names its
 * pair (`law/charter`, `construct/guide`, `construct/domain`); one the lens names as an anchor is kept and
 * followed like any anchor.
 */
export function isCharterElement(element: object | null | undefined): boolean {
  return readingAidKey(element) !== null;
}

/** CHARTER_PAIRS by their folded pair word (`law/charter` to `charter`). Module-internal. */
const AID_BY_KEY: ReadonlyMap<string, 'charter' | 'guide' | 'domain'> = new Map(
  CHARTER_PAIRS.map(p => [`${fold(p.type)}/${fold(p.supertype)}`, p.aid]),
);

/**
 * Which reading aid the element's pair makes it (schema-dist profiles/charter.md): `'charter'` for a `law`
 * with supertype `Charter`, `'guide'` for a `construct` with supertype `Guide`, `'domain'` for a `construct`
 * with supertype `Domain`, the type and supertype each trimmed and compared without regard to case, the whole
 * word, as `isCharterElement` matches them; null for any other pair, for an element without a string type
 * and supertype, and for anything that is not an object.
 *
 * It reads the pair only and ignores the mark `x_charter_of`: an unmarked Charter answers `'charter'`, which
 * is what a tool offering to mark an element needs. Whether the element IS a reading aid (the pair and the
 * mark) is `isCharterElement`.
 */
export function readingAidOf(element: unknown): 'charter' | 'guide' | 'domain' | null {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) return null;
  const el = element as Record<string, unknown>;
  if (typeof el.type !== 'string' || typeof el.supertype !== 'string') return null;
  return AID_BY_KEY.get(`${fold(el.type)}/${fold(el.supertype)}`) ?? null;
}
