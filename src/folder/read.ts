/**
 * A world folder read as the Folder Format reads one (spec §3, §4): `world.json`, and every
 * `*.json` directly under `elements/<type>/` for the 22 types, plus the legacy
 * `spatial/{map,pin,zone,marker}/`. Identity is the `id` in the file, never its name; a file whose
 * body declares one of the 22 types is that type wherever it sits (the directory decides whether a
 * file is found, the body what it is). `elements/` wins over `spatial/` on a shared id, and within
 * one layout the first path in code point order wins (§4). Two ids are the same id when they are
 * written the same: one UUID in capitals in one file and in lower case in another is two elements.
 * Names are read as written: the extension is `.json` in lower case and a type folder is the type
 * word in lower case, so `M.JSON` is skipped by name and `elements/Character/` is no type folder.
 * A file that does not parse, or has no
 * non-empty string `id`, is skipped and counted, never fatal. So is a file this reader cannot
 * hold as written: one nested more than 200 deep, or holding a number too large for a double,
 * which would otherwise be served as `null`. Dot-prefixed folders and files are never read.
 *
 * Module-internal: not in the package's exports.
 */

import { ELEMENT_TYPES, type ElementType } from '../v2/types.generated';
import { parseOutsideJson, type OutsideJsonFault } from '../outside-json';
import type { OwWorldFileEntry } from '../world-file';
import { nfc } from '../nfc';
import { simpleCaseFold } from '../case-fold';

const TYPES: ReadonlySet<string> = new Set(ELEMENT_TYPES);
const SPATIAL: ReadonlySet<string> = new Set(['map', 'pin', 'zone', 'marker']);

/**
 * Why a file under a type folder was not served as an element: it is no JSON (`not_json`), it is
 * nested more than 200 deep (`too_deep`), it holds a number too large for a double, which no
 * answer could carry as written (`number_out_of_range`), it has no non-empty string `id`
 * (`no_id`), an earlier file holds its id, written the same (`duplicate`), or its extension is
 * `.json` in another spelling, such as `.JSON`, which the format does not read (`extension`).
 */
export type OwFolderSkipReason = 'not_json' | 'too_deep' | 'number_out_of_range' | 'no_id' | 'duplicate' | 'extension';

/** Why a `world.json` that is there was not read for what its text holds: the three of `OwFolderSkipReason` that a text earns. */
export type OwFolderWorldFault = 'not_json' | 'too_deep' | 'number_out_of_range';

export interface OwFolderSkip {
  path: string;
  reason: OwFolderSkipReason;
  /** The id a `duplicate` carried (the element served under it came from an earlier file). */
  id?: string;
}

/** A file under a type folder that is served as an element: what it became. */
export interface OwFolderServed {
  path: string;
  /** The element's type: the one its body declares when that is one of the 22 slugs, else its folder's. */
  type: ElementType;
  /** The id as the file writes it. */
  id: string;
  /** The name as the file writes it, or null when the file holds no string name. */
  name: string | null;
}

/** What one read of the entries found: handed to `onRead` once, when the first request reads them. */
export interface OwFolderReadReport {
  /** `world.json` parsed with an id (false: every route answers 500, saying so). */
  world: boolean;
  /** How many elements are served (the length of `served`). */
  elements: number;
  /** Of those, how many came from the legacy `spatial/` layout. */
  legacy: number;
  /** Each file served as an element, in the order they were read: `elements/` first, then by path in code point order. */
  served: OwFolderServed[];
  /** The files under a type folder that are not served, each with why, in the order they were read. */
  skipped: OwFolderSkip[];
  /**
   * A fixed name the folder holds only in another case (`Elements/` and no `elements/`, `World.JSON` and no
   * `world.json`), as written beside the name the format wants, or null. When set, no world is served and
   * every route answers 500 with this cause (folder spec 4.8: never read as a world with no elements).
   */
  misnamed: { found: string; wanted: string } | null;
  /**
   * Only when a `world.json` is there and was not read for what its text holds: why (`too_deep` past 200 levels,
   * counted in its text; `not_json`; `number_out_of_range`). Every route's 500 then says so.
   */
  worldFault?: OwFolderWorldFault;
}

const FIXED_NAMES = [['world.json', false], ['elements', true], ['spatial', true]] as const;

/**
 * The first of the three fixed names (`world.json`, `elements/`, `spatial/`) that the paths hold only in
 * another case: the name as written and the name the format wants, or null. A name held as written is
 * never misnamed, whatever else sits beside it (two that fold to one are OW-18's, in a world file).
 * Names fold as OW-18 folds them, NFC and then simple case folding at Unicode 15.1, so `spatial/` written with a long s
 * (U+017F) first is `spatial/` in another case, as a world file's collision check reads it.
 */
