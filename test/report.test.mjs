/**
 * The report profile's rule 9 (schema-dist profiles/report.md, serial 120): every thread case of
 * codegen/schema-dist/profiles/report.fixture.json, vendored with the distribution, as its own test, then the edges the
 * fixture leaves out. Runs against the compiled public bundle (dist), same as the other tests. OW_REPORT_FIXTURE
 * points it at another copy of the fixture (a staged branch before the serial).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOM_PAIRS, reportThreadsOf } from '../dist/index.js';

const FIXTURE = process.env.OW_REPORT_FIXTURE ?? fileURLToPath(new URL('../codegen/schema-dist/profiles/report.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no report fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

/** Groups and lints compare as sets (the page rules no order between them); a group's reports keep their order. */
const asSet = (list) => list.map((v) => JSON.stringify(v, Object.keys(v).sort())).sort();

test('the fixture is the report profile\'s: its pairs are room pairs, its mark the room\'s', () => {
  assert.equal(doc.profile, 'report');
  for (const pair of [doc.pair, doc.board_pair]) {
    assert.ok(ROOM_PAIRS.some((p) => p.type === pair.type && p.supertype === pair.supertype), `${pair.type}/${pair.supertype} is no room pair`);
  }
  assert.deepEqual([doc.pair.supertype, doc.board_pair.supertype], ['Report', 'Board']);
  assert.equal(doc.mark.field, 'x_room_of');
  assert.ok(Array.isArray(doc.thread_cases), 'the fixture holds no thread_cases list');
  assert.equal(doc.thread_cases.length, 20, `the fixture holds ${doc.thread_cases.length} thread cases, serial 120 has 20`);
});

for (const [i, c] of (doc.thread_cases ?? []).entries()) {
  const name = typeof c?.name === 'string' ? c.name : `case ${i}`;
  test(`report fixture: ${name}`, () => {
    assert.ok(Array.isArray(c.narratives), `${name}: no narratives list; keys ${Object.keys(c ?? {}).sort().join(', ')}`);
    const want = c.want;
    assert.ok(want && typeof want === 'object' && ['parents', 'groups', 'lints'].every((k) => k in want), `${name}: no want with parents, groups and lints`);
    const got = reportThreadsOf(c.narratives);
    assert.deepEqual(got.parents, want.parents, `${name}: parents`);
    assert.deepEqual(asSet(got.groups), asSet(want.groups), `${name}: groups`);
    assert.deepEqual(asSet(got.lints), asSet(want.lints), `${name}: lints`);
  });
}

const MARK = '019a7120-0000-7000-8000-000000000000';
const report = (id, extra = {}) => ({ id, type: 'narrative', supertype: 'Report', x_room_of: MARK, created_at: '2026-10-26T09:00:00Z', ...extra });
const board = (id, extra = {}) => ({ id, type: 'narrative', supertype: 'Board', x_room_of: MARK, ...extra });

test('a non-object in the list is skipped, and the rest is read', () => {
  const got = reportThreadsOf([null, 7, 'r1', ['r1'], undefined, report('r1'), true, report('r2', { parent_narrative: 'r1' })]);
  assert.deepEqual(got, { parents: { r1: 'none', r2: 'report' }, groups: [{ parent: 'r1', kind: 'report', reports: ['r2'] }], lints: [] });
});

test('an element with no id is no report and no parent: a report naming one reads missing', () => {
  const noId = report(undefined);
  delete noId.id;
  const got = reportThreadsOf([noId, report('', {}), report(42), report('r1', { parent_narrative: '' }), report('r2', { parent_narrative: 'gone' })]);
  assert.deepEqual(got.parents, { r1: 'none', r2: 'missing' });
  assert.deepEqual(got.groups, []);
});

test('a stub (base fields, no mark, no parent served) is no report and, as a parent, other: the report is a thread of one', () => {
  const stub = { id: 's1', type: 'narrative', name: 'Earlier', description: '', supertype: 'Report', subtype: 'completed', image_url: '', created_at: '2026-10-26T08:00:00Z', updated_at: '2026-10-26T08:00:00Z', change_seq: 3, created_by: null, changed_by: null };
  const boardStub = { id: 'b1', type: 'narrative', name: 'Agenda', supertype: 'Board' };
  const got = reportThreadsOf([stub, boardStub, report('r1', { parent_narrative: 's1' }), report('r2', { parent_narrative: 'b1' })]);
  assert.deepEqual(got, { parents: { r1: 'other', r2: 'other' }, groups: [], lints: [] });
});

