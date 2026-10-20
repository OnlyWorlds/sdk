/**
 * v2 client tests -- node --test over the compiled ESM bundle (dist/index.mjs).
 * Zero extra deps: `pretest` builds, then plain node runs this file. Behavior is
 * driven through the public OwV2Client with an injected fake fetch, so the tests
 * exercise the real wire path (headers, payload, response parse) end to end.
 *
 * Literal response bodies are copied from the S22 staging fixtures
 * (s22-fixtures.json, recorded live 2026-07-18).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OwV2Client, OwApiError, OwPreconditionFailedError, detectKeyKind, ELEMENT_TYPES,
} from '../dist/index.js';

// -- fake fetch harness -----------------------------------------------------

/** Records the last request and returns a scripted Response. */
function fakeFetch(script) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = typeof script === 'function' ? script(url, init) : script;
    const status = r.status ?? 200;
    const headers = new Headers(r.headers ?? {});
    const bodyText = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      async text() { return bodyText; },
      async json() { return r.body; },
    };
  };
  impl.calls = calls;
  return impl;
}

function makeClient(script, cfg = {}) {
  const fetchImpl = fakeFetch(script);
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl, ...cfg });
  return { client, fetchImpl };
}

function lastBody(fetchImpl) {
  return JSON.parse(fetchImpl.calls.at(-1).init.body);
}

// -- literal fixtures (from s22-fixtures.json) ------------------------------

const FIX_P2a = {
  errors: false,
  items: [
    { status: 201, id: '0eac22e7-f8d1-40d4-b550-18c164c38678', created_at: '2026-07-18T11:09:57.922094+00:00', updated_at: '2026-07-18T11:09:57.922105+00:00' },
    { status: 201, id: 'ec5f6f30-70ba-4210-b11f-85456fc0a25c', created_at: '2026-07-18T11:09:57.936669+00:00', updated_at: '2026-07-18T11:09:57.936682+00:00' },
  ],
};

const FIX_P2c = {
  errors: true,
  items: [
    {
      status: 400,
      id: 'c24976e7-6d14-46ca-958e-364426b2fd0b',
      error: {
        type: 'invalid_request',
        code: 'invalid_link',
        message: "location references Location '735e79a6-9785-4368-b064-9044eb378d38' which does not exist in this world or among the batch's surviving items.",
        param: 'location',
        doc_url: 'https://onlyworlds.github.io/api/errors#invalid_link',
      },
    },
  ],
};

const FIX_P4a = {
  error: {
    type: 'invalid_request',
    code: 'invalid_request',
    message: 'Unknown field: not_a_field',
    param: 'not_a_field',
    doc_url: 'https://onlyworlds.github.io/api/errors#invalid_request',
  },
};

// -- sanitizePayload strip-list (all 5 read-only fields) --------------------

test('sanitizePayload strips world/type/created_at/updated_at/change_seq on patch', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', type: 'character', name: 'K' } });
  await client.patch('character', 'x', {
    name: 'K',
    world: 'w15',
    type: 'character',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    change_seq: 42,
    description: 'kept',
  });
  const sent = lastBody(fetchImpl);
  assert.deepEqual(Object.keys(sent).sort(), ['description', 'name']);
  for (const f of ['world', 'type', 'created_at', 'updated_at', 'change_seq']) {
    assert.equal(f in sent, false, `${f} should be stripped`);
  }
});

// -- known_of (keel PR 113, B16): never sent; a stub is never written ----------

const WHOLE_READ = {
  type: 'character', id: 'x', name: 'Dev', description: 'Dev desc', physicality: 'tall',
  created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', change_seq: 9,
  created_by: null, changed_by: null, changed_via: 'api', x_note: 'kept',
};
const STUB_READ = {
  type: 'character', id: 'x', name: 'Dev', description: 'Dev desc', physicality: '', location: null,
  friends: [], created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', change_seq: 9,
  created_by: null, changed_by: null, changed_via: null, known_of: true,
};

test('a read body echoed into upsert, patch, create and bulk sends no known_of', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', name: 'Dev' } });
  // A whole read body has none; a stray non-true marker is stripped like any read-only key.
  for (const body of [WHOLE_READ, { ...WHOLE_READ, known_of: false }]) {
    await client.upsert('character', 'x', body);
    assert.equal('known_of' in lastBody(fetchImpl), false);
    assert.equal(lastBody(fetchImpl).physicality, 'tall');
    assert.equal(lastBody(fetchImpl).x_note, 'kept');
    await client.patch('character', 'x', body);
    assert.equal('known_of' in lastBody(fetchImpl), false);
    await client.create('character', body);
    assert.equal('known_of' in lastBody(fetchImpl), false);
  }
  const bulk = makeClient({ status: 200, body: FIX_P2a });
  await bulk.client.bulk([{ type: 'character', element: { ...WHOLE_READ, known_of: false } }]);
  assert.equal('known_of' in lastBody(bulk.fetchImpl).items[0].element, false);
});

test('a known-of stub is a TypeError on every element write, before anything is sent', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', name: 'Dev' } });
  await assert.rejects(client.upsert('character', 'x', STUB_READ), TypeError);
  await assert.rejects(client.patch('character', 'x', STUB_READ), TypeError);
  await assert.rejects(client.create('character', STUB_READ), TypeError);
  await assert.rejects(
    client.bulk([{ type: 'character', element: WHOLE_READ }, { type: 'character', element: STUB_READ }]),
    /items\[1\].*known-of stub/,
  );
  assert.equal(fetchImpl.calls.length, 0);
});

// -- bulk request shape -----------------------------------------------------

test('bulk request wraps items[] and defaults atomic:false', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: FIX_P2a });
  await client.bulk([
    { type: 'character', element: { name: 'A', world: 'w15', change_seq: 1 } },
    { type: 'event', element: { name: 'B' } },
  ]);
  const sent = lastBody(fetchImpl);
  assert.equal(sent.atomic, false);
  assert.equal(Array.isArray(sent.items), true);
  assert.equal(sent.items.length, 2);
  assert.equal(sent.items[0].type, 'character');
  // element sanitized inside bulk too
  assert.equal('world' in sent.items[0].element, false);
  assert.equal('change_seq' in sent.items[0].element, false);
  assert.equal(sent.items[0].element.name, 'A');
});

