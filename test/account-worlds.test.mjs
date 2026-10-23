/**
 * createAccountWorld (POST /api/v2/account/worlds, keel #363 key_name, keel #571 source and
 * producer): the account Bearer, a body of `name` and only the options given, in keel's spelling;
 * the PIN dance Atlas's Make online runs (an account with no PIN answers 422 `param: 'pin'` until
 * one is sent); the 201's world row and write key returned as keel sends them. Shapes from keel's
 * document (https://www.onlyworlds.com/api/v2/openapi.json, read 2026-10-23) and its handler
 * (accounts/api.py create_world). Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/** The 201 as keel's handler builds it: `_world_row(world, 'owner')` plus `key`. */
const CREATED = {
  id: '018f0000-0000-7000-8000-0000000000w1', name: 'Ostvik', role: 'owner', public_read: false,
  keys: [{ name: 'atlas · windows', last4: 'abcd', scope: 'WRITE', revoked: false }],
  key: 'ow_w_fullwritekeyabcd',
};
const SOURCE = { server: 'https://www.onlyworlds.com', world: 'w0', at: '2026-10-23T08:00:00Z' };
const PRODUCER = { tool: 'atlas', version: '1.83.0', input: 'folder' };

const account = (answer, cfg = {}) => {
  const f = fake(answer);
  return { c: new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch, ...cfg }), calls: f.calls };
};
const bodyOf = (call) => JSON.parse(call.init.body);

test('createAccountWorld: POST /account/worlds with the account Bearer and { name } alone; the 201 returned as sent', async () => {
  const { c, calls } = account({ status: 201, body: CREATED });
  assert.deepEqual(await c.createAccountWorld({ name: 'Ostvik' }), CREATED);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://www.onlyworlds.com/api/v2/account/worlds');
  assert.equal(init.method, 'POST');
  assert.deepEqual(bodyOf(calls[0]), { name: 'Ostvik' });
  assert.deepEqual(Object.keys(init.headers).sort(), ['Authorization', 'Content-Type']);
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
});

test('createAccountWorld: each option alone is sent in keel\'s spelling, and nothing else beside name', async () => {
  const cases = [
    [{ pin: '4821' }, { pin: '4821' }],
    [{ pin: 4821 }, { pin: 4821 }],
    [{ keyName: 'atlas · windows' }, { key_name: 'atlas · windows' }],
    [{ keyName: null }, { key_name: null }],
    [{ source: SOURCE }, { source: SOURCE }],
    [{ source: null }, { source: null }],
    [{ producer: PRODUCER }, { producer: PRODUCER }],
    [{ producer: null }, { producer: null }],
  ];
  for (const [opts, sent] of cases) {
    const { c, calls } = account({ status: 201, body: CREATED });
    await c.createAccountWorld({ name: 'Ostvik', ...opts });
    assert.deepEqual(bodyOf(calls[0]), { name: 'Ostvik', ...sent }, JSON.stringify(opts));
  }
  const { c, calls } = account({ status: 201, body: CREATED });
  await c.createAccountWorld({ name: 'Ostvik', pin: '4821', keyName: 'k', source: SOURCE, producer: PRODUCER });
  assert.deepEqual(bodyOf(calls[0]), { name: 'Ostvik', pin: '4821', key_name: 'k', source: SOURCE, producer: PRODUCER });
});

test('createAccountWorld: an option given as undefined is left out of the body, never sent as a key', async () => {
  const { c, calls } = account({ status: 201, body: CREATED });
  await c.createAccountWorld({ name: 'Ostvik', pin: undefined, keyName: undefined, source: undefined, producer: undefined });
  assert.equal(calls[0].init.body, JSON.stringify({ name: 'Ostvik' }));
});

test('createAccountWorld: an agent client with a name sends neither X-OW-Agent nor X-OW-Client (the document lists no header here), and no Idempotency-Key', async () => {
  const { c, calls } = account({ status: 201, body: CREATED }, { agent: true, client: 'atlas', apiPin: '1234' });
  await c.createAccountWorld({ name: 'Ostvik' });
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ['Authorization', 'Content-Type']);
});

test('createAccountWorld: the PIN dance: a fresh account\'s 422 param pin is an OwApiError with err.param \'pin\'; the retry with the PIN makes the world', async () => {
  const pinRequired = {
    status: 422,
    body: { error: { type: 'invalid_request_error', code: 'invalid_request', message: "Your account has no PIN yet. Provide 'pin' (4 digits, 1000-9999) with your first world; it becomes your account PIN and the write wall on all your worlds.", param: 'pin' } },
  };
  const { c, calls } = account((url, init) => ('pin' in JSON.parse(init.body) ? { status: 201, body: CREATED } : pinRequired));
  let err;
  try {
    await c.createAccountWorld({ name: 'Ostvik', keyName: 'k' });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof OwApiError, `expected an OwApiError, got ${err}`);
  assert.equal(err.status, 422);
  assert.equal(err.code, 'invalid_request');
  assert.equal(err.param, 'pin');
  assert.equal(err.isValidationError, true);
  const made = await c.createAccountWorld({ name: 'Ostvik', keyName: 'k', pin: '4821' });
  assert.equal(made.key, CREATED.key);
  assert.deepEqual(calls.map(bodyOf), [{ name: 'Ostvik', key_name: 'k' }, { name: 'Ostvik', key_name: 'k', pin: '4821' }]);
});

test('createAccountWorld: an unknown option, a world key, or no name is a TypeError before anything is sent', async () => {
  const { c, calls } = account({ status: 201, body: CREATED });
  await assert.rejects(c.createAccountWorld({ name: 'Ostvik', key_name: 'k' }),
    (e) => e instanceof TypeError && /^createAccountWorld: unknown parameter 'key_name'/.test(e.message) && /keyName/.test(e.message));
  await assert.rejects(c.createAccountWorld({ name: 'Ostvik', pn: '4821' }), (e) => e instanceof TypeError && /'pn'/.test(e.message));
  await assert.rejects(c.createAccountWorld({}), (e) => e instanceof TypeError && /name is required/.test(e.message));
  await assert.rejects(c.createAccountWorld(), TypeError);
  const w = fake({ status: 201, body: CREATED });
  const world = new OwV2Client({ apiKey: 'ow_w_world', apiPin: '1234', fetch: w.fetch });
  await assert.rejects(world.createAccountWorld({ name: 'Ostvik' }), (e) => e instanceof TypeError && /account token/.test(e.message));
  assert.equal(calls.length + w.calls.length, 0, 'nothing was sent');
});

test('the published types: OwCreateAccountWorldInput\'s five keys, OwCreatedAccountWorld the list row plus key', () => {
  const all = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const block = (name) => {
    const at = all.indexOf(`interface ${name} {`);
    assert.ok(at >= 0, `${name} is declared`);
    return all.slice(at, all.indexOf('\n}', at));
  };
  const keys = (src) => [...src.matchAll(/^\s{4}(\w+)(\??):/gm)].map((m) => m[1] + m[2]);
  assert.deepEqual(keys(block('OwCreateAccountWorldInput')), ['name', 'pin?', 'keyName?', 'source?', 'producer?']);
  assert.deepEqual(keys(block('OwCreatedAccountWorld')), ['id', 'name', 'role', 'public_read', 'keys', 'key']);
  assert.match(block('OwCreatedAccountWorld'), /\bkey: string;/);
  assert.match(all, /createAccountWorld\(opts: OwCreateAccountWorldInput\): Promise<OwCreatedAccountWorld>;/);
});
