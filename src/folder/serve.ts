/**
 * keel's read answers, given from a folder snapshot: the world, a type's list, one element and the
 * search. Each is held to keel's own code (github.com/OnlyWorlds/keel, read at c6204cda):
 * `core/world_api.py` (the world's body), `elements/api.py` (the list's closed filter set, its
 * refusals and the one element's not-found), `elements/pagination.py` (the order and the cursor),
 * `elements/serialize.py` and `elements/resolve.py` (the body, `fields` and `expand`),
 * `elements/search.py` (the word rule) and `core/errors.py` (the envelope). The reader is the
 * world's owner: a folder is its holder's own view, so hidden elements are served with their mark.
 *
 * Module-internal: not in the package's exports.
 */

import { FIELD_SCHEMA, GENERIC_LINKS, STANDARD_TYPE_ORDER, type ElementType } from '../v2/types.generated';
import { fold } from '../room';
import { byCodePoint, uuidKey, type FolderElement, type FolderSnapshot } from './read';

// --- the envelope (core/errors.py) -------------------------------------------------------------

const DOC_BASE = 'https://onlyworlds.github.io/api/errors/#';
/** The refusal's own page: the docs' errors page holds keel's codes only, and this one is the folder source's. */
const NOT_IN_A_FOLDER_DOC = 'https://onlyworlds.github.io/docs/development/typescript#a-world-folder-as-the-source';

/** The one refusal's code: what a folder cannot answer, because it lives on the platform. */
export const NOT_IN_A_FOLDER = 'not_in_a_folder';
export const NOT_IN_A_FOLDER_STATUS = 501;
export const NOT_IN_A_FOLDER_MESSAGE = 'A world folder cannot answer this: it lives on the platform.';

/** An answer keel would give: a status and a body (a refusal is keel's error envelope). */
export interface Answer {
  status: number;
  body: unknown;
}

/** keel's `APIError`: raised by a check, turned into the envelope at the route. */
class KeelError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly code: string,
    message: string,
    readonly param: string | null = null,
    readonly extra: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

const invalid = (message: string, param: string | null = null, extra: Record<string, unknown> | null = null) =>
  new KeelError(422, 'invalid_request', 'invalid_request', message, param, extra);

function envelopeOf(e: KeelError): Answer {
  const error: Record<string, unknown> = { type: e.type, code: e.code, message: e.message, param: e.param, doc_url: e.code === NOT_IN_A_FOLDER ? NOT_IN_A_FOLDER_DOC : DOC_BASE + e.code };
  if (e.extra) Object.assign(error, e.extra);
  return { status: e.status, body: { error } };
}

export function refusal(): Answer {
  return envelopeOf(new KeelError(NOT_IN_A_FOLDER_STATUS, 'api_error', NOT_IN_A_FOLDER, NOT_IN_A_FOLDER_MESSAGE));
}

export function unreadable(): Answer {
  return envelopeOf(new KeelError(500, 'api_error', 'api_error',
    'This world folder has no world.json that parses with an id, so nothing in it can be read.'));
}

// --- Python's string rules, where keel's checks lean on them ---------------------------------

