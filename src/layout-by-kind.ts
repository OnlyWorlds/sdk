/**
 * Two layout methods for a world nobody laid out, read from its graph as `worldGraph` answers it.
 *
 * `by-kind`: each kind of element gets a point on a circle, links act as springs, neighbours push apart, for a fixed
 * number of seeded steps; the answer is fitted into a square. `around`: one element at the centre, its neighbours on
 * rings round it, and at two steps their neighbours further out, near the element that reached them.
 *
 * Both are exact: the same graph gives the same points to the last bit, in every browser and in the Python package.
 * The kinds' points on the circle are read from a table of numbers baked into the package, never computed with the
 * runtime's own cosine and sine (which differ in the last place between runtimes); everything else is addition,
 * subtraction, multiplication, division, square root and floor, which every runtime rounds alike.
 */
import { ELEMENT_GROUPS, GROUP_ORDER } from './v2/types.generated';
import type { ElementType } from './v2/types.generated';
import { LAYOUT_ANCHORS } from './layout-anchors.generated';
import { byCodePoint } from './lens';
import { refuseUnknownOptions } from './options';

/** A graph to lay out: `worldGraph`'s answer, or any graph of the same shape. */
export interface OwLayoutGraph {
  /** The elements, each with its id, its type as a slug (`character`) and, for `layoutAround`, its name. */
  nodes: ReadonlyArray<{ id: string; type: string; name?: string | null }>;
  /**
   * The links, each from `source` to `target` by id, with the link field's name and the place in it as `worldGraph`
   * gives them. A link to an id that is not a node is passed over.
   */
  edges: ReadonlyArray<{ source: string; target: string; field?: string; index?: number }>;
}

type LayoutNode = OwLayoutGraph['nodes'][number];
type LayoutEdge = OwLayoutGraph['edges'][number];

/** One element's point, in a frame of -1 to 1 on the picture's longer axis, centred. */
export interface OwLayoutPoint {
  id: string;
  x: number;
  y: number;
}

/** What `layoutByKind` answers: one point per node, in the graph's node order, and the method that made them. */
export interface OwLayoutByKind {
  method: 'by-kind';
  /**
   * Always 1. A method's word is its version: a method that changes takes a new word, so read `method`, never this number.
   * @deprecated The layout profile's mark carries no version key. Leaves in 5.0.
   */
  version: 1;
  points: OwLayoutPoint[];
}

/** One element's point round the focus: the focus at 0, 0, and how many links away from it the element is. */
export interface OwLayoutAroundPoint {
  id: string;
  /** 0 for the focus, 1 for its neighbours, 2 for theirs. */
  depth: number;
  x: number;
  y: number;
}

/** What `layoutAround` answers: the focus and every element within the steps, in the graph's node order. */
export interface OwLayoutAround {
  method: 'around';
  /**
   * Always 1. A method's word is its version: a method that changes takes a new word, so read `method`, never this number.
   * @deprecated The layout profile's mark carries no version key. Leaves in 5.0.
   */
  version: 1;
  points: OwLayoutAroundPoint[];
}

/** `layoutAround`'s options. */
export interface OwLayoutAroundOptions {
  /** How many links out from the focus: 1 (the default) or 2. */
  steps?: 1 | 2;
}

const STEPS = 320;
const CELL_MAX = 12;
const RING_ONE = 60;

const cellKey = (x: number, y: number): number => (x + 1048576) * 2097152 + (y + 1048576);
/** The 32-bit linear congruential generator, exact in float64 in every language. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const groupRank = (type: string): number => GROUP_ORDER.indexOf(ELEMENT_GROUPS[type as ElementType]);

/**
 * Check the graph, then put it in the method's one order, whatever order the caller handed: the nodes by id, the
 * edges by source, then field (none as ''), then index (none as 0), then target, every word in code point order.
 * `worldGraph` answers in this order already. Answers the ordered graph and each node's place in it by id.
 */
