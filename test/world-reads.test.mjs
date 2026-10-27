/**
 * `world`: an account token, or no key, reads the world it names (keel, 2026-10-27). Element list
 * and get and the world GET take `Authorization: Bearer ow_a_...` with `world=<id>` and no API-Key,
 * read only, as the account's own access there; the same `world=<id>` with no credential is the
 * keyless public reader. Every other world route answers an account token 401, so this client
 * refuses those before sending, by one rule in request(). Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

const W = '0193f1c2-7a00-7000-8000-00000000beef';
const EL = '0193f1c2-7a00-7000-8000-000000000001';
const PID = '0193f1c2-7a00-7000-8000-0000000000aa';
const ELEMENT = { id: EL, name: 'Harbour', type: 'location', change_seq: 1 };
// One body every call below can parse.
const BODY = {
  ...ELEMENT,
  data: [], has_more: false, next_cursor: null,
  cursor: '0', changes: [], head: 0, epoch: null,
  proposal: { id: PID },
  element: ELEMENT,
  meta: { session_token: 'sess' },
};

function recorder(pages) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const empty = init.method === 'DELETE' || String(url).endsWith('/hidden');
    const body = pages ? pages[Math.min(calls.length - 1, pages.length - 1)] : BODY;
    const status = empty ? 204 : 200;
    const text = empty ? '' : JSON.stringify(body);
    return {
      ok: true, status, headers: new Headers(),
      async text() { return text; }, async json() { return empty ? undefined : body; },
    };
  };
  return { fetch, calls };
}

const KINDS = {
  'account + world': { apiKey: 'ow_a_acct', apiPin: '1234', world: W },
  'no key + world': { apiPin: '1234', world: W },
};

const READS = [
  { name: 'list', path: '/location/', run: (c) => c.list('location') },
  { name: 'listAll', path: '/location/', run: async (c) => { for await (const _ of c.listAll('location')) { /* empty */ } } },
  { name: 'get', path: `/location/${EL}/`, run: (c) => c.get('location', EL) },
  { name: 'getWorld', path: '/world/', run: (c) => c.getWorld() },
];

for (const [kind, config] of Object.entries(KINDS)) {
  test(`${kind}: list, listAll, get and getWorld send world=<id>, no API-Key and no API-Pin`, async () => {
    for (const read of READS) {
      const f = recorder();
      await read.run(new OwV2Client({ ...config, fetch: f.fetch }));
      assert.equal(f.calls.length, 1, `${read.name}: one request`);
      const { url, init } = f.calls[0];
      const u = new URL(url);
      assert.equal(u.pathname, `/api/v2${read.path}`, read.name);
      assert.equal(init.method, 'GET', read.name);
      assert.deepEqual(u.searchParams.getAll('world'), [W], `${read.name}: world=<id> once`);
      const headers = init.headers ?? {};
      assert.ok(!('API-Key' in headers), `${read.name}: no API-Key`);
      assert.ok(!('API-Pin' in headers), `${read.name}: no API-Pin`);
      if (config.apiKey) assert.equal(headers.Authorization, 'Bearer ow_a_acct', `${read.name}: the Bearer`);
      else assert.deepEqual(Object.keys(headers), [], `${read.name}: no header at all`);
    }
  });
}

test('a world key: the four reads send its API-Key and no world=, as before', async () => {
  for (const read of READS) {
    const f = recorder();
    await read.run(new OwV2Client({ apiKey: 'ow_r_test', fetch: f.fetch }));
    const u = new URL(f.calls[0].url);
    assert.equal(u.searchParams.has('world'), false, read.name);
    assert.equal(f.calls[0].init.headers['API-Key'], 'ow_r_test', read.name);
    assert.ok(!('Authorization' in f.calls[0].init.headers), read.name);
  }
});

test('`world` in a list filter is a TypeError before sending, on every kind of client, and in listAll', async () => {
  for (const cfg of [{ apiKey: 'ow_a_acct', world: W }, { world: W }, { apiKey: 'ow_r_key' }]) {
    const f = recorder();
    const c = new OwV2Client({ ...cfg, fetch: f.fetch });
    await assert.rejects(async () => c.list('location', { filter: { world: W } }),
      (err) => err instanceof TypeError && /`world` is not a filter/.test(err.message));
    await assert.rejects(async () => { for await (const _ of c.listAll('location', { filter: { world: W } })) { /* empty */ } },
      (err) => err instanceof TypeError && /`world` is not a filter/.test(err.message));
    assert.equal(f.calls.length, 0, 'nothing sent');
  }
});

