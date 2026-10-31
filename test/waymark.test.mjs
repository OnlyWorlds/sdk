/**
 * The Waymark's fan-out (@onlyworlds/sdk/waymark): mountWaymark draws the core's rows and words and
 * decides none, keeps the public face to the name, the rows that need nothing and Copy link, refuses an
 * unknown option before drawing, works from the keyboard, sets no style attribute anywhere, and its
 * disposer leaves the target, the listeners and the timers as they were. The core bundle never reaches
 * it. Runs against the compiled bundle (dist), in happy-dom (a dev dependency: the component needs a
 * DOM with focus and keyboard events, which Node does not have).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { mountWaymark } from '../dist/waymark.js';
import { openersFor, doorsOf, doorWhere, elementAddress, OwAddressError, TOOLS } from '../dist/index.js';
import { objectParameters } from './options-surface.mjs';

const WORLD = { id: '0695db52-5433-7332-8000-db7fe10da375', name: 'Moppetopia' };
const ELEMENT = { id: '0698c9de-e66f-782b-8000-bf427f5471c4', type: 'character', name: 'Governor Threadsworth' };
const MEMBER_ELEMENT = {
  ...ELEMENT,
  doors: { atlas: '2026-10-12T12:00:00.000000+00:00', site: '2026-10-09T11:17:13.537432+00:00' },
  updated_at: '2026-10-12T12:00:00.000000+00:00',
};
const LENSES = [
  { id: '0698c9de-0000-7000-8000-000000000001', name: 'The station' },
  { id: '0698c9de-0000-7000-8000-000000000002', name: 'Old wars' },
];
/** Every state word in one list: a tool that is here, two that need an account, one that needs the device, one with a world door only, one built. */
const TOOLS_ALL = [
  { id: 'atlas', name: 'Atlas', url: 'https://atlas.example', client: 'atlas', rung: 'listed', open: { world: 'https://atlas.example/#/open/{world}', element: 'https://atlas.example/#/open/{world}/element/{id}', needs: 'account' } },
  { id: 'lantern', name: 'Lantern', url: 'https://lantern.example', client: 'lantern', rung: 'listed', open: { world: 'https://lantern.example/#/open/{world}', element: 'https://lantern.example/#/open/{world}/element/{id}', needs: 'account' } },
  { id: 'little-lens', name: 'Little Lens', url: 'https://lens.example', client: 'little-lens', rung: 'listed', open: { world: null, element: 'https://lens.example/{type}/{id}', needs: 'device' } },
  { id: 'obsidian', name: 'Obsidian', url: 'https://obsidian.example', client: 'obsidian', rung: 'listed', open: { world: 'obsidian://open?world={world}', element: null, needs: null } },
  { id: 'corvid', name: 'Corvid', url: 'https://corvid.example', client: null, rung: 'built', open: { world: 'https://corvid.example/{world}', element: null, needs: null } },
];
const SURFACE = { tool: 'atlas', signedIn: false, phone: true };

/** A fresh DOM with a page holding the name, a clipboard that records, and counters on listeners and timers. */
function page() {
  const window = new Window({ url: 'https://surface.example/w/x' });
  const doc = window.document;
  doc.body.innerHTML = '<main><h1 class="name">Governor Threadsworth</h1><button class="dots">...</button><div class="more" role="menu"></div><button class="elsewhere">Elsewhere</button></main>';
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
  const live = new Map();
  // The prototype that holds addEventListener for the nodes the component makes (and the document).
  let proto = Object.getPrototypeOf(doc.createElement('span'));
  while (!Object.prototype.hasOwnProperty.call(proto, 'addEventListener')) proto = Object.getPrototypeOf(proto);
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  proto.addEventListener = function (type, fn, opts) {
    const k = `${type}`;
    live.set(k, (live.get(k) ?? 0) + 1);
    return add.call(this, type, fn, opts);
  };
  proto.removeEventListener = function (type, fn, opts) {
    const k = `${type}`;
    live.set(k, (live.get(k) ?? 0) - 1);
    return remove.call(this, type, fn, opts);
  };
  const timers = new Set();
  const setT = window.setTimeout.bind(window);
  const clearT = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms) => {
    const id = setT(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  window.clearTimeout = (id) => { timers.delete(id); clearT(id); };
  const listening = () => [...live.entries()].filter(([, v]) => v !== 0);
  return { window, doc, name: doc.querySelector('.name'), more: doc.querySelector('.more'), copied, listening, timers };
}

const key = (window, target, k) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const items = (root) => [...root.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].filter((i) => !i.closest('[hidden]'));
const text = (n) => n?.textContent ?? null;
const flush = () => new Promise((r) => setTimeout(r, 0));

test('the rows drawn are openersFor\'s rows, in order, each with its state word; grey only on a row that cannot open', () => {
  const { name } = page();
  const dispose = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  const expected = openersFor(TOOLS_ALL, 'element', { form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id }, { audience: 'member', ...SURFACE });
  const drawn = [...name.querySelectorAll('[data-opener]')].map((a) => ({
    id: a.dataset.opener,
    name: text(a.querySelector('.ow-waymark__label')),
    href: a.getAttribute('href'),
    state: text(a.querySelector('.ow-waymark__state')),
  }));
  // The surface's own row is drawn without its link (it leads nowhere); every other row carries openersFor's href.
  assert.deepEqual(drawn, expected.map((r) => (r.state === 'You are here' ? { ...r, href: null } : r)));
  assert.deepEqual(expected.map((r) => r.state), [null, 'You are here', 'Sign in to Lantern first', 'Needs the world on this phone', 'Opens the world']);
  const grey = [...name.querySelectorAll('[data-opener]')].filter((a) => a.classList.contains('ow-waymark__row--cannot')).map((a) => a.dataset.opener);
  assert.deepEqual(grey, ['lantern', 'little-lens'], 'the cannot grey: not "You are here", not "Opens the world"');
  // The surface's own row reads as where the reader is: its own grey class, never the cannot one.
  const here = [...name.querySelectorAll('[data-opener]')].filter((a) => a.classList.contains('ow-waymark__row--here')).map((a) => a.dataset.opener);
  assert.deepEqual(here, ['atlas']);
  // A web row opens in a new tab with no opener; a link to an app on the device (obsidian:) and the row with no link do not.
  const tabs = [...name.querySelectorAll('[data-opener]')].map((a) => [a.dataset.opener, a.getAttribute('target'), a.getAttribute('rel')]);
  assert.deepEqual(tabs, [
    ['onlyworlds', '_blank', 'noopener'], ['atlas', null, null], ['lantern', '_blank', 'noopener'],
    ['little-lens', '_blank', 'noopener'], ['obsidian', null, null],
  ]);
  // The baked list, through the same function, by default.
  dispose();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', signedIn: false });
  const baked = openersFor(TOOLS, 'element', { form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id }, { audience: 'member', signedIn: false });
  assert.deepEqual([...name.querySelectorAll('[data-opener]')].map((a) => [a.dataset.opener, a.getAttribute('href'), text(a.querySelector('.ow-waymark__state'))]), baked.map((r) => [r.id, r.href, r.state]));
});

test('the name line: the element\'s name, its type word and its world; the world\'s own name alone for a world', () => {
  const { name } = page();
  let dispose = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'public' });
  assert.equal(text(name.querySelector('.ow-waymark__name')), 'Governor Threadsworth');
  assert.equal(text(name.querySelector('.ow-waymark__type')), 'Character');
  assert.equal(text(name.querySelector('.ow-waymark__world')), 'in Moppetopia');
  dispose();
  dispose = mountWaymark(name, { world: { ...WORLD, x_names: { version: 1, types: { character: { one: 'Resident' } } } }, element: ELEMENT, reader: 'public' });
  assert.equal(text(name.querySelector('.ow-waymark__type')), 'Resident', 'the world\'s own word, from typeWord');
  dispose();
  mountWaymark(name, { world: WORLD, reader: 'member' });
  assert.equal(text(name.querySelector('.ow-waymark__name')), 'Moppetopia');
  assert.ok(!name.querySelector('.ow-waymark__sub'));
  assert.equal(name.querySelector('[data-opener]').getAttribute('href'), elementAddress({ form: 'human', world: WORLD.id }));
});