function readGraph(fn: string, graph: OwLayoutGraph): { nodes: LayoutNode[]; edges: LayoutEdge[]; index: Map<string, number> } {
  const fail = (msg: string): never => {
    throw new TypeError(`${fn}: ${msg}`);
  };
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail('the graph is { nodes, edges }, as worldGraph answers it');
  }
  const seen = new Set<string>();
  graph.nodes.forEach((node, i) => {
    if (!node || typeof node !== 'object') fail(`node ${i} is not an object`);
    if (typeof node.id !== 'string' || !node.id) fail(`node ${i} has no id`);
    if (typeof node.type !== 'string' || !Object.prototype.hasOwnProperty.call(ELEMENT_GROUPS, node.type)) {
      fail(`node ${node.id}: '${String(node.type)}' is not one of the 22 element types`);
    }
    if (node.name !== undefined && node.name !== null && typeof node.name !== 'string') fail(`node ${node.id}: name is a string or null`);
    if (seen.has(node.id)) fail(`the id ${node.id} is a node twice`);
    seen.add(node.id);
  });
  graph.edges.forEach((e, k) => {
    if (!e || typeof e !== 'object' || typeof e.source !== 'string' || typeof e.target !== 'string') fail(`edge ${k} is not { source, target }`);
    if (e.field !== undefined && typeof e.field !== 'string') fail(`edge ${k}: field is a string`);
    if (e.index !== undefined && !Number.isFinite(e.index)) fail(`edge ${k}: index is a number`);
  });
  const nodes = [...graph.nodes].sort((a, b) => byCodePoint(a.id, b.id));
  const edges = [...graph.edges].sort((a, b) => byCodePoint(a.source, b.source) || byCodePoint(a.field ?? '', b.field ?? '')
    || (a.index ?? 0) - (b.index ?? 0) || byCodePoint(a.target, b.target));
  return { nodes, edges, index: new Map(nodes.map((x, i) => [x.id, i])) };
}

/**
 * Lay out a whole graph by kind. Each kind present gets an anchor on a circle, in colour group order (`GROUP_ORDER`)
 * and then by type word; every element starts near its kind's anchor, at a seeded jitter. Then, for 320 steps (160
 * past 2,000 elements): elements closer than a few rest lengths push each other apart (a cell holding more than 12
 * pushes with a rotating sample of 12, scaled up), every link pulls its two ends towards a rest length, every element
 * is drawn back towards its kind's anchor, and no element moves further in one step than a cap that shrinks as the
 * steps run out. Last, the points are fitted into a frame of -1 to 1 on the longer axis, centred, proportions kept.
 *
 * The graph is first put in one order (nodes by id; links by source, field, index, then target), so the order the
 * nodes and links are handed in moves nothing. Answers one point per node in the order the nodes were handed in, with
 * the method's name (`by-kind`; the word is the method's version, and `version` stays 1), so a saved layout can say what made it. An empty graph answers no points; a graph of one element answers 0, 0.
 * The same graph gives the same points to the last bit in every browser and language: the anchors are a baked
 * table of numbers, never computed, and the rest is arithmetic every runtime rounds alike. Self-links pull nothing;
 * a link to an id that is not a node is passed over. Throws a TypeError, naming what, on a graph it cannot read:
 * no nodes or edges list, a node with no id, a type that is not one of the 22, an id twice.
 */
