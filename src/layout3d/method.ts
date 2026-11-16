/**
 * The by-links-3d layout as one function: the parts (structure, centres, plate, points, relax, spread, hang) joined
 * in order, with the two pieces no part holds: the feed of the force steps and the answer. No rule of a part is
 * changed or copied here: every part is imported and called as its head says.
 *
 * layout3d(nodes, edges, rows, table[, opts]) -> answer
 *   nodes   [{ id, type, name? }]                 the graph's nodes, in any order; ids are strings, each once (two
 *                                                  nodes with one id throw)
 *   edges   [{ source, target, field?, index? }]  the graph's links as worldGraph lists them, in any order; a link
 *                                                  whose end is no node is passed over
 *   rows    the world's Maps and Pins as space.ts's spaceRows makes them, or null: no plate
 *   table   the directions table (LAYOUT_DIRECTIONS)
 *   opts.held     points this function answered before: a Map or a plain object, element id -> [x, y, z] (an Array
 *                 or a typed array of three finite numbers: a slice of an answer's `points` will do). Absent, null,
 *                 empty, or naming no node: the method as it is, bit for bit. "Held points" below says what it does.
 *   opts.heldUnit the step the held points were rounded to, in the answer's units (a saver that keeps Pins rounds to
 *                 whole numbers: 1); absent or null: 0. A finite number from 0 to LINE. Read only by the frame.
 *
 * The answer:
 *   { method: METHOD, ids, points: Float64Array(3n), how: Array(n), group: Array(n), part: Array(n), centres, held }
 *   ids      the nodes' ids in the order handed in; row i of every array below is node i as handed in
 *   points   x, y, z at 3i
 *   how      hang.ts's HOW word: 'centre' 'with' 'arm' 'link' 'shelf' 'map'
 *   group    the id of the centre the element stands with, or null: a centre's own id (a pinned centre too) and, for
 *            an element placed 'with' a centre, that centre's id; null for every other element
 *   part     null where group is an id; else 'map' (pinned, no centre), 'one-link' ('arm' or 'link'), 'no-link'
 *            ('shelf')
 *   centres  the centres' ids in rank order
 *   held     Array(n) of booleans: true where the point answered is the element's held point (a held element that
 *            is not pinned); false for every other element, a pinned one included, and everywhere when nothing is held
 * No nodes: every array empty, no centres. Any other size runs through the parts as they are.
 *
 * The order, in this sequence:
 *   1. the input in one order: nodes by id (code point order); links by source, then field (absent as the empty
 *      string), then index (absent as 0, by number), then target. Nothing below reads the links' order (the pairs
 *      are sorted by place, the counts are sums of whole numbers), so this is the by-kind layout's order kept for
 *      one rule across the methods, not a rule this method's answer rests on. The undirected pairs (each unordered
 *      pair of distinct nodes once) are listed in node order.
 *   2. structure(ids, pairs)                         the body, what hangs and how far, what is off the main piece
 *   3. centres(ids, pairs, body)                     the centres and the groups
 *   4. plate(rows, Set(ids)).at, or null              the flat part; with held points, the frame (below) from that
 *      answer's `first`, and with a frame plate(rows, Set(ids), { scale: s }).at
 *   5. points(ids, body, taken, group, pairs, edges, plate, table[, { fixed, snap }])   each group's point cpt; the
 *      plate as one part; with held points, the fixed parts and the snap (below)
 *   6. feedOf(...)                                   below
 *   7. startOf(feed)                                 below
 *   8. relax({ ...feed, pos: start }, { steps: STEPS, cap0: CAP0, cutoff: CUTOFF })
 *   9. hang(ids, body, hangCut, hangDepth, off, taken, group, cpt, plate, kind, degree, relaxed)
 *  10. the answer, rows put back in the handed order
 *
 * The feed, over the body's elements in id order:
 *   pairs   each undirected link between two body elements once, as (lower place, higher place) in the body list,
 *           sorted by the first place, then the second
 *   weight  1.0 inside one group, CROSS between two groups; PLATE when either end is pinned (in place of the other)
 *   anchor  the group's point cpt[group]; a pinned element's place on the plate in its stead; a held element's held
 *           point
 *   pull    HOLD for every element
 *   fixed   a centre, or a pinned element (with held points: a held element or a pinned one, and no centre that is
 *           not held)
 * With held points, after the body: the held elements that are not pinned and not in the body, in id order, each
 * fixed at its held point, pull 0, group -1, in no pair.
 * The start: each group's elements that are not fixed start in a ball round the group's point, by spread.ts's
 * plainStart: it is called once per group on that group's moving elements with every anchor at zero (so the group is
 * one group of the right count, and its answer is exactly x * lobe), and the anchor is added after:
 * anchor + (0 + x * lobe). A fixed element starts at its anchor. Each element's draws are seeded by fnv1a(id):
 * FNV-1a, 32 bits, over the id's UTF-8 bytes (a lone surrogate encoded as U+FFFD).
 *
 * Held points (opts.held): a held element that is not pinned stands at its held point; the structure, the centres
 * and the groups are read from today's graph; the answer says which were held; a pinned element stands at its Pin,
 * so `held` is false for it.
 *   0. refusal  before anything runs, each an Error with a `code` (REFUSED): `held` that is neither a Map nor a plain
 *            object (an Array, a typed array, a string, a number): TypeError, 'held-not-object'; a value that is not
 *            an Array or a typed array (no DataView) of exactly three finite numbers: TypeError, 'held-not-point';
 *            the box of every value handed in, an id that is no node's too, wider than HELD_BOX * REST on any axis
 *            (max - min > 768 rests): RangeError, 'held-box'; heldUnit neither absent nor null and not a number, not
 *            finite, under 0 or over LINE: RangeError, 'held-unit'. Then an id that is no node is passed over; when
 *            none is left, nothing below runs differently and the answer is the method's.
 *   1. the frame (where the plate stood when the points were answered). Candidates: the held elements among
 *            plate()'s `first`, in id order. near = 3 * heldUnit + SNAP. For a candidate a, the b's: the candidates
 *            whose held z is within heldUnit + SNAP of a's (|dz| <= that) and whose map place is not a's (x and y both
 *            equal), in the order of their map places' plain 2D distance from a, farthest first (a tie to the first
 *            in id order). For each b in that order: when the held points of a and b are one point in x and y (both
 *            differences exactly 0) the pair gives no frame; else s = the 2D distance of their held points over that
 *            of their map places; P = (ax - s * max, ay - s * may, az). A candidate agrees when each axis of its held
 *            point is within near (|d| <= near) of P + s * its map place (z: of P's z). The frame is that of the
 *            first pair (a in id order, then b in its order) that FRAME_AGREE candidates agree with (every candidate
 *            is tested, a and b too). With a frame: plate(rows, Set(ids), { scale: s }); the plate is a fixed part
 *            at P, so each first-map element stands at P + its place * s, and the small plates follow from the
 *            first map's places.
 *            With none: plate() as it is, a free part.
 *   2. each group's point, the first case that applies: 1 its centre is pinned (over the plate); 2 its centre is
 *            held: the held point; 3 it has held members (today's group, in the body, held, not pinned): their mean,
 *            x, y, z each summed in id order and divided by the count; 4 the packing's. With anything held, no centre
 *            that is not held is fixed in the steps, in case 4 as in case 3: it starts in its group's ball and moves
 *            as any element of its group. Only held and pinned elements stand still.
 *   3. points() with opts.fixed: the parts of cases 2 and 3, and the plate with a frame, fixed (points.ts's head).
 *            No part fixed: the packing as it is.
 *   4. the snap: points() with opts.snap: a held pinned element whose place is within near of its held point on
 *            each axis stands at the held point; the groups over the plate then read their centre's place.
 *   5. the feed: a held body element that is not pinned is fixed, its anchor its held point; the held elements
 *            outside the body after the body (above). Weights, pulls and the start as above.
 *   6. hang() takes { flag, at } (hang.ts's head).
 *   7. the answer's `held`.
 * "Within" is <= for near and the z test, "under LINE" is <; distances for b and s are plain 2D lengths
 * (Math.sqrt), compared as lengths; the snap runs with or without a frame; a pair whose map places differ but whose
 * held points are one point in x and y gives no frame, and the next b is tried; heldUnit null is read as absent.
 * Module-internal.
 */
