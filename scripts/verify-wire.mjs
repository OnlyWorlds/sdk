#!/usr/bin/env node
/**
 * verify-wire.mjs — does the SDK still speak the API that keel's own document describes?
 *
 * Run:  node scripts/verify-wire.mjs [--sdk <package dir>] [--schema-dist <dir>] [--openapi <url|file>]
 *                                    [--no-live] [--api-origin <origin>]
 *
 *   --sdk          the package to check, built (its dist/); default: this repository
 *   --schema-dist  the schema distribution the canonical world fields and the profiles are read from;
 *                  default: <sdk>/codegen/schema-dist, the vendored, hash-pinned copy
 *   --openapi      the document, a URL or a file; default: https://www.onlyworlds.com/api/v2/openapi.json
 *   --no-live      skip the two checks that ask production (7b, and 5t's /tokens/* routes)
 *   --api-origin   where those two ask; default: https://www.onlyworlds.com
 *
 * keel is the OnlyWorlds server. CI runs this as the `wire` job, on every pull request and push to main;
 * it reads only public sources and needs no secret.
 *
 * WHY THIS EXISTS
 * ---------------
 * keel publishes an OpenAPI document of its v2 API (/api/v2/openapi.json, since
 * 2026-09-28: per-type read/write/patch schemas, list parameters, the error envelope).
 * Until now nothing compared the SDK with it. The SDK was checked against the schema
 * (codegen:check), against its own tests, and against live pulses, but a field the
 * server adds, a route it renames, a query parameter it drops, reached the SDK only when
 * somebody noticed. The first run of this gate found one: keel's `created_by`
 * (membership phase 2, live 2026-09-28) was on every read schema and absent from the
 * SDK published as 4.3.0.
 *
 * WHAT IT DOES
 * ------------
 * It runs the SDK, not a description of it. The client is given a recording `fetch`, and
 * each method that calls keel is called (per type for the element methods); what it actually
 * sent is compared with the document. So a rename inside client.ts shows up here without
 * anybody editing a list. A NEW method does need a line here: 5e makes the run INCOMPLETE
 * until it is exercised or named (until 2026-10-10 a new method was simply unseen).
 *
 *   1. Every route the client calls exists in the document, with that method.
 *   2. Every query parameter it sends on list and get is a parameter the document lists.
 *   2s. Credentials follow each operation's own security: none where it declares `security: []`
 *      (the join preview), a Bearer where it names only the account token (account/join); and
 *      a join body's keys are ones the document names (SDK 4.12, 2026-10-12).
 *   2s+. Wherever an operation declares security, the credentials sent are exactly one of its
 *      alternatives (API-Key = ApiKey, API-Pin = ApiPin, a Bearer = AccountToken): the lens routes
 *      took an account token beside the key (2026-10-27, SDK 4.94.0).
 *   2s0. And a credential is always sent there, even where the document lists `{}` (no credential)
 *      as a way in: the SDK makes no keyless call (the keyless door added `{}` to 47 reads).
 *   2h. Every header it sends beyond credentials and Content-Type is a header parameter the
 *      document lists for that operation, and If-Match goes only where a 412 is declared; the
 *      run must see If-Match sent on PATCH and on the links route (2026-10-11).
 *   7p. The 412 body on both routes is the error envelope plus a required `current` of that type,
 *      and the SDK, run, hands that `current` back on the error whole.
 *   7h. The conditional head poll (SDK 4.57.0): changesHead() called twice against a
 *      recorder that tags the 200 with a weak ETag. The second call sends If-None-Match equal to
 *      the tag as received (never unquoted or stripped), the 304 hands back the
 *      200's head, cursor and epoch with unchanged: true, a 409 clears the tag, and the document
 *      declares the If-None-Match parameter and the 304 with its ETag on GET /changes. 2h sees the
 *      header against the document because section 1 also calls it twice.
 *   3. Per type: the fields the SDK knows (FIELD_SCHEMA + the OwElementBase in its .d.ts)
 *      equal the document's read-schema properties, both ways, and the kind of each field
 *      (text / integer / link / links) matches its JSON type.
 *   4. Per type: the SDK's required set equals the write schema's `required`.
 *   5. A body carrying every read-schema property and every server-managed field is stripped
 *      of exactly those the write schema refuses (read properties the write schema does not
 *      have); the same body through patch() sends nothing the type's Patch schema lacks
 *      (2026-11-04: a fixed body never offered a field turned read-only, nor known_of).
 *   6. listAll follows the page cursor under the names the document gives the list
 *      envelope (the test feeds it those names; a rename makes it stop after page one).
 *   7. The error envelope's five keys all reach OwApiError.
 *   8. Every error code the SDK keys on is a public code in keel's own list
 *      (Error.x-ow-error-codes, live 2026-10-08); reserved codes are named, not failed.
 *   5c. The world body (2026-10-09): GET and PATCH /world reference the World and WorldPatch components;
 *      the two agree; the client sends every patchable key; the standard's time and unit settings are in World.
 *   5d. The removal ticket (SDK 4.8+): what createRemovalTicket sends against the
 *      documented body (an image_url cut to its object key), and OwRemovalTicket's keys against the 200.
 *   5n. Every object with properties under a 5f pair's root (nested any depth, a list's rows, each
 *      oneOf branch) is held by a pair or named with its reason; an unheld one is a GAP, and so is a
 *      name the document no longer has (2026-10-26: OwMe's front_door.my_seats passed unheld).
 *   5x. An answer field the document leaves untyped (any JSON value) is `unknown` in the SDK: at every
 *      5f pair, and in the accept's 409 conflict rows per type; every untyped answer field is found by
 *      walking the document, and one nothing holds is a GAP (2026-11-11: a queue row's `evidence` and
 *      `expires` stayed `string | null` under a green run). And a typed answer field's kinds and null, read
 *      from the schema, are admitted by its SDK declaration, or the narrowing is named in KIND_OWN with
 *      where it is made true (its first run: six fields typed never null, SDK 4.157.0). Watched failing
 *      on planted breaks.
 *   5k. A field the SDK declares as one string literal, where the document closes it to words (`const` or
 *      `enum`), is one of those words (2026-11-16: 9u reads only unions, and a planted `type: 'Law'` passed
 *      against `const: 'law'`). Where the document takes any string the field is named, unchecked. Watched
 *      failing: that plant, DRIFT at both places the document says 'law'.
 *   5e. Every public client method is exercised here or named with the reason it needs no call
 *      of its own (listAll, changesAll, uploadImage, removeImage, request); anything else is a GAP.
 *   1f. Files on elements (SDK 4.32+): the four per-element routes per type and
 *      /world/files go through 1, 2b and 2h (an agent client's file calls included: no X-OW-Agent
 *      where the document lists none); uploadFile's ticket is held to its operation, its second
 *      request (the upload host, outside the document) to its shape; the row, added_by, world list,
 *      ticket and link types are held to their answers in 5f.
 *   5t. Every exported class is driven or named (errors send nothing; OwV2Client is 5e). TokenResource's
 *      methods are each driven, and (live) each /tokens/* route asked of production without
 *      credentials: an unrouted one must be @deprecated in the published types, a deprecated one must
 *      be unrouted (2026-10-14: four of six 404'd while every run passed; the document has no /tokens/).
 *   7b. LIVE (the first check that read the API): the real client pointed at a base URL no route
 *      matches raises an OwApiError, 404 not_found with a doc_url (since 2026-10-09; it
 *      answered an HTML page before). `--no-live` skips it; an unreachable host is named NOT RUN.
 *   9. Every constant the SDK exports (an ALL_CAPS name) is placed: checked here, or named with where
 *      its truth lives; a new one is a GAP. Checked here: FILE_EXTENSIONS gives exactly the file kinds
 *      the document's file routes declare, and AGENT_DOORS is the first three doors of `changed_via`,
 *      the three the document's own description calls an agent's (2026-10-20: neither was gated).
 *   9u. Every union of string literals in the SDK's declarations, found by reading them, never listed:
 *      held to the document's enum at the places its row names (what keel answers and what the SDK
 *      sends), or named as the SDK's own words with where their truth lives; a new one is a GAP, and
 *      so is a literal pair the reader cannot place (2026-11-10: two rows held, a seat's word passed).
 *
 * WHAT IT CANNOT SEE (printed on every run, never hidden behind a PASS)
 * ---------------------------------------------------------------------
 * Since 2026-10-12 the document describes /changes and /bulk, and 5f holds the
 * SDK's page and bulk-result types to it; any schema it still lacks is named in the report,
 * computed from the document on each run. The account routes the SDK
 * does not call are checked by fixtures and live pulses, not here. Exit 0 with those blind spots stated is a
 * PASS about the rest only.
 *
 * EXIT CODES: 0 PASS (about what it can see) · 1 DRIFT, or a gap IN THIS CHECKER · 2 SKIPPED:
 * the document was unreachable, nothing was measured. A skip is not a failure (a check that goes
 * red for the network teaches people to ignore it), but it is not 0: before a release tag, `&&`
 * must stop on it (it exited 0 until 2026-10-14).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
// The package under test, built (its dist/): this repository unless --sdk names another.
const SDK_DIR = resolve(arg('--sdk') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
// The schema distribution the canonical world fields (5c) and the profiles (9c, 9d, 9h, 9i) are read from:
// by default the package's own vendored copy, the one its codegen ran on (CI's schema job holds it to its pin).
const SCHEMA_DIST = resolve(arg('--schema-dist') ?? join(SDK_DIR, 'codegen', 'schema-dist'));
const OPENAPI = arg('--openapi', 'https://www.onlyworlds.com/api/v2/openapi.json');

const drift = [];
const gaps = [];
let checks = 0;
const ok = () => { checks++; };
const bad = (msg) => { drift.push(msg); console.log(`  DRIFT  ${msg}`); };
const gap = (msg) => { gaps.push(msg); console.log(`  GAP    ${msg}   (in this checker: the unchecked part was NOT checked)`); };

// ---- the document ---------------------------------------------------------------------

let doc;
try {
  if (/^https?:/.test(OPENAPI)) {
    // Node's fetch asks for gzip and decodes it; a read that does not finish in 20 seconds is a SKIP.
    const r = await fetch(OPENAPI, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    doc = JSON.parse(text);
    const etag = r.headers.get('etag');
    console.log(`  document: ${Buffer.byteLength(text)} bytes${etag ? ` (ETag ${etag})` : ' (no ETag served)'}`);
  } else {
    doc = JSON.parse(readFileSync(OPENAPI, 'utf8'));
  }
} catch (e) {
  console.log(`SKIPPED — could not read ${OPENAPI} (${e.message}). Nothing was checked; this is not a pass.`);
  process.exit(2);
}
if (!doc?.paths || !doc?.components?.schemas) {
  console.log(`FAIL — ${OPENAPI} is not an OpenAPI document with paths and component schemas.`);
  process.exit(1);
}
const paths = doc.paths;
const schemas = doc.components.schemas;

// ---- the SDK --------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(SDK_DIR, 'package.json'), 'utf8'));
const sdk = await import(pathToFileURL(join(SDK_DIR, 'dist', 'index.js')).href);
const { OwV2Client, ELEMENT_TYPES, FIELD_SCHEMA, parseErrorEnvelope } = sdk;
console.log(`@onlyworlds/sdk ${pkg.version} (${SDK_DIR})`);
console.log(`document: ${OPENAPI} — ${Object.keys(paths).length} paths, ${Object.keys(schemas).length} schemas`);
console.log('');

// The built files of one kind, every one in dist/: a build with several entries puts shared code and
// declarations in chunks whose names it hashes, so a fixed file name can miss them (4.113.0's waymark entry).
function distFiles(ext) {
  const dir = join(SDK_DIR, 'dist');
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext)).sort().map((n) => join('dist', n)) : [];
}

// OwElementBase's keys, read from the published .d.ts (the interface has no runtime form).
function baseKeys() {
  for (const rel of ['dist/v2/types.generated.d.ts', ...distFiles('.d.ts')]) {
    const f = join(SDK_DIR, rel);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const m = text.match(/interface OwElementBase \{([\s\S]*?)\n\}/);
    if (!m) continue;
    const keys = [...m[1].matchAll(/^\s{2,4}(\w+)\??:/gm)].map((x) => x[1]);
    if (keys.length) return new Set(keys);
  }
  return null;
}
const BASE = baseKeys();
if (!BASE) gap(`could not read OwElementBase from ${SDK_DIR}/dist/**/*.d.ts — field comparison skipped`);

// A method's option keys, read from the published .d.ts, so a call below sends every option the SDK
// has: a hand list sent none of createWorldLink's preview (4.35.0) or character (4.30.0) for weeks
// (2026-10-20). A key with no value in OPTION_VALUES is a GAP, never silently left unsent.
const OPTION_VALUES = {
  reader: 'player', role: 'guest', days: 7, inviterName: 'x', withCharacter: true, character: '0190a2b4-0000-7000-8000-000000000001',
  preview: true, maxUses: 2, characters: ['0190a2b4-0000-7000-8000-000000000001'], name: 'x', agentName: 'x',
  landsOn: 'dashboard',
};
function allOptions(method, fallback) {
  const text = distFiles('.d.ts').map((rel) => readFileSync(join(SDK_DIR, rel), 'utf8')).join('\n');
  const m = text.match(new RegExp(`\\n\\s+${method}\\([^)]*?opts\\??: \\{([\\s\\S]*?)\\n\\s+\\}\\)`));
  if (!m) { gap(`could not read ${method}'s options from dist/*.d.ts: only ${Object.keys(fallback).join(', ')} were sent`); return fallback; }
  const opts = {};
  for (const [, k] of m[1].matchAll(/^\s+(\w+)\??:/gm)) {
    if (k in OPTION_VALUES) opts[k] = OPTION_VALUES[k];
    else gap(`${method} has an option ${k} this gate has no value for, so it was never sent: add it to OPTION_VALUES`);
  }
  return opts;
}

// ---- a recording fetch ----------------------------------------------------------------

const KEY = 'ow_w_' + 'A'.repeat(43);
const ACCOUNT_KEY = 'ow_a_' + 'A'.repeat(43);
function recorder(respond = () => ({ status: 200, body: {} }), apiKey = KEY, extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const call = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: u.pathname,
      query: [...u.searchParams.keys()],
      queryFull: Object.fromEntries(u.searchParams.entries()),
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: Object.keys(init.headers ?? {}),
      headerValues: { ...(init.headers ?? {}) },
    };
    calls.push(call);
    const r = respond(call, calls.length);
    // A response may carry headers of its own (an ETag on the head read, 7h); a 204 and a 304 have no body.
    if (r.status === 204 || r.status === 304) return new Response(null, { status: r.status, headers: r.headers ?? {} });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  };
  const options = { apiKey, apiPin: apiKey === KEY ? '0000' : undefined, fetch: fetchImpl, ...extra };
  // An account-token client is an agent one, so 2h holds X-OW-Agent to every account route the gate calls (a
  // plain client's headers are a subset of an agent's): mintWorldKey sent it where the document declares none
  // until 2026-10-31. An SDK without the option (before 4.26.0) gets a plain client.
  if (apiKey === ACCOUNT_KEY && !('agent' in extra)) {
    try { return { calls, client: new OwV2Client({ ...options, agent: true }) }; } catch { /* no agent option */ }
  }
  return { calls, client: new OwV2Client(options) };
}

