/**
 * What the waymark entry loads: dist/waymark.js and every file it imports, followed transitively through the
 * shared chunks. A menu beside a name carries no world-file or zip code, so no file it reaches imports fflate.
 * Runs against the built bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENTRY = new URL('../dist/waymark.js', import.meta.url);
// A static import or export-from, a bare import, or a dynamic import(): the specifier is the quoted string.
const SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/** Every file the entry reaches, each with the specifiers it names. */
function reached(entry) {
  const out = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const url = queue.shift();
    if (out.has(url.href)) continue;
    const specifiers = [...readFileSync(fileURLToPath(url), 'utf8').matchAll(SPECIFIER)].map(m => m[1]);
    out.set(url.href, specifiers);
    for (const s of specifiers) if (s.startsWith('.')) queue.push(new URL(s, url));
  }
  return out;
}

test('the waymark entry reaches no file that imports fflate', () => {
  const files = reached(ENTRY);
  assert.ok(files.size >= 2, `the entry reaches ${files.size} file(s); a shared chunk was expected beside it`);
  const zip = [...files].filter(([, specifiers]) => specifiers.includes('fflate')).map(([href]) => href.split('/').pop());
  assert.deepEqual(zip, [], `these files the waymark entry loads import fflate: ${zip.join(', ')}`);
});
