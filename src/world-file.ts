/**
 * The world file, `.owworld` (Folder Format spec §4.7; a `.zip` by another
 * name): one archive holding one whole world as a portable copy (§4.1), and
 * the reader that opens one back. Absorbed from Atlas's
 * `src/store/world-file.ts` (Temper's, Atlas 1.17), so Atlas, Lantern and any
 * script read one file the same way; brought to §4.7's checks OW-1 to OW-22
 * and their fixture set (OW Council #522).
 *
 * THE READER takes bytes and returns bytes: no DOM, `File` or file system, so
 * it runs in a browser and in Node alike. It reads the central directory
 * itself (zip64 included) and runs every check on names, kinds, methods and
 * sizes before it inflates anything. Each refusal names one cause
 * (`OwWorldFileReason`), checked in the reference checker's order:
 * - `not_openable`: not a zip, a spanned one, a broken entry or CRC.
 * - `unsafe_path` (OW-16, OW-19): a name that is not a plain relative path
 *   (`\`, an empty, `.` or `..` segment, absolute, a drive), or a path that is
 *   both a file and a folder.
 * - `link` (OW-20): a Unix mode that is not a regular file or a directory.
 * - `method` (OW-21): encrypted, or a method other than stored or deflate.
 * - `name` (OW-22): a Windows device name, a trailing dot or space, one of
 *   `<>:"|?*` or a control character, a non-ASCII name without the UTF-8 flag.
 * - `duplicate` (OW-17), `collision` (OW-18: NFC, then simple case folding,
 *   both Unicode 15.1's from its own files, never the runtime's).
 * - `too_many`, `too_big` (OW-14, OW-15): past the budget by count or declared
 *   size, or an entry that inflates past the size it declares.
 * - `marker` (OW-6): a root `mimetype` entry with other bytes than the media
 *   type. A marker is never required.
 * - `not_a_world`, `more_than_one` (OW-2, OW-3, OW-5): no world, two worlds, a
 *   second `world.json` inside the world (one under `records/` is a
 *   producer's data), a `world.json` that will not parse or has no string id.
 * Files beside the world's folder and archive junk (`__MACOSX`, `.DS_Store`,
 * `Thumbs.db`) are ignored (OW-4), still checked and counted.
 *
 * THE WRITER emits a portable copy (OW-7, OW-12, OW-13): the `mimetype` marker
 * first and stored, then only the folder's parts, every entry stamped
 * 1980-01-01 00:00, in the UTF-8 byte order of its name, JSON deflated and
 * everything else stored. `records/` travels whole and byte-exact, except the
 * producers `records/RECORDS.json` marks private, left out whole unless the
 * caller asks (OW-8, §4.5 rule 11). Element files marked hidden travel too,
 * unless the caller says the file is a share (`includeHidden: false`, §4.8).
 *
 * A tool's own `.<tool>/` folder is the tool's (spec §4): the reader returns
 * it like any file (a caller leaves files out with `skip`), and the writer
 * carries one it is handed, which makes the file a private copy (OW-7, OW-9).
 */

import { Inflate, inflateSync, zipSync, type Zippable } from 'fflate';
import { refuseUnknownOptions } from './options';
import { nfc } from './nfc';

const WORLD_FILE = 'world.json';
const MARKER_NAME = 'mimetype';

/** The `mimetype` marker's exact bytes (spec §4.7, OW-6): ASCII, no newline. */
export const WORLD_FILE_MEDIA_TYPE = 'application/vnd.onlyworlds.world+zip';

/** The budget, uncompressed: the floor every reader accepts (spec §4.7, OW-15). */
export const WORLD_FILE_MAX_BYTES = 2 * 1024 ** 3;
export const WORLD_FILE_MAX_ENTRIES = 500_000;

export type OwWorldFileReason =
  | 'unsafe_path'
  | 'too_big'
  | 'too_many'
  | 'not_a_world'
  | 'more_than_one'
  | 'not_openable'
  | 'duplicate'
  | 'collision'
  | 'link'
  | 'method'
  | 'name'
  | 'marker';

const MESSAGES: Record<OwWorldFileReason, string> = {
  unsafe_path: 'The world file holds a path that cannot be written safely.',
  too_big: 'The world file is bigger than the budget allows, or a file in it is bigger than it says.',
  too_many: 'The world file holds more files than the budget allows.',
  not_a_world: 'The file is not a world: it has no readable world.json with an id.',
  more_than_one: 'The file holds more than one world.',
  not_openable: 'The file is not a zip that can be read.',
  duplicate: 'The world file holds two entries with the same name.',
  collision: 'The world file holds two names that differ only in case or in how an accent is written.',
  link: 'The world file holds a link or a special file.',
  method: 'The world file holds an encrypted entry, or one compressed other than stored or deflate.',
  name: 'The world file holds a name that some disk cannot hold.',
  marker: 'The world file\'s mimetype entry is not the OnlyWorlds media type.',
};

