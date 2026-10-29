/**
 * The door history: doorsOf on every case of test/fixtures/doors.fixture.json, the same bytes as the
 * Python package's tests/fixtures/doors.fixture.json (both suites hold its sha256), every expected list
 * written by hand, and doorWhere on each entry against the case's where list. Then the refusals, and
 * TOOLS, the baked list, as the default. Runs against the compiled bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doorsOf, doorWhere, TOOLS } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/doors.fixture.json', import.meta.url));
const FIXTURE_SHA256 = '3b21bb1e86470c1eb158d486691acc95440a5f1c707cc22fef7dc98e306d7de1';
const CASES = 27;

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

test('doorWhere gives every case\'s where list, one phrase per expected entry (the Python package runs the same file)', () => {
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const wrong = [];
  for (const c of doc.cases) {
    let got;
    try { got = c.expected.map(doorWhere); } catch (err) { got = { threw: String(err) }; }
    try { assert.deepEqual(got, c.where); } catch { wrong.push(`${c.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(c.where)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  // Every phrase the rules give is held by at least one entry.
  const phrases = new Set(doc.cases.flatMap((c) => c.where));
  for (const p of ['in Atlas', 'in Lantern', 'in Zephyr', 'on onlyworlds.com', 'with an AI', 'by OnlyWorlds', 'in code']) assert.ok(phrases.has(p), p);
});

test('doorWhere refuses what is not an entry of doorsOf with a TypeError naming it', () => {
  const bad = [null, undefined, [], 'site', 7, {}, { door: 7 }, { door: null }, { door: 'atlas', tool: 'Atlas' }, { door: 'atlas', tool: { id: 'atlas' } }];
  for (const door of bad) {
    assert.throws(() => doorWhere(door), (err) => err instanceof TypeError && err.message.startsWith('doorWhere: '), JSON.stringify(door));
  }
  // The other keys are not read: an entry with only a door is enough.
  assert.equal(doorWhere({ door: 'mcp' }), 'with an AI');
  assert.equal(doorWhere({ door: 'atlas', tool: null }), 'in code');
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
    assert.deepEqual(doorsOf(element).map(doorWhere), [`in ${row.name}`, 'on onlyworlds.com']);
  }
  assert.ok(TOOLS.some((t) => typeof t.client === 'string'));
});
