// The address profile (schema-dist profiles/address.md, serial 77): one element named by one triple,
// the world's id, the type word and the element's id, in three spellings: the site's address
// (https://www.onlyworlds.com/w/<world>/<type>/<id>), the text form inside a world
// (ow://<type>/<id>) and the text form across worlds (ow://<world>/<type>/<id>); a world by itself in
// two of them; an optional moment (@<step>) and lens (?lens=<id>). elementAddress writes one,
// parseOwLink reads one. The fixture, profiles/address.fixture.json, is this file's own test, and the
// Python package's element_address and parse_ow_link answer every string the same way.
//
// The parser is written out by hand, never the runtime's URL class: a URL parser lowercases the host,
// percent-decodes, drops default ports and resolves dots, and the profile refuses or keeps each of
// those as written. Case is ASCII case (A to Z) only, and nothing is percent-decoded.

import { ELEMENT_TYPES, type ElementType } from './v2/types.generated';
import { trimWhiteSpace } from './room';
import { refuseUnknownOptions } from './options';

/** The two forms of an address: the site's (`human`) and the `ow://` text forms (`text`). */
export type OwAddressForm = 'human' | 'text';

/** Why an address was refused, by the profile's own names, in the order a parser checks them. `no_world` and `bad_form` are the writer's only. */
export type OwAddressReason =
  | 'not_an_address' | 'uppercase' | 'segments' | 'bad_world' | 'unknown_type' | 'bad_id' | 'bad_moment' | 'bad_lens'
  | 'no_world' | 'bad_form';

/** What `elementAddress` writes from: a form and a triple, or a form and a world. Absent and null are the same. */
export interface OwAddress {
  form: OwAddressForm;
  /** The world's id; absent for the text form inside a world. Never a slug: a writer refuses one. */
  world?: string | null;
  /** The type word, lowercase (`character`); absent, with `id`, for a world's own address. */
  type?: string | null;
  /** The element's id; absent, with `type`, for a world's own address. */
  id?: string | null;
  /** A lens: an element's id, read through that lens. */
  lens?: string | null;
  /** A moment: one step of the world's time line, a whole number in the 32-bit range. */
  moment?: number | null;
}

/** What `parseOwLink` reads from a string. Hex is given lowercase; `type` and `id` are null for a world's own address. */
export interface OwAddressReading {
  form: OwAddressForm;
  /** The world's id or, in the site's form only, its slug; null in the text form inside a world. */
  world: string | null;
  /** True when `world` is a slug (the site's form only): never canonical, since a writer writes the id. */
  worldIsSlug: boolean;
  type: ElementType | null;
  id: string | null;
  lens: string | null;
  moment: number | null;
  /** True when the string as received is exactly what `elementAddress` writes for this reading. */
  canonical: boolean;
}

const MESSAGES: Record<OwAddressReason, string> = {
  not_an_address: 'not an address: it starts with neither https://www.onlyworlds.com/w/ nor ow://',
  uppercase: 'an address is written in lowercase: the prefix or the type word is in another case',
  segments: 'the wrong number of path segments, or an empty one: a type needs an id and an id a type',
  bad_world: 'the world is not an id (or, in the site\'s address only, a slug)',
  unknown_type: 'the type word is not one of the 22',
  bad_id: 'the element id is not a UUID in the hyphenated 8-4-4-4-12 form',
  bad_moment: 'the moment is not a whole step in decimal within the 32-bit range',
  bad_lens: 'the lens is not one lowercase lens key holding an id',
  no_world: 'this address needs a world',
  bad_form: 'the form is neither human nor text',
};

/** An address was refused; nothing was read or written. `reason` names why, by the profile's name, for a tool to word its own message. */
export class OwAddressError extends Error {
  readonly reason: OwAddressReason;
  constructor(reason: OwAddressReason, message: string = MESSAGES[reason]) {
    super(message);
    this.name = 'OwAddressError';
    this.reason = reason;
  }
}

const refuse = (reason: OwAddressReason): never => {
  throw new OwAddressError(reason);
};

const HUMAN_PREFIX = 'https://www.onlyworlds.com/w/';
const TEXT_PREFIX = 'ow://';
const TYPES: ReadonlySet<string> = new Set(ELEMENT_TYPES);
const UUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP = /^(?:0|-?[1-9][0-9]*)$/;
const STEP_MIN = -2147483648;
const STEP_MAX = 2147483647;
/** An address's keys, a reading's included. Module-internal: openers.ts fences its address with the same list. */
export const ADDRESS_KEYS: readonly string[] = ['form', 'world', 'type', 'id', 'lens', 'moment', 'worldIsSlug', 'canonical'];

