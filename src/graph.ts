// The graph section of the lens profile (schema-dist profiles/lens.md): a reading of a world as nodes and
// edges. The elements a reader sees are the nodes, the links between them the edges. It adds nothing to the
// world and stores nothing. Who sees what is the lens reader's own reading (lens.ts), never a second copy;
// with a lens the nodes are exactly what the lens kept. The Python package's `world_graph` gives the same
// answers, byte for byte, on the same input.

import { ELEMENT_GROUPS, ELEMENT_ICONS } from './v2/types.generated';
import type { ElementGroup, ElementType } from './v2/types.generated';
import {
  CUT_REASONS, LINK_FIELDS, OWNER_ONLY, Reading, byCodePoint, checkReader, isBody, lensReading, readingDate, valueOf,
} from './lens';
import type { OwLensCutReason, OwLensReader, OwLensWorld } from './lens';
import { refuseUnknownOptions } from './options';

/** `worldGraph`'s options. Each flag is a boolean, false by default, and brings back one kind of element that is out by default. */
export interface OwGraphOptions {
  /** A lens body, or the id of a lens in the world the reader can see: the nodes are then exactly what it kept, and no flag adds to them. */
  lens?: object | string | null;
  /** The lens's reading date (as `resolveLens` takes it); read only with a lens. */
  asOf?: number | null;
  /** The lens's wall-clock time for its mail rule (as `resolveLens` takes it); read only with a lens. */
  clock?: string | null;
  /** Bring back room elements. Refused for a public reader. */
  rooms?: boolean | null;
  /** Bring back hidden elements. The owner's alone: refused from any other rung. */
  hidden?: boolean | null;
  /** Bring back elements written as proposed. The owner's alone: refused from any other rung. */
  proposed?: boolean | null;
  /** Bring back map space: Maps, Pins, Markers and Zones. Refused for a public reader. */
  mapSpace?: boolean | null;
}
const GRAPH_OPTION_KEYS = ['lens', 'asOf', 'clock', 'rooms', 'hidden', 'proposed', 'mapSpace'] as const;

/** Why a node that is out by default is in. */
export type OwGraphMark = 'room' | 'hidden' | 'proposed';

/**
 * Why an element is not a node, or an edge was left out: the lens's closed list, then the graph's own, in
 * this order: `room`, `hidden`, `proposed`, `map_space`, `reading_aid`, `outside_lens`. `outside_lens` (a link
 * to an element the reader sees that the lens neither kept nor cut) is only ever an edge's reason, and only
 * with a lens; it is never in a lens's cut.
 */
export type OwGraphCutReason = OwLensCutReason | 'room' | 'hidden' | 'proposed' | 'map_space' | 'reading_aid' | 'outside_lens';

/** One element of the graph. */
export interface OwGraphNode {
  id: string;
  /** The element's type, as its slug (`character`). */
  type: string;
  /** The element's name, or null when it has none. */
  name: string | null;
  /** The type's colour group, its colour word (`blue`, `green`, `pink` or `amber`), from the distribution's
   *  presentation defaults: a key for drawing the 22 types, never a classification and never shown as a label. */
  family: ElementGroup;
  /** The type's icon name, from the distribution's presentation defaults. */
  icon: string;
  /** The out-by-default kinds the element belongs to, in this order: `room`, `hidden`, `proposed`; absent when none. */
  marks?: OwGraphMark[];
  /** True on a guest's known-of element, a stub that has no edges out; absent otherwise. */
  known_of?: true;
}

/** One link: one source, one field, one target, at its place in the field's list (0 for a single link). */
export interface OwGraphEdge {
  source: string;
  field: string;
  target: string;
  index: number;
}