test('the public face: the name and type, the rows that need nothing first, Copy link; no last door, no Through, no lens list', () => {
  const { name } = page();
  mountWaymark(name, { world: WORLD, element: MEMBER_ELEMENT, reader: 'public', tools: TOOLS_ALL, lenses: LENSES, ...SURFACE });
  assert.ok(!name.querySelector('.ow-waymark__door'), 'no last door');
  assert.ok(!name.querySelector('[aria-label="Through"]'), 'no Through');
  assert.ok(!name.querySelector('[data-lens]'), 'no lens list');
  assert.ok(!name.textContent.includes('In a lens'));
  assert.equal(text(name.querySelector('.ow-waymark__type')), 'Character');
  const public_ = openersFor(TOOLS_ALL, 'element', { form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id }, { audience: 'public', ...SURFACE });
  assert.deepEqual([...name.querySelectorAll('[data-opener]')].map((a) => a.dataset.opener), public_.map((r) => r.id));
  assert.deepEqual(public_.map((r) => r.id), ['onlyworlds', 'obsidian']);
  name.querySelector('.ow-waymark__mark').click();
  const all = items(name);
  assert.equal(text(all[all.length - 1].querySelector('.ow-waymark__label')), 'Copy link');
});

test('the member face: the last door in doorWhere\'s words, then the date; a guest sees their own; Through with the lenses', () => {
  for (const reader of ['member', 'guest']) {
    const { name } = page();
    mountWaymark(name, { world: WORLD, element: MEMBER_ELEMENT, reader, lenses: LENSES });
    const first = doorsOf(MEMBER_ELEMENT)[0];
    assert.equal(doorWhere(first), 'in Atlas');
    const line = text(name.querySelector('.ow-waymark__door'));
    const m = /^Last shaped (.+), (\d{1,2} [A-Z][a-z]{2}(?: \d{4})?)$/.exec(line);
    assert.ok(m, `${reader}: the line reads "Last shaped <where>, <date>": ${line}`);
    assert.equal(m[1], doorWhere(first));
    assert.match(m[2], /^12 Oct/);
    assert.ok(name.querySelector('[aria-label="Through"]'), `${reader}: Through is drawn`);
    assert.deepEqual([...name.querySelectorAll('[data-lens]')].map((b) => b.textContent), ['The station', 'Old wars']);
  }
  const { name } = page();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  assert.ok(!name.querySelector('.ow-waymark__door'), 'no door field, no line');
  assert.ok(!name.querySelector('[aria-label="Through"]'), 'no lenses, no Through');
});

test('an unknown option key is refused by name, and a bad value or address, before anything is drawn', () => {
  const { name } = page();
  const before = name.innerHTML;
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', __unknown__: 1 }), (err) =>
    err instanceof TypeError && err.message.startsWith('mountWaymark: unknown option \'__unknown__\'.') && /The keys are /.test(err.message));
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'everyone' }), /mountWaymark: reader is/);
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'tile' }), /mountWaymark: entry is/);
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', ground: 'light' }), /mountWaymark: ground is/);
  assert.throws(() => mountWaymark(name, { world: { id: 'moppetopia', name: 'M' }, element: ELEMENT, reader: 'member' }), OwAddressError);
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', lenses: [{ id: 'nope', name: 'L' }] }), OwAddressError);
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tool: 'atlas', phone: 'yes' }), /openersFor: surface.phone/);
  assert.equal(name.innerHTML, before, 'nothing drawn');
});

test('the subpath\'s object parameters are fenced (a static read of src/waymark/index.ts)', () => {
  assert.deepEqual(objectParameters('../src/waymark/index.ts'), ['mountWaymark#1']);
});

test('entry: \'menu\' draws no mark; its "Open with" entry opens the same fan-out, and Escape returns to it', () => {
  const { window, doc, name, more } = page();
  const waymark = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'menu' });
  assert.ok(!name.querySelector('.ow-waymark__mark'), 'no mark');
  assert.ok(!name.querySelector('svg.ow-waymark__glyph')?.closest('button'));
  const entry = waymark.entry;
  assert.equal(entry.tagName, 'BUTTON');
  assert.equal(entry.textContent, 'Open with');
  more.appendChild(entry);
  const pop = name.querySelector('.ow-waymark__pop');
  assert.equal(pop.hidden, true);
  entry.click();
  assert.equal(pop.hidden, false);
  assert.equal(entry.getAttribute('aria-expanded'), 'true');
  assert.ok(doc.activeElement === items(name)[0], 'focus on the first row');
  key(window, doc.activeElement, 'Escape');
  assert.equal(pop.hidden, true);
  assert.ok(doc.activeElement === entry, 'focus back on the entry');
  waymark();
  assert.equal(more.children.length, 0, 'the disposer takes the entry out of the surface\'s menu too');
  const { name: name2 } = page();
  assert.equal(mountWaymark(name2, { world: WORLD, element: ELEMENT, reader: 'member' }).entry, null, 'the mark arm has no entry');
});

test('returnFocus: the surface\'s own button takes focus when the fan-out opened from the entry closes by Escape', () => {
  const { window, doc, name, more } = page();
  const dots = doc.querySelector('.dots');
  const waymark = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'menu', returnFocus: dots });
  more.appendChild(waymark.entry);
  waymark.entry.click();
  assert.ok(doc.activeElement === items(name)[0], 'focus on the first row');
  key(window, doc.activeElement, 'Escape');
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, true);
  assert.ok(doc.activeElement === dots, 'focus on the surface\'s "..." button, not the entry');
});

test('returnFocus is refused by name with entry \'mark\' (or by default), and when it is not an HTMLElement, before anything is drawn', () => {
  const { doc, name } = page();
  const before = name.innerHTML;
  const dots = doc.querySelector('.dots');
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'mark', returnFocus: dots }),
    (err) => err instanceof TypeError && err.message.startsWith('mountWaymark: returnFocus is for entry \'menu\' or \'both\''));
  assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', returnFocus: dots }), /mountWaymark: returnFocus is for entry/);
  for (const bad of [{}, 'dots', doc.createTextNode('...'), { focus() {} }]) {
    assert.throws(() => mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'menu', returnFocus: bad }),
      (err) => err instanceof TypeError && err.message.startsWith('mountWaymark: returnFocus is an HTMLElement'));
  }
  assert.equal(name.innerHTML, before, 'nothing drawn');
});

