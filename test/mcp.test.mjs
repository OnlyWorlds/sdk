/**
 * The hosted MCP door's read tools on a world folder (`@onlyworlds/sdk/mcp`): each tool's answer on a
 * small folder built here (a room element, a reading aid, a proposed element, elements with no
 * `created_at`), each refusal in the door's own words, the resources and templates, and the options;
 * get_me's reading aids held to every owner case of the charter and strand profiles' fixtures.
 * The answers are held to keel's MCP code as read (mcp_server/tools_read.py and tools_schema.py);
 * scripts/compare-mcp.mjs holds them to the live door. Runs against the compiled bundle (dist).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OwV2Client, trimAndFold } from '../dist/index.js';
import { folderFetch } from '../dist/folder.js';
import { folderMcpTools, OwMcpError, MCP_RESOURCE_NOT_FOUND } from '../dist/mcp.js';
import { objectParameters } from './options-surface.mjs';

const door = JSON.parse(readFileSync(new URL('../src/mcp/door.json', import.meta.url), 'utf8'));
const enc = new TextEncoder();
const file = (path, value) => ({ path, data: enc.encode(JSON.stringify(value, null, 2) + '\n') });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W = '0192a000-aaaa-7bbb-8ccc-000000000001';
const W2 = '0192a000-aaaa-7bbb-8ccc-000000000002';
const M1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const INVALID_DOC = 'https://onlyworlds.github.io/api/errors/#invalid_request';
const FOLDER_DOC = 'https://onlyworlds.github.io/docs/development/typescript#a-world-folder-as-the-source';

// The harbour: five Characters with stamps (two at the same instant), two without, a proposed one, a
// room one; a Location, a Law that is the reading aid and a Law that is lore, a room Message, a Pin.
const LOC = id(50);
const harbour = () => [
  file('world.json', { id: W, name: 'Harbour', description: 'A small port.', api: { key: 'never read' } }),
  file('elements/character/ada.json', { id: id(1), type: 'character', name: 'Ada Copper', supertype: 'Sailor', location: LOC, created_at: '2026-01-01T10:00:00.000001+00:00' }),
  file('elements/character/bram.json', { id: id(3), type: 'character', name: 'Bram', supertype: 'sailor', birthplace: LOC, created_at: '2026-01-02T00:00:00+00:00' }),
  file('elements/character/cora.json', { id: id(2), type: 'character', name: 'Cora', created_at: '2026-01-02T01:00:00+01:00', created_by: M1 }),
  file('elements/character/dov.json', { id: id(9), type: 'character', name: 'Dov', description: 'Made offline.' }),
  file('elements/character/eli.json', { id: id(8), type: 'character', name: 'Eli', description: 'Made offline too.' }),
  file('elements/character/pell.json', { id: id(4), type: 'character', name: 'Pell Copper', created_at: '2026-01-03T00:00:00+00:00', x_review_proposed: { by: 'an AI seat' } }),
  file('elements/character/blank.json', { id: id(6), type: 'character', name: 'Settled', created_at: '2025-12-01T00:00:00Z', x_review_proposed: '  ' }),
  file('elements/character/member.json', { id: id(5), type: 'character', name: 'Seat', supertype: 'Member', x_room_of: W, created_at: '2026-01-04T00:00:00+00:00' }),
  file('elements/location/mine.json', { id: LOC, type: 'location', name: 'The Copper Mine', description: 'The old copper mine under Harbour.', created_at: '2026-01-01T00:00:00+00:00' }),
  file('elements/law/charter.json', { id: id(60), type: 'law', name: 'House rules', supertype: 'Charter', x_charter_of: W, description: 'Copper first.', created_at: '2026-01-01T00:00:00+00:00' }),
  file('elements/law/kings.json', { id: id(61), type: 'law', name: 'The King’s Charter', supertype: 'Charter', created_at: '2026-01-01T00:00:00+00:00' }),
  file('elements/narrative/line.json', { id: id(70), type: 'narrative', name: 'A line about copper', supertype: 'Message', x_room_of: W, created_at: '2026-01-05T00:00:00+00:00' }),
  file('elements/pin/p.json', { id: id(80), type: 'pin', name: 'Mine pin', map: id(81), element_type: 'location', element_id: LOC }),
];

const textOf = (r) => r.content[0].text;
async function ok(mcp, name, args) {
  const r = await mcp.callTool(name, args);
  assert.equal(r.isError, false, `${name} answered a refusal: ${textOf(r)}`);
  assert.deepEqual(Object.keys(r), ['content', 'structuredContent', 'isError']);
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0].type, 'text');
  assert.equal(textOf(r), JSON.stringify(r.structuredContent), 'the text content is the structured content, the same JSON');
  return r.structuredContent;
}
async function refused(mcp, name, args) {
  const r = await mcp.callTool(name, args);
  assert.equal(r.isError, true, `${name} answered: ${textOf(r)}`);
  assert.deepEqual(Object.keys(r), ['content', 'isError']);
  return textOf(r);
}
/** keel's refusal_text for a flat envelope: Python's json.dumps, its ", " and ": " separators. */
const envelope = (message, param, code = 'invalid_request', type = 'invalid_request', doc = INVALID_DOC) =>
  `{"error": {"message": ${JSON.stringify(message)}, "type": ${JSON.stringify(type)}, "code": ${JSON.stringify(code)}, "param": ${JSON.stringify(param)}, "doc_url": ${JSON.stringify(doc)}}}`;

