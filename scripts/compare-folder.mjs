// The folder source held to the platform: the practice world read live, made into a world folder from
// those answers (in memory), then the same calls made to the live client and to a client on
// `folderFetch(entries)`, each pair compared key by key. Reads only, through the built package (dist/).
//
//   node scripts/compare-folder.mjs --practice PATH [--cache FILE] [--base URL]
//
// PATH is the practice world's published contract (practice.json: its world id and key; the PIN is
// never read, since nothing here writes). `--cache FILE` records every live answer to FILE on the first
// run and replays them on the next, so the folder side can be fixed without spending the world's calls;
// a run with no cache is wholly live. The world allows 60 calls a minute per address, shared with
// whoever else is reading it: calls are spaced, a 429 waits out its Retry-After before the same call
// is sent again, and the run stops past CALL_CAP live calls.
//
// One line per difference: the call, the key path, live against folder, then the named reason when the
// difference is on NAMED below. Exit 0 when every difference is named, 1 when any is not, 2 when a live
// read could not be made (a network failure, an answer the call did not expect, the cap).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { OwV2Client, OwApiError, OwNetworkError, ELEMENT_TYPES } from '../dist/index.js';
import { folderFetch } from '../dist/folder.js';

const CALL_CAP = 170;
const GAP_MS = 1100;

// --- arguments ---------------------------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const practicePath = arg('--practice');
const cachePath = arg('--cache');
const base = arg('--base');
if (!practicePath) {
  console.error('usage: node scripts/compare-folder.mjs --practice PATH [--cache FILE] [--base URL]');
  process.exit(2);
}
const practice = JSON.parse(readFileSync(practicePath, 'utf8'));
if (typeof practice.key !== 'string' || typeof practice.world_id !== 'string') {
  console.error('the practice file has no key and world_id');
  process.exit(2);
}

// --- the live fetch: reads only, paced, Retry-After honoured, recorded or replayed -----------------

class CouldNotSee extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
const recorded = {};
let liveCalls = 0;
let lastAt = 0;
let waited = 0;

async function liveFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') throw new CouldNotSee(`refused to send ${method} ${url}: this script reads only`);
  if (cache) {
    const hit = cache[url];
    if (!hit) throw new CouldNotSee(`not in the cache: ${url}`);
    return new Response(hit.body, { status: hit.status, headers: { 'Content-Type': 'application/json' } });
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
      throw new CouldNotSee(`network: ${url}: ${cause}`);
    }
    if (res.status === 429) {
      const after = Number(res.headers.get('Retry-After'));
      if (!Number.isFinite(after) || after < 0) throw new CouldNotSee(`429 with no Retry-After: ${url}`);
      console.error(`429: waiting ${after} s as Retry-After asks`);
      waited += after;
      await sleep((after + 1) * 1000);
      continue;
    }
    const body = await res.text();
    recorded[url] = { status: res.status, body };
    return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }
}

const live = new OwV2Client({ apiKey: practice.key, fetch: liveFetch, pageSize: 100, ...(base ? { baseUrl: base } : {}) });

// --- the folder, from keel's own answers ----------------------------------------------------------
// Filenames as src/convert/folder.ts names them (the spec's §3.2 and its collision rule; that module is
// internal to the package, so its four small functions are carried here). The source never reads a
// filename for meaning, so they matter only as a faithful folder.

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

async function answer(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof CouldNotSee) throw e;
    if (e instanceof OwApiError) return { ok: false, status: e.status, body: e.detail };
    if (e instanceof OwNetworkError && e.cause2 instanceof CouldNotSee) throw e.cause2;
    throw e;
  }
}

/** Every pair: [label, live answer, folder answer, expectError]. */
const pairs = [];
const couldNotSee = [];

async function both(label, fn, { expectError = false, liveAnswer } = {}) {
  let l;
  try {
    l = liveAnswer ?? (await answer(() => fn(live)));
  } catch (e) {
    if (e instanceof CouldNotSee) {
      couldNotSee.push(`${label}: ${e.message}`);
      return null;
    }
    throw e;
  }
  if (!l.ok && !expectError) couldNotSee.push(`${label}: the live read answered ${l.status} ${JSON.stringify(l.body)}`);
  const f = await answer(() => fn(folder));
  pairs.push([label, l, f]);
  return [l, f];
}

let folder;

