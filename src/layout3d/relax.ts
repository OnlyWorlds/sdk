/**
 * The by-links-3d layout, step 8: the force steps, on typed arrays, with grid cells of one cutoff for the near pairs.
 *
 * relax(feed, { steps, cutoff, cap0 }) -> { pos: Float64Array (n*3) }
 *   steps   how many steps (default feed.steps)
 *   cutoff  the push's reach in rest lengths (default 3)
 *   cap0    the cap on the first step, in rest lengths (default 3); it shrinks to a twentieth of a rest
 *
 * Each step: the elements are sorted into grid cells of one cutoff (a counting sort); every pair nearer than the
 * cutoff pushes apart by ((R * R) / d - R / 3) / d along the line between them, each pair once, a cell with itself
 * and with the 13 cells ahead of it; every link pulls its two ends towards a rest length by ((d - R) * 0.5 * w) / d;
 * every element that is not fixed moves by push + pull * scale + (anchor - point) * hold, capped at
 * cap0 * R * (1 - step / steps) + R / 20; a fixed element stands at its anchor. The sums run in the order written
 * here, so two runtimes agree to the last bit. Module-internal.
 */

export interface RelaxFeed {
  rest: number;
  steps: number;
  pos: ReadonlyArray<readonly number[]>;
  anchor: ReadonlyArray<readonly number[]>;
  pull: ReadonlyArray<number | readonly number[]>;
  fixed: ReadonlyArray<boolean> | null;
  pairs: ReadonlyArray<readonly [number, number]>;
  weight: readonly number[];
}

