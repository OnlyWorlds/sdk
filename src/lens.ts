// The lens profile (schema-dist profiles/lens.md, serial 83): a saved way of reading a world. A lens
// is a Construct with supertype Lens; its links are its anchors, and `x_lens` is the recipe (how far,
// which types, how far back, how recently changed, how much). `resolveLens` is the one resolution every
// reader agrees on, a pure function over a world snapshot; the fixture, profiles/lens.fixture.json, is
// this file's own test. The pair is matched by the room profile's trim and fold (room.ts), room
// elements and reading aids by its matchers, proposed elements by the review profile's hand-on rule
// (review.ts), and the mail rule by the message profile's readers (message.ts), never a second copy.
// The Python package's `resolve_lens` gives the same answers, byte for byte, on the same input.

import { FIELD_SCHEMA, PUBLIC_FIELDS } from './v2/types.generated';
import { READING_AID_KEYS, ROOM_PAIRS, fold, isRoomElement, readingAidKey, trimWhiteSpace } from './room';
import { handsOnAsProposed } from './review';
import { compareKeys, isMessage, readMarkOf, timeKey, unreadFor } from './message';
import type { OwMessageMember } from './message';
import { refuseUnknownOptions } from './options';

/** A reader of a lens: the rung decides what of the world it sees. */
export interface OwLensReader {
  /**
   * `owner` (the whole world), `contributor` (the world less the hidden), `guest` (exactly the ids in
   * `whole`, and those in `known_of` as stubs) or `public` (the world less the hidden and the room
   * elements). A proposed element is in no reader's view, but below the public rung a served body keeps
   * a link to one the rung sees, and a lens's note keyed to it.
   */
  rung: 'owner' | 'contributor' | 'guest' | 'public';
  /** The reader's Character, for the mail rule; null or absent: no Character, no mail. */
  character?: string | null;
  /** A guest's whole elements. */
  whole?: readonly string[] | null;
  /** A guest's known-of elements, served as stubs (the base and public fields, every other field unset: no links, no date). */
  known_of?: readonly string[] | null;
  /** On an owner: the reader it reads as. The view is that reader's; the owner's two counts stay. */
  as?: OwLensReader | null;
}

/** The world snapshot a lens is resolved over: the elements as the owner is served them. */
export interface OwLensWorld {
  elements: readonly object[];
  /** Ids the hidden mark keeps from every reader but the owner, beside each element's own `hidden`; the two are one mark, and a full row of an element under it carries `hidden: true`. */
  hidden?: readonly string[] | null;
  /** The world's members list (`client.members()`), which proves a message's sender for the mail rule. */
  members?: readonly OwMessageMember[] | null;
  /** The world's now, in its own time unit: the default `as_of`. */
  now?: number | null;
  /** The World's own now as a world folder spells it (`time_current`), read when `now` is not given. */
  time_current?: number | null;
  /** The World's own now as the API serves it (`GET /world`'s `time_range_current`), read when neither `now` nor `time_current` is given. */
  time_range_current?: number | null;
}

/** `resolveLens`'s options. */
export interface OwLensOptions {
  /** The reading's date, a whole number in the world's time unit; absent: the world's now (`now`, else `time_current`, else `time_range_current`); none at all: no fence, and the window cuts nothing. */
  asOf?: number | null;
  /** The reading's wall-clock time, a date-time, for the mail rule's thirty days and `changed_within`; absent: the machine's time. Never the world's now. */
  clock?: string | null;
}
const LENS_OPTION_KEYS = ['asOf', 'clock'] as const;

/** Why an element was left out: the profile's one closed list. */
export type OwLensCutReason =
  | 'budget' | 'types' | 'window' | 'stale' | 'undated' | 'after_as_of' | 'anchor_not_visible' | 'not_visible' | 'hops_not_served';

/** The mail rule's part of a reading. */
export interface OwLensMail {
  /** The unread messages kept, in `created_at` order. */
  unread: string[];
  /** The read messages kept, in `created_at` order. */
  read: string[];
  /** Every kept message in `created_at` order: an unread one in full, a read one as `id`, `name`, `narrator`, `created_at` (in full under `all`). */
  rows: Record<string, unknown>[];
  /** Messages left out, by reason: older than thirty days (`window`), or past the budget, oldest first (`budget`). */
  cut: { budget?: number; window?: number };
  /** The unread and read messages this reader may see, before the window and the budget. */
  totals: { unread: number; read: number };
}

/** What `resolveLens` answers. */
export interface OwLensReading {
  /** The kept elements' ids, in the profile's order. */
  kept: string[];
  /**
   * The kept elements as `show` makes them, in the same order; an anchor's row carries its `note`, and only an anchor
   * the reader can see: a note on one it cannot see (an id of another type than its field's too) goes with the
   * anchor, though another path keeps the element. Under `full` a row is the body as served to this reader, so the
   * owner's row of a hidden element carries `hidden: true`; a `name` or `first_line` row never carries it.
   */
  rows: Record<string, unknown>[];
  /** The cut, counted by reason; a reason with no count is absent, and a reader that is not the owner never carries the owner's two. */
  cut: Partial<Record<OwLensCutReason, number>>;
  /** Notes on ids that are not anchors of the lens read, counted only where the reader sees the id. */
  notesIgnored: number;
  /** The mail part, when the lens names a mail rule; null otherwise. */
  mail: OwLensMail | null;
  /** The first `x_lens` key whose value is outside the profile's table (`x_lens` itself when it is not an object): the lens resolves to nothing. Null for a readable lens. */
  unreadable: string | null;
}

type Body = Record<string, unknown>;
type Show = 'full' | 'first_line' | 'name';
type Mail = 'unread_full_read_titles' | 'all' | 'none';

interface Recipe {
  depth: number;
  /** Folded type slugs, room pairs and reading aids' pairs; null: any type, and no room element or reading aid. */
  types: Set<string> | null;
  window: number | null;
  from: number | null;
  to: number | null;
  undated: 'include' | 'exclude';
  /** Days back from the reading's wall clock; null: no cut by when an element changed. */
  changedWithin: number | null;
  show: Show;
  budget: number;
  mail: Mail;
  notes: Body;
}

