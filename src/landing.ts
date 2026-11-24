/**
 * The landing profile (schema-dist profiles/landing.md): a world's first picture at a door, read from the graph
 * `worldGraph` answers. A real world shows its most-linked Characters, each with what it links; a small one shows
 * its gaps. Structure only, never coordinates: a layout is the drawing tool's, keyed by id.
 */
import { byCodePoint, isBody, valueOf } from './lens';
import type { OwWorldGraph } from './graph';
import { refuseUnknownOptions } from './options';

/** Which part a door draws first: `gaps` under the size, `graph` at it and above. */
export type OwLandingMode = 'gaps' | 'graph';

/** `heads` (default 5), `hops` (default 1) and `size` (default 24), each a whole number, 1 or more; null is the default. */
export interface OwLandingOptions {
  heads?: number | null;
  hops?: number | null;
  size?: number | null;
}

export interface OwLandingMember {
  id: string;
  /** Steps from the head: 0 for the head itself. */
  hops: number;
  degree: number;
}

export interface OwLandingCluster {
  head: string;
  /** The head first, then by hops, then by degree (highest first), then by id in code point order. */
  members: OwLandingMember[];
}

export type OwLandingGapKind = 'orphan' | 'near_orphan' | 'no_place' | 'nobody_here';

export interface OwLandingGap {
  kind: OwLandingGapKind;
  id: string;
}

export interface OwLanding {
  mode: OwLandingMode;
  /** The size the mode was read at. */
  size: number;
  clusters: OwLandingCluster[];
  /** Every node no head reaches within `hops`, by degree (highest first), then by id. */
  unclustered: { id: string; degree: number }[];
  /** In the kinds' order (orphan, near_orphan, no_place, nobody_here), then by id; a node can carry several. */
  gaps: OwLandingGap[];
}

const OPTION_KEYS = ['heads', 'hops', 'size'] as const;
const GAP_ORDER: readonly OwLandingGapKind[] = ['orphan', 'near_orphan', 'no_place', 'nobody_here'];

function whole(opts: Record<string, unknown>, key: string, fallback: number): number {
  const v = valueOf(opts, key);
  if (v === null) return fallback;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new RangeError(`landingOf: ${key} is a whole number, 1 or more; got ${JSON.stringify(v) ?? typeof v}.`);
  }
  return v;
}

/**
 * A world's first picture at a door, from the graph `worldGraph` answered for the visitor, so it holds exactly what
 * that reader may see. The mode is `gaps` when the graph has fewer nodes than `size`, else `graph`; both parts are
 * always read. Heads: the Characters with an edge, most linked first (`degreeOf`'s count), ties by id in code point
 * order, at most `heads`, never a known-of node. A node within `hops` steps of a head (either way along an edge)
 * joins the nearest head, a tie going to the higher-ranked one. Gaps: the links report's orphans (degree 0) and
 * near-orphans (degree 1), a Character whose `location` names no Location node (`no_place`), a Location no
 * Character's `location` names (`nobody_here`); a known-of node is never a gap. The same graph and options give the
 * same answer, byte for byte. An unknown option, or one that is not a whole number of 1 or more, is refused by name.
 */
