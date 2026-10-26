/**
 * World lookup: ranking, the link step, cards, and parity with the trial's
 * lookup.mjs (round 2), whose ordered ids for
 * the ten PARITY questions below were recorded on this fixture and frozen here.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldIndex, lookupWorld, renderElement } from '../dist/index.js';

// FIXTURE START
const u = (n) => `0192a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const MISSING = '0192a000-dead-7000-8000-000000000000';
const FIXTURE = [
  { id: u(1), type: 'location', name: 'Eknomos', supertype: 'city', description: 'A harbour town of 1,684 souls under the cliffs.', parent_location: u(2), primary_power: u(10), populations: [u(12)] },
  { id: u(2), type: 'location', name: 'Kaltigene', supertype: 'region', description: 'Hill country.' },
  { id: u(3), type: 'location', name: 'Styella', supertype: 'village', description: 'Clay pits and kilns.', parent_location: u(2) },
  { id: u(4), type: 'character', name: 'Assula of Styella', supertype: 'potter', description: 'Makes the red jars sold at the harbour.', location: u(1), birthplace: u(3), species: [u(8)], family: [u(9)], friends: [MISSING] },
  { id: u(5), type: 'character', name: 'Byrrikon of Kaltigene', supertype: 'fisherman', description: "Sister's son of the headman; thinks the price too high.", location: u(1), family: [u(9)] },
  { id: u(6), type: 'character', name: 'Zo\u00eb \u00cdstvan', supertype: 'scholar', description: 'Keeps the archive of tides.', location: u(2) },
  { id: u(8), type: 'species', name: 'Selkie', description: 'Seal folk of the outer skerries.' },
  { id: u(9), type: 'family', name: 'The House of Erymos', description: 'Built the feasting house at Eknomos.', ancestors: [u(5)] },
  { id: u(10), type: 'institution', name: 'The Harbour Council', description: 'Rules the quays and fixes the price of salt.' },
  { id: u(11), type: 'collective', name: 'Men of the Altar', description: 'Keep the feasting house beside the goddess temple.', characters: [u(5)] },
  { id: u(12), type: 'collective', name: 'Kiln Guild', description: 'Fires the jars of 7,875 households.', count: 40 },
  { id: u(13), type: 'pin', name: 'Eknomos', element_id: u(1), element_type: 'location', map_id: u(14), x: 10, y: 20 },
  { id: u(14), type: 'map', name: 'Coast Map' },
  { id: u(15), type: 'marker', map_id: u(14), zone_id: u(16), x: 3, y: 4 },
  { id: u(16), type: 'zone', name: 'Red Shoal', x_ref: u(1) },
  { id: u(17), type: 'spaceship', name: 'Argo Star', crew: 12, warp: true, hull: { plates: 3 }, cargo: ['salt', 'jars'] },
  { id: u(18), name: 'Untyped Thing', description: 'No type at all.' },
];
const PARITY = [
  'Tell me about Eknomos',
  'Who is Assula?',
  'zoe istvan',
  'Where does Assula live?',
  'Who lives in Eknomos?',
  'Which house stands beside the goddess temple?',
  'Which guild fires the jars of 7,875 households?',
  "Whose sister's son thinks the price too high?",
  'What rules Eknomos?',
  'Who is the potter at Eknomos?',
];
// FIXTURE END

// lookup.mjs (round 2), limit 8, on FIXTURE: the ordered ids per PARITY question
const PARITY_IDS = [
  [u(1), u(13), u(2), u(12), u(10), u(14), u(4), u(5)],
  [u(4), u(8), u(1), u(3), u(9)],
  [u(6), u(2)],
  [u(4), u(1), u(3), u(8), u(9)],
  [u(1), u(12), u(13), u(4), u(5), u(2), u(10), u(14)],
  [u(9), u(4), u(5), u(11)],
  [u(12), u(1), u(17), u(4)],
  [u(5), u(10)],
  [u(1), u(10), u(13), u(2), u(12), u(14), u(4), u(5)],
  [u(1), u(13), u(2), u(12), u(10), u(4), u(14), u(5)],
];

const index = buildWorldIndex(FIXTURE);
const ask = (q, opts) => lookupWorld(index, q, opts);
const ids = (hits) => hits.map((h) => h.element.id);
const nameish = (r) => r.kind === 'name' || r.kind === 'alias' || r.kind === 'word';

test('a whole name ranks first, with a name reason', () => {
  const hits = ask('Tell me about Eknomos');
  assert.equal(hits[0].element.id, u(1));
  assert.deepEqual(hits[0].reasons[0], { kind: 'name', text: 'eknomos' });
  const pin = hits.find((h) => h.element.id === u(13));
  assert.ok(pin && pin.score < hits[0].score, 'the pin of the same name ranks under its location');
});

test('part of a name: a first name by alias, one name word by its share of the name', () => {
  for (const [q, id, text] of [['Who is Assula?', u(4), 'assula'], ['Who is Zoe?', u(6), 'zoe']]) {
    const hits = ask(q);
    assert.equal(hits[0].element.id, id, q);
    assert.deepEqual(hits[0].reasons[0], { kind: 'alias', text }, q);
  }
  const council = ask('the harbour')[0];
  assert.equal(council.element.id, u(10));
  assert.deepEqual(council.reasons[0], { kind: 'word', text: 'harbour' });
  assert.equal(council.score, 40, '20 + 40 x half the name (harbour, council)');
});

test('case and diacritics do not matter', () => {
  for (const q of ['zoe istvan', 'ZOE ISTVAN', 'Zo\u00eb \u00cdstvan', 'zoe\u0301 istvan']) {
    const top = ask(q)[0];
    assert.equal(top.element.id, u(6), q);
    assert.deepEqual(top.reasons[0], { kind: 'name', text: 'zoe istvan' }, q);
  }
});

const scripts = buildWorldIndex([
  { id: 's1', type: 'character', name: '\u0418\u0432\u0430\u043d \u0413\u0440\u043e\u0437\u043d\u044b\u0439' },
  { id: 's2', type: 'location', name: '\u1f08\u03b8\u1fc6\u03bd\u03b1\u03b9' },
  { id: 's3', type: 'location', name: '\u6771\u4eac', description: 'A city.' },
  { id: 's4', type: 'location', name: 'Stra\u00dfburg' },
]);

test('Cyrillic and Greek names are found by name, accents or not', () => {
  for (const [q, id, text] of [
    ['\u041a\u0442\u043e \u0442\u0430\u043a\u043e\u0439 \u0418\u0432\u0430\u043d \u0413\u0440\u043e\u0437\u043d\u044b\u0439?', 's1', '\u0438\u0432\u0430\u043d \u0433\u0440\u043e\u0437\u043d\u044b\u0438'],
    ['\u03b1\u03b8\u03b7\u03bd\u03b1\u03b9', 's2', '\u03b1\u03b8\u03b7\u03bd\u03b1\u03b9'],
    ['Where is Stra\u00dfburg?', 's4', 'stra\u00dfburg'],
  ]) {
    const top = lookupWorld(scripts, q)[0];
    assert.equal(top?.element.id, id, q);
    assert.deepEqual(top.reasons[0], { kind: 'name', text }, q);
  }
});

test('a two-character CJK name is found by name when the question sets it apart', () => {
  for (const q of ['\u6771\u4eac', 'Tell me about \u6771\u4eac.', '\u6771\u4eac\u3001\u4f55?']) {
    const top = lookupWorld(scripts, q)[0];
    assert.equal(top?.element.id, 's3', q);
    assert.deepEqual(top.reasons[0], { kind: 'name', text: '\u6771\u4eac' }, q);
  }
});

test('a hit by other text alone ranks under every name hit', () => {
  const hits = ask('Which house stands beside the goddess temple?', { limit: 50 });
  const textOnly = hits.filter((h) => h.reasons.every((r) => r.kind === 'text'));
  const named = hits.filter((h) => h.reasons.some(nameish));
  assert.ok(textOnly.some((h) => h.element.id === u(11)), 'the collective is found by its description');
  assert.ok(named.some((h) => h.element.id === u(9)), 'the House is found by its name word');
  for (const t of textOnly) {
    assert.ok(t.score < 19, `${t.element.name} ${t.score}`);
    for (const n of named) assert.ok(t.score < n.score, `${t.element.name} under ${n.element.name}`);
  }
});

test('numbers in text are found, with thousands separators read as one number', () => {
  const hits = ask('Which guild fires the jars of 7,875 households?');
  assert.equal(hits[0].element.id, u(12));
  for (const [q, id, text] of [['7875', u(12), '7875'], ['1,684', u(1), '1684'], ['which has 40?', u(12), '40']]) {
    const top = ask(q)[0];
    assert.equal(top?.element.id, id, q);
    assert.deepEqual(top.reasons, [{ kind: 'text', text }], q);
  }
});

test('one link step, both directions, names the field', () => {
  const out = ask('Where does Assula live?');
  const town = out.find((h) => h.element.id === u(1));
  assert.ok(town, 'her location is found from her');
  assert.ok(town.reasons.some((r) => r.kind === 'link' && r.dir === 'out' && r.field === 'location'
    && r.from === 'Assula of Styella' && r.fromId === u(4)));
  assert.equal(out[1].element.id, u(1), 'right under her');
  assert.equal(town.score, 81, '90 x 0.6, x1.5 because "live" points at location');

  const inn = ask('Who lives in Eknomos?');
  for (const who of [u(4), u(5)]) {
    const h = inn.find((x) => x.element.id === who);
    assert.ok(h, 'the people who link to the town are found from it');
    assert.ok(h.reasons.some((r) => r.kind === 'link' && r.dir === 'in' && r.field === 'location' && r.from === 'Eknomos'));
  }
});

test('a schema link field links whatever the id looks like; folder-style map_id links by id shape', () => {
  const small = buildWorldIndex([
    { id: 'town', type: 'location', name: 'Lowmarsh' },
    { id: 'hero', type: 'character', name: 'Tamsin Reed', location: 'town' },
    { id: 'note', type: 'character', name: 'Odd Note', description: 'town' },
  ]);
  const hit = lookupWorld(small, 'Where is Tamsin Reed?').find((h) => h.element.id === 'town');
  assert.ok(hit && hit.reasons.some((r) => r.kind === 'link' && r.field === 'location'));
  assert.ok(!lookupWorld(small, 'Odd Note').some((h) => h.element.id === 'town'), 'a text field is not a link');
  assert.ok(index.out.get(u(13)).some((l) => l.field === 'map_id' && l.id === u(14)));
});

test('limit caps the hits; the default is 8', () => {
  assert.equal(ask('Who is the potter at Eknomos?', { limit: 2 }).length, 2);
  assert.equal(ask('Who is the potter at Eknomos?').length, 8);
  assert.ok(ask('Who is the potter at Eknomos?', { limit: 50 }).length > 8);
});

test('the kind lifts the potter among the Eknomos hits', () => {
  const hits = ask('Who is the potter at Eknomos?');
  const score = (id) => hits.find((h) => h.element.id === id).score;
  assert.equal(score(u(4)), score(u(5)) + 15, 'the same link, +15 for the kind');
});

test('an empty or all-stopword question returns nothing', () => {
  for (const q of ['', '   ', '?!', 'who is the', undefined]) assert.deepEqual(ask(q), [], String(q));
});

test('an unknown type, a missing type or name, junk entries and odd values do not throw', () => {
  const odd = buildWorldIndex([
    ...FIXTURE, null, {}, { name: 'no id' }, { id: 'x1' }, { id: 'x2', type: 'location', name: null, location: 7 },
    { id: 'x3', type: 'character', name: 'Odd Fields', family: ['', null], friends: '', species: [] },
  ]);
  assert.equal(odd.byId.size, FIXTURE.length + 3);
  assert.equal(lookupWorld(odd, 'Argo Star')[0].element.id, u(17));
  assert.equal(lookupWorld(odd, 'Untyped Thing')[0].element.id, u(18));
  for (const el of odd.byId.values()) assert.equal(typeof renderElement(el, odd), 'string');
  assert.match(renderElement(odd.byId.get(u(17)), odd), /^Argo Star \(spaceship\)\ncrew: 12\nwarp: true\ncargo: salt, jars$/);
});

test('a card shows links by name, outside links by count, and who links in', () => {
  const card = renderElement(index.byId.get(u(4)), index);
  assert.equal(card.split('\n')[0], 'Assula of Styella (character; potter)');
  assert.match(card, /^description: Makes the red jars sold at the harbour\.$/m);
  assert.match(card, /^location: Eknomos$/m);
  assert.match(card, /^birthplace: Styella$/m);
  assert.match(card, /^family: The House of Erymos$/m);
  assert.match(card, /^friends: 1 linked element\(s\) not present in the world data$/m);
  assert.doesNotMatch(card, /0192a000/, 'no raw ids');

  const town = renderElement(index.byId.get(u(1)), index);
  assert.match(town, /^linked from \(character\.location\): Assula of Styella, Byrrikon of Kaltigene$/m);
  assert.match(town, /^primary_power: The Harbour Council$/m);
  assert.doesNotMatch(town, /pin\./, 'map furniture is not listed as linking in');
});

test('parity: the same ordered ids as the trial lookup on ten questions', () => {
  assert.equal(PARITY_IDS.length, PARITY.length);
  PARITY.forEach((q, i) => assert.deepEqual(ids(ask(q)), PARITY_IDS[i], q));
});

test('custom fields (x_*) are found and shown by their own name; atlas_* stays out', () => {
  const els = [
    { id: u(101), type: 'character', name: 'Ada', x_mood: 'melancholy', x_eye_colour: 'grey', x_age_seen: 41,
      x_notes_long: 'w'.repeat(900), atlas_layout: 'hidden-machinery', x_tool_state: { a: 1 }, x_rival: u(102) },
    { id: u(102), type: 'character', name: 'Bram' },
  ];
  const index = buildWorldIndex(els);
  assert.deepEqual(lookupWorld(index, 'who is melancholy?').map((h) => h.element.id), [u(101)]);
  assert.deepEqual(lookupWorld(index, 'hidden machinery'), []);
  const card = renderElement(index.byId.get(u(101)), index);
  assert.match(card, /^mood: melancholy$/m);
  assert.match(card, /^eye colour: grey$/m);
  assert.match(card, /^age seen: 41$/m);
  assert.match(card, /^rival: Bram$/m, 'an id in a custom field is a link, by name');
  assert.match(card, /^notes long: w{500}\.\.\.$/m, 'a long custom value is cut like a description');
  assert.doesNotMatch(card, /atlas_|layout|tool state/);
});
