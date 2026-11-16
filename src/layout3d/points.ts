/**
 * The by-links-3d layout, step 5: where each group's point stands. No dependency beyond the plain cube root, no
 * recursion, typed arrays, every tie written, no cosine, sine or cube root from the runtime.
 *
 * points(ids, body, taken, group, pairs, edges, plate, table[, opts]) -> answer (below)
 *   ids     the element ids in code point order: the `ids` structure() and centres() answer
 *   body    Uint8Array per element: structure()'s body
 *   taken   Int32Array: centres()' taken (element indexes of the centres, in rank order); k = taken.length groups
 *   group   Int32Array per element: centres()' group (the rank of its centre; -1 outside the body)
 *   pairs   [a, b] ids of each undirected link (a doubled pair is counted once here)
 *   edges   [source, target, field] of each directed link as the graph lists it (a link listed twice counts twice)
 *   plate   null, or the pinned elements' places: a Map or a plain object, id -> [x, y] or [x, y, z] (z taken as 0
 *           when absent). Every id must be among `ids`.
 *   table   the directions table (LAYOUT_DIRECTIONS): table[k] is the k unit vectors for k parts
 *   opts.fixed   held points' fixed parts (method.ts), or absent: { group: Uint8Array(k), at: Float64Array(3k),
 *           plate: Float64Array(3) or null }. group[g] 1: group g's part is fixed at at[3g..3g+2] (read only for a
 *           group that is not over the plate); plate: the plate's part is fixed at that point (the held frame's
 *           point). Absent, or no part fixed: the packing as it is, bit for bit.
 *   opts.snap    held points' snap, or absent: { flag: Uint8Array(n), at: Float64Array(3n), near }: a pinned element
 *           with flag 1 whose place lies within near of at[3v..] on each axis (|d| <= near) stands at that point.
 *           Applied to the places before the groups over the plate read them.
 *
 * The answer:
 *   k, size: Int32Array(k), link: Int32Array(k * k), opp: Int32Array(k * k)   the counts; a pair g < h at g * k + h
 *   slot: Int32Array(k)        the direction (row of table[k]) each group took; ends: [g, h] the two end groups
 *                              (null for one group)
 *   dirs: Float64Array(3k)     the direction rows each group took (one group: the zero point)
 *   lobe: Float64Array(k)      each group's guessed radius
 *   cpt: Float64Array(3k)      each group's point, row g at 3g (x, y, z)
 *   plate: null, or { parts, over: Uint8Array(k), unit: Int32Array(k) (-1 over), size, link, opp, slot, ends, dirs,
 *          radius: Float64Array(parts), half, point: Float64Array(3), pinned: Uint8Array(n), at: Float64Array(3n) }
 *          the plate as one more part, last (index parts - 1); `at` row v is a pinned element's place
 *
 * The rule:
 *   counts  size[g]: the body elements in group g. link[g, h]: each undirected pair of the body once, when its two
 *           groups differ. opp[g, h]: each directed edge whose field is in OPPOSING, both ends in the body, groups
 *           differ. The same counting serves the plate's parts, over a part per element in place of the group.
 *   slots   one part: the zero point. Any opposing link: the end pair has the most opposing links, then the larger
 *           sum of sizes, then the lower first, then the lower second. None: among the at most four largest (by
 *           size, a tie to the lower), the pair with the least link / (size * size), compared by cross-multiplying
 *           whole numbers, a tie to the lower pair. The ends take the first and the last direction; the others,
 *           largest first (a tie to the lower), each take the free direction of least cost, a tie to the lower
 *           direction; cost: over the parts already placed, in the order placed, the sum of
 *           (link - 4 * opp) * length(dirs[s] - dirs[t]).
 *   lobe    REST * LOBE * cubeRoot(size), left to right; the cube root is spread.ts's plain one (Newton steps).
 *   pack    PACK_STEPS steps; each pair i < j in rising order pushes apart to GAP * (r_i + r_j) and is drawn together
 *           past it by (0.02 + 0.5 * link / total) (a quarter with an opposing link); the start is each direction
 *           times the sum of the radii (index order); the answer is centred on the mean (summed in index order,
 *           divided by k). One part: the zero point.
 *           With fixed parts (opts.fixed): a fixed part stands at its point; a free part starts at O + direction *
 *           the sum of all the radii, O the mean of the fixed parts' points (x, y, z each summed in part order,
 *           divided by their count); the same steps, pairs and order, a fixed part's move never applied; no
 *           centring. Every part fixed: no steps. The directions are chosen as before, from the counts alone.
 *   plate   the groups whose centre is pinned stand over the plate; the plate with them is one more part, last; the
 *           others are parts in rank order. half = the largest sqrt(x * x + y * y) over the plate; the plate is
 *           packed with radius half * CLEAR; a pinned element stands at the plate's point plus its x, y, z; a group
 *           over the plate at its centre's place plus (0, 0, lobe + REST * 6).
 * A length is Math.sqrt(dx * dx + dy * dy + dz * dz) in that order. Only + - * /, sqrt, max, min are used.
 * Module-internal.
 */
