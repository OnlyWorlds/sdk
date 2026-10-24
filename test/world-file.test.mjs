/**
 * The world file, `.owworld` (Folder Format §4.7; a portable copy, §4.1):
 * Atlas's reader cases, ported from Atlas's tests/unit/world-file.test.ts
 * (Temper's) onto the tool-neutral reader, the cases the move added (`skip`,
 * reason codes, a path that is both a file and a folder, the writer's
 * refusals), and §4.7's checks OW-1 to OW-22, each on bytes built here. The
 * last test runs the whole fixture set, vendored with the schema distribution
 * (codegen/schema-dist/fixtures/owworld/).
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zipSync, deflateSync, strToU8 } from 'fflate';
import {
  readWorldFile, writeWorldFile, OwWorldFileError, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_ENTRIES, WORLD_FILE_MEDIA_TYPE,
  simpleCaseFold, nfc,
} from '../dist/index.js';

const j = (v) => JSON.stringify(v, null, 2) + '\n';
const text = (b) => new TextDecoder().decode(b);
const cp = (...points) => String.fromCodePoint(...points);
const WID = '0192a000-aaaa-7bbb-8ccc-000000000001';
const world = { 'w/world.json': strToU8(j({ id: WID, name: 'W' })) };

const refuses = (bytes, reason, opts) => assert.throws(
  () => readWorldFile(bytes, opts),
  (e) => e instanceof OwWorldFileError && e.reason === reason && e.name === 'OwWorldFileError',
  `expected ${reason}`,
);

// --- a zip built field by field, for what fflate will not write -------------

function crc32(data) {
  let c = -1;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * Entries `{ name (string or bytes), data, method (0 stored, 8 deflate, any other: data as is), flags, utf8, mode,
 * declared, crc, zip64, payload }` in the order given. `payload` replaces the stored bytes (`data` still gives the CRC
 * and the declared size). `utf8` defaults to "the name is not ASCII". `mode` is a Unix mode in
 * the external attributes. `zip64` writes the entry's sizes and offset in a zip64 extra field. Options: `zip64` adds
 * the zip64 end record and locator; `disk` says this file is that disk of a spanned set.
 */
function buildZip(entries, { zip64 = false, disk = 0 } = {}) {
  const parts = [];
  const central = [];
  let off = 0;
  for (const e of entries) {
    const name = typeof e.name === 'string' ? strToU8(e.name) : e.name;
    const data = e.data ?? new Uint8Array(0);
    const method = e.method ?? 0;
    const payload = e.payload ?? (method === 8 ? deflateSync(data) : data);
    let flags = e.flags ?? 0;
    if (e.utf8 ?? name.some(b => b > 0x7f)) flags |= 0x0800;
    const crc = e.crc ?? crc32(data);
    const declared = e.declared ?? data.length;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true); lv.setUint32(22, declared, true); lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const extra = e.zip64 ? new Uint8Array(28) : new Uint8Array(0);
    if (e.zip64) {
      const xv = new DataView(extra.buffer);
      xv.setUint16(0, 0x0001, true); xv.setUint16(2, 24, true);
      xv.setBigUint64(4, BigInt(declared), true); xv.setBigUint64(12, BigInt(payload.length), true);
      xv.setBigUint64(20, BigInt(off), true);
    }
    const cd = new Uint8Array(46 + name.length + extra.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, ((e.mode != null ? 3 : 0) << 8) | 20, true);
    cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, e.zip64 ? 0xffffffff : payload.length, true);
    cv.setUint32(24, e.zip64 ? 0xffffffff : declared, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, extra.length, true);
    cv.setUint32(38, e.mode != null ? (e.mode * 0x10000) >>> 0 : 0, true);
    cv.setUint32(42, e.zip64 ? 0xffffffff : off, true);
    cd.set(name, 46); cd.set(extra, 46 + name.length);
    parts.push(local, payload);
    central.push(cd);
    off += local.length + payload.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const tail = [];
  if (zip64) {
    const rec = new Uint8Array(56);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, 0x06064b50, true); rv.setBigUint64(4, 44n, true); rv.setUint16(12, 45, true);
    rv.setUint16(14, 45, true); rv.setBigUint64(24, BigInt(entries.length), true);
    rv.setBigUint64(32, BigInt(entries.length), true); rv.setBigUint64(40, BigInt(cdSize), true);
    rv.setBigUint64(48, BigInt(off), true);
    const loc = new Uint8Array(20);
    const lv = new DataView(loc.buffer);
    lv.setUint32(0, 0x07064b50, true); lv.setBigUint64(8, BigInt(off + cdSize), true); lv.setUint32(16, 1, true);
    tail.push(rec, loc);
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, disk, true);
  ev.setUint16(8, zip64 ? 0xffff : entries.length, true); ev.setUint16(10, zip64 ? 0xffff : entries.length, true);
  ev.setUint32(12, zip64 ? 0xffffffff : cdSize, true); ev.setUint32(16, zip64 ? 0xffffffff : off, true);
  tail.push(end);
  return concat([...parts, ...central, ...tail]);
}

/** A world in folder `w/` plus `more` entries, built by buildZip. */
const W = (more = [], opts) => buildZip([{ name: 'w/world.json', data: strToU8(j({ id: WID, name: 'W' })), method: 8 }, ...more], opts);
const PNG = strToU8('PNGBYTES');

