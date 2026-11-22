// The local MCP read tools held to the hosted door: the practice world read live and made into a world
// folder from those answers (in memory, as compare-folder.mjs makes it), then every read tool, with each
// of its parameters at least once, every resource and template, called on the door at
// https://www.onlyworlds.com/mcp with the practice world's key and on `folderMcpTools` over the folder;
// each pair compared key by key. Reads only, through the built package (dist/).
//
//   node scripts/compare-mcp.mjs --practice PATH [--cache FILE] [--plant] [--list] [--calls FILE] [--folder DIR]
//
// PATH is the practice world's published contract (practice.json: its world id and key; the PIN is
// never read, since nothing here writes). The schema tools are asked with the public demo key, which
// reads no world. `--cache FILE` records every live answer to FILE on the first run and replays them
// on the next, so the local side can be fixed without spending the world's calls; a run with no cache is
// wholly live. The world allows 60 calls a minute per address, shared with whoever else is reading it:
// calls are spaced, a 429 waits out its Retry-After before the same call is sent again, and the run
// stops past CALL_CAP live calls. `--plant` changes one element's name in the folder after it is made,
// to show the comparison names the difference. `--list` prints each call with the size of each answer.
// `--calls FILE` writes every call this run made of the local tools, in order, each with its MCP method,
// its params and the answer the local tools gave (a JSON-RPC error as `{code, message}`), and `--folder
// DIR` writes the folder they were made on (DIR must not exist): together the means to hold anything that
// carries these tools (a server, a bridge) to the same calls, with no second list kept by hand.
//
// One line per difference: the call, the key path, live against local, then the named reason when the
// difference is on NAMED below. Exit 0 when every difference is named, 1 when any is not, 2 when a live
// read could not be made (a network failure, an answer the call did not expect, the cap).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OwV2Client, OwApiError, OwNetworkError, ELEMENT_TYPES } from '../dist/index.js';
import { folderMcpTools, OwMcpError } from '../dist/mcp.js';

const CALL_CAP = 130;
const GAP_MS = 1100;
const DOOR = 'https://www.onlyworlds.com/mcp';
const DEMO_KEY = '0000000001';

// --- arguments ---------------------------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const practicePath = arg('--practice');
const cachePath = arg('--cache');
const plant = args.includes('--plant');
const callsPath = arg('--calls');
const folderDir = arg('--folder');
if (folderDir && existsSync(folderDir)) {
  console.error(`--folder ${folderDir}: it exists; name a folder to make`);
  process.exit(2);
}
if (!practicePath) {
  console.error('usage: node scripts/compare-mcp.mjs --practice PATH [--cache FILE] [--plant] [--list] [--calls FILE] [--folder DIR]');
  process.exit(2);
}
const practice = JSON.parse(readFileSync(practicePath, 'utf8'));
if (typeof practice.key !== 'string' || typeof practice.world_id !== 'string') {
  console.error('the practice file has no key and world_id');
  process.exit(2);
}

// --- the live side: reads only, paced, Retry-After honoured, recorded or replayed -------------------

class CouldNotSee extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
const recorded = {};
let liveCalls = 0;
let lastAt = 0;
let waited = 0;

/** One live request, paced and capped; its answer recorded under `key`, or replayed from the cache. */
async function send(key, url, init) {
  if (cache) {
    const hit = cache[key];
    if (!hit) throw new CouldNotSee(`not in the cache: ${key}`);
    return hit;
  }
  for (;;) {
    if (liveCalls >= CALL_CAP) throw new CouldNotSee(`stopped at ${CALL_CAP} live calls`);
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    liveCalls++;
    let res;
    try {
      res = await fetch(url, init);
    } catch (cause) {
      throw new CouldNotSee(`network: ${key}: ${cause}`);
    }
    if (res.status === 429) {
      const after = Number(res.headers.get('Retry-After'));
      await res.text();
      if (!Number.isFinite(after) || after < 0) throw new CouldNotSee(`429 with no Retry-After: ${key}`);
      console.error(`429: waiting ${after} s as Retry-After asks`);
      waited += after;
      await sleep((after + 1) * 1000);
      continue;
    }
    const hit = { status: res.status, type: res.headers.get('content-type') ?? '', body: await res.text() };
    recorded[key] = hit;
    return hit;
  }
}

/** The REST reads that make the folder, through the client (GET only). */
async function liveFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') throw new CouldNotSee(`refused to send ${method} ${url}: this script reads only`);
  const hit = await send(`GET ${url}`, url, init);
  return new Response(hit.body, { status: hit.status, headers: { 'Content-Type': 'application/json' } });
}