import { byCodePoint } from './order';
import { structure } from './structure';
import { centres } from './centres';
import { plate as plateOf } from './plate';
import type { Plate } from './plate';
import { points } from './points';
import type { DirectionTable, PointsOptions } from './points';
import { relax } from './relax';
import { plainStart } from './spread';
import { hang, HOW, CENTRE, WITH, ARM, LINK, MAP, LINE } from './hang';

export const METHOD = 'by-links-3d';
export const REST = 60.0;
export const STEPS = 300;
export const CROSS = 0.25;      // a link between two groups pulls this much of a link inside one
export const PLATE = 0.02;      // a link to a pinned element
export const HOLD = 0.12;       // how hard an element is held to its group's point
export const CAP0 = 0.1;        // the first step's cap, in rests
export const CUTOFF = 3;        // the push's reach, in rests
export { LINE };                // the held points' line, REST / 8 (hang.ts)
export const SNAP = REST / 1e9; // a billionth of a rest (the frame's and the snap's slack)
export const HELD_BOX = 768;    // the widest box of held points, in rests, on any side
export const FRAME_AGREE = 3;   // how many candidates must agree with a pair for it to be the frame
// each refusal's code (err.code), so a tool can tell them apart
export const REFUSED = { notObject: 'held-not-object', notPoint: 'held-not-point', box: 'held-box', unit: 'held-unit' } as const;

