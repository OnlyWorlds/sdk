/**
 * The shared core of the import doors: what every reader of another tool's export needs on the
 * OnlyWorlds side, with no tool's keys in it. A reader (one per tool, its rules in code, its tables
 * and wording as data) builds a `Draft` per element and hands the core what it found; the core
 * holds the element's body in the schema's order with the hidden mark, the extension keys a value
 * is kept under (named from the key, `_2` and on when taken), each kept key reported once, exact
 * copies folded, the schema's field kinds and link targets, the Narrative and Relation fields for
 * a linked type, the names the door made and their count, `world.json`, and the folder's files.
 *
 * Exported from `@onlyworlds/sdk/convert` are its findings' types; the rest is module-internal.
 */

import { FIELD_SCHEMA, type FieldInfo } from '../v2/types.generated';
import { uuid5 } from '../v2/keyed-id';
import { FOLDER_FORMAT_VERSION, folderFiles, type OwFolderFile } from './folder';
import { dumpsSorted, format, PY_SPACE, strip, type PyDict, type PyValue } from './py';

/** A key, or an attribute, not placed on a field: kept on the element as `keptAs`. */
export interface OwConvertUnplaced {
  /** The element's name. */
  element: string;
  key: string;
  why: string;
  keptAs: string;
}

/** A link or mention whose target is not an element of the folder. */
export interface OwConvertUnresolved {
  element: string;
  /** Where on the element: `parent`, `mention`, a key of the export. */
  where: string;
  /** The target as the export writes it. */
  target: string;
  why: string;
}

/** Exact copies on one element folded into one. */
export interface OwConvertFolded {
  element: string;
  /** What was copied: `post`, `trait`, `relationship`, ... */
  what: string;
  name: string;
  copies: number;
}

/**
 * One kind of name a door makes, for a thing the export never names or leaves unnamed. `type` is
 * the element type it names, or `*` for any. `pattern` is its human form (the export's words in
 * angle brackets); `regex` matches a whole name of the kind.
 */
export interface OwConvertMadeName {
  kind: string;
  type: string;
  pattern: string;
  source: 'joined' | 'ours';
  regex: string;
}

/** A made-name record's `type` for a name given to an element of whatever type it became. */
export const ANY_TYPE = '*';

// --- the schema -------------------------------------------------------------------

type Kinds = Record<string, FieldInfo>;
const SCHEMA = FIELD_SCHEMA as unknown as Record<string, Kinds>;

/** A type's fields in the schema's order, each with its kind (`text`, `integer`, `single_link`, `multi_link`). */
export function fieldsOf(type: string): [string, string][] {
  return Object.entries(SCHEMA[type]).map(([f, info]) => [f, info.type]);
}

export function kindOf(type: string, field: string): string | undefined {
  return SCHEMA[type]?.[field]?.type;
}

export function targetOf(type: string, field: string): string | undefined {
  return SCHEMA[type]?.[field]?.target;
}

const lowerCache = new Map<string, Map<string, string>>();

/** A type's field for a name compared lowercased (an attribute `str` finds `STR`). */
export function fieldByLower(type: string, lower: string): string | undefined {
  let m = lowerCache.get(type);
  if (!m) {
    m = new Map();
    for (const [f] of fieldsOf(type)) m.set(f.toLowerCase(), f);
    lowerCache.set(type, m);
  }
  return m.get(lower);
}

function multiLinkFor(on: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [f, kind] of fieldsOf(on)) {
    const target = targetOf(on, f);
    if (kind === 'multi_link' && target && !out.has(target)) out.set(target, f);
  }
  return out;
}

let relationFields: Map<string, string> | null = null;
let narrativeFields: Map<string, string> | null = null;

/** Relation's multi-link field for a type (the schema's first), the field a Relation's end takes. */
export function relationFieldFor(type: string): string | undefined {
  relationFields ??= multiLinkFor('relation');
  return relationFields.get(type);
}

/** Narrative's multi-link field for a type: how a Narrative links an element of it. */
export function narrativeFieldFor(type: string): string | undefined {
  narrativeFields ??= multiLinkFor('narrative');
  return narrativeFields.get(type);
}