function normalise(p) {
  const rest = p.replace(/^\/api\/v2/, '').replace(/\/+$/, '');
  const parts = rest.split('/').filter(Boolean);
  if (ELEMENT_TYPES.includes(parts[0])) {
    if (parts[1]) parts[1] = '{id}';
    if (parts[2] === 'links' && parts[3]) parts[3] = '{field}';
  }
  const p2 = '/api/v2/' + parts.join('/');
  if (paths[p2]) return p2;
  // any other templated route (/account/worlds/{world_id}/links/{link_id}): a {param} is one segment
  return TEMPLATES.find((t) => t.rx.test(p2))?.path ?? p2;
}
const TEMPLATES = Object.keys(paths).filter((p) => p.includes('{'))
  .map((p) => ({ path: p, rx: new RegExp('^' + p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+') + '$') }));
const opOf = (c) => paths[normalise(c.path)]?.[c.method.toLowerCase()];

// ---- 1 + 2: routes and query parameters ------------------------------------------------

const ID = '018f0000-0000-7000-8000-000000000001';
const seen = new Set();
// Headers that carry credentials or the body's type: the document states auth in its security schemes.
const AUTH_HEADERS = new Set(['api-key', 'api-pin', 'authorization', 'content-type']);
const ifMatchSeen = new Set();
// Operations the client sends a JSON body to where the document gives no request schema: named in the report.
const bodyBlind = new Set();
// Operations the client calls whose success answer the document leaves without a schema (a 204 has
// no body and is not blind): what the SDK reads there is unchecked. Named, never passed (ask and
// sort gained tokens_remaining and token_rating on 2026-10-14 and this gate said nothing).
const answerBlind = new Set();
// An SDK before 4.26.0 has no agent option: the declaration goes unchecked, named in the report.
let agentBlind = false;
// The world-key client's answers: the head read is tagged, so a second changesHead() sends If-None-Match
// and 2h holds it to the document's header parameter (7h checks what it does with the 304).
const respondWorld = (c) => c.queryFull?.head === 'true'
  ? (c.headerValues['If-None-Match'] ? { status: 304, headers: { ETag: 'W/"7:-"' } } : { status: 200, body: { head: 7, cursor: '7', epoch: null }, headers: { ETag: 'W/"7:-"' } })
  // a review answers the key its decision settles (SDK 4.68.0 checks it): `deleted` beside the page keys
  : { status: 200, body: { data: [], has_more: false, next_cursor: null, deleted: ID } };
// Every world-key call the gate makes, driven by a plain client and again by an agent one.
async function driveWorldKey(client) {
  await client.health();
  await client.getWorld();
  // who am I, and who is here (SDK 4.22+): world-key reads
  if (typeof client.me === 'function') await client.me();
  if (typeof client.setMyCharacter === 'function') await client.setMyCharacter(null); // PUT /me/character (4.50.0)
  if (typeof client.members === 'function') await client.members();
  if (typeof client.setMyLenses === 'function') await client.setMyLenses([ID]); // PUT /me/lenses (4.92.0)
  if (typeof client.worldLenses === 'function') await client.worldLenses(ID, { resolve: true, readAs: 'guest' }); // GET /world/{world_id}/lenses
  // The draught's lens option arrived with setMyLenses (4.92.0): an older SDK refuses the key, so it is asked only there.
  if (typeof client.setMyLenses === 'function') await client.draught(ID, { lens: ID, compact: true });
  await client.patchWorld({ name: 'x' });
  await client.bulk([{ type: 'character', element: { name: 'x' } }]);
  await client.changes({});
  if (typeof client.changesHead === 'function') { await client.changesHead(); await client.changesHead(); }
  if (typeof client.worldProposals === 'function') await client.worldProposals({ state: 'open', since: 'c', element: ID, limit: 5, cursor: 'c' }); // the proposals queue
  if (typeof client.createMediaTicket === 'function') await client.createMediaTicket();
  if (typeof client.createRemovalTicket === 'function') await client.createRemovalTicket('u/w/x.png');
  // Files on elements (SDK 4.32+): the world's list here, the four per-element routes per type below.
  const HAS_FILES = typeof client.listFiles === 'function';
  if (HAS_FILES) await client.worldFiles();
  for (const t of ELEMENT_TYPES) {
    if (HAS_FILES) {
      await client.listFiles(t, ID);
      // every body key, the label included, so 2b holds all four to the document's body
      await client.createFileTicket(t, ID, { name: 'x.yml', size: 1, label: 'description' });
      await client.fileDownloadLink(t, ID, ID);
      await client.removeFile(t, ID, ID);
    }
    await client.list(t, { limit: 1, cursor: 'c', expand: ['a'], fields: ['name'], ids: [ID], createdBy: 'owner',
      filter: { name__icontains: 'a', supertype: 'b', subtype: 'c' } });
    await client.get(t, ID, { expand: ['a'], fields: ['name'] });
    await client.create(t, { name: 'x' });
    await client.upsert(t, ID, { name: 'x' });
    await client.patch(t, ID, { name: 'x' });
    await client.delete(t, ID);
    await client.editLinks(t, ID, 'f', { add: [], remove: [] });
    await client.adopt(t, ID, 'owner'); // {member} to /{type}/{id}/adopt
    await client.hide(t, ID); // the hidden mark's two writes
    if (t === 'character' && typeof client.draught === 'function') await client.draught(ID, { components: ['self'], mode: 'voice', asOf: 1, undated: 'exclude', since: 'c', budget: 5, depth: 0 }); // the draught
    if (t === 'character' && typeof client.search === 'function') await client.search('harbour', { type: t, limit: 200, viewAs: 'public' }); // search; the package's from 4.150.0
    await client.unhide(t, ID);
    if (typeof client.listHidden === 'function') await client.listHidden(); // the world's hidden list (4.48.0)
    if (typeof client.propose === 'function') { // the proposed change (4.58.0), the five routes per type
      await client.propose(t, ID, { fields: { name: 'x' }, evidence: 'e', expires: 30 });
      await client.listProposals(t, ID, { limit: 5, cursor: 'c' });
      await client.acceptProposal(t, ID, ID);
      await client.declineProposal(t, ID, ID, { reason: 'r' });
      await client.withdrawProposal(t, ID, ID);
    }
    // SDK 4.66.0: settling a new element written as proposed, both decisions, the reason sent
    if (typeof client.reviewNewElement === 'function') await client.reviewNewElement(t, ID, { decision: 'decline', reason: 'r' });
    // The precondition header, on every element route the document gives it.
    await client.patch(t, ID, { name: 'x' }, { ifMatch: 41 });
    await client.editLinks(t, ID, 'f', { add: [], remove: [] }, { ifMatch: 41 });
    await client.delete(t, ID, { ifMatch: 41 });
  }
}
{
  // The head read is tagged, so the second changesHead() below sends If-None-Match and 2h holds it
  // to the document's header parameter (7h checks what it does with the 304).
  const { client, calls } = recorder(respondWorld);
  await driveWorldKey(client);
  // The same calls from an `agent: true` client (SDK 4.26+), so 2h holds X-OW-Agent to every operation they
  // reach, not only the element writes the agent block below drives (hide, unhide and setMyCharacter sent it
  // where the document declares none until 2026-10-31, found by a port of the client). An SDK that refuses
  // the option is named below as agentBlind.
  let agentWorld = null;
  try { agentWorld = recorder(respondWorld, KEY, { agent: true }); } catch { agentBlind = true; }
  if (agentWorld) { await driveWorldKey(agentWorld.client); calls.push(...agentWorld.calls); }
  // The join (SDK 4.12+): the preview from a world-key client, the accept from an account-token one.
  if (typeof client.previewJoin === 'function') await client.previewJoin('ow_j_x');
  // redeem (SDK 4.30+): no credential from a client that holds one, both names sent
  if (typeof client.redeemJoin === 'function') await client.redeemJoin('ow_j_x', allOptions('redeemJoin', { name: 'x', agentName: 'x' }));
  if (typeof OwV2Client.prototype.acceptJoin === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.acceptJoin('ow_j_x');
    calls.push(...acct.calls);
  }
  // The AI proxy (SDK 4.13+), from an account-token client.
  if (typeof OwV2Client.prototype.ask === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY);
    await acct.client.ask({ worldId: ID, question: 'q', context: ['x'] });
    calls.push(...acct.calls);
  }
  // The note sorter (SDK 4.18+), ask's sibling on the same allowance.
  if (typeof OwV2Client.prototype.sort === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY);
    await acct.client.sort({ worldId: ID, notes: ['x'], slice: [] });
    calls.push(...acct.calls);
  }
  // The allowance (SDK 4.21+, 2026-10-14): the same meter, read without spending.
  if (typeof OwV2Client.prototype.allowance === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY);
    await acct.client.allowance();
    calls.push(...acct.calls);
  }
  // The AI door (SDK 4.137+): the list of uses, and a call of each listed use with an
  // Idempotency-Key, from an account client named so its X-OW-Client is held to the operation too.
  if (typeof OwV2Client.prototype.aiUses === 'function') {
    const acct = recorder(() => ({ status: 200, body: { uses: [] } }), ACCOUNT_KEY);
    await acct.client.aiUses();
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.ai === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY);
    await acct.client.ai('ask', { world_id: ID, question: 'q', context: ['x'] }, { idempotencyKey: 'k' });
    await acct.client.ai('sort', { world_id: ID, notes: ['x'], slice: [] }, { idempotencyKey: 'k' });
    calls.push(...acct.calls);
  }
  // Signing in with a password (SDK 4.31+), from a client with no key. Two of its three
  // calls go to the sign-in service mounted at /api/v2/auth/ (allauth's), which keel's document does
  // not describe: held here to their exact shape, named as outside the document. The third, the
  // mint, is held to its operation, but outside the general loop: the document lists only the
  // account token for POST /account/tokens, and keel takes the session token there too.
  if (typeof OwV2Client.prototype.completeSignIn === 'function') {
    // Sign in with OnlyWorlds: the one request, POST /auth/token, held to the document's body.
    const mem = new Map();
    const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), remove: (k) => mem.delete(k) };
    const begun = await new OwV2Client({ fetch: async () => { throw new Error('no fetch'); } })
      .signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', storage, navigate: false });
    // The answer is built from the document's own schema, never a hand list: a hand-written answer
    // passed 4.72.4 the hour keel made token_id required, unread by the SDK (2026-10-25).
    const deref = (s) => { const r = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/); return r ? doc.components?.schemas?.[r[1]] : s; };
    const tokenSchema = deref(paths['/api/v2/auth/token']?.post?.responses?.['200']?.content?.['application/json']?.schema);
    const sample = (s, name) => {
      s = deref(s);
      if (s?.const !== undefined) return s.const;
      if (s?.type === 'object') return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, sample(v, k)]));
      if (s?.type === 'array') return [sample(s.items, name)];
      if (s?.format === 'uuid') return name === 'token_id' ? '01a17000-0000-7000-8000-00000000000b' : ID;
      return name === 'token' ? 'ow_a_x' : `x-${name}`;
    };
    if (!tokenSchema?.properties) schemaBlind.push('POST /auth/token (no answer schema)');
    const answer = tokenSchema?.properties ? sample(tokenSchema) : { token: 'ow_a_x', token_type: 'bearer', account: { id: ID, username: 'x' } };
    const oauth = recorder(() => ({ status: 200, body: answer }), undefined);
    const signedIn = await oauth.client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c&state=${begun.state}` });
    calls.push(...oauth.calls);
    // Every field the document requires in the answer reaches the caller, under its camelCase name.
    const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const unread = (tokenSchema?.required ?? []).filter((k) => JSON.stringify(signedIn?.[camel(k)]) !== JSON.stringify(answer[k]));
    if (unread.length) bad(`completeSignIn's result does not carry the exchange answer's ${unread.join(', ')} (as ${unread.map(camel).join(', ')})`);
    else if (tokenSchema?.required?.length) ok();
    const cred = (c) => (c?.headers ?? []).filter((h) => ['api-key', 'api-pin', 'authorization'].includes(h.toLowerCase()));
    const t = oauth.calls[0];
    if (oauth.calls.length === 1 && t.method === 'POST' && t.path === '/api/v2/auth/token' && !cred(t).length) ok();
    else bad(`completeSignIn sent ${oauth.calls.map((c) => `${c.method} ${c.path}`).join(', ') || 'nothing'}, not one POST /api/v2/auth/token without a credential`);
    // The AI door token at the exchange (SDK 4.138.0): both options sent, held to the
    // document's body by the general loop, and every required field of the answer's ai_token read back.
    const aiSchema = deref(tokenSchema?.properties?.ai_token);
    if (aiSchema?.properties) {
      const begun2 = await new OwV2Client({ fetch: async () => { throw new Error('no fetch'); } })
        .signInWithOnlyWorlds({ clientId: 'atlas', redirectUri: 'https://atlas.onlyworlds.com/signin/callback', storage, navigate: false });
      const oauthAi = recorder(() => ({ status: 200, body: answer }), undefined);
      const withAi = await oauthAi.client.completeSignIn({ clientId: 'atlas', storage, url: `https://atlas.onlyworlds.com/signin/callback?code=c&state=${begun2.state}`, aiUses: ['ask'], aiLifetimeMinutes: 60 });
      calls.push(...oauthAi.calls);
      const sentAi = oauthAi.calls[0]?.body ?? {};
      if (Array.isArray(sentAi.ai_uses) && sentAi.ai_lifetime_minutes === 60) ok();
      else bad(`completeSignIn with aiUses sent ${JSON.stringify(Object.keys(sentAi))}, not ai_uses and ai_lifetime_minutes`);
      const aiUnread = (aiSchema.required ?? []).filter((k) => JSON.stringify(withAi?.aiToken?.[camel(k)]) !== JSON.stringify(answer.ai_token?.[k]));
      if (!(aiSchema.required ?? []).length) schemaBlind.push('POST /auth/token ai_token (no required fields)');
      else if (aiUnread.length) bad(`completeSignIn's aiToken does not carry the answer's ai_token ${aiUnread.join(', ')} (as ${aiUnread.map(camel).join(', ')})`);
      else ok();
    } else if (typeof OwV2Client.prototype.mintAiToken === 'function') bad('the SDK asks the exchange for an AI door token, and the document\'s answer declares no ai_token');
    const authorize = new URL(begun.url);
    if (authorize.origin + authorize.pathname === 'https://www.onlyworlds.com/signin/authorize' && authorize.searchParams.get('code_challenge_method') === 'S256') ok();
    else bad(`signInWithOnlyWorlds sends the browser to ${begun.url}, not /signin/authorize with S256`);
  }
  if (typeof OwV2Client.prototype.signInWithPassword === 'function') {
    const signCalls = [];
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      signCalls.push({ method: (init.method ?? 'GET').toUpperCase(), path: u.pathname, headers: Object.keys(init.headers ?? {}),
        body: init.body ? JSON.parse(init.body) : undefined });
      const n = signCalls.length;
      const body = n === 1 ? { meta: { session_token: 's' } } : n === 2 ? { id: 't', name: 'x', last4: 'abcd', token: 'ow_a_xabcd' } : {};
      return new Response(JSON.stringify(body), { status: n === 1 ? 200 : n === 2 ? 201 : 401, headers: { 'content-type': 'application/json' } });
    };
    await new OwV2Client({ fetch: fetchImpl }).signInWithPassword({ email: 'a@b.c', password: 'p', tokenName: 'x' });
    const [login, mint, end] = signCalls;
    const cred = (c) => (c?.headers ?? []).filter((h) => ['api-key', 'api-pin', 'authorization'].includes(h.toLowerCase()));
    if (signCalls.length !== 3) bad(`signInWithPassword sent ${signCalls.length} request(s), not the three (login, mint, end)`);
    else ok();
    if (login?.method === 'POST' && login.path === '/api/v2/auth/app/v1/auth/login' && login.body?.password === 'p' && !cred(login).length) ok();
    else bad(`signInWithPassword's login is ${login?.method} ${login?.path}, not POST /api/v2/auth/app/v1/auth/login without a key`);
    if (end?.method === 'DELETE' && end.path === '/api/v2/auth/app/v1/auth/session' && end.headers.some((h) => h.toLowerCase() === 'x-session-token')) ok();
    else bad(`signInWithPassword does not end its session with DELETE /api/v2/auth/app/v1/auth/session and its X-Session-Token`);
    if (!mint || !opOf(mint)) bad(`signInWithPassword mints with ${mint?.method} ${mint?.path}, and the document has no such operation`);
    else {
      ok();
      if (mint.body?.name === 'x' && mint.headers.some((h) => h.toLowerCase() === 'x-session-token') && !cred(mint).length) ok();
      else bad(`signInWithPassword's mint does not send its name with the session token alone`);
      const sec = opOf(mint).security;
      if (Array.isArray(sec) && sec.length && sec.every((s) => Object.keys(s).every((n) => /account/i.test(n)))) {
        console.log('  NOTE   POST /account/tokens: the document lists only the account token; keel takes X-Session-Token there too, and the SDK sends it. Reported upstream, 2026-10-18');
      }
    }
    console.log('  NOTE   signInWithPassword: POST .../auth/login and DELETE .../auth/session are the sign-in service at /api/v2/auth/ (allauth), outside keel\'s document: their shape is held above, their answers are not checked against a document');
  }
  // A world's invite links (SDK 4.24+): create with every option, list, revoke.
  if (typeof OwV2Client.prototype.createWorldLink === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.createWorldLink(ID, allOptions('createWorldLink', { reader: 'agent', role: 'guest', days: 7, inviterName: 'x', withCharacter: true }));
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.listWorldLinks === 'function') {
    const acct = recorder(() => ({ status: 200, body: { data: [] } }), ACCOUNT_KEY);
    await acct.client.listWorldLinks(ID);
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.revokeWorldLink === 'function') {
    const acct = recorder(() => ({ status: 204, body: null }), ACCOUNT_KEY);
    await acct.client.revokeWorldLink(ID, ID);
    calls.push(...acct.calls);
  }
  // Seats for your own AI (SDK 4.28+): create with every option, list, remove.
  if (typeof OwV2Client.prototype.createSeat === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.createSeat(ID, { name: 'x', role: 'guest', character: 'mine' });
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.listSeats === 'function') {
    const acct = recorder(() => ({ status: 200, body: { data: [] } }), ACCOUNT_KEY);
    await acct.client.listSeats(ID);
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.rekeySeat === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.rekeySeat(ID, ID);
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.listAccountWorlds === 'function') {
    const acct = recorder(() => ({ status: 200, body: { data: [] } }), ACCOUNT_KEY);
    await acct.client.listAccountWorlds();
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.mintWorldKey === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.mintWorldKey(ID, { scope: 'read', name: 'x' });
    // The mint takes an Idempotency-Key it never replays, held to the operation's own headers
    if (acct.client.mintWorldKey.length >= 1) {
      try { await acct.client.mintWorldKey(ID, { scope: 'read', idempotencyKey: 'mint-1' }); } catch (e) { if (!(e instanceof Error) || !/unknown parameter 'idempotencyKey'/.test(e.message)) throw e; }
    }
    calls.push(...acct.calls);
  }
  // The lost mint's lookup: the account token, the idempotency key in the query.
  if (typeof OwV2Client.prototype.madeWorldKey === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY);
    await acct.client.madeWorldKey(ID, 'mint-1');
    calls.push(...acct.calls);
  }
  // A key's revoke (SDK 4.78.0): the account token, the key by id.
  if (typeof OwV2Client.prototype.revokeWorldKey === 'function') {
    const acct = recorder(() => ({ status: 204, body: null }), ACCOUNT_KEY);
    await acct.client.revokeWorldKey(ID, ID);
    calls.push(...acct.calls);
  }
  // The account's tokens (SDK 4.122.0): the list, and a revoke by id, the Bearer alone.
  if (typeof OwV2Client.prototype.listAccountTokens === 'function') {
    const acct = recorder(() => ({ status: 200, body: { data: [] } }), ACCOUNT_KEY);
    await acct.client.listAccountTokens();
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.revokeAccountToken === 'function') {
    const acct = recorder(() => ({ status: 204, body: null }), ACCOUNT_KEY);
    await acct.client.revokeAccountToken(ID);
    calls.push(...acct.calls);
  }
  // The AI door token's mint (SDK 4.138.0): every option sent, the Bearer alone.
  if (typeof OwV2Client.prototype.mintAiToken === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.mintAiToken(['ask'], { lifetimeMinutes: 60, name: 'x' });
    calls.push(...acct.calls);
  }
  // The account's world create (SDK 4.66.0; key_name, then source and producer, since): every option sent.
  if (typeof OwV2Client.prototype.createAccountWorld === 'function') {
    const acct = recorder(() => ({ status: 201, body: {} }), ACCOUNT_KEY);
    await acct.client.createAccountWorld({ name: 'x', pin: '1234', keyName: 'x', source: { world: 'x' }, producer: { tool: 'x' } });
    calls.push(...acct.calls);
  }
  if (typeof OwV2Client.prototype.removeSeat === 'function') {
    const acct = recorder(() => ({ status: 204, body: null }), ACCOUNT_KEY);
    await acct.client.removeSeat(ID, ID);
    calls.push(...acct.calls);
  }
  // A row's lenses (keel's PATCH members with `lenses` alone), and the two lens routes keel serves an
  // account token on beside the world key: the lenses in the path, PUT /me/lenses with world=<id>.
  // They came in one SDK version, so setMemberLenses marks it; an older SDK refuses the token there.
  if (typeof OwV2Client.prototype.setMemberLenses === 'function') {
    const acct = recorder(() => ({ status: 200, body: {} }), ACCOUNT_KEY, { world: ID });
    await acct.client.setMemberLenses(ID, 'owner', [ID]);
    await acct.client.worldLenses(ID, { resolve: true, readAs: 'guest' });
    await acct.client.setMyLenses([ID]);
    calls.push(...acct.calls);
    // PUT's query is not read by 2 (a GET's only): the world goes as `world`, a parameter the document lists there.
    const put = acct.calls.find((c) => c.method === 'PUT');
    const listed = (opOf(put)?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    if (put && put.query.join() === 'world' && put.queryFull.world === ID && listed.includes('world')) ok();
    else bad(`setMyLenses on an account token sends ?${put?.query.join('&')} (the document lists ${listed.join(', ') || 'none'}), not world=<id>`);
  }
  // The roster on an account token (SDK 4.116.0): GET /members with world=<id> and the Bearer alone,
  // held by 2 and 2s+ to the operation's own parameters and security. An older SDK refuses the token before sending.
  if (typeof OwV2Client.prototype.members === 'function') {
    const acct = recorder(() => ({ status: 200, body: { data: [] } }), ACCOUNT_KEY, { world: ID });
    try { await acct.client.members(); calls.push(...acct.calls); }
    catch (e) { if (!(e instanceof TypeError && /world key/.test(String(e.message)))) throw e; }
  }
  // uploadFile (SDK 4.32+): its first request, the ticket (the size from the bytes, the
  // kind read from the name), joins the calls below and is held to its operation. Its second goes to
  // the ticket's upload_url, the upload host (its own contract), which keel's document does not
  // describe: held here to its shape (POST, the Bearer ticket alone, the raw bytes), named as outside.
  if (typeof OwV2Client.prototype.uploadFile === 'function') {
    const upCalls = [];
    const HOST = 'https://upload.example.invalid/v1/file';
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const toKeel = u.origin === 'https://www.onlyworlds.com';
      upCalls.push({
        toKeel, url, method: (init.method ?? 'GET').toUpperCase(), path: u.pathname,
        query: [...u.searchParams.keys()], queryFull: Object.fromEntries(u.searchParams.entries()),
        headers: Object.keys(init.headers ?? {}), rawHeaders: init.headers ?? {}, rawBody: init.body,
        body: toKeel && init.body ? JSON.parse(init.body) : undefined,
      });
      const body = toKeel
        ? { ticket: 'f1.x', upload_url: HOST, prefix: 'w/w/e/', key: 'w/w/e/f.pdf', max_bytes: 100, exp: 1, uses: 1,
          issued_to: { account: null, membership: null }, kind: 'file', file_id: ID }
        : { key: 'w/w/e/f.pdf', fid: ID, bytes: 5, type: 'application/pdf', etag: 'e' };
      return new Response(JSON.stringify(body), { status: 201, headers: { 'content-type': 'application/json' } });
    };
    await new OwV2Client({ apiKey: KEY, apiPin: '0000', fetch: fetchImpl })
      .uploadFile('character', ID, bytes, { name: 'x.PDF', label: 'description' });
    const [ticketCall, hostCall] = upCalls;
    if (upCalls.length !== 2 || !ticketCall?.toKeel || hostCall?.toKeel) {
      bad(`uploadFile sent ${upCalls.length} request(s) (${upCalls.map((c) => `${c.method} ${c.url}`).join(', ')}), not the ticket from keel and then the bytes to its upload_url`);
    } else {
      ok();
      calls.push(ticketCall);
      if (ticketCall.body?.kind === 'pdf' && ticketCall.body?.size === 5) ok();
      else bad(`uploadFile asked for a ticket with kind ${ticketCall.body?.kind} and size ${ticketCall.body?.size}, not pdf (read from x.PDF) and 5 (the bytes)`);
      if (hostCall.url === HOST && hostCall.method === 'POST' && hostCall.rawBody === bytes
        && hostCall.headers.join() === 'Authorization' && hostCall.rawHeaders.Authorization === 'Bearer f1.x') ok();
      else bad(`uploadFile's second request is ${hostCall.method} ${hostCall.url} with [${hostCall.headers}], not POST <upload_url> with the Bearer ticket alone and the raw bytes`);
    }
    console.log('  NOTE   uploadFile: its second request is the upload host (POST <upload_url>, its own contract), outside keel\'s document: its shape is held above, its answers are not checked against a document');
  }
  // An agent: true client on the files routes: they join the calls below, so 2h fails an X-OW-Agent
  // sent where the document lists no such header (the files routes declare it on none of them).
  if (typeof OwV2Client.prototype.createFileTicket === 'function') {
    const agf = recorder(() => ({ status: 201, body: {} }), KEY, { agent: true });
    await agf.client.createFileTicket('character', ID, { name: 'x.md', size: 1 });
    await agf.client.removeFile('character', ID, ID);
    calls.push(...agf.calls);
  }
  // 2a. The agent declaration (SDK 4.26+): an `agent: true` client's six element
  // writes and two reads join the calls below, so 2h holds X-OW-Agent to the operations the document
  // declares it on (the element writes, not the reads); and the run must see it on all six writes.
  {
    const ag = recorder(() => ({ status: 200, body: { data: [], has_more: false, next_cursor: null } }), KEY, { agent: true });
    await ag.client.get('character', ID);
    await ag.client.list('character');
    await ag.client.create('character', { name: 'x' });
    await ag.client.upsert('character', ID, { name: 'x' });
    await ag.client.patch('character', ID, { name: 'x' });
    await ag.client.editLinks('character', ID, 'species', { add: [ID], remove: [] });
    await ag.client.bulk([{ type: 'character', element: { name: 'x' } }]);
    await ag.client.delete('character', ID);
    const sends = (c) => c.headers.some((h) => h.toLowerCase() === 'x-ow-agent');
    if (!ag.calls.some(sends)) agentBlind = true;
    else {
      const unsent = ag.calls.filter((c) => c.method !== 'GET' && !sends(c)).map((c) => `${c.method} ${normalise(c.path)}`);
      if (unsent.length) bad(`an agent: true client sends no X-OW-Agent on ${unsent.join(', ')}`);
      else ok();
      calls.push(...ag.calls);
    }
  }
  const absentOps = new Set();
  for (const c of calls) {
    const key = `${c.method} ${normalise(c.path)}`;
    if (seen.has(key)) {
      // still check the query names of repeats below
    }
    seen.add(key);
    const op = opOf(c);
    // One line per missing route, not per call: six calls to one absent route are one condition.
    if (!op) { if (!absentOps.has(key)) { absentOps.add(key); bad(`the client sends ${key}, and the document has no such operation`); } continue; }
    ok();
    const listed = new Set((op.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name));
    if (c.query.length && (c.method === 'GET') && !normalise(c.path).startsWith('/api/v2/changes')) {
      for (const q of c.query) {
        if (!listed.has(q)) bad(`${key}: the client sends ?${q}=, which the document does not list for that operation`);
        else ok();
      }
    }
    // 2s. Credentials as the document's security says: none where it declares `security: []`
    // (the join preview: a client holding a key must still send nothing), a Bearer where it
    // names only the account token. Other operations follow the global schemes, checked in 3.
    const credSent = c.headers.filter((h) => ['api-key', 'api-pin', 'authorization'].includes(h.toLowerCase()));
    if (Array.isArray(op.security) && op.security.length === 0) {
      if (credSent.length) bad(`${key}: the document declares no security, and the client sends ${credSent.join(', ')}`);
      else ok();
    } else if (Array.isArray(op.security) && op.security.length && op.security.every((s) => Object.keys(s).every((n) => /account/i.test(n)))) {
      if (!c.headers.some((h) => h.toLowerCase() === 'authorization')) bad(`${key}: the document wants an account token, and the client sends no Authorization`);
      else ok();
    }
    // 2s+. Where the document declares security, the credentials sent are exactly one of its
    // alternatives (API-Key = ApiKey, API-Pin = ApiPin, a Bearer = AccountToken): a Bearer to a route
    // that names no account token, or a key and PIN where only the token is declared, is drift (2026-10-27:
    // worldLenses and setMyLenses took an account token, keel's document declaring it beside the key).
    if (Array.isArray(op.security) && op.security.length) {
      const SCHEME = { 'api-key': 'ApiKey', 'api-pin': 'ApiPin', authorization: 'AccountToken' };
      const sent = credSent.map((h) => SCHEME[h.toLowerCase()]).sort().join('+');
      const alts = op.security.map((s) => Object.keys(s).sort().join('+'));
      if (!alts.includes(sent)) bad(`${key}: the client sends ${sent || 'no credential'}, and the document's security is ${alts.join(' | ')}`);
      else ok();
      // 2s0. The one rule: the SDK makes no keyless call. Where the document declares
      // security, a call sends a credential, even where `{}` makes none a way in (the
      // keyless door's 47 reads), so a read that lost its key is still drift.
      if (!sent) bad(`${key}: the client sends no credential; the SDK makes no keyless call, though the document's security is ${alts.map((a) => a || '{}').join(' | ')}`);
      else ok();
    }
    // 2b. A JSON body's keys are ones the document's request body names, where it names any, on
    // every operation (it read a fixed list of routes until 2026-10-16: the seat and link bodies passed unseen).
    const reqProps = op.requestBody?.content?.['application/json']?.schema?.properties;
    if (c.body !== undefined && !op.requestBody?.content?.['application/json']?.schema) bodyBlind.add(key);
    const okCodes = Object.keys(op.responses ?? {}).filter((s) => /^2\d\d$/.test(s) && s !== '204');
    if (okCodes.length && okCodes.every((s) => !op.responses[s]?.content?.['application/json']?.schema)) answerBlind.add(key);
    if (reqProps && c.body && typeof c.body === 'object' && !Array.isArray(c.body)) {
      const extra = Object.keys(c.body).filter((k) => !(k in reqProps));
      if (extra.length) bad(`${key}: the client sends ${extra.join(', ')}, which the document's body does not have`);
      else ok();
      // and the other way (since keel declared these bodies): every key the document requires is sent
      const reqd = op.requestBody?.content?.['application/json']?.schema?.required ?? [];
      const unsent = reqd.filter((k) => !(k in c.body));
      if (unsent.length) bad(`${key}: the document's body requires ${unsent.join(', ')}, which the client does not send`);
      else ok();
    }
    // 2h. Every header the client sends beyond credentials and the body's type is a header
    // parameter the document lists for that operation; If-Match only where a 412 is declared.
    const hdrs = new Set((op.parameters ?? []).filter((p) => p.in === 'header').map((p) => p.name.toLowerCase()));
    for (const h of c.headers) {
      if (AUTH_HEADERS.has(h.toLowerCase())) continue;
      if (!hdrs.has(h.toLowerCase())) bad(`${key}: the client sends the header ${h}, which the document does not list for that operation`);
      else ok();
      if (h.toLowerCase() === 'if-match') {
        if (!op.responses?.['412']) bad(`${key}: the client sends If-Match, and the document declares no 412 for that operation`);
        else { ok(); ifMatchSeen.add(key); }
      }
    }
  }
}
// Every Character operation the document gives an If-Match header must be seen carrying it: the list is
// read from the document, never kept here (a hand list of two missed DELETE's, 2026-10-22).
const ifMatchOps = [];
for (const [path, ops] of Object.entries(doc.paths ?? {})) {
  if (!path.startsWith('/api/v2/character/')) continue;
  for (const [method, op] of Object.entries(ops)) {
    if (op?.parameters?.some((p) => p.in === 'header' && p.name.toLowerCase() === 'if-match')) ifMatchOps.push(`${method.toUpperCase()} ${path}`);
  }
}
if (ifMatchOps.length === 0) bad('no Character operation in the document declares If-Match: the check below has nothing to hold');
for (const k of ifMatchOps) {
  if (!ifMatchSeen.has(k)) bad(`${k}: the document takes If-Match there and the run never saw the client send it`);
  else ok();
}