export type HowWord = typeof HOW[number];
export type PartWord = null | 'map' | 'one-link' | 'no-link';

export interface Layout3dNode { id: string; type: string; name?: string | null }
export interface Layout3dEdge { source: string; target: string; field?: string; index?: number }
type HeldPoint = ArrayLike<number>;
export type HeldPoints = ReadonlyMap<string, HeldPoint> | Readonly<Record<string, HeldPoint>>;

export interface Layout3d {
  method: 'by-links-3d';
  ids: string[];
  points: Float64Array;
  how: HowWord[];
  group: Array<string | null>;
  part: PartWord[];
  centres: string[];
  held: boolean[];
}

type Row = Record<string, unknown>;
type Pair = [string, string];

interface Feed {
  rest: number;
  steps: number;
  ids: string[];
  pairs: Array<[number, number]>;
  weight: number[];
  anchor: number[][];
  pull: number[];
  fixed: boolean[];
  group: number[];
  num: number[];
}

function refuse(Kind: new (message: string) => Error, code: string, message: string): never {
  const err = new Kind(message) as Error & { code?: string };
  err.code = code;
  throw err;
}
// an Array or a typed array (not a DataView) of exactly three finite numbers
function isPoint(p: unknown): p is HeldPoint {
  if (!(Array.isArray(p) || (ArrayBuffer.isView(p) && !(p instanceof DataView)))) return false;
  const q = p as ArrayLike<unknown>;
  if (q.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (typeof q[i] !== 'number' || !Number.isFinite(q[i])) return false;
  return true;
}

// opts.held read and refused (the head's "Held points", 0): null when absent or empty, else its entries [id, [x, y, z]]
function readHeld(held: unknown): Array<[string, HeldPoint]> | null {
  if (held === undefined || held === null) return null;
  let entries: Array<[string, unknown]> = [];
  if (held instanceof Map) entries = [...held.entries()];
  else if (typeof held === 'object' && !Array.isArray(held) && !ArrayBuffer.isView(held)) entries = Object.entries(held as object);
  else refuse(TypeError, REFUSED.notObject, 'layoutByLinks3d: held is not a Map or an object');
  for (const [id, p] of entries) {
    if (!isPoint(p)) refuse(TypeError, REFUSED.notPoint, `layoutByLinks3d: held[${id}] is not three finite numbers`);
  }
  const points = entries as Array<[string, HeldPoint]>;
  if (points.length) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [, p] of points) for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
    for (let a = 0; a < 3; a++) {
      if (hi[a] - lo[a] > HELD_BOX * REST) {
        refuse(RangeError, REFUSED.box, `layoutByLinks3d: the held points' box is ${(hi[a] - lo[a]) / REST} rests on ${'xyz'[a]}, wider than ${HELD_BOX}`);
      }
    }
  }
  return points.length ? points : null;
}
function readUnit(u: unknown): number {
  if (u === undefined || u === null) return 0; // null is read as absent, as held null is
  if (typeof u !== 'number' || !Number.isFinite(u) || u < 0 || u > LINE) {
    refuse(RangeError, REFUSED.unit, `layoutByLinks3d: heldUnit ${String(u)} is not a finite number from 0 to ${LINE}`);
  }
  return u as number;
}

