/**
 * The world folder as a source (`@onlyworlds/sdk/folder`): `folderFetch` answers the client's reads
 * from a folder's files as keel answers them for the world's owner, and refuses the rest with one
 * answer, a 501 `not_in_a_folder`.
 *
 * Three parts. The reader conformance fixture (Atlas's `tests/fixtures/folder-conformance/`, v1.2.2),
 * fetched at test time from the public Atlas repository at a pinned commit, every file held to its
 * sha256: a file that cannot be fetched, or whose hash differs, FAILS the test, never skips it. Then
 * each rule on a small folder built here, through the raw fetch. Then the client itself, through
 * `OwV2Client`'s own list, listAll, get, getWorld, search and health, with no key.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OwV2Client, OwApiError } from '../dist/index.js';
import { folderFetch, entriesFromDirectory, NOT_IN_A_FOLDER, NOT_IN_A_FOLDER_MESSAGE, NOT_IN_A_FOLDER_STATUS } from '../dist/folder.js';
import { objectParameters } from './options-surface.mjs';

const enc = new TextEncoder();
const file = (path, value) => ({ path, data: enc.encode(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W = '0192a000-aaaa-7bbb-8ccc-000000000001';
const M1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const BASE = 'https://www.onlyworlds.com/api/v2';

async function call(fetchFn, path, init) {
  const res = await fetchFn(`${BASE}${path}`, init);
  return { status: res.status, body: await res.json() };
}

const REFUSAL = {
  error: {
    type: 'api_error',
    code: 'not_in_a_folder',
    message: 'A world folder cannot answer this: it lives on the platform.',
    param: null,
    doc_url: 'https://onlyworlds.github.io/docs/development/typescript#a-world-folder-as-the-source',
  },
};

function assertRefused(answer, what) {
  assert.equal(answer.status, 501, `${what}: status`);
  assert.deepEqual(answer.body, REFUSAL, `${what}: the envelope`);
}

/** keel's cursor: base64url (padded, as Python writes it) of json.dumps({"s": seq, "i": id}). */
const cursorOf = (s, i) => Buffer.from(`{"s": ${s === null ? 'null' : s}, "i": "${i}"}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

// --- the small folder ------------------------------------------------------------------------------

function harbour(extra = []) {
  return [
    file('world.json', {
      id: W, name: 'Harbour', description: 'A port.', time_basic_unit: 'Year', time_current: 1200,
      api: { world_id: W, api_key: 'never-served' }, format_version: '0.3.24', x_names: { character: 'Soul' },
    }),
    file('elements/character/ada--00000001.json', {
      id: id(1), type: 'character', name: 'Ada Copper', change_seq: 5, supertype: 'Smith',
      description: 'Works the copper mine below the harbour.', birthplace: id(20), created_by: M1,
      created_at: '2026-01-01T00:00:00+00:00',
    }),
    file('elements/character/bram--00000002.json', { id: id(2), name: 'Bram', change_seq: 2, supertype: '  SMITH ', background: 'More ore than sense.' }),
    file('elements/character/cora--00000003.json', { id: id(3), name: 'Cora', change_seq: 2, hidden: true }),
    file('elements/character/dag--00000004.json', { id: id(4), name: 'Dag', supertype: 'meſſage', subtype: '' }),
    file('elements/character/eve--00000005.json', { id: id(5), name: 'eve', x_note: { kept: [1, 2] }, species: [id(60), null, id(60)] }),
    file('elements/location/mine--00000020.json', { id: id(20), name: 'Copper Mine', description: 'A mine of copper.', change_seq: 1 }),
    file('elements/map/coast--00000040.json', { id: id(40), name: 'Coast', change_seq: 3 }),
    file('elements/pin/mine-pin--00000030.json', { id: id(30), name: 'Mine pin', map_id: id(40), element_type: 'location', element_id: id(20), x: 1, y: 2 }),
    file('elements/narrative/to-ada--00000050.json', { id: id(50), name: 'To Ada', supertype: 'Message', characters: [id(1)] }),
    file('elements/narrative/to-all--00000051.json', { id: id(51), name: 'To all', supertype: 'message', characters: [] }),
    ...extra,
  ];
}

// --- (a) the conformance fixture, fetched at the pinned commit ----------------------------------------

const ATLAS = 'https://raw.githubusercontent.com/OnlyWorlds/atlas/b000d23921c41a6e1b672783e76bc710432d77f5/tests/fixtures/folder-conformance/';
const FIXTURE = [
  ['expected.json', 'e42060234597b0bff1a1aeb30b4fd540d46656c7d08d0a3ad0608eb339912f77'],
  ['world/elements/character/11111111-2222-4333-8444-555555555509.json', 'bc250479ae100f9ebca77b4c7cc09457b7bcbaa900705d61310e8185271d1446'],
  ['world/elements/character/declared-elsewhere--55555502.json', '8d06cec1cebae0b185bb99fc306e48d44c8c87176a2f904048f9eb6c5bd18d6f'],
  ['world/elements/character/extension-bearer--55555507.json', '7905e89b69e1d25bda1083bc36ac73a2663ae592de7a012cdbea3d290e283cd4'],
  ['world/elements/character/idless.json', '943eb6fb275a526901ffb330b2c2e6eda488e07cf034b57297b536e55c5ebbe2'],
  ['world/elements/character/not-json.json', '6def7d1f6da326037346c2698878c61d33c50d9e8e12f3ae4e73a5e8c2255353'],
  ['world/elements/character/null-fields--5555550a.json', '870f6dd7088c2f7352fe08c2745394fdd0f4f3e346e5305c7050d6ce50b3c200'],
  ['world/elements/character/only-name--55555501.json', '7ef38aa1af10400dedccdcfdc98860cd390c842d0dc910f2800bdb4e90b0a9ef'],
  ['world/elements/map/the-territory--55555503.json', '29773b9480b42afd6c41f403aefba094d62d3c43afda0056e45882422ea7fe3b'],
  ['world/elements/pin/on-the-map--55555508.json', '54544c52584c6c51068f26bff01474cfea48462d91718b13487174087f71d01d'],
  ['world/elements/pin/wandering-pin--55555505.json', '4fedc9d7e948e9c7b77a69c2e2da227f44914a683d04e6757775e5b9d599f27e'],
  ['world/elements/zone/the-border--55555504.json', '690c1aeacb374be1ed6932b1bea58c715660b7dfb2e19108ddbd1a65adacfbc2'],
  ['world/spatial/map/legacy-map--55555506.json', '2906927b3397758bb3fdf2094f67ca41deb817ced3ed85b8747582ecea56eb10'],
  ['world/world.json', 'b303008ad2dfa867a9f4eb4568e881297c410fc78d45f35c1ec5cecba22f7fa9'],
];

/** Every fixture file, fetched and held to its hash; any failure throws, so the test fails. */
async function fetchFixture() {
  return Promise.all(FIXTURE.map(async ([path, sha]) => {
    let res;
    try {
      res = await fetch(ATLAS + path);
    } catch (cause) {
      throw new Error(`the conformance fixture could not be fetched (${path}): ${cause}`);
    }
    assert.equal(res.status, 200, `fetching ${path}`);
    const data = new Uint8Array(await res.arrayBuffer());
    assert.equal(createHash('sha256').update(data).digest('hex'), sha, `${path}: the bytes are not the pinned fixture's`);
    return { path, data };
  }));
}

