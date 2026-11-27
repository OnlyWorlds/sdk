#!/usr/bin/env node
/**
 * mutants-promise.mjs: watches scripts/verify-promise.mjs fail, once for each thing it holds, on copies of the
 * built declarations, package.json, CHANGELOG.md and scripts/public-names.json (never the real files), and
 * pass on an unchanged copy. Run after `npm run build`.
 *
 * Exit: 0 when every plant failed as named and both controls passed, 1 otherwise.
 */
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'scripts', 'verify-promise.mjs');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'ow-promise-'));
  mkdirSync(join(dir, 'dist'));
  mkdirSync(join(dir, 'scripts'));
  for (const v of Object.values(pkg.exports)) if (v && typeof v === 'object' && v.types) cpSync(join(ROOT, v.types), join(dir, v.types));
  for (const f of ['package.json', 'CHANGELOG.md', 'scripts/public-names.json']) cpSync(join(ROOT, f), join(dir, f));
  return dir;
}
const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), 'utf8')));
const names = (dir, fn) => edit(dir, 'scripts/public-names.json', (t) => JSON.stringify(fn(JSON.parse(t))));
const once = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error(`plant anchor not found: ${from}`); return text.slice(0, i) + to + text.slice(i + from.length); };
// A copy made a 5.0.0: its marks then name 6.0, as a real major's would, or rule 1 calls each one stale.
const major5 = (dir, date) => {
  edit(dir, 'package.json', (t) => t.replace(`"version": "${pkg.version}"`, '"version": "5.0.0"'));
  for (const v of Object.values(pkg.exports)) if (v && typeof v === 'object' && v.types) edit(dir, v.types, (t) => t.replace(/\b5\.0(\.0)?\b/g, '6.0'));
  edit(dir, 'CHANGELOG.md', (t) => t.replace('## [Unreleased]', `## [Unreleased]\n\n## [5.0.0] - ${date}`));
};
const ghost = (since) => (f) => { f.entries['.'].GhostName = since ? { deprecated: { since, leaves: '5.0' } } : {}; return f; };

const plants = [
  ['a listed name gone within the major', (d) => names(d, ghost(null)), 1, /\(2\) \. GhostName: listed at/],
  ['a public name the file does not list', (d) => names(d, (f) => { delete f.entries['.'].OwV2Client; return f; }), 1, /\(2\) \. OwV2Client: public in .* not in scripts\/public-names\.json/],
  ['a mark without its since', (d) => edit(d, 'dist/index.d.ts', (t) => once(t, '@deprecated Since 4.177.0. The layout profile', '@deprecated The layout profile')), 1, /\(1\) \. OwLayout(ByKind|Around)\.version: its @deprecated does not open with "Since/],
  ['a mark that leaves in a minor', (d) => edit(d, 'dist/index.d.ts', (t) => once(t, 'carries no version key. Leaves in 5.0.', 'carries no version key. Leaves in 4.300.')), 1, /\(1\) \. OwLayout(ByKind|Around)\.version: it leaves in 4\.0, not a major above 4/],
  ['a mark since a release after this one', (d) => edit(d, 'dist/index.d.ts', (t) => once(t, '@deprecated Since 4.177.0. The layout profile', '@deprecated Since 9.9.9. The layout profile')), 1, /deprecated "since 9\.9\.9", after this release/],
  ['a major that drops an unmarked name', (d) => { major5(d, '2027-12-01'); names(d, ghost(null)); }, 1, /\(3\) \. GhostName: gone in major 5 without a deprecation first/],
  ['a major that drops a name under six months after its mark', (d) => { major5(d, '2027-05-01'); names(d, ghost('4.177.0')); }, 1, /\(3\) \. GhostName: deprecated since 4\.177\.0 \(2026-11-17\), gone 2027-05-01, before 2027-05-17/],
  ['control: a major that drops a name six months after its mark', (d) => { major5(d, '2027-05-17'); names(d, ghost('4.177.0')); }, 0, /^PASS/m],
  ['control: the copy unchanged', () => {}, 0, /^PASS/m],
];

let bad = 0;
for (const [what, plant, want, line] of plants) {
  const dir = copy();
  try {
    plant(dir);
    const r = spawnSync(process.execPath, [CHECK], { env: { ...process.env, OW_PROMISE_ROOT: dir, OW_PROMISE_NAMES: join(dir, 'scripts', 'public-names.json') }, encoding: 'utf8', timeout: 120000 });
    const out = `${r.stdout}${r.stderr}`;
    const ok = r.status === want && line.test(out);
    if (!ok) bad++;
    console.log(`${ok ? 'as named' : 'NOT AS NAMED'}: ${what} (exit ${r.status}, wanted ${want})${ok ? '' : `\n${out.slice(0, 1200)}`}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(bad ? `mutants-promise: FAIL: ${bad} of ${plants.length} not as named` : `mutants-promise: PASS: ${plants.length - 2} plants each failed as named; both controls passed`);
process.exit(bad ? 1 : 0);