export function relax(feed: RelaxFeed, opts: { steps?: number; cutoff?: number; cap0?: number } = {}): { pos: Float64Array } {
  const R = feed.rest;
  const STEPS = opts.steps ?? feed.steps;
  const CUT = (opts.cutoff ?? 3) * R;
  const CAP0 = opts.cap0 ?? 3; // the first step's cap in rest lengths
  const n = feed.pos.length;
  const m = feed.pairs.length;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = feed.pos[i][0]; py[i] = feed.pos[i][1]; pz[i] = feed.pos[i][2];
    ax[i] = feed.anchor[i][0]; ay[i] = feed.anchor[i][1]; az[i] = feed.anchor[i][2];
  }
  const perAxis = Array.isArray(feed.pull[0]);
  const pullX = new Float64Array(n), pullY = new Float64Array(n), pullZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (perAxis) { const q = feed.pull[i] as readonly number[]; pullX[i] = q[0]; pullY[i] = q[1]; pullZ[i] = q[2]; }
    else pullX[i] = pullY[i] = pullZ[i] = feed.pull[i] as number;
  }
  const fixed = new Uint8Array(n);
  if (feed.fixed) for (let i = 0; i < n; i++) fixed[i] = feed.fixed[i] ? 1 : 0;
  const ea = new Int32Array(m), eb = new Int32Array(m);
  const ew = new Float64Array(m);
  const scale = new Float64Array(n);
  for (let k = 0; k < m; k++) {
    ea[k] = feed.pairs[k][0]; eb[k] = feed.pairs[k][1]; ew[k] = feed.weight[k];
    scale[ea[k]] += ew[k]; scale[eb[k]] += ew[k];
  }
  for (let i = 0; i < n; i++) scale[i] = 1 / Math.max(1, scale[i] / 4);

  const dx = new Float64Array(n), dy = new Float64Array(n), dz = new Float64Array(n);
  const lx = new Float64Array(n), ly = new Float64Array(n), lz = new Float64Array(n);
  // the grid, rebuilt each step as a counting sort: cell of each element, elements in cell order
  const cellOf = new Int32Array(n);
  const order = new Int32Array(n);
  const cut2 = CUT * CUT;

  for (let step = 0; step < STEPS; step++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i];
      if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i];
      if (pz[i] < z0) z0 = pz[i]; if (pz[i] > z1) z1 = pz[i];
    }
    const nx = Math.floor((x1 - x0) / CUT) + 1, ny = Math.floor((y1 - y0) / CUT) + 1, nz = Math.floor((z1 - z0) / CUT) + 1;
    const cells = nx * ny * nz;
    const startOf = new Int32Array(cells + 1);
    for (let i = 0; i < n; i++) {
      const c = (Math.floor((px[i] - x0) / CUT) * ny + Math.floor((py[i] - y0) / CUT)) * nz + Math.floor((pz[i] - z0) / CUT);
      cellOf[i] = c;
      startOf[c + 1]++;
    }
    for (let c = 0; c < cells; c++) startOf[c + 1] += startOf[c];
    const fill = startOf.slice(0, cells);
    for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;

    dx.fill(0); dy.fill(0); dz.fill(0);
    for (let cx = 0; cx < nx; cx++) for (let cy = 0; cy < ny; cy++) for (let cz = 0; cz < nz; cz++) {
      const c = (cx * ny + cy) * nz + cz;
      const s0 = startOf[c], s1 = startOf[c + 1];
      if (s0 === s1) continue;
      // this cell with itself and with the 13 cells ahead of it: every near pair once
      for (let ox = 0; ox <= 1; ox++) for (let oy = ox ? -1 : 0; oy <= 1; oy++) for (let oz = (ox || oy) ? -1 : 0; oz <= 1; oz++) {
        const qx = cx + ox, qy = cy + oy, qz = cz + oz;
        if (qx >= nx || qy < 0 || qy >= ny || qz < 0 || qz >= nz) continue;
        const q = (qx * ny + qy) * nz + qz;
        const same = q === c;
        const t0 = startOf[q], t1 = startOf[q + 1];
        if (t0 === t1) continue;
        for (let u = s0; u < s1; u++) {
          const i = order[u];
          const xi = px[i], yi = py[i], zi = pz[i];
          for (let v = same ? u + 1 : t0; v < t1; v++) {
            const j = order[v];
            const ux = xi - px[j], uy = yi - py[j], uz = zi - pz[j];
            const d2 = ux * ux + uy * uy + uz * uz;
            if (d2 > cut2) continue;
            const d = Math.max(Math.sqrt(d2), 1e-6);
            const f = ((R * R) / d - R / 3) / d;
            dx[i] += ux * f; dy[i] += uy * f; dz[i] += uz * f;
            dx[j] -= ux * f; dy[j] -= uy * f; dz[j] -= uz * f;
          }
        }
      }
    }

    lx.fill(0); ly.fill(0); lz.fill(0);
    for (let k = 0; k < m; k++) {
      const a = ea[k], b = eb[k];
      const ux = px[a] - px[b], uy = py[a] - py[b], uz = pz[a] - pz[b];
      const d = Math.max(Math.sqrt(ux * ux + uy * uy + uz * uz), 1e-6);
      const f = ((d - R) * 0.5 * ew[k]) / d;
      lx[b] += ux * f; ly[b] += uy * f; lz[b] += uz * f;
      lx[a] -= ux * f; ly[a] -= uy * f; lz[a] -= uz * f;
    }

    const cap = CAP0 * R * (1 - step / STEPS) + R / 20;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { px[i] = ax[i]; py[i] = ay[i]; pz[i] = az[i]; continue; }
      const vx = dx[i] + lx[i] * scale[i] + (ax[i] - px[i]) * pullX[i];
      const vy = dy[i] + ly[i] * scale[i] + (ay[i] - py[i]) * pullY[i];
      const vz = dz[i] + lz[i] * scale[i] + (az[i] - pz[i]) * pullZ[i];
      const len = Math.max(Math.sqrt(vx * vx + vy * vy + vz * vz), 1e-9);
      const s = Math.min(1, cap / len);
      px[i] += vx * s; py[i] += vy * s; pz[i] += vz * s;
    }
  }
  const pos = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { pos[3 * i] = px[i]; pos[3 * i + 1] = py[i]; pos[3 * i + 2] = pz[i]; }
  return { pos };
}