/** str.isspace's code points (Python's strip() and split()). All in the BMP, one UTF-16 unit each. */
const PY_SPACE: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function pyStrip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && PY_SPACE.has(s.charCodeAt(a))) a++;
  while (b > a && PY_SPACE.has(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

/** `" ".join(s.split())`. */
function pySqueeze(s: string): string {
  const out: string[] = [];
  let word = '';
  for (let i = 0; i < s.length; i++) {
    if (PY_SPACE.has(s.charCodeAt(i))) {
      if (word) out.push(word);
      word = '';
    } else word += s[i];
  }
  if (word) out.push(word);
  return out.join(' ');
}

/** `int(s)` for a query value: an optional sign and ASCII digits (single underscores between), spaces around. */
function pyInt(raw: string): number | null {
  const s = pyStrip(raw);
  if (!/^[+-]?[0-9]+(?:_[0-9]+)*$/.test(s)) return null;
  return Number(s.split('_').join(''));
}

/** `repr(s)` for the few refusals that quote a value. */
function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = '';
  for (const c of s) {
    if (c === '\\') out += '\\\\';
    else if (c === quote) out += `\\${c}`;
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else out += c;
  }
  return quote + out + quote;
}

/** `json.dumps(v)` for the cursor's scalars: ASCII only, as Python escapes. */
function pyJsonString(s: string): string {
  let out = '';
  for (const c of JSON.stringify(s)) {
    // Every UTF-16 unit past ASCII as its escape (a code point past the BMP as its two halves), as ensure_ascii does.
    for (let i = 0; i < c.length; i++) {
      const u = c.charCodeAt(i);
      out += u < 0x80 ? c[i] : `\\u${u.toString(16).padStart(4, '0')}`;
    }
  }
  return out;
}

// --- the kinds of each type's fields (elements/registry.py, from the schema the package carries) ----

interface Kinds {
  text: string[];
  int: string[];
  single: string[];
  multi: string[];
  /** A link of any type: its wire name, then its (type column, id column). A Pin's `element`. */
  generic: [string, string, string][];
  targets: Record<string, string>;
}

const KINDS = {} as Record<ElementType, Kinds>;
for (const type of STANDARD_TYPE_ORDER) {
  const pairs = Object.entries((GENERIC_LINKS as Record<string, Record<string, readonly [string, string]>>)[type] ?? {})
    .map(([name, [t, i]]) => [name, t, i] as [string, string, string]);
  const pairCols = new Set(pairs.flatMap(([, t, i]) => [t, i]));
  const k: Kinds = { text: [], int: [], single: [], multi: [], generic: pairs, targets: {} };
  for (const [field, info] of Object.entries(FIELD_SCHEMA[type] as unknown as Record<string, { type: string; target?: string }>)) {
    if (pairCols.has(field)) continue;
    if (info.type === 'text') k.text.push(field);
    else if (info.type === 'integer') k.int.push(field);
    else if (info.type === 'single_link') k.single.push(field);
    else if (info.type === 'multi_link') k.multi.push(field);
    if (info.target) k.targets[field] = info.target;
  }
  KINDS[type] = k;
}

const TYPE_SET: ReadonlySet<string> = new Set(STANDARD_TYPE_ORDER);
export const isType = (t: string): t is ElementType => TYPE_SET.has(t);

/** The fields keel keeps for itself: served when the file holds them, never made up. */
const SERVER_FIELDS = ['created_at', 'updated_at', 'change_seq', 'created_by', 'changed_by', 'changed_via', 'changed_client', 'doors'];
const EXTENSION = /^(atlas_|shadow_|x_)/;
const SERVED_TRIMMED = 'x_served_trimmed';

/** `output_fields(slug)`: id, the scalars, the links, the generic columns, then the server's own. */
const OUTPUT_FIELDS = {} as Record<ElementType, string[]>;
for (const type of STANDARD_TYPE_ORDER) {
  const k = KINDS[type];
  OUTPUT_FIELDS[type] = ['id', ...k.text, ...k.int, ...k.single, ...k.multi, ...k.generic.flatMap(([, t, i]) => [t, i]), ...SERVER_FIELDS];
}

/** `search_fields(slug)`: name, then the prose (every text field keel stores as a TextField: all but the short labels). */
const SEARCH_FIELDS = {} as Record<ElementType, string[]>;
for (const type of STANDARD_TYPE_ORDER) {
  SEARCH_FIELDS[type] = ['name', ...KINDS[type].text.filter((f) => !['name', 'supertype', 'subtype', 'image_url'].includes(f))];
}

// --- the body (elements/serialize.py) ------------------------------------------------------------

const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const unset = (v: unknown) => v === undefined || v === null || v === '';

/** A link as the file writes it: its bare name (§5), or the older `<name>_id` a writer once used for a Pin's `map`. */
function linkValue(body: Record<string, unknown>, field: string, outputs: ReadonlySet<string>): unknown {
  const suffixed = `${field}_id`;
  if (own(body, field) && !unset(body[field])) return body[field];
  if (!outputs.has(suffixed) && own(body, suffixed)) return body[suffixed];
  return body[field];
}

/** One element as keel serves it to the world's owner, before `expand` and `fields`. */
export function serveBody(el: FolderElement): Record<string, unknown> {
  const b = el.body;
  const k = KINDS[el.type];
  const outputs = new Set(OUTPUT_FIELDS[el.type]);
  const out: Record<string, unknown> = { type: el.type, id: el.id };
  for (const f of k.text) out[f] = b[f] === undefined || b[f] === null ? '' : b[f];
  for (const f of k.int) out[f] = b[f] === undefined ? null : b[f];
  for (const f of k.single) {
    const v = linkValue(b, f, outputs);
    out[f] = unset(v) ? null : v;
  }
  for (const f of k.multi) {
    const v = linkValue(b, f, outputs);
    if (v === undefined || v === null) out[f] = [];
    else if (Array.isArray(v)) {
      // Each element once, in its first place (§5), and no null entry (keel leaves one out).
      const kept: unknown[] = [];
      for (const x of v) if (x !== null && !kept.includes(x)) kept.push(x);
      out[f] = kept;
    } else out[f] = v;
  }
  for (const [, t, i] of k.generic) {
    out[t] = b[t] === undefined || b[t] === null ? '' : b[t];
    out[i] = unset(b[i]) ? null : b[i];
  }
  for (const f of SERVER_FIELDS) if (own(b, f)) out[f] = b[f];
  for (const key of Object.keys(b)) if (EXTENSION.test(key)) out[key] = b[key];
  if (b.known_of === true) out.known_of = true;
  if (b.hidden === true) out.hidden = true;
  return out;
}

/** `expandable_fields(slug)`: the link fields, then each generic link's name and both its columns. */
function expandable(type: ElementType): Set<string> {
  const k = KINDS[type];
  return new Set([...k.single, ...k.multi, ...k.generic.flatMap(([n, t, i]) => [n, t, i])]);
}

function validateExpand(type: ElementType, raw: string | null): string[] {
  if (!raw) return [];
  const valid = expandable(type);
  const names = raw.split(',').map((n) => pyStrip(n)).filter(Boolean);
  for (const n of names) if (!valid.has(n)) throw invalid(`Cannot expand non-link field: ${n}`, 'expand');
  return names;
}

function validateFields(type: ElementType, raw: string | null): string[] | null {
  if (!raw) return null;
  const names = raw.split(',').map((n) => pyStrip(n)).filter(Boolean);
  const valid = new Set(OUTPUT_FIELDS[type]);
  const unknown = [...new Set(names.filter((n) => !valid.has(n) && !EXTENSION.test(n)))];
  if (unknown.length) {
    const typesWith: Record<string, string[]> = {};
    for (const n of unknown) {
      const held = STANDARD_TYPE_ORDER.filter((t) => OUTPUT_FIELDS[t].includes(n));
      if (held.length) typesWith[n] = held;
    }
    const message = unknown.length === 1 ? `Unknown field in ?fields: ${unknown[0]}` : `Unknown fields in ?fields: ${unknown.join(', ')}`;
    throw invalid(message, 'fields', { unknown_fields: unknown, types_with_field: typesWith, allowed_fields: OUTPUT_FIELDS[type] });
  }
  return names;
}

/** The world's elements, served, and found by type and id: what `expand` resolves against. */
export class Served {
  readonly byType = new Map<ElementType, { el: FolderElement; body: Record<string, unknown> }[]>();
  private readonly byKey = new Map<string, Record<string, unknown>>();

  constructor(readonly snapshot: FolderSnapshot) {
    for (const t of STANDARD_TYPE_ORDER) this.byType.set(t, []);
    for (const el of snapshot.elements) {
      const body = serveBody(el);
      this.byType.get(el.type)!.push({ el, body });
      if (el.key) this.byKey.set(`${el.type}:${el.key}`, body);
    }
  }

  find(type: ElementType, key: string): Record<string, unknown> | undefined {
    return this.byKey.get(`${type}:${key}`);
  }

  private readonly walks = new Map<ElementType, { body: Record<string, unknown>; place: Place }[]>();

  /** A type's elements in the list's order (the cursor's walk), sorted once: the snapshot never changes. */
  walkOf(type: ElementType): readonly { body: Record<string, unknown>; place: Place }[] {
    let walk = this.walks.get(type);
    if (!walk) {
      walk = this.byType.get(type)!.map(({ body }) => ({ body, place: placeOf(body) })).sort((a, b) => comparePlaces(a.place, b.place));
      this.walks.set(type, walk);
    }
    return walk;
  }

  /** `_stub_from_row`: what an expanded link carries. */
  stub(type: string, value: unknown): Record<string, unknown> | null {
    const key = uuidKey(value);
    const body = key && isType(type) ? this.find(type, key) : undefined;
    if (!body) return null;
    return { id: body.id, name: body.name, supertype: body.supertype, subtype: body.subtype, image_url: body.image_url };
  }

  /** `serialize` after the body: `expand` (resolve_stubs), then `fields`, keeping the marks whatever `fields` asked. */
  shape(type: ElementType, served: Record<string, unknown>, expand: string[], fields: string[] | null): Record<string, unknown> {
    let out: Record<string, unknown> = { ...served };
    if (expand.length) {
      const asked = new Set(expand);
      const k = KINDS[type];
      for (const f of [...k.single, ...k.multi]) {
        if (!asked.has(f) || !own(out, f)) continue;
        const target = k.targets[f];
        if (k.single.includes(f)) out[f] = unset(out[f]) ? null : this.stub(target, out[f]);
        else out[f] = (Array.isArray(out[f]) ? (out[f] as unknown[]) : []).map((v) => this.stub(target, v)).filter((s) => s !== null);
      }
      for (const [name, t, i] of k.generic) {
        if (!asked.has(name) || (!own(out, t) && !own(out, i))) continue;
        const et = typeof out[t] === 'string' ? (out[t] as string) : '';
        const stub = unset(out[i]) ? null : this.stub(et, out[i]);
        out[t] = stub ? et : null;
        out[i] = stub;
      }
    }
    if (fields) {
      const keep = new Set(fields);
      const kept: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(out)) if (keep.has(key)) kept[key] = v;
      if (served.known_of === true) kept.known_of = true;
      const trimmed = served[SERVED_TRIMMED];
      if (Array.isArray(trimmed)) {
        const named = trimmed.filter((f) => typeof f === 'string' && (own(kept, f) || (f === 'notes' && own(kept, 'x_lens'))));
        if (named.length) kept[SERVED_TRIMMED] = named;
        else delete kept[SERVED_TRIMMED];
      }
      if (served.hidden === true) kept.hidden = true;
      out = kept;
    }
    return out;
  }
}

