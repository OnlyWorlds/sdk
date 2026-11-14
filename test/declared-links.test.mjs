/**
 * DECLARED_LINKS, the extension lists a profile reads as links, held to the list schema-dist's own folder lint reads
 * (walk/lint_folder.py's LINK_EXTENSIONS, in the vendored distribution), so a list a serial grows reaches the package
 * at the repin or this test goes red. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECLARED_LINKS, worldGraph } from '../dist/index.js';

test('DECLARED_LINKS is the dist lint\'s LINK_EXTENSIONS, in its order', () => {
  const lint = readFileSync(new URL('../codegen/schema-dist/walk/lint_folder.py', import.meta.url), 'utf8');
  const m = lint.match(/^LINK_EXTENSIONS = \(([^)]*)\)/m);
  assert.ok(m, 'LINK_EXTENSIONS not found in the vendored lint');
  const fromLint = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  assert.ok(fromLint.length > 0);
  assert.deepEqual([...DECLARED_LINKS], fromLint);
});

test('DECLARED_LINKS is frozen', () => {
  assert.ok(Object.isFrozen(DECLARED_LINKS));
  assert.throws(() => { DECLARED_LINKS.push('x_other'); }, TypeError);
});

test('worldGraph draws an edge for each declared link', () => {
  const a = '01a1d4ef-0000-7000-8000-000000000001', b = '01a1d4ef-0000-7000-8000-000000000002';
  for (const field of DECLARED_LINKS) {
    const g = worldGraph({ elements: [{ type: 'construct', id: a, name: 'A', [field]: [b] }, { type: 'object', id: b, name: 'B' }] }, { rung: 'owner' });
    assert.ok(g.edges.some(e => e.source === a && e.target === b && e.field === field), field);
  }
});
