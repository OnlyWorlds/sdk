/**
 * Which of a map's Pins one reader knows: a Pin is known when the element it places is among the elements that
 * reader was served. A rule of this package and the Python package (`pins_known_to`), not of the standard; the
 * shared cases are `test/fixtures/pins-known-to.cases.json`.
 */
import { byCodePoint } from './message';

/** How the placed element reached the reader: whole, or as a stub it only knows of (`known_of: true`). */
export type OwPinKnownHow = 'whole' | 'known_of';

export interface OwPinKnown {
  pin: string;
  /** The Pin's `map` as written when it is a non-empty string, else null. Not checked against any Map. */
  map: string | null;
  element_type: string;
  element_id: string;
  how: OwPinKnownHow;
}

export interface OwPinsKnownTo {
  /** By Pin id in code point order. */
  known: OwPinKnown[];
  /** Pins that place an element the reader was not served. A count, never ids. */
  unknown: number;
  /** Pins left aside: `no_link`, a Pin that places nothing. A reason with nothing counted is absent. */
  out: { no_link?: number };
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An id: a string that is not empty; anything else reads as none. */
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * Which of `pins` a reader knows, for a map drawn as one Character sees it: `{known, unknown, out}`, all three
 * keys always present.
 *
 * `pins` is a list of elements, of which the rows of type `pin` are read (so a whole world's list can be passed).
 * `served` is the list of elements as that reader was served them, stubs included: a list read with the reader's
 * own key, or the owner's read as that Character (`viewAs`). The function reads nothing else, so it cannot show a
 * reader more than the world told them. It does not ask whether a Pin has a point or its Map exists: that is
 * `mapSpace`'s reading, and a drawing keeps the Pins both name.
 *
 * A Pin is known when a row of `served` has the Pin's `element_type` as its `type` and the Pin's `element_id` as
 * its `id`, both as written (`Location` is no `location`, and the same id under another type is another element).
 * `how` is `known_of` when that row is a stub (`known_of: true`, see `isKnownOf`), else `whole`; of two served
 * rows with one type and id, the last one decides. A Pin with only one of `element_type` and `element_id` places
 * nothing: it is counted in `out.no_link` and never known. A row without a string `type` and a non-empty string
 * `id` is no element and is not counted; of two Pin rows with one id, the last one is read.
 *
 * The answer carries ids and the two words only, never an element's name or body.
 */
export function pinsKnownTo(pins: readonly unknown[], served: readonly unknown[]): OwPinsKnownTo {
  if (!Array.isArray(pins)) throw new TypeError('pinsKnownTo: pins is a list of elements.');
  if (!Array.isArray(served)) throw new TypeError('pinsKnownTo: served is a list of elements.');

  const servedHow = new Map<string, Map<string, OwPinKnownHow>>();
  for (const e of served) {
    if (!isRow(e) || typeof e.type !== 'string') continue;
    const id = idOf(e.id);
    if (id === null) continue;
    const how: OwPinKnownHow = e.known_of === true ? 'known_of' : 'whole';
    const ofType = servedHow.get(e.type);
    if (ofType) ofType.set(id, how); else servedHow.set(e.type, new Map([[id, how]]));
  }

  const rows = new Map<string, Row>();
  for (const p of pins) {
    if (!isRow(p) || p.type !== 'pin') continue;
    const id = idOf(p.id);
    if (id !== null) rows.set(id, p);
  }

  const known: OwPinKnown[] = [];
  let unknown = 0;
  let noLink = 0;
  for (const id of [...rows.keys()].sort(byCodePoint)) {
    const p = rows.get(id) as Row;
    const type = idOf(p.element_type);
    const element = idOf(p.element_id);
    if (type === null || element === null) { noLink++; continue; }
    const how = servedHow.get(type)?.get(element);
    if (how === undefined) { unknown++; continue; }
    known.push({ pin: id, map: idOf(p.map), element_type: type, element_id: element, how });
  }
  const out: { no_link?: number } = {};
  if (noLink > 0) out.no_link = noLink;
  return { known, unknown, out };
}