/** What `worldGraph` answers. */
export interface OwWorldGraph {
  /** The nodes, by id in code point order. */
  nodes: OwGraphNode[];
  /** The edges, by source id, then field name (both in code point order), then index. */
  edges: OwGraphEdge[];
  /** The links left out because their target is not a node, counted by the target's reason, in the reasons' one order. A reason with no count is absent; a reader that is not the owner never carries `anchor_not_visible`, `not_visible`, `hidden` or `proposed`, and every reader carries `outside_lens`. */
  edgesCut: Partial<Record<OwGraphCutReason, number>>;
  /** With a lens, the lens's own cut, unchanged. Without one, the elements out by default, counted by reason (`room`, `hidden` and `proposed` for the owner only, `map_space`, `reading_aid`). */
  cut: Partial<Record<OwGraphCutReason, number>>;
  /** With a lens whose `x_lens` the lens reader cannot read, the key it names (as `resolveLens`'s `unreadable`), and the graph is empty. Null otherwise, and always null without a lens. */
  unreadable: string | null;
}

/** The extension fields a published profile declares a link, each a list of ids: the lens profile's and the spine profile's. */
const DECLARED_LINKS: readonly string[] = ['x_lens_leads_to', 'x_spine_depends_on'];
const MAP_SPACE: ReadonlySet<string> = new Set(['map', 'pin', 'marker', 'zone']);
const GRAPH_REASONS: readonly OwGraphCutReason[] = [...CUT_REASONS, 'room', 'hidden', 'proposed', 'map_space', 'reading_aid', 'outside_lens'];
const GRAPH_OWNER_ONLY: ReadonlySet<string> = new Set([...OWNER_ONLY, 'hidden', 'proposed']);

type Body = Record<string, unknown>;
/** The kinds out of an unlensed graph by default. A reading aid has no flag: only a lens that names its pair keeps one. */
type Kind = 'room' | 'hidden' | 'proposed' | 'map_space' | 'reading_aid';
type Flagged = Exclude<Kind, 'reading_aid'>;

function flag(opts: Body, key: string): boolean {
  const v = valueOf(opts, key);
  if (v !== null && typeof v !== 'boolean') throw new TypeError(`worldGraph: ${key} is a boolean; got ${JSON.stringify(v)}.`);
  return v === true;
}

/**
 * Read a world as a graph for one reader (the lens profile's graph section): the elements the reader sees
 * as nodes, the links between them as edges, and what was left out, counted by reason. Pure: it never
 * writes, and nothing in the world moves.
 *
 * `world` and `reader` are what `resolveLens` takes. Without `options.lens` the nodes are every element
 * the reader sees less what is out by default: room elements, hidden ones, proposed ones and map space
 * (Map, Pin, Marker, Zone), each brought back by its flag and then marked, and the reading aids (the charter,
 * its guide, its domains: `isCharterElement`), counted `reading_aid`, which no flag brings back. With a lens the nodes are
 * exactly the lens's `kept`, its cut rides along unchanged, and a flag adds nothing. A lens whose `x_lens`
 * cannot be read gives an empty graph with `unreadable` naming the key, as `resolveLens` does.
 *
 * Each schema link field, and each extension field a profile declares a link (`x_lens_leads_to`,
 * `x_spine_depends_on`), gives one edge per target that is a node, with the target's place in the list as
 * the reader is served it; a link held on both ends is two edges. A guest's known-of element has no edges
 * out. A link to an element that is not a node is counted in `edgesCut` by that element's reason: the
 * lens's cut reason, else, with a lens, `outside_lens` for one the reader sees that the lens neither kept
 * nor cut (counted for every rung); one of the kinds out by default without a lens; and `not_visible` for one the
 * reader does not see. A link to an id that is not in the world is left out and not counted.
 *
 * `hidden` or `proposed` from a reader that is not the owner, or any flag from a public reader, is refused
 * by name before anything is read. An owner reading `as` another reader is judged by that reader's rung.
 */