async function main() {
  // (a) the folder: the world and every element of every type, keel's answers as they came.
  const worldAnswer = await answer(() => live.getWorld());
  if (!worldAnswer.ok) throw new CouldNotSee(`GET /world answered ${worldAnswer.status}`);
  const firstPages = {};
  const all = {};
  for (const type of ELEMENT_TYPES) {
    const first = await answer(() => live.list(type));
    if (!first.ok) throw new CouldNotSee(`GET /${type}/ answered ${first.status}`);
    firstPages[type] = first;
    const els = [...first.value.data];
    let page = first.value;
    while (page.has_more && page.next_cursor) {
      const cursor = page.next_cursor;
      page = await live.list(type, { cursor });
      els.push(...page.data);
    }
    all[type] = els;
  }
  const entries = [{ path: 'world.json', data: bytes(worldAnswer.value) }];
  for (const type of ELEMENT_TYPES) {
    const names = filenames(all[type]);
    for (const el of all[type]) entries.push({ path: `elements/${type}/${names.get(el.id)}`, data: bytes(el) });
  }
  let report;
  folder = new OwV2Client({ fetch: folderFetch(entries, { onRead: (r) => { report = r; } }), pageSize: 100 });
  const total = Object.values(all).reduce((n, els) => n + els.length, 0);
  console.log(`folder: world.json and ${total} element files over ${ELEMENT_TYPES.filter((t) => all[t].length).length} types`);

  // (b) the same calls to both.
  await both('getWorld', (c) => c.getWorld(), { liveAnswer: worldAnswer });
  for (const type of ELEMENT_TYPES) {
    await both(`list ${type}`, (c) => c.list(type), { liveAnswer: firstPages[type] });
    const els = all[type];
    if (!els.length) continue;
    const limit = Math.max(1, Math.floor(els.length / 3));
    const cursors = { live: undefined, folder: undefined };
    for (let p = 1; p <= 3; p++) {
      const got = await both(`walk ${type} limit=${limit} page ${p}`, (c) => c.list(type, { limit, cursor: cursors[c === live ? 'live' : 'folder'] }));
      if (!got) break;
      const [l, f] = got;
      cursors.live = l.ok ? l.value.next_cursor : null;
      cursors.folder = f.ok ? f.value.next_cursor : null;
      if (!cursors.live && !cursors.folder) break;
    }
    const ends = els.length === 1 ? [els[0]] : [els[0], els[els.length - 1]];
    for (const el of ends) await both(`get ${type} ${el.id}`, (c) => c.get(type, el.id));
  }

  // Filters, on the three types with the most named elements that carry a supertype.
  const labelled = (t) => all[t].filter((e) => e.supertype && e.name).length;
  const busiest = [...ELEMENT_TYPES].sort((a, b) => labelled(b) - labelled(a)).slice(0, 3);
  for (const type of busiest) {
    const els = all[type];
    const withSuper = els.find((e) => e.supertype);
    if (withSuper) {
      await both(`list ${type} supertype=${withSuper.supertype}`, (c) => c.list(type, { filter: { supertype: withSuper.supertype } }));
      if (type === busiest[0]) await both(`list ${type} supertype=${withSuper.supertype.toUpperCase()}`, (c) => c.list(type, { filter: { supertype: withSuper.supertype.toUpperCase() } }));
    }
    const withSub = els.find((e) => e.subtype);
    if (withSub) await both(`list ${type} subtype=${withSub.subtype}`, (c) => c.list(type, { filter: { subtype: withSub.subtype } }));
    const named = els.find((e) => e.name && e.name.length >= 4) ?? els[0];
    await both(`list ${type} name=${named.name}`, (c) => c.list(type, { filter: { name: named.name } }));
    const piece = Array.from(named.name).slice(1, 4).join('');
    await both(`list ${type} name__icontains=${piece}`, (c) => c.list(type, { filter: { name__icontains: piece } }));
    const linkField = Object.keys(els[0]).find((k) => els.some((e) => typeof e[k] === 'string' && /^[0-9a-f-]{36}$/.test(e[k]) && k !== 'id' && k !== 'created_by' && k !== 'changed_by' && k !== 'element_id'));
    if (linkField) {
      const target = els.find((e) => typeof e[linkField] === 'string' && /^[0-9a-f-]{36}$/.test(e[linkField]))[linkField];
      await both(`list ${type} ${linkField}=${target}`, (c) => c.list(type, { filter: { [linkField]: target } }));
      await both(`list ${type} ${linkField}=`, (c) => c.list(type, { filter: { [linkField]: '' } }));
    }
    const three = [els[0], els[Math.floor(els.length / 2)], els[els.length - 1]].map((e) => e.id);
    await both(`list ${type} ids=3`, (c) => c.list(type, { ids: three }));
    await both(`list ${type} fields=name`, (c) => c.list(type, { fields: ['name'] }));
    const expandField = Object.keys(els[0]).find((k) => els.some((e) => (Array.isArray(e[k]) && e[k].length && /^[0-9a-f-]{36}$/.test(e[k][0])) || (k === linkField)));
    if (expandField) await both(`list ${type} expand=${expandField}`, (c) => c.list(type, { expand: [expandField] }));
  }

  // Search, with words from real names.
  const everyone = ELEMENT_TYPES.flatMap((t) => all[t]);
  const words = [...new Set(everyone.flatMap((e) => (e.name || '').split(/[^\p{L}\p{N}_]+/u)).filter((w) => w.length >= 4))];
  const plain = words.filter((w) => /^[A-Za-z0-9_]+$/.test(w));
  for (const w of [plain[0], plain[Math.floor(plain.length / 2)], plain[plain.length - 1]].filter(Boolean)) {
    await both(`search ${w}`, (c) => c.search(w));
  }
  const two = everyone.map((e) => (e.name || '').split(' ')).find((p) => p.length >= 2 && p[0].length >= 3 && p[1].length >= 3);
  if (two) await both(`search ${two[0]} ${two[1]}`, (c) => c.search(`${two[0]} ${two[1]}`));
  const accented = words.find((w) => /[^\x00-\x7f]/.test(w));
  if (accented) await both(`search ${accented}`, (c) => c.search(accented));
  else {
    // The world holds no letter outside ASCII, in a name or anywhere else: the accent is searched as a word it lacks.
    const cafe = `Caf${String.fromCharCode(0xe9)}`;
    console.log('no name in the world holds a letter outside ASCII: the accent search is a word the world lacks');
    await both(`search ${cafe} (absent)`, (c) => c.search(cafe));
  }
  const holder = plain[0] && everyone.find((e) => (e.name || '').includes(plain[0]));
  if (holder) await both(`search ${plain[0]} type=${holder.type}`, (c) => c.search(plain[0], { type: holder.type }));
  if (plain[0]) await both(`search ${plain[0]} limit=5`, (c) => c.search(plain[0], { limit: 5 }));
  await both('search unknown parameter page=2', (c) => c.request('GET', '/search', { query: 'q=harbour&page=2', worldRead: true }), { expectError: true });
  await both(`list ${busiest[0]} unknown filter name__startswith`, (c) => c.list(busiest[0], { filter: { name__startswith: 'A' } }), { expectError: true });
  await both(`list ${busiest[0]} bad cursor`, (c) => c.list(busiest[0], { cursor: 'bm90IGEgY3Vyc29y' }), { expectError: true });

  if (report && report.skipped.length) console.log(`folder: ${report.skipped.length} files skipped: ${JSON.stringify(report.skipped)}`);
}