import { cubeRoot } from './spread';

export const REST = 60.0;
export const LOBE = 1.1;
export const GAP = 1.25;
export const CLEAR = 1.8;
export const PACK_STEPS = 600;
export const OPPOSING = ['rivals', 'adversaries', 'rival', 'antagonist'];

export type DirectionTable = { readonly [k: string]: ReadonlyArray<readonly number[]> };
export type PlatePlaces = ReadonlyMap<string, readonly number[]> | Readonly<Record<string, readonly number[]>>;

export interface PointsPlate {
  parts: number;
  over: Uint8Array;
  unit: Int32Array;
  size: Int32Array;
  link: Int32Array;
  opp: Int32Array;
  slot: Int32Array;
  ends: [number, number] | null;
  dirs: Float64Array;
  radius: Float64Array;
  half: number;
  point: Float64Array;
  pinned: Uint8Array;
  at: Float64Array;
}

export interface Points {
  k: number;
  size: Int32Array;
  link: Int32Array;
  opp: Int32Array;
  slot: Int32Array;
  ends: [number, number] | null;
  dirs: Float64Array;
  lobe: Float64Array;
  cpt: Float64Array;
  plate: PointsPlate | null;
}

export interface PointsOptions {
  fixed?: { group: Uint8Array; at: Float64Array; plate: Float64Array | null } | null;
  snap?: { flag: Uint8Array; at: Float64Array; near: number } | null;
}

interface Fixed {
  flag: Uint8Array;
  at: Float64Array;
}

type Edge3 = readonly [string, string, string | undefined];

// size, link and opp over a labelling of the body into K parts (part[v] = -1 outside the body).
function count(n: number, K: number, part: Int32Array, at: Map<string, number>, pairs: ReadonlyArray<readonly [string, string]>, edges: readonly Edge3[]): { size: Int32Array; link: Int32Array; opp: Int32Array } {
  const size = new Int32Array(K), link = new Int32Array(K * K), opp = new Int32Array(K * K);
  for (let v = 0; v < n; v++) if (part[v] !== -1) size[part[v]]++;
  const seen = new Set<number>();
  for (const [x, y] of pairs) {
    let a = at.get(x), b = at.get(y);
    if (a === undefined || b === undefined || a === b) continue;
    if (a > b) { const t = a; a = b; b = t; }
    const key = a * n + b;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = part[a], q = part[b];
    if (p === -1 || q === -1 || p === q) continue;
    if (p < q) link[p * K + q]++; else link[q * K + p]++;
  }
  for (const [s, t, field] of edges) {
    if (!OPPOSING.includes(field as string)) continue;
    const a = at.get(s), b = at.get(t);
    if (a === undefined || b === undefined) continue;
    const p = part[a], q = part[b];
    if (p === -1 || q === -1 || p === q) continue;
    if (p < q) opp[p * K + q]++; else opp[q * K + p]++;
  }
  return { size, link, opp };
}

// The parts by size, largest first; a tie to the lower index.
function bySize(K: number, size: Int32Array): Int32Array {
  const order = new Int32Array(K);
  for (let i = 0; i < K; i++) order[i] = i;
  order.sort((a, b) => (size[b] - size[a]) || (a - b));
  return order;
}