test('entry: \'both\' draws the mark and the entry, both open the same fan-out, and Escape returns focus to the one that opened it', () => {
  const { window, doc, name, more } = page();
  const dots = doc.querySelector('.dots');
  for (const returnFocus of [null, dots]) {
    const waymark = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'both', returnFocus });
    const mark = name.querySelector('.ow-waymark__mark');
    assert.ok(mark, 'the mark is drawn');
    assert.equal(waymark.entry?.textContent, 'Open with', 'and the entry is given');
    more.appendChild(waymark.entry);
    const pop = name.querySelector('.ow-waymark__pop');
    assert.equal(name.querySelectorAll('.ow-waymark__pop').length, 1, 'one fan-out');
    mark.click();
    assert.equal(pop.hidden, false);
    assert.equal(mark.getAttribute('aria-expanded'), 'true');
    assert.equal(waymark.entry.getAttribute('aria-expanded'), 'false');
    key(window, doc.activeElement, 'Escape');
    assert.ok(doc.activeElement === mark, 'opened by the mark: back to the mark');
    waymark.entry.click();
    assert.equal(pop.hidden, false);
    assert.equal(waymark.entry.getAttribute('aria-expanded'), 'true');
    key(window, doc.activeElement, 'Escape');
    assert.ok(doc.activeElement === (returnFocus ?? waymark.entry), 'opened by the entry: back to returnFocus, else the entry');
    waymark();
    assert.equal(more.children.length, 0);
  }
});

test('keyboard: the mark is a button opening a menu; Tab order is the mark then the rows; arrows, Home and End move; Escape closes and returns focus', () => {
  const { window, doc, name } = page();
  mountWaymark(name, { world: WORLD, element: MEMBER_ELEMENT, reader: 'member', tools: TOOLS_ALL, lenses: LENSES, ...SURFACE });
  const mark = name.querySelector('.ow-waymark__mark');
  assert.equal(mark.tagName, 'BUTTON');
  assert.equal(mark.getAttribute('aria-haspopup'), 'menu');
  const menu = name.querySelector('[role="menu"]');
  assert.equal(mark.getAttribute('aria-controls'), menu.id);
  mark.focus();
  key(window, mark, 'ArrowDown');
  const list = items(name);
  assert.equal(mark.getAttribute('aria-expanded'), 'true');
  assert.ok(doc.activeElement === list[0], 'focus on the first row');
  // Tab order: what the page reaches in document order, the menu open.
  const tabbable = [...name.querySelectorAll('a[href], button')].filter((n) => !n.closest('[hidden]') && n.tabIndex >= 0);
  assert.deepEqual(tabbable, [mark, ...list], 'the mark, then every row in order');
  key(window, doc.activeElement, 'ArrowDown');
  assert.ok(doc.activeElement === list[1], 'focus on the second row');
  key(window, doc.activeElement, 'ArrowUp');
  key(window, doc.activeElement, 'ArrowUp');
  assert.ok(doc.activeElement === list[list.length - 1], 'ArrowUp from the first wraps to the last');
  key(window, doc.activeElement, 'Home');
  assert.ok(doc.activeElement === list[0], 'focus on the first row');
  key(window, doc.activeElement, 'End');
  assert.equal(text(doc.activeElement.querySelector('.ow-waymark__label')), 'Copy link');
  key(window, doc.activeElement, 'Escape');
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, true);
  assert.equal(mark.getAttribute('aria-expanded'), 'false');
  assert.ok(doc.activeElement === mark, 'focus back on the mark');
  // The lens list opens in place and its rows join the arrow order.
  mark.click();
  const toggle = items(name).find((i) => i.getAttribute('aria-haspopup') === 'true');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(items(name).filter((i) => i.getAttribute('role') === 'menuitemradio').length, 2);
});

test('a click outside closes the fan-out, and so does focus leaving it; a click or focus inside does not', () => {
  const { window, doc, name } = page();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', lenses: LENSES });
  const pop = name.querySelector('.ow-waymark__pop');
  name.querySelector('.ow-waymark__mark').click();
  const toggle = items(name).find((i) => i.getAttribute('aria-haspopup') === 'true');
  toggle.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  assert.equal(pop.hidden, false);
  doc.querySelector('.elsewhere').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  assert.equal(pop.hidden, true);
  // Tab past the last row: focus leaves the fan-out, and it closes.
  name.querySelector('.ow-waymark__mark').click();
  const copy = items(name).at(-1);
  copy.focus();
  copy.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: items(name)[0] }));
  assert.equal(pop.hidden, false, 'focus moving within stays open');
  copy.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: doc.querySelector('.elsewhere') }));
  assert.equal(pop.hidden, true);
});

test('Copy link copies the site\'s address with the world\'s id (and the lens chosen), and says "Link copied"', async () => {
  const { name, copied, timers } = page();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', lenses: LENSES });
  const mark = name.querySelector('.ow-waymark__mark');
  mark.click();
  const copy = items(name).at(-1);
  copy.click();
  await flush();
  assert.deepEqual(copied, [elementAddress({ form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id })]);
  const toast = name.querySelector('.ow-waymark__toast');
  assert.equal(toast.hidden, false);
  assert.equal(toast.textContent, 'Link copied');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.equal(timers.size, 1, 'one timer hides the toast');
  mark.click();
  items(name).find((i) => i.getAttribute('aria-haspopup') === 'true').click();
  items(name).find((i) => i.dataset.lens === LENSES[1].id).click();
  items(name).at(-1).click();
  await flush();
  assert.equal(copied[1], elementAddress({ form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id, lens: LENSES[1].id }));
  assert.equal(timers.size, 1, 'the second toast replaces the first timer');
});

test('a failed copy says "Could not copy the link." over the address in a read-only line, and stays until the fan-out closes', async () => {
  const refused = { writeText: async () => { throw new Error('denied'); } };
  for (const [clipboard, how] of [[refused, 'refused'], [undefined, 'no clipboard']]) {
    const { window, doc, name, timers } = page();
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: clipboard });
    mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', lenses: LENSES });
    const mark = name.querySelector('.ow-waymark__mark');
    mark.click();
    items(name).find((i) => i.getAttribute('aria-haspopup') === 'true').click();
    items(name).find((i) => i.dataset.lens === LENSES[0].id).click();
    items(name).at(-1).click();
    await flush();
    const toasts = name.querySelectorAll('.ow-waymark__toast');
    assert.equal(toasts.length, 1, `${how}: the same toast element`);
    const toast = toasts[0];
    assert.equal(toast.hidden, false, `${how}: the toast shows`);
    assert.equal(text(toast.querySelector('.ow-waymark__toast-line')), 'Could not copy the link.', `${how}: the exact words`);
    const line = toast.querySelector('.ow-waymark__address');
    assert.equal(line.hidden, false);
    assert.equal(line.tagName, 'INPUT');
    assert.equal(line.readOnly, true, `${how}: read-only`);
    assert.equal(line.value, elementAddress({ form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id, lens: LENSES[0].id }), `${how}: the address Copy link would have copied`);
    assert.ok(doc.activeElement === line, `${how}: focus on the address, ready to copy`);
    assert.equal(name.querySelector('.ow-waymark__pop').hidden, false, `${how}: the fan-out stays open`);
    assert.equal(timers.size, 0, `${how}: no timer hides it`);
    key(window, line, 'Escape');
    assert.equal(toast.hidden, true, `${how}: Escape closes it with the fan-out`);
    assert.ok(doc.activeElement === mark, `${how}: and returns focus`);
  }
  // It outlives the 2 s of "Link copied", and goes when the fan-out closes another way.
  const { window, doc, name } = page();
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  name.querySelector('.ow-waymark__mark').click();
  items(name).at(-1).click();
  const toast = name.querySelector('.ow-waymark__toast');
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(toast.hidden, false, 'still there after 2.1 s');
  doc.querySelector('.elsewhere').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  assert.equal(toast.hidden, true, 'gone with the fan-out');
  // "Link copied" afterwards keeps its timer and shows no address line.
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
  name.querySelector('.ow-waymark__mark').click();
  items(name).at(-1).click();
  await flush();
  assert.equal(text(toast.querySelector('.ow-waymark__toast-line')), 'Link copied');
  assert.equal(toast.querySelector('.ow-waymark__address').hidden, true);
});