// 2w. The world readers: a read the world-key run makes, whose operation the document opens to an account token
// or to the keyless reader through a `world` query parameter (its security lists AccountToken, or `{}`), is made
// from that client too, with world=<id>. Every world-key call is driven again from each, a refusal before sending
// taken as no call. The draught went unread here: npm refused both clients there through 4.121.0 (found by a port of the client).
{
  const worldParam = (op) => (op?.parameters ?? []).some((p) => p.in === 'query' && p.name === 'world');
  const opened = (op, scheme) => (op?.security ?? []).some((s) => scheme ? scheme in s : Object.keys(s).length === 0);
  const refusing = (c) => new Proxy(c, { get(t, k) {
    const v = t[k];
    return typeof v === 'function' ? async (...a) => { try { return await v.apply(t, a); } catch { return undefined; } } : v;
  } });
  const keyOf = (c) => `${c.method} ${normalise(c.path)}`;
  const base = recorder(respondWorld);
  await driveWorldKey(base.client);
  const reads = [...new Set(base.calls.filter((c) => c.method === 'GET' && worldParam(opOf(c))).map(keyOf))];
  if (reads.length === 0) bad('2w: no world-key read reaches an operation with a `world` parameter: the check has nothing to hold');
  // the keyless client: `apiKey: undefined` in the extras, since the recorder's own default is the world key
  for (const [who, apiKey, scheme] of [['an account token', ACCOUNT_KEY, 'AccountToken'], ['the keyless reader', KEY, null]]) {
    let r;
    const extra = scheme ? { world: ID } : { world: ID, apiKey: undefined };
    try { r = recorder(respondWorld, apiKey, extra); } catch (e) { bad(`2w: no client for ${who} with world: ${e.message}`); continue; }
    await driveWorldKey(refusing(r.client));
    const sent = new Set(r.calls.filter((c) => c.queryFull?.world === ID).map(keyOf));
    for (const k of reads) {
      const op = paths[k.split(' ')[1]]?.get;
      if (!opened(op, scheme)) continue;
      if (sent.has(k)) ok();
      else bad(`${k}: the document serves ${who} there with world=<id>, and the SDK makes no such call from that client`);
    }
  }
}

// ---- 3 + 4: fields, kinds, required ------------------------------------------------------

const KIND = { text: 'string', integer: 'integer', multi_link: 'array', single_link: 'string' };
const jsonType = (s) => {
  const t = Array.isArray(s?.type) ? s.type.filter((x) => x !== 'null') : [s?.type];
  return t.length === 1 ? t[0] : t.join('|');
};
const readOf = (t) => schemas[t[0].toUpperCase() + t.slice(1)];
const writeOf = (t) => schemas[t[0].toUpperCase() + t.slice(1) + 'Write'];

// A served `x_` mark on the base (x_served_trimmed: keel serves it on a message only, a Narrative) is
// type-scoped by nature, and OwElement is the base for every type: it is held to "some type's read
// schema has it", once, never to every type's.
const servedMarks = BASE ? [...BASE].filter((k) => k.startsWith('x_')) : [];
for (const k of servedMarks) {
  if (ELEMENT_TYPES.some((t) => k in (readOf(t)?.properties ?? {}))) ok();
  else bad(`the SDK's base declares \`${k}\` and no type's read schema in the document has it`);
}

const readOnlyByType = {};
for (const t of ELEMENT_TYPES) {
  const R = readOf(t);
  const W = writeOf(t);
  if (!R || !W) { bad(`${t}: the document has no ${!R ? 'read' : 'write'} schema`); continue; }
  const rp = Object.keys(R.properties ?? {});
  const wp = new Set(Object.keys(W.properties ?? {}));
  readOnlyByType[t] = rp.filter((k) => !wp.has(k));
  const fs = FIELD_SCHEMA[t] ?? {};
  if (BASE) {
    const sdkSet = new Set([...BASE, ...Object.keys(fs)]);
    for (const k of rp) if (!sdkSet.has(k)) bad(`${t}: the document returns \`${k}\` and the SDK's types do not know it`);
    for (const k of sdkSet) {
      if (!rp.includes(k) && !servedMarks.includes(k)) bad(`${t}: the SDK declares \`${k}\` and the document's read schema does not have it`);
    }
    if (rp.every((k) => sdkSet.has(k))) ok();
  }
  for (const [k, def] of Object.entries(fs)) {
    if (!(k in (R.properties ?? {}))) continue;
    const want = KIND[def.type];
    if (!want) { gap(`${t}.${k}: FIELD_SCHEMA kind \`${def.type}\` has no JSON mapping here`); continue; }
    const got = jsonType(R.properties[k]);
    if (got !== want) bad(`${t}.${k}: the SDK says ${def.type} (${want}), the document says ${got}`);
    else ok();
  }
  const reqSdk = Object.entries(fs).filter(([, d]) => d.required).map(([k]) => k).sort().join(',');
  const reqDoc = [...(W.required ?? [])].sort().join(',');
  if (reqSdk !== reqDoc) bad(`${t}: required fields differ — SDK [${reqSdk}], document write schema [${reqDoc}]`);
  else ok();
}

// ---- 5: what the client strips before a write ------------------------------------------------

{
  const { client, calls } = recorder();
  for (const t of ELEMENT_TYPES) {
    // Every property the document's read schema returns, so a field the document turns read-only is
    // offered too (a fixed list saw only the fields known when it was written; known_of was never
    // offered). known_of: false, since a stub (true) is a TypeError before sending.
    const fromRead = Object.fromEntries(Object.keys(readOf(t)?.properties ?? {}).map((k) => [k, null]));
    const full = { ...fromRead, name: 'x', world: 'w', type: t, created_at: 'a', updated_at: 'b', change_seq: 1, created_by: null, known_of: false };
    await client.upsert(t, ID, full);
    const sent = Object.keys(calls[calls.length - 1].body ?? {});
    const refused = readOnlyByType[t] ?? [];
    const leaked = refused.filter((k) => sent.includes(k));
    if (leaked.length) bad(`${t}: a write still carries ${leaked.join(', ')}, which the document's write schema refuses (a 422 on every round-tripped read body)`);
    else ok();
    // The same body through patch(), against the type's own Patch schema (read by nothing before 2026-11-04).
    const P = schemas[t[0].toUpperCase() + t.slice(1) + 'Patch'];
    if (!P) { bad(`${t}: the document has no patch schema`); continue; }
    const pp = new Set(Object.keys(P.properties ?? {}));
    await client.patch(t, ID, full);
    const sentP = Object.keys(calls[calls.length - 1].body ?? {});
    const leakedP = sentP.filter((k) => !pp.has(k));
    if (leakedP.length) bad(`${t}: a patch still carries ${leakedP.join(', ')}, which the document's patch schema does not have`);
    else ok();
  }
}

// ---- 5c: the world body (2026-10-09: World and WorldPatch components) -----------------
// The document now describes GET and PATCH /api/v2/world. Four things are checked: the two routes
// reference those components; the components agree with each other (every writable World key is in
// WorldPatch, no read-only key is); the real client sends every WorldPatch key untouched (its strip
// set removes none of them); and the canonical world fields the SDK is pinned to (time settings and
// the unit settings above all) appear in World under their wire names. Without the components the
// whole check is a named gap, not a pass.
{
  const W = schemas.World, WP = schemas.WorldPatch;
  const worldPath = paths['/api/v2/world'];
  const refOf = (op, where) => JSON.stringify(op?.[where] ?? {});
  if (!W || !WP || !worldPath) {
    gap('the document has no World / WorldPatch component (or no /api/v2/world): the world body went unchecked');
  } else {
    const getRef = refOf(worldPath.get?.responses?.['200'], 'content');
    const patchRef = refOf(worldPath.patch?.requestBody, 'content');
    if (!getRef.includes('#/components/schemas/World"')) bad('GET /api/v2/world does not reference the World component');
    else ok();
    if (!patchRef.includes('#/components/schemas/WorldPatch')) bad('PATCH /api/v2/world does not reference the WorldPatch component');
    else ok();

    const readKeys = Object.keys(W.properties ?? {});
    const writable = readKeys.filter((k) => !W.properties[k].readOnly);
    const patchKeys = Object.keys(WP.properties ?? {});
    const notInPatch = writable.filter((k) => !patchKeys.includes(k));
    const roInPatch = patchKeys.filter((k) => W.properties[k]?.readOnly);
    // A patch key World serves under a read-only object (`source` and `producer`, read
    // back under `origin`, whose properties the document lists) is in World, read from structure.
    const underReadOnly = (k) => Object.entries(W.properties ?? {}).some(([, p]) => p.readOnly && p.properties && k in p.properties);
    const notInWorld = patchKeys.filter((k) => !readKeys.includes(k) && !underReadOnly(k));
    if (notInPatch.length || roInPatch.length || notInWorld.length) {
      bad(`World and WorldPatch disagree: writable but not patchable [${notInPatch}], patchable but read-only [${roInPatch}], patchable but not in World [${notInWorld}]`);
    } else ok();

    // The client must send every patchable key, whatever its type.
    const { client, calls } = recorder();
    const sample = {};
    for (const k of patchKeys) {
      const t = [].concat(WP.properties[k].type ?? 'string');
      sample[k] = t.includes('array') ? [] : t.includes('integer') ? 1 : 'x';
    }
    // A whole GET body echoed back (patchWorld's documented use): every key World serves, the
    // read-only ones included, beside the patchable sample. Any read-only key the client lets
    // through shows below as a key it sends and the document refuses (origin).
    const echo = Object.fromEntries(readKeys.filter((k) => !patchKeys.includes(k)).map((k) => [k, 'x']));
    await client.patchWorld({ ...echo, ...sample, world: 'w', type: 'world', change_seq: 1, created_at: 'a', updated_at: 'b' });
    const sent = Object.keys(calls[calls.length - 1].body ?? {});
    const stripped = patchKeys.filter((k) => !sent.includes(k));
    const leaked = sent.filter((k) => !patchKeys.includes(k));
    if (stripped.length || leaked.length) bad(`patchWorld strips keys the document says are patchable [${stripped}] or sends keys it refuses [${leaked}]`);
    else ok();

    // The canonical fields the SDK's pin carries, against World. A schema copy that cannot be read is a gap.
    // Read from --schema-dist, by default the vendored copy the package under test was generated from.
    const worldYaml = resolve(SCHEMA_DIST, 'schema', 'world.yaml');
    const yaml = existsSync(worldYaml) ? readFileSync(worldYaml, 'utf8') : null;
    if (!yaml) gap(`${worldYaml} not found: the canonical world fields went unchecked`);
    else {
      console.log(`  read   the canonical world fields from ${worldYaml}`);
      const canonical = [...yaml.slice(yaml.indexOf('properties:')).matchAll(/^ {2}([a-z_]+):\s*$/gm)].map((m) => m[1]);
      const wire = (k) => (k === 'time_current' ? 'time_range_current' : k); // the one known spelling difference (Folder Format §5)
      const absent = canonical.map(wire).filter((k) => !readKeys.includes(k));
      // The time and unit settings are the world's configuration every client edits: absent is drift.
      // The rest (api_key, version, user) are the legacy and account fields the v2 API does not return; named, not failed.
      const config = absent.filter((k) => /^time_|_unit$/.test(k));
      const other = absent.filter((k) => !config.includes(k));
      if (config.length) bad(`the standard's world settings missing from the document's World: ${config.join(', ')}`);
      else ok();
      if (other.length) console.log(`  NOTE   canonical world fields the v2 World does not carry (legacy and account fields): ${other.join(', ')}`);
    }
  }
}

// ---- 5b: the media ticket (SDK 4.6+) ------------------------------------------------------------
// OwMediaTicket's keys, read from the published .d.ts, against the 201 schema keel documents.

const HAS_TICKET = typeof OwV2Client.prototype.createMediaTicket === 'function';
if (HAS_TICKET) {
  const doc201 = paths['/api/v2/media/ticket']?.post?.responses?.['201']?.content?.['application/json']?.schema;
  let sdkKeys = null;
  for (const rel of ['dist/index.d.ts', 'dist/v2/types.d.ts']) {
    const f = join(SDK_DIR, rel);
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/interface OwMediaTicket \{([\s\S]*?)\n\}/);
    if (m) { sdkKeys = [...m[1].matchAll(/^\s{4}(\w+)\??:/gm)].map((x) => x[1]); break; }
  }
  if (!doc201?.properties) gap('the document has no 201 schema for POST /api/v2/media/ticket — ticket fields unchecked');
  else if (!sdkKeys?.length) gap(`could not read OwMediaTicket from ${SDK_DIR}/dist — ticket fields unchecked`);
  else {
    const docKeys = Object.keys(doc201.properties);
    const extra = sdkKeys.filter((k) => !docKeys.includes(k));
    const missing = (doc201.required ?? docKeys).filter((k) => !sdkKeys.includes(k));
    if (extra.length) bad(`OwMediaTicket declares ${extra.join(', ')}, which the document's ticket does not have`);
    if (missing.length) bad(`the document's ticket has ${missing.join(', ')}, which OwMediaTicket does not declare`);
    if (!extra.length && !missing.length) ok();
  }
}

// ---- 5d: the removal ticket (SDK 4.8+) ---------------------------------------------------------
// What createRemovalTicket sends against the documented request body, and OwRemovalTicket's keys
// against the documented 200 (remove_url and exp in unix seconds).

if (typeof OwV2Client.prototype.createRemovalTicket === 'function') {
  const op = paths['/api/v2/media/remove-ticket']?.post;
  const bodyProps = op?.requestBody?.content?.['application/json']?.schema?.properties;
  const doc200 = op?.responses?.['200']?.content?.['application/json']?.schema;
  const { client, calls } = recorder();
  await client.createRemovalTicket('https://media.onlyworlds.com/u/w/x.png');
  const sent = Object.keys(calls[0]?.body ?? {});
  if (!bodyProps) gap('the document has no request body for POST /api/v2/media/remove-ticket — what removal sends is unchecked');
  else {
    const extra = sent.filter((k) => !(k in bodyProps));
    if (!sent.length) bad('createRemovalTicket sends no body; the document expects one');
    else if (extra.length) bad(`createRemovalTicket sends ${extra.join(', ')}, which the document's body does not have`);
    else if (calls[0].body.key !== 'u/w/x.png') bad(`createRemovalTicket turned an image_url into key ${JSON.stringify(calls[0].body.key)}, not the object key`);
    else ok();
  }
  let sdkKeys = null;
  for (const rel of ['dist/index.d.ts', 'dist/v2/types.d.ts']) {
    const f = join(SDK_DIR, rel);
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/interface OwRemovalTicket \{([\s\S]*?)\n\}/);
    if (m) { sdkKeys = [...m[1].matchAll(/^\s{4}(\w+)\??:/gm)].map((x) => x[1]); break; }
  }
  if (!doc200?.properties) gap('the document has no 200 schema for POST /api/v2/media/remove-ticket — removal ticket fields unchecked');
  else if (!sdkKeys?.length) gap(`could not read OwRemovalTicket from ${SDK_DIR}/dist — removal ticket fields unchecked`);
  else {
    const docKeys = Object.keys(doc200.properties);
    const extra = sdkKeys.filter((k) => !docKeys.includes(k));
    const missing = (doc200.required ?? docKeys).filter((k) => !sdkKeys.includes(k));
    if (extra.length) bad(`OwRemovalTicket declares ${extra.join(', ')}, which the document's removal ticket does not have`);
    if (missing.length) bad(`the document's removal ticket has ${missing.join(', ')}, which OwRemovalTicket does not declare`);
    if (!extra.length && !missing.length) ok();
  }
}

// ---- 5f: the feed page and the bulk result against the document (2026-10-12) -------
// Until 2026-10-12 the document gave no schema for /changes or /bulk and this gate named both as
// blind spots. Now it does, so the SDK's types are held to it: every property the document
// requires is declared, and the SDK declares nothing the document lacks except the keys it adds
// itself from headers (named below). Where the document still gives none, the blind spot is named.