export function misnamedFixedName(paths: readonly string[]): { found: string; wanted: string } | null {
  const firsts = new Map<string, boolean>();
  for (const p of paths) {
    const slash = p.indexOf('/');
    const first = slash < 0 ? p : p.slice(0, slash);
    firsts.set(first, (firsts.get(first) ?? false) || slash >= 0);
  }
  for (const [name, isFolder] of FIXED_NAMES) {
    if (firsts.get(name) === isFolder) continue;
    for (const [first, folder] of firsts) {
      if (folder === isFolder && first !== name && simpleCaseFold(nfc(first)) === name) {
        return { found: isFolder ? `${first}/` : first, wanted: isFolder ? `${name}/` : name };
      }
    }
  }
  return null;
}

export interface FolderElement {
  type: ElementType;
  /** The id as the file writes it. */
  id: string;
  /**
   * The id as a UUID compares it (lower case, hyphenated), or null when the id is no UUID. What a
   * request finds an element by, as the API does; never what makes two files one element.
   */
  key: string | null;
  body: Record<string, unknown>;
  path: string;
}

export interface FolderSnapshot {
  world: Record<string, unknown> | null;
  elements: FolderElement[];
  report: OwFolderReadReport;
}

/**
 * Files a world never carries anywhere, ported from Atlas's `isTransientPath`
 * (`src/store/world-tree.ts`, read at commit b000d23921c41a6e1b672783e76bc710432d77f5 of
 * github.com/OnlyWorlds/atlas): a browser's or editor's swap file, and Atlas's own lock and move
 * bookkeeping under `.atlas/`. Here a dot-prefixed folder is never read at all, so the `.atlas/`
 * half only matters to a caller that reads it; it is kept so the rule is the same rule.
 */
export function isTransientPath(path: string): boolean {
  if (/\.(crswap|tmp)$/i.test(path)) return true;
  if (!path.startsWith('.atlas/')) return false;
  const rest = path.slice('.atlas/'.length);
  return rest === 'lock' || rest === 'making' || rest === 'landing' || rest === 'rekey-journal.json' || /^move[^/]*\.json$/.test(rest);
}

/** Code point order (the spec's one order for names, §4), never a runtime's UTF-16 or locale order. */
export function byCodePoint(a: string, b: string): number {
  if (a === b) return 0;
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i].codePointAt(0) as number) - (y[i].codePointAt(0) as number);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** A UUID as Python's `uuid.UUID(str)` reads one (keel's `_parse_id`), in its canonical form; null when it is none. */
export function uuidKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let h = value.split('urn:').join('').split('uuid:').join('');
  h = h.replace(/^[{}]+|[{}]+$/g, '').split('-').join('');
  if (!/^[0-9a-fA-F]{32}$/.test(h)) return null;
  h = h.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Where an entry sits: 0 for `elements/<type>/`, 1 for legacy `spatial/<type>/`, or null when it is no element file. */