const names = (page) => page.data.map((e) => e.name);

// --- the lists --------------------------------------------------------------------------------------

test('tools/list, resources and templates: the door\'s read tools as served, with one sentence each', () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  assert.deepEqual(mcp.tools.map((t) => t.name), ['list_element_types', 'get_element_schema', 'search_schema', 'list_worlds', 'get_me', 'list_elements', 'get_element', 'search_elements']);
  for (const t of mcp.tools) {
    const served = door.tools.find((d) => d.name === t.name);
    assert.deepEqual(Object.keys(t), ['name', 'description', 'inputSchema', 'outputSchema', 'annotations']);
    assert.equal(t.description, `${served.description}\n\n${served.here}`);
    assert.deepEqual(t.inputSchema, served.inputSchema);
    assert.deepEqual(t.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true });
  }
  assert.match(mcp.tools.find((t) => t.name === 'list_elements').description, /Here it answers from a world folder on this computer, not from onlyworlds\.com; `world` is the id in the folder's world\.json\.$/);
  assert.match(mcp.tools.find((t) => t.name === 'get_me').description, /as the folder's owner with no account behind it/);
  assert.match(mcp.tools.find((t) => t.name === 'search_schema').description, /from the schema as onlyworlds\.com served it when this package was built\.$/);
  const asServed = folderMcpTools([{ entries: harbour() }], { asServed: true });
  assert.deepEqual(asServed.tools.map((t) => t.description), door.tools.map((t) => t.description));
  assert.deepEqual(mcp.resources.map((r) => r.uri), ['onlyworlds://schema', 'onlyworlds://world']);
  assert.deepEqual(mcp.resourceTemplates.map((r) => r.uriTemplate), ['onlyworlds://schema/{type}', 'onlyworlds://element/{type}/{id}']);
  assert.equal(mcp.schemaVersion, door.schema_version);
  // Each answer is a copy: a caller that changes one changes nothing after it.
  mcp.tools[0].inputSchema.properties.x = 1;
  assert.deepEqual(mcp.tools[0].inputSchema, door.tools[0].inputSchema);
});

test('a tool the folder does not answer is a tool the door does not have', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  for (const name of ['get_changes', 'get_draught', 'list_files', 'read_file', 'create_element', 'nope']) {
    assert.equal(await refused(mcp, name, {}), `Unknown tool: '${name}'`);
  }
});

// --- the schema tools -------------------------------------------------------------------------------

