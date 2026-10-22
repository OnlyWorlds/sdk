// The names profile (schema-dist profiles/names.md): a world's own words for the 22 types, `x_names`
// on the World. A display lookup only: the API, the folder, the schema and every id keep the
// standard's names. The fixture, profiles/names.fixture.json, is this file's own test.

import { ELEMENT_TYPES } from './v2/types.generated';
import { fold, trimWhiteSpace } from './room';

/** One word pair of a names map: `one` for a single thing, `many` for a plural (absent: `one`). */
export interface OwWordPair {
  one: string;
  many?: string;
}

/** The World's `x_names` value, as the profile writes it. A reader takes any value and judges it. */
export interface OwNamesMap {
  version: 1;
  /** A type slug (`character`) to its word pair. */
  types?: Record<string, OwWordPair>;
  /** A type slug to a supertype to its word pair, for a finer word inside one type. */
  supertypes?: Record<string, Record<string, OwWordPair>>;
  [k: string]: unknown;
}

const SLUGS: ReadonlySet<string> = new Set(ELEMENT_TYPES);
const OPTION_KEYS: ReadonlySet<string> = new Set(['supertype', 'many']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The word a pair prints, or null when the entry is ignored (no string `one` left after trimming). */
function word(pair: unknown, many: boolean): string | null {
  if (!isObject(pair) || typeof pair.one !== 'string') return null;
  const one = trimWhiteSpace(pair.one);
  if (one === '') return null;
  if (!many) return one;
  const plural = typeof pair.many === 'string' ? trimWhiteSpace(pair.many) : '';
  return plural === '' ? one : plural;
}

/**
 * The world's own word for a type, or null for the standard's name (print your usual label).
 * `world` is a `GET /world` body or a folder's `world.json` (its `x_names` is read); `type` a
 * type slug; `supertype` the element's, when there is one; `many` true for a plural (a list's
 * heading, a count). The order: the supertype's entry, matched trimmed and without regard to case,
 * then the type's entry, then null. A map that is not a names map (not an object, `version` not 1,
 * `types` or `supertypes` not objects, a `supertypes` value not an object) is null everywhere; a bad
 * entry or an unknown slug is ignored. The word is printed as written, never re-cased.
 */
export function typeWord(
  world: { x_names?: unknown } | null | undefined,
  type: string,
  opts: { supertype?: string | null; many?: boolean } = {},
): string | null {
  for (const key of Object.keys(opts ?? {})) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`typeWord: unknown option "${key}" (known: supertype, many)`);
  }
  const map = world?.x_names;
  if (!isObject(map) || map.version !== 1) return null;
  const { types, supertypes } = map;
  if (types !== undefined && !isObject(types)) return null;
  if (supertypes !== undefined) {
    if (!isObject(supertypes)) return null;
    for (const inner of Object.values(supertypes)) if (!isObject(inner)) return null;
  }
  if (!SLUGS.has(type)) return null;
  const many = opts.many === true;
  const supertype = typeof opts.supertype === 'string' ? fold(opts.supertype) : '';
  if (supertype !== '' && isObject(supertypes) && isObject(supertypes[type])) {
    for (const [key, pair] of Object.entries(supertypes[type] as Record<string, unknown>)) {
      if (fold(key) !== supertype) continue;
      const w = word(pair, many);
      if (w !== null) return w;
    }
  }
  return isObject(types) ? word(types[type], many) : null;
}
