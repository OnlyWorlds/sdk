/**
 * Unicode's simple case folding as the table says it: the C and S rows of
 * CaseFolding.txt at Unicode 15.1 (ruled 2026-10-22 for OW-18),
 * never a runtime's casing, so a fold a newer Unicode adds stays out
 * until the pin moves. Runs of `start.count.stride.delta` in base 36 (an empty
 * count or stride is 1), made by `codegen/fold_runs.mjs` from
 * the schema dist's `fixtures/owworld/CaseFolding-15.1.0.txt` (vendored under
 * `codegen/schema-dist/`); the test walks every row of that file.
 */
const FOLD_RUNS =
  '1t.q..w,51...lj,5c.n..w,60.7..w,74.o.2.1,8i.3.2.1,8p.8.2.1,96.n.2.1,ag...-3d,ah.3.2.1,an...-7g,ap...5u,' +
  'aq.2.2.1,au...5q,av...1,ax.2..5p,az...1,b2...27,b3...5m,b4...5n,b5...1,b7...5p,b8...5r,ba...5v,bb...5t,' +
  'bc...1,bg...5v,bh...5x,bj...5y,bk.3.2.1,bq...62,br...1,bt...62,bw...1,by...62,bz...1,c1.2..61,c3.2.2.1,' +
  'c7...63,c8...1,cc...1,ck...2,cl...1,cn...2,co...1,cq...2,cr.9.2.1,da.9.2.1,dt...2,du.2.2.1,dy...-2p,' +
  'dz...-1k,e0.k.2.1,f4...-3m,f6.9.2.1,fu...8bv,fv...1,fx...-4j,fy...8bs,g1...1,g3...-5f,g4...1x,g5...1z,' +
  'g6.5.2.1,n9...38,og.2.2.1,om...1,ov...38,p2...12,p4.3..11,p8...1s,pa.2..1r,pd.h..w,pv.9..w,qq...1,' +
  'r3...8,r4...-u,r5...-p,r9...-f,ra...-m,rc.c.2.1,s0...-1i,s1...-1c,s4...-1o,s5...-1s,s7...1,s9...-7,' +
  'sa...1,sd.3..-3m,sg.g..28,sw.w..w,v4.h.2.1,wa.r.2.1,xs...f,xt.7.2.1,y8.1c.2.1,10x.12..1c,3a8.12..5ls,' +
  '3bb...5ls,3bh...5ls,3y0.6..-8,5mo...-4su,5mp...-4st,5mq...-4sk,5mr.2..-4si,5mt...-4sj,5mu...-4sc,' +
  '5mv...-4ro,5mw...r7n,5n4.17..-2bk,5od.3..-2bk,5xc.23.2.1,61n...-1m,61q...-5vj,61s.1c.2.1,64o.8..-8,' +
  '654.6..-8,65k.8..-8,660.8..-8,66g.6..-8,66x.4.2.-8,67c.8..-8,688.8..-8,68o.8..-8,694.8..-8,69k.2..-8,' +
  '69m.2..-22,69o...-9,69q...-5j9,6a0.4..-2e,6a4...-9,6ab...-5kz,6ag.2..-8,6ai.2..-2s,6ar...-5kj,6aw.2..-8,' +
  '6ay.2..-34,6b0...-7,6bc.2..-3k,6be.2..-3i,6bg...-9,6jq...-5st,6ju...-6gv,6jv...-6di,6k2...s,6lc.g..g,' +
  '6mb...1,792.q..q,8ow.1c..1c,8rk...1,8rm...-8af,8rn...-2xy,8ro...-89z,8rr.3.2.1,8rx...-8bg,8ry...-8al,' +
  '8rz...-8bj,8s0...-8bi,8s2...1,8s5...1,8se.2..-8cf,8sg.1e.2.1,8vf.2.2.1,8vm...1,wu8.n.2.1,ww0.e.2.1,' +
  'x0i.7.2.1,x0y.v.2.1,x2x.2.2.1,x31...-r9g,x32.5.2.1,x3f...1,x3h...-wmg,x3k.2.2.1,x3q.a.2.1,x4a...-wn8,' +
  'x4b...-wnj,x4c...-wnf,x4d...-wn5,x4e...-wn8,x4g...-wlu,x4h...-wmi,x4i...-wlx,x4j...ps,x4k.8.2.1,' +
  'x50...-1c,x51...-wn7,x52...-raw,x53.2.2.1,x5c...1,x5i.2.2.1,x6d...1,xv4.28..-tzk,1dl1...1,1ee9.q..w,' +
  '1fcw.14..14,1fhs.10..14,1fn4.b..13,1fng.f..13,1fnw.7..13,1fo4.2..13,1h1c.1f..1s,1jfk.w..w,20cg.w..w,' +
  '2olc.y..y';

let foldTable: Map<number, number> | null = null;

/**
 * Simple case folding (Unicode 15.1, CaseFolding.txt C and S), code point by
 * code point: what OW-18 applies after NFC. A code point the table does not
 * map folds to itself.
 */
export function simpleCaseFold(text: string): string {
  if (!foldTable) {
    foldTable = new Map();
    for (const run of FOLD_RUNS.split(',')) {
      const [start, count, stride, delta] = run.split('.');
      const s = parseInt(start, 36);
      const n = count ? parseInt(count, 36) : 1;
      const step = stride ? parseInt(stride, 36) : 1;
      const d = parseInt(delta, 36);
      for (let k = 0; k < n; k++) foldTable.set(s + k * step, s + k * step + d);
    }
  }
  let out = '';
  for (const c of text) {
    const to = foldTable.get(c.codePointAt(0)!);
    out += to === undefined ? c : String.fromCodePoint(to);
  }
  return out;
}