test('focus moving out of the fan-out closes it and stays where it was moved: Tab off the last row, Shift+Tab off the first, a click elsewhere', () => {
  for (const entry of ['mark', 'menu']) {
    const { doc, name, more } = page();
    const w = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry });
    if (w.entry) more.appendChild(w.entry);
    const opener = w.entry ?? name.querySelector('.ow-waymark__mark');
    const pop = name.querySelector('.ow-waymark__pop');
    const elsewhere = doc.querySelector('.elsewhere');
    // Tab off the last row, to the next thing on the page.
    opener.click();
    items(name).at(-1).focus();
    let pulledBack = 0;
    const count = () => { pulledBack += 1; };
    for (const b of [opener, name.querySelector('.ow-waymark__mark')].filter(Boolean)) b.addEventListener('focus', count);
    elsewhere.focus();
    for (const b of [opener, name.querySelector('.ow-waymark__mark')].filter(Boolean)) b.removeEventListener('focus', count);
    assert.equal(pulledBack, 0, `${entry}: nothing takes the focus back on the way out`);
    assert.equal(pop.hidden, true, `${entry}: Tab out closes it`);
    assert.ok(doc.activeElement === elsewhere, `${entry}: focus stays where it went`);
    assert.equal(opener.getAttribute('aria-expanded'), 'false', `${entry}: aria-expanded reset`);
    // Shift+Tab off the first row: to the mark (or whatever comes before), which keeps the focus.
    opener.click();
    items(name)[0].focus();
    opener.focus();
    assert.equal(pop.hidden, true, `${entry}: Shift+Tab out closes it`);
    assert.ok(doc.activeElement === opener, `${entry}: focus where it was moved, not moved again`);
    assert.equal(opener.getAttribute('aria-expanded'), 'false');
    // Moving between rows keeps it open.
    opener.click();
    items(name)[1].focus();
    assert.equal(pop.hidden, false, `${entry}: focus within stays open`);
  }
  // A press on the mark while it is open closes it and does not open it again.
  const { window, name } = page();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  const mark = name.querySelector('.ow-waymark__mark');
  mark.click();
  mark.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  mark.focus();
  mark.click();
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, true, 'pressed open: closed, and the click does not reopen it');
});

test('Tab off the last row with nothing after it (focus on the body) closes the fan-out; the window losing focus does not', async () => {
  const settle = () => new Promise((r) => setTimeout(r, 5));
  for (const entry of ['mark', 'menu']) {
    const { doc, name, more } = page();
    const w = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry });
    if (w.entry) more.appendChild(w.entry);
    const opener = w.entry ?? name.querySelector('.ow-waymark__mark');
    const pop = name.querySelector('.ow-waymark__pop');
    // The end of the page: focus leaves the last row for the body, with no relatedTarget.
    doc.hasFocus = () => true;
    opener.click();
    const last = items(name).at(-1);
    last.focus();
    last.blur();
    assert.ok(doc.activeElement === doc.body, `${entry}: focus on the body`);
    assert.equal(pop.hidden, false, `${entry}: read on the next tick, not at once`);
    await settle();
    assert.equal(pop.hidden, true, `${entry}: Tab to the body closes it`);
    assert.ok(doc.activeElement === doc.body, `${entry}: focus stays where it went`);
    assert.equal(opener.getAttribute('aria-expanded'), 'false', `${entry}: aria-expanded reset`);
    // The window loses focus (alt-tab): the document no longer has it, and the fan-out stays open.
    opener.click();
    const row = items(name)[0];
    row.focus();
    doc.hasFocus = () => false;
    row.blur();
    await settle();
    assert.equal(pop.hidden, false, `${entry}: a window blur keeps it open`);
    assert.equal(opener.getAttribute('aria-expanded'), 'true');
  }
  // A press inside the fan-out on something that takes no focus (the name line) is not leaving.
  const { window, doc, name } = page();
  doc.hasFocus = () => true;
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  name.querySelector('.ow-waymark__mark').click();
  const head = name.querySelector('.ow-waymark__head');
  head.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  items(name)[0].blur();
  await settle();
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, false, 'a press on the name line keeps it open');
});

test('tap targets: rows at least 44 px tall in the sheet, the type size kept; the mark\'s tap box at least 44 by 44 at every width, with no room taken', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/waymark.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const sheet = /@media \(max-width: 480px\) \{([\s\S]*)\}\s*$/.exec(css)[1];
  const rule = (src, sel) => {
    const m = new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src);
    return m ? Object.fromEntries(m[1].split(';').map((d) => d.split(':').map((s) => s.trim())).filter((d) => d[0])) : null;
  };
  const px = (v) => Number(/^(\d+(?:\.\d+)?)px$/.exec(v)?.[1] ?? NaN);
  const row = rule(sheet, '.ow-waymark__row');
  assert.ok(px(row['min-height']) >= 44, `sheet rows: min-height ${row['min-height']}`);
  assert.equal(rule(css, '.ow-waymark__row')['box-sizing'], 'border-box', 'the min-height holds the padding');
  const [padTop, , padBottom] = (row.padding + ' ' + row.padding).split(/\s+/);
  assert.ok(px(padTop) + px(padBottom) + 15 * 1.45 >= 44, `sheet rows: the padding and the line make 44 (${row.padding})`);
  assert.equal(row['font-size'], '15px', 'the type size as drawn');
  assert.equal(rule(sheet, '.ow-waymark__row--lens')['padding-left'], '30px', 'the lens rows keep their indent in the sheet');
  // The mark: a pseudo-element, absolutely placed, centred, at least 44 by 44, so the button's own box does not change.
  const mark = rule(css, '.ow-waymark__mark');
  assert.equal(mark.position, 'relative');
  assert.equal(mark.padding, '0.15em', 'the mark\'s own padding as before');
  assert.equal(mark.margin, '0 0 0 0.3em', 'the mark\'s own margin as before');
  const box = rule(css, '.ow-waymark__mark::before');
  assert.ok(box, 'a tap box on the mark');
  assert.equal(box.content, "''");
  assert.equal(box.position, 'absolute', 'it takes no room');
  assert.equal(box.width, 'max(44px, 100%)');
  assert.equal(box.height, 'max(44px, 100%)');
  assert.equal(box.transform, 'translate(-50%, -50%)', 'centred on the glyph');
  assert.ok(!/@media[^{]*\{[^@]*\.ow-waymark__mark::before/.test(css), 'at every width: no media rule changes it');
});

