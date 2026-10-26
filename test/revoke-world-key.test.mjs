/**
 * revokeWorldKey (DELETE /api/v2/account/worlds/{id}/keys/{key_id}): the account Bearer, the key
 * by the id mintWorldKey returned, a 204 resolved; keel's 404 for a key that is not the caller's
 * thrown as isNotFound; a world key refused before anything is sent. Shapes from keel's handler
 * (accounts/api.py revoke_world_key: a revoked key stays listed, so a second revoke is the same
 * 204). Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake(status, body) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const text = body === undefined ? '' : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: new Headers(), async text() { return text; }, async json() { return body; } };
  };
  return { fetch, calls };
}

test('revokeWorldKey: DELETE the key by id with the account Bearer; a 204 resolves', async () => {
  const f = fake(204);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.equal(await c.revokeWorldKey('w/1', 'k/1'), undefined);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://www.onlyworlds.com/api/v2/account/worlds/w%2F1/keys/k%2F1');
  assert.equal(f.calls[0].init.method, 'DELETE');
  assert.equal(f.calls[0].init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.equal(f.calls[0].init.body, undefined);
});

test('revokeWorldKey: a key that is not the caller\'s is keel\'s 404, isNotFound', async () => {
  const f = fake(404, { error: { type: 'not_found', code: 'not_found', message: "key 'k1' not found.", param: null, doc_url: null } });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const err = await c.revokeWorldKey('w1', 'k1').then(() => assert.fail('expected a throw'), (e) => e);
  assert.equal(err.isNotFound, true);
});

test('revokeWorldKey: a world key is a TypeError before anything is sent', async () => {
  const f = fake(204);
  const c = new OwV2Client({ apiKey: 'ow_w_world', apiPin: '1234', fetch: f.fetch });
  await assert.rejects(c.revokeWorldKey('w1', 'k1'), TypeError);
  assert.equal(f.calls.length, 0);
});
