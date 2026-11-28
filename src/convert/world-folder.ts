/**
 * `worldFolderFiles`: a world and its elements, as plain objects, written as a world folder's files in
 * memory, through the same writer the import doors use (folder.ts), so the bytes are the Python
 * package's `write_folder`'s.
 */

import { ELEMENT_TYPES } from '../v2/types.generated';
import { folderFiles, unsafeIdText, unsafeIdWhy, type OwFolderFile } from './folder';
import { PyFloat, type PyDict, type PyValue } from './py';

const FN = 'worldFolderFiles';

/** What a value is, for a refusal's words. */
function kind(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') return Object.getPrototypeOf(v) === Object.prototype ? 'an object' : `a ${v.constructor?.name ?? 'object'}`;
  if (typeof v === 'number') return `the number ${String(v)}`;
  if (typeof v === 'bigint') return `the bigint ${String(v)}n`;
  if (typeof v === 'string') return `the string ${JSON.stringify(v)}`;
  return String(typeof v === 'symbol' ? 'a symbol' : typeof v === 'function' ? 'a function' : v);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const at = (path: string, key: string): string => (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`);

/**
 * A plain JSON value as the writer holds it: an object as an ordered map (its keys in
 * `Object.keys` order), a safe integer as an integer, any other finite number as a float (both
 * written as `JSON.stringify` writes them). Anything a JSON file cannot hold is refused.
 */
function toPy(v: unknown, path: string, open: Set<object>): PyValue {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError(`${FN}: ${path} is ${String(v)}, which a JSON file cannot hold.`);
    return Number.isSafeInteger(v) ? v : new PyFloat(v);
  }
  if (Array.isArray(v) || isPlainObject(v)) {
    if (open.has(v)) throw new TypeError(`${FN}: ${path} holds itself, which a JSON file cannot hold.`);
    open.add(v);
    let out: PyValue;
    if (Array.isArray(v)) out = Array.from(v, (item, i) => toPy(item, `${path}[${i}]`, open));
    else {
      const map: PyDict = new Map();
      for (const k of Object.keys(v)) map.set(k, toPy(v[k], at(path, k), open));
      out = map;
    }
    open.delete(v);
    return out;
  }
  throw new TypeError(
    `${FN}: ${path} is ${kind(v)}, which a JSON file cannot hold: a value is null, true or false, a finite number, a string, a list or a plain object.`,
  );
}

/**
 * A world folder's files (OnlyWorlds Folder Format v0.3.25), in memory: `world.json` and one file per
 * element under `elements/<type>/`, named and written as the Python package's `write_folder` names
 * and writes them, byte for byte (the same writer as `convertKanka`'s). `writeWorldFile(files, topDir)`
 * packs them into a `.owworld` file, and `folderFetch` (`@onlyworlds/sdk/folder`) serves them.
 *
 * `world` is the world's record (a `GET /world` body, or a read `world.json`): `id` a non-empty string
 * and `name` a string, every key kept in order, `time_range_current` written `time_current`,
 * `format_version` added when absent. `elements` maps an element type to a list of element bodies,
 * each with a non-empty string `id`, written whole and untouched; a stub (`known_of: true`) is
 * written without its unset fields. Within a type a repeated id keeps its last body; the same id
 * under two types is refused. Files come in code point order of their paths.
 *
 * Throws a TypeError, before any file is made, for a world or a body that is not a plain object, a
 * missing `id` or `name`, an element type that is not one of the 22, a list that is not an array, an
 * id under two types, an element id that cannot name a file (one that holds `/`, `\`, or a control
 * character, or is `.` or `..`: as `<id>.json` it would leave its folder or name no file, so it is
 * refused whatever the name; the world's id names no path), and a value a JSON file cannot hold (`undefined`, a function, a `Date`, a
 * `NaN`, a value that holds itself).
 *
 * Known limits against the Python writer: a number is written as JavaScript writes it, which is how
 * the Python writer writes a float too (`2.0` as `2`, `1e21` as `1e+21`), but a whole number past
 * 2^53 is held rounded and written as a float, where Python writes an integer's every digit. And a
 * JavaScript object lists integer-like keys (`"0"`, `"12"`) first, so an object with such keys,
 * parsed from JSON, is written in that order, where Python keeps the order it read.
 */
export function worldFolderFiles(
  world: { readonly id: string; readonly name: string; readonly [key: string]: unknown },
  elements: { readonly [type: string]: readonly { readonly id: string; readonly [field: string]: unknown }[] },
): OwFolderFile[] {
  if (!isPlainObject(world)) {
    throw new TypeError(`${FN}: the world is an object with an id and a name, such as { id: '…', name: 'Harbour' }; got ${kind(world)}.`);
  }
  if (typeof world.id !== 'string' || !world.id) {
    throw new TypeError(`${FN}: the world's id is a non-empty string (folder format §4.1); got ${kind(world.id)}.`);
  }
  if (typeof world.name !== 'string') {
    throw new TypeError(`${FN}: the world's name is a string, which may be empty (folder format §4.1); got ${kind(world.name)}.`);
  }
  if (!isPlainObject(elements)) {
    throw new TypeError(`${FN}: elements is an object from an element type to a list of element bodies, such as { character: [{ id: '…', name: 'Ada' }] }; got ${kind(elements)}.`);
  }
  const byType = new Map<string, PyDict[]>();
  const owner = new Map<string, string>();
  for (const type of Object.keys(elements)) {
    if (!(ELEMENT_TYPES as string[]).includes(type)) {
      throw new TypeError(`${FN}: unknown element type ${JSON.stringify(type)}. The types are ${ELEMENT_TYPES.join(', ')}.`);
    }
    const list: unknown = elements[type];
    const where = at('elements', type);
    if (!Array.isArray(list)) throw new TypeError(`${FN}: ${where} is a list of element bodies; got ${kind(list)}.`);
    const bodies: PyDict[] = [];
    list.forEach((body: unknown, i) => {
      const path = `${where}[${i}]`;
      if (!isPlainObject(body)) throw new TypeError(`${FN}: ${path} is an element body, an object; got ${kind(body)}.`);
      const id = body.id;
      if (typeof id !== 'string' || !id) throw new TypeError(`${FN}: ${path}'s id is a non-empty string; got ${kind(id)}.`);
      const why = unsafeIdWhy(id);
      if (why) throw new TypeError(`${FN}: ${path}: ${unsafeIdText(type, id, why)}`);
      const first = owner.get(id) ?? type;
      if (first !== type) throw new TypeError(`${FN}: id ${id} appears under both ${first} and ${type}.`);
      owner.set(id, type);
      bodies.push(toPy(body, path, new Set()) as PyDict);
    });
    byType.set(type, bodies);
  }
  return folderFiles(toPy(world, 'world', new Set()) as PyDict, byType);
}