/** The anchor fields: the Construct's Involves links in the schema's order, less `titles`. */
const ANCHOR_FIELDS: readonly string[] = [
  'characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones',
  'abilities', 'phenomena', 'languages', 'families', 'relations', 'constructs', 'events', 'narratives',
];
/** The schema's type order (schema.json's), which the budget's order reads. */
const TYPE_ORDER: readonly string[] = [
  'ability', 'collective', 'character', 'construct', 'creature', 'event', 'family', 'institution', 'language', 'law',
  'location', 'map', 'marker', 'narrative', 'object', 'phenomenon', 'pin', 'relation', 'species', 'title', 'trait', 'zone',
];
const TYPE_RANK: ReadonlyMap<string, number> = new Map(TYPE_ORDER.map((t, i) => [t, i]));
/**
 * The lens profile's date table: each dated type's date field, by the type's lowercase name. The other ten
 * types are timeless and never fenced. The lens reader's fence and window read it, and so can a timeline or a
 * horizon that must date elements the same way. Frozen.
 */
export const DATE_FIELD: Readonly<Record<string, string>> = Object.freeze({
  character: 'birth_date', creature: 'birth_date', institution: 'founding_date', location: 'founding_date',
  collective: 'formation_date', law: 'date', title: 'grant_date', construct: 'start_date', event: 'start_date',
  narrative: 'start_date', relation: 'start_date', zone: 'start_date',
});
/** The cut reasons in the profile's order (module-internal; the graph reader counts by them too). */
export const CUT_REASONS: readonly OwLensCutReason[] = [
  'budget', 'types', 'window', 'stale', 'undated', 'after_as_of', 'anchor_not_visible', 'not_visible', 'hops_not_served',
];
/** The reasons only the owner is told (module-internal). */
export const OWNER_ONLY: ReadonlySet<string> = new Set(['anchor_not_visible', 'not_visible']);
const ROOM_KEYS: ReadonlySet<string> = new Set(ROOM_PAIRS.map(p => `${fold(p.type)}/${fold(p.supertype)}`));
const MAIL_SECONDS = 30 * 86400;
/** A Message's addressing, the fields keel names in `x_served_trimmed` when it trims one (`SERVED_TRIMMED_FIELDS`). */
const MESSAGE_ADDRESSING: readonly string[] = ['characters', 'narrator'];
/** The base fields a known-of stub keeps beside its type's public fields. */
const STUB_FIELDS: readonly string[] = ['id', 'type', 'name', 'description', 'supertype', 'subtype', 'image_url', 'created_at', 'updated_at', 'change_seq'];
/** The server's who and door, which a known-of stub serves null. */
const STUB_NULLED: readonly string[] = ['created_by', 'changed_by', 'changed_via', 'changed_client'];
/** A field's unset value, by its kind in the schema: an empty text, null for a number or a single link, an empty list. */
const UNSET: Readonly<Record<string, unknown>> = { text: '', integer: null, single_link: null, multi_link: [] };

/**
 * Each type's link fields in the schema's order, whether each is a list, and its target type (`any` for a
 * generic pair's id, a Pin's `element_id`) (module-internal).
 */
export const LINK_FIELDS: ReadonlyMap<string, ReadonlyArray<readonly [string, boolean, string]>> = new Map(
  Object.entries(FIELD_SCHEMA as Record<string, Record<string, { type: string; target?: string }>>).map(([type, fields]) => [
    type,
    Object.entries(fields)
      .filter(([, f]) => f.type === 'single_link' || f.type === 'multi_link')
      .map(([name, f]) => [name, f.type === 'multi_link', f.target ?? 'any'] as const),
  ]),
);
/** Each anchor field's target type, which an anchor's id must name an element of. */
const ANCHOR_TARGET: ReadonlyMap<string, string> = new Map((LINK_FIELDS.get('construct') ?? []).map(([f, , t]) => [f, t]));

/**
 * The type a link field of `el` reaches: the field's target type, or for a generic pair (target `any`, a
 * Pin's `element_type` and `element_id`) its type key exactly as stored, nothing trimmed or folded. A key
 * that is not one of the 22 slugs reaches nothing: `''`, which no element's type is (module-internal).
 */
export function linkTarget(el: Body, field: string, target: string): string {
  if (target !== 'any') return target;
  const key = el[`${field.slice(0, -3)}_type`];
  return typeof key === 'string' && TYPE_RANK.has(key) ? key : '';
}

export const isBody = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (v: Body, key: string): boolean => Object.prototype.hasOwnProperty.call(v, key);
export const valueOf = (v: Body, key: string): unknown => (own(v, key) && v[key] !== undefined ? v[key] : null);
/** A whole number, or null: a number with no fraction (never a boolean or a string). */
export const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/**
 * An element's date as the lens profile reads it: the whole number in its type's date field (`DATE_FIELD`),
 * in the world's own time unit. Null for a timeless type, a body with no known `type`, and a date field that is
 * absent, null or not a whole number. It reads the body it is given: a known-of stub serves no date, so it
 * reads null, whatever the element's own date is.
 */
export function dateOf(element: object | null | undefined): number | null {
  if (!isBody(element)) return null;
  const type = typeof element.type === 'string' ? fold(element.type) : '';
  if (!own(DATE_FIELD, type)) return null;
  return whole(valueOf(element, DATE_FIELD[type]));
}

/**
 * When an element last changed, as `changed_within` reads it: the newer of a folder element's
 * `server_updated_at` and `local_updated_at` where either reads as a time, else its `updated_at`; null when none
 * reads as one.
 */
function changedAt(el: Body): [number, number] | null {
  const stamps = [timeKey(valueOf(el, 'server_updated_at')), timeKey(valueOf(el, 'local_updated_at'))]
    .filter((k): k is [number, number] => k !== null);
  if (stamps.length === 0) return timeKey(valueOf(el, 'updated_at'));
  return stamps.reduce((a, b) => (compareKeys(a, b) >= 0 ? a : b));
}

