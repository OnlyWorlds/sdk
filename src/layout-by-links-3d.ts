/**
 * A 3D layout method for a world nobody laid out, read from its graph and its Maps and Pins: `by-links-3d`.
 *
 * The parts live in src/layout3d/, one file a step, and the directions table is baked into the package
 * (layout-directions.generated.ts). The method is exact where it can be: everything but the cosine and sine that
 * place what hangs off the body and the shelf is addition, subtraction, multiplication, division, square root and
 * floor, which every runtime rounds alike.
 */
import type { OwLayoutGraph } from './layout-by-kind';
import { refuseUnknownOptions } from './options';
import { LAYOUT_DIRECTIONS } from './layout-directions.generated';
import { layout3d } from './layout3d/method';
import { spaceRows } from './layout3d/space';

/** The rest length of the by-links-3d layout: a link's length at rest, and the unit of its answer's points. */
export const BY_LINKS_3D_REST = 60;

/** `layoutByLinks3d`'s options. */
export interface OwLayoutByLinks3dOptions {
  /**
   * Points an earlier call answered, to keep a picture still as the world changes: element id to `[x, y, z]` (an
   * Array or a typed array of exactly three finite numbers; a slice of an earlier answer's `points` will do), as a
   * Map or a plain object. A held element that is still a node and is not pinned stands at its held point, and the
   * rest is laid out round the held ones: a group with held members starts from them, and when held elements on the
   * world's first map agree on where that map stood, the map is put back there. A pinned element stands at its Pin
   * whatever is held for it. An id that is no node is passed over. Absent, null or empty: the method as it is.
   */
  held?: ReadonlyMap<string, ArrayLike<number>> | Readonly<Record<string, ArrayLike<number>>> | null;
  /**
   * The step the held points were rounded to, in the answer's units (a saver that keeps whole numbers: 1), so the
   * map's place is still found from rounded points. A finite number from 0 to an eighth of `BY_LINKS_3D_REST`;
   * absent or null: 0.
   */
  heldUnit?: number | null;
}

/**
 * How `layoutByLinks3d` placed an element: `centre` (a group's centre), `with` (in a centre's group), `arm` (hanging
 * off the body, more than one link out or with links of its own), `link` (an element whose only link is to the body),
 * `shelf` (not joined to the main piece, on a shelf under the picture), `map` (at its Pin on the world's map).
 */
export type OwLayout3dHow = 'centre' | 'with' | 'arm' | 'link' | 'shelf' | 'map';

/** The part an element with no centre stands in: `map` (pinned), `one-link` (`arm` or `link`) or `no-link` (`shelf`). */
export type OwLayout3dPart = 'map' | 'one-link' | 'no-link';

/** What `layoutByLinks3d` answers: one row per node, in the order the nodes were handed in. */
export interface OwLayoutByLinks3d {
  /** The method's word. It is the tool's own until the method's page is published; until then a release may move its points. */
  method: 'by-links-3d';
  /** The nodes' ids, in the order handed in. */
  ids: string[];
  /** x, y, z of `ids[i]` at `3 * i`, in units where a link at rest is `BY_LINKS_3D_REST` long. */
  points: Float64Array;
  /** How each element was placed. */
  how: OwLayout3dHow[];
  /** The id of the centre the element stands with (a centre's own id, a pinned centre's too), or null. */
  group: Array<string | null>;
  /** Null where `group` is an id; else the part the element stands in. */
  part: Array<OwLayout3dPart | null>;
  /** The centres' ids, in rank order. */
  centres: string[];
  /**
   * True where the point answered is the element's held point; false everywhere when nothing is held. A pinned element
   * stands at its Pin and is never held, so false does not mean new: what is new is every id that was not handed in.
   */
  held: boolean[];
}

const KEYS = ['held', 'heldUnit'] as const;

/**
 * Lay out a whole graph in three dimensions by its links.
 *
 * The body of the graph (its largest piece that no single element's removal parts) is cut into groups round its
 * centres, the elements with most links (twelve at most, more when a group that holds over half the body is split); the groups are packed apart in directions read from a table baked
 * into the package, and for 300 seeded force steps links pull, near elements push apart and every element is held
 * to its group's point. What hangs off the body by one element is fanned out from it, and what is not joined to the
 * main piece stands on a shelf under the picture. When the world has a Map that holds three or more elements of the
 * graph by a Pin, the Map that holds the most (a tie to the greater id) is a flat plate, each of its pinned elements
 * at its Pin, the groups whose centre is pinned standing over it; a Map over a place on that plate is a small plate
 * a little above it. A Map whose width or height is not over 0 is no plate, and when it is the Map that holds the
 * most, the world is laid out by its links alone. A Pin's z is not read: the plate is flat. A layout map (a Map whose `x_layout` names a method,
 * the map-space profile's mark) is never the plate: a saved layout never stands in for the world's own space.
 *
 * `graph` is `worldGraph`'s answer, or any graph of the same shape; `elements` the world's elements as served (only
 * Map and Pin elements are read, by `mapSpace` and `layoutOf`), or null or absent for none. The graph is first put in
 * one order (nodes by id in code point order; links by source, field, index, then target), so the order the nodes and
 * links are handed in moves no point. The same input gives the same points in every runtime: to the last bit for
 * every element placed `centre`, `with` or `map`, and within a billionth of a rest for the rest, which are placed
 * with the runtime's own cosine and sine.
 *
 * `options.held` hands back points an earlier answer gave, so the picture keeps still as the world changes; with
 * `options.heldUnit` when they were rounded. A held element that is still a node and is not pinned stands at its held
 * point, and the answer's `held` says which. Refused before any step of the layout runs, each an error with a `code`: `held` that
 * is not a Map or a plain object, TypeError `held-not-object`; a held value that is not three finite numbers,
 * TypeError `held-not-point`; held points (every one handed in, an id that is no node's too) spread wider than 768
 * rests on any axis, RangeError `held-box`; a `heldUnit` that is not null and not a finite number from 0 to an eighth
 * of a rest, RangeError `held-unit`. An unknown option key is refused first, by name, with a TypeError. Two nodes
 * with one id throw.
 *
 * The method's word, `by-links-3d`, is the tool's own until the method's page is published, and until then a release
 * may move its points.
 */
export function layoutByLinks3d(graph: OwLayoutGraph, elements?: readonly unknown[] | null, options?: OwLayoutByLinks3dOptions): OwLayoutByLinks3d {
  refuseUnknownOptions('layoutByLinks3d', options, KEYS);
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new TypeError('layoutByLinks3d: the graph is { nodes, edges }, as worldGraph answers it');
  }
  const rows = spaceRows(elements);
  return layout3d(graph.nodes, graph.edges, rows, LAYOUT_DIRECTIONS, options ?? {});
}

