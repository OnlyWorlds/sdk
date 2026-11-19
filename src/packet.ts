// The packet profile (schema-dist profiles/packet.md, serial 136): a work item's state (rule 5), open work (rules 5 and 7),
// who asked (rule 8), and the work items one reader is given read together, as profiles/packet.fixture.json reads them.
// A work item is a Relation with supertype `Work item`, the pair trimmed and folded by room.ts's fold; the state is its
// subtype, trimmed and folded the same way. The fixture is this file's own test (test/packet.test.mjs).

import { fold, trimWhiteSpace } from './room';

/** A work item's state (rule 5): one of the four words, as the fold writes them. */
export type OwWorkState = 'open' | 'taken' | 'done' | 'standing';

/** One entry of a work item's `x_packet_elements` (rule 1): the element's type slug, its id as written, and why it is in the packet. */
export interface OwWorkElement {
  type: string;
  id: string;
  reason: string;
}

/** A world as `workOf` reads it: its Characters' ids and the ids of every other element of it the reader holds, each as written. */
export interface OwWorkWorld {
  id?: string | null;
  /** The ids of the world's Characters the reader holds. */
  characters?: readonly string[] | null;
  /** The ids of every other element of the world the reader holds. */
  others?: readonly string[] | null;
}

/** A lint `workOf` reports: `asker` on a work item whose `x_packet_from` is no one id, or names an element the reader holds that is no Character of the world (rule 8). */
export interface OwWorkLint {
  kind: 'asker';
  item: string;
}

/** `workOf`'s answer. Every map is keyed by an id as written; no list of work items is in a rule order (compare them as sets) except `elements`. */
export interface OwWork {
  /** For each work item, its state, or null for no state (rule 5). */
  states: Record<string, OwWorkState | null>;
  /** Every work item, in the order given: no item is hidden for its state. */
  shown: string[];
  /** For each element any work item names in `x_packet_elements`, the open work that names it (state `open` or `taken`). */
  openWork: Record<string, string[]>;
  /** For each work item, its elements in `x_packet_elements`' order (rule 1), each `{type, id, reason}`. */
  elements: Record<string, OwWorkElement[]>;
  /** For each work item, the Character of the world that asked for it, or null (rule 8). */
  askers: Record<string, string | null>;
  /** One `asker` lint per work item whose key is no one id or names an element the reader holds that is no Character of the world. */
  lints: OwWorkLint[];
  /** For each Character of the world, the open work it asked for: what it is waiting on. */
  waitingOn: Record<string, string[]>;
}

type Body = Record<string, unknown>;

/** The work item's pair (the packet page's "On which element"). */
const WORK_ITEM_PAIR = { type: 'relation', supertype: 'Work item' } as const;

const STATES: ReadonlySet<string> = new Set<OwWorkState>(['open', 'taken', 'done', 'standing']);

const isBody = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** True for a Relation with supertype `Work item`, each trimmed and folded, the whole word. */
function isWorkItem(item: unknown): item is Body {
  if (!isBody(item) || typeof item.type !== 'string' || typeof item.supertype !== 'string') return false;
  return fold(item.type) === WORK_ITEM_PAIR.type && fold(item.supertype) === fold(WORK_ITEM_PAIR.supertype);
}

/** Sets a key on a plain object, so an id such as __proto__ is a key like any other. */
function put<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}

const has = (map: object, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key);

/**
 * A work item's state (schema-dist profiles/packet.md, rule 5): its `subtype`, trimmed of White_Space and compared without
 * regard to case as the room profile defines it, when that is `open`, `taken`, `done` or `standing`; else null, no state
 * (a subtype that is missing, null, not a string, empty, White_Space alone or any other word). ` Standing` is `standing`,
 * `OPEN` is `open`; `open` after a byte order mark is no state, since U+FEFF is no White_Space.
 *
 * A work item is a Relation with supertype `Work item`, the type and supertype trimmed and folded the same way; the room
 * mark is not needed. Anything else answers null: its subtype is no work state. Pure.
 */
export function workStateOf(item: unknown): OwWorkState | null {
  if (!isWorkItem(item) || typeof item.subtype !== 'string') return null;
  const state = fold(item.subtype);
  return STATES.has(state) ? (state as OwWorkState) : null;
}

/**
 * True when the work item is open work (packet.md, rules 5 and 7): its state is `open` or `taken`. A `done` item, a
 * `standing` one (never done, a kept list) and one with no state are never open work, and anything that is no work item
 * is none. A reader offers to take a work item, or to set it done, only when this is true. Pure.
 */
export function isOpenWork(item: unknown): boolean {
  const state = workStateOf(item);
  return state === 'open' || state === 'taken';
}

/** The asker key as one id: a string with something left once trimmed of White_Space, as written; `absent` for a key absent or null; `bad` for any other value. */
function askerKey(item: Body): string | 'absent' | 'bad' {
  const v = has(item, 'x_packet_from') ? item.x_packet_from : undefined;
  if (v === undefined || v === null) return 'absent';
  if (typeof v !== 'string' || trimWhiteSpace(v) === '') return 'bad';
  return v;
}

/** The ids in a list, strings only, as written. */
function idsOf(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
}