// Which part stands in which of the K directions.
function slots(K: number, size: Int32Array, link: Int32Array, opp: Int32Array, table: DirectionTable): { slot: Int32Array; ends: [number, number] | null; dirs: Float64Array } {
  const slot = new Int32Array(K), dirs = new Float64Array(3 * K);
  if (K === 1) return { slot, ends: null, dirs }; // one part: the zero point (slot 0)
  const D = table[String(K)];
  if (!D || D.length !== K) throw new Error(`points: the table has no row of ${K} directions`);
  let anyOpp = false;
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (opp[i * K + j] > 0) anyOpp = true;
  let b0 = -1, b1 = -1;
  if (anyOpp) {
    // most opposing links, then the larger sum of sizes; pairs in rising order and only a strictly better one
    // replaces, so a full tie keeps the lower first, then the lower second
    let bo = -1, bs = -1;
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const o = opp[i * K + j], s = size[i] + size[j];
        if (o > bo || (o === bo && s > bs)) { bo = o; bs = s; b0 = i; b1 = j; }
      }
    }
  } else {
    // the least link / (size_i * size_j) among the at most four largest, a tie to the lower pair (i, j)
    const order = bySize(K, size);
    const m = Math.min(K, 4);
    const big = Array.from(order.subarray(0, m)).sort((a, b) => a - b); // rising, so the first seen of a tie is lower
    for (let x = 0; x < m; x++) {
      for (let y = x + 1; y < m; y++) {
        const i = big[x], j = big[y];
        if (b0 === -1) { b0 = i; b1 = j; continue; }
        const lp = link[i * K + j], lq = link[b0 * K + b1];
        const left = lp * size[b0] * size[b1], right = lq * size[i] * size[j]; // whole numbers under 2^53
        if (left < right) { b0 = i; b1 = j; }
      }
    }
  }
  const place = new Int32Array(K).fill(-1), used = new Uint8Array(K);
  const placed = new Int32Array(K);
  let np = 0;
  place[b0] = 0; used[0] = 1; placed[np++] = b0;
  place[b1] = K - 1; used[K - 1] = 1; placed[np++] = b1;
  const order = bySize(K, size);
  for (let oi = 0; oi < K; oi++) {
    const g = order[oi];
    if (place[g] !== -1) continue;
    let bestS = -1, bestC = 0;
    for (let s = 0; s < K; s++) {
      if (used[s]) continue;
      let c = 0;
      for (let pi = 0; pi < np; pi++) {
        const h = placed[pi], t = place[h];
        const lo = g < h ? g : h, hi = g < h ? h : g;
        const w = link[lo * K + hi] - 4 * opp[lo * K + hi];
        const dx = D[s][0] - D[t][0], dy = D[s][1] - D[t][1], dz = D[s][2] - D[t][2];
        c += w * Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      if (bestS === -1 || c < bestC) { bestS = s; bestC = c; }
    }
    place[g] = bestS; used[bestS] = 1; placed[np++] = g;
  }
  for (let g = 0; g < K; g++) {
    slot[g] = place[g];
    dirs[3 * g] = D[place[g]][0]; dirs[3 * g + 1] = D[place[g]][1]; dirs[3 * g + 2] = D[place[g]][2];
  }
  return { slot, ends: [b0, b1], dirs };
}

// Where each part's point stands, the parts as balls of the given radii started apart in their directions.
// fx null, or { flag: Uint8Array(K), at: Float64Array(3K) }: the fixed parts. With no part flagged this is the
// packing as it is, line for line.
function pack(K: number, radius: Float64Array, link: Int32Array, opp: Int32Array, dirs: Float64Array, gap: number, fx: Fixed | null = null): Float64Array {
  let nf = 0;
  if (fx) for (let i = 0; i < K; i++) if (fx.flag[i]) nf++;
  if (nf > 0) return packFixed(K, radius, link, opp, dirs, gap, fx as Fixed, nf);
  const P = new Float64Array(3 * K);
  if (K === 1) return P;
  let sum = 0;
  for (let i = 0; i < K; i++) sum += radius[i];
  for (let c = 0; c < 3 * K; c++) P[c] = dirs[c] * sum;
  let total = 0;
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) total += link[i * K + j];
  if (total === 0) total = 1;
  const D = new Float64Array(3 * K);
  for (let step = 0; step < PACK_STEPS; step++) {
    D.fill(0);
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const dx = P[3 * i] - P[3 * j], dy = P[3 * i + 1] - P[3 * j + 1], dz = P[3 * i + 2] - P[3 * j + 2];
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-6);
        const need = gap * (radius[i] + radius[j]);
        let f = dist - need; // under 0: inside each other
        if (f > 0) f *= (0.02 + 0.5 * link[i * K + j] / total) * (opp[i * K + j] ? 0.25 : 1.0);
        const ux = dx / dist * f * 0.5, uy = dy / dist * f * 0.5, uz = dz / dist * f * 0.5;
        D[3 * i] -= ux; D[3 * i + 1] -= uy; D[3 * i + 2] -= uz;
        D[3 * j] += ux; D[3 * j + 1] += uy; D[3 * j + 2] += uz;
      }
    }
    for (let c = 0; c < 3 * K; c++) P[c] = P[c] + D[c] * 0.5;
  }
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < K; i++) { mx += P[3 * i]; my += P[3 * i + 1]; mz += P[3 * i + 2]; }
  mx /= K; my /= K; mz /= K;
  for (let i = 0; i < K; i++) { P[3 * i] -= mx; P[3 * i + 1] -= my; P[3 * i + 2] -= mz; }
  return P;
}

