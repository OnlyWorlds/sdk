// The Open with menu: the rows that open a world, or one element of it, in a tool, in order, each with
// the word it says when it cannot open now. Pure and DOM-free: a menu draws these rows and decides no
// word of its own, and a game, the Python package's openers_for and a test read the same rows. The rows
// come from the OnlyWorlds tools list (github.com/OnlyWorlds/tools, tools.json format 1, its README's
// "Open with"), baked into the package as TOOLS (tools.generated.ts). The shared fixture,
// test/fixtures/openers.fixture.json, is this file's own test, and openers_for answers every case the
// same way.

import { ADDRESS_KEYS, elementAddress, type OwAddress, type OwAddressReading } from './address';
import { ELEMENT_MARKS, marksOf, type OwElementMark } from './marks';
import { ELEMENT_TYPES, STANDARD_TYPE_ORDER } from './v2/types.generated';
import { refuseUnknownOptions } from './options';

export type { OwElementMark } from './marks';

/** What `openersFor` takes beside the surface. */
export interface OwOpenersOptions {
  /** The element the menu is for, as the surface was served it (the API's body, the mark flat on it): a row whose door skips what it carries is not there. Absent or null: every row, as before 4.126.0. */
  element?: Record<string, unknown> | null;
}

const OPTION_KEYS: readonly string[] = ['element'];

/** What a person must have before a tool's link works: signed in to the tool (`account`), or the world already in the tool on this device (`device`). */
export type OwToolNeeds = 'account' | 'device';

/** A tool's `open` in the tools list: its link templates and what they need first. */
export interface OwToolOpen {
  /** The link that opens a world, holding `{world}` (the world's id); null without one. */
  world: string | null;
  /** The link that opens one element, holding `{id}` and, if it needs them, `{world}` and `{type}` (the type word); null without one. */
  element: string | null;
  /** What the person needs first; null for nothing. A public page offers those rows, and an `account` row only as one that opens nothing ("Needs an account"). */
  needs: OwToolNeeds | null;
  /** What the element door does not open, in the graph section's words; [] or absent: it opens every element (a list older than the key has none). */
  element_skips?: readonly OwElementMark[];
  /** The element types the element door opens, as type words (`character`); null or absent: every type (a list older than the key has none). */
  element_types?: readonly string[] | null;
  /** True when the links open a public world for someone not signed in, though `needs` is `account` for a private one: a public page offers the row live. Only beside `needs: 'account'`; absent or false: as `needs` says. */
  opens_public?: boolean;
}

/** The keys of one tools list row that `openersFor` reads; a row straight from `tools.json` carries more, and they are ignored. */
export interface OwTool {
  /** The list's id for the tool, the row's `id` in the menu. */
  id: string;
  name: string;
  url: string;
  /** The tool's client name (`X-OW-Client`), which a surface names itself by; null without one. */
  client: string | null;
  /** `listed` rows are offered; `built` and `delisted` rows never are. */
  rung: 'built' | 'listed' | 'delisted';
  /** How a link opens a world or an element in the tool; null: never offered. */
  open: OwToolOpen | null;
}

/** What the menu opens: a world, or one element of it. */
export type OwOpenerKind = 'world' | 'element';

/** What the surface drawing the menu knows of itself and its reader. The function guesses none of it. */
export interface OwOpenerSurface {
  /** The client name of the surface's own tool, when it is a listed tool; its row says "You are here". `onlyworlds` is the site itself: the site's own row says it. */
  tool?: string | null;
  /** `member` (a seat in the world, a guest included) or `public` (the signed-out reader). Required. */
  audience: 'member' | 'public';
  /** Whether the reader is signed in; null or absent when the surface cannot know, and then no row says so. */
  signedIn?: boolean | null;
  /** False in a desktop app, which cannot see the browser's sign-in. Default true. */
  browser?: boolean;
  /** True on a phone. Default false. */
  phone?: boolean;
  /** False when the device has no connection; then every row whose link is a web address says "Needs a connection". Default true. */
  online?: boolean;
}

/** The word a row says when it cannot open now, or says where it lands. Sentence case, exactly. */
export type OwOpenerState =
  | 'You are here'
  | 'Needs a connection'
  | 'Needs an account'
  | `Sign in to ${string} first`
  | 'Opens in your browser'
  | 'Needs the world on this phone'
  | 'Opens the world';

