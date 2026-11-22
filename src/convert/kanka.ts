/**
 * Kanka's reader: a Kanka JSON export (the zip "Export the campaign" gives) as a world folder,
 * the same folder as the Python package's door (`python -m onlyworlds.kanka`) byte for byte, and
 * the same report. Its rules are this file; its tables (Kanka's folders to element types, its keys
 * to fields, the fixed key lists, the names it makes) and every line of its report are
 * `kanka.json`, the same bytes the Python door reads. The Python module's docstring is the long
 * account of what becomes what; in short:
 *
 * - each entity an element of its module's type (a module with no type a Narrative, supertype
 *   `Article`), its entry and visible posts the description (a Narrative's story), its parent,
 *   places, kin, kind and memberships links, an attribute named like a field that field when the
 *   value fits, every other key kept as `x_kanka_<key>` and reported;
 * - relationships as Relations (a two-way pair as one), a tag's Narrative linking what carries it;
 * - what Kanka hides imported carrying `hidden: true`, never dropped and never public: a private
 *   entity whole, a post not visible to all as its own Narrative, a relationship hidden on a side,
 *   and on a visible entity its private details in one hidden Narrative;
 * - exact duplicates folded into one; ids UUIDv5 of the campaign and Kanka's ids, so the same
 *   export twice gives the same folder.
 */

import { refuseUnknownOptions } from '../options';
import DATA from './kanka.json';
import {
  contentKey, Draft, DoorCore, empty, fieldByLower, fieldsOf, folderFiles, grouped, kindOf, madeNameLines,
  normKey, relationFieldFor, narrativeFieldFor, targetOf, worldOf,
  type OwConvertFolded, type OwConvertMadeName, type OwConvertProducer, type OwConvertUnplaced,
  type OwConvertUnresolved, type OwFolderFile,
} from './core';
import { htmlToMarkdown } from './html';
import {
  among, digitsValue, eq, format, get, intOfDigits, isDict, isInt, isList, isStr, loads, PY_SPACE,
  PyFloat, PyJsonError, repr, rstrip, str, strip, stripChars, truthy, type PyDict, type PyValue,
} from './py';
import { NotAZip, readExportZip } from './tree';
import { byCodePoint as byCodePointOf } from '../message';
import { uuid5 } from '../v2/keyed-id';
// A named import: the bundler inlines the one key, never the whole package.json.
import { name as PACKAGE_NAME, version as PACKAGE_VERSION } from '../../package.json';

// --- the data ---------------------------------------------------------------------

const D = DATA as typeof DATA & { made_names: OwConvertMadeName[] };
const W = D.words;
const WHERE = D.where;
const WHY = D.why;
const NOTE = D.notes;
const R = D.report;

const PREFIX = D.ext_prefix;
const MODULE_TYPES = new Map<string, string>(Object.entries(D.module_types));
const PROVEN = new Set<string>(D.proven_modules);
const STORY = new Set<string>(D.story_modules);
const PARENT_FIELD = new Map<string, string>(Object.entries(D.parent_fields));
const ROOT_FILES = new Set<string>(D.root_files);
const SETTINGS_FILES = new Set<string>(D.settings_files);
const ROW_HANDLED = new Set<string>(D.row_handled);
const ENTITY_HANDLED = new Set<string>(D.entity_handled);
const NOT_KEPT_KEYS = new Set<string>(D.not_kept_keys);
const KEPT_WHEN_TRUE = new Set<string>(D.kept_when_true);
const NOT_CONTENT = new Set<string>(D.not_content);
const POST_KEPT: string[] = D.post_kept;
const POST_DISPLAY = new Set<string>(D.post_display_settings);
const TRAIT_SECTIONS = new Map<number, { field: string; heading: string }>(
  Object.entries(D.trait_sections).map(([k, v]) => [Number(k), v]));
const CHARACTER_LISTS = D.character_lists as { key: string; id_key: string; folder: string; field: string; row_key: string | null }[];

/** The names this door makes, one record a kind, each kind counted in the report. */
export const KANKA_MADE_NAMES: readonly OwConvertMadeName[] = D.made_names;

/** The namespace every id this door mints is UUIDv5 in: UUIDv5 of the URL in `kanka.json` in RFC 4122's URL namespace. */
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

// --- Python's reading of a Kanka value ---------------------------------------------------

/** Kanka writes a flag as a boolean, 0/1 or `"0"`/`"1"`. */
const on = (v: PyValue): boolean => !among(v, [null, false, 0, '', '0', 'false']);
/** `visibility_id` 1 is "all"; none given reads as all. */
const isPublic = (v: PyValue): boolean => v === null || eq(v, 1) || v === '1';

/** An id written as a whole number or a string of digits; null for anything else (a boolean, a float). */
function intId(v: PyValue): number | null {
  if (typeof v === 'boolean') return null;
  if (isInt(v)) return v;
  if (isStr(v)) return intOfDigits(v);
  return null;
}

/** Python's `a or b or ...`: the first true value, else the last. */
function or(...vs: PyValue[]): PyValue {
  for (const v of vs) if (truthy(v)) return v;
  return vs[vs.length - 1];
}

/** Python's `for x in (v or [])`: a list's items, a dict's keys, a string's characters. */
function each(v: PyValue): PyValue[] {
  if (!truthy(v)) return [];
  if (isList(v)) return v;
  if (isDict(v)) return [...v.keys()];
  if (isStr(v)) return Array.from(v);
  throw new TypeError(`'${v instanceof PyFloat ? 'float' : typeof v === 'boolean' ? 'bool' : 'int'}' object is not iterable`);
}

const dicts = (v: PyValue): PyDict[] => each(v).filter(isDict);

const MENTION = /\[entity:(\p{Nd}+)(?:\|([^\]]*))?\]/gu;
const FILE_ID = /_(\p{Nd}+)\.json$/u;
const INT = new RegExp(`^[${PY_SPACE}]*(-?)(\\p{Nd}+)[${PY_SPACE}]*$`, 'u');