// The packing with nf > 0 fixed parts: a fixed part stands at its point and its move is never applied; a free part
// starts at O + its direction * the sum of all the radii (O the mean of the fixed parts' points, x, y and z each
// summed in part order, divided by nf); the same steps over the same pairs in the same order; no centring. Every
// part fixed: no steps.
function packFixed(K: number, radius: Float64Array, link: Int32Array, opp: Int32Array, dirs: Float64Array, gap: number, fx: Fixed, nf: number): Float64Array {
  const P = new Float64Array(3 * K);
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < K; i++) {
    if (!fx.flag[i]) continue;
    P[3 * i] = fx.at[3 * i]; P[3 * i + 1] = fx.at[3 * i + 1]; P[3 * i + 2] = fx.at[3 * i + 2];
    ox += fx.at[3 * i]; oy += fx.at[3 * i + 1]; oz += fx.at[3 * i + 2];
  }
  if (nf === K) return P;
  ox /= nf; oy /= nf; oz /= nf;
  let sum = 0;
  for (let i = 0; i < K; i++) sum += radius[i];
  for (let i = 0; i < K; i++) {
    if (fx.flag[i]) continue;
    P[3 * i] = ox + dirs[3 * i] * sum; P[3 * i + 1] = oy + dirs[3 * i + 1] * sum; P[3 * i + 2] = oz + dirs[3 * i + 2] * sum;
  }
  let total = 0;
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) total += link[i * K + j];
  if (total === 0) total = 1;
  const D = new Float64Array(3 * K);
  for (let step = 0; step < PACK_STEPS; step++) {
    D.fill(0);
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const dx = P[3 * i] - P[3 * j], dy = P[3 * i + 1] - P[3 * j + 1], dz = P[3 * i + 2] - P[3 * j + 2];
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-6);
        const need = gap * (radius[i] + radius[j]);
        let f = dist - need;
        if (f > 0) f *= (0.02 + 0.5 * link[i * K + j] / total) * (opp[i * K + j] ? 0.25 : 1.0);
        const ux = dx / dist * f * 0.5, uy = dy / dist * f * 0.5, uz = dz / dist * f * 0.5;
        D[3 * i] -= ux; D[3 * i + 1] -= uy; D[3 * i + 2] -= uz;
        D[3 * j] += ux; D[3 * j + 1] += uy; D[3 * j + 2] += uz;
      }
    }
    for (let i = 0; i < K; i++) {
      if (fx.flag[i]) continue;
      for (let c = 3 * i; c < 3 * i + 3; c++) P[c] = P[c] + D[c] * 0.5;
    }
  }
  return P;
}

// the fixed parts as pack() takes them, or null when no part is fixed
function fixedParts(K: number, flag: Uint8Array, at: Float64Array): Fixed | null {
  for (let i = 0; i < K; i++) if (flag[i]) return { flag, at };
  return null;
}