/** A world file was refused; nothing was returned. `reason` says why, for a tool to word its own message. */
export class OwWorldFileError extends Error {
  readonly reason: OwWorldFileReason;
  constructor(reason: OwWorldFileReason, message: string = MESSAGES[reason]) {
    super(message);
    this.name = 'OwWorldFileError';
    this.reason = reason;
  }
}

export interface OwWorldFileEntry {
  /** Relative to the world's folder, `/`-separated. */
  path: string;
  data: Uint8Array;
}

export interface OwReadWorldFile {
  worldId: string;
  /** `world.json`'s `name` as the file has it; `''` when it has none. */
  name: string;
  /** `world.json`, parsed, without `api`. */
  world: Record<string, unknown>;
  /** The world's files, relative to its folder, `world.json` included (without `api`), in code point order. */
  files: OwWorldFileEntry[];
}

export interface OwReadWorldFileOptions {
  maxBytes?: number;
  maxEntries?: number;
  /** Leave a file out of `files` (a path relative to the world's folder). It is still checked and counted. */
  skip?: (path: string) => boolean;
}

/** Every key `readWorldFile`'s options take; any other is refused by name, never dropped (`maxbytes` would read with the 2 GiB budget). */
const READ_OPTION_KEYS: readonly (keyof OwReadWorldFileOptions)[] = ['maxBytes', 'maxEntries', 'skip'];

const refuse = (reason: OwWorldFileReason, message?: string): never => {
  throw new OwWorldFileError(reason, message);
};

// --- names ------------------------------------------------------------------

/** OW-16, strict: why a name is not a plain relative path, or null. */
function pathFault(name: string): string | null {
  if (name.includes('\\')) return 'holds a backslash';
  if (name.startsWith('/')) return 'is absolute';
  if (/^[A-Za-z]:/.test(name)) return 'names a drive';
  if (name.split('/').some(seg => seg === '' || seg === '.' || seg === '..')) return 'has an empty, . or .. segment';
  return null;
}

