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
  doc.body.innerHTML = '<main><h1 class="name">Governor Threadsworth</h1><div class="more" role="menu"></div><button class="elsewhere">Elsewhere</button></main>';
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
  assert.deepEqual(drawn, expected);
  assert.deepEqual(expected.map((r) => r.state), [null, 'You are here', 'Sign in to Lantern first', 'Needs the world on this phone', 'Opens the world']);
  const grey = [...name.querySelectorAll('[data-opener]')].filter((a) => a.classList.contains('ow-waymark__row--cannot')).map((a) => a.dataset.opener);
  assert.deepEqual(grey, ['lantern', 'little-lens'], 'grey means cannot open: not "You are here", not "Opens the world"');
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
  assert.equal(doc.activeElement, items(name)[0]);
  key(window, doc.activeElement, 'Escape');
  assert.equal(pop.hidden, true);
  assert.equal(doc.activeElement, entry, 'focus back on the entry');
  waymark();
  assert.equal(more.children.length, 0, 'the disposer takes the entry out of the surface\'s menu too');
  const { name: name2 } = page();
  assert.equal(mountWaymark(name2, { world: WORLD, element: ELEMENT, reader: 'member' }).entry, null, 'the mark arm has no entry');
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
  assert.equal(doc.activeElement, list[0]);
  // Tab order: what the page reaches in document order, the menu open.
  const tabbable = [...name.querySelectorAll('a[href], button')].filter((n) => !n.closest('[hidden]') && n.tabIndex >= 0);
  assert.deepEqual(tabbable, [mark, ...list], 'the mark, then every row in order');
  key(window, doc.activeElement, 'ArrowDown');
  assert.equal(doc.activeElement, list[1]);
  key(window, doc.activeElement, 'ArrowUp');
  key(window, doc.activeElement, 'ArrowUp');
  assert.equal(doc.activeElement, list[list.length - 1], 'ArrowUp from the first wraps to the last');
  key(window, doc.activeElement, 'Home');
  assert.equal(doc.activeElement, list[0]);
  key(window, doc.activeElement, 'End');
  assert.equal(text(doc.activeElement.querySelector('.ow-waymark__label')), 'Copy link');
  key(window, doc.activeElement, 'Escape');
  assert.equal(name.querySelector('.ow-waymark__pop').hidden, true);
  assert.equal(mark.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, mark, 'focus back on the mark');
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

test('no element the component makes carries a style attribute, in any face, arm or state', async () => {
  for (const reader of ['member', 'guest', 'public']) {
    for (const entry of ['mark', 'menu']) {
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
  for (const entry of ['mark', 'menu']) {
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
  assert.match(body, /@media \(max-width: 390px\) \{[\s\S]*?\.ow-waymark__pop \{[^}]*position: fixed;[^}]*bottom: 0;/, 'a sheet from the bottom at 390 px and below');
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
