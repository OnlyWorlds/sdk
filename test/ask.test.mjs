/**
 * Ask your world (keel #159): buildAskContext keeps the caller's elements in order within
 * keel's limits and says what it kept; client.ask sends the account Bearer and the body
 * keel reads. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OwV2Client, OwApiError, buildWorldIndex, lookupWorld, buildAskContext, renderElement, ASK_LIMITS,
} from '../dist/index.js';

const el = (id, name, description = '') => ({ id, type: 'character', name, description });
// renderElement keeps 500 characters of a description, other text fields whole: long cards come from those
const long = (id, name, background) => ({ id, type: 'character', name, background });
const chars = (s) => [...s].length;

test('keel\'s limits', () => {
  assert.deepEqual({ ...ASK_LIMITS }, { questionMax: 500, itemsMax: 8, itemMax: 2000, totalMax: 12000 });
});

test('the elements as given, in their order, never a second lookup', () => {
  const els = [el('a', 'Mira Thel', 'Holds the fort.'), el('b', 'Oren'), el('c', 'Balkonon')];
  const index = buildWorldIndex(els);
  const shown = [els[2], els[0]]; // the screen's order, not the lookup's
  const r = buildAskContext(shown, index);
  assert.deepEqual(r.kept, ['c', 'a']);
  assert.deepEqual(r.context, [renderElement(els[2], index), renderElement(els[0], index)]);
  assert.deepEqual(r.dropped, []);
  // lookup hits work the same, unwrapped
  const hits = lookupWorld(index, 'Mira Thel');
  assert.equal(buildAskContext(hits.slice(0, 1), index).kept[0], 'a');
});

test('past the 8th is dropped and named', () => {
  const els = Array.from({ length: 10 }, (_, i) => el(`e${i}`, `Name ${i}`));
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.equal(r.context.length, 8);
  assert.deepEqual(r.dropped, ['e8', 'e9']);
});

test('a text over 2,000 characters is cut and named; counted in characters, as keel counts', () => {
  const big = long('l', 'Long', '\u{1F409}'.repeat(3000)); // astral: 2 UTF-16 units, 1 character each
  const r = buildAskContext([big], buildWorldIndex([big]));
  assert.equal(chars(r.context[0]), 2000);
  assert.deepEqual(r.truncated, ['l']);
  // 1,900 characters that are 3,800 UTF-16 units: under keel's 2,000, so kept whole
  const mid = long('m', 'Mid', '\u{1F409}'.repeat(1880));
  const r2 = buildAskContext([mid], buildWorldIndex([mid]));
  assert.ok(chars(r2.context[0]) <= 2000 && r2.context[0].length > 2000);
  assert.deepEqual(r2.truncated, []);
});

test('the 12,000 total stops the list at the first that does not fit; the rest is dropped, in order', () => {
  const els = Array.from({ length: 8 }, (_, i) => long(`t${i}`, `T${i}`, 'x'.repeat(2500)));
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.equal(r.kept.length, 6); // 6 x 2000 = 12000
  assert.ok(r.context.reduce((n, s) => n + chars(s), 0) <= 12000);
  assert.deepEqual(r.dropped, ['t6', 't7']);
  assert.ok(!r.truncated.includes('t6'));
  // a small one after the cut is dropped too: what is sent is the top of the list as shown
  // (cards of about 1,800: six hold 10,800, the seventh does not fit, a small eighth would)
  const mids = Array.from({ length: 7 }, (_, i) => long(`u${i}`, `U${i}`, 'y'.repeat(1780)));
  const withSmall = [...mids, el('s', 'Small')];
  const r2 = buildAskContext(withSmall, buildWorldIndex(withSmall));
  assert.deepEqual(r2.kept, ['u0', 'u1', 'u2', 'u3', 'u4', 'u5']);
  assert.deepEqual(r2.dropped, ['u6', 's']);
});

function fake(script) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = script;
    return { ok: r.status < 300, status: r.status, headers: new Headers(r.headers ?? {}), async text() { return JSON.stringify(r.body); }, async json() { return r.body; } };
  };
  return { fetch, calls };
}

test('client.ask: POST /account/ask with the account Bearer and keel\'s body', async () => {
  const reply = { answer: 'Mira Thel holds it.', model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 300, output_tokens: 12 }, remaining: 49 };
  const f = fake({ status: 200, body: reply });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const r = await c.ask({ worldId: 'w1', question: 'Who holds Balkonon?', context: ['Mira Thel (character)'] });
  const { url, init } = f.calls[0];
  assert.ok(url.endsWith('/api/v2/account/ask'));
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.deepEqual(JSON.parse(init.body), { world_id: 'w1', question: 'Who holds Balkonon?', context: ['Mira Thel (character)'] });
  assert.deepEqual(r, reply);
});

test('client.ask: a world key is a TypeError before anything is sent', async () => {
  const f = fake({ status: 200, body: {} });
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1', fetch: f.fetch });
  await assert.rejects(c.ask({ worldId: 'w', question: 'q', context: ['x'] }), TypeError);
  assert.equal(f.calls.length, 0);
});

test('client.ask: the three refusals, by code', async () => {
  for (const [status, code, getter] of [[429, 'quota_exceeded', 'isQuotaExceeded'], [503, 'ask_unavailable', 'isAskUnavailable'], [502, 'ask_failed', 'isAskFailed']]) {
    const f = fake({ status, body: { error: { type: 'x', code, message: 'm' } }, headers: status === 429 ? { 'Retry-After': '3600' } : {} });
    const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
    await assert.rejects(c.ask({ worldId: 'w', question: 'q', context: ['x'] }), (e) => {
      const others = ['isQuotaExceeded', 'isAskUnavailable', 'isAskFailed'].filter((g) => g !== getter);
      return e instanceof OwApiError && e[getter] === true && others.every((g) => !e[g]) && (status !== 429 || e.retryAfter === 3600);
    });
  }
});

// -- client.sort (POST /account/sort): ask's sibling, one allowance ---------------------------

const mira = { id: '0192f0a0-0000-7000-8000-000000000001', type: 'character', name: 'Mira Thel', anchor: 'holds the fort' };
const fort = { id: '0192f0a0-0000-7000-8000-000000000002', type: 'location', name: 'Balkonon' };

test('client.sort: POST /account/sort with the account Bearer and keel\'s body, the answer as sent', async () => {
  const reply = {
    rows: [
      { kind: 'make', source_line: 'a new smith, Oren', proposal: { type: 'Character', name: 'Oren', description: 'A smith.' } },
      { kind: 'link', source_line: 'Mira lives at Balkonon', target: { ...mira, type: 'Character' }, field: 'location', value_id: fort.id, value_name: 'Balkonon' },
      { kind: 'ask', source_line: 'Mira took the ring', question: 'Which Mira?', candidates: [{ ...mira, type: 'Character' }],
        then: { kind: 'add_to', field: 'background', op: 'append', value: 'Took the ring.' } },
    ],
    not_proposed: [{ source_line: 'weather was bad', reason: 'nothing in the world to place it on' }],
    model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 140 }, remaining: 48,
  };
  const f = fake({ status: 200, body: reply });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  const notes = ['Mira lives at Balkonon', { text: 'the ring', image_url: 'https://media.onlyworlds.com/u/w1/note.webp' }, { image_url: 'https://media.onlyworlds.com/u/w1/page.webp' }];
  const r = await c.sort({ worldId: 'w1', notes, slice: [mira, fort] });
  const { url, init } = f.calls[0];
  assert.equal(init.method, 'POST');
  assert.ok(url.endsWith('/api/v2/account/sort'));
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.deepEqual(JSON.parse(init.body), { world_id: 'w1', notes, slice: [mira, fort] });
  assert.deepEqual(r, reply);
});

test('client.sort: a world key is a TypeError before anything is sent', async () => {
  const f = fake({ status: 200, body: {} });
  const c = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1', fetch: f.fetch });
  await assert.rejects(c.sort({ worldId: 'w', notes: ['x'], slice: [] }), TypeError);
  assert.equal(f.calls.length, 0);
});

test('client.sort: ask\'s three refusals and a 422 naming its param', async () => {
  for (const [status, code, getter] of [[429, 'quota_exceeded', 'isQuotaExceeded'], [503, 'ask_unavailable', 'isAskUnavailable'], [502, 'ask_failed', 'isAskFailed']]) {
    const f = fake({ status, body: { error: { type: 'x', code, message: 'm' } }, headers: status === 429 ? { 'Retry-After': '3600' } : {} });
    const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
    await assert.rejects(c.sort({ worldId: 'w', notes: ['x'], slice: [] }), (e) => e instanceof OwApiError && e[getter] === true && (status !== 429 || e.retryAfter === 3600));
  }
  const f = fake({ status: 422, body: { error: { type: 'invalid_request_error', code: 'invalid_request', message: 'slice holds at most 100 elements.', param: 'slice' } } });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  await assert.rejects(c.sort({ worldId: 'w', notes: ['x'], slice: [] }), (e) => e instanceof OwApiError && e.status === 422 && e.param === 'slice');
});