/** Strings by code point, as the Python package compares them (never UTF-16 units, never a locale). */
export function byCodePoint(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i].codePointAt(0) as number) - (y[i].codePointAt(0) as number);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** A plain JSON copy, so nothing a caller does to a reading reaches the world. */
function copy<T>(v: T): T {
  if (Array.isArray(v)) return v.map(copy) as unknown as T;
  if (isBody(v)) {
    const out: Body = {};
    for (const k of Object.keys(v)) out[k] = copy(v[k]);
    return out as T;
  }
  return v;
}

/**
 * True when the element is a lens: a Construct with supertype `Lens`, the type and the supertype each
 * trimmed (Unicode White_Space at both ends) and compared without regard to case, the whole word
 * (`Lenses` is not one), as the room profile's pairs are read.
 */
export function isLens(element: object | null | undefined): boolean {
  if (!isBody(element) || typeof element.type !== 'string' || typeof element.supertype !== 'string') return false;
  return fold(element.type) === 'construct' && fold(element.supertype) === fold('Lens');
}

/**
 * True when the element is a template: a lens whose subtype, trimmed and folded, is `Template`. A
 * template resolves to nothing, anchors or not, until a copy is pointed (given anchors and another
 * subtype).
 */
export function isTemplate(element: object | null | undefined): boolean {
  return isLens(element) && typeof (element as Body).subtype === 'string' && fold((element as Body).subtype as string) === fold('Template');
}

/**
 * The lenses a seat reads, by id: its membership's choice when it has made one (a list, an empty list
 * included: a membership that chose no lenses has made a choice), otherwise its Character's
 * `x_lens_uses` (a folder world has no membership). Never both: the membership wins. Strings only, each
 * once, in the order given; anything that is not a list is no choice.
 */
export function lensesInUse(membership: readonly string[] | null | undefined, xLensUses: unknown): string[] {
  const list: unknown = Array.isArray(membership) ? membership : xLensUses;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const id of list) if (typeof id === 'string' && id !== '' && !out.includes(id)) out.push(id);
  return out;
}

/** The recipe, or the first key outside the table. Keys are checked in the table's order. */
function readRecipe(raw: unknown): { recipe: Recipe } | { bad: string } {
  if (raw === undefined || raw === null) raw = {};
  if (!isBody(raw)) return { bad: 'x_lens' };
  const x = raw;
  const depthV = valueOf(x, 'depth');
  const depth = depthV === null ? 1 : whole(depthV);
  if (depth === null || depth < 0 || depth > 2) return { bad: 'depth' };
  const typesV = valueOf(x, 'types');
  let types: Set<string> | null = null;
  if (typesV !== null) {
    if (!Array.isArray(typesV)) return { bad: 'types' };
    const set = new Set<string>();
    for (const word of typesV) {
      if (typeof word !== 'string') return { bad: 'types' };
      const w = fold(word);
      if (!(w.includes('/') ? ROOM_KEYS.has(w) || READING_AID_KEYS.has(w) : TYPE_RANK.has(w))) return { bad: 'types' };
      set.add(w);
    }
    types = set.size > 0 ? set : null;
  }
  const windowV = valueOf(x, 'window');
  const fromV = valueOf(x, 'from');
  const toV = valueOf(x, 'to');
  const window = windowV === null ? null : whole(windowV);
  if (windowV !== null && (window === null || window < 0 || fromV !== null || toV !== null)) return { bad: 'window' };
  const from = fromV === null ? null : whole(fromV);
  if (fromV !== null && from === null) return { bad: 'from' };
  const to = toV === null ? null : whole(toV);
  if (toV !== null && (to === null || from === null || to <= from)) return { bad: 'to' };
  const undatedV = valueOf(x, 'undated');
  if (undatedV !== null && undatedV !== 'include' && undatedV !== 'exclude') return { bad: 'undated' };
  const changedV = valueOf(x, 'changed_within');
  const changedWithin = changedV === null ? null : whole(changedV);
  if (changedV !== null && (changedWithin === null || changedWithin < 1)) return { bad: 'changed_within' };
  const showV = valueOf(x, 'show');
  if (showV !== null && showV !== 'full' && showV !== 'first_line' && showV !== 'name') return { bad: 'show' };
  const budgetV = valueOf(x, 'budget');
  const budget = budgetV === null ? 50 : whole(budgetV);
  if (budget === null || budget < 1 || budget > 1000) return { bad: 'budget' };
  const mailV = valueOf(x, 'mail');
  if (mailV !== null && mailV !== 'unread_full_read_titles' && mailV !== 'all' && mailV !== 'none') return { bad: 'mail' };
  const notesV = valueOf(x, 'notes');
  if (notesV !== null && (!isBody(notesV) || Object.keys(notesV).some(k => typeof notesV[k] !== 'string'))) return { bad: 'notes' };
  return {
    recipe: {
      depth, types, window, from, to,
      undated: (undatedV ?? 'include') as Recipe['undated'],
      changedWithin,
      show: (showV ?? 'full') as Show,
      budget,
      mail: (mailV ?? 'none') as Mail,
      notes: (notesV ?? {}) as Body,
    },
  };
}

/** One reading's world: every element by id, what this reader sees, and the bodies it is served (module-internal). */
export class Reading {
  readonly byId = new Map<string, Body>();
  readonly typeOf = new Map<string, string>();
  readonly order: string[] = [];
  readonly view = new Set<string>();
  readonly stubs = new Set<string>();
  readonly room = new Set<string>();
  /** The reading aids (the charter, its guide, its domains: the pair and the mark), each id to its pair word. */
  readonly aid = new Map<string, string>();
  /** The ids under the hidden mark: the world's `hidden` list and each element's own `hidden`. */
  readonly hidden = new Set<string>();
  /** The ids written as proposed, which no reader's view holds. */
  readonly proposed = new Set<string>();
  /** The ids a body this reader is served may link to: the view, and the proposed elements its rung sees (keel's `scoped` leaves them out for the public rung alone). */
  readonly linkable = new Set<string>();
  /** The rung whose view is read: the reader's own, or on an owner the rung of the reader it reads `as`. */
  readonly seenRung: OwLensReader['rung'];
  readonly owner: boolean;
  /** True when the view read is the owner's own: its rows are the bodies as stored, nothing trimmed (keel serves the owner untouched), the hidden mark as `hidden: true`. */
  readonly stored: boolean;
  readonly character: string | null;
  readonly members: readonly OwMessageMember[] | null;
  readonly asOf: number | null;
  private readonly served = new Map<string, Body>();
  private readonly inView = new Map<string, string[]>();
  private readonly inFull = new Map<string, string[]>();