export function layoutByKind(graph: OwLayoutGraph): OwLayoutByKind {
  const { nodes, edges: links, index } = readGraph('layoutByKind', graph);
  const n = nodes.length;
  if (n <= 1) return { method: 'by-kind', version: 1, points: graph.nodes.map((x) => ({ id: x.id, x: 0, y: 0 })) };

  const edges: [number, number][] = [];
  for (const e of links) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a !== undefined && b !== undefined && a !== b) edges.push([a, b]);
  }
  const types = [...new Set(nodes.map((x) => x.type))].sort((a, b) => groupRank(a) - groupRank(b) || byCodePoint(a, b));
  const k = types.length;
  const anchorX = new Map<string, number>();
  const anchorY = new Map<string, number>();
  types.forEach((t, i) => {
    anchorX.set(t, LAYOUT_ANCHORS[k * (k - 1) + 2 * i]);
    anchorY.set(t, LAYOUT_ANCHORS[k * (k - 1) + 2 * i + 1]);
  });

  const R = rng(7);
  const px = new Array<number>(n);
  const py = new Array<number>(n);
  const tx = new Array<number>(n);
  const ty = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ax = anchorX.get(nodes[i].type)!;
    const ay = anchorY.get(nodes[i].type)!;
    px[i] = ax * 0.8 + (R() - 0.5) * 0.5;
    py[i] = ay * 0.8 + (R() - 0.5) * 0.5;
    tx[i] = ax * 0.85;
    ty[i] = ay * 0.85;
  }
  const rest = Math.max(0.002, 0.9 / Math.sqrt(n));
  const push = rest * rest * 1.4;
  const cell = rest * 2.2;
  const cell2 = cell * cell;
  const fx = new Array<number>(n);
  const fy = new Array<number>(n);
  const steps = n > 2000 ? STEPS / 2 : STEPS;

  for (let it = 0; it < steps; it++) {
    const t = 1 - it / steps;
    fx.fill(0);
    fy.fill(0);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(px[i] / cell), Math.floor(py[i] / cell));
      const c = grid.get(key);
      if (c) c.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] / cell);
      const cy = Math.floor(py[i] / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cellOf = grid.get(cellKey(cx + dx, cy + dy));
          if (!cellOf) continue;
          if (cellOf.length > CELL_MAX) {
            // A crowded cell: a sample of 12 that turns with the element and the step, each push scaled up to the whole.
            const len = cellOf.length;
            const off = (i * 7 + it * 13) % len;
            const scale = len / CELL_MAX;
            for (let s = 0; s < CELL_MAX; s++) {
              const j = cellOf[(off + s) % len];
              if (j === i) continue;
              const ux = px[i] - px[j];
              const uy = py[i] - py[j];
              const d2 = ux * ux + uy * uy + 1e-6;
              if (d2 > cell2) continue;
              const d = Math.sqrt(d2);
              const f = (push * scale) / d2;
              fx[i] += (ux / d) * f;
              fy[i] += (uy / d) * f;
            }
            continue;
          }
          for (const j of cellOf) {
            if (j <= i) continue;
            const ux = px[i] - px[j];
            const uy = py[i] - py[j];
            const d2 = ux * ux + uy * uy + 1e-6;
            if (d2 > cell2) continue;
            const d = Math.sqrt(d2);
            const f = push / d2;
            fx[i] += (ux / d) * f;
            fy[i] += (uy / d) * f;
            fx[j] -= (ux / d) * f;
            fy[j] -= (uy / d) * f;
          }
        }
      }
    }
    for (const [a, b] of edges) {
      const ux = px[b] - px[a];
      const uy = py[b] - py[a];
      const d = Math.sqrt(ux * ux + uy * uy) + 1e-6;
      const f = (d - rest) * 0.06;
      fx[a] += (ux / d) * f;
      fy[a] += (uy / d) * f;
      fx[b] -= (ux / d) * f;
      fy[b] -= (uy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      fx[i] += (tx[i] - px[i]) * 0.06;
      fy[i] += (ty[i] - py[i]) * 0.06;
      const m = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]);
      const cap = 0.03 * t + 0.002;
      const s = m > cap ? cap / m : 1;
      px[i] += fx[i] * s;
      py[i] += fy[i] * s;
    }
  }

  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, px[i]);
    x1 = Math.max(x1, px[i]);
    y0 = Math.min(y0, py[i]);
    y1 = Math.max(y1, py[i]);
  }
  const span = Math.max(x1 - x0, y1 - y0);
  const s = span > 1e-9 ? 2 / span : 1;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return {
    method: 'by-kind',
    version: 1,
    points: graph.nodes.map((x) => {
      const i = index.get(x.id)!;
      return { id: x.id, x: (px[i] - mx) * s, y: (py[i] - my) * s };
    }),
  };
}