/** A moment as Python's `datetime.fromisoformat` reads the forms an export writes: microseconds, and whether it has an offset. */
interface Moment { us: bigint; aware: boolean }

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[^](\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?(?:([+-])(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,6}))?)?)?)?)?$/u;

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** `_when`: a string read as a moment, or null when it is not one (Python's ValueError). */
function when(v: PyValue): Moment | null {
  if (!isStr(v) || !v) return null;
  const m = ISO.exec(v.split('Z').join('+00:00'));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi, s] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  const frac = Number((m[7] ?? '').slice(0, 6).padEnd(6, '0'));
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1] || h > 23 || mi > 59 || s > 59) return null;
  let us = BigInt(daysFromCivil(y, mo, d)) * 86400000000n + BigInt(((h * 60 + mi) * 60 + s)) * 1000000n + BigInt(frac);
  const aware = m[8] !== undefined;
  if (aware) {
    const [oh, om, os] = [Number(m[9]), Number(m[10] ?? 0), Number(m[11] ?? 0)];
    const ofrac = Number((m[12] ?? '').padEnd(6, '0'));
    if (oh > 23 || om > 59 || os > 59) return null;
    const off = BigInt(((oh * 60 + om) * 60 + os)) * 1000000n + BigInt(ofrac);
    us = m[8] === '-' ? us + off : us - off;
  }
  return { us, aware };
}

/** Seconds from `a` to `b`; Python refuses to subtract a moment with an offset from one without. */
function secondsBetween(a: Moment, b: Moment): number {
  if (a.aware !== b.aware) throw new TypeError("can't subtract offset-naive and offset-aware datetimes");
  return Number(b.us - a.us) / 1e6;
}

// --- the report ---------------------------------------------------------------------

/** One export folder and what its entities became. */
export interface OwKankaModule {
  folder: string;
  type: string;
  entities: number;
  /** `proven` (read on a real export), `believed`, or `untyped` (Narratives, supertype `Article`). */
  status: 'proven' | 'believed' | 'untyped';
}

/** An entity's picture, named on its element as `x_kanka_image` but not imported. */
export interface OwKankaPicture {
  element: string;
  uuid: string;
  /** The upload's file in the export (`gallery/<uuid>.<ext>`); null when `gallery/` has no such upload. */
  path: string | null;
  /** The upload's own file name; null when there is none. */
  original: string | null;
  /** The upload is not visible to all and the element is: the uuid is kept alone. */
  private: boolean;
}

/** An element that carries a tag the tag's Narrative does not link. */
export interface OwKankaUntagged {
  tag: string;
  element: string;
  why: string;
}

/** What the source hides, imported carrying `hidden: true`: never dropped, never public. */
export interface OwKankaHidden {
  /** Entities marked private: elements carrying the mark. */
  entities: number;
  /** Posts not visible to all on a visible entity: each its own hidden Narrative. */
  posts: number;
  /** Relationships hidden on a side, or touching a hidden entity: hidden Relations. */
  relationships: number;
  /** On a visible entity, held in its hidden-details Narrative. */
  traits: number;
  personality: number;
  attributes: number;
  links: number;
  /** Hidden-details Narratives made. */
  details: number;
}

/** The report of one conversion: the Python door's report, field for field, and its text. */
export interface OwKankaReport {
  /** The export as the report names it (the `source` option). */
  source: string;
  /** The world's name, as `world.json` has it. */
  worldName: string;
  /** Elements written, by type, in code point order of the type. */
  counts: Record<string, number>;
  total: number;
  modules: OwKankaModule[];
  /** Relation elements made, by the relation's text, in the order of the text. */
  relations: { text: string; count: number }[];
  folded: OwConvertFolded[];
  unplaced: OwConvertUnplaced[];
  unresolved: OwConvertUnresolved[];
  hidden: OwKankaHidden;
  /** Names of the entities made within seconds of the campaign, Kanka's starter content perhaps (imported all the same). */
  possiblyStarter: string[];
  /** Uploads read in `gallery/`, and how many an entity names. */
  uploads: number;
  uploadsNamed: number;
  pictures: OwKankaPicture[];
  untagged: OwKankaUntagged[];
  /** Names made here, not taken whole from the export: a kind of `KANKA_MADE_NAMES` -> its elements, in declared order. */
  madeNames: Record<string, number>;
  notes: string[];
  /** The report's lines, as the Python door prints them, but its last (`kankaReportText` adds it). */
  lines: string[];
}

/** A conversion: the world folder's files, in code point order of their paths, and the report. */
export interface OwKankaConversion {
  files: OwFolderFile[];
  report: OwKankaReport;
}

export interface OwConvertKankaOptions {
  /** How the report names the export (the Python door prints the path it was given). Default `export.zip`. */
  source?: string;
  /** The tool `world.json`'s `producer` line names, and its version. Default this package and its version, `{ tool: '@onlyworlds/sdk', version: '<the installed version>' }`. */
  producer?: OwConvertProducer;
}

const OPTION_KEYS: readonly (keyof OwConvertKankaOptions)[] = ['source', 'producer'];
const PRODUCER_KEYS: readonly (keyof OwConvertProducer)[] = ['tool', 'version'];

/** Why an export was refused, nothing returned: `not_a_zip`, or `not_an_export` (no `campaign.json` with an id). */
export type OwConvertErrorReason = 'not_a_zip' | 'not_an_export';

/** An export was refused; the message is the Python door's. */
export class OwConvertError extends Error {
  readonly reason: OwConvertErrorReason;
  constructor(reason: OwConvertErrorReason, message: string) {
    super(message);
    this.name = 'OwConvertError';
    this.reason = reason;
  }
}

/** The report's whole text, as the Python door prints it: its lines, then where it was written (`out`), or that it was a plan (null). */
export function kankaReportText(report: OwKankaReport, out: string | null): string {
  return [...report.lines, out !== null ? format(R.wrote, { out }) : R.plan].join('\n') + '\n';
}

// --- the reader -------------------------------------------------------------------------

/** One entity's element being built. */
class Item extends Draft {
  readonly secret = new Map<string, string[]>();
  readonly secretExt: PyDict = new Map();
  readonly secretMentions: string[] = [];
  constructor(
    readonly folder: string,
    readonly row: PyDict,
    readonly ent: PyDict,
    readonly entityId: number,
    type: string,
    id: string,
    name: string,
    readonly typed: boolean,
  ) {
    super(type, id, name);
  }
}

const NARRATIVE_FIELDS = fieldsOf('narrative').map(([f]) => f);
const RELATION_FIELDS = fieldsOf('relation').map(([f]) => f);