  constructor(world: Body, reader: OwLensReader, asOf: number | null) {
    const hidden = this.hidden;
    if (Array.isArray(world.hidden)) for (const id of world.hidden) if (typeof id === 'string') hidden.add(id);
    for (const el of world.elements as unknown[]) {
      if (!isBody(el) || typeof el.id !== 'string' || el.id === '' || this.byId.has(el.id)) continue;
      const type = typeof el.type === 'string' ? fold(el.type) : '';
      if (!TYPE_RANK.has(type)) continue;
      this.byId.set(el.id, el);
      this.typeOf.set(el.id, type);
      this.order.push(el.id);
      if (el.hidden !== undefined && el.hidden !== null && el.hidden !== false) hidden.add(el.id);
      if (isRoomElement(el as { type?: string })) this.room.add(el.id);
      const aid = readingAidKey(el);
      if (aid !== null) this.aid.set(el.id, aid);
    }
    this.owner = reader.rung === 'owner';
    const seen = this.owner && reader.as != null ? reader.as : reader;
    this.seenRung = seen.rung;
    this.stored = seen.rung === 'owner';
    this.character = typeof seen.character === 'string' && seen.character !== '' ? seen.character : null;
    const listed = (v: unknown): Set<string> => new Set(Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : []);
    const wholeIds = listed(seen.whole);
    const knownOf = listed(seen.known_of);
    for (const id of this.order) {
      const el = this.byId.get(id) as Body;
      const proposed = handsOnAsProposed(el);
      if (proposed) this.proposed.add(id);
      let sees: boolean;
      switch (seen.rung) {
        case 'owner': sees = true; break;
        case 'contributor': sees = !hidden.has(id); break;
        case 'public': sees = !hidden.has(id) && !this.room.has(id) && !proposed; break;
        default: sees = wholeIds.has(id) || knownOf.has(id); if (!proposed && !wholeIds.has(id) && knownOf.has(id)) this.stubs.add(id);
      }
      if (sees) this.linkable.add(id);
      if (sees && !proposed) this.view.add(id);
    }
    this.members = Array.isArray(world.members) ? (world.members as OwMessageMember[]) : null;
    this.asOf = asOf;
    for (const id of this.order) {
      for (const t of this.fullLinks(id)) {
        if (!this.byId.has(t)) continue;
        if (!this.inFull.has(t)) this.inFull.set(t, []);
        (this.inFull.get(t) as string[]).push(id);
      }
      if (!this.view.has(id)) continue;
      for (const t of this.links(id)) {
        if (!this.inView.has(t)) this.inView.set(t, []);
        (this.inView.get(t) as string[]).push(id);
      }
    }
  }

  /**
   * The ids the element's owner-served body links to, in the schema's field order. A link reaches only an
   * element of its field's target type (an id of another type reaches nothing: a data fault, not a hop), and
   * a generic pair only an element of the type its key names (`linkTarget`).
   */
  fullLinks(id: string): string[] {
    const el = this.byId.get(id) as Body;
    const out: string[] = [];
    for (const [field, many, target] of LINK_FIELDS.get(this.typeOf.get(id) as string) ?? []) {
      const v = el[field];
      const to = linkTarget(el, field, target);
      for (const t of many ? (Array.isArray(v) ? v : []) : [v]) {
        if (typeof t === 'string' && this.typeOf.get(t) === to && !out.includes(t)) out.push(t);
      }
    }
    return out;
  }

  /** The ids the element's served body links to: its links inside the view; a stub carries none. */
  links(id: string): string[] {
    if (this.stubs.has(id)) return [];
    return this.fullLinks(id).filter(t => this.view.has(t));
  }

  /**
   * The body this reader is served: the owner's own view the body as stored; any other reader's with the links
   * it cannot see left out (`trim`); a known-of element's a stub made from that trimmed body: the base fields
   * and the type's public fields kept, every other field of the type it holds at its unset value (`UNSET`; the
   * server's who and door null), no extension key, and `known_of: true`. A body of an element under the hidden
   * mark (the world's `hidden` list or its own `hidden`) carries `hidden: true`, and no other body a `hidden` key:
   * only the owner's view holds a hidden element, unless a guest's own lists name one.
   */
  body(id: string): Body {
    let b = this.served.get(id);
    if (b !== undefined) return b;
    const el = this.byId.get(id) as Body;
    const type = this.typeOf.get(id) as string;
    b = copy(el);
    delete b.x_served_trimmed; // keel serves only the mark it adds, never a stored one
    if (!this.stored) this.trim(type, b);
    if (this.stubs.has(id)) {
      const kinds = (FIELD_SCHEMA as Record<string, Record<string, { type: string }>>)[type] ?? {};
      const keep = new Set([...STUB_FIELDS, ...((PUBLIC_FIELDS as Record<string, readonly string[]>)[type] ?? [])]);
      const full = b;
      b = {};
      for (const k of Object.keys(full)) {
        if (keep.has(k)) b[k] = full[k];
        else if (STUB_NULLED.includes(k)) b[k] = null;
        else if (own(kinds, k) && own(UNSET, kinds[k].type)) b[k] = copy(UNSET[kinds[k].type]);
      }
      b.known_of = true;
    }
    // keel's served body carries the hidden mark as `hidden: true`, and no `hidden` key on any other body.
    if (this.hidden.has(id)) b.hidden = true;
    else delete b.hidden;
    this.served.set(id, b);
    return b;
  }

