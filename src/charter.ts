// The charter profile (schema-dist profiles/charter.md, serial 83): a world's reading aids, the Charter (the
// rules here), the Guide (start here) and the Domains (the places in the world), each an element of one of
// CHARTER_PAIRS that carries the mark x_charter_of, read by presence (room.ts's isCharterElement). `charterOf`
// is the one packet every tool shows first at a world's door, as one reader sees the world; keel serves the
// same packet as `reading_aids` on GET /me and the join reply. Who sees what is the lens reader's own reading
// (lens.ts), never a second copy; the fixture, profiles/charter.fixture.json, is this file's own test. The
// Python package's `charter_of` gives the same answers on the same input.

import { CHARTER_PAIRS, FIELD_SCHEMA } from './v2/types.generated';
import type { OwReadingAids, OwReadingAidsDomain, OwReadingAidsHub } from './v2/types';
import { LINK_FIELDS, Reading, byCodePoint, checkReader, isBody } from './lens';
import type { OwLensReader, OwLensWorld } from './lens';
import { compareKeys, timeKey } from './message';
import { fold, trimWhiteSpace } from './room';

export { CHARTER_PAIRS };

/** The world snapshot the reading aids are read from: the lens reader's world, and whether it is open to anyone. */
export interface OwCharterWorld extends OwLensWorld {
  /** True for a world open to anyone: only then does the public rung read anything of it. */
  open?: boolean | null;
}

type Body = Record<string, unknown>;

/** At most this many Objects in a Charter's `skill` (keel's `SKILL_MAX`). */
const SKILL_MAX = 5;
/** An element id anywhere in a text: inside any `ow://` form, a site address, or bare (keel's `charter_skill`). */
const ID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
/** A line break: a carriage return and line feed, a carriage return, or a line feed. */
const BREAK = /\r\n|\r|\n/;

/** The lens profile's first_line, as keel cuts a Domain's sentence: trimmed, up to the first line break, trimmed again. */
function firstLine(text: unknown): string {
  if (typeof text !== 'string') return '';
  return trimWhiteSpace(trimWhiteSpace(text).split(BREAK, 1)[0]);
}

/** The newest of `ids` by `created_at`, compared as instants (none, or one that is not a time, sorts as the oldest), then the higher id by code point. */
function newest(ids: string[], r: Reading): string | null {
  let best: string | null = null;
  let bestAt: [number, number] | null = null;
  for (const id of ids) {
    const at = timeKey((r.byId.get(id) as Body).created_at);
    if (best !== null) {
      const c = at && bestAt ? compareKeys(at, bestAt) : at ? 1 : bestAt ? -1 : 0;
      if (c < 0 || (c === 0 && byCodePoint(id, best) < 0)) continue;
    }
    best = id;
    bestAt = at;
  }
  return best;
}