export function worldGraph(world: OwLensWorld, reader: OwLensReader, options?: OwGraphOptions): OwWorldGraph {
  if (options !== undefined && options !== null && !isBody(options)) {
    throw new TypeError(`worldGraph: options is an object, such as { rooms: true }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions('worldGraph', options, GRAPH_OPTION_KEYS);
  const opts: Body = isBody(options) ? options : {};
  if (!isBody(world) || !Array.isArray((world as Body).elements)) {
    throw new TypeError('worldGraph: world is an object with an elements list.');
  }
  checkReader(reader, 'worldGraph: reader');
  const flags: Record<Flagged, boolean> = {
    room: flag(opts, 'rooms'), hidden: flag(opts, 'hidden'), proposed: flag(opts, 'proposed'), map_space: flag(opts, 'mapSpace'),
  };
  const seenRung = reader.rung === 'owner' && reader.as != null ? reader.as.rung : reader.rung;
  for (const [kind, key] of [['hidden', 'hidden'], ['proposed', 'proposed']] as const) {
    if (flags[kind] && seenRung !== 'owner') throw new TypeError(`worldGraph: ${key} is the owner's alone; a ${seenRung} reader may not ask it.`);
  }
  if (seenRung === 'public') {
    for (const [kind, key] of [['room', 'rooms'], ['map_space', 'mapSpace']] as const) {
      if (flags[kind]) throw new TypeError(`worldGraph: a public reader takes no flag; it asked ${key}.`);
    }
  }
  const { asOf, clock } = readingDate('worldGraph', world as Body, opts);
  const lens = valueOf(opts, 'lens');
  if (lens !== null && typeof lens !== 'string' && !isBody(lens)) throw new TypeError('worldGraph: lens is a lens body or its id.');

  const r = new Reading(world as Body, reader, asOf);
  const seenOwner = r.seenRung === 'owner';
  const kinds = (id: string): Kind[] => {
    const out: Kind[] = [];
    if (r.room.has(id)) out.push('room');
    if (r.hidden.has(id)) out.push('hidden');
    if (r.proposed.has(id)) out.push('proposed');
    if (MAP_SPACE.has(r.typeOf.get(id) as string)) out.push('map_space');
    if (r.aid.has(id)) out.push('reading_aid');
    return out;
  };
  const brought = (k: Kind): boolean => k !== 'reading_aid' && flags[k];
  // What the reader could see as a node: its view, and for the owner what is written as proposed too.
  const candidate = (id: string): boolean => r.view.has(id) || (seenOwner && r.proposed.has(id));

  const nodeIds = new Set<string>();
  let cut: Partial<Record<OwGraphCutReason, number>>;
  let reasonOf: (id: string) => OwGraphCutReason | null;
  let unreadable: string | null = null;
  if (lens !== null) {
    const { reading, cutById } = lensReading(r, lens as object | string, clock);
    for (const id of reading.kept) nodeIds.add(id);
    cut = { ...reading.cut };
    unreadable = reading.unreadable;
    reasonOf = id => cutById.get(id) ?? (r.view.has(id) ? 'outside_lens' : 'not_visible');
  } else {
    const outBy = (id: string): OwGraphCutReason | null => kinds(id).find(k => !brought(k)) ?? null;
    const counts = new Map<OwGraphCutReason, number>();
    for (const id of r.order) {
      if (!candidate(id)) continue;
      const why = outBy(id);
      if (why === null) nodeIds.add(id);
      else counts.set(why, (counts.get(why) ?? 0) + 1);
    }
    cut = tally(counts, r.owner);
    reasonOf = id => (candidate(id) ? outBy(id) : 'not_visible');
  }

  const ids = [...nodeIds].sort(byCodePoint);
  const nodes: OwGraphNode[] = ids.map(id => {
    const el = r.byId.get(id) as Body;
    const type = r.typeOf.get(id) as ElementType;
    const node: OwGraphNode = {
      id, type, name: typeof el.name === 'string' ? el.name : null, family: ELEMENT_GROUPS[type], icon: ELEMENT_ICONS[type],
    };
    const marks = kinds(id).filter((k): k is OwGraphMark => k !== 'map_space' && k !== 'reading_aid');
    if (marks.length > 0) node.marks = marks;
    if (r.stubs.has(id)) node.known_of = true;
    return node;
  });

  const edges: OwGraphEdge[] = [];
  const cutEdges = new Map<OwGraphCutReason, number>();
  const visit = (source: string, field: string, target: unknown, index: number): void => {
    if (typeof target !== 'string' || !r.byId.has(target)) return;
    if (nodeIds.has(target)) {
      edges.push({ source, field, target, index });
      return;
    }
    const why = reasonOf(target);
    if (why !== null) cutEdges.set(why, (cutEdges.get(why) ?? 0) + 1);
  };
  for (const source of ids) {
    if (r.stubs.has(source)) continue;
    const el = r.byId.get(source) as Body;
    // A schema link is served whole to the owner; any other view is served it less the ids outside that view.
    for (const [field, many] of LINK_FIELDS.get(r.typeOf.get(source) as string) ?? []) {
      const v = el[field];
      const list: unknown[] = many ? (Array.isArray(v) ? v : []) : [v];
      let served = 0;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const inServed = seenOwner || (typeof t === 'string' && r.view.has(t));
        visit(source, field, t, seenOwner ? i : served);
        if (inServed) served++;
      }
    }
    // A declared extension link is served as stored to every reader.
    for (const field of DECLARED_LINKS) {
      const v = el[field];
      if (!Array.isArray(v)) continue;
      for (let i = 0; i < v.length; i++) visit(source, field, v[i], i);
    }
  }
  edges.sort((a, b) => byCodePoint(a.source, b.source) || byCodePoint(a.field, b.field) || a.index - b.index);
  return { nodes, edges, edgesCut: tally(cutEdges, r.owner), cut, unreadable };
}

