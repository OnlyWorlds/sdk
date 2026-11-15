/**
 * A line of a report's `consequences`: the report profile's lines table, schema-dist's profiles/report-lines.fixture.json (the same bytes in the Python package, its
 * sha256 pinned in both tests) gives each line, the element its address names (or none) and the words a reader shows,
 * and each text with the lines it splits into. Every row is compared whole: the address and the words byte for byte.
 * Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readReportLine, readReportLines, parseOwLink } from '../dist/index.js';

const bytes = readFileSync(new URL('../codegen/schema-dist/profiles/report-lines.fixture.json', import.meta.url));
const fx = JSON.parse(bytes.toString('utf8'));
const TABLE_SHA = '2face7cd693235d8';
const world = fx.world;

test('the table is the one both packages hold, and holds rows of each kind', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), TABLE_SHA);
  assert.ok(fx.cases.some(c => c.address === null));
  assert.ok(fx.cases.some(c => c.address !== null && c.words === c.line));
  assert.ok(fx.cases.some(c => c.address !== null && c.words !== c.line));
});

for (const c of fx.cases) {
  test(`line: ${c.kind}`, () => {
    const got = readReportLine(c.line, { world });
    assert.equal(got.line, c.line);
    assert.equal(got.address, c.address);
    assert.equal(got.words, c.words);
    if (got.address === null) {
      assert.equal(got.reading, null);
      assert.equal(got.start, null);
      assert.equal(got.end, null);
    } else {
      // The address as written sits at start..end and reads as the element named.
      assert.deepEqual(parseOwLink(c.line.slice(got.start, got.end)), got.reading);
      assert.equal(`ow://${got.reading.type}/${got.reading.id}`, c.address);
    }
  });
}

for (const t of fx.texts) {
  test(`text: ${t.kind}`, () => {
    const got = readReportLines(t.text, { world });
    assert.deepEqual(got.map(l => [l.line, l.address, l.words]), t.lines.map(l => [l.line, l.address, l.words]));
  });
}

test('without a world, only an address with no world names an element here', () => {
  const id = '01a1d4ef-0000-7000-8000-000000000084';
  assert.equal(readReportLine(`Built: ow://${world}/object/${id}`).address, null);
  assert.equal(readReportLine(`Built: ow://object/${id}`).address, `ow://object/${id}`);
  assert.equal(readReportLine(`Built: ow://object/${id}`, { world: null }).words, 'Built');
});

test('the world is read as written: an upper-case world id names no world here', () => {
  const id = '01a1d4ef-0000-7000-8000-000000000084';
  assert.equal(readReportLine(`Built: ow://${world}/object/${id}`, { world: world.toUpperCase() }).address, null);
});

test('refusals', () => {
  assert.throws(() => readReportLine(3), TypeError);
  assert.throws(() => readReportLines(null), TypeError);
  assert.throws(() => readReportLine('x', 'w'), TypeError);
  assert.throws(() => readReportLine('x', { world: 7 }), TypeError);
  assert.throws(() => readReportLine('x', { wrold: world }), /unknown option 'wrold'/);
  assert.throws(() => readReportLines('x', { wrold: world }), /unknown option 'wrold'/);
});