// --- (c) the comparison ----------------------------------------------------------------------------

/** Each difference the folder may keep, with why: [label pattern, key path pattern, reason]. */
const NAMED = [];

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

let named = 0;
let unnamed = 0;
for (const [label, l, f] of pairs) {
  if (args.includes('--list')) {
    const size = (a) => (a.ok ? (Array.isArray(a.value?.data) ? `${a.value.data.length} rows` : Array.isArray(a.value?.results) ? `${a.value.results.length} results` : 'ok') : a.status);
    console.log(`call: ${label}  live ${size(l)}, folder ${size(f)}`);
  }
  const out = [];
  diff(l, f, '', out);
  for (const [path, a, b] of out) {
    const hit = NAMED.find(([lp, pp]) => lp.test(label) && pp.test(path));
    if (hit) named++;
    else unnamed++;
    console.log(`${label}  ${path || '.'}  live=${show(a)}  folder=${show(b)}${hit ? `  [named: ${hit[2]}]` : ''}`);
  }
}
for (const line of couldNotSee) console.log(`COULD NOT SEE: ${line}`);
console.log(`${pairs.length} calls compared, ${liveCalls} live calls${cache ? ' (replayed from the cache, none sent)' : ''}${waited ? `, ${waited} s waited on 429s` : ''}: ${named + unnamed} differences, ${named} named, ${unnamed} not`);
process.exit(couldNotSee.length ? 2 : unnamed ? 1 : 0);
