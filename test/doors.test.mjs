/**
 * The door history: doorsOf on every case of test/fixtures/doors.fixture.json, the same bytes as the
 * Python package's tests/fixtures/doors.fixture.json (both suites hold its sha256), every expected list
 * written by hand. Then the refusals, and TOOLS, the baked list, as the default. Runs against the
 * compiled bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doorsOf, TOOLS } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/doors.fixture.json', import.meta.url));
const FIXTURE_SHA256 = '5efd5c3fd88dcfa7b9ec06551186ee56370eaa4bb273f5d3c7ec94de058c0679';
const CASES = 26;

test('doorsOf answers every case of the shared fixture (the Python package runs the same file)', () => {
  const bytes = readFileSync(FIXTURE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256);
  const doc = JSON.parse(bytes.toString('utf8'));
  const wrong = [];
  for (const c of doc.cases) {
    let got;
    try { got = doorsOf(c.element, 'tools' in c ? c.tools : doc.tools); } catch (err) { got = { threw: String(err) }; }
    try { assert.deepEqual(got, c.expected); } catch { wrong.push(`${c.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(c.expected)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.equal(doc.cases.length, CASES);
});

test('an element that is not an object, or tools that are not an array, is a TypeError naming it', () => {
  for (const element of [null, undefined, [], ['x'], 'element', 7, true]) {
    assert.throws(() => doorsOf(element), (err) => err instanceof TypeError && err.message.includes('element'), String(element));
  }
  for (const tools of [null, {}, 'atlas', 7]) {
    assert.throws(() => doorsOf({}, tools), (err) => err instanceof TypeError && err.message.includes('tools'), String(tools));
  }
  // A tools row that is not one matches nothing and throws nothing.
  assert.deepEqual(doorsOf({ doors: { atlas: '2026-10-29T12:00:00Z' } }, [null, 'atlas', { client: 'atlas', id: 'a', name: 'A' }])[0].tool, { id: 'a', name: 'A' });
});

test('the default tools are TOOLS, the baked list', () => {
  const at = '2026-10-29T14:31:07.123456+00:00';
  for (const row of TOOLS.filter((t) => typeof t.client === 'string')) {
    const element = { doors: { [row.client]: at, site: '2026-10-28T09:00:00Z' }, updated_at: at };
    assert.deepEqual(doorsOf(element), doorsOf(element, TOOLS));
    assert.deepEqual(doorsOf(element)[0], { door: row.client, at, tool: { id: row.id, name: row.name }, last: true, from: 'doors' });
  }
  assert.ok(TOOLS.some((t) => typeof t.client === 'string'));
});