// --- the query (Django's QueryDict, as keel reads it) -------------------------------------------

/** A query as keel's routes read it: `in` by key, `.get` the last value, `.keys()` once each in first order. */
export class Query {
  constructor(private readonly params: URLSearchParams) {}

  has(key: string): boolean {
    return this.params.has(key);
  }

  get(key: string): string | null {
    const all = this.params.getAll(key);
    return all.length ? all[all.length - 1] : null;
  }

  keys(): string[] {
    return [...new Set(this.params.keys())];
  }
}

/** `as` names a reader and `world` a world on the platform: a folder is one world, seen by its holder. */
export const asksThePlatform = (q: Query) => q.has('as') || q.has('world');

// --- the list (elements/api.py, elements/pagination.py) -----------------------------------------

const RESERVED = ['limit', 'cursor', 'expand', 'fields'];
const FILTER_ORDER = ['name', 'name__icontains', 'supertype', 'subtype', 'ids', 'created_by'];
const LIST_LIMIT_DEFAULT = 100;
const LIST_LIMIT_MAX = 1000;
const IDS_MAX = 200;

function linkFilters(type: ElementType): string[] {
  const k = KINDS[type];
  return [...k.single, ...k.generic.map(([n]) => n)];
}

function filtersFor(type: ElementType): string[] {
  const out = [...FILTER_ORDER];
  if (KINDS[type].multi.includes('characters')) out.push('characters');
  return [...out, ...linkFilters(type)];
}