test('bulk mints each id-less element its id by position: from the key, the ids Python mints, so a retry sends the same body', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: FIX_P2a });
  // vectors from the Python package's _minted_id(key, index) (onlyworlds 0.4.0), positions 0-2
  const vectors = {
    k1: ['9b55790c-5bcb-5173-8478-80a431ad7bd5', '814d0153-3fa9-558a-b715-ad2196e1bad2', '2441243d-bc6b-5ea2-b175-cd498000ad47'],
    'é-ünï-🐉': ['f73005eb-b2a6-512f-b8ae-205a504f298a', '1b888364-1b61-5c25-9664-4bcee1407a10', '366b67ad-ceb1-5aed-8777-7c215fc62a01'],
  };
  const items = [
    { type: 'character', element: { name: 'A' } },
    { type: 'event', element: { id: 'mine', name: 'B' } },
    { type: 'location', element: { name: 'C', id: '' } },
  ];
  for (const [key, ids] of Object.entries(vectors)) {
    await client.bulk(items, { idempotencyKey: key });
    await client.bulk(items, { idempotencyKey: key });
    const [one, two] = fetchImpl.calls.slice(-2);
    const sent = lastBody({ calls: [one] }).items.map((it) => it.element.id);
    assert.deepEqual(sent, [ids[0], 'mine', ids[2]], `${key}: by position, an id you pass kept`);
    assert.equal(one.init.body, two.init.body, `${key}: a retry sends the same body`);
  }
  assert.equal('id' in items[0].element, false, "the caller's items are not changed");
  await client.bulk(items);
  const fresh = lastBody(fetchImpl).items.map((it) => it.element.id);
  assert.match(fresh[0], /^[0-9a-f]{8}-[0-9a-f]{4}-7/, 'without a key, a fresh UUIDv7');
  assert.notEqual(fresh[0], fresh[2]);
  assert.equal(fresh[1], 'mine');
});

test('bulk atomic:true is forwarded', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: FIX_P2a });
  await client.bulk([{ type: 'character', element: { name: 'A' } }], { atomic: true });
  assert.equal(lastBody(fetchImpl).atomic, true);
});

// -- bulk response parse against literal P2a / P2c bodies -------------------

test('bulk parses P2a success body (items[], numeric status, timestamp echo)', async () => {
  const { client } = makeClient({ status: 200, body: FIX_P2a });
  const res = await client.bulk([{ type: 'character', element: { name: 'A' } }]);
  assert.equal(res.errors, false);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].status, 201);
  assert.equal(res.items[0].id, '0eac22e7-f8d1-40d4-b550-18c164c38678');
  assert.equal(res.items[0].created_at, '2026-07-18T11:09:57.922094+00:00');
  assert.equal(res.items[0].updated_at, '2026-07-18T11:09:57.922105+00:00');
});

test('bulk parses P2c partial-failure body (error slot with envelope)', async () => {
  const { client } = makeClient({ status: 200, body: FIX_P2c });
  const res = await client.bulk([{ type: 'character', element: { name: 'A' } }]);
  assert.equal(res.errors, true);
  const slot = res.items[0];
  assert.equal(slot.status, 400);
  assert.equal(slot.error.code, 'invalid_link');
  assert.equal(slot.error.param, 'location');
  assert.equal(slot.error.doc_url, 'https://onlyworlds.github.io/api/errors#invalid_link');
});

// -- idempotent replay header (lowercase on wire) ---------------------------

test('bulk exposes wasReplay from lowercase idempotent-replay header (P2b)', async () => {
  const { client } = makeClient({ status: 200, headers: { 'idempotent-replay': 'true' }, body: FIX_P2a });
  const res = await client.bulk([{ type: 'character', element: { name: 'A' } }], { idempotencyKey: 'k1' });
  assert.equal(res.wasReplay, true);
});

test('bulk wasReplay is false when header absent', async () => {
  const { client } = makeClient({ status: 200, body: FIX_P2a });
  const res = await client.bulk([{ type: 'character', element: { name: 'A' } }]);
  assert.equal(res.wasReplay, false);
});

// -- error envelope parse against literal P4a body --------------------------

test('non-2xx throws OwApiError with full envelope (P4a: type/code/param/doc_url)', async () => {
  const { client } = makeClient({ status: 422, body: FIX_P4a });
  await assert.rejects(
    () => client.patch('character', 'x', { not_a_field: 1 }),
    (err) => {
      assert.ok(err instanceof OwApiError);
      assert.equal(err.status, 422);
      assert.equal(err.type, 'invalid_request');
      assert.equal(err.code, 'invalid_request');
      assert.equal(err.param, 'not_a_field');
      assert.equal(err.docUrl, 'https://onlyworlds.github.io/api/errors#invalid_request');
      assert.equal(err.isValidationError, true);
      return true;
    },
  );
});

// -- 409s told apart, and a busy server's Retry-After (4.2.0) --------------
// Envelopes shaped as keel sends them: core/errors.py (id_conflict), core/idempotency.py
// (idempotency_error), core/admission.py (server_busy + retry-after).

const envelope = (type, code) => ({ error: { type, code, message: code, param: null,
  doc_url: `https://onlyworlds.github.io/api/errors#${code}` } });

async function thrown(script, call) {
  const { client } = makeClient(script);
  try { await call(client); } catch (err) { return err; }
  assert.fail('expected a throw');
}

test('409 id_conflict is an id conflict, NOT an idempotency conflict', async () => {
  const err = await thrown({ status: 409, body: envelope('invalid_request', 'id_conflict') },
    (c) => c.create('character', { id: '11111111-2222-4333-8444-555555555555', name: 'K' }));
  assert.equal(err.isIdConflict, true);
  assert.equal(err.isIdempotencyConflict, false);
});

