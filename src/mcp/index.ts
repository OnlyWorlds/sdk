/**
 * `@onlyworlds/sdk/mcp`: the hosted MCP door's read tools, answered on this computer from world folders.
 * `folderMcpTools(worlds)` gives the tool definitions, resources and templates the door lists, and a
 * `callTool` and a `readResource` that answer as the door answers, each world read through an
 * `OwV2Client` on `folderFetch(entries)`. No transport, no MCP library, no file system: a server wraps
 * it (stdio, a pipe, HTTP), and the same layer answers for a folder on disk, a `.owworld` file's entries
 * or a browser's folder handle.
 *
 * ```ts
 * import { entriesFromDirectory } from '@onlyworlds/sdk/folder';
 * import { folderMcpTools } from '@onlyworlds/sdk/mcp';
 *
 * const mcp = folderMcpTools([{ entries: await entriesFromDirectory('./my-world') }]);
 * mcp.tools;                                              // as tools/list carries them
 * await mcp.callTool('list_elements', { type: 'character' }); // a CallToolResult, as the door's
 * ```
 *
 * The tools are the door's read tools a folder can answer, by the door's names, parameters and
 * answers: `list_element_types`, `get_element_schema`, `search_schema`, `list_worlds`, `get_me`,
 * `list_elements`, `get_element` and `search_elements`; the resources `onlyworlds://schema` and
 * `onlyworlds://world`, the templates `onlyworlds://schema/{type}` and
 * `onlyworlds://element/{type}/{id}`. What a folder cannot answer (`get_changes`, `get_draught`,
 * `list_files`, `read_file`, the writes) is not listed, and a call to it is the door's answer to a
 * tool it does not have. `world` on a call is the id in the world's `world.json` (as `list_worlds`
 * lists it); left out, it is the one world served. The definitions and the schema tools' answers were read from the
 * live door when the package was built (`door.json`, `schemaVersion`), never retyped.
 *
 * Every read goes through each world's client, as its owner reads it: the list, the element and the
 * world; the search is keel's word rule (the folder source's) over the elements the client serves, so
 * what `include_room` and `include_proposed` leave out is left out before the limit, as the door does.
 */

import { refuseUnknownOptions } from '../options';
import { OwV2Client } from '../v2/client';
import type { ElementType } from '../v2/types.generated';
import type { OwWorldFileEntry } from '../world-file';
import { isCharterElement, isRoomElement } from '../room';
import { charterOf } from '../charter';
import { strandOf } from '../strand';
import { PROPOSED_MARK, handsOnAsProposed } from '../review';
import { folderFetch } from '../folder/index';
import { byCodePoint, uuidKey } from '../folder/read';
import {
  NOT_IN_A_FOLDER, NOT_IN_A_FOLDER_DOC, keelAnswerOf, pyStrip, searchAsk, searchHits, searchRow, type SearchAsk,
} from '../folder/serve';
import { checkArgs } from './args';
import { pyDumps, pyRepr, pyStrRepr } from './py';
import doorJson from './door.json';

export type { OwWorldFileEntry };

// --- the vendored door ---------------------------------------------------------------------------

interface DoorTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: Record<string, unknown>;
  here: string;
}

interface ElementSchema {
  type: string;
  text: string[];
  integer: string[];
  single_link: string[];
  multi_link: string[];
  generic: { element_type_field: string; element_id_field: string }[];
  link_targets: Record<string, string>;
  output_order: string[];
}

interface Door {
  read_at: string;
  schema_version: string;
  tools: DoorTool[];
  resources: OwMcpResource[];
  resourceTemplates: OwMcpResourceTemplate[];
  list_element_types: Record<string, string>;
  element_schemas: Record<string, ElementSchema>;
}

