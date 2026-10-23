/**
 * The proposed change (keel #519, PR 180): propose, listProposals, worldProposals, acceptProposal,
 * declineProposal and withdrawProposal; a 202 on patch, upsert and editLinks thrown as an
 * OwProposedError (a /bulk slot's 202 left in its slot); the five codes keel added, with
 * stale_proposal's conflicts and current; agent_writes_proposed on the world, read-only.
 * Each route's method, path, query, headers and body against what is sent, from keel's
 * document (https://www.onlyworlds.com/api/v2/openapi.json, read 2026-10-22). Runs against
 * dist, with a fake fetch: nothing here reaches a server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as sdk from '../dist/index.js';

// A namespace import, so a missing export fails its own tests rather than the whole file's load.
const { OwV2Client, OwApiError, OwProposedError, OwStaleProposalError, OwPreconditionFailedError } = sdk;

const API = 'https://www.onlyworlds.com/api/v2';
const EL = '018f0000-0000-7000-8000-0000000000e1';
const PID = '018f0000-0000-7000-8000-0000000000a1';

/** One row as the document's Proposal component gives it: all nineteen keys (kind and omitted, keel #565). */
const PROPOSAL = {
  kind: 'proposal', id: PID, element_type: 'location', element_id: EL, state: 'open',
  fields: { description: 'A harbour town.' }, omitted: [], base: { description: '' }, base_seq: 41,
  evidence: 'Chapter 3 names the harbour.', expires: '2026-11-21T16:00:00Z',
  by: '018f0000-0000-7000-8000-0000000000b1', via: 'api', client: 'sdk',
  decided_by: null, decided_at: null, decline_reason: null,
  created_at: '2026-10-22T16:00:00Z', updated_at: '2026-10-22T16:00:00Z',
};
const LIST = { data: [PROPOSAL], has_more: true, next_cursor: 'c2' };
/** A queue row for a new element written as proposed (keel #565, the document's ProposedNewElement): all ten keys. */
const NEW_EL = '018f0000-0000-7000-8000-0000000000e2';
const NEW_ELEMENT_ROW = {
  kind: 'new_element', id: NEW_EL, element_type: 'character', element_id: NEW_EL, state: 'open',
  by: '018f0000-0000-7000-8000-0000000000b1', evidence: 'Met her in chapter 4.', expires: '2026-11-22',
  created_at: '2026-10-23T07:00:00Z', updated_at: '2026-10-23T07:00:00Z',
};
/** The world's queue as keel #565 serves it: both kinds in one order, an opaque cursor (`<microseconds>.<id>`). */
const QUEUE = { data: [NEW_ELEMENT_ROW, PROPOSAL], has_more: true, next_cursor: `1761202800000000.${NEW_EL}` };
const ELEMENT = { id: EL, name: 'Harbour', type: 'location', description: 'A harbour town.', change_seq: 42 };

/** A scripted fetch: `answer(url, init)` gives {status, body, headers}; every call is kept. */
function fake(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const r = typeof answer === 'function' ? answer(url, init) : answer;
    const status = r.status ?? 200;
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300, status, headers: new Headers(r.headers ?? {}),
      async text() { return text; }, async json() { return r.body; },
    };
  };
  return { fetch, calls };
}

function client(answer, cfg = {}) {
  const f = fake(answer);
  return { c: new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: f.fetch, ...cfg }), calls: f.calls };
}

const headerNames = (call) => Object.keys(call.init.headers ?? {}).sort();
const bodyOf = (call) => (call.init.body === undefined ? undefined : JSON.parse(call.init.body));
const envelope = (type, code, extra = {}) => ({ error: { type, code, message: code, param: null, doc_url: `https://onlyworlds.github.io/api/errors#${code}` }, ...extra });

async function thrown(answer, call) {
  const { c } = client(answer);
  try {
    await call(c);
  } catch (err) {
    return err;
  }
  assert.fail('expected a throw');
}

// -- propose -----------------------------------------------------------------

