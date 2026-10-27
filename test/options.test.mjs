/**
 * The package's law for options objects (4.51.0 to 4.53.0 for the client, 4.64.0 for the rest):
 * every options object refuses a key it does not know by name, with a TypeError, before anything
 * is sent or done. A dropped key is never harmless: W11's `list('character', { name__icontains })`
 * read every Character, and a cleanup script deleted 99 of them (2026-10-22).
 *
 * Two tests. FENCED calls every fenced options parameter of the exported surface with
 * `{ __unknown__: 1 }` and asserts a TypeError naming the key. The surface test reads the exported
 * surface with the TypeScript checker (test/options-surface.mjs) and fails on an object parameter
 * that is in neither FENCED nor DATA: a new options parameter cannot ship without its fence and
 * its row here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OwV2Client, OwSignInError, TokenResource, readWorldFile, writeWorldFile, typeWord, planPhoto,
  preparePhoto, parseDate, resolveCalendar, resolveCalendarLens, buildWorldIndex, lookupWorld, renderElement, buildAskContext,
  isToEveryone, hasUnseenRecipients,
  elementAddress,
} from '../dist/index.js';
import { objectParameters } from './options-surface.mjs';

const U = { __unknown__: 1 };
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push(url);
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const world = new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch: fetchImpl });
const account = new OwV2Client({ apiKey: 'ow_a_test', fetch: fetchImpl });
const storage = { get: () => null, set: () => {}, remove: () => {} };
const transportCalls = [];
const tokens = new TokenResource({ request: async (...a) => { transportCalls.push(a); return {}; } });
const cfg = {
  version: 1, grain: 'day', eras: [{ name: 'Freehold Tally', abbrev: 'FT', start: 0, restart: true }],
  bundles: { months: { names: ['Sowmarch', 'Greening'], lengths: [30, 30] } },
};
const elements = [{ id: 'a', type: 'location', name: 'Eknomos' }, { id: 'c', type: 'construct', name: 'Tally', atlas_calendar: cfg }];
const index = buildWorldIndex(elements);
const worldJson = { path: 'world.json', data: new TextEncoder().encode('{"id":"w","name":"W"}') };
const drain = async (gen) => { for await (const _ of gen) { /* never */ } };

