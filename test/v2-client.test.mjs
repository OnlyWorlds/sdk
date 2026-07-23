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

// -- UUID minting on id-less create -----------------------------------------

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('create mints a v4 UUID when element.id is absent', async () => {
  const { client, fetchImpl } = makeClient({ status: 201, body: { id: 'server', type: 'character' } });
  await client.create('character', { name: 'K' });
  const sent = lastBody(fetchImpl);
  assert.match(sent.id, UUID_V4_RE);
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