test('list_element_types, get_element_schema and search_schema answer from the vendored schema', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  assert.deepEqual(await ok(mcp, 'list_element_types', {}), door.list_element_types);
  assert.equal(Object.keys(door.list_element_types).length, 22);
  assert.deepEqual(await ok(mcp, 'get_element_schema', { type: 'pin' }), door.element_schemas.pin);
  assert.equal(await refused(mcp, 'get_element_schema', { type: 'bogus' }), "Unknown element type: 'bogus'. Call list_element_types for the 22 valid slugs.");
  // keel's rule: a case-insensitive substring of a field name, or of the slug (listed with its matches, maybe none).
  const loc = await ok(mcp, 'search_schema', { query: '  LOC ' });
  assert.deepEqual(loc.character, ['location']);
  assert.deepEqual(loc.location, ['parent_location']);
  const pin = await ok(mcp, 'search_schema', { query: 'element' });
  assert.deepEqual(pin.pin, ['element_type', 'element_id']);
  assert.deepEqual((await ok(mcp, 'search_schema', { query: 'zone' })).zone, door.element_schemas.zone.text.concat(door.element_schemas.zone.integer, door.element_schemas.zone.single_link, door.element_schemas.zone.multi_link).filter((f) => f.includes('zone')));
  assert.equal(await refused(mcp, 'search_schema', { query: '  ' }), 'query must be a non-empty string.');
});

// --- list_worlds and the world argument -------------------------------------------------------------

test('list_worlds names each world served, as its owner; world names one by the id in its world.json, nothing else', async () => {
  const two = [...harbour().filter((f) => f.path !== 'world.json'), file('world.json', { id: W2, name: 'Second', slug: 'second' })];
  const one = folderMcpTools([{ entries: harbour() }]);
  assert.deepEqual(await ok(one, 'list_worlds', {}), { data: [{ id: W, slug: null, name: 'Harbour', role: 'owner' }] });
  assert.equal((await ok(one, 'list_elements', { type: 'location', world: W.toUpperCase() })).data.length, 1);
  assert.equal(await refused(one, 'list_elements', { type: 'location', world: 'elsewhere' }),
    envelope(`No world served here is named 'elsewhere': the worlds served here are ${W}.`, 'world', 'not_in_a_folder', 'api_error', FOLDER_DOC));

  const mcp = folderMcpTools([{ entries: harbour() }, { entries: two }]);
  assert.deepEqual((await ok(mcp, 'list_worlds', {})).data.map((r) => [r.id, r.slug]), [[W, null], [W2, 'second']]);
  assert.equal(await refused(mcp, 'list_elements', { type: 'location' }), `More than one world is served here: name one as world (${W}, ${W2}); list_worlds shows them.`);
  assert.equal(await refused(mcp, 'get_element', { type: 'location', id: LOC }), `More than one world is served here: name one as world (${W}, ${W2}); list_worlds shows them.`);
  assert.equal((await ok(mcp, 'get_element', { type: 'location', id: LOC, world: ` ${W2} ` })).name, 'The Copper Mine');
  // A slug is no world's id here: refused, never taken to mean the folder.
  assert.equal(await refused(mcp, 'get_element', { type: 'location', id: LOC, world: 'second' }),
    envelope(`No world served here is named 'second': the worlds served here are ${W}, ${W2}.`, 'world', 'not_in_a_folder', 'api_error', FOLDER_DOC));
  assert.equal((await ok(mcp, 'search_elements', { query: 'copper', world: W2 })).count, 2);

  // An id that is no UUID is named in either case, and by nothing else.
  const plain = folderMcpTools([{ entries: [file('world.json', { id: 'Local-World', name: 'Plain' })] }]);
  assert.deepEqual((await ok(plain, 'get_me', { world: 'local-WORLD' })).world, { id: 'Local-World', name: 'Plain' });
  assert.match(await refused(plain, 'get_me', { world: 'Local-World-2' }), /"code": "not_in_a_folder"/);

  // A world given as a client: its id and name are its own body's, as a folder's are its world.json's.
  const client = new OwV2Client({ fetch: folderFetch(harbour()) });
  const given = folderMcpTools([{ client }]);
  assert.deepEqual(await ok(given, 'list_worlds', {}), { data: [{ id: W, slug: null, name: 'Harbour', role: 'owner' }] });
  assert.throws(() => folderMcpTools([{ client, id: 'local-1' }]), (e) => e instanceof TypeError && /unknown option 'id'/.test(e.message));
});

// --- list_elements ----------------------------------------------------------------------------------