  /**
   * A whole body as a reader below the owner is served it, as keel's `redact` and `serialize` serve it: every
   * link id the reader cannot see (or that names an element of another type than the field's) left out, a
   * single link to null, a generic pair (a Pin's `element_type` and `element_id`) to the empty pair, `""` and
   * null; a lens's `x_lens.notes` keeps the entries keyed to an anchor it is served or another element it
   * sees. `x_served_trimmed` names what was trimmed only where keel adds it: a Message's `characters` and
   * `narrator`, a lens's anchor fields and `notes` (when an anchor's note went with it), for a contributor
   * or a guest, never the public rung.
   */
  private trim(type: string, b: Body): void {
    const sees = (t: unknown, target: string): boolean =>
      typeof t === 'string' && this.linkable.has(t) && (target === 'any' || this.typeOf.get(t) === target);
    const schema = (FIELD_SCHEMA as Record<string, Record<string, { type: string; target?: string }>>)[type] ?? {};
    const isLensBody = isLens(b);
    const anchorsBefore = isLensBody ? new Set(ANCHOR_FIELDS.flatMap(f => (Array.isArray(b[f]) ? (b[f] as unknown[]) : []))) : null;
    const trimmed: string[] = [];
    for (const [field, many] of LINK_FIELDS.get(type) ?? []) {
      if (!own(b, field)) continue;
      const v = b[field];
      const target = schema[field]?.target ?? 'any';
      if (many) {
        if (!Array.isArray(v) || v.length === 0) continue;
        const kept = v.filter(t => sees(t, target));
        if (kept.length !== v.length) trimmed.push(field);
        b[field] = kept;
      } else if (target === 'any' && field.endsWith('_id')) {
        // A generic pair: its type half names the type the id must be, as keel's redact reads it.
        const typeField = `${field.slice(0, -3)}_type`;
        if (typeof v !== 'string' || v === '' || sees(v, typeof b[typeField] === 'string' ? (b[typeField] as string) : '')) continue;
        if (own(b, typeField)) b[typeField] = '';
        b[field] = null;
        trimmed.push(field);
      } else if (typeof v === 'string' && v !== '' && !sees(v, target)) {
        b[field] = null;
        trimmed.push(field);
      }
    }
    let notesGone = false;
    if (anchorsBefore !== null && isBody(b.x_lens) && isBody(b.x_lens.notes)) {
      const notes = b.x_lens.notes;
      const served = new Set(ANCHOR_FIELDS.flatMap(f => (Array.isArray(b[f]) ? (b[f] as unknown[]) : [])));
      const kept: Body = {};
      for (const k of Object.keys(notes)) {
        if (served.has(k) || (!anchorsBefore.has(k) && this.linkable.has(k))) kept[k] = notes[k];
        else if (anchorsBefore.has(k)) notesGone = true;
      }
      if (Object.keys(kept).length !== Object.keys(notes).length) b.x_lens = { ...b.x_lens, notes: kept };
    }
    if (this.seenRung === 'public') return;
    const named = isMessage(b) ? MESSAGE_ADDRESSING.filter(f => trimmed.includes(f))
      : isLensBody ? [...ANCHOR_FIELDS.filter(f => trimmed.includes(f)), ...(notesGone ? ['notes'] : [])] : [];
    if (named.length > 0) b.x_served_trimmed = named;
  }

  /**
   * One hop from each element of `from`, both ways, and on through each Relation it lands on to that Relation's
   * parties. Nothing hops out of a stub or a room element, nor out of an element `stops` names.
   */
  reach(from: Iterable<string>, excluded: (id: string) => boolean, stops?: (id: string) => boolean): { reached: Set<string>; edges: string[] } {
    const landed = new Set<string>();
    for (const f of from) {
      if (this.stubs.has(f) || this.room.has(f) || (stops !== undefined && stops(f))) continue;
      for (const t of [...this.links(f), ...(this.inView.get(f) ?? [])]) if (!excluded(t)) landed.add(t);
    }
    const reached = new Set(landed);
    const edges: string[] = [];
    for (const r of landed) {
      if (this.typeOf.get(r) !== 'relation' || this.stubs.has(r) || this.room.has(r)) continue;
      edges.push(r);
      for (const t of this.links(r)) if (!excluded(t)) reached.add(t);
    }
    return { reached, edges };
  }

  /** What one hop from `from` would reach in the owner's world that this reader's view leaves out (the owner's count). */
  unseen(from: readonly string[], landedRelations: readonly string[], excluded: (id: string) => boolean): Set<string> {
    const out = new Set<string>();
    const consider = (t: string): void => {
      if (this.byId.has(t) && !this.view.has(t) && !excluded(t)) out.add(t);
    };
    for (const f of from) {
      if (this.stubs.has(f) || this.room.has(f)) continue;
      for (const t of this.fullLinks(f)) consider(t);
      for (const t of this.inFull.get(f) ?? []) consider(t);
    }
    for (const r of landedRelations) for (const t of this.fullLinks(r)) consider(t);
    return out;
  }

  date(id: string): number | null | undefined {
    const field = DATE_FIELD[this.typeOf.get(id) as string];
    if (field === undefined) return undefined;
    return whole((this.byId.get(id) as Body)[field]);
  }

  /** The fence (keel's `as_of`, on the element's own date) and `undated`. */
  fenceCut(id: string, recipe: Recipe): OwLensCutReason | null {
    const d = this.date(id);
    if (d === undefined) return null;
    if (d === null) return recipe.undated === 'exclude' ? 'undated' : null;
    return this.asOf !== null && d > this.asOf ? 'after_as_of' : null;
  }

  /**
   * `window`, or `from` and `to` (closed-open). A `to` after `as_of` is clipped: the fence stays the upper
   * edge, so an element dated `as_of` is kept, and every element such a `to` would cut is already cut by the
   * fence (`after_as_of`, counted first).
   */
  windowCut(id: string, recipe: Recipe): OwLensCutReason | null {
    const d = this.date(id);
    if (d === undefined || d === null) return null;
    if (recipe.window !== null && this.asOf !== null && d < this.asOf - recipe.window) return 'window';
    if (recipe.from !== null && d < recipe.from) return 'window';
    if (recipe.to !== null && d >= recipe.to) return 'window';
    return null;
  }

