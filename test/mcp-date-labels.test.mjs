/**
 * The folder tools' `date_labels`: the hosted door's rule (keel's mcp_server/date_labels.py) on a
 * world folder. A date leaves get_element and list_elements with the words of the calendar the World names in
 * `x_calendar`, and only there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { folderMcpTools } from '../dist/mcp.js';

const enc = new TextEncoder();
const file = (path, value) => ({ path, data: enc.encode(JSON.stringify(value, null, 2) + '\n') });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W = '0192a000-aaaa-7bbb-8ccc-000000000001';
const CAL = 'abcdef00-0000-4000-8000-0000000000aa'; // letters, so its upper-case spelling differs

// calendar-entry.test.mjs's calendar: step 0 is '1 Sowmarch, Year 1 FT'.
const CONFIG = {
  version: 1,
  grain: 'day',
  eras: [
    { name: 'Old Count', abbrev: 'OC', start: -3600, restart: true, closed: true },
    { name: 'Freehold Tally', abbrev: 'FT', start: 0, restart: true },
  ],
  bundles: {
    months: {
      names: ['Sowmarch', 'Thistlewane', 'Greening', 'Suncrest', 'Longhay', 'Ashfall', 'Rootdeep', 'Frostwake', 'Bellmoot', 'Hearthtide', 'Graytide', 'Coldmark'],
      lengths: [30, 28, 32, 30, 31, 29, 30, 28, 32, 30, 29, 31],
    },
    week: { length: 6, names: ['Ondel', 'Tresk', 'Mireth', 'Aldun', 'Volk', 'Hearth'], mode: 'free' },
  },
  format: '{day} {month}, Year {year} {era}',
};
const ZERO = '1 Sowmarch, Year 1 FT';
const ONE = '2 Sowmarch, Year 1 FT';

/** A world: the calendar on a Construct (or `calType`), an Event at 0 to 1, a Character born at 0, a Location with no date. */
function world(opts = {}) {
  const { calType = 'construct', calExtra = {}, events = [] } = opts;
  const w = { id: W, name: 'Freehold' };
  // `named` given as undefined leaves the key out of world.json; not given, the World names CAL.
  if (!('named' in opts)) w.x_calendar = CAL;
  else if (opts.named !== undefined) w.x_calendar = opts.named;
  return [
    file('world.json', w),
    file(`elements/${calType}/cal.json`, { id: CAL, type: calType, name: 'The Tally', atlas_calendar: CONFIG, ...calExtra }),
    file('elements/event/landing.json', { id: id(1), type: 'event', name: 'The Landing', start_date: 0, end_date: 1, created_at: '2026-01-02T00:00:00Z' }),
    file('elements/character/ada.json', { id: id(2), type: 'character', name: 'Ada', birth_date: 0, created_at: '2026-01-01T00:00:00Z' }),
    file('elements/location/port.json', { id: id(3), type: 'location', name: 'Port', created_at: '2026-01-01T00:00:00Z' }),
    ...events,
  ];
}

async function call(entries, name, args) {
  const r = await folderMcpTools([{ entries }]).callTool(name, args);
  assert.equal(r.isError, false, `${name} answered a refusal: ${r.content[0].text}`);
  return r.structuredContent;
}

test('get_element: the dates in the named calendar\'s words, the last key, in the door\'s field order', async () => {
  const ev = await call(world(), 'get_element', { type: 'event', id: id(1) });
  assert.deepEqual(ev.date_labels, { start_date: ZERO, end_date: ONE });
  assert.equal(Object.keys(ev).at(-1), 'date_labels');
  assert.equal(ev.start_date, 0, 'the number itself is served as it was');
  const ch = await call(world(), 'get_element', { type: 'character', id: id(2) });
  assert.deepEqual(ch.date_labels, { birth_date: ZERO });
  const loc = await call(world(), 'get_element', { type: 'location', id: id(3) });
  assert.equal('date_labels' in loc, false, 'a body with no date has no key');
});

test('list_elements: each row that has a date carries its labels; the calendar may sit on any type', async () => {
  const page = await call(world({ calType: 'object' }), 'list_elements', { type: 'event' });
  assert.deepEqual(page.data.map((e) => e.date_labels), [{ start_date: ZERO, end_date: ONE }]);
  const none = await call(world(), 'list_elements', { type: 'location' });
  assert.equal(none.data.some((e) => 'date_labels' in e), false);
});

test('no labels where the World names no calendar, even when the world holds one, or names it in another spelling', async () => {
  for (const named of [undefined, null, '', CAL.toUpperCase(), `{${CAL}}`, CAL.replaceAll('-', ''), id(99), 7]) {
    const ev = await call(world({ named }), 'get_element', { type: 'event', id: id(1) });
    assert.equal('date_labels' in ev, false, `x_calendar ${JSON.stringify(named)}`);
  }
});

test('no labels from a calendar that is proposed and undecided, or carries no calendar that reads', async () => {
  for (const calExtra of [{ x_review_proposed: { by: 'an AI seat' } }, { atlas_calendar: null }, { atlas_calendar: { version: 1 } }, { atlas_calendar: 'not json' }]) {
    const ev = await call(world({ calExtra }), 'get_element', { type: 'event', id: id(1) });
    assert.equal('date_labels' in ev, false, JSON.stringify(calExtra));
  }
  const asText = await call(world({ calExtra: { atlas_calendar: JSON.stringify(CONFIG) } }), 'get_element', { type: 'event', id: id(1) });
  assert.deepEqual(asText.date_labels, { start_date: ZERO, end_date: ONE }, 'a calendar stored as a JSON string speaks');
});

test('a Read mark never speaks as the calendar; another Relation does', async () => {
  for (const supertype of ['Read', ' read ', 'READ']) {
    const ev = await call(world({ calType: 'relation', calExtra: { supertype } }), 'get_element', { type: 'event', id: id(1) });
    assert.equal('date_labels' in ev, false, JSON.stringify(supertype));
  }
  const other = await call(world({ calType: 'relation', calExtra: { supertype: 'Reading' } }), 'get_element', { type: 'event', id: id(1) });
  assert.deepEqual(other.date_labels, { start_date: ZERO, end_date: ONE });
});

test('an answer of more than 200 distinct dates gets none; 200 get every one', async () => {
  const many = (n) => Array.from({ length: n }, (_, i) => file(`elements/event/e${i}.json`, { id: id(1000 + i), type: 'event', name: `E${i}`, start_date: 10 + i, created_at: '2026-01-01T00:00:00Z' }));
  // The Landing holds 0 and 1: 198 more make 200 distinct dates on one page.
  const at200 = await call(world({ events: many(198) }), 'list_elements', { type: 'event', limit: 1000 });
  assert.equal(at200.data.length, 199);
  assert.equal(at200.data.every((e) => 'date_labels' in e), true);
  const at201 = await call(world({ events: many(199) }), 'list_elements', { type: 'event', limit: 1000 });
  assert.equal(at201.data.some((e) => 'date_labels' in e), false);
});

test('search_elements and count_elements are not labelled', async () => {
  const found = await call(world(), 'search_elements', { query: 'Landing' });
  assert.equal(JSON.stringify(found).includes('date_labels'), false);
});
