/**
 * The rows a non-owner reader is served (the lens profile: a row is "the body as the reader is served it"):
 * in every link field only the ids that reader can see, as keel serves bodies, and x_served_trimmed only
 * where keel adds it (a Message's characters and narrator, a lens's anchor fields and notes, below
 * co-builder, never the public rung). Each case of test/fixtures/row-trim-cases.json is its own test; the
 * file is the same bytes as the Python package's tests/fixtures/row-trim-cases.json (both suites hold its
 * sha256), its answers written by hand. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveLens } from '../dist/index.js';

const FILE = fileURLToPath(new URL('./fixtures/row-trim-cases.json', import.meta.url));
const SHA256 = '4a637a74b85da50ba5a6e967756b67530defa7633cf47ff427c9fc64c53878a6';
const bytes = readFileSync(FILE);
const { cases } = JSON.parse(bytes.toString('utf8'));

test('the row-trim cases are the shared bytes', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256);
  assert.equal(cases.length, 14);
});

for (const c of cases) {
  test(`row trim: ${c.name}`, () => {
    const got = resolveLens(c.world, c.lens, c.reader);
    assert.deepEqual(got.rows, c.want_rows);
  });
}
