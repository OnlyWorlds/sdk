/**
 * The by-links-3d layout, step 2: the graph's structure, in one pass over the links. Three walks, each once over the
 * links:
 *   1. the pieces (what is joined to what), the largest the main piece (a tie: the one with the smaller least id);
 *   2. the main piece's blocks (sets of elements no single element's removal parts), by one depth-first walk with an
 *      edge stack, written without recursion; the body is the largest block. Among blocks of one size it is the one
 *      whose members, in id order and read member by member, come last;
 *   3. one breadth-first walk outward from the whole body at once: an element outside the body is reached through
 *      exactly one body element (any other road to the body would put it in the body's block), so the body element
 *      it was reached from is the joint it hangs through, and the walk's depth is its links away from it.
 *
 * structure(ids, pairs) -> { ids, body: Uint8Array, hangCut: Int32Array (-1 none), hangDepth: Int32Array, off: Uint8Array }
 *   ids    the element ids; pairs  [a, b] ids of each undirected link once (no self-links)
 * Indexes are places in `ids` put in code point order, so the answer does not move with the order handed in, nor
 * with the order of the links. Module-internal.
 */
import { byCodePoint } from './order';

export interface Structure {
  ids: string[];
  body: Uint8Array;
  hangCut: Int32Array;
  hangDepth: Int32Array;
  off: Uint8Array;
}

// a and b: two blocks of one size, each its members' places in rising order. True when a comes after b.
function after(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function structure(ids: readonly string[], pairs: ReadonlyArray<readonly [string, string]>): Structure {
  const sorted = [...ids].sort(byCodePoint);
  const at = new Map(sorted.map((id, i) => [id, i]));
  const n = sorted.length;
  // the links as two rows per link, grouped by element (CSR)
  const deg = new Int32Array(n + 1);
  const ea = new Int32Array(pairs.length), eb = new Int32Array(pairs.length);
  let m = 0;
  for (const [x, y] of pairs) {
    const a = at.get(x), b = at.get(y);
    if (a === undefined || b === undefined || a === b) continue;
    ea[m] = a; eb[m] = b; m++;
    deg[a + 1]++; deg[b + 1]++;
  }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(0, n);
  const nb = new Int32Array(2 * m);
  for (let k = 0; k < m; k++) { nb[fill[ea[k]]++] = eb[k]; nb[fill[eb[k]]++] = ea[k]; }

  // 1. the pieces
  const piece = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let main = -1, mainSize = 0, pieces = 0;
  for (let s = 0; s < n; s++) {
    if (piece[s] !== -1) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; piece[s] = pieces;
    while (head < tail) {
      const v = queue[head++];
      for (let k = deg[v]; k < deg[v + 1]; k++) { const w = nb[k]; if (piece[w] === -1) { piece[w] = pieces; queue[tail++] = w; } }
    }
    // s rises, so an equal later piece has the larger least id: the first of that size stays
    if (tail > mainSize) { mainSize = tail; main = pieces; }
    pieces++;
  }

  // 2. the main piece's blocks; the largest is the body
  const body = new Uint8Array(n);
  if (mainSize === 1) {
    for (let i = 0; i < n; i++) if (piece[i] === main) body[i] = 1;
  } else if (mainSize > 1) {
    const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), parent = new Int32Array(n).fill(-1), next = new Int32Array(n);
    const stackV = new Int32Array(n);
    const edgeA = new Int32Array(m), edgeB = new Int32Array(m);
    const stamp = new Int32Array(n).fill(-1);
    let best: number[] = [], blocks = 0, clock = 0, top = 0, etop = 0;
    let root = 0;
    while (piece[root] !== main) root++;
    disc[root] = low[root] = clock++; next[root] = deg[root]; stackV[top++] = root;
    while (top) {
      const v = stackV[top - 1];
      if (next[v] < deg[v + 1]) {
        const w = nb[next[v]++];
        if (disc[w] === -1) {
          parent[w] = v; disc[w] = low[w] = clock++; next[w] = deg[w];
          edgeA[etop] = v; edgeB[etop] = w; etop++;
          stackV[top++] = w;
        } else if (w !== parent[v] && disc[w] < disc[v]) {
          edgeA[etop] = v; edgeB[etop] = w; etop++;
          if (disc[w] < low[v]) low[v] = disc[w];
        }
      } else {
        top--;
        const u = parent[v];
        if (u === -1) continue;
        if (low[v] < low[u]) low[u] = low[v];
        if (low[v] >= disc[u]) {
          // u parts v's side from the rest: the edges down to (u, v) are one block
          const members: number[] = [];
          for (;;) {
            etop--;
            const a = edgeA[etop], b = edgeB[etop];
            if (stamp[a] !== blocks) { stamp[a] = blocks; members.push(a); }
            if (stamp[b] !== blocks) { stamp[b] = blocks; members.push(b); }
            if (a === u && b === v) break;
          }
          if (members.length >= best.length) {
            members.sort((x, y) => x - y);
            let wins = members.length > best.length;
            if (!wins) wins = after(members, best);
            if (wins) best = members;
          }
          blocks++;
        }
      }
    }
    for (const v of best) body[v] = 1;
  }

  // 3. outward from the body: the joint each other element of the main piece hangs through, and how far
  const hangCut = new Int32Array(n).fill(-1), hangDepth = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (body[i]) queue[tail++] = i;
  while (head < tail) {
    const v = queue[head++];
    for (let k = deg[v]; k < deg[v + 1]; k++) {
      const w = nb[k];
      if (body[w] || hangCut[w] !== -1) continue;
      hangCut[w] = body[v] ? v : hangCut[v];
      hangDepth[w] = hangDepth[v] + 1;
      queue[tail++] = w;
    }
  }
  const off = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (piece[i] !== main) off[i] = 1;
  return { ids: sorted, body, hangCut, hangDepth, off };
}