test('Atlas\'s reader conformance fixture (v1.2.2): every element found, the body\'s type, the broken files skipped and counted', async () => {
  const files = await fetchFixture();
  const expected = JSON.parse(new TextDecoder().decode(files.find((f) => f.path === 'expected.json').data));
  assert.equal(expected.fixture_version, '1.2.2');
  const entries = files.filter((f) => f.path.startsWith('world/')).map((f) => ({ path: f.path.slice('world/'.length), data: f.data }));
  let report;
  const client = new OwV2Client({ fetch: folderFetch(entries, { onRead: (r) => { report = r; } }) });

  const world = await client.getWorld();
  assert.equal(world.id, expected.world.id);
  assert.equal(world.name, expected.world.name);

  const served = [];
  for (const type of ['character', 'location', 'map', 'zone', 'pin']) {
    for await (const el of client.listAll(type)) served.push(el);
  }
  const want = [...expected.elements, ...expected.legacy_elements];
  assert.equal(served.length, want.length, 'a legacy-tolerant reader finds elements[] and legacy_elements[]');
  for (const e of want) {
    const got = served.find((s) => s.id === e.id);
    assert.ok(got, `${e.name || e.id} is served`);
    assert.equal(got.name, e.name, `${e.id}: its name, the empty one included`);
    assert.equal(got.type, e.type, `${e.id}: its type (the body wins over the directory)`);
    for (const key of e.must_not_have ?? []) assert.equal(key in got, false, `${e.id}: no ${key} is made up`);
    for (const [field, target] of Object.entries(e.links ?? {})) {
      assert.equal(got[field], target, `${e.id}: ${field} resolves under the spec spelling`);
      const linked = await client.get('map', target);
      assert.equal(linked.name, 'The Territory');
    }
  }
  assert.equal((await client.get('location', '11111111-2222-4333-8444-555555555502')).name, 'Declared Elsewhere');
  const bearer = await client.get('character', '11111111-2222-4333-8444-555555555507');
  assert.equal(bearer.x_probe_note, 'unknown to every implementation; must survive a read-write round trip unchanged');
  const wandering = await client.get('pin', '11111111-2222-4333-8444-555555555505');
  assert.equal(wandering.map, null, 'a mapless pin is given no map');
  assert.equal(wandering.element_id, null);

  assert.equal(report.elements, want.length);
  assert.equal(report.legacy, expected.legacy_elements.length);
  assert.deepEqual(
    report.skipped.map((s) => s.path).sort(),
    expected.skipped_files.map((s) => s.path).sort(),
    'the id-less and the unparseable file are skipped, and only they',
  );
  assert.deepEqual(Object.fromEntries(report.skipped.map((s) => [s.path, s.reason])), {
    'elements/character/idless.json': 'no_id',
    'elements/character/not-json.json': 'not_json',
  });
});