/** The ids `text` names, lowercase, each once, in the order written. */
function idsIn(text: unknown): string[] {
  const out: string[] = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(ID)) {
    const id = m[0].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A Domain's hubs from the body the reader is served: the distinct targets of its link fields, in the schema's field order, never
 * itself and never an element written as proposed, which is in no reader's view, the owner's included; a stub's none.
 */
function hubsOf(id: string, r: Reading): OwReadingAidsHub[] {
  const body = r.body(id);
  if (body.known_of === true) return [];
  const schema = (FIELD_SCHEMA as Record<string, Record<string, { target?: string }>>).construct;
  const out: OwReadingAidsHub[] = [];
  const seen = new Set([`construct/${id}`]);
  for (const [field, many] of LINK_FIELDS.get('construct') ?? []) {
    const v = body[field];
    const target = schema[field]?.target ?? '';
    for (const t of many ? (Array.isArray(v) ? v : []) : [v]) {
      // a hub is an element of the kind its field links to, in the reader's view: an id of another kind names no hub
      if (typeof t !== 'string' || t === '' || r.proposed.has(t) || !r.view.has(t) || r.typeOf.get(t) !== target || seen.has(`${target}/${t}`)) continue;
      seen.add(`${target}/${t}`);
      out.push({ type: target, id: t });
    }
  }
  return out;
}

const NONE = (): OwReadingAids => ({ charter: null, guide: null, domains: [] });

/**
 * The one view the charter readers read: the world as `reader` sees it through the lens reader, the marked aids of a pair in
 * that view, and the Charter `charterOf` selects (the newest marked Charter in the view, so one the hidden mark keeps from
 * the reader is not that reader's); null for the public rung on a world that is not open, which reads nothing.
 */
function readAids(world: OwCharterWorld, reader: OwLensReader, fn: string): { r: Reading; law: string | null; seen: (pair: string) => string[] } | null {
  if (!isBody(world) || !Array.isArray((world as Body).elements)) {
    throw new TypeError(`${fn}: world is an object with an elements list.`);
  }
  checkReader(reader, `${fn}: reader`);
  const r = new Reading(world as Body, reader, null);
  if (r.seenRung === 'public' && (world as Body).open !== true) return null;
  const seen = (pair: string): string[] => r.order.filter(id => r.view.has(id) && r.aid.get(id) === pair);
  return { r, law: newest(seen('law/charter'), r), seen };
}

/**
 * A world's reading aids as `reader` sees it (schema-dist profiles/charter.md): `{charter, guide, domains}`,
 * the packet every front door shows first, in that order.
 *
 * `charter` is the newest marked Charter the reader sees (newest by `created_at`, compared as instants, none
 * sorting as the oldest; then the higher id by code point), as `{id, name, rules, skill}`: `rules` its
 * `x_checks_rules` as stored (`[]` when it has none), `skill` the ids its description names (any `ow://`
 * form, a site address or a bare id), lowercase, each once in the order written, kept when it is an Object
 * of this world the reader sees, the first five of those kept (keel's `charter_skill`). `guide` is the
 * newest marked Guide the same way, `{id, name}`. `domains` is every marked Domain the reader sees, each
 * `{id, name, sentence, hubs}`: in the order the Guide's `constructs` names them as the reader is served the
 * Guide (a Domain named twice keeps its first place; an entry that is no marked Domain it sees is skipped),
 * then the rest by folded name and id; with no Guide seen, by folded name and id alone. `sentence` is the
 * description up to its first line break, trimmed; `hubs` the distinct `{type, id}` its link fields name that
 * the reader sees, in the schema's field order, never itself, and none for a Domain it knows only as a stub.
 *
 * `world` holds the elements as the owner is served them (the hidden in `hidden` or each element's own
 * `hidden`), and `open: true` for a world open to anyone; `reader` is a lens reader (`OwLensReader`): the
 * owner, a contributor, a guest (its `whole` and `known_of` ids) or the public, which reads nothing of a
 * world that is not open. Whether an element is an aid is read from the element as the owner is served it,
 * since a stub serves no extension field; what the packet shows of it is what the reader is served. Pure.
 */
export function charterOf(world: OwCharterWorld, reader: OwLensReader): OwReadingAids {
  const read = readAids(world, reader, 'charterOf');
  if (read === null) return NONE();
  const { r, law, seen } = read;
  const out = NONE();

  if (law !== null) {
    const el = r.byId.get(law) as Body;
    const rules = el.x_checks_rules;
    const skill = idsIn(el.description)
      .filter(id => r.view.has(id) && r.typeOf.get(id) === 'object')
      .slice(0, SKILL_MAX);
    out.charter = {
      id: law,
      type: 'law',
      name: typeof el.name === 'string' ? el.name : '',
      rules: Array.isArray(rules) ? JSON.parse(JSON.stringify(rules)) : [],
      skill,
    };
  }

  const guide = newest(seen('construct/guide'), r);
  if (guide !== null) {
    const el = r.byId.get(guide) as Body;
    out.guide = { id: guide, type: 'construct', name: typeof el.name === 'string' ? el.name : '' };
  }

  const domains = new Set(seen('construct/domain'));
  const order: string[] = [];
  const named = guide === null ? undefined : r.body(guide).constructs;
  for (const id of Array.isArray(named) ? named : []) {
    if (typeof id === 'string' && domains.has(id) && !order.includes(id)) order.push(id);
  }
  const nameOf = (id: string): string => {
    const name = r.body(id).name;
    return typeof name === 'string' ? name : '';
  };
  const rest = [...domains].filter(id => !order.includes(id))
    .sort((a, b) => byCodePoint(fold(nameOf(a)), fold(nameOf(b))) || byCodePoint(a, b));
  out.domains = [...order, ...rest].map((id): OwReadingAidsDomain => ({
    id,
    type: 'construct',
    name: nameOf(id),
    sentence: firstLine(r.body(id).description),
    hubs: hubsOf(id, r),
  }));
  return out;
}

/** The marked Domains alone, as `charterOf` lists them for the same reader. */
export function domainsOf(world: OwCharterWorld, reader: OwLensReader): OwReadingAidsDomain[] {
  return charterOf(world, reader).domains;
}

/** A design part (charter.md, serial 135): an Object or a Construct whose `subtype` is a design state, and that state. */
export interface OwDesignPart {
  /** The type as the packet writes one, whatever spelling the element's type is stored in. */
  type: 'object' | 'construct';
  id: string;
  /** The design state: the subtype trimmed and folded, whatever spelling it is stored in (`In Design ` is `in design`). */
  state: 'in design' | 'locked';
}

/** The two design states, as the fold writes them. */
const DESIGN_STATES: ReadonlySet<string> = new Set(['in design', 'locked']);

/**
 * The design parts `reader` reads in a world (schema-dist profiles/charter.md, serial 135): each Object or Construct the
 * reader is served whole whose `subtype`, trimmed and compared without regard to case as the room profile defines it, is
 * `in design` or `locked`, as `{type, id, state}`, in the world's order (the page orders no parts: compare as a set).
 *
 * Only where `charterOf` finds a Charter for the same reader: with none (no Charter, only one without the mark, only a
 * proposed one, or one the hidden mark keeps from the reader), no element has a design state and the answer is `[]`,
 * even where another reader of the same world reads parts. The state alone makes a part, whatever the supertype; no
 * other subtype and no other type has one. A known-of stub has none, though it is served its subtype; what the reader
 * sees (hidden and proposed elements, the rungs) is `charterOf`'s own view. Takes the same world and reader as
 * `charterOf`. Pure.
 */
export function designPartsOf(world: OwCharterWorld, reader: OwLensReader): OwDesignPart[] {
  const read = readAids(world, reader, 'designPartsOf');
  if (read === null || read.law === null) return [];
  const { r } = read;
  const out: OwDesignPart[] = [];
  for (const id of r.order) {
    if (!r.view.has(id) || r.stubs.has(id)) continue;
    const type = r.typeOf.get(id);
    if (type !== 'object' && type !== 'construct') continue;
    const subtype = r.body(id).subtype;
    if (typeof subtype !== 'string') continue;
    const state = fold(subtype);
    if (DESIGN_STATES.has(state)) out.push({ type, id, state: state as OwDesignPart['state'] });
  }
  return out;
}