test('409 idempotency_error is an idempotency conflict, NOT an id conflict', async () => {
  const err = await thrown({ status: 409, body: envelope('idempotency_error', 'idempotency_error') },
    (c) => c.create('character', { name: 'K' }, { idempotencyKey: 'k1' }));
  assert.equal(err.isIdempotencyConflict, true);
  assert.equal(err.isIdConflict, false);
  assert.equal(err.isIdempotencyInFlight, false);
});

test('create with a key derives its id from the key, the same id Python mints, so a retry sends the same body', async () => {
  const { client, fetchImpl } = makeClient({ status: 201, body: { id: 'x' } });
  // vectors from the Python package's _minted_id(key, 0) (onlyworlds 0.4.0)
  const vectors = { k1: '9b55790c-5bcb-5173-8478-80a431ad7bd5', 'retry-7f3a': '0962a4a5-2f46-5909-82f1-7d260ee368b0', 'é-ünï-🐉': 'f73005eb-b2a6-512f-b8ae-205a504f298a' };
  for (const [key, id] of Object.entries(vectors)) {
    await client.create('character', { name: 'A' }, { idempotencyKey: key });
    await client.create('character', { name: 'A' }, { idempotencyKey: key });
    const [one, two] = fetchImpl.calls.slice(-2);
    assert.equal(lastBody({ calls: [one] }).id, id, key);
    assert.equal(one.init.body, two.init.body, `${key}: a retry sends the same body`);
  }
  await client.create('character', { name: 'A' });
  assert.match(lastBody(fetchImpl).id, /^[0-9a-f]{8}-[0-9a-f]{4}-7/, 'without a key, a fresh UUIDv7');
  await client.create('character', { id: 'mine', name: 'A' }, { idempotencyKey: 'k1' });
  assert.equal(lastBody(fetchImpl).id, 'mine', 'an id you pass is kept');
});

test('409 idempotency_in_flight is in flight with Retry-After, NOT a key conflict (keel #307)', async () => {
  const err = await thrown({ status: 409, headers: { 'retry-after': '1' }, body: envelope('idempotency_error', 'idempotency_in_flight') },
    (c) => c.bulk([{ type: 'character', element: { name: 'K' } }], { idempotencyKey: 'k1' }));
  assert.equal(err.isIdempotencyInFlight, true);
  assert.equal(err.isIdempotencyConflict, false);
  assert.equal(err.retryAfter, 1);
});

test('503 server_busy carries isBusy and Retry-After in seconds', async () => {
  const err = await thrown({ status: 503, headers: { 'retry-after': '5' }, body: envelope('api_error', 'server_busy') },
    (c) => c.list('character'));
  assert.equal(err.isBusy, true);
  assert.equal(err.retryAfter, 5);
});

test('403 not_author is isNotAuthor, and no other getter claims it', async () => {
  const err = await thrown({ status: 403, body: envelope('permission_error', 'not_author') },
    (c) => c.patch('character', 'x', { name: 'K' }));
  assert.equal(err.isNotAuthor, true);
  assert.equal(err.isAuthError, false);
  assert.equal(err.isIdConflict, false);
});

test('409 resync_required is isResyncRequired (the guest feed reset), and not a conflict', async () => {
  const err = await thrown({ status: 409, body: envelope('invalid_request', 'resync_required') },
    (c) => c.changes({ since: '12:abc' }));
  assert.equal(err.isResyncRequired, true);
  assert.equal(err.isIdConflict, false);
  assert.equal(err.isIdempotencyConflict, false);
  const other = await thrown({ status: 409, body: envelope('invalid_request', 'id_conflict') },
    (c) => c.create('character', { name: 'K' }));
  assert.equal(other.isResyncRequired, false);
});

test('resyncReason reads the 409 envelope\'s reason (keel #421), and is undefined without one or on another error', async () => {
  for (const reason of ['role', 'view']) {
    const body = envelope('invalid_request', 'resync_required');
    body.error.reason = reason;
    const err = await thrown({ status: 409, body }, (c) => c.changes({ since: '12:abc:3' }));
    assert.equal(err.isResyncRequired, true);
    assert.equal(err.resyncReason, reason);
  }
  const plain = await thrown({ status: 409, body: envelope('invalid_request', 'resync_required') },
    (c) => c.changes({ since: '12:abc' }));
  assert.equal(plain.isResyncRequired, true);
  assert.equal(plain.resyncReason, undefined);
  const odd = envelope('invalid_request', 'resync_required');
  odd.error.reason = 'something';
  const unknown = await thrown({ status: 409, body: odd }, (c) => c.changes({ since: '12:abc' }));
  assert.equal(unknown.resyncReason, undefined);
  const otherBody = envelope('invalid_request', 'id_conflict');
  otherBody.error.reason = 'role';
  const other = await thrown({ status: 409, body: otherBody }, (c) => c.create('character', { name: 'K' }));
  assert.equal(other.resyncReason, undefined);
});

// -- If-Match: the PATCH precondition (keel #210, c1d5d2a) ---------------------

const FIX_412 = {
  error: {
    type: 'invalid_request', code: 'precondition_failed',
    message: 'The element has changed since change_seq 41 (now 44).',
    param: 'If-Match', doc_url: 'https://onlyworlds.github.io/api/errors/#precondition_failed',
  },
  current: { type: 'character', id: 'x', name: 'Theirs', change_seq: 44 },
};

test('patch with ifMatch sends If-Match as a quoted change_seq; without it, no header', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', change_seq: 45 } });
  await client.patch('character', 'x', { name: 'Mine' }, { ifMatch: 44 });
  assert.equal(fetchImpl.calls.at(-1).init.headers['If-Match'], '"44"');
  assert.equal(fetchImpl.calls.at(-1).init.method, 'PATCH');
  await client.patch('character', 'x', { name: 'Mine' });
  assert.equal('If-Match' in fetchImpl.calls.at(-1).init.headers, false);
});