// --- (b) each rule, through the raw fetch ------------------------------------------------------

test('the one refusal: a 501 in keel\'s envelope, code not_in_a_folder, the exact message', async () => {
  assert.equal(NOT_IN_A_FOLDER, 'not_in_a_folder');
  assert.equal(NOT_IN_A_FOLDER_STATUS, 501);
  assert.equal(NOT_IN_A_FOLDER_MESSAGE, 'A world folder cannot answer this: it lives on the platform.');
  const f = folderFetch(harbour());
  for (const path of ['/changes/', '/me/', '/members/', '/world/files', '/world/hidden', '/world/proposals', '/account/worlds',
    `/character/${id(1)}/context`, `/character/${id(1)}/files`, `/character/${id(1)}/proposals`, '/bulk/', '/nowhere/']) {
    assertRefused(await call(f, path), `GET ${path}`);
  }
});

test('every write method refuses before reading anything', async () => {
  let reads = 0;
  // world.json does not parse: a read would answer 500, so a 501 proves nothing was read.
  const f = folderFetch([file('world.json', '{ not json')], { onRead: () => { reads++; } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const res = await f(`${BASE}/character/${id(1)}/`, { method, body: method === 'HEAD' ? undefined : '{}' });
    assert.equal(res.status, 501, method);
    assert.deepEqual(await res.json(), REFUSAL, method);
  }
  assertRefused(await call(f, '/world/', { method: 'PATCH', body: '{}' }), 'PATCH /world/');
  assert.equal(reads, 0, 'no write read the entries');
  const r = await call(f, '/world/');
  assert.equal(r.status, 500, 'then a read reads them, and the folder with no world says so');
  assert.equal(r.body.error.code, 'api_error');
  assert.equal(reads, 1);
});

test('GET /health/ answers {"status": "ok"} once the entries are read; /health/deep is refused', async () => {
  let reads = 0;
  const f = folderFetch(harbour(), { onRead: () => { reads++; } });
  assert.deepEqual(await call(f, '/health/'), { status: 200, body: { status: 'ok' } });
  assert.deepEqual(await call(f, '/health'), { status: 200, body: { status: 'ok' } });
  assert.equal(reads, 1, 'read once, on the first request');
  assertRefused(await call(f, '/health/deep'), '/health/deep');
  await call(f, '/character/');
  assert.equal(reads, 1, 'a snapshot: never read again');
});

test('as= and world= on a read are refused with the one refusal', async () => {
  const f = folderFetch(harbour());
  assertRefused(await call(f, `/character/?as=${M1}`), 'as on a list');
  assertRefused(await call(f, `/character/?world=${W}`), 'world on a list');
  assertRefused(await call(f, `/character/?limit=5&world=${W}`), 'world beside a filter');
  assertRefused(await call(f, `/character/${id(1)}/?as=${M1}`), 'as on a get');
  assertRefused(await call(f, `/search?q=copper&world=${W}`), 'world on search');
  assertRefused(await call(f, `/world/?world=${W}`), 'world on the world');
});

test('the order: (change_seq, id), every unstamped element after every stamped one, by id', async () => {
  const f = folderFetch(harbour());
  const { body } = await call(f, '/character/');
  assert.deepEqual(body.data.map((e) => e.id), [id(2), id(3), id(1), id(4), id(5)]);
  assert.equal(body.has_more, false);
  assert.equal(body.next_cursor, null);
});

test('a cursor walk across pages: keel\'s cursor, "s": null past the stamped elements', async () => {
  const f = folderFetch(harbour());
  const one = (await call(f, '/character/?limit=2')).body;
  assert.deepEqual(one.data.map((e) => e.id), [id(2), id(3)]);
  assert.equal(one.has_more, true);
  assert.equal(one.next_cursor, cursorOf(2, id(3)));
  // The same bytes Python's base64.urlsafe_b64encode(json.dumps(...)) writes, padding and all.
  assert.equal(cursorOf(2, id(2)), 'eyJzIjogMiwgImkiOiAiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyIn0=');
  const two = (await call(f, `/character/?limit=2&cursor=${one.next_cursor}`)).body;
  assert.deepEqual(two.data.map((e) => e.id), [id(1), id(4)]);
  assert.equal(two.next_cursor, cursorOf(null, id(4)));
  const three = (await call(f, `/character/?limit=2&cursor=${two.next_cursor}`)).body;
  assert.deepEqual(three.data.map((e) => e.id), [id(5)]);
  assert.equal(three.has_more, false);
  assert.equal(three.next_cursor, null);
  const bad = await call(f, '/character/?cursor=bm90IGEgY3Vyc29y');
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.message, 'Invalid cursor.');
  assert.equal(bad.body.error.param, 'cursor');
});

