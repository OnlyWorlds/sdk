/**
 * A 3D layout method for a world nobody laid out, read from its graph and its Maps and Pins: `by-links-3d`.
 *
 * The parts live in src/layout3d/, one file a step (pieces.ts joins the runs), and the directions table is baked into
 * the package (layout-directions.generated.ts). The method is exact where it can be: everything but the cosine and
 * sine that place what hangs off the body, and the arcsine, cosine and sine that set the pieces on their ring, is
 * addition, subtraction, multiplication, division, square root and floor, which every runtime rounds alike.
 */
import type { OwLayoutGraph } from './layout-by-kind';
import { placedIds } from './layout-by-kind';
import { byCodePoint } from './lens';
import { refuseUnknownOptions } from './options';
import { LAYOUT_DIRECTIONS } from './layout-directions.generated';
import { layoutPieces } from './layout3d/pieces';
import { spaceRows } from './layout3d/space';

/** The rest length of the by-links-3d layout: a link's length at rest, and the unit of its answer's points. */
export const BY_LINKS_3D_REST = 60;

/**
 * The version of `layoutByLinks3d`'s answers: raised whenever the answer to any case of the method's fixture
 * changes (a constant, a rule, a fix that moves a point), and never for a release that moves none. A tool that keeps
 * a picture to hand back as `held` stores it beside the points and reads another value as no picture kept, so a
 * change to the method lays the world out fresh instead of holding points the method no longer gives.
 */
export const BY_LINKS_3D_VERSION = 2;

