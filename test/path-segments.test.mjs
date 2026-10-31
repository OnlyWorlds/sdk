/**
 * A caller's string never changes which route is asked: every type, id, field and other
 * caller-supplied value in a request path is sent as one escaped segment. keel's document
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

test('source: every ${...} in a request path is escaped or a path builder that escapes', () => {
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
      if (/^encodeURIComponent\(/.test(e) || /^proposalsPath\(/.test(e)) continue;
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

const ID = 'abc/hidden?x=1#y';
const ESC = 'abc%2Fhidden%3Fx%3D1%23y';
const path = url => new URL(url).pathname + new URL(url).search;

const cases = [
  ['get', c => c.get('character', ID), `/character/${ESC}/`],
  ['upsert', c => c.upsert('character', ID, { name: 'x' }), `/character/${ESC}/`],
  ['patch', c => c.patch('character', ID, { name: 'x' }), `/character/${ESC}/`],
  ['delete', c => c.delete('character', ID), `/character/${ESC}/`],
  ['editLinks', c => c.editLinks('character', ID, 'friends/x', { add: [] }), `/character/${ESC}/links/friends%2Fx`],
  ['adopt', c => c.adopt('character', ID, 'owner'), `/character/${ESC}/adopt`],
  ['hide', c => c.hide('character', ID), `/character/${ESC}/hidden`],
  ['unhide', c => c.unhide('character', ID), `/character/${ESC}/hidden`],
  ['draught', c => c.draught(ID), `/character/${ESC}/context`],
  ['list (type)', c => c.list('character/x'), '/character%2Fx/'],
  ['get (type)', c => c.get('character/x', 'y'), '/character%2Fx/y/'],
];

for (const [name, call, want] of cases) {
  test(`${name}: the caller's string is one segment`, async () => {
    const f = fake();
    const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
    try { await call(c); } catch { /* the fake's body need not satisfy the reader; the wire is the claim */ }
    assert.ok(f.calls.length >= 1, 'nothing was sent');
    const got = path(f.calls[0].url).replace(/^\/api\/v2/, '');
    assert.equal(got.split('?')[0], want);
  });
}
