/**
 * The by-links-3d layout, step 9: everything placed after the force steps. The body takes its relaxed points; the
 * middle; each group's skin; outward(); what hangs from the body; last, the pinned elements at their Pins. An element
 * off the main piece that is not pinned is placed by no rule of a run (pieces.ts lays out its piece, or hands it back).
 * No recursion, typed arrays, every sum and every tie in a written order.
 *
 * hang(ids, body, hangCut, hangDepth, off, taken, group, cpt, plate, degree, relaxed[, opts]) -> answer (below)
 *   ids        the element ids in code point order, as structure() answers them; n = ids.length
 *   body       Uint8Array(n): structure()'s body
 *   hangCut    Int32Array(n): structure()'s hangCut (the body element an element hangs through; -1 none)
 *   hangDepth  Int32Array(n): structure()'s hangDepth (links away from that element)
 *   off        Uint8Array(n): structure()'s off (not in the main piece)
 *   taken      Int32Array(k): centres()' taken (element indexes of the centres, in rank order)
 *   group      Int32Array(n): centres()' group (-1 outside the body)
 *   cpt        Float64Array(3k): points()' cpt, row g at 3g
 *   plate      null, or { pinned: Uint8Array(n), at: Float64Array(3n) }: points()' plate (only those two are read);
 *              row v of `at` is a pinned element's place on the map
 *   degree     Int32Array(n): each element's number of distinct neighbours (a self-link is none)
 *   relaxed    Float64Array(3n): each body element's point after the force steps (relax.ts), row v at 3v; rows of
 *              elements outside the body are not read
 *   opts.held  null, or { flag: Uint8Array(n), at: Float64Array(3n) } (method.ts's held points): flag[v] 1 for a held
 *              element, its held point at 3v. A flagged element that is pinned is not held here (the Pin is the
 *              world's). Absent or null: the rule below as it is, bit for bit.
 *
 * With opts.held (H, the held elements that are not pinned; "near" a point: some element of H at a plain 3D
 * distance under LINE from it, every element of H tested in index order, the first found ends the test):
 *   5. hang   the members of a cut in the same order. First the claims: for each member in H, in that order, at its
 *             own depth d, place j is claimed when the member's held point lies under LINE from place j's point at
 *             depth d; j runs 0, 1, ... while the place's distance from the fan's axis at that depth (fan, or fan * 0.5
 *             under a pinned cut) is under the held point's distance from that axis point plus LINE plus REST (past
 *             it no place can be within LINE). A member in H takes no place: it keeps its held point. Any other
 *             member (a pinned one too, which leaves its place in step 7) takes the lowest place j = 0, 1, ... that
 *             is not claimed, not taken by an earlier such member of this cut, and whose point (the formula below
 *             with j and the member's own depth) is not near. Nothing held: j is the member's rank.
 *   8. held   (after step 6, before step 7) every element of H stands at its held point.
 *
 * The answer:
 *   pos     Float64Array(3n): every element's point, row v at 3v (x, y, z)
 *   how     Uint8Array(n): how it got there, an index into HOW
 *   skin    Float64Array(k): each group's skin; middle: Float64Array(3)
 *
 * The rule, in the order it runs:
 *   1. body   each body element stands at its relaxed point: a centre (it is taken[group[v]]) or with a centre.
 *   2. middle the mean of the body's relaxed points: x, y and z each summed over the body in index order, then
 *             divided by the body's size.
 *   3. skin   for each group g: over its body elements that are not pinned, in index order, the length of
 *             (point - cpt[g]); none: 0. Then the nine-in-ten quantile, linear between the two nearest values: the
 *             m values sorted rising (a[0..m-1]); vi = (m - 1) * 0.9; if vi >= m - 1, lo = hi = m - 1, else
 *             lo = floor(vi), hi = lo + 1; t = vi - lo; d = a[hi] - a[lo]; the answer is a[hi] - d * (1 - t) when
 *             t >= 0.5, else a[lo] + d * t.
 *   4. outward(p, g)  u = p - cpt[g], divided by its length when the length is over 1e-6, else the zero vector;
 *             o = cpt[g] - middle, divided by its length when over 1e-6, else (0, 0, 1); u = u + 0.75 * o; the answer
 *             is u divided by its length. (A zero ray, a cut that is its group's centre, takes the group's own
 *             direction away from the middle; that zero too takes straight up.) A unit ray, or none, plus 0.75 of a
 *             unit direction is never shorter than 0.25, so the last division never divides by zero.
 *   5. hang   the cut elements in index order (id order); for cut c of group g: u = outward(point of c, g);
 *             t = u x (0, 0, 1), and when its length is under 1e-3, t = u x (1, 0, 0); t = t / length(t);
 *             w = u x t. Its members by depth, then index; member j at depth d: ang = GOLD * j,
 *             fan = REST * 0.5 * sqrt(j), point = cpt[g] + u * (skin[g] + REST * d) + (t * cos(ang) + w * sin(ang)) * fan,
 *             left to right per axis. When c is pinned, the point is instead c's place plus
 *             (cos(ang) * fan * 0.5, sin(ang) * fan * 0.5, REST * d). An element with one neighbour at depth 1 is
 *             one link, any other an arm. (a x b = (a1 b2 - a2 b1, a2 b0 - a0 b2, a0 b1 - a1 b0).)
 *   6. off    every element off the main piece that is not pinned is placed by no rule: its how is OFF and its
 *             point (0, 0, 0), and the caller leaves it out of its answer (pieces.ts: its own piece's run places it,
 *             or it is handed back as unplaced).
 *   7. map    last, every pinned element stands at its place.
 * A length is Math.sqrt(dx * dx + dy * dy + dz * dz) in that order. Math.cos and Math.sin are the only runtime
 * functions beyond + - * /, sqrt and floor: nothing iterates on them, so two runtimes agree within a tolerance.
 * Module-internal.
 */