test('limit: 100 by default, clamped to 1 to 1000, a 422 when it is not an integer', async () => {
  const many = Array.from({ length: 120 }, (_, n) => file(`elements/trait/t${n}.json`, { id: id(1000 + n), name: `T${n}` }));
  const f = folderFetch(harbour(many));
  const first = (await call(f, '/trait/')).body;
  assert.equal(first.data.length, 100);
  assert.equal(first.has_more, true);
  assert.equal((await call(f, '/trait/?limit=0')).body.data.length, 1);
  assert.equal((await call(f, '/trait/?limit=-3')).body.data.length, 1);
  const all = (await call(f, '/trait/?limit=5000')).body;
  assert.equal(all.data.length, 120);
  assert.equal(all.has_more, false);
  const bad = await call(f, '/trait/?limit=ten');
  assert.equal(bad.status, 422);
  assert.deepEqual([bad.body.error.message, bad.body.error.param], ['limit must be an integer.', 'limit']);
});

test('filters: name, name__icontains, supertype and subtype by the case fold, ids, created_by, links, characters', async () => {
  const f = folderFetch(harbour());
  const ids = async (q, type = 'character') => (await call(f, `/${type}/?${q}`)).body.data.map((e) => e.id);
  assert.deepEqual(await ids('name=Bram'), [id(2)]);
  assert.deepEqual(await ids('name=bram'), [], 'name is exact');
  assert.deepEqual(await ids('name__icontains=COPP'), [id(1)]);
  assert.deepEqual(await ids('name__icontains='), [id(2), id(3), id(1), id(4), id(5)], 'an empty icontains filters nothing');
  assert.deepEqual(await ids('supertype=smith'), [id(2), id(1)], 'trimmed and without regard to case');
  assert.deepEqual(await ids('supertype=%20SMITH%20%20'), [id(2), id(1)]);
  assert.deepEqual(await ids('supertype=MESSAGE'), [id(4)], 'the simple fold takes the long s to s');
  assert.deepEqual(await ids('supertype=Smiths'), [], 'the whole value, never a prefix');
  assert.deepEqual(await ids('subtype='), [id(2), id(3), id(1), id(4), id(5)], 'an empty value lists the rows whose value is empty');
  assert.deepEqual(await ids(`ids=${id(5)},${id(1).toUpperCase()}`), [id(1), id(5)], 'ids compare as UUIDs');
  assert.deepEqual(await ids('created_by=owner'), [id(2), id(3), id(4), id(5)]);
  assert.deepEqual(await ids(`created_by=${M1}`), [id(1)]);
  assert.deepEqual(await ids(`birthplace=${id(20)}`), [id(1)]);
  assert.deepEqual(await ids('birthplace='), [id(2), id(3), id(4), id(5)], 'an empty link filter lists the rows with none');
  assert.deepEqual(await ids(`map=${id(40)}`, 'pin'), [id(30)], 'map_id on disk is the link map');
  assert.deepEqual(await ids(`element=${id(20)}`, 'pin'), [id(30)], 'a link of any type filters by its id');
  assert.deepEqual(await ids(`characters=${id(1)}`, 'narrative'), [id(50)]);
  assert.deepEqual(await ids('characters=', 'narrative'), [id(51)]);
  const bad = await call(f, '/character/?birthplace=nope');
  assert.deepEqual([bad.status, bad.body.error.message, bad.body.error.param], [422, 'birthplace must be a UUID.', 'birthplace']);
  const badIds = await call(f, '/character/?ids=nope');
  assert.equal(badIds.body.error.message, "ids must be a comma-separated list of ids; 'nope' is not one.");
  const badBy = await call(f, '/character/?created_by=me');
  assert.equal(badBy.body.error.message, 'created_by must be a membership id (as GET /members lists them) or owner.');
});