/** Counts in the reasons' one order, a reason with no count left out, and the owner's reasons kept for the owner. */
function tally(counts: ReadonlyMap<OwGraphCutReason, number>, owner: boolean): Partial<Record<OwGraphCutReason, number>> {
  const out: Partial<Record<OwGraphCutReason, number>> = {};
  for (const why of GRAPH_REASONS) {
    if (GRAPH_OWNER_ONLY.has(why) && !owner) continue;
    const n = counts.get(why) ?? 0;
    if (n > 0) out[why] = n;
  }
  return out;
}

/**
 * Each node's degree in a graph `worldGraph` answered: the number of its edges, in or out, each edge counted
 * once for every node it touches (a mirror pair is two edges, so each end counts 2; a link to itself counts
 * once). Every node is a key, 0 included, in the graph's node order. Edges join nodes only, so the count is
 * the reader's: what the reading left out (hidden, room, proposed, map space, past a lens) is never counted.
 * This is "most linked" for a finder: rank by it, highest first. A graph that is not one is a TypeError.
 */
export function degreeOf(graph: OwWorldGraph): Record<string, number> {
  if (!isBody(graph) || !Array.isArray((graph as Body).nodes) || !Array.isArray((graph as Body).edges)) {
    throw new TypeError('degreeOf: graph is what worldGraph answers, an object with nodes and edges lists.');
  }
  // A Map, not an object, while counting: an id such as `constructor` is no inherited key here.
  const count = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const add = (id: string) => { const n = count.get(id); if (n !== undefined) count.set(id, n + 1); };
  for (const e of graph.edges) {
    add(e.source);
    if (e.target !== e.source) add(e.target);
  }
  return Object.fromEntries(count);
}

/**
 * Each node's out-degree in a graph `worldGraph` answered: the number of distinct nodes its own link fields
 * point at. A target listed in two fields counts once, a link to itself does not count, and a mirror pair
 * (A lists B, B lists A) counts 1 at each end, since each counts its own list. Every node is a key, 0
 * included, in the graph's node order. Like `degreeOf`, the count is the reader's: what the reading left out
 * is never counted. This is how far an element reaches out, apart from how often it is named. A graph that
 * is not one is a TypeError.
 */
export function outDegreeOf(graph: OwWorldGraph): Record<string, number> {
  if (!isBody(graph) || !Array.isArray((graph as Body).nodes) || !Array.isArray((graph as Body).edges)) {
    throw new TypeError('outDegreeOf: graph is what worldGraph answers, an object with nodes and edges lists.');
  }
  // A Map, not an object, while counting: an id such as `constructor` is no inherited key here.
  const targets = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of graph.edges) {
    if (e.target !== e.source) targets.get(e.source)?.add(e.target);
  }
  return Object.fromEntries([...targets].map(([id, t]) => [id, t.size]));
}