const DOOR = doorJson as unknown as Door;
const TYPE_SLUGS = Object.keys(DOOR.list_element_types) as ElementType[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// --- the public shapes ----------------------------------------------------------------------------

/**
 * What the tools ask of a world's client, all reads: an `OwV2Client` is one, on `folderFetch(entries)` for
 * a folder. Written as its shape, so a client from the package's main entry fits it.
 */
export interface OwMcpReader {
  list(type: string, params: { limit?: number; cursor?: string; filter?: Record<string, string>; ids?: string[]; createdBy?: string }): Promise<{ data: object[]; has_more: boolean; next_cursor: string | null }>;
  get(type: string, id: string): Promise<object>;
  getWorld(): Promise<object>;
}

/**
 * One world the tools serve: its files (`entries`, as `folderFetch` takes them), or a client that reads it.
 * Its id, name and slug are its own body's (`GET /world`, a folder's `world.json`), read on the first call.
 */
export interface OwMcpWorld {
  /** The world's files, `{ path, data }` relative to its folder: read through `folderFetch(entries)`. */
  entries?: readonly OwWorldFileEntry[];
  /** A client that reads the world as its owner: an `OwV2Client` (on `folderFetch` for a folder). Give `entries` or `client`, not both. */
  client?: OwMcpReader;
}

export interface OwMcpToolsOptions {
  /** True: each description exactly as the hosted door serves it, without the sentence saying it answers on this computer. Default false. */
  asServed?: boolean;
}

/** A tool as `tools/list` carries it. */
export interface OwMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

/** A resource as `resources/list` carries it. */
export interface OwMcpResource {
  name: string;
  uri: string;
  description: string;
  mimeType: string;
}

/** A resource template as `resources/templates/list` carries it. */
export interface OwMcpResourceTemplate {
  name: string;
  uriTemplate: string;
  description: string;
  mimeType: string;
}

/** One text content item. */
export interface OwMcpTextContent {
  type: 'text';
  text: string;
}

/**
 * A tool's answer, shaped as MCP's `CallToolResult` and as the door answers: the JSON as text content
 * and as `structuredContent`, the same value; a refusal as text alone, with `isError` true.
 */
export interface OwMcpCallToolResult {
  content: OwMcpTextContent[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

/** A resource read's answer, as MCP's `ReadResourceResult`: the JSON as the door writes it (Python's `json.dumps`). */
export interface OwMcpReadResourceResult {
  contents: { uri: string; mimeType: string; text: string }[];
}

/** The JSON-RPC error code a resource read that names nothing answers with, as the door does. */
export const MCP_RESOURCE_NOT_FOUND = -32002;

/**
 * A resource read the door answers with a JSON-RPC error: `code` is `MCP_RESOURCE_NOT_FOUND` when the
 * URI names nothing (an unknown resource, a type that is none, an id that is no UUID or no element), and
 * 0 for any other refusal, as the door's server sends them. A server answers it as that error.
 */
export class OwMcpError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'OwMcpError';
    this.code = code;
  }
}

export interface OwMcpTools {
  /** The read tools, as `tools/list` carries them, in the door's order. */
  readonly tools: OwMcpTool[];
  /** As `resources/list` carries them. */
  readonly resources: OwMcpResource[];
  /** As `resources/templates/list` carries them. */
  readonly resourceTemplates: OwMcpResourceTemplate[];
  /** The schema version (X-OW-Schema-Version) the schema tools' vendored answers were read at. */
  readonly schemaVersion: string;
  /** `tools/call`: the tool's answer; a refusal is an answer too (`isError`), never a rejection. */
  callTool(name: string, args?: Record<string, unknown> | null): Promise<OwMcpCallToolResult>;
  /** `resources/read`: the resource's text, or an `OwMcpError` for the JSON-RPC error the door answers. */
  readResource(uri: string): Promise<OwMcpReadResourceResult>;
}

// --- refusals -------------------------------------------------------------------------------------

/** A tool's refusal: the text the door answers with. `namesNothing` marks the one a resource read answers as not found. */
class Refusal extends Error {
  constructor(readonly text: string, readonly namesNothing = false) {
    super(text);
  }
}

const unknownType = (type: string) => `Unknown element type: ${pyStrRepr(type)}. Call list_element_types for the 22 valid slugs.`;

/** keel's `refusal_text`: the envelope as one JSON object, the message first, what rides beside it kept. */
function refusalText(envelope: unknown, retryAfter: number | null = null): string {
  const body = (envelope && typeof envelope === 'object' ? envelope : {}) as Record<string, unknown>;
  const error = (body.error && typeof body.error === 'object' ? body.error : {}) as Record<string, unknown>;
  const { message, ...rest } = error;
  const out: Record<string, unknown> = { error: { message, ...rest } };
  for (const [k, v] of Object.entries(body)) if (k !== 'error') out[k] = v;
  if (retryAfter !== null) out.retry_after = retryAfter;
  return pyDumps(out, false);
}

const isApiError = (e: unknown): e is { name: string; status: number; detail: unknown; retryAfter: number | null } =>
  !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'OwApiError' && typeof (e as { status?: unknown }).status === 'number';

/** keel's envelope of the folder's own refusal, for a `world` that names no world served here. */
function notServed(value: string, ids: string[]): Refusal {
  return new Refusal(refusalText({
    error: {
      message: `No world served here is named ${pyStrRepr(value)}: the worlds served here are ${ids.join(', ')}.`,
      type: 'api_error', code: NOT_IN_A_FOLDER, param: 'world', doc_url: NOT_IN_A_FOLDER_DOC,
    },
  }));
}

// --- the worlds -----------------------------------------------------------------------------------

interface Held {
  id: string;
  name: string;
  slug: string | null;
  client: OwMcpReader;
}

type Body = Record<string, unknown>;

/** One whole type through the client, every page, as its owner reads it (the platform's filters given). */
async function readType(client: OwMcpReader, type: string, ask: { filter?: Record<string, string>; ids?: string[]; createdBy?: string } = {}): Promise<Body[]> {
  const out: Body[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.list(type, {
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      ...(ask.filter && Object.keys(ask.filter).length ? { filter: ask.filter } : {}),
      ...(ask.ids ? { ids: ask.ids } : {}),
      ...(ask.createdBy !== undefined ? { createdBy: ask.createdBy } : {}),
    });
    out.push(...(page.data as unknown as Body[]));
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** A row the lore views leave out while `include_room` is off: a room element or a reading aid (keel's `without_aside`). */
const aside = (b: Body) => isRoomElement(b as { type?: string }) || isCharterElement(b);

// --- newest-created first (keel: order_by("-created_at", "id")) ------------------------------------

const STAMP = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt ]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:[.,]([0-9]+))?)?([Zz]|[+-][0-9]{2}(?::?[0-9]{2})?)?$/;

/** An ISO 8601 date and time as microseconds since the epoch, or null when it is none (no stamp, or one that does not read). */
function instantOf(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = STAMP.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (!Number.isFinite(ms)) return null;
  let offset = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    offset = (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0)) * (zone[0] === '-' ? -1 : 1);
  }
  const micro = Number(((frac ?? '') + '000000').slice(0, 6));
  return (ms - offset * 60000) * 1000 + micro;
}

