/**
 * The by-links-3d layout, steps 10 to 12: the pieces, the ring and the answer. Every piece of the graph that holds a
 * pair is laid out by its own links; only a lone node (no link at all) that is not pinned is handed back, by id, in
 * `unplaced`. A wrapper round method.ts's layout3d: one run on the whole graph, one run per other piece that holds a
 * pair. No rule of a run is changed or copied here.
 *
 * layoutPieces(nodes, edges, rows, table[, opts]) -> answer
 *   nodes, edges, rows, table   as layout3d takes them (method.ts's head)
 *   opts.held, opts.heldUnit    as layout3d takes them; each run is handed its share of held (below)
 *
 * The answer: { method, ids, points, how, group, part, centres, held, unplaced }
 *   ids ... held  as layout3d answers them, over the placed nodes only, in the order handed in
 *   unplaced      the ids of the lone nodes that are not pinned, by id (code point order), a held one too
 *   centres       the main run's that are placed, then each other piece's in its run's rank order, the pieces in the
 *                 ring's order (a piece that is not moved among them)
 *
 * The rule, in the order it runs:
 *   0. refusal  the shape of the whole held (held-not-object, held-not-point), then heldUnit (held-unit), before
 *            anything runs; the box (held-box) is tested by each run on the held points it holds, the main run
 *            first, then the pieces' runs in the ring's order. No node: one run, holding nothing.
 *   1. pieces  the undirected pairs (a link whose end is no node passed over, a self-link none); a lone node is a
 *            piece of one. The main piece is the one with the most nodes; among equals, the one holding the lowest
 *            id (code point order).
 *   2. main    layout3d on the whole graph, with the rows, holding the held points of the main piece's nodes (when
 *            it holds a pair) and of every node the plate places. It keeps every node of the main piece when that
 *            piece holds a pair, and every pinned node (how 'map' there) wherever it is.
 *   3. a piece each other piece of two nodes or more: layout3d on its nodes (the order handed in), the links between
 *            them (the order handed in), no rows, holding the held points of its nodes that are not pinned and each
 *            pinned node's point from the main run. A piece that holds a held or pinned point is not moved; every
 *            other is a ring piece.
 *   4. ring    M, the mean of the kept nodes' points (summed in id order); Rmain, the greatest length from M over the
 *            kept nodes and every node of a piece that is not moved. Each ring piece's c (its run's mean, id order)
 *            and r (the greatest length from c); rmax the greatest r. The ring pieces by size, larger first, a tie
 *            to the lower least id. Ring 0 at R = Rmain + RING_GAP + rmax; a piece's angle th = 2 * asin((r +
 *            RING_GAP / 2) / R); it joins the ring when it is the ring's first or when sum + th <= 2 * PI - FIT,
 *            else the next ring opens at R + 2 * rmax + RING_GAP. On each ring the angle left over is shared equally,
 *            one share after each piece: phi = a + th / 2, a = a + (th + share), and each point of the piece moves
 *            by T = (M.x + R * cos(phi) - c.x, M.y + R * sin(phi) - c.y, M.z - c.z), one addition per coordinate.
 *   5. answer  a kept node takes the main run's point and words; a pinned node outside the main piece that its
 *            piece's run makes a centre answers group its own id and part null. Any other node of a piece of two
 *            or more takes its piece's run's point (moved by T on the ring) and words. A lone node that is not
 *            pinned is unplaced.
 * Math.asin, Math.cos and Math.sin are the only runtime functions beyond + - * / and sqrt here: the ring's points
 * agree between runtimes within the fixture's tolerance, and every other number is exact.
 * Module-internal.
 */
import { byCodePoint } from './order';
import { layout3d, METHOD, REST, readHeld, readUnit } from './method';
import type { HeldPoints, Layout3d, Layout3dEdge, Layout3dNode } from './method';
import { plate as plateOf } from './plate';
import { CLEAR } from './points';
import type { DirectionTable } from './points';

