// The Open with menu: the rows that open a world, or one element of it, in a tool, in order, each with
// the word it says when it cannot open now. Pure and DOM-free: a menu draws these rows and decides no
// word of its own, and a game, the Python package's openers_for and a test read the same rows. The rows
// come from the OnlyWorlds tools list (github.com/OnlyWorlds/tools, tools.json format 1, its README's
// "Open with"), baked into the package as TOOLS (tools.generated.ts). The shared fixture,
// test/fixtures/openers.fixture.json, is this file's own test, and openers_for answers every case the
// same way.

import { ADDRESS_KEYS, elementAddress, type OwAddress, type OwAddressReading } from './address';
import { refuseUnknownOptions } from './options';

/** What a person must have before a tool's link works: signed in to the tool (`account`), or the world already in the tool on this device (`device`). */
export type OwToolNeeds = 'account' | 'device';

/** A tool's `open` in the tools list: its link templates and what they need first. */
export interface OwToolOpen {
  /** The link that opens a world, holding `{world}` (the world's id); null without one. */
  world: string | null;
  /** The link that opens one element, holding `{id}` and, if it needs them, `{world}` and `{type}` (the type word); null without one. */
  element: string | null;
  /** What the person needs first; null for nothing, which is the one kind of row a public page offers. */
  needs: OwToolNeeds | null;
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
  /** The client name of the surface's own tool, when it is a listed tool; its row says "You are here". */
  tool?: string | null;
  /** `member` (a seat in the world, a guest included) or `public` (the signed-out reader). Required. */
  audience: 'member' | 'public';
  /** Whether the reader is signed in; null or absent when the surface cannot know, and then no row says so. */
  signedIn?: boolean | null;
  /** False in a desktop app, which cannot see the browser's sign-in. Default true. */
  browser?: boolean;
  /** True on a phone. Default false. */
  phone?: boolean;
}

/** The word a row says when it cannot open now, or says where it lands. Sentence case, exactly. */
export type OwOpenerState =
  | 'You are here'
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

const SURFACE_KEYS: readonly string[] = ['tool', 'audience', 'signedIn', 'browser', 'phone'];
const NEEDS: readonly unknown[] = ['account', 'device', null];
const PLACEHOLDER = /\{(world|type|id)\}/g;

const fail = (what: string): never => {
  throw new TypeError(`openersFor: ${what}`);
};

/** A template string or null; undefined reads as null. */
function templateOf(row: string, key: 'world' | 'element', v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : fail(`tool ${row}: open.${key} is a link template or null`);
}

/**
 * The rows of the Open with menu for a world (`kind: 'world'`) or one element of it (`'element'`), in
 * order: first the site's own row (id `onlyworlds`, name `onlyworlds.com`, the world's or the element's
 * page on www.onlyworlds.com, never a word, for every audience), then one row per `tools` row, in the
 * list's order, that is `listed` and has a door for this kind. `tools` is the tools list's rows, `TOOLS`
 * or the list as served; `address` is a reading from `parseOwLink` or what `elementAddress` takes, with
 * the world's id. A lens and a moment on it ride on no href.
 *
 * A row with `open: null`, or with no door for this kind, is not there. On an element, a tool with only
 * a world door is a row to its world door that says "Opens the world". For the `public` audience only
 * rows whose `open.needs` is null are there: a row that needs anything does not exist for the public.
 *
 * Each row's `state`, the first that holds: "You are here" for the surface's own tool (its `client` is
 * `surface.tool`); then what `needs` asks of this surface: `account` outside a browser "Opens in your
 * browser", in a browser signed out "Sign in to <name> first" (none when `signedIn` is null: a word shows
 * only when the surface knows it is true), `device` on a phone "Needs the world on this phone"; then
 * "Opens the world" (a world door on an element: a sign-in the row needs is the more urgent word); else null.
 *
 * Refuses with `OwAddressError` whatever `elementAddress` refuses of the whole address, in its own form
 * (the site's when it has none): a form, type, id, pairing, moment or lens (`bad_moment`, `bad_lens`),
 * and a slug or anything else for the world's id (`bad_world`); and an address without a world
 * (`no_world`), the text form inside a world included, since every row needs one. A TypeError names the
 * rest: a `kind` that is neither, an element's openers asked of an address with no element, an unknown
 * key on the address or the surface, a missing or unknown `audience`, a surface value of the wrong type,
 * a tools row that is not one (a `needs` outside the list's format included).
 */
export function openersFor(
  tools: readonly OwTool[],
  kind: OwOpenerKind,
  address: OwAddress | OwAddressReading,
  surface: OwOpenerSurface,
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
  const { tool = null, audience, signedIn = null, browser = true, phone = false } = surface;
  if (audience !== 'member' && audience !== 'public') fail(`surface.audience is 'member' or 'public'; got ${JSON.stringify(audience)}`);
  if (tool !== null && typeof tool !== 'string') fail('surface.tool is a client name or null');
  if (signedIn !== null && typeof signedIn !== 'boolean') fail('surface.signedIn is true, false or null');
  if (typeof browser !== 'boolean') fail('surface.browser is a boolean');
  if (typeof phone !== 'boolean') fail('surface.phone is a boolean');

  const values: Record<string, string> = { world, type, id };
  const fill = (template: string): string => template.replace(PLACEHOLDER, (_, n: string) => values[n]);
  const rows: OwOpener[] = [
    { id: 'onlyworlds', name: 'onlyworlds.com', href: kind === 'element' ? page : elementAddress({ form: 'human', world }), state: null },
  ];
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
    if (r.rung !== 'listed') continue;
    if (audience === 'public' && needs !== null) continue;
    const template = kind === 'element' ? elementDoor ?? worldDoor : worldDoor;
    if (template === null) continue;
    // The first that holds. A word the row needs (it cannot open now) comes before "Opens the world" (it
    // opens, somewhere else), so a world door alone that needs a sign-in says the sign-in.
    let state: OwOpenerState | null = null;
    if (tool !== null && r.client === tool) state = 'You are here';
    else if (needs === 'account' && !browser) state = 'Opens in your browser';
    else if (needs === 'account' && signedIn === false) state = `Sign in to ${r.name} first`;
    else if (needs === 'device' && phone) state = 'Needs the world on this phone';
    else if (kind === 'element' && elementDoor === null) state = 'Opens the world';
    rows.push({ id: r.id, name: r.name, href: fill(template), state });
  }
  return rows;
}
