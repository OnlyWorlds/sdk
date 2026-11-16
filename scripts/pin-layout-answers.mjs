// Pins each case of the by-links-3d fixture to the answer it gives, under BY_LINKS_3D_VERSION, so that the version
// is raised exactly when an answer changes. test/layout-by-links-3d.test.mjs reads the file this writes.
//
//   node scripts/pin-layout-answers.mjs           writes test/fixtures/layout/by-links-3d.answers.json
//   node scripts/pin-layout-answers.mjs --check   exit 0 when that file is what this would write now, 1 otherwise
//
// Each pin is the sha256 of JSON.stringify of a case's `want`, as the fixture holds it. A case new to the fixture is
// pinned under the version as it stands. A case whose answer differs from its pin is written only when
// BY_LINKS_3D_VERSION in src/layout-by-links-3d.ts is greater than the file's version: an answer that moved under the
// same version is refused, and the run says which cases moved. A case the fixture no longer holds is refused too, so a
// case is never dropped to hide a move. The `unplaced` suite is not pinned: the version speaks of layoutByLinks3d.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FIXTURE = new URL('../test/fixtures/layout/by-links-3d.fixture.json', import.meta.url);
const OUT = new URL('../test/fixtures/layout/by-links-3d.answers.json', import.meta.url);
const SRC = new URL('../src/layout-by-links-3d.ts', import.meta.url);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const src = readFileSync(SRC, 'utf8');
const m = src.match(/^export const BY_LINKS_3D_VERSION = (\d+);$/m);
if (!m) { console.log('FAILED src/layout-by-links-3d.ts has no line "export const BY_LINKS_3D_VERSION = <n>;"'); process.exit(1); }
const version = Number(m[1]);
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const now = {};
for (const c of fx.cases) {
  if (Object.hasOwn(now, c.name)) { console.log(`FAILED the fixture names the case ${c.name} twice`); process.exit(1); }
  now[c.name] = sha(JSON.stringify(c.want));
}

const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
if (old) {
  const gone = Object.keys(old.answers).filter((n) => !Object.hasOwn(now, n));
  if (gone.length) { console.log(`FAILED ${gone.length} pinned case(s) the fixture no longer holds: ${gone.join(' | ')}`); process.exit(1); }
  const moved = Object.keys(old.answers).filter((n) => old.answers[n] !== now[n]);
  if (version < old.version) { console.log(`FAILED BY_LINKS_3D_VERSION is ${version}, under the pinned version ${old.version}`); process.exit(1); }
  if (moved.length && version === old.version) {
    console.log(`FAILED ${moved.length} answer(s) moved under BY_LINKS_3D_VERSION ${version}: raise it in src/layout-by-links-3d.ts, then run this again (${moved.slice(0, 5).join(' | ')}${moved.length > 5 ? ' | …' : ''})`);
    process.exit(1);
  }
  if (!moved.length && version > old.version) {
    console.log(`FAILED BY_LINKS_3D_VERSION is ${version}, past the pinned ${old.version}, and no pinned answer moved: the version is raised only when one does`);
    process.exit(1);
  }
}
const text = `${JSON.stringify({ note: 'each case of by-links-3d.fixture.json pinned to the sha256 of JSON.stringify of its want, under BY_LINKS_3D_VERSION (scripts/pin-layout-answers.mjs)', version, answers: now }, null, 2)}\n`;
const line = `${Object.keys(now).length} cases under version ${version}`;
if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) { console.log(`STALE test/fixtures/layout/by-links-3d.answers.json is not what this writes now (${line})`); process.exit(1); }
  console.log(`current: ${line}`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote test/fixtures/layout/by-links-3d.answers.json: ${line}`);
}