class Reader {
  readonly core: DoorCore;
  campaign: PyDict = new Map();
  readonly items: Item[] = [];
  readonly byEntity = new Map<number, Item>();
  /** `folder:row id` -> item: what a row's foreign key names. */
  readonly byRow = new Map<string, Item>();
  readonly relations: PyDict[] = [];
  readonly narratives: PyDict[] = [];
  readonly uploads = new Map<string, [string, PyDict]>();
  readonly namedUploads = new Set<string>();
  readonly modules: OwKankaModule[] = [];
  readonly relationCounts = new Map<string, number>();
  readonly hidden: OwKankaHidden = { entities: 0, posts: 0, relationships: 0, traits: 0, personality: 0, attributes: 0, links: 0, details: 0 };
  readonly possiblyStarter: string[] = [];
  readonly pictures: OwKankaPicture[] = [];
  readonly untagged: OwKankaUntagged[] = [];

  constructor(readonly files: Map<string, () => Uint8Array>, readonly source: string, notes: string[]) {
    this.core = new DoorCore(PREFIX, uuid5Namespace(), [...notes]);
  }

  private row(folder: string, rowId: number): Item | undefined {
    return this.byRow.get(`${folder}:${rowId}`);
  }

  /** A file's JSON (UTF-8, a byte order mark dropped); null, and a note naming Python's error, when it is not readable. */
  private json(rel: string): PyValue {
    const bytes = this.files.get(rel)!();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      this.core.note(format(NOTE.not_json, { rel, error: 'UnicodeDecodeError' }));
      return null;
    }
    try {
      return loads(text);
    } catch (err) {
      if (!(err instanceof PyJsonError)) throw err;
      this.core.note(format(NOTE.not_json, { rel, error: err.pyName }));
      return null;
    }
  }

  private id(...parts: string[]): string {
    return this.core.id(['kanka', str(get(this.campaign, 'id')), ...parts].join(':'));
  }

  // -- pass 1: every entity, with its type and id ------------------------------------------

  collect(): void {
    const campaign = this.files.has(D.campaign_file) ? this.json(D.campaign_file) : null;
    if (!isDict(campaign) || empty(get(campaign, 'id'))) {
      throw new OwConvertError('not_an_export', format(D.errors.no_campaign, { source: this.source }));
    }
    this.campaign = campaign;
    const info = this.files.has(D.info_file) ? this.json(D.info_file) : null;
    if (isDict(info)) {
      const version = get(info, 'export_version');
      this.core.note(format(NOTE.version, { kanka_version: get(info, 'kanka_version'), version })
        + (str(version) === D.proven_export_version ? '' : format(NOTE.version_unproven, { proven: D.proven_export_version })));
    }
    const born = when(get(campaign, 'created_at'));
    const plans = new Map<string, number>();
    for (const rel of [...this.files.keys()].sort(byCodePointOf)) {
      const parts = rel.split('/');
      if (parts.length === 1) {
        if (!ROOT_FILES.has(rel)) this.core.note(format(NOTE.root_file, { rel }));
        continue;
      }
      const folder = parts[0];
      if (folder === D.settings) {
        this.setting(rel);
        continue;
      }
      if (folder === D.gallery) {
        this.upload(rel, parts);
        continue;
      }
      if (parts.length !== 2 || !rel.toLowerCase().endsWith('.json')) {
        this.core.note(format(NOTE.not_entity_file, { rel }));
        continue;
      }
      const row = this.json(rel);
      if (row === null) continue;
      const ent = isDict(row) ? get(row, 'entity') : null;
      const entityId = isDict(ent) ? intId(get(ent, 'id')) : null;
      if (!isDict(row) || !isDict(ent) || entityId === null) {
        this.core.note(format(NOTE.no_entity, { rel }));
        continue;
      }
      const m = FILE_ID.exec(rel);
      if (m && digitsValue(m[1]) !== entityId) this.core.note(format(NOTE.filename_id, { rel, entity_id: entityId }));
      if (this.byEntity.has(entityId)) {
        this.core.note(format(NOTE.second_file, { rel, entity_id: entityId }));
        continue;
      }
      const given = strip(str(or(get(ent, 'name'), get(row, 'name'), '')));
      const name = given || format(W.untitled, { entity_id: entityId });
      const type = MODULE_TYPES.get(folder) ?? D.untyped_type;
      const item = new Item(folder, row, ent, entityId, type, this.id(String(entityId)), name, MODULE_TYPES.has(folder));
      if (!given) this.core.named.set(item.id, 'untitled-entity');
      if (on(get(ent, 'is_private')) || on(get(row, 'is_private'))) {
        item.hidden = true;
        this.hidden.entities++;
      }
      this.items.push(item);
      this.byEntity.set(entityId, item);
      const rowId = intId(get(row, 'id'));
      if (rowId !== null) this.byRow.set(`${folder}:${rowId}`, item);
      plans.set(folder, (plans.get(folder) ?? 0) + 1);
      const made = when(get(ent, 'created_at'));
      if (born !== null && made !== null) {
        const s = secondsBetween(born, made);
        if (s >= 0 && s <= D.starter_window) this.possiblyStarter.push(name);
      }
    }
    for (const folder of [...plans.keys()].sort(byCodePointOf)) {
      const status = PROVEN.has(folder) ? 'proven' : MODULE_TYPES.has(folder) ? 'believed' : 'untyped';
      this.modules.push({ folder, type: MODULE_TYPES.get(folder) ?? D.untyped_type, entities: plans.get(folder)!, status });
    }
  }

  private setting(rel: string): void {
    const data = this.json(rel);
    if (rel === D.custom_modules_file && truthy(data)) this.core.note(format(NOTE.custom_modules, { rel }));
    else if (!SETTINGS_FILES.has(rel)) this.core.note(format(NOTE.settings_file, { rel }));
  }

  private upload(rel: string, parts: string[]): void {
    if (parts.length !== 2 || !rel.toLowerCase().endsWith('.json')) return;
    const data = this.json(rel);
    if (!isDict(data)) return;
    const stem = rel.slice(0, -'.json'.length);
    const key = strip(str(or(get(data, 'id'), ''))) || parts[1].slice(0, -'.json'.length);
    if (!this.uploads.has(key)) this.uploads.set(key, [stem, data]);
  }

  // -- pass 2: fields, links, text ---------------------------------------------------------

  fill(): void {
    for (const item of this.items) this.fillItem(item);
    this.memberships();
    this.tags();
    for (const item of this.items) this.details(item);
    this.relationships();
  }

  private fold(item: Item, what: string, rows: PyDict[], nameKey = 'name'): PyDict[] {
    return this.core.fold(what, rows, r => contentKey(r, NOT_CONTENT), () => item.name, r => str(or(get(r, nameKey), '')));
  }

  /** Entry HTML as Markdown, mentions as names (collected into `into`), unresolved ones as written. `shown`: on a visible element. */
  private text(item: Item, html: PyValue, into: string[] = item.mentions, shown = true): string {
    const md = htmlToMarkdown(isStr(html) ? html : null);
    return md.replace(MENTION, (whole, digits: string, label: string | undefined) => {
      const target = this.byEntity.get(digitsValue(digits));
      if (target === undefined) {
        this.core.unresolved(item.name, WHERE.mention, digits, WHY.no_entity);
        return whole;
      }
      if (target !== item && !into.includes(target.id)) into.push(target.id);
      if (shown && !item.hidden && target.hidden) this.core.note(format(NOTE.mentions_hidden, { element: item.name, target: target.name }));
      return label ? label : target.name;
    });
  }

  private hide(item: Item, heading: string, line: string): void {
    if (!item.secret.has(heading)) item.secret.set(heading, []);
    item.secret.get(heading)!.push(line);
  }

  private fillItem(item: Item): void {
    const { row, ent } = item;
    for (const k of ['id', 'entity_id', 'module', 'parent', 'mentions']) item.taken.add(`${PREFIX}${k}`);
    this.core.own(item, 'id', get(row, 'id'));
    this.core.own(item, 'entity_id', item.entityId);
    this.core.own(item, 'module', item.folder);
    const kind = !empty(get(ent, 'type')) ? get(ent, 'type') : get(row, 'type');
    if (item.typed) {
      if (!empty(kind)) item.fields.set('supertype', str(kind));
    } else {
      item.fields.set('supertype', D.untyped_supertype);
      item.fields.set('subtype', item.folder);
      if (!empty(kind)) this.core.keep(item, 'type', kind, WHY.untyped_type);
    }
    this.parent(item);
    this.image(item);

    const parts: string[] = [];
    const entry = !empty(get(ent, 'entry')) ? get(ent, 'entry') : get(row, 'entry');
    const text = this.text(item, entry);
    if (text) parts.push(text);
    if (!empty(get(row, 'entry')) && !empty(get(ent, 'entry')) && !eq(get(row, 'entry'), get(ent, 'entry'))) {
      this.core.keep(item, 'entry', get(row, 'entry'), WHY.entry_differs);
    }
    parts.push(...this.posts(item));
    const body = parts.join('\n\n');
    if (body) item.fields.set(item.type === 'narrative' && STORY.has(item.folder) ? 'story' : 'description', body);

    if (item.type === 'character') this.character(item);
    this.places(item);
    this.attributes(item);
    if (item.folder !== D.organisations && !empty(get(row, 'members'))) {
      this.core.keep(item, 'members', get(row, 'members'), WHY.members_elsewhere);
    }
    this.generic(item);
  }

  private parent(item: Item): void {
    // A child's entity.parent_id is the parent's entity id (the number in its filename), never its row id.
    const raw = get(item.ent, 'parent_id');
    const pid = intId(raw);
    if (pid === null) {
      if (!empty(raw)) this.core.keep(item, 'parent_id', raw, WHY.parent_not_id);
      return;
    }
    const parent = this.byEntity.get(pid);
    if (parent === undefined) {
      this.core.unresolved(item.name, WHERE.parent, String(pid), WHY.no_entity);
      this.core.keep(item, 'parent_id', pid, WHY.parent_missing);
      return;
    }
    this.core.own(item, 'parent', parent.id);
    const field = PARENT_FIELD.get(item.type);
    if (field && parent.type === item.type) item.fields.set(field, parent.id);
  }

  private image(item: Item): void {
    const raw = !empty(get(item.ent, 'image_uuid')) ? get(item.ent, 'image_uuid') : get(item.row, 'image_uuid');
    if (empty(raw)) return;
    const key = strip(str(raw));
    const found = this.uploads.get(key);
    if (found === undefined) {
      this.core.own(item, 'image', new Map([['uuid', key]]));
      this.pictures.push({ element: item.name, uuid: key, path: null, original: null, private: false });
      return;
    }
    const [stem, data] = found;
    this.namedUploads.add(key);
    if (!item.hidden && !isPublic(get(data, 'visibility_id'))) {
      this.core.own(item, 'image', new Map([['uuid', key]]));
      this.pictures.push({ element: item.name, uuid: key, path: null, original: null, private: true });
      return;
    }
    const image: PyDict = new Map([['uuid', key]]);
    for (const k of ['name', 'ext']) if (!empty(get(data, k))) image.set(k, get(data, k));
    this.core.own(item, 'image', image);
    const ext = get(data, 'ext');
    const path = !empty(ext) ? `${stem}.${str(ext)}` : stem;
    const original = ['name', 'ext'].filter(k => !empty(get(data, k))).map(k => str(get(data, k))).join('.') || null;
    this.pictures.push({ element: item.name, uuid: key, path, original, private: false });
  }

  private posts(item: Item): string[] {
    let posts = dicts(get(item.ent, 'posts'));
    const sortKey = (p: PyDict): [number, number, number] =>
      [get(p, 'position') === null ? 1 : 0, intId(get(p, 'position')) || 0, intId(get(p, 'id')) || 0];
    posts = posts.map((p, i) => ({ p, k: sortKey(p), i }))
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
      .map(x => x.p);
    posts = this.fold(item, 'post', posts);
    const out: string[] = [];
    const meta: PyValue[] = [];
    for (const p of posts) {
      const name = strip(str(or(get(p, 'name'), ''))) || W.post;
      if (!item.hidden && !isPublic(get(p, 'visibility_id'))) {
        this.postNarrative(item, p, name);
        continue;
      }
      const text = this.text(item, get(p, 'entry'));
      out.push(text ? `## ${name}\n\n${text}` : `## ${name}`);
      const extra: PyDict = new Map();
      for (const k of POST_KEPT) if (on(get(p, k))) extra.set(k, get(p, k));
      const settings = get(p, 'settings');
      if (isDict(settings) && [...settings.keys()].some(k => !POST_DISPLAY.has(k))) extra.set('settings', settings);
      if (!isPublic(get(p, 'visibility_id'))) extra.set('visibility_id', get(p, 'visibility_id'));
      if (extra.size) meta.push(new Map<string, PyValue>([['name', name], ...extra]));
    }
    if (meta.length) this.core.keep(item, 'posts_meta', meta, WHY.posts_meta);
    return out;
  }

  private hiddenNarrative(key: string, name: string, story: string, item: Item, ext: PyDict, mentions: string[]): void {
    const fields = new Map<string, PyValue>();
    if (story) fields.set('story', story);
    this.core.linkBack(fields, item);
    const body: PyDict = new Map<string, PyValue>([['type', 'narrative'], ['id', this.id(key)], ['name', name], ['hidden', true]]);
    for (const f of NARRATIVE_FIELDS) if (fields.has(f)) body.set(f, fields.get(f)!);
    body.set(`${PREFIX}parent`, item.id);
    for (const [k, v] of ext) body.set(k, v);
    if (mentions.length) body.set(`${PREFIX}mentions`, mentions);
    this.narratives.push(body);
  }

  private postNarrative(item: Item, p: PyDict, name: string): void {
    const mentions: string[] = [];
    const text = this.text(item, get(p, 'entry'), mentions, false);
    const ext: PyDict = new Map<string, PyValue>([[`${PREFIX}id`, get(p, 'id')], [`${PREFIX}module`, 'posts']]);
    ext.set(`${PREFIX}visibility_id`, get(p, 'visibility_id'));
    for (const k of POST_KEPT) if (on(get(p, k))) ext.set(`${PREFIX}${k}`, get(p, k));
    const key = `post:${str(get(p, 'id'))}`;
    this.hiddenNarrative(key, name, text, item, ext, mentions);
    if (!strip(str(or(get(p, 'name'), '')))) this.core.named.set(this.id(key), 'untitled-post');
    this.hidden.posts++;
  }

  private details(item: Item): void {
    if (!item.secret.size && !item.secretExt.size) return;
    const story = [...item.secret].map(([h, lines]) => `## ${h}\n\n${lines.join('\n')}`).join('\n\n');
    const ext: PyDict = new Map<string, PyValue>([[`${PREFIX}entity_id`, item.entityId], ...item.secretExt]);
    const key = `hidden:${item.entityId}`;
    this.hiddenNarrative(key, format(W.hidden_details, { name: item.name }), story, item, ext, item.secretMentions);
    this.core.named.set(this.id(key), 'hidden-details');
    this.hidden.details++;
  }

  private character(item: Item): void {
    const row = item.row;
    const traits = this.fold(item, 'trait', dicts(get(row, 'character_traits')));
    const personalityHidden = get(row, 'is_personality_visible') !== null && !on(get(row, 'is_personality_visible'));
    const sections = new Map<number, string[]>();
    const other: PyValue[] = [];
    for (const t of traits) {
      const section = intId(get(t, 'section_id'));
      const priv = on(get(t, 'is_private'));
      const tname = strip(str(or(get(t, 'name'), '')));
      if (!item.hidden && (priv || (section === D.personality_section && personalityHidden))) {
        const entry = this.text(item, get(t, 'entry'), item.secretMentions, false);
        const heading = TRAIT_SECTIONS.get(section || 0)?.heading ?? W.traits_heading;
        this.hide(item, heading, strip(`${tname}: ${entry}`));
        if (priv) this.hidden.traits++;
        else this.hidden.personality++;
        continue;
      }
      const line = strip(`${tname}: ${this.text(item, get(t, 'entry'))}`);
      if (section !== null && TRAIT_SECTIONS.has(section)) {
        if (!sections.has(section)) sections.set(section, []);
        sections.get(section)!.push(line);
      } else {
        other.push(new Map<string, PyValue>([['name', get(t, 'name')], ['entry', get(t, 'entry')], ['section_id', get(t, 'section_id')]]));
      }
    }
    const dead = on(get(row, 'is_dead'));
    for (const [section, to] of TRAIT_SECTIONS) {
      let text = (sections.get(section) ?? []).join('\n');
      if (dead && to.field === D.deceased_field) text = rstrip(`${W.deceased}${text}`);
      if (text) item.fields.set(to.field, text);
    }
    if (other.length) this.core.keep(item, 'traits', other, WHY.traits_other);
    for (const lst of CHARACTER_LISTS) {
      const ids = this.list(item, lst.key, lst.id_key);
      if (lst.row_key !== null && intId(get(row, lst.row_key)) !== null) ids.push(get(row, lst.row_key));
      this.linkRows(item, lst.field, lst.folder, ids, lst.key);
    }
  }

  /** The ids a row's list names (`[{"race_id": 3}, ...]` or `[3, ...]`); the list kept when it says more. */
  private list(item: Item, key: string, idKey: string): PyValue[] {
    const ids: PyValue[] = [];
    let more = false;
    const skip = new Set([idKey, 'id', 'is_private', ...NOT_CONTENT]);
    for (const x of each(get(item.row, key))) {
      if (isDict(x)) {
        if (on(get(x, 'is_private')) && !item.hidden) {
          const ext = `${PREFIX}${normKey(key)}`;
          if (!item.secretExt.has(ext)) item.secretExt.set(ext, []);
          (item.secretExt.get(ext) as PyValue[]).push(x);
          this.hidden.links++;
          continue;
        }
        ids.push(get(x, idKey));
        if ([...x].some(([k, v]) => !empty(v) && !skip.has(k))) more = true;
      } else ids.push(x);
    }
    if (more) {
      const shown = each(get(item.row, key)).filter(x => item.hidden || !(isDict(x) && on(get(x, 'is_private'))));
      this.core.keep(item, key, shown, WHY.list_more);
    }
    return ids;
  }

  /** Module row ids of `folder` onto the multi-link `field`. */
  private linkRows(item: Item, field: string, folder: string, rawIds: PyValue[], where: string): void {
    const ids: string[] = [];
    for (const raw of rawIds) {
      const rid = intId(raw);
      const target = rid !== null ? this.row(folder, rid) : undefined;
      if (target === undefined) this.core.unresolved(item.name, where, str(raw), format(WHY.no_row, { folder }));
      else if (!ids.includes(target.id)) ids.push(target.id);
    }
    if (ids.length) {
      if (!item.fields.has(field)) item.fields.set(field, []);
      const links = item.fields.get(field) as string[];
      links.push(...ids.filter(e => !links.includes(e)));
    }
  }

  private places(item: Item): void {
    const raw = each(get(item.ent, 'entityLocations')).map(x => (isDict(x) ? get(x, 'location_id') : x));
    if (intId(get(item.row, 'location_id')) !== null) raw.push(get(item.row, 'location_id'));
    const ids: string[] = [];
    for (const r of raw) {
      const rid = intId(r);
      const target = rid !== null ? this.row('locations', rid) : undefined;
      if (target === undefined) this.core.unresolved(item.name, 'entityLocations', str(r), WHY.no_locations_row);
      else if (!ids.includes(target.id)) ids.push(target.id);
    }
    if (!ids.length) return;
    const t = item.type;
    if (kindOf(t, 'location') === 'single_link' && targetOf(t, 'location') === 'location') {
      item.fields.set('location', ids[0]);
      if (ids.length > 1) this.core.keep(item, 'locations', ids, WHY.locations_one);
    } else if (kindOf(t, 'locations') === 'multi_link' && targetOf(t, 'locations') === 'location') {
      item.fields.set('locations', ids);
    } else {
      this.core.keep(item, 'locations', ids, format(WHY.no_location_field, { type: t }));
    }
  }

  private attributes(item: Item): void {
    const attrs = dicts(get(item.ent, 'entityAttributes'));
    const allPrivate = on(get(item.ent, 'is_attributes_private'));
    for (const a of this.fold(item, 'attribute', attrs)) {
      if (!item.hidden && (allPrivate || on(get(a, 'is_private')) || on(get(a, 'is_hidden')))) {
        const raw = get(a, 'value');
        if (empty(raw) || !strip(str(or(get(a, 'name'), '')))) continue; // a name with no value (a heading) carries nothing
        const value = isStr(raw) ? this.text(item, raw, item.secretMentions, false) : raw;
        this.hide(item, W.attributes_heading, `${strip(str(get(a, 'name')))}: ${str(value)}`);
        this.hidden.attributes++;
        continue;
      }
      this.attribute(item, a);
    }
  }

  private attribute(item: Item, a: PyDict): void {
    const key = strip(str(or(get(a, 'name'), '')));
    const raw = get(a, 'value');
    if (empty(raw) || !key) return;
    const before = [...item.mentions];
    const text: PyValue = isStr(raw) ? this.text(item, raw) : raw;
    const field = fieldByLower(item.type, normKey(key));
    let why: string;
    if (field === undefined) why = format(WHY.no_field, { type: item.type, field: normKey(key) });
    else if (field === 'name' || field === 'supertype' || field === 'subtype' || item.fields.has(field)) {
      why = format(WHY.already_set, { field });
    } else {
      const kind = kindOf(item.type, field);
      if (kind === 'text') {
        item.fields.set(field, str(text));
        return;
      }
      if (kind === 'integer') {
        if (typeof raw === 'boolean') {
          item.fields.set(field, raw ? 1 : 0);
          return;
        }
        if (isInt(raw)) {
          item.fields.set(field, raw);
          return;
        }
        const m = isStr(raw) ? INT.exec(raw) : null;
        if (m) {
          const n = digitsValue(m[2]);
          item.fields.set(field, m[1] && n !== 0 ? -n : n);
          return;
        }
        why = format(WHY.not_integer, { field });
      } else {
        const target = targetOf(item.type, field) ?? '';
        const s = str(raw);
        const ids = [...s.matchAll(MENTION)].map(m => digitsValue(m[1]));
        const rest = stripChars(s.replace(MENTION, ''), ' ,;\n');
        const hits = ids.map(i => this.byEntity.get(i));
        const distinct = new Set(ids).size;
        if (!ids.length || rest) why = format(WHY.not_mentions, { field, target });
        else if (hits.some(h => h === undefined || h.type !== target)) why = format(WHY.mention_not_found, { field, target });
        else if (kind === 'single_link' && distinct > 1) why = format(WHY.links_one, { field, n: distinct });
        else {
          const linked = [...new Set(hits.map(h => h!.id))];
          item.fields.set(field, kind === 'single_link' ? linked[0] : linked);
          item.mentions.length = 0;
          item.mentions.push(...before);
          return;
        }
      }
    }
    this.core.keep(item, key, text, why);
  }

  /** Every key of the row and the entity not read above, kept as `x_kanka_<key>`. */
  private generic(item: Item): void {
    for (const [where, data, handled] of [['row', item.row, ROW_HANDLED], ['entity', item.ent, ENTITY_HANDLED]] as const) {
      for (const [key, value] of data) {
        if (handled.has(key) || NOT_KEPT_KEYS.has(key) || empty(value)) continue;
        if (KEPT_WHEN_TRUE.has(key) && !on(value)) continue;
        this.core.keep(item, key, value, format(WHY.no_field_for_key, { where, key }));
      }
    }
  }

  // -- links that need every element ---------------------------------------------------------

  private memberships(): void {
    for (const org of this.items) {
      if (org.folder !== D.organisations) continue;
      for (const m of each(get(org.row, 'members'))) {
        const cid = isDict(m) ? intId(get(m, 'character_id')) : intId(m);
        if (isDict(m) && on(get(m, 'is_private')) && !org.hidden) {
          const ext = `${PREFIX}members`;
          if (!org.secretExt.has(ext)) org.secretExt.set(ext, []);
          (org.secretExt.get(ext) as PyValue[]).push(m);
          this.hidden.links++;
          continue;
        }
        const member = cid !== null ? this.row('characters', cid) : undefined;
        if (member === undefined) {
          this.core.unresolved(org.name, 'members', cid === null ? 'None' : String(cid), WHY.no_characters_row);
          continue;
        }
        if (!member.fields.has('institutions')) member.fields.set('institutions', []);
        const links = member.fields.get('institutions') as string[];
        if (!links.includes(org.id)) links.push(org.id);
      }
      const members = each(get(org.row, 'members')).filter(m => org.hidden || !(isDict(m) && on(get(m, 'is_private'))));
      const skip = new Set(['id', 'character_id', 'organisation_id', 'is_private', ...NOT_CONTENT]);
      if (members.some(m => isDict(m) && [...m].some(([k, v]) => !skip.has(k) && !empty(v)))) {
        this.core.keep(org, 'members', members, WHY.member_role);
      }
    }
  }

  /** A tag's Narrative links each element that carries it, tags and carriers in entity id order; a visible tag never links a hidden element. */
  private tags(): void {
    const carried = new Map<number, Map<number, Item>>();
    for (const item of this.items) {
      for (const t of each(get(item.ent, 'entityTags'))) {
        const raw = isDict(t) ? get(t, 'tag_id') : t;
        const rid = intId(raw);
        const tag = rid !== null ? this.row('tags', rid) : undefined;
        if (tag === undefined) {
          this.core.unresolved(item.name, 'entityTags', str(raw), WHY.no_tags_row);
          continue;
        }
        if (!carried.has(tag.entityId)) carried.set(tag.entityId, new Map());
        carried.get(tag.entityId)!.set(item.entityId, item);
      }
    }
    for (const tagId of [...carried.keys()].sort((a, b) => a - b)) {
      const tag = this.byEntity.get(tagId)!;
      const carriers = carried.get(tagId)!;
      for (const entityId of [...carriers.keys()].sort((a, b) => a - b)) {
        const item = carriers.get(entityId)!;
        if (item.hidden && !tag.hidden) {
          this.untagged.push({ tag: tag.name, element: item.name, why: WHY.tag_hidden });
          continue;
        }
        const field = narrativeFieldFor(item.type);
        if (field === undefined) {
          this.untagged.push({ tag: tag.name, element: item.name, why: format(WHY.tag_no_field, { type: item.type }) });
          continue;
        }
        if (!tag.fields.has(field)) tag.fields.set(field, []);
        const links = tag.fields.get(field) as string[];
        if (!links.includes(item.id)) links.push(item.id);
      }
    }
  }

  private relationships(): void {
    const rows = new Map<number, [Item, PyDict]>();
    for (const item of this.items) {
      for (const rel of each(get(item.ent, 'relationships'))) {
        const rid = isDict(rel) ? intId(get(rel, 'id')) : null;
        if (rid === null || !isDict(rel)) continue;
        rows.set(rid, [item, rel]);
      }
    }
    type Unit = [number, Item, PyDict, PyDict | null];
    const units: Unit[] = [];
    const used = new Set<number>();
    for (const rid of [...rows.keys()].sort((a, b) => a - b)) {
      if (used.has(rid)) continue;
      const [item, rel] = rows.get(rid)!;
      const mid = intId(get(rel, 'mirror_id'));
      const pair = mid !== null ? rows.get(mid) : undefined;
      if (mid !== null && pair !== undefined && intId(get(pair[1], 'mirror_id')) === rid && !used.has(mid)) {
        used.add(rid);
        used.add(mid);
        units.push([rid, item, rel, pair[1]]);
      } else {
        used.add(rid);
        if (mid !== null && !rows.has(mid)) {
          this.core.note(format(NOTE.mirror_missing, { relation: get(rel, 'relation'), element: item.name, mirror: mid }));
        }
        units.push([rid, item, rel, null]);
      }
    }
    // fold exact copies: the same owner, target, text and every other field, on both sides
    const kept = this.core.fold(
      'relationship', units,
      ([, , rel, mirror]) => `${contentKey(rel, NOT_CONTENT)}|${mirror !== null ? contentKey(mirror, NOT_CONTENT) : ''}`,
      ([, owner]) => owner.name,
      ([, , rel]) => str(or(get(rel, 'relation'), '')),
    );
    for (const unit of kept) this.relation(...unit);
  }

  private relation(rid: number, owner: Item, rel: PyDict, mirror: PyDict | null): void {
    const text = strip(str(or(get(rel, 'relation'), '')));
    const tid = intId(get(rel, 'target_id'));
    const target = tid !== null ? this.byEntity.get(tid) : undefined;
    if (target === undefined) {
      this.core.unresolved(owner.name, format(WHERE.relationship, { text }), str(get(rel, 'target_id')), WHY.no_entity);
      return;
    }
    const name = text || W.relationship;
    if (!text) this.core.note(format(NOTE.no_text, { owner: owner.name, target: target.name, name }));
    const fields = new Map<string, PyValue>();
    if (owner.type === 'character') fields.set('actor', owner.id);
    for (const end of owner.type !== 'character' ? [owner, target] : [target]) {
      const field = relationFieldFor(end.type);
      if (field === undefined) {
        this.core.note(format(NOTE.no_relation_field, { name, owner: owner.name, type: end.type, end: end.name }));
        continue;
      }
      if (!fields.has(field)) fields.set(field, []);
      const links = fields.get(field) as string[];
      if (!links.includes(end.id)) links.push(end.id);
    }
    const id = this.id('relation', String(rid));
    const body: PyDict = new Map<string, PyValue>([['type', 'relation'], ['id', id], ['name', name]]);
    if (!text) this.core.named.set(id, 'untitled-relationship');
    const sides = mirror !== null ? [rel, mirror] : [rel];
    if (owner.hidden || target.hidden || sides.some(s => !isPublic(get(s, 'visibility_id')))) {
      body.set('hidden', true);
      this.hidden.relationships++;
    }
    for (const f of RELATION_FIELDS) if (fields.has(f)) body.set(f, fields.get(f)!);
    body.set(`${PREFIX}id`, rid);
    body.set(`${PREFIX}source`, owner.id);
    body.set(`${PREFIX}target`, target.id);
    if (mirror !== null) {
      body.set(`${PREFIX}two_way`, true);
      const content = (r: PyDict): PyDict => new Map([...r].filter(([k]) => !NOT_CONTENT.has(k) && k !== 'owner_id' && k !== 'target_id'));
      const mine = content(rel);
      const theirs = content(mirror);
      const differs: PyDict = new Map();
      for (const k of [...theirs.keys()].sort(byCodePointOf)) {
        if (!eq(get(mine, k), theirs.get(k)!)) differs.set(k, theirs.get(k)!);
      }
      if (differs.size) body.set(`${PREFIX}mirror`, differs);
    }
    if (get(rel, 'attitude') !== null) body.set(`${PREFIX}attitude`, get(rel, 'attitude'));
    if (!empty(get(rel, 'colour'))) body.set(`${PREFIX}colour`, get(rel, 'colour'));
    if (!isPublic(get(rel, 'visibility_id'))) body.set(`${PREFIX}visibility_id`, get(rel, 'visibility_id'));
    this.relations.push(body);
    this.relationCounts.set(name, (this.relationCounts.get(name) ?? 0) + 1);
  }

  // -- the bodies and the world -------------------------------------------------------------

  bodies(): PyDict[] {
    const out = [...this.items.map(item => this.core.body(item)), ...this.narratives, ...this.relations];
    if (this.items.length) this.core.note(NOTE.not_kept);
    return out;
  }

  world(producer: OwConvertProducer): PyDict {
    const cid = get(this.campaign, 'id');
    const name = strip(str(or(get(this.campaign, 'name'), ''))) || format(W.campaign, { id: cid });
    const entry = get(this.campaign, 'entry');
    return worldOf(this.core.id(`kanka:${str(cid)}`), name, !empty(entry) ? htmlToMarkdown(str(entry)) : null, producer, D.producer_input);
  }
}