test('editLinks with ifMatch sends If-Match too', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', change_seq: 45 } });
  await client.editLinks('character', 'x', 'species', { add: ['y'] }, { ifMatch: 7 });
  assert.equal(fetchImpl.calls.at(-1).init.headers['If-Match'], '"7"');
});

test('an ifMatch that is not a whole number throws before anything is sent', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: {} });
  for (const bad of [4.5, -1, NaN, '44']) {
    await assert.rejects(client.patch('character', 'x', { name: 'K' }, { ifMatch: bad }), TypeError);
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test('412 precondition_failed is an OwPreconditionFailedError carrying current, and an OwApiError', async () => {
  const err = await thrown({ status: 412, body: FIX_412 },
    (c) => c.patch('character', 'x', { name: 'Mine' }, { ifMatch: 41 }));
  assert.ok(err instanceof OwPreconditionFailedError);
  assert.ok(err instanceof OwApiError);
  assert.equal(err.name, 'OwPreconditionFailedError');
  assert.equal(err.isPreconditionFailed, true);
  assert.deepEqual(err.current, FIX_412.current);
  assert.equal(err.current.change_seq, 44);
  assert.equal(err.param, 'If-Match');
  assert.equal(err.isValidationError, false);
  assert.equal(err.isIdConflict, false);
  const other = await thrown({ status: 409, body: envelope('invalid_request', 'id_conflict') },
    (c) => c.create('character', { name: 'K' }));
  assert.equal(other.isPreconditionFailed, false);
  assert.equal(other instanceof OwPreconditionFailedError, false);
});

test('a 412 with no current still parses: current is null', async () => {
  const err = await thrown({ status: 412, body: { error: FIX_412.error } },
    (c) => c.patch('character', 'x', { name: 'Mine' }, { ifMatch: 41 }));
  assert.equal(err.isPreconditionFailed, true);
  assert.equal(err.current, null);
});

test('403 owner_only is isOwnerOnly, and not isNotAuthor', async () => {
  const err = await thrown({ status: 403, body: envelope('permission_error', 'owner_only') },
    (c) => c.patchWorld({ name: 'K' }));
  assert.equal(err.isOwnerOnly, true);
  assert.equal(err.isNotAuthor, false);
  assert.equal(err.isAuthError, false);
  for (const code of ['not_author', 'insufficient_scope']) {
    const other = await thrown({ status: 403, body: envelope('permission_error', code) },
      (c) => c.patchWorld({ name: 'K' }));
    assert.equal(other.isOwnerOnly, false, code);
  }
  const bare = await thrown({ status: 403, body: 'forbidden' }, (c) => c.list('character'));
  assert.equal(bare.isOwnerOnly, false);
});

test('viewAs is sent as `as` on list, listAll and get, and not sent when absent (keel #421)', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', type: 'character', name: 'A', data: [], has_more: false } });
  await client.list('character', { viewAs: 'public', filter: { supertype: 'npc' } });
  await client.get('character', 'x', { viewAs: '0190a1b2-0000-7000-8000-000000000001', fields: ['name'] });
  for await (const _ of client.listAll('character', { viewAs: 'public' })) { /* empty page */ }
  await client.list('character');
  await client.get('character', 'x');
  const qs = fetchImpl.calls.map((c) => new URL(c.url).searchParams);
  assert.equal(qs[0].get('as'), 'public');
  assert.equal(qs[0].get('supertype'), 'npc');
  assert.equal(qs[1].get('as'), '0190a1b2-0000-7000-8000-000000000001');
  assert.equal(qs[1].get('fields'), 'name');
  assert.equal(qs[2].get('as'), 'public');
  assert.equal(qs[3].has('as'), false);
  assert.equal(qs[4].has('as'), false);
});

test('403 view_as_owner_only is isViewAsOwnerOnly, and not isOwnerOnly (keel #421)', async () => {
  const err = await thrown({ status: 403, body: envelope('permission_error', 'view_as_owner_only') },
    (c) => c.list('character', { viewAs: 'public' }));
  assert.equal(err.isViewAsOwnerOnly, true);
  assert.equal(err.isOwnerOnly, false);
  assert.equal(err.isNotAuthor, false);
  for (const code of ['owner_only', 'not_author', 'insufficient_scope']) {
    const other = await thrown({ status: 403, body: envelope('permission_error', code) },
      (c) => c.list('character'));
    assert.equal(other.isViewAsOwnerOnly, false, code);
  }
  const unknown = await thrown({ status: 422, body: envelope('invalid_request', 'invalid_request') },
    (c) => c.get('character', 'x', { viewAs: 'nobody' }));
  assert.equal(unknown.isViewAsOwnerOnly, false);
});

test('a 403 with another code is not isNotAuthor', async () => {
  for (const code of ['owner_only', 'insufficient_scope']) {
    const err = await thrown({ status: 403, body: envelope('permission_error', code) },
      (c) => c.patch('character', 'x', { name: 'K' }));
    assert.equal(err.isNotAuthor, false, code);
  }
  const bare = await thrown({ status: 403, body: 'forbidden' }, (c) => c.list('character'));
  assert.equal(bare.isNotAuthor, false);
});

test('a 503 that is NOT server_busy is not busy, and still carries its Retry-After', async () => {
  // keel's mcp_moved (web/views.py): 503 + Retry-After: 86400.
  const err = await thrown({ status: 503, headers: { 'Retry-After': '86400' }, body: envelope('api_error', 'mcp_moved') },
    (c) => c.list('character'));
  assert.equal(err.isBusy, false);
  assert.equal(err.retryAfter, 86400);
});

test('a malformed Retry-After is null, never "retry now"', async () => {
  for (const bad of ['1.5', '-1', '+5', '5.0', 'soon']) {
    const err = await thrown({ status: 429, headers: { 'Retry-After': bad }, body: envelope('rate_limited', 'rate_limited') },
      (c) => c.list('character'));
    assert.equal(err.retryAfter, null, `Retry-After ${JSON.stringify(bad)}`);
  }
});