const RESERVED = new Set(['CON', 'PRN', 'AUX', 'NUL',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(i => [`COM${i}`, `LPT${i}`])]);
const BAD_CHAR = /[<>:"|?*\p{Cc}]/u;

/** OW-22: why a name would not land on every disk, or null. */
function nameFault(name: string): string | null {
  for (const seg of name.split('/')) {
    if (BAD_CHAR.test(seg)) return `segment ${JSON.stringify(seg)} holds a reserved or control character`;
    if (seg.endsWith('.') || seg.endsWith(' ')) return `segment ${JSON.stringify(seg)} ends in a dot or a space`;
    if (RESERVED.has(seg.split('.')[0].toUpperCase())) return `segment ${JSON.stringify(seg)} is a Windows device name`;
  }
  return null;
}

/** Archive junk a re-zipped folder picks up on the way: never part of a world. */
function isJunk(path: string): boolean {
  return path.split('/').some(seg => seg === '__MACOSX' || seg === '.DS_Store' || seg === 'Thumbs.db');
}

/**
 * Unicode's simple case folding as the table says it: the C and S rows of
 * CaseFolding.txt at Unicode 15.1 (Skeld's ruling for OW-18, OW Council
 * #9830), never a runtime's casing, so a fold a newer Unicode adds stays out
 * until the pin moves. Runs of `start.count.stride.delta` in base 36 (an empty
 * count or stride is 1), made by `codegen/fold_runs.mjs` from
 * the schema dist's `fixtures/owworld/CaseFolding-15.1.0.txt` (vendored under
 * `codegen/schema-dist/`); the test walks every row of that file.
 */
const FOLD_RUNS =
  '1t.q..w,51...lj,5c.n..w,60.7..w,74.o.2.1,8i.3.2.1,8p.8.2.1,96.n.2.1,ag...-3d,ah.3.2.1,an...-7g,ap...5u,' +
  'aq.2.2.1,au...5q,av...1,ax.2..5p,az...1,b2...27,b3...5m,b4...5n,b5...1,b7...5p,b8...5r,ba...5v,bb...5t,' +
  'bc...1,bg...5v,bh...5x,bj...5y,bk.3.2.1,bq...62,br...1,bt...62,bw...1,by...62,bz...1,c1.2..61,c3.2.2.1,' +
  'c7...63,c8...1,cc...1,ck...2,cl...1,cn...2,co...1,cq...2,cr.9.2.1,da.9.2.1,dt...2,du.2.2.1,dy...-2p,' +
  'dz...-1k,e0.k.2.1,f4...-3m,f6.9.2.1,fu...8bv,fv...1,fx...-4j,fy...8bs,g1...1,g3...-5f,g4...1x,g5...1z,' +
  'g6.5.2.1,n9...38,og.2.2.1,om...1,ov...38,p2...12,p4.3..11,p8...1s,pa.2..1r,pd.h..w,pv.9..w,qq...1,' +
  'r3...8,r4...-u,r5...-p,r9...-f,ra...-m,rc.c.2.1,s0...-1i,s1...-1c,s4...-1o,s5...-1s,s7...1,s9...-7,' +
  'sa...1,sd.3..-3m,sg.g..28,sw.w..w,v4.h.2.1,wa.r.2.1,xs...f,xt.7.2.1,y8.1c.2.1,10x.12..1c,3a8.12..5ls,' +
  '3bb...5ls,3bh...5ls,3y0.6..-8,5mo...-4su,5mp...-4st,5mq...-4sk,5mr.2..-4si,5mt...-4sj,5mu...-4sc,' +
  '5mv...-4ro,5mw...r7n,5n4.17..-2bk,5od.3..-2bk,5xc.23.2.1,61n...-1m,61q...-5vj,61s.1c.2.1,64o.8..-8,' +
  '654.6..-8,65k.8..-8,660.8..-8,66g.6..-8,66x.4.2.-8,67c.8..-8,688.8..-8,68o.8..-8,694.8..-8,69k.2..-8,' +
  '69m.2..-22,69o...-9,69q...-5j9,6a0.4..-2e,6a4...-9,6ab...-5kz,6ag.2..-8,6ai.2..-2s,6ar...-5kj,6aw.2..-8,' +
  '6ay.2..-34,6b0...-7,6bc.2..-3k,6be.2..-3i,6bg...-9,6jq...-5st,6ju...-6gv,6jv...-6di,6k2...s,6lc.g..g,' +
  '6mb...1,792.q..q,8ow.1c..1c,8rk...1,8rm...-8af,8rn...-2xy,8ro...-89z,8rr.3.2.1,8rx...-8bg,8ry...-8al,' +
  '8rz...-8bj,8s0...-8bi,8s2...1,8s5...1,8se.2..-8cf,8sg.1e.2.1,8vf.2.2.1,8vm...1,wu8.n.2.1,ww0.e.2.1,' +
  'x0i.7.2.1,x0y.v.2.1,x2x.2.2.1,x31...-r9g,x32.5.2.1,x3f...1,x3h...-wmg,x3k.2.2.1,x3q.a.2.1,x4a...-wn8,' +
  'x4b...-wnj,x4c...-wnf,x4d...-wn5,x4e...-wn8,x4g...-wlu,x4h...-wmi,x4i...-wlx,x4j...ps,x4k.8.2.1,' +
  'x50...-1c,x51...-wn7,x52...-raw,x53.2.2.1,x5c...1,x5i.2.2.1,x6d...1,xv4.28..-tzk,1dl1...1,1ee9.q..w,' +
  '1fcw.14..14,1fhs.10..14,1fn4.b..13,1fng.f..13,1fnw.7..13,1fo4.2..13,1h1c.1f..1s,1jfk.w..w,20cg.w..w,' +
  '2olc.y..y';

let foldTable: Map<number, number> | null = null;

/**
 * Simple case folding (Unicode 15.1, CaseFolding.txt C and S), code point by
 * code point: what OW-18 applies after NFC. A code point the table does not
 * map folds to itself.
 */
export function simpleCaseFold(text: string): string {
  if (!foldTable) {
    foldTable = new Map();
    for (const run of FOLD_RUNS.split(',')) {
      const [start, count, stride, delta] = run.split('.');
      const s = parseInt(start, 36);
      const n = count ? parseInt(count, 36) : 1;
      const step = stride ? parseInt(stride, 36) : 1;
      const d = parseInt(delta, 36);
      for (let k = 0; k < n; k++) foldTable.set(s + k * step, s + k * step + d);
    }
  }
  let out = '';
  for (const c of text) {
    const to = foldTable.get(c.codePointAt(0)!);
    out += to === undefined ? c : String.fromCodePoint(to);
  }
  return out;
}

/**
 * OW-18's one fold for every reader: NFC, then simple case folding, both at
 * Unicode 15.1 from its own files (`nfc`, `simpleCaseFold`). `/` folds to itself.
 */
function foldName(name: string): string {
  return simpleCaseFold(nfc(name));
}

/** Order by the UTF-8 bytes of the name, which is code point order (OW-13), never UTF-16 units. */
function byCodePoint(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(i)!;
    if (x !== y) return x - y;
    if (x > 0xffff) i++;
  }
  return a.length - b.length;
}

// --- the central directory ---------------------------------------------------

interface CdEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
  external: number;
  /** The name's bytes hold a byte past ASCII. */
  nonAscii: boolean;
  /** The UTF-8 flag is set and the name is not UTF-8. */
  badUtf8: boolean;
}

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const u64 = (b: Uint8Array, o: number): number => u32(b, o) + u32(b, o + 4) * 0x100000000;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;
const MAX32 = 0xffffffff;