let namespace: string | null = null;
function uuid5Namespace(): string {
  namespace ??= uuid5(NAMESPACE_URL, D.namespace_url);
  return namespace;
}

// --- the report's text ------------------------------------------------------------------------

function counted(n: number, pair: string[]): string {
  return `${n} ${n === 1 ? pair[0] : pair[1]}`;
}

/** The report's lines, the Python door's `render` but its last line, every word from `kanka.json`. */
function render(r: Omit<OwKankaReport, 'lines'>): string[] {
  const lines: string[] = [];
  const byType = Object.entries(r.counts).map(([t, n]) => `${t} ${n}`).join(', ');
  lines.push(format(R.head, { source: r.source, name: r.worldName, total: r.total, by_type: byType || R.head_none }));
  if (r.modules.length) {
    lines.push(R.modules);
    for (const m of r.modules) {
      const how = format(R.how[m.status], { supertype: D.untyped_supertype, folder: m.folder });
      lines.push(format(R.module, { folder: m.folder, entities: m.entities, type: m.type, how }));
    }
  }
  if (r.relations.length) {
    const listed = r.relations.map(x => `${repr(x.text)} ${x.count}`).join(', ');
    lines.push(format(R.relations, { n: r.relations.reduce((a, x) => a + x.count, 0), listed }));
  }
  if (r.folded.length) {
    lines.push(format(R.folded, { n: r.folded.length }));
    for (const f of r.folded) lines.push(format(R.fold, { element: f.element, copies: f.copies, what: f.what, name: f.name }));
  }
  if (r.possiblyStarter.length) {
    lines.push(format(R.starter, { window: D.starter_window, listed: r.possiblyStarter.map(repr).join(', ') }));
  }
  const h = r.hidden as unknown as Record<string, number>;
  const said = Object.entries(R.hidden_elements).filter(([k]) => h[k]).map(([k, pair]) => counted(h[k], pair));
  const inside = Object.entries(R.hidden_held).filter(([k]) => h[k]).map(([k, pair]) => counted(h[k], pair));
  if (inside.length) said.push(format(R.hidden_details[r.hidden.details === 1 ? 0 : 1], { n: r.hidden.details, held: inside.join(', ') }));
  if (said.length) lines.push(format(R.hidden, { said: said.join('; ') }));
  if (r.untagged.length) {
    lines.push(format(R.untagged, { n: r.untagged.length }));
    for (const u of r.untagged) lines.push(format(R.untag, { tag: u.tag, element: u.element, why: u.why }));
  }
  if (r.uploads) lines.push(format(R.uploads[r.uploads === 1 ? 0 : 1], { n: r.uploads, named: r.uploadsNamed }));
  if (r.pictures.length) {
    lines.push(format(R.pictures, { n: r.pictures.length }));
    for (const p of r.pictures) {
      if (p.private) lines.push(format(R.picture_private, { element: p.element, uuid: p.uuid }));
      else if (p.path === null) lines.push(format(R.picture_missing, { element: p.element, uuid: p.uuid }));
      else lines.push(format(p.original ? R.picture_original : R.picture, { element: p.element, path: p.path, original: p.original }));
    }
  }
  if (r.unplaced.length) {
    lines.push(format(R.unplaced, { n: r.unplaced.length }));
    for (const u of r.unplaced) lines.push(format(R.unplaced_item, { element: u.element, key: u.key, why: u.why, kept_as: u.keptAs }));
  }
  if (r.unresolved.length) {
    lines.push(format(R.unresolved, { n: r.unresolved.length }));
    for (const u of r.unresolved) lines.push(format(R.unresolved_item, { element: u.element, where: u.where, target: u.target, why: u.why }));
  }
  lines.push(...madeNameLines(KANKA_MADE_NAMES, r.madeNames));
  if (r.notes.length) {
    lines.push(format(R.notes, { n: r.notes.length }));
    for (const n of r.notes) lines.push(format(R.note, { note: n }));
  }
  return lines;
}