test('propose: POST /{type}/{id}/proposals with fields, evidence and expires; returns the row', async () => {
  const { c, calls } = client({ status: 201, body: { proposal: PROPOSAL } });
  const row = await c.propose('location', EL, { fields: { description: 'A harbour town.' }, evidence: 'Chapter 3 names the harbour.', expires: '2026-11-21T16:00:00Z' });
  assert.deepEqual(row, PROPOSAL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API}/location/${EL}/proposals`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(bodyOf(calls[0]), { fields: { description: 'A harbour town.' }, evidence: 'Chapter 3 names the harbour.', expires: '2026-11-21T16:00:00Z' });
  // X-OW-Client is a header the document lists on this route (kept as `client`); no Idempotency-Key unless given
  assert.deepEqual(headerNames(calls[0]), ['API-Key', 'API-Pin', 'Content-Type', 'X-OW-Client']);
  assert.equal(calls[0].init.headers['X-OW-Client'], 'sdk');
});

test('propose: an idempotencyKey goes as Idempotency-Key; expires left out is not sent', async () => {
  const { c, calls } = client({ status: 201, body: { proposal: PROPOSAL } });
  await c.propose('location', EL, { fields: { name: 'Harbour' }, evidence: 'x' }, { idempotencyKey: 'prop-1' });
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'prop-1');
  assert.deepEqual(bodyOf(calls[0]), { fields: { name: 'Harbour' }, evidence: 'x' });
});

test('propose: fields are cleaned as a PATCH body is (a read body\'s server keys stripped, extension keys kept)', async () => {
  const { c, calls } = client({ status: 201, body: { proposal: PROPOSAL } });
  await c.propose('location', EL, {
    fields: { name: 'Harbour', x_tangle_battle: 3, world: 'w', type: 'location', created_at: 'a', updated_at: 'b', change_seq: 9 },
    evidence: 'x',
  });
  assert.deepEqual(bodyOf(calls[0]).fields, { name: 'Harbour', x_tangle_battle: 3 });
});

test('propose: a known-of stub, or fields that are not an object, is a TypeError before sending', async () => {
  const { c, calls } = client({ status: 201, body: { proposal: PROPOSAL } });
  await assert.rejects(c.propose('location', EL, { fields: { name: '', known_of: true }, evidence: 'x' }), TypeError);
  await assert.rejects(c.propose('location', EL, { fields: ['name'], evidence: 'x' }), TypeError);
  await assert.rejects(c.propose('location', EL, { evidence: 'x' }), TypeError);
  assert.equal(calls.length, 0);
});

test('propose: an agent client sends no X-OW-Agent (the document lists none on the proposal routes)', async () => {
  const { c, calls } = client({ status: 201, body: { proposal: PROPOSAL } }, { agent: true });
  await c.propose('location', EL, { fields: { name: 'H' }, evidence: 'x' });
  await c.acceptProposal('location', EL, PID);
  for (const call of calls) assert.equal('X-OW-Agent' in call.init.headers, false, call.url);
});

// -- the lists ---------------------------------------------------------------

test('listProposals: GET /{type}/{id}/proposals with state, since, limit and cursor; the page as keel sends it', async () => {
  const { c, calls } = client({ body: LIST });
  const page = await c.listProposals('location', EL, { state: 'all', since: '2026-10-22T00:00:00Z', limit: 5, cursor: 'c1' });
  assert.deepEqual(page, LIST);
  const u = new URL(calls[0].url);
  assert.equal(`${u.origin}${u.pathname}`, `${API}/location/${EL}/proposals`);
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(Object.fromEntries(u.searchParams), { state: 'all', since: '2026-10-22T00:00:00Z', limit: '5', cursor: 'c1' });
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(headerNames(calls[0]), ['API-Key']); // a read: no PIN (h29 #10663)
});

test('listProposals: with no options, only the client\'s page size is sent', async () => {
  const { c, calls } = client({ body: LIST }, { pageSize: 25 });
  await c.listProposals('location', EL);
  assert.equal(calls[0].url, `${API}/location/${EL}/proposals?limit=25`);
});

test('worldProposals: GET /world/proposals with state, since, element, limit and cursor', async () => {
  const { c, calls } = client({ body: LIST });
  const page = await c.worldProposals({ state: 'open', since: '2026-10-21T00:00:00Z', element: EL, limit: 10, cursor: 'c1' });
  assert.deepEqual(page, LIST);
  const u = new URL(calls[0].url);
  assert.equal(`${u.origin}${u.pathname}`, `${API}/world/proposals`);
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(Object.fromEntries(u.searchParams), { state: 'open', since: '2026-10-21T00:00:00Z', element: EL, limit: '10', cursor: 'c1' });
  const bare = client({ body: LIST });
  await bare.c.worldProposals();
  assert.equal(bare.calls[0].url, `${API}/world/proposals?limit=100`);
});

test('worldProposals: both kinds of row come back as keel sends them, in its order; the cursor goes back exactly as it came (keel #565)', async () => {
  const { c, calls } = client({ body: QUEUE });
  const page = await c.worldProposals({ state: 'all' });
  assert.deepEqual(page, QUEUE);
  assert.deepEqual(page.data.map((r) => r.kind), ['new_element', 'proposal']);
  await c.worldProposals({ cursor: page.next_cursor });
  assert.equal(new URL(calls[1].url).searchParams.get('cursor'), QUEUE.next_cursor);
  // an old bare proposal id still reads as a cursor: sent as given
  await c.worldProposals({ cursor: PID });
  assert.equal(new URL(calls[2].url).searchParams.get('cursor'), PID);
});

// -- a new element written as proposed (keel #565) -----------------------------

test('reviewNewElement: accept is POST /{type}/{id}/review { decision }, with the PIN and X-OW-Client; returns { element }', async () => {
  const settled = { ...ELEMENT, id: NEW_EL, type: 'character', x_review_proposed: null };
  const { c, calls } = client({ body: { element: settled } });
  assert.deepEqual(await c.reviewNewElement('character', NEW_EL, { decision: 'accept' }), { element: settled });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API}/character/${NEW_EL}/review`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(bodyOf(calls[0]), { decision: 'accept' });
  assert.deepEqual(headerNames(calls[0]), ['API-Key', 'API-Pin', 'Content-Type', 'X-OW-Client']);
});

