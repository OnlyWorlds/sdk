/**
 * The by-links-3d layout, step 3: the centres and their groups. No recursion, typed arrays, every tie written.
 *
 * centres(ids, pairs, body) -> { ids, taken: Int32Array, group: Int32Array, dist: Int32Array }
 *   ids, pairs  as structure(ids, pairs) takes them; body  the Uint8Array structure() answered
 *   taken  element indexes of the centres, in rank order
 *   group  per element, the rank of its centre in taken; -1 outside the body
 *   dist   per element, links from its centre; -1 outside the body (or not reached: never, the body is one piece)
 * Indexes are places in `ids` put in code point order, as in structure.ts.
 *
 * The rule:
 *   pick   over a set (the body; in a split, one group's own elements without its centre): neighbours are counted
 *          inside the set. Rank by neighbour count, most first, a tie by the lower index. The floor is
 *          max(3, the least f with f * f >= size). Walk the ranking: stop at the first under the floor or at
 *          MAX_CENTRES taken; v is taken when for every centre q taken, 2 * |nb(v) & (nb(q) | {q})| < |nb(v)|.
 *          None taken: the first of the ranking. Then reach; while some group is under MIN_GROUP and more than one
 *          centre is left, the last-ranked of the small ones is dropped and reach is read again.
 *   reach  breadth-first from every centre at once, level by level; an element's distance is its first level, and
 *          the shortest paths from each centre are summed along the levels. An element joins the centre with most
 *          shortest paths to it, a tie to the lower rank; a centre is its own group. An element not reached (this
 *          only happens inside a split's set) is in no group, and counted in none.
 *   centres  pick on the body; then at most twice: the largest group (a tie: the lower rank), if it holds more than
 *          half the body, is read by pick on its own elements without its centre and their links to each other;
 *          fewer than 2 new centres: stop; else they are appended, and each element the sub-pick reached takes its
 *          new group and distance (one it did not reach stays where it was).
 *
 * The path counts saturate at WAYS_CAP (a sum is min(WAYS_CAP, a + b)), so JavaScript and a language with big
 * integers give the same answer. Two counts at most 2^52 sum to at most 2^53, which a double holds exactly, so each
 * sum is exact before the cap. Saturating addition of non-negative numbers does not depend on order
 * (min(C, a + b + c) whichever pair is added first), so neither does the walk's answer. Module-internal.
 */
import { byCodePoint } from './order';

export const MAX_CENTRES = 12;
export const MIN_GROUP = 3;
export const WAYS_CAP = 2 ** 52;

interface Rows {
  deg: Int32Array;
  nb: Int32Array;
}

export interface Centres {
  ids: string[];
  taken: Int32Array;
  group: Int32Array;
  dist: Int32Array;
}

// The links as rows by element (CSR), each neighbour once and in rising index: a doubled link is one neighbour.
function rows(sorted: readonly string[], pairs: ReadonlyArray<readonly [string, string]>): Rows {
  const at = new Map(sorted.map((id, i) => [id, i]));
  const n = sorted.length;
  const ea: number[] = [], eb: number[] = [];
  for (const [x, y] of pairs) {
    const a = at.get(x), b = at.get(y);
    if (a === undefined || b === undefined || a === b) continue;
    ea.push(a); eb.push(b);
  }
  const m = ea.length;
  const start = new Int32Array(n + 1);
  for (let k = 0; k < m; k++) { start[ea[k] + 1]++; start[eb[k] + 1]++; }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const raw = new Int32Array(2 * m);
  for (let k = 0; k < m; k++) { raw[fill[ea[k]]++] = eb[k]; raw[fill[eb[k]]++] = ea[k]; }
  // each row sorted, doubles dropped
  const deg = new Int32Array(n + 1);
  const nb = new Int32Array(2 * m);
  let out = 0;
  for (let i = 0; i < n; i++) {
    const row = raw.subarray(start[i], start[i + 1]).slice().sort();
    deg[i] = out;
    for (let k = 0; k < row.length; k++) if (k === 0 || row[k] !== row[k - 1]) nb[out++] = row[k];
  }
  deg[n] = out;
  return { deg, nb };
}

