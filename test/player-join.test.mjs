/**
 * A friend with only a link (keel #353): redeemJoin posts the code to /join with no credential
 * whatever key the client holds, sends only the names that are set, and returns the answer whose
 * `kind` tells a player's read key from an agent's seat; createWorldLink makes a player link.
 * Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const text = body === undefined ? '' : JSON.stringify(body);
    return { ok: status < 300, status, headers: new Headers(), async text() { return text; }, async json() { return body; } };
  };
  return { fetch, calls };
}

const PLAYER = {
  kind: 'player', key: 'ow_r_playerkey', role: 'guest',
  world: { id: 'w1', name: 'Moppetopia', description: '' },
  character: { id: 'c1', name: 'Ysolde' },
};
const credentials = (init) => Object.keys(init.headers ?? {}).filter((h) => ['api-key', 'api-pin', 'authorization'].includes(h.toLowerCase()));

test('redeemJoin: POST /join with the code and no credential, from any client', async () => {
  for (const auth of [{ apiKey: 'ow_a_acct' }, { apiKey: 'ow_w_world', apiPin: '1234' }]) {
    const f = fake(201, PLAYER);
    const c = new OwV2Client({ ...auth, fetch: f.fetch });
    const got = await c.redeemJoin('ow_j_code');
    assert.equal(got.kind, 'player');
    const { url, init } = f.calls[0];
    assert.match(url, /\/api\/v2\/join\/?$/);
    assert.equal(init.method, 'POST');
    assert.deepEqual(credentials(init), [], `no credential with ${auth.apiKey.slice(0, 5)}`);
    assert.deepEqual(JSON.parse(init.body), { code: 'ow_j_code' });
  }
});

test('redeemJoin: a player\'s name and an agent\'s name in keel\'s spelling, only when set', async () => {
  const f = fake(201, PLAYER);
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.redeemJoin('ow_j_code', { name: 'Ana' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_code', name: 'Ana' });
  await c.redeemJoin('ow_j_code', { agentName: 'Quill' });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { code: 'ow_j_code', agent_name: 'Quill' });
});

test('createWorldLink: a player link with its Character', async () => {
  const f = fake(201, {});
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await c.createWorldLink('w1', { reader: 'player', character: 'c1' });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { reader: 'player', character: 'c1' });
});
