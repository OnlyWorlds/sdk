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
const ADDRESS_KEYS: readonly string[] = ['form', 'world', 'type', 'id', 'lens', 'moment', 'worldIsSlug', 'canonical'];

/** A to Z lowered, nothing else: the profile's case is ASCII's, so no runtime's Unicode tables decide it. */
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
const isUuid = (s: string): boolean => UUID.test(s);
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