test('list_elements: newest-created first, then by id; no created_at after every stamped one, by id', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const page = await ok(mcp, 'list_elements', { type: 'character' });
  assert.deepEqual(Object.keys(page), ['data', 'limit', 'offset', 'has_more', 'proposed_left_out']);
  // Bram (00:00Z) and Cora (01:00+01:00) are the same instant: by id, Cora's id(2) first.
  assert.deepEqual(names(page), ['Cora', 'Bram', 'Ada Copper', 'Settled', 'Eli', 'Dov']);
  assert.equal(page.limit, 100);
  assert.equal(page.offset, 0);
  assert.equal(page.has_more, false);
  // The room's Seat is left out, uncounted; the proposed Pell is left out and counted; a blank mark is settled.
  assert.equal(page.proposed_left_out, 1);
  // Each row is the element as the platform's list serves it to the owner.
  const client = new OwV2Client({ fetch: folderFetch(harbour()) });
  assert.deepEqual(page.data.find((e) => e.name === 'Ada Copper'), await client.get('character', id(1)));
});

test('list_elements: include_room and include_proposed bring back what they name', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const all = await ok(mcp, 'list_elements', { type: 'character', include_room: true, include_proposed: true });
  assert.deepEqual(names(all), ['Seat', 'Pell Copper', 'Cora', 'Bram', 'Ada Copper', 'Settled', 'Eli', 'Dov']);
  assert.equal(all.proposed_left_out, 0);
  assert.deepEqual(all.data[1].x_review_proposed, { by: 'an AI seat' });
  // The reading aid (a Law with supertype Charter and the mark) is aside; a Charter without the mark is lore.
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'law' })), ['The King’s Charter']);
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'law', include_room: true })), ['House rules', 'The King’s Charter']);
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'narrative' })), []);
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'narrative', include_room: 'yes' })), ['A line about copper']);
});

test('list_elements: limit and offset page it; their refusals are the door\'s', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const p1 = await ok(mcp, 'list_elements', { type: 'character', limit: 2 });
  assert.deepEqual([names(p1), p1.has_more], [['Cora', 'Bram'], true]);
  const p3 = await ok(mcp, 'list_elements', { type: 'character', limit: '2', offset: 4 });
  assert.deepEqual([names(p3), p3.has_more, p3.limit, p3.offset], [['Eli', 'Dov'], false, 2, 4]);
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'character', offset: 9 })), []);
  assert.equal((await ok(mcp, 'list_elements', { type: 'character', limit: 5000 })).limit, 1000);
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', limit: 0 }), 'limit must be a positive integer.');
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', offset: -1 }), 'offset must be zero or a positive integer.');
  assert.equal(await refused(mcp, 'list_elements', { type: 'ships' }), "Unknown element type: 'ships'. Call list_element_types for the 22 valid slugs.");
});

test('list_elements: name_contains, supertype, subtype, ids, created_by and link, as the door reads them', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const list = async (args) => names(await ok(mcp, 'list_elements', { type: 'character', ...args }));
  assert.deepEqual(await list({ name_contains: 'COPP' }), ['Ada Copper']);
  assert.deepEqual(await list({ supertype: ' SAILOR ' }), ['Bram', 'Ada Copper']);
  assert.deepEqual(await list({ supertype: '' }), ['Cora', 'Settled', 'Eli', 'Dov']);
  assert.deepEqual(await list({ subtype: 'none' }), []);
  assert.deepEqual(await list({ ids: [id(9), ` ${id(1).toUpperCase()} `] }), ['Ada Copper', 'Dov']);
  assert.deepEqual(await list({ created_by: M1 }), ['Cora']);
  assert.deepEqual(await list({ created_by: 'owner' }), ['Bram', 'Ada Copper', 'Settled', 'Eli', 'Dov']);
  assert.deepEqual(await list({ link: { location: LOC } }), ['Ada Copper']);
  assert.deepEqual(await list({ link: { birthplace: LOC, location: '' } }), ['Bram']);
  assert.deepEqual(names(await ok(mcp, 'list_elements', { type: 'pin', link: { map: id(81) } })), ['Mine pin']);

  // The door's own refusals: plain sentences.
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', link: { name: 'x' } }),
    "link names 'name', which is no single-link field of character: its single-link fields are birthplace, location.");
  assert.equal(await refused(mcp, 'list_elements', { type: 'pin', link: { element: LOC } }),
    "link names 'element', which is no single-link field of pin: its single-link fields are map.");
  assert.equal(await refused(mcp, 'list_elements', { type: 'family', link: { x: '' } }),
    "link names 'x', which is no single-link field of family: it has no single-link fields.");
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', link: { location: 5 } }),
    'link location must be an element id, or "" for the elements with none; got 5.');
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', ids: [] }), 'ids must be a list of 1 to 200 element ids.');
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', ids: Array.from({ length: 201 }, (_, i) => id(i)) }), 'ids takes at most 200 ids (got 201).');
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', ids: ['a,b'] }), "ids must be a list of element ids, one id per item; 'a,b' is not one.");
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', ids: ['  '] }), "ids must be a list of element ids, one id per item; '  ' is not one.");
  // The route's refusals: its envelope as the text.
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', link: { birthplace: 'nope' } }), envelope('birthplace must be a UUID.', 'birthplace'));
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', ids: [' nope '] }), envelope("ids must be a list of ids; 'nope' is not one.", 'ids'));
  assert.equal(await refused(mcp, 'list_elements', { type: 'character', created_by: 'x' }), envelope('created_by must be a membership id (as GET /members lists them) or owner.', 'created_by'));
  // The door's order: the link's own check before the ids', the route's link check before its ids'.
  assert.match(await refused(mcp, 'list_elements', { type: 'character', link: { location: 'nope' }, ids: ['also nope'] }), /location must be a UUID/);
});

