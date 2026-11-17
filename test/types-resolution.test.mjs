/**
 * What a TypeScript project is handed, read the way its compiler reads it: a consumer file that imports
 * the package's root and its `/waymark` subpath is type-checked against the built declarations under each
 * module resolution a project can be set to. `node` (the older one, and the only settled one before
 * TypeScript 4.7) does not read `exports`, so a subpath's types reach it through `typesVersions`: without
 * that map the root's types are found and `@onlyworlds/sdk/waymark` is not.
 *
 * Runs the TypeScript the repo installs, against package.json and dist/*.d.ts copied into a scratch
 * node_modules, so nothing is resolved through the repo itself. Measured once by hand against TypeScript
 * 4.5, 4.7, 5.0, 5.9, 6.0 and 7.0 from npm (2026-11-17); this test holds the one installed.
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
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TS_VERSION = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;

// Every subpath the package gives types for, read from its own exports.
const typed = Object.entries(pkg.exports)
  .filter(([sub, target]) => sub !== '.' && typeof target === 'object' && target !== null && typeof target.types === 'string')
  .map(([sub, target]) => [sub.replace(/^\.\//, ''), target.types.replace(/^\.\//, '')]);

const CONSUMER = `
import { OwV2Client, ELEMENT_TYPES, layoutByLinks3d } from '@onlyworlds/sdk';
import type { ElementType, OwElement, OwClientConfig } from '@onlyworlds/sdk';
import { mountWaymark } from '@onlyworlds/sdk/waymark';

const config: OwClientConfig = {};
const client = new OwV2Client(config);
const kind: ElementType = ELEMENT_TYPES[0];
export async function names(): Promise<string[]> {
  const page = await client.list(kind);
  const one: OwElement = await client.get(kind, 'id');
  void one; void page; void layoutByLinks3d; void mountWaymark;
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
    const r = spawnSync(process.execPath, [TSC, '--noEmit', '--strict', '--target', 'es2020', '--lib', 'es2022,dom',
      '--skipLibCheck', 'false', '--module', module, '--moduleResolution', resolution, 'use.ts'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the package gives types for a subpath, and this test reads which from its exports', () => {
  assert.deepEqual(typed, [['waymark', 'dist/waymark.d.ts']], 'a new typed subpath: give the consumer file below an import of it');
});

test('every subpath with types is in typesVersions, naming the same file as exports', () => {
  const map = pkg.typesVersions?.['*'] ?? {};
  assert.deepEqual(Object.fromEntries(typed.map(([sub, file]) => [sub, [file]])), map,
    'typesVersions["*"] holds each typed subpath of exports and nothing else: the older resolution reads only this map');
});

for (const [resolution, module] of [['node', 'esnext'], ['node16', 'node16'], ['bundler', 'esnext']]) {
  test(`a project on moduleResolution ${resolution} is given the root's and the waymark subpath's types (TypeScript ${TS_VERSION})`, () => {
    const r = check(resolution, module);
    // TypeScript 6 deprecates the older resolution and 7 removes it: this leg then says so by its own error,
    // and the map above stays for the projects on the TypeScript versions that still have it.
    assert.equal(r.out, '', `tsc --moduleResolution ${resolution} on a consumer of the built package`);
    assert.equal(r.code, 0);
  });
}

test('TypeScript is a peer a project may leave out: installing the package into plain JavaScript brings no compiler', () => {
  assert.deepEqual(Object.keys(pkg.peerDependencies ?? {}), ['typescript']);
  assert.equal(pkg.peerDependenciesMeta?.typescript?.optional, true,
    'without this npm installs the newest TypeScript beside the package in every project, used or not');
  assert.ok(!('typescript' in (pkg.dependencies ?? {})), 'never a dependency');
});