function sdkInterfaceKeys(name) {
  for (const rel of ['dist/index.d.ts', 'dist/v2/types.d.ts']) {
    const f = join(SDK_DIR, rel);
    if (!existsSync(f)) continue;
    // `interface X extends Y {` carries Y's keys too (OwCreatedWorldLink extends OwWorldLink)
    const m = readFileSync(f, 'utf8').match(new RegExp(`interface ${name}(?: extends (\\w+))? \\{([\\s\\S]*?)\\n\\}`));
    if (m) {
      const own = [...m[2].matchAll(/^\s{4}(\w+)\??:/gm)].map((x) => x[1]);
      if (!m[1]) return own;
      const parent = sdkInterfaceKeys(m[1]);
      return parent ? [...parent, ...own] : null;
    }
  }
  return null;
}
// `sdkPath` (2026-10-26) steps into a declaration as the .d.ts prints it, so an object the SDK types
// inline (usage: { ... }, roster?: Array<{ ... }>) is held where it sits. A key's type is a named
// interface, an inline block (4 spaces deeper, closed at the key's own indent), or both joined by `&`
// (Array<OwDraughtItem & { author: ... }>); '[]' steps into Array<...> or ...[], `| null` is dropped.
// Anything else (a Record, an Omit, a primitive) reads null: the pair is then a GAP, never a pass.
function sdkInterfaceBody(name) {
  for (const rel of ['dist/index.d.ts', 'dist/v2/types.d.ts']) {
    const f = join(SDK_DIR, rel);
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`interface ${name}(?: extends (\\w+))? \\{([\\s\\S]*?)\\n\\}`));
    if (m) return { lines: m[2].split(/\r?\n/), indent: 4, parent: m[1] };
  }
  return null;
}
const keyAt = (blk, k) => blk.lines.findIndex((l) => new RegExp(`^ {${blk.indent}}${k}\\??:`).test(l));
function typeNode(blk, i) {
  const head = blk.lines[i].replace(/^\s*\w+\??:\s*/, '');
  let expr = head;
  let block = null;
  if (head.endsWith('{')) {
    const close = blk.lines.findIndex((l, j) => j > i && l.startsWith(' '.repeat(blk.indent) + '}'));
    if (close < 0) return null;
    block = { lines: blk.lines.slice(i + 1, close), indent: blk.indent + 4 };
    expr = head.slice(0, -1) + '@' + blk.lines[close].trim().slice(1);
  }
  expr = expr.replace(/;$/, '').replace(/\s*\|\s*null$/, '').trim();
  const arr = expr.match(/^Array<(.*)>$/) ?? expr.match(/^\(?(.*?)\)?\[\]$/);
  if (arr) expr = arr[1].trim();
  const parts = expr.split(/\s*&\s*/).map((t) => (t === '@' ? { block } : /^[A-Z]\w*$/.test(t) ? { named: t } : null));
  return parts.every(Boolean) ? { parts, array: !!arr } : null;
}
function blocksOf(node) {
  const out = [];
  for (const p of node.parts) {
    if (p.block) { out.push(p.block); continue; }
    for (let n = p.named; n;) { const b = sdkInterfaceBody(n); if (!b) return null; out.push(b); n = b.parent; }
  }
  return out;
}
// The declaration blocks a pair's SDK side lands in (its interface, the parents it extends, an inline
// block); 5f reads their keys, 5x the type each key is declared with.
function sdkPathBlocks(name, steps) {
  let node = { parts: [{ named: name }], array: false };
  for (const step of steps) {
    if (step === '[]') { if (!node.array) return null; node = { ...node, array: false }; continue; }
    if (node.array) return null;
    const blk = blocksOf(node)?.find((b) => keyAt(b, step) >= 0);
    node = blk && typeNode(blk, keyAt(blk, step));
    if (!node) return null;
  }
  return (!node.array && blocksOf(node)) || null;
}
function sdkPathKeys(name, steps) {
  const blocks = sdkPathBlocks(name, steps);
  if (!blocks) return null;
  return [...new Set(blocks.flatMap((b) => b.lines.map((l) => l.match(new RegExp(`^ {${b.indent}}(\\w+)\\??:`))?.[1]).filter(Boolean)))];
}
// `at` reads an answer schema written inline on its route (method, path, status), as keel gives
// ask, sort, the join preview and the allowance (2026-10-14); `doc` names a component.
// The strand's five object slots, each `{id, name}` or null (strand profile; `same` is the sixth, a boolean).
const STRAND_SLOTS = ['narrative', 'event', 'location', 'character', 'now'];
const SCHEMA_PAIRS = [
  { sdk: 'OwChangesPage', doc: 'ChangesPage', route: 'GET /changes', clientOnly: [] },
  // the feed's items, one level down (2026-10-15: change_seq was required on both and the SDK's
  // type never named it; the agent declaration adds deleted_by/deleted_via). `variant` picks the oneOf by op.
  // An SDK before 4.26.0 has no named variant types: named as a blind spot, not passed.
  { sdk: 'OwChangeUpsert', doc: 'ChangesPage', variant: ['changes', 'upsert'], route: 'GET /changes (an upsert item)', clientOnly: [] },
  { sdk: 'OwChangeDelete', doc: 'ChangesPage', variant: ['changes', 'delete'], route: 'GET /changes (a delete item)', clientOnly: [] },
  // the world body: 5c held World against WorldPatch and the client's PATCH, never the SDK's own type
  // (agent_narrator_rule passed unseen); now the type is held to World as well
  { sdk: 'OwWorldMeta', doc: 'World', route: 'GET /world', clientOnly: [] },
  { sdk: 'OwBulkResponse', doc: 'BulkResult', route: 'POST /bulk', clientOnly: ['wasReplay'] },
  // The proposals (4.58.0): the proposal row, its page and the 202 body; an SDK before 4.58.0 names none of them
  { sdk: 'OwProposal', doc: 'Proposal', route: 'POST /{type}/{id}/proposals', clientOnly: [], needs: 'propose' },
  { sdk: 'OwProposalList', doc: 'ProposalList', route: 'GET /world/proposals', clientOnly: [], needs: 'worldProposals' },
  // The queue (4.66.0): its own page type, and its new-element row (the items' oneOf, picked by kind)
  { sdk: 'OwWorldProposalList', doc: 'ProposalList', route: 'GET /world/proposals (the queue)', clientOnly: [], needs: 'reviewNewElement' },
  { sdk: 'OwProposedNewElement', doc: 'ProposalList', items: 'data', kindOf: 'new_element', route: 'GET /world/proposals (a new_element row)', clientOnly: [], needs: 'reviewNewElement' },
  { sdk: 'OwProposed', doc: 'Proposed', route: 'PATCH /{type}/{id} (202)', clientOnly: [], needs: 'propose' },
  // the draught: 4.47.0 to 4.66.0 typed a row as the element spread onto it, while keel nests
  // it under `element`; nothing held the type to the document's Draught, so row.name compiled and read
  // undefined (found when the draught gained proposed rows, SDK 4.67.0). The packet, a plain row, and a proposed row.
  { sdk: 'OwDraught', doc: 'Draught', route: 'GET /character/{id}/context', clientOnly: [], needs: 'draught' },
  // OwDraughtItem is one row type for every section; the document lists each section's row exactly.
  // `knowledge` carries every key a row can (dated, circles); a proposed row is held with those two
  // named as the shared type's, optional there and absent from the proposed section's row.
  { sdk: 'OwDraughtItem', doc: 'Draught', items: 'knowledge', route: 'GET /character/{id}/context (a knowledge row)', clientOnly: [], needs: 'draught' },
  { sdk: 'OwDraughtItem', doc: 'Draught', items: 'proposed', route: 'GET /character/{id}/context (a proposed row)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  // The draught's lenses frame and the world's lenses (keel's lens reader): needs names the method that marks the SDK
  // version carrying them; the frame came with setMyLenses.
  { sdk: 'OwDraughtLens', doc: 'Draught', items: 'lenses', route: 'GET /character/{id}/context (a lenses frame)', clientOnly: [], needs: 'setMyLenses' },
  { sdk: 'OwWorldLenses', at: ['get', '/api/v2/world/{world_id}/lenses', '200'], route: 'GET /world/{id}/lenses', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwWorldLens', at: ['get', '/api/v2/world/{world_id}/lenses', '200'], items: 'data', route: 'GET /world/{id}/lenses (a lens)', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwWorldLens', sdkPath: ['x_lens'], at: ['get', '/api/v2/world/{world_id}/lenses', '200'], path: ['data', '[]', 'x_lens'], route: 'GET /world/{id}/lenses (a lens\'s x_lens)', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwWorldLens', sdkPath: ['health'], at: ['get', '/api/v2/world/{world_id}/lenses', '200'], path: ['data', '[]', 'health'], route: 'GET /world/{id}/lenses (a lens\'s health)', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwWorldLens', sdkPath: ['title_seats', '[]'], at: ['get', '/api/v2/world/{world_id}/lenses', '200'], path: ['data', '[]', 'title_seats', '[]'], route: 'GET /world/{id}/lenses (a lens\'s title seat)', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwWorldLensReading', at: ['get', '/api/v2/world/{world_id}/lenses', '200'], path: ['data', '[]', 'reading'], route: 'GET /world/{id}/lenses (a lens\'s reading)', clientOnly: [], needs: 'worldLenses' },
  { sdk: 'OwAskAnswer', at: ['post', '/api/v2/account/ask', '200'], route: 'POST /account/ask', clientOnly: [] },
  { sdk: 'OwSortAnswer', at: ['post', '/api/v2/account/sort', '200'], route: 'POST /account/sort', clientOnly: [] },
  { sdk: 'OwJoinPreview', at: ['post', '/api/v2/join/preview', '200'], route: 'POST /join/preview', clientOnly: [] },
  { sdk: 'OwAllowance', at: ['get', '/api/v2/account/allowance', '200'], route: 'GET /account/allowance', clientOnly: [], needs: 'allowance' },
  // The AI door: a use as listed, and each use's answer with its meter. wasReplay is the
  // client's, read from the Idempotent-Replay header.
  { sdk: 'OwAiUse', at: ['get', '/api/v2/account/ai', '200'], items: 'uses', route: 'GET /account/ai (a use)', clientOnly: [], needs: 'aiUses' },
  { sdk: 'OwAiAskAnswer', at: ['post', '/api/v2/account/ai/ask', '200'], route: 'POST /account/ai/ask', clientOnly: ['wasReplay'], needs: 'ai' },
  { sdk: 'OwAiSortAnswer', at: ['post', '/api/v2/account/ai/sort', '200'], route: 'POST /account/ai/sort', clientOnly: ['wasReplay'], needs: 'ai' },
  { sdk: 'OwAllowance', sdkPath: ['own_key'], at: ['get', '/api/v2/account/allowance', '200'], path: ['own_key'], route: 'GET /account/allowance (own_key)', clientOnly: [], needs: 'allowance' },
  { sdk: 'OwJoinedMembership', at: ['post', '/api/v2/account/join', '201'], route: 'POST /account/join', clientOnly: [], needs: 'acceptJoin' },
  // The made world's 201 got its schema, AccountWorldCreated; the SDK typed it from the handler (4.66.0)
  { sdk: 'OwCreatedAccountWorld', at: ['post', '/api/v2/account/worlds', '201'], route: 'POST /account/worlds', clientOnly: [], needs: 'createAccountWorld' },
  // POST /join's two answers: a oneOf told apart by `kind`, each held to its own type
  { sdk: 'OwPlayerJoined', at: ['post', '/api/v2/join', '201'], kindOf: 'player', route: 'POST /join (player)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwAgentJoined', at: ['post', '/api/v2/join', '201'], kindOf: 'agent', route: 'POST /join (agent)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwMe', at: ['get', '/api/v2/me', '200'], route: 'GET /me', clientOnly: [], needs: 'me' },
  // inside the front door (2026-10-26: OwMe was held by its top-level keys alone, so my_seats arrived
  // in the document and 4.81.1 passed without it)
  { sdk: 'OwFrontDoor', at: ['get', '/api/v2/me', '200'], path: ['front_door'], route: 'GET /me (front_door)', clientOnly: [], needs: 'me' },
  { sdk: 'OwMySeat', at: ['get', '/api/v2/me', '200'], path: ['front_door', 'my_seats', '[]'], route: 'GET /me (front_door.my_seats)', clientOnly: [], needs: 'me' },
  { sdk: 'OwFrontDoorCharter', at: ['get', '/api/v2/me', '200'], path: ['front_door', 'charter_element'], route: 'GET /me (front_door.charter_element)', clientOnly: [], needs: 'me' },
  { sdk: 'OwFrontDoorSkill', at: ['get', '/api/v2/me', '200'], path: ['front_door', 'charter_skill_elements', '[]'], route: 'GET /me (front_door.charter_skill_elements)', clientOnly: [], needs: 'me' },
  // the reading aids beside the front door (serial 83, SDK 4.100.0): the packet and its four nested objects, on both routes
  // and the strand fourth (serial 100, SDK 4.121.0): the served packet is OwServedReadingAids, charterOf's three plus `strand`, strandOf's six
  { sdk: 'OwServedReadingAids', at: ['get', '/api/v2/me', '200'], path: ['reading_aids'], route: 'GET /me: reading_aids', clientOnly: [], needs: 'me' },
  { sdk: 'OwStrand', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'strand'], route: 'GET /me: reading_aids.strand', clientOnly: [], needs: 'me' },
  ...STRAND_SLOTS.map((s) => ({ sdk: 'OwStrandSlot', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'strand', s], route: `GET /me: reading_aids.strand.${s}`, clientOnly: [], needs: 'me' })),
  { sdk: 'OwReadingAidsCharter', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'charter'], route: 'GET /me: reading_aids.charter', clientOnly: [], needs: 'me' },
  { sdk: 'OwReadingAidsGuide', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'guide'], route: 'GET /me: reading_aids.guide', clientOnly: [], needs: 'me' },
  { sdk: 'OwReadingAidsDomain', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'domains', '[]'], route: 'GET /me: reading_aids.domains', clientOnly: [], needs: 'me' },
  { sdk: 'OwReadingAidsHub', at: ['get', '/api/v2/me', '200'], path: ['reading_aids', 'domains', '[]', 'hubs', '[]'], route: 'GET /me: reading_aids.domains[].hubs', clientOnly: [], needs: 'me' },
  { sdk: 'OwServedReadingAids', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids'], route: 'POST /join (agent): reading_aids', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwStrand', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'strand'], route: 'POST /join (agent): reading_aids.strand', clientOnly: [], needs: 'redeemJoin' },
  ...STRAND_SLOTS.map((s) => ({ sdk: 'OwStrandSlot', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'strand', s], route: `POST /join (agent): reading_aids.strand.${s}`, clientOnly: [], needs: 'redeemJoin' })),
  { sdk: 'OwReadingAidsCharter', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'charter'], route: 'POST /join (agent): reading_aids.charter', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwReadingAidsGuide', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'guide'], route: 'POST /join (agent): reading_aids.guide', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwReadingAidsDomain', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'domains', '[]'], route: 'POST /join (agent): reading_aids.domains', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwReadingAidsHub', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'reading_aids', 'domains', '[]', 'hubs', '[]'], route: 'POST /join (agent): reading_aids.domains[].hubs', clientOnly: [], needs: 'redeemJoin' },
  // members() returns the rows: OwMember is held to one item of the answer's `data`
  { sdk: 'OwMember', at: ['get', '/api/v2/members', '200'], items: 'data', route: 'GET /members', clientOnly: [], needs: 'members' },
  // a world's invite links: the created link with its code, and one row of the list
  { sdk: 'OwCreatedWorldLink', at: ['post', '/api/v2/account/worlds/{world_id}/links', '201'], route: 'POST /account/worlds/{id}/links', clientOnly: [], needs: 'createWorldLink' },
  { sdk: 'OwWorldLink', at: ['get', '/api/v2/account/worlds/{world_id}/links', '200'], items: 'data', route: 'GET /account/worlds/{id}/links', clientOnly: [], needs: 'listWorldLinks' },
  // seats for your own AI: the made seat with its key, and one row of the list
  { sdk: 'OwSeatCreated', at: ['post', '/api/v2/account/worlds/{world_id}/seats', '201'], route: 'POST /account/worlds/{id}/seats', clientOnly: [], needs: 'createSeat' },
  { sdk: 'OwSeat', at: ['get', '/api/v2/account/worlds/{world_id}/seats', '200'], items: 'data', route: 'GET /account/worlds/{id}/seats', clientOnly: [], needs: 'listSeats' },
  // a world key: the mint's answer with the key once, and the lost mint's lookup, its row without the key
  { sdk: 'OwMintedKey', at: ['post', '/api/v2/account/worlds/{world_id}/keys', '201'], route: 'POST /account/worlds/{id}/keys', clientOnly: [], needs: 'mintWorldKey' },
  { sdk: 'OwWorldKeyRow', at: ['get', '/api/v2/account/worlds/{world_id}/keys/made', '200'], route: 'GET /account/worlds/{id}/keys/made', clientOnly: [], needs: 'madeWorldKey' },
  { sdk: 'OwWorldKeyMember', at: ['post', '/api/v2/account/worlds/{world_id}/keys', '201'], path: ['member'], route: 'POST /account/worlds/{id}/keys (member)', clientOnly: [], needs: 'mintWorldKey' },
  { sdk: 'OwWorldKeyMember', at: ['get', '/api/v2/account/worlds/{world_id}/keys/made', '200'], path: ['member'], route: 'GET /account/worlds/{id}/keys/made (member)', clientOnly: [], needs: 'madeWorldKey' },
  // the account's tokens (SDK 4.122.0): GET /account/tokens' rows, each held to OwAccountToken
  { sdk: 'OwAccountToken', at: ['get', '/api/v2/account/tokens', '200'], items: 'data', route: 'GET /account/tokens', clientOnly: [], needs: 'listAccountTokens' },
  // the AI door token's mint (SDK 4.138.0): the row with its token, held to OwMintedAiToken
  { sdk: 'OwMintedAiToken', at: ['post', '/api/v2/account/tokens', '201'], route: 'POST /account/tokens (ai_uses)', clientOnly: [], needs: 'mintAiToken' },
  // a row's lenses: PATCH members with `lenses` alone answers MemberLenses, not the roster row:
  // the 200 is a oneOf with no kind to tell its branches apart, so the pair picks the branch by its $ref
  { sdk: 'OwMemberLenses', at: ['patch', '/api/v2/account/worlds/{world_id}/members/{member_id}', '200'], refOf: 'MemberLenses', route: 'PATCH /account/worlds/{id}/members/{member_id}', clientOnly: [], needs: 'setMemberLenses' },
  { sdk: 'OwSeatCreated', at: ['post', '/api/v2/account/worlds/{world_id}/seats/{seat_id}/key', '201'], route: 'POST /account/worlds/{id}/seats/{seat_id}/key', clientOnly: [], needs: 'rekeySeat' },
  // files on elements: the per-element routes are one schema for all 22 types, read at
  // character's; a row, its added_by (`prop`: one level into the row), the world's list, the ticket, the link
  { sdk: 'OwFileRow', at: ['get', '/api/v2/character/{id}/files', '200'], items: 'data', route: 'GET /{type}/{id}/files', clientOnly: [], needs: 'listFiles' },
  { sdk: 'OwFileAddedBy', at: ['get', '/api/v2/character/{id}/files', '200'], items: 'data', prop: 'added_by', route: 'GET /{type}/{id}/files (added_by)', clientOnly: [], needs: 'listFiles' },
  { sdk: 'OwWorldFiles', at: ['get', '/api/v2/world/files', '200'], route: 'GET /world/files', clientOnly: [], needs: 'worldFiles' },
  // search: the answer and one result row
  { sdk: 'OwSearchResults', at: ['get', '/api/v2/search', '200'], route: 'GET /search', clientOnly: [], needs: 'search' },
  { sdk: 'OwSearchResult', at: ['get', '/api/v2/search', '200'], items: 'results', route: 'GET /search (a result)', clientOnly: [], needs: 'search' },
  { sdk: 'OwWorldFileRow', at: ['get', '/api/v2/world/files', '200'], items: 'data', route: 'GET /world/files (a row)', clientOnly: [], needs: 'worldFiles' },
  { sdk: 'OwFileTicket', at: ['post', '/api/v2/character/{id}/files', '201'], route: 'POST /{type}/{id}/files', clientOnly: [], needs: 'createFileTicket' },
  { sdk: 'OwFileDownload', at: ['get', '/api/v2/character/{id}/files/{file_id}/download', '200'], route: 'GET /{type}/{id}/files/{file_id}/download', clientOnly: [], needs: 'fileDownloadLink' },
  // ---- the nested objects (2026-10-26): 5n below fails on any the document has that no pair reaches.
  // `sdkPath` reads what the SDK types at that spot; a path step `<kind=x>` picks a oneOf branch.
  { sdk: 'OwWorldPublicPage', doc: 'World', prop: 'public_page', route: 'GET /world (public_page)', clientOnly: [] },
  { sdk: 'OwWorldOrigin', doc: 'World', prop: 'origin', route: 'GET /world (origin)', clientOnly: [] },
  { sdk: 'OwBulkItemResult', doc: 'BulkResult', items: 'items', route: 'POST /bulk (an item)', clientOnly: [] },
  { sdk: 'OwProposal', doc: 'BulkResult', items: 'items', prop: 'proposal', route: 'POST /bulk (an item\'s proposal)', clientOnly: [] },
  // OwErrorBody is the thrown envelope's type, shared with a bulk slot's error: `reason` is the envelope's
  // (Error.error, on resync_required), never a slot's (ruled 2026-10-26, when 5n first held this pair)
  { sdk: 'OwErrorBody', doc: 'BulkResult', items: 'items', prop: 'error', route: 'POST /bulk (an item\'s error)', clientOnly: ['reason'] },
  // an answer_not_parsed's refused answers, declared on every error envelope since 2026-11-10 (a slot's too)
  { sdk: 'OwAiRefusal', doc: 'BulkResult', path: ['items', '[]', 'error', 'refusals', '[]'], route: 'POST /bulk (an item\'s error, its refusals)', clientOnly: [] },
  { sdk: 'OwProposal', doc: 'ProposalList', items: 'data', kindOf: 'proposal', route: 'GET /world/proposals (a proposal row)', clientOnly: [], needs: 'worldProposals' },
  { sdk: 'OwProposal', doc: 'Proposed', prop: 'proposal', route: 'PATCH /{type}/{id} (202, its proposal)', clientOnly: [], needs: 'propose' },
  // each draught section as OwDraught types it; dated and circles are the shared row type's, as for `proposed` above
  { sdk: 'OwDraught', sdkPath: ['world'], doc: 'Draught', prop: 'world', route: 'GET /character/{id}/context (world)', clientOnly: [], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['character'], doc: 'Draught', prop: 'character', route: 'GET /character/{id}/context (character)', clientOnly: [], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['role', '[]'], doc: 'Draught', items: 'role', route: 'GET /character/{id}/context (a role row)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['work', '[]'], doc: 'Draught', items: 'work', route: 'GET /character/{id}/context (a work row)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['style'], doc: 'Draught', prop: 'style', route: 'GET /character/{id}/context (style)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['events', '[]'], doc: 'Draught', items: 'events', route: 'GET /character/{id}/context (an events row)', clientOnly: ['circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['sheet', '[]'], doc: 'Draught', items: 'sheet', route: 'GET /character/{id}/context (a sheet row)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['messages', '[]'], doc: 'Draught', items: 'messages', route: 'GET /character/{id}/context (a messages row)', clientOnly: ['dated', 'circles'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['messages', '[]', 'author'], doc: 'Draught', path: ['messages', '[]', 'author'], route: 'GET /character/{id}/context (a message\'s author)', clientOnly: [], needs: 'draught' },
  // counts rides every reader's GET /world since 2026-10-27; it was named here as keyless-only.
  { sdk: 'OwWorldMeta', sdkPath: ['counts'], doc: 'World', path: ['counts'], route: 'GET /world (counts)', clientOnly: [] },
  { sdk: 'OwDraught', sdkPath: ['room', '[]'], doc: 'Draught', items: 'room', route: 'GET /character/{id}/context (a room row)', clientOnly: ['dated'], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['recent', '[]'], doc: 'Draught', items: 'recent', route: 'GET /character/{id}/context (a recent row)', clientOnly: [], needs: 'draught' },
  { sdk: 'OwDraught', sdkPath: ['roster', '[]'], doc: 'Draught', items: 'roster', route: 'GET /character/{id}/context (a roster row)', clientOnly: [], needs: 'draught' },
  { sdk: 'OwAskAnswer', sdkPath: ['usage'], at: ['post', '/api/v2/account/ask', '200'], prop: 'usage', route: 'POST /account/ask (usage)', clientOnly: [] },
  // a sort row is one object in the document and four row types in the SDK: each is held to it
  { sdk: 'OwSortMakeRow', at: ['post', '/api/v2/account/sort', '200'], items: 'rows', route: 'POST /account/sort (a make row)', clientOnly: [] },
  { sdk: 'OwSortAddToRow', at: ['post', '/api/v2/account/sort', '200'], items: 'rows', route: 'POST /account/sort (an add_to row)', clientOnly: [] },
  { sdk: 'OwSortLinkRow', at: ['post', '/api/v2/account/sort', '200'], items: 'rows', route: 'POST /account/sort (a link row)', clientOnly: [] },
  { sdk: 'OwSortAskRow', at: ['post', '/api/v2/account/sort', '200'], items: 'rows', route: 'POST /account/sort (an ask row)', clientOnly: [] },
  { sdk: 'OwSortMakeRow', sdkPath: ['proposal'], at: ['post', '/api/v2/account/sort', '200'], items: 'rows', prop: 'proposal', route: 'POST /account/sort (a row\'s proposal)', clientOnly: [] },
  { sdk: 'OwSortRef', at: ['post', '/api/v2/account/sort', '200'], items: 'rows', prop: 'target', route: 'POST /account/sort (a row\'s target)', clientOnly: [] },
  { sdk: 'OwSortRef', at: ['post', '/api/v2/account/sort', '200'], path: ['rows', '[]', 'candidates', '[]'], route: 'POST /account/sort (a candidate)', clientOnly: [] },
  { sdk: 'OwSortAnswer', sdkPath: ['not_proposed', '[]'], at: ['post', '/api/v2/account/sort', '200'], items: 'not_proposed', route: 'POST /account/sort (a not_proposed row)', clientOnly: [] },
  { sdk: 'OwSortAnswer', sdkPath: ['usage'], at: ['post', '/api/v2/account/sort', '200'], prop: 'usage', route: 'POST /account/sort (usage)', clientOnly: [] },
  // The AI door's two uses answer what the old routes answer: the same row types, held at the door's routes.
  { sdk: 'OwAskAnswer', sdkPath: ['usage'], at: ['post', '/api/v2/account/ai/ask', '200'], prop: 'usage', route: 'POST /account/ai/ask (usage)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortMakeRow', at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', route: 'POST /account/ai/sort (a make row)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortAddToRow', at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', route: 'POST /account/ai/sort (an add_to row)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortLinkRow', at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', route: 'POST /account/ai/sort (a link row)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortAskRow', at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', route: 'POST /account/ai/sort (an ask row)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortMakeRow', sdkPath: ['proposal'], at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', prop: 'proposal', route: 'POST /account/ai/sort (a row\'s proposal)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortRef', at: ['post', '/api/v2/account/ai/sort', '200'], items: 'rows', prop: 'target', route: 'POST /account/ai/sort (a row\'s target)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortRef', at: ['post', '/api/v2/account/ai/sort', '200'], path: ['rows', '[]', 'candidates', '[]'], route: 'POST /account/ai/sort (a candidate)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortAnswer', sdkPath: ['not_proposed', '[]'], at: ['post', '/api/v2/account/ai/sort', '200'], items: 'not_proposed', route: 'POST /account/ai/sort (a not_proposed row)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwSortAnswer', sdkPath: ['usage'], at: ['post', '/api/v2/account/ai/sort', '200'], prop: 'usage', route: 'POST /account/ai/sort (usage)', clientOnly: [], needs: 'ai' },
  { sdk: 'OwJoinPreview', sdkPath: ['world'], at: ['post', '/api/v2/join/preview', '200'], prop: 'world', route: 'POST /join/preview (world)', clientOnly: [] },
  { sdk: 'OwJoinPreview', sdkPath: ['characters', '[]'], at: ['post', '/api/v2/join/preview', '200'], items: 'characters', route: 'POST /join/preview (a character)', clientOnly: [] },
  { sdk: 'OwCreatedAccountWorld', sdkPath: ['keys', '[]'], at: ['post', '/api/v2/account/worlds', '201'], items: 'keys', route: 'POST /account/worlds (a key)', clientOnly: [], needs: 'createAccountWorld' },
  { sdk: 'OwAgentJoined', sdkPath: ['world'], at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'world'], route: 'POST /join (agent: world)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwAgentJoined', sdkPath: ['seat'], at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'seat'], route: 'POST /join (agent: seat)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwAgentJoined', sdkPath: ['character'], at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'character'], route: 'POST /join (agent: character)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwFrontDoor', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'front_door'], route: 'POST /join (agent: front_door)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwFrontDoor', sdkPath: ['sponsor'], at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'front_door', 'sponsor'], route: 'POST /join (agent: front_door.sponsor)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwMySeat', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'front_door', 'my_seats', '[]'], route: 'POST /join (agent: front_door.my_seats)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwFrontDoorCharter', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'front_door', 'charter_element'], route: 'POST /join (agent: front_door.charter_element)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwFrontDoorSkill', at: ['post', '/api/v2/join', '201'], path: ['<kind=agent>', 'front_door', 'charter_skill_elements', '[]'], route: 'POST /join (agent: front_door.charter_skill_elements)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwPlayerJoined', sdkPath: ['world'], at: ['post', '/api/v2/join', '201'], path: ['<kind=player>', 'world'], route: 'POST /join (player: world)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwPlayerJoined', sdkPath: ['character'], at: ['post', '/api/v2/join', '201'], path: ['<kind=player>', 'character'], route: 'POST /join (player: character)', clientOnly: [], needs: 'redeemJoin' },
  { sdk: 'OwMe', sdkPath: ['world'], at: ['get', '/api/v2/me', '200'], prop: 'world', route: 'GET /me (world)', clientOnly: [], needs: 'me' },
  { sdk: 'OwMe', sdkPath: ['front_door', 'sponsor'], at: ['get', '/api/v2/me', '200'], path: ['front_door', 'sponsor'], route: 'GET /me (front_door.sponsor)', clientOnly: [], needs: 'me' },
  { sdk: 'OwCreatedWorldLink', sdkPath: ['character'], at: ['post', '/api/v2/account/worlds/{world_id}/links', '201'], prop: 'character', route: 'POST /account/worlds/{id}/links (character)', clientOnly: [], needs: 'createWorldLink' },
  { sdk: 'OwCreatedWorldLink', sdkPath: ['characters', '[]'], at: ['post', '/api/v2/account/worlds/{world_id}/links', '201'], items: 'characters', route: 'POST /account/worlds/{id}/links (a character)', clientOnly: [], needs: 'createWorldLink' },
  { sdk: 'OwWorldLink', sdkPath: ['character'], at: ['get', '/api/v2/account/worlds/{world_id}/links', '200'], path: ['data', '[]', 'character'], route: 'GET /account/worlds/{id}/links (a row\'s character)', clientOnly: [], needs: 'listWorldLinks' },
  { sdk: 'OwWorldLink', sdkPath: ['characters', '[]'], at: ['get', '/api/v2/account/worlds/{world_id}/links', '200'], path: ['data', '[]', 'characters', '[]'], route: 'GET /account/worlds/{id}/links (a row\'s character choice)', clientOnly: [], needs: 'listWorldLinks' },
  { sdk: 'OwSeatCreated', sdkPath: ['world'], at: ['post', '/api/v2/account/worlds/{world_id}/seats', '201'], prop: 'world', route: 'POST /account/worlds/{id}/seats (world)', clientOnly: [], needs: 'createSeat' },
  { sdk: 'OwSeatCreated', sdkPath: ['seat'], at: ['post', '/api/v2/account/worlds/{world_id}/seats', '201'], prop: 'seat', route: 'POST /account/worlds/{id}/seats (seat)', clientOnly: [], needs: 'createSeat' },
  { sdk: 'OwSeatCreated', sdkPath: ['world'], at: ['post', '/api/v2/account/worlds/{world_id}/seats/{seat_id}/key', '201'], prop: 'world', route: 'POST /account/worlds/{id}/seats/{seat_id}/key (world)', clientOnly: [], needs: 'rekeySeat' },
  { sdk: 'OwSeatCreated', sdkPath: ['seat'], at: ['post', '/api/v2/account/worlds/{world_id}/seats/{seat_id}/key', '201'], prop: 'seat', route: 'POST /account/worlds/{id}/seats/{seat_id}/key (seat)', clientOnly: [], needs: 'rekeySeat' },
  { sdk: 'OwFileAddedBy', at: ['get', '/api/v2/world/files', '200'], items: 'data', prop: 'added_by', route: 'GET /world/files (a row\'s added_by)', clientOnly: [], needs: 'worldFiles' },
  { sdk: 'OwFileTicket', sdkPath: ['issued_to'], at: ['post', '/api/v2/character/{id}/files', '201'], prop: 'issued_to', route: 'POST /{type}/{id}/files (issued_to)', clientOnly: [], needs: 'createFileTicket' },
];
// The nested objects no pair holds, each with why (5n). A path here that the document no longer has is
// a GAP too, so the list cannot rot.
const NESTED_NAMED = {
  'PATCH /account/worlds/{world_id}/members/{member_id} 200<0>': 'the roster row a role, Character or sponsor change answers (AccountMember); the SDK sends only lenses alone, held at <1> as OwMemberLenses',
  'POST /account/sort 200.rows[].then': "typed Omit<OwSortAddToRow | OwSortLinkRow, 'source_line' | 'target'>; those row types are held to rows[]",
  'POST /account/ai/sort 200.rows[].then': "typed Omit<OwSortAddToRow | OwSortLinkRow, 'source_line' | 'target'>; those row types are held to rows[]",
  'GET /account/ai 200': 'the {uses} wrapper: aiUses() returns the array, whose rows OwAiUse holds',
  'POST /join 201<kind=agent>.members[]': 'typed Array<Record<string, unknown>>: the rows are left untyped',
  'GET /members 200': 'members() returns the rows (OwMember[], held at data[]); the page is never typed',
  'GET /account/worlds/{world_id}/links 200': 'listWorldLinks() returns the rows (OwWorldLink[], held at data[]); the page is never typed',
  'GET /account/worlds/{world_id}/seats 200': 'listSeats() returns the rows (OwSeat[], held at data[]); the page is never typed',
  'GET /account/tokens 200': 'listAccountTokens() returns the rows (OwAccountToken[], held at data[]); the page is never typed',
  'GET /character/{id}/files 200': 'listFiles() returns the rows (OwFileRow[], held at data[]); the page is never typed',
};
const derefSchema = (s) => {
  const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/);
  return ref ? doc.components?.schemas?.[ref[1]] : s;
};
const answerSchema = ([method, path, status]) => {
  const s = paths[path]?.[method]?.responses?.[status]?.content?.['application/json']?.schema;
  const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/);
  return ref ? doc.components?.schemas?.[ref[1]] : s;
};
// a nullable object (oneOf/anyOf of one object and null, as the draught's character) is that object
const solid = (s) => {
  s = derefSchema(s);
  const alts = [...(s?.oneOf ?? []), ...(s?.anyOf ?? [])].filter((a) => a?.type !== 'null');
  return s && !s.properties && alts.length === 1 ? solid(alts[0]) : s;
};
// `kind` as a const (POST /join) or a one-value enum (ProposalList's rows)
const constOf = (o, key) => { const k = derefSchema(o)?.properties?.[key]; return k?.const ?? (k?.enum?.length === 1 ? k.enum[0] : undefined); };
// Where a pair lands, as 5n names a nested object: the root, then `.key`, `[]` for a list's rows,
// `<kind=x>` / `<op=x>` for a oneOf branch. A route root is its method, path and status.
const rootOf = (p) => (p.at ? `${p.at[0].toUpperCase()} ${p.at[1].replace(/^\/api\/v2/, '')} ${p.at[2]}` : p.doc);
const reachOf = (p) => rootOf(p) + (p.items ? `.${p.items}[]` : '') + (p.prop ? `.${p.prop}` : '')
  + (p.path ?? []).map((s) => (s === '[]' || s.startsWith('<') ? s : `.${s}`)).join('')
  + (p.variant ? `.${p.variant[0]}[]<op=${p.variant[1]}>` : '') + (p.kindOf ? `<kind=${p.kindOf}>` : '')
  + (p.branchAt !== undefined ? `<${p.branchAt}>` : '');
