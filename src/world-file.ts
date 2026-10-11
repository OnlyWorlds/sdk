/**
 * The world file: one `.zip` holding one whole world as a portable copy
 * (Folder Format spec §4.1, "a portable copy"), and the reader that opens one
 * back. Absorbed from Atlas's `src/store/world-file.ts` (Temper's, Atlas
 * 1.17), so Atlas, Lantern and any script read one file the same way.
 *
 * THE FILE: one top-level folder holding every file of the world as it sits
 * on disk, except the OnlyWorlds link and its key (`world.json` without `api`).
 * JSON is deflated, everything else stored. A world.json at the root, with no
 * folder, reads the same.
 *
 * THE READER takes bytes and returns bytes: no DOM, `File` or file system, so
 * it runs in a browser and in Node alike. It refuses, before returning
 * anything: a path that climbs out, is absolute, names a drive, holds a
 * backslash or an empty part, or is both a file and a folder; a declared size
 * or a file count past the budget (and the inflated bytes are counted again,
 * since a declared size can lie); no world, more than one world, files
 * outside the world's folder, a world.json nested inside the world; and a
 * world.json that will not parse or has no string `id`. Archive junk
 * (`__MACOSX`, `.DS_Store`, `Thumbs.db`) is dropped.
 *
 * A tool's own `.<tool>/` folder is the tool's (spec §4): this module knows
 * none of them. A caller that leaves some of its files out passes `skip`.
 */

import { unzipSync, zipSync, type Unzipped, type Zippable } from 'fflate';

const WORLD_FILE = 'world.json';

/** What one world file may hold, uncompressed: Atlas's budget, the writer's and the reader's alike. */
export const WORLD_FILE_MAX_BYTES = 1024 ** 3;
export const WORLD_FILE_MAX_ENTRIES = 200_000;

export type OwWorldFileReason =
  | 'unsafe_path'
  | 'too_big'
  | 'too_many'
  | 'not_a_world'
  | 'more_than_one'
  | 'not_openable';

const MESSAGES: Record<OwWorldFileReason, string> = {
  unsafe_path: 'The world file holds a path that cannot be written safely.',
  too_big: 'The world file is bigger than the budget allows.',
  too_many: 'The world file holds more files than the budget allows.',
  not_a_world: 'The file is not a world: it has no readable world.json with an id.',
  more_than_one: 'The file holds more than one world, or files outside the world\'s folder.',
  not_openable: 'The file is not a zip that can be read.',
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
  /** The world's files, relative to its folder, `world.json` included (without `api`), sorted by path. */
  files: OwWorldFileEntry[];
}

export interface OwReadWorldFileOptions {
  maxBytes?: number;
  maxEntries?: number;
  /** Leave a file out of `files` (a path relative to the world's folder). It still counts against the budget. */
  skip?: (path: string) => boolean;
}

function isSafePath(path: string): boolean {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

/** Archive junk a re-zipped folder picks up on the way: never part of a world. */
function isJunk(path: string): boolean {
  return path.split('/').some(seg => seg === '__MACOSX' || seg === '.DS_Store' || seg === 'Thumbs.db');
}

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

/**
 * Read a world file. Throws `OwWorldFileError` saying why, having returned
 * nothing; the caller writes only what this returns.
 */
export function readWorldFile(bytes: Uint8Array, opts: OwReadWorldFileOptions = {}): OwReadWorldFile {
  const maxBytes = opts.maxBytes ?? WORLD_FILE_MAX_BYTES;
  const maxEntries = opts.maxEntries ?? WORLD_FILE_MAX_ENTRIES;
  let declared = 0;
  let count = 0;
  let refusal: OwWorldFileReason | null = null;
  let raw: Unzipped;
  try {
    raw = unzipSync(bytes, {
      filter: file => {
        if (refusal) return false;
        if (file.name.endsWith('/')) return false; // a directory entry
        if (!isSafePath(file.name)) { refusal = 'unsafe_path'; return false; }
        if (isJunk(file.name)) return false;
        count++;
        declared += file.originalSize;
        if (count > maxEntries) { refusal = 'too_many'; return false; }
        if (declared > maxBytes) { refusal = 'too_big'; return false; }
        return true;
      },
    });
  } catch {
    throw new OwWorldFileError(refusal ?? 'not_openable');
  }
  if (refusal) throw new OwWorldFileError(refusal);
  const names = Object.keys(raw);
  // A declared size can lie; the inflated bytes cannot.
  if (names.reduce((n, k) => n + raw[k].length, 0) > maxBytes) throw new OwWorldFileError('too_big');
  // A path that is a file and also a folder of another path cannot both land on a disk.
  const nameSet = new Set(names);
  for (const n of names) {
    const segs = n.split('/');
    for (let i = 1; i < segs.length; i++) {
      if (nameSet.has(segs.slice(0, i).join('/'))) throw new OwWorldFileError('unsafe_path');
    }
  }

  // Exactly one world: world.json at the root, or in the one top-level folder,
  // and no other world.json anywhere inside it.
  let prefix: string;
  if (nameSet.has(WORLD_FILE)) {
    prefix = '';
  } else {
    const tops = new Set(names.map(n => (n.includes('/') ? n.split('/')[0] + '/' : n)));
    const worldTops = [...tops].filter(t => t.endsWith('/') && nameSet.has(`${t}${WORLD_FILE}`));
    if (worldTops.length === 0) throw new OwWorldFileError('not_a_world');
    if (worldTops.length > 1 || tops.size > 1) throw new OwWorldFileError('more_than_one');
    prefix = worldTops[0];
  }
  const worldName = `${prefix}${WORLD_FILE}`;
  if (names.some(n => n !== worldName && n.endsWith(`/${WORLD_FILE}`))) throw new OwWorldFileError('more_than_one');

  const parsed = withoutLink(raw[worldName], parseWorld(raw[worldName]));
  const files: OwWorldFileEntry[] = [];
  for (const n of names) {
    const path = n.slice(prefix.length);
    if (opts.skip?.(path)) continue;
    files.push({ path, data: n === worldName ? parsed.data : raw[n] });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const name = parsed.world.name;
  return {
    worldId: parsed.world.id as string,
    name: typeof name === 'string' ? name : '',
    world: parsed.world,
    files,
  };
}

/**
 * Write a world file: every file under one top-level folder `topDir`, JSON
 * deflated, everything else stored, `world.json` without `api`. Refuses
 * (`OwWorldFileError`) an unsafe path or `topDir`, a duplicate path, and a
 * world.json that is missing, will not parse (it may hold a key, so it is
 * never zipped raw) or has no `id`.
 */
export function writeWorldFile(files: OwWorldFileEntry[], topDir: string): Uint8Array {
  if (!isSafePath(topDir) || topDir.includes('/')) throw new OwWorldFileError('unsafe_path');
  const input: Zippable = {};
  let sawWorld = false;
  for (const f of files) {
    if (!isSafePath(f.path)) throw new OwWorldFileError('unsafe_path');
    const key = `${topDir}/${f.path}`;
    if (key in input) throw new OwWorldFileError('unsafe_path', `The path ${f.path} is listed twice.`);
    let data = f.data;
    if (f.path === WORLD_FILE) {
      data = withoutLink(data, parseWorld(data)).data;
      sawWorld = true;
    }
    input[key] = [data, { level: /\.json$/i.test(f.path) ? 6 : 0 }];
  }
  if (!sawWorld) throw new OwWorldFileError('not_a_world');
  return zipSync(input);
}