test('no element the component makes carries a style attribute, in any face, arm or state', async () => {
  for (const reader of ['member', 'guest', 'public']) {
    for (const entry of ['mark', 'menu', 'both']) {
      for (const ground of ['dark', 'paper']) {
        const { doc, name, more } = page();
        const w = mountWaymark(name, { world: WORLD, element: MEMBER_ELEMENT, reader, entry, ground, lenses: LENSES, tools: TOOLS_ALL, ...SURFACE });
        if (w.entry) more.appendChild(w.entry);
        (w.entry ?? name.querySelector('.ow-waymark__mark')).click();
        items(name).find((i) => i.getAttribute('aria-haspopup') === 'true')?.click();
        items(name).at(-1).click();
        await flush();
        assert.equal(doc.querySelectorAll('[style]').length, 0, `${reader}, ${entry}, ${ground}`);
        assert.ok(name.querySelector(`.ow-waymark--${ground}`));
      }
    }
  }
});

test('the disposer leaves the target as it was, with no listener and no timer left behind', async () => {
  for (const entry of ['mark', 'menu', 'both']) {
    const { window, doc, name, more, listening, timers } = page();
    const before = name.innerHTML;
    const baseline = listening();
    const w = mountWaymark(name, { world: WORLD, element: MEMBER_ELEMENT, reader: 'member', entry, lenses: LENSES });
    if (w.entry) more.appendChild(w.entry);
    const opener = w.entry ?? name.querySelector('.ow-waymark__mark');
    opener.click();
    key(window, doc.activeElement, 'Escape');
    opener.click();
    items(name).at(-1).click();
    await flush();
    opener.click();
    assert.equal(timers.size, 1, 'the toast\'s timer is pending');
    w();
    assert.equal(name.innerHTML, before, `${entry}: the target as it was`);
    assert.equal(more.innerHTML, '', `${entry}: the entry gone from the surface's menu`);
    assert.deepEqual(listening(), baseline, `${entry}: every listener removed`);
    assert.equal(timers.size, 0, `${entry}: the timer cleared`);
    w();
    assert.equal(name.innerHTML, before, 'a second call does nothing');
  }
});

test('Escape the fan-out handles stops there: a page\'s own Escape on the document does not also run; an Escape it does not handle reaches the page', async () => {
  const { window, doc, name, more } = page();
  const seen = [];
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') seen.push(e.target); });
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
  const w = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', entry: 'both' });
  more.appendChild(w.entry);
  const mark = name.querySelector('.ow-waymark__mark');
  const pop = name.querySelector('.ow-waymark__pop');
  // The fan-out closed: its Escape is the page's.
  mark.focus();
  assert.equal(key(window, mark, 'Escape'), true, 'closed: not prevented');
  assert.deepEqual(seen, [mark], 'closed: the page\'s Escape runs');
  // A row of the open fan-out.
  mark.click();
  assert.equal(key(window, doc.activeElement, 'Escape'), false);
  assert.equal(pop.hidden, true);
  // The mark, and the entry, while it is open.
  for (const opener of [mark, w.entry]) {
    opener.click();
    assert.equal(pop.hidden, false);
    assert.equal(key(window, opener, 'Escape'), false);
    assert.equal(pop.hidden, true);
  }
  // The toast's address line after a failed copy.
  mark.click();
  items(name).at(-1).click();
  await flush();
  const address = name.querySelector('.ow-waymark__address');
  assert.equal(address.hidden, false);
  assert.equal(key(window, address, 'Escape'), false);
  assert.equal(pop.hidden, true);
  assert.deepEqual(seen, [mark], 'none of the four Escapes it handled reached the page');
});

/** A rect as getBoundingClientRect gives one. */
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

/**
 * A mounted fan-out whose boxes are stubbed (happy-dom lays nothing out): the wrapper at `anchor`, the pop
 * 300 by 240 below it at its start, and the page at happy-dom's 1024 by 768 window. `css` is the page's
 * own stylesheet (the clipping ancestor's overflow); `main` the rect of the page's main.
 */
function placed({ anchor, css = '', main = null }) {
  const p = page();
  const { window, doc, name } = p;
  if (css) {
    const style = doc.createElement('style');
    style.textContent = css;
    doc.head.appendChild(style);
  }
  if (main) doc.querySelector('main').getBoundingClientRect = () => main;
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  const root = name.querySelector('.ow-waymark');
  const pop = name.querySelector('.ow-waymark__pop');
  const toast = name.querySelector('.ow-waymark__toast');
  const at = { anchor };
  root.getBoundingClientRect = () => at.anchor;
  pop.getBoundingClientRect = () => box(at.anchor.left, at.anchor.bottom + 6, 300, 240);
  const mark = name.querySelector('.ow-waymark__mark');
  const sides = (n) => [...n.classList].filter((c) => /--(end|up)$/.test(c));
  return { ...p, root, pop, toast, mark, at, sides };
}

test('the fan-out picks its side when it opens, by measuring against the box that clips it', async () => {
  assert.equal(new Window().innerWidth, 1024, 'happy-dom\'s window, which the numbers below assume');
  // Room on the right and below: no class.
  let f = placed({ anchor: box(100, 100, 20, 20) });
  f.mark.click();
  assert.deepEqual([f.sides(f.pop), f.sides(f.toast)], [[], []], 'room: no side');
  // The right edge crossed (the pop would end at 1200): at the end.
  f = placed({ anchor: box(900, 100, 20, 20) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), ['ow-waymark__pop--end']);
  assert.deepEqual(f.sides(f.toast), ['ow-waymark__toast--end'], 'the toast takes the same side');
  // Closed, the pop's class goes; the next open measures again.
  f.mark.click();
  assert.equal(f.pop.hidden, true);
  assert.deepEqual(f.sides(f.pop), [], 'removed on close');
  f.at.anchor = box(100, 100, 20, 20);
  f.mark.click();
  assert.deepEqual([f.sides(f.pop), f.sides(f.toast)], [[], []], 'recomputed on the next open');
  // "Link copied" after the close keeps the side it opened on, and the side goes when it hides.
  f.mark.click();
  f.at.anchor = box(900, 100, 20, 20);
  f.mark.click();
  items(f.name).at(-1).click();
  await flush();
  assert.equal(f.pop.hidden, true);
  assert.equal(f.toast.hidden, false);
  assert.deepEqual(f.sides(f.toast), ['ow-waymark__toast--end'], 'the copied toast at the end, as the fan-out was');
  // The bottom crossed (the pop would end at 866): above the name.
  f = placed({ anchor: box(100, 600, 20, 20) });
  f.mark.click();
  assert.deepEqual([f.sides(f.pop), f.sides(f.toast)], [['ow-waymark__pop--up'], ['ow-waymark__toast--up']]);
  // Both crossed.
  f = placed({ anchor: box(900, 600, 20, 20) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), ['ow-waymark__pop--end', 'ow-waymark__pop--up']);
  // An ancestor that clips is the box, not the window: main ends at 500, so a pop ending at 600 crosses it.
  f = placed({ anchor: box(300, 100, 20, 20), css: 'main { overflow: hidden; }', main: box(0, 0, 500, 400) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), ['ow-waymark__pop--end'], 'overflow: hidden on main');
  f = placed({ anchor: box(300, 100, 20, 20), main: box(0, 0, 500, 400) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), [], 'the same main, not clipping: the window has room');
  // Each axis by its own overflow: a band that clips across only (overflow-x: clip) never sends the pop up.
  f = placed({ anchor: box(300, 100, 20, 20), css: 'main { overflow-x: clip; overflow-y: visible; }', main: box(0, 90, 500, 36) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), ['ow-waymark__pop--end'], 'the band clips the right edge, not the bottom');
  // No room either way (below crosses by 86, above would start at -226): the sheet, no side.
  f = placed({ anchor: box(100, 20, 20, 20), css: 'main { overflow: hidden; }', main: box(0, 0, 1024, 200) });
  f.mark.click();
  assert.deepEqual(f.sides(f.pop), [], 'neither below nor above fits: no side');
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), true, 'neither below nor above fits: the sheet');
  // The sheet (a fixed pop): no side at all.
  f = placed({ anchor: box(900, 600, 20, 20) });
  const real = f.window.getComputedStyle.bind(f.window);
  f.window.getComputedStyle = (n) => (n === f.pop ? { position: 'fixed' } : real(n));
  f.mark.click();
  assert.deepEqual([f.sides(f.pop), f.sides(f.toast)], [[], []], 'the sheet keeps its place');
});