/** The central directory of a classic zip, entry by entry, in order. */
function centralOf(zip) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (dv.getUint32(end, true) !== 0x06054b50) end--;
  let p = dv.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < dv.getUint16(end + 10, true); i++) {
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    out.push({
      name: text(zip.subarray(p + 46, p + 46 + nlen)), flags: dv.getUint16(p + 8, true),
      method: dv.getUint16(p + 10, true), time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true),
      extra: elen, offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nlen + elen + dv.getUint16(p + 32, true);
  }
  return out;
}

// --- the budget ---------------------------------------------------------------

test('the budget is the floor every reader accepts: 2 GiB uncompressed, 500,000 files (OW-15)', () => {
  assert.equal(WORLD_FILE_MAX_BYTES, 2 * 1024 ** 3);
  assert.equal(WORLD_FILE_MAX_ENTRIES, 500_000);
});

// --- Atlas's cases and the move's ---------------------------------------------

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
  // A stored file comes back as its own bytes, never a view of the archive's buffer.
  const png = back.files.find(f => f.path === 'media/map.png').data;
  assert.equal(png.byteLength, png.buffer.byteLength);
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

test('refuses a path that climbs out, is absolute, names a drive, holds a backslash or an empty part (OW-16)', () => {
  for (const bad of ['w/../evil.json', '../evil.json', '/etc/evil.json', 'C:/evil.json', 'w//evil.json', 'w\\..\\evil.json', 'w/./x.json']) {
    refuses(zipSync({ ...world, [bad]: strToU8('x') }), 'unsafe_path');
  }
});