function parseFilterUuid(raw: string, name: string): string {
  const key = uuidKey(raw);
  if (key === null) throw invalid(`${name} must be a UUID.`, name);
  return key;
}

/** `_link_filter_value`: null for an empty value (the rows with none), else the id. */
function linkFilterValue(raw: string, name: string): string | null {
  const value = pyStrip(raw);
  return value ? parseFilterUuid(value, name) : null;
}

function parseIds(raw: string): Set<string> {
  const parts = raw.split(',').map((p) => pyStrip(p)).filter(Boolean);
  const shape = 'a comma-separated list of ids';
  if (!parts.length) throw invalid(`ids must be ${shape}.`, 'ids');
  if (parts.length > IDS_MAX) throw invalid(`ids takes at most ${IDS_MAX} ids (got ${parts.length}).`, 'ids');
  const out = new Set<string>();
  for (const p of parts) {
    const key = uuidKey(p);
    if (key === null) throw invalid(`ids must be ${shape}; ${pyRepr(p)} is not one.`, 'ids');
    out.add(key);
  }
  return out;
}

function parseLimit(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = pyInt(raw);
  if (n === null) throw invalid('limit must be an integer.', 'limit');
  return n;
}

/** Each code point upper-cased alone, as Postgres's UPPER maps one character to one (`icontains`). */
function upperEach(s: string): string {
  let out = '';
  for (const c of s) {
    const u = c.toUpperCase();
    out += Array.from(u).length === 1 ? u : c;
  }
  return out;
}