// --- get_element ------------------------------------------------------------------------------------

test('get_element: the element as the platform serves it; a proposed or room element by its id too', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const client = new OwV2Client({ fetch: folderFetch(harbour()) });
  assert.deepEqual(await ok(mcp, 'get_element', { type: 'character', id: id(4) }), await client.get('character', id(4)));
  assert.equal((await ok(mcp, 'get_element', { type: 'character', id: `{${id(5).toUpperCase()}}` })).name, 'Seat');
  assert.equal(await refused(mcp, 'get_element', { type: 'character', id: id(99) }), `character '${id(99)}' not found.`);
  assert.equal(await refused(mcp, 'get_element', { type: 'location', id: id(1) }), `location '${id(1)}' not found.`);
  assert.equal(await refused(mcp, 'get_element', { type: 'character', id: 'junk' }), "id must be a UUID; got 'junk'.");
  assert.equal(await refused(mcp, 'get_element', { type: 'ship', id: 'junk' }), "Unknown element type: 'ship'. Call list_element_types for the 22 valid slugs.");
});

// --- search_elements --------------------------------------------------------------------------------

test('search_elements: the platform\'s search less the room, the aids and the proposed, cut after', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const found = await ok(mcp, 'search_elements', { query: 'copper' });
  assert.deepEqual(Object.keys(found), ['query', 'results', 'count', 'truncated', 'proposed_left_out']);
  assert.deepEqual(found.results.map((r) => [r.type, r.name, r.field]), [['character', 'Ada Copper', 'name'], ['location', 'The Copper Mine', 'name']]);
  assert.deepEqual(Object.keys(found.results[0]), ['type', 'id', 'name', 'supertype', 'subtype', 'field', 'snippet']);
  assert.equal(found.proposed_left_out, 1);
  assert.equal(found.truncated, false);
  // limit 1: the cut comes after the left-out ones are gone, so it is Ada, and more matched.
  const one = await ok(mcp, 'search_elements', { query: 'Copper', limit: 1 });
  assert.deepEqual([one.results.map((r) => r.name), one.truncated, one.count, one.proposed_left_out], [['Ada Copper'], true, 1, 1]);
  const every = await ok(mcp, 'search_elements', { query: 'copper', include_room: true, include_proposed: true });
  assert.deepEqual(every.results.map((r) => r.name), ['Ada Copper', 'Pell Copper', 'The Copper Mine', 'A line about copper', 'House rules']);
  assert.deepEqual(every.results[1].x_review_proposed, { by: 'an AI seat' });
  assert.equal(every.proposed_left_out, 0);
  const typed = await ok(mcp, 'search_elements', { query: 'copper mine', type: 'location' });
  assert.deepEqual([typed.query, typed.count, typed.results[0].snippet], ['copper mine', 1, 'The Copper Mine']);
  assert.deepEqual((await ok(mcp, 'search_elements', { query: 'offline', type: '' })).results.map((r) => [r.name, r.field, r.snippet]), [['Dov', 'description', 'Made offline.'], ['Eli', 'description', 'Made offline too.']]);
  // Refusals: the route's envelope, its `q` named as the tool's `query`.
  assert.equal(await refused(mcp, 'search_elements', { query: 'a' }), envelope('query must be 2 to 200 characters (it has 1).', 'query'));
  assert.equal(await refused(mcp, 'search_elements', { query: '  ' }), envelope('query is required: 2 to 200 characters.', 'query'));
  assert.equal(await refused(mcp, 'search_elements', { query: '--' }), envelope('query must hold at least one word (letters or digits).', 'query'));
  assert.match(await refused(mcp, 'search_elements', { query: 'ab', type: 'bogus' }), /^\{"error": \{"message": "Unknown type 'bogus'\. Types: ability, collective, character, /);
});

// --- get_me -----------------------------------------------------------------------------------------

test('get_me: the owner with nothing of an account in it; the Charter and the aids as the charter profile reads them', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const me = await ok(mcp, 'get_me', {});
  assert.deepEqual(Object.keys(me), ['world', 'scope', 'kind', 'role', 'membership', 'character', 'lenses_from', 'lenses', 'front_door', 'reading_aids']);
  assert.deepEqual(me, {
    world: { id: W, name: 'Harbour' },
    scope: 'read',
    kind: 'owner',
    role: 'owner',
    membership: null,
    character: null,
    lenses_from: 'chosen',
    lenses: [],
    front_door: {
      sponsor: null, sponsor_character: null, my_character: null, my_seats: [],
      charter: id(60), charter_skill: [], charter_element: { type: 'law', id: id(60) }, charter_skill_elements: [],
    },
    reading_aids: {
      charter: { id: id(60), type: 'law', name: 'House rules', rules: [], skill: [] },
      guide: null,
      domains: [],
      strand: { narrative: null, event: null, location: null, character: null, now: null, same: null },
    },
  });
  assert.deepEqual((await ok(mcp, 'get_me', { world: W })).world, { id: W, name: 'Harbour' });
  assert.equal(await refused(mcp, 'get_me', { world: 'elsewhere' }),
    envelope(`No world served here is named 'elsewhere': the worlds served here are ${W}.`, 'world', 'not_in_a_folder', 'api_error', FOLDER_DOC));
});

// The profiles' fixtures, as the package vendors them: each world made into a folder, read through get_me as its owner.
const profile = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../codegen/schema-dist/profiles/${name}.fixture.json`, import.meta.url)), 'utf8'));
const TYPES = new Set(Object.keys(door.list_element_types));
function folderOf(world, extra = {}) {
  const files = [file('world.json', { id: world.id ?? W, name: world.name ?? 'A world', ...extra })];
  (world.elements ?? []).forEach((el, i) => {
    // A folder serves each element as the type of the folder it is filed under: here the folder its stored type names
    // once trimmed and folded as the room profile defines it. A type that names none is no element of the folder,
    // as it is none of the profile's (a ligature, a byte order mark, a unit separator).
    const folded = typeof el.type === 'string' ? trimAndFold(el.type) : '';
    const dir = TYPES.has(folded) ? folded : null;
    if (dir) files.push(file(`elements/${dir}/${String(i).padStart(4, '0')}.json`, el));
  });
  return files;
}

test('get_me reading_aids: every owner case of the charter profile\'s fixture', async (t) => {
  const fx = profile('charter');
  const cases = fx.cases.filter((c) => c.kind === 'charter' && c.reader === 'owner');
  assert.ok(cases.length >= 40, `the fixture's owner cases: ${cases.length}`);
  for (const c of cases) {
    await t.test(c.name, async () => {
      const world = typeof c.world === 'string' ? fx.worlds[c.world] : c.world;
      const me = await ok(folderMcpTools([{ entries: folderOf(world) }]), 'get_me', {});
      const { strand: _strand, ...aids } = me.reading_aids;
      assert.deepEqual(aids, c.want);
      assert.equal(me.front_door.charter, c.want.charter ? c.want.charter.id : null);
      assert.deepEqual(me.front_door.charter_skill, c.want.charter ? c.want.charter.skill : []);
    });
  }
});