test('refuses a path that is both a file and a folder (OW-19)', () => {
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

test('refuses two worlds in one file (OW-2)', () => {
  refuses(zipSync({ ...world, 'v/world.json': strToU8(j({ id: 'other', name: 'V' })) }), 'more_than_one');
});

test('refuses a world nested inside the world, at the root or in its folder (OW-5)', () => {
  refuses(zipSync({ 'world.json': strToU8(j({ id: WID, name: 'W' })), 'other/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
  refuses(zipSync({ ...world, 'w/inner/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
  refuses(zipSync({ ...world, 'w/.atlas/world.json': strToU8(j({ id: 'o', name: 'O' })) }), 'more_than_one');
});

test('refuses something that is not a zip at all (OW-1)', () => {
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

// --- §4.7, the reader -----------------------------------------------------------

test('OW-4: files beside the world\'s folder are ignored, never a second world', () => {
  const zip = zipSync({
    ...world, 'w/elements/character/a.json': strToU8('{}'),
    'stray.txt': strToU8('x'), 'README.md': strToU8('# hi'), '.atlas/charts.json': strToU8('[]'),
    '__MACOSX/w/._world.json': strToU8('x'), 'notes/todo.txt': strToU8('x'),
  });
  const back = readWorldFile(zip);
  assert.equal(back.worldId, WID);
  assert.deepEqual(back.files.map(f => f.path), ['elements/character/a.json', 'world.json']);
});

test('OW-5: a producer\'s world.json under records/ is data, never a second world', () => {
  const lab = strToU8(j({ id: 'lab-world', name: 'Lab' }));
  const back = readWorldFile(zipSync({ ...world, 'w/records/lab/world.json': lab }));
  assert.equal(back.worldId, WID);
  assert.deepEqual(back.files.map(f => f.path), ['records/lab/world.json', 'world.json']);
  assert.deepEqual(back.files[0].data, lab);
  refuses(zipSync({ ...world, 'w/elements/world.json': lab }), 'more_than_one');
});

test('OW-6: the mimetype marker is never required, refused with other bytes, and never returned', () => {
  const right = { name: 'mimetype', data: strToU8(WORLD_FILE_MEDIA_TYPE) };
  const wj = { name: 'w/world.json', data: strToU8(j({ id: WID, name: 'W' })), method: 8 };
  assert.equal(WORLD_FILE_MEDIA_TYPE, 'application/vnd.onlyworlds.world+zip');
  assert.deepEqual(readWorldFile(buildZip([right, wj])).files.map(f => f.path), ['world.json']);
  // The right bytes in the wrong shape are a writer's lapse; a reader reads the file.
  readWorldFile(buildZip([{ ...right, method: 8 }, wj]));
  readWorldFile(buildZip([wj, right]));
  // A root world: the marker is still not one of its files.
  const rootWorld = buildZip([right, { ...wj, name: 'world.json' }]);
  assert.deepEqual(readWorldFile(rootWorld).files.map(f => f.path), ['world.json']);
  refuses(buildZip([{ name: 'mimetype', data: strToU8('application/zip') }, wj]), 'marker');
  refuses(buildZip([{ name: 'mimetype', data: strToU8(WORLD_FILE_MEDIA_TYPE + '\n') }, wj]), 'marker');
  // A byte order mark is other bytes too: the check compares bytes, never decoded text (TextDecoder's default strips a BOM; found by the Python port, 4.53.2).
  refuses(buildZip([{ name: 'mimetype', data: concat([new Uint8Array([0xef, 0xbb, 0xbf]), strToU8(WORLD_FILE_MEDIA_TYPE)]) }, wj]), 'marker');
});

test('OW-14: an entry that inflates past the size it declares is refused, whatever the budget', () => {
  const body = strToU8(j({ id: '9', name: 'Liar', description: 'x'.repeat(4000) }));
  refuses(W([{ name: 'w/elements/character/liar.json', data: body, method: 8, declared: 64 }]), 'too_big');
  // Fewer bytes than declared, or a wrong CRC: a broken entry.
  refuses(W([{ name: 'w/media/a.png', data: PNG, method: 8, declared: PNG.length + 5 }]), 'not_openable');
  refuses(W([{ name: 'w/media/a.png', data: PNG, crc: 12345 }]), 'not_openable');
});

test('OW-14: a long deflate stream is inflated in chunks and stopped at its declared size', () => {
  // Noise (xorshift32) does not compress, so the stream is longer than one chunk (64 KiB).
  const big = new Uint8Array(200_000);
  for (let i = 0, x = 7; i < big.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; big[i] = x & 0xff; }
  assert.ok(deflateSync(big).length > 64 * 1024, 'the stream is longer than one chunk');
  const ok = readWorldFile(W([{ name: 'w/media/noise.bin', data: big, method: 8 }]));
  assert.deepEqual(ok.files.find(f => f.path === 'media/noise.bin').data, big);
  refuses(W([{ name: 'w/media/noise.bin', data: big, method: 8, declared: 150_000 }]), 'too_big');
});

test('OW-14: a deflate stream that ends before its declared compressed size is refused, short or chunked', () => {
  // Skeld h58 #11968: the size bullet speaks of every size an entry declares, so bytes after the stream's end are a
  // lie about the compressed size; sizes and CRC stay honest. The noise is the chunked case (over 64 KiB).
  const small = strToU8(j({ id: WID, name: 'Early' }));
  const big = new Uint8Array(200_000);
  for (let i = 0, x = 7; i < big.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; big[i] = x & 0xff; }
  const junk = (data, n) => concat([deflateSync(data), new Uint8Array(n).fill(0xff)]);
  for (const data of [small, big]) {
    refuses(W([{ name: 'w/media/a.bin', data, method: 8, payload: junk(data, 4) }]), 'not_openable');
    refuses(W([{ name: 'w/media/a.bin', data, method: 8, payload: junk(data, 1) }]), 'not_openable');
    // The stream to its last byte, and nothing after: read.
    const ok = readWorldFile(W([{ name: 'w/media/a.bin', data, method: 8 }]));
    assert.deepEqual(ok.files.find(f => f.path === 'media/a.bin').data, data);
  }
});

test('OW-15: a zip64 end record and zip64 sizes in an entry\'s extra field are read', () => {
  const back = readWorldFile(W([{ name: 'w/media/a.png', data: PNG, zip64: true }], { zip64: true }));
  assert.deepEqual(back.files.find(f => f.path === 'media/a.png').data, PNG);
});

test('OW-17: two entries with one name are refused, beside the world too', () => {
  refuses(W([{ name: 'w/media/a.png', data: PNG }, { name: 'w/media/a.png', data: strToU8('other') }]), 'duplicate');
  refuses(W([{ name: 'README.txt', data: strToU8('one') }, { name: 'README.txt', data: strToU8('two') }]), 'duplicate');
});

test('OW-18: two names that are one after NFC and simple case folding are refused', () => {
  const pair = (a, b) => W([{ name: `w/media/${a}`, data: PNG }, { name: `w/media/${b}`, data: PNG }]);
  refuses(pair('Map.png', 'map.png'), 'collision');
  refuses(pair(`caf${cp(0xe9)}.png`, `cafe${cp(0x301)}.png`), 'collision'); // NFC and NFD
  refuses(pair(`Caf${cp(0xe9)}.png`, `cafe${cp(0x301)}.png`), 'collision'); // both steps
  refuses(pair(`${cp(0x3c3)}.png`, `${cp(0x3c2)}.png`), 'collision'); // sigma and final sigma
  refuses(W([{ name: 'w/elements/character/a.json', data: PNG }, { name: 'w/Elements/character/b.json', data: PNG }]), 'collision');
  // Simple folding keeps sharp s apart from ss, and dotless i apart from i and I.
  readWorldFile(pair(`stra${cp(0xdf)}e.png`, 'strasse.png'));
  readWorldFile(pair(`${cp(0x131)}.png`, 'I.png'));
});

test('OW-18: the fold is CaseFolding.txt 15.1, C and S rows, for every code point and nothing more', () => {
  // Unicode's file as published (unicode.org/Public/15.1.0/ucd/CaseFolding.txt), the copy the schema dist carries
  // beside the fixture set; Skeld's ruling, OW Council #9830.
  const table = new Map();
  for (const line of readFileSync(new URL('../codegen/schema-dist/fixtures/owworld/CaseFolding-15.1.0.txt', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^([0-9A-F]+); ([CS]); ([0-9A-F]+);/.exec(line);
    if (m) table.set(parseInt(m[1], 16), parseInt(m[3], 16));
  }
  assert.equal(table.size, 1457, 'the C and S rows of 15.1');
  const wrong = [];
  for (let c = 0; c < 0x110000; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const want = table.get(c) ?? c;
    const got = simpleCaseFold(cp(c)).codePointAt(0);
    if (got !== want) wrong.push(`U+${c.toString(16).toUpperCase()} -> U+${got.toString(16).toUpperCase()}`);
  }
  assert.deepEqual(wrong.slice(0, 20), [], `${wrong.length} code points fold otherwise than the table says`);
  // The three S rows a runtime's casing misses collide in a world file; a fold Unicode 16 added does not, nor dotless i.
  const pair = (a, b) => W([{ name: `w/media/${a}.png`, data: PNG }, { name: `w/media/${b}.png`, data: PNG }]);
  refuses(pair(cp(0x1fd3), cp(0x390)), 'collision');
  refuses(pair(cp(0x1fe3), cp(0x3b0)), 'collision');
  refuses(pair(cp(0xfb05), cp(0xfb06)), 'collision');
  readWorldFile(pair(cp(0xa7cb), cp(0x264)));
  readWorldFile(pair(cp(0x131), 'i'));
});

test('OW-18: the NFC is UnicodeData and CompositionExclusions 15.1, for every code point, never the runtime\'s', () => {
  // Unicode's files as published (unicode.org/Public/15.1.0/ucd/), the copies the schema dist carries beside the
  // fixture set since serial 57 (OW Council #656). Read here on their own, apart from the built tables.
  const dir = new URL('../codegen/schema-dist/fixtures/owworld/', import.meta.url);
  const ccc = new Map();
  const mapping = new Map();
  const assigned = new Set();
  let first = -1;
  for (const line of readFileSync(new URL('UnicodeData-15.1.0.txt', dir), 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const f = line.split(';');
    const c = parseInt(f[0], 16);
    if (f[1].endsWith(', First>')) { first = c; continue; }
    if (f[1].endsWith(', Last>')) { for (let k = first; k <= c; k++) assigned.add(k); continue; }
    assigned.add(c);
    if (Number(f[3])) ccc.set(c, Number(f[3]));
    if (f[5] && !f[5].startsWith('<')) mapping.set(c, f[5].split(' ').map(h => parseInt(h, 16)));
  }
  const listed = new Set();
  for (const line of readFileSync(new URL('CompositionExclusions-15.1.0.txt', dir), 'utf8').split(/\r?\n/)) {
    const m = /^([0-9A-F]+)\s*#/.exec(line);
    if (m) listed.add(parseInt(m[1], 16));
  }
  assert.equal(mapping.size, 2061, 'the canonical mappings of 15.1');
  assert.equal(listed.size, 81, 'the listed exclusions of 15.1');
  const hex = (s) => [...s].map(x => x.codePointAt(0).toString(16).toUpperCase()).join(' ');
  const wrong = [];
  const expect = (input, got, want) => { if (got !== want && wrong.length < 20) wrong.push(`${hex(input)} -> ${hex(got)}, not ${hex(want)}`); };
  const PROBE = cp(0x334); // class 1, composes with nothing
  for (let c = 0; c < 0x110000; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const s = cp(c);
    const to = mapping.get(c);
    if (to) {
      // A composite comes back from NFC unless it is excluded from composition: listed, a singleton, or a
      // non-starter decomposition. Its mapping is canonically equivalent to it, so both give one NFC.
      const excluded = to.length === 1 || listed.has(c) || ccc.has(c) || ccc.has(to[0]);
      const out = nfc(s);
      if (excluded ? out.includes(s) : out !== s) wrong.push(`U+${c.toString(16).toUpperCase()}: ${excluded ? 'excluded, composed' : 'not composed'}`);
      expect(cp(...to), nfc(cp(...to)), out);
    } else if (c >= 0xac00 && c <= 0xd7a3) {
      const n = c - 0xac00;
      const jamo = [0x1100 + Math.floor(n / 588), 0x1161 + Math.floor((n % 588) / 28), ...(n % 28 ? [0x11a7 + n % 28] : [])];
      expect(s, nfc(s), s);
      expect(cp(...jamo), nfc(cp(...jamo)), s);
    } else {
      expect(s, nfc(s), s);
      // A combining class is where canonical ordering puts the mark: past the probe's class 1, or in place.
      const k = ccc.get(c) ?? 0;
      const probed = `q${s}${PROBE}`;
      expect(probed, nfc(probed), k > 1 ? `q${PROBE}${s}` : probed);
    }
  }
  assert.deepEqual(wrong.slice(0, 20), [], `${wrong.length} code points normalise otherwise than the files say`);

  // Where the runtime's Unicode is newer, a code point 15.1 leaves unassigned decomposes in the runtime and composes
  // there, and stays as it is at 15.1: two names, accepted (U+11383 against U+11382 U+113C9, Tulu-Tigalari, 16.0).
  const pair = (a, b) => W([{ name: `w/media/${a}.png`, data: PNG }, { name: `w/media/${b}.png`, data: PNG }]);
  readWorldFile(pair(cp(0x11383), cp(0x11382, 0x113c9)));
  readWorldFile(pair(cp(0x16d68), cp(0x16d67, 0x16d67)));
  refuses(pair(cp(0x1ec7), cp(0x65, 0x302, 0x323)), 'collision');
  // Where both know a code point, the runtime agrees (Unicode's normalization stability), so the pin moves nothing
  // a runtime already got right.
  const assignedHere = /^\p{Assigned}$/u;
  const differ = [];
  for (const c of [...mapping.keys(), ...ccc.keys()]) {
    if (!assignedHere.test(cp(c))) continue;
    for (const s of [cp(c), cp(...(mapping.get(c) ?? [c])), `q${cp(c)}${PROBE}`]) {
      if (nfc(s) !== s.normalize('NFC') && differ.length < 20) differ.push(hex(s));
    }
  }
  assert.deepEqual(differ, [], `where 15.1 and the runtime (Unicode ${process.versions.unicode}) both assign`);
  // Only what 15.1 assigns is changed: every code point it leaves unassigned normalises to itself in a name.
  for (let c = 0; c < 0x110000; c++) {
    if (assigned.has(c) || (c >= 0xd800 && c <= 0xdfff)) continue;
    const d = cp(c).normalize('NFD');
    if (nfc(d) !== d && wrong.length < 20) wrong.push(`unassigned U+${c.toString(16).toUpperCase()}: ${hex(d)} -> ${hex(nfc(d))}`);
  }
  assert.deepEqual(wrong, [], 'code points 15.1 leaves unassigned');
});

test('OW-20:a link or a special file is refused; regular files and folders made on Unix are read', () => {
  refuses(W([{ name: 'w/media/link.png', data: strToU8('../../etc/passwd'), mode: 0o120777 }]), 'link');
  refuses(W([{ name: 'w/media/fifo', data: new Uint8Array(0), mode: 0o010644 }]), 'link');
  const back = readWorldFile(W([{ name: 'w/media/', mode: 0o040755 }, { name: 'w/media/a.png', data: PNG, mode: 0o100644 }]));
  assert.deepEqual(back.files.map(f => f.path), ['media/a.png', 'world.json']);
});

test('OW-21: only stored and deflate, nothing encrypted, nothing spanned', () => {
  refuses(W([{ name: 'w/elements/character/c.json', data: strToU8('{}'), method: 14 }]), 'method');
  refuses(W([{ name: 'w/elements/character/c.json', data: strToU8('{}'), method: 9 }]), 'method');
  refuses(W([{ name: 'w/media/a.png', data: PNG, flags: 0x0001 }]), 'method');
  refuses(W([{ name: 'w/media/a.png', data: PNG, flags: 0x0040 }]), 'method');
  refuses(W([], { disk: 1 }), 'not_openable');
});

test('OW-22: a name some disk cannot hold is refused', () => {
  const names = [
    'w/elements/character/CON.json', 'w/media/nul.txt', 'w/media/lpt1.png', 'w/media/a.png.', 'w/media/b.png ',
    'w/media/a?.png', 'w/media/a<b.png', 'w/media/a"b.png', 'w/media/a|b.png', 'w/media/a*b.png',
    `w/media/a${String.fromCharCode(1)}.png`, `w/media/a${String.fromCharCode(0x7f)}.png`,
  ];
  for (const name of names) refuses(W([{ name, data: PNG }]), 'name');
  // A non-ASCII name without the UTF-8 flag, and a flagged name that is not UTF-8.
  refuses(W([{ name: `w/media/caf${cp(0xe9)}.png`, data: PNG, utf8: false }]), 'name');
  refuses(W([{ name: new Uint8Array([...strToU8('w/media/caf'), 0xe9, ...strToU8('.png')]), data: PNG, utf8: true }]), 'name');
  // A device name only as a whole base name: con--e1.json is a name like any other.
  readWorldFile(W([{ name: 'w/elements/character/con--0000e1.json', data: strToU8('{}') }]));
  readWorldFile(W([{ name: `w/media/caf${cp(0xe9)}.png`, data: PNG }]));
});

test('the checks run on the central directory before anything is inflated', () => {
  // An entry that would fail its CRC once inflated, under a refused name: the name decides.
  const broken = { name: 'w/media/CON.png', data: PNG, method: 8, crc: 1 };
  refuses(W([broken]), 'name');
});

test('the files come back in code point order (the UTF-8 bytes of their names), not UTF-16 order', () => {
  const back = readWorldFile(W([{ name: `w/media/${cp(0x1f600)}.png`, data: PNG }, { name: `w/media/${cp(0xff21)}.png`, data: PNG }]));
  assert.deepEqual(back.files.map(f => f.path), [`media/${cp(0xff21)}.png`, `media/${cp(0x1f600)}.png`, 'world.json']);
});

// --- §4.7, the writer -----------------------------------------------------------

const wj = { path: 'world.json', data: strToU8(j({ id: WID, name: 'W' })) };

test('OW-6, OW-12, OW-13: the marker first and stored, every entry at 1980-01-01 00:00, in UTF-8 byte order', () => {
  const files = [
    { path: `media/${cp(0x1f600)}.png`, data: PNG },
    { path: 'elements/character/b.json', data: strToU8('{}') },
    wj,
    { path: `media/${cp(0xff21)}.png`, data: PNG },
    { path: 'elements/character/a.json', data: strToU8('{}') },
  ];
  const zip = writeWorldFile(files, 'w');
  const cd = centralOf(zip);
  assert.deepEqual(cd.map(e => e.name), [
    'mimetype', 'w/elements/character/a.json', 'w/elements/character/b.json',
    `w/media/${cp(0xff21)}.png`, `w/media/${cp(0x1f600)}.png`, 'w/world.json',
  ]);
  assert.equal(cd[0].offset, 0);
  assert.equal(cd[0].method, 0);
  assert.equal(cd[0].extra, 0);
  assert.equal(text(zip.subarray(30 + 8, 30 + 8 + WORLD_FILE_MEDIA_TYPE.length)), WORLD_FILE_MEDIA_TYPE);
  for (const e of cd) {
    assert.equal(e.date, 0x21, `${e.name} dated 1980-01-01`);
    assert.equal(e.time, 0, `${e.name} at 00:00`);
  }
  assert.deepEqual(cd.map(e => e.method), [0, 8, 8, 0, 0, 8]);
  assert.ok(cd.filter(e => /[^\x00-\x7f]/.test(e.name)).every(e => e.flags & 0x0800), 'non-ASCII names carry the UTF-8 flag');
  // One input, one set of bytes, whatever order the files come in.
  assert.deepEqual(writeWorldFile([...files].reverse(), 'w'), zip);
  assert.deepEqual(readWorldFile(zip).files.map(f => f.path), cd.slice(1).map(e => e.name.slice(2)));
});

test('OW-7: the writer emits only world.json and the folder\'s parts; a tool\'s dot-folder it is handed travels', () => {
  const files = [
    wj,
    { path: 'elements/character/a.json', data: strToU8('{}') },
    { path: 'spatial/map/m.json', data: strToU8('{}') },
    { path: 'media/a.png', data: PNG },
    { path: 'records/lab/world.json', data: strToU8(j({ id: 'lab' })) },
    { path: 'records/lab/.hidden', data: strToU8('kept') },
    { path: '.atlas/charts.json', data: strToU8('[]') },
    { path: 'README.md', data: strToU8('# no') },
    { path: 'notes/todo.txt', data: strToU8('no') },
    { path: 'media/.DS_Store', data: strToU8('no') },
    { path: 'media/a.png.meta', data: strToU8('no') },
    { path: 'elements/.cache/x.json', data: strToU8('no') },
  ];
  const back = readWorldFile(writeWorldFile(files, 'w'));
  assert.deepEqual(back.files.map(f => f.path), [
    '.atlas/charts.json', 'elements/character/a.json', 'media/a.png', 'records/lab/.hidden', 'records/lab/world.json',
    'spatial/map/m.json', 'world.json',
  ]);
});

test('the writer refuses a name some disk cannot hold, and two names that fold to one', () => {
  const is = (reason) => (e) => e instanceof OwWorldFileError && e.reason === reason;
  assert.throws(() => writeWorldFile([wj, { path: 'media/aux.png', data: PNG }], 'w'), is('name'));
  assert.throws(() => writeWorldFile([wj], 'w.'), is('name'));
  assert.throws(() => writeWorldFile([wj, { path: 'media/A.png', data: PNG }, { path: 'media/a.png', data: PNG }], 'w'), is('collision'));
  assert.throws(() => writeWorldFile([wj, { path: 'media/a', data: PNG }, { path: 'media/a/b.png', data: PNG }], 'w'), is('unsafe_path'));
  // The marker's name is taken: a folder of that name would make it a file and a folder, or two names in one.
  assert.throws(() => writeWorldFile([wj], 'mimetype'), is('unsafe_path'));
  assert.throws(() => writeWorldFile([wj], 'MimeType'), is('collision'));
});

// --- the fixture set ------------------------------------------------------------

// The set as the schema dist vendors it: flat, the zips beside verdicts.json. OW_OWWORLD_FIXTURES overrides it with
// another copy, either that folder or one holding it as `fixtures/` (the generator's working layout).
const SET_ROOT = process.env.OW_OWWORLD_FIXTURES
  || fileURLToPath(new URL('../codegen/schema-dist/fixtures/owworld/', import.meta.url));
const FIXTURES = existsSync(join(SET_ROOT, 'verdicts.json')) ? SET_ROOT : join(SET_ROOT, 'fixtures');

test('the .owworld fixture set (§4.7): every verdict and every cause', (t) => {
  assert.ok(existsSync(join(FIXTURES, 'verdicts.json')), `no verdicts.json at ${SET_ROOT} or under its fixtures/`);
  const doc = JSON.parse(readFileSync(join(FIXTURES, 'verdicts.json'), 'utf8'));
  // Every zip on disk has a verdict and every verdict's zip is on disk: a case can't drop out unseen.
  const onDisk = readdirSync(FIXTURES).filter(f => /\.(owworld|zip)$/.test(f)).sort();
  const listed = doc.fixtures.filter(v => v.status !== 'not_generated').map(v => v.file).sort();
  assert.deepEqual(onDisk, listed, 'the zips on disk and the verdicts listed');
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const verdictDiffs = [];
  const reasonDiffs = [];
  let run = 0;
  for (const v of doc.fixtures) {
    if (v.status === 'not_generated') continue;
    run++;
    let got;
    let reason = '';
    try {
      const r = readWorldFile(new Uint8Array(readFileSync(join(FIXTURES, v.file))));
      got = 'accept';
      if (v.strips) {
        const wjf = r.files.find(f => f.path === 'world.json');
        if (v.strips in r.world || (wjf && v.strips in JSON.parse(text(wjf.data)))) got = 'refuse';
      }
      if (v.roundtrip) {
        const again = readWorldFile(writeWorldFile(r.files, 'abbey'));
        const ok = again.files.length === r.files.length
          && again.files.every((f, i) => f.path === r.files[i].path && same(f.data, r.files[i].data));
        if (!ok) got = 'refuse';
      }
    } catch (e) {
      got = 'refuse';
      reason = e.reason ?? e.name;
    }
    if (got !== v.reader) verdictDiffs.push(`${v.file}: expected ${v.reader}, got ${got} ${reason}`);
    else if (got === 'refuse' && reason !== v.reason) reasonDiffs.push(`${v.file}: ${v.reason} -> ${reason}`);
  }
  t.diagnostic(`the .owworld set: ${run} fixtures run, ${verdictDiffs.length + reasonDiffs.length} disagreeing, from ${FIXTURES}`);
  assert.ok(run >= 96, `the set holds ${run} fixtures`); // serial 58's count
  assert.deepEqual(verdictDiffs, [], 'verdict disagreements');
  assert.deepEqual(reasonDiffs, [], 'right verdict for another reason');
});

// --- OW-8's private clause (§4.5 rule 11) ----------------------------------------

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const entriesOf = (bytes) => readWorldFile(bytes).files.map(f => ({ path: f.path, data: new Uint8Array(f.data) }));

test('OW-8, private records: the set\'s two sides written from sources.private, entry for entry', () => {
  const doc = JSON.parse(readFileSync(join(FIXTURES, 'verdicts.json'), 'utf8'));
  const src = doc.sources.private;
  const fixture = (file) => {
    const v = doc.fixtures.find(f => f.file === file);
    assert.ok(v && v.role === 'writer' && v.source === 'private', `${file} is a writer case on sources.private`);
    return entriesOf(new Uint8Array(readFileSync(join(FIXTURES, file))));
  };
  // The asked side carries every source file: the source world, each file checked by its hash.
  const source = fixture('pass-OW-8-private-asked.owworld');
  assert.deepEqual(source.map(f => f.path), Object.keys(src.files).sort());
  for (const f of source) assert.equal(sha256(f.data), src.files[f.path], f.path);
  assert.deepEqual(src.private, ['fold']);
  assert.ok(source.some(f => f.path.startsWith('records/fold/')), 'the source holds the private producer');

  const byDefault = entriesOf(writeWorldFile(source, src.top));
  const asked = entriesOf(writeWorldFile(source, src.top, { includePrivateRecords: true }));
  assert.deepEqual(byDefault, fixture('pass-OW-8-private-left-out.owworld'), 'the default side');
  assert.deepEqual(asked, fixture('pass-OW-8-private-asked.owworld'), 'the asked side');
  for (const file of ['fail-OW-8-private-partial.owworld', 'fail-OW-8-private-manifest-rewritten.owworld']) {
    const bad = fixture(file);
    assert.notDeepEqual(byDefault, bad, `the default side is not ${file}`);
    assert.notDeepEqual(asked, bad, `the asked side is not ${file}`);
  }
  const manifest = (files) => files.find(f => f.path === 'records/RECORDS.json').data;
  assert.equal(sha256(manifest(byDefault)), src.files['records/RECORDS.json'], 'RECORDS.json byte-exact, its private entry kept');
});

const rec = (path, body = 'x') => ({ path, data: strToU8(body) });
const manifestOf = (value) => ({ path: 'records/RECORDS.json', data: strToU8(typeof value === 'string' ? value : j(value)) });
const recordPaths = (files, opts) => readWorldFile(writeWorldFile(files, 'w', opts)).files
  .map(f => f.path).filter(p => p.startsWith('records/'));
const unreadable = (files, why) => assert.throws(() => writeWorldFile(files, 'w'),
  (e) => e instanceof TypeError && !(e instanceof OwWorldFileError)
    && e.message.includes(`records/RECORDS.json ${why}`) && e.message.includes('includePrivateRecords'));

test('OW-8: only the boolean true marks a producer private, and only its own directory is left out', () => {
  const lab = rec('records/lab/rows.bin');
  const fold = rec('records/fold/spine.jsonl');
  const folder = rec('records/folder/keep.txt');
  const entry = (producer, more = {}) => ({ producer, format: 'f', version: '1', deltas: false, ...more });
  // A string "true" is not private; nor is 1.
  for (const value of ['true', 1]) {
    const m = manifestOf([entry('fold', { private: value })]);
    assert.deepEqual(recordPaths([wj, m, fold], undefined), ['records/RECORDS.json', 'records/fold/spine.jsonl'], `private: ${JSON.stringify(value)}`);
  }
  // true leaves out records/fold/, never records/folder/; the manifest stays.
  const m = manifestOf([entry('lab'), entry('fold', { private: true })]);
  assert.deepEqual(recordPaths([wj, m, lab, fold, folder]), ['records/RECORDS.json', 'records/folder/keep.txt', 'records/lab/rows.bin']);
  assert.deepEqual(recordPaths([wj, m, lab, fold, folder], { includePrivateRecords: false }),
    ['records/RECORDS.json', 'records/folder/keep.txt', 'records/lab/rows.bin']);
  assert.deepEqual(recordPaths([wj, m, lab, fold, folder], { includePrivateRecords: true }),
    ['records/RECORDS.json', 'records/fold/spine.jsonl', 'records/folder/keep.txt', 'records/lab/rows.bin']);
  // No manifest: nothing is private.
  assert.deepEqual(recordPaths([wj, lab, fold]), ['records/fold/spine.jsonl', 'records/lab/rows.bin']);
  // The name matches by OW-18's fold: on a disk that ignores case, `Fold` names `fold`, and
  // an exact match would let the private directory travel. A decomposed é names the composed one.
  const folded = manifestOf([entry('Fold', { private: true }), entry('café', { private: true })]);
  assert.deepEqual(recordPaths([wj, folded, fold, rec('records/café/n.txt'), lab]), ['records/RECORDS.json', 'records/lab/rows.bin']);
});

test('OW-8: a manifest that cannot be read refuses by default, nothing left out by guess, and travels when asked', () => {
  const fold = rec('records/fold/spine.jsonl');
  const bad = [
    [manifestOf({ fold: { private: true } }), 'is not a JSON array'],
    [manifestOf('[{"producer": "fold", "private": true'), 'is not JSON'],
    [manifestOf(['fold']), 'holds an entry that is not an object'],
    [manifestOf([null]), 'holds an entry that is not an object'],
    [manifestOf([{ format: 'f', private: true }]), 'marks an entry private without a producer name'],
  ];
  for (const [m, why] of bad) {
    unreadable([wj, m, fold], why);
    assert.deepEqual(recordPaths([wj, m, fold], { includePrivateRecords: true }), ['records/RECORDS.json', 'records/fold/spine.jsonl']);
  }
  // An entry with no producer that is not private is no reason to refuse.
  assert.deepEqual(recordPaths([wj, manifestOf([{ format: 'f' }]), fold]), ['records/RECORDS.json', 'records/fold/spine.jsonl']);
});

test('writeWorldFile\'s options: an unknown key or a non-boolean is refused by name, before anything else', () => {
  const typeErr = (re) => (e) => e instanceof TypeError && !(e instanceof OwWorldFileError) && re.test(e.message);
  assert.throws(() => writeWorldFile([wj], 'w', { includePrivate: true }), typeErr(/unknown option 'includePrivate'.*includePrivateRecords/));
  assert.throws(() => writeWorldFile([wj], 'w', { includePrivateRecords: 'yes' }), typeErr(/includePrivateRecords must be true or false/));
  // Before the path checks: a bad option on an unsafe call is still the option's refusal.
  assert.throws(() => writeWorldFile([wj], '../w', { includePrivateRecords: true, x: 1 }), typeErr(/unknown option 'x'/));
  assert.ok(writeWorldFile([wj], 'w', {}) instanceof Uint8Array);
  for (const value of ['false', 0, null]) {
    assert.throws(() => writeWorldFile([wj], 'w', { includeHidden: value }), typeErr(/includeHidden must be true or false/), `includeHidden: ${JSON.stringify(value)}`);
  }
  assert.throws(() => writeWorldFile([wj], 'w', { includeHidden: false, report: {} }), typeErr(/report must be a function/));
  assert.throws(() => writeWorldFile([wj], 'w', { includeHidden: false, hidden: false }), typeErr(/unknown option 'hidden'.*includeHidden/));
});

// --- the hidden mark (§4.8): a copy keeps it, a share leaves it out ----------------

const el = (path, body) => ({ path, data: strToU8(typeof body === 'string' ? body : j(body)) });
const hiddenFiles = () => [
  wj,
  el('elements/character/ada-0001.json', { id: 'c1', name: 'Ada', hidden: true }),
  el('elements/character/bo-0002.json', { id: 'c2', name: 'Bo', friends: ['c1'] }),
  el('elements/location/keep-0003.json', { id: 'l1', name: 'Keep', hidden: false }),
];

test('§4.8: by default a hidden element file travels byte for byte, and the report says 0', () => {
  const files = hiddenFiles();
  const reports = [];
  for (const opts of [undefined, {}, { includeHidden: true }, { includeHidden: true, report: r => reports.push(r) }]) {
    const back = entriesOf(writeWorldFile(files, 'w', opts));
    assert.deepEqual(back.map(f => f.path), files.map(f => f.path).sort(), JSON.stringify(opts));
    const ada = back.find(f => f.path === 'elements/character/ada-0001.json');
    assert.deepEqual(ada.data, files[1].data, 'the hidden file is byte-identical');
  }
  assert.deepEqual(reports, [{ hiddenLeftOut: 0 }]);
  // Determinism: the same input, the same bytes, by default and as a share.
  assert.deepEqual(writeWorldFile(files, 'w'), writeWorldFile([...files].reverse(), 'w'));
  assert.deepEqual(writeWorldFile(files, 'w', { includeHidden: false }), writeWorldFile([...files].reverse(), 'w', { includeHidden: false }));
  assert.notDeepEqual(writeWorldFile(files, 'w'), writeWorldFile(files, 'w', { includeHidden: false }));
});

test('§4.8: includeHidden: false leaves a hidden element file out whole, counts it, and rewrites nothing else', () => {
  const files = hiddenFiles();
  const reports = [];
  const back = entriesOf(writeWorldFile(files, 'w', { includeHidden: false, report: r => reports.push(r) }));
  assert.deepEqual(reports, [{ hiddenLeftOut: 1 }]);
  assert.deepEqual(back.map(f => f.path), ['elements/character/bo-0002.json', 'elements/location/keep-0003.json', 'world.json']);
  // Bo's link to Ada keeps its id, now naming no file; hidden: false is no mark.
  for (const f of back) assert.deepEqual(f.data, files.find(g => g.path === f.path).data, f.path);
});

test('§4.8: what counts as a hidden element file, and what is kept', () => {
  const kept = (files) => {
    const reports = [];
    const paths = readWorldFile(writeWorldFile([wj, ...files], 'w', { includeHidden: false, report: r => reports.push(r) })).files
      .map(f => f.path).filter(p => p !== 'world.json');
    return { paths, left: reports[0].hiddenLeftOut };
  };
  // The legacy spatial/ layout, an upper-case .JSON, and a doubtful mark ("true", 1) are left out.
  assert.deepEqual(kept([
    el('spatial/pin/p.json', { id: 'p', hidden: true }),
    el('elements/map/M.JSON', { id: 'm', hidden: true }),
    el('elements/event/e.json', { id: 'e', hidden: 'true' }),
    el('elements/event/f.json', { id: 'f', hidden: 1 }),
  ]), { paths: [], left: 4 });
  // Kept: not JSON, not UTF-8, not an object, a null mark, a nested mark, a file deeper than a
  // type folder, one that is not .json, and hidden: true outside the element folders.
  const keep = [
    el('elements/character/broken.json', '{"id": "x", "hidden": true'),
    { path: 'elements/character/latin.json', data: new Uint8Array([0x7b, 0x22, 0xe9, 0x22, 0x3a, 0x31, 0x7d]) },
    el('elements/character/list.json', [{ hidden: true }]),
    el('elements/character/n.json', { id: 'n', hidden: null }),
    el('elements/character/deep.json', { id: 'd', x_meta: { hidden: true } }),
    el('elements/character/sub/s.json', { id: 's', hidden: true }),
    el('elements/character/notes.txt', '{"hidden": true}'),
    el('media/m.json', { hidden: true }),
    el('records/lab/r.json', { hidden: true }),
  ];
  assert.deepEqual(kept(keep), { paths: keep.map(f => f.path).sort(), left: 0 });
});

test('§4.8: the report is not called on a refusal', () => {
  const reports = [];
  assert.throws(() => writeWorldFile([el('elements/character/a.json', { hidden: true })], 'w', { includeHidden: false, report: r => reports.push(r) }), (e) => e instanceof OwWorldFileError && e.reason === 'not_a_world');
  assert.deepEqual(reports, []);
});