/** A row's place in the walk: (change_seq, id), every element with no whole-number change_seq after every stamped one. */
type Place = { s: number | null; i: string };

function placeOf(body: Record<string, unknown>): Place {
  const seq = body.change_seq;
  return { s: typeof seq === 'number' && Number.isInteger(seq) ? seq : null, i: String(body.id) };
}

function comparePlaces(a: Place, b: Place): number {
  if (a.s !== null && b.s !== null && a.s !== b.s) return a.s - b.s;
  if ((a.s === null) !== (b.s === null)) return a.s === null ? 1 : -1;
  return byCodePoint(a.i, b.i);
}

function encodeCursor(p: Place): string {
  const raw = `{"s": ${p.s === null ? 'null' : String(p.s)}, "i": ${pyJsonString(p.i)}}`;
  const bytes = new TextEncoder().encode(raw);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeCursor(cursor: string): Place {
  const bad = () => invalid('Invalid cursor.', 'cursor');
  const text = cursor.replace(/-/g, '+').replace(/_/g, '/');
  if (!B64.test(text) || text.length % 4 !== 0) throw bad();
  let obj: unknown;
  try {
    const bin = atob(text);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw bad();
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw bad();
  const o = obj as Record<string, unknown>;
  if (!own(o, 's') || !own(o, 'i') || typeof o.i !== 'string') throw bad();
  let s: number | null;
  if (o.s === null) s = null;
  else if (typeof o.s === 'number' && Number.isFinite(o.s)) s = Math.trunc(o.s);
  else if (typeof o.s === 'string' && pyInt(o.s) !== null) s = pyInt(o.s);
  else throw bad();
  return { s, i: o.i };
}

export function listAnswer(served: Served, type: ElementType, q: Query): Answer {
  try {
    const filters = filtersFor(type);
    const allowed = new Set([...RESERVED, ...filters]);
    for (const key of q.keys()) {
      if (key === 'ordering') {
        throw invalid('ordering is not supported: lists come in change order (the order the cursor walks). Sort the results on your side.', 'ordering');
      }
      if (!allowed.has(key)) throw invalid(`Unknown filter '${key}'. Filters: ${filters.join(', ')}.`, key);
    }
    // The type's walk, sorted once per snapshot; each filter keeps its order.
    let rows = served.walkOf(type);
    if (q.has('name')) {
      const name = q.get('name');
      rows = rows.filter(({ body: b }) => b.name === name);
    }
    const contains = q.get('name__icontains');
    if (contains) {
      const needle = upperEach(contains);
      rows = rows.filter(({ body: b }) => typeof b.name === 'string' && upperEach(b.name).includes(needle));
    }
    for (const field of ['supertype', 'subtype']) {
      if (q.has(field)) {
        // Both sides trimmed by the profiles' White_Space and simply case-folded, the whole value (core/room.py).
        const want = fold(q.get(field) as string);
        rows = rows.filter(({ body: b }) => typeof b[field] === 'string' && fold(b[field] as string) === want);
      }
    }
    if (filters.includes('characters') && q.has('characters')) {
      const cid = linkFilterValue(q.get('characters') as string, 'characters');
      rows = cid === null
        ? rows.filter(({ body: b }) => Array.isArray(b.characters) && b.characters.length === 0)
        : rows.filter(({ body: b }) => Array.isArray(b.characters) && b.characters.some((v) => uuidKey(v) === cid));
    }
    for (const field of linkFilters(type)) {
      if (!q.has(field)) continue;
      const target = linkFilterValue(q.get(field) as string, field);
      const generic = KINDS[type].generic.find(([n]) => n === field);
      const column = generic ? generic[2] : field;
      rows = target === null ? rows.filter(({ body: b }) => unset(b[column])) : rows.filter(({ body: b }) => uuidKey(b[column]) === target);
    }
    if (q.has('ids')) {
      const ids = parseIds(q.get('ids') as string);
      rows = rows.filter(({ body: b }) => ids.has(uuidKey(b.id) as string));
    }
    if (q.has('created_by')) {
      const value = pyStrip(q.get('created_by') as string);
      if (value === 'owner') rows = rows.filter(({ body: b }) => b.created_by === undefined || b.created_by === null);
      else {
        const member = uuidKey(value);
        if (member === null) throw invalid('created_by must be a membership id (as GET /members lists them) or owner.', 'created_by');
        rows = rows.filter(({ body: b }) => uuidKey(b.created_by) === member);
      }
    }
    const expand = validateExpand(type, q.get('expand'));
    const fields = validateFields(type, q.get('fields'));
    const limit = Math.max(1, Math.min(parseLimit(q.get('limit'), LIST_LIMIT_DEFAULT), LIST_LIMIT_MAX));
    const cursor = q.get('cursor');

    // The first row past the cursor, found by halving: the rows are in the walk's order.
    let from = 0;
    if (cursor) {
      const after = decodeCursor(cursor);
      let hi = rows.length;
      while (from < hi) {
        const mid = (from + hi) >>> 1;
        if (comparePlaces(rows[mid].place, after) > 0) hi = mid;
        else from = mid + 1;
      }
    }
    const hasMore = rows.length - from > limit;
    const page = rows.slice(from, from + limit);
    const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1].place) : null;
    const data = page.map((r) => served.shape(type, r.body, expand, fields));
    return { status: 200, body: { data, has_more: hasMore, next_cursor: nextCursor } };
  } catch (e) {
    if (e instanceof KeelError) return envelopeOf(e);
    throw e;
  }
}

