/**
 * nameFinder: a world's element names found in prose. The shared cases (test/fixtures/name-finder.cases.json, the
 * same bytes the Python package's name_finder runs, its sha256 pinned here), their timed recipes, then what the
 * cases cannot hold: JavaScript's string indexes, the object answered, purity and the refusals. Runs against the
 * compiled public bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as sdk from '../dist/index.js';

const { nameFinder } = sdk;
const CASES_SHA256 = '4c4d7d3b4480e4c20bab799972faf90c542b5b570c1b43f7882291444c31007a';
const bytes = readFileSync(new URL('./fixtures/name-finder.cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));

const namesOf = (e) => (Array.isArray(e.names) ? e.names : [e.name]);
/** A JavaScript string index as a count of code points. */
const points = (text, index) => Array.from(text.slice(0, index)).length;
const answer = (c) => nameFinder(c.elements, { case: c.case, names: namesOf })(c.text)
  .map((f) => ({ at: points(c.text, f.start), length: Array.from(c.text.slice(f.start, f.end)).length, id: f.element.id }));

test('the cases file is the pinned bytes, the ones the Python package runs', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CASES_SHA256);
  assert.equal(fixture.version, 1);
  assert.ok(fixture.cases.length >= 45, `${fixture.cases.length} cases`);
});

test('every shared case: what find(text) answers, in order, by place, length and element', () => {
  const wrong = [];
  for (const c of fixture.cases) {
    const got = answer(c);
    if (JSON.stringify(got) !== JSON.stringify(c.want)) wrong.push(`${c.name}\n    want ${JSON.stringify(c.want)}\n    got  ${JSON.stringify(got)}`);
  }
  assert.equal(wrong.length, 0, `${wrong.length} case(s) disagree:\n  ${wrong.join('\n  ')}`);
});

test('the shared cases hold answers of both kinds: some name found, and none', () => {
  assert.ok(fixture.cases.some((c) => c.want.length > 0) && fixture.cases.some((c) => c.want.length === 0));
  for (const fold of ['exact', 'folded']) assert.ok(fixture.cases.some((c) => c.case === fold && c.want.length > 0), fold);
});

const pattern = (p, i) => p.replace('{i}', String(i));
function build(recipe) {
  const elements = [];
  for (let i = 0; i < recipe.elements.count; i++) elements.push({ id: `e${i}`, name: pattern(recipe.elements.pattern, i) });
  let text;
  if (recipe.text.repeat !== undefined) text = recipe.text.repeat.repeat(recipe.text.times);
  else {
    const parts = [];
    for (let i = 0; i < recipe.text.times; i++) parts.push(pattern(recipe.text.cycle, i % recipe.text.count));
    text = parts.join('');
  }
  return { elements, text };
}

test('linear in the text on the timed recipes: each answers its count in well under two seconds', () => {
  assert.ok(fixture.timed.length >= 7);
  for (const recipe of fixture.timed) {
    const { elements, text } = build(recipe);
    const find = nameFinder(elements, { case: 'exact' });
    const t0 = performance.now();
    const found = find(text);
    const ms = performance.now() - t0;
    assert.equal(found.length, recipe.count, recipe.name);
    assert.ok(ms < fixture.underMs, `${recipe.name}: ${Math.round(ms)} ms`);
  }
});

test('start and end are JavaScript string indexes, and the slice between them is the name as written', () => {
  const dragon = String.fromCodePoint(0x1f409);
  const text = `${dragon} Kira met ${dragon}${dragon} KIRA.`;
  const find = nameFinder([{ id: 'k', name: 'Kira' }], { case: 'folded' });
  assert.deepEqual(find(text).map((f) => [f.start, f.end, text.slice(f.start, f.end)]), [[3, 7, 'Kira'], [17, 21, 'KIRA']]);
});

test('element is the object that was passed in, and the default name is its name', () => {
  const kira = { id: 'k', name: 'Kira', type: 'character', description: 'A watchman.' };
  const [f] = nameFinder([kira], { case: 'exact' })('Kira.');
  assert.equal(f.element, kira);
  const seen = new Set([kira]);
  assert.equal(nameFinder(seen, { case: 'exact' })('Kira.')[0].element, kira, 'any iterable of elements');
});

test('nothing given is changed, and one finder answers the same for the same text', () => {
  const elements = [{ id: 'k', name: '  Kira  ', aliases: ['The Watch'] }, { id: 'g', name: 'Iron Gate' }];
  const before = JSON.stringify(elements);
  const find = nameFinder(elements, { case: 'folded', names: (e) => [e.name, ...(e.aliases ?? [])] });
  const text = 'the watch saw Kira at the IRON GATE';
  const first = find(text);
  assert.equal(JSON.stringify(elements), before);
  assert.deepEqual(first.map((f) => f.element.id), ['k', 'k', 'g']);
  first.length = 0;
  assert.equal(find(text).length, 3, 'an answer is the caller\'s own list');
  elements.push({ id: 'x', name: 'saw' });
  assert.equal(find(text).length, 3, 'the names were read once, when the finder was made');
});

test('refusals, each by name and before anything is read: options, case, names, elements, an id, the text', () => {
  const els = [{ id: 'k', name: 'Kira' }];
  assert.throws(() => nameFinder(els), /nameFinder: options is an object/);
  assert.throws(() => nameFinder(els, {}), /options\.case is 'exact' or 'folded', and must be given; got undefined/);
  assert.throws(() => nameFinder(els, { case: 'Exact' }), /options\.case is 'exact' or 'folded'/);
  assert.throws(() => nameFinder(els, { case: 'exact', fold: true }), /nameFinder: unknown option 'fold'\. The keys are case, names\./);
  assert.throws(() => nameFinder(els, { case: 'exact', names: ['Kira'] }), /options\.names is a function/);
  assert.throws(() => nameFinder(null, { case: 'exact' }), /elements is a list/);
  assert.throws(() => nameFinder('Kira', { case: 'exact' }), /elements is a list/);
  assert.throws(() => nameFinder([{ name: 'Kira' }], { case: 'exact' }), /every element is an object with a string id/);
  assert.throws(() => nameFinder([{ id: 7, name: 'Kira' }], { case: 'exact' }), /string id/);
  assert.throws(() => nameFinder([null], { case: 'exact' }), /string id/);
  for (const bad of [undefined, null, 7, ['Kira']]) {
    assert.throws(() => nameFinder(els, { case: 'exact' })(bad), /nameFinder: text must be a string/);
  }
  for (const call of [() => nameFinder(els, { case: 'exact', fold: true }), () => nameFinder(els, {}), () => nameFinder([{}], { case: 'exact' })]) {
    assert.throws(call, TypeError);
  }
});
