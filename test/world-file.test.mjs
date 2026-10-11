/**
 * The world file (Folder Format §4.1, a portable copy): Atlas's reader cases,
 * ported from Atlas's tests/unit/world-file.test.ts (Temper's) onto the
 * tool-neutral reader, plus the cases the move added: `skip`, reason codes,
 * a path that is both a file and a folder, and the writer's refusals.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  readWorldFile, writeWorldFile, OwWorldFileError, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_ENTRIES,
} from '../dist/index.js';

const j = (v) => JSON.stringify(v, null, 2) + '\n';
const text = (b) => new TextDecoder().decode(b);
const WID = '0192a000-aaaa-7bbb-8ccc-000000000001';
const world = { 'w/world.json': strToU8(j({ id: WID, name: 'W' })) };

const refuses = (bytes, reason, opts) => assert.throws(
  () => readWorldFile(bytes, opts),
  (e) => e instanceof OwWorldFileError && e.reason === reason && e.name === 'OwWorldFileError',
  `expected ${reason}`,
);

test('the budget is Atlas\'s: 1 GiB uncompressed, 200,000 files', () => {
  assert.equal(WORLD_FILE_MAX_BYTES, 1024 ** 3);
  assert.equal(WORLD_FILE_MAX_ENTRIES, 200_000);
});

test('round trip: written and read back, under one folder, byte for byte; JSON deflated, media stored', () => {
  const files = [
    { path: '.atlas/charts.json', data: strToU8('[]') },
    { path: 'elements/character/ana--00000001.json', data: strToU8(j({ id: '1', name: 'Ana' })) },
    { path: 'media/map.png', data: strToU8('PNGBYTES') },
    { path: 'world.json', data: strToU8(j({ id: WID, name: 'Hollow Reach', time_current: 12 })) },
  ];
  const zip = writeWorldFile(files, 'hollow-reach-0192a000');
  const back = readWorldFile(zip);
  assert.equal(back.worldId, WID);
  assert.equal(back.name, 'Hollow Reach');
  assert.deepEqual(back.world, { id: WID, name: 'Hollow Reach', time_current: 12 });
  assert.deepEqual(back.files.map(f => f.path), files.map(f => f.path));
  for (const f of files) assert.deepEqual(back.files.find(b => b.path === f.path).data, f.data);
  // A stored entry's bytes sit in the archive as they are; a deflated one's do not.
  const raw = text(zip);
  assert.ok(raw.includes('PNGBYTES'), 'media is stored');
  assert.ok(!raw.includes('"Hollow Reach"'), 'JSON is deflated');
});

test('the link and its key never travel: stripped on write and on read, whoever made the file', () => {
  const linked = j({ id: WID, name: 'L', api: { world_id: 'srv', api_key: 'ow_w_secret' } });
  const written = writeWorldFile([{ path: 'world.json', data: strToU8(linked) }], 'l');
  assert.ok(!text(readWorldFile(written).files[0].data).includes('ow_w_secret'));
  const handMade = zipSync({ 'l/world.json': strToU8(linked) });
  const back = readWorldFile(handMade);
  assert.deepEqual(back.world, { id: WID, name: 'L' });
  assert.ok(!JSON.stringify(back.files.map(f => text(f.data))).includes('ow_w_secret'));
});

test('a world.json without api keeps its exact bytes', () => {
  const odd = strToU8('{"name":"Kept as is","id":"' + WID + '"}');
  const back = readWorldFile(zipSync({ 'w/world.json': odd }));
  assert.deepEqual(back.files[0].data, odd);
});

test('a world.json at the root, without a folder, reads the same', () => {
  const zip = zipSync({ 'world.json': strToU8(j({ id: WID, name: 'Bare' })), 'elements/character/a.json': strToU8('{}') });
  assert.deepEqual(readWorldFile(zip).files.map(f => f.path), ['elements/character/a.json', 'world.json']);
});

test('archive junk is dropped; a tool\'s own files only through skip', () => {
  const zip = zipSync({ ...world, 'w/.atlas/lock': strToU8('{}'), 'w/__MACOSX/._world.json': strToU8('x'), 'w/.DS_Store': strToU8('x'), 'w/sub/Thumbs.db': strToU8('x') });
  assert.deepEqual(readWorldFile(zip).files.map(f => f.path), ['.atlas/lock', 'world.json']);
  assert.deepEqual(readWorldFile(zip, { skip: p => p.startsWith('.atlas/') }).files.map(f => f.path), ['world.json']);
});

test('skip sees each file\'s exact path and drops only that file, never what sits under a name it matches', () => {
  // Atlas's adapter skips the transient FILE `.atlas/making` and must still see `.atlas/making/x`, which it refuses.
  const zip = zipSync({ ...world, 'w/.atlas/making/x': strToU8('x'), 'w/.atlas/lock': strToU8('{}') });
  const seen = [];
  const back = readWorldFile(zip, { skip: p => { seen.push(p); return p === '.atlas/making' || p === '.atlas/lock'; } });
  assert.deepEqual(seen.sort(), ['.atlas/lock', '.atlas/making/x', 'world.json']);
  assert.deepEqual(back.files.map(f => f.path), ['.atlas/making/x', 'world.json']);
});

test('a skipped file still counts against the budget', () => {
  const zip = zipSync({ ...world, 'w/.atlas/a': strToU8('1'), 'w/.atlas/b': strToU8('2') });
  refuses(zip, 'too_many', { maxEntries: 2, skip: p => p.startsWith('.atlas/') });
});

test('name is the file\'s own: \'\' when it has none, never a made-up one', () => {
  assert.equal(readWorldFile(zipSync({ 'w/world.json': strToU8(j({ id: WID })) })).name, '');
});

test('refuses a path that climbs out, is absolute, names a drive, holds a backslash or an empty part', () => {
  for (const bad of ['w/../evil.json', '../evil.json', '/etc/evil.json', 'C:/evil.json', 'w//evil.json', 'w\\..\\evil.json', 'w/./x.json']) {
    refuses(zipSync({ ...world, [bad]: strToU8('x') }), 'unsafe_path');
  }
});

test('refuses a path that is both a file and a folder', () => {
  refuses(zipSync({ ...world, 'w/media': strToU8('x'), 'w/media/a.png': strToU8('y') }), 'unsafe_path');
});

test('refuses past the budget, by declared size, by count', () => {
  refuses(zipSync({ ...world, 'w/media/big.bin': new Uint8Array(64) }), 'too_big', { maxBytes: 32 });
  refuses(zipSync({ ...world, 'w/a': strToU8('1'), 'w/b': strToU8('2') }), 'too_many', { maxEntries: 2 });
});

/** A zip whose headers declare `name`'s size as 1 byte while it holds more: a declared size that lies. */
function lyingSize(zip, name) {
  const out = zip.slice();
  const dv = new DataView(out.buffer);
  const at = (off, len) => text(out.subarray(off, off + len));
  for (let i = 0; i + 46 < out.length; i++) {
    const sig = dv.getUint32(i, true);
    if (sig === 0x04034b50 && at(i + 30, dv.getUint16(i + 26, true)) === name) dv.setUint32(i + 22, 1, true);
    if (sig === 0x02014b50 && at(i + 46, dv.getUint16(i + 28, true)) === name) dv.setUint32(i + 24, 1, true);
  }
  return out;
}