/** A to Z lowered, nothing else: the profile's case is ASCII's, so no runtime's Unicode tables decide it. */
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
const isUuid = (s: string): boolean => UUID.test(s);
/** An id's four hyphens at their places in `text` from `at`: checked before a slice, so an end that holds no id costs four reads. */
const hyphensAt = (text: string, at: number): boolean =>
  text.charCodeAt(at + 8) === 45 && text.charCodeAt(at + 13) === 45 && text.charCodeAt(at + 18) === 45 && text.charCodeAt(at + 23) === 45;
const isSlug = (s: string): boolean => s.length >= 3 && s.length <= 40 && SLUG.test(s);

/** The type word as given, or the refusal: `uppercase` for one of the 22 in another case, else `unknown_type`. */
function checkType(word: string): ElementType {
  if (TYPES.has(word)) return word as ElementType;
  return refuse(TYPES.has(asciiLower(word)) ? 'uppercase' : 'unknown_type');
}

/** The string a writer writes; every part already checked, hex already lowercase. */
function write(form: OwAddressForm, world: string | null, type: string | null, id: string | null, moment: number | null, lens: string | null): string {
  const parts: string[] = [];
  if (world !== null) parts.push(world);
  if (type !== null && id !== null) parts.push(type, id);
  let out = (form === 'human' ? HUMAN_PREFIX : TEXT_PREFIX) + parts.join('/');
  if (moment !== null) out += `@${moment}`;
  if (lens !== null) out += `?lens=${lens}`;
  return out;
}

const given = (v: unknown): boolean => v !== undefined && v !== null;

/**
 * An address as the profile writes it: lowercase throughout, the world's id (never its slug), the
 * moment before the lens, nothing else. `address` is a form and a triple (`{ form: 'text', world,
 * type, id }`; no `world` for the text form inside a world), or a form and a world alone for the
 * world's own address; `lens` and `moment` optional. A reading from `parseOwLink` is taken as it
 * stands, so `elementAddress(parseOwLink(s))` is the canonical spelling of `s` (a slug refuses).
 *
 * Refuses with `OwAddressError` (`reason`): `bad_form`, `segments` (a type without an id or an id
 * without a type), `no_world` (the site's form, or a world's own text form, with no world),
 * `bad_world` (not an id: a slug too), `uppercase` / `unknown_type`, `bad_id`, `bad_moment` (not a
 * whole number in the 32-bit range), `bad_lens`, in that order. An unknown key is a TypeError.
 */
export function elementAddress(address: OwAddress | OwAddressReading): string {
  if (address === null || typeof address !== 'object' || Array.isArray(address)) {
    throw new TypeError('elementAddress: the address is an object ({ form, world, type, id, lens, moment })');
  }
  refuseUnknownOptions('elementAddress', address, ADDRESS_KEYS);
  const a = address as unknown as Record<string, unknown>;
  const form = a.form;
  if (form !== 'human' && form !== 'text') return refuse('bad_form');
  const hasType = given(a.type);
  const hasId = given(a.id);
  if (hasType !== hasId) return refuse('segments');
  const hasWorld = given(a.world);
  if (!hasWorld && (form === 'human' || !hasType)) return refuse('no_world');
  let world: string | null = null;
  if (hasWorld) {
    if (typeof a.world !== 'string' || !isUuid(a.world)) return refuse('bad_world');
    world = a.world.toLowerCase();
  }
  let type: string | null = null;
  let id: string | null = null;
  if (hasType) {
    type = typeof a.type === 'string' ? checkType(a.type) : refuse('unknown_type');
    if (typeof a.id !== 'string' || !isUuid(a.id)) return refuse('bad_id');
    id = a.id.toLowerCase();
  }
  let moment: number | null = null;
  if (given(a.moment)) {
    const m = a.moment;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < STEP_MIN || m > STEP_MAX) return refuse('bad_moment');
    moment = m === 0 ? 0 : m; // -0 is written 0
  }
  let lens: string | null = null;
  if (given(a.lens)) {
    if (typeof a.lens !== 'string' || !isUuid(a.lens)) return refuse('bad_lens');
    lens = a.lens.toLowerCase();
  }
  return write(form, world, type, id, moment, lens);
}