export function getAnswer(served: Served, type: ElementType, rawId: string, q: Query): Answer {
  try {
    const key = uuidKey(rawId);
    if (key === null) throw invalid('id must be a UUID.', 'id');
    const body = served.find(type, key);
    // No tombstones in a folder, so never keel's 410: a missing id is the 404.
    if (!body) throw new KeelError(404, 'not_found', 'not_found', `${type} '${key}' not found.`);
    const expand = validateExpand(type, q.get('expand'));
    const fields = validateFields(type, q.get('fields'));
    return { status: 200, body: served.shape(type, body, expand, fields) };
  } catch (e) {
    if (e instanceof KeelError) return envelopeOf(e);
    throw e;
  }
}

// --- the world (core/world_api.py) --------------------------------------------------------------

/** `_world_body`'s keys in its order; each served when `world.json` holds it, none made up. */
const WORLD_KEYS = [
  'id', 'name', 'description', 'image_url', 'time_format_names', 'time_format_equivalents', 'time_basic_unit',
  'time_range_min', 'time_range_max', 'time_range_current', 'length_unit', 'mass_unit', 'distance_unit', 'public_read',
  'agent_narrator_rule', 'agent_writes_proposed', 'owner_character', 'slug', 'public_page', 'origin', 'created_at', 'updated_at',
];