// The frame: null, or { a, b, s, P: Float64Array(3), agree } (a and b element indexes). first: plate()'s `first`;
// at: id -> index; hflag, hat: the held elements that are nodes and their points; unit: heldUnit.
export function frameOf(first: Map<string, [number, number]>, at: Map<string, number>, hflag: Uint8Array, hat: Float64Array, unit: number): { a: number; b: number; s: number; P: Float64Array; agree: number } | null {
  const cv: number[] = [], cx: number[] = [], cy: number[] = [];
  for (const [id, q] of first) { const v = at.get(id) as number; if (hflag[v]) { cv.push(v); cx.push(q[0]); cy.push(q[1]); } }
  const order = cv.map((_, i) => i).sort((p, q) => cv[p] - cv[q]); // the candidates in id order
  const m = order.length;
  const tolZ = unit + SNAP, near = 3 * unit + SNAP;
  for (let ia = 0; ia < m; ia++) {
    const a = order[ia], va = cv[a];
    const ax = hat[3 * va], ay = hat[3 * va + 1], az = hat[3 * va + 2];
    // the b's: candidates of a's z whose map place is not a's, farthest on the map first, a tie to the first in id
    // order (the list is built in id order and the sort is stable)
    const bs: number[] = [], bdist: Array<[number, number]> = [];
    for (let ib = 0; ib < m; ib++) {
      const c = order[ib];
      if (c === a) continue;
      const dz = hat[3 * cv[c] + 2] - az;
      if (!(dz <= tolZ && -dz <= tolZ)) continue;
      if (cx[c] === cx[a] && cy[c] === cy[a]) continue;
      const mx = cx[c] - cx[a], my = cy[c] - cy[a];
      bs.push(bs.length); bdist.push([c, Math.sqrt(mx * mx + my * my)]);
    }
    bs.sort((p, q) => (bdist[q][1] - bdist[p][1]) || (p - q));
    for (const ib of bs) {
      const [b, bd] = bdist[ib];
      const vb = cv[b];
      const hx = hat[3 * vb] - ax, hy = hat[3 * vb + 1] - ay;
      if (hx === 0 && hy === 0) continue; // the two held points are one point in x and y: no frame
      const s = Math.sqrt(hx * hx + hy * hy) / bd;
      const P = Float64Array.of(ax - s * cx[a], ay - s * cy[a], az);
      let agree = 0;
      for (let ic = 0; ic < m; ic++) {
        const c = order[ic], vc = cv[c];
        const ex = hat[3 * vc] - (P[0] + s * cx[c]), ey = hat[3 * vc + 1] - (P[1] + s * cy[c]), ez = hat[3 * vc + 2] - P[2];
        if (ex <= near && -ex <= near && ey <= near && -ey <= near && ez <= near && -ez <= near) agree++;
      }
      if (agree >= FRAME_AGREE) return { a: va, b: vb, s, P, agree };
    }
  }
  return null;
}

const encoder = /* @__PURE__ */ new TextEncoder();
export function fnv1a(id: string): number {
  let h = 2166136261;
  for (const b of encoder.encode(id)) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h;
}

export function byLink(a: Layout3dEdge, b: Layout3dEdge): number {
  return byCodePoint(a.source, b.source) || byCodePoint(a.field ?? '', b.field ?? '') ||
    ((a.index ?? 0) - (b.index ?? 0)) || byCodePoint(a.target, b.target);
}