// --- the door ----------------------------------------------------------------------------

/**
 * Read a Kanka JSON export (the zip's bytes) into a world folder, in memory: its files and the
 * report. Nothing is written; the caller writes `files` under a new folder. The same folder as the
 * Python package's door byte for byte, given the same `producer`. What Kanka hides comes in
 * carrying `hidden: true`, counted in the report. Throws `OwConvertError` for bytes that are not a
 * zip or an export with no `campaign.json`, and a `TypeError` for an unknown option, before anything
 * is read.
 */
export function convertKanka(bytes: Uint8Array, opts: OwConvertKankaOptions = {}): OwKankaConversion {
  refuseUnknownOptions('convertKanka', opts, OPTION_KEYS);
  if (opts.producer !== undefined) refuseUnknownOptions('convertKanka', opts.producer, PRODUCER_KEYS, '(in producer)');
  if (!(bytes instanceof Uint8Array)) throw new TypeError("convertKanka: the export is the zip's bytes, a Uint8Array.");
  const source = opts.source ?? 'export.zip';
  const producer: OwConvertProducer = opts.producer ?? { tool: PACKAGE_NAME, version: PACKAGE_VERSION };
  let tree;
  try {
    tree = readExportZip(bytes);
  } catch (err) {
    if (err instanceof NotAZip) throw new OwConvertError('not_a_zip', `${source}: not a zip file (${err.message})`);
    throw err;
  }
  const reader = new Reader(tree.files, source, tree.notes);
  reader.collect();
  reader.fill();
  const bodies = reader.bodies();
  const elements = grouped(bodies);
  const counts: Record<string, number> = {};
  for (const t of [...elements.keys()].sort(byCodePointOf)) counts[t] = elements.get(t)!.length;
  const madeNames = reader.core.madeNames(KANKA_MADE_NAMES, bodies.map(b => b.get('id') as string));
  const world = reader.world(producer);
  const { unplaced, unresolved, folded, notes } = reader.core.findings;
  const base: Omit<OwKankaReport, 'lines'> = {
    source,
    worldName: world.get('name') as string,
    counts,
    total: bodies.length,
    modules: reader.modules,
    relations: [...reader.relationCounts].sort((a, b) => byCodePointOf(a[0], b[0])).map(([text, count]) => ({ text, count })),
    folded,
    unplaced,
    unresolved,
    hidden: reader.hidden,
    possiblyStarter: reader.possiblyStarter,
    uploads: reader.uploads.size,
    uploadsNamed: reader.namedUploads.size,
    pictures: reader.pictures,
    untagged: reader.untagged,
    madeNames,
    notes,
  };
  return { files: folderFiles(world, elements), report: { ...base, lines: render(base) } };
}
