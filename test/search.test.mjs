/**
 * search(q, {type, limit, viewAs}): GET /search with the words as `q`, each option under its wire name and only
 * when given, the answer handed back as served (a known-of row keeps its mark), and nothing sent for a `q` that
 * is not a string or an option the method does not know. Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

const API = 'https://www.onlyworlds.com/api/v2';
const ANSWER = {
  query: 'APP-142',
  results: [
    { type: 'object', id: '0193f1c2-7a00-7000-8000-000000000001', name: 'Tidetable', supertype: 'Product', subtype: 'locked', field: 'description', snippet: 'Ticket: APP-142' },
    { type: 'character', id: '0193f1c2-7a00-7000-8000-000000000002', name: 'Ada', supertype: 'Person', subtype: '', field: 'name', snippet: 'Ada', known_of: true },
  ],
  count: 2,
  truncated: false,
};

function fake() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const text = JSON.stringify(ANSWER);
    return { ok: true, status: 200, headers: new Headers(), async text() { return text; }, async json() { return ANSWER; } };
  };
  return { fetch, calls };
}
const client = (fetch) => new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch });

test('search: GET /search with q alone, the answer whole', async () => {
  const f = fake();
  assert.deepEqual(await client(f.fetch).search('APP-142'), ANSWER);
  assert.equal(f.calls.length, 1);
  const u = new URL(f.calls[0].url);
  assert.equal(u.origin + u.pathname, `${API}/search`);
  assert.equal(f.calls[0].init.method, 'GET');
  assert.deepEqual([...u.searchParams], [['q', 'APP-142']]);
  assert.equal(f.calls[0].init.headers['API-Key'], 'ow_w_test');
  assert.equal(f.calls[0].init.headers['API-Pin'], undefined, 'a read of a world key sends no PIN');
});

test('search: type, limit and viewAs go out as type, limit and as', async () => {
  const f = fake();
  await client(f.fetch).search('copper mine', { type: 'location', limit: 200, viewAs: 'public' });
  const u = new URL(f.calls[0].url);
  assert.deepEqual(Object.fromEntries(u.searchParams), { q: 'copper mine', type: 'location', limit: '200', as: 'public' });
});

test('search: an option it does not know, or a q that is not a string, sends nothing', async () => {
  const f = fake();
  await assert.rejects(client(f.fetch).search('harbour', { filter: { supertype: 'Port' } }), TypeError);
  await assert.rejects(client(f.fetch).search('harbour', { types: 'location' }), TypeError);
  for (const bad of [undefined, null, 42, ['harbour']]) await assert.rejects(client(f.fetch).search(bad), TypeError, String(bad));
  assert.equal(f.calls.length, 0);
});