export function worldAnswer(served: Served): Answer {
  const w = served.snapshot.world as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of WORLD_KEYS) {
    if (key === 'time_range_current') {
      // On disk the now is the schema's `time_current` (spec §5); a body exported from the wire says
      // `time_range_current`. A non-null `time_current` wins, a null one counts as absent.
      if (own(w, 'time_current') && w.time_current !== null) out[key] = w.time_current;
      else if (own(w, 'time_range_current')) out[key] = w.time_range_current;
      else if (own(w, 'time_current')) out[key] = null;
    } else if (own(w, key)) out[key] = w[key];
  }
  for (const key of Object.keys(w)) if (EXTENSION.test(key)) out[key] = w[key];
  // `public_counts`: every type, by slug, with what this reader (the owner) may read.
  const types: Record<string, number> = {};
  let total = 0;
  for (const t of [...STANDARD_TYPE_ORDER].sort()) {
    const n = served.byType.get(t)!.length;
    types[t] = n;
    total += n;
  }
  out.counts = { total, types };
  return { status: 200, body: out };
}

// --- the search (elements/search.py) ------------------------------------------------------------

const MIN_Q = 2;
const MAX_Q = 200;
const SEARCH_LIMIT_DEFAULT = 50;
const SEARCH_LIMIT_MAX = 200;
const SNIPPET_CHARS = 160;
const LEAD = 60;
const SEARCH_PARAMS = ['q', 'type', 'limit'];