test('get_me reading_aids.strand: every owner case of the strand profile\'s fixture', async (t) => {
  const fx = profile('strand');
  const cases = fx.cases.filter((c) => c.kind === 'strand' && c.reader === 'owner');
  assert.ok(cases.length > 0);
  for (const c of cases) {
    await t.test(c.name, async () => {
      const world = typeof c.world === 'string' ? fx.worlds[c.world] : c.world;
      const extra = Object.prototype.hasOwnProperty.call(world, 'x_strand') ? { x_strand: world.x_strand } : {};
      const me = await ok(folderMcpTools([{ entries: folderOf(world, extra) }]), 'get_me', {});
      assert.deepEqual(me.reading_aids.strand, c.want);
    });
  }
});

// --- the arguments ----------------------------------------------------------------------------------

test('an argument the tool does not take, of the wrong kind, or missing is refused by name, in pydantic\'s words', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  assert.equal(await refused(mcp, 'list_element_types', { bogus: 1 }), [
    '1 validation error for call[list_element_types]',
    'bogus',
    '  Unexpected keyword argument [type=unexpected_keyword_argument, input_value=1, input_type=int]',
    '    For further information visit https://errors.pydantic.dev/2.13/v/unexpected_keyword_argument',
  ].join('\n'));
  assert.equal(await refused(mcp, 'get_element_schema', {}), [
    '1 validation error for call[get_element_schema]',
    'type',
    '  Missing required argument [type=missing_argument, input_value={}, input_type=dict]',
    '    For further information visit https://errors.pydantic.dev/2.13/v/missing_argument',
  ].join('\n'));
  const many = await refused(mcp, 'list_elements', { type: 'character', include_room: 'maybe', ids: 'x', limit: 2.5, offset: true, bogus: null, link: [1] });
  assert.equal(many.split('\n')[0], '5 validation errors for call[list_elements]');
  assert.deepEqual(many.split('\n').filter((l) => /^\S/.test(l)).slice(1), ['ids', 'link', 'limit', 'include_room', 'bogus']);
  assert.match(many, /limit\n {2}Input should be a valid integer, got a number with a fractional part \[type=int_from_float, input_value=2\.5, input_type=float\]/);
  assert.match(many, /include_room\n {2}Input should be a valid boolean, unable to interpret input \[type=bool_parsing, input_value='maybe', input_type=str\]/);
  assert.match(many, /bogus\n {2}Unexpected keyword argument \[type=unexpected_keyword_argument, input_value=None, input_type=NoneType\]/);
  assert.match(await refused(mcp, 'list_elements', { type: 'character', ids: ['a', 5] }), /^1 validation error for call\[list_elements\]\nids\.1\n {2}Input should be a valid string \[type=string_type, input_value=5, input_type=int\]/);
  // pydantic shows a long input by its first 25 and last 24 characters.
  assert.match(await refused(mcp, 'search_schema', { query: 'q', also: 'x'.repeat(80) }), /input_value='x{24}\.\.\.x{23}', input_type=str/);
  await assert.rejects(mcp.callTool('list_worlds', [1]), TypeError);
});