test('an unknown parameter is a 422 naming it and the type\'s filters; ordering has its own', async () => {
  const f = folderFetch(harbour());
  const r = await call(f, '/character/?name__startswith=A');
  assert.equal(r.status, 422);
  assert.equal(r.body.error.type, 'invalid_request');
  assert.equal(r.body.error.code, 'invalid_request');
  assert.equal(r.body.error.param, 'name__startswith');
  assert.equal(r.body.error.message, "Unknown filter 'name__startswith'. Filters: name, name__icontains, supertype, subtype, ids, created_by, birthplace, location.");
  const narr = await call(f, '/narrative/?q=x');
  assert.match(narr.body.error.message, /Filters: name, name__icontains, supertype, subtype, ids, created_by, characters, /);
  const ord = await call(f, '/character/?ordering=name');
  assert.equal(ord.status, 422);
  assert.equal(ord.body.error.message, 'ordering is not supported: lists come in change order (the order the cursor walks). Sort the results on your side.');
  const s = await call(f, '/search?q=copper&page=2');
  assert.deepEqual([s.status, s.body.error.message, s.body.error.param], [422, "Unknown query parameter 'page'. Parameters: q, type, limit.", 'page']);
});

test('one element, and keel\'s not-found and malformed-id answers', async () => {
  const f = folderFetch(harbour());
  const ok = await call(f, `/character/${id(1)}/`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.name, 'Ada Copper');
  const missing = await call(f, `/character/${id(99)}`);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: {
    type: 'not_found', code: 'not_found', message: `character '${id(99)}' not found.`, param: null,
    doc_url: 'https://onlyworlds.github.io/api/errors/#not_found',
  } });
  assert.equal((await call(f, `/location/${id(1)}`)).status, 404, 'an id is found only as its own type');
  const bad = await call(f, '/character/not-an-id');
  assert.deepEqual([bad.status, bad.body.error.message, bad.body.error.param], [422, 'id must be a UUID.', 'id']);
});

