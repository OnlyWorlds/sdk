/**
 * `@onlyworlds/sdk/convert`'s Kanka door against the Python package's (`python -m onlyworlds.kanka`): the same
 * folder byte for byte and the same report, on three real Kanka exports (fixtures/kanka/, the files the Python
 * package's tests hold, the same bytes). fixtures/kanka/python-door.json is the Python door's output on each,
 * recorded: the sha256 of every file it wrote and of its report text. The door's tables and wording are
 * src/convert/kanka.json, the same bytes as the Python package's src/onlyworlds/convert/kanka.json: both
 * packages' tests hold the one sha256 below. Runs against the built package (dist), as the other tests do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { convertKanka, kankaReportText, KANKA_MADE_NAMES, OwConvertError } from '../dist/convert.js';
import { objectParameters } from './options-surface.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const FIX = new URL('./fixtures/kanka/', import.meta.url);
const recorded = JSON.parse(readFileSync(new URL('python-door.json', FIX), 'utf8'));

/** The data file's sha256: the same bytes as the Python package's copy, whose test holds the same hash. */
const DATA_SHA256 = '53394eee55d8afe0b2b5b5bdc99795a42543600ca085ec282ef1acd66a37106a';
const EXPORTS = {
  'quay-export-world_20261023_074706.zip': 'b900ea8161fd2a32b971a53f71f208734d33d39a6a8f75f7cf9eac8adf10e5e4',
  'quay-export-world_20261024_180340.zip': '597a3b053d33d7c7db692527fa9a9b989b8240397ae0d899bed248e1a0798ae4',
  'quay-export-world_20261025_011029.zip': 'f80f00559fefe1abcd400510c2fc7623f585e1b5eef00103e1898df42d6e7574',
};

const read = (name) => new Uint8Array(readFileSync(new URL(name, FIX)));

test('the data file is the bytes the Python package reads', () => {
  assert.equal(sha(readFileSync(new URL('../src/convert/kanka.json', import.meta.url))), DATA_SHA256);
});

test('the fixtures are the real exports, and the recording covers each', () => {
  for (const [name, hash] of Object.entries(EXPORTS)) assert.equal(sha(read(name)), hash, name);
  assert.deepEqual(Object.keys(recorded.exports).sort(), Object.keys(EXPORTS).sort());
});

for (const name of Object.keys(EXPORTS)) {
  test(`${name}: every file and the report as the Python door wrote them`, () => {
    const { files, report } = convertKanka(read(name), { source: name, producer: recorded.producer });
    const want = recorded.exports[name];
    const got = Object.fromEntries(files.map((f) => [f.path, sha(f.data)]));
    assert.deepEqual(Object.keys(got), Object.keys(want.files).sort(), 'the same paths, in code point order');
    assert.deepEqual(got, want.files);
    assert.equal(sha(kankaReportText(report, 'folder')), want.report);
    assert.equal(report.total, files.length - 1, 'one file per element, and world.json');
    assert.ok(report.lines.length > 0 && !report.lines.at(-1).startsWith('Wrote'), 'the last line is kankaReportText\'s');
  });
}

test('the same export twice gives the same folder', () => {
  const a = convertKanka(read('quay-export-world_20261025_011029.zip'));
  const b = convertKanka(read('quay-export-world_20261025_011029.zip'));
  assert.deepEqual(a.files.map((f) => [f.path, sha(f.data)]), b.files.map((f) => [f.path, sha(f.data)]));
});

test('the producer line names this package unless the caller names another', () => {
  const world = (opts) => JSON.parse(new TextDecoder().decode(convertKanka(read('quay-export-world_20261023_074706.zip'), opts).files.find((f) => f.path === 'world.json').data));
  assert.deepEqual(world().producer, { tool: '@onlyworlds/sdk', input: 'kanka-export' });
  assert.deepEqual(world({ producer: { tool: 'my-tool', version: '1.2.3' } }).producer, { tool: 'my-tool', version: '1.2.3', input: 'kanka-export' });
});

test('the report counts what the Python report counts, made names included', () => {
  const { report } = convertKanka(read('quay-export-world_20261025_011029.zip'), { source: 'x.zip' });
  assert.deepEqual(report.counts, { character: 6, institution: 1, location: 4, narrative: 7, relation: 2 });
  assert.equal(report.total, 20);
  assert.deepEqual(report.madeNames, { 'hidden-details': 2 });
  assert.deepEqual({ ...report.hidden }, { entities: 1, posts: 3, relationships: 0, traits: 0, personality: 4, attributes: 0, links: 0, details: 2 });
  assert.equal(report.uploads, 6);
  assert.equal(report.uploadsNamed, 1);
  assert.deepEqual(report.relations, [{ text: '[Friend/Mentor/Rival]', count: 1 }, { text: 'friend', count: 1 }]);
  assert.deepEqual(KANKA_MADE_NAMES.map((m) => m.kind), ['hidden-details', 'untitled-post', 'untitled-relationship', 'untitled-entity']);
  assert.equal(kankaReportText(report, null).split('\n').at(-2), 'Plan only: nothing written.');
});

test('an unknown option is refused by name before anything is read', () => {
  assert.throws(() => convertKanka(new Uint8Array(), { __unknown__: 1 }), (e) => e instanceof TypeError && /^convertKanka: unknown option '__unknown__'\. The keys are source, producer\./.test(e.message));
  assert.throws(() => convertKanka(new Uint8Array(), { producer: { tool: 'x', name: 'y' } }), (e) => e instanceof TypeError && /unknown option 'name'/.test(e.message));
  assert.throws(() => convertKanka('not bytes'), TypeError);
});

test('bytes that are not a zip, and a zip with no campaign, are refused with the Python door\'s words', () => {
  assert.throws(() => convertKanka(new TextEncoder().encode('hello'), { source: 'a.zip' }),
    (e) => e instanceof OwConvertError && e.reason === 'not_a_zip' && e.message === 'a.zip: not a zip file (File is not a zip file)');
  // An empty zip: the end of central directory record alone.
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  assert.throws(() => convertKanka(empty, { source: 'b.zip' }),
    (e) => e instanceof OwConvertError && e.reason === 'not_an_export' && e.message === "b.zip: no campaign.json with an id (is it Kanka's JSON export?)");
});

test('the convert entry\'s object parameters: the options fenced, the report data', () => {
  assert.deepEqual(objectParameters('../src/convert/index.ts'), ['convertKanka#1', 'kankaReportText#0']);
});