test('reviewNewElement: decline sends the reason when given, none without; returns { deleted }', async () => {
  const { c, calls } = client({ body: { deleted: NEW_EL } });
  assert.deepEqual(await c.reviewNewElement('character', NEW_EL, { decision: 'decline', reason: 'Not canon.' }), { deleted: NEW_EL });
  assert.deepEqual(bodyOf(calls[0]), { decision: 'decline', reason: 'Not canon.' });
  await c.reviewNewElement('character', NEW_EL, { decision: 'decline' });
  assert.equal(calls[1].init.body, JSON.stringify({ decision: 'decline' }));
});

test('reviewNewElement: an agent client sends no X-OW-Agent (the document lists none on the review route)', async () => {
  const { c, calls } = client({ body: { deleted: NEW_EL } }, { agent: true, client: 'atlas' });
  await c.reviewNewElement('character', NEW_EL, { decision: 'decline' });
  assert.equal('X-OW-Agent' in calls[0].init.headers, false);
  assert.equal(calls[0].init.headers['X-OW-Client'], 'atlas');
});

test('reviewNewElement: a decision other than accept or decline, or none, is a TypeError before sending', async () => {
  const { c, calls } = client({ body: { deleted: NEW_EL } });
  for (const bad of [{ decision: 'Accept' }, { decision: 'delete' }, {}, undefined]) {
    await assert.rejects(c.reviewNewElement('character', NEW_EL, bad),
      (e) => e instanceof TypeError && /decision must be 'accept' or 'decline'/.test(e.message), JSON.stringify(bad));
  }
  assert.equal(calls.length, 0);
});

