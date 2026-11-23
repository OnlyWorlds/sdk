/**
 * A declared type, as the folder source reads it. The folder format: a declared type is a string
 * exactly equal to one of the 22 type slugs as the standard spells them; anything else in `type` (an
 * unknown word, another case such as "Location", a number, null) declares nothing, and the directory
 * fills it. The cases are one JSON file, the same bytes the Python package's `read_folder` runs, its
 * sha256 pinned here. Runs against the compiled public bundle (dist), same as the other tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { folderFetch } from '../dist/folder.js';

const CASES_SHA256 = '89968d85deaa4d5974a20a4d73aab80c7e8ec374ee4236b0809e00c405831b96';
const bytes = readFileSync(new URL('./fixtures/declared-type.cases.json', import.meta.url));
const { cases } = JSON.parse(bytes.toString('utf8'));
const enc = new TextEncoder();
const WORLD = { path: 'world.json', data: enc.encode('{"id":"0192a000-aaaa-7bbb-8ccc-000000000001","name":"W"}') };

test('the cases file is the pinned bytes, the ones the Python package runs', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CASES_SHA256);
  assert.equal(cases.length, 21);
});

test('a declared type is one of the 22 slugs as written, or the directory fills it', async () => {
  const off = [];
  for (const c of cases) {
    let report;
    const f = folderFetch([WORLD, { path: c.path, data: enc.encode(c.text) }], { onRead: (r) => { report = r; } });
    // The read report says the type, and the list of that type serves the element: both are held.
    const listed = await (await f(`https://www.onlyworlds.com/api/v2/${c.want}/`)).json();
    const row = report.served.find((s) => s.id === 'x1');
    const got = row ? row.type : null;
    const inList = Array.isArray(listed.data) && listed.data.some((e) => e.id === 'x1');
    if (got !== c.want || !inList) off.push(`${c.name}: served as ${got}, want ${c.want}; in the ${c.want} list: ${inList}`);
  }
  assert.equal(off.length, 0, off.join('\n'));
});
