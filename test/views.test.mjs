/**
 * viewOf against the vendored distribution's views.json and its fixture, read here at test time rather
 * than restated: the baked table equals the file, every case of views.fixture.json gives its row, its
 * sentence and its banners, and anything that is not an element gives no view. Runs against the
 * compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { VIEWS, viewOf } from '../dist/index.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../codegen/schema-dist/${name}`, import.meta.url), 'utf8'));
const DOC = read('views.json');
const FX = read('views.fixture.json');

test('the vendored table is version 3, and VIEWS is it: the banners, the layouts and every row', () => {
  assert.equal(DOC._meta.version, 3);
  assert.equal(VIEWS.version, 3);
  assert.deepEqual(VIEWS.banners, DOC.banners);
  assert.deepEqual(VIEWS.layouts, DOC.layouts);
  assert.deepEqual(VIEWS.rows, DOC.rows);
  assert.ok(VIEWS.rows.length > 0, 'a table with no rows would pass every case that wants no row');
  assert.ok(Object.isFrozen(VIEWS) && Object.isFrozen(VIEWS.rows) && VIEWS.rows.every((r) => Object.isFrozen(r)), 'the table is frozen');
});

const OWN_CASES = FX.cases.filter((c) => c.table === undefined);
const TABLE_CASES = FX.cases.filter((c) => c.table !== undefined);

test('every case of views.fixture.json read against views.json gives its row, its sentence, its banners and, where it names one, its order', () => {
  assert.equal(FX.views, 'views.json');
  assert.ok(FX.cases.length >= 39, `the fixture holds ${FX.cases.length} cases; serial 114's holds 39`);
  const ordered = OWN_CASES.filter((c) => 'order' in c.expect);
  assert.ok(ordered.length >= 2, 'a case per layout names the order drawn');
  const rowsSeen = new Set();
  for (const c of OWN_CASES) {
    const got = viewOf(c.element);
    const answer = { row: got.row?.id ?? null, sentence: got.sentence, banners: got.banners };
    if ('order' in c.expect) answer.order = got.order;
    assert.deepEqual(answer, c.expect, c.name);
    if (got.row) {
      rowsSeen.add(got.row.id);
      assert.equal(got.row, VIEWS.rows.find((r) => r.id === got.row.id), `${c.name}: the row is the table's own row`);
    }
  }
  for (const r of VIEWS.rows) assert.ok(rowsSeen.has(r.id), `no case reaches the row ${r.id}`);
});

// A case read against a table of the fixture's own (at fault on purpose: two rows on one kind, the first wins and
// the page is drawn) goes through viewIn, which the package does not export: src/views.ts is bundled here alone.
// The bundle is held to the built package first, every case of views.json read by both alike, so it is the same reader.
async function internalViewIn() {
  const src = fileURLToPath(new URL('../src/views.ts', import.meta.url));
  const code = buildSync({ entryPoints: [src], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' }).outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('every case that names a table of the fixture reads against that table, by the same reader as viewOf', async () => {
  assert.ok(TABLE_CASES.length > 0, 'the fixture holds a case with a table of its own');
  const { viewIn, VIEWS: SRC_VIEWS } = await internalViewIn();
  assert.equal(typeof viewIn, 'function');
  assert.deepEqual(SRC_VIEWS, VIEWS, 'the bundled source bakes the same table as the built package');
  for (const c of OWN_CASES) assert.deepEqual(viewIn(SRC_VIEWS, c.element), viewOf(c.element), `${c.name}: the bundle reads as the package`);
  for (const c of TABLE_CASES) {
    const table = FX.tables?.[c.table];
    assert.ok(table, `${c.name} names the table ${c.table}, which the fixture does not hold`);
    const got = viewIn(table, c.element);
    const answer = { row: got.row?.id ?? null, sentence: got.sentence, banners: got.banners };
    if ('order' in c.expect) answer.order = got.order;
    assert.deepEqual(answer, c.expect, c.name);
  }
});

test('viewIn stays out of the package: neither entry exports it', async () => {
  const pkg = await import('../dist/index.js');
  assert.equal('viewIn' in pkg, false);
});

test('viewOf gives no row, no sentence and no banners for anything that is not an element', () => {
  for (const bad of [undefined, null, 1, 'narrative', [], true]) {
    assert.deepEqual(viewOf(bad), { row: null, sentence: null, banners: [], order: [] }, JSON.stringify(bad) ?? String(bad));
  }
  assert.deepEqual(viewOf({}), { row: null, sentence: null, banners: [], order: [] });
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