/** The value of the one `lens` key, or null without one. Any key that is `lens` in another case, a second one, or a value that is not an id refuses. */
function readLens(query: string): string | null {
  let lens: string | null = null;
  let seen = false;
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (asciiLower(key) !== 'lens') continue; // another key: ignored (and the address is not canonical)
    if (key !== 'lens' || seen) return refuse('bad_lens');
    seen = true;
    const value = eq === -1 ? '' : part.slice(eq + 1);
    if (!isUuid(value)) return refuse('bad_lens');
    lens = value.toLowerCase();
  }
  return lens;
}

/**
 * One string read whole as an address (a link inside other text is the caller's to find first). The
 * checks run in the profile's order and the first that fails names the refusal, as an
 * `OwAddressError` with `reason`: trim (Unicode White_Space), the prefix (`uppercase` for one in
 * another case, else `not_an_address`; a value that is not a string is `not_an_address` too), drop a
 * fragment, split off the query at the first `?`, split the path on `/`, the last segment at its first
 * `@`; then `segments`, `bad_world`, `unknown_type` / `uppercase`, `bad_id`, `bad_moment`, `bad_lens`.
 *
 * Another query key and a fragment are ignored and make the reading not canonical; nothing is
 * percent-decoded. The site's form takes a slug for the world (reported as `worldIsSlug`, never
 * canonical); the text forms take the id only. Ids are read in either case of hex and given lowercase.
 */
export function parseOwLink(text: string): OwAddressReading {
  if (typeof text !== 'string') return refuse('not_an_address');
  const s = trimWhiteSpace(text);
  let form: OwAddressForm;
  let rest: string;
  if (s.startsWith(HUMAN_PREFIX)) {
    form = 'human';
    rest = s.slice(HUMAN_PREFIX.length);
  } else if (s.startsWith(TEXT_PREFIX)) {
    form = 'text';
    rest = s.slice(TEXT_PREFIX.length);
  } else {
    const lowered = asciiLower(s);
    return refuse(lowered.startsWith(HUMAN_PREFIX) || lowered.startsWith(TEXT_PREFIX) ? 'uppercase' : 'not_an_address');
  }
  const hash = rest.indexOf('#');
  if (hash !== -1) rest = rest.slice(0, hash);
  const q = rest.indexOf('?');
  const query = q === -1 ? null : rest.slice(q + 1);
  const segments = (q === -1 ? rest : rest.slice(0, q)).split('/');
  const last = segments[segments.length - 1];
  const at = last.indexOf('@');
  const step = at === -1 ? null : last.slice(at + 1);
  if (at !== -1) segments[segments.length - 1] = last.slice(0, at);

  const n = segments.length;
  if (form === 'human' ? n !== 1 && n !== 3 : n < 1 || n > 3) return refuse('segments');
  if (segments.some(seg => seg === '')) return refuse('segments');
  if (n === 1 && TYPES.has(segments[0])) return refuse('segments');

  let world: string | null = null;
  let worldIsSlug = false;
  if (n !== 2) {
    const w = segments[0];
    if (isUuid(w)) world = w.toLowerCase();
    else if (form === 'human' && isSlug(w) && !TYPES.has(w)) {
      world = w;
      worldIsSlug = true;
    } else return refuse('bad_world');
  }
  let type: ElementType | null = null;
  let id: string | null = null;
  if (n !== 1) {
    type = checkType(segments[n - 2]);
    if (!isUuid(segments[n - 1])) return refuse('bad_id');
    id = segments[n - 1].toLowerCase();
  }
  let moment: number | null = null;
  if (step !== null) {
    if (!STEP.test(step) || step.length > 11) return refuse('bad_moment');
    const m = Number(step);
    if (m < STEP_MIN || m > STEP_MAX) return refuse('bad_moment');
    moment = m;
  }
  const lens = query === null ? null : readLens(query);
  const canonical = !worldIsSlug && text === write(form, world, type, id, moment, lens);
  return { form, world, worldIsSlug, type, id, lens, moment, canonical };
}

/** What `findOwLinks` answers for each address in a text: where it starts and ends, and what it reads. */
export interface OwAddressFound {
  /** The index of the address's first character in the text. */
  start: number;
  /** The index just past the address, as `readOwLinkAt` answers it. */
  end: number;
  /** What `parseOwLink` answers for `text.slice(start, end)`. */
  reading: OwAddressReading;
}

