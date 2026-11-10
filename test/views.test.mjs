/**
 * viewOf against the vendored distribution's views.json and its fixture, read here at test time rather
 * than restated: the baked table equals the file, every case of views.fixture.json gives its row, its
 * sentence and its banners, and anything that is not an element gives no view. Runs against the
 * compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEWS, viewOf } from '../dist/index.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../codegen/schema-dist/${name}`, import.meta.url), 'utf8'));
const DOC = read('views.json');
const FX = read('views.fixture.json');

test('the vendored table is version 1, and VIEWS is it: the banners, the layouts and every row', () => {
  assert.equal(DOC._meta.version, 1);
  assert.equal(VIEWS.version, 1);
  assert.deepEqual(VIEWS.banners, DOC.banners);
  assert.deepEqual(VIEWS.layouts, DOC.layouts);
  assert.deepEqual(VIEWS.rows, DOC.rows);
  assert.ok(VIEWS.rows.length > 0, 'a table with no rows would pass every case that wants no row');
  assert.ok(Object.isFrozen(VIEWS) && Object.isFrozen(VIEWS.rows) && VIEWS.rows.every((r) => Object.isFrozen(r)), 'the table is frozen');
});

test('every case of views.fixture.json gives its row, its sentence and its banners', () => {
  assert.equal(FX.views, 'views.json');
  assert.ok(FX.cases.length >= 18, `the fixture holds ${FX.cases.length} cases; serial 113's holds 18`);
  const rowsSeen = new Set();
  for (const c of FX.cases) {
    const got = viewOf(c.element);
    assert.deepEqual(
      { row: got.row?.id ?? null, sentence: got.sentence, banners: got.banners },
      c.expect,
      c.name,
    );
    if (got.row) {
      rowsSeen.add(got.row.id);
      assert.equal(got.row, VIEWS.rows.find((r) => r.id === got.row.id), `${c.name}: the row is the table's own row`);
    }
  }
  for (const r of VIEWS.rows) assert.ok(rowsSeen.has(r.id), `no case reaches the row ${r.id}`);
});

test('viewOf gives no row, no sentence and no banners for anything that is not an element', () => {
  for (const bad of [undefined, null, 1, 'narrative', [], true]) {
    assert.deepEqual(viewOf(bad), { row: null, sentence: null, banners: [] }, JSON.stringify(bad) ?? String(bad));
  }
  assert.deepEqual(viewOf({}), { row: null, sentence: null, banners: [] });
});

test('the sentence is cut at a lone carriage return as at a line feed (the file: U+000A or U+000D)', () => {
  // The fixture's carriage-return case is CRLF, which a cut at the line feed alone also passes (the trim
  // takes the CR left behind); a lone CR is the case that tells the two apart.
  const msg = (story) => viewOf({ type: 'narrative', supertype: 'Message', story }).sentence;
  assert.equal(msg('One.\rTwo.'), 'One.');
  assert.equal(msg('One.\nTwo.'), 'One.');
  assert.equal(msg('  \r\n One. \rTwo.'), 'One.');
});

test('each answer is a fresh object: a caller changing one changes no later one', () => {
  const el = { type: 'narrative', supertype: 'Message', story: 'Hello.', hidden: true };
  const first = viewOf(el);
  assert.deepEqual(first.banners, ['hidden']);
  first.banners.push('changed');
  assert.deepEqual(viewOf(el).banners, ['hidden']);
});