// --- names and keys -----------------------------------------------------------------

const CAMEL = /(?<=[a-z0-9])(?=[A-Z])/g;
const SEPARATORS = new RegExp(`[${PY_SPACE}-]+`, 'g');

/** A key lowercased, camelCase and whitespace runs as underscores: the name a field is compared to. */
export function normKey(name: string): string {
  return strip(name).replace(CAMEL, '_').toLowerCase().replace(SEPARATORS, '_');
}

/** A value with nothing in it: null, `""`, `[]`, `{}`. */
export function empty(v: PyValue): boolean {
  return v === null || v === '' || (Array.isArray(v) && !v.length) || (v instanceof Map && !v.size);
}

/** A row's content as one comparable text: every key but those `notContent` names (ids, order, times). */
export function contentKey(row: PyDict, notContent: ReadonlySet<string>): string {
  return dumpsSorted(new Map([...row].filter(([k]) => !notContent.has(k))));
}

// --- the element being built ------------------------------------------------------------

/** One element being built: its type, id and name, fields by schema name, extension keys, mentions. */
export class Draft {
  hidden = false;
  readonly fields = new Map<string, PyValue>();
  readonly ext: PyDict = new Map();
  readonly taken = new Set<string>();
  mentions: string[] = [];
  constructor(readonly type: string, readonly id: string, readonly name: string) {}
}

/** The shared part of a door's report: what any door finds. */
export interface CoreFindings {
  unplaced: OwConvertUnplaced[];
  unresolved: OwConvertUnresolved[];
  folded: OwConvertFolded[];
  notes: string[];
}

/** A door's shared machinery: ids in its namespace, kept keys, folds, bodies, names made. */
export class DoorCore {
  readonly findings: CoreFindings;
  /** Element id -> the made-name kind of the name it was given. */
  readonly named = new Map<string, string>();
  private readonly seen = new Set<string>();

  constructor(
    /** The prefix of every extension key the door writes (`x_kanka_`). */
    readonly prefix: string,
    /** The UUID every id the door mints is a UUIDv5 in. */
    readonly namespace: string,
    notes: string[],
  ) {
    this.findings = { unplaced: [], unresolved: [], folded: [], notes };
  }

  /** The door's id for a key: UUIDv5 in its namespace. */
  id(key: string): string {
    return uuid5(this.namespace, key);
  }

  note(text: string): void {
    this.findings.notes.push(text);
  }

  unresolved(element: string, where: string, target: string, why: string): void {
    this.findings.unresolved.push({ element, where, target, why });
  }

  /** A key not placed, reported once for each element, key, reason and extension. */
  unplaced(element: string, key: string, why: string, keptAs: string): void {
    const k = JSON.stringify([element, key, why, keptAs]);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.findings.unplaced.push({ element, key, why, keptAs });
  }

  /** Keep a value as `<prefix><key>` (`_2` and on when taken) and report it. */
  keep(d: Draft, key: string, value: PyValue, why: string): void {
    const base = `${this.prefix}${normKey(key) || 'value'}`;
    let ext = base;
    for (let n = 2; d.taken.has(ext); n++) ext = `${base}_${n}`;
    d.taken.add(ext);
    d.ext.set(ext, value);
    this.unplaced(d.name, key, why, ext);
  }

  /** One of the door's own extension keys, not reported (the door's docs name them). */
  own(d: Draft, key: string, value: PyValue): void {
    const ext = `${this.prefix}${key}`;
    d.taken.add(ext);
    d.ext.set(ext, value);
  }

  /** Exact copies kept once, the first in order; each fold reported with the element it was on and the copy's name. */
  fold<T>(what: string, rows: T[], keyOf: (row: T) => string, elementOf: (row: T) => string, nameOf: (row: T) => string): T[] {
    const at = new Map<string, number>();
    const kept: T[] = [];
    const copies: number[] = [];
    for (const row of rows) {
      const key = keyOf(row);
      const i = at.get(key);
      if (i !== undefined) {
        copies[i]++;
        continue;
      }
      at.set(key, kept.length);
      kept.push(row);
      copies.push(1);
    }
    kept.forEach((row, i) => {
      if (copies[i] > 1) this.findings.folded.push({ element: elementOf(row), what, name: nameOf(row), copies: copies[i] });
    });
    return kept;
  }