  /**
   * `changed_within`: changed longer ago than that many days before the reading's wall clock. The time read is the
   * element's `updated_at`, or for a folder element (one carrying `server_updated_at` or `local_updated_at`) the
   * newer of those two; an element with no readable time is never cut.
   */
  staleCut(id: string, recipe: Recipe, wall: [number, number]): OwLensCutReason | null {
    if (recipe.changedWithin === null) return null;
    const at = changedAt(this.byId.get(id) as Body);
    if (at === null) return null;
    return compareKeys(at, [wall[0] - recipe.changedWithin * 86400, wall[1]]) < 0 ? 'stale' : null;
  }

  /** Whether `types` keeps the element: a room element or a reading aid only when its pair is named, any other by its type (or any type when `types` is empty). */
  kept(id: string, recipe: Recipe): boolean {
    if (this.room.has(id)) {
      const el = this.byId.get(id) as Body;
      return recipe.types !== null && recipe.types.has(`${fold(el.type as string)}/${fold(el.supertype as string)}`);
    }
    const aid = this.aid.get(id);
    if (aid !== undefined) return recipe.types !== null && recipe.types.has(aid);
    return recipe.types === null || recipe.types.has(this.typeOf.get(id) as string);
  }

  /** Rule 4: a reading aid a hop reached is not hopped out of unless `types` names its pair. */
  stopsAt(id: string, recipe: Recipe): boolean {
    const aid = this.aid.get(id);
    return aid !== undefined && !(recipe.types !== null && recipe.types.has(aid));
  }

  /** Rule 5's order past the anchors: the schema's type order, newest `updated_at` first (an unreadable time last), then by id. */
  sort(ids: Iterable<string>): string[] {
    const keyed = [...ids].map(id => ({ id, rank: TYPE_RANK.get(this.typeOf.get(id) as string) as number, at: timeKey((this.byId.get(id) as Body).updated_at) }));
    keyed.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.at && b.at) {
        const c = compareKeys(b.at, a.at);
        if (c !== 0) return c;
      } else if (a.at) return -1;
      else if (b.at) return 1;
      return byCodePoint(a.id, b.id);
    });
    return keyed.map(k => k.id);
  }

  row(id: string, show: Show, notes: Body | null): Record<string, unknown> {
    const b = this.body(id);
    let row: Record<string, unknown>;
    if (show === 'full') row = copy(b);
    else {
      row = { id: b.id, type: b.type, name: b.name ?? null };
      if (show === 'first_line' && typeof b.description === 'string') {
        const cut = b.description.search(/[\r\n]/);
        row.description = cut < 0 ? b.description : b.description.slice(0, cut);
      }
    }
    if (notes !== null && own(notes, id)) row.note = notes[id];
    return row;
  }
}

interface Resolved {
  /** The kept ids, the lens's own and then each child's, each once, after its mail rule and its budget. */
  list: string[];
  cut: Map<string, OwLensCutReason>;
  /** The lens's own mail part, when it names a mail rule (a child's is its own and goes nowhere). */
  mail: OwLensMail | null;
}

/**
 * The anchors and the umbrella's children of a lens, in its link order. A child is a lens in `constructs`
 * the reader sees whole; one it knows only as a stub serves no recipe and no links, so it is an anchor
 * the reader cannot see (`unseen`), never entered (keel's `_anchors`). An id that names no element of the
 * world, or an element of another type than its field's, is an anchor the reader cannot see too. An empty
 * string, or one of White_Space alone, is no id and so no anchor: a lens of only such strings is a filter.
 */
function anchorsOf(lens: Body, r: Reading): { anchors: string[]; children: string[]; unseen: Set<string>; anchored: boolean } {
  const anchors: string[] = [];
  const children: string[] = [];
  const unseen = new Set<string>();
  const seen = new Set<string>();
  for (const field of ANCHOR_FIELDS) {
    const v = valueOf(lens, field);
    if (!Array.isArray(v)) continue;
    for (const id of v) {
      if (typeof id !== 'string' || trimWhiteSpace(id) === '' || seen.has(id)) continue;
      seen.add(id);
      if (r.typeOf.get(id) !== ANCHOR_TARGET.get(field)) unseen.add(id);
      else if (field === 'constructs' && r.view.has(id) && isLens(r.byId.get(id) as Body)) {
        if (!r.stubs.has(id)) { children.push(id); continue; }
        unseen.add(id);
      }
      anchors.push(id);
    }
  }
  const mark = lens.x_served_trimmed;
  const trimmed = Array.isArray(mark) && mark.some(f => typeof f === 'string' && ANCHOR_FIELDS.includes(f));
  return { anchors, children, unseen, anchored: seen.size > 0 || trimmed };
}

/**
 * One lens by its own recipe, its children entered once each through the shared visited set. An anchor is
 * kept and followed whatever `types`, `window` and `changed_within` say (a reading aid too; a room element is
 * kept and not followed); what a hop or a filter reaches is cut by the fence, then `types`, then the window,
 * then `changed_within`, against `wall`, the reading's wall clock. Nothing is hopped out of what the fence cuts
 * `after_as_of`. Each child's kept list joins this one's by id alone (rule 3), after the child's own mail rule
 * and budget; then this lens's mail rule takes its messages out and its budget caps the union.
 */