/** Newest-created first, then by id; an element with no `created_at` after every stamped one, by its id in code point order. */
function newestFirst(rows: Body[]): Body[] {
  const placed = rows.map((b) => ({ b, t: instantOf(b.created_at), id: String(b.id) }));
  placed.sort((x, y) => {
    if (x.t !== null && y.t !== null && x.t !== y.t) return y.t - x.t;
    if ((x.t === null) !== (y.t === null)) return x.t === null ? 1 : -1;
    return byCodePoint(x.id, y.id);
  });
  return placed.map((p) => p.b);
}

/**
 * The database's name order, as near as a collator comes: its collation passes over spaces and punctuation
 * first ("Weaponized Crumbs" before "We Sail", "MoppetopiaMap" before "Moppetopia Space Map", as the door
 * listed the practice world's names), so this one ignores them too.
 */
const collator = new Intl.Collator('en', { ignorePunctuation: true });

/** One world id and another: equal as UUIDs when both are one (keel's `_parse_world(raw) == world.id`), else equal in either case. */
function sameId(a: string, b: string): boolean {
  const x = uuidKey(a);
  const y = uuidKey(b);
  return x !== null && y !== null ? x === y : a.toLowerCase() === b.toLowerCase();
}

// --- the layer ------------------------------------------------------------------------------------

const WORLD_KEYS = ['entries', 'client'];
const IDS_MAX = 200;
const LIST_MAX = 1000;
const INDEX_PER_TYPE = 100;

/**
 * The hosted door's read tools over `worlds`, each a world folder's `entries` or a client that reads
 * it. Nothing is read until the first call; each call reads through the world's client then. With one
 * world served, a call without `world` reads it; with more, it names one (`list_worlds` lists them).
 * `opts.asServed` keeps the descriptions exactly as the door serves them. A key it does not know is
 * refused with a TypeError, as is a world without `entries` or `client`, or with both.
 */
