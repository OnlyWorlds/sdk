// The Waymark's fan-out: what the OnlyWorlds mark beside a world's or an element's name opens. The rows
// are the core's, never decided here: openersFor gives the Open with rows and each one's word, doorsOf
// and doorWhere the member's last door, elementAddress the link Copy link copies. This module only draws
// them, so it is the one part of the package that touches the DOM, and it ships at its own subpath
// (`@onlyworlds/sdk/waymark`, with `@onlyworlds/sdk/waymark.css`); the core never imports it.
//
// No inline style anywhere: surfaces run `style-src 'self'`, so every node is built with classes and
// the stylesheet does the rest. A plain mount function and a disposer, not a custom element.

import { elementAddress } from '../address';
import { doorsOf, doorWhere } from '../doors';
import { openersFor, type OwOpener, type OwOpenerState, type OwTool } from '../openers';
import { refuseUnknownOptions } from '../options';
import { typeWord } from '../names';
import { TOOLS } from '../tools.generated';
import { CHEVRON_GLYPH, COPY_GLYPH, LENS_GLYPH, MARK_PATH, TOOL_GLYPH, type Glyph } from './glyphs';

/** Who reads the fan-out: a member of the world, a guest (a seat in it, a member too), or the public (signed out). */
export type OwWaymarkReader = 'member' | 'guest' | 'public';

/** How a person reaches the fan-out: `mark`, the OnlyWorlds mark beside the name, a button; `menu`, an "Open with" entry the surface puts in its own "..." menu, and no mark; `both`, the mark and the entry. */
export type OwWaymarkEntry = 'mark' | 'menu' | 'both';

/** One lens the reader may read the element through: its id (an element id, as the address takes it) and its name. */
export interface OwWaymarkLens {
  id: string;
  name: string;
}

/** What `mountWaymark` takes. Only `world` and `reader` are required. */
export interface OwWaymarkOptions {
  /** The world: its id and name, as `GET /world` or a folder's `world.json` gives them (its `x_names`, when there, words the type). */
  world: { id: string; name: string; [k: string]: unknown };
  /** The element, as the API serves it (`id`, `type`, `name`; a member's body carries `doors`); absent, the fan-out is the world's own. */
  element?: { id: string; type: string; name: string; [k: string]: unknown } | null;
  /** `member`, `guest` or `public`. The public face shows the name line without the last door, the rows that need nothing first, and Copy link. */
  reader: OwWaymarkReader;
  /** The client name of the surface's own tool; its row says "You are here". */
  tool?: string | null;
  /** Whether the reader is signed in; null when the surface cannot know, and then no row says so. */
  signedIn?: boolean | null;
  /** False in a desktop app, which cannot see the browser's sign-in. Default true. */
  browser?: boolean;
  /** True on a phone. Default false. */
  phone?: boolean;
  /** The tools list's rows. Default `TOOLS`, the list baked into this release. */
  tools?: readonly OwTool[];
  /** The lenses the surface offers, for the Through row; absent or empty, no Through row. Never shown to the public. */
  lenses?: readonly OwWaymarkLens[] | null;
  /** The ground the fan-out sits on: `dark` (the brand cyan mark) or `paper` (the mark in a dark ink). Default `dark`. */
  ground?: 'dark' | 'paper';
  /** The way in: `mark`, `menu` or `both`. Default `mark`. */
  entry?: OwWaymarkEntry;
  /** With `menu` or `both`: the surface's own visible element (its "..." button) that takes focus when the fan-out, opened from the entry, closes by Escape; absent, the entry takes it. Refused with `mark`. */
  returnFocus?: HTMLElement | null;
}

/** The disposer `mountWaymark` returns: call it to remove every node, listener and timer the fan-out added. */
export interface OwWaymark {
  (): void;
  /** With `entry: 'menu'` or `'both'`, the "Open with" button for the surface to put in its own "..." menu (it opens the fan-out); with `mark`, null. */
  readonly entry: HTMLButtonElement | null;
}

