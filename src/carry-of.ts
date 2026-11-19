/**
 * The map-space profile's frame reading (schema-dist profiles/map-space.md, rules 13 and 14): where a point on a child
 * Map lies on its parent, and on each Map above it. A child Map says where it lies on the Map its `parent_map` names
 * with `x_parent_frame`, a box `[x0, y0, x1, y1]` in the parent's pixels. The profile's `frame_cases` are the test.
 * The map-space reading (`mapSpace`) and the layout reading (`layoutOf`) do not read the key.
 */

/** Why the walk up `parent_map` ended (rule 14). */
export type OwCarryStop = 'top' | 'dangling' | 'cycle' | 'no_frame' | 'no_carry';

/** What is wrong with a Map's own `x_parent_frame` (rule 13). */
export type OwCarryLint = 'no_parent' | 'not_four_numbers' | 'not_a_box';

/** A point on one Map: its id and the point in its pixels, from its bottom left. */
export interface OwCarryPoint {
  map: string;
  x: number;
  y: number;
}

export interface OwCarryOf {
  /** The Map's `x_parent_frame` as written when it is a parent frame, else null. The Map's own: it does not depend on the point. */
  parent_frame: number[] | null;
  /** `no_parent`, `not_four_numbers` or `not_a_box` when this Map's own key is one, else null. */
  lint: OwCarryLint | null;
  /** The point on this Map as given, then the point on each Map it is carried to, up the `parent_map` chain. */
  points: OwCarryPoint[];
  /** Why the last point is carried no further; null only for a row that is no Map. */
  stop: OwCarryStop | null;
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An id or a link: a string that is not empty; anything else reads as none (reading H). */
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** A Map row: `type` exactly `map` (reading K) and a non-empty string id (reading H). */
const mapId = (v: unknown): string | null => (isRow(v) && v.type === 'map' ? idOf(v.id) : null);

/** A number as rule 13 reads one: a finite 64-bit float; a string, a boolean, null, a list and an object are none. */
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A size a carry may divide by: a whole number above 0, by value (reading K: 100.0 reads as 100). */
const isCarrySize = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v > 0;

/** This Map's own parent frame and lint (rule 13). */
function frameOf(map: Row): { frame: number[] | null; lint: OwCarryLint | null } {
  const key = map.x_parent_frame;
  const present = key !== undefined && key !== null;
  // The key is read only on a Map with a parent_map, a link as reading H reads one.
  if (idOf(map.parent_map) === null) return { frame: null, lint: present ? 'no_parent' : null };
  if (!present) return { frame: null, lint: null };
  if (!Array.isArray(key) || key.length !== 4 || !key.every(isNumber)) return { frame: null, lint: 'not_four_numbers' };
  const [x0, y0, x1, y1] = key as number[];
  if (!(x0 < x1) || !(y0 < y1)) return { frame: null, lint: 'not_a_box' };
  return { frame: key as number[], lint: null };
}

/**
 * One Map's frame reading: `{parent_frame, lint, points, stop}`, every key always present.
 *
 * `map` is the Map read, `point` is `[x, y]` on it (two finite numbers in its pixels from its bottom left, as a Pin's
 * `x` and `y` or a tap gives them), and `maps` the Maps the reader is served: rows of any other type are skipped, a
 * row whose `type` is not exactly `map` or that has no non-empty string id is no Map, and of two rows with one id the
 * last served is read. A `map` that is no Map answers `{parent_frame: null, lint: null, points: [], stop: null}`.
 *
 * The point is carried one level at a time up `parent_map`, by each level's own frame, as
 * `x0 + ((x * (x1 - x0)) / width)` and `y0 + ((y * (y1 - y0)) / height)` in that order, never through one product
 * of the levels' ratios. The walk ends at a Map with no `parent_map` (`top`), one whose parent is not served
 * (`dangling`), one whose parent the walk has already reached, itself included (`cycle`), one with no parent frame
 * (`no_frame`), or one whose written `width` or `height` is not a whole number above 0 (`no_carry`). A point outside
 * the child is carried as written; `z` is not carried. Pure.
 */
export function carryOf(map: unknown, point: readonly [number, number] | readonly number[], maps: readonly unknown[]): OwCarryOf {
  if (!isRow(map)) throw new TypeError('carryOf: map is one Map element.');
  if (!Array.isArray(point) || point.length !== 2 || !point.every(isNumber)) {
    throw new TypeError(`carryOf: point is [x, y], two finite numbers; got ${JSON.stringify(point) ?? String(point)}.`);
  }
  if (!Array.isArray(maps)) throw new TypeError('carryOf: maps is a list of Map elements.');
  const id = mapId(map);
  if (id === null) return { parent_frame: null, lint: null, points: [], stop: null };

  const served = new Map<string, Row>();
  for (const m of maps) {
    const mid = mapId(m);
    if (mid !== null) served.set(mid, m as Row);
  }

  const own = frameOf(map);
  let x = point[0];
  let y = point[1];
  const points: OwCarryPoint[] = [{ map: id, x, y }];
  const reached = new Set<string>([id]);
  let at: Row = map;
  let frame = own.frame;
  let stop: OwCarryStop;
  for (;;) {
    const parentId = idOf(at.parent_map);
    if (parentId === null) { stop = 'top'; break; }
    const parent = served.get(parentId);
    if (parent === undefined) { stop = 'dangling'; break; }
    if (reached.has(parentId)) { stop = 'cycle'; break; }
    if (frame === null) { stop = 'no_frame'; break; }
    const { width, height } = at;
    if (!isCarrySize(width) || !isCarrySize(height)) { stop = 'no_carry'; break; }
    const [x0, y0, x1, y1] = frame;
    x = x0 + ((x * (x1 - x0)) / width);
    y = y0 + ((y * (y1 - y0)) / height);
    points.push({ map: parentId, x, y });
    reached.add(parentId);
    at = parent;
    frame = frameOf(parent).frame;
  }
  return { parent_frame: own.frame, lint: own.lint, points, stop };
}
