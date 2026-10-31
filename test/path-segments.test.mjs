/**
 * A caller's string never changes which route is asked: every type, id, field and other
 * caller-supplied value in a request path is checked as one segment (refused before sending when it
 * is not one) and sent escaped. keel decodes an escaped slash before it routes (measured on
 * production 2026-10-31: `/character/abc%2Fhidden/` answers 405 as `/character/abc/hidden/` does), so
 * the escape alone cannot hold a slash. keel's document
 * declares each element id a UUID (397 path parameters, read 2026-10-31), so the escape changes
 * nothing on a real id; on `abc/hidden` the raw form asked a different route (found by a port
 * to a second client that escaped everywhere). Two halves: the source scan holds every path the client builds, so a new
 * route that interpolates raw fails here; the calls show the wire for the routes that sent raw.
 * Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as sdk from '../dist/index.js';

const { OwV2Client } = sdk;

test('source: every ${...} in a request path goes through seg() or a path builder that does', () => {
  const src = readFileSync(new URL('../src/v2/client.ts', import.meta.url), 'utf8');
  // Path templates: the template literal that is this.request's second argument, the review
  // path, and proposalsPath's body. Each is found by shape, so a new route joins the scan.
  const templates = [];
  for (const m of src.matchAll(/this\.request\(\s*'[A-Z]+',\s*`([^`]*)`/g)) templates.push(m[1]);
  for (const m of src.matchAll(/const path = `([^`]*)`/g)) templates.push(m[1]);
  for (const m of src.matchAll(/function proposalsPath\([^)]*\): string \{\s*return `([^`]*)`/g)) templates.push(m[1]);
  assert.ok(templates.length >= 30, `found ${templates.length} path templates; the scan lost its shape`);
  // Every request call's path is a quoted literal, a scanned template or `path`: nothing else.
  // A literal or template must end the argument: `'/x/' + id` is a path the scan cannot read.
  const calls = [...src.matchAll(/this\.request\(\s*'[A-Z]+',\s*('[^'\n]*'|`[^`]*`|path|proposalsPath\([^)]*\))\s*[,)]/g)];
  assert.equal(calls.length, [...src.matchAll(/this\.request\(/g)].length,
    'a request call whose method is not a literal, or whose path is not a whole literal, template or `path`');
  const raw = [];
  for (const t of templates) {
    for (const m of t.matchAll(/\$\{([^}]*)\}/g)) {
      const e = m[1];
      if (/^seg\('[A-Za-z]+', [A-Za-z]+\)$/.test(e) || /^proposalsPath\(/.test(e)) continue;
      raw.push(`${e} in ${t}`);
    }
  }
  assert.deepEqual(raw, [], 'a raw segment in a request path');
  // A path that is not a literal (a variable passed to request) must be one of the scanned ones.
  const bare = [...src.matchAll(/this\.request\(\s*'[A-Z]+',\s*([a-zA-Z_]+)\s*,/g)].map(m => m[1]);
  assert.deepEqual([...new Set(bare)], ['path'], 'request called with a path the scan does not read');
});

function fake() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method });
    const body = { id: 'x', name: 'x' };
    return {
      ok: true, status: 200, headers: new Headers(),
      async text() { return JSON.stringify(body); }, async json() { return body; },
    };
  };
  return { fetch, calls };
}

const UUID = '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f';
const ID = `${UUID}/hidden`;
const path = url => new URL(url).pathname + new URL(url).search;

// Each refused before anything is sent, naming the value.
const refused = [
  ['get', c => c.get('character', ID), 'id'],
  ['upsert', c => c.upsert('character', ID, { name: 'x' }), 'id'],
  ['patch', c => c.patch('character', ID, { name: 'x' }), 'id'],
  ['delete', c => c.delete('character', ID), 'id'],
  ['editLinks (id)', c => c.editLinks('character', ID, 'friends', { add: [] }), 'id'],
  ['editLinks (field)', c => c.editLinks('character', UUID, 'friends/x', { add: [] }), 'field'],
  ['adopt', c => c.adopt('character', ID, 'owner'), 'id'],
  ['hide', c => c.hide('character', ID), 'id'],
  ['unhide', c => c.unhide('character', ID), 'id'],
  ['draught', c => c.draught(ID), 'characterId'],
  ['list (type)', c => c.list('character/x'), 'type'],
  ['get (type)', c => c.get('Character', UUID), 'type'],
  ['get (escaped slash)', c => c.get('character', `${UUID}%2Fhidden`), 'id'],
  ['get (dot segment)', c => c.get('character', '..'), 'id'],
  ['get (empty)', c => c.get('character', ''), 'id'],
  ['revokeAccountToken', c => c.revokeAccountToken('t/../x'), 'tokenId'],
];

for (const [name, call, what] of refused) {
  test(`${name}: a value that is not one segment is refused before sending`, async () => {
    const f = fake();
    const account = name === 'revokeAccountToken';
    const c = new OwV2Client(account ? { apiKey: 'ow_a_acct', fetch: f.fetch } : { apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
    await assert.rejects(async () => call(c), (e) => e instanceof TypeError && e.message.startsWith(`${what} `) && /Nothing was sent/.test(e.message));
    assert.equal(f.calls.length, 0, 'something was sent');
  });
}

test('a value that is one segment goes out as given: a uuid, an owner word, dots and dashes inside', async () => {
  const f = fake();
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
  try { await c.get('character', UUID); } catch { /* the wire is the claim */ }
  try { await c.get('character', 'a.b_c-D9'); } catch { /* the wire is the claim */ }
  try { await c.editLinks('character', UUID, 'friends', { add: [] }); } catch { /* the wire is the claim */ }
  assert.deepEqual(f.calls.map((x) => path(x.url).replace(/^\/api\/v2/, '').split('?')[0]),
    [`/character/${UUID}/`, '/character/a.b_c-D9/', `/character/${UUID}/links/friends`]);
});