// The feed of the force steps. ids, body, taken, group as structure() and centres() answer them; pairs the
// undirected id pairs; cpt points()' cpt; plate points()' plate (null, or { pinned, at }); opts.held null, or
// { flag, at } as hang() takes it (a flagged element is held and not pinned); opts.free null, or Uint8Array(k): 1
// where the group's centre is not fixed (held points, cases 3 and 4); opts.extra the element indexes that join
// after the body (held, not pinned, not in the body, in id order), each fixed at its held point with no link and
// pull 0.
export function feedOf(ids: readonly string[], body: Uint8Array, pairs: readonly Pair[], taken: Int32Array, group: Int32Array,
  cpt: Float64Array, plate: { pinned: Uint8Array; at: Float64Array } | null,
  opts: { held?: { flag: Uint8Array; at: Float64Array } | null; free?: Uint8Array | null; extra?: number[] } = {}): Feed {
  const held = opts.held || null;
  const free = opts.free || null;
  const extra = opts.extra || [];
  const n = ids.length;
  const at = new Map(ids.map((id, i) => [id, i]));
  const blist: number[] = [], bi = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) if (body[v]) { bi[v] = blist.length; blist.push(v); }
  const nb = blist.length;
  const centre = new Uint8Array(n);
  for (const t of taken) centre[t] = 1;
  const pinned = plate ? plate.pinned : null;

  const seen = new Set<number>(), bp: Array<[number, number]> = [];
  for (const [x, y] of pairs) {
    const a = at.get(x), b = at.get(y);
    if (a === undefined || b === undefined || a === b) continue;
    let i = bi[a], j = bi[b];
    if (i < 0 || j < 0) continue;
    if (i > j) { const t = i; i = j; j = t; }
    const key = i * nb + j;
    if (seen.has(key)) continue;
    seen.add(key);
    bp.push([i, j]);
  }
  bp.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));

  const weight = bp.map(([i, j]) => {
    const u = blist[i], w = blist[j];
    let x = group[u] === group[w] ? 1.0 : CROSS;
    if (pinned && (pinned[u] || pinned[w])) x = PLATE;
    return x;
  });
  const anchor = blist.map((v) => (pinned && pinned[v])
    ? [(plate as { at: Float64Array }).at[3 * v], (plate as { at: Float64Array }).at[3 * v + 1], (plate as { at: Float64Array }).at[3 * v + 2]]
    : (held && held.flag[v])
      ? [held.at[3 * v], held.at[3 * v + 1], held.at[3 * v + 2]]
      : [cpt[3 * group[v]], cpt[3 * group[v] + 1], cpt[3 * group[v] + 2]]);
  const pull = blist.map(() => HOLD);
  const fixed = blist.map((v) => (!!centre[v] && !(free && free[group[v]] === 1)) ||
    (!!pinned && !!pinned[v]) ||
    (!!held && held.flag[v] === 1));
  const feed: Feed = {
    rest: REST, steps: STEPS,
    ids: blist.map((v) => ids[v]), pairs: bp, weight, anchor, pull, fixed,
    group: blist.map((v) => group[v]), num: blist.map((v) => fnv1a(ids[v])),
  };
  for (const v of extra) { // after the body, in id order; no link, no hold
    const h = held as { at: Float64Array };
    feed.ids.push(ids[v]);
    feed.anchor.push([h.at[3 * v], h.at[3 * v + 1], h.at[3 * v + 2]]);
    feed.pull.push(0);
    feed.fixed.push(true);
    feed.group.push(-1);
    feed.num.push(fnv1a(ids[v]));
  }
  return feed;
}

// The start: each body element's point before the steps, as [x, y, z] in the feed's order.
export function startOf(feed: Feed): number[][] {
  const nb = feed.anchor.length;
  const out: number[][] = new Array(nb);
  const members = new Map<number, number[]>(); // group -> the body places counted for its ball, in body order
  for (let i = 0; i < nb; i++) {
    if (feed.fixed[i]) out[i] = [feed.anchor[i][0], feed.anchor[i][1], feed.anchor[i][2]];
    if (feed.fixed[i]) continue;
    const g = feed.group[i];
    if (!members.has(g)) members.set(g, []);
    (members.get(g) as number[]).push(i);
  }
  for (const list of members.values()) {
    const zero = list.map(() => [0, 0, 0]);
    const off = plainStart({ rest: feed.rest, pos: zero, anchor: zero, fixed: null }, list.map((i) => feed.num[i]));
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (feed.fixed[i]) continue;
      const a = feed.anchor[i];
      out[i] = [a[0] + off[k][0], a[1] + off[k][1], a[2] + off[k][2]];
    }
  }
  return out;
}

