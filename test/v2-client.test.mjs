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
  OwV2Client, OwApiError, detectKeyKind, ELEMENT_TYPES,
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
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '2589', fetch: fetchImpl, ...cfg });
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
// (idempotency_error), core/admission.py (server_busy + retry-after). doc_url varies in keel
// itself (/api/errors# vs /docs/api/errors#); these tests don't depend on it.

const envelope = (type, code) => ({ error: { type, code, message: code, param: null,
  doc_url: `https://onlyworlds.github.io/docs/api/errors#${code}` } });

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
  assert.equal(wf.calls.at(-1).init.headers['API-Pin'], '2589');
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

// -- Images: the keel ticket, then the bytes to the edge (Keel #59) -----------

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
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '2589', fetch: fetchImpl });
  assert.deepEqual(await client.createMediaTicket(), TICKET);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://www.onlyworlds.com/api/v2/media/ticket');
  assert.equal(init.method, 'POST');
  assert.equal(init.body, undefined);
  assert.equal(init.headers['API-Key'], 'ow_w_test');
  assert.equal(init.headers['API-Pin'], '2589');
});

test('uploadImage: ticket from keel, bytes to upload_url with the ticket only, never the key or PIN', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '2589', fetch: fetchImpl });
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
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '2589', fetch: fetchImpl });
  await client.uploadImage(new Blob([new Uint8Array(3)]), { ticket: TICKET });
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [TICKET.upload_url]);
  assert.equal(fetchImpl.calls[0].init.headers['X-Key'], undefined);
});

test('uploadImage: larger than max_bytes throws 413 too_large and sends nothing', async () => {
  const fetchImpl = imageFetch();
  const client = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '2589', fetch: fetchImpl });
  for (const big of [new Uint8Array(9), new Uint8Array(9).buffer, new Blob([new Uint8Array(9)])]) {
    await assert.rejects(client.uploadImage(big, { ticket: TICKET }), (e) => e instanceof OwApiError && e.status === 413 && e.code === 'too_large');
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test("uploadImage: the edge's refusal arrives as OwApiError with its code", async () => {
  const client = new OwV2Client({
    apiKey: 'ow_w_test', apiPin: '2589',
    fetch: imageFetch({ status: 401, body: { error: 'ticket_used', note: 'one upload per ticket; request another' } }),
  });
  await assert.rejects(client.uploadImage(new Uint8Array(4)), (e) => e instanceof OwApiError && e.status === 401 && e.code === 'ticket_used');
});