export function folderMcpTools(worlds: readonly OwMcpWorld[], opts: OwMcpToolsOptions = {}): OwMcpTools {
  refuseUnknownOptions('folderMcpTools', opts, ['asServed']);
  if (opts.asServed !== undefined && typeof opts.asServed !== 'boolean') throw new TypeError('folderMcpTools: asServed is true or false');
  if (!Array.isArray(worlds) || worlds.length === 0) throw new TypeError('folderMcpTools takes the worlds it serves, a list of at least one { entries } or { client }');
  const given = worlds.map((w, i) => {
    if (!w || typeof w !== 'object') throw new TypeError(`folderMcpTools: world ${i} is { entries } or { client }`);
    refuseUnknownOptions(`folderMcpTools: world ${i}`, w, WORLD_KEYS);
    if ((w.entries === undefined) === (w.client === undefined)) throw new TypeError(`folderMcpTools: world ${i} gives entries or a client, one of the two`);
    if (w.client !== undefined && (!w.client || typeof w.client.list !== 'function' || typeof w.client.get !== 'function' || typeof w.client.getWorld !== 'function')) throw new TypeError(`folderMcpTools: world ${i}'s client is an OwV2Client`);
    const client: OwMcpReader = w.client ?? new OwV2Client({ fetch: folderFetch(w.entries as readonly OwWorldFileEntry[]), pageSize: LIST_MAX });
    return { w, client };
  });

  /** A client call; the platform's refusal (an OwApiError) becomes the door's text. */
  const through = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (isApiError(e)) throw new Refusal(refusalText(e.detail, e.retryAfter));
      throw e;
    }
  };

  let held: Promise<Held[]> | undefined;
  const ready = (): Promise<Held[]> => {
    held ??= (async () => {
      const out: Held[] = [];
      for (const { client } of given) {
        // A folder whose world.json does not read answers its own refusal, as every read of it would.
        const body = (await through(() => client.getWorld())) as unknown as Body;
        const id = String(body.id);
        const name = typeof body.name === 'string' ? body.name : '';
        const slug = typeof body.slug === 'string' && body.slug ? body.slug : null;
        if (out.some((h) => sameId(h.id, id))) throw new TypeError(`folderMcpTools: two worlds have the id ${id}`);
        out.push({ id, name, slug, client });
      }
      return out;
    })();
    held.catch(() => { held = undefined; });
    return held;
  };

  /**
   * The world `world` names: the id in its world.json, compared as keel compares a key's own world (as a UUID,
   * when both are one; else in either case); with none named, the one world served. A slug or any other value is
   * refused, never taken to mean the folder.
   */
  const worldFor = async (world: unknown): Promise<Held> => {
    const all = await ready();
    if (world === null || world === undefined) {
      if (all.length === 1) return all[0];
      throw new Refusal(`More than one world is served here: name one as world (${all.map((h) => h.id).join(', ')}); list_worlds shows them.`);
    }
    const value = pyStrip(String(world));
    const found = all.find((h) => sameId(h.id, value));
    if (!found) throw notServed(String(world), all.map((h) => h.id));
    return found;
  };

  // --- the tools ----------------------------------------------------------------------------------

  const elementSchema = (type: string): ElementSchema => {
    if (typeof type !== 'string' || !own(DOOR.element_schemas, type)) throw new Refusal(unknownType(String(type)));
    return clone(DOOR.element_schemas[type]);
  };

  const searchSchema = (query: string): Record<string, string[]> => {
    const q = pyStrip(query).toLowerCase();
    if (!q) throw new Refusal('query must be a non-empty string.');
    const hits: Record<string, string[]> = {};
    for (const slug of TYPE_SLUGS) {
      const k = DOOR.element_schemas[slug];
      const fields = [...k.text, ...k.integer, ...k.single_link, ...k.multi_link, ...k.generic.flatMap((g) => [g.element_type_field, g.element_id_field])];
      const matched = fields.filter((f) => f.toLowerCase().includes(q));
      if (slug.toLowerCase().includes(q) || matched.length) hits[slug] = matched;
    }
    return hits;
  };

  const listWorlds = async () => ({ data: (await ready()).map((h) => ({ id: h.id, slug: h.slug, name: h.name, role: 'owner' })) });

  const listElements = async (a: Record<string, unknown>) => {
    const type = a.type as string;
    if (!TYPE_SLUGS.includes(type as ElementType)) throw new Refusal(unknownType(type));
    let limit = a.limit as number;
    const offset = a.offset as number;
    if (limit < 1) throw new Refusal('limit must be a positive integer.');
    limit = Math.min(limit, LIST_MAX);
    if (offset < 0) throw new Refusal('offset must be zero or a positive integer.');
    const w = await worldFor(a.world);

    // keel's _list_filters: the door's own checks first, then the route's (their refusals the route's envelope).
    const link = a.link as Record<string, unknown> | null;
    const singles = DOOR.element_schemas[type].single_link;
    if (link !== null) {
      for (const [field, raw] of Object.entries(link)) {
        if (!singles.includes(field)) {
          const takes = singles.length ? `its single-link fields are ${singles.join(', ')}` : 'it has no single-link fields';
          throw new Refusal(`link names ${pyStrRepr(field)}, which is no single-link field of ${type}: ${takes}.`);
        }
        if (typeof raw !== 'string') throw new Refusal(`link ${field} must be an element id, or "" for the elements with none; got ${pyRepr(raw)}.`);
      }
    }
    const ids = a.ids as unknown[] | null;
    if (ids !== null) {
      if (!Array.isArray(ids) || !ids.length) throw new Refusal(`ids must be a list of 1 to ${IDS_MAX} element ids.`);
      if (ids.length > IDS_MAX) throw new Refusal(`ids takes at most ${IDS_MAX} ids (got ${ids.length}).`);
      for (const one of ids) {
        if (typeof one !== 'string' || one.includes(',') || !pyStrip(one)) {
          throw new Refusal(`ids must be a list of element ids, one id per item; ${pyRepr(one)} is not one.`);
        }
      }
    }
    const invalid = (message: string, param: string) => new Refusal(refusalText({
      error: { message, type: 'invalid_request', code: 'invalid_request', param, doc_url: 'https://onlyworlds.github.io/api/errors/#invalid_request' },
    }));
    const filter: Record<string, string> = {};
    if (a.name_contains) filter.name__icontains = a.name_contains as string;
    if (a.supertype !== null) filter.supertype = a.supertype as string;
    if (a.subtype !== null) filter.subtype = a.subtype as string;
    for (const [field, raw] of Object.entries(link ?? {})) {
      const value = pyStrip(raw as string);
      if (value && uuidKey(value) === null) throw invalid(`${field} must be a UUID.`, field);
      filter[field] = raw as string;
    }
    let idKeys: string[] | undefined;
    if (ids !== null) {
      idKeys = [];
      for (const one of ids as string[]) {
        const p = pyStrip(one);
        const key = uuidKey(p);
        if (key === null) throw invalid(`ids must be a list of ids; ${pyStrRepr(p)} is not one.`, 'ids');
        if (!idKeys.includes(key)) idKeys.push(key);
      }
    }
    let createdBy: string | undefined;
    if (a.created_by !== null) {
      createdBy = pyStrip(a.created_by as string);
      if (createdBy !== 'owner' && uuidKey(createdBy) === null) {
        throw invalid('created_by must be a membership id (as GET /members lists them) or owner.', 'created_by');
      }
    }

    let rows = await through(() => readType(w.client, type, { filter, ids: idKeys, createdBy }));
    if (a.include_room !== true) rows = rows.filter((b) => !aside(b));
    let leftOut = 0;
    if (a.include_proposed !== true) {
      leftOut = rows.filter(handsOnAsProposed).length;
      rows = rows.filter((b) => !handsOnAsProposed(b));
    }
    // One past the page, to say has_more, as the door reads it.
    const cut = newestFirst(rows).slice(offset, offset + limit + 1);
    return { data: cut.slice(0, limit), limit, offset, has_more: cut.length > limit, proposed_left_out: leftOut };
  };

  const getElement = async (a: Record<string, unknown>) => {
    const type = a.type as string;
    if (!TYPE_SLUGS.includes(type as ElementType)) throw new Refusal(unknownType(type), true);
    const w = await worldFor(a.world);
    const id = a.id as string;
    const key = uuidKey(id);
    if (key === null) throw new Refusal(`id must be a UUID; got ${pyStrRepr(id)}.`, true);
    try {
      return (await w.client.get(type, key)) as unknown as Body;
    } catch (e) {
      if (isApiError(e) && e.status === 404) throw new Refusal(`${type} '${id}' not found.`, true);
      if (isApiError(e)) throw new Refusal(refusalText(e.detail, e.retryAfter));
      throw e;
    }
  };

  /**
   * get_me: GET /me's body for the folder's owner. What the charter profile defines (the Charter, the Objects
   * its description names, the Guide, the Domains) is `charterOf`'s reading, and the strand `strandOf`'s, both
   * for the owner, over every element the client serves; keel's account state, which a folder does not hold,
   * is the owner's with nothing in it: no membership, Character, sponsor, seats or lenses; scope read.
   */
  const getMe = async (a: Record<string, unknown>) => {
    const w = await worldFor(a.world);
    const worldBody = (await through(() => w.client.getWorld())) as unknown as Body;
    const elements = [...(await readTypes(w, null)).values()].flat();
    const owner = { rung: 'owner' as const };
    const aids = charterOf({ elements }, owner);
    const strand = strandOf({ elements, x_strand: worldBody.x_strand }, owner);
    const skill = aids.charter ? aids.charter.skill : [];
    return {
      world: { id: w.id, name: w.name },
      scope: 'read',
      kind: 'owner',
      role: 'owner',
      membership: null,
      character: null,
      lenses_from: 'chosen',
      lenses: [],
      front_door: {
        sponsor: null,
        sponsor_character: null,
        my_character: null,
        my_seats: [],
        charter: aids.charter ? aids.charter.id : null,
        charter_skill: [...skill],
        charter_element: aids.charter ? { type: 'law', id: aids.charter.id } : null,
        charter_skill_elements: skill.map((id) => ({ type: 'object', id })),
      },
      reading_aids: { ...aids, strand },
    };
  };

  /** Every element of the types asked, through the client. */
  const readTypes = async (w: Held, only: ElementType | null): Promise<Map<ElementType, Body[]>> => {
    const out = new Map<ElementType, Body[]>();
    for (const type of TYPE_SLUGS) if (only === null || only === type) out.set(type, await through(() => readType(w.client, type)));
    return out;
  };

  const searchElements = async (a: Record<string, unknown>) => {
    const w = await worldFor(a.world);
    let ask: SearchAsk;
    try {
      ask = searchAsk(a.query, (a.type as string | null) ?? null, a.limit as number);
    } catch (e) {
      const answer = keelAnswerOf(e);
      if (!answer) throw e;
      // The route's refusal, with the tool's own argument name for its `q`.
      const body = answer.body as { error: Record<string, unknown> };
      if (body.error.param === 'q') {
        const message = String(body.error.message);
        body.error.message = message.startsWith('q ') ? `query ${message.slice(2)}` : message;
        body.error.param = 'query';
      }
      throw new Refusal(refusalText(body));
    }
    const byType = await readTypes(w, ask.only);
    const base = (type: ElementType) => (byType.get(type) ?? []).filter((b) => a.include_room === true || !aside(b));
    let leftOut: number | null = null;
    let kept = base;
    if (a.include_proposed !== true) {
      leftOut = searchHits((type) => base(type).filter(handsOnAsProposed), ask).length;
      kept = (type) => base(type).filter((b) => !handsOnAsProposed(b));
    }
    const hits = searchHits(kept, ask);
    const results = hits.slice(0, ask.limit).map((hit) => {
      const row = searchRow(hit, ask);
      // The kept row says it is proposed (a stub shows no mark).
      if (hit.body.known_of !== true && handsOnAsProposed(hit.body)) row[PROPOSED_MARK] = hit.body[PROPOSED_MARK];
      return row;
    });
    return { query: ask.text, results, count: results.length, truncated: hits.length > ask.limit, proposed_left_out: leftOut ?? 0 };
  };

  /** The resource onlyworlds://world: names and ids by type, the default view (no room, no reading aids, no proposed). */
  const worldIndex = async () => {
    const w = await worldFor(null);
    const types: Record<string, { elements: Body[]; has_more: boolean }> = {};
    let leftOut = 0;
    for (const type of TYPE_SLUGS) {
      let rows = (await through(() => readType(w.client, type))).filter((b) => !aside(b));
      leftOut += rows.filter(handsOnAsProposed).length;
      rows = rows.filter((b) => !handsOnAsProposed(b));
      if (!rows.length) continue;
      rows.sort((x, y) => collator.compare(String(x.name), String(y.name)) || byCodePoint(String(x.name), String(y.name)) || byCodePoint(String(x.id), String(y.id)));
      types[type] = { elements: rows.slice(0, INDEX_PER_TYPE).map((b) => ({ id: String(b.id), name: b.name })), has_more: rows.length > INDEX_PER_TYPE };
    }
    return { world: { id: w.id, name: w.name }, types, limit_per_type: INDEX_PER_TYPE, proposed_left_out: leftOut };
  };

  const RUN: Record<string, (a: Record<string, unknown>) => unknown> = {
    list_element_types: () => clone(DOOR.list_element_types),
    get_element_schema: (a) => elementSchema(a.type as string),
    search_schema: (a) => searchSchema(a.query as string),
    list_worlds: () => listWorlds(),
    get_me: getMe,
    list_elements: listElements,
    get_element: getElement,
    search_elements: searchElements,
  };
  const defs = new Map(DOOR.tools.map((t) => [t.name, t]));

  const text = (t: string, isError: boolean, structured?: Record<string, unknown>): OwMcpCallToolResult =>
    structured ? { content: [{ type: 'text', text: t }], structuredContent: structured, isError } : { content: [{ type: 'text', text: t }], isError };

  const callTool = async (name: string, args?: Record<string, unknown> | null): Promise<OwMcpCallToolResult> => {
    if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args))) throw new TypeError('callTool: the arguments are an object');
    const def = typeof name === 'string' ? defs.get(name) : undefined;
    if (!def) return text(`Unknown tool: ${pyStrRepr(String(name))}`, true);
    const checked = checkArgs(name, def.inputSchema, args ?? {});
    if (!checked.ok) return text(checked.text, true);
    try {
      const value = (await RUN[name](checked.values)) as Record<string, unknown>;
      return text(JSON.stringify(value), false, value);
    } catch (e) {
      if (e instanceof Refusal) return text(e.text, true);
      throw e;
    }
  };

  const readResource = async (uri: string): Promise<OwMcpReadResourceResult> => {
    if (typeof uri !== 'string') throw new TypeError('readResource takes a resource URI, a string');
    const answer = (value: unknown) => ({ contents: [{ uri, mimeType: 'application/json', text: pyDumps(value) }] });
    const asError = (e: unknown, notFound: boolean): never => {
      if (e instanceof Refusal) {
        throw e.namesNothing && notFound ? new OwMcpError(MCP_RESOURCE_NOT_FOUND, `Resource not found: ${e.text}`) : new OwMcpError(0, e.text);
      }
      throw e;
    };
    if (uri === 'onlyworlds://schema') return answer(clone(DOOR.list_element_types));
    if (uri === 'onlyworlds://world') {
      try {
        return answer(await worldIndex());
      } catch (e) {
        return asError(e, false);
      }
    }
    let m = /^onlyworlds:\/\/schema\/([^/]+)$/.exec(uri);
    if (m) {
      try {
        return answer(elementSchema(m[1]));
      } catch (e) {
        // A schema read is no read of the world: its refusal is the plain error, as the door's.
        return asError(e, false);
      }
    }
    m = /^onlyworlds:\/\/element\/([^/]+)\/([^/]+)$/.exec(uri);
    if (m) {
      try {
        return answer(await getElement({ type: m[1], id: m[2], world: null }));
      } catch (e) {
        return asError(e, true);
      }
    }
    throw new OwMcpError(MCP_RESOURCE_NOT_FOUND, `Resource not found: Unknown resource: ${pyStrRepr(uri)}`);
  };

  const describe = (t: DoorTool): OwMcpTool => {
    const out: OwMcpTool = { name: t.name, description: opts.asServed ? t.description : `${t.description}\n\n${t.here}`, inputSchema: clone(t.inputSchema), annotations: clone(t.annotations) };
    if (t.outputSchema) out.outputSchema = clone(t.outputSchema);
    // tools/list's key order: name, description, inputSchema, outputSchema, annotations.
    return { name: out.name, description: out.description, inputSchema: out.inputSchema, ...(out.outputSchema ? { outputSchema: out.outputSchema } : {}), annotations: out.annotations };
  };

  // Each read of a list is a fresh copy: a caller that changes one changes nothing after it.
  return {
    get tools() {
      return DOOR.tools.map(describe);
    },
    get resources() {
      return clone(DOOR.resources);
    },
    get resourceTemplates() {
      return clone(DOOR.resourceTemplates);
    },
    schemaVersion: DOOR.schema_version,
    callTool,
    readResource,
  };
}