export function points(ids: readonly string[], body: Uint8Array, taken: Int32Array, group: Int32Array,
  pairs: ReadonlyArray<readonly [string, string]>, edges: readonly Edge3[], plate: PlatePlaces | null, table: DirectionTable,
  opts: PointsOptions = {}): Points {
  const dirTable = table;
  const root = cubeRoot;
  const gap = GAP;
  const n = ids.length, k = taken.length;
  const at = new Map(ids.map((id, i) => [id, i]));

  const part = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) if (body[v]) part[v] = group[v];
  const { size, link, opp } = count(n, k, part, at, pairs, edges);
  const g1 = slots(k, size, link, opp, dirTable);
  const lobe = new Float64Array(k);
  for (let g = 0; g < k; g++) lobe[g] = REST * LOBE * root(size[g]);
  const out: Points = { k, size, link, opp, slot: g1.slot, ends: g1.ends, dirs: g1.dirs, lobe, cpt: new Float64Array(0), plate: null };

  const fixed = opts.fixed || null;
  const entries: Array<[string, readonly number[]]> = plate ? (plate instanceof Map ? [...plate.entries()] : Object.entries(plate)) : [];
  if (!entries.length) {
    let fx: Fixed | null = null;
    if (fixed) {
      const flag = new Uint8Array(k), fat = new Float64Array(3 * k);
      for (let g = 0; g < k; g++) if (fixed.group[g]) {
        flag[g] = 1; fat[3 * g] = fixed.at[3 * g]; fat[3 * g + 1] = fixed.at[3 * g + 1]; fat[3 * g + 2] = fixed.at[3 * g + 2];
      }
      fx = fixedParts(k, flag, fat);
    }
    out.cpt = pack(k, lobe, link, opp, g1.dirs, gap, fx);
    return out;
  }

  // the plate branch: the groups' own pack is not needed
  const pinned = new Uint8Array(n), q = new Float64Array(3 * n);
  let outside = 0, half = 0;
  for (const [id, xy] of entries) {
    const v = at.get(id);
    if (v === undefined) throw new Error(`points: the plate names ${id}, which is not among the ids`);
    pinned[v] = 1;
    q[3 * v] = xy[0]; q[3 * v + 1] = xy[1]; q[3 * v + 2] = xy.length > 2 ? xy[2] : 0;
    if (!body[v]) outside++;
    half = Math.max(half, Math.sqrt(xy[0] * xy[0] + xy[1] * xy[1]));
  }
  const over = new Uint8Array(k), unit = new Int32Array(k).fill(-1);
  let pu = 0;
  for (let g = 0; g < k; g++) {
    if (pinned[taken[g]]) over[g] = 1;
    else unit[g] = pu++;
  }
  const K = pu + 1;
  const upart = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) if (body[v]) upart[v] = (pinned[v] || over[group[v]]) ? pu : unit[group[v]];
  const u = count(n, K, upart, at, pairs, edges);
  u.size[pu] += outside;
  const g2 = slots(K, u.size, u.link, u.opp, dirTable);
  const radius = new Float64Array(K);
  for (let p = 0; p < pu; p++) radius[p] = REST * LOBE * root(u.size[p]);
  radius[pu] = half * CLEAR;
  let fx: Fixed | null = null;
  if (fixed) {
    const flag = new Uint8Array(K), fat = new Float64Array(3 * K);
    for (let g = 0; g < k; g++) if (!over[g] && fixed.group[g]) {
      const p = unit[g];
      flag[p] = 1; fat[3 * p] = fixed.at[3 * g]; fat[3 * p + 1] = fixed.at[3 * g + 1]; fat[3 * p + 2] = fixed.at[3 * g + 2];
    }
    if (fixed.plate) { flag[pu] = 1; fat[3 * pu] = fixed.plate[0]; fat[3 * pu + 1] = fixed.plate[1]; fat[3 * pu + 2] = fixed.plate[2]; }
    fx = fixedParts(K, flag, fat);
  }
  const upt = pack(K, radius, u.link, u.opp, g2.dirs, gap, fx);
  const point = Float64Array.of(upt[3 * pu], upt[3 * pu + 1], upt[3 * pu + 2]);
  const plateAt = new Float64Array(3 * n);
  for (let v = 0; v < n; v++) {
    if (!pinned[v]) continue;
    for (let c = 0; c < 3; c++) plateAt[3 * v + c] = point[c] + q[3 * v + c];
  }
  // the snap: a held pinned element whose place lies within `near` of its held point on each axis stands at the
  // held point (before the groups over the plate read their centre's place)
  const snap = opts.snap || null;
  if (snap) {
    for (let v = 0; v < n; v++) {
      if (!pinned[v] || !snap.flag[v]) continue;
      let close = true;
      for (let c = 0; c < 3; c++) {
        const d = plateAt[3 * v + c] - snap.at[3 * v + c];
        if (!(d <= snap.near && -d <= snap.near)) close = false;
      }
      if (close) for (let c = 0; c < 3; c++) plateAt[3 * v + c] = snap.at[3 * v + c];
    }
  }
  const cpt = new Float64Array(3 * k);
  for (let g = 0; g < k; g++) {
    if (over[g]) {
      const c = taken[g];
      cpt[3 * g] = plateAt[3 * c] + 0.0;
      cpt[3 * g + 1] = plateAt[3 * c + 1] + 0.0;
      cpt[3 * g + 2] = plateAt[3 * c + 2] + (lobe[g] + REST * 6);
    } else {
      const p = unit[g];
      cpt[3 * g] = upt[3 * p]; cpt[3 * g + 1] = upt[3 * p + 1]; cpt[3 * g + 2] = upt[3 * p + 2];
    }
  }
  out.cpt = cpt;
  out.plate = { parts: K, over, unit, size: u.size, link: u.link, opp: u.opp, slot: g2.slot, ends: g2.ends, dirs: g2.dirs,
    radius, half, point, pinned, at: plateAt };
  return out;
}