/** Each fenced options parameter (`fn#index`, as options-surface.mjs names it) and a call with the unknown key in it. */
const FENCED = {
  // The client (4.51.0 to 4.53.0), through only(): "name: unknown parameter 'k'. ... Nothing was sent."
  'new OwV2Client#0': () => new OwV2Client({ apiKey: 'ow_w_test', fetch: fetchImpl, ...U }),
  'OwV2Client.getWorld#0': () => world.getWorld(U),
  'OwV2Client.list#1': () => world.list('character', U),
  'OwV2Client.listAll#1': () => drain(world.listAll('character', U)),
  'OwV2Client.draught#1': () => world.draught('x', U),
  'OwV2Client.get#2': () => world.get('character', 'x', U),
  'OwV2Client.create#2': () => world.create('character', { name: 'A' }, U),
  'OwV2Client.patch#3': () => world.patch('character', 'x', { name: 'A' }, U),
  'OwV2Client.delete#2': () => world.delete('character', 'x', U),
  'OwV2Client.editLinks#3': () => world.editLinks('character', 'x', 'friends', { add: ['y'], ...U }),
  'OwV2Client.editLinks#4': () => world.editLinks('character', 'x', 'friends', { add: ['y'] }, U),
  'OwV2Client.bulk#1': () => world.bulk([{ type: 'character', name: 'A' }], U),
  'OwV2Client.changes#0': () => world.changes(U),
  'OwV2Client.changesAll#1': () => drain(world.changesAll(undefined, U)),
  'OwV2Client.uploadImage#1': () => world.uploadImage(new Uint8Array([1]), U),
  'OwV2Client.removeImage#1': () => world.removeImage('k', U),
  'OwV2Client.createFileTicket#2': () => world.createFileTicket('location', 'x', { name: 'a.pdf', size: 1, ...U }),
  'OwV2Client.uploadFile#3': () => world.uploadFile('location', 'x', new Uint8Array([1]), { name: 'a.pdf', ...U }),
  'OwV2Client.redeemJoin#1': () => world.redeemJoin('code', U),
  'OwV2Client.signInWithPassword#0': () => world.signInWithPassword({ email: 'a@b.c', password: 'p', tokenName: 't', ...U }),
  'OwV2Client.createWorldLink#1': () => account.createWorldLink('w', { reader: 'person', ...U }),
  'OwV2Client.createSeat#1': () => account.createSeat('w', { name: 'bot', ...U }),
  'OwV2Client.propose#2': () => world.propose('character', 'x', { fields: { name: 'B' }, evidence: 'e', ...U }),
  'OwV2Client.propose#3': () => world.propose('character', 'x', { fields: { name: 'B' }, evidence: 'e' }, U),
  'OwV2Client.listProposals#2': () => world.listProposals('character', 'x', U),
  'OwV2Client.worldProposals#0': () => world.worldProposals(U),
  'OwV2Client.declineProposal#3': () => world.declineProposal('character', 'x', 'p', U),
  'OwV2Client.mintWorldKey#1': () => account.mintWorldKey('w', U),
  'OwV2Client.revokeWorldKey#2': () => account.revokeWorldKey('w', 'k', U),
  'OwV2Client.createAccountWorld#0': () => account.createAccountWorld({ name: 'W', ...U }),
  'OwV2Client.reviewNewElement#2': () => world.reviewNewElement('character', 'x', { decision: 'accept', ...U }),
  'OwV2Client.signInWithOnlyWorlds#0': () => world.signInWithOnlyWorlds({ clientId: 'c', redirectUri: 'https://t.example/cb', storage, navigate: false, ...U }),
  'OwV2Client.completeSignIn#0': () => world.completeSignIn({ clientId: 'c', storage, url: 'https://t.example/cb', ...U }),
  'OwV2Client.ask#0': () => account.ask({ worldId: 'w', question: 'q', context: [], ...U }),
  'OwV2Client.sort#0': () => account.sort({ worldId: 'w', notes: [], slice: [], ...U }),
  // 4.64.0: the escape hatch, and every options object outside the client's typed methods.
  'OwV2Client.request#2': () => world.request('GET', '/character/', U),
  'TokenResource.consume#0': () => tokens.consume({ amount: 1, ...U }),
  'new OwSignInError#2': () => new OwSignInError('failed', 'm', U),
  'readWorldFile#1': () => readWorldFile(writeWorldFile([worldJson], 'w'), U),
  'writeWorldFile#2': () => writeWorldFile([worldJson], 'w', U),
  'typeWord#2': () => typeWord({ x_names: { version: 1 } }, 'character', U),
  'planPhoto#1': () => planPhoto({ width: 10, height: 10, type: 'image/png' }, U),
  'preparePhoto#1': () => preparePhoto(new Blob([new Uint8Array([1])], { type: 'image/png' }), U),
  'parseDate#2': () => parseDate(cfg, '12 Sowmarch 3 FT', U),
  'resolveCalendar#2': () => resolveCalendar(elements, undefined, U),
  'resolveCalendarLens#2': () => resolveCalendarLens(elements, undefined, U), // 4.85.0: the old name, until 5.0
  'lookupWorld#2': () => lookupWorld(index, 'Eknomos', U),
  'renderElement#2': () => renderElement(elements[0], index, U),
  'buildAskContext#2': () => buildAskContext(elements, index, U),
  'isToEveryone#1': () => isToEveryone({ characters: [] }, U),
  'hasUnseenRecipients#1': () => hasUnseenRecipients({ characters: [] }, U),
  // The address is data with a closed set of keys: a misspelt `world` would write an address inside a world.
  'elementAddress#0': () => elementAddress({ form: 'text', world: '0199c3a1-7b2e-7c3d-8e4f-5a6b7c8d9e0f', ...U }),
};