test('the body keel serves: the schema\'s unset values filled, the server\'s fields only when the file has them', async () => {
  const f = folderFetch(harbour());
  const dag = (await call(f, `/character/${id(4)}`)).body;
  assert.equal(dag.type, 'character');
  assert.equal(Object.keys(dag)[0], 'type');
  assert.equal(dag.description, '');
  assert.equal(dag.background, '');
  assert.equal(dag.height, null);
  assert.equal(dag.birthplace, null);
  assert.deepEqual(dag.species, []);
  for (const key of ['created_at', 'updated_at', 'change_seq', 'created_by', 'changed_by', 'changed_via', 'changed_client', 'doors', 'hidden']) {
    assert.equal(key in dag, false, `no ${key} is made up`);
  }
  const ada = (await call(f, `/character/${id(1)}`)).body;
  assert.equal(ada.created_at, '2026-01-01T00:00:00+00:00');
  assert.equal(ada.change_seq, 5);
  const eve = (await call(f, `/character/${id(5)}`)).body;
  assert.deepEqual(eve.x_note, { kept: [1, 2] }, 'an extension, verbatim');
  assert.deepEqual(eve.species, [id(60)], 'each element once, no null entry');
  const pin = (await call(f, `/pin/${id(30)}`)).body;
  assert.equal(pin.map, id(40));
  assert.equal('map_id' in pin, false, 'served under the wire name');
  assert.equal(pin.element_type, 'location');
  assert.equal(pin.element_id, id(20));
});

test('a hidden element is served with its mark, whatever fields asked', async () => {
  const f = folderFetch(harbour());
  const cora = (await call(f, `/character/${id(3)}`)).body;
  assert.equal(cora.hidden, true);
  assert.deepEqual((await call(f, `/character/${id(3)}?fields=name`)).body, { name: 'Cora', hidden: true });
  const listed = (await call(f, '/character/')).body.data.find((e) => e.id === id(3));
  assert.equal(listed.hidden, true);
});

test('fields and expand, as keel does them', async () => {
  const f = folderFetch(harbour());
  assert.deepEqual((await call(f, `/character/${id(1)}?fields=name,supertype`)).body, { name: 'Ada Copper', supertype: 'Smith' });
  const two = await call(f, `/character/${id(1)}?fields=name,colour,shade`);
  assert.equal(two.status, 422);
  assert.equal(two.body.error.message, 'Unknown fields in ?fields: colour, shade');
  assert.deepEqual(two.body.error.unknown_fields, ['colour', 'shade']);
  const one = await call(f, `/character/${id(1)}?fields=map`);
  assert.equal(one.body.error.message, 'Unknown field in ?fields: map');
  assert.deepEqual(one.body.error.types_with_field, { map: ['marker', 'pin'] });
  const ada = (await call(f, `/character/${id(1)}?expand=birthplace`)).body;
  assert.deepEqual(ada.birthplace, { id: id(20), name: 'Copper Mine', supertype: '', subtype: '', image_url: '' });
  const eve = (await call(f, `/character/${id(5)}?expand=species`)).body;
  assert.deepEqual(eve.species, [], 'a link to nothing in the folder misses, as keel\'s resolver does');
  const pin = (await call(f, `/pin/${id(30)}?expand=element,map`)).body;
  assert.equal(pin.element_type, 'location');
  assert.equal(pin.element_id.name, 'Copper Mine');
  assert.equal(pin.map.name, 'Coast');
  const bad = await call(f, `/character/${id(1)}?expand=name`);
  assert.deepEqual([bad.status, bad.body.error.message, bad.body.error.param], [422, 'Cannot expand non-link field: name', 'expand']);
});