/**
 * Who asked for a work item (schema-dist profiles/packet.md, rule 8): the id its `x_packet_from` writes, as written (never
 * trimmed, never folded), or null. Absent or null names no one; a value that is not a string, or a string empty once
 * trimmed of White_Space, is no id and names no one. The asker is never the maker (`created_by`, or the tool
 * `x_packet_producer` names) and never `actor`.
 *
 * With `world` (`{characters, others}`, as `workOf` takes it), the id counts only when it is, written exactly so, one of
 * the world's Characters; any other id is null (`workOf` says which of them is a lint). Without `world`, the answer is the
 * key's id unchecked: whether it names a Character the reader holds is the caller's to read. Anything that is no work item
 * answers null. Pure.
 */
export function askerOf(item: unknown, world?: OwWorkWorld): string | null {
  if (!isWorkItem(item)) return null;
  const key = askerKey(item);
  if (key === 'absent' || key === 'bad') return null;
  if (world === undefined) return key;
  if (!isBody(world)) throw new TypeError('askerOf: world is an object with its characters and others.');
  return idsOf(world.characters).has(key) ? key : null;
}

/** The entries of `x_packet_elements` a reader reads: objects holding `type`, `id` and `reason`, each a string, the id not empty once trimmed; any other entry is ignored, never repaired. */
function elementsOf(item: Body): OwWorkElement[] {
  const list = item.x_packet_elements;
  const out: OwWorkElement[] = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!isBody(e) || typeof e.type !== 'string' || typeof e.id !== 'string' || typeof e.reason !== 'string') continue;
    if (trimWhiteSpace(e.id) === '') continue;
    out.push({ type: e.type, id: e.id, reason: e.reason });
  }
  return out;
}

/**
 * The work items one reader is given, read together (schema-dist profiles/packet.md, rules 1, 5, 7 and 8; the fixture's
 * parts). `items` are the work items in the order given; anything that is no work item (a Relation with supertype
 * `Work item`, trimmed and folded) or carries no non-empty string `id` is in no part of the answer, and of two with one
 * id the first is read. `world` is the world they sit in, `{id, characters, others}`: its Characters' ids and the ids of
 * every other element of it the reader holds, each as written. `sourceWorld`, in the same shape, is the world packets
 * about another world name, whose elements the reader holds too; its Characters are no Characters of `world`.
 *
 * - `states`: each item's state (`workStateOf`). `shown`: every item, whatever its state.
 * - `elements`: each item's `x_packet_elements`, in their order, each `{type, id, reason}`; an entry without the three
 *   (strings, the id not blank) is ignored.
 * - `openWork`: for each element id any item names, the ids of the open work (`isOpenWork`) that names it; a standing
 *   item is counted on none.
 * - `askers`: each item's asker, the Character of `world` its `x_packet_from` names written exactly so, else null.
 * - `lints`: `{kind: 'asker', item}` for a key that is no one id (not a string, or empty once trimmed of White_Space), or
 *   that names, written exactly so, an element the reader holds that is no Character of `world` (an id in `others`, in
 *   `sourceWorld`, or one of the items given). A key absent or null, and an id that names no element the reader holds in
 *   any spelling, are no lint.
 * - `waitingOn`: for each Character of `world`, the open work whose asker it is.
 *
 * Only `elements` holds lists in a rule order; `shown`, every list in `openWork` and `waitingOn`, and `lints` are in the
 * order the items are given, and the page rules none: compare them as sets. Pure.
 */
export function workOf(items: readonly object[], world: OwWorkWorld, sourceWorld?: OwWorkWorld | null): OwWork {
  if (!Array.isArray(items)) throw new TypeError('workOf: items is a list of work items.');
  if (!isBody(world)) throw new TypeError('workOf: world is an object with its characters and others.');
  if (sourceWorld !== undefined && sourceWorld !== null && !isBody(sourceWorld)) {
    throw new TypeError('workOf: sourceWorld is an object with its characters and others, or left out.');
  }
  const characters = idsOf(world.characters);
  const held = new Set<string>([...idsOf(world.others)]);
  if (isBody(sourceWorld)) for (const id of [...idsOf(sourceWorld.characters), ...idsOf(sourceWorld.others)]) held.add(id);

  const read: Body[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isWorkItem(item) || typeof item.id !== 'string' || item.id === '' || seen.has(item.id)) continue;
    seen.add(item.id);
    read.push(item);
  }
  for (const id of seen) held.add(id);

  const out: OwWork = { states: {}, shown: [], openWork: {}, elements: {}, askers: {}, lints: [], waitingOn: {} };
  for (const id of characters) put(out.waitingOn, id, []);
  for (const item of read) {
    const id = item.id as string;
    const open = isOpenWork(item);
    put(out.states, id, workStateOf(item));
    out.shown.push(id);
    const elements = elementsOf(item);
    put(out.elements, id, elements);
    for (const e of elements) {
      if (!has(out.openWork, e.id)) put(out.openWork, e.id, []);
      const list = out.openWork[e.id];
      if (open && !list.includes(id)) list.push(id);
    }
    const key = askerKey(item);
    let asker: string | null = null;
    if (key === 'bad') out.lints.push({ kind: 'asker', item: id });
    else if (key !== 'absent') {
      if (characters.has(key)) asker = key;
      else if (held.has(key)) out.lints.push({ kind: 'asker', item: id });
    }
    put(out.askers, id, asker);
    if (asker !== null && open) out.waitingOn[asker].push(id);
  }
  return out;
}
