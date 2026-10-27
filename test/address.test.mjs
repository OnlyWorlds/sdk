/**
 * The address profile (schema-dist profiles/address.md, serial 77): elementAddress and parseOwLink on
 * every conformance case in codegen/schema-dist/profiles/address.fixture.json, vendored with the
 * distribution and hash-checked by schema:verify. The vendored copy is the only source: absent, the
 * test fails. A case of a kind this file does not know fails. Runs against the compiled bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { elementAddress, parseOwLink, OwAddressError, ELEMENT_TYPES } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/address.fixture.json', import.meta.url));

function loadFixture() {
  assert.ok(existsSync(FIXTURE), `no address fixture at ${FIXTURE}: re-vendor the pinned schema-dist`);
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  assert.equal(doc.profile, 'address');
  return doc;
}

/** A reading in the fixture's own shape (its keys are snake_case). */
const asFixture = (r) => ({
  form: r.form, world: r.world, world_is_slug: r.worldIsSlug, type: r.type, id: r.id, lens: r.lens, moment: r.moment, canonical: r.canonical,
});

/** What the package answers for one case: `{ expect }` or `{ refuse }`, the fixture's own keys. */
function answer(c) {
  let run;
  switch (c.kind) {
    case 'parse': run = () => ({ expect: asFixture(parseOwLink(c.text)) }); break;
    case 'format': run = () => ({ expect: elementAddress(c.address) }); break;
    default: throw new Error(`a case of unknown kind ${c.kind}`);
  }
  try {
    return run();
  } catch (err) {
    if (err instanceof OwAddressError) return { refuse: err.reason };
    throw err;
  }
}

test('elementAddress and parseOwLink answer every case of the address fixture', (t) => {
  const doc = loadFixture();
  const wrong = [];
  const kinds = {};
  let refusals = 0;
  for (const c of doc.cases) {
    kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    const want = 'refuse' in c ? { refuse: c.refuse } : { expect: c.expect };
    if ('refuse' in c) refusals++;
    let got;
    try {
      got = answer(c);
    } catch (err) {
      got = { threw: String(err) };
    }
    try {
      assert.deepEqual(got, want);
    } catch {
      wrong.push(`${c.kind}/${c.name}: gave ${JSON.stringify(got)}, the fixture says ${JSON.stringify(want)}`);
    }
  }
  const line = `address: ${doc.cases.length} cases (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}), ${refusals} refusals, ${wrong.length} wrong`;
  t.diagnostic(line);
  for (const w of wrong) t.diagnostic(w);
  assert.deepEqual(wrong, [], line);
  assert.ok(doc.cases.length >= 133, `the fixture holds ${doc.cases.length} cases`);
});

test('every refusal the fixture names is exercised by a case, and no case refuses by another name', () => {
  const doc = loadFixture();
  assert.deepEqual(doc.refusals, ['not_an_address', 'uppercase', 'segments', 'bad_world', 'unknown_type', 'bad_id', 'bad_moment', 'bad_lens', 'no_world', 'bad_form']);
  const used = new Set(doc.cases.filter(c => 'refuse' in c).map(c => c.refuse));
  assert.deepEqual([...used].filter(r => !doc.refusals.includes(r)), [], 'a case refuses by a name the list does not hold');
  assert.deepEqual(doc.refusals.filter(r => !used.has(r)), [], 'a refusal no case exercises');
  assert.deepEqual([...doc.types].sort(), [...ELEMENT_TYPES].sort());
});

test('a reading written back is canonical, and reads back the same', () => {
  const { cases } = loadFixture();
  let n = 0;
  for (const c of cases) {
    if (c.kind !== 'parse' || !('expect' in c) || c.expect.world_is_slug) continue;
    const written = elementAddress(parseOwLink(c.text));
    const again = parseOwLink(written);
    assert.equal(again.canonical, true, `${c.name}: ${written}`);
    assert.deepEqual({ ...asFixture(again), canonical: c.expect.canonical }, c.expect, c.name);
    if (c.expect.canonical) assert.equal(written, c.text, c.name);
    n++;
  }
  assert.ok(n >= 40, `${n} readings written back`);
});

test('a slug reads, and a writer refuses it', () => {
  const r = parseOwLink('https://www.onlyworlds.com/w/hyperion');
  assert.equal(r.worldIsSlug, true);
  assert.throws(() => elementAddress(r), (e) => e instanceof OwAddressError && e.reason === 'bad_world');
});

test('a value that is not a string is not an address; an address that is not an object, or carries an unknown key, is a TypeError', () => {
  for (const v of [null, undefined, 42, {}, ['ow://character/019a1f3c-2b4e-7d10-8c3a-6f2e9b0d4a71']]) {
    assert.throws(() => parseOwLink(v), (e) => e instanceof OwAddressError && e.reason === 'not_an_address', String(v));
  }
  for (const v of [null, undefined, 'ow://x', [], 3]) assert.throws(() => elementAddress(v), TypeError);
  const world = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';
  assert.throws(() => elementAddress({ form: 'text', wrold: world }), /elementAddress: unknown option 'wrold'/);
  assert.equal(elementAddress({ form: 'text', world, type: null, id: undefined, lens: null, moment: null }), `ow://${world}`);
});

test('a moment is a whole number, never a boolean, and -0 is written 0', () => {
  const world = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';
  assert.equal(elementAddress({ form: 'text', world, moment: 2.0 }), `ow://${world}@2`);
  assert.equal(elementAddress({ form: 'text', world, moment: -0 }), `ow://${world}@0`);
  for (const bad of [true, false, Infinity, NaN, 2 ** 31, -(2 ** 31) - 1, '3', 3n]) {
    assert.throws(() => elementAddress({ form: 'text', world, moment: bad }), (e) => e instanceof OwAddressError && e.reason === 'bad_moment', String(bad));
  }
});

test('the error carries the reason and a message', () => {
  try {
    parseOwLink('ow://dragon/019a1f3c-2b4e-7d10-8c3a-6f2e9b0d4a71');
    assert.fail('no refusal');
  } catch (err) {
    assert.ok(err instanceof OwAddressError && err instanceof Error);
    assert.equal(err.name, 'OwAddressError');
    assert.equal(err.reason, 'unknown_type');
    assert.match(err.message, /22/);
  }
});