const OPTION_KEYS: readonly string[] = [
  'world', 'element', 'reader', 'tool', 'signedIn', 'browser', 'phone', 'tools', 'lenses', 'ground', 'entry',
  'returnFocus',
];
const READERS: readonly unknown[] = ['member', 'guest', 'public'];
const GROUNDS: readonly unknown[] = ['dark', 'paper'];
const ENTRIES: readonly unknown[] = ['mark', 'menu', 'both'];
const SVG = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TOAST_MS = 2000;
const COPIED = 'Link copied';
const NOT_COPIED = 'Could not copy the link.';
let mounted = 0;

const fail = (what: string): never => {
  throw new TypeError(`mountWaymark: ${what}`);
};

/** A state word that says the row cannot open now: drawn grey. The rest open (here, in the browser, at the world) and keep the text colour. */
function cannotOpen(state: OwOpenerState | null): boolean {
  return state !== null && (state.startsWith('Sign in to ') || state === 'Needs the world on this phone');
}

/** "12 Oct", with the year when it is not this year's, in the reader's own time zone. */
function shapedOn(at: string, now: Date): string {
  const d = new Date(at);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/**
 * Draw the Waymark into `target`, the element that holds a world's or an element's name: the OnlyWorlds
 * mark at its end (`entry: 'mark'`), or nothing visible there and an "Open with" entry for the surface's
 * own menu (`entry: 'menu'`), or both (`entry: 'both'`), each opening the same fan-out: the name line
 * (and, for a member or guest, "Last shaped in Atlas, 12 Oct" from `doorsOf` and `doorWhere`), the Open
 * with rows `openersFor` gives, each with its word, the Through row when the surface offers lenses, and
 * Copy link last, which copies the site's address with the world's id (`elementAddress`) and says "Link
 * copied" and closes; with no clipboard, or the copy refused, the fan-out stays open and the toast says
 * "Could not copy the link." over the address, selected in a read-only line to copy by hand, until the
 * fan-out closes. Focus moving out of the fan-out closes it and stays where it was moved.
 *
 * Keyboard: the mark is a button and the fan-out a menu; Tab goes from the mark through the rows in
 * order, the arrow keys, Home and End move within it, Escape closes it and returns focus to what opened
 * it: the mark, or for the entry `returnFocus` when given (the surface's "..." button, which stays
 * visible when its menu closes), else the entry. A click outside closes it. At 390 px wide and below the stylesheet draws it as a sheet
 * from the bottom. The page must load `@onlyworlds/sdk/waymark.css`; no node carries a style attribute.
 *
 * Refuses, before anything is drawn, an unknown option key by name and a value of the wrong kind (a
 * TypeError), and an address `elementAddress` refuses (an `OwAddressError`: a world id that is not an
 * id, an unknown type, an element or lens id that is not a UUID). Returns the disposer.
 */
export function mountWaymark(target: Element, options: OwWaymarkOptions): OwWaymark {
  if (target === null || typeof target !== 'object' || typeof (target as Element).appendChild !== 'function' || !(target as Element).ownerDocument) {
    fail('target is the DOM element that holds the name');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('options is an object ({ world, reader, ... })');
  refuseUnknownOptions('mountWaymark', options, OPTION_KEYS);
  const {
    world, element = null, reader, tool = null, signedIn = null, browser = true, phone = false,
    tools = TOOLS, lenses = null, ground = 'dark', entry = 'mark', returnFocus = null,
  } = options;
  if (world === null || typeof world !== 'object' || typeof world.id !== 'string' || typeof world.name !== 'string') {
    fail('world is an object with a string id and name');
  }
  if (element !== null && (typeof element !== 'object' || typeof element.id !== 'string' || typeof element.type !== 'string' || typeof element.name !== 'string')) {
    fail('element is null or an element body with a string id, type and name');
  }
  if (!READERS.includes(reader)) fail(`reader is 'member', 'guest' or 'public'; got ${JSON.stringify(reader)}`);
  if (!GROUNDS.includes(ground)) fail(`ground is 'dark' or 'paper'; got ${JSON.stringify(ground)}`);
  if (!ENTRIES.includes(entry)) fail(`entry is 'mark', 'menu' or 'both'; got ${JSON.stringify(entry)}`);
  if (returnFocus !== null) {
    if (entry === 'mark') fail("returnFocus is for entry 'menu' or 'both': with the mark alone, focus returns to the mark");
    const View = target.ownerDocument.defaultView?.HTMLElement;
    const isElement = View ? returnFocus instanceof View : typeof returnFocus === 'object' && (returnFocus as Node).nodeType === 1;
    if (!isElement) fail("returnFocus is an HTMLElement: the surface's own button that takes focus back");
  }
  if (lenses !== null && !Array.isArray(lenses)) fail('lenses is an array of { id, name } or null');
  for (const l of lenses ?? []) {
    if (l === null || typeof l !== 'object' || typeof l.id !== 'string' || typeof l.name !== 'string') fail('each lens is { id, name }, both strings');
  }

  // Every word and link is read before a node is made, so a refusal draws nothing.
  const isPublic = reader === 'public';
  const kind = element === null ? 'world' : 'element';
  const address = element === null
    ? { form: 'human' as const, world: world.id }
    : { form: 'human' as const, world: world.id, type: element.type, id: element.id };
  const rows: OwOpener[] = openersFor(tools, kind, address, { tool, audience: isPublic ? 'public' : 'member', signedIn, browser, phone });
  const throughLenses = isPublic ? [] : [...(lenses ?? [])];
  const linkFor = (lens: string | null): string => elementAddress({ ...address, lens });
  for (const l of throughLenses) linkFor(l.id);
  const doc = target.ownerDocument;
  const win = doc.defaultView;
  const timers = win ?? globalThis;
  const last = !isPublic && element !== null ? doorsOf(element, tools)[0] : undefined;
  const doorLine = last === undefined ? null : `Last shaped ${doorWhere(last)}, ${shapedOn(last.at, new Date())}`;
  const typeLine = element === null ? null : typeWord(world, element.type) ?? element.type.charAt(0).toUpperCase() + element.type.slice(1);

  const n = ++mounted;
  const listeners: [EventTarget, string, EventListener, boolean][] = [];
  const openListeners: [EventTarget, string, EventListener, boolean][] = [];
  const on = (list: typeof listeners, t: EventTarget, type: string, fn: EventListener, capture = false): void => {
    t.addEventListener(type, fn, capture);
    list.push([t, type, fn, capture]);
  };
  const offAll = (list: typeof listeners): void => {
    for (const [t, type, fn, capture] of list.splice(0)) t.removeEventListener(type, fn, capture);
  };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const markSvg = (cls: string): SVGSVGElement => {
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS(SVG, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', MARK_PATH);
    svg.appendChild(path);
    return svg;
  };
  const glyph = (shapes: Glyph, cls: string): SVGSVGElement => {
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attrs] of shapes) {
      const shape = doc.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
      svg.appendChild(shape);
    }
    return svg;
  };

  // The wrapper anchors the fan-out at the end of the name, for both ways in.
  const root = el('span', `ow-waymark ow-waymark--${ground}`);
  const menuId = `ow-waymark-${n}-menu`;
  const nameId = `ow-waymark-${n}-name`;

  let mark: HTMLButtonElement | null = null;
  if (entry !== 'menu') {
    mark = el('button', 'ow-waymark__mark');
    mark.type = 'button';
    mark.setAttribute('aria-label', 'Open with');
    mark.setAttribute('aria-haspopup', 'menu');
    mark.setAttribute('aria-expanded', 'false');
    mark.setAttribute('aria-controls', menuId);
    mark.appendChild(markSvg('ow-waymark__glyph'));
    root.appendChild(mark);
  }
  const menuEntry: HTMLButtonElement | null = entry !== 'mark' ? el('button', 'ow-waymark-entry', 'Open with') : null;
  if (menuEntry !== null) {
    menuEntry.type = 'button';
    menuEntry.setAttribute('aria-haspopup', 'menu');
    menuEntry.setAttribute('aria-expanded', 'false');
    menuEntry.setAttribute('aria-controls', menuId);
  }
  const openers = [mark, menuEntry].filter((b): b is HTMLButtonElement => b !== null);
  // The one that opened the fan-out, and where focus goes back when it closes.
  let openedBy: HTMLButtonElement = openers[0];
  const focusBack = (): HTMLElement => (openedBy === menuEntry ? returnFocus ?? menuEntry : openedBy);

  const scrim = el('div', 'ow-waymark__scrim');
  scrim.hidden = true;
  root.appendChild(scrim);
  const pop = el('div', 'ow-waymark__pop');
  pop.hidden = true;
  root.appendChild(pop);
  pop.appendChild(el('div', 'ow-waymark__grab'));

  // 1. The name line.
  const head = el('div', 'ow-waymark__head');
  const tile = el('span', 'ow-waymark__tile');
  tile.appendChild(markSvg('ow-waymark__glyph'));
  head.appendChild(tile);
  const names = el('div', 'ow-waymark__names');
  const name = el('div', 'ow-waymark__name', element === null ? world.name : element.name);
  name.id = nameId;
  names.appendChild(name);
  if (typeLine !== null) {
    const sub = el('div', 'ow-waymark__sub');
    sub.appendChild(el('span', 'ow-waymark__type', typeLine));
    sub.appendChild(el('span', 'ow-waymark__world', `in ${world.name}`));
    names.appendChild(sub);
  }
  head.appendChild(names);
  pop.appendChild(head);
  if (doorLine !== null) pop.appendChild(el('div', 'ow-waymark__door', doorLine));

  const menu = el('div', 'ow-waymark__menu');
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', nameId);
  pop.appendChild(menu);

  const section = (label: string): HTMLDivElement => {
    const group = el('div', 'ow-waymark__group');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const heading = el('div', 'ow-waymark__sec', label);
    heading.setAttribute('aria-hidden', 'true');
    group.appendChild(heading);
    menu.appendChild(group);
    return group;
  };

  // 2. Open with: the rows as openersFor gives them, each with its word.
  const openWith = section('Open with');
  for (const r of rows) {
    const a = el('a', `ow-waymark__row${cannotOpen(r.state) ? ' ow-waymark__row--cannot' : ''}`);
    a.href = r.href;
    a.setAttribute('role', 'menuitem');
    a.dataset.opener = r.id;
    a.appendChild(r.id === 'onlyworlds' ? markSvg('ow-waymark__icon') : glyph(TOOL_GLYPH, 'ow-waymark__icon'));
    a.appendChild(el('span', 'ow-waymark__label', r.name));
    if (r.state !== null) a.appendChild(el('span', 'ow-waymark__state', r.state));
    openWith.appendChild(a);
  }

  // 3. Through: a lens, when the surface offers any (no moment without a time bar).
  let chosenLens: string | null = null;
  let lensToggle: HTMLButtonElement | null = null;
  let lensList: HTMLDivElement | null = null;
  let lensValue: HTMLSpanElement | null = null;
  if (throughLenses.length > 0) {
    const through = section('Through');
    lensToggle = el('button', 'ow-waymark__row');
    lensToggle.type = 'button';
    lensToggle.setAttribute('role', 'menuitem');
    lensToggle.setAttribute('aria-haspopup', 'true');
    lensToggle.setAttribute('aria-expanded', 'false');
    lensToggle.appendChild(glyph(LENS_GLYPH, 'ow-waymark__icon ow-waymark__icon--small'));
    lensToggle.appendChild(el('span', 'ow-waymark__label', 'In a lens'));
    lensValue = el('span', 'ow-waymark__state');
    lensToggle.appendChild(lensValue);
    lensToggle.appendChild(glyph(CHEVRON_GLYPH, 'ow-waymark__chevron'));
    through.appendChild(lensToggle);
    lensList = el('div', 'ow-waymark__lenses');
    lensList.setAttribute('role', 'group');
    lensList.setAttribute('aria-label', 'In a lens');
    lensList.hidden = true;
    for (const l of throughLenses) {
      const b = el('button', 'ow-waymark__row ow-waymark__row--lens', l.name);
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.lens = l.id;
      lensList.appendChild(b);
    }
    through.appendChild(lensList);
  }

  // 4. Copy link, last, after a line.
  const sep = el('div', 'ow-waymark__sep');
  sep.setAttribute('role', 'separator');
  menu.appendChild(sep);
  const copy = el('button', 'ow-waymark__row');
  copy.type = 'button';
  copy.setAttribute('role', 'menuitem');
  copy.appendChild(glyph(COPY_GLYPH, 'ow-waymark__icon ow-waymark__icon--small'));
  copy.appendChild(el('span', 'ow-waymark__label', 'Copy link'));
  menu.appendChild(copy);

  const toast = el('div', 'ow-waymark__toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  const toastLine = el('span', 'ow-waymark__toast-line');
  toastLine.appendChild(glyph(COPY_GLYPH, 'ow-waymark__icon ow-waymark__icon--small'));
  const toastWords = el('span', 'ow-waymark__label', COPIED);
  toastWords.id = `ow-waymark-${n}-toast`;
  toastLine.appendChild(toastWords);
  toast.appendChild(toastLine);
  // After a failed copy: the address, read-only, to select and copy by hand.
  const addressLine = el('input', 'ow-waymark__address');
  addressLine.type = 'text';
  addressLine.readOnly = true;
  addressLine.setAttribute('aria-labelledby', toastWords.id);
  addressLine.hidden = true;
  toast.appendChild(addressLine);
  root.appendChild(toast);

  // Behaviour.
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const items = (): HTMLElement[] =>
    Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')).filter((i) => !i.closest('[hidden]'));
  const isOpen = (): boolean => !pop.hidden;

  const open = (from: HTMLButtonElement, focus: 'first' | 'last'): void => {
    if (isOpen()) return;
    openedBy = from;
    pop.hidden = false;
    scrim.hidden = false;
    from.setAttribute('aria-expanded', 'true');
    on(openListeners, doc, 'pointerdown', onOutside as EventListener, true);
    const list = items();
    (focus === 'first' ? list[0] : list[list.length - 1])?.focus();
  };
  const failed = (): boolean => !addressLine.hidden;
  const close = (refocus: boolean): void => {
    if (!isOpen()) return;
    pop.hidden = true;
    scrim.hidden = true;
    openedBy.setAttribute('aria-expanded', 'false');
    offAll(openListeners);
    // The failed copy's toast lives as long as the fan-out.
    if (failed()) {
      toast.hidden = true;
      addressLine.hidden = true;
      toast.classList.remove('ow-waymark__toast--failed');
    }
    if (refocus) focusBack().focus();
  };
  const copied = (): void => {
    toastWords.textContent = COPIED;
    toast.hidden = false;
    if (toastTimer !== null) timers.clearTimeout(toastTimer);
    toastTimer = timers.setTimeout(() => {
      toastTimer = null;
      toast.hidden = true;
    }, TOAST_MS);
  };
  // The fan-out stays open, and the toast with it, holding the address selected for a copy by hand.
  const notCopied = (text: string): void => {
    if (toastTimer !== null) timers.clearTimeout(toastTimer);
    toastTimer = null;
    toastWords.textContent = NOT_COPIED;
    addressLine.value = text;
    addressLine.hidden = false;
    toast.classList.add('ow-waymark__toast--failed');
    toast.hidden = false;
    addressLine.focus();
    addressLine.select();
  };

  function onOutside(e: Event): void {
    const t = e.target as Node | null;
    if (t !== null && (root.contains(t) || menuEntry?.contains(t))) return;
    close(false);
  }
  // A press on the button that opened the fan-out moves focus out of it, which closes it (onFocusOut)
  // before the click lands: the click then must not open it again.
  let openAtPress = false;
  const onOpenerPress = (): void => {
    openAtPress = isOpen();
  };
  const onOpenerClick = (e: Event): void => {
    const wasOpen = openAtPress || isOpen();
    openAtPress = false;
    if (wasOpen) close(false);
    else open(e.currentTarget as HTMLButtonElement, 'first');
  };
  const onOpenerKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(e.currentTarget as HTMLButtonElement, e.key === 'ArrowDown' ? 'first' : 'last');
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close(true);
    }
  };
  const onMenuKey = (e: KeyboardEvent): void => {
    const list = items();
    const at = list.indexOf(doc.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowDown') next = list[(at + 1) % list.length];
    else if (e.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    } else if (e.key === ' ' && (e.target as HTMLElement).tagName === 'A') {
      e.preventDefault();
      (e.target as HTMLElement).click();
      return;
    } else return;
    e.preventDefault();
    next?.focus();
  };
  const onMenuClick = (e: Event): void => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('.ow-waymark__row');
    if (row === null) return;
    if (row === lensToggle) {
      const show = lensList!.hidden;
      lensList!.hidden = !show;
      lensToggle.setAttribute('aria-expanded', String(show));
    } else if (row.dataset.lens !== undefined) {
      chosenLens = chosenLens === row.dataset.lens ? null : row.dataset.lens;
      for (const b of Array.from(lensList!.children) as HTMLElement[]) b.setAttribute('aria-checked', String(b.dataset.lens === chosenLens));
      lensValue!.textContent = throughLenses.find((l) => l.id === chosenLens)?.name ?? '';
    } else if (row === copy) {
      const text = linkFor(chosenLens);
      const clipboard = timers.navigator?.clipboard;
      if (!clipboard) notCopied(text);
      else {
        clipboard.writeText(text).then(
          () => {
            if (disposed) return;
            close(true);
            copied();
          },
          () => {
            if (!disposed && isOpen()) notCopied(text);
          },
        );
      }
    } else {
      close(false);
    }
  };
  // Focus moved out of the fan-out (Tab off the last row, Shift+Tab off the first, a click elsewhere):
  // it closes, and focus stays where the person put it.
  const onFocusOut = (e: FocusEvent): void => {
    const to = e.relatedTarget as Node | null;
    if (to !== null && !pop.contains(to) && !toast.contains(to)) close(false);
  };

  for (const b of openers) {
    on(listeners, b, 'pointerdown', onOpenerPress as EventListener);
    on(listeners, b, 'click', onOpenerClick as EventListener);
    on(listeners, b, 'keydown', onOpenerKey as EventListener);
  }
  on(listeners, pop, 'keydown', onMenuKey as EventListener);
  on(listeners, toast, 'keydown', ((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  }) as EventListener);
  on(listeners, menu, 'click', onMenuClick as EventListener);
  on(listeners, scrim, 'click', (() => close(true)) as EventListener);
  on(listeners, root, 'focusout', onFocusOut as EventListener);

  target.appendChild(root);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    offAll(openListeners);
    offAll(listeners);
    if (toastTimer !== null) timers.clearTimeout(toastTimer);
    toastTimer = null;
    root.remove();
    menuEntry?.remove();
  };
  return Object.defineProperty(dispose, 'entry', { value: menuEntry, enumerable: true }) as OwWaymark;
}
