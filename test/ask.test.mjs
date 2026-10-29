/**
 * Ask your world: buildAskContext keeps the caller's elements in order within
 * keel's limits and says what it kept; client.ask sends the account Bearer and the body
 * keel reads. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OwV2Client, OwApiError, buildWorldIndex, lookupWorld, buildAskContext, renderElement, ASK_LIMITS, REVIEW_PROPOSED_LABEL,
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

// -- The three marks (4.72.0): a reader that hands a world on leaves them out unless asked ----

const mark = { by: '0d4e8a2c-0000-7000-8000-000000000009', evidence: 'the Harbour Ledger, entry 14', expires: '2026-11-21' };
const proposed = { ...el('p', 'The Lower Quays'), type: 'location', x_review_proposed: mark };
const hidden = { ...el('h', 'Secret Heir'), hidden: true };
const room = { id: 'r', type: 'narrative', name: 'A line in the parlor', supertype: 'Message', x_room_of: 'w1' };
const settled = el('s', 'Mira Thel', 'Holds the fort.');
const none = { proposed: [], hidden: [], room: [] };

test('the review profile\'s label is rule 1\'s own words, generated from the vendored page', () => {
  assert.equal(REVIEW_PROPOSED_LABEL, 'proposed, not yet reviewed');
});

test('each mark is left out by default and listed in leftOut, in the order given; dropped stays the limits\' list', () => {
  const p2 = { ...proposed, id: 'p2' };
  const els = [proposed, settled, hidden, room, p2];
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.deepEqual(r.kept, ['s']);
  assert.deepEqual(r.context, [renderElement(settled, buildWorldIndex(els))]);
  assert.deepEqual(r.leftOut, { proposed: ['p', 'p2'], hidden: ['h'], room: ['r'] });
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(buildAskContext([settled], buildWorldIndex([settled])).leftOut, none);
});

test('hidden is §4.8\'s test: anything but absent, null or false', () => {
  const els = [{ ...el('a', 'A'), hidden: 'true' }, { ...el('b', 'B'), hidden: 1 }, { ...el('c', 'C'), hidden: false }, { ...el('d', 'D'), hidden: null }];
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.deepEqual(r.leftOut.hidden, ['a', 'b']);
  assert.deepEqual(r.kept, ['c', 'd']);
});

test('a doubt (x_review_proposed not a proper mark) is proposed: left out, counted with the proposed, labelled when asked', () => {
  const doubt = { ...el('d', 'Doubtful'), x_review_proposed: 'yes' };
  const emptyObj = { ...el('e', 'Empty'), x_review_proposed: {} };
  const cleared = { ...el('c', 'Cleared'), x_review_proposed: null };
  const els = [doubt, emptyObj, cleared];
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.deepEqual(r.leftOut.proposed, ['d']);
  assert.deepEqual(r.kept, ['e', 'c']);
  assert.ok(r.context.every((t) => !t.includes(REVIEW_PROPOSED_LABEL)), 'an empty or cleared mark is settled, never labelled');
  const asked = buildAskContext(els, buildWorldIndex(els), { includeProposed: true });
  assert.deepEqual(asked.kept, ['d', 'e', 'c']);
  assert.ok(asked.context[0].startsWith(`[${REVIEW_PROPOSED_LABEL}] `));
  assert.ok(!asked.context[1].includes(REVIEW_PROPOSED_LABEL), 'an empty mark is settled when proposed ones are asked for too');
});

test('each include* brings its own elements back, and only those', () => {
  const els = [proposed, hidden, room, settled];
  const index = buildWorldIndex(els);
  const p = buildAskContext(els, index, { includeProposed: true });
  assert.deepEqual(p.kept, ['p', 's']);
  assert.deepEqual(p.leftOut, { proposed: [], hidden: ['h'], room: ['r'] });
  const h = buildAskContext(els, index, { includeHidden: true });
  assert.deepEqual(h.kept, ['h', 's']);
  assert.deepEqual(h.leftOut, { proposed: ['p'], hidden: [], room: ['r'] });
  const rm = buildAskContext(els, index, { includeRoom: true });
  assert.deepEqual(rm.kept, ['r', 's']);
  assert.deepEqual(rm.leftOut, { proposed: ['p'], hidden: ['h'], room: [] });
  const all = buildAskContext(els, index, { includeProposed: true, includeHidden: true, includeRoom: true });
  assert.deepEqual(all.kept, ['p', 'h', 'r', 's']);
  assert.deepEqual(all.leftOut, none);
  // a room pair without the mark is lore: always sent
  const lore = { ...room, id: 'l', x_room_of: undefined };
  assert.deepEqual(buildAskContext([lore], buildWorldIndex([lore])).kept, ['l']);
});

test('a kept proposed element carries the label on its first line, its card otherwise as renderElement writes it', () => {
  const index = buildWorldIndex([proposed, settled]);
  const r = buildAskContext([proposed, settled], index, { includeProposed: true });
  const [first] = r.context[0].split('\n');
  assert.equal(first, `[${REVIEW_PROPOSED_LABEL}] The Lower Quays (location)`);
  assert.equal(r.context[0], `[${REVIEW_PROPOSED_LABEL}] ${renderElement(proposed, index)}`);
  assert.ok(!r.context[1].includes(REVIEW_PROPOSED_LABEL), 'a settled element is never labelled');
  // a hidden element sent on includeHidden is not proposed, so not labelled
  const h = buildAskContext([hidden], buildWorldIndex([hidden]), { includeHidden: true });
  assert.ok(!h.context[0].includes(REVIEW_PROPOSED_LABEL));
});

test('a hidden proposed element is counted once, under hidden; includeProposed alone never sends it', () => {
  const both = { ...proposed, id: 'b', hidden: true };
  const index = buildWorldIndex([both]);
  assert.deepEqual(buildAskContext([both], index).leftOut, { proposed: [], hidden: ['b'], room: [] });
  assert.deepEqual(buildAskContext([both], index, { includeProposed: true }).leftOut, { proposed: [], hidden: ['b'], room: [] });
  const h = buildAskContext([both], index, { includeHidden: true });
  assert.deepEqual(h.leftOut, { proposed: ['b'], hidden: [], room: [] });
  const sent = buildAskContext([both], index, { includeHidden: true, includeProposed: true });
  assert.deepEqual(sent.kept, ['b']);
  assert.ok(sent.context[0].startsWith(`[${REVIEW_PROPOSED_LABEL}] `));
});

test('a kept element\'s link to one a mark leaves out reads as not present, never by name', () => {
  const heir = { ...el('0192f0a0-0000-7000-8000-00000000000a', 'Secret Heir'), hidden: true };
  const mira = { ...el('0192f0a0-0000-7000-8000-00000000000b', 'Mira Thel'), friends: [heir.id], x_ally: heir.id };
  const line = { ...room, id: '0192f0a0-0000-7000-8000-00000000000c', name: 'Parlor gossip', characters: [mira.id] };
  const els = [heir, mira, line];
  const index = buildWorldIndex(els);
  const r = buildAskContext([mira], index);
  assert.deepEqual(r.kept, [mira.id]);
  assert.ok(!r.context[0].includes('Secret Heir'), r.context[0]);
  assert.ok(!r.context[0].includes('Parlor gossip'), r.context[0]);
  assert.match(r.context[0], /friends: 1 linked element\(s\) not present/);
  // asked for, the names come back as renderElement writes them
  const all = buildAskContext([mira], index, { includeHidden: true, includeRoom: true });
  assert.equal(all.context[0], renderElement(mira, index));
  assert.match(all.context[0], /Secret Heir/);
});

test('the limits apply to what remains: left-out elements take no place of the 8 nor of the 12,000', () => {
  const marked = Array.from({ length: 6 }, (_, i) => ({ ...long(`m${i}`, `M${i}`, 'z'.repeat(2500)), hidden: true }));
  const plain = Array.from({ length: 10 }, (_, i) => el(`e${i}`, `Name ${i}`));
  const els = [...marked, ...plain];
  const r = buildAskContext(els, buildWorldIndex(els));
  assert.equal(r.kept.length, 8);
  assert.deepEqual(r.kept, plain.slice(0, 8).map((e) => e.id));
  assert.deepEqual(r.dropped, ['e8', 'e9']);
  assert.deepEqual(r.leftOut.hidden, marked.map((e) => e.id));
  // asked for, they count again: six 2,000-character cards fill the 12,000, and every plain one is dropped
  const all = buildAskContext(els, buildWorldIndex(els), { includeHidden: true });
  assert.deepEqual(all.kept, marked.map((e) => e.id));
  assert.deepEqual(all.truncated, marked.map((e) => e.id));
  assert.deepEqual(all.dropped, plain.map((e) => e.id));
  assert.deepEqual(all.leftOut, none);
});

test('an unknown option, or one that is not a boolean, is a TypeError', () => {
  const index = buildWorldIndex([settled]);
  assert.throws(() => buildAskContext([settled], index, { includeProposal: true }), (e) => e instanceof TypeError && /unknown option 'includeProposal'/.test(e.message));
  assert.throws(() => buildAskContext([settled], index, { includeHidden: 'false' }), (e) => e instanceof TypeError && /includeHidden must be a boolean/.test(e.message));
  assert.deepEqual(buildAskContext([settled], index, { includeHidden: false, includeProposed: false, includeRoom: false }).kept, ['s']);
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

test('client.allowance: GET /account/allowance with the account Bearer, no body; a world key is a TypeError', async () => {
  const reply = { token_rating: 300000, tokens_used_today: 292, tokens_remaining: 299708, resets_at: '2026-10-15T00:00:00+00:00' };
  const f = fake({ status: 200, body: reply });
  const c = new OwV2Client({ apiKey: 'ow_a_acct', fetch: f.fetch });
  assert.deepEqual(await c.allowance(), reply);
  const { url, init } = f.calls[0];
  assert.ok(url.endsWith('/api/v2/account/allowance'));
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['Authorization'], 'Bearer ow_a_acct');
  assert.equal(init.body, undefined);
  const w = fake({ status: 200, body: {} });
  await assert.rejects(new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1', fetch: w.fetch }).allowance(), TypeError);
  assert.equal(w.calls.length, 0);
});