/** Python's `\w` on a str: letters, digits and the underscore, by Unicode category. */
const WORD = /[\p{L}\p{N}_]+/gu;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(w)}(?![\\p{L}\\p{N}_])`, 'iu');

function wordsOf(q: string): string[] {
  const seen: string[] = [];
  for (const w of q.toLowerCase().match(WORD) ?? []) if (!seen.includes(w)) seen.push(w);
  return seen;
}

/** Up to SNIPPET_CHARS code points of `text` around code point `at`, cut at word edges where it is cut at all. */
function snippet(text: string, at: number): string {
  const cps = Array.from(text);
  if (cps.length <= SNIPPET_CHARS) return text;
  let start = Math.max(0, Math.min(at - LEAD, cps.length - SNIPPET_CHARS));
  let end = start + SNIPPET_CHARS;
  const find = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (cps[i] === ' ') return i;
    return -1;
  };
  const rfind = (from: number, to: number) => {
    for (let i = to - 1; i >= from; i--) if (cps[i] === ' ') return i;
    return -1;
  };
  if (start > 0) {
    const space = find(start, at);
    if (space !== -1) start = space + 1;
  }
  if (end < cps.length) {
    const space = rfind(at, end);
    if (space !== -1) end = space;
  }
  return cps.slice(start, end).join('');
}

/** `_locate`: the first field holding every word, else the first holding any; the snippet around its first match. */
function locate(body: Record<string, unknown>, fields: string[], patterns: RegExp[]): [string, string] {
  const texts: Record<string, string> = {};
  for (const f of fields) texts[f] = pySqueeze(typeof body[f] === 'string' ? (body[f] as string) : '');
  const found: [string, boolean, number][] = [];
  for (const f of fields) {
    const starts: number[] = [];
    for (const p of patterns) {
      const m = p.exec(texts[f]);
      if (m) starts.push(Array.from(texts[f].slice(0, m.index)).length);
    }
    if (starts.length) found.push([f, starts.length === patterns.length, Math.min(...starts)]);
  }
  if (!found.length) return ['name', snippet(texts.name, 0)];
  const [field, , at] = found.find(([, all]) => all) ?? found[0];
  return [field, snippet(texts[field], at)];
}

const collator = new Intl.Collator('en');

export function searchAnswer(served: Served, q: Query): Answer {
  try {
    for (const key of q.keys()) {
      if (!SEARCH_PARAMS.includes(key)) {
        throw invalid(`Unknown query parameter '${key}'. Parameters: ${SEARCH_PARAMS.join(', ')}.`, key);
      }
    }
    const rawQ = q.get('q');
    if (rawQ === null || !pyStrip(rawQ)) throw invalid(`q is required: ${MIN_Q} to ${MAX_Q} characters.`, 'q');
    const text = pyStrip(rawQ);
    const length = Array.from(text).length;
    if (length < MIN_Q || length > MAX_Q) throw invalid(`q must be ${MIN_Q} to ${MAX_Q} characters (it has ${length}).`, 'q');
    const words = wordsOf(text);
    if (!words.length) throw invalid('q must hold at least one word (letters or digits).', 'q');
    const rawType = q.get('type');
    let only: ElementType | null = null;
    if (rawType !== null && rawType !== '') {
      if (!isType(rawType)) throw invalid(`Unknown type '${rawType}'. Types: ${STANDARD_TYPE_ORDER.join(', ')}.`, 'type');
      only = rawType;
    }
    const rawLimit = q.get('limit');
    let limit = SEARCH_LIMIT_DEFAULT;
    if (rawLimit !== null) {
      const n = pyInt(rawLimit);
      if (n === null) throw invalid('limit must be an integer.', 'limit');
      limit = Math.max(1, Math.min(n, SEARCH_LIMIT_MAX));
    }
    const patterns = words.map(wordPattern);
    const holds = (body: Record<string, unknown>, f: string, p: RegExp) => typeof body[f] === 'string' && p.test(body[f] as string);
    const hits: { tier: number; index: number; body: Record<string, unknown>; type: ElementType }[] = [];
    STANDARD_TYPE_ORDER.forEach((type, index) => {
      if (only !== null && type !== only) return;
      const fields = SEARCH_FIELDS[type];
      for (const { body } of served.byType.get(type)!) {
        if (!patterns.every((p) => fields.some((f) => holds(body, f, p)))) continue;
        const tier = patterns.every((p) => holds(body, 'name', p)) ? 0 : 1;
        hits.push({ tier, index, body, type });
      }
    });
    // Tier (name hits first), the type's place, then the name as the database sorts it, then the id.
    hits.sort((a, b) => a.tier - b.tier || a.index - b.index
      || collator.compare(String(a.body.name).toLowerCase(), String(b.body.name).toLowerCase())
      || collator.compare(String(a.body.name), String(b.body.name))
      || byCodePoint(String(a.body.name), String(b.body.name))
      || byCodePoint(String(a.body.id), String(b.body.id)));
    const results = hits.slice(0, limit).map(({ body, type }) => {
      const [field, snip] = locate(body, SEARCH_FIELDS[type], patterns);
      const row: Record<string, unknown> = {
        type, id: body.id, name: body.name, supertype: body.supertype, subtype: body.subtype, field, snippet: snip,
      };
      if (body.known_of === true) row.known_of = true;
      return row;
    });
    return { status: 200, body: { query: text, results, count: results.length, truncated: hits.length > limit } };
  } catch (e) {
    if (e instanceof KeelError) return envelopeOf(e);
    throw e;
  }
}
