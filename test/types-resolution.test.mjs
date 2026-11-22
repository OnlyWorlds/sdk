/**
 * What a TypeScript project is handed, read the way its compiler reads it: a consumer file that imports
 * the package's root and its `/waymark` and `/convert` subpaths is type-checked against the built declarations under each
 * module resolution a project can be set to. `node` (the older one, and the only settled one before
 * TypeScript 4.7) does not read `exports`, so a subpath's types reach it through `typesVersions`: without
 * that map the root's types are found and `@onlyworlds/sdk/waymark` is not.
 *
 * Runs the TypeScript the repo installs, against package.json and dist/*.d.ts copied into a scratch
 * node_modules, so nothing is resolved through the repo itself. With OW_TSC_DIR (a `typescript` package
 * folder) and OW_TSC_EXPECT (the version asked for) it runs that TypeScript instead: CI's `types` job runs
 * it so on each version in its matrix, the peer range's floor first, and a test below holds that first entry
 * to the floor. A resolution a version does not have is skipped there by name and runs on the others.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const TS_DIR = process.env.OW_TSC_DIR || join(ROOT, 'node_modules', 'typescript');
const TSC = join(TS_DIR, 'bin', 'tsc');
const TS_VERSION = JSON.parse(readFileSync(join(TS_DIR, 'package.json'), 'utf8')).version;
const [TS_MAJOR, TS_MINOR] = TS_VERSION.split('.').map(Number);
const tsAtLeast = (major, minor) => TS_MAJOR > major || (TS_MAJOR === major && TS_MINOR >= minor);
// The es2022 lib arrived in TypeScript 4.6; the floor, 4.5, reads the consumer with es2021's.
const LIB = tsAtLeast(4, 6) ? 'es2022,dom' : 'es2021,dom';

// Every subpath the package gives types for, read from its own exports.
const typed = Object.entries(pkg.exports)
  .filter(([sub, target]) => sub !== '.' && typeof target === 'object' && target !== null && typeof target.types === 'string')
  .map(([sub, target]) => [sub.replace(/^\.\//, ''), target.types.replace(/^\.\//, '')]);

const CONSUMER = `
import { OwV2Client, ELEMENT_TYPES, layoutByLinks3d } from '@onlyworlds/sdk';
import type { ElementType, OwElement, OwClientConfig } from '@onlyworlds/sdk';
import { mountWaymark } from '@onlyworlds/sdk/waymark';
import { convertKanka } from '@onlyworlds/sdk/convert';
import type { OwKankaConversion } from '@onlyworlds/sdk/convert';

const config: OwClientConfig = {};
const client = new OwV2Client(config);
const kind: ElementType = ELEMENT_TYPES[0];
export async function names(): Promise<string[]> {
  const page = await client.list(kind);
  const one: OwElement = await client.get(kind, 'id');
  const converted: OwKankaConversion = convertKanka(new Uint8Array());
  void one; void page; void layoutByLinks3d; void mountWaymark; void converted;
  return [kind];
}
`;

function check(resolution, module) {
  const dir = mkdtempSync(join(tmpdir(), 'ow-sdk-types-'));
  try {
    const home = join(dir, 'node_modules', '@onlyworlds', 'sdk');
    mkdirSync(join(home, 'dist'), { recursive: true });
    writeFileSync(join(home, 'package.json'), JSON.stringify(pkg));
    for (const f of readdirSync(join(ROOT, 'dist'))) if (f.endsWith('.d.ts')) cpSync(join(ROOT, 'dist', f), join(home, 'dist', f));
    // The package is ESM only, so the project is a module project: under node16 a file with no such
    // package.json is CommonJS, and the compiler rightly refuses to import the package from it.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    writeFileSync(join(dir, 'use.ts'), CONSUMER);
    const r = spawnSync(process.execPath, [TSC, '--noEmit', '--strict', '--target', 'es2020', '--lib', LIB,
      '--skipLibCheck', 'false', '--module', module, '--moduleResolution', resolution, 'use.ts'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the package gives types for a subpath, and this test reads which from its exports', () => {
  assert.deepEqual(typed, [['waymark', 'dist/waymark.d.ts'], ['convert', 'dist/convert.d.ts']], 'a new typed subpath: give the consumer file below an import of it');
});

test('every subpath with types is in typesVersions, naming the same file as exports', () => {
  const map = pkg.typesVersions?.['*'] ?? {};
  assert.deepEqual(Object.fromEntries(typed.map(([sub, file]) => [sub, [file]])), map,
    'typesVersions["*"] holds each typed subpath of exports and nothing else: the older resolution reads only this map');
});

// Which resolutions this TypeScript has: node16 from 4.7, bundler from 5.0; TypeScript 6 deprecates the older
// `node` (an error without --ignoreDeprecations) and 7 removes it, so the map above is for the versions before 6.
const RESOLUTIONS = [
  ['node', 'esnext', tsAtLeast(6, 0) ? `TypeScript ${TS_VERSION} has no moduleResolution node` : false],
  ['node16', 'node16', tsAtLeast(4, 7) ? false : `TypeScript ${TS_VERSION} has no moduleResolution node16`],
  ['bundler', 'esnext', tsAtLeast(5, 0) ? false : `TypeScript ${TS_VERSION} has no moduleResolution bundler`],
];

for (const [resolution, module, skip] of RESOLUTIONS) {
  test(`a project on moduleResolution ${resolution} is given the root's and the subpaths' types (TypeScript ${TS_VERSION})`, { skip }, () => {
    const r = check(resolution, module);
    assert.equal(r.out, '', `tsc --moduleResolution ${resolution} on a consumer of the built package`);
    assert.equal(r.code, 0);
  });
}

test('the TypeScript run is the one asked for', { skip: process.env.OW_TSC_DIR ? false : 'the installed TypeScript' }, () => {
  const want = process.env.OW_TSC_EXPECT;
  assert.ok(want, 'OW_TSC_DIR is set: OW_TSC_EXPECT names the version it should hold');
  assert.ok(TS_VERSION === want || TS_VERSION.startsWith(`${want}.`), `asked for ${want}, ran ${TS_VERSION}`);
});

test("CI's types job compiles against the peer range's floor first", () => {
  const floor = pkg.peerDependencies?.typescript?.match(/^>=(\d+\.\d+)\.0$/)?.[1];
  assert.ok(floor, `the peer range is a floor written >=X.Y.0 (it reads ${pkg.peerDependencies?.typescript})`);
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const list = ci.match(/^\s+typescript: \[([^\]]*)\]/m)?.[1];
  assert.ok(list, 'ci.yml has a types job with a typescript matrix');
  const versions = list.split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
  assert.equal(versions[0], floor, 'the first version in the matrix is the floor the peer range states');
});

test('TypeScript is a peer a project may leave out: installing the package into plain JavaScript brings no compiler', () => {
  assert.deepEqual(Object.keys(pkg.peerDependencies ?? {}), ['typescript']);
  assert.equal(pkg.peerDependenciesMeta?.typescript?.optional, true,
    'without this npm installs the newest TypeScript beside the package in every project, used or not');
  assert.ok(!('typescript' in (pkg.dependencies ?? {})), 'never a dependency');
});
