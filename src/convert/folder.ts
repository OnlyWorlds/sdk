/**
 * A world folder written in memory (OnlyWorlds Folder Format v0.3.25): `world.json` and one file
 * per element under `elements/<type>/`, named `<slug>--<tail8>.json` (§3.2, the collision rule
 * included), each the canonical bytes of §5 (`JSON.stringify(value, null, 2)` and a newline, UTF-8,
 * keys in the order given). The same bytes as the Python package's `write_folder`: the filenames
 * are its `slugify`, `id_tail` and `resolve_filenames`, the text its `_jsonfmt.encode`.
 *
 * Module-internal: not in the package's exports.
 */

import { ELEMENT_TYPES } from '../v2/types.generated';
import { byCodePoint } from '../message';
import { intStr, PyFloat, type PyDict, type PyValue } from './py';

/** The folder format version a folder is born with (§4.2 `format_version`). */
export const FOLDER_FORMAT_VERSION = '0.3.25';

/** One file of a folder: its path inside the folder, `/`-separated, and its bytes. */
export interface OwFolderFile {
  path: string;
  data: Uint8Array;
}

/** The order the Python package walks the 22 types in when it writes (its schema's order). */
const WRITE_ORDER = ['ability', 'collective', 'character', 'construct', 'creature', 'event', 'family', 'institution',
  'language', 'law', 'location', 'map', 'marker', 'narrative', 'object', 'phenomenon', 'pin', 'relation', 'species',
  'title', 'trait', 'zone'];

// --- filenames (§3.2) ---------------------------------------------------------------

const SLUG_ID_SEP = '--';
const ID_TAIL_LEN = 8;
const SLUG_MAX_LEN = 40;

/** Lowercase ASCII kebab of a name, at most 40, a trailing `-` trimmed again after the cut. */
export function slugify(name: string | null): string {
  if (!name) return '';
  const ascii = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const trimmed = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (trimmed.length <= SLUG_MAX_LEN) return trimmed;
  return trimmed.slice(0, SLUG_MAX_LEN).replace(/-+$/, '');
}

function idTail(id: string): string {
  if (id.length <= ID_TAIL_LEN) return id;
  const raw = id.slice(-ID_TAIL_LEN);
  if (raw.includes(SLUG_ID_SEP) || raw.startsWith('-')) {
    const compact = id.split('-').join('');
    return compact.length <= ID_TAIL_LEN ? compact : compact.slice(-ID_TAIL_LEN);
  }
  return raw;
}

function elementFilename(id: string, name: string | null): string {
  const slug = slugify(name);
  return slug ? `${slug}${SLUG_ID_SEP}${idTail(id)}.json` : `${id}.json`;
}

function elementFilenameFullId(id: string, name: string | null): string {
  const slug = slugify(name);
  return slug ? `${slug}${SLUG_ID_SEP}${id}.json` : `${id}.json`;
}

/** One type directory's filenames: two that land on one path case-blind go id-ascending, the lowest keeping the short form. */
function resolveFilenames(elements: [string, string | null][]): Map<string, string> {
  const names = new Map<string, string | null>();
  const buckets = new Map<string, string[]>();
  for (const [id, name] of elements) {
    if (names.has(id)) throw new Error(`duplicate id '${id}' in one type directory`);
    names.set(id, name);
    const key = elementFilename(id, name).toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(id);
  }
  const out = new Map<string, string>();
  for (const ids of buckets.values()) {
    [...ids].sort(byCodePoint).forEach((id, i) => {
      out.set(id, (i === 0 ? elementFilename : elementFilenameFullId)(id, names.get(id)!));
    });
  }
  return out;
}

// --- the bytes (§5) -----------------------------------------------------------------------

function dump(v: PyValue, indent: string, out: string[]): void {
  if (v === null) out.push('null');
  else if (v === true) out.push('true');
  else if (v === false) out.push('false');
  else if (typeof v === 'number') out.push(intStr(v));
  else if (v instanceof PyFloat) {
    if (!Number.isFinite(v.value)) throw new Error(`non-finite number ${v.value} has no JSON form`);
    out.push(JSON.stringify(v.value));
  } else if (typeof v === 'string') out.push(JSON.stringify(v));
  else if (Array.isArray(v)) {
    if (!v.length) {
      out.push('[]');
      return;
    }
    const inner = `${indent}  `;
    out.push('[');
    v.forEach((item, i) => {
      out.push(`${i === 0 ? '\n' : ',\n'}${inner}`);
      dump(item, inner, out);
    });
    out.push(`\n${indent}]`);
  } else {
    if (!v.size) {
      out.push('{}');
      return;
    }
    const inner = `${indent}  `;
    out.push('{');
    let first = true;
    for (const [k, item] of v) {
      out.push(`${first ? '\n' : ',\n'}${inner}${JSON.stringify(k)}: `);
      first = false;
      dump(item, inner, out);
    }
    out.push(`\n${indent}}`);
  }
}