const schemaBlind = [];
const pairsRun = [];
// The pairs above hold the document's `required` keys; an optional key keel adds to an answer (GET /me's
// x_served_trimmed) passed unseen. Each optional key must be declared by some SDK type held at the same
// place: several types at one place share it (the four sort rows split one flat row schema by kind, each
// declaring its own kind's keys). A key the SDK leaves untyped on purpose is named here with its reason.
const optionalAt = {};
const OPTIONAL_NAMED = {};
const pairSides = []; // each pair run: its document schema and SDK blocks, for 5x
for (const p of SCHEMA_PAIRS) {
  // a pair for a method this SDK does not have yet: nothing to hold, and the account-routes line names the route
  if (p.needs && typeof OwV2Client.prototype[p.needs] !== 'function') continue;
  pairsRun.push(p);
  if (p.doc === undefined) p.doc = `${p.route}'s ${p.at[2]} answer`;
  let docSchema = p.at ? answerSchema(p.at) : doc.components?.schemas?.[p.doc];
  // a list's rows may be a $ref of their own (SeatList's data is SeatRow)
  if (p.items) docSchema = solid(docSchema?.properties?.[p.items]?.items);
  if (p.prop) docSchema = solid(docSchema?.properties?.[p.prop]);
  // `path` walks down any depth: a key into its properties, '[]' into a list's rows (front_door.my_seats),
  // `<kind=x>` into the oneOf branch of that kind (POST /join's agent answer)
  for (const step of p.path ?? []) {
    const branch = step.match(/^<kind=(.+)>$/)?.[1];
    docSchema = solid(branch ? docSchema?.oneOf?.find((o) => constOf(o, 'kind') === branch)
      : step === '[]' ? docSchema?.items : docSchema?.properties?.[step]);
  }
  if (p.variant) docSchema = docSchema?.properties?.[p.variant[0]]?.items?.oneOf?.find((o) => o.properties?.op?.const === p.variant[1]);
  if (p.kindOf) docSchema = derefSchema(docSchema?.oneOf?.find((o) => constOf(o, 'kind') === p.kindOf));
  // `refOf` picks the oneOf branch whose $ref names that schema; the walk labels it by its place (`<i>`)
  if (p.refOf) {
    const alts = docSchema?.oneOf ?? [];
    p.branchAt = alts.findIndex((o) => typeof o?.$ref === 'string' && o.$ref.endsWith(`/${p.refOf}`));
    docSchema = p.branchAt >= 0 ? derefSchema(alts[p.branchAt]) : undefined;
  }
  const sdkName = p.sdk + (p.sdkPath ?? []).map((s) => (s === '[]' ? s : `.${s}`)).join('');
  const sdkKeys = p.sdkPath ? sdkPathKeys(p.sdk, p.sdkPath) : sdkInterfaceKeys(p.sdk);
  if (!docSchema?.properties) { schemaBlind.push(`${p.route} (no ${p.doc} schema)`); continue; }
  if (p.variant && !sdkKeys) { schemaBlind.push(`${p.route} (this SDK names no ${p.sdk} type)`); continue; }
  if (!sdkKeys) { gap(`could not read ${sdkName} from ${SDK_DIR}/dist — ${p.route}'s fields unchecked`); continue; }
  const docKeys = Object.keys(docSchema.properties);
  const missing = (docSchema.required ?? docKeys).filter((k) => !sdkKeys.includes(k));
  const extra = sdkKeys.filter((k) => !docKeys.includes(k) && !p.clientOnly.includes(k));
  const optional = docKeys.filter((k) => !(docSchema.required ?? docKeys).includes(k));
  if (optional.length) (optionalAt[reachOf(p)] ??= []).push({ sdkName, optional, sdkKeys });
  pairSides.push({ p, sdkName, docSchema, blocks: sdkPathBlocks(p.sdk, p.sdkPath ?? []) });
  if (missing.length) bad(`the document's ${reachOf(p)} has ${missing.join(', ')}, which ${sdkName} does not declare`);
  if (extra.length) bad(`${sdkName} declares ${extra.join(', ')}, which the document's ${reachOf(p)} does not have`);
  if (!missing.length && !extra.length) ok();
}
for (const [at, held] of Object.entries(optionalAt)) {
  const declared = new Set(held.flatMap((h) => h.sdkKeys));
  const lacking = [...new Set(held.flatMap((h) => h.optional))].filter((k) => !declared.has(k) && !(k in (OPTIONAL_NAMED[at] ?? {})));
  if (lacking.length) bad(`the document's ${at} may carry ${lacking.join(', ')}, which ${[...new Set(held.map((h) => h.sdkName))].join(' / ')} does not declare`);
  else ok();
}

// ---- 5x: an answer field the document leaves untyped is `unknown` in the SDK (2026-11-11) -----
// 5f holds keys, never their types. keel served a queue row's `evidence` and `expires` as stored,
// any JSON value, with no `type` in the schema; the SDK still said `string | null` and every run passed
// (found 2026-11-11; fixed in 4.156.0). Here: (a) at every 5f pair, a key the document leaves
// untyped (no type, $ref, properties, items, enum, const or not, and no typed alternative) is declared
// `unknown`; (b) the accept's 409 `stale_proposal` rows, an error body no 5f pair walks (5n would ask
// for the envelope and `current` too), are held to OwProposalConflict per type, keys both ways and
// types as in (a); (c) every untyped field in every answer of the document is found by walking it,
// never listed, and one that (a) and (b) did not hold is a GAP. Not checked: a typed field the SDK
// narrows further (a string the SDK types as a union is 9u's; a number or an object is 3's for elements).
{
  const isUntyped = (s) => {
    s = s && typeof s === 'object' ? s : null;
    if (!s || s.$ref || s.type || s.properties || s.items || s.enum || 'const' in s || 'not' in s) return false;
    const alts = [...(s.oneOf ?? []), ...(s.anyOf ?? []), ...(s.allOf ?? [])].filter((a) => a?.type !== 'null');
    return alts.every(isUntyped);
  };
  const declaredType = (blocks, k) => {
    const b = blocks?.find((x) => keyAt(x, k) >= 0);
    return b ? b.lines[keyAt(b, k)].replace(/^\s*\w+\??:\s*/, '').replace(/;$/, '').trim() : null;
  };
  const held = new Set(); // "the properties object|key", by identity of the object the pair compared
  const ids = new Map();
  const idOf = (o) => { if (!ids.has(o)) ids.set(o, ids.size); return ids.get(o); };
  const holdUntyped = (props, blocks, sdkName, where) => {
    for (const [k, v] of Object.entries(props)) {
      if (!isUntyped(v)) continue;
      held.add(`${idOf(props)}|${k}`);
      const t = declaredType(blocks, k);
      if (t === null) continue; // a key the SDK lacks is 5f's DRIFT already
      if (t === 'unknown') ok();
      else bad(`5x: the document's ${where}.${k} is untyped (any JSON value), and ${sdkName} declares it ${t}`);
    }
  };
  // (a)
  for (const { p, sdkName, docSchema, blocks } of pairSides) {
    if (!blocks) { gap(`5x: could not read ${sdkName}'s declaration blocks: its untyped keys unchecked`); continue; }
    holdUntyped(docSchema.properties, blocks, sdkName, reachOf(p));
  }
  // (b)
  if (typeof OwV2Client.prototype.acceptProposal === 'function') {
    const blocks = sdkPathBlocks('OwProposalConflict', []);
    const sdkKeys = sdkPathKeys('OwProposalConflict', []);
    for (const t of ELEMENT_TYPES) {
      const where = `POST /${t}/{id}/proposals/{pid}/accept 409.conflicts[]`;
      // the 409 is the error envelope joined (allOf) with the part that carries `conflicts` and `current`
      const body = paths[`/api/v2/${t}/{id}/proposals/{pid}/accept`]?.post?.responses?.['409']?.content?.['application/json']?.schema;
      const part = [body, ...(body?.allOf ?? [])].map(derefSchema).find((x) => x?.properties?.conflicts);
      const rows = solid(part?.properties?.conflicts?.items);
      if (!rows?.properties) { schemaBlind.push(`${where} (no schema)`); continue; }
      if (!blocks || !sdkKeys) { gap(`5x: could not read OwProposalConflict: ${where} unchecked`); break; }
      const docKeys = Object.keys(rows.properties);
      const missing = docKeys.filter((k) => !sdkKeys.includes(k));
      const extra = sdkKeys.filter((k) => !docKeys.includes(k));
      if (missing.length) bad(`5x: the document's ${where} has ${missing.join(', ')}, which OwProposalConflict does not declare`);
      if (extra.length) bad(`5x: OwProposalConflict declares ${extra.join(', ')}, which the document's ${where} does not have`);
      if (!missing.length && !extra.length) ok();
      holdUntyped(rows.properties, blocks, 'OwProposalConflict', where);
    }
  }
  // (c) every answer of every operation, $refs followed once per path, each part of an allOf on its own
  const found = new Map(); // id|key -> where
  const walk = (s, at, refs) => {
    const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    if (ref) { if (refs.includes(ref)) return; refs = [...refs, ref]; s = schemas[ref]; }
    if (!s || typeof s !== 'object') return;
    for (const [i, a] of [...(s.oneOf ?? []), ...(s.anyOf ?? []), ...(s.allOf ?? [])].entries()) walk(a, `${at}<${i}>`, refs);
    if (s.items) walk(s.items, `${at}[]`, refs);
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      if (isUntyped(v)) { const key = `${idOf(s.properties)}|${k}`; if (!found.has(key)) found.set(key, `${at}.${k}`); }
      walk(v, `${at}.${k}`, refs);
    }
  };
  for (const [path, ops] of Object.entries(paths)) for (const [m, op] of Object.entries(ops ?? {})) {
    for (const [status, r] of Object.entries(op?.responses ?? {})) walk(r?.content?.['application/json']?.schema, `${m.toUpperCase()} ${path.replace(/^\/api\/v2/, '')} ${status}`, []);
  }
  const unheld = [...found].filter(([key]) => !held.has(key)).map(([, where]) => where);
  if (unheld.length) gap(`5x: untyped answer field(s) no pair holds, so the SDK's type for them is unchecked: ${unheld.join(', ')}`);
  else ok();
  console.log(`  5x: ${found.size} untyped answer field(s) in the document, ${found.size - unheld.length} held to an SDK type`);
  // (d) a typed answer field: what the document lets keel send, the SDK's declaration admits. Its JSON kinds
  // (string, number for integer too, boolean, array, object) and null are read from the schema, alternatives
  // and $refs followed; the SDK's from the declaration as printed, an inline block whole to its closing line, an
  // alias followed. A kind or a null the SDK leaves out is DRIFT (11-11: the feed rows' updated_at and deleted_at
  // never null, the cursor never an integer). A declaration this reader cannot place is a GAP unless KIND_NAMED
  // names it. Not checked: an SDK wider than the document, an absent key (5f's required), the shape inside.
  const KIND_NAMED = {
    'OwWriteDoor': "NonNullable<OwElementBase['changed_via']>: the door words, which 9u holds",
  };
  // A field the SDK declares narrower than the document on purpose, with where the narrowing is made true.
  const KIND_OWN = {
    'OwChangesPage.cursor': 'keel answers an owner\'s head read with an integer (core/changes.py); changes() and changesHead() hand it back as String(cursor)',
    'OwMintedAiToken.expires_at': 'the route is shared with full tokens, which never expire; an AI token always carries its expiry (keel accounts/ai_token.py)',
  };
  const ownMet = new Set();
  const dts = ['dist/index.d.ts', 'dist/v2/types.d.ts'].map((r) => join(SDK_DIR, r)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
  const aliasOf = (n) => dts.match(new RegExp(`(?:^|\\n)(?:export )?(?:declare )?type ${n}(?:<[^>]*>)? = ([^;]+);`))?.[1]?.trim();
  const docKinds = (s, refs = []) => {
    const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    if (ref) { if (refs.includes(ref)) return new Set(['object']); refs = [...refs, ref]; s = schemas[ref]; }
    if (!s || typeof s !== 'object') return new Set();
    if (isUntyped(s)) return new Set(['any']);
    const out = new Set();
    for (const t of [].concat(s.type ?? [])) out.add(t === 'integer' ? 'number' : t);
    if (!s.type && s.properties) out.add('object');
    if (s.nullable === true) out.add('null');
    for (const v of s.enum ?? []) out.add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
    if ('const' in s) out.add(s.const === null ? 'null' : typeof s.const);
    for (const a of [...(s.oneOf ?? []), ...(s.anyOf ?? [])]) for (const k of docKinds(a, refs)) out.add(k);
    for (const a of s.allOf ?? []) for (const k of docKinds(a, refs)) if (k !== 'null') out.add(k);
    return out;
  };
  // 5k (2026-11-16): the words a field closed to words may hold (`const` or `enum`, through oneOf/anyOf), or null
  // when any branch takes an open string. A field the SDK declares as ONE string literal is held to them: 9u reads
  // only unions, so `type: 'Law'` passed where the document says `const: 'law'` (front_door.charter_element).
  const docWords = (s, refs = []) => {
    const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    if (ref) { if (refs.includes(ref)) return null; refs = [...refs, ref]; s = schemas[ref]; }
    if (!s || typeof s !== 'object') return null;
    const branches = [...(s.oneOf ?? []), ...(s.anyOf ?? [])];
    if (branches.length) {
      const out = new Set();
      for (const a of branches) {
        if (a?.type === 'null' || (Array.isArray(a?.enum) && a.enum.every((v) => v === null))) continue;
        const w = docWords(a, refs);
        if (w === null) return null;
        for (const x of w) out.add(x);
      }
      return out;
    }
    if (typeof s.const === 'string') return new Set([s.const]);
    if (Array.isArray(s.enum)) return new Set(s.enum.filter((v) => typeof v === 'string'));
    return null;
  };
  const fullType = (blocks, k) => {
    const b = blocks?.find((x) => keyAt(x, k) >= 0);
    if (!b) return null;
    const i = keyAt(b, k);
    let head = b.lines[i].replace(/^\s*\w+\??:\s*/, '');
    if (head.trimEnd().endsWith('{')) {
      const close = b.lines.findIndex((l, j) => j > i && l.startsWith(' '.repeat(b.indent) + '}'));
      if (close < 0) return null;
      head = head.trimEnd().slice(0, -1) + '{…}' + b.lines[close].trim().slice(1);
    }
    return head.replace(/;\s*$/, '').trim();
  };
  const topSplit = (t) => {
    const parts = []; let d = 0, cur = '';
    for (const c of t) { if ('<({['.includes(c)) d++; if ('>)}]'.includes(c)) d--; if (c === '|' && d === 0) { parts.push(cur.trim()); cur = ''; } else cur += c; }
    parts.push(cur.trim());
    return parts.filter(Boolean);
  };
  const sdkKinds = (t, unread, depth = 0) => {
    const out = new Set();
    for (let p of topSplit(t)) {
      p = p.replace(/^readonly\s+/, '').trim();
      if (/^\(.*\)$/.test(p) && !/^\(string & \{\}\)$/.test(p)) p = p.slice(1, -1).trim();
      if (/^\(string & \{\}\)$/.test(p) || p === 'string' || /^'.*'$/.test(p) || /^".*"$/.test(p) || /^`.*`$/.test(p)) out.add('string');
      else if (/\[\]$/.test(p) || /^(Readonly)?Array</.test(p)) out.add('array');
      else if (p.startsWith('{') || /^(Record|Omit|Pick|Partial|Required|Readonly)</.test(p)) out.add('object');
      else if (p === 'number' || /^-?\d/.test(p)) out.add('number');
      else if (['boolean', 'true', 'false'].includes(p)) out.add('boolean');
      else if (p === 'null') out.add('null');
      else if (p === 'unknown' || p === 'any') out.add('any');
      else if (p in KIND_NAMED) out.add('any');
      else if (/^[A-Z]\w*$/.test(p)) {
        const a = depth < 5 ? aliasOf(p) : undefined;
        if (a === undefined) out.add('object'); // an interface (or a name this file never declares as a type)
        else for (const k of sdkKinds(a, unread, depth + 1)) out.add(k);
      } else if (/^[A-Z]\w*\s*&/.test(p)) out.add('object'); // OwDraughtItem & {…}
      else unread.push(p);
    }
    return out;
  };
  const kindBad = [], nullBad = [], unreadAll = [];
  const literalBad = [], literalOpen = [];
  let typedRead = 0, literalHeld = 0;
  for (const { p, sdkName, docSchema, blocks } of pairSides) {
    if (!blocks) continue;
    for (const [k, v] of Object.entries(docSchema.properties)) {
      const dk = docKinds(v);
      if (!dk.size || dk.has('any')) continue; // (a) holds the untyped
      const t = fullType(blocks, k);
      if (t === null) continue; // a key the SDK lacks is 5f's
      const unread = [];
      const sk = sdkKinds(t, unread);
      typedRead++;
      if (unread.length) { unreadAll.push(`${sdkName}.${k} (${unread.join(', ')})`); continue; }
      if (sk.has('any')) { ok(); continue; }
      const missing = [...dk].filter((x) => x !== 'null' && !sk.has(x));
      const narrower = missing.length > 0 || (dk.has('null') && !sk.has('null'));
      // a named exception counts only where it is needed, so a document that catches up makes it stale
      if (narrower && `${sdkName}.${k}` in KIND_OWN) { ownMet.add(`${sdkName}.${k}`); ok(); continue; }
      if (missing.length) kindBad.push(`${reachOf(p)}.${k} may be ${missing.join(' or ')}, and ${sdkName} declares it ${t}`);
      else if (dk.has('null') && !sk.has('null')) nullBad.push(`${reachOf(p)}.${k} may be null, and ${sdkName} declares it ${t}`);
      else ok();
      // 5k: one literal, held to the document's words where the document closes the field to words
      const parts = topSplit(t).map((x) => x.trim()).filter((x) => x !== 'null');
      if (parts.length === 1 && /^'[^']*'$/.test(parts[0])) {
        const lit = parts[0].slice(1, -1);
        const words = docWords(v);
        if (words === null) { if (!literalOpen.includes(`${sdkName}.${k}`)) literalOpen.push(`${sdkName}.${k}`); }
        else if (words.has(lit)) { literalHeld++; ok(); }
        else literalBad.push(`${reachOf(p)}.${k} holds ${[...words].map((w) => `'${w}'`).join(' or ') || 'no word'}, and ${sdkName} declares it '${lit}'`);
      }
    }
  }
  for (const m of literalBad) bad(`5k: the document's ${m}`);
  console.log(`  5k: ${literalHeld + literalBad.length} field(s) the SDK declares as one string literal held to the document's words, ${literalBad.length} not among them; ${literalOpen.length} where the document takes any string (unchecked: ${literalOpen.join(', ') || 'none'})`);
  for (const m of kindBad) bad(`5x: the document's ${m}`);
  for (const m of nullBad) bad(`5x: the document's ${m}`);
  if (unreadAll.length) gap(`5x: SDK declaration(s) this reader cannot place and KIND_NAMED does not name: ${unreadAll.join('; ')}`);
  const ownStale = Object.keys(KIND_OWN).filter((x) => !ownMet.has(x));
  if (ownStale.length) gap(`5x: KIND_OWN names field(s) no longer narrower than the document, or gone: ${ownStale.join(', ')} (drop the name)`);
  console.log(`  5x: ${typedRead} typed answer field(s) read against their SDK declarations; ${kindBad.length} of another kind, ${nullBad.length} null where the SDK says never`);
}

