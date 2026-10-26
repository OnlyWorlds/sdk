// A draught as plain text: one Character's context packet (GET /character/{id}/context, as the
// client's draught() returns it, full or compact) as the text a person or an AI pastes. The Python
// package's draught_text gives the same text, byte for byte; the shared fixture is
// test/fixtures/draught-text/.
//
// It reads only what the packet carries and calls nothing. A link to an element the packet does not
// hold is counted, never looked up. Nothing is trimmed or cut, so the two languages cannot disagree
// on where a string ends: strings print exactly as served, with their line breaks read as LF.

import { FIELD_SCHEMA } from './v2/types.generated';
import type { OwDraught, OwDraughtCompact } from './v2/types';

type Obj = Record<string, unknown>;

/** The sections after her own, in the packet's order, with their headings. */
const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['role', 'Role'], ['work', 'Work'], ['style', 'Style'], ['events', 'Events'], ['knowledge', 'Knowledge'],
  ['names', 'Names'], ['sheet', 'Sheet'], ['recent', 'Recent'], ['messages', 'Messages'], ['room', 'Room'],
  ['proposed', 'Proposed'], ['roster', 'Members'],
];

/** The sections whose rows carry an element. */
const ELEMENT_SECTIONS: readonly string[] = ['role', 'work', 'style', 'events', 'knowledge', 'names', 'sheet', 'messages', 'room', 'proposed'];

