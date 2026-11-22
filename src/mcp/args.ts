/**
 * A tool call's arguments checked against the tool's vendored `inputSchema`, as the hosted door checks
 * them before the tool runs: its server validates the call with pydantic (lax mode) and answers a
 * refusal as pydantic's own text. The schema decides each parameter's kind, its default and whether it
 * is required; the errors are written in pydantic's words, one per parameter in the schema's order, then
 * one per argument the schema does not name, in the order sent.
 *
 * What lax mode takes, as the door was seen to take it: an integer from a whole number, a number with no
 * fractional part, a boolean, or a string of digits with White_Space around; a boolean from true or false,
 * 0 or 1, or one of pydantic's words for them; a string only from a string; a list only from a list.
 *
 * Module-internal: not in the package's exports.
 */

import { pyRepr, pyTypeName } from './py';

/** pydantic's version in the door's refusals: the link each error ends on. */
const PYDANTIC_DOCS = 'https://errors.pydantic.dev/2.13/v/';

const MESSAGES: Record<string, string> = {
  string_type: 'Input should be a valid string',
  int_type: 'Input should be a valid integer',
  int_parsing: 'Input should be a valid integer, unable to parse string as an integer',
  int_from_float: 'Input should be a valid integer, got a number with a fractional part',
  bool_type: 'Input should be a valid boolean',
  bool_parsing: 'Input should be a valid boolean, unable to interpret input',
  list_type: 'Input should be a valid list',
  dict_type: 'Input should be a valid dictionary',
  missing_argument: 'Missing required argument',
  unexpected_keyword_argument: 'Unexpected keyword argument',
};

const TRUE_WORDS = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE_WORDS = new Set(['0', 'off', 'f', 'false', 'n', 'no']);
/** Python's str.strip() set, for an integer written as text. */
const PY_SPACE = /^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/g;

interface Failure {
  loc: string;
  type: string;
  input: unknown;
}

type Schema = Record<string, unknown>;
type Checked = { ok: true; value: unknown } | { ok: false; failures: Failure[] };

/** The repr pydantic shows of an input: past 50 bytes, its first 25 and last 24 (a cut inside a character shows nothing of that side). */
function shown(v: unknown): string {
  const text = pyRepr(v);
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= 50) return text;
  const boundary = (i: number) => i === 0 || i === bytes.length || (bytes[i] & 0xc0) !== 0x80;
  const dec = new TextDecoder();
  const head = boundary(25) ? dec.decode(bytes.slice(0, 25)) : '';
  const tail = boundary(bytes.length - 24) ? dec.decode(bytes.slice(bytes.length - 24)) : '';
  return `${head}...${tail}`;
}

function kindOf(prop: Schema): { kind: string; nullable: boolean; items?: Schema } {
  const anyOf = prop.anyOf as Schema[] | undefined;
  if (Array.isArray(anyOf)) {
    const nullable = anyOf.some((s) => s.type === 'null');
    const base = anyOf.find((s) => s.type !== 'null') ?? {};
    return { kind: String(base.type), nullable, items: base.items as Schema | undefined };
  }
  return { kind: String(prop.type), nullable: false, items: prop.items as Schema | undefined };
}

function check(loc: string, prop: Schema, v: unknown): Checked {
  const { kind, nullable, items } = kindOf(prop);
  const fail = (type: string): Checked => ({ ok: false, failures: [{ loc, type, input: v }] });
  if (v === null && nullable) return { ok: true, value: null };
  switch (kind) {
    case 'string':
      return typeof v === 'string' ? { ok: true, value: v } : fail('string_type');
    case 'integer':
      if (typeof v === 'boolean') return { ok: true, value: v ? 1 : 0 };
      if (typeof v === 'number') return Number.isInteger(v) ? { ok: true, value: v } : fail(Number.isFinite(v) ? 'int_from_float' : 'int_parsing');
      if (typeof v === 'string') {
        const t = v.replace(PY_SPACE, '');
        return /^[+-]?[0-9]+$/.test(t) ? { ok: true, value: Number(t) } : fail('int_parsing');
      }
      return fail('int_type');
    case 'boolean':
      if (typeof v === 'boolean') return { ok: true, value: v };
      if (typeof v === 'number') return v === 0 || v === 1 ? { ok: true, value: v === 1 } : fail('bool_parsing');
      if (typeof v === 'string') {
        const t = v.toLowerCase();
        if (TRUE_WORDS.has(t)) return { ok: true, value: true };
        if (FALSE_WORDS.has(t)) return { ok: true, value: false };
        return fail('bool_parsing');
      }
      return fail('bool_type');
    case 'array': {
      if (!Array.isArray(v)) return fail('list_type');
      const failures: Failure[] = [];
      const value: unknown[] = [];
      v.forEach((x, i) => {
        const r = items ? check(`${loc}.${i}`, items, x) : { ok: true as const, value: x };
        if (r.ok) value.push(r.value);
        else failures.push(...r.failures);
      });
      return failures.length ? { ok: false, failures } : { ok: true, value };
    }
    case 'object':
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? { ok: true, value: v } : fail('dict_type');
    default:
      return { ok: true, value: v };
  }
}

/** The arguments with defaults filled in, or the door's refusal text. */
export function checkArgs(tool: string, schema: Schema, args: Record<string, unknown>): { ok: true; values: Record<string, unknown> } | { ok: false; text: string } {
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  const required = new Set((schema.required ?? []) as string[]);
  const values: Record<string, unknown> = {};
  const failures: Failure[] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(args, k);
  for (const [name, prop] of Object.entries(props)) {
    if (!has(name)) {
      if (required.has(name)) failures.push({ loc: name, type: 'missing_argument', input: args });
      else values[name] = prop.default === undefined ? null : prop.default;
      continue;
    }
    const r = check(name, prop, args[name]);
    if (r.ok) values[name] = r.value;
    else failures.push(...r.failures);
  }
  for (const k of Object.keys(args)) if (!Object.prototype.hasOwnProperty.call(props, k)) failures.push({ loc: k, type: 'unexpected_keyword_argument', input: args[k] });
  if (!failures.length) return { ok: true, values };
  const head = `${failures.length} validation error${failures.length === 1 ? '' : 's'} for call[${tool}]`;
  const lines = failures.map((f) => `${f.loc}\n  ${MESSAGES[f.type]} [type=${f.type}, input_value=${shown(f.input)}, input_type=${pyTypeName(f.input)}]\n    For further information visit ${PYDANTIC_DOCS}${f.type}`);
  return { ok: false, text: [head, ...lines].join('\n') };
}