/** What `readOwLinkAt` answers: the address read, and the index just past it in the text. */
export interface OwAddressAt {
  /** What `parseOwLink` answers for `text.slice(index, end)`. */
  reading: OwAddressReading;
  /** The index just past the address: the text's first character that is not part of it, or its length. */
  end: number;
}

/** The characters a path segment can hold (an id, a slug, a type word in any case) and the slash between them. */
const PATH_CHAR = /[0-9A-Za-z\/-]/;
/** No path the parser reads is longer: a world's id, the longest type word and an element's id, two slashes. */
const PATH_MAX = 36 + 1 + Math.max(...ELEMENT_TYPES.map(t => t.length)) + 1 + 36;
/** No element path after a world is longer: a slash, the longest type word, a slash and an element's id. */
const ELEMENT_PATH_MAX = 1 + Math.max(...ELEMENT_TYPES.map(t => t.length)) + 1 + 36;
/** The run after `/w/`: the slug's alphabet (lowercase letters, digits, hyphens) and the id's (hex in either case). */
const WORLD_RUN_CHAR = /[0-9a-zA-F-]/;
/** A run followed by one of these is cut inside a word: a letter (any script), a combining mark or an underscore (Unicode L and M). */
const IN_A_WORD = /^[\p{L}\p{M}_]/u;
/** Where the code point holding the unit at `i` starts: one unit back when `i` is the low half of a pair. */
function codePointStart(text: string, i: number): number {
  const c = text.charCodeAt(i);
  if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
    const h = text.charCodeAt(i - 1);
    if (h >= 0xd800 && h <= 0xdbff) return i - 1;
  }
  return i;
}
/** A moment's value as found in prose: its whole run of an optional minus and digits (the parser's step grammar decides whether it reads). */
const STEP_RUN = /^-?[0-9]+/;
/** A lens's value as found in prose: an id is 36 characters, and the lens ends where its id ends. */
const ID_LENGTH = 36;

/** Whether the string parses whole as an address. */
function parses(s: string): boolean {
  try {
    parseOwLink(s);
    return true;
  } catch (err) {
    if (err instanceof OwAddressError) return false;
    throw err;
  }
}

/**
 * The address that starts exactly at `index` in a text, found in prose, and where it ends; null when the text there is
 * not an address. Both forms, `ow://` and `https://www.onlyworlds.com/w/`, the prefix as written (lowercase). In the
 * site's form the run after `/w/` is read whole, once, with no order between an id and a slug: it ends at the first
 * character outside the slug's alphabet (lowercase letters, digits, hyphens) or the id's (hex in either case); exactly
 * an id's form is the id, any other run `parseOwLink` reads as a slug is the slug (not a type word, no closing hyphen,
 * 3 to 40 characters), else no address; a run followed by a letter (any script), a combining mark or an underscore
 * is cut inside a word and is no address (`/w/mopPetopia.`, `/w/hyper_ion.`). After the world, or in the text form from the prefix, the path
 * is the longest one `parseOwLink` reads; after it the address continues only with `@` and a moment (the parser's step
 * grammar, its whole run of an optional minus and digits) and then `?lens=` and a lens (an id, which ends where its 36
 * characters end). Any other query key or a fragment is not part of an address found in prose: the address ends
 * before its `?`, `&` or `#`, and a `@` or `?lens=` whose value does not read is not taken (the address ends before
 * it). What follows is prose, a full stop included (serial 123). An address begins at the start of the text or after
 * a character that does not glue it to a word: after a letter (any script), a combining mark or an underscore the
 * start is inside a word and this answers null (`elbow://object/<id>`); a hyphen or a digit before it does not glue
 * (`x-ow://`, `3ow://`), the same set read from both ends.
 *
 * `end` is the index just past the address and `reading` what `parseOwLink` answers for `text.slice(index, end)`,
 * which `parseOwLink` itself still reads whole, unchanged: `ow://object/<id>.` handed to it whole is refused.
 * `index` and `end` count JavaScript string indexes (UTF-16 code units), so they match `text.slice` and `indexOf`. A text that is not a string, or an index that is not a
 * whole number from 0, is a TypeError; an index past the end reads nothing.
 *
 * ```ts
 * const line = 'Built the gate: ow://object/01a1d4ef-0000-7000-8000-000000000084.';
 * const found = readOwLinkAt(line, 16);
 * found?.end;          // 64: line[64] is the full stop
 * found?.reading.id;   // '01a1d4ef-0000-7000-8000-000000000084'
 * ```
 */