export function layout3d(nodes: readonly Layout3dNode[], edges: readonly Layout3dEdge[], rows: readonly Row[] | null,
  table: DirectionTable, opts: { held?: HeldPoints | null; heldUnit?: number | null } = {}): Layout3d {
  const heldIn = readHeld(opts.held); // 0. refused before anything runs
  const unit = readUnit(opts.heldUnit);
  const steps = STEPS;
  const n = nodes.length;
  const handed = nodes.map((x) => x.id);
  if (!n) return { method: METHOD, ids: [], points: new Float64Array(0), how: [], group: [], part: [], centres: [], held: [] };

  // 1. the input in one order
  const sortedNodes = [...nodes].sort((a, b) => byCodePoint(a.id, b.id));
  const ids = sortedNodes.map((x) => x.id);
  for (let i = 1; i < n; i++) if (ids[i] === ids[i - 1]) throw new Error(`layoutByLinks3d: two nodes share the id ${ids[i]}`);
  const at = new Map(ids.map((id, i) => [id, i]));
  const links = edges.filter((e) => at.has(e.source) && at.has(e.target)).sort(byLink);
  const seen = new Set<number>(), ip: Array<[number, number]> = [];
  for (const e of links) {
    const a = at.get(e.source) as number, b = at.get(e.target) as number;
    if (a === b) continue;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * n + hi;
    if (seen.has(key)) continue;
    seen.add(key);
    ip.push([lo, hi]);
  }
  ip.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  const pairs: Pair[] = ip.map(([a, b]) => [ids[a], ids[b]]);
  const edges3 = links.map((e) => [e.source, e.target, e.field] as const);

  // 2 and 3: the body, the centres and the groups, from today's graph
  const s = structure(ids, pairs);
  const c = centres(ids, pairs, s.body);
  const k = c.taken.length;

  // the held points that are nodes (a held id that is no node is passed over)
  let hflag: Uint8Array | null = null, hat: Float64Array | null = null;
  if (heldIn) {
    for (const [id, q] of heldIn) {
      const v = at.get(id);
      if (v === undefined) continue;
      if (!hflag) { hflag = new Uint8Array(n); hat = new Float64Array(3 * n); }
      const h = hat as Float64Array;
      hflag[v] = 1; h[3 * v] = q[0]; h[3 * v + 1] = q[1]; h[3 * v + 2] = q[2];
    }
  }

  // 4. the flat part; with held points, the frame and the plate again at the frame's scale
  let plateAt: Map<string, [number, number, number]> | null = null, plateAns: Plate | null = null, frame: ReturnType<typeof frameOf> = null;
  if (rows) {
    plateAns = plateOf(rows, new Set(ids));
    if (plateAns && hflag) {
      frame = frameOf(plateAns.first, at, hflag, hat as Float64Array, unit);
      if (frame) plateAns = plateOf(rows, new Set(ids), { scale: frame.s });
    }
    plateAt = plateAns ? plateAns.at : null;
  }

  // the held points' cases: each group's case, and the fixed parts and the snap for points()
  let keep: Uint8Array | null = null, cases: Uint8Array | null = null, popts: PointsOptions = {};
  const extra: number[] = [];
  if (hflag) {
    const hp = hat as Float64Array;
    const pinnedV = new Uint8Array(n);
    if (plateAt) for (const id of plateAt.keys()) pinnedV[at.get(id) as number] = 1;
    keep = new Uint8Array(n);
    for (let v = 0; v < n; v++) if (hflag[v] && !pinnedV[v]) keep[v] = 1;
    cases = new Uint8Array(k);
    const gflag = new Uint8Array(k), gat = new Float64Array(3 * k);
    const sx = new Float64Array(k), sy = new Float64Array(k), sz = new Float64Array(k);
    const cnt = new Int32Array(k);
    for (let i = 0; i < n; i++) { // the held members, in id order
      const v = i;
      if (!s.body[v] || !keep[v]) continue;
      const g = c.group[v];
      sx[g] += hp[3 * v]; sy[g] += hp[3 * v + 1]; sz[g] += hp[3 * v + 2]; cnt[g]++;
    }
    for (let g = 0; g < k; g++) {
      const t = c.taken[g];
      if (pinnedV[t]) cases[g] = 1;
      else if (keep[t]) { cases[g] = 2; gflag[g] = 1; gat[3 * g] = hp[3 * t]; gat[3 * g + 1] = hp[3 * t + 1]; gat[3 * g + 2] = hp[3 * t + 2]; }
      else if (cnt[g] > 0) {
        cases[g] = 3; gflag[g] = 1; gat[3 * g] = sx[g] / cnt[g]; gat[3 * g + 1] = sy[g] / cnt[g]; gat[3 * g + 2] = sz[g] / cnt[g];
      } else cases[g] = 4;
    }
    popts = {
      fixed: { group: gflag, at: gat, plate: frame ? frame.P : null },
      snap: { flag: hflag, at: hp, near: 3 * unit + SNAP },
    };
    for (let v = 0; v < n; v++) if (keep[v] && !s.body[v]) extra.push(v);
  }

  // 5. each group's point (the fixed parts, the plate and the snap)
  const p = hflag ? points(s.ids, s.body, c.taken, c.group, pairs, edges3, plateAt, table, popts)
    : points(s.ids, s.body, c.taken, c.group, pairs, edges3, plateAt, table);
  const heldOpt = keep ? { flag: keep, at: hat as Float64Array } : null;
  // with anything held no centre that is not held is fixed: case 3 and case 4 free
  let free: Uint8Array | null = null;
  if (cases) {
    free = new Uint8Array(k);
    for (let g = 0; g < k; g++) {
      if (cases[g] === 3) free[g] = 1;
      else if (cases[g] === 4) free[g] = 1;
    }
  }

  // 6 to 8: the feed, the start, the steps
  const feed = feedOf(s.ids, s.body, pairs, c.taken, c.group, p.cpt, p.plate, { held: heldOpt, free, extra });
  const start = startOf(feed);
  const r = relax({ ...feed, pos: start }, { steps, cap0: CAP0, cutoff: CUTOFF });
  const relaxed = new Float64Array(3 * n);
  let j = 0;
  for (let v = 0; v < n; v++) {
    if (!s.body[v]) continue;
    relaxed[3 * v] = r.pos[3 * j]; relaxed[3 * v + 1] = r.pos[3 * j + 1]; relaxed[3 * v + 2] = r.pos[3 * j + 2];
    j++;
  }

  // 9. what is placed after the steps
  const kind = sortedNodes.map((x) => x.type);
  const degree = new Int32Array(n);
  for (const [a, b] of ip) { degree[a]++; degree[b]++; }
  const hopts: { held?: { flag: Uint8Array; at: Float64Array } } = {};
  if (heldOpt) hopts.held = { ...heldOpt };
  const h = hang(s.ids, s.body, s.hangCut, s.hangDepth, s.off, c.taken, c.group, p.cpt, p.plate, kind, degree, relaxed, hopts);

  // 10. the answer, in the handed order
  const out = new Float64Array(3 * n), how: HowWord[] = new Array(n), group: Array<string | null> = new Array(n), part: PartWord[] = new Array(n);
  const held: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = at.get(handed[i]) as number;
    out[3 * i] = h.pos[3 * v]; out[3 * i + 1] = h.pos[3 * v + 1]; out[3 * i + 2] = h.pos[3 * v + 2];
    held[i] = keep !== null && keep[v] === 1;
    const w = h.how[v];
    how[i] = HOW[w];
    const own = s.body[v] && c.taken[c.group[v]] === v;
    if (w === CENTRE || w === WITH || (w === MAP && own)) { group[i] = ids[c.taken[c.group[v]]]; part[i] = null; }
    else if (w === MAP) { group[i] = null; part[i] = 'map'; }
    else if (w === ARM || w === LINK) { group[i] = null; part[i] = 'one-link'; }
    else { group[i] = null; part[i] = 'no-link'; }
  }
  return { method: METHOD, ids: handed, points: out, how, group, part, centres: Array.from(c.taken, (t) => ids[t]), held };
}
