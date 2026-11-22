// The hosted MCP door's read tools, vendored for @onlyworlds/sdk/mcp: read from the live door, never retyped.
//
//   node scripts/vendor-mcp-tools.mjs           read the door and write src/mcp/door.json
//   node scripts/vendor-mcp-tools.mjs --check   read the door and compare it with src/mcp/door.json, writing nothing
//
// It asks https://www.onlyworlds.com/mcp, with the public demo key 0000000001, for tools/list,
// resources/list and resources/templates/list, then calls list_element_types and get_element_schema for
// each of the 22 types (the schema tools read no world). It keeps the read tools a world folder can
// answer, each definition as served (name, description, inputSchema, outputSchema, annotations; the
// server's own `_meta` left out), with one sentence beside each description that says where the local
// layer answers from (`here`, appended to the description at run time). The schema answers are stamped
// with the X-OW-Schema-Version the platform's API sends (the MCP door sends none, so it is read from
// GET /api/v2/health/ in the same run); a version other than the package's schema pin
// (codegen/schema-pin.json) refuses to write.
//
// Exit 0 when written (or, with --check, when the door still serves what the file holds), 1 when
// --check finds a difference or the schema versions disagree, 2 when the door could not be read.

import { readFileSync, writeFileSync } from 'node:fs';

const DOOR = 'https://www.onlyworlds.com/mcp';
const HEALTH = 'https://www.onlyworlds.com/api/v2/health/';
const DEMO_KEY = '0000000001';
const GAP_MS = 300;
const OUT = new URL('../src/mcp/door.json', import.meta.url);
const PIN = new URL('../codegen/schema-pin.json', import.meta.url);

/** The tools a world folder can answer, in the order the door lists them; every other tool is left out. */
const READ_TOOLS = ['list_element_types', 'get_element_schema', 'search_schema', 'list_worlds', 'get_me', 'list_elements', 'get_element', 'search_elements'];
const SCHEMA_TOOLS = new Set(['list_element_types', 'get_element_schema', 'search_schema']);
const HERE_WORLD = "Here it answers from a world folder on this computer, not from onlyworlds.com; `world` is the id in the folder's world.json.";
const HERE_SCHEMA = 'Here it answers on this computer, from the schema as onlyworlds.com served it when this package was built.';
/** get_me's own: a folder holds no account, so it answers for the folder's owner with nothing in it. */
const HERE_ME = "Here it answers from a world folder on this computer, not from onlyworlds.com: as the folder's owner with no account behind it (no membership, Character, sponsor, seats or lenses), with scope read, since these tools never write the folder; `world` is the id in the folder's world.json.";

const check = process.argv.includes('--check');
const blind = (why) => {
  console.log(`vendor-mcp-tools: could not read the door: ${why}`);
  process.exit(2);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rpcId = 0;
let calls = 0;
async function rpc(method, params = {}) {
  if (calls++) await sleep(GAP_MS);
  let r;
  try {
    r = await fetch(DOOR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'API-Key': DEMO_KEY },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    blind(`${method}: ${e}`);
  }
  if (r.status === 429) {
    const after = Number(r.headers.get('Retry-After'));
    if (!Number.isFinite(after) || after < 0) blind(`${method} answered 429 with no Retry-After`);
    console.log(`429: waiting ${after} s as Retry-After asks`);
    await sleep((after + 1) * 1000);
    calls--;
    return rpc(method, params);
  }
  if (!r.ok) blind(`${method} answered HTTP ${r.status}`);
  const text = await r.text();
  // The door answers a POST as an event stream (or plain JSON): the JSON-RPC answer is the data lines.
  const json = (r.headers.get('content-type') ?? '').includes('text/event-stream')
    ? text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('')
    : text;
  let msg;
  try {
    msg = JSON.parse(json);
  } catch {
    blind(`${method} answered no JSON`);
  }
  if (msg.error) blind(`${method} answered the JSON-RPC error ${msg.error.code} (${msg.error.message})`);
  return msg.result;
}

async function listAll(method, key) {
  const out = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const res = await rpc(method, cursor ? { cursor } : {});
    if (!Array.isArray(res?.[key])) blind(`${method} answered no ${key} list`);
    out.push(...res[key]);
    if (!(cursor = res.nextCursor)) return out;
  }
  blind(`${method} kept paging past 20 pages`);
}