let rpcId = 0;
/** One JSON-RPC request to the door: its result, or its error ({ error: { code, message } }). */
async function rpc(method, params, key) {
  const who = key === DEMO_KEY ? 'demo' : 'practice';
  const hit = await send(`MCP ${who} ${method} ${JSON.stringify(params)}`, DOOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'API-Key': key },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (hit.status !== 200) throw new CouldNotSee(`${method} ${JSON.stringify(params)} answered HTTP ${hit.status}`);
  const json = hit.type.includes('text/event-stream')
    ? hit.body.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('')
    : hit.body;
  let msg;
  try {
    msg = JSON.parse(json);
  } catch {
    throw new CouldNotSee(`${method} answered no JSON`);
  }
  if (msg.error) return { error: msg.error };
  return { result: msg.result };
}

const live = new OwV2Client({ apiKey: practice.key, fetch: liveFetch, pageSize: 1000 });

// --- the folder, from keel's own answers (as compare-folder.mjs makes it) --------------------------
// Filenames as src/convert/folder.ts names them (the spec's §3.2 and its collision rule; that module is
// internal to the package, so its four small functions are carried here, as compare-folder.mjs carries
// them). The source never reads a filename for meaning, so they matter only as a faithful folder.

const SLUG_MAX_LEN = 40;
const ID_TAIL_LEN = 8;
const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
function slugify(name) {
  if (!name) return '';
  const trimmed = name.normalize('NFKD').replace(MARKS, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return trimmed.length <= SLUG_MAX_LEN ? trimmed : trimmed.slice(0, SLUG_MAX_LEN).replace(/-+$/, '');
}
function idTail(id) {
  if (id.length <= ID_TAIL_LEN) return id;
  const raw = id.slice(-ID_TAIL_LEN);
  if (raw.includes('--') || raw.startsWith('-')) {
    const compact = id.split('-').join('');
    return compact.length <= ID_TAIL_LEN ? compact : compact.slice(-ID_TAIL_LEN);
  }
  return raw;
}
const short = (id, name) => (slugify(name) ? `${slugify(name)}--${idTail(id)}.json` : `${id}.json`);
const full = (id, name) => (slugify(name) ? `${slugify(name)}--${id}.json` : `${id}.json`);
const byCodePoint = (a, b) => {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
};
function filenames(elements) {
  const buckets = new Map();
  for (const el of elements) {
    const key = short(el.id, el.name).toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(el);
  }
  const out = new Map();
  for (const els of buckets.values()) {
    [...els].sort((a, b) => byCodePoint(a.id, b.id)).forEach((el, i) => out.set(el.id, (i === 0 ? short : full)(el.id, el.name)));
  }
  return out;
}

const enc = new TextEncoder();
const bytes = (v) => enc.encode(JSON.stringify(v, null, 2) + '\n');

// --- the calls -----------------------------------------------------------------------------------

/** What a tool call answered, in a form two sides compare on: the refusal's text, or the value and how its text spells it. */
function toolView(r) {
  const text = r.content?.[0]?.text;
  let body = text;
  try {
    body = JSON.parse(text);
  } catch { /* a plain sentence */ }
  const view = { keys: Object.keys(r), isError: r.isError, content: r.content?.map((c) => c.type), body };
  if (r.structuredContent !== undefined) view.structuredIsText = JSON.stringify(r.structuredContent) === text;
  return { view, text };
}

function resourceView(r) {
  if (r.error) return { view: { error: r.error }, text: null };
  const c = r.result.contents?.[0] ?? {};
  let body = c.text;
  try {
    body = JSON.parse(c.text);
  } catch { /* text */ }
  return { view: { keys: Object.keys(c), uri: c.uri, mimeType: c.mimeType, count: r.result.contents.length, body }, text: c.text };
}

/** Every pair: [label, live view, local view, live text, local text]. */
const pairs = [];
const couldNotSee = [];
/** Every call made of the local tools, for --calls: { label, method, params, answer }. */
const made = [];
let local;

async function tool(label, name, argsOf, { demo = false, expectError = false } = {}) {
  let l;
  try {
    const got = await rpc('tools/call', { name, arguments: argsOf }, demo ? DEMO_KEY : practice.key);
    if (got.error) throw new CouldNotSee(`${label}: the door answered the JSON-RPC error ${JSON.stringify(got.error)}`);
    l = toolView(got.result);
  } catch (e) {
    if (e instanceof CouldNotSee) {
      couldNotSee.push(`${label}: ${e.message}`);
      return null;
    }
    throw e;
  }
  if (l.view.isError && !expectError) couldNotSee.push(`${label}: the door refused: ${l.text}`);
  const got = await local.callTool(name, argsOf);
  made.push({ label, method: 'tools/call', params: { name, arguments: argsOf }, answer: got });
  const f = toolView(got);
  pairs.push([label, l.view, f.view, l.text, f.text]);
  return [l.view, f.view];
}

async function resource(label, uri, { demo = false } = {}) {
  let l;
  try {
    l = resourceView(await rpc('resources/read', { uri }, demo ? DEMO_KEY : practice.key));
  } catch (e) {
    if (e instanceof CouldNotSee) {
      couldNotSee.push(`${label}: ${e.message}`);
      return;
    }
    throw e;
  }
  let f;
  try {
    const result = await local.readResource(uri);
    made.push({ label, method: 'resources/read', params: { uri }, answer: result });
    f = resourceView({ result });
  } catch (e) {
    if (!(e instanceof OwMcpError)) throw e;
    made.push({ label, method: 'resources/read', params: { uri }, error: { code: e.code, message: e.message } });
    f = resourceView({ error: { code: e.code, message: e.message } });
  }
  pairs.push([label, l.view, f.view, l.text, f.text]);
}

async function answer(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof CouldNotSee) throw e;
    if (e instanceof OwNetworkError && e.cause2 instanceof CouldNotSee) throw e.cause2;
    if (e instanceof OwApiError) return { ok: false, status: e.status };
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OTHER_WORLD = '00000000-0000-4000-8000-0000000000ff';

async function main() {
  // (a) the folder: the world and every element of every type, keel's answers as they came.
  const world = await answer(() => live.getWorld());
  if (!world.ok) throw new CouldNotSee(`GET /world answered ${world.status}`);
  const all = {};
  for (const type of ELEMENT_TYPES) {
    const els = [];
    let cursor;
    do {
      const page = await answer(() => live.list(type, cursor ? { cursor } : {}));
      if (!page.ok) throw new CouldNotSee(`GET /${type}/ answered ${page.status}`);
      els.push(...page.value.data);
      cursor = page.value.has_more ? page.value.next_cursor : null;
    } while (cursor);
    all[type] = els;
  }
  const entries = [{ path: 'world.json', data: bytes(world.value) }];
  for (const type of ELEMENT_TYPES) {
    const names = filenames(all[type]);
    for (const el of all[type]) entries.push({ path: `elements/${type}/${names.get(el.id)}`, data: bytes(el) });
  }
  const total = Object.values(all).reduce((n, els) => n + els.length, 0);
  console.log(`folder: world.json and ${total} element files over ${ELEMENT_TYPES.filter((t) => all[t].length).length} types`);

  // Which elements carry the marks the door reads: what include_room and include_proposed are tried on.
  const everyone = ELEMENT_TYPES.flatMap((t) => all[t]);
  const marked = (k) => everyone.filter((e) => e[k] !== undefined && e[k] !== null && e[k] !== '' && !(typeof e[k] === 'object' && !Object.keys(e[k]).length));
  const room = marked('x_room_of');
  const aids = marked('x_charter_of');
  const proposed = marked('x_review_proposed');
  const unstamped = everyone.filter((e) => !e.created_at);
  console.log(`marks: ${room.length} x_room_of, ${aids.length} x_charter_of, ${proposed.length} x_review_proposed, ${unstamped.length} with no created_at`);

  const labelled = (t) => all[t].filter((e) => e.supertype && e.name).length;
  const busiest = [...ELEMENT_TYPES].sort((a, b) => labelled(b) - labelled(a))[0];
  const els = all[busiest];
  if (plant) {
    // One element's name changed on the folder side only: the comparison must name it.
    const target = els[0];
    const at = entries.findIndex((e) => JSON.parse(new TextDecoder().decode(e.data)).id === target.id);
    entries[at] = { path: entries[at].path, data: bytes({ ...target, name: `${target.name} (planted)` }) };
    console.log(`plant: ${busiest} ${target.id} renamed "${target.name} (planted)" in the folder only`);
  }
  local = folderMcpTools([{ entries }]);
  if (folderDir) {
    for (const e of entries) {
      mkdirSync(dirname(join(folderDir, e.path)), { recursive: true });
      writeFileSync(join(folderDir, e.path), e.data);
    }
    console.log(`folder written: ${folderDir}`);
  }
  for (const [method, key] of [['tools/list', 'tools'], ['resources/list', 'resources'], ['resources/templates/list', 'resourceTemplates']]) {
    made.push({ label: method, method, params: {}, answer: { [key]: local[key] } });
  }

  // (b) the lists: the read tools' definitions as served, the resources and the templates.
  const lists = {};
  for (const [method, key] of [['tools/list', 'tools'], ['resources/list', 'resources'], ['resources/templates/list', 'resourceTemplates']]) {
    const got = await rpc(method, {}, DEMO_KEY);
    if (got.error) throw new CouldNotSee(`${method}: ${JSON.stringify(got.error)}`);
    lists[key] = got.result[key];
  }
  const served = folderMcpTools([{ entries }], { asServed: true });
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
  for (const t of served.tools) {
    const l = lists.tools.find((x) => x.name === t.name);
    pairs.push([`tools/list ${t.name}`, l ? pick(l, ['name', 'description', 'inputSchema', 'outputSchema', 'annotations']) : null, t, null, null]);
  }
  pairs.push(['resources/list', lists.resources.map((r) => pick(r, ['name', 'uri', 'description', 'mimeType'])), local.resources, null, null]);
  pairs.push(['resources/templates/list', lists.resourceTemplates.map((r) => pick(r, ['name', 'uriTemplate', 'description', 'mimeType'])), local.resourceTemplates, null, null]);

  // (c) the schema tools (no world: the demo key).
  await tool('list_element_types', 'list_element_types', {}, { demo: true });
  await tool('get_element_schema character', 'get_element_schema', { type: 'character' }, { demo: true });
  await tool('get_element_schema pin', 'get_element_schema', { type: 'pin' }, { demo: true });
  await tool('get_element_schema bogus', 'get_element_schema', { type: 'bogus' }, { demo: true, expectError: true });
  await tool('search_schema loc', 'search_schema', { query: 'loc' }, { demo: true });
  await tool('search_schema " Element "', 'search_schema', { query: ' Element ' }, { demo: true });
  await tool('search_schema blank', 'search_schema', { query: '  ' }, { demo: true, expectError: true });
  await tool('list_element_types unknown argument', 'list_element_types', { bogus: 1 }, { demo: true, expectError: true });
  await tool('get_element_schema missing type', 'get_element_schema', {}, { demo: true, expectError: true });
  await tool('unknown tool', 'nope', {}, { demo: true, expectError: true });

  // (d) list_worlds, get_me and list_elements, each parameter at least once.
  await tool('list_worlds', 'list_worlds', {});
  await tool('get_me', 'get_me', {});
  await tool('get_me world=<its id>', 'get_me', { world: practice.world_id.toUpperCase() });
  await tool('get_me world=<another>', 'get_me', { world: OTHER_WORLD }, { expectError: true });
  const type = busiest;
  await tool(`list_elements ${type}`, 'list_elements', { type });
  for (const t of ELEMENT_TYPES.filter((t) => t !== type && all[t].length)) await tool(`list_elements ${t}`, 'list_elements', { type: t });
  await tool(`list_elements ${type} limit=5 offset=3`, 'list_elements', { type, limit: 5, offset: 3 });
  await tool(`list_elements ${type} limit=2000`, 'list_elements', { type, limit: 2000 });
  await tool(`list_elements ${type} offset past the end`, 'list_elements', { type, offset: els.length + 5 });
  const named = els.find((e) => e.name && e.name.length >= 4) ?? els[0];
  await tool(`list_elements ${type} name_contains`, 'list_elements', { type, name_contains: Array.from(named.name).slice(1, 4).join('').toUpperCase() });
  const withSuper = els.find((e) => e.supertype);
  if (withSuper) await tool(`list_elements ${type} supertype`, 'list_elements', { type, supertype: ` ${withSuper.supertype.toUpperCase()} ` });
  await tool(`list_elements ${type} supertype=""`, 'list_elements', { type, supertype: '' });
  const withSub = els.find((e) => e.subtype);
  if (withSub) await tool(`list_elements ${type} subtype`, 'list_elements', { type, subtype: withSub.subtype });
  await tool(`list_elements ${type} ids`, 'list_elements', { type, ids: [els[0].id, els[els.length - 1].id.toUpperCase(), OTHER_WORLD] });
  await tool(`list_elements ${type} created_by=owner`, 'list_elements', { type, created_by: 'owner' });
  const singles = (await local.callTool('get_element_schema', { type })).structuredContent.single_link;
  const linkField = singles.find((f) => els.some((e) => typeof e[f] === 'string' && UUID.test(e[f])));
  if (linkField) {
    const target = els.find((e) => typeof e[linkField] === 'string' && UUID.test(e[linkField]))[linkField];
    await tool(`list_elements ${type} link ${linkField}=<id>`, 'list_elements', { type, link: { [linkField]: target } });
    await tool(`list_elements ${type} link ${linkField}=""`, 'list_elements', { type, link: { [linkField]: '' } });
  }
  const roomType = room[0]?.type ?? 'narrative';
  await tool(`list_elements ${roomType} include_room`, 'list_elements', { type: roomType, include_room: true });
  const aidType = aids[0]?.type ?? 'law';
  if (aidType !== roomType) await tool(`list_elements ${aidType} include_room`, 'list_elements', { type: aidType, include_room: true });
  const proposedType = proposed[0]?.type ?? type;
  await tool(`list_elements ${proposedType} include_proposed`, 'list_elements', { type: proposedType, include_proposed: true });
  await tool(`list_elements ${type} world=<its id>`, 'list_elements', { type, limit: 3, world: practice.world_id });
  await tool(`list_elements ${type} world=<another>`, 'list_elements', { type, world: OTHER_WORLD }, { expectError: true });
  await tool(`list_elements ${type} limit=0`, 'list_elements', { type, limit: 0 }, { expectError: true });
  await tool(`list_elements ${type} offset=-1`, 'list_elements', { type, offset: -1 }, { expectError: true });
  await tool('list_elements bogus type', 'list_elements', { type: 'bogus' }, { expectError: true });
  await tool(`list_elements ${type} link names a field it lacks`, 'list_elements', { type, link: { name: 'x' } }, { expectError: true });
  if (linkField) await tool(`list_elements ${type} link not a UUID`, 'list_elements', { type, link: { [linkField]: 'nope' } }, { expectError: true });
  await tool(`list_elements ${type} ids not a UUID`, 'list_elements', { type, ids: ['nope'] }, { expectError: true });
  await tool(`list_elements ${type} ids with a comma`, 'list_elements', { type, ids: ['a,b'] }, { expectError: true });
  await tool(`list_elements ${type} created_by not a member`, 'list_elements', { type, created_by: 'x' }, { expectError: true });
  await tool(`list_elements ${type} limit="x"`, 'list_elements', { type, limit: 'x' }, { expectError: true });

  // (e) get_element.
  await tool(`get_element ${type} first`, 'get_element', { type, id: els[0].id });
  const odd = proposed[0] ?? room[0] ?? els[els.length - 1];
  await tool(`get_element ${odd.type} ${odd === proposed[0] ? 'proposed' : odd === room[0] ? 'room' : 'last'}`, 'get_element', { type: odd.type, id: odd.id, world: practice.world_id });
  await tool(`get_element ${type} missing`, 'get_element', { type, id: OTHER_WORLD }, { expectError: true });
  await tool(`get_element ${type} junk id`, 'get_element', { type, id: 'junk' }, { expectError: true });

  // (f) search_elements, with words from real names.
  const words = [...new Set(everyone.flatMap((e) => (e.name || '').split(/[^\p{L}\p{N}_]+/u)).filter((w) => w.length >= 4 && /^[A-Za-z0-9_]+$/.test(w)))];
  const w1 = words[0];
  const w2 = words[Math.floor(words.length / 2)];
  await tool(`search_elements ${w1}`, 'search_elements', { query: w1 });
  await tool(`search_elements ${w2}`, 'search_elements', { query: w2 });
  const two = everyone.map((e) => (e.name || '').split(' ')).find((p) => p.length >= 2 && p[0].length >= 3 && p[1].length >= 3);
  if (two) await tool(`search_elements "${two[0]} ${two[1]}"`, 'search_elements', { query: `${two[0]} ${two[1]}` });
  const holder = everyone.find((e) => (e.name || '').includes(w1));
  await tool(`search_elements ${w1} type=${holder.type}`, 'search_elements', { query: w1, type: holder.type });
  await tool(`search_elements ${w1} limit=3`, 'search_elements', { query: w1, limit: 3 });
  const roomWord = room.map((e) => (e.name || '').split(/[^\p{L}\p{N}_]+/u).find((w) => w.length >= 4)).find(Boolean) ?? w1;
  await tool(`search_elements ${roomWord} include_room`, 'search_elements', { query: roomWord, include_room: true });
  await tool(`search_elements ${roomWord}`, 'search_elements', { query: roomWord });
  const proposedWord = proposed.map((e) => (e.name || '').split(/[^\p{L}\p{N}_]+/u).find((w) => w.length >= 4)).find(Boolean) ?? w2;
  await tool(`search_elements ${proposedWord} include_proposed`, 'search_elements', { query: proposedWord, include_proposed: true });
  await tool(`search_elements ${w1} world=<its id>`, 'search_elements', { query: w1, world: practice.world_id });
  await tool('search_elements one character', 'search_elements', { query: 'a' }, { expectError: true });
  await tool('search_elements bogus type', 'search_elements', { query: 'ab', type: 'bogus' }, { expectError: true });

  // (g) the resources and templates.
  await resource('onlyworlds://schema', 'onlyworlds://schema', { demo: true });
  await resource('onlyworlds://schema/location', 'onlyworlds://schema/location', { demo: true });
  await resource('onlyworlds://schema/bogus', 'onlyworlds://schema/bogus', { demo: true });
  await resource('onlyworlds://world', 'onlyworlds://world');
  await resource(`onlyworlds://element/${type}/<first>`, `onlyworlds://element/${type}/${els[0].id}`);
  await resource(`onlyworlds://element/${type}/<missing>`, `onlyworlds://element/${type}/${OTHER_WORLD}`);
  await resource('onlyworlds://nope', 'onlyworlds://nope', { demo: true });
}

// --- (h) the comparison ----------------------------------------------------------------------------

/** Each difference the local tools may keep, with why: [label pattern, key path pattern, reason]. */
const NAMED = [
  [/world=<another>/, /^\.body\.error\.(message|type|code|doc_url)$/,
    'a key reads only its own world on the door (invalid_request); here a world not served is the folder source\'s own refusal, not_in_a_folder'],
  [/^get_me/, /^\.body\.scope$/,
    'the practice key can write, so the door says write; these tools never write the folder, so here it is read (ruled)'],
];

const show = (v) => (v === undefined ? '<absent>' : JSON.stringify(v));
function diff(a, b, path, out) {
  const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (kind(a) === 'object' && kind(b) === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}.${k}`, out);
  } else if (kind(a) === 'array' && kind(b) === 'array') {
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push([path, a, b]);
  }
}

try {
  await main();
} catch (e) {
  if (e instanceof CouldNotSee) couldNotSee.push(e.message);
  else if (e instanceof OwNetworkError && e.cause2 instanceof CouldNotSee) couldNotSee.push(e.cause2.message);
  else throw e;
}
if (cachePath && !cache) writeFileSync(cachePath, JSON.stringify(recorded));
if (callsPath) {
  writeFileSync(callsPath, JSON.stringify({ world: practice.world_id, planted: plant, calls: made }, null, 2) + '\n');
  console.log(`calls written: ${made.length} to ${callsPath}`);
}

let namedCount = 0;
let unnamed = 0;
for (const [label, l, f, lt, ft] of pairs) {
  if (args.includes('--list')) {
    const size = (v) => (v?.isError ? 'refused' : Array.isArray(v?.body?.data) ? `${v.body.data.length} rows` : Array.isArray(v?.body?.results) ? `${v.body.results.length} results` : v?.error ? `error ${v.error.code}` : 'ok');
    console.log(`call: ${label}  live ${size(l)}, local ${size(f)}`);
  }
  const out = [];
  diff(l, f, '', out);
  // The same value written two ways: the text itself, once the values agree.
  if (!out.length && lt !== null && ft !== null && lt !== ft) out.push(['.text', `${lt.length} characters`, `${ft.length} characters`]);
  for (const [path, a, b] of out) {
    const hit = NAMED.find(([lp, pp]) => lp.test(label) && pp.test(path));
    if (hit) namedCount++;
    else unnamed++;
    console.log(`${label}  ${path || '.'}  live=${show(a)}  local=${show(b)}${hit ? `  [named: ${hit[2]}]` : ''}`);
  }
}
for (const line of couldNotSee) console.log(`COULD NOT SEE: ${line}`);
console.log(`${pairs.length} calls compared, ${liveCalls} live calls${cache ? ' (replayed from the cache, none sent)' : ''}${waited ? `, ${waited} s waited on 429s` : ''}: ${namedCount + unnamed} differences, ${namedCount} named, ${unnamed} not`);
process.exit(couldNotSee.length ? 2 : unnamed ? 1 : 0);