test('search: every word whole, in the name or the prose, name hits first; keel\'s refusals', async () => {
  const f = folderFetch(harbour());
  const s = async (q) => (await call(f, `/search?${q}`)).body;
  const copper = await s('q=copper');
  assert.equal(copper.query, 'copper');
  assert.deepEqual(copper.results.map((r) => r.id), [id(1), id(20)], 'name hits first, then by type order');
  assert.deepEqual(copper.results[0], {
    type: 'character', id: id(1), name: 'Ada Copper', supertype: 'Smith', subtype: '', field: 'name', snippet: 'Ada Copper',
  });
  assert.equal(copper.truncated, false);
  assert.deepEqual((await s('q=ore')).results.map((r) => r.id), [id(2)], '"ore" is a word in Bram\'s background, never inside "more"');
  assert.deepEqual((await s('q=or')).results.map((r) => r.id), [], 'a word is never a part of one');
  assert.deepEqual((await s('q=copper%20mine')).results.map((r) => r.id), [id(20), id(1)], 'both words, anywhere in the element');
  const bram = (await s('q=SENSE')).results[0];
  assert.deepEqual([bram.field, bram.snippet], ['background', 'More ore than sense.']);
  assert.deepEqual((await s('q=copper&type=location')).results.map((r) => r.id), [id(20)]);
  const capped = await s('q=copper&limit=1');
  assert.deepEqual([capped.count, capped.truncated], [1, true]);
  assert.equal((await s('q=Smith')).count, 0, 'the short labels are not searched');
  const short = await call(f, '/search?q=a');
  assert.deepEqual([short.status, short.body.error.message], [422, 'q must be 2 to 200 characters (it has 1).']);
  assert.equal((await call(f, '/search')).body.error.message, 'q is required: 2 to 200 characters.');
  assert.equal((await call(f, '/search?q=--')).body.error.message, 'q must hold at least one word (letters or digits).');
  assert.match((await call(f, '/search?q=copper&type=place')).body.error.message, /^Unknown type 'place'\. Types: ability, collective, character, /);
});

test('the world: world.json without api, the now under either spelling as the wire spells it, the counts', async () => {
  const f = folderFetch(harbour());
  const w = (await call(f, '/world/')).body;
  assert.equal(w.id, W);
  assert.equal(w.time_range_current, 1200);
  assert.equal('time_current' in w, false);
  assert.equal('api' in w, false, 'the sync switch and its key are never served');
  assert.equal('format_version' in w, false, 'keel serves no such key');
  assert.equal('public_read' in w, false, 'a key the file does not hold stays absent');
  assert.deepEqual(w.x_names, { character: 'Soul' });
  assert.equal(w.counts.total, 10);
  assert.equal(w.counts.types.character, 5);
  assert.equal(w.counts.types.ability, 0);
  assert.deepEqual(Object.keys(w.counts.types), Object.keys(w.counts.types).slice().sort());
  const wire = folderFetch([file('world.json', { id: W, name: 'H', time_current: null, time_range_current: 7 })]);
  assert.equal((await call(wire, '/world/')).body.time_range_current, 7, 'a null time_current counts as absent');
});

test('the folder as the spec reads it: elements/ over spatial/, first file by code point, dot-folders and swap files never read', async () => {
  let report;
  const f = folderFetch([
    file('world.json', { id: W, name: 'W' }),
    file('spatial/map/old.json', { id: id(7), name: 'Old copy' }),
    file('elements/map/new.json', { id: id(7), name: 'New copy' }),
    file('elements/trait/b.json', { id: id(8), name: 'B' }),
    file('elements/trait/A.json', { id: id(8).toUpperCase(), name: 'A' }),
    file('elements/trait/.swap.json', { id: id(9), name: 'Dotfile' }),
    file('.atlas/elements/trait/x.json', { id: id(10), name: 'Tool state' }),
    file('elements/trait/c.json.tmp', { id: id(11), name: 'Swap' }),
    file('elements/trait/deeper/d.json', { id: id(12), name: 'Too deep' }),
    file('elements/trait/list.json', '[1, 2]'),
  ], { onRead: (r) => { report = r; } });
  assert.deepEqual((await call(f, '/map/')).body.data.map((e) => e.name), ['New copy']);
  assert.deepEqual((await call(f, '/trait/')).body.data.map((e) => e.name), ['A'], '"A.json" before "b.json" by code point');
  assert.deepEqual(report.skipped, [
    { path: 'elements/trait/b.json', reason: 'duplicate', id: id(8) },
    { path: 'elements/trait/list.json', reason: 'no_id' },
    { path: 'spatial/map/old.json', reason: 'duplicate', id: id(7) },
  ]);
  assert.equal(report.elements, 2);
});