/** A tool's answer: its structuredContent, held to its text content (the door sends both, the same JSON). */
async function answer(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  if (res?.isError) blind(`${name} ${JSON.stringify(args)} answered an error: ${res.content?.[0]?.text}`);
  const text = res?.content?.[0]?.text;
  if (typeof text !== 'string' || !res.structuredContent || JSON.stringify(res.structuredContent) !== text) {
    blind(`${name} ${JSON.stringify(args)}: its text and structuredContent are not the same JSON`);
  }
  return res.structuredContent;
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const tools = await listAll('tools/list', 'tools');
const resources = await listAll('resources/list', 'resources');
const templates = await listAll('resources/templates/list', 'resourceTemplates');
const kept = READ_TOOLS.map((name) => {
  const t = tools.find((x) => x.name === name);
  if (!t) blind(`tools/list names no ${name}`);
  return { ...pick(t, ['name', 'description', 'inputSchema', 'outputSchema', 'annotations']), here: SCHEMA_TOOLS.has(name) ? HERE_SCHEMA : name === 'get_me' ? HERE_ME : HERE_WORLD };
});
// Served in the door's order, so a tools/list here reads as the door's does, less the tools a folder cannot answer.
kept.sort((a, b) => tools.findIndex((t) => t.name === a.name) - tools.findIndex((t) => t.name === b.name));
const types = await answer('list_element_types', {});
const schemas = {};
for (const type of Object.keys(types)) schemas[type] = await answer('get_element_schema', { type });

let version;
try {
  await sleep(GAP_MS);
  const h = await fetch(HEALTH, { signal: AbortSignal.timeout(20000) });
  await h.text();
  version = h.headers.get('x-ow-schema-version');
} catch (e) {
  blind(`GET ${HEALTH}: ${e}`);
}
if (!version) blind(`GET ${HEALTH} sent no X-OW-Schema-Version`);
const pinned = JSON.parse(readFileSync(PIN, 'utf8')).canonical_version;

const door = {
  _about: 'The hosted MCP door\'s read tools as it serves them, for @onlyworlds/sdk/mcp. Written by scripts/vendor-mcp-tools.mjs from the live door; never edit by hand.',
  source: `${DOOR}: tools/list, resources/list, resources/templates/list, list_element_types and get_element_schema for each type, asked with the public demo key ${DEMO_KEY}`,
  read_at: new Date().toISOString().slice(0, 10),
  schema_version: version,
  tools: kept,
  resources: resources.map((r) => pick(r, ['name', 'uri', 'description', 'mimeType'])),
  resourceTemplates: templates.map((r) => pick(r, ['name', 'uriTemplate', 'description', 'mimeType'])),
  list_element_types: types,
  element_schemas: schemas,
};

if (check) {
  const held = JSON.parse(readFileSync(OUT, 'utf8'));
  const diffs = [];
  const walk = (a, b, path) => {
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: held ${JSON.stringify(a)?.slice(0, 120)}, served ${JSON.stringify(b)?.slice(0, 120)}`);
  };
  const { read_at: _a, ...heldRest } = held;
  const { read_at: _b, ...doorRest } = door;
  walk(heldRest, doorRest, '');
  for (const d of diffs) console.log(d);
  console.log(`vendor-mcp-tools --check: ${calls + 1} calls, ${diffs.length} differences from src/mcp/door.json (read ${held.read_at})`);
  process.exit(diffs.length ? 1 : 0);
}
if (version !== pinned) {
  console.log(`vendor-mcp-tools: the platform serves schema ${version}, the package is pinned to ${pinned}: nothing written (repin first, or wait for the platform)`);
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify(door, null, 2) + '\n');
console.log(`vendor-mcp-tools: ${calls + 1} calls; wrote src/mcp/door.json: ${kept.length} tools, ${door.resources.length} resources, ${door.resourceTemplates.length} templates, ${Object.keys(schemas).length} schemas at ${version}`);
