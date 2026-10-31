/**
 * listAccountTokens and revokeAccountToken (GET /api/v2/account/tokens, DELETE
 * /api/v2/account/tokens/{token_id}): the account Bearer alone, the rows returned as keel sends
 * them, the token's id escaped, no body and no write header. Shapes from keel's document
 * (https://www.onlyworlds.com/api/v2/openapi.json, read 2026-10-31) and its handlers
 * (accounts/api.py list_tokens, revoke_token). Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../dist/index.js';

const { OwV2Client, OwApiError } = sdk;

function fake(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const r = typeof answer === 'function' ? answer(url, init) : answer;
    const status = r.status ?? 200;
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300, status, headers: new Headers(),
      async text() { return text; }, async json() { return r.body; },
    };
  };
  return { fetch, calls };
}

/** One row as keel's list builds it: a sign-in tool's token, and a hosted client's MCP grant. */
const ROWS = [
  { id: '018f0000-0000-7000-8000-0000000000t1', name: 'atlas', last4: 'abcd', last_used_at: '2026-10-31T06:00:00Z',
    revoked: false, expires_at: null, keys_minted: 2, audience: '' },
  { id: '018f0000-0000-7000-8000-0000000000t2', name: 'claude', last4: 'wxyz', last_used_at: null,
    revoked: false, expires_at: '2026-10-31T07:00:00Z', keys_minted: 0, audience: 'mcp', client: 'Claude', return_host: 'claude.ai' },
];

const account = (answer, cfg = {}) => {
  const f = fake(answer);
  return { f, c: new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch, ...cfg }) };
};

test('listAccountTokens: GET /account/tokens with the Bearer alone; the rows returned as sent', async () => {
  const { f, c } = account({ body: { data: ROWS } });
  const rows = await c.listAccountTokens();
  assert.deepEqual(rows, ROWS);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  const u = new URL(url);
  assert.equal(u.pathname, '/api/v2/account/tokens');
  assert.equal(u.search, '');
  assert.equal(init.method, 'GET');
  const headers = init.headers ?? {};
  assert.equal(headers.Authorization, 'Bearer ow_a_acct');
  for (const h of ['API-Key', 'API-Pin', 'X-OW-Agent', 'X-OW-Client']) assert.ok(!(h in headers), h);
});

test('revokeAccountToken: DELETE /account/tokens/{id} with the id escaped, no body, no write header, even on an agent client', async () => {
  for (const cfg of [{}, { agent: true }]) {
    const { f, c } = account({ status: 204 }, cfg);
    assert.equal(await c.revokeAccountToken('a b/c'), undefined);
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(new URL(url).pathname, '/api/v2/account/tokens/a%20b%2Fc');
    assert.equal(init.method, 'DELETE');
    assert.equal(init.body, undefined);
    const headers = init.headers ?? {};
    assert.equal(headers.Authorization, 'Bearer ow_a_acct');
    for (const h of ['API-Key', 'API-Pin', 'X-OW-Agent', 'X-OW-Client']) assert.ok(!(h in headers), h);
  }
});

test('revokeAccountToken: signal and keepalive reach fetch as given; an unknown option is a TypeError before sending', async () => {
  const signal = new AbortController().signal;
  const { f, c } = account({ status: 204 });
  await c.revokeAccountToken('t1', { signal, keepalive: true });
  assert.equal(f.calls[0].init.signal, signal);
  assert.equal(f.calls[0].init.keepalive, true);
  const g = account({ status: 204 });
  await assert.rejects(async () => g.c.revokeAccountToken('t1', { keepAlive: true }), TypeError);
  assert.equal(g.f.calls.length, 0);
});

test('revokeAccountToken: an id that is not the account\'s is the 404, err.isNotFound', async () => {
  const { c } = account({ status: 404, body: { error: { type: 'not_found', code: 'not_found', message: "token 'x' not found.", param: null } } });
  await assert.rejects(async () => c.revokeAccountToken('x'), (err) => err instanceof OwApiError && err.isNotFound);
});

test('both: a world key, or an empty id, is a TypeError before anything is sent', async () => {
  const f = fake({ status: 204 });
  const world = new OwV2Client({ apiKey: 'ow_w_key', apiPin: '1234', fetch: f.fetch });
  await assert.rejects(async () => world.listAccountTokens(), (err) => err instanceof TypeError && /account token/.test(err.message));
  await assert.rejects(async () => world.revokeAccountToken('t1'), (err) => err instanceof TypeError && /account token/.test(err.message));
  const { f: g, c } = account({ status: 204 });
  for (const bad of ['', undefined, 7]) {
    await assert.rejects(async () => c.revokeAccountToken(bad), (err) => err instanceof TypeError && /tokenId/.test(err.message));
  }
  assert.equal(f.calls.length + g.calls.length, 0, 'nothing sent');
});