// ---- 5n: every nested object under a pair's root is held or named (2026-10-26) ----------------
// A nested object was held only where some pair walked to it: OwMe was held by its top-level keys, so
// front_door.my_seats arrived in the document and a release passed without it. Now every object with
// properties under each pair's root is listed from the document ($refs followed, a $ref already on the
// path not re-entered; a list's rows, each oneOf branch, the parts of an allOf merged) and must be
// reached by a pair or named in NESTED_NAMED. A list route's page wrapper counts too: its root.
{
  const found = new Set();
  const walk = (s, at, refs) => {
    const ref = s?.$ref?.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    if (ref) { if (refs.includes(ref)) return; refs = [...refs, ref]; s = schemas[ref]; }
    if (!s || typeof s !== 'object') return;
    if (s.allOf) s = { ...s, properties: Object.assign({}, ...s.allOf.map((x) => derefSchema(x)?.properties), s.properties) };
    const alts = [...(s.oneOf ?? []), ...(s.anyOf ?? [])].filter((a) => a?.type !== 'null');
    if (alts.length === 1 && !s.properties) walk(alts[0], at, refs);
    else alts.forEach((a, i) => {
      const k = constOf(a, 'kind'); const op = constOf(a, 'op');
      walk(a, at + (k !== undefined ? `<kind=${k}>` : op !== undefined ? `<op=${op}>` : `<${i}>`), refs);
    });
    if (s.items) walk(s.items, `${at}[]`, refs);
    if (s.properties) {
      found.add(at);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${at}.${k}`, refs);
    }
  };
  const roots = new Map(pairsRun.map((p) => [rootOf(p), p.at ? paths[p.at[1]]?.[p.at[0]]?.responses?.[p.at[2]]?.content?.['application/json']?.schema : schemas[p.doc]]));
  for (const [label, s] of roots) walk(s, label, []);
  const held = new Set(pairsRun.map(reachOf));
  const unheld = [...found].filter((x) => !held.has(x) && !(x in NESTED_NAMED));
  // a name is stale when its root was walked and the path is gone, or a pair now holds it
  const rootPart = (x) => x.split(/[.[<]/)[0];
  const stale = Object.keys(NESTED_NAMED).filter((x) => roots.has(rootPart(x)) && !found.has(x));
  const both = Object.keys(NESTED_NAMED).filter((x) => held.has(x));
  if (unheld.length) gap(`nested object(s) in the document that no 5f pair holds and NESTED_NAMED does not name: ${unheld.join(', ')}`);
  if (stale.length) gap(`NESTED_NAMED names path(s) the document no longer has: ${stale.join(', ')}`);
  if (both.length) gap(`NESTED_NAMED names path(s) a pair now holds: ${both.join(', ')} (drop the name)`);
  if (!unheld.length && !stale.length && !both.length) ok();
  console.log(`  5n: ${found.size} object(s) under ${roots.size} pair root(s): ${[...found].filter((x) => held.has(x)).length} held by a pair, ${[...found].filter((x) => x in NESTED_NAMED).length} named`);
}
// The feed's query parameters: what the client sends on /changes is a parameter the document lists.
{
  const listed = new Set((paths['/api/v2/changes']?.get?.parameters ?? []).filter((x) => x.in === 'query').map((x) => x.name));
  if (!listed.size) schemaBlind.push('GET /changes (no query parameters listed)');
  else {
    const { client, calls } = recorder(() => ({ status: 200, body: { cursor: '0', changes: [], has_more: false, head: 0, epoch: null } }));
    await client.changes({ since: 'c', limit: 5, after: '2026-10-21T09:00:00Z' }); // the `after` parameter
    if (typeof client.changesHead === 'function') await client.changesHead();
    const sent = new Set(calls.flatMap((c) => c.query));
    const unlisted = [...sent].filter((q) => !listed.has(q));
    if (unlisted.length) bad(`GET /changes: the client sends ?${unlisted.join(', ?')}, which the document does not list`);
    else ok();
  }
}

// ---- 5e: every client method is exercised or named ----------------------------------------------
// Section 1 calls a fixed list of methods. A method added to the SDK later (removeImage, 4.8) would
// send a route this gate never sees and the run would still pass. So every public method on the
// client is either exercised above or named here with the reason it needs no call of its own;
// anything else is a gap in this checker, and the run is INCOMPLETE until it is added.

{
  const EXERCISED = new Set(['health', 'getWorld', 'patchWorld', 'bulk', 'changes', 'createMediaTicket',
    'createRemovalTicket', 'list', 'get', 'create', 'upsert', 'patch', 'delete', 'editLinks', 'adopt', 'hide', 'unhide', 'listHidden', 'listAccountWorlds', 'mintWorldKey', 'madeWorldKey', 'revokeWorldKey', 'listAccountTokens', 'revokeAccountToken', 'mintAiToken', 'signInWithOnlyWorlds', 'completeSignIn', 'draught', 'search',
    'previewJoin', 'redeemJoin', 'acceptJoin', 'ask', 'sort', 'allowance', 'aiUses', 'ai', 'changesHead', 'me', 'setMyCharacter', 'members', 'setMyLenses', 'worldLenses',
    'propose', 'listProposals', 'worldProposals', 'acceptProposal', 'declineProposal', 'withdrawProposal', 'reviewNewElement',
    'createAccountWorld', 'createWorldLink', 'listWorldLinks', 'revokeWorldLink', 'createSeat', 'listSeats', 'rekeySeat', 'removeSeat', 'setMemberLenses',
    'signInWithPassword', 'listFiles', 'worldFiles', 'createFileTicket', 'fileDownloadLink', 'removeFile',
    // driven in 1: its ticket held to the document, its second request (the upload host) to its shape
    'uploadFile']);
  const COMPOSED = {
    listAll: 'pages over list()',
    changesAll: 'pages over changes()',
    uploadImage: 'createMediaTicket() plus the upload host, which is not in the document',
    removeImage: 'createRemovalTicket() plus the upload host, which is not in the document',
    request: 'the raw transport: whatever its caller sends',
  };
  const methods = Object.getOwnPropertyNames(OwV2Client.prototype)
    .filter((n) => n !== 'constructor' && typeof OwV2Client.prototype[n] === 'function');
  const unseen = methods.filter((n) => !EXERCISED.has(n) && !(n in COMPOSED));
  if (unseen.length) gap(`client method(s) this gate neither calls nor names: ${unseen.join(', ')} — the routes they send are unchecked`);
  else ok();
}

// ---- 6: the page cursor -----------------------------------------------------------------------

{
  const L = schemas.CharacterList?.properties ?? {};
  const names = { data: null, more: null, next: null };
  for (const [k, s] of Object.entries(L)) {
    const ty = Array.isArray(s.type) ? s.type : [s.type];
    if (ty.includes('array')) names.data = k;
    else if (ty.includes('boolean')) names.more = k;
    else if (ty.includes('string')) names.next = k;
  }
  if (!names.data || !names.more || !names.next) {
    gap('CharacterList in the document does not have an array, a boolean and a string property — page-cursor test skipped');
  } else {
    const { client, calls } = recorder((_c, n) => ({
      status: 200,
      body: n === 1
        ? { [names.data]: [{ id: ID, name: 'a' }], [names.more]: true, [names.next]: 'CURSOR-1' }
        : { [names.data]: [{ id: ID, name: 'b' }], [names.more]: false, [names.next]: null },
    }));
    const got = [];
    for await (const e of client.listAll('character')) got.push(e.name);
    const second = calls[1]?.queryFull?.cursor;
    if (got.join() !== 'a,b' || second !== 'CURSOR-1') {
      bad(`listAll does not follow the page cursor under the document's names (${names.data}/${names.more}/${names.next}): read [${got}], second request cursor=${second}`);
    } else ok();
  }
}

// ---- 7: the error envelope ---------------------------------------------------------------------

{
  const E = schemas.Error?.properties?.error;
  const want = ['type', 'code', 'message', 'param', 'doc_url'];
  const have = Object.keys(E?.properties ?? {});
  // A 409 resync_required's envelope carries `reason` (role | view) beside the five,
  // declared in the document once the hidden mark is on. Allowed only when declared, and then the SDK
  // must read it: err.resyncReason.
  // 2026-11-10: an answer_not_parsed envelope carries `refusals`, now declared;
  // allowed only when declared, and then the SDK must read it: err.refusals.
  // 2026-11-17: a 422 on a read's `fields` list carries `unknown_fields`, `types_with_field`
  // and `allowed_fields`; allowed only when declared, and then the SDK must read all three: err.fieldsRefusal.
  const FIELDS_KEYS = ['unknown_fields', 'types_with_field', 'allowed_fields'];
  const extra = ['reason', 'refusals', ...FIELDS_KEYS].filter((k) => have.includes(k));
  if (want.some((k) => !have.includes(k)) || have.some((k) => !want.includes(k) && !extra.includes(k))) {
    bad(`the document's error envelope has [${have}], the SDK reads [${want}]`);
  } else {
    const body = { error: { type: E.properties.type.enum?.[0] ?? 'api_error', code: 'probe_code', message: 'probe message', param: 'probe_param', doc_url: 'https://example.invalid/e' } };
    const e = parseErrorEnvelope(422, body);
    const miss = [];
    if (e.type !== body.error.type) miss.push('type');
    if (e.code !== 'probe_code') miss.push('code');
    if (e.message !== 'probe message') miss.push('message');
    if (e.param !== 'probe_param') miss.push('param');
    if (e.docUrl !== 'https://example.invalid/e') miss.push('doc_url');
    if (extra.includes('reason')) {
      const r = parseErrorEnvelope(409, { error: { type: 'invalid_request', code: 'resync_required', message: 'probe', param: 'since', doc_url: 'https://example.invalid/e', reason: 'role' } });
      if (r.resyncReason !== 'role') miss.push('reason (err.resyncReason)');
    }
    if (extra.includes('refusals')) {
      const row = Object.fromEntries((E.properties.refusals?.items?.required ?? []).map((k) => [k, k === 'output_tokens' ? 7 : `probe-${k}`]));
      const r = parseErrorEnvelope(422, { error: { type: 'invalid_request', code: 'answer_not_parsed', message: 'probe', param: 'answer', doc_url: 'https://example.invalid/e', refusals: [row] } });
      if (!Object.keys(row).length || JSON.stringify(r.refusals) !== JSON.stringify([row])) miss.push('refusals (err.refusals)');
    }
    const declaredFieldsKeys = FIELDS_KEYS.filter((k) => extra.includes(k));
    if (declaredFieldsKeys.length) {
      // each key's probe value is built from the kind the document declares for it; a kind this check
      // does not know is a miss, never a pass
      const probe = {};
      for (const k of declaredFieldsKeys) {
        const d = E.properties[k];
        if (d?.type === 'array' && d.items?.type === 'string') probe[k] = [`probe-${k}-1`, `probe-${k}-2`];
        else if (d?.type === 'object' && d.additionalProperties?.type === 'array' && d.additionalProperties.items?.type === 'string') probe[k] = { [`probe-${k}`]: ['probe-type-1', 'probe-type-2'] };
        else miss.push(`${k} (a kind this check cannot build)`);
      }
      if (!('unknown_fields' in probe)) probe.unknown_fields = ['probe-name'];
      const r = parseErrorEnvelope(422, { error: { type: 'invalid_request', code: 'invalid_request', message: 'probe', param: 'fields', doc_url: 'https://example.invalid/e', ...probe } });
      for (const k of declaredFieldsKeys) {
        if (k in probe && JSON.stringify(r.fieldsRefusal?.[k]) !== JSON.stringify(probe[k])) miss.push(`${k} (err.fieldsRefusal.${k})`);
      }
    }
    if (miss.length) bad(`OwApiError loses ${miss.join(', ')} from the document's error envelope`);
    else ok();
  }
}

// ---- 7p: the 412 precondition body (declared allOf [Error, {current: <type>}]) ----

{
  const refName = (s) => (typeof s?.$ref === 'string' ? s.$ref.split('/').pop() : null);
  for (const t of ELEMENT_TYPES) {
    const readName = t[0].toUpperCase() + t.slice(1);
    for (const [p, m] of [[`/api/v2/${t}/{id}`, 'patch'], [`/api/v2/${t}/{id}/links/{field}`, 'post']]) {
      const s = paths[p]?.[m]?.responses?.['412']?.content?.['application/json']?.schema;
      if (!s) { bad(`${m.toUpperCase()} ${p}: the document gives the 412 no body schema`); continue; }
      const parts = s.allOf ?? [s];
      const cur = parts.find((x) => x?.properties?.current);
      if (!parts.some((x) => refName(x) === 'Error')) bad(`${m.toUpperCase()} ${p}: the 412 body is not the error envelope`);
      else if (!cur || refName(cur.properties.current) !== readName || !(cur.required ?? []).includes('current')) {
        bad(`${m.toUpperCase()} ${p}: the 412 body does not require \`current\` as ${readName}`);
      } else ok();
    }
  }
  // Run the SDK: a 412 carrying `current` must come back as the error's `current`, whole.
  const body = {
    error: { type: 'invalid_request', code: 'precondition_failed', message: 'probe', param: 'If-Match', doc_url: 'https://example.invalid/e' },
    current: { type: 'character', id: ID, name: 'probe', change_seq: 44 },
  };
  const { client } = recorder(() => ({ status: 412, body }));
  try {
    await client.patch('character', ID, { name: 'x' }, { ifMatch: 41 });
    bad('a 412 precondition_failed did not throw');
  } catch (e) {
    if (e?.isPreconditionFailed !== true) bad('the SDK does not mark a 412 precondition_failed as isPreconditionFailed');
    else ok();
    if (JSON.stringify(e?.current) !== JSON.stringify(body.current)) bad('the SDK does not hand back the 412 body\'s `current` as the error\'s `current`');
    else ok();
  }
}

// ---- 7h: the conditional head poll (SDK 4.57.0) ---------------------------------------
// The gate called changesHead() once until 2026-10-22, so it never saw If-None-Match sent or the 304
// read: the package's own tests and a live probe covered that half. Here the head read is answered
// twice: a 200 tagged with a weak ETag (the shape keel serves), then a 304 with no
// body. What the document declares for it is read first; a document without the parameter or the 304
// is named, not passed.
{
  const op = paths['/api/v2/changes']?.get;
  const hdr = (op?.parameters ?? []).find((p) => p.in === 'header' && p.name.toLowerCase() === 'if-none-match');
  const r304 = op?.responses?.['304'];
  if (!hdr) bad('GET /changes: the document lists no If-None-Match header parameter');
  else ok();
  if (!r304) bad('GET /changes: the document declares no 304');
  else if (!Object.keys(r304.headers ?? {}).some((h) => h.toLowerCase() === 'etag')) bad('GET /changes: the document\'s 304 declares no ETag header');
  else ok();
  if (typeof OwV2Client.prototype.changesHead !== 'function') gap('this SDK has no changesHead(): the conditional poll is unchecked');
  else {
    const TAG = 'W/"7:-"';
    const first = { head: 7, cursor: '7', epoch: null };
    let n = 0;
    const { client, calls } = recorder((c) => {
      if (c.queryFull?.head !== 'true') return { status: 200, body: {} };
      n++;
      if (n === 1) return { status: 200, body: first, headers: { ETag: TAG } };
      if (n === 2) return { status: 304, headers: { ETag: TAG } };
      if (n === 3) return { status: 409, body: { error: { type: 'conflict', code: 'resync_required', message: 'probe', param: null, doc_url: 'https://example.invalid/e' }, reason: 'view' } };
      return { status: 200, body: { head: 9, cursor: '9', epoch: 2 }, headers: { ETag: 'W/"9:2"' } };
    });
    const a = await client.changesHead();
    const b = await client.changesHead();
    let threw = false;
    try { await client.changesHead(); } catch (e) { threw = e?.status === 409; }
    const d = await client.changesHead();
    const heads = calls.filter((c) => c.queryFull?.head === 'true');
    if (heads.length !== 4) bad(`7h: expected four head reads, saw ${heads.length}`);
    else {
      if (heads[0].headerValues['If-None-Match'] !== undefined) bad('7h: the first head read sent If-None-Match while nothing was held');
      else ok();
      if (heads[1].headerValues['If-None-Match'] !== TAG) bad(`7h: the second head read sent If-None-Match ${JSON.stringify(heads[1].headerValues['If-None-Match'])}, not the tag as received ${JSON.stringify(TAG)}`);
      else ok();
      if (!threw) bad('7h: a 409 on the head read did not surface as an OwApiError 409');
      else ok();
      if (heads[3].headerValues['If-None-Match'] !== undefined) bad('7h: the head read after a 409 still sent If-None-Match; the tag was not cleared');
      else ok();
    }
    if (a?.unchanged !== false || a?.head !== 7) bad(`7h: the 200 answered ${JSON.stringify(a)}, not head 7 with unchanged: false`);
    else ok();
    if (b?.unchanged !== true || b?.head !== 7 || b?.cursor !== '7' || b?.epoch !== null) bad(`7h: the 304 answered ${JSON.stringify(b)}, not the held head 7, cursor '7', epoch null with unchanged: true`);
    else ok();
    if (d?.unchanged !== false || d?.head !== 9) bad(`7h: the 200 after the 409 answered ${JSON.stringify(d)}, not head 9 with unchanged: false`);
    else ok();
  }
}

// ---- 7b: a path no route matches, live (2026-10-09) --------------------------------
// The one way the SDK meets an unrouted path is a wrong baseUrl (a missing /v2, a typo). That used
// to answer Django's HTML page, so the SDK had no envelope to read; keel now answers the registry's
// JSON envelope. The real client is pointed at a base that no route matches and must surface it as
// an OwApiError with keel's code and doc_url. A GET with the public demo key: nothing is written.
// This is the only check that reads the live API, so an unreachable host is named, not passed.
let LIVE_PROBE = 'skipped (--no-live)';
if (!argv.includes('--no-live')) {
  LIVE_PROBE = 'ran, and it found a difference (above)';
  const origin = arg('--api-origin', 'https://www.onlyworlds.com');
  try {
    const probe = new OwV2Client({ apiKey: '0000000001', baseUrl: `${origin}/api/v2-no-such-base` });
    let err = null;
    try { await probe.getWorld(); } catch (e) { err = e; }
    const listed = schemas.Error?.['x-ow-error-codes']?.not_found;
    if (err instanceof sdk.OwNetworkError) LIVE_PROBE = `NOT RUN (${err.message}): the unrouted-path envelope went unchecked`;
    else if (err && !(err instanceof sdk.OwApiError) && /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed? ?out|network|aborted/i.test(`${err.message} ${err.cause?.code ?? ''}`)) LIVE_PROBE = `NOT RUN (${err.message}): the unrouted-path envelope went unchecked`;
    else if (!err) bad('a base URL no route matches did not raise: the SDK returned a result');
    else if (!(err instanceof sdk.OwApiError)) bad(`a base URL no route matches raised ${err?.constructor?.name}: ${err?.message}, not an OwApiError (keel answers its JSON envelope since 2026-10-09)`);
    else if (err.status !== 404 || err.code !== 'not_found' || !err.docUrl) bad(`an unrouted path surfaced as status ${err.status}, code ${err.code}, docUrl ${err.docUrl ? 'set' : 'missing'}; keel's envelope is 404 / not_found / a doc_url`);
    else if (!listed || listed.internal) bad('the unrouted-path code "not_found" is not a public code in keel\'s own list');
    else { ok(); LIVE_PROBE = `ran: ${origin}, an unrouted base answers an OwApiError 404 not_found with a doc_url`; }
  } catch (e) {
    LIVE_PROBE = `NOT RUN (${e.message}): the unrouted-path envelope went unchecked`;
  }
}