function layoutOf(segments: string[]): { rank: 0 | 1; dir: ElementType } | null {
  if (segments.length !== 3 || !segments[2].endsWith('.json')) return null;
  if (segments[0] === 'elements' && TYPES.has(segments[1])) return { rank: 0, dir: segments[1] as ElementType };
  if (segments[0] === 'spatial' && SPATIAL.has(segments[1])) return { rank: 1, dir: segments[1] as ElementType };
  return null;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function parseJson(data: Uint8Array): { ok: true; value: unknown } | { ok: false; fault: OutsideJsonFault } {
  let text: string;
  try {
    text = decoder.decode(data);
  } catch {
    return { ok: false, fault: 'not_json' };
  }
  return parseOutsideJson(text);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A path the reader never reads: under a dot-prefixed folder, dot-prefixed itself, or a swap file. */
const passedOver = (path: string, segments: string[]) => segments.some((s) => s.startsWith('.')) || isTransientPath(path);

/**
 * Whether the folder source reads the file at `path` (relative to the world's folder, `/`-separated, as
 * an entry's path is): `world.json`, a `*.json` directly under `elements/<type>/` for one of the 22
 * types, or under the legacy `spatial/{map,pin,zone,marker}/`, never under a dot-prefixed folder,
 * dot-prefixed itself, or a swap file. It is the reader's own test, so a tool that watches a folder
 * asks it which new files to take in, rather than writing the rule a second time. A path that ends in
 * `/` names a folder, and counts when a file the reader reads can sit in it (`elements/`,
 * `elements/character/`, `spatial/pin/`): a folder moved in whole arrives as one change. Whether a file
 * that counts is served is the reader's next question (it may not parse, or have no id). Names are
 * matched exactly, case included, as the reader matches them. A path that is not a string, is
 * absolute, holds a backslash or an empty, `.` or `..` part is a TypeError: pass it as an entry's path.
 */
export function countsPath(path: string): boolean {
  if (typeof path !== 'string' || path === '') throw new TypeError('countsPath takes a path relative to the world\'s folder, a non-empty string');
  if (path.includes('\\')) throw new TypeError(`countsPath: ${JSON.stringify(path)} holds a backslash; pass the path /-separated, as an entry's path is`);
  const folder = path.endsWith('/');
  const segments = (folder ? path.slice(0, -1) : path).split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new TypeError(`countsPath: ${JSON.stringify(path)} is not a path relative to the world's folder (an empty, "." or ".." part, or a leading /)`);
  }
  if (passedOver(path, segments)) return false;
  if (folder) {
    if (segments.length === 1) return segments[0] === 'elements' || segments[0] === 'spatial';
    if (segments.length === 2) return (segments[0] === 'elements' && TYPES.has(segments[1])) || (segments[0] === 'spatial' && SPATIAL.has(segments[1]));
    return false;
  }
  return path === 'world.json' || layoutOf(segments) !== null;
}

/** Read the entries once: the world, the elements in the order they were kept, and what was skipped. */
export function readFolder(entries: readonly OwWorldFileEntry[]): FolderSnapshot {
  let world: Record<string, unknown> | null = null;
  let worldFault: OutsideJsonFault | undefined;
  const found: { path: string; rank: 0 | 1; dir: ElementType; data: Uint8Array; misspelt?: true }[] = [];
  for (const entry of entries) {
    const segments = entry.path.split('/');
    if (passedOver(entry.path, segments)) continue;
    if (entry.path === 'world.json') {
      const parsed = parseJson(entry.data);
      if (!parsed.ok) worldFault = parsed.fault;
      if (parsed.ok && isObject(parsed.value) && typeof parsed.value.id === 'string' && parsed.value.id !== '') {
        const { api: _api, ...rest } = parsed.value;
        world = rest;
      }
      continue;
    }
    const at = layoutOf(segments);
    if (at) found.push({ path: entry.path, data: entry.data, ...at });
    else if (segments.length === 3 && /\.json$/i.test(segments[2])) {
      // In a type folder, with the extension in another spelling: not read, and said so.
      const typed = layoutOf([segments[0], segments[1], 'x.json']);
      if (typed) found.push({ path: entry.path, data: entry.data, ...typed, misspelt: true });
    }
  }
  found.sort((a, b) => a.rank - b.rank || byCodePoint(a.path, b.path));

  const elements: FolderElement[] = [];
  const skipped: OwFolderSkip[] = [];
  const seen = new Set<string>();
  let legacy = 0;
  for (const f of found) {
    if (f.misspelt) {
      skipped.push({ path: f.path, reason: 'extension' });
      continue;
    }
    const parsed = parseJson(f.data);
    if (!parsed.ok) {
      skipped.push({ path: f.path, reason: parsed.fault });
      continue;
    }
    const body = parsed.value;
    if (!isObject(body) || typeof body.id !== 'string' || body.id === '') {
      skipped.push({ path: f.path, reason: 'no_id' });
      continue;
    }
    // The same id is the id written the same (the address profile's rule): another spelling is another element.
    if (seen.has(body.id)) {
      skipped.push({ path: f.path, reason: 'duplicate', id: body.id });
      continue;
    }
    seen.add(body.id);
    const key = uuidKey(body.id);
    const type = typeof body.type === 'string' && TYPES.has(body.type) ? (body.type as ElementType) : f.dir;
    elements.push({ type, id: body.id, key, body, path: f.path });
    if (f.rank === 1) legacy++;
  }
  const served: OwFolderServed[] = elements.map((e) => ({
    path: e.path, type: e.type, id: e.id, name: typeof e.body.name === 'string' ? e.body.name : null,
  }));
  const misnamed = misnamedFixedName(entries.map(e => e.path));
  if (misnamed) return { world: null, elements: [], report: { world: false, elements: 0, legacy: 0, served: [], skipped: [], misnamed } };
  return {
    world, elements,
    report: { world: world !== null, elements: elements.length, legacy, served, skipped, misnamed, ...(worldFault ? { worldFault } : {}) },
  };
}