test('refuses a declared size that lies: the inflated bytes are counted again', () => {
  const zip = lyingSize(zipSync({ ...world, 'w/media/big.bin': [new Uint8Array(4096), { level: 0 }] }), 'w/media/big.bin');
  refuses(zip, 'too_big', { maxBytes: 1024 });
});

test('refuses no world.json, an unreadable one, one without a string id, one that is not an object', () => {
  refuses(zipSync({ 'w/elements/a.json': strToU8('{}') }), 'not_a_world');
  refuses(zipSync({ 'w/world.json': strToU8('{nope') }), 'not_a_world');
  refuses(zipSync({ 'w/world.json': strToU8(j({ name: 'no id' })) }), 'not_a_world');
  refuses(zipSync({ 'w/world.json': strToU8(j({ id: 7, name: 'number id' })) }), 'not_a_world');
  refuses(zipSync({ 'w/world.json': strToU8(j({ id: '  ', name: 'blank id' })) }), 'not_a_world');
  refuses(zipSync({ 'w/world.json': strToU8(j([WID])) }), 'not_a_world');
});

test('refuses two worlds in one file, or loose files beside the world\'s folder', () => {
  refuses(zipSync({ ...world, 'v/world.json': strToU8(j({ id: 'other', name: 'V' })) }), 'more_than_one');
  refuses(zipSync({ ...world, 'stray.txt': strToU8('x') }), 'more_than_one');
});

test('refuses a world nested inside the world, at the root or in its folder', () => {
  refuses(zipSync({ 'world.json': strToU8(j({ id: WID, name: 'W' })), 'other/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
  refuses(zipSync({ ...world, 'w/inner/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
  refuses(zipSync({ ...world, 'w/.atlas/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
});

test('refuses something that is not a zip at all', () => {
  refuses(strToU8('just some text'), 'not_openable');
});

test('the writer refuses an unsafe path or folder, a duplicate, and a missing, unreadable or id-less world.json', () => {
  const wj = { path: 'world.json', data: strToU8(j({ id: WID, name: 'W' })) };
  const wr = (files, top = 'w') => () => writeWorldFile(files, top);
  const is = (reason) => (e) => e instanceof OwWorldFileError && e.reason === reason;
  assert.throws(wr([wj, { path: '../x', data: strToU8('x') }]), is('unsafe_path'));
  assert.throws(wr([wj], '../w'), is('unsafe_path'));
  assert.throws(wr([wj], 'a/b'), is('unsafe_path'));
  assert.throws(wr([wj, wj]), is('unsafe_path'));
  assert.throws(wr([{ path: 'a.json', data: strToU8('{}') }]), is('not_a_world'));
  assert.throws(wr([{ path: 'world.json', data: strToU8('{ "id": "x", "api": { "api_key": "ow_w_secret" } broken') }]), is('not_a_world'));
  assert.throws(wr([{ path: 'world.json', data: strToU8(j({ name: 'no id' })) }]), is('not_a_world'));
});