// ---- 5t: the other classes, and TokenResource's /tokens/* routes (2026-10-14) -----------------------
// 5e covers OwV2Client only. TokenResource is a second exported class that sends requests, and the
// document has no /tokens/ path, so this gate never saw it: four of its six methods answered 404 on
// production while every run passed. Now every exported class is driven or named; TokenResource's
// methods are each driven through a recording transport, and (live) each route it sends is asked of
// production without credentials. A route production does not have (JSON 404 not_found) is a
// difference unless the SDK marks that method @deprecated in its published types; a deprecated
// method whose route still answers is one too.
let TOKEN_PROBE = 'skipped (--no-live)';
const TOKEN_DEAD = [];
{
  const classes = Object.entries(sdk)
    .filter(([, v]) => typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v)))
    .map(([k]) => k);
  const unnamed = classes.filter((k) => k !== 'OwV2Client' && k !== 'TokenResource' && !/Error$/.test(k));
  if (unnamed.length) gap(`exported class(es) this gate neither drives nor names: ${unnamed.join(', ')} (error classes send nothing; OwV2Client is 5e, TokenResource 5t)`);
  else ok();
  const TR = sdk.TokenResource;
  if (!TR) TOKEN_PROBE = 'this SDK exports no TokenResource';
  else {
    const sent = [];
    const tr = new TR({ async request(method, path) { sent.push({ method, path }); return {}; } });
    const ARGS = { consume: [{ amount: 1 }], revokeSession: ['s1'] };
    const PRIVATE = { req: 'the private transport wrapper every method goes through' };
    const methods = Object.getOwnPropertyNames(TR.prototype)
      .filter((n) => n !== 'constructor' && !(n in PRIVATE) && typeof TR.prototype[n] === 'function');
    const dts = readdirSync(join(SDK_DIR, 'dist')).filter((f) => f.endsWith('.d.ts')).map((f) => readFileSync(join(SDK_DIR, 'dist', f), 'utf8')).join('\n');
    const at = dts.indexOf('declare class TokenResource');
    const cls = at < 0 ? '' : dts.slice(at, dts.indexOf('\n}', at));
    if (!cls) gap('TokenResource is exported but its declaration is not in dist/*.d.ts, so its deprecations went unread');
    const deprecated = (m) => { const i = cls.indexOf(`${m}(`); return i > 0 && cls.slice(cls.lastIndexOf('/**', i), i).includes('@deprecated'); };
    const routes = [];
    for (const m of methods) {
      const before = sent.length;
      try { await tr[m](...(ARGS[m] ?? [])); } catch { /* the recording transport answers {} */ }
      if (sent.length === before) { gap(`TokenResource.${m} sent no request through its transport: add it to ARGS or PRIVATE here`); continue; }
      routes.push({ m, ...sent[sent.length - 1] });
    }
    if (!argv.includes('--no-live')) {
      const origin = arg('--api-origin', 'https://www.onlyworlds.com');
      try {
        for (const r of routes) {
          const res = await fetch(`${origin}/api/v2${r.path.split('?')[0]}`, { method: r.method, headers: { Accept: 'application/json' } });
          let code = null;
          try { const j = await res.json(); code = j?.error?.code ?? j?.code ?? null; } catch { /* not JSON */ }
          const unrouted = res.status === 404 && code === 'not_found';
          if (unrouted && deprecated(r.m)) { TOKEN_DEAD.push(`${r.m} (${r.method} ${r.path.split('?')[0]})`); ok(); }
          else if (unrouted) bad(`TokenResource.${r.m} sends ${r.method} ${r.path}, which production does not route (404 not_found), and the SDK does not mark it @deprecated`);
          else if (deprecated(r.m)) bad(`TokenResource.${r.m} is @deprecated, but production answers ${r.method} ${r.path} with ${res.status}, not an unrouted 404`);
          else ok();
        }
        TOKEN_PROBE = `ran: ${routes.length} route(s) asked of ${origin} without credentials`;
      } catch (e) {
        TOKEN_PROBE = `NOT RUN (${e.message})`;
        gap(`the TokenResource routes could not be asked of production (${e.message}), so they went unchecked`);
      }
    }
  }
}

// ---- 8: the error codes the SDK keys on, against keel's own list (live 2026-10-08) -------
// The codes the SDK keys on, read from its own built file (every `code === "x"` in dist), not a list
// kept here: the hand list was missing `owner_only` the day the SDK started keying on it (4.5.0).
// A `typeof x.code === "string"` is a type test, not a code the SDK keys on (4.46.0's sign-in read as "string").
const JS_TYPES = new Set(['string', 'number', 'boolean', 'object', 'undefined', 'function', 'symbol', 'bigint']);
const SDK_JS = distFiles('.js').map((rel) => readFileSync(join(SDK_DIR, rel), 'utf8')).join('\n');
const SDK_CODES = [...new Set([...SDK_JS.matchAll(/\bcode === "([a-z][a-z_]*)"/g)].map((m) => m[1]))].filter((c) => !JS_TYPES.has(c));
if (SDK_CODES.length < 6) gap(`found only ${SDK_CODES.length} error code(s) the SDK keys on in dist/*.js (expected 8 at 4.5.0): the pattern no longer matches how it is built`);
const CODE_LIST = schemas.Error?.['x-ow-error-codes'];
// Codes the SDK keeps on purpose though keel never sends them, each with its reason, reported by
// name every run instead of failing (a known design choice is flagged, and its owner rules).
// world_gone: reserved by keel's spec (§2 T6b, §9: "RESERVED, not emitted... clients may keep the
// code but must not rely on it"), so it is absent from the list of emitted codes by design.
// Permanent until keel remembers deleted worlds' key hashes and emits it.
const RESERVED = { world_gone: 'reserved by keel\'s spec (§2 T6b, §9), not emitted; the SDK keeps it on purpose' };
const unflagged = [];
if (!CODE_LIST || typeof CODE_LIST !== 'object') {
  gap('the document has no Error.x-ow-error-codes, so the codes the SDK keys on could not be checked against keel\'s list');
} else {
  for (const c of SDK_CODES) {
    const row = CODE_LIST[c];
    if (!row && RESERVED[c]) console.log(`  NOTE   the SDK keys on "${c}", not in keel's list: ${RESERVED[c]}`);
    else if (!row) bad(`the SDK keys on error code "${c}", which keel's list does not have`);
    else if (row.internal) bad(`the SDK keys on "${c}", which keel's list marks internal (never sent to a client)`);
    else ok();
  }
  unflagged.push(...Object.entries(CODE_LIST).filter(([c, r]) => !r.internal && !r.host && !SDK_CODES.includes(c)).map(([c]) => c));
}

// ---- 9: the constants the SDK exports (2026-10-20) ----------------------------------------------
// Every export was said to be generated from the schema or compared to it; five constants
// copied from keel were read by no gate. Each ALL_CAPS export is placed here, and a new one is a GAP.
const CONSTANTS = {
  FILE_EXTENSIONS: 'checked (9a)', AGENT_DOORS: 'checked (9b)',
  ELEMENT_TYPES: 'generated', ELEMENT_FAMILIES: 'generated', ELEMENT_ICONS: 'generated', PUBLIC_FIELDS: 'generated',
  ELEMENT_SECTIONS: 'generated', FIELD_SCHEMA: 'generated', ONLYWORLDS_VERSION: 'generated',
  ROOM_PAIRS: 'generated', // 4.55.0: from the dist's profiles/room.fixture.json (serial 45: the pair and the x_room_of mark), checked against room.md at codegen; the 23 cases are the SDK's own test
  VIEWS: 'generated', // 4.147.0, serial 113: from the dist's views.json, checked against the walk and the profiles' pairs at codegen; the 28 cases of views.fixture.json are the SDK's own test
  MESSAGE_PAIR: 'generated', // 4.80.0: from the dist's profiles/message.fixture.json (serial 72), checked against message.md and ROOM_PAIRS at codegen; the 43 cases are the SDK's own test
  CHARTER_PAIRS: 'generated', // 4.100.0: from the dist's profiles/charter.fixture.json (serial 83), checked against charter.md and the lens fixture's reading_aid_pairs at codegen; the fixture's cases are the SDK's own test
  NOTE_PAIR: 'generated', // serial 76: from the dist's profiles/message.fixture.json note_pair, checked against message.md at codegen; the fixture's note cases are the SDK's own test
  REVIEW_PROPOSED_LABEL: 'generated', // 4.72.0: rule 1's label from the dist's profiles/review.md, read at codegen (the words buildAskContext puts on a kept proposed element)
  ELEMENT_GROUPS: 'generated', GROUP_ORDER: 'generated', GROUP_COLORS: 'generated', // 4.102.0, serial 86: from presentation.json's types.<type>.family, colors.order and colors.families, validated at codegen; the SDK's palette test holds them to the vendored sidecar
  FAMILY_COLORS: 'presentation', FAMILY_ORDER: 'presentation', // deprecated since 4.102.0: the groups in their pre-86 words through palette.ts's one LEGACY_WORD table, until 5.0
  ELEMENT_LABELS: 'presentation', FIELD_ACRONYMS: 'presentation',
  SPATIAL_TYPES: 'folder', CALENDAR_FIELD: 'atlas', CALENDAR_SUPERTYPE: 'atlas',
  WORLD_FILE_MAX_BYTES: 'folder', WORLD_FILE_MAX_ENTRIES: 'folder', WORLD_FILE_MEDIA_TYPE: 'folder', // folder spec §4.7: the floor (OW-15) and the marker's bytes (OW-6)
  ASK_LIMITS: 'checked (9e)', PHOTO_MAX_BYTES: 'checked (9f)', PHOTO_TYPES: 'checked (9g)',
  PROPOSED_MARK: 'checked (9c)', // 4.83.0: the review profile's first key name, read from profiles/review.md
  STRAND_FIELD: 'checked (9h)', // 4.119.0: the strand profile's mark, read from profiles/strand.fixture.json's mark.field
  RECORD_FIELD: 'checked (9i)', // 4.124.0: the record profile's mark, read from profiles/record.fixture.json's mark.field
  DATE_FIELD: 'checked (9d)', // 4.96.0: the lens profile's date table, read from profiles/lens.fixture.json
  BY_LINKS_3D_REST: 'the method', // 4.171.0: by-links-3d's rest length, the unit of its answer; held by the SDK's layout test to the fixture's `rest` (the fixture pinned by sha256)
  BY_LINKS_3D_VERSION: 'the method', // 4.174.0: the version of by-links-3d's answers, raised exactly when a fixture case's answer moves; held by the SDK's layout test to test/fixtures/layout/by-links-3d.answers.json (every case's want pinned by sha256 under it; scripts/pin-layout-answers.mjs refuses a moved answer under the same version)
  TRAIL_TIERS: 'the method', // 4.135.0: trail-by-place's default floors, the method's own setting (no profile names them yet); held by the SDK's layout test to the shared fixture both packages pin by sha256
  DECLARED_LINKS: 'schema-dist lint', // 4.168.0: the extension lists a profile reads as links (the lens profile's declared links, the spine profile's x_spine_depends_on); held by the SDK's declared-links test to walk/lint_folder.py's LINK_EXTENSIONS in the vendored distribution
  TOOLS: 'tools list', // 4.105.0: OnlyWorlds/tools' tools.json at codegen/tools-pin.json's commit, six keys a row; held to the pinned file by codegen:check, the served copy to the list by the maintainers' own check
};
const exportedConstants = Object.keys(sdk).filter((k) => /^[A-Z][A-Z0-9_]+$/.test(k));
for (const k of exportedConstants) {
  if (CONSTANTS[k]) ok();
  else gap(`the SDK exports a constant this gate cannot place, ${k}: check it here, or name where its truth lives in CONSTANTS (9)`);
}
const keelUnchecked = exportedConstants.filter((k) => CONSTANTS[k] === 'keel, unchecked');