/** `layoutByLinks3d`'s options. */
export interface OwLayoutByLinks3dOptions {
  /**
   * Points an earlier call answered, to keep a picture still as the world changes: element id to `[x, y, z]` (an
   * Array or a typed array of exactly three finite numbers; a slice of an earlier answer's `points` will do), as a
   * Map or a plain object. A held element that is still a node and is not pinned stands at its held point, and the
   * rest is laid out round the held ones: a group with held members starts from them, and when held elements on the
   * world's first map agree on where that map stood, the map is put back there. A piece with a held element is laid
   * out round it and not moved. A pinned element stands at its Pin whatever is held for it. An id that is no node is
   * passed over, and so is an element with no link that is not pinned: it is not placed. Absent, null or empty: the
   * method as it is.
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
 * `map` (at its Pin on the world's map). An element of a piece other than the main one takes the word its own piece's
 * layout gives it.
 */
export type OwLayout3dHow = 'centre' | 'with' | 'arm' | 'link' | 'map';

/** The part an element with no centre stands in: `map` (pinned) or `one-link` (`arm` or `link`). */
export type OwLayout3dPart = 'map' | 'one-link';

/**
 * What `layoutByLinks3d` answers: one row per placed node, in the order the nodes were handed in, and the ids of the
 * nodes it does not place.
 */
export interface OwLayoutByLinks3d {
  /** The method's word, `by-links-3d`, as the layout profile's page names it. */
  method: 'by-links-3d';
  /** The placed nodes' ids, in the order handed in (a node in `unplaced` is left out). */
  ids: string[];
  /** x, y, z of `ids[i]` at `3 * i`, in units where a link at rest is `BY_LINKS_3D_REST` long. */
  points: Float64Array;
  /** How each element was placed. */
  how: OwLayout3dHow[];
  /** The id of the centre the element stands with (a centre's own id, a pinned centre's too), or null. */
  group: Array<string | null>;
  /** Null where `group` is an id; else the part the element stands in. */
  part: Array<OwLayout3dPart | null>;
  /**
   * The centres' ids: the main shape's in rank order, then each other piece's in its own rank order, the pieces by
   * size (most nodes first; among equals, the one holding the lowest id first).
   */
  centres: string[];
  /**
   * True where the point answered is the element's held point; false everywhere when nothing is held. A pinned element
   * stands at its Pin and is never held, so false does not mean new: what is new is every id that was not handed in.
   */
  held: boolean[];
  /**
   * The ids of the nodes not placed, by id in code point order: every node linked to no other node and pinned on no
   * map, a held one too. `unplacedByLinks3d` gives the same list for the Map this answer makes.
   */
  unplaced: string[];
}

const KEYS = ['held', 'heldUnit'] as const;

/**
 * Lay out a whole graph in three dimensions by its links.
 *
 * The body of the graph (its largest piece that no single element's removal parts) is cut into groups round its
 * centres, the elements with most links (twelve at most, more when a group that holds over half the body is split); the groups are packed apart in directions read from a table baked
 * into the package, and for 300 seeded force steps links pull, near elements push apart and every element is held
 * to its group's point. What hangs off the body by one element is fanned out from it. When the world has a Map that holds three or more elements of the
 * graph by a Pin, the Map that holds the most (a tie to the greater id) is a flat plate, each of its pinned elements
 * at its Pin, the groups whose centre is pinned standing over it; a Map over a place on that plate is a small plate
 * a little above it. A Map whose width or height is not over 0 is no plate, and when it is the Map that holds the
 * most, the world is laid out by its links alone. A Pin's z is not read: the plate is flat. A layout map (a Map whose `x_layout` names a method,
 * the map-space profile's mark) is never the plate: a saved layout never stands in for the world's own space.
 *
 * Every other piece of linked elements (elements joined by a path of links) is laid out the same way on its own. A
 * piece with a pinned or held element stands where those points put it; every other one stands on a ring round the
 * main shape, in the plane of its middle, the largest pieces first, a ring holding as many as fit before the next
 * opens further out. An element linked to no other and pinned on no map is not placed: it is left out of the rows and
 * listed, by id, in `unplaced`.
 *
 * `graph` is `worldGraph`'s answer, or any graph of the same shape; `elements` the world's elements as served (only
 * Map and Pin elements are read, by `mapSpace` and `layoutOf`), or null or absent for none. The graph is first put in
 * one order (nodes by id in code point order; links by source, field, index, then target), so the order the nodes and
 * links are handed in moves no point. The same input gives the same points in every runtime: to the last bit for
 * every element placed `centre`, `with` or `map` off the ring, and within a billionth of a rest for the rest, which
 * are placed with the runtime's own cosine and sine (and, on the ring, its arcsine).
 *
 * `options.held` hands back points an earlier answer gave, so the picture keeps still as the world changes; with
 * `options.heldUnit` when they were rounded. A held element that is still a node and is not pinned stands at its held
 * point, and the answer's `held` says which. Refused before any step of the layout runs, each an error with a `code`: `held` that
 * is not a Map or a plain object, TypeError `held-not-object`; a held value that is not three finite numbers,
 * TypeError `held-not-point`; a `heldUnit` that is not null and not a finite number from 0 to an eighth of a rest,
 * RangeError `held-unit`; then, as each piece is laid out (the main one first, then the others by size), the held
 * points that piece holds (a pinned element's Pin among them in a piece other than the main one) spread wider than
 * 768 rests on any axis, RangeError `held-box`. An unknown option key is refused first, by name, with a TypeError.
 * Two nodes with one id throw.
 *
 * The method's word, `by-links-3d`, is the layout profile's: a change that moves any point is a new method with a
 * new word, and `BY_LINKS_3D_VERSION` is raised when a release moves an answer.
 */
export function layoutByLinks3d(graph: OwLayoutGraph, elements?: readonly unknown[] | null, options?: OwLayoutByLinks3dOptions): OwLayoutByLinks3d {
  refuseUnknownOptions('layoutByLinks3d', options, KEYS);
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new TypeError('layoutByLinks3d: the graph is { nodes, edges }, as worldGraph answers it');
  }
  const rows = spaceRows(elements);
  return layoutPieces(graph.nodes, graph.edges, rows, LAYOUT_DIRECTIONS, options ?? {}) as OwLayoutByLinks3d;
}

/**
 * What a saved `by-links-3d` layout map does not place: the ids of the graph's nodes that are not in `placed`, by id
 * in code point order. Every node counts, of any type, also one the method would not place (linked to no other and
 * pinned on no map), so for the Map an answer makes this is that answer's own `unplaced`. `placed` is the ids of the elements the Map's Pins stand for, a list or a Set: from `mapSpace`,
 * the `element_id` of each pin whose `map` is this Map. A member that is not a non-empty string (a Pin that stands
 * for no element) is passed over, and an id that is no node of the graph is no part of the answer. The answer's
 * length is the count a tool shows; reading or drawing a layout map never changes it. Throws a TypeError on a graph
 * that is not `{ nodes, edges }` or a `placed` that is not a list or a Set, and, as `layoutByLinks3d` does, when two
 * nodes share an id.
 */
export function unplacedByLinks3d(graph: OwLayoutGraph, placed: Iterable<unknown>): string[] {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new TypeError('unplacedByLinks3d: the graph is { nodes, edges }, as worldGraph answers it');
  }
  const taken = placedIds('unplacedByLinks3d', placed);
  const ids = graph.nodes.map((x) => x.id).sort(byCodePoint);
  for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) throw new Error(`unplacedByLinks3d: two nodes share the id ${ids[i]}`);
  return ids.filter((id) => !taken.has(id));
}