test('an account token without world: the four reads are a TypeError naming `world`, before sending', async () => {
  for (const read of READS) {
    const f = recorder();
    const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
    await assert.rejects(async () => read.run(c), (err) => err instanceof TypeError && /only with `world` set/.test(err.message)
      && /list, listAll, get and getWorld/.test(err.message), read.name);
    assert.equal(f.calls.length, 0, `${read.name}: nothing sent`);
  }
});

test('no key and no world: the four reads keep the keyless TypeError, which now names world', async () => {
  for (const read of READS) {
    const f = recorder();
    const c = new OwV2Client({ fetch: f.fetch });
    await assert.rejects(async () => read.run(c), (err) => err instanceof TypeError && /holds none/.test(err.message)
      && /list, listAll, get and getWorld with `world` set/.test(err.message), read.name);
    assert.equal(f.calls.length, 0, `${read.name}: nothing sent`);
  }
});

test('world= merges with list\'s own query: filter, ids, createdBy, limit, cursor, fields, expand, viewAs', async () => {
  for (const config of Object.values(KINDS)) {
    const f = recorder();
    const c = new OwV2Client({ ...config, fetch: f.fetch });
    await c.list('character', {
      limit: 7, cursor: 'abc=', fields: ['name', 'species'], expand: ['species'], ids: ['a', 'b'],
      createdBy: 'm1', filter: { name__icontains: 'Ha rb&our' }, viewAs: 'public',
    });
    await c.get('character', EL, { fields: ['name'], expand: ['location'] });
    const list = new URL(f.calls[0].url).searchParams;
    assert.equal(list.get('world'), W);
    assert.equal(list.get('limit'), '7');
    assert.equal(list.get('cursor'), 'abc=');
    assert.equal(list.get('fields'), 'name,species');
    assert.equal(list.get('expand'), 'species');
    assert.equal(list.get('ids'), 'a,b');
    assert.equal(list.get('created_by'), 'm1');
    assert.equal(list.get('name__icontains'), 'Ha rb&our');
    assert.equal(list.get('as'), 'public');
    const get = new URL(f.calls[1].url).searchParams;
    assert.equal(get.get('world'), W);
    assert.equal(get.get('fields'), 'name');
    assert.equal(get.get('expand'), 'location');
  }
});

test('world= with no other query param: the default limit still goes, and an id that needs it is URL-encoded', async () => {
  const f = recorder();
  const slug = 'my world/äb&c';
  const c = new OwV2Client({ world: slug, fetch: f.fetch });
  await c.getWorld();
  await c.list('location');
  assert.match(f.calls[0].url, /\/world\/\?world=my%20world%2F%C3%A4b%26c$/);
  assert.equal(new URL(f.calls[0].url).searchParams.get('world'), slug);
  assert.equal(new URL(f.calls[1].url).searchParams.get('world'), slug);
  assert.equal(new URL(f.calls[1].url).searchParams.get('limit'), '100');
});

test('a caller\'s signal reaches fetch on list, every page of listAll, get and getWorld, and never the query', async () => {
  const signal = new AbortController().signal;
  const pages = [
    { data: [{ id: 'a' }], has_more: true, next_cursor: 'c2' },
    { data: [{ id: 'b' }], has_more: false, next_cursor: null },
  ];
  const f = recorder(pages);
  const c = new OwV2Client({ world: W, fetch: f.fetch });
  for await (const _ of c.listAll('character', { signal })) { /* empty */ }
  await c.list('character', { signal });
  await c.get('character', EL, { signal });
  await c.getWorld({ signal });
  assert.equal(f.calls.length, 5);
  for (const call of f.calls) {
    assert.equal(call.init.signal, signal, call.url);
    assert.equal(new URL(call.url).searchParams.has('signal'), false, call.url);
  }
  const g = recorder();
  await new OwV2Client({ world: W, fetch: g.fetch }).getWorld();
  assert.equal('signal' in g.calls[0].init, false, 'no signal given, none sent');
  await assert.rejects(async () => new OwV2Client({ world: W, fetch: g.fetch }).getWorld({ signl: signal }), /signl/);
});

