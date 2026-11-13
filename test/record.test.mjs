/**
 * The record profile (schema-dist profiles/record.md, serial 102): every case of
 * codegen/schema-dist/profiles/record.fixture.json, vendored with the distribution, as its own test: recordMarkOf on
 * each mark case, recordsOf on each records case. Runs against the compiled public bundle (dist), same as the other
 * tests. OW_RECORD_FIXTURE points it at another copy of the fixture (a staged branch before the serial).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECORD_FIELD, recordMarkOf, recordsOf } from '../dist/index.js';

const FIXTURE = process.env.OW_RECORD_FIXTURE ?? fileURLToPath(new URL('../codegen/schema-dist/profiles/record.fixture.json', import.meta.url));
assert.ok(existsSync(FIXTURE), `no record fixture at ${FIXTURE}`);
const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture is the record profile\'s, its mark the field recordMarkOf reads', () => {
  assert.equal(doc.profile, 'record');
  assert.equal(doc.mark.field, RECORD_FIELD);
  assert.deepEqual(doc.mark.members, ['tool', 'played_at', 'version', 'seed', 'outcome', 'seats']);
  assert.equal(doc.cases.length, 41, `the fixture holds ${doc.cases.length} cases, serial 122 has 41`);
});

// Serial 123 reads played_at by the message page's grammar, and four of serial 122's cases move with it: an offset
// reads, a time without seconds does not. Until the pin moves past serial 122, the vendored fixture's cases are held to
// serial 123's answers, written here by hand from the ruling; a staged fixture (OW_RECORD_FIXTURE) is read as written.
const PIN_SERIAL = JSON.parse(readFileSync(new URL('../codegen/schema-pin.json', import.meta.url), 'utf8')).dist_serial;
const OFFSET_RUN = { event: { id: '019a8000-0000-7000-8000-000000000215', name: 'Played with an offset' }, tool: 'subs', played_at: '2026-11-01T08:00:00+01:00', version: null, seed: null, outcome: null, seat: null, stories: [] };
const MOVED_BY_SERIAL_123 = process.env.OW_RECORD_FIXTURE || PIN_SERIAL !== 122 ? {} : {
  // 08:00+01:00 is 07:00Z: a mark.
  'no-mark-played-offset': () => ({ tool: 'subs', played_at: '2026-11-01T08:00:00+01:00', version: null, seed: null, outcome: null, seats: {} }),
  // 2028-02-29T00:00Z has no seconds: no mark.
  'mark-leap-day-of-a-leap-year': () => null,
  // The run played at 08:00+01:00 is Fluffington's too, between 11-02T21:00Z and 11-01T00:30Z.
  'fluffington-two-games': (want) => [want[0], OFFSET_RUN, ...want.slice(1)],
  // Half past with no seconds is no mark: the run with the fraction alone.
  'order-by-the-instant-not-the-string': (want) => want.filter((r) => r.played_at !== '2026-11-01T00:30Z'),
};

test('the cases serial 123 moves are the vendored fixture\'s, each as serial 122 wrote it', { skip: Object.keys(MOVED_BY_SERIAL_123).length === 0 }, () => {
  const byName = new Map(doc.cases.map((c) => [c.name, c]));
  for (const name of Object.keys(MOVED_BY_SERIAL_123)) assert.ok(byName.has(name), `no case ${name} in the fixture`);
  assert.equal(byName.get('no-mark-played-offset').want, null);
  assert.equal(byName.get('mark-leap-day-of-a-leap-year').want.played_at, '2028-02-29T00:00Z');
  assert.ok(!byName.get('fluffington-two-games').want.some((r) => r.event.id === OFFSET_RUN.event.id));
  assert.deepEqual(byName.get('order-by-the-instant-not-the-string').want.map((r) => r.played_at), ['2026-11-01T00:30:00.500Z', '2026-11-01T00:30Z']);
});

for (const c of doc.cases) {
  const world = doc.worlds[c.world];
  const want = MOVED_BY_SERIAL_123[c.name] ? MOVED_BY_SERIAL_123[c.name](c.want) : c.want;
  if (c.kind === 'mark') {
    test(`record fixture: ${c.name}`, () => {
      const el = world.elements.find((e) => e.id === c.element);
      assert.ok(el, `no element ${c.element}`);
      assert.deepEqual(recordMarkOf(el), want);
    });
  } else if (c.kind === 'records') {
    test(`record fixture: ${c.name}`, () => assert.deepEqual(recordsOf(c.character, world.elements), want));
  } else {
    test(`record fixture: ${c.name}`, () => assert.fail(`a case of unknown kind ${c.kind}`));
  }
}

test('recordsOf is pure: the elements are not moved, and the records are the caller\'s own', () => {
  const world = Object.values(doc.worlds)[0];
  const before = JSON.stringify(world);
  const who = doc.cases.find((c) => c.kind === 'records' && c.want.length).character;
  const got = recordsOf(who, world.elements);
  got[0].event.name = 'planted';
  got[0].stories.push({ id: 'x', name: 'x', as: 'both' });
  const mark = recordMarkOf(world.elements.find((e) => recordMarkOf(e)));
  mark.seats.planted = 'planted';
  assert.equal(JSON.stringify(world), before);
  assert.notEqual(recordsOf(who, world.elements)[0].event.name, 'planted');
});

test('recordsOf refuses what is not an id or a list, and reads no seat from an object\'s own machinery', () => {
  assert.throws(() => recordsOf(null, []), TypeError);
  assert.throws(() => recordsOf('a', null), TypeError);
  assert.throws(() => recordsOf('a', {}), TypeError);
  assert.deepEqual(recordsOf('a', []), []);
  const ev = { id: 'e', type: 'event', name: 'E', characters: ['toString', 'constructor'], x_record: { tool: 'subs', played_at: '2026-11-01T00:00:00Z' } };
  for (const who of ['toString', 'constructor']) assert.equal(recordsOf(who, [ev])[0].seat, null);
});

test('a Narrative naming an Event twice is one story of it, other values in events name none, and no two records share a story', () => {
  const C = '019a8000-0000-7000-8000-000000000101';
  const ev = (id, at) => ({ id, type: 'event', name: id, characters: [C], x_record: { tool: 'tangle', played_at: at } });
  const world = [
    ev('e1', '2026-11-02T00:00:00Z'),
    ev('e2', '2026-11-01T00:00:00Z'),
    { id: 'n1', type: 'narrative', name: 'One', protagonist: C, events: ['e1', 'e1', 'e2'] },
    { id: 'n2', type: 'narrative', name: 'Two', narrator: C, events: [7, null, {}, ['e1'], 'e1'] },
  ];
  const got = recordsOf(C, world);
  assert.deepEqual(got.map((r) => [r.event.id, r.stories.map((s) => `${s.id}:${s.as}`)]), [['e1', ['n1:protagonist', 'n2:narrator']], ['e2', ['n1:protagonist']]]);
  got[0].stories[0].name = 'planted';
  assert.equal(got[1].stories[0].name, 'One');
});

test('ties order by code point, never UTF-16: an id above the BMP sorts after U+FF00', () => {
  const C = 'c';
  const at = '2026-11-01T00:00:00Z';
  const hi = 'e\u{1F600}', bmp = 'e\uFF00';
  const world = [
    { id: hi, type: 'event', name: 'hi', characters: [C], x_record: { tool: 'tangle', played_at: at } },
    { id: bmp, type: 'event', name: 'bmp', characters: [C], x_record: { tool: 'tangle', played_at: at } },
    { id: 'n\u{1F600}', type: 'narrative', name: 'a', protagonist: C, events: [hi] },
    { id: 'n\uFF00', type: 'narrative', name: 'b', protagonist: C, events: [hi] },
  ];
  const got = recordsOf(C, world);
  assert.deepEqual(got.map((r) => r.event.id), [bmp, hi]);
  assert.deepEqual(got[1].stories.map((s) => s.id), ['n\uFF00', 'n\u{1F600}']);
});

test('a played_at with seconds and a fraction orders as the instant it is', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  const got = recordsOf('c', [mk('a', '2026-11-01T00:30:00Z'), mk('b', '2026-11-01T00:30:00.500Z'), mk('c', '2026-11-01T00:29:59Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['b', 'a', 'c']);
});

// Serial 123: a record's played_at is read by the message page's grammar (instantOf), one grammar for a time.
test('played_at reads by the message grammar: a lowercase t and z read, a mark', () => {
  const mk = (at) => ({ id: 'e', type: 'event', characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  assert.deepEqual(recordMarkOf(mk('2026-11-01t00:30:00z')), { tool: 'subs', played_at: '2026-11-01t00:30:00z', version: null, seed: null, outcome: null, seats: {} });
  assert.notEqual(recordMarkOf(mk('2026-11-01t00:30:00Z')), null);
  assert.notEqual(recordMarkOf(mk('2026-11-01T00:30:00z')), null);
  assert.deepEqual(recordsOf('c', [mk('2026-11-01t00:30:00z')]).map((r) => r.played_at), ['2026-11-01t00:30:00z']);
});

test('played_at reads by the message grammar: an offset reads, ordered as the instant it names', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  assert.notEqual(recordMarkOf(mk('e', '2026-11-01T01:30:00+01:00')), null);
  assert.notEqual(recordMarkOf(mk('e', '2026-10-31T23:30:00-01:00')), null);
  // 01:30+01:00 is 00:30Z, older than 00:45Z and newer than 00:15Z; one instant written two ways ties by id.
  const got = recordsOf('c', [mk('b', '2026-11-01T01:30:00+01:00'), mk('d', '2026-11-01T00:15:00Z'), mk('c', '2026-11-01T00:45:00Z'), mk('a', '2026-11-01T00:30:00Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['c', 'a', 'b', 'd']);
  assert.equal(got[2].played_at, '2026-11-01T01:30:00+01:00', 'played_at as written');
});

test('played_at reads by the message grammar: a time without seconds is no mark', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  assert.equal(recordMarkOf(mk('e', '2026-11-01T00:30Z')), null);
  assert.equal(recordMarkOf(mk('e', '2028-02-29T00:00Z')), null);
  assert.deepEqual(recordsOf('c', [mk('e', '2026-11-01T00:30Z'), mk('f', '2026-11-01T00:30:00Z')]).map((r) => r.event.id), ['f']);
});

test('played_at reads by the message grammar: the year 0000 and a time with no zone (read as UTC) are marks', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  assert.notEqual(recordMarkOf(mk('e', '0000-01-01T00:00:00Z')), null);
  assert.notEqual(recordMarkOf(mk('e', '2026-11-01T00:30:00')), null);
  const got = recordsOf('c', [mk('a', '2026-11-01T00:30:00'), mk('b', '2026-11-01T00:29:59Z'), mk('z', '0000-01-01T00:00:00Z'), mk('c', '2026-11-01T00:30:01Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['c', 'a', 'b', 'z']);
});

test('played_at orders to the millisecond, a finer fraction truncated (the Python package reads it the same)', () => {
  const mk = (id, at) => ({ id, type: 'event', name: id, characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  const got = recordsOf('c', [mk('b', '2026-11-01T00:30:00.1239Z'), mk('a', '2026-11-01T00:30:00.1231Z')]);
  assert.deepEqual(got.map((r) => r.event.id), ['a', 'b']);
});

test('a played_at that is no real calendar instant is no mark (the Python package refuses the same)', () => {
  const mk = (at) => ({ id: 'e', type: 'event', characters: ['c'], x_record: { tool: 'subs', played_at: at } });
  for (const at of ['2026-13-01T00:00:00Z', '2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z', '2026-11-01T24:00:00Z', '2026-11-01T00:60:00Z', '2026-11-01T00:00:60Z', '2026-00-01T00:00:00Z', '2026-11-00T00:00:00Z', '2026-11-01T00:00:00+24:00']) {
    assert.equal(recordMarkOf(mk(at)), null, at);
  }
  for (const at of ['2028-02-29T00:00:00Z', '2000-02-29T23:59:59.999Z', '0001-01-01T00:00:00Z']) assert.notEqual(recordMarkOf(mk(at)), null, at);
});
