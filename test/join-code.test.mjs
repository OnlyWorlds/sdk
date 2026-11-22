/**
 * A join code that is no code (empty, blank, not a string) is refused by previewJoin, redeemJoin and
 * acceptJoin before anything is sent, as the engine packages refuse it; a null option of redeemJoin
 * is left out, since keel's document types name, agent_name and character as strings, never null.
 * Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const body = { kind: 'player', key: 'ow_r_k', role: 'guest', world: { id: 'w1', name: 'W', description: '' }, character: { id: 'c1', name: 'C' } };
    const text = JSON.stringify(body);
    return { ok: true, status: 201, headers: new Headers(), async text() { return text; }, async json() { return body; } };
  };
  return { fetch, calls };
}

const NO_CODES = ['', '   ', undefined, null, 42];

for (const [name, call] of [
  ['previewJoin', (c, code) => c.previewJoin(code)],
  ['redeemJoin', (c, code) => c.redeemJoin(code)],
  ['acceptJoin', (c, code) => c.acceptJoin(code)],
]) {
  test(`${name}: no code is a TypeError, and nothing is sent`, async () => {
    for (const code of NO_CODES) {
      const f = fake();
      const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
      await assert.rejects(() => call(c, code), (e) => e instanceof TypeError && e.message.startsWith(`${name}: the code is empty`), `${name}(${JSON.stringify(code)})`);
      assert.equal(f.calls.length, 0, `${name}(${JSON.stringify(code)}) sent a request`);
    }
  });
}

test('redeemJoin: a code is sent as given (a code with a character is not refused)', async () => {
  const f = fake();
  const c = new OwV2Client({ fetch: f.fetch });
  await c.redeemJoin('ow_j_x');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_x' });
});

test('redeemJoin: a null option is left out, as undefined is', async () => {
  const f = fake();
  const c = new OwV2Client({ fetch: f.fetch });
  await c.redeemJoin('ow_j_code', { name: null, agentName: null, character: null });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { code: 'ow_j_code' });
  await c.redeemJoin('ow_j_code', { name: 'Ana', agentName: null });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { code: 'ow_j_code', name: 'Ana' });
});