test('Retry-After is null when absent, and an HTTP date becomes seconds', async () => {
  const none = await thrown({ status: 422, body: FIX_P4a }, (c) => c.patch('character', 'x', { not_a_field: 1 }));
  assert.equal(none.retryAfter, null);
  assert.equal(none.isBusy, false);
  const at = new Date(Date.now() + 30_000).toUTCString();
  const dated = await thrown({ status: 429, headers: { 'Retry-After': at }, body: envelope('rate_limited', 'rate_limited') },
    (c) => c.list('character'));
  assert.ok(dated.retryAfter >= 28 && dated.retryAfter <= 31, `retryAfter ${dated.retryAfter}`);
});

// -- UUID minting on id-less create -----------------------------------------

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Run fn with Date.now pinned to t (the minted id's timestamp source). */
async function atTime(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  try { return await fn(); } finally { Date.now = real; }
}

async function mintedId(t) {
  const { client, fetchImpl } = makeClient({ status: 201, body: { id: 'server', type: 'character' } });
  await atTime(t, () => client.create('character', { name: 'K' }));
  return lastBody(fetchImpl).id;
}

test('create mints an RFC 9562 v7 UUID when element.id is absent (4.2.0 default)', async () => {
  const { client, fetchImpl } = makeClient({ status: 201, body: { id: 'server', type: 'character' } });
  await client.create('character', { name: 'K' });
  assert.match(lastBody(fetchImpl).id, UUID_V7_RE);
});

test('v7 carries the creation millisecond as its first 48 bits, big-endian', async () => {
  // 0x0192_3456_789A: every byte distinct, and the two high bytes sit above bit 32,
  // where JS bitwise operators would silently truncate.
  const t = 0x01923456789a;
  const id = await mintedId(t);
  assert.equal(id.replace(/-/g, '').slice(0, 12), '01923456789a');
  // A real clock value round-trips too.
  const now = 1790000000000;
  assert.equal(parseInt((await mintedId(now)).replace(/-/g, '').slice(0, 12), 16), now);
});

test('v7 floors the clock ONCE: fractional and pre-1970 clocks give one consistent integer', async () => {
  // Without a single Math.floor, the two high bytes (division + floor) and the four
  // low bytes (bitwise, which truncates toward zero) disagree for these inputs.
  const t = 0x01923456789a;
  assert.equal((await mintedId(t + 0.5)).replace(/-/g, '').slice(0, 12), '01923456789a');
  assert.equal((await mintedId(-1)).replace(/-/g, '').slice(0, 12), 'ffffffffffff');
  assert.equal((await mintedId(-0.5)).replace(/-/g, '').slice(0, 12), 'ffffffffffff');
});

test('v7 ids a millisecond apart sort in creation order', async () => {
  const t = 1790000000000;
  for (let i = 0; i < 50; i++) {
    const a = await mintedId(t + i);
    const b = await mintedId(t + i + 1);
    assert.ok(a < b, `${a} should sort before ${b}`);
  }
});

test('v7 ids minted in ONE millisecond are all distinct and all RFC 9562', async () => {
  // Pinned clock: every id shares its 48 timestamp bits, so only the random bits
  // separate them. Catches a dropped random fill (all ids identical -> 409s on a
  // parallel create) and makes a missing version/variant mask fail every run,
  // not one run in four.
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = await mintedId(1790000000000);
    assert.match(id, UUID_V7_RE);
    seen.add(id);
  }
  assert.equal(seen.size, 1000);
});

test('v7 minting still works with no crypto at all (Math.random fallback)', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  const realRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return realRandom(); };
  try {
    assert.equal(globalThis.crypto, undefined);
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const id = await mintedId(1790000000000);
      assert.match(id, UUID_V7_RE);
      seen.add(id);
    }
    assert.equal(seen.size, 200);
    // Proves the fallback ran: a client that captured crypto at load time would
    // pass everything above while never touching Math.random.
    assert.ok(randomCalls >= 200 * 16, `Math.random called ${randomCalls} times`);
  } finally {
    Math.random = realRandom;
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    else delete globalThis.crypto;
  }
  assert.notEqual(globalThis.crypto, undefined);
});

test('create preserves a caller-supplied id', async () => {
  const { client, fetchImpl } = makeClient({ status: 201, body: { id: 'x', type: 'character' } });
  const given = '11111111-2222-4333-8444-555555555555';
  await client.create('character', { id: given, name: 'K' });
  assert.equal(lastBody(fetchImpl).id, given);
});

// -- changes page parse ------------------------------------------------------

test('changes parses {cursor, changes, has_more, head}', async () => {
  const page = {
    cursor: 'opaque-abc',
    changes: [{ op: 'upsert', id: 'e1', type: 'character', element: { id: 'e1' }, updated_at: 't' }],
    has_more: false,
    head: 202,
  };
  const { client } = makeClient({ status: 200, body: page });
  const res = await client.changes();
  assert.equal(res.cursor, 'opaque-abc');
  assert.equal(res.has_more, false);
  assert.equal(res.head, 202);
  assert.equal(res.changes[0].op, 'upsert');
});

test('changes and changesAll: a page at the head carries a number cursor; it comes back a string', async () => {
  // production, demo key, 2026-10-16: since=<head> answered {cursor: 818, changes: [], has_more: false}
  const page = { cursor: 818, changes: [], has_more: false, head: 818, epoch: null };
  const { client } = makeClient({ status: 200, body: page });
  assert.equal((await client.changes({ since: '818' })).cursor, '818');
  const it = client.changesAll('818');
  const end = await it.next();
  assert.equal(end.done, true);
  assert.deepEqual(end.value, { cursor: '818', head: 818, epoch: null });
});

// -- key-kind detection ------------------------------------------------------

test('detectKeyKind classifies all four kinds', () => {
  assert.equal(detectKeyKind('ow_w_abc'), 'write');
  assert.equal(detectKeyKind('ow_r_abc'), 'read');
  assert.equal(detectKeyKind('ow_a_abc'), 'account');
  assert.equal(detectKeyKind('0000000011'), 'legacy');
  assert.equal(detectKeyKind('garbage'), 'unknown');
});

