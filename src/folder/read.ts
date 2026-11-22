/**
 * A world folder read as the Folder Format reads one (spec §3, §4): `world.json`, and every
 * `*.json` directly under `elements/<type>/` for the 22 types, plus the legacy
 * `spatial/{map,pin,zone,marker}/`. Identity is the `id` in the file, never its name; a file whose
 * body declares one of the 22 types is that type wherever it sits (the directory decides whether a
 * file is found, the body what it is). `elements/` wins over `spatial/` on a shared id, and within
 * one layout the first path in code point order wins (§4). A file that does not parse, or has no
 * non-empty string `id`, is skipped and counted, never fatal. Dot-prefixed folders and files are
 * never read.
 *
 * Module-internal: not in the package's exports.
 */

import { ELEMENT_TYPES, type ElementType } from '../v2/types.generated';
import type { OwWorldFileEntry } from '../world-file';

const TYPES: ReadonlySet<string> = new Set(ELEMENT_TYPES);
const SPATIAL: ReadonlySet<string> = new Set(['map', 'pin', 'zone', 'marker']);

/** Why a file under a type folder was not served as an element. */
export type OwFolderSkipReason = 'not_json' | 'no_id' | 'duplicate';

export interface OwFolderSkip {
  path: string;
  reason: OwFolderSkipReason;
  /** The id a `duplicate` carried (the element served under it came from an earlier file). */
  id?: string;
}

/** What one read of the entries found: handed to `onRead` once, when the first request reads them. */
export interface OwFolderReadReport {
  /** `world.json` parsed with an id (false: every route answers 500, saying so). */
  world: boolean;
  /** How many elements are served. */
  elements: number;
  /** Of those, how many came from the legacy `spatial/` layout. */
  legacy: number;
  /** The files under a type folder that are not served, each with why, in the order they were read. */
  skipped: OwFolderSkip[];
}

export interface FolderElement {
  type: ElementType;
  /** The id as the file writes it. */
  id: string;
  /** The id as a UUID compares it (lower case, hyphenated), or null when the id is no UUID. */
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

function parseJson(data: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(decoder.decode(data)) };
  } catch {
    return { ok: false };
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read the entries once: the world, the elements in the order they were kept, and what was skipped. */
export function readFolder(entries: readonly OwWorldFileEntry[]): FolderSnapshot {
  let world: Record<string, unknown> | null = null;
  const found: { path: string; rank: 0 | 1; dir: ElementType; data: Uint8Array }[] = [];
  for (const entry of entries) {
    const segments = entry.path.split('/');
    if (segments.some((s) => s.startsWith('.')) || isTransientPath(entry.path)) continue;
    if (entry.path === 'world.json') {
      const parsed = parseJson(entry.data);
      if (parsed.ok && isObject(parsed.value) && typeof parsed.value.id === 'string' && parsed.value.id !== '') {
        const { api: _api, ...rest } = parsed.value;
        world = rest;
      }
      continue;
    }
    const at = layoutOf(segments);
    if (at) found.push({ path: entry.path, data: entry.data, ...at });
  }
  found.sort((a, b) => a.rank - b.rank || byCodePoint(a.path, b.path));

  const elements: FolderElement[] = [];
  const skipped: OwFolderSkip[] = [];
  const seen = new Set<string>();
  let legacy = 0;
  for (const f of found) {
    const parsed = parseJson(f.data);
    if (!parsed.ok) {
      skipped.push({ path: f.path, reason: 'not_json' });
      continue;
    }
    const body = parsed.value;
    if (!isObject(body) || typeof body.id !== 'string' || body.id === '') {
      skipped.push({ path: f.path, reason: 'no_id' });
      continue;
    }
    const key = uuidKey(body.id);
    const identity = key ?? body.id;
    if (seen.has(identity)) {
      skipped.push({ path: f.path, reason: 'duplicate', id: body.id });
      continue;
    }
    seen.add(identity);
    const type = typeof body.type === 'string' && TYPES.has(body.type) ? (body.type as ElementType) : f.dir;
    elements.push({ type, id: body.id, key, body, path: f.path });
    if (f.rank === 1) legacy++;
  }
  return { world, elements, report: { world: world !== null, elements: elements.length, legacy, skipped } };
}
