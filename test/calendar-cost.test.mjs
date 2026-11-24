/**
 * A stored calendar does not set what one label costs. The shared cases (test/fixtures/calendar-cost.cases.json,
 * the same bytes the Python package's tests run, its sha256 pinned here): a long run of white space in a template
 * or a name, a long run of marks at a label's edge, and a month of millions of days, each answered with its words
 * inside the bound. Before 4.201.2 the marks, the name and the long month ran past it. Runs against the compiled
 * public bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as sdk from '../dist/index.js';

const CASES_SHA256 = '1e326d378cbdc6db91deba2219ed07cf67ad72211653bd25219f963fc81ebc0f';
const bytes = readFileSync(new URL('./fixtures/calendar-cost.cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));

const expand = (v) => {
  if (Array.isArray(v)) return v.map(expand);
  if (v && typeof v === 'object') {
    if ('$repeat' in v) return v.$repeat.map(([piece, times]) => piece.repeat(times)).join('');
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]));
  }
  return v;
};

test('the cases file is the pinned bytes, the ones the Python package runs', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CASES_SHA256);
  assert.ok(fixture.cases.length >= 8, `${fixture.cases.length} cases`);
});

for (const c of fixture.cases) {
  test(`inside ${fixture.underMs} ms with its words: ${c.name}`, () => {
    const cfg = sdk.readCalendarConfig(expand(c.cfg));
    assert.ok(cfg !== null, 'the case is a calendar the reader accepts');
    const start = performance.now();
    let got;
    if (c.call === 'format') got = sdk.formatStep(cfg, c.step);
    else if (c.call === 'weekday') got = sdk.weekdayForStep(cfg, c.step);
    else {
      const label = sdk.formatStep(cfg, c.step);
      got = [label, sdk.parseDate(cfg, label)];
    }
    const ms = performance.now() - start;
    assert.deepEqual(got, expand(c.want));
    assert.ok(ms < fixture.underMs, `${Math.round(ms)} ms`);
  });
}