test('account key uses Bearer auth, world key uses API-Key/API-Pin', async () => {
  const { client: acct, fetchImpl: af } = makeClient({ status: 200, body: {} }, { apiKey: 'ow_a_tok' });
  await acct.getWorld();
  assert.equal(af.calls.at(-1).init.headers['Authorization'], 'Bearer ow_a_tok');

  const { client: w, fetchImpl: wf } = makeClient({ status: 200, body: {} });
  await w.getWorld();
  assert.equal(wf.calls.at(-1).init.headers['API-Key'], 'ow_w_test');
  assert.equal(wf.calls.at(-1).init.headers['API-Pin'], '1234');
});

// -- ELEMENT_TYPES completeness ---------------------------------------------

test('ELEMENT_TYPES lists all 22 slugs', () => {
  assert.equal(ELEMENT_TYPES.length, 22);
  assert.ok(ELEMENT_TYPES.includes('character'));
  assert.ok(ELEMENT_TYPES.includes('zone'));
});

// -- v1 compat surface unchanged (import-and-exists) ------------------------

test('4.0: the v1 client is GONE from the package root', async () => {
  const mod = await import('../dist/index.js');
  assert.equal(mod.OnlyWorldsClient, undefined);
  assert.equal(typeof mod.elementColor, 'function'); // v2 surface intact
});

// -- Images: the keel ticket, then the bytes to the edge -----------

const TICKET = {
  ticket: 'tkt.sig', upload_url: 'https://upload.example/v1/upload', prefix: 'u/w1/',
  max_bytes: 8, exp: 1900000000, uses: 1, issued_to: { account: 'a1', membership: null },
};
const UPLOADED = { url: 'https://media.example/u/w1/x.png', key: 'u/w1/x.png', bytes: 4, type: 'image/png', etag: 'e' };

/** keel answers the ticket, the edge answers `edge` (default: a 201). */
function imageFetch(edge = { status: 201, body: UPLOADED }) {
  return fakeFetch((url) => (url.endsWith('/media/ticket') ? { status: 201, body: TICKET } : edge));
}

test('createMediaTicket: POST /media/ticket with the key and PIN, no body', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  assert.deepEqual(await client.createMediaTicket(), TICKET);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://www.onlyworlds.com/api/v2/media/ticket');
  assert.equal(init.method, 'POST');
  assert.equal(init.body, undefined);
  assert.equal(init.headers['API-Key'], 'ow_w_test');
  assert.equal(init.headers['API-Pin'], '1234');
});

test('uploadImage: ticket from keel, bytes to upload_url with the ticket only, never the key or PIN', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.deepEqual(await client.uploadImage(bytes, { key: 'u/w1/x.png' }), UPLOADED);
  assert.equal(fetchImpl.calls.length, 2);
  const { url, init } = fetchImpl.calls[1];
  assert.equal(url, TICKET.upload_url);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, bytes);
  assert.deepEqual(init.headers, { Authorization: 'Bearer tkt.sig', 'X-Key': 'u/w1/x.png' });
});

test('uploadImage: a ticket you pass is used, keel is not called', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  await client.uploadImage(new Blob([new Uint8Array(3)]), { ticket: TICKET });
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [TICKET.upload_url]);
  assert.equal(fetchImpl.calls[0].init.headers['X-Key'], undefined);
});

test('uploadImage: larger than max_bytes throws 413 too_large and sends nothing', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  for (const big of [new Uint8Array(9), new Uint8Array(9).buffer, new Blob([new Uint8Array(9)])]) {
    await assert.rejects(client.uploadImage(big, { ticket: TICKET }), (e) => e instanceof OwApiError && e.status === 413 && e.code === 'too_large');
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test("uploadImage: the edge's refusal arrives as OwApiError with its code", async () => {
  const client = new OwV2Client({
    apiKey: 'ow_w_test', apiPin: '1234',
    fetch: imageFetch({ status: 401, body: { error: 'ticket_used', note: 'one upload per ticket; request another' } }),
  });
  await assert.rejects(client.uploadImage(new Uint8Array(4)), (e) => e instanceof OwApiError && e.status === 401 && e.code === 'ticket_used');
});

const RTICKET = {
  ticket: 'd1.sig', remove_url: 'https://upload.example/v1/remove', exp: 1900000000,
  key: 'u/w1/x.png', referenced: 2,
};
const REMOVED = { removed: 'u/w1/x.png', bytes: 4, cache: 'may_linger' };

/** keel answers the removal ticket, the edge answers `edge` (default: a 200). */
function removeFetch(edge = { status: 200, body: REMOVED }) {
  return fakeFetch((url) => (url.endsWith('/media/remove-ticket') ? { status: 200, body: RTICKET } : edge));
}

test('createRemovalTicket: POST /media/remove-ticket with the key and PIN and {key}; a full image_url is cut to its key', async () => {
  const fetchImpl = removeFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  assert.deepEqual(await client.createRemovalTicket('u/w1/x.png'), RTICKET);
  await client.createRemovalTicket('https://media.onlyworlds.com/u/w1/x.png');
  for (const { url, init } of fetchImpl.calls) {
    assert.equal(url, 'https://www.onlyworlds.com/api/v2/media/remove-ticket');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { key: 'u/w1/x.png' });
    assert.equal(init.headers['API-Key'], 'ow_w_test');
    assert.equal(init.headers['API-Pin'], '1234');
  }
});

test("removeImage: ticket from keel, removal at the ticket's remove_url with the ticket only, never the key or PIN", async () => {
  const fetchImpl = removeFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  assert.deepEqual(await client.removeImage('u/w1/x.png'), REMOVED);
  assert.equal(fetchImpl.calls.length, 2);
  const { url, init } = fetchImpl.calls[1];
  assert.equal(url, RTICKET.remove_url);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, undefined);
  assert.deepEqual(init.headers, { Authorization: 'Bearer d1.sig' });
});