export function readOwLinkAt(text: string, index: number = 0): OwAddressAt | null {
  if (typeof text !== 'string') throw new TypeError('readOwLinkAt: text must be a string');
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) throw new TypeError('readOwLinkAt: index must be a whole number from 0');
  // A start glued to a word is prose, the mirror of the cut after the run (since serial 127):
  // the character before is read whole, so a letter above U+FFFF (two code units) glues as any letter does.
  if (index > 0 && index <= text.length && IN_A_WORD.test(String.fromCodePoint(text.codePointAt(codePointStart(text, index - 1))!))) return null;
  const human = text.startsWith(HUMAN_PREFIX, index);
  let start: number;
  if (human) start = index + HUMAN_PREFIX.length;
  else if (text.startsWith(TEXT_PREFIX, index)) start = index + TEXT_PREFIX.length;
  else return null;
  let end = -1;
  let floor = start;
  let run = start;
  if (human) {
    // The site's form: the run after `/w/` is read whole, once, with no order between an id and a slug (serial 123).
    let w = start;
    while (w < text.length && WORLD_RUN_CHAR.test(text[w])) w++;
    if (IN_A_WORD.test(text.slice(w, w + 2))) return null;
    const world = text.slice(start, w);
    if (!isUuid(world) && !(isSlug(world) && !TYPES.has(world))) return null;
    end = floor = run = w;
    while (run < text.length && run - w <= ELEMENT_PATH_MAX && PATH_CHAR.test(text[run])) run++;
  } else {
    while (run < text.length && run - start <= PATH_MAX && PATH_CHAR.test(text[run])) run++;
  }
  // Every path the parser takes here ends in an id (a world's in the text form, an element's after a world), so an
  // end whose last 36 characters are not an id is passed over without a parse: a refused parse costs an exception.
  for (let p = run; p > floor; p--) {
    if (p - ID_LENGTH >= start && hyphensAt(text, p - ID_LENGTH) && isUuid(text.slice(p - ID_LENGTH, p)) && parses(text.slice(index, p))) {
      end = p;
      break;
    }
  }
  if (end === -1) return null;
  if (text[end] === '@') {
    const step = STEP_RUN.exec(text.slice(end + 1));
    if (step !== null && parses(text.slice(index, end + 1 + step[0].length))) end += 1 + step[0].length;
  }
  if (text.startsWith('?lens=', end)) {
    const lensEnd = end + 6 + ID_LENGTH;
    if (lensEnd <= text.length && isUuid(text.slice(end + 6, lensEnd)) && parses(text.slice(index, lensEnd))) end = lensEnd;
  }
  return { reading: parseOwLink(text.slice(index, end)), end };
}

/**
 * Every address in a text, in order: each `{start, end, reading}`, read by `readOwLinkAt` at every place either
 * prefix (`ow://`, `https://www.onlyworlds.com/w/`) starts, so a start glued to a word is prose and what follows an
 * address is prose as `readOwLinkAt` says. The search goes on from the end of each address found, so no two overlap,
 * and from just past a start that reads nothing. Linear in the text: each prefix's next place is searched once, and
 * a start reads a bounded stretch. `start` and `end` count JavaScript string indexes, as `readOwLinkAt`'s do. A text
 * that is not a string is a TypeError.
 *
 * ```ts
 * findOwLinks('See ow://object/01a1d4ef-0000-7000-8000-000000000084, not elbow://object/01a1d4ef-0000-7000-8000-000000000084.');
 * // [{ start: 4, end: 52, reading: { type: 'object', id: '01a1d4ef-…', … } }]
 * ```
 */
export function findOwLinks(text: string): OwAddressFound[] {
  if (typeof text !== 'string') throw new TypeError('findOwLinks: text must be a string');
  const found: OwAddressFound[] = [];
  let nextText = text.indexOf(TEXT_PREFIX);
  let nextHuman = text.indexOf(HUMAN_PREFIX);
  let at = 0;
  for (;;) {
    if (nextText !== -1 && nextText < at) nextText = text.indexOf(TEXT_PREFIX, at);
    if (nextHuman !== -1 && nextHuman < at) nextHuman = text.indexOf(HUMAN_PREFIX, at);
    const start = nextText === -1 ? nextHuman : nextHuman === -1 ? nextText : Math.min(nextText, nextHuman);
    if (start === -1) return found;
    const got = readOwLinkAt(text, start);
    if (got === null) {
      at = start + 1;
    } else {
      found.push({ start, end: got.end, reading: got.reading });
      at = got.end;
    }
  }
}