test('folderFetch refuses an unknown option, and its options are the only object parameter of the subpath', () => {
  assert.throws(() => folderFetch([], { __unknown__: 1 }), (e) => e instanceof TypeError && /unknown option '__unknown__'/.test(e.message));
  assert.throws(() => folderFetch('nope'), TypeError);
  assert.throws(() => folderFetch([{ path: 'world.json', data: 'text' }]), TypeError);
  assert.deepEqual(objectParameters('../src/folder/index.ts'), ['folderFetch#1']);
});

// --- (c) through the client itself -----------------------------------------------------------------

test('OwV2Client on a folder, with no key: list, listAll, get, getWorld, search and health', async () => {
  const client = new OwV2Client({ fetch: folderFetch(harbour()) });
  assert.equal(client.keyKind, 'none');
  assert.deepEqual(await client.health(), { status: 'ok' });
  const world = await client.getWorld();
  assert.equal(world.name, 'Harbour');
  assert.equal(world.time_range_current, 1200);
  const page = await client.list('character', { limit: 2 });
  assert.deepEqual(page.data.map((e) => e.name), ['Bram', 'Cora']);
  const next = await client.list('character', { limit: 2, cursor: page.next_cursor });
  assert.deepEqual(next.data.map((e) => e.name), ['Ada Copper', 'Dag']);
  const smiths = await client.list('character', { filter: { supertype: 'SMITH' } });
  assert.deepEqual(smiths.data.map((e) => e.name), ['Bram', 'Ada Copper']);
  const names = [];
  for await (const el of new OwV2Client({ fetch: folderFetch(harbour()), pageSize: 2 }).listAll('character')) names.push(el.name);
  assert.deepEqual(names, ['Bram', 'Cora', 'Ada Copper', 'Dag', 'eve']);
  const ada = await client.get('character', id(1), { expand: ['birthplace'] });
  assert.equal(ada.birthplace.name, 'Copper Mine');
  const found = await client.search('copper mine');
  assert.deepEqual(found.results.map((r) => r.name), ['Copper Mine', 'Ada Copper']);
});

test('OwV2Client on a folder: a write, a feed read and a view-as are OwApiErrors carrying the refusal', async () => {
  const client = new OwV2Client({ fetch: folderFetch(harbour()) });
  const refused = (e) => e instanceof OwApiError && e.status === 501 && e.code === 'not_in_a_folder' && e.type === 'api_error'
    && e.message === 'A world folder cannot answer this: it lives on the platform.' && e.param === null;
  await assert.rejects(client.create('character', { name: 'New' }), refused);
  await assert.rejects(client.patch('character', id(1), { name: 'X' }), refused);
  await assert.rejects(client.delete('character', id(1)), refused);
  await assert.rejects(client.changes(), refused);
  await assert.rejects(client.me(), refused);
  await assert.rejects(client.list('character', { viewAs: M1 }), refused);
  await assert.rejects(client.draught(id(1)), refused);
  const notFound = await client.get('character', id(99)).catch((e) => e);
  assert.ok(notFound instanceof OwApiError && notFound.status === 404 && notFound.code === 'not_found');
});

test('entriesFromDirectory reads a folder on disk into the entries folderFetch takes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ow-folder-'));
  try {
    for (const { path, data } of harbour([file('.atlas/lock', 'x'), file('media/big.bin', 'not read'), file('notes.txt', 'not read')])) {
      mkdirSync(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(dir, ...path.split('/')), data);
    }
    const entries = await entriesFromDirectory(dir);
    assert.ok(entries.some((e) => e.path === 'world.json'));
    assert.ok(entries.every((e) => e.path === 'world.json' || /^elements\/[a-z]+\/[^/]+\.json$/.test(e.path)), 'only what the source reads');
    assert.deepEqual(entries.map((e) => e.path), entries.map((e) => e.path).slice().sort());
    const client = new OwV2Client({ fetch: folderFetch(entries) });
    assert.equal((await client.getWorld()).counts.total, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