// The centres among the set's members (rising indexes; inSet marks them) by their links to each other, and each
// member's group and distance (per element arrays; -1 where not a member or not reached).
function pick(n: number, g: Rows, members: readonly number[], inSet: Uint8Array): { taken: number[]; group: Int32Array; dist: Int32Array } {
  const { deg, nb } = g;
  const size = members.length;
  const count = new Int32Array(n);
  for (const v of members) {
    let c = 0;
    for (let k = deg[v]; k < deg[v + 1]; k++) if (inSet[nb[k]]) c++;
    count[v] = c;
  }
  const ranked = Int32Array.from(members);
  ranked.sort((a, b) => (count[b] - count[a]) || (a - b));
  let f = 0;
  while (f * f < size) f++;
  const floor = Math.max(3, f);

  // mark[w] bit r: w is centre r or one of its neighbours in the set
  const mark = new Int32Array(n);
  const hit = new Int32Array(MAX_CENTRES);
  let taken: number[] = [];
  for (const v of ranked) {
    if (count[v] < floor || taken.length === MAX_CENTRES) break;
    hit.fill(0);
    for (let k = deg[v]; k < deg[v + 1]; k++) {
      const w = nb[k];
      if (!inSet[w]) continue;
      for (let r = 0; r < taken.length; r++) hit[r] += (mark[w] >> r) & 1;
    }
    let ok = true;
    for (let r = 0; r < taken.length; r++) {
      if (2 * hit[r] >= count[v]) { ok = false; break; }
    }
    if (!ok) continue;
    const r = taken.length;
    taken.push(v);
    mark[v] |= 1 << r;
    for (let k = deg[v]; k < deg[v + 1]; k++) if (inSet[nb[k]]) mark[nb[k]] |= 1 << r;
  }
  if (taken.length === 0 && ranked.length) taken = [ranked[0]];

  for (;;) {
    const { group, dist } = reach(n, g, members, inSet, taken);
    const sizes = new Int32Array(taken.length);
    for (const v of members) if (taken.length && group[v] !== -1) sizes[group[v]]++;
    let last = -1;
    for (let r = 0; r < taken.length; r++) if (sizes[r] < MIN_GROUP) last = r;
    if (last === -1 || taken.length === 1) return { taken, group, dist };
    taken.splice(last, 1); // the last-ranked of the small ones goes, then the reach is read again
  }
}

// Breadth-first from every centre at once. ways[v * K + r]: shortest paths from centre r to v, saturating.
function reach(n: number, g: Rows, members: readonly number[], inSet: Uint8Array, taken: readonly number[]): { group: Int32Array; dist: Int32Array } {
  const { deg, nb } = g;
  const K = taken.length;
  const dist = new Int32Array(n).fill(-1);
  const group = new Int32Array(n).fill(-1);
  const ways = new Float64Array(n * K);
  let front = new Int32Array(n), next = new Int32Array(n);
  let fl = 0;
  for (let r = 0; r < K; r++) {
    const c = taken[r];
    dist[c] = 0;
    ways[c * K + r] = 1;
    front[fl++] = c;
  }
  let d = 0;
  while (fl) {
    d++;
    let nl = 0;
    for (let i = 0; i < fl; i++) {
      const v = front[i];
      for (let k = deg[v]; k < deg[v + 1]; k++) {
        const w = nb[k];
        if (!inSet[w]) continue;
        if (dist[w] === -1) { dist[w] = d; next[nl++] = w; }
        if (dist[w] !== d) continue;
        for (let r = 0; r < K; r++) ways[w * K + r] = Math.min(WAYS_CAP, ways[w * K + r] + ways[v * K + r]);
      }
    }
    const t = front; front = next; next = t; fl = nl;
  }
  for (let r = 0; r < K; r++) group[taken[r]] = r;
  for (const v of members) {
    if (dist[v] === 0) continue; // a centre: its own group
    if (dist[v] === -1) continue; // not reached: in no group of this reach
    let best = 0;
    for (let r = 1; r < K; r++) if (ways[v * K + r] > ways[v * K + best]) best = r;
    group[v] = best;
  }
  return { group, dist };
}

export function centres(ids: readonly string[], pairs: ReadonlyArray<readonly [string, string]>, body: Uint8Array): Centres {
  const sorted = [...ids].sort(byCodePoint);
  const n = sorted.length;
  const g = rows(sorted, pairs);
  const members: number[] = [];
  for (let i = 0; i < n; i++) if (body[i]) members.push(i);
  const first = pick(n, g, members, body);
  let taken = first.taken;
  const group = first.group, dist = first.dist;

  for (let round = 0; round < 2; round++) {
    const sizes = new Int32Array(taken.length);
    for (const v of members) sizes[group[v]]++;
    let big = 0;
    for (let r = 1; r < taken.length; r++) if (sizes[r] > sizes[big]) big = r;
    if (!taken.length || 2 * sizes[big] <= members.length) break;
    const inside: number[] = [], inSet = new Uint8Array(n);
    for (const v of members) if (group[v] === big && v !== taken[big]) { inside.push(v); inSet[v] = 1; }
    const sub = pick(n, g, inside, inSet);
    if (sub.taken.length < 2) break;
    const base = taken.length;
    taken = taken.concat(sub.taken);
    for (const v of inside) if (sub.dist[v] !== -1) { group[v] = base + sub.group[v]; dist[v] = sub.dist[v]; }
  }
  return { ids: sorted, taken: Int32Array.from(taken), group, dist };
}
