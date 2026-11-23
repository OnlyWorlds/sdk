/**
 * The values an import door reads, held the way the Python package's doors hold them, so a door
 * written here gives the same folder as its Python twin byte for byte. JSON is read into ordered
 * maps (a JavaScript object puts integer-like keys first, Python keeps them as written) and keeps a
 * number written with a fraction or an exponent apart from a whole one (Python reads `3.0` as a
 * float, which is not an id and prints as `3.0`). The helpers are Python's own rules for what a
 * door asks of a value: truth, equality, `str`, `repr`, whitespace, digits, `str.format`.
 *
 * Module-internal: not in the package's exports.
 */

import { byCodePoint } from '../message';

/** A JSON number Python reads as a float: written with a fraction or an exponent. */
export class PyFloat {
  constructor(readonly value: number) {}
}

export type PyValue = null | boolean | number | string | PyFloat | PyValue[] | PyDict;
export type PyDict = Map<string, PyValue>;

export const isDict = (v: PyValue | undefined): v is PyDict => v instanceof Map;
export const isList = (v: PyValue | undefined): v is PyValue[] => Array.isArray(v);
/** A Python `int`: a whole JSON number (a boolean is not one here, as the doors test it). */
export const isInt = (v: PyValue | undefined): v is number => typeof v === 'number';
export const isStr = (v: PyValue | undefined): v is string => typeof v === 'string';

/** `d.get(k)`: null for a key it does not have. */
export function get(d: PyDict, k: string): PyValue {
  const v = d.get(k);
  return v === undefined ? null : v;
}

/** The number a bool, int or float stands for in Python's arithmetic and comparisons, else null. */
function numeric(v: PyValue): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (v instanceof PyFloat) return v.value;
  return null;
}

/** Python's `bool(v)`. */
export function truthy(v: PyValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof PyFloat) return v.value !== 0; // NaN is true in Python
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v.size > 0;
}

/** Python's `a == b` for JSON values: True == 1 == 1.0, a dict is equal whatever its order. */
export function eq(a: PyValue, b: PyValue): boolean {
  const x = numeric(a);
  const y = numeric(b);
  if (x !== null || y !== null) return x !== null && y !== null && x === y;
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => eq(v, b[i]));
  }
  const da = a as PyDict;
  const db = b as PyDict;
  if (da.size !== db.size) return false;
  for (const [k, v] of da) {
    if (!db.has(k) || !eq(v, db.get(k)!)) return false;
  }
  return true;
}

/** Python's `v in (x, y, ...)`. */
export const among = (v: PyValue, options: readonly PyValue[]): boolean => options.some(o => eq(v, o));

// --- whitespace and digits ------------------------------------------------------

/** What Python's `str.isspace()`, `str.strip()` and a regex `\s` take as whitespace. */
export const PY_SPACE = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const LEAD = new RegExp(`^[${PY_SPACE}]+`);
const TRAIL = new RegExp(`[${PY_SPACE}]+$`);

/** `s.strip()`, `s.lstrip()`, `s.rstrip()` with Python's whitespace. */
export const strip = (s: string): string => s.replace(LEAD, '').replace(TRAIL, '');
export const lstrip = (s: string): string => s.replace(LEAD, '');
export const rstrip = (s: string): string => s.replace(TRAIL, '');