test('a parent_narrative that is no string id reads none, never matched by its text', () => {
  const values = [7, { id: 'r0' }, ['r0'], true, null, ''];
  const list = [report('r0'), ...values.map((v, i) => report(`r${i + 1}`, { parent_narrative: v }))];
  const got = reportThreadsOf(list);
  assert.deepEqual(got.parents, Object.fromEntries(list.map((r) => [r.id, 'none'])));
  assert.deepEqual(got.groups, []);
});

test('the pair is trimmed and folded, the whole word; the mark is read by presence', () => {
  const got = reportThreadsOf([
    report('r0'),
    report('r1', { type: ' Narrative ', supertype: 'REPORT', parent_narrative: 'r0' }),
    report('r2', { supertype: 'Reports', parent_narrative: 'r0' }),
    report('r3', { x_room_of: '  ', parent_narrative: 'r0' }),
    report('r4', { x_room_of: 0, parent_narrative: 'r0' }),
    report('r5', { type: 'event', parent_narrative: 'r0' }),
  ]);
  assert.deepEqual(got.parents, { r0: 'none', r1: 'report', r4: 'report' });
  assert.deepEqual(got.groups, [{ parent: 'r0', kind: 'report', reports: ['r1', 'r4'] }]);
});

test('no chain through a parent that names itself: it reads self and still heads the group of the report under it', () => {
  const got = reportThreadsOf([report('b', { parent_narrative: 'b' }), report('c', { parent_narrative: 'b', created_at: '2026-10-26T09:10:00Z' })]);
  assert.deepEqual(got, {
    parents: { b: 'self', c: 'report' },
    groups: [{ parent: 'b', kind: 'report', reports: ['c'] }],
    lints: [{ kind: 'self', report: 'b' }],
  });
});

test('a chain needs a report the reader holds: no chain when the parent names an id not held', () => {
  const got = reportThreadsOf([report('b', { parent_narrative: 'gone' }), report('c', { parent_narrative: 'b' })]);
  assert.deepEqual(got, { parents: { b: 'missing', c: 'report' }, groups: [{ parent: 'b', kind: 'report', reports: ['c'] }], lints: [] });
});

test('a chain needs a report the reader holds: no chain when the parent names a Report Narrative with no mark', () => {
  const lore = report('x');
  delete lore.x_room_of;
  const got = reportThreadsOf([lore, report('b', { parent_narrative: 'x' }), report('c', { parent_narrative: 'b' })]);
  assert.deepEqual(got, { parents: { b: 'other', c: 'report' }, groups: [{ parent: 'b', kind: 'report', reports: ['c'] }], lints: [] });
});

test('only reports are grouped: a message naming a report is in no part of the answer, with the mark or without', () => {
  const message = (id, extra) => ({ id, type: 'narrative', supertype: 'Message', parent_narrative: 'r0', created_at: '2026-10-26T10:00:00Z', ...extra });
  const got = reportThreadsOf([report('r0'), message('m1'), message('m2', { x_room_of: MARK })]);
  assert.deepEqual(got, { parents: { r0: 'none' }, groups: [], lints: [] });
});

test('no parent: empty once trimmed of White_Space reads none; a parent with content is read as written, never trimmed', () => {
  const got = reportThreadsOf([
    report('r0'),
    report('r1', { parent_narrative: '' }),
    report('r2', { parent_narrative: '   ' }),
    report('r3', { parent_narrative: '\t' + String.fromCodePoint(0x3000, 0xa0) + '\n' }),
    report('r4', { parent_narrative: ' r0' }),
    report('r5', { parent_narrative: 'r0' + String.fromCodePoint(0x200b) }),
  ]);
  assert.deepEqual(got.parents, { r0: 'none', r1: 'none', r2: 'none', r3: 'none', r4: 'missing', r5: 'missing' });
  assert.deepEqual(got.groups, []);
});

test('of two elements with one id, the first is read', () => {
  const got = reportThreadsOf([board('p'), report('p'), report('r1', { parent_narrative: 'p' }), report('r1', { parent_narrative: 'x' })]);
  assert.deepEqual(got, { parents: { r1: 'board' }, groups: [{ parent: 'p', kind: 'board', reports: ['r1'] }], lints: [] });
});

test('an id such as __proto__ is a key like any other', () => {
  const got = reportThreadsOf([report('__proto__')]);
  assert.deepEqual(Object.keys(got.parents), ['__proto__']);
  assert.equal(got.parents.__proto__, 'none');
});

test('anything but a list gives the empty answer', () => {
  for (const v of [undefined, null, {}, 'r1', 3]) assert.deepEqual(reportThreadsOf(v), { parents: {}, groups: [], lints: [] });
});

test('reportThreadsOf is pure: the narratives are not moved', () => {
  const c = doc.thread_cases[0];
  const before = JSON.stringify(c.narratives);
  reportThreadsOf(c.narratives);
  assert.equal(JSON.stringify(c.narratives), before);
});