test('neither side fits across (a mark mid-window in a narrow window): the sheet, and the copied toast keeps it until it hides', async () => {
  // The site's character page at 481: the clipping box 481 wide, the wrapper at 196 to 235. The start
  // side would end at 496, the end side would start at -65.
  const narrow = { css: 'main { overflow: hidden; }', main: box(0, 0, 481, 768) };
  let f = placed({ anchor: box(196, 100, 39, 20), ...narrow });
  f.mark.click();
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), true, 'neither side fits: the sheet');
  assert.deepEqual([f.sides(f.pop), f.sides(f.toast)], [[], []], 'no side with the sheet');
  // The world page's numbers at the same width: the end side fits, so no sheet.
  f.mark.click();
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), false, 'removed on close');
  f.at.anchor = box(277, 100, 42, 20);
  f.mark.click();
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), false, 'the end side fits: no sheet');
  assert.deepEqual(f.sides(f.pop), ['ow-waymark__pop--end']);
  // Back mid-window: "Link copied", shown after the close, keeps the sheet's place, and it goes when the toast hides.
  f.mark.click();
  f.at.anchor = box(196, 100, 39, 20);
  f.mark.click();
  items(f.name).at(-1).click();
  await flush();
  assert.equal(f.pop.hidden, true);
  assert.equal(f.toast.hidden, false);
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), true, 'the copied toast in the sheet\'s place');
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(f.toast.hidden, true);
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), false, 'gone with the toast');
  // Exactly at the edge: a pop that ends on the box's edge fits.
  f = placed({ anchor: box(181, 100, 39, 20), ...narrow });
  f.mark.click();
  assert.equal(f.root.classList.contains('ow-waymark--sheet'), false, 'ending at 481 fits');
  assert.deepEqual(f.sides(f.pop), []);
});

test('the sheet\'s rules for a narrow box are the 480 px sheet\'s, declaration for declaration', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/waymark.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf('@media (max-width: 480px)');
  assert.ok(at > 0, 'the media block');
  const rules = (src) => [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].split(';').map((d) => d.trim()).filter(Boolean).join('; ')]);
  const media = rules(/@media \(max-width: 480px\) \{([\s\S]*)\}\s*$/.exec(css)[1]);
  const byClass = new Map(rules(css.slice(0, at)).filter(([s]) => s.startsWith('.ow-waymark--sheet ')));
  assert.ok(media.length >= 7, `the media block's rules (${media.length})`);
  for (const [sel, body] of media) assert.equal(byClass.get(`.ow-waymark--sheet ${sel}`), body, sel);
  assert.equal(byClass.size, media.length, 'no rule under the class that the media block lacks');
  // The phone's safe area: the sheet's last row and the toast clear a home indicator on a page with
  // viewport-fit=cover; elsewhere the inset is 0 and nothing moves.
  const of = (sel) => Object.fromEntries(media.find(([s]) => s === sel)[1].split('; ').map((d) => d.split(/:\s*/, 2)));
  assert.equal(of('.ow-waymark__pop').padding, '8px 14px calc(18px + env(safe-area-inset-bottom, 0px))', 'the sheet pads the safe area');
  assert.equal(of('.ow-waymark__toast').bottom, 'calc(24px + env(safe-area-inset-bottom, 0px))', 'the toast clears the safe area');
});

/**
 * The fan-out opened in a window `width` px wide with the shipped stylesheet loaded (happy-dom applies its
 * media block by the window's width), the wrapper stubbed where a pop at its start would cross a narrow
 * window's right edge: the pop's computed position, and the side classes chosen.
 */
function openedAt(width, anchor = box(300, 100, 20, 20)) {
  const css = readFileSync(fileURLToPath(new URL('../dist/waymark.css', import.meta.url)), 'utf8');
  const window = new Window({ url: 'https://surface.example/w/x', width, height: 800 });
  const doc = window.document;
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
  doc.body.innerHTML = '<main><h1 class="name">Governor Threadsworth</h1></main>';
  const name = doc.querySelector('.name');
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member' });
  const pop = name.querySelector('.ow-waymark__pop');
  name.querySelector('.ow-waymark').getBoundingClientRect = () => anchor;
  pop.getBoundingClientRect = () => box(anchor.left, anchor.bottom + 6, 300, 240);
  name.querySelector('.ow-waymark__mark').click();
  assert.equal(window.innerWidth, width);
  return { position: window.getComputedStyle(pop).position, sides: [...pop.classList].filter((c) => /--(end|up)$/.test(c)) };
}

test('wider than 480, a mark mid-window that neither side fits gets the same sheet from the stylesheet', () => {
  assert.deepEqual(openedAt(481, box(196, 100, 39, 20)), { position: 'fixed', sides: [] });
  assert.deepEqual(openedAt(520, box(230, 100, 39, 20)), { position: 'fixed', sides: [] }, 'the start ends at 530, the end starts at -31');
  assert.deepEqual(openedAt(700, box(200, 100, 39, 20)), { position: 'absolute', sides: [] }, 'room at the start');
});

test('a 430 px phone gets the sheet from the bottom, with no side chosen', () => {
  assert.deepEqual(openedAt(430), { position: 'fixed', sides: [] });
});

test('480 px wide is the last width with the sheet', () => {
  assert.deepEqual(openedAt(480), { position: 'fixed', sides: [] });
});

test('481 px wide gets the popover, its side measured', () => {
  assert.deepEqual(openedAt(481), { position: 'absolute', sides: ['ow-waymark__pop--end'] });
});