/** The canonical on-disk bytes of a value: `JSON.stringify(value, null, 2)` and a newline, keys as given. */
export function encode(v: PyValue): Uint8Array {
  const out: string[] = [];
  dump(v, '', out);
  out.push('\n');
  return new TextEncoder().encode(out.join(''));
}

// --- the folder -----------------------------------------------------------------------------

/** §5: `world.json` follows the canonical schema; one key is renamed from the wire. */
const WIRE_TO_DISK_WORLD_KEYS: Record<string, string> = { time_range_current: 'time_current' };

/** The `world.json` a writer emits: every key in order, `time_range_current` renamed, `snapshot_counts` recounted or dropped, `format_version` set at birth. */
function worldForDisk(world: PyDict, counts: Map<string, number>): PyDict {
  const id = world.get('id');
  if (typeof id !== 'string' || !id) throw new Error('world.json requires a non-empty string `id` (§4.1)');
  if (typeof world.get('name') !== 'string') throw new Error('world.json requires a string `name` (it MAY be empty) (§4.1)');
  const out: PyDict = new Map();
  for (const [key, value] of world) {
    const disk = WIRE_TO_DISK_WORLD_KEYS[key] ?? key;
    out.set(world.has(disk) ? key : disk, value);
  }
  if (out.has('snapshot_counts')) {
    if (out.has('snapshot_of')) out.set('snapshot_counts', new Map([...counts].filter(([, n]) => n)));
    else out.delete('snapshot_counts');
  }
  if (!out.has('format_version')) out.set('format_version', FOLDER_FORMAT_VERSION);
  return out;
}

/** §4.4: the keys every stub (`known_of: true`) keeps, written even when empty. */
const KNOWN_OF_KEEPS = new Set(['id', 'type', 'name', 'description', 'supertype', 'subtype', 'image_url', 'created_at',
  'updated_at', 'change_seq']);

/** A value is anything but `""`, `null` and `[]`: `0` and `false` are values. */
const isSet = (v: PyValue): boolean => !(v === null || v === '' || (Array.isArray(v) && !v.length));

/**
 * A body as it is written: a stub (`known_of: true`, §4.4) keeps its kept keys and every other key
 * with a value, in received order, then `known_of: true`; any other body is written whole. The
 * Python package's `known_of_for_disk`.
 */
function bodyForDisk(body: PyDict): PyDict {
  if (body.get('known_of') !== true) return body;
  const out: PyDict = new Map();
  for (const [k, v] of body) if (k !== 'known_of' && (KNOWN_OF_KEEPS.has(k) || isSet(v))) out.set(k, v);
  out.set('known_of', true);
  return out;
}

/**
 * One world folder's files: `world.json` and every element, by type (type -> bodies). Within a
 * type a repeated id keeps its last body; the same id under two types is an error. A stub is
 * written as §4.4 writes it (`bodyForDisk`). Files come in code point order of their paths.
 */
export function folderFiles(world: PyDict, elements: Map<string, PyDict[]>): OwFolderFile[] {
  const byType = new Map<string, Map<string, PyDict>>();
  const owner = new Map<string, string>();
  for (const [type, bodies] of elements) {
    if (!(ELEMENT_TYPES as string[]).includes(type)) throw new Error(`unknown element type '${type}'`);
    if (!byType.has(type)) byType.set(type, new Map());
    const slot = byType.get(type)!;
    for (const body of bodies) {
      const id = body.get('id');
      if (typeof id !== 'string' || !id) throw new Error(`${type} element without a non-empty string id`);
      if ((owner.get(id) ?? type) !== type) throw new Error(`id ${id} appears under both ${owner.get(id)} and ${type}`);
      owner.set(id, type);
      slot.delete(id);
      slot.set(id, body);
    }
  }
  const files: OwFolderFile[] = [];
  const counts = new Map<string, number>();
  const nameOf = (b: PyDict): string | null => {
    const n = b.get('name');
    return typeof n === 'string' ? n : null;
  };
  for (const type of WRITE_ORDER) {
    const bodies = byType.get(type);
    if (!bodies || !bodies.size) continue;
    const names = resolveFilenames([...bodies].map(([id, b]) => [id, nameOf(b)]));
    for (const [id, body] of bodies) files.push({ path: `elements/${type}/${names.get(id)}`, data: encode(bodyForDisk(body)) });
    counts.set(type, bodies.size);
  }
  files.push({ path: 'world.json', data: encode(worldForDisk(world, counts)) });
  return files.sort((a, b) => byCodePoint(a.path, b.path));
}