test('removeImage: a ticket you pass is used, keel is not called', async () => {
  const fetchImpl = removeFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
  await client.removeImage('u/w1/x.png', { ticket: RTICKET });
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [RTICKET.remove_url]);
});

test("removeImage: keel's refusal and the edge's arrive as OwApiError with their codes", async () => {
  const keelRefuses = new OwV2Client({
    apiKey: 'ow_w_test', apiPin: '1234',
    fetch: fakeFetch(() => ({ status: 409, body: { error: { type: 'invalid_request', code: 'upload_pending', message: 'retry' } } })),
  });
  await assert.rejects(keelRefuses.removeImage('u/w1/x.png'), (e) => e instanceof OwApiError && e.status === 409 && e.code === 'upload_pending');
  const edgeRefuses = new OwV2Client({
    apiKey: 'ow_w_test', apiPin: '1234', fetch: removeFetch({ status: 403, body: { error: 'not_removable' } }),
  });
  await assert.rejects(edgeRefuses.removeImage('u/w1/x.png'), (e) => e instanceof OwApiError && e.status === 403 && e.code === 'not_removable');
});

test('patchWorld carries the three unit settings (canonical 00.31.00) and still strips the server-managed keys', async () => {
  const { client, fetchImpl } = makeClient({ body: { id: 'w', name: 'W', length_unit: 'cm', mass_unit: 'kg', distance_unit: 'km' } });
  const w = await client.patchWorld({ length_unit: 'cm', mass_unit: 'kg', distance_unit: 'km', world: 'x', change_seq: 3 });
  assert.deepEqual(lastBody(fetchImpl), { length_unit: 'cm', mass_unit: 'kg', distance_unit: 'km' });
  assert.equal(w.length_unit, 'cm');
});

// -- Joining by link (keel #212) ---------------------------------------------

const PREVIEW = { reader: 'person', world: { name: 'W', description: '' }, invited_by: 'Ana', owner_character: null, role: 'guest', with_character: false, expires_at: '2026-10-19T00:00:00+00:00' };

test('previewJoin: POST /join/preview with the code and NO credential, whatever key the client holds', async () => {
  for (const apiKey of ['ow_a_acct', 'ow_w_test']) {
    const { client, fetchImpl } = makeClient({ body: PREVIEW }, { apiKey });
    const p = await client.previewJoin('ow_j_abc');
    const { url, init } = fetchImpl.calls.at(-1);
    assert.equal(init.method, 'POST');
    assert.ok(url.endsWith('/api/v2/join/preview'));
    assert.deepEqual(JSON.parse(init.body), { code: 'ow_j_abc' });
    assert.equal(init.headers['Authorization'], undefined);
    assert.equal(init.headers['API-Key'], undefined);
    assert.equal(init.headers['API-Pin'], undefined);
    assert.equal(p.reader, 'person');
  }
});

test('previewJoin: a bad code is one 404 not_found, isNotFound', async () => {
  const { client } = makeClient({ status: 404, body: { error: { type: 'not_found', code: 'not_found', message: 'This join code is not valid.' } } });
  await assert.rejects(client.previewJoin('ow_j_bad'), (e) => e instanceof OwApiError && e.isNotFound && !e.isAlreadyMember);
});

test('acceptJoin: POST /account/join with the account Bearer, 201 membership back', async () => {
  const row = { id: 'm1', world_id: 'w1', world_name: 'W', role: 'guest', joined_at: '2026-10-12T00:00:00+00:00', roster_character: 'c1' };
  const { client, fetchImpl } = makeClient({ status: 201, body: row }, { apiKey: 'ow_a_acct', apiPin: undefined });
  const m = await client.acceptJoin('ow_j_abc');
  const { url, init } = fetchImpl.calls.at(-1);
  assert.ok(url.endsWith('/api/v2/account/join'));
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.deepEqual(JSON.parse(init.body), { code: 'ow_j_abc' });
  assert.deepEqual(m, row);
});

test('acceptJoin: the two 409s are told apart by code, without reading the message', async () => {
  for (const [code, getter] of [['already_member', 'isAlreadyMember'], ['pin_required', 'isPinRequired']]) {
    const { client } = makeClient({ status: 409, body: { error: { type: 'invalid_request', code, message: 'x' } } }, { apiKey: 'ow_a_acct' });
    await assert.rejects(client.acceptJoin('ow_j_abc'), (e) => e instanceof OwApiError && e[getter] === true
      && (getter === 'isAlreadyMember' ? !e.isPinRequired : !e.isAlreadyMember));
  }
});

test('acceptJoin with a world key is a TypeError before anything is sent', async () => {
  const { client, fetchImpl } = makeClient({ status: 201, body: {} });
  await assert.rejects(client.acceptJoin('ow_j_abc'), TypeError);
  assert.equal(fetchImpl.calls.length, 0);
});

// -- The feed's tip (keel S15, ?head=true) ---------------------------------------

test('changesHead: GET /changes?head=true alone (no since, no limit), head and cursor back', async () => {
  const { client, fetchImpl } = makeClient({ body: { cursor: 4021, changes: [], has_more: false, head: 4021, epoch: null } });
  const tip = await client.changesHead();
  const u = new URL(fetchImpl.calls.at(-1).url);
  assert.equal(fetchImpl.calls.at(-1).init.method, 'GET');
  assert.ok(u.pathname.endsWith('/api/v2/changes/'));
  assert.deepEqual([...u.searchParams.entries()], [['head', 'true']]);
  // keel sends the owner's cursor as a number; every cursor the SDK hands out is a string
  assert.deepEqual(tip, { head: 4021, cursor: '4021', epoch: null });
});

test('changesHead: a guest\'s epoch-bearing cursor passes through verbatim', async () => {
  const c = '4021:ffffffff-ffff-ffff-ffff-ffffffffffff:3';
  const { client } = makeClient({ body: { cursor: c, changes: [], has_more: false, head: 4021, epoch: 3 } });
  assert.deepEqual(await client.changesHead(), { head: 4021, cursor: c, epoch: 3 });
});