test('reviewNewElement: 422 not_proposed is err.isNotProposed; the seat the mark names gets 403 proposed_only (err.isProposedOnly)', async () => {
  const np = await thrown({ status: 422, body: envelope('invalid_request_error', 'not_proposed') },
    (c) => c.reviewNewElement('character', NEW_EL, { decision: 'accept' }));
  assert.ok(np instanceof OwApiError);
  assert.equal(np.isNotProposed, true);
  assert.equal(np.isProposedOnly, false);
  const po = await thrown({ status: 403, body: envelope('permission_error', 'proposed_only') },
    (c) => c.reviewNewElement('character', NEW_EL, { decision: 'accept' }));
  assert.equal(po.isProposedOnly, true);
  assert.equal(po.isNotProposed, false);
  // the status matters: not_proposed at another status is not the predicate
  const off = await thrown({ status: 400, body: envelope('invalid_request_error', 'not_proposed') },
    (c) => c.reviewNewElement('character', NEW_EL, { decision: 'accept' }));
  assert.equal(off.isNotProposed, false);
  // and another 422 is not it
  const other = await thrown({ status: 422, body: envelope('invalid_request_error', 'invalid_request') },
    (c) => c.reviewNewElement('character', NEW_EL, { decision: 'accept' }));
  assert.equal(other.isNotProposed, false);
});

// -- deciding ----------------------------------------------------------------

test('acceptProposal: POST .../proposals/{pid}/accept with no body; returns the row and the element as written', async () => {
  const accepted = { ...PROPOSAL, state: 'accepted', decided_by: 'owner', decided_at: '2026-10-22T17:00:00Z' };
  const { c, calls } = client({ body: { proposal: accepted, element: ELEMENT } });
  const out = await c.acceptProposal('location', EL, PID);
  assert.deepEqual(out, { proposal: accepted, element: ELEMENT });
  assert.equal(calls[0].url, `${API}/location/${EL}/proposals/${PID}/accept`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(headerNames(calls[0]), ['API-Key', 'API-Pin', 'X-OW-Client']);
});

test('declineProposal: POST .../decline with the reason when given, no body without; returns the row', async () => {
  const declined = { ...PROPOSAL, state: 'declined', decided_by: 'owner', decline_reason: 'Not canon.' };
  const { c, calls } = client({ body: { proposal: declined } });
  assert.deepEqual(await c.declineProposal('location', EL, PID, { reason: 'Not canon.' }), declined);
  assert.equal(calls[0].url, `${API}/location/${EL}/proposals/${PID}/decline`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(bodyOf(calls[0]), { reason: 'Not canon.' });
  assert.deepEqual(headerNames(calls[0]), ['API-Key', 'API-Pin', 'Content-Type']);
  await c.declineProposal('location', EL, PID);
  assert.equal(calls[1].init.body, undefined);
  assert.deepEqual(headerNames(calls[1]), ['API-Key', 'API-Pin']);
});

test('withdrawProposal: DELETE .../proposals/{pid}, 204, returns nothing', async () => {
  const { c, calls } = client({ status: 204 });
  assert.equal(await c.withdrawProposal('location', EL, PID), undefined);
  assert.equal(calls[0].url, `${API}/location/${EL}/proposals/${PID}`);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].init.body, undefined);
});

// -- the 202 -----------------------------------------------------------------

test('a 202 on patch, upsert and editLinks is an OwProposedError carrying the proposal, never a returned body', async () => {
  const writes = [
    ['patch', (c) => c.patch('location', EL, { description: 'A harbour town.' })],
    ['upsert', (c) => c.upsert('location', EL, { name: 'Harbour', description: 'A harbour town.' })],
    ['editLinks', (c) => c.editLinks('location', EL, 'parent_location', { add: [PID] })],
    ['patch with ifMatch', (c) => c.patch('location', EL, { description: 'x' }, { ifMatch: 41 })],
  ];
  for (const [name, call] of writes) {
    const err = await thrown({ status: 202, body: { proposal: PROPOSAL } }, call);
    assert.ok(err instanceof OwProposedError, name);
    assert.ok(err instanceof OwApiError, name);
    assert.equal(err.name, 'OwProposedError', name);
    assert.equal(err.status, 202, name);
    assert.equal(err.isProposed, true, name);
    assert.deepEqual(err.proposal, PROPOSAL, name);
    assert.equal(err.code, null, name);
    assert.match(err.message, /proposal/, name);
  }
});

