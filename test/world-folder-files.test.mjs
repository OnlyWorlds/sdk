/**
 * `worldFolderFiles` (`@onlyworlds/sdk/convert`) against the Python package's `write_folder`: the same paths and
 * the same bytes for one shared case, test/fixtures/world-folder-files.json (world, elements, and the files the
 * Python writer wrote, made by test/fixtures/generate-world-folder-files.py with the released package). Then the
 * rules on their own (a repeated id, an id under two types, a stub), the refusals, and a round trip through the
 * package's own readers (folderFetch, and a .owworld file). Runs against the built package (dist).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { worldFolderFiles } from '../dist/convert.js';
import { folderFetch } from '../dist/folder.js';
import { OwV2Client, readWorldFile, writeWorldFile } from '../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/world-folder-files.json', import.meta.url), 'utf8'));
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const text = (f) => dec.decode(f.data);
const W = { id: 'w-1', name: 'W' };
const bytesEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

test('the shared case: the paths and the bytes the Python writer wrote', () => {
  const files = worldFolderFiles(fixture.world, fixture.elements);
  const want = Object.keys(fixture.files);
  assert.deepEqual(files.map((f) => f.path), want, 'the same paths, in code point order');
  const differ = files.filter((f) => !bytesEqual(f.data, enc.encode(fixture.files[f.path]))).map((f) => f.path);
  assert.deepEqual(differ, [], 'every file the same bytes');
  assert.ok(want.length >= 10 && want.includes('world.json'), 'the case holds its files');
});

test('the shared case leaves its input as it was', () => {
  const world = structuredClone(fixture.world);
  const elements = structuredClone(fixture.elements);
  worldFolderFiles(world, elements);
  const again = JSON.parse(readFileSync(new URL('./fixtures/world-folder-files.json', import.meta.url), 'utf8'));
  assert.deepEqual(world, again.world);
  assert.deepEqual(elements, again.elements);
});

test('a repeated id in one type keeps its last body', () => {
  const files = worldFolderFiles(W, { character: [
    { id: 'c-1', name: 'First', n: 1 }, { id: 'c-2', name: 'Other' }, { id: 'c-1', name: 'Second', n: 2 },
  ] });
  assert.deepEqual(files.map((f) => f.path), ['elements/character/other--c-2.json', 'elements/character/second--c-1.json', 'world.json']);
  assert.equal(text(files[1]), '{\n  "id": "c-1",\n  "name": "Second",\n  "n": 2\n}\n');
});

test('the same id under two types is refused', () => {
  assert.throws(
    () => worldFolderFiles(W, { character: [{ id: 'x-1', name: 'A' }], location: [{ id: 'x-1', name: 'B' }] }),
    (e) => e instanceof TypeError && e.message === 'worldFolderFiles: id x-1 appears under both character and location.',
  );
});

test('a stub is written without its unset fields, known_of last; known_of other than true is a whole body', () => {
  const [stub] = worldFolderFiles(W, { character: [{ id: 'c-1', known_of: true, name: 'S', description: '', x: [], y: null, z: '', n: 0 }] });
  assert.equal(text(stub), '{\n  "id": "c-1",\n  "name": "S",\n  "description": "",\n  "n": 0,\n  "known_of": true\n}\n');
  const [whole] = worldFolderFiles(W, { character: [{ id: 'c-1', known_of: 1, name: 'S', y: null }] });
  assert.equal(text(whole), '{\n  "id": "c-1",\n  "known_of": 1,\n  "name": "S",\n  "y": null\n}\n');
});

test('world.json: time_range_current is written time_current, snapshot_counts recounted for a snapshot, format_version kept', () => {
  const files = worldFolderFiles(
    { id: 'w', name: '', time_range_current: 3, snapshot_of: 'v', snapshot_counts: { zone: 9 }, format_version: '0.3.1' },
    { zone: [{ id: 'z-1' }, { id: 'z-2' }] },
  );
  assert.equal(text(files.at(-1)), '{\n  "id": "w",\n  "name": "",\n  "time_current": 3,\n  "snapshot_of": "v",\n  "snapshot_counts": {\n    "zone": 2\n  },\n  "format_version": "0.3.1"\n}\n');
  assert.deepEqual(worldFolderFiles(W, {}).map((f) => f.path), ['world.json'], 'no elements: world.json alone');
});

test('the refusals: a TypeError naming what is wrong, before any file is made', () => {
  const refuses = (world, elements, words) => assert.throws(
    () => worldFolderFiles(world, elements),
    (e) => e instanceof TypeError && e.message.startsWith('worldFolderFiles: ') && e.message.includes(words),
    words,
  );
  refuses(null, {}, 'the world is an object with an id and a name');
  refuses([], {}, 'the world is an object with an id and a name');
  refuses({ name: 'W' }, {}, "the world's id is a non-empty string");
  refuses({ id: '', name: 'W' }, {}, "the world's id is a non-empty string");
  refuses({ id: 'w' }, {}, "the world's name is a string");
  refuses(W, undefined, 'elements is an object from an element type to a list');
  refuses(W, new Map(), 'elements is an object from an element type to a list');
  refuses(W, { characters: [] }, 'unknown element type "characters". The types are ability, character,');
  refuses(W, { Character: [] }, 'unknown element type "Character"');
  refuses(W, { character: { id: 'c' } }, 'elements.character is a list of element bodies; got an object');
  refuses(W, { character: ['c-1'] }, 'elements.character[0] is an element body, an object; got the string "c-1"');
  refuses(W, { character: [{ name: 'A' }] }, "elements.character[0]'s id is a non-empty string; got undefined");
  refuses(W, { character: [{ id: 7 }] }, "elements.character[0]'s id is a non-empty string; got the number 7");
  refuses(W, { character: [{ id: 'c', x: undefined }] }, 'elements.character[0].x is undefined, which a JSON file cannot hold');
  refuses(W, { character: [{ id: 'c', x: { 'a b': [NaN] } }] }, 'elements.character[0].x["a b"][0] is NaN, which a JSON file cannot hold');
  refuses(W, { character: [{ id: 'c', x: new Date(0) }] }, 'elements.character[0].x is a Date, which a JSON file cannot hold');
  refuses(W, { character: [{ id: 'c', x: () => 1 }] }, 'elements.character[0].x is a function');
  refuses(W, { character: [{ id: 'c', x: 1n }] }, 'elements.character[0].x is the bigint 1n');
  refuses({ ...W, x: Infinity }, {}, 'world.x is Infinity');
  const loop = { id: 'c' };
  loop.self = { back: loop };
  refuses(W, { character: [loop] }, 'elements.character[0].self.back holds itself');
  // The same object twice, not inside itself, is no loop.
  const shared = { a: 1 };
  assert.equal(worldFolderFiles(W, { character: [{ id: 'c', p: shared, q: [shared] }] }).length, 2);
});

test('the files round-trip through the package\'s folder reader and a .owworld file', async () => {
  const files = worldFolderFiles(fixture.world, fixture.elements);
  let report;
  const client = new OwV2Client({ fetch: folderFetch(files, { onRead: (r) => { report = r; } }) });
  const world = await client.getWorld();
  assert.equal(world.id, fixture.world.id);
  assert.equal(world.time_range_current, 1200, 'time_current read back as the wire\'s time_range_current');
  assert.deepEqual(report.skipped, [], 'no file skipped');
  assert.equal(report.elements, files.length - 1, 'every element file served');
  for (const f of files.filter((x) => x.path !== 'world.json')) {
    const body = JSON.parse(text(f));
    const type = f.path.split('/')[1];
    const served = await client.get(type, body.id);
    for (const [k, v] of Object.entries(body)) assert.deepEqual(served[k], v, `${f.path}: ${k}`);
  }
  const packed = readWorldFile(writeWorldFile(files, 'harbour'));
  assert.equal(packed.worldId, fixture.world.id);
  assert.deepEqual(packed.files.map((f) => f.path), files.map((f) => f.path));
  assert.ok(packed.files.every((f, i) => bytesEqual(f.data, files[i].data)), 'the same bytes out of the .owworld file');
});
