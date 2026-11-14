/**
 * What a tool that never calls a method still carries. A table built by a top-level call stays in every bundle unless
 * the call is marked pure: 4.135.0 and 4.135.1 put `TRAIL_TIERS` (about 450 bytes) into every tool on the package.
 * Each import below is bundled alone from the built package, minified, and must not hold the layout method's table.
 * And the zip library the world-file readers import stays out of a bundle that only lays out (a mapper bundled
 * trailByPlace from a tarball extract with no fflate beside it, 2026-11-10): fflate resolved here, as an install has it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { buildSync } from 'esbuild';

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function bundle(name, { external = ['fflate'] } = {}) {
  return buildSync({
    stdin: { contents: `import { ${name} } from ${JSON.stringify(DIST)}; console.log(${name});`, resolveDir: dirname(DIST), loader: 'js' },
    bundle: true, external, minify: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
  }).outputFiles[0].text;
}

for (const name of ['mapSpace', 'layoutOf', 'worldGraph', 'OwV2Client']) {
  test(`a bundle of ${name} alone leaves the layout method's floors out`, () => {
    assert.ok(!bundle(name).includes('location, object, zone'));
  });
}

test('the control: a bundle that reads the floors keeps them', () => {
  assert.ok(bundle('TRAIL_TIERS').includes('location, object, zone'));
});

// The by-kind layout's anchor table (253 points): one anchor's digits, which survive minifying whatever its form.
const ANCHOR_DIGITS = '8660254037844387';
for (const name of ['mapSpace', 'layoutOf', 'worldGraph', 'trailByPlace', 'layoutAround', 'OwV2Client']) {
  test(`a bundle of ${name} alone leaves the by-kind anchor table out`, () => {
    assert.ok(!bundle(name).includes(ANCHOR_DIGITS));
  });
}

test('the control: a bundle that lays out by kind keeps the anchor table', () => {
  assert.ok(bundle('layoutByKind').includes(ANCHOR_DIGITS));
});

// fflate's own error words survive minifying, where its function names do not.
const FFLATE = /invalid block type|unexpected EOF|invalid zip data/;
for (const name of ['trailByPlace', 'mapSpace', 'layoutOf']) {
  test(`a bundle of ${name} alone carries none of the zip library`, () => {
    assert.ok(!FFLATE.test(bundle(name, { external: [] })));
  });
}

test('the control: a bundle that reads a world file carries the zip library', () => {
  assert.ok(FFLATE.test(bundle('readWorldFile', { external: [] })));
});