test('isProposed is false for every other error, a 412 included', async () => {
  const pre = await thrown({ status: 412, body: envelope('invalid_request', 'precondition_failed', { current: ELEMENT }) },
    (c) => c.patch('location', EL, { name: 'x' }, { ifMatch: 41 }));
  assert.ok(pre instanceof OwPreconditionFailedError);
  assert.equal(pre.isProposed, false);
  const nf = await thrown({ status: 404, body: envelope('not_found', 'not_found') }, (c) => c.patch('location', EL, { name: 'x' }));
  assert.equal(nf.isProposed, false);
  assert.equal(nf instanceof OwProposedError, false);
});

test('a 200 on patch still returns the element (the switch off, or a person\'s key)', async () => {
  const { c } = client({ body: ELEMENT });
  assert.deepEqual(await c.patch('location', EL, { description: 'A harbour town.' }), ELEMENT);
});

test('bulk: a slot\'s 202 stays in its slot with its proposal; nothing is thrown', async () => {
  const result = {
    errors: false,
    items: [
      { status: 201, id: PID, created_at: '2026-10-22T16:00:00Z', updated_at: '2026-10-22T16:00:00Z' },
      { status: 202, id: EL, proposal: PROPOSAL },
    ],
  };
  const { c } = client({ body: result });
  const out = await c.bulk([{ type: 'location', element: { id: PID, name: 'New' } }, { type: 'location', element: { id: EL, name: 'Harbour' } }]);
  assert.equal(out.items[1].status, 202);
  assert.deepEqual(out.items[1].proposal, PROPOSAL);
  assert.equal(out.items[0].proposal, undefined);
});

// -- the five codes ----------------------------------------------------------

test('the five proposal codes each have a predicate, true for their own status and code only', async () => {
  const cases = [
    ['isFieldNotVisible', 422, 'invalid_request', 'field_not_visible'],
    ['isTooManyOpen', 422, 'invalid_request', 'too_many_open'],
    ['isStaleProposal', 409, 'invalid_request', 'stale_proposal'],
    ['isProposedOnly', 403, 'permission_error', 'proposed_only'],
    ['isOwnProposal', 403, 'permission_error', 'own_proposal'],
  ];
  for (const [pred, status, type, code] of cases) {
    const err = await thrown({ status, body: envelope(type, code, code === 'stale_proposal' ? { conflicts: [], current: ELEMENT } : {}) },
      (c) => c.acceptProposal('location', EL, PID));
    assert.ok(err instanceof OwApiError, pred);
    assert.equal(err[pred], true, pred);
    for (const [other] of cases) if (other !== pred) assert.equal(err[other], false, `${pred} is not ${other}`);
    // the status matters: the same code at another status is not the predicate
    const off = await thrown({ status: 400, body: envelope(type, code) }, (c) => c.acceptProposal('location', EL, PID));
    assert.equal(off[pred], false, `${pred} at 400`);
  }
});

test('409 stale_proposal is an OwStaleProposalError carrying conflicts and current, and an OwApiError', async () => {
  const conflicts = [{ field: 'description', base: '', current: 'A fishing village.' }];
  const current = { ...ELEMENT, description: 'A fishing village.', change_seq: 43 };
  const err = await thrown({ status: 409, body: envelope('invalid_request', 'stale_proposal', { conflicts, current }) },
    (c) => c.acceptProposal('location', EL, PID));
  assert.ok(err instanceof OwStaleProposalError);
  assert.ok(err instanceof OwApiError);
  assert.equal(err.name, 'OwStaleProposalError');
  assert.equal(err.isStaleProposal, true);
  assert.deepEqual(err.conflicts, conflicts);
  assert.deepEqual(err.current, current);
  assert.equal(err.isIdConflict, false);
  // a stale_proposal with neither still parses
  const bare = await thrown({ status: 409, body: envelope('invalid_request', 'stale_proposal') }, (c) => c.acceptProposal('location', EL, PID));
  assert.ok(bare instanceof OwStaleProposalError);
  assert.deepEqual(bare.conflicts, []);
  assert.equal(bare.current, null);
  // another 409 is not one
  const other = await thrown({ status: 409, body: envelope('invalid_request', 'id_conflict') }, (c) => c.create('location', { name: 'x' }));
  assert.equal(other instanceof OwStaleProposalError, false);
});

// -- the world's switch ------------------------------------------------------