test('listAll stops with an OwNetworkError when a page hands back the cursor it was sent', async () => {
  const pages = [
    { data: [{ id: 'a' }], has_more: true, next_cursor: 'c2' },
    { data: [{ id: 'b' }], has_more: true, next_cursor: 'c2' },
    // Only a walk that ignores the repeat reaches this: it ends there, so the test fails rather than hangs.
    { data: [{ id: 'z' }], has_more: false, next_cursor: null },
  ];
  const f = recorder(pages);
  const c = new OwV2Client({ world: W, fetch: f.fetch });
  const ids = [];
  await assert.rejects(async () => { for await (const el of c.listAll('character')) ids.push(el.id); },
    (err) => err.name === 'OwNetworkError' && /answered the cursor it was sent/.test(err.message));
  assert.deepEqual(ids, ['a', 'b'], 'what was read is kept by the caller');
  assert.equal(f.calls.length, 2, 'the page is not read a third time');
});

test('getWorld keeps a keyless read\'s counts, and patchWorld never sends them back', async () => {
  const world = { id: W, name: 'Moppetopia', counts: { total: 151, types: { character: 40 } } };
  const f = recorder([world]);
  const got = await new OwV2Client({ world: W, fetch: f.fetch }).getWorld();
  assert.deepEqual(got.counts, { total: 151, types: { character: 40 } });
  const h = recorder([world]);
  await new OwV2Client({ apiKey: 'ow_w_key', apiPin: '1234', fetch: h.fetch }).patchWorld(got);
  assert.equal('counts' in JSON.parse(h.calls[0].init.body), false);
});

test('listAll keeps world= on every page of the cursor walk', async () => {
  const pages = [
    { data: [{ id: 'a' }], has_more: true, next_cursor: 'c2' },
    { data: [{ id: 'b' }], has_more: true, next_cursor: 'c3' },
    { data: [{ id: 'c' }], has_more: false, next_cursor: null },
  ];
  for (const config of Object.values(KINDS)) {
    const f = recorder(pages);
    const c = new OwV2Client({ ...config, pageSize: 1, fetch: f.fetch });
    const ids = [];
    for await (const el of c.listAll('character', { filter: { supertype: 'hero' } })) ids.push(el.id);
    assert.deepEqual(ids, ['a', 'b', 'c']);
    assert.equal(f.calls.length, 3);
    const qs = f.calls.map((call) => new URL(call.url).searchParams);
    assert.deepEqual(qs.map((q) => q.get('world')), [W, W, W]);
    assert.deepEqual(qs.map((q) => q.get('cursor')), [null, 'c2', 'c3']);
    assert.deepEqual(qs.map((q) => q.get('supertype')), ['hero', 'hero', 'hero']);
    assert.deepEqual(qs.map((q) => q.get('limit')), ['1', '1', '1']);
  }
});

test('construction: world with a world key is refused; world must be a non-empty string', () => {
  for (const apiKey of ['ow_w_test', 'ow_r_test', '0123456789', '0000000001', 'some-other-key']) {
    assert.throws(() => new OwV2Client({ apiKey, world: W }),
      (err) => err instanceof TypeError && /a world key reads its own world; `world` is for an account token or no key/.test(err.message)
        && /list, listAll, get and getWorld/.test(err.message), apiKey);
  }
  for (const world of ['', '   ', 42, null, {}, ['w']]) {
    for (const apiKey of ['ow_a_acct', undefined]) {
      assert.throws(() => new OwV2Client({ apiKey, world }),
        (err) => err instanceof TypeError && /world is a world's id/.test(err.message) && /list, listAll, get and getWorld/.test(err.message),
        `${JSON.stringify(world)} with ${apiKey}`);
    }
  }
  // the ones that stand
  assert.doesNotThrow(() => new OwV2Client({ apiKey: 'ow_a_acct', world: W }));
  assert.doesNotThrow(() => new OwV2Client({ world: W }));
  assert.doesNotThrow(() => new OwV2Client({ apiKey: 'ow_w_test' }));
  assert.doesNotThrow(() => new OwV2Client({ apiKey: 'ow_a_acct', world: undefined }));
});

