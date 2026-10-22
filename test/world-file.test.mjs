/**
 * The world file, `.owworld` (Folder Format §4.7; a portable copy, §4.1):
 * Atlas's reader cases, ported from Atlas's tests/unit/world-file.test.ts
 * (Temper's) onto the tool-neutral reader, the cases the move added (`skip`,
 * reason codes, a path that is both a file and a folder, the writer's
 * refusals), and §4.7's checks OW-1 to OW-22, each on bytes built here. The
 * last test runs the whole fixture set when it is on this machine.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, deflateSync, strToU8 } from 'fflate';
import {
  readWorldFile, writeWorldFile, OwWorldFileError, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_ENTRIES, WORLD_FILE_MEDIA_TYPE,
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
 * declared, crc, zip64 }` in the order given. `utf8` defaults to "the name is not ASCII". `mode` is a Unix mode in
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
    const payload = method === 8 ? deflateSync(data) : data;
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

test('OW-20: a link or a special file is refused; regular files and folders made on Unix are read', () => {
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

const FIXTURES = process.env.OW_OWWORLD_FIXTURES || 'C:/Users/Titus/Carrier/Armature/tools/owworld-fixtures/fixtures';
const haveSet = existsSync(join(FIXTURES, 'verdicts.json'));

test('the .owworld fixture set (§4.7): every verdict and every cause', {
  skip: haveSet ? false : `no fixture set at ${FIXTURES} (set OW_OWWORLD_FIXTURES to one)`,
}, () => {
  const doc = JSON.parse(readFileSync(join(FIXTURES, 'verdicts.json'), 'utf8'));
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
  assert.ok(run >= 74, `the set holds ${run} fixtures`);
  assert.deepEqual(verdictDiffs, [], 'verdict disagreements');
  assert.deepEqual(reasonDiffs, [], 'right verdict for another reason');
});
