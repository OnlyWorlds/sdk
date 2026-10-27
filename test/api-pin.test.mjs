/**
 * API-Pin only where keel checks it (Skeld's ruling, 2026-10-22): every write (any method
 * but GET), GET /me, and every request of a 10-digit legacy key. keel
 * verifies a PIN wherever it is sent (argon2, 64 MiB each); reads sent with one OOM-killed staging
 * on a cold cache (2026-10-22). Each call below states its own expectation for a prefixed key, so
 * the test does not re-derive the rule from the method it checks. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

const EL = '0193f1c2-7a00-7000-8000-000000000001';
const PID = '0193f1c2-7a00-7000-8000-0000000000aa';
const ELEMENT = { id: EL, name: 'Harbour', type: 'location', change_seq: 1 };
// One body every read and write below can parse: a page, a change page, a head, an element, a proposal.
const BODY = {
  ...ELEMENT,
  data: [], has_more: false, next_cursor: null,
  cursor: '0', changes: [], head: 0, epoch: null,
  proposal: { id: PID },
  element: ELEMENT, // a review's accept answers { element } (4.68.0 checks it)
};

function recorder() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const empty = init.method === 'DELETE' || String(url).endsWith('/hidden');
    const status = empty ? 204 : 200;
    const text = empty ? '' : JSON.stringify(BODY);
    return {
      ok: true, status, headers: new Headers(),
      async text() { return text; }, async json() { return empty ? undefined : BODY; },
    };
  };
  return { fetch, calls };
}

// `pin`: whether a prefixed world key with a PIN sends it. `who`: which clients may call it
// (`world` for a world key only, `account` for an account token only, `any` for both: the reads an
// account token sends with `world` set).
const CALLS = [
  // reads
  { name: 'list', verb: 'GET', pin: false, who: 'any', run: (c) => c.list('location') },
  { name: 'list (name search)', verb: 'GET', pin: false, who: 'any', run: (c) => c.list('location', { filter: { name__icontains: 'harb' } }) },
  { name: 'get', verb: 'GET', pin: false, who: 'any', run: (c) => c.get('location', EL) },
  { name: 'changes', verb: 'GET', pin: false, who: 'world', run: (c) => c.changes() },
  { name: 'changesHead', verb: 'GET', pin: false, who: 'world', run: (c) => c.changesHead() },
  { name: 'draught', verb: 'GET', pin: false, who: 'world', run: (c) => c.draught(EL) },
  { name: 'worldProposals', verb: 'GET', pin: false, who: 'world', run: (c) => c.worldProposals() },
  { name: 'listProposals', verb: 'GET', pin: false, who: 'world', run: (c) => c.listProposals('location', EL) },
  { name: 'worldLenses', verb: 'GET', pin: false, who: 'world', run: (c) => c.worldLenses('w1', { resolve: true }) },
  { name: 'draught (lens)', verb: 'GET', pin: false, who: 'world', run: (c) => c.draught(EL, { lens: EL }) },
  // the one read keel checks a PIN on
  { name: 'me', verb: 'GET', pin: true, who: 'world', run: (c) => c.me() },
  // writes, each verb
  { name: 'create', verb: 'POST', pin: true, who: 'world', run: (c) => c.create('location', { name: 'Harbour' }) },
  { name: 'patch', verb: 'PATCH', pin: true, who: 'world', run: (c) => c.patch('location', EL, { description: 'x' }) },
  { name: 'upsert', verb: 'PUT', pin: true, who: 'world', run: (c) => c.upsert('location', EL, { name: 'Harbour' }) },
  { name: 'delete', verb: 'DELETE', pin: true, who: 'world', run: (c) => c.delete('location', EL) },
  { name: 'adopt', verb: 'POST', pin: true, who: 'world', run: (c) => c.adopt('location', EL, 'owner') },
  { name: 'hide', verb: 'PUT', pin: true, who: 'world', run: (c) => c.hide('location', EL) },
  { name: 'unhide', verb: 'DELETE', pin: true, who: 'world', run: (c) => c.unhide('location', EL) },
  { name: 'propose', verb: 'POST', pin: true, who: 'world', run: (c) => c.propose('location', EL, { fields: { description: 'x' }, evidence: 'seen' }) },
  { name: 'patchWorld', verb: 'PATCH', pin: true, who: 'world', run: (c) => c.patchWorld({ name: 'W' }) },
  { name: 'setMyLenses', verb: 'PUT', pin: true, who: 'world', run: (c) => c.setMyLenses([EL]) },
  { name: 'createSeat', verb: 'POST', pin: true, who: 'account', run: (c) => c.createSeat('w1', { name: 'bot' }) },
  { name: 'createAccountWorld', verb: 'POST', pin: true, who: 'account', run: (c) => c.createAccountWorld({ name: 'W' }) },
  { name: 'reviewNewElement', verb: 'POST', pin: true, who: 'world', run: (c) => c.reviewNewElement('location', EL, { decision: 'accept' }) },
];

/** Run every call the client may make; return [{name, verb, method, url, pin}] per request sent. */
async function sweep(config, holder) {
  const out = [];
  for (const call of CALLS) {
    if (call.who !== 'any' && call.who !== holder) continue;
    const f = recorder();
    const c = new OwV2Client({ ...config, fetch: f.fetch });
    await call.run(c);
    assert.equal(f.calls.length, 1, `${call.name}: one request`);
    const { url, init } = f.calls[0];
    assert.equal(init.method, call.verb, `${call.name}: sent as ${call.verb}`);
    out.push({ call, url, headers: init.headers ?? {} });
  }
  return out;
}