// --- the resources ----------------------------------------------------------------------------------

test('readResource: the schema, the world index and one element, written as the door writes them', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const schema = await mcp.readResource('onlyworlds://schema');
  assert.deepEqual(Object.keys(schema.contents[0]), ['uri', 'mimeType', 'text']);
  assert.equal(schema.contents[0].mimeType, 'application/json');
  assert.deepEqual(JSON.parse(schema.contents[0].text), door.list_element_types);
  // Python's json.dumps: ", " and ": ", every character past ASCII as its escape.
  assert.ok(schema.contents[0].text.startsWith('{"ability": "Ability \\u2014 '));
  assert.deepEqual(JSON.parse((await mcp.readResource('onlyworlds://schema/character')).contents[0].text), door.element_schemas.character);

  const index = JSON.parse((await mcp.readResource('onlyworlds://world')).contents[0].text);
  assert.deepEqual(index.world, { id: W, name: 'Harbour' });
  assert.deepEqual(Object.keys(index.types), ['character', 'law', 'location', 'pin']);
  assert.deepEqual(index.types.character.elements.map((e) => e.name), ['Ada Copper', 'Bram', 'Cora', 'Dov', 'Eli', 'Settled']);
  assert.deepEqual(index.types.law, { elements: [{ id: id(61), name: 'The King’s Charter' }], has_more: false });
  assert.equal(index.limit_per_type, 100);
  assert.equal(index.proposed_left_out, 1);
  assert.ok((await mcp.readResource('onlyworlds://world')).contents[0].text.includes('"The King\\u2019s Charter"'));

  const el = await mcp.readResource(`onlyworlds://element/location/${LOC}`);
  assert.equal(el.contents[0].uri, `onlyworlds://element/location/${LOC}`);
  assert.equal(JSON.parse(el.contents[0].text).name, 'The Copper Mine');
});