/** Her own fields that never print as a field line. */
const UNPRINTED: ReadonlySet<string> = new Set([
  'id', 'type', 'name', 'description', 'supertype', 'subtype', 'hidden', 'known_of', 'x_review_proposed', 'image_url',
  'created_at', 'updated_at', 'change_seq', 'created_by', 'changed_by', 'changed_via', 'changed_client', 'world',
]);
const UNPRINTED_PREFIXES: readonly string[] = ['x_', 'atlas_', 'shadow_'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** Set: not null or absent, not "", not [] and not {}. */
function isSet(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return true;
}

/** A value as it prints: a string that is not "" with CRLF, then a lone CR, read as LF; an integer in plain decimal; anything else null. */
function text(v: unknown): string | null {
  if (typeof v === 'string') return v === '' ? null : v.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (isInt(v)) return BigInt(v).toString();
  return null;
}

/** A type's word: its id with the first letter upper-cased. */
function typeWordOf(t: unknown): string {
  const s = typeof t === 'string' ? t : '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The schema's fields for a type, or none for a type it does not know. */
function fieldsOf(t: unknown): Obj {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(FIELD_SCHEMA, t)
    ? (FIELD_SCHEMA as unknown as Record<string, Obj>)[t]
    : {};
}

function isLinkField(t: unknown, field: string): boolean {
  const info = own(fieldsOf(t), field);
  return isObj(info) && (info.type === 'single_link' || info.type === 'multi_link');
}

/** A type is dated when the schema gives it a start_date field. */
const isDatedType = (t: unknown): boolean => own(fieldsOf(t), 'start_date') !== undefined;

/** `supertype / subtype` when both are set, otherwise whichever is set, otherwise null. */
function kindOf(el: Obj): string | null {
  const sup = text(own(el, 'supertype'));
  const sub = text(own(el, 'subtype'));
  if (sup !== null && sub !== null) return `${sup} / ${sub}`;
  return sup ?? sub;
}

/** ` · hidden` when `hidden` is true, ` · proposed` when `x_review_proposed` is present and not null (as the server counts it). */
function marks(el: Obj): string {
  const proposed = own(el, 'x_review_proposed');
  return (own(el, 'hidden') === true ? ' · hidden' : '') + (proposed !== undefined && proposed !== null ? ' · proposed' : '');
}

/** The description's lines, each indented by two spaces; none when it is not set. */
function descriptionLines(el: Obj): string[] {
  const d = text(own(el, 'description'));
  return d === null ? [] : d.split('\n').map((l) => `  ${l}`);
}

/** The rows of a section, as the packet holds them: `style` is one row, `names` an object of type to rows. */
function rowsOf(key: string, v: unknown): unknown[] {
  if (key === 'style') return [v];
  if (key === 'names') {
    if (!isObj(v)) return [];
    return Object.keys(v).flatMap((t) => (Array.isArray(v[t]) ? (v[t] as unknown[]) : []));
  }
  return Array.isArray(v) ? v : [];
}

/**
 * The draught as plain text: a `#` title, `##` sections and `- ` rows, LF line endings and one
 * newline at the end. The same read gives the same text served full or `compact`.
 *
 * The frame says what the packet does: the horizon (`as_of`), the world's now, and whose view it
 * was read through (`mode`). Her own element prints whole; every other row prints its name, type
 * and kind, how it reached her (`via`), its grade or date, the marks `hidden` and `proposed`, and
 * its description. The sections that hold nothing are named on one line; what the date horizon left
 * out is named (never counted: the packet carries no count), and what the budget left out (`cut`) is
 * always said.
 *
 * A draught that is not an object, or has no `world` object, is a TypeError. Takes no options.
 */
export function draughtText(draught: OwDraught | OwDraughtCompact): string {
  const d: unknown = draught;
  if (!isObj(d)) throw new TypeError('draughtText: the draught is an object, as draught() returns it.');
  const world = own(d, 'world');
  if (!isObj(world)) throw new TypeError('draughtText: the draught has no world object.');

  // Names: her element first, then each row's element, in the sections' order; the first holder of an id names it.
  const names = new Map<string, string>();
  const hold = (el: unknown): void => {
    if (!isObj(el)) return;
    const id = own(el, 'id');
    if (typeof id === 'string' && !names.has(id)) names.set(id, text(own(el, 'name')) ?? '(unnamed)');
  };
  // An absent `character` is not a hidden one: absent, `self` was not asked and there is no block of her own.
  const asked = Object.prototype.hasOwnProperty.call(d, 'character');
  const character = own(d, 'character');
  const her = isObj(character) && isObj(own(character, 'element')) ? (own(character, 'element') as Obj) : null;
  hold(her);
  for (const key of ELEMENT_SECTIONS) {
    for (const row of rowsOf(key, own(d, key))) if (isObj(row)) hold(own(row, 'element'));
  }

  const calendar = own(d, 'calendar');
  const unit = isObj(calendar) ? text(own(calendar, 'time_basic_unit')) : null;
  const moment = (n: number): string => (unit === null ? BigInt(n).toString() : `${unit} ${BigInt(n).toString()}`);

  const herName = her === null ? 'the Character' : (text(own(her, 'name')) ?? '(unnamed)');
  const out: string[] = [];
  /** One line of the text. A line break a value brought in starts a continuation line indented by `cont`; an empty one is the indent alone. */
  const put = (line: string, cont = '  '): void => {
    const [first, ...rest] = line.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    out.push(first, ...rest.map((l) => cont + l));
  };

  put(`# ${herName}, in ${text(own(world, 'name')) ?? '(unnamed)'}`);
  const asOf = own(d, 'as_of');
  const now = own(d, 'now');
  const mode = own(d, 'mode');
  put(
    `What the record holds around ${herName}`
    + (isInt(asOf) ? `, dated up to ${moment(asOf)}` : '')
    + (isInt(now) ? ` (the world's now: ${moment(now)})` : '')
    + '.'
    + (mode === 'voice' ? " Read as the Character's own view." : mode === 'act' ? " Read as the caller's view." : ''),
  );

  // Her block, when `self` was asked.
  if (asked) {
    out.push('');
    put(`## ${herName}`);
  }
  if (asked && her === null) {
    out.push('Hidden from this reader.');
  } else if (her !== null) {
    const type = own(her, 'type');
    const kind = kindOf(her);
    put(typeWordOf(type) + (kind === null ? '' : ` · ${kind}`) + marks(her));
    for (const l of descriptionLines(her)) put(l);
    for (const key of Object.keys(her)) {
      if (UNPRINTED.has(key) || UNPRINTED_PREFIXES.some((p) => key.startsWith(p))) continue;
      const v = her[key];
      if (!isSet(v)) continue;
      let value: string | null;
      if (isLinkField(type, key)) {
        const resolved: string[] = [];
        let missing = 0;
        for (const id of Array.isArray(v) ? v : [v]) {
          if (typeof id !== 'string' || id === '') continue;
          const name = names.get(id);
          if (name === undefined) missing += 1;
          else resolved.push(name);
        }
        const notHeld = `${missing} not in this draught`;
        value = missing === 0
          ? (resolved.length ? resolved.join(', ') : null)
          : (resolved.length ? `${resolved.join(', ')}, and ${notHeld}` : notHeld);
      } else if (Array.isArray(v)) {
        const parts = v.map(text).filter((p): p is string => p !== null);
        value = parts.length ? parts.join(', ') : null;
      } else {
        value = text(v);
      }
      if (value !== null) put(`  ${key.replace(/_/g, ' ')}: ${value}`, '    ');
    }
  }

  // The roster's names by membership id, for `recent`'s writers.
  const roster = own(d, 'roster');
  const memberName = (id: unknown): string | null => {
    if (!Array.isArray(roster) || typeof id !== 'string') return null;
    for (const r of roster) if (isObj(r) && own(r, 'id') === id) return text(own(r, 'name'));
    return null;
  };

  const elementRow = (row: Obj): string[] => {
    const el = isObj(own(row, 'element')) ? (own(row, 'element') as Obj) : {};
    const type = own(el, 'type');
    const kind = kindOf(el);
    let line = `- ${text(own(el, 'name')) ?? '(unnamed)'} (${typeWordOf(type)}${kind === null ? '' : ` · ${kind}`})`;
    const viaRaw = own(row, 'via');
    const via = (Array.isArray(viaRaw) ? viaRaw : []).map(text).filter((f): f is string => f !== null);
    if (via.length) line += ` · via ${via.map((f) => f.replace(/_/g, ' ')).join(', ')}`;
    const start = own(el, 'start_date');
    if (own(row, 'grade') === 'known_of') line += ' · known of';
    else if (isInt(start)) line += ` · ${moment(start)}`;
    else if (isDatedType(type)) line += ' · undated';
    line += marks(el);
    return [line, ...descriptionLines(el)];
  };

  const recentRow = (row: Obj): string => {
    const op = own(row, 'op');
    const verb = op === 'upsert' ? 'changed' : op === 'delete' ? 'deleted' : (text(op) ?? '');
    const id = own(row, 'id');
    const target = (typeof id === 'string' ? names.get(id) : undefined) ?? text(id) ?? '';
    const who = own(row, 'who');
    const writer = !isSet(who) ? 'an unrecorded writer' : who === 'owner' ? 'the owner' : (memberName(who) ?? 'a member');
    const when = text(own(row, 'when'));
    const door = text(own(row, 'door'));
    return `- ${when === null ? '' : `${when} · `}${verb} ${typeWordOf(own(row, 'type'))} ${target} · by ${writer}`
      + (door === null ? '' : ` · through ${door}`);
  };

  const memberRow = (row: Obj): string => {
    let line = `- ${text(own(row, 'role')) ?? ''}`;
    const name = text(own(row, 'name'));
    if (name !== null) line += ` · ${name}`;
    const plays = own(row, 'character');
    if (isSet(plays)) {
      const n = typeof plays === 'string' ? names.get(plays) : undefined;
      line += n === undefined ? ' · plays a Character not in this draught' : ` · plays ${n}`;
    }
    if (own(row, 'status') === 'removed') line += ' · removed from the world';
    return line;
  };

  // `recent_more` true makes Recent a section even with no rows.
  const recentMore = own(d, 'recent_more') === true;
  const sectionSet = (key: string): boolean => isSet(own(d, key)) || (key === 'recent' && recentMore);

  for (const [key, heading] of SECTIONS) {
    const v = own(d, key);
    if (!sectionSet(key)) continue;
    out.push('', `## ${heading}`);
    for (const row of rowsOf(key, v)) {
      if (!isObj(row)) continue;
      if (key === 'recent') put(recentRow(row));
      else if (key === 'roster') put(memberRow(row));
      else for (const l of elementRow(row)) put(l);
    }
    if (key === 'recent' && recentMore) out.push('More changes than these; read on from recent_cursor.');
  }

  // Nothing in: the components read whose sections hold nothing, as keel spells them.
  const policy = own(d, 'policy');
  const components = isObj(policy) ? own(policy, 'components') : undefined;
  if (Array.isArray(components)) {
    const empty = components.filter((c): c is string => typeof c === 'string' && c !== 'self' && !sectionSet(c));
    if (empty.length) {
      out.push('');
      put(`Nothing in: ${empty.join(', ')}.`);
    }
  }

  // Left out: what the horizon fenced, by mode (keel's `_past_horizon`; uncounted), then only what the budget dropped.
  const cut = own(d, 'cut');
  const left = isObj(cut)
    ? Object.keys(cut).filter((k) => isInt(cut[k])).map((k) => `${BigInt(cut[k] as number).toString()} ${k}`)
    : [];
  out.push('');
  if (isInt(asOf) && mode === 'voice') put(`Not listed: rows dated after ${moment(asOf)}.`);
  else if (isInt(asOf) && mode === 'act') put(`Not listed: Events, Knowledge and proposed Events or Narratives dated after ${moment(asOf)}.`);
  put(`Left out by the budget: ${left.length ? left.join(', ') : 'nothing'}.`);

  return out.join('\n') + '\n';
}