function resolveOne(lens: Body, recipe: Recipe, r: Reading, visited: Set<string>, wall: [number, number]): Resolved {
  const cut = new Map<string, OwLensCutReason>();
  const addCut = (id: string, why: OwLensCutReason): void => {
    if (!cut.has(id)) cut.set(id, why);
  };
  const { anchors, children, unseen, anchored } = anchorsOf(lens, r);
  const anchorSet = new Set(anchors);
  let list: string[] = [];
  const frontier: string[] = [];
  for (const id of anchors) {
    // Rule 6 before the visited check: an anchor the reader cannot see is counted, the lens's own id included,
    // for the owner alone; every other reader records it under no reason, as if it were not there, so a reason
    // a child gives the same element stands.
    if (!r.view.has(id) || unseen.has(id)) {
      if (r.owner) addCut(id, 'anchor_not_visible');
      continue;
    }
    if (visited.has(id)) continue;
    const why = r.fenceCut(id, recipe);
    if (why !== 'after_as_of') frontier.push(id);
    if (why !== null) addCut(id, why);
    else list.push(id);
  }
  const passes = (id: string): boolean => {
    const why = r.fenceCut(id, recipe) ?? (r.kept(id, recipe) ? null : 'types') ?? r.windowCut(id, recipe)
      ?? r.staleCut(id, recipe, wall);
    if (why !== null) addCut(id, why);
    return why === null;
  };
  if (!anchored) {
    // A filter: every element of its types the reader can see; others are not selected and not counted.
    const selected = r.order.filter(id => r.view.has(id) && !visited.has(id) && r.kept(id, recipe));
    list.push(...r.sort(selected.filter(passes)));
  } else if (recipe.depth >= 1) {
    // A child the umbrella enters is not excluded from its own hop: what a hop reaches is kept as an element (keel's `known`).
    const excluded = (id: string): boolean => anchorSet.has(id) || visited.has(id);
    const { reached: hop, edges } = r.reach(frontier, excluded);
    list.push(...r.sort([...hop].filter(passes)));
    if (r.owner) for (const id of r.unseen(frontier, edges, excluded)) addCut(id, 'not_visible');
    if (recipe.depth === 2) {
      const stops = (id: string): boolean => r.stopsAt(id, recipe) || r.fenceCut(id, recipe) === 'after_as_of';
      // The second hop's count leaves out a room element or a reading aid whose pair `types` does not name (rule 4 stops it).
      for (const id of r.reach(hop, id => excluded(id) || hop.has(id), stops).reached) {
        if ((r.room.has(id) || r.aid.has(id)) && !r.kept(id, recipe)) continue;
        addCut(id, 'hops_not_served');
      }
    }
  }
  for (const child of children) {
    if (visited.has(child)) continue;
    visited.add(child);
    const body = r.byId.get(child) as Body;
    const read = readRecipe(body.x_lens);
    if (!('recipe' in read) || isTemplate(body)) continue;
    const sub = resolveOne(body, read.recipe, r, visited, wall);
    // The union drops an element only by its id, never because it was entered.
    const have = new Set(list);
    list.push(...sub.list.filter(id => !have.has(id)));
    for (const [id, why] of sub.cut) addCut(id, why);
  }
  const mail = recipe.mail === 'none' ? null : mailPart(r, recipe.mail, recipe.budget, wall);
  if (mail !== null) {
    const inMail = new Set([...mail.unread, ...mail.read]);
    list = list.filter(id => !inMail.has(id));
  }
  for (const id of list.slice(recipe.budget)) cut.set(id, 'budget');
  list = list.slice(0, recipe.budget);
  for (const id of list) cut.delete(id);
  return { list, cut, mail };
}

/** The mail rule (the message profile's readers over the reader's view). */
function mailPart(r: Reading, mode: Mail, budget: number, clock: [number, number]): OwLensMail {
  const empty: OwLensMail = { unread: [], read: [], rows: [], cut: {}, totals: { unread: 0, read: 0 } };
  // The public rung has no Character (keel's public reader carries none), and its bodies carry no x_served_trimmed to
  // tell a trimmed recipient list from one to everyone.
  if (r.character === null || r.seenRung === 'public') return empty;
  const inView = r.order.filter(id => r.view.has(id));
  // Whole bodies only: a known-of stub serves no `characters`, so its recipients are unknown, never everyone (keel's `_mail`).
  const messages = inView.filter(id => !r.stubs.has(id)).map(id => r.body(id)).filter(b => isMessage(b));
  const relations = inView.filter(id => r.typeOf.get(id) === 'relation').map(id => r.body(id));
  const mark = readMarkOf(relations, r.character, r.members);
  const mine = unreadFor(messages, r.character, null, r.members);
  const unread = new Set(unreadFor(messages, r.character, mark, r.members));
  const lower: [number, number] = [clock[0] - MAIL_SECONDS, clock[1]];
  const inWindow = mine.filter(m => {
    const at = timeKey(m.created_at);
    return at !== null && compareKeys(at, lower) >= 0;
  });
  const keptMail = inWindow.slice(Math.max(0, inWindow.length - budget));
  const cut: OwLensMail['cut'] = {};
  if (inWindow.length > keptMail.length) cut.budget = inWindow.length - keptMail.length;
  if (mine.length > inWindow.length) cut.window = mine.length - inWindow.length;
  return {
    unread: keptMail.filter(m => unread.has(m)).map(m => m.id as string),
    read: keptMail.filter(m => !unread.has(m)).map(m => m.id as string),
    rows: keptMail.map(m => (mode === 'all' || unread.has(m)
      ? copy(m)
      : { id: m.id, name: m.name ?? null, narrator: m.narrator ?? null, created_at: m.created_at ?? null })),
    cut,
    totals: { unread: unread.size, read: mine.length - unread.size },
  };
}

const NOTHING = (): OwLensReading => ({ kept: [], rows: [], cut: {}, notesIgnored: 0, mail: null, unreadable: null });

/** Refuse a reader that is not an object with one of the four rungs (module-internal). */
export function checkReader(reader: unknown, where: string): asserts reader is OwLensReader {
  if (!isBody(reader) || !['owner', 'contributor', 'guest', 'public'].includes(reader.rung as string)) {
    throw new TypeError(`${where}: a reader is an object whose rung is owner, contributor, guest or public; got ${JSON.stringify(reader) ?? String(reader)}.`);
  }
  if (reader.as !== undefined && reader.as !== null) checkReader(reader.as, `${where}.as`);
}