test('readResource: what names nothing is -32002, any other refusal code 0, as the door answers', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }]);
  const fails = async (uri, code, message) => {
    await assert.rejects(mcp.readResource(uri), (e) => e instanceof OwMcpError && e.code === code && e.message === message);
  };
  assert.equal(MCP_RESOURCE_NOT_FOUND, -32002);
  await fails('onlyworlds://nope', -32002, "Resource not found: Unknown resource: 'onlyworlds://nope'");
  await fails('onlyworlds://schema/bogus', 0, "Unknown element type: 'bogus'. Call list_element_types for the 22 valid slugs.");
  await fails('onlyworlds://element/bogus/x', -32002, "Resource not found: Unknown element type: 'bogus'. Call list_element_types for the 22 valid slugs.");
  await fails('onlyworlds://element/character/junk', -32002, "Resource not found: id must be a UUID; got 'junk'.");
  await fails(`onlyworlds://element/character/${id(99)}`, -32002, `Resource not found: character '${id(99)}' not found.`);
  const two = folderMcpTools([{ entries: harbour() }, { entries: [file('world.json', { id: W2, name: 'Second' })] }]);
  await assert.rejects(two.readResource('onlyworlds://world'), (e) => e instanceof OwMcpError && e.code === 0 && /More than one world is served here/.test(e.message));
});

// --- the options ------------------------------------------------------------------------------------

test('folderMcpTools refuses an unknown option, and its options are the only object parameter of the subpath', () => {
  assert.throws(() => folderMcpTools([{ entries: harbour() }], { __unknown__: 1 }), (e) => e instanceof TypeError && /unknown option '__unknown__'/.test(e.message));
  assert.throws(() => folderMcpTools([{ entries: harbour(), __unknown__: 1 }]), (e) => e instanceof TypeError && /world 0: unknown option '__unknown__'/.test(e.message));
  assert.throws(() => folderMcpTools([{ entries: harbour() }], { asServed: 'yes' }), TypeError);
  assert.throws(() => folderMcpTools([]), TypeError);
  assert.throws(() => folderMcpTools([{}]), TypeError);
  assert.throws(() => folderMcpTools([{ entries: harbour(), client: new OwV2Client({ fetch: folderFetch(harbour()) }) }]), TypeError);
  assert.throws(() => folderMcpTools([{ entries: 'nope' }]), TypeError);
  assert.deepEqual(objectParameters('../src/mcp/index.ts'), ['folderMcpTools#1']);
});

test('a folder whose world.json does not read answers the folder source\'s refusal; the schema tools still answer', async () => {
  const mcp = folderMcpTools([{ entries: harbour().filter((f) => f.path !== 'world.json') }]);
  const text = '{"error": {"message": "This world folder has no world.json that parses with an id, so nothing in it can be read.", "type": "api_error", "code": "api_error", "param": null, "doc_url": "https://onlyworlds.github.io/api/errors/#api_error"}}';
  assert.equal(await refused(mcp, 'list_worlds', {}), text);
  assert.equal(await refused(mcp, 'list_elements', { type: 'character' }), text);
  assert.equal((await ok(mcp, 'get_element_schema', { type: 'law' })).type, 'law');
});

test('two worlds with one id are refused on the first call', async () => {
  const mcp = folderMcpTools([{ entries: harbour() }, { entries: harbour() }]);
  await assert.rejects(mcp.callTool('list_worlds', {}), (e) => e instanceof TypeError && /two worlds have the id/.test(e.message));
});