const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = (b: Uint8Array): string => { let s = ''; for (const x of b) s += String.fromCharCode(x); return s; };

/** Every entry of the central directory, zip64 included, or `not_openable`. Inflates nothing. */
function centralDirectory(bytes: Uint8Array): CdEntry[] {
  const len = bytes.length;
  let end = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (u32(bytes, i) === SIG_END) { end = i; break; }
  }
  if (end < 0) refuse('not_openable', 'The file is not a zip: it has no end of central directory.');
  const thisDisk = u16(bytes, end + 4);
  const cdDisk = u16(bytes, end + 6);
  if (!((thisDisk === 0 && cdDisk === 0) || (thisDisk === 0xffff && cdDisk === 0xffff))) {
    refuse('not_openable', `The zip spans disks (its end record says disk ${thisDisk}, the directory on disk ${cdDisk}).`);
  }
  let cdSize = u32(bytes, end + 12);
  let cdOffset = u32(bytes, end + 16);
  const loc = end - 20;
  if (loc >= 0 && u32(bytes, loc) === SIG_LOCATOR64) {
    if (u32(bytes, loc + 4) !== 0 || u32(bytes, loc + 16) > 1) refuse('not_openable', 'The zip spans disks (zip64).');
    const rec = u64(bytes, loc + 8);
    if (rec + 56 > len || u32(bytes, rec) !== SIG_END64) refuse('not_openable', 'The zip64 end record is missing.');
    if (u32(bytes, rec + 16) !== 0 || u32(bytes, rec + 20) !== 0) refuse('not_openable', 'The zip spans disks (zip64).');
    cdSize = u64(bytes, rec + 40);
    cdOffset = u64(bytes, rec + 48);
  }
  const cdEnd = cdOffset + cdSize;
  if (cdEnd > len) refuse('not_openable', 'The central directory lies past the end of the file.');
  const out: CdEntry[] = [];
  let p = cdOffset;
  while (p < cdEnd) {
    if (p + 46 > cdEnd || u32(bytes, p) !== SIG_CENTRAL) refuse('not_openable', 'The central directory is broken.');
    const flags = u16(bytes, p + 8);
    const nlen = u16(bytes, p + 28);
    const elen = u16(bytes, p + 30);
    const clen = u16(bytes, p + 32);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nlen);
    const extra = bytes.subarray(p + 46 + nlen, p + 46 + nlen + elen);
    let usize = u32(bytes, p + 24);
    let csize = u32(bytes, p + 20);
    let offset = u32(bytes, p + 42);
    if (usize === MAX32 || csize === MAX32 || offset === MAX32) {
      for (let q = 0; q + 4 <= extra.length; q += 4 + u16(extra, q + 2)) {
        if (u16(extra, q) !== 0x0001) continue;
        let r = q + 4;
        const stop = r + u16(extra, q + 2);
        const next = (): number => {
          if (r + 8 > stop) refuse('not_openable', 'A zip64 extra field is short.');
          const v = u64(extra, r);
          r += 8;
          return v;
        };
        if (usize === MAX32) usize = next();
        if (csize === MAX32) csize = next();
        if (offset === MAX32) offset = next();
        break;
      }
    }
    const nonAscii = nameBytes.some(x => x > 0x7f);
    let name: string;
    let badUtf8 = false;
    if (flags & 0x0800) {
      try { name = utf8.decode(nameBytes); } catch { name = latin1(nameBytes); badUtf8 = true; }
    } else {
      name = latin1(nameBytes);
    }
    out.push({
      name, flags, method: u16(bytes, p + 10), crc: u32(bytes, p + 16), csize, usize, offset,
      external: u32(bytes, p + 38), nonAscii, badUtf8,
    });
    p += 46 + nlen + elen + clen;
  }
  if (p !== cdEnd) refuse('not_openable', 'The central directory is broken.');
  return out;
}

// --- inflating ---------------------------------------------------------------

let crcTable: Int32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** A deflate input this long or shorter inflates whole (deflate stops near 1032:1); longer streams in chunks. */
const CHUNK = 64 * 1024;