test('request(), the escape hatch, on an account client: the rule is the request\'s, not a list of methods', async () => {
  const f = recorder();
  const c = new OwV2Client({ apiKey: 'ow_a_acct', world: W, fetch: f.fetch });
  // a world route keel serves an account token on, marked as a world read: sent with world=
  await c.request('GET', '/search', { query: 'q=harbour', worldRead: true });
  const search = new URL(f.calls[0].url).searchParams;
  assert.equal(search.get('q'), 'harbour');
  assert.equal(search.get('world'), W);
  // an account route: sent as today, without world=
  await c.request('GET', '/account/allowance');
  await c.request('GET', '/account');
  assert.equal(new URL(f.calls[1].url).searchParams.has('world'), false);
  assert.equal(f.calls.length, 3);
  // a world route not marked as a read, a write marked as one, a path that only starts with "account"
  for (const [verb, path, opts] of [
    ['GET', '/future/route/', {}], ['GET', '/character/', {}], ['POST', '/character/', { worldRead: true }],
    ['PATCH', '/world/', { worldRead: true }], ['GET', '/accounts/x', {}], ['GET', '/world/account/', {}],
  ]) {
    await assert.rejects(c.request(verb, path, opts), (err) => err instanceof TypeError && /needs a world key/.test(err.message)
      && /list, listAll, get and getWorld/.test(err.message), `${verb} ${path}`);
  }
  assert.equal(f.calls.length, 3, 'nothing more sent');
  // auth: false sends no credential, whatever the client holds
  await c.request('GET', '/health/', { auth: false });
  assert.deepEqual(Object.keys(f.calls[3].init.headers), []);
});

// Every method of the client, by what it does on an account client with `world` set:
// `read` sends world= and the Bearer, `account` sends the Bearer to an /account route, `open` sends no
// credential, `local` sends nothing at all, `refused` is a TypeError before fetch is called.
const storage = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) }; };
const BYTES = new Uint8Array([1, 2, 3]);
const METHODS = {
  health: ['open', (c) => c.health()],
  getWorld: ['read', (c) => c.getWorld()],
  patchWorld: ['refused', (c) => c.patchWorld({ name: 'W' })],
  setMyCharacter: ['refused', (c) => c.setMyCharacter(null)],
  me: ['refused', (c) => c.me()],
  members: ['refused', (c) => c.members()],
  list: ['read', (c) => c.list('location')],
  draught: ['refused', (c) => c.draught(EL)],
  listAll: ['read', async (c) => { for await (const _ of c.listAll('location')) { /* empty */ } }],
  get: ['read', (c) => c.get('location', EL)],
  create: ['refused', (c) => c.create('location', { name: 'H' })],
  upsert: ['refused', (c) => c.upsert('location', EL, { name: 'H' })],
  patch: ['refused', (c) => c.patch('location', EL, { name: 'H' })],
  delete: ['refused', (c) => c.delete('location', EL)],
  editLinks: ['refused', (c) => c.editLinks('location', EL, 'parent_location', { add: [EL] })],
  adopt: ['refused', (c) => c.adopt('location', EL, 'owner')],
  bulk: ['refused', (c) => c.bulk([{ type: 'location', element: { name: 'H' } }])],
  changes: ['refused', (c) => c.changes()],
  changesHead: ['refused', (c) => c.changesHead()],
  changesAll: ['refused', async (c) => { for await (const _ of c.changesAll()) { /* empty */ } }],
  createMediaTicket: ['refused', (c) => c.createMediaTicket()],
  uploadImage: ['refused', (c) => c.uploadImage(BYTES)],
  createRemovalTicket: ['refused', (c) => c.createRemovalTicket('k')],
  removeImage: ['refused', (c) => c.removeImage('k')],
  listFiles: ['refused', (c) => c.listFiles('location', EL)],
  worldFiles: ['refused', (c) => c.worldFiles()],
  createFileTicket: ['refused', (c) => c.createFileTicket('location', EL, { name: 'a.pdf', size: 3 })],
  uploadFile: ['refused', (c) => c.uploadFile('location', EL, BYTES, { name: 'a.pdf' })],
  fileDownloadLink: ['refused', (c) => c.fileDownloadLink('location', EL, 'f1')],
  removeFile: ['refused', (c) => c.removeFile('location', EL, 'f1')],
  previewJoin: ['open', (c) => c.previewJoin('code')],
  redeemJoin: ['open', (c) => c.redeemJoin('code', { name: 'P' })],
  signInWithPassword: ['open', (c) => c.signInWithPassword({ email: 'a@b.c', password: 'pw', tokenName: 't' })],
  acceptJoin: ['account', (c) => c.acceptJoin('code')],
  createWorldLink: ['account', (c) => c.createWorldLink(W, { reader: 'person' })],
  listWorldLinks: ['account', (c) => c.listWorldLinks(W)],
  revokeWorldLink: ['account', (c) => c.revokeWorldLink(W, 'l1')],
  createSeat: ['account', (c) => c.createSeat(W, { name: 'bot' })],
  listSeats: ['account', (c) => c.listSeats(W)],
  rekeySeat: ['account', (c) => c.rekeySeat(W, 's1')],
  removeSeat: ['account', (c) => c.removeSeat(W, 's1')],
  hide: ['refused', (c) => c.hide('location', EL)],
  unhide: ['refused', (c) => c.unhide('location', EL)],
  listHidden: ['refused', (c) => c.listHidden()],
  propose: ['refused', (c) => c.propose('location', EL, { fields: { name: 'B' }, evidence: 'e' })],
  listProposals: ['refused', (c) => c.listProposals('location', EL)],
  worldProposals: ['refused', (c) => c.worldProposals()],
  acceptProposal: ['refused', (c) => c.acceptProposal('location', EL, PID)],
  declineProposal: ['refused', (c) => c.declineProposal('location', EL, PID)],
  withdrawProposal: ['refused', (c) => c.withdrawProposal('location', EL, PID)],
  reviewNewElement: ['refused', (c) => c.reviewNewElement('location', EL, { decision: 'accept' })],
  listAccountWorlds: ['account', (c) => c.listAccountWorlds()],
  createAccountWorld: ['account', (c) => c.createAccountWorld({ name: 'W' })],
  mintWorldKey: ['account', (c) => c.mintWorldKey(W)],
  revokeWorldKey: ['account', (c) => c.revokeWorldKey(W, 'k1')],
  signInWithOnlyWorlds: ['local', (c) => c.signInWithOnlyWorlds({ clientId: 'c', redirectUri: 'https://t.example/cb', storage: storage(), navigate: false })],
  completeSignIn: ['open', async (c) => {
    const s = storage();
    const { state } = await c.signInWithOnlyWorlds({ clientId: 'c', redirectUri: 'https://t.example/cb', storage: s, navigate: false });
    return c.completeSignIn({ clientId: 'c', storage: s, url: `https://t.example/cb?code=x&state=${state}` });
  }],
  ask: ['account', (c) => c.ask({ worldId: W, question: 'q', context: [] })],
  sort: ['account', (c) => c.sort({ worldId: W, notes: [], slice: [] })],
  allowance: ['account', (c) => c.allowance()],
  request: ['account', (c) => c.request('GET', '/account/worlds')],
};