test('getWorld reads agent_writes_proposed through; patchWorld strips it (set on the world page)', async () => {
  const { c, calls } = client({ body: { id: 'w', name: 'W', agent_writes_proposed: true } });
  const w = await c.getWorld();
  assert.equal(w.agent_writes_proposed, true);
  await c.patchWorld({ name: 'V', agent_writes_proposed: false, owner_character: null });
  assert.deepEqual(bodyOf(calls[1]), { name: 'V', owner_character: null });
});

// -- options objects ---------------------------------------------------------

test('every proposal options object refuses an unknown key before sending', async () => {
  const { c, calls } = client({ body: LIST });
  const bad = [
    ['propose', () => c.propose('location', EL, { fields: { name: 'H' }, evidence: 'x', expire: '2026-11-01T00:00:00Z' })],
    ['propose', () => c.propose('location', EL, { fields: { name: 'H' }, evidence: 'x' }, { idempotency_key: 'k' })],
    ['listProposals', () => c.listProposals('location', EL, { status: 'open' })],
    ['listProposals', () => c.listProposals('location', EL, { element: EL })],
    ['worldProposals', () => c.worldProposals({ elemnt: EL })],
    ['declineProposal', () => c.declineProposal('location', EL, PID, { reasn: 'x' })],
    ['reviewNewElement', () => c.reviewNewElement('character', NEW_EL, { decision: 'decline', reasn: 'x' })],
    ['reviewNewElement', () => c.reviewNewElement('character', NEW_EL, { decison: 'accept' })],
  ];
  for (const [name, call] of bad) {
    await assert.rejects(call(), (err) => err instanceof TypeError && err.message.startsWith(`${name}: unknown parameter`), name);
  }
  assert.equal(calls.length, 0, 'nothing was sent');
});

// -- the published types -----------------------------------------------------

test('the published types: OwProposal has the document\'s nineteen keys, the list and the 202 body theirs, the world its switch', () => {
  const all = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const block = (name) => {
    const at = all.indexOf(`interface ${name} {`);
    assert.ok(at >= 0, `${name} is declared`);
    return all.slice(at, all.indexOf('\n}', at));
  };
  const keys = (src) => [...src.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(keys(block('OwProposal')), ['kind', 'id', 'element_type', 'element_id', 'state', 'fields', 'omitted', 'base', 'base_seq', 'evidence',
    'expires', 'by', 'via', 'client', 'decided_by', 'decided_at', 'decline_reason', 'created_at', 'updated_at']);
  assert.match(block('OwProposal'), /\bkind: 'proposal';/);
  assert.match(block('OwProposal'), /\bomitted: string\[\];/);
  assert.match(block('OwProposal'), /\bstate: OwProposalState;/);
  // keel #565: the queue's new-element row, its ten keys, and the queue a union told apart by kind
  assert.deepEqual(keys(block('OwProposedNewElement')), ['kind', 'id', 'element_type', 'element_id', 'state', 'by', 'evidence',
    'expires', 'created_at', 'updated_at']);
  assert.match(block('OwProposedNewElement'), /\bkind: 'new_element';/);
  assert.match(block('OwProposedNewElement'), /\bstate: 'open' \| 'lapsed';/);
  assert.match(all, /type OwWorldProposalRow = OwProposal \| OwProposedNewElement;/);
  assert.match(block('OwWorldProposalList'), /\bdata: OwWorldProposalRow\[\];/);
  assert.match(all, /worldProposals\(opts\?: OwWorldProposalQuery\): Promise<OwWorldProposalList>;/);
  assert.match(all, /reviewNewElement\(type: ElementType \| string, id: string, opts: OwReviewInput\): Promise<OwReviewed>;/);
  assert.match(block('OwProposal'), /\bclient: string \| null;/);
  assert.deepEqual(keys(block('OwProposalList')), ['data', 'has_more', 'next_cursor']);
  assert.deepEqual(keys(block('OwProposed')), ['proposal']);
  assert.match(block('OwWorldMeta'), /\bagent_writes_proposed\?: boolean;/);
  assert.match(block('OwBulkItemResult'), /\bproposal\?: OwProposal;/);
});