/** An entry's bytes, never inflated much past the size it declares (OW-14's lying size). */
function inflateEntry(bytes: Uint8Array, e: CdEntry): Uint8Array {
  const off = e.offset;
  if (off + 30 > bytes.length || u32(bytes, off) !== SIG_LOCAL) refuse('not_openable', `${e.name}: no local header at its offset.`);
  const start = off + 30 + u16(bytes, off + 26) + u16(bytes, off + 28);
  const payload = bytes.subarray(start, start + e.csize);
  let data: Uint8Array;
  if (e.method === 0) {
    data = payload;
  } else if (payload.length <= CHUNK) {
    try { data = inflateSync(payload); } catch { return refuse('not_openable', `${e.name}: its deflate stream is broken.`); }
  } else {
    const out = new Uint8Array(e.usize);
    let n = 0;
    let over = false;
    const inf = new Inflate((chunk) => {
      if (n + chunk.length > e.usize) { over = true; throw new Error('past its size'); }
      out.set(chunk, n);
      n += chunk.length;
    });
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const stop = Math.min(i + CHUNK, payload.length);
        inf.push(payload.subarray(i, stop), stop === payload.length);
      }
    } catch {
      if (!over) refuse('not_openable', `${e.name}: its deflate stream is broken.`);
    }
    data = over ? new Uint8Array(e.usize + 1) : out.subarray(0, n);
  }
  if (data.length > e.usize) refuse('too_big', `${e.name} holds more than the ${e.usize} bytes it declares.`);
  if (data.length !== e.usize) refuse('not_openable', `${e.name} holds ${data.length} bytes and declares ${e.usize}.`);
  if (crc32(data) !== e.crc) refuse('not_openable', `${e.name} fails its CRC.`);
  // A stored entry is a view of the archive: hand back its own bytes, never the caller's buffer.
  return e.method === 0 ? data.slice() : data;
}

// --- the world ---------------------------------------------------------------