export const REST = 60.0;
// The golden angle, PI * (3 - sqrt(5)), written as the double it is: an expression at the top level stays in every
// bundle that never lays out in 3D (the multiplication is not marked pure). test/layout-by-links-3d.test.mjs holds
// the literal to the expression.
export const GOLD = 2.399963229728653;
export const HOW = ['centre', 'with', 'arm', 'link', 'off', 'map'] as const;
export const CENTRE = 0, WITH = 1, ARM = 2, LINK = 3, OFF = 4, MAP = 5;
export const LINE = REST / 8; // a held element nearer than this to a free place takes it (held points only)

export interface Hang {
  pos: Float64Array;
  how: Uint8Array;
  skin: Float64Array;
  middle: Float64Array;
}

const len3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);

// the nine-in-ten quantile of the first m values of a (sorted here, rising), linear between the two nearest
function quantile90(a: Float64Array, m: number): number {
  if (m === 0) return 0.0;
  const s = Float64Array.from(a.subarray(0, m)).sort();
  const vi = (m - 1) * 0.9;
  let lo, hi;
  if (vi >= m - 1) { lo = m - 1; hi = m - 1; } else { lo = Math.floor(vi); hi = lo + 1; }
  const t = vi - lo;
  const d = s[hi] - s[lo];
  return t >= 0.5 ? s[hi] - d * (1 - t) : s[lo] + d * t;
}