/** `s.strip(chars)`. */
export function stripChars(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

const ND = /^\p{Nd}$/u;

/** A run of decimal digits (any script's, as Python's `int()` reads them) as a number. */
export function digitsValue(digits: string): number {
  let n = 0;
  for (const ch of digits) {
    let cp = ch.codePointAt(0)!;
    if (cp >= 0x30 && cp <= 0x39) {
      n = n * 10 + (cp - 0x30);
      continue;
    }
    // A script's digits are runs of ten from its zero; adjacent runs (the mathematical digits) stay aligned.
    let start = cp;
    while (ND.test(String.fromCodePoint(start - 1))) start--;
    cp -= start;
    n = n * 10 + (cp % 10);
  }
  return n;
}

/** `s.strip().isdigit()` then `int(s)`, for a string of decimal digits; null when it is not one. */
export function intOfDigits(s: string): number | null {
  const t = strip(s);
  return t && /^\p{Nd}+$/u.test(t) ? digitsValue(t) : null;
}

// --- str and repr ---------------------------------------------------------------

/** Python's `repr(float)`: the shortest digits that read back, `1.0`, `1e+16`, `1.5e-05`. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const [mant, expPart] = Math.abs(x).toExponential().split('e');
  const exp = Number(expPart);
  const digits = mant.replace('.', '');
  const sign = x < 0 ? '-' : '';
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  const whole = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  const frac = digits.slice(exp + 1);
  return `${sign}${whole}.${frac || '0'}`;
}

/** A whole number as Python writes it: every digit, never an exponent. */
export function intStr(n: number): string {
  return Number.isSafeInteger(n) ? String(n) : BigInt(n).toString();
}

const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** Python's `repr(str)`: single quotes unless the text holds one and no double quote. */
export function strRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === quote || ch === '\\') out += `\\${ch}`;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch !== ' ' && NOT_PRINTABLE.test(ch)) {
      if (cp < 0x100) out += `\\x${cp.toString(16).padStart(2, '0')}`;
      else if (cp < 0x10000) out += `\\u${cp.toString(16).padStart(4, '0')}`;
      else out += `\\U${cp.toString(16).padStart(8, '0')}`;
    } else out += ch;
  }
  return out + quote;
}

/** Python's `repr(v)`. */
export function repr(v: PyValue): string {
  if (typeof v === 'string') return strRepr(v);
  if (Array.isArray(v)) return `[${v.map(repr).join(', ')}]`;
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${strRepr(k)}: ${repr(x)}`).join(', ')}}`;
  return str(v);
}

/** Python's `str(v)`. */
export function str(v: PyValue): string {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return intStr(v);
  if (v instanceof PyFloat) return floatRepr(v.value);
  if (typeof v === 'string') return v;
  return repr(v);
}