function parseWorld(data: Uint8Array): Record<string, unknown> {
  let meta: unknown;
  try {
    meta = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new OwWorldFileError('not_a_world');
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new OwWorldFileError('not_a_world');
  const id = (meta as { id?: unknown }).id;
  if (typeof id !== 'string' || !id.trim()) throw new OwWorldFileError('not_a_world');
  return meta as Record<string, unknown>;
}

/** `world.json` without its `api` block: the link and its key never travel. Untouched bytes when there is none. */
function withoutLink(data: Uint8Array, meta: Record<string, unknown>): { data: Uint8Array; world: Record<string, unknown> } {
  if (!('api' in meta)) return { data, world: meta };
  const { api: _link, ...rest } = meta;
  return { data: new TextEncoder().encode(JSON.stringify(rest, null, 2) + '\n'), world: rest };
}

/** OW-18 over every name and every folder a name implies: two that fold to one refuse. */
function checkCollisions(names: Iterable<string>): void {
  const byFold = new Map<string, string>();
  const segFold = new Map<string, string>();
  const done = new Set<string>();
  for (const raw of names) {
    const segs = (raw.endsWith('/') ? raw.slice(0, -1) : raw).split('/');
    let prefix = '';
    let folded = '';
    for (let i = 0; i < segs.length; i++) {
      let f = segFold.get(segs[i]);
      if (f === undefined) { f = foldName(segs[i]); segFold.set(segs[i], f); }
      prefix = i ? `${prefix}/${segs[i]}` : segs[i];
      folded = i ? `${folded}/${f}` : f;
      if (done.has(prefix)) continue;
      done.add(prefix);
      const other = byFold.get(folded);
      if (other !== undefined) {
        refuse('collision', `The names ${JSON.stringify(other)} and ${JSON.stringify(prefix)} are one name after NFC and case folding.`);
      }
      byFold.set(folded, prefix);
    }
  }
}

/** OW-19: a path that is a file and also a folder of another file cannot land on a disk. */
function checkFileAndFolder(files: Set<string>): void {
  const seen = new Set<string>();
  for (const n of files) {
    const segs = n.split('/');
    let prefix = '';
    for (let i = 0; i < segs.length - 1; i++) {
      prefix = i ? `${prefix}/${segs[i]}` : segs[i];
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      if (files.has(prefix)) refuse('unsafe_path', `${JSON.stringify(prefix)} is a file and a folder.`);
    }
  }
}

/**
 * Read a world file. Throws `OwWorldFileError` saying why, having returned
 * nothing; the caller writes only what this returns. An unknown option is a
 * `TypeError` before the bytes are looked at.
 */
export function readWorldFile(bytes: Uint8Array, opts: OwReadWorldFileOptions = {}): OwReadWorldFile {
  refuseUnknownOptions('readWorldFile', opts, READ_OPTION_KEYS, 'Nothing was read.');
  const maxBytes = opts.maxBytes ?? WORLD_FILE_MAX_BYTES;
  const maxEntries = opts.maxEntries ?? WORLD_FILE_MAX_ENTRIES;
  const entries = centralDirectory(bytes);

  // Every entry from the central directory alone, before anything is inflated.
  const seen = new Set<string>();
  const files: CdEntry[] = [];
  let declared = 0;
  for (const e of entries) {
    const name = e.name;
    const isDir = name.endsWith('/');
    const bare = isDir ? name.slice(0, -1) : name;
    const quoted = JSON.stringify(name);
    const fault = pathFault(bare);
    if (fault) refuse('unsafe_path', `The entry ${quoted} ${fault}.`);
    const kind = (e.external >>> 16) & 0o170000;
    if (kind !== 0 && kind !== 0o100000 && kind !== 0o040000) refuse('link', `The entry ${quoted} is a link or a special file.`);
    if (e.flags & 0x0041) refuse('method', `The entry ${quoted} is encrypted.`);
    if (e.method !== 0 && e.method !== 8) refuse('method', `The entry ${quoted} uses method ${e.method} (only stored and deflate).`);
    if (e.badUtf8) refuse('name', `The entry ${quoted} is flagged UTF-8 and is not.`);
    if (e.nonAscii && !(e.flags & 0x0800)) refuse('name', `The entry ${quoted} is not ASCII and lacks the UTF-8 flag.`);
    const bad = nameFault(bare);
    if (bad) refuse('name', `The entry ${quoted}: ${bad}.`);
    if (seen.has(name)) refuse('duplicate', `The entry ${quoted} appears twice.`);
    seen.add(name);
    if (isDir) continue;
    files.push(e);
    if (files.length > maxEntries) refuse('too_many', `The world file holds more than ${maxEntries} files.`);
    declared += e.usize;
    if (declared > maxBytes) refuse('too_big', `The world file declares more than ${maxBytes} bytes.`);
  }
  checkCollisions(seen);
  const names = new Set(files.map(e => e.name));
  checkFileAndFolder(names);

  // OW-6: a marker is never required; one with other bytes refuses. Its shape is the writer's.
  const marker = files.find(e => e.name === MARKER_NAME);
  // Bytes, never decoded text: TextDecoder's default strips a byte order mark, and a BOM is other bytes (OW-6).
  if (marker && new TextDecoder('utf-8', { ignoreBOM: true }).decode(inflateEntry(bytes, marker)) !== WORLD_FILE_MEDIA_TYPE) {
    refuse('marker', 'The mimetype entry holds other bytes than the OnlyWorlds media type.');
  }

  // Exactly one world (OW-2); what sits beside its folder is ignored (OW-4), a dot-folder is never a world.
  const candidates = [...names].filter(n => n !== MARKER_NAME && !isJunk(n));
  let prefix: string;
  if (candidates.includes(WORLD_FILE)) {
    prefix = '';
  } else {
    const roots = new Set(candidates
      .filter(n => n.split('/').length === 2 && n.endsWith(`/${WORLD_FILE}`) && !n.startsWith('.'))
      .map(n => n.slice(0, -WORLD_FILE.length)));
    if (roots.size === 0) refuse('not_a_world', 'There is no world.json at the root or in one top-level folder.');
    if (roots.size > 1) refuse('more_than_one', `The file holds worlds in ${[...roots].join(', ')}.`);
    prefix = [...roots][0];
  }
  // OW-5: no world.json inside the world but its own, except a producer's under records/.
  const inside = new Set(candidates.filter(n => n.startsWith(prefix)));
  for (const n of inside) {
    const rel = n.slice(prefix.length);
    if (rel !== WORLD_FILE && rel.endsWith(`/${WORLD_FILE}`) && !rel.startsWith('records/')) {
      refuse('more_than_one', `A second world.json sits inside the world: ${n}.`);
    }
  }

  // Every entry inflated within what it declares (OW-14), kept only when it is the world's.
  const content = new Map<string, Uint8Array>();
  for (const e of files) {
    const data = inflateEntry(bytes, e);
    if (inside.has(e.name)) content.set(e.name, data);
  }
  const worldName = `${prefix}${WORLD_FILE}`;
  const parsed = withoutLink(content.get(worldName)!, parseWorld(content.get(worldName)!));
  const out: OwWorldFileEntry[] = [];
  for (const [n, data] of content) {
    const path = n.slice(prefix.length);
    if (opts.skip?.(path)) continue;
    out.push({ path, data: n === worldName ? parsed.data : data });
  }
  out.sort((a, b) => byCodePoint(a.path, b.path));
  const name = parsed.world.name;
  return {
    worldId: parsed.world.id as string,
    name: typeof name === 'string' ? name : '',
    world: parsed.world,
    files: out,
  };
}

// --- the writer --------------------------------------------------------------

/** The folder's parts, the only things a portable copy holds (spec §4.7, OW-7). */
const PARTS = new Set(['elements', 'spatial', 'media', 'records']);

/**
 * Whether a path belongs in the copy: `world.json`, a part (no dot-names or
 * `.meta` in a content folder; `records/` whole), or a tool's dot-folder the
 * caller handed over, which makes the file a private copy.
 */
function carried(path: string): boolean {
  if (path === WORLD_FILE) return true;
  const segs = path.split('/');
  if (segs.length < 2) return false;
  if (segs[0].startsWith('.')) return true;
  if (!PARTS.has(segs[0])) return false;
  if (segs[0] === 'records') return true;
  return !segs.some(s => s.startsWith('.')) && !path.endsWith('.meta');
}

/** 1980-01-01 00:00 in the DOS fields (fflate reads the local clock's parts): one input, one set of bytes (OW-12). */
const STAMP = new Date(1980, 0, 1, 0, 0, 0);

export interface OwWriteWorldFileOptions {
  /**
   * Carry the producers marked private in `records/RECORDS.json` (spec §4.5
   * rule 11, OW-8). Left out or false, their directories are left out whole.
   */
  includePrivateRecords?: boolean;
  /**
   * Carry element files marked hidden (spec §4.8). Left out or true, they
   * travel byte for byte: a world file is a copy. Pass false when the file is
   * a share, made to hand to someone else: then every element file whose JSON
   * carries the hidden mark is left out whole, and `report` counts them. The
   * default is the opposite of `includePrivateRecords`'s on purpose.
   */
  includeHidden?: boolean;
  /** Called once with what the write left out, after the archive is made and before it is returned; never on a refusal. */
  report?: (report: OwWriteWorldFileReport) => void;
}

/** What `writeWorldFile` left out, handed to its `report` option. */
export interface OwWriteWorldFileReport {
  /** Element files left out for the hidden mark (`includeHidden: false`); 0 otherwise. */
  hiddenLeftOut: number;
}

/** Every key `writeWorldFile`'s options take; any other is refused by name, never dropped. A new option joins this list in the same commit. */
const WRITE_OPTION_KEYS: readonly (keyof OwWriteWorldFileOptions)[] = ['includePrivateRecords', 'includeHidden', 'report'];

const RECORDS_MANIFEST = 'records/RECORDS.json';

interface WriteOptions {
  includePrivate: boolean;
  includeHidden: boolean;
  report?: (report: OwWriteWorldFileReport) => void;
}

/** The caller's options, read; refuses an unknown key, a flag that is not a boolean or a `report` that is not a function, before anything else. */
function writeOptions(opts: unknown): WriteOptions {
  if (opts === undefined || opts === null) return { includePrivate: false, includeHidden: true };
  if (typeof opts !== 'object') throw new TypeError(`writeWorldFile: options must be an object, such as { includePrivateRecords: true }. Nothing was written.`);
  refuseUnknownOptions('writeWorldFile', opts, WRITE_OPTION_KEYS, 'Nothing was written.');
  const o = opts as OwWriteWorldFileOptions;
  for (const key of ['includePrivateRecords', 'includeHidden'] as const) {
    const asked = o[key];
    if (asked !== undefined && typeof asked !== 'boolean') {
      throw new TypeError(`writeWorldFile: ${key} must be true or false; got ${JSON.stringify(asked) ?? String(asked)}. Nothing was written.`);
    }
  }
  if (o.report !== undefined && typeof o.report !== 'function') {
    throw new TypeError(`writeWorldFile: report must be a function; got ${JSON.stringify(o.report) ?? String(o.report)}. Nothing was written.`);
  }
  return { includePrivate: o.includePrivateRecords === true, includeHidden: o.includeHidden !== false, report: o.report };
}

/**
 * Whether a file is an element file carrying the hidden mark (spec §4.8): a
 * `.json` file directly in a type folder of `elements/` or the legacy
 * `spatial/`, whose JSON is an object with a top-level `hidden` that is
 * present and neither `null` nor `false` (a doubtful value, `"true"` or 1,
 * counts as marked: a share leaves a doubt out rather than handing it on, as
 * the Python package's `is_hidden` does). A file that is not UTF-8 JSON, or
 * not an object, is no element and is kept.
 */
function isHiddenElement(f: OwWorldFileEntry): boolean {
  const segs = f.path.split('/');
  if (segs.length !== 3 || (segs[0] !== 'elements' && segs[0] !== 'spatial') || !/\.json$/i.test(segs[2])) return false;
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(f.data));
  } catch {
    return false;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const mark = (doc as { hidden?: unknown }).hidden;
  return mark !== undefined && mark !== null && mark !== false;
}