test('changesHead: a keel from before the epoch field still answers, epoch null', async () => {
  const { client } = makeClient({ body: { cursor: 7, changes: [], has_more: false, head: 7 } });
  assert.deepEqual(await client.changesHead(), { head: 7, cursor: '7', epoch: null });
});

test('changesHead: epoch_reason passes through when keel sends it (keel #421, hidden mark on)', async () => {
  const c = '4021:ffffffff-ffff-ffff-ffff-ffffffffffff:3';
  const { client } = makeClient({ body: { cursor: c, changes: [], has_more: false, head: 4021, epoch: 3, epoch_reason: 'role' } });
  assert.deepEqual(await client.changesHead(), { head: 4021, cursor: c, epoch: 3, epoch_reason: 'role' });
  const owner = makeClient({ body: { cursor: 7, changes: [], has_more: false, head: 7, epoch: null, epoch_reason: null } });
  assert.deepEqual(await owner.client.changesHead(), { head: 7, cursor: '7', epoch: null, epoch_reason: null });
});

test('changesAll: pages to the tail, yields in order, returns the last page cursor, head and epoch', async () => {
  const pages = [
    { cursor: '1:a', changes: [{ op: 'upsert', id: 'a' }], has_more: true, head: 9, epoch: 2 },
    { cursor: '9:z:2', changes: [{ op: 'upsert', id: 'b' }], has_more: false, head: 9, epoch: 2 },
  ];
  let n = 0;
  const { client, fetchImpl } = makeClient(() => ({ body: pages[n++] }));
  const it = client.changesAll();
  const seen = [];
  let r = await it.next();
  while (!r.done) { seen.push(r.value.id); r = await it.next(); }
  assert.deepEqual(seen, ['a', 'b']);
  assert.deepEqual(r.value, { cursor: '9:z:2', head: 9, epoch: 2 });
  assert.equal(new URL(fetchImpl.calls[1].url).searchParams.get('since'), '1:a');
});

test('changesAll: a keel without the epoch field returns epoch null', async () => {
  const { client } = makeClient({ body: { cursor: '5:x', changes: [], has_more: false, head: 5 } });
  const it = client.changesAll();
  let r = await it.next();
  while (!r.done) r = await it.next();
  assert.deepEqual(r.value, { cursor: '5:x', head: 5, epoch: null });
});

// -- keel #299: the agent declaration (X-OW-Agent) ---------------------------

test('agent: off by default, no X-OW-Agent on reads or writes', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', type: 'character', name: 'A' } });
  await client.get('character', 'x');
  await client.patch('character', 'x', { name: 'B' });
  for (const c of fetchImpl.calls) assert.equal('X-OW-Agent' in c.init.headers, false);
});

test('agent: true sends X-OW-Agent on the six element writes, where keel declares it', async () => {
  const body = { id: 'x', type: 'character', name: 'A', results: [] };
  const { client, fetchImpl } = makeClient({ status: 200, body }, { agent: true });
  await client.create('character', { name: 'B' });
  await client.upsert('character', 'x', { name: 'B' });
  await client.patch('character', 'x', { name: 'C' });
  await client.editLinks('character', 'x', 'species', { add: ['y'] });
  await client.bulk([{ type: 'character', element: { name: 'D' } }]);
  const del = makeClient({ status: 204 }, { agent: true });
  await del.client.delete('character', 'x');
  const sent = [...fetchImpl.calls, ...del.fetchImpl.calls].map((c) => [c.init.method, c.init.headers['X-OW-Agent']]);
  assert.deepEqual(sent, [['POST', '1'], ['PUT', '1'], ['PATCH', '1'], ['POST', '1'], ['POST', '1'], ['DELETE', '1']]);
});

test('agent: true sends no X-OW-Agent on reads, world meta, account routes or the image edge', async () => {
  const { client, fetchImpl } = makeClient({ status: 200, body: { id: 'x', type: 'character', name: 'A', data: [] } }, { agent: true });
  await client.get('character', 'x');
  await client.list('character');
  await client.patchWorld({ name: 'W' });
  await client.me();
  for (const c of fetchImpl.calls) assert.equal('X-OW-Agent' in c.init.headers, false, `${c.init.method} ${c.url}`);
  const acct = makeClient({ status: 200, body: {} }, { apiKey: 'ow_a_test', agent: true });
  await acct.client.allowance();
  assert.equal('X-OW-Agent' in acct.fetchImpl.calls.at(-1).init.headers, false);
  const img = imageFetch();
  const up = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: img, agent: true });
  await up.uploadImage(new Uint8Array([1, 2, 3]), { key: 'u/w1/x.png' });
  assert.equal('X-OW-Agent' in img.calls[0].init.headers, false);
  assert.deepEqual(img.calls[1].init.headers, { Authorization: 'Bearer tkt.sig', 'X-Key': 'u/w1/x.png' });
});

test('isAgentDoor: seat, mcp and declared are agent-made; the surfaces and null are not', async () => {
  const { isAgentDoor, AGENT_DOORS } = await import('../dist/index.js');
  assert.deepEqual([...AGENT_DOORS], ['seat', 'mcp', 'declared']);
  for (const d of ['seat', 'mcp', 'declared']) assert.equal(isAgentDoor(d), true, d);
  for (const d of ['api', 'v1', 'sync', 'server', null, undefined]) assert.equal(isAgentDoor(d), false, String(d));
});

test('isKnownOf: true only for known_of: true (keel PR 113); absent, false or anything else is whole', async () => {
  const { isKnownOf } = await import('../dist/index.js');
  assert.equal(isKnownOf({ id: 'x', name: 'Dev', known_of: true }), true);
  for (const el of [{ id: 'x', name: 'Dev' }, { known_of: false }, { known_of: 'true' }, { known_of: 1 }, {}, null, undefined]) {
    assert.equal(isKnownOf(el), false, JSON.stringify(el));
  }
});