/**
 * Lay out one element and what is linked to it. The focus stands at 0, 0. Its neighbours (one link away, either
 * direction) stand on a ring round it, in colour group order, then by type word, then by name (code point order, the
 * same in every language and locale), up to 60 on the first ring and further rings beyond it. With `steps: 2`, each
 * neighbour's own neighbours stand on an outer ring, fanned out near the neighbour that reached them.
 *
 * The graph is first put in one order, as `layoutByKind` puts it, so the order the nodes and links are handed in
 * moves nothing. Answers the focus and every element within the steps, in the order the nodes were handed in, each
 * with its depth (0, 1 or 2), and the method's name (`around`; the word is the method's version, and `version` stays 1). Nothing iterates, so each point is one cosine and one sine of an
 * angle the method computes exactly; runtimes agree to within about 1e-12. Throws a TypeError on an unknown option
 * (before anything else), a `steps` that is not 1 or 2, a graph it cannot read (as `layoutByKind`), or a focus that
 * is not one of the graph's nodes.
 */
export function layoutAround(graph: OwLayoutGraph, focus: string, options?: OwLayoutAroundOptions): OwLayoutAround {
  const { N, index, centre, depth, via } = reachAround('layoutAround', graph, focus, options);
  const name = (j: number): string => N[j].name ?? '';
  const ring1 = [...depth].filter(([, s]) => s === 1).map(([j]) => j)
    .sort((a, b) => groupRank(N[a].type) - groupRank(N[b].type) || byCodePoint(N[a].type, N[b].type) || byCodePoint(name(a), name(b)) || a - b);

  const at = new Map<number, [number, number]>([[centre, [0, 0]]]);
  const angle = new Map<number, number>();
  if (ring1.length) {
    const first = Math.min(ring1.length, RING_ONE);
    const r1 = Math.max(0.34, first * 0.017);
    const gap = (2 * Math.PI * r1) / first;
    let placed = 0;
    let r = r1;
    while (placed < ring1.length) {
      const room = Math.max(1, Math.floor((2 * Math.PI * r) / gap));
      const these = ring1.slice(placed, placed + room);
      these.forEach((j, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / these.length;
        angle.set(j, a);
        at.set(j, [Math.cos(a) * r, Math.sin(a) * r]);
      });
      placed += these.length;
      r += gap * 1.2;
    }
    const outer = r - gap * 1.2;
    const kids = new Map<number, number[]>();
    for (const [j, s] of depth) {
      if (s !== 2) continue;
      const p = via.get(j)!;
      const l = kids.get(p);
      if (l) l.push(j);
      else kids.set(p, [j]);
    }
    for (const [p, ks] of kids) {
      const a0 = angle.get(p) ?? 0;
      const spread = Math.min(0.5, ((2 * Math.PI) / Math.max(1, ring1.length)) * 0.9);
      ks.forEach((j, k) => {
        const a = a0 + (ks.length === 1 ? 0 : (k / (ks.length - 1) - 0.5) * spread);
        at.set(j, [Math.cos(a) * outer * 1.8, Math.sin(a) * outer * 1.8]);
      });
    }
  }
  const points: OwLayoutAroundPoint[] = [];
  for (const x of graph.nodes) {
    const j = index.get(x.id)!;
    const p = at.get(j);
    if (p) points.push({ id: x.id, depth: depth.get(j)!, x: p[0], y: p[1] });
  }
  return { method: 'around', version: 1, points };
}