/** The object parameters that are not options: data a caller hands over, by nature open or required. */
const DATA = {
  'new TokenResource#0': 'the transport (a client), not settings',
};
for (const fn of ['absYearForEraYear', 'absoluteYear', 'approxYearLength', 'breakdownStep', 'displayYear', 'eraForStep',
  'formatDuration', 'formatMidLabel', 'formatStep', 'formatYearLabel', 'intercalaryInYear', 'monthStartSteps', 'parseDate',
  'validateCalendarConfig', 'weekdayForStep', 'yearLength', 'yearStartStep']) {
  DATA[`${fn}#0`] = 'a CalendarConfig: the calendar itself';
}
DATA['intercalaryInYear#1'] = 'a CalendarIntercalary: one entry of the calendar';
Object.assign(DATA, {
  'absYearForEraYear#1': 'a CalendarEra of the config',
  'displayYear#2': 'a CalendarEra of the config',
  'weekdayForStep#2': 'a step\'s position, computed by the kernel',
  'buildAskContext#1': 'the world index',
  'lookupWorld#0': 'the world index',
  'renderElement#1': 'the world index',
  'isKnownOf#0': 'an element',
  'isRoomElement#0': 'an element',
  'isParseError#0': 'parseDate\'s answer',
  'planPhoto#0': 'the picture\'s size and type',
  'draughtText#0': 'a draught body, as draught() returns it',
});

/** Run a call that may throw, return a promise, or return an iterator; hand back what it threw. */
async function refusal(call) {
  try {
    await call();
  } catch (err) {
    return err;
  }
  return undefined;
}

test('every fenced options parameter refuses { __unknown__: 1 } with a TypeError naming the key, before anything is sent or done (4.64.0)', async () => {
  for (const [name, call] of Object.entries(FENCED)) {
    const err = await refusal(call);
    const fn = name.replace(/^new /, '').replace(/#\d+$/, '').replace(/^OwV2Client\.|^TokenResource\./, '');
    assert.ok(err instanceof TypeError, `${name}: expected a TypeError, got ${err === undefined ? 'no error' : err}`);
    assert.ok(err.message.startsWith(`${fn}: unknown `) || err.message.startsWith(`new ${fn}: unknown `), `${name}: the message names the function: ${err.message}`);
    assert.match(err.message, /'__unknown__'/, `${name}: the message names the key`);
    assert.match(err.message, /The keys are /, `${name}: the message names the keys it takes`);
    if (!name.startsWith('OwV2Client.') && !name.startsWith('new OwV2Client') && !name.startsWith('TokenResource.')) {
      assert.doesNotMatch(err.message, /Nothing was sent/, `${name}: sends nothing, so does not say so`);
    }
  }
  assert.equal(calls.length, 0, 'nothing was sent');
  assert.equal(transportCalls.length, 0, 'nothing was sent through the token transport');
});

test('the fenced calls work without the unknown key: a refusal is the key, not the call', async () => {
  const { __unknown__: _, ...none } = U;
  assert.equal(typeWord({ x_names: { version: 1, types: { character: { one: 'Employee' } } } }, 'character', none), 'Employee');
  assert.equal(parseDate(cfg, '12 Sowmarch 3 FT', { now: 0 }).error, undefined);
  assert.equal(resolveCalendar(elements, undefined, { fallbackToOnly: true })?.id, 'c');
  assert.equal(lookupWorld(index, 'Eknomos', { limit: 1 }).length, 1);
  assert.match(renderElement(elements[0], index, { descMax: 10 }), /Eknomos/);
  assert.equal(buildAskContext(elements, index, { includeRoom: false }).kept.length, 2);
  assert.equal(planPhoto({ width: 10, height: 10, type: 'image/png' }, { maxSide: 5 }).width, 5);
  assert.equal(readWorldFile(writeWorldFile([worldJson], 'w'), { maxBytes: 1e6 }).worldId, 'w');
  assert.equal(new OwSignInError('failed', 'm', { status: 500 }).status, 500);
});

test('every exported object parameter is fenced or named as data (a static read of src/index.ts with the TypeScript checker)', () => {
  const surface = objectParameters();
  const known = new Set([...Object.keys(FENCED), ...Object.keys(DATA)]);
  const unheld = surface.filter((p) => !known.has(p));
  assert.deepEqual(unheld, [], `object parameters in neither FENCED nor DATA (fence an options object, then add its call to FENCED; or name it data): ${unheld.join(', ')}`);
  const stale = [...known].filter((p) => !surface.includes(p));
  assert.deepEqual(stale, [], `rows for parameters the surface no longer has: ${stale.join(', ')}`);
  for (const p of Object.keys(FENCED)) assert.ok(!(p in DATA), `${p} is both fenced and data`);
});