  /** An element's body: type, id, name, the hidden mark, fields in the schema's order, extensions, mentions. */
  body(d: Draft): PyDict {
    const body: PyDict = new Map<string, PyValue>([['type', d.type], ['id', d.id], ['name', d.name]]);
    if (d.hidden) body.set('hidden', true);
    for (const [f] of fieldsOf(d.type)) {
      if (f !== 'name' && d.fields.has(f)) body.set(f, d.fields.get(f)!);
    }
    for (const [k, v] of d.ext) body.set(k, v);
    if (d.mentions.length) body.set(`${this.prefix}mentions`, d.mentions);
    return body;
  }

  /** A Narrative's link to the element it came from: `parent_narrative` for a Narrative, else Narrative's field for the type. */
  linkBack(fields: Map<string, PyValue>, d: Draft): void {
    if (d.type === 'narrative') fields.set('parent_narrative', d.id);
    else {
      const f = narrativeFieldFor(d.type);
      if (f) fields.set(f, [d.id]);
    }
  }

  /** The made names counted over the elements written, in the declared order, a kind with none left out. */
  madeNames(made: readonly OwConvertMadeName[], ids: Iterable<string>): Record<string, number> {
    const declared = new Set(made.map(m => m.kind));
    const tally = new Map<string, number>();
    for (const id of ids) {
      const kind = this.named.get(id);
      if (kind === undefined) continue;
      if (!declared.has(kind)) throw new Error(`a made name of kind '${kind}', which the door does not declare`);
      tally.set(kind, (tally.get(kind) ?? 0) + 1);
    }
    const out: Record<string, number> = {};
    for (const m of made) if (tally.has(m.kind)) out[m.kind] = tally.get(m.kind)!;
    return out;
  }
}

const SAID: Record<string, string> = {
  joined: "joined: the export's words, ours between them",
  ours: 'ours: the export gives it no name',
};

/** The report's lines for the names made: a heading with the total, then one line a kind with a count. */
export function madeNameLines(made: readonly OwConvertMadeName[], counts: Record<string, number>): string[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return [];
  const byKind = new Map(made.map(m => [m.kind, m]));
  const lines = [format('Names made by the import, not taken whole from the export ({n}), one line a kind:', { n: total })];
  for (const [kind, n] of Object.entries(counts)) {
    const m = byKind.get(kind)!;
    const what = m.type === ANY_TYPE ? 'any type' : m.type;
    lines.push(format('  - {kind}, {what} {pattern!r}: {n} ({said})', { kind: m.kind, what, pattern: m.pattern, n, said: SAID[m.source] }));
  }
  return lines;
}

// --- the folder ---------------------------------------------------------------------------

/** The folder format's `producer` line: the tool that made the folder and its version. */
export interface OwConvertProducer {
  tool: string;
  version?: string;
}

/** `world.json` for a door's world: id, name, the description when there is one, the format version, the producer. */
export function worldOf(id: string, name: string, description: string | null, producer: OwConvertProducer, input: string): PyDict {
  const world: PyDict = new Map<string, PyValue>([['id', id], ['name', name]]);
  if (description !== null) world.set('description', description);
  world.set('format_version', FOLDER_FORMAT_VERSION);
  const line: PyDict = new Map<string, PyValue>([['tool', producer.tool]]);
  if (producer.version !== undefined) line.set('version', producer.version);
  line.set('input', input);
  world.set('producer', line);
  return world;
}

/** Bodies grouped by type, in the order the door made them, and the count of each type in code point order. */
export function grouped(bodies: PyDict[]): Map<string, PyDict[]> {
  const out = new Map<string, PyDict[]>();
  for (const b of bodies) {
    const t = b.get('type') as string;
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push(b);
  }
  return out;
}

export { folderFiles, type OwFolderFile };
