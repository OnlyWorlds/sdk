// The OW-18 fold table (Folder Format §4.7; Skeld's ruling, OW Council #9830): the C and S rows of Unicode's
// CaseFolding.txt at the pinned version, as runs, for `FOLD_RUNS` in src/world-file.ts.
//
//   node codegen/fold_runs.mjs [test/fixtures/CaseFolding-15.1.0.txt]
//
// Prints the string. A run is `start.count.stride.delta` in base 36: `count` code points from `start`, `stride` apart,
// each folding to itself plus `delta`; an empty `count` or `stride` is 1. The test in test/world-file.test.mjs walks
// every row of the same file against the built fold, so a hand edit or a stale string fails there.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || new URL('../test/fixtures/CaseFolding-15.1.0.txt', import.meta.url);
const map = new Map();
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = /^([0-9A-F]+); ([CS]); ([0-9A-F]+);/.exec(line);
  if (m) map.set(parseInt(m[1], 16), parseInt(m[3], 16));
}
const keys = [...map.keys()].sort((a, b) => a - b);
const runs = [];
for (let i = 0; i < keys.length;) {
  const s = keys[i];
  const delta = map.get(s) - s;
  let best = { n: 1, stride: 1 };
  for (const stride of [1, 2]) {
    let n = 1;
    while (i + n < keys.length && keys[i + n] === s + n * stride && map.get(keys[i + n]) - keys[i + n] === delta) n++;
    if (n > best.n) best = { n, stride };
  }
  runs.push([s.toString(36), best.n === 1 ? '' : best.n.toString(36), best.stride === 1 ? '' : '2', delta.toString(36)].join('.'));
  i += best.n;
}
process.stdout.write(runs.join(',') + '\n');