test('API-Pin, ow_w_ key with a PIN: on every write and on GET /me, on no other read', async () => {
  const sent = await sweep({ apiKey: 'ow_w_test', apiPin: '1234' }, 'world');
  assert.equal(sent.length, CALLS.filter((c) => c.who !== 'account').length);
  for (const { call, url, headers } of sent) {
    assert.equal(headers['API-Key'], 'ow_w_test', call.name);
    assert.equal(headers['API-Pin'], call.pin ? '1234' : undefined, `${call.name} (${call.verb} ${url})`);
  }
  const me = sent.find((s) => s.call.name === 'me');
  assert.match(me.url, /\/me\/$/);
});

test('API-Pin, 10-digit legacy key with a PIN: on every request, reads included', async () => {
  const sent = await sweep({ apiKey: '0123456789', apiPin: '1234' }, 'world');
  for (const { call, url, headers } of sent) {
    assert.equal(headers['API-Key'], '0123456789', call.name);
    assert.equal(headers['API-Pin'], '1234', `${call.name} (${call.verb} ${url})`);
  }
});

test('API-Pin, ow_r_ key with no PIN: never', async () => {
  const sent = await sweep({ apiKey: 'ow_r_test' }, 'world');
  for (const { call, headers } of sent) {
    assert.equal(headers['API-Key'], 'ow_r_test', call.name);
    assert.ok(!('API-Pin' in headers), call.name);
  }
});

test('API-Pin, ow_a_ account token: never, even with a PIN configured; Bearer, no API-Key', async () => {
  const sent = await sweep({ apiKey: 'ow_a_acct', apiPin: '1234', world: 'w1' }, 'account');
  assert.ok(sent.some((s) => s.call.name === 'list'));
  assert.ok(sent.some((s) => s.call.name === 'createSeat'));
  assert.ok(sent.some((s) => s.call.name === 'createAccountWorld'));
  for (const { call, headers } of sent) {
    assert.equal(headers['Authorization'], 'Bearer ow_a_acct', call.name);
    assert.ok(!('API-Pin' in headers), call.name);
    assert.ok(!('API-Key' in headers), call.name);
  }
});

test('API-Pin is derived from the method: a GET to any path but /me carries none, any other method does', async () => {
  const f = recorder();
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch });
  const reads = ['/world/', '/members/', '/character/x/', '/account/allowance', '/me/character', '/mex', '/x/me/', '/future/route/'];
  for (const path of reads) await c.request('GET', path);
  for (const [i, path] of reads.entries()) {
    assert.ok(!('API-Pin' in f.calls[i].init.headers), `GET ${path}`);
  }
  const n = f.calls.length;
  await c.request('GET', '/me');
  await c.request('GET', '/me/');
  assert.equal(f.calls[n].init.headers['API-Pin'], '1234', 'GET /me');
  assert.equal(f.calls[n + 1].init.headers['API-Pin'], '1234', 'GET /me/');
  const writes = [['POST', '/future/route/'], ['PATCH', '/world/'], ['PUT', '/x/'], ['DELETE', '/x/'], ['post', '/lowercase/']];
  for (const [verb, path] of writes) await c.request(verb, path, { allowEmpty: true });
  for (const [i, [verb, path]] of writes.entries()) {
    assert.equal(f.calls[n + 2 + i].init.headers['API-Pin'], '1234', `${verb} ${path}`);
  }
});