test('the surface\'s own row leads nowhere: a button with no href, kept in the arrow order; pressing it closes and returns focus', () => {
  const { window, doc, name } = page();
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  const expected = openersFor(TOOLS_ALL, 'element', { form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id }, { audience: 'member', ...SURFACE });
  const here = name.querySelector('[data-opener="atlas"]');
  assert.equal(expected.find((r) => r.id === 'atlas').state, 'You are here');
  assert.equal(here.tagName, 'BUTTON');
  assert.equal(here.type, 'button');
  assert.equal(here.hasAttribute('href'), false, 'no link');
  assert.equal(here.getAttribute('role'), 'menuitem');
  assert.equal(here.getAttribute('aria-current'), 'page');
  assert.ok(here.classList.contains('ow-waymark__row'), 'the row\'s look');
  assert.equal(text(here.querySelector('.ow-waymark__state')), 'You are here');
  // Every other row is still its link.
  for (const r of expected.filter((x) => x.id !== 'atlas')) {
    const a = name.querySelector(`[data-opener="${r.id}"]`);
    assert.equal(a.tagName, 'A', r.id);
    assert.equal(a.getAttribute('href'), r.href, r.id);
  }
  const mark = name.querySelector('.ow-waymark__mark');
  const pop = name.querySelector('.ow-waymark__pop');
  mark.focus();
  key(window, mark, 'ArrowDown');
  key(window, doc.activeElement, 'ArrowDown');
  assert.ok(doc.activeElement === here, 'second in the arrow order, as openersFor places it');
  // Enter and Space are the button's own (the browser presses it); the fan-out leaves them to it.
  assert.equal(key(window, here, 'Enter'), true, 'Enter not taken');
  assert.equal(key(window, here, ' '), true, 'Space not taken');
  assert.equal(pop.hidden, false);
  here.click();
  assert.equal(pop.hidden, true, 'pressing it closes the fan-out');
  assert.ok(doc.activeElement === mark, 'and focus is back on the mark');
  assert.equal(window.location.href, 'https://surface.example/w/x', 'and the page went nowhere');
});

/** The browser's connection, as the component reads it: `navigator.onLine`, set by the test. */
function connection(window, online) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}
const NC = 'Needs a connection';
const ELEMENT_ADDRESS = { form: 'human', world: WORLD.id, type: ELEMENT.type, id: ELEMENT.id };
const drawnRows = (name) => [...name.querySelectorAll('[data-opener]')].map((a) => ({
  id: a.dataset.opener,
  name: text(a.querySelector('.ow-waymark__label')),
  href: a.getAttribute('href'),
  state: text(a.querySelector('.ow-waymark__state')),
}));

test('offline at open: every web row says "Needs a connection", drawn with no href, aria-disabled and grey; a row that opens an app keeps its word', () => {
  const { window, name } = page();
  connection(window, false);
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  name.querySelector('.ow-waymark__mark').click();
  const expected = openersFor(TOOLS_ALL, 'element', ELEMENT_ADDRESS, { audience: 'member', ...SURFACE, online: false });
  assert.deepEqual(expected.map((r) => r.state), [NC, 'You are here', NC, NC, 'Opens the world']);
  // A disabled row carries no link; the href stays in openersFor's data.
  assert.deepEqual(drawnRows(name), expected.map((r) => (r.state === NC || r.state === 'You are here' ? { ...r, href: null } : r)));
  for (const id of ['onlyworlds', 'lantern', 'little-lens']) {
    const a = name.querySelector(`[data-opener="${id}"]`);
    assert.equal(a.tagName, 'A', id);
    assert.equal(a.hasAttribute('href'), false, `${id}: no href`);
    assert.equal(a.getAttribute('aria-disabled'), 'true', id);
    assert.equal(a.getAttribute('role'), 'menuitem', id);
    assert.ok(a.classList.contains('ow-waymark__row--cannot'), `${id}: grey`);
  }
  const obsidian = name.querySelector('[data-opener="obsidian"]');
  assert.equal(obsidian.getAttribute('href'), 'obsidian://open?world=0695db52-5433-7332-8000-db7fe10da375', 'an app link is no web address');
  assert.equal(obsidian.hasAttribute('aria-disabled'), false);
  assert.equal(name.querySelector('[data-opener="atlas"]').getAttribute('aria-current'), 'page', 'the surface\'s own row stays "You are here"');
  const grey = [...name.querySelectorAll('[data-opener]')].filter((a) => a.classList.contains('ow-waymark__row--cannot')).map((a) => a.dataset.opener);
  assert.deepEqual(grey, ['onlyworlds', 'lantern', 'little-lens']);
});

test('a disabled row does nothing: a click, Enter or Space leaves the fan-out open and focus on it; it is in the arrow order; Copy link still copies', async () => {
  const { window, doc, name, copied } = page();
  connection(window, false);
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  const mark = name.querySelector('.ow-waymark__mark');
  const pop = name.querySelector('.ow-waymark__pop');
  mark.focus();
  key(window, mark, 'ArrowDown');
  const site = name.querySelector('[data-opener="onlyworlds"]');
  assert.ok(doc.activeElement === site, 'the first row takes focus at open, disabled or not');
  key(window, site, 'ArrowDown');
  key(window, doc.activeElement, 'ArrowDown');
  const lantern = name.querySelector('[data-opener="lantern"]');
  assert.ok(doc.activeElement === lantern, 'the arrows pass through and land on disabled rows');
  lantern.click();
  assert.equal(pop.hidden, false, 'a click leaves it open');
  assert.ok(doc.activeElement === lantern, 'and focus where it was');
  key(window, lantern, 'Enter');
  assert.equal(pop.hidden, false, 'Enter leaves it open');
  assert.ok(doc.activeElement === lantern);
  assert.equal(key(window, lantern, ' '), false, 'Space is taken, so the page does not scroll');
  assert.equal(pop.hidden, false, 'Space leaves it open');
  assert.ok(doc.activeElement === lantern);
  await flush();
  assert.equal(pop.hidden, false, 'still open after the tick');
  assert.equal(window.location.href, 'https://surface.example/w/x', 'and the page went nowhere');
  items(name).at(-1).click();
  await flush();
  assert.deepEqual(copied, [elementAddress(ELEMENT_ADDRESS)], 'Copy link copies offline as online');
  assert.equal(text(name.querySelector('.ow-waymark__toast .ow-waymark__label')), 'Link copied');
  assert.equal(pop.hidden, true);
});