/**
 * The producers `records/RECORDS.json` marks private (`"private": true`, the
 * boolean only), or none when there is no manifest. A manifest that is not a
 * JSON array of entries, or a private entry whose `producer` is not a name, is
 * refused: which records are private cannot be read, and none is left out by
 * guess (OW-8).
 */
function privateProducers(files: OwWorldFileEntry[]): string[] {
  const manifest = files.find(f => f.path === RECORDS_MANIFEST);
  if (!manifest) return [];
  const unreadable = (why: string): never => {
    throw new TypeError(`writeWorldFile: ${RECORDS_MANIFEST} ${why}, so which records are private cannot be read and none is left out by guess (spec §4.7, OW-8). Fix the manifest, or pass { includePrivateRecords: true } to carry every record. Nothing was written.`);
  };
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest.data));
  } catch {
    unreadable('is not JSON');
  }
  if (!Array.isArray(doc)) unreadable('is not a JSON array of entries');
  const out: string[] = [];
  for (const entry of doc as unknown[]) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) unreadable('holds an entry that is not an object');
    const { producer, private: isPrivate } = entry as { producer?: unknown; private?: unknown };
    if (isPrivate !== true) continue;
    if (typeof producer !== 'string' || producer === '') unreadable('marks an entry private without a producer name');
    out.push(producer as string);
  }
  return out;
}