/** Python's `format(x, 'g')` for a number (precision 6, trailing zeros dropped). */
function formatG(x: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const [mant, expPart] = x.toExponential(5).split('e');
  const exp = Number(expPart);
  const trim = (m: string): string => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m);
  if (exp < -4 || exp >= 6) return `${trim(mant)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  return trim(x.toFixed(Math.max(0, 5 - exp)));
}

/** A value handed to `format`: a JSON value, or a plain number the door counted. */
export type FormatValue = PyValue;

/**
 * Python's `template.format(**values)` for the forms a door's wording uses: `{name}` (str),
 * `{name!r}` (repr), `{name:g}` (a number), and `{{` `}}` for a brace. Any other form is refused,
 * so wording that would read differently in the two packages cannot be written.
 */
export function format(template: string, values: Record<string, FormatValue>): string {
  return template.replace(/\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)(!r)?(?::(g))?\}|[{}]/g, (m, name, r, g) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    if (name === undefined) throw new Error(`a template holds a brace it cannot read: ${template}`);
    if (!(name in values)) throw new Error(`a template names {${name}}, which was not given: ${template}`);
    const v = values[name];
    if (g) {
      const x = numeric(v);
      if (x === null) throw new Error(`{${name}:g} is not a number`);
      return formatG(x);
    }
    return r ? repr(v) : str(v);
  });
}

// --- JSON as Python's json module reads and writes it ---------------------------

/** Python's `json.JSONDecodeError`: the door names its class in a note. */
export class PyJsonError extends Error {
  readonly pyName: string = 'JSONDecodeError';
}

/**
 * A plain `ValueError` from the Python package's reader of outside text: JSON by the grammar that
 * the reader refuses, for its depth or for a number it cannot hold.
 */
export class PyJsonValueError extends PyJsonError {
  override readonly pyName: string = 'ValueError';
}

/** The deepest nesting read, as the Python reader counts it: an object or array at the top is depth 1. */
export const LOADS_MAX_DEPTH = 200;
/**
 * Past this depth the parse stops at once, where the Python reader stops on the interpreter's own
 * limit or reads on, by platform: up to here the two name the same error for every text.
 */
const LOADS_HARD_DEPTH = 1000;
const TOO_DEEP = `nested more than ${LOADS_MAX_DEPTH} deep`;

const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y;
const WS = /[ \t\n\r]*/y;

/**
 * The Python package's reader of outside text (`json.loads` behind its checks): objects as ordered
 * maps, a float apart from an int. Text that is no JSON is a `PyJsonError`. JSON the reader refuses
 * is a `PyJsonValueError`: nested more than 200 deep, a number too large for a double, or `NaN`,
 * `Infinity` and `-Infinity`, which Python's `json` would read. One difference from Python stays,
 * and is refused rather than read wrong: an integer past 2^53, which Python holds exactly up to
 * 4,300 digits and a double rounds.
 */
export function loads(text: string): PyValue {
  let i = 0;
  let depth = 0;
  let tooDeep = false;
  const enter = (): void => {
    depth++;
    if (depth > LOADS_MAX_DEPTH) tooDeep = true;
    if (depth > LOADS_HARD_DEPTH) throw new PyJsonValueError(TOO_DEEP);
  };
  const fail = (what: string): never => {
    throw new PyJsonError(`${what} at ${i}`);
  };
  const ws = (): void => {
    WS.lastIndex = i;
    WS.exec(text);
    i = WS.lastIndex;
  };
  const string = (): string => {
    i++; // the opening quote
    let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string');
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        return out;
      }
      if (c < 0x20) fail('Invalid control character');
      if (c !== 0x5c) {
        let j = i;
        while (j < text.length) {
          const d = text.charCodeAt(j);
          if (d === 0x22 || d === 0x5c || d < 0x20) break;
          j++;
        }
        out += text.slice(i, j);
        i = j;
        continue;
      }
      const e = text[i + 1];
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e !== undefined && e in simple) {
        out += simple[e];
        i += 2;
        continue;
      }
      if (e !== 'u') fail('Invalid \\escape');
      const hex = text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\uXXXX escape');
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
    }
  };
  const value = (): PyValue => {
    ws();
    const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++;
      enter();
      const d: PyDict = new Map();
      ws();
      if (text[i] === '}') {
        i++;
        depth--;
        return d;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('Expecting property name enclosed in double quotes');
        const k = string();
        ws();
        if (text[i] !== ':') fail("Expecting ':' delimiter");
        i++;
        d.set(k, value());
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          depth--;
          return d;
        }
        fail("Expecting ',' delimiter");
      }
    }
    if (c === '[') {
      i++;
      enter();
      const a: PyValue[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        depth--;
        return a;
      }
      for (;;) {
        a.push(value());
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          depth--;
          return a;
        }
        fail("Expecting ',' delimiter");
      }
    }
    for (const [word, v] of [['null', null], ['true', true], ['false', false]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    for (const word of ['NaN', 'Infinity', '-Infinity']) {
      if (text.startsWith(word, i)) throw new PyJsonValueError(`${word} is not JSON`);
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) return fail('Expecting value');
    i = NUMBER.lastIndex;
    if (m[1] === undefined && m[2] === undefined) {
      const n = Number(m[0]);
      if (!Number.isSafeInteger(n)) throw new PyJsonValueError('an integer past 2^53, which a double rounds');
      return n === 0 ? 0 : n; // Python's int has no -0
    }
    const f = Number(m[0]);
    if (!Number.isFinite(f)) throw new PyJsonValueError('a number too large to hold');
    return new PyFloat(f);
  };
  const v = value();
  ws();
  if (i !== text.length) fail('Extra data');
  if (tooDeep) throw new PyJsonValueError(TOO_DEEP);
  return v;
}

/** Python's `json.dumps(v, sort_keys=True, ensure_ascii=False)`: one comparable text for a value. */
export function dumpsSorted(v: PyValue): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') return intStr(v);
  if (v instanceof PyFloat) {
    const x = v.value;
    return Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : floatRepr(x);
  }
  if (typeof v === 'string') return dumpsString(v);
  if (Array.isArray(v)) return `[${v.map(dumpsSorted).join(', ')}]`;
  const keys = [...v.keys()].sort(byCodePoint);
  return `{${keys.map(k => `${dumpsString(k)}: ${dumpsSorted(v.get(k)!)}`).join(', ')}}`;
}

function dumpsString(s: string): string {
  const short: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
  return `"${s.replace(/["\\\x00-\x1f]/g, c => short[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}
