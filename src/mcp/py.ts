/**
 * The few Python forms the hosted door's answers are written in, for a JSON value: `repr` (the door's
 * refusals quote an argument with `!r`, and pydantic's validation errors show the input by its repr) and
 * `json.dumps` with its default separators (a refusal's envelope, and a resource's text).
 *
 * Module-internal: not in the package's exports.
 */

/** Characters `str.isprintable()` is false for: Python's repr writes each as an escape. Space alone of the separators is printable. */
const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u;

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');

/** `repr(s)` for a str: single quotes unless the text holds one and no double quote, escapes as CPython writes them. */
export function pyStrRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = '';
  for (const c of s) {
    const cp = c.codePointAt(0) as number;
    if (c === '\\') out += '\\\\';
    else if (c === quote) out += `\\${c}`;
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (NOT_PRINTABLE.test(c)) out += cp < 0x100 ? `\\x${hex(cp, 2)}` : cp < 0x10000 ? `\\u${hex(cp, 4)}` : `\\U${hex(cp, 8)}`;
    else out += c;
  }
  return quote + out + quote;
}

/** `repr(x)` for a float, from the shortest digits that read back (both languages use them): fixed between 1e-4 and 1e16, else an exponent of at least two digits. */
function pyFloat(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  const [mantissa, expText] = n.toExponential().split('e');
  const exp = Number(expText);
  if (exp >= -4 && exp < 16) {
    // JavaScript writes the same digits in fixed form from 1e-6 up, so this range is its own String().
    const fixed = String(n);
    return fixed.includes('.') ? fixed : `${fixed}.0`;
  }
  const sign = exp < 0 ? '-' : '+';
  return `${mantissa}e${sign}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/** A JSON number as Python reads it: a whole number is an int (its digits), any other a float. */
function pyNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString();
  return pyFloat(n);
}

/** `repr(x)` for a value parsed from JSON. */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return pyNumber(v);
  if (typeof v === 'string') return pyStrRepr(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${pyStrRepr(k)}: ${pyRepr(x)}`).join(', ')}}`;
  return String(v);
}

/** Python's type name for a value parsed from JSON, as pydantic's `input_type` writes it. */
export function pyTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  return 'dict';
}

function dumpString(s: string, ensureAscii: boolean): string {
  const json = JSON.stringify(s);
  if (!ensureAscii) return json;
  // ensure_ascii writes every unit outside space to tilde as its escape (DEL included, which JSON.stringify leaves).
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const u = json.charCodeAt(i);
    out += u >= 0x20 && u <= 0x7e ? json[i] : `\\u${hex(u, 4)}`;
  }
  return out;
}

/** `json.dumps(v)` with Python's default separators (`, ` and `: `); `ensureAscii` as its argument of that name (default true). */
export function pyDumps(v: unknown, ensureAscii = true): string {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    return pyNumber(v);
  }
  if (typeof v === 'string') return dumpString(v, ensureAscii);
  if (Array.isArray(v)) return `[${v.map((x) => pyDumps(x, ensureAscii)).join(', ')}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${dumpString(k, ensureAscii)}: ${pyDumps(x, ensureAscii)}`).join(', ')}}`;
}