export function landingOf(graph: OwWorldGraph, options?: OwLandingOptions | null): OwLanding {
  if (!isBody(graph) || !Array.isArray((graph as unknown as Record<string, unknown>).nodes)
    || !Array.isArray((graph as unknown as Record<string, unknown>).edges)) {
    throw new TypeError('landingOf: graph is what worldGraph answers, an object with nodes and edges lists.');
  }
  if (options !== undefined && options !== null && !isBody(options)) {
    throw new TypeError(`landingOf: options is an object, such as { heads: 5 }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions('landingOf', options, OPTION_KEYS);
  const opts = (isBody(options) ? options : {}) as Record<string, unknown>;
  const k = whole(opts, 'heads', 5);
  const reach = whole(opts, 'hops', 1);
  const size = whole(opts, 'size', 24);

  // Maps, not objects, while counting: an id such as `constructor` is no inherited key here.
  const degree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const near = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set<string>()]));
  const type = new Map<string, string>(graph.nodes.map((n) => [n.id, n.type]));
  const add = (id: string) => { const d = degree.get(id); if (d !== undefined) degree.set(id, d + 1); };
  const placed = new Set<string>();
  const inhabited = new Set<string>();
  for (const e of graph.edges) {
    add(e.source);
    if (e.target !== e.source) add(e.target);
    if (e.target !== e.source && near.has(e.source) && near.has(e.target)) {
      near.get(e.source)!.add(e.target);
      near.get(e.target)!.add(e.source);
    }
    if (e.field === 'location' && type.get(e.source) === 'character' && type.get(e.target) === 'location') {
      placed.add(e.source);
      inhabited.add(e.target);
    }
  }
  const deg = (id: string) => degree.get(id) ?? 0;

  const heads = graph.nodes
    .filter((n) => n.type === 'character' && n.known_of !== true && deg(n.id) > 0)
    .map((n) => n.id)
    .sort((a, b) => (deg(b) - deg(a)) || byCodePoint(a, b))
    .slice(0, k);

  // Each node's least (hops, rank) over every head's own walk, so no queue order ever decides a tie.
  const best = new Map<string, { hops: number; rank: number }>();
  heads.forEach((head, rank) => {
    const seen = new Map<string, number>([[head, 0]]);
    let frontier = [head];
    for (let step = 0; step < reach && frontier.length; step++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of near.get(id) ?? []) {
          if (seen.has(nb)) continue;
          seen.set(nb, step + 1);
          next.push(nb);
        }
      }
      frontier = next;
    }
    for (const [id, hops] of seen) {
      const b = best.get(id);
      if (!b || hops < b.hops || (hops === b.hops && rank < b.rank)) best.set(id, { hops, rank });
    }
  });

  const clusters: OwLandingCluster[] = heads.map((head) => ({ head, members: [] }));
  const unclustered: { id: string; degree: number }[] = [];
  for (const n of graph.nodes) {
    const b = best.get(n.id);
    if (b) clusters[b.rank].members.push({ id: n.id, hops: b.hops, degree: deg(n.id) });
    else unclustered.push({ id: n.id, degree: deg(n.id) });
  }
  for (const c of clusters) c.members.sort((a, b) => (a.hops - b.hops) || (b.degree - a.degree) || byCodePoint(a.id, b.id));
  unclustered.sort((a, b) => (b.degree - a.degree) || byCodePoint(a.id, b.id));

  const gaps: OwLandingGap[] = [];
  for (const n of graph.nodes) {
    if (n.known_of === true) continue;
    const d = deg(n.id);
    if (d === 0) gaps.push({ kind: 'orphan', id: n.id });
    if (d === 1) gaps.push({ kind: 'near_orphan', id: n.id });
    if (n.type === 'character' && !placed.has(n.id)) gaps.push({ kind: 'no_place', id: n.id });
    if (n.type === 'location' && !inhabited.has(n.id)) gaps.push({ kind: 'nobody_here', id: n.id });
  }
  gaps.sort((a, b) => (GAP_ORDER.indexOf(a.kind) - GAP_ORDER.indexOf(b.kind)) || byCodePoint(a.id, b.id));

  return { mode: graph.nodes.length < size ? 'gaps' : 'graph', size, clusters, unclustered, gaps };
}

/** `perType` (default 3), a whole number, 1 or more; null is the default. */
export interface OwMostLinkedOptions {
  perType?: number | null;
}

/** One of the most linked: its id, its name as the graph holds it (null when none), its degree. */
export interface OwLinked {
  id: string;
  name: string | null;
  degree: number;
}

export interface OwMostLinked {
  /** The count per type it was read at. */
  per_type: number;
  /** By type, the types in code point order; a type with nothing to pick is left out. */
  by_type: Record<string, OwLinked[]>;
}

const MOST_LINKED_OPTION_KEYS = ['perType'] as const;

/**
 * The most linked elements of each type, from the graph `worldGraph` answered for the asker, so it holds exactly what that
 * reader may see (map space, hidden, proposed and room elements are out unless the graph brought them in). For each
 * type, its most linked elements by the landing profile's degree (`degreeOf`'s count), highest first, ties by id in
 * code point order, at most `perType` of each: a few of every type, never one ranking. It is "the most linked",
 * never "where to start": where a world has a Guide, the Guide is the start, and a door says so. A node of degree 0 and a
 * known-of node are never picked. It reads the graph it is given and folds nothing: a node's type and name are
 * echoed as written. The same graph and options give the same answer, byte for byte. A draft reading, held to the
 * package's own fixture until the landing profile takes it. An unknown option, or one that is not a whole number
 * of 1 or more, is refused by name.
 */
export function mostLinkedOf(graph: OwWorldGraph, options?: OwMostLinkedOptions | null): OwMostLinked {
  if (!isBody(graph) || !Array.isArray((graph as unknown as Record<string, unknown>).nodes)
    || !Array.isArray((graph as unknown as Record<string, unknown>).edges)) {
    throw new TypeError('mostLinkedOf: graph is what worldGraph answers, an object with nodes and edges lists.');
  }
  if (options !== undefined && options !== null && !isBody(options)) {
    throw new TypeError(`mostLinkedOf: options is an object, such as { perType: 3 }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions('mostLinkedOf', options, MOST_LINKED_OPTION_KEYS);
  const opts = (isBody(options) ? options : {}) as Record<string, unknown>;
  const raw = valueOf(opts, 'perType');
  if (raw !== null && (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1)) {
    throw new RangeError(`mostLinkedOf: perType is a whole number, 1 or more; got ${JSON.stringify(raw) ?? typeof raw}.`);
  }
  const per = raw === null ? 3 : raw;

  // A Map, not an object, while counting: an id such as `constructor` is no inherited key here.
  const degree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const add = (id: string) => { const d = degree.get(id); if (d !== undefined) degree.set(id, d + 1); };
  for (const e of graph.edges) {
    add(e.source);
    if (e.target !== e.source) add(e.target);
  }

  const byType = new Map<string, OwLinked[]>();
  for (const n of graph.nodes) {
    const d = degree.get(n.id) ?? 0;
    if (d === 0 || n.known_of === true) continue;
    const list = byType.get(n.type) ?? [];
    list.push({ id: n.id, name: typeof n.name === 'string' ? n.name : null, degree: d });
    byType.set(n.type, list);
  }
  const byTypeOut: Record<string, OwLinked[]> = {};
  for (const t of [...byType.keys()].sort(byCodePoint)) {
    byTypeOut[t] = byType.get(t)!.sort((a, b) => (b.degree - a.degree) || byCodePoint(a.id, b.id)).slice(0, per);
  }
  return { per_type: per, by_type: byTypeOut };
}