/** One row of the menu. */
export interface OwOpener {
  /** `onlyworlds` for the site's own row, else the tool's id in the list. */
  id: string;
  /** `onlyworlds.com`, or the tool's name. */
  name: string;
  href: string;
  /** Null when the row opens now and says nothing. */
  state: OwOpenerState | null;
}

const SURFACE_KEYS: readonly string[] = ['tool', 'audience', 'signedIn', 'browser', 'phone', 'online'];
const NEEDS: readonly unknown[] = ['account', 'device', null];
const PLACEHOLDER = /\{(world|type|id)\}/g;
/** A web address: its scheme is http or https. Read from the row's filled href. */
const WEB = /^https?:/i;
const OFFLINE: OwOpenerState = 'Needs a connection';
const NO_ACCOUNT: OwOpenerState = 'Needs an account';

const fail = (what: string): never => {
  throw new TypeError(`openersFor: ${what}`);
};

/** Schemes that open no app: a row whose link used one would run what it carries when pressed. */
const NO_APP = ['javascript', 'data', 'vbscript', 'file', 'blob', 'about'];
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

/**
 * A template string or null; undefined reads as null. A template begins with its scheme (a browser drops
 * leading spaces before reading one), and a scheme that opens no app is refused, in any case.
 */
function templateOf(row: string, key: 'world' | 'element', v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(`tool ${row}: open.${key} is a link template or null`);
  const scheme = SCHEME.exec(v as string)?.[1].toLowerCase();
  if (scheme === undefined) fail(`tool ${row}: open.${key} begins with its scheme`);
  if (NO_APP.includes(scheme as string)) fail(`tool ${row}: open.${key} is a ${scheme}: link, which opens no app`);
  return v as string;
}

/**
 * The rows of the Open with menu for a world (`kind: 'world'`) or one element of it (`'element'`), in
 * order: first the site's own row (id `onlyworlds`, name `onlyworlds.com`, the world's or the element's
 * page on www.onlyworlds.com, for every audience, its one word "You are here" when `surface.tool` is
 * `onlyworlds` (the site itself), else "Needs a connection" when offline), then
 * one row per `tools` row, in the list's order, that is `listed` and has a door for this kind. `tools`
 * is the tools list's rows, `TOOLS` or the list as served; `address` is a reading from `parseOwLink` or
 * what `elementAddress` takes, with the world's id. A lens and a moment on it ride on no href.
 *
 * A row with `open: null`, or with no door for this kind, is not there. On an element, a tool with only
 * a world door is a row to its world door that says "Opens the world". On an element given as
 * `options.element`, a row whose `open.element_skips` names a mark the element carries (room, hidden,
 * proposed, map space, a reading aid, each read as `worldGraph` reads it) is not there: its door cannot
 * open it. A world door alone opens the world, so it stays. On an element's menu, a row whose
 * `open.element_types` is a list that does not hold the address's type word is not there either, world
 * door or not: the tool opens other kinds of element (read from the address, so no element body is needed;
 * a world's menu reads no element types). For the `public` audience (the signed-out
 * reader) a row whose `open.needs` is `device` is not there, since a visitor's device holds no world of
 * this one's, and a row whose `needs` is `account` is there and says it needs one, unless its
 * `open.opens_public` is true: its links open a public world with nothing signed in, so on a public page
 * it needs nothing and reads as a live row. Anywhere else the row reads as its `needs` says.
 *
 * Each row's `state`, the first that holds: "You are here" for the surface's own tool (its `client` is
 * `surface.tool`); then, when `surface.online` is false, "Needs a connection" for a row whose href is a
 * web address (scheme `http:` or `https:`; a row whose link opens an app on the device is unaffected,
 * and the href stays in the row either way); then, for the `public` audience, "Needs an account" for a
 * row whose `needs` is `account`, whatever `signedIn` says (the href stays in the row; a surface draws
 * it as a row that opens nothing); then what `needs` asks of this surface: `account` outside
 * a browser "Opens in your browser", in a browser signed out "Sign in to <name> first" (none when
 * `signedIn` is null: a word shows only when the surface knows it is true), `device` on a phone "Needs
 * the world on this phone"; then
 * "Opens the world" (a world door on an element: a sign-in the row needs is the more urgent word); else null.
 *
 * Refuses with `OwAddressError` whatever `elementAddress` refuses of the whole address, in its own form
 * (the site's when it has none): a form, type, id, pairing, moment or lens (`bad_moment`, `bad_lens`),
 * and a slug or anything else for the world's id (`bad_world`); and an address without a world
 * (`no_world`), the text form inside a world included, since every row needs one. A TypeError names the
 * rest: a `kind` that is neither, an element's openers asked of an address with no element, an unknown
 * key on the address, the surface or the options, a missing or unknown `audience`, a surface value of the
 * wrong type, an element given for a world's menu or naming another element than the address, a tools row
 * that is not one (a `needs`, an `element_skips` or an `element_types` word outside the list's format, an
 * empty `element_types`, `element_types` on a row with no element door, or an `opens_public` that is
 * not true or false, or true beside a `needs` other than `account`, included). An element whose own id is held
 * in upper case, the address's lowercase id otherwise its own, is no refusal: no address can name it, so the
 * answer is no rows (serial 123's release), and a surface draws its mark with an empty menu.
 */