// The enums the document declares for a property name, anywhere under `node`.
function enumsOf(node, prop, out = []) {
  if (Array.isArray(node)) { for (const v of node) enumsOf(v, prop, out); return out; }
  if (!node || typeof node !== 'object') return out;
  const e = node.properties?.[prop]?.enum;
  if (Array.isArray(e)) out.push(e.filter((v) => v !== null));
  for (const v of Object.values(node)) enumsOf(v, prop, out);
  return out;
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// 9a: the file kinds. The extensions themselves are keel's NAME_EXTS, which the document
// does not carry; only the kinds they map to are checked.
if (sdk.FILE_EXTENSIONS) {
  // The ticket request's body and the rows read back; the ticket answer's own `kind: file` is the
  // ticket's lane, another field.
  const fileOps = Object.entries(paths).filter(([p]) => /\/files(\/|$)/.test(p)).map(([, op]) => op);
  const kindEnums = enumsOf(fileOps.flatMap((op) => [op.post?.requestBody, op.get?.responses?.['200']]), 'kind');
  if (!kindEnums.length) gap('the document declares no `kind` enum on any /files route, so FILE_EXTENSIONS went unchecked');
  else {
    const kinds = kindEnums[0];
    if (kindEnums.some((e) => !sameSet(e, kinds))) bad(`the document's /files routes declare different kind enums: ${[...new Set(kindEnums.map((e) => e.join(',')))].join(' | ')}`);
    const given = [...new Set(Object.values(sdk.FILE_EXTENSIONS))];
    for (const k of kinds) given.includes(k) ? ok() : bad(`keel's file kind "${k}" has no extension in FILE_EXTENSIONS`);
    for (const k of given) kinds.includes(k) ? ok() : bad(`FILE_EXTENSIONS gives the kind "${k}", which the document's /files routes do not declare`);
  }
}

// 9u: every union of string literals the SDK declares (`lenses_from` gained `none`, and nothing
// held the union; 2026-11-10 a word dropped from the seat body's `character` passed, because this check then
// held a fixed list of two). The declarations are enumerated, never listed: each union found is either held
// to the document at the places it names (UNION_ROWS, `same` both ways, `within` the SDK's words a subset)
// or named as the SDK's own words with where their truth lives (UNION_OWN). A union in neither, a row for a
// union the SDK no longer declares, a place that yields no enum, and a literal pair the reader cannot
// attribute are GAPs. An open union (`| (string & {})`) is held by its named words like a closed one.
function sdkUnions() {
  const out = new Map();
  const unseen = [];
  for (const rel of distFiles('.d.ts')) {
    // comments out (string contents kept), the open-string marker and template literals made single tokens
    let raw = readFileSync(join(SDK_DIR, rel), 'utf8'), text = '', q = null;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i], n = raw[i + 1];
      if (q) { text += c; if (c === '\\') { text += n; i++; } else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; text += c; continue; }
      if (c === '/' && n === '*') { const e = raw.indexOf('*/', i + 2); i = e < 0 ? raw.length : e + 1; text += ' '; continue; }
      if (c === '/' && n === '/') { const e = raw.indexOf('\n', i); i = e < 0 ? raw.length : e - 1; continue; }
      text += c;
    }
    text = text.replaceAll('(string & {})', 'OPEN_STRING').replace(/`[^`]*`/g, 'TEMPLATE_STRING');
    // the declaration that opens each brace: an interface or type, a method's options, a property's object
    const owners = new Array(text.length), stack = [];
    let qq = null, stmt = 0, lastClosed = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (qq) { if (c === '\\') i++; else if (c === qq) qq = null; owners[i] = stack.join('.'); continue; }
      if (c === "'" || c === '"') qq = c;
      else if (c === '{') {
        const head = text.slice(stmt, i);
        const m = head.match(/(?:interface|class|namespace)\s+(\w+)[^{]*$/) || head.match(/type\s+(\w+)(?:<[^=]*>)?\s*=\s*$/)
          || head.match(/(\w+)\??(?:<[^(]*>)?\((?:[^()]|\([^()]*\))*?\w+\??:\s*$/) || head.match(/(\w+)\??:\s*[\w\s<>,|]*$/);
        stack.push(m ? m[1] : /^\s*\|\s*$/.test(head) && lastClosed ? lastClosed : '?'); stmt = i + 1;
      } else if (c === '}') { lastClosed = stack.pop(); stmt = i + 1; }
      else if (c === ';') stmt = i + 1;
      owners[i] = stack.join('.');
    }
    const LIT = `'[^'\\n]*'`, UNION = `${LIT}(?:\\s*\\|\\s*${LIT})+`, TAIL = '((?:\\s*\\|\\s*(?:null|undefined|OPEN_STRING))*)';
    const words = (s) => s.split('|').map((w) => w.trim()).filter((w) => /^'[^']*'$/.test(w)).map((w) => w.slice(1, -1));
    const covered = [];
    const add = (id, ws, open, from, to) => {
      if (out.has(id) && !sameSet(out.get(id).words, ws)) gap(`9u: ${id} is declared twice with different words (${out.get(id).words.join(', ')} | ${ws.join(', ')})`);
      out.set(id, { words: ws, open });
      covered.push([from, to]);
    };
    for (const m of text.matchAll(/(?:^|[\s;])type\s+(\w+)\s*=\s*([^;{]*?);/g)) {
      const ws = words(m[2]);
      if (ws.length >= 2) add(`type ${m[1]}`, ws, /OPEN_STRING/.test(m[2]), m.index, m.index + m[0].length);
    }
    for (const m of text.matchAll(new RegExp(`(?:^|[\\s;{(,])(?:readonly\\s+)?(\\w+)\\??:\\s*(${UNION})${TAIL}`, 'g'))) {
      const at = m.index + m[0].indexOf(m[1]);
      const fn = owners[at] ? null : text.slice(Math.max(0, at - 400), at).match(/(\w+)(?:<[^(]*>)?\([^()]*$/);
      add(`${owners[at] || (fn ? fn[1] : '(top)')}.${m[1]}`, words(m[2]), /OPEN_STRING/.test(m[3]), m.index, m.index + m[0].length);
    }
    for (const m of text.matchAll(new RegExp(`\\)\\s*:\\s*(${UNION})${TAIL}`, 'g'))) {
      const fn = text.slice(Math.max(0, m.index - 600), m.index + 1).match(/(\w+)(?:<[^(]*>)?\((?:[^()]|\([^()]*\))*\)$/);
      add(`${[owners[m.index], fn ? `${fn[1]}()` : '?()'].filter(Boolean).join('.')}:return`, words(m[1]), /OPEN_STRING/.test(m[2]), m.index, m.index + m[0].length);
    }
    // key lists are no value unions: Omit<T, 'a' | 'b'>, Pick<T, 'a' | 'b'>
    for (const m of text.matchAll(new RegExp(`\\b(?:Omit|Pick)<[\\w.]+(?:<[^<>]*>)?,\\s*${UNION}\\s*>`, 'g'))) covered.push([m.index, m.index + m[0].length]);
    for (const m of text.matchAll(new RegExp(`${LIT}\\s*\\|\\s*${LIT}`, 'g'))) {
      if (!covered.some(([a, b]) => m.index >= a && m.index < b)) unseen.push(`${rel}:${text.slice(0, m.index).split('\n').length} ${text.slice(Math.max(0, m.index - 50), m.index + 30).replace(/\s+/g, ' ')}`);
    }
  }
  return { unions: out, unseen };
}
// A place in the document: `<METHOD> <route> <status>: path`, `<METHOD> <route> body: path`,
// `<METHOD> <route> param: name`, `#Schema: path`, or `*: **.name` (every enum for that name anywhere).
// A path steps through `.name`, `name[]` for a list's rows, `<n>` for a oneOf/anyOf branch; `**.name`
// takes every enum for that name below. A nullable property (anyOf/oneOf beside null) gives its enum.
function enumsAt(loc) {
  const [root, path] = loc.split(/:\s+/);
  let nodes;
  const r = root.match(/^(GET|POST|PUT|PATCH|DELETE) (\S+) (\d{3}|body|param)$/);
  if (r) {
    const op = paths[`/api/v2${r[2]}`]?.[r[1].toLowerCase()];
    if (r[3] === 'param') {
      const p = (op?.parameters ?? []).find((x) => x.name === path);
      const s = derefSchema(p?.schema);
      const e = s?.enum ?? derefSchema(s?.items)?.enum;
      return e ? [e.filter((v) => v !== null)] : [];
    }
    nodes = [derefSchema(r[3] === 'body' ? op?.requestBody?.content?.['application/json']?.schema : op?.responses?.[r[3]]?.content?.['application/json']?.schema)];
  } else if (root === '*') nodes = [doc];
  else if (root === '#*') nodes = Object.values(doc.components?.schemas ?? {});
  else nodes = [doc.components?.schemas?.[root.slice(1)]];
  nodes = nodes.filter(Boolean);
  const alts = (n) => [...(n?.oneOf ?? []), ...(n?.anyOf ?? [])].map(derefSchema).filter((a) => a && a.type !== 'null');
  const objects = (n) => { n = derefSchema(n); return n?.properties ? [n] : alts(n).flatMap(objects); };
  const steps = path.split('.');
  for (let k = 0; k < steps.length; k++) {
    const st = steps[k];
    if (st === '**') {
      const name = steps[k + 1], found = [];
      (function walk(n) {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== 'object') return;
        const p = n.properties?.[name];
        if (p) for (const s of [derefSchema(p), ...alts(derefSchema(p))]) if (Array.isArray(s?.enum)) found.push(s.enum.filter((v) => v !== null));
        Object.values(n).forEach(walk);
      })(nodes);
      return found;
    }
    const m = st.match(/^(\w+)(\[\])?(?:<(\d+)>)?$/);
    if (!m) return [];
    nodes = nodes.flatMap(objects).map((n) => derefSchema(n.properties?.[m[1]])).filter(Boolean);
    if (m[2]) nodes = nodes.map((n) => derefSchema(n.items ?? alts(n).find((a) => a.items)?.items)).filter(Boolean);
    if (m[3] !== undefined) nodes = nodes.map((n) => alts(n)[Number(m[3])]).filter(Boolean);
  }
  // a string `const` is an enum of one word (the strand slots' `type`, serial 133)
  const wordsOf = (n) => (Array.isArray(n?.enum) ? n.enum.filter((v) => v !== null) : typeof n?.const === 'string' ? [n.const] : null);
  return nodes.flatMap((n) => [n, ...alts(n), ...(n.items ? [derefSchema(n.items)] : [])]).map(wordsOf).filter(Boolean);
}
const UNION_ROWS = {
  // what keel answers
  'OwAccountWorld.role': { at: ['GET /account/worlds 200: data[].role'] },
  'OwAccountWorld.keys.scope': { at: ['GET /account/worlds 200: data[].keys[].scope'] },
  'OwCreatedAccountWorld.keys.scope': { at: ['POST /account/worlds 201: keys[].scope'] },
  'OwMintedKey.scope': { at: ['POST /account/worlds/{world_id}/keys 201: scope'] },
  'OwWorldKeyRow.scope': { at: ['GET /account/worlds/{world_id}/keys 200: data[].scope'] },
  'OwAiUse.provider': { at: ['GET /account/ai 200: uses[].provider'] },
  'OwAllowance.own_key.provider': { at: ['GET /account/allowance 200: own_key.provider'] },
  'type OwPaidBy': { at: ['POST /account/ai/ask 200: paid_by'] },
  // one type for the strand's five slots; the document gives each slot its one word (4.177.0, serial 133)
  'OwStrandSlot.type': { at: STRAND_SLOTS.flatMap((s) => [`GET /me 200: reading_aids.strand.${s}.type`, `PUT /me/character 200: reading_aids.strand.${s}.type`, `POST /join 201: reading_aids.strand.${s}.type`]), rule: 'across' },
  'OwDraught.mode': { at: ['#Draught: mode'] },
  'OwDraught.reader': { at: ['#Draught: reader'] },
  'OwDraught.character.grade': { at: ['#Draught: character.grade'] },
  'OwDraughtItem.grade': { at: ['#Draught: **.grade'] },
  'OwDraught.recent.op': { at: ['#Draught: recent[].op'] },
  'OwDraughtLens.skipped': { at: ['#Draught: lenses[].skipped'] },
  'OwElementBase.changed_via': { at: ['#*: changed_via'] },
  'OwMe.kind': { at: ['GET /me 200: kind'] },
  'OwMe.scope': { at: ['GET /me 200: scope'] },
  'OwMe.lenses_from': { at: ['*: **.lenses_from'] },
  'OwFrontDoor.sponsor.kind': { at: ['GET /me 200: front_door.sponsor.kind'] },
  'OwMySeat.kind': { at: ['GET /me 200: front_door.my_seats[].kind'] },
  'OwMember.kind': { at: ['GET /members 200: data[].kind'] },
  'OwMember.status': { at: ['GET /members 200: data[].status'] },
  'OwMember.lenses_from': { at: ['*: **.lenses_from'] },
  'OwJoinPreview.reader': { at: ['POST /join/preview 200: reader'] },
  'OwWorldLink.reader': { at: ['GET /account/worlds/{world_id}/links 200: data[].reader'] },
  'OwWorldLink.lands_on': { at: ['GET /account/worlds/{world_id}/links 200: data[].lands_on'] },
  'OwWorldLink.status': { at: ['GET /account/worlds/{world_id}/links 200: data[].status'] },
  'OwWorldLens.x_lens.mail': { at: ['GET /world/{world_id}/lenses 200: data[].x_lens.mail'] },
  'OwWorldLens.x_lens.show': { at: ['GET /world/{world_id}/lenses 200: data[].x_lens.show'] },
  'OwWorldLens.x_lens.undated': { at: ['GET /world/{world_id}/lenses 200: data[].x_lens.undated'] },
  'OwWorldPublicPage.palette': { at: ['#World: public_page.palette'] },
  'OwProposedNewElement.state': { at: ['#ProposalList: data[]<1>.state'] },
  'type OwProposalState': { at: ['#Proposal: state'] },
  'type OwProposalHouse': { at: ['#Proposal: house', '#ProposalList: data[]<1>.house'] },
  'type OwDeleteReason': { at: ['#ChangesPage: changes[]<1>.reason'] },
  'type OwResyncReason': { at: ['#ChangesPage: epoch_reason', '#Error: error.reason'] },
  'type OwFileKind': { at: ['GET /character/{id}/files 200: data[].kind', 'POST /character/{id}/files body: kind'] },
  'type ElementType': { at: ['GET /search param: type', 'POST /account/sort body: slice[].type'] },
  // keel's codes: the SDK names three and reserves one keel does not send (errors.ts says why)
  'type OwAuthErrorCode': { at: ['#Error: error.code'], rule: 'within', reserved: ['world_gone'] },
  // what the SDK sends
  'OwV2Client.createSeat.character': { at: ['POST /account/worlds/{world_id}/seats body: character'] },
  'type OwMemberRole': { at: ['POST /account/worlds/{world_id}/seats body: role', 'PATCH /account/worlds/{world_id}/members/{member_id} body: role'] },
  'OwV2Client.createWorldLink.reader': { at: ['POST /account/worlds/{world_id}/links body: reader'] },
  'OwV2Client.createWorldLink.landsOn': { at: ['POST /account/worlds/{world_id}/links body: lands_on'] },
  'OwReviewInput.decision': { at: ['POST /character/{id}/review body: decision'] },
  'OwDraughtPolicy.mode': { at: ['GET /character/{id}/context param: mode'] },
  'OwDraughtPolicy.undated': { at: ['GET /character/{id}/context param: undated'] },
  'type OwDraughtComponent': { at: ['GET /character/{id}/context param: components'] },
  // keel also takes `r` and `w`; the SDK types the long words only
  'OwV2Client.mintWorldKey.scope': { at: ['POST /account/worlds/{world_id}/keys body: scope'], rule: 'within' },
};
const UNION_OWN = {
  'OwTalk.type': 'the room profile\'s talk on an element (schema-dist, serial 135; room.fixture.json\'s talk_cases)',
  'OwDesignPart.type': 'the charter profile\'s design parts (schema-dist, serial 135; charter.fixture.json\'s design_cases)',
  'OwDesignPart.state': 'the charter profile\'s two design states (schema-dist, serial 135)',
  'type OwWorkState': 'the packet profile\'s four states (schema-dist, serial 136; packet.fixture.json\'s state_cases)',
  'type OwCarryStop': 'the map-space profile\'s rule 14, why the walk up parent_map ends (schema-dist, serial 139; map-space.fixture.json\'s frame_cases)',
  'type OwCarryLint': 'the map-space profile\'s rule 13, what is wrong with a Map\'s own x_parent_frame (schema-dist, serial 139; frame_cases)',
  'CHARTER_PAIRS.aid': 'the reading-aid profile (schema-dist), read by the SDK',
  'readingAidOf():return': 'the reading-aid profile (schema-dist), read by the SDK',
  'CalendarEra.direction': 'the calendar profile (schema-dist)',
  'CalendarWeek.mode': 'the calendar profile (schema-dist)',
  'DaySlot.kind': 'the calendar profile\'s reader',
  'OwRecordStory.as': 'the record profile (schema-dist)',
  'OwMapSpaceOutline.shape': 'the map-space profile (schema-dist)',
  'type OwMapSpaceOutReason': 'the map-space reader\'s own reasons',
  'type OwAddressForm': 'the address profile\'s reader',
  'type OwAddressReason': 'the address profile\'s reader',
  'type OwElementMark': 'the SDK\'s reading of an element\'s marks',
  'type OwGraphMark': 'the graph reader\'s marks',
  'type OwGraphCutReason': 'the graph reader\'s cut reasons',
  'type OwLensCutReason': 'the lens profile\'s reader',
  'OwLensReader.rung': 'the lens profile\'s reader rungs',
  'type OwLandingGapKind': 'the landing profile\'s reader',
  'type OwLandingMode': 'the landing profile\'s reader',
  'type OwReportParentKind': 'the report profile\'s reader (rule 9, report.fixture.json\'s parents)',
  'OwReportGroup.kind': 'the report profile\'s reader (rule 9, report.fixture.json\'s groups)',
  'OwReportLint.kind': 'the report profile\'s reader (rule 9, report.fixture.json\'s lints)',
  'type OwSenderStatus': 'the message profile\'s reader (a sender checked against the seat)',
  'type OwLayout3dHow': 'the by-links-3d layout\'s own words for how an element was placed, held by the SDK\'s test to its fixture (pinned by sha256)',
  'type OwLayout3dPart': 'the by-links-3d layout\'s own part words, held by the SDK\'s test to its fixture (pinned by sha256)',
  'OwDoor.from': 'doorsOf\'s own answer',
  'OwLookupReason.kind': 'the world index\'s lookup',
  'OwLookupReason.dir': 'the world index\'s lookup',
  'OwWorldIndex.phrase.kind': 'the world index\'s lookup',
  'type OwWorldFileReason': 'the world file reader (folder spec §4.7)',
  'type OwOpenerKind': 'the tools list (github.com/OnlyWorlds/tools), held by the maintainers\' own check',
  'type OwOpenerState': 'the Open with menu\'s own sentences',
  'type OwToolNeeds': 'the tools list (github.com/OnlyWorlds/tools), held by the maintainers\' own check',
  'OwTool.rung': 'the tools list (github.com/OnlyWorlds/tools), held by the maintainers\' own check',
  'OwOpenerSurface.audience': 'the tools list (github.com/OnlyWorlds/tools), held by the maintainers\' own check',
  'OwWaymarkOptions.ground': 'the Waymark\'s drawing',
  'type OwWaymarkEntry': 'the Waymark\'s drawing',
  'type OwWaymarkReader': 'the Waymark\'s drawing',
  'type ElementGroup': 'presentation\'s colour groups, held by the maintainers\' own checks',
  'elementColor.mode': 'presentation: a light or dark ground',
  'type FieldType': 'the codegen\'s field kinds',
  'type OwKeyKind': 'a key\'s prefix, read in the client',
  'pinExpectation():return': 'the client\'s reading of a key kind',
  'type OwSignInReason': 'the sign-in flow\'s own outcomes, beside keel\'s codes',
  'OwV2Client.request.accountToken': 'the client\'s own routing option',
  'OwRemovedImage.cache': 'the upload host\'s answer (media.onlyworlds.com), not keel\'s document; its own live checks',
  'type OwConvertErrorReason': 'the import door\'s own refusals, held by test/convert-kanka.test.mjs',
  'OwConvertMadeName.source': 'the import doors\' made-name kinds, the same words as the Python package\'s MadeName.source',
  'OwKankaModule.status': 'the Kanka door\'s data file (src/convert/kanka.json, report.how), held by test/convert-kanka.test.mjs',
};
{
  const { unions, unseen } = sdkUnions();
  for (const u of unseen) gap(`9u: a literal pair this reader cannot attribute to a declaration (${u}), so it went unchecked`);
  if (!unions.size) gap('9u: no union of string literals found in the SDK\'s declarations, so 9u went unchecked');
  for (const [id, u] of unions) {
    const row = UNION_ROWS[id];
    if (UNION_OWN[id]) { ok(); continue; }
    if (!row) { gap(`9u: the SDK declares ${id} as ${u.words.map((w) => `'${w}'`).join(' | ')}, which is neither held to the document (UNION_ROWS) nor named as the SDK's own (UNION_OWN)`); continue; }
    if (row.rule === 'across') {
      // one SDK type over several places, each place holding some of its words: every place must be readable,
      // and the places together say exactly the SDK's words. Not held: which word sits at which place.
      const seen = new Set();
      let blind = false;
      for (const loc of row.at) {
        const enums = enumsAt(loc);
        if (!enums.length) { gap(`9u: the document declares no enum at ${loc}, so ${id} went unchecked there`); blind = true; continue; }
        for (const e of enums) for (const w of e) seen.add(w);
      }
      if (blind) continue;
      const missing = u.words.filter((w) => !seen.has(w) && !(row.reserved ?? []).includes(w));
      const extra = [...seen].filter((w) => !u.words.includes(w));
      if (!missing.length && !extra.length) ok();
      else bad(`${id} is ${u.words.map((w) => `'${w}'`).join(' | ')}; the document declares ${[...seen].join(', ')} across its ${row.at.length} places${missing.length ? ` (they lack ${missing.join(', ')})` : ''}${extra.length ? ` (the SDK lacks ${extra.join(', ')})` : ''}`);
      continue;
    }
    for (const loc of row.at) {
      const enums = enumsAt(loc);
      if (!enums.length) { gap(`9u: the document declares no enum at ${loc}, so ${id} went unchecked there`); continue; }
      for (const e of enums) {
        const missing = u.words.filter((w) => !e.includes(w) && !(row.reserved ?? []).includes(w));
        const extra = row.rule === 'within' ? [] : e.filter((w) => !u.words.includes(w));
        if (!missing.length && !extra.length) ok();
        else bad(`${id} is ${u.words.map((w) => `'${w}'`).join(' | ')}${u.open ? ' (open)' : ''}; the document declares ${e.join(', ')} at ${loc}${missing.length ? ` (it lacks ${missing.join(', ')})` : ''}${extra.length ? ` (the SDK lacks ${extra.join(', ')})` : ''}`);
      }
    }
  }
  for (const id of [...Object.keys(UNION_ROWS), ...Object.keys(UNION_OWN)]) {
    if (!unions.has(id)) gap(`9u: a row names ${id}, which the SDK no longer declares as a union of string literals: remove or rename the row`);
  }
}

// 9e: the ask proxy's caps (ASK_LIMITS). Three are schema values on the route's body (question's
// maxLength, context's maxItems, each item's maxLength); the total is only in context's description
// ("12000 characters in all"), read as written: prose the document carries, not a schema value.
if (sdk.ASK_LIMITS) {
  const body = derefSchema(paths['/api/v2/account/ask']?.post?.requestBody?.content?.['application/json']?.schema);
  const q = derefSchema(body?.properties?.question);
  const c = derefSchema(body?.properties?.context);
  const item = derefSchema(c?.items);
  const total = c?.description?.match(/(\d[\d,]*) characters in all/)?.[1]?.replace(/,/g, '');
  const pairs = [['questionMax', q?.maxLength, 'question\'s maxLength'], ['itemsMax', c?.maxItems, 'context\'s maxItems'],
    ['itemMax', item?.maxLength, 'each context item\'s maxLength'], ['totalMax', total === undefined ? undefined : Number(total), 'context\'s description ("N characters in all")']];
  for (const [k, want, where] of pairs) {
    if (want === undefined) gap(`the document gives no ${where} on POST /api/v2/account/ask, so ASK_LIMITS.${k} went unchecked`);
    else sdk.ASK_LIMITS[k] === want ? ok() : bad(`ASK_LIMITS.${k} is ${sdk.ASK_LIMITS[k]}, and the document's POST /api/v2/account/ask gives ${where} as ${want}`);
  }
  for (const k of Object.keys(sdk.ASK_LIMITS)) if (!pairs.some(([p]) => p === k)) gap(`ASK_LIMITS.${k} has no place in this check (9e)`);
}

// 9f: the image cap (PHOTO_MAX_BYTES). Its truth is info.x-ow-limits' image_bytes, the
// ticket's max_bytes the upload host holds a file to.
if (sdk.PHOTO_MAX_BYTES !== undefined) {
  const e = doc.info?.['x-ow-limits']?.image_bytes;
  if (!e) gap('the document\'s info.x-ow-limits has no image_bytes, so PHOTO_MAX_BYTES went unchecked');
  else if (e.unit !== 'bytes') gap(`x-ow-limits' image_bytes is in ${e.unit}, not bytes: PHOTO_MAX_BYTES went unchecked`);
  else sdk.PHOTO_MAX_BYTES === e.value ? ok() : bad(`PHOTO_MAX_BYTES is ${sdk.PHOTO_MAX_BYTES}; x-ow-limits' image_bytes is ${e.value}`);
}

// 9g: the image types (PHOTO_TYPES). The upload host's rule (its Worker); the document restates it only
// as prose, the error catalogue's `unsupported_type` summary ("An image must be webp, png, jpeg or avif;"),
// read as written. A summary no longer in that shape is a GAP, never a pass.
if (sdk.PHOTO_TYPES) {
  const summary = CODE_LIST?.unsupported_type?.summary;
  const words = summary?.match(/An image must be ([a-z0-9, ]+?);/)?.[1]?.split(/,\s*|\s+or\s+/).filter(Boolean);
  if (!words?.length) gap('the error catalogue\'s unsupported_type gives no "An image must be ...;" sentence, so PHOTO_TYPES went unchecked');
  else {
    const want = words.map((w) => `image/${w}`);
    const given = [...sdk.PHOTO_TYPES];
    for (const t of want) given.includes(t) ? ok() : bad(`unsupported_type's summary accepts ${t}, which PHOTO_TYPES leaves out`);
    for (const t of given) want.includes(t) ? ok() : bad(`PHOTO_TYPES gives ${t}, which unsupported_type's summary does not accept`);
  }
}

// 9c: the review profile's mark (4.83.0). Its truth is the profile page's key names ("Profile `review`,
// two fields: `x_review_proposed`, ..."), read where the canonical world fields are read: --schema-dist. A page that no longer says it in that shape is a GAP, never a pass.
if (sdk.PROPOSED_MARK !== undefined) {
  const reviewMd = resolve(SCHEMA_DIST, 'profiles', 'review.md');
  const page = existsSync(reviewMd) ? readFileSync(reviewMd, 'utf8') : null;
  const named = page?.match(/Profile `review`, two fields: `(x_[a-z_]+)`/)?.[1];
  if (!page) gap(`${reviewMd} not readable: PROPOSED_MARK went unchecked`);
  else if (!named) gap('profiles/review.md no longer names its fields as "Profile `review`, two fields: `…`", so PROPOSED_MARK went unchecked');
  else if (sdk.PROPOSED_MARK === named) ok();
  else bad(`PROPOSED_MARK is "${sdk.PROPOSED_MARK}"; the review profile names its proposed mark "${named}"`);
}

// 9h: the strand profile's mark (4.119.0). Its truth is the fixture's `mark.field`, read where 9c reads:
// --schema-dist. A fixture with no mark field is a GAP, never a pass.
if (sdk.STRAND_FIELD !== undefined) {
  const strandFx = resolve(SCHEMA_DIST, 'profiles', 'strand.fixture.json');
  const text = existsSync(strandFx) ? readFileSync(strandFx, 'utf8') : null;
  let field;
  try { field = text === null ? undefined : JSON.parse(text)?.mark?.field; } catch { field = undefined; }
  if (text === null) gap(`${strandFx} not readable: STRAND_FIELD went unchecked`);
  else if (typeof field !== 'string') gap('profiles/strand.fixture.json names no mark.field, so STRAND_FIELD went unchecked');
  else if (sdk.STRAND_FIELD === field) ok();
  else bad(`STRAND_FIELD is "${sdk.STRAND_FIELD}"; the strand fixture names its mark "${field}"`);
}

// 9i: the record profile's mark (4.124.0, serial 102). Its truth is the fixture's `mark.field`, read as 9h reads.
if (sdk.RECORD_FIELD !== undefined) {
  const recordFx = resolve(SCHEMA_DIST, 'profiles', 'record.fixture.json');
  const text = existsSync(recordFx) ? readFileSync(recordFx, 'utf8') : null;
  let field;
  try { field = text === null ? undefined : JSON.parse(text)?.mark?.field; } catch { field = undefined; }
  if (text === null) gap(`${recordFx} not readable: RECORD_FIELD went unchecked`);
  else if (typeof field !== 'string') gap('profiles/record.fixture.json names no mark.field, so RECORD_FIELD went unchecked');
  else if (sdk.RECORD_FIELD === field) ok();
  else bad(`RECORD_FIELD is "${sdk.RECORD_FIELD}"; the record fixture names its mark "${field}"`);
}

// 9d: the lens profile's date table (4.96.0). Its truth is the fixture's `date_table`, which the profile's
// rule 8 states in prose, read where 9c reads: --schema-dist. Each type the table
// dates, and each it leaves timeless, must agree; a fixture with no table is a GAP, never a pass.
if (sdk.DATE_FIELD !== undefined) {
  const lensFx = resolve(SCHEMA_DIST, 'profiles', 'lens.fixture.json');
  const raw = existsSync(lensFx) ? readFileSync(lensFx, 'utf8') : null;
  const table = raw ? JSON.parse(raw).date_table : undefined;
  if (!raw) gap(`${lensFx} not readable: DATE_FIELD went unchecked`);
  else if (!table || typeof table !== 'object') gap('profiles/lens.fixture.json carries no date_table, so DATE_FIELD went unchecked');
  else {
    for (const t of new Set([...Object.keys(table), ...Object.keys(sdk.DATE_FIELD)])) {
      if (table[t] === sdk.DATE_FIELD[t]) ok();
      else bad(`DATE_FIELD.${t} is ${JSON.stringify(sdk.DATE_FIELD[t])}; the lens profile's date table says ${JSON.stringify(table[t])}`);
    }
  }
}

// 9b: the agent doors. Which doors are an agent's is said in the description of
// changed_via (since 2026-11-20, "The first three are the doors the platform marks as an AI's.";
// before it, "The first three mean an agent made it."); a reworded description is a GAP, never a pass.
const DOORS_SENTENCE = "The first three are the doors the platform marks as an AI's.";
if (sdk.AGENT_DOORS) {
  const doorEnums = [...enumsOf(schemas, 'changed_via'), ...enumsOf(schemas, 'deleted_via')];
  const described = JSON.stringify(schemas).includes(DOORS_SENTENCE);
  if (!doorEnums.length) gap('the document declares no changed_via enum, so AGENT_DOORS went unchecked');
  else if (!described) gap(`the changed_via description no longer says "${DOORS_SENTENCE}", so which doors are an AI's could not be read: AGENT_DOORS went unchecked`);
  else {
    const doors = doorEnums[0];
    if (doorEnums.some((e) => e.join(',') !== doors.join(','))) bad(`changed_via and deleted_via declare different door orders: ${[...new Set(doorEnums.map((e) => e.join(',')))].join(' | ')}`);
    else ok();
    sameSet([...sdk.AGENT_DOORS], doors.slice(0, 3)) ? ok() : bad(`AGENT_DOORS is ${sdk.AGENT_DOORS.join(', ')}; the document's first three doors, which it calls an agent's, are ${doors.slice(0, 3).join(', ')}`);
  }
}

// ---- the report ----------------------------------------------------------------------------------

const docText = JSON.stringify(doc);
const named = SDK_CODES.filter((c) => docText.includes(c));
const silent = SDK_CODES.filter((c) => !docText.includes(c));
const called = new Set([...seen].map((k) => k.split(' ')[1]));
const uncalled = Object.keys(paths).filter((p) => !called.has(p) && !/^\/api\/v2\/(?:account|health\/deep)/.test(p));
const accountRoutes = Object.keys(paths).filter((p) => p.startsWith('/api/v2/account') && !called.has(p)).length;

console.log('');
console.log('NOT COVERED — the document gives no schema for these, so this gate is blind to them:');
console.log(`  ${schemaBlind.length ? schemaBlind.join('; ') : 'the feed page, its parameters and the bulk result are covered (5f) since 2026-10-12'}.`);
const blindBodies = [...bodyBlind];
if (blindBodies.length) console.log(`  Request bodies the client sends where the document gives no schema (what it sends there is unchecked): ${blindBodies.join(', ')}.`);
if (answerBlind.size) console.log(`  Answers the client reads where the document gives no success schema (what it reads there is unchecked): ${[...answerBlind].join(', ')}.`);
console.log(`  The image upload itself: uploadImage's second request goes to the upload host (its own contract), which keel's document does not describe${HAS_TICKET ? '' : '; this SDK has no createMediaTicket, so the ticket route and its fields went unchecked too'}.`);
if (typeof OwV2Client.prototype.uploadFile === 'function') console.log('  The file upload itself: uploadFile\'s second request goes to the upload host (its own contract), outside the document: its shape is held (1), the host\'s answers are not. POST /files/uploaded and /files/removed are the host\'s own signed reports: the SDK never calls them.');
if (CODE_LIST) console.log(`  Public codes the SDK has no branch for (it surfaces them as OwApiError.code; not a failure): ${unflagged.join(', ') || 'none'}.`);
else {
  console.log(`  Error codes the SDK keys on that the document never names: ${silent.join(', ') || 'none'}.`);
  console.log(`  (named in it: ${named.join(', ') || 'none'}.)`);
}
if (agentBlind) console.log('  The agent declaration (2a): this SDK has no agent option (before 4.26.0), so X-OW-Agent went unchecked.');
console.log(`  The unrouted-path envelope (7b, live): ${LIVE_PROBE}.`);
console.log(`  TokenResource (5t): the document has no /tokens/ path, so its routes were asked of production instead: ${TOKEN_PROBE}.${TOKEN_DEAD.length ? ` Deprecated in the SDK and unrouted, as marked (they leave in 5.0): ${TOKEN_DEAD.join(', ')}.` : ''}`);
if (keelUnchecked.length) console.log(`  Constants copied from keel's rules that the document gives no source for (9; their values are unchecked): ${keelUnchecked.join(', ')}.`);
console.log('  FILE_EXTENSIONS\' extensions are keel\'s NAME_EXTS, not in the document; only the kinds they give are checked (9a). PHOTO_TYPES is held to the error catalogue\'s prose (9g), not to the upload host itself.');
console.log(`  ${accountRoutes} account routes the SDK has no client for${uncalled.length ? `; other operations it never calls: ${uncalled.join(', ')}` : ''}.`);
console.log('');

if (drift.length) {
  console.log(`FAIL — ${drift.length} difference(s) between @onlyworlds/sdk ${pkg.version} and keel's own document.`);
  if (gaps.length) console.log(`       (also ${gaps.length} gap(s) in this checker — see above)`);
  process.exit(1);
}
if (gaps.length) {
  console.log(`INCOMPLETE — ${gaps.length} gap(s) IN THIS CHECKER, ${checks} check(s) passed. The unchecked parts were not checked.`);
  process.exit(1);
}
console.log(`PASS — ${checks} check(s): @onlyworlds/sdk ${pkg.version} sends only routes and parameters the document has, knows exactly its fields, and reads its envelopes. Blind spots above.`);
process.exit(0);