/**
 * What `around` reaches: the checks `layoutAround` makes, in its order, then each node within the steps with its
 * depth and the node it was reached from, in the order found. `fn` is the caller's name, for its refusals.
 */
function reachAround(fn: string, graph: OwLayoutGraph, focus: string, options?: OwLayoutAroundOptions): {
  N: LayoutNode[]; index: Map<string, number>; centre: number; depth: Map<number, number>; via: Map<number, number>;
} {
  if (options !== undefined && options !== null && (typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError(`${fn}: options is an object, { steps }`);
  }
  refuseUnknownOptions(fn, options, ['steps']);
  const steps = options?.steps ?? 1;
  if (steps !== 1 && steps !== 2) throw new TypeError(`${fn}: steps is 1 or 2, not ${String(steps)}`);
  const { nodes: N, edges: links, index } = readGraph(fn, graph);
  const centre = typeof focus === 'string' ? index.get(focus) : undefined;
  if (centre === undefined) throw new TypeError(`${fn}: the focus ${String(focus)} is not a node of the graph`);

  const adj: number[][] = N.map(() => []);
  for (const e of links) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined) continue;
    adj[a].push(b);
    if (a !== b) adj[b].push(a);
  }
  const depth = new Map<number, number>([[centre, 0]]);
  const via = new Map<number, number>();
  let frontier = [centre];
  for (let s = 1; s <= steps; s++) {
    const next: number[] = [];
    for (const a of frontier) {
      for (const to of adj[a]) {
        if (depth.has(to)) continue;
        depth.set(to, s);
        via.set(to, a);
        next.push(to);
      }
    }
    frontier = next;
  }
  return { N, index, centre, depth, via };
}

/** `placed` as a set of ids: a list or a Set; a member that is not a non-empty string is passed over. */
export function placedIds(fn: string, placed: Iterable<unknown>): Set<string> {
  if (placed === null || placed === undefined || typeof placed === 'string' || typeof (placed as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') {
    throw new TypeError(`${fn}: placed is a list or a Set of element ids`);
  }
  const ids = new Set<string>();
  for (const v of placed) if (typeof v === 'string' && v !== '') ids.add(v);
  return ids;
}

/**
 * What a saved `by-kind` layout map does not place (the default layouts' page, `unplaced`): the ids of the graph's
 * nodes that are not in `placed`, by id in code point order. `placed` is the ids of the elements the Map's Pins
 * stand for, a list or a Set: from `mapSpace`, the `element_id` of each pin whose `map` is this Map. A member that
 * is not a non-empty string (a Pin that stands for no element) is passed over, and an id that is no node of the
 * graph is no part of the answer. The answer's length is the count a tool shows; it does not say why an element has
 * no Pin, and reading or drawing a layout map never changes it (the map-space profile's rule 8). Throws a
 * TypeError on a graph it cannot read (as `layoutByKind`) or a `placed` that is not a list or a Set.
 */
export function unplacedByKind(graph: OwLayoutGraph, placed: Iterable<unknown>): string[] {
  const ids = placedIds('unplacedByKind', placed);
  const { nodes } = readGraph('unplacedByKind', graph);
  return nodes.map((x) => x.id).filter((id) => !ids.has(id));
}

/**
 * What a saved `around` layout map does not place: the ids of the focus and every node within the steps that are
 * not in `placed`, by id in code point order. `placed` is read as `unplacedByKind` reads it; an id in it that
 * `around` would not place (no node, or a node further out than the steps) is no part of the answer. Throws as
 * `layoutAround` does, and on a `placed` that is not a list or a Set.
 */
export function unplacedAround(graph: OwLayoutGraph, focus: string, placed: Iterable<unknown>, options?: OwLayoutAroundOptions): string[] {
  const { N, depth } = reachAround('unplacedAround', graph, focus, options);
  const ids = placedIds('unplacedAround', placed);
  return N.filter((x, j) => depth.has(j) && !ids.has(x.id)).map((x) => x.id);
}
