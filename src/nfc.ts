/**
 * OW-18's NFC (Folder Format §4.7, serial 57): Unicode
 * Normalization Form C at Unicode 15.1, built from that version's own
 * UnicodeData and CompositionExclusions (vendored under
 * `codegen/schema-dist/fixtures/owworld/`), never a runtime's
 * `String.prototype.normalize`. A runtime's NFC is its ICU's Unicode version:
 * Node 22's is 16.0, which composes 20 code points 15.1 leaves unassigned
 * (Todhri, Tulu-Tigalari, Gurung Khema, Kirat Rai), and an older runtime misses
 * what 15.1 added. The tables are `nfc-tables.generated.ts`, made by
 * `codegen/nfc_tables.mjs`; the test checks every code point against the files.
 */
import { NFC_CLASS_RUNS, NFC_DECOMP, NFC_EXCLUDED } from './nfc-tables.generated';

const S_BASE = 0xac00, L_BASE = 0x1100, V_BASE = 0x1161, T_BASE = 0x11a7;
const L_COUNT = 19, V_COUNT = 21, T_COUNT = 28, N_COUNT = V_COUNT * T_COUNT, S_COUNT = L_COUNT * N_COUNT;

interface Tables {
  ccc: Map<number, number>;
  /** Full canonical decomposition, already recursive (Hangul excepted: by arithmetic). */
  decomp: Map<number, number[]>;
  /** Primary composites by their pair, keyed `first * 0x110000 + second`. */
  compose: Map<number, number>;
}

let tables: Tables | null = null;

function load(): Tables {
  const ccc = new Map<number, number>();
  for (const run of NFC_CLASS_RUNS.split(',')) {
    const [start, count, cls] = run.split('.');
    const s = parseInt(start, 36);
    const n = count ? parseInt(count, 36) : 1;
    const c = parseInt(cls, 36);
    for (let k = 0; k < n; k++) ccc.set(s + k, c);
  }
  const raw = new Map<number, number[]>();
  let cp = 0;
  for (const entry of NFC_DECOMP.split(',')) {
    const [gap, ...to] = entry.split('.');
    cp += parseInt(gap, 36);
    raw.set(cp, to.map(t => parseInt(t, 36)));
  }
  const excluded = new Set(NFC_EXCLUDED.split(',').map(t => parseInt(t, 36)));
  const compose = new Map<number, number>();
  for (const [c, to] of raw) {
    // Full composition exclusion: the listed ones, singletons, and non-starter decompositions.
    if (to.length !== 2 || excluded.has(c) || ccc.has(c) || ccc.has(to[0])) continue;
    compose.set(to[0] * 0x110000 + to[1], c);
  }
  const decomp = new Map<number, number[]>();
  const full = (c: number): number[] => {
    const done = decomp.get(c);
    if (done) return done;
    const to = raw.get(c);
    if (!to) return [c];
    const out = to.flatMap(full);
    decomp.set(c, out);
    return out;
  };
  for (const c of raw.keys()) full(c);
  return { ccc, decomp, compose };
}

/**
 * Normalization Form C as Unicode 15.1's files define it (UAX #15:
 * canonical decomposition, canonical ordering, canonical composition), the
 * NFC OW-18 folds names with before simple case folding. A code point 15.1
 * leaves unassigned is left as it is, whatever the runtime's Unicode knows.
 * Lone surrogates pass through.
 */
export function nfc(text: string): string {
  // Below U+00C0 nothing decomposes and nothing has a combining class.
  let plain = true;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) >= 0xc0) { plain = false; break; }
  if (plain) return text;
  const t = tables ?? (tables = load());
  const cls = (c: number) => t.ccc.get(c) ?? 0;

  // Decompose.
  const cps: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const s = c - S_BASE;
    if (s >= 0 && s < S_COUNT) {
      cps.push(L_BASE + Math.floor(s / N_COUNT), V_BASE + Math.floor((s % N_COUNT) / T_COUNT));
      if (s % T_COUNT) cps.push(T_BASE + (s % T_COUNT));
    } else {
      const d = t.decomp.get(c);
      if (d) cps.push(...d); else cps.push(c);
    }
  }

  // Canonical ordering: a stable sort of each run of nonzero classes.
  for (let i = 1; i < cps.length; i++) {
    const c = cps[i];
    const k = cls(c);
    if (!k) continue;
    let j = i;
    while (j > 0 && cls(cps[j - 1]) > k) { cps[j] = cps[j - 1]; j--; }
    cps[j] = c;
  }

  // Canonical composition: each character joins the last starter unless something between blocks it.
  const out: number[] = [];
  let starter = -1;
  let last = 0;
  for (const c of cps) {
    const k = cls(c);
    if (starter >= 0 && (out.length - 1 === starter || (last !== 0 && last < k))) {
      const a = out[starter];
      let composed: number | undefined;
      const l = a - L_BASE, v = c - V_BASE, s = a - S_BASE, tt = c - T_BASE;
      if (l >= 0 && l < L_COUNT && v >= 0 && v < V_COUNT) composed = S_BASE + (l * V_COUNT + v) * T_COUNT;
      else if (s >= 0 && s < S_COUNT && s % T_COUNT === 0 && tt > 0 && tt < T_COUNT) composed = a + tt;
      else composed = t.compose.get(a * 0x110000 + c);
      if (composed !== undefined) { out[starter] = composed; continue; }
    }
    if (k === 0) starter = out.length;
    last = k;
    out.push(c);
  }
  let r = '';
  for (const c of out) r += String.fromCodePoint(c);
  return r;
}