export function hang(ids: readonly string[], body: Uint8Array, hangCut: Int32Array, hangDepth: Int32Array, off: Uint8Array,
  taken: Int32Array, group: Int32Array, cpt: Float64Array, plate: { pinned: Uint8Array; at: Float64Array } | null,
  degree: Int32Array, relaxed: Float64Array,
  opts: { held?: { flag: Uint8Array; at: Float64Array } | null } = {}): Hang {
  const n = ids.length, k = taken.length;
  const pinned = plate ? plate.pinned : new Uint8Array(n);
  const at = plate ? plate.at : (null as unknown as Float64Array);
  const pos = new Float64Array(3 * n);
  const how = new Uint8Array(n).fill(255);

  // the held elements that are not pinned (H in the head), and the near test against every one of them
  const H = opts.held || null;
  const hat = H ? H.at : (null as unknown as Float64Array);
  const line = LINE;
  const inH = new Uint8Array(n);
  const hl: number[] = [];
  if (H) for (let v = 0; v < n; v++) if (H.flag[v] === 1 && !pinned[v]) { inH[v] = 1; hl.push(v); }
  function near(x: number, y: number, z: number): boolean {
    for (let i = 0; i < hl.length; i++) {
      const u = hl[i];
      if (len3(x - hat[3 * u], y - hat[3 * u + 1], z - hat[3 * u + 2]) < line) return true;
    }
    return false;
  }

  // 1. the body at its relaxed points
  let nb = 0;
  for (let v = 0; v < n; v++) {
    if (!body[v]) continue;
    pos[3 * v] = relaxed[3 * v]; pos[3 * v + 1] = relaxed[3 * v + 1]; pos[3 * v + 2] = relaxed[3 * v + 2];
    how[v] = taken[group[v]] === v ? CENTRE : WITH;
    nb++;
  }

  // 2. the middle
  const middle = new Float64Array(3);
  for (let v = 0; v < n; v++) {
    if (!body[v]) continue;
    middle[0] += relaxed[3 * v]; middle[1] += relaxed[3 * v + 1]; middle[2] += relaxed[3 * v + 2];
  }
  middle[0] /= nb; middle[1] /= nb; middle[2] /= nb;

  // 3. each group's skin
  const skin = new Float64Array(k);
  const vals = new Float64Array(n);
  for (let g = 0; g < k; g++) {
    let m = 0;
    for (let v = 0; v < n; v++) {
      if (!body[v] || group[v] !== g || pinned[v]) continue;
      vals[m++] = len3(relaxed[3 * v] - cpt[3 * g], relaxed[3 * v + 1] - cpt[3 * g + 1], relaxed[3 * v + 2] - cpt[3 * g + 2]);
    }
    skin[g] = quantile90(vals, m);
  }

  // 4. outward from the group's point through p, leaning away from the middle; the answer into out
  const out = new Float64Array(3);
  function outward(px: number, py: number, pz: number, g: number): void {
    let ux = px - cpt[3 * g], uy = py - cpt[3 * g + 1], uz = pz - cpt[3 * g + 2];
    const lu = len3(ux, uy, uz);
    if (lu > 1e-6) { ux = ux / lu; uy = uy / lu; uz = uz / lu; } else {
      ux = 0.0; uy = 0.0; uz = 0.0;
    }
    let ox = cpt[3 * g] - middle[0], oy = cpt[3 * g + 1] - middle[1], oz = cpt[3 * g + 2] - middle[2];
    const lo = len3(ox, oy, oz);
    if (lo > 1e-6) { ox = ox / lo; oy = oy / lo; oz = oz / lo; } else { ox = 0.0; oy = 0.0; oz = 1.0; }
    ux = ux + 0.75 * ox; uy = uy + 0.75 * oy; uz = uz + 0.75 * oz;
    const l = len3(ux, uy, uz); // never under 0.25 (the head says why)
    out[0] = ux / l; out[1] = uy / l; out[2] = uz / l;
  }

  // 5. what hangs from the body: the members of each cut, by depth then index
  const fp = new Float64Array(3);
  const count = new Int32Array(n);
  let nh = 0;
  for (let v = 0; v < n; v++) if (hangCut[v] !== -1) { count[hangCut[v]]++; nh++; }
  const first = new Int32Array(n + 1);
  for (let c = 0; c < n; c++) first[c + 1] = first[c] + count[c];
  const fill = first.slice(0, n);
  const members = new Int32Array(nh);
  for (let v = 0; v < n; v++) if (hangCut[v] !== -1) members[fill[hangCut[v]]++] = v; // rising index within a cut
  for (let c = 0; c < n; c++) {
    const a = first[c], b = first[c + 1];
    if (a === b) continue;
    const row = members.subarray(a, b);
    row.sort((x, y) => (hangDepth[x] - hangDepth[y]) || (x - y));
    const g = group[c];
    outward(pos[3 * c], pos[3 * c + 1], pos[3 * c + 2], g);
    const ux = out[0], uy = out[1], uz = out[2];
    // t = u x (0, 0, 1), else u x (1, 0, 0)
    let tx = uy * 1.0 - uz * 0.0, ty = uz * 0.0 - ux * 1.0, tz = ux * 0.0 - uy * 0.0;
    if (len3(tx, ty, tz) < 1e-3) { tx = uy * 0.0 - uz * 0.0; ty = uz * 1.0 - ux * 0.0; tz = ux * 0.0 - uy * 1.0; }
    const lt = len3(tx, ty, tz);
    tx = tx / lt; ty = ty / lt; tz = tz / lt;
    const wx = uy * tz - uz * ty, wy = uz * tx - ux * tz, wz = ux * ty - uy * tx;
    const overPlace = !!pinned[c];
    // place j's point for a member at depth d, into fp
    const fanPoint = (j: number, d: number): void => {
      const ang = GOLD * j;
      const fan = REST * 0.5 * Math.sqrt(j);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      if (overPlace) { // what hangs from a place on the map stands over that place
        fp[0] = at[3 * c] + ca * fan * 0.5;
        fp[1] = at[3 * c + 1] + sa * fan * 0.5;
        fp[2] = at[3 * c + 2] + REST * d;
      } else {
        const reach = skin[g] + REST * d;
        fp[0] = cpt[3 * g] + ux * reach + (tx * ca + wx * sa) * fan;
        fp[1] = cpt[3 * g + 1] + uy * reach + (ty * ca + wy * sa) * fan;
        fp[2] = cpt[3 * g + 2] + uz * reach + (tz * ca + wz * sa) * fan;
      }
    };
    const used = H ? new Set<number>() : (null as unknown as Set<number>); // places taken by this cut's members not in H, and the places claimed
    if (H) {
      for (let r = 0; r < row.length; r++) {
        const v = row[r];
        if (!inH[v]) continue;
        const d = hangDepth[v];
        const hx = hat[3 * v], hy = hat[3 * v + 1], hz = hat[3 * v + 2];
        // the fan's axis point at depth d, and the held point's distance from it
        let axx, axy, axz;
        if (overPlace) { axx = at[3 * c]; axy = at[3 * c + 1]; axz = at[3 * c + 2] + REST * d; } else {
          const reach = skin[g] + REST * d;
          axx = cpt[3 * g] + ux * reach; axy = cpt[3 * g + 1] + uy * reach; axz = cpt[3 * g + 2] + uz * reach;
        }
        const bound = len3(hx - axx, hy - axy, hz - axz) + line + REST;
        for (let j = 0; ; j++) {
          const fan = REST * 0.5 * Math.sqrt(j);
          if (!((overPlace ? fan * 0.5 : fan) < bound)) break;
          fanPoint(j, d);
          if (len3(fp[0] - hx, fp[1] - hy, fp[2] - hz) < line) used.add(j);
        }
      }
    }
    for (let r = 0; r < row.length; r++) {
      const v = row[r], d = hangDepth[v];
      how[v] = degree[v] === 1 && d === 1 ? LINK : ARM;
      let j = r; // nothing held: the member's rank
      if (H) {
        if (inH[v]) continue; // keeps its held point (step 8)
        for (j = 0; ; j++) {
          if (used.has(j)) continue;
          fanPoint(j, d);
          if (!near(fp[0], fp[1], fp[2])) break;
        }
        used.add(j);
      }
      fanPoint(j, d);
      pos[3 * v] = fp[0]; pos[3 * v + 1] = fp[1]; pos[3 * v + 2] = fp[2];
    }
  }

  // 6. what is off the main piece and not pinned is placed by no rule of this run (pieces.ts places its piece)
  for (let v = 0; v < n; v++) if (off[v] && !pinned[v]) how[v] = OFF;

  // 8. every held element that is not pinned stands at its held point, whatever the rules above gave it
  if (H) {
    for (let i = 0; i < hl.length; i++) {
      const v = hl[i];
      pos[3 * v] = hat[3 * v]; pos[3 * v + 1] = hat[3 * v + 1]; pos[3 * v + 2] = hat[3 * v + 2];
    }
  }

  // 7. last, so nothing above moves it: a pinned element stands at its place
  for (let v = 0; v < n; v++) {
    if (!pinned[v]) continue;
    pos[3 * v] = at[3 * v]; pos[3 * v + 1] = at[3 * v + 1]; pos[3 * v + 2] = at[3 * v + 2];
    how[v] = MAP;
  }
  for (let v = 0; v < n; v++) if (how[v] === 255) throw new Error(`hang: ${ids[v]} was placed by no rule`);
  return { pos, how, skin, middle };
}