/**
 * Resolve a lens for one reader over a world snapshot (schema-dist profiles/lens.md): the kept
 * elements in the profile's order, the cut counted by reason, and, when the lens names a mail rule,
 * the mail part. Pure: it never writes, and nothing in the world moves.
 *
 * `world` holds the elements as the owner is served them (with the ids its hidden mark keeps in
 * `hidden`, or each element's own `hidden`, and its `members` for the mail rule). `lens` is a lens body
 * or the id of a lens in the world the reader can see. `reader` says what it sees (`OwLensReader`); an
 * owner reading `as` another reader gets that reader's view and the owner's two counts.
 *
 * The rules, in short: visibility first (a hidden or proposed element is not there to hop through; a
 * known-of stub is kept as served and nothing hops out of it); a hop reaches both ways, and on through
 * a Relation to its parties, only to an element of the link's target type (a generic pair's type key
 * compared exact against the 22 slugs); an umbrella enters each child lens once, each child keeping its own budget and mail rule, the rows made by the umbrella's `show`; a hop never crosses a room
 * element; a reading aid (the charter, its guide, a domain: `isCharterElement`) a hop reaches is kept, and
 * hopped on from, only when `types` names its pair, while one the lens names as an anchor is kept and
 * followed; anchors first in link order, then by type in the schema's order, newest first, then by id;
 * an anchor the reader cannot see (an id naming no element, or one of another type than its field's, too)
 * is skipped and counted for the owner (`anchor_not_visible`, before any other reason), while for any other reader
 * it is not there at all, so a child lens's cut of the same element counts under the child's reason; a template
 * resolves to nothing; the fence is `as_of` on
 * each element's own date; `changed_within` cuts what a hop or a filter reaches that changed longer ago
 * than that many days before `clock` (`stale`), never an anchor. A value outside the profile's table makes
 * the lens unreadable: `unreadable` names the key and nothing is resolved.
 */
export function resolveLens(world: OwLensWorld, lens: object | string, reader: OwLensReader, options?: OwLensOptions): OwLensReading {
  if (options !== undefined && options !== null && !isBody(options)) {
    throw new TypeError(`resolveLens: options is an object, such as { asOf: 1200 }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions('resolveLens', options, LENS_OPTION_KEYS);
  const opts: Body = isBody(options) ? options : {};
  if (!isBody(world) || !Array.isArray((world as Body).elements)) {
    throw new TypeError('resolveLens: world is an object with an elements list.');
  }
  checkReader(reader, 'resolveLens: reader');
  const { asOf, clock } = readingDate('resolveLens', world as Body, opts);
  if (typeof lens !== 'string' && !isBody(lens)) throw new TypeError('resolveLens: lens is a lens body or its id.');
  return lensReading(new Reading(world as Body, reader, asOf), lens, clock).reading;
}

/**
 * The reading's date and wall-clock time from the options, each refused when it is not one (module-internal):
 * `asOf`, else the world's now (the fixture's `now`, else the World's `time_current` as a folder spells it, else
 * `time_range_current` as the API serves it). With none of them there
 * is no fence, and the window cuts nothing.
 */
export function readingDate(fn: string, world: Body, opts: Body): { asOf: number | null; clock: unknown } {
  const asOfV = valueOf(opts, 'asOf');
  if (asOfV !== null && whole(asOfV) === null) throw new TypeError(`${fn}: asOf is a whole number; got ${JSON.stringify(asOfV)}.`);
  const clockV = valueOf(opts, 'clock');
  if (clockV !== null && timeKey(clockV) === null) throw new TypeError(`${fn}: clock is a date-time; got ${JSON.stringify(clockV)}.`);
  const asOf = asOfV !== null ? (asOfV as number) : (whole((world as Body).now) ?? whole((world as Body).time_current) ?? whole((world as Body).time_range_current));
  return { asOf, clock: clockV };
}

/**
 * A lens read over one reading's world (module-internal): the reading `resolveLens` answers, and the reason
 * each element it left out was cut, by id, before the counts drop the owner's two.
 */
export function lensReading(r: Reading, lens: object | string, clockV: unknown): { reading: OwLensReading; cutById: ReadonlyMap<string, OwLensCutReason> } {
  const none = { reading: NOTHING(), cutById: new Map<string, OwLensCutReason>() };
  let body: Body | null;
  // A lens named by id is read from the body this reader is served: a stub serves no links and no
  // recipe, so a lens the reader knows only as a stub reads as one it cannot see (keel's find_lens).
  if (typeof lens === 'string') body = r.view.has(lens) && !r.stubs.has(lens) ? (r.byId.get(lens) as Body) : null;
  else body = lens as Body;
  if (body === null || !isLens(body)) return none;
  const read = readRecipe(body.x_lens);
  if (!('recipe' in read)) return { ...none, reading: { ...NOTHING(), unreadable: read.bad } };
  if (isTemplate(body)) return none;
  const recipe = read.recipe;

  // The reading's wall clock, read once: the mail rule's thirty days and `changed_within` both measure from it.
  const wall = timeKey(clockV ?? new Date().toISOString()) as [number, number];
  const visited = new Set<string>();
  if (typeof body.id === 'string') visited.add(body.id);
  const { list: keep, cut, mail } = resolveOne(body, recipe, r, visited, wall);
  const { anchors, unseen } = anchorsOf(body, r);
  // The rows are made once, from the union, by this lens's `show`; a note captions only this lens's own anchors
  // the reader can see. One the reader cannot see (a wrongly typed id among them) reaches nothing, and its note goes
  // with it, though another path keeps the element.
  const resolved = new Set(anchors.filter(id => r.view.has(id) && !unseen.has(id)));
  const rows = keep.map(id => r.row(id, recipe.show, resolved.has(id) ? recipe.notes : null));
  const counts: Partial<Record<OwLensCutReason, number>> = {};
  for (const why of CUT_REASONS) {
    if (OWNER_ONLY.has(why) && !r.owner) continue;
    let n = 0;
    for (const w of cut.values()) if (w === why) n++;
    if (n > 0) counts[why] = n;
  }
  // A note on an id that is not an anchor is counted only where the reader sees that id: a note keyed to an
  // element it cannot see, or to no element, is no note of its, and counting it would tell a guest it exists. A
  // note on an anchor the reader cannot see went with the anchor and is not counted either.
  const notesIgnored = Object.keys(recipe.notes).filter(k => !anchors.includes(k) && r.view.has(k)).length;
  return { reading: { kept: keep, rows, cut: counts, notesIgnored, mail, unreadable: null }, cutById: cut };
}