test('every client method on an account client with world set: it sends (an /account route, the four reads, no credential) or is a TypeError before fetch', async () => {
  const names = Object.getOwnPropertyNames(OwV2Client.prototype).filter((n) => n !== 'constructor' && typeof OwV2Client.prototype[n] === 'function');
  const unclassified = names.filter((n) => !(n in METHODS));
  assert.deepEqual(unclassified, [], `methods this test does not classify (add each to METHODS with what it does on an account client): ${unclassified.join(', ')}`);
  const stale = Object.keys(METHODS).filter((n) => !names.includes(n));
  assert.deepEqual(stale, [], `rows for methods the client no longer has: ${stale.join(', ')}`);

  for (const [name, [kind, run]] of Object.entries(METHODS)) {
    const f = recorder();
    const c = new OwV2Client({ apiKey: 'ow_a_acct', world: W, fetch: f.fetch });
    let thrown;
    try { await run(c); } catch (err) { thrown = err; }
    if (kind === 'refused') {
      assert.ok(thrown instanceof TypeError, `${name}: expected a TypeError, got ${thrown ?? 'none'}`);
      assert.match(thrown.message, /world key/, `${name}: ${thrown.message}`);
      assert.equal(f.calls.length, 0, `${name}: nothing sent`);
      continue;
    }
    // A call that sends may still fail on the fake's one body after it sent (a sign-in's mint); never on the account rule.
    if (thrown) assert.ok(f.calls.length > 0 && !/world key|only with `world` set/.test(thrown.message), `${name}: ${thrown}`);
    if (kind === 'local') { assert.equal(f.calls.length, 0, `${name}: sends nothing`); continue; }
    assert.ok(f.calls.length > 0, `${name}: sent`);
    for (const { url, init } of f.calls) {
      const headers = init.headers ?? {};
      const u = new URL(url);
      assert.ok(!('API-Key' in headers) && !('API-Pin' in headers), `${name}: no API-Key or API-Pin`);
      if (kind === 'open') {
        assert.ok(!('Authorization' in headers), `${name}: no credential`);
        continue;
      }
      assert.equal(headers.Authorization, 'Bearer ow_a_acct', `${name}: the Bearer`);
      if (kind === 'account') {
        assert.match(u.pathname, /^\/api\/v2\/account(\/|$)/, name);
        assert.equal(u.searchParams.has('world'), false, `${name}: no world=`);
      } else {
        assert.equal(u.searchParams.get('world'), W, `${name}: world=`);
      }
    }
  }
});