test('the connection going or coming while the fan-out is open redraws the rows in place, focus kept on the same row', async () => {
  const { window, doc, name } = page();
  let online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, lenses: LENSES, ...SURFACE });
  const surface = { audience: 'member', ...SURFACE };
  const mark = name.querySelector('.ow-waymark__mark');
  const pop = name.querySelector('.ow-waymark__pop');
  mark.click();
  key(window, doc.activeElement, 'ArrowDown');
  key(window, doc.activeElement, 'ArrowDown');
  assert.equal(doc.activeElement.dataset.opener, 'lantern');
  assert.equal(doc.activeElement.getAttribute('href'), 'https://lantern.example/#/open/0695db52-5433-7332-8000-db7fe10da375/element/0698c9de-e66f-782b-8000-bf427f5471c4');
  const order = () => items(name).map((i) => i.dataset.opener ?? text(i.querySelector('.ow-waymark__label')));
  const orderBefore = order();
  const popClass = pop.className;

  online = false;
  window.dispatchEvent(new window.Event('offline'));
  assert.deepEqual(drawnRows(name).map((r) => r.state), openersFor(TOOLS_ALL, 'element', ELEMENT_ADDRESS, { ...surface, online: false }).map((r) => r.state));
  assert.equal(doc.activeElement.dataset.opener, 'lantern', 'focus kept on the same row');
  assert.equal(doc.activeElement.getAttribute('aria-disabled'), 'true', 'the new row, disabled');
  assert.equal(doc.activeElement.hasAttribute('href'), false);
  assert.deepEqual(order(), orderBefore, 'every row in its place, Through and Copy link after them');
  assert.equal(pop.className, popClass, 'the fan-out did not move');
  assert.equal(name.querySelectorAll('[data-opener]').length, 5, 'the old rows gone');
  await flush();
  assert.equal(pop.hidden, false, 'still open');

  online = true;
  window.dispatchEvent(new window.Event('online'));
  assert.deepEqual(drawnRows(name).map((r) => r.state), openersFor(TOOLS_ALL, 'element', ELEMENT_ADDRESS, surface).map((r) => r.state));
  assert.equal(doc.activeElement.dataset.opener, 'lantern', 'focus kept again');
  assert.equal(doc.activeElement.hasAttribute('aria-disabled'), false);
  assert.ok(doc.activeElement.getAttribute('href').startsWith('https://lantern.example/'));

  // Focus off the rows (on Copy link) stays where it is.
  const copy = items(name).at(-1);
  copy.focus();
  online = false;
  window.dispatchEvent(new window.Event('offline'));
  assert.ok(doc.activeElement === copy, 'focus on Copy link is not moved');
  assert.equal(text(name.querySelector('[data-opener="lantern"] .ow-waymark__state')), NC);
  await flush();
  assert.equal(pop.hidden, false);
});

test('a closed fan-out does not listen for the connection; reopening reads it anew; no navigator reads as online', () => {
  const { window, name } = page();
  let online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  // The window's own listeners for the two events, counted.
  const live = { online: 0, offline: 0 };
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, fn, opts) => { if (type in live) live[type] += 1; return add(type, fn, opts); };
  window.removeEventListener = (type, fn, opts) => { if (type in live) live[type] -= 1; return remove(type, fn, opts); };
  const connectionListeners = () => Object.entries(live).filter(([, v]) => v !== 0);
  const dispose = mountWaymark(name, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  const mark = name.querySelector('.ow-waymark__mark');
  const state = (id) => text(name.querySelector(`[data-opener="${id}"] .ow-waymark__state`));
  assert.deepEqual(connectionListeners(), [], 'none while closed');
  mark.click();
  assert.deepEqual(connectionListeners(), [['online', 1], ['offline', 1]], 'both while open');
  mark.click();
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, true);
  assert.deepEqual(connectionListeners(), [], 'none once closed');
  online = false;
  window.dispatchEvent(new window.Event('offline'));
  assert.equal(state('lantern'), 'Sign in to Lantern first', 'closed: no redraw');
  mark.click();
  assert.equal(state('lantern'), NC, 'reopened: read anew');
  assert.equal(state('onlyworlds'), NC);
  mark.click();
  online = true;
  mark.click();
  assert.equal(state('lantern'), 'Sign in to Lantern first');
  assert.equal(state('onlyworlds'), null);
  mark.click();
  assert.deepEqual(connectionListeners(), []);
  mark.click();
  dispose();
  assert.deepEqual(connectionListeners(), [], 'the disposer removes them while open');
  // A window with no navigator: online.
  const { window: bare, name: name2 } = page();
  Object.defineProperty(bare, 'navigator', { configurable: true, value: undefined });
  mountWaymark(name2, { world: WORLD, element: ELEMENT, reader: 'member', tools: TOOLS_ALL, ...SURFACE });
  name2.querySelector('.ow-waymark__mark').click();
  assert.equal(text(name2.querySelector('[data-opener="onlyworlds"] .ow-waymark__state')), null);
  assert.equal(name2.querySelector('[data-opener="onlyworlds"]').getAttribute('href'), elementAddress(ELEMENT_ADDRESS));
});

test('the stylesheet: every colour is declared once under its ground and key, and nothing else names a colour', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/waymark.css', import.meta.url)), 'utf8');
  assert.equal(css, readFileSync(fileURLToPath(new URL('../src/waymark/waymark.css', import.meta.url)), 'utf8'), 'shipped byte for byte');
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = [...body.matchAll(/--ow-waymark-(dark|paper)-([a-z-]+):\s*(#[0-9a-f]{6});/g)];
  const keys = ['page', 'bg', 'popover', 'ink', 'text', 'muted', 'line', 'hover-tile', 'open-tile'];
  for (const ground of ['dark', 'paper']) {
    assert.deepEqual(declared.filter((m) => m[1] === ground).map((m) => m[2]), keys, `${ground}: each key once, in the file's order`);
  }
  assert.equal([...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length, declared.length, 'no colour outside the declarations');
  assert.doesNotMatch(body, /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(|(?<![\w-])(transparent|white|black|currentcolor)(?![\w-])/i, 'no other colour form');
  assert.match(body, /@media \(max-width: 480px\) \{[\s\S]*?\.ow-waymark__pop \{[^}]*position: fixed;[^}]*bottom: 0;/, 'a sheet from the bottom at 480 px and below');
});

test('the core stays DOM-free: its bundle never reaches the component, and src outside src/waymark touches no page', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const seen = new Set();
  const reach = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(dist + file, 'utf8');
    for (const m of code.matchAll(/from\s+["']\.\/([^"']+)["']/g)) reach(m[1]);
  };
  reach('index.js');
  assert.ok(!seen.has('waymark.js'), 'index.js does not import the component');
  for (const file of seen) {
    const code = readFileSync(dist + file, 'utf8');
    assert.doesNotMatch(code, /mountWaymark|ow-waymark|addEventListener|createElementNS|ownerDocument|querySelector/, `${file}: no component code`);
  }
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = readdirSync(src, { recursive: true }).map((f) => f.replace(/\\/g, '/')).filter((f) => f.endsWith('.ts') && !f.startsWith('waymark/'));
  for (const f of files) {
    const code = readFileSync(src + f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /from ['"][./]*waymark/, `${f}: imports nothing from src/waymark`);
    // photo.ts reaches for a canvas through globalThis when there is one (preparePhoto, in a browser): the one page the core touches.
    if (f === 'photo.ts') continue;
    assert.doesNotMatch(code, /\b(document|window)\s*[.[]|globalThis\.(document|window)/, `${f}: no document or window`);
  }
});

test('the mark\'s globe is 0.6em, never under 16px; its tap area stays 44px', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/waymark.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `no rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  const glyph = rule('.ow-waymark__mark .ow-waymark__glyph');
  assert.match(glyph, /\bwidth: max\(16px, 0\.6em\);/);
  assert.match(glyph, /\bheight: max\(16px, 0\.6em\);/);
  const tap = rule('.ow-waymark__mark::before');
  assert.match(tap, /\bwidth: max\(44px, 100%\);/);
  assert.match(tap, /\bheight: max\(44px, 100%\);/);
});