/**
 * Write a world file under one top-level folder `topDir`: the `mimetype`
 * marker first and stored, then `world.json` (without `api`) and the folder's
 * parts, in UTF-8 byte order, every entry stamped 1980-01-01 00:00, JSON
 * deflated and everything else stored (spec §4.7, OW-6, OW-7, OW-12, OW-13).
 * Any other file is left out. A tool's dot-folder in `files` travels, and
 * makes the result a private copy, not a portable `.owworld` (OW-7): leave it
 * out of `files` for a portable one.
 *
 * `records/` travels byte-exact, except private records (OW-8, spec §4.5 rule
 * 11): every `records/<producer>/` whose entry in `records/RECORDS.json` says
 * `"private": true` (the boolean; `"true"` is not private; the name matched by
 * OW-18's fold, so `Fold` names `records/fold/`) is left out whole,
 * and `RECORDS.json` itself travels byte-exact, its private entries kept, so a
 * reader learns a producer was left out. Pass `{ includePrivateRecords: true }`
 * to carry them; then the manifest is not read and every record travels. No
 * manifest, nothing is private.
 *
 * Element files marked hidden (spec §4.8) travel byte for byte by default: a
 * world file is a copy, also of a person's own world. A share is the offering
 * tool's question: pass `{ includeHidden: false }` for a file made to hand to
 * someone else, and every element file under `elements/<type>/` or
 * `spatial/<type>/` whose JSON carries a top-level `hidden` (anything but
 * absent, `null` or `false`) is left out whole. A file there that is not
 * JSON is kept. Nothing else is rewritten: a visible element's link to a
 * hidden one keeps its id, which then names no file. Pass
 * `report: r => …` to learn `r.hiddenLeftOut`, the count left out.
 *
 * Throws a `TypeError`, having written nothing, for an unknown option, an
 * `includePrivateRecords` or `includeHidden` that is not a boolean, a
 * `report` that is not a function, and (unless private records
 * are asked for) a `RECORDS.json` that is not a JSON array of objects or that
 * marks an entry private without a producer name. Refuses (`OwWorldFileError`)
 * an unsafe path or `topDir`, a duplicate path, a name some disk cannot hold,
 * two names that fold to one, and a world.json that is missing, will not parse
 * (it may hold a key, so it is never zipped raw) or has no `id`.
 */
export function writeWorldFile(files: OwWorldFileEntry[], topDir: string, opts: OwWriteWorldFileOptions = {}): Uint8Array {
  const { includePrivate, includeHidden, report } = writeOptions(opts);
  if (pathFault(topDir) || topDir.includes('/')) throw new OwWorldFileError('unsafe_path');
  const seen = new Set<string>();
  for (const f of files) {
    if (pathFault(f.path)) throw new OwWorldFileError('unsafe_path');
    if (seen.has(f.path)) throw new OwWorldFileError('unsafe_path', `The path ${f.path} is listed twice.`);
    seen.add(f.path);
  }
  // Matched by OW-18's fold, not exactly: on a disk that ignores case, a manifest's `Fold`
  // names the directory `fold`, and an exact match would let its private records travel.
  const left = new Set(includePrivate ? [] : privateProducers(files).map(foldName));
  const inPrivate = (path: string): boolean => {
    const segs = path.split('/');
    return segs.length > 2 && segs[0] === 'records' && left.has(foldName(segs[1]));
  };
  let hiddenLeftOut = 0;
  const kept = files.filter(f => {
    if (!carried(f.path) || inPrivate(f.path)) return false;
    if (!includeHidden && isHiddenElement(f)) { hiddenLeftOut++; return false; }
    return true;
  });
  if (!kept.some(f => f.path === WORLD_FILE)) throw new OwWorldFileError('not_a_world');
  const keys = kept.map(f => `${topDir}/${f.path}`);
  for (const key of keys) {
    const bad = nameFault(key);
    if (bad) throw new OwWorldFileError('name', `The path ${key}: ${bad}.`);
  }
  checkCollisions([MARKER_NAME, ...keys]);
  checkFileAndFolder(new Set([MARKER_NAME, ...keys]));

  const input: Zippable = {
    [MARKER_NAME]: [new TextEncoder().encode(WORLD_FILE_MEDIA_TYPE), { level: 0, mtime: STAMP }],
  };
  for (const f of [...kept].sort((a, b) => byCodePoint(a.path, b.path))) {
    let data = f.data;
    if (f.path === WORLD_FILE) data = withoutLink(data, parseWorld(data)).data;
    input[`${topDir}/${f.path}`] = [data, { level: /\.json$/i.test(f.path) ? 6 : 0, mtime: STAMP }];
  }
  const zip = zipSync(input);
  report?.({ hiddenLeftOut });
  return zip;
}
