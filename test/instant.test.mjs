/**
 * instantOf and compareInstants: the message profile's time grammar, exported as the readers use it
 * (the message, report, charter and lens readers sort by the same function). The four cases are the
 * ones serial 121 adds to the message and report fixtures; the rest pin each form and range on its
 * own. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantOf, compareInstants, threadOf } from '../dist/index.js';

const order = (given) =>
  given
    .map(([id, at], index) => ({ id, at: instantOf(at), index }))
    .sort((a, b) => compareInstants(a.at, b.at) || a.index - b.index)
    .map((x) => x.id);

test('instantOf reads a time to whole seconds and microseconds', () => {
  assert.deepEqual(instantOf('2026-11-12T10:00:00+02:00'), { seconds: Date.parse('2026-11-12T08:00:00Z') / 1000, microseconds: 0 });
  assert.deepEqual(instantOf('1970-01-01T00:00:00.5Z'), { seconds: 0, microseconds: 500000 });
  assert.deepEqual(instantOf('1970-01-01T00:00:00'), { seconds: 0, microseconds: 0 }, 'no offset is UTC');
  assert.deepEqual(instantOf('1970-01-01T00:00:00-00:00'), { seconds: 0, microseconds: 0 });
  assert.equal(instantOf('0000-01-01T00:00:00Z').seconds, -62167219200, 'year 0000 reads');
});

test('instantOf: a fraction counts to its sixth digit, later digits dropped, never rounded', () => {
  assert.equal(instantOf('2026-11-12T10:00:00.1234569Z').microseconds, 123456);
  assert.equal(instantOf('2026-11-12T10:00:00.1234567891Z').microseconds, 123456);
  assert.equal(instantOf('2026-11-12T10:00:00.0000019Z').microseconds, 1);
});

test('instantOf: what cannot be read is null', () => {
  for (const v of [
    '2026-11-12', '2026-11-12 10:00:00Z', '2026-11-12T10:00Z', '2026-11-12T10:00:00+0200', '2026-11-12T10:00:00+02',
    '2026-11-12T10:00:00,5Z', '2026-11-12T10:00:00Z\n', ' 2026-11-12T10:00:00Z', '２026-11-12T10:00:00Z',
    '2026-02-30T10:00:00Z', '2026-11-12T24:00:00Z', '2026-12-31T23:59:60Z', '2026-13-01T00:00:00Z', '2026-11-00T00:00:00Z',
    '2026-11-12T10:00:00+24:00', '2026-11-12T10:00:00+02:60', '', null, undefined, 20261112, {},
  ]) assert.equal(instantOf(v), null, JSON.stringify(v));
  assert.notEqual(instantOf('2024-02-29T00:00:00Z'), null, 'a leap day reads');
  assert.equal(instantOf('2100-02-29T00:00:00Z'), null, '2100 is no leap year');
  assert.notEqual(instantOf('2000-02-29T00:00:00Z'), null, '2000 is');
});

test('serial 121, forms that cannot be read: R2, R1, then the rest as given', () => {
  assert.deepEqual(order([
    ['X1', '2026-11-12'], ['R1', '2026-11-12t09:00:00z'], ['X2', '2026-11-12 10:00:00Z'],
    ['R2', '2026-11-12T08:00:00.1234567891Z'], ['X3', '2026-11-12T10:00Z'], ['X4', '2026-11-12T10:00:00+0200'],
    ['X5', '2026-11-12T07:00:00Z\n'],
  ]), ['R2', 'R1', 'X1', 'X2', 'X3', 'X4', 'X5']);
});

test('serial 121, a part out of its range: R, then the rest as given', () => {
  assert.deepEqual(order([
    ['Y1', '2026-02-30T10:00:00Z'], ['Y2', '2026-11-12T24:00:00Z'], ['Y3', '2026-11-12T23:59:60Z'], ['R', '2026-11-12T10:00:00Z'],
  ]), ['R', 'Y1', 'Y2', 'Y3']);
});

test('serial 121, a fraction counts to its sixth digit: P and Q are one instant and keep the order given', () => {
  assert.deepEqual(order([
    ['S', '2026-11-12T10:00:00.000002Z'], ['P', '2026-11-12T10:00:00.0000019Z'], ['Q', '2026-11-12T10:00:00.0000011Z'],
  ]), ['P', 'Q', 'S']);
});

test('compareInstants: null after every readable, two nulls and two equal instants 0', () => {
  const a = instantOf('2026-11-12T10:00:00Z');
  assert.equal(compareInstants(null, null), 0);
  assert.equal(compareInstants(a, null), -1);
  assert.equal(compareInstants(null, a), 1);
  assert.equal(compareInstants(a, instantOf('2026-11-12T12:00:00+02:00')), 0);
  assert.ok(compareInstants(a, instantOf('2026-11-12T10:00:00.000001Z')) < 0);
});

test('the exported order is the order the message reader sorts by', () => {
  const at = ['2026-11-12', '2026-11-12T10:00:00+01:00', '2026-11-12T09:00:00', '2026-11-12T10:00:00+02:00', '2026-11-12T10:00:00.0000019Z', 'x'];
  const msgs = [{ type: 'narrative', id: 'root', name: 'r', supertype: 'Message', created_at: '0001-01-01T00:00:00Z', parent_narrative: null }]
    .concat(at.map((v, i) => ({ type: 'narrative', id: `m${i}`, name: `m${i}`, supertype: 'Message', created_at: v, parent_narrative: 'root' })));
  const byReader = threadOf(msgs, 'root').map((m) => m.id).filter((id) => id !== 'root');
  assert.deepEqual(byReader, order(at.map((v, i) => [`m${i}`, v])));
});
