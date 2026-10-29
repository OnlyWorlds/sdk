/**
 * The Open with menu's rows: openersFor on every case of test/fixtures/openers.fixture.json, the same
 * bytes as the Python package's tests/fixtures/openers.fixture.json (both suites hold its sha256), every
 * expected row written by hand. Then TOOLS, the baked tools list, through the same function. Runs
 * against the compiled bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openersFor, parseOwLink, OwAddressError, TOOLS } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/openers.fixture.json', import.meta.url));
const FIXTURE_SHA256 = '93cb3f121cb1eef5ba4c6951c414399c13136c3896f864221a29a3802b82d266';
const CASES = 45;

/** The fixture writes the surface's keys snake_case; this package spells one of them in camelCase. */
const SPELLING = { signed_in: 'signedIn' };
const spelt = (k) => SPELLING[k] ?? k;

/** One case's answer in the fixture's own shape: `{ expect }` or `{ refuse }`. */
function answer(doc, c) {
  const surface = Object.fromEntries(Object.entries(c.surface).map(([k, v]) => [spelt(k), v]));
  try {
    return { expect: openersFor(doc.lists[c.tools], c.kind, c.address, surface) };
  } catch (err) {
    if (err instanceof OwAddressError) return { refuse: { error: 'address', reason: err.reason } };
    if (err instanceof TypeError && 'refuse' in c && c.refuse.error === 'type') {
      const names = spelt(c.refuse.names);
      return { refuse: err.message.includes(names) ? c.refuse : { error: 'type', message: err.message } };
    }
    return { threw: String(err) };
  }
}

test('openersFor answers every case of the shared fixture (the Python package runs the same file)', () => {
  const bytes = readFileSync(FIXTURE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256);
  const doc = JSON.parse(bytes.toString('utf8'));
  const wrong = [];
  for (const c of doc.cases) {
    assert.ok(c.tools in doc.lists, `${c.name}: no list ${c.tools}`);
    const want = 'refuse' in c ? { refuse: c.refuse } : { expect: c.expect };
    const got = answer(doc, c);
    try { assert.deepEqual(got, want); } catch { wrong.push(`${c.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.equal(doc.cases.length, CASES);
});

test('a reading from parseOwLink gives the same rows as the plain address', () => {
  const world = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';
  const element = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e1a';
  const link = `https://www.onlyworlds.com/w/${world}/character/${element}@3?lens=${element}`;
  const plain = { form: 'text', world, type: 'character', id: element };
  const surface = { audience: 'member', signedIn: false };
  assert.deepEqual(openersFor(TOOLS, 'element', parseOwLink(link), surface), openersFor(TOOLS, 'element', plain, surface));
});

test('TOOLS, the baked list, gives the site\'s row and then each listed tool with a door, in the list\'s order', () => {
  assert.ok(TOOLS.length >= 1);
  const world = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';
  const member = openersFor(TOOLS, 'world', { form: 'human', world }, { audience: 'member', signedIn: true });
  const offered = TOOLS.filter((t) => t.rung === 'listed' && t.open && t.open.world);
  assert.deepEqual(member.map((r) => r.id), ['onlyworlds', ...offered.map((t) => t.id)]);
  assert.equal(member[0].href, `https://www.onlyworlds.com/w/${world}`);
  for (const r of member.slice(1)) assert.ok(r.href.startsWith('https://') && r.href.includes(world) && !r.href.includes('{'), r.href);
  const open = openersFor(TOOLS, 'world', { form: 'human', world }, { audience: 'public' });
  assert.deepEqual(open.map((r) => r.id), ['onlyworlds', ...offered.filter((t) => t.open.needs === null).map((t) => t.id)]);
});