export function openersFor(
  tools: readonly OwTool[],
  kind: OwOpenerKind,
  address: OwAddress | OwAddressReading,
  surface: OwOpenerSurface,
  options: OwOpenersOptions = {},
): OwOpener[] {
  if (!Array.isArray(tools)) fail('tools is the tools list\'s rows, an array');
  if (kind !== 'world' && kind !== 'element') fail(`kind is 'world' or 'element'; got ${JSON.stringify(kind)}`);
  if (address === null || typeof address !== 'object' || Array.isArray(address)) {
    fail('the address is an object ({ form, world, type, id }), as parseOwLink reads it');
  }
  refuseUnknownOptions('openersFor', address, ADDRESS_KEYS);
  const a = address as unknown as Record<string, unknown>;
  // The address's checks are the writer's: the whole address in its own form, so a bad form, a slug, a bad
  // type, id, moment or lens refuse as there; then the site's page, where a missing world refuses.
  elementAddress({ ...a, form: a.form ?? 'human' } as unknown as OwAddress);
  const page = elementAddress({ form: 'human', world: a.world as string, type: a.type as string, id: a.id as string });
  const world = (a.world as string).toLowerCase();
  const hasElement = a.type !== undefined && a.type !== null;
  if (kind === 'element' && !hasElement) fail('an element\'s openers need an address with its type and id');
  const type = hasElement ? (a.type as string) : '';
  const id = hasElement ? (a.id as string).toLowerCase() : '';

  if (surface === null || typeof surface !== 'object' || Array.isArray(surface)) fail('the surface is an object ({ audience, ... })');
  refuseUnknownOptions('openersFor', surface, SURFACE_KEYS);
  const { tool = null, audience, signedIn = null, browser = true, phone = false, online = true } = surface;
  if (audience !== 'member' && audience !== 'public') fail(`surface.audience is 'member' or 'public'; got ${JSON.stringify(audience)}`);
  if (tool !== null && typeof tool !== 'string') fail('surface.tool is a client name or null');
  if (signedIn !== null && typeof signedIn !== 'boolean') fail('surface.signedIn is true, false or null');
  if (typeof browser !== 'boolean') fail('surface.browser is a boolean');
  if (typeof phone !== 'boolean') fail('surface.phone is a boolean');
  if (typeof online !== 'boolean') fail('surface.online is a boolean');

  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('the options are an object ({ element })');
  refuseUnknownOptions('openersFor', options, OPTION_KEYS);
  const element = options.element ?? null;
  let unnamed = false;
  if (element !== null) {
    if (typeof element !== 'object' || Array.isArray(element)) fail('options.element is the element as served, an object, or null');
    if (kind !== 'element') fail("options.element is for an element's menu; a world's menu takes none");
    const eid = (element as Record<string, unknown>).id;
    // The address is a door, so its id is read in either case and taken in lowercase; the element's own id is
    // read as written (the address profile's same-id rule): an element held as 019A... is not the element 019a... names.
    if (typeof eid !== 'string' || eid.toLowerCase() !== id) fail('options.element is the element the address names: its id differs');
    // An element held in upper case is one no address can name, so no door opens it: no rows (answered at the end,
    // after every check has run), and a surface still draws its mark. Not a caller's mistake, so no refusal; only an
    // id that differs by more than case is one.
    unnamed = eid !== id;
  }
  const marks = element === null ? [] : marksOf(element as Record<string, unknown>);

  const values: Record<string, string> = { world, type, id };
  const fill = (template: string): string => template.replace(PLACEHOLDER, (_, n: string) => values[n]);
  const offline = (href: string): boolean => !online && WEB.test(href);
  const site = kind === 'element' ? page : elementAddress({ form: 'human', world });
  const siteState: OwOpenerState | null = tool === 'onlyworlds' ? 'You are here' : offline(site) ? OFFLINE : null;
  const rows: OwOpener[] = [{ id: 'onlyworlds', name: 'onlyworlds.com', href: site, state: siteState }];
  for (const r of tools) {
    if (r === null || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.name !== 'string') {
      fail('each tools row is an object with an id and a name');
    }
    const open = r.open as unknown;
    if (open === null || open === undefined) continue;
    if (typeof open !== 'object' || Array.isArray(open)) fail(`tool ${r.id}: open is an object or null`);
    const o = open as Record<string, unknown>;
    const worldDoor = templateOf(r.id, 'world', o.world);
    const elementDoor = templateOf(r.id, 'element', o.element);
    const needs = o.needs === undefined ? null : o.needs;
    if (!NEEDS.includes(needs)) fail(`tool ${r.id}: open.needs is 'account', 'device' or null; got ${JSON.stringify(needs)}`);
    const opensPublic = o.opens_public === undefined ? false : o.opens_public;
    if (typeof opensPublic !== 'boolean') fail(`tool ${r.id}: open.opens_public is true or false; got ${JSON.stringify(o.opens_public)}`);
    if (opensPublic && needs !== 'account') fail(`tool ${r.id}: open.opens_public is true only beside needs 'account'; got needs ${JSON.stringify(needs)}`);
    const skips = o.element_skips === undefined || o.element_skips === null ? [] : o.element_skips;
    if (!Array.isArray(skips) || skips.some((s) => !ELEMENT_MARKS.includes(s as OwElementMark))) {
      fail(`tool ${r.id}: open.element_skips is a list of ${ELEMENT_MARKS.join(', ')}; got ${JSON.stringify(o.element_skips)}`);
    }
    if (elementDoor === null && (skips as readonly unknown[]).length > 0) fail(`tool ${r.id}: open.element_skips names what an element door leaves out, and the row has none`);
    const types = o.element_types === undefined ? null : o.element_types;
    if (types !== null && (!Array.isArray(types) || types.length === 0 || new Set(types).size !== types.length
      || types.some((t) => !(ELEMENT_TYPES as readonly unknown[]).includes(t)))) {
      fail(`tool ${r.id}: open.element_types is null or a non-empty list of distinct type words (${STANDARD_TYPE_ORDER.join(', ')}); got ${JSON.stringify(o.element_types)}`);
    }
    if (elementDoor === null && types !== null) fail(`tool ${r.id}: open.element_types names what an element door opens, and the row has none`);
    if (r.rung !== 'listed') continue;
    if (audience === 'public' && needs === 'device') continue;
    const template = kind === 'element' ? elementDoor ?? worldDoor : worldDoor;
    if (template === null) continue;
    // An element door that cannot open this element is no door (a row with skips has one: refused above).
    if (kind === 'element' && marks.some((m) => (skips as readonly unknown[]).includes(m))) continue;
    // A tool that opens other kinds of element is no door for this one, and offers no world fallback either.
    if (kind === 'element' && types !== null && !(types as readonly unknown[]).includes(type)) continue;
    // The first that holds. A word the row needs (it cannot open now) comes before "Opens the world" (it
    // opens, somewhere else), so a world door alone that needs a sign-in says the sign-in. With no
    // connection a web link opens nothing, whatever else it needs.
    const href = fill(template);
    // What the row needs on this surface: a public page shows a public world, which a row that opens one
    // opens with nothing signed in.
    const need = audience === 'public' && opensPublic ? null : needs;
    let state: OwOpenerState | null = null;
    if (tool !== null && r.client === tool) state = 'You are here';
    else if (offline(href)) state = OFFLINE;
    else if (audience === 'public' && need === 'account') state = NO_ACCOUNT;
    else if (need === 'account' && !browser) state = 'Opens in your browser';
    else if (need === 'account' && signedIn === false) state = `Sign in to ${r.name} first`;
    else if (need === 'device' && phone) state = 'Needs the world on this phone';
    else if (kind === 'element' && elementDoor === null) state = 'Opens the world';
    rows.push({ id: r.id, name: r.name, href, state });
  }
  return unnamed ? [] : rows;
}