export const RING_GAP = CLEAR * REST; // the ring's gap, the packing's own clearance: 108 units
export const FIT = 0.000001;          // the fit's margin, in radians: a piece joins a ring while sum + th <= 2 * PI - FIT
const TWO_PI = 2 * Math.PI;
const FIT_EDGE = TWO_PI - FIT;        // worked out once

type Row = Record<string, unknown>;
type Point = ArrayLike<number>;

export interface LayoutPieces extends Layout3d {
  unplaced: string[];
}

interface Piece { members: number[]; least: string }
interface Run { ans: Layout3d; row: Map<string, number>; moved: boolean; c: number[]; r: number; T: number[] | null }

function heldMapOf(held: HeldPoints | null | undefined): Map<string, Point> {
  if (held === undefined || held === null) return new Map();
  if (held instanceof Map) return held as Map<string, Point>;
  return new Map(Object.entries(held as Readonly<Record<string, Point>>));
}

export function layoutPieces(nodes: readonly Layout3dNode[], edges: readonly Layout3dEdge[], rows: readonly Row[] | null,
  table: DirectionTable, opts: { held?: HeldPoints | null; heldUnit?: number | null } = {}): LayoutPieces {
  // 0. the shape refusals on the whole held, then heldUnit; the box waits for the runs
  readHeld(opts.held, false);
  readUnit(opts.heldUnit);
  const n = nodes.length;
  const runOpts = (held: Map<string, Point> | null | undefined): { held?: HeldPoints | null; heldUnit?: number | null } => {
    const o: { held?: HeldPoints | null; heldUnit?: number | null } = {};
    if (held !== undefined) o.held = held;
    if (opts.heldUnit !== undefined) o.heldUnit = opts.heldUnit;
    return o;
  };
  // no node: no held id is a node's, so the one run holds none of them
  if (!n) {
    const none = opts.held === undefined || opts.held === null ? opts.held : new Map<string, Point>();
    return { ...layout3d(nodes, edges, rows, table, runOpts(none)), unplaced: [] };
  }
  const handed = nodes.map((x) => x.id);
  const mainRow = new Map(handed.map((id, i) => [id, i]));

  // 1. the pieces
  const sortedNodes = [...nodes].sort((a, b) => byCodePoint(a.id, b.id));
  const ids = sortedNodes.map((x) => x.id);
  const at = new Map(ids.map((id, i) => [id, i]));
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const e of edges) {
    const a = at.get(e.source), b = at.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) { if (ra < rb) parent[rb] = ra; else parent[ra] = rb; }
  }
  const pieceOf = new Int32Array(n).fill(-1);
  const pieces: Piece[] = []; // in the order of their least id; members in id order
  for (let v = 0; v < n; v++) {
    const r = find(v);
    if (pieceOf[r] === -1) { pieceOf[r] = pieces.length; pieces.push({ members: [], least: ids[v] }); }
    pieceOf[v] = pieceOf[r];
    pieces[pieceOf[v]].members.push(v);
  }
  let mainP = -1, mainSize = 0;
  for (let p = 0; p < pieces.length; p++) if (pieces[p].members.length > mainSize) { mainSize = pieces[p].members.length; mainP = p; }

  // 2. the main run: it holds the held points of its piece's nodes and of every node the plate places
  const heldAll = heldMapOf(opts.held);
  const onMap = new Set<string>();
  if (rows) { const pa = plateOf(rows, new Set(ids)); if (pa) for (const id of pa.at.keys()) onMap.add(id); }
  const mainSet = new Set(mainSize >= 2 ? pieces[mainP].members.map((v) => ids[v]) : []);
  let mainHeld: Map<string, Point> | null | undefined = opts.held === undefined || opts.held === null ? opts.held : new Map();
  if (mainHeld) for (const [id, q] of heldAll) if (mainSet.has(id) || onMap.has(id)) mainHeld.set(id, q);
  const main = layout3d(nodes, edges, rows, table, runOpts(mainHeld));

  // what the answer keeps from the main run
  const pinned = new Uint8Array(n), keep = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (main.how[mainRow.get(ids[v]) as number] === 'map') pinned[v] = 1;
    if ((mainSize >= 2 && pieceOf[v] === mainP) || pinned[v]) keep[v] = 1;
  }

  // the ring's order: by size, larger first; a tie to the lower least id
  const others: number[] = [];
  for (let p = 0; p < pieces.length; p++) if (p !== mainP && pieces[p].members.length >= 2) others.push(p);
  others.sort((p, q) => (pieces[q].members.length - pieces[p].members.length) || byCodePoint(pieces[p].least, pieces[q].least));

  // 3. each other piece of two or more, run alone, in the ring's order
  const runs = new Map<number, Run>();
  for (const p of others) {
    const inP = new Set(pieces[p].members.map((v) => ids[v]));
    const pnodes = nodes.filter((x) => inP.has(x.id));
    const pedges = edges.filter((e) => inP.has(e.source) && inP.has(e.target));
    // its held points: each pinned node's main-run point, and the held points of its other nodes
    const sub = new Map<string, Point>();
    for (const v of pieces[p].members) {
      if (pinned[v]) { const m = mainRow.get(ids[v]) as number; sub.set(ids[v], [main.points[3 * m], main.points[3 * m + 1], main.points[3 * m + 2]]); }
      else if (heldAll.has(ids[v])) sub.set(ids[v], heldAll.get(ids[v]) as Point);
    }
    const ans = layout3d(pnodes, pedges, null, table, runOpts(sub.size ? sub : undefined));
    runs.set(p, { ans, row: new Map(ans.ids.map((id, i) => [id, i])), moved: sub.size === 0, c: [0, 0, 0], r: 0, T: null });
  }

  // 4. the main shape: M over the kept nodes, in id order; Rmain over the kept nodes and every node of a piece that
  // is not moved, at its point (a pinned one read once, as a kept node)
  let cnt = 0, sx = 0, sy = 0, sz = 0;
  for (let v = 0; v < n; v++) {
    if (!keep[v]) continue;
    const m = mainRow.get(ids[v]) as number;
    sx += main.points[3 * m]; sy += main.points[3 * m + 1]; sz += main.points[3 * m + 2]; cnt++;
  }
  const M = cnt ? [sx / cnt, sy / cnt, sz / cnt] : [0, 0, 0];
  let Rmain = 0;
  const reach = (x: number, y: number, z: number): void => {
    const dx = x - M[0], dy = y - M[1], dz = z - M[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > Rmain) Rmain = d;
  };
  for (let v = 0; v < n; v++) {
    if (!keep[v]) continue;
    const m = mainRow.get(ids[v]) as number;
    reach(main.points[3 * m], main.points[3 * m + 1], main.points[3 * m + 2]);
  }
  for (const p of others) {
    const u = runs.get(p) as Run;
    if (u.moved) continue;
    for (const v of pieces[p].members) {
      if (pinned[v]) continue;
      const j = u.row.get(ids[v]) as number;
      reach(u.ans.points[3 * j], u.ans.points[3 * j + 1], u.ans.points[3 * j + 2]);
    }
  }

  // each ring piece's c and r, over its run's points in id order
  const ringList = others.filter((p) => (runs.get(p) as Run).moved);
  for (const p of ringList) {
    const u = runs.get(p) as Run;
    let qx = 0, qy = 0, qz = 0;
    for (const v of pieces[p].members) {
      const i = u.row.get(ids[v]) as number;
      qx += u.ans.points[3 * i]; qy += u.ans.points[3 * i + 1]; qz += u.ans.points[3 * i + 2];
    }
    const k = pieces[p].members.length;
    const c = [qx / k, qy / k, qz / k];
    let r = 0;
    for (const v of pieces[p].members) {
      const i = u.row.get(ids[v]) as number;
      const dx = u.ans.points[3 * i] - c[0], dy = u.ans.points[3 * i + 1] - c[1], dz = u.ans.points[3 * i + 2] - c[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r) r = d;
    }
    u.c = c; u.r = r;
  }

  // the rings
  let rmax = 0;
  for (const p of ringList) if ((runs.get(p) as Run).r > rmax) rmax = (runs.get(p) as Run).r;
  const rings: Array<{ R: number; on: Array<{ p: number; th: number }>; sum: number }> = [];
  let R = Rmain + RING_GAP + rmax, on: Array<{ p: number; th: number }> = [], sumT = 0;
  for (const p of ringList) {
    const u = runs.get(p) as Run;
    let th = 2 * Math.asin((u.r + RING_GAP / 2) / R);
    if (on.length && !(sumT + th <= FIT_EDGE)) { // a ring holds at least one piece; the first that does not fit opens the next
      rings.push({ R, on, sum: sumT });
      R = R + 2 * rmax + RING_GAP;
      on = []; sumT = 0;
      th = 2 * Math.asin((u.r + RING_GAP / 2) / R);
    }
    on.push({ p, th });
    sumT += th;
  }
  if (on.length) rings.push({ R, on, sum: sumT });
  for (const ring of rings) {
    const share = (TWO_PI - ring.sum) / ring.on.length;
    let a = 0;
    for (const q of ring.on) {
      const phi = a + q.th / 2;
      a = a + (q.th + share);
      const u = runs.get(q.p) as Run;
      u.T = [M[0] + ring.R * Math.cos(phi) - u.c[0], M[1] + ring.R * Math.sin(phi) - u.c[1], M[2] - u.c[2]];
    }
  }

  // 5. the answer: the placed nodes in the order handed in
  const outIds: string[] = [], pts: number[] = [];
  const how: Layout3d['how'] = [], group: Layout3d['group'] = [], part: Layout3d['part'] = [], held: boolean[] = [];
  const unplaced: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = handed[i], v = at.get(id) as number;
    if (keep[v]) {
      const m = mainRow.get(id) as number;
      outIds.push(id); pts.push(main.points[3 * m], main.points[3 * m + 1], main.points[3 * m + 2]);
      how.push(main.how[m]); group.push(main.group[m]); part.push(main.part[m]); held.push(main.held[m]);
      // a pinned node its piece's run makes a centre answers as a pinned centre of the main shape does
      const pr = pinned[v] && pieceOf[v] !== mainP ? runs.get(pieceOf[v]) : undefined;
      if (pr && pr.ans.centres.includes(id)) { group[group.length - 1] = id; part[part.length - 1] = null; }
      continue;
    }
    const p = pieceOf[v];
    if (pieces[p].members.length < 2) { unplaced.push(v); continue; }
    const u = runs.get(p) as Run;
    const j = u.row.get(id) as number;
    let x = u.ans.points[3 * j], y = u.ans.points[3 * j + 1], z = u.ans.points[3 * j + 2];
    if (u.T) { x = x + u.T[0]; y = y + u.T[1]; z = z + u.T[2]; }
    outIds.push(id); pts.push(x, y, z);
    how.push(u.ans.how[j]); group.push(u.ans.group[j]); part.push(u.ans.part[j]); held.push(u.ans.held[j]);
  }
  unplaced.sort((a, b) => a - b); // places in id order are code point order
  const placed = new Set(outIds);
  const centres = main.centres.filter((id) => placed.has(id));
  for (const p of others) for (const id of (runs.get(p) as Run).ans.centres) centres.push(id);

  return { method: METHOD, ids: outIds, points: Float64Array.from(pts), how, group, part, centres, held,
    unplaced: unplaced.map((v) => ids[v]) };
}
