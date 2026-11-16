/**
 * The by-links-3d layout, step 4: the plate. The world's map that holds the most elements of the graph by a Pin,
 * each pinned element at x, y, z from that map's middle; then the maps that stand over a place on it, as small
 * plates. No recursion, every order and every tie written.
 *
 * plate(rows, nodes[, opts]) -> null, or { at, first, facts } (below)
 *   rows    plain objects, as space.ts's spaceRows makes them from the world's elements. Only these keys are read:
 *           every row `type`; a row of type 'map' its `x_layout`, `id`, `width`, `height`, `location`, `name`; a row
 *           of type 'pin' its `id`, `map`, `element_id`, `x`, `y`. Ids are strings.
 *   nodes   a Set of the graph's node ids
 *   opts.scale   held points' frame (method.ts): the first map's scale, used in place of the one step 4 works out
 *           from the count (step 4's root is still taken, so a map that would throw still throws). Absent: step 4's
 *           scale, bit for bit.
 *
 * The answer, null when no map holds three elements of the graph by a Pin:
 *   at      a Map, element id -> [x, y, z], in this order: the first map's elements in the order they were first
 *           pinned, then each small plate's new elements as it is taken
 *   first   a Map, element id -> [x - W / 2, y - H / 2]: the elements that stand on the first map, in the order of
 *           `at`, each one's place on it before the scale (the held points' frame reads it)
 *   facts   { map, map_id, map_width, map_height, pinned, on_the_first_map, maps_as_small_plates, elements_on_them,
 *           maps_left_out, scale, maps_in_the_world }: `map` is the first map's `name` (null when it has none);
 *           `scale` is opts.scale when given
 *
 * The rule, in the order it runs:
 *   1. maps   every row of type 'map' that is no layout map, by id; a later row with the same id takes its place;
 *             its count is maps_in_the_world. A layout map (the map-space profile's mark: its `x_layout` is an
 *             object, not null and not an array, whose `method` is a string of length 1 or more) is passed over as if
 *             the row were absent (a layout map is no candidate for the world's space): its `id` is not read, it
 *             takes no other row's place, its Pins count for no map, it is no first map and no small plate, and it
 *             is not counted.
 *   2. pins   every row of type 'pin', sorted by id (code point order; a stable sort). A pin counts when its `map`
 *             is the id of a map in 1, its `element_id` is a node, and its `x` and `y` are each a number or a boolean
 *             (a boolean as 1 or 0). Per map, an element keeps the first place it got; the maps in the order a pin
 *             first counted for them, each map's elements in the order they were first placed.
 *   3. first  no map with a counted pin: null. The first map: the most elements, a tie to the greater id (code
 *             point order). Fewer than three on it, or its width or its height no size: null, and no other map is
 *             tried in its stead. A size is truthy as Python reads it (not absent, null, 0, false, '', an empty
 *             list or object) and, when it is a number, over 0: a Map's width is any whole number in the standard,
 *             and one under 0 is no frame to stand in.
 *   4. scale  scale = SPREAD * REST / sqrt(W * H / count), left to right (opts.scale in its place when given); each
 *             element of the first map at ((x - W / 2) * scale, (y - H / 2) * scale, 0), its place before the scale
 *             (x - W / 2, y - H / 2) kept in `first`.
 *   5. small  the other maps that hold a counted pin, in id order (code point order). Passes over them until a
 *             pass takes none; within a pass each is read in that order against the plate as it stands then (a map
 *             taken earlier in the same pass counts). A map is taken when its `location` has a place on the plate,
 *             its width and height are sizes as in 3, it holds three counted elements or more, and at least one of
 *             them has no place yet. Its new elements (those with no place yet, in its own order) stand at
 *             (lx + (x - cw / 2) * sc, ly + (y - ch / 2) * sc, lz + rise), sc = TILE * REST / sqrt(cw * ch / count),
 *             count all its elements (placed or not), (lx, ly, lz) its location's place, rise = REST * 4 when the
 *             count is 20 or more, else REST * 2. A map taken leaves the list; what is left at the end is left out.
 * Only + - * / and Math.sqrt: two runtimes agree to the last bit.
 * It throws on an id or a link value that is a list or an object (read only where the rule reads it), a width or
 * height that is truthy but no number. From rows that spaceRows made, neither can occur. A negative area is never
 * reached: rule 3's size.
 * Module-internal.
 */
import { byCodePoint } from './order';

export const REST = 60.0;
export const SPREAD = 2.0;
export const TILE = 0.4;

type Row = Record<string, unknown>;

export interface PlateFacts {
  map: unknown;
  map_id: string;
  map_width: unknown;
  map_height: unknown;
  pinned: number;
  on_the_first_map: number;
  maps_as_small_plates: number;
  elements_on_them: number;
  maps_left_out: number;
  scale: number;
  maps_in_the_world: number;
}

export interface Plate {
  at: Map<string, [number, number, number]>;
  first: Map<string, [number, number]>;
  facts: PlateFacts;
}

// Python's truth of a JSON value
function truthy(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true; // NaN is true in Python
}

// a size (rule 3): truthy, and when a number, over 0. NaN is no size.
const sized = (v: unknown): boolean => truthy(v) && !(typeof v === 'number' && !(v > 0));

// the map-space profile's layout mark: x_layout an object (not null, not an array) whose method is a non-empty string
export function isLayoutMap(row: Row): boolean {
  const v = row.x_layout as Row | null | undefined;
  return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.method === 'string' && v.method.length > 0;
}

// a number or a boolean
const numeric = (v: unknown): boolean => typeof v === 'number' || typeof v === 'boolean';

// a value used as a key: a list or an object is refused
function key(v: unknown, what: string): unknown {
  if (v !== null && typeof v === 'object') throw new Error(`plate: ${what} is a list or an object (${JSON.stringify(v)})`);
  return v;
}

// sqrt(w * h / count): a width or height that is truthy but no number (a string, a list) throws; so does a negative area
function root(w: unknown, h: unknown, count: number, what: string): number {
  if (!numeric(w) || !numeric(h)) throw new Error(`plate: ${what}: a width or height that is no number (${JSON.stringify([w, h])})`);
  const a = (w as number) * (h as number) / count;
  if (a < 0) throw new Error(`plate: ${what}: the square root of a negative area (${a})`);
  return Math.sqrt(a);
}

export function plate(rows: readonly Row[], nodes: ReadonlySet<string>, opts: { scale?: number } = {}): Plate | null {
  // 1. the maps, by id; a layout map is passed over, as if absent
  const maps = new Map<unknown, Row>();
  for (const e of rows) {
    if (e.type !== 'map') continue;
    if (isLayoutMap(e)) continue;
    maps.set(key(e.id, 'a map id'), e);
  }

  // 2. the pins in id order; per map, each element's first place
  const pins: Row[] = [];
  for (const e of rows) if (e.type === 'pin') {
    if (typeof e.id !== 'string') throw new Error(`plate: a pin's id is not a string (${JSON.stringify(e.id)})`);
    pins.push(e);
  }
  pins.sort((a, b) => byCodePoint(a.id as string, b.id as string));
  const at = new Map<string, Map<string, [number, number]>>(); // map id -> Map(element id -> [x, y])
  for (const pin of pins) {
    const m = pin.map === undefined ? null : pin.map;
    const el = pin.element_id === undefined ? null : pin.element_id;
    // `el` is read only when `m` names a map
    if (maps.has(key(m, "a pin's map")) && nodes.has(key(el, "a pin's element_id") as string) && numeric(pin.x) && numeric(pin.y)) {
      if (!at.has(m as string)) at.set(m as string, new Map());
      const row = at.get(m as string) as Map<string, [number, number]>;
      if (!row.has(el as string)) row.set(el as string, [Number(pin.x), Number(pin.y)]);
    }
  }
  if (at.size === 0) return null;

  // 3. the first map: the most elements, a tie to the greater id
  let m: string | null = null, best = -1;
  for (const [c, row] of at) {
    const better = row.size > best || (row.size === best && byCodePoint(c, m as string) > 0);
    if (better) { m = c; best = row.size; }
  }
  const map = maps.get(m) as Row;
  const W = map.width, H = map.height;
  const mine0 = at.get(m as string) as Map<string, [number, number]>;
  const count = mine0.size;
  if (count < 3 || !sized(W) || !sized(H)) return null;

  // 4. the scale and the first map's places
  const own = SPREAD * REST / root(W, H, count, 'the first map');
  const scale = opts.scale === undefined ? own : opts.scale;
  const out = new Map<string, [number, number, number]>(), onFirst = new Map<string, [number, number]>();
  for (const [el, [x, y]] of mine0) {
    const mx = x - (W as number) / 2, my = y - (H as number) / 2;
    onFirst.set(el, [mx, my]);
    out.set(el, [mx * scale, my * scale, 0.0]);
  }
  const first = out.size;

  // 5. the small plates: passes until one takes none
  const todo = [...at.keys()].filter((c) => c !== m).sort(byCodePoint);
  let small = 0, more = 0;
  let moved = true;
  while (moved) {
    moved = false;
    for (const c of todo.slice()) {
      const row = maps.get(c) as Row;
      const loc = row.location === undefined ? null : row.location;
      const cw = row.width, ch = row.height;
      const mine = at.get(c) as Map<string, [number, number]>;
      const fresh: Array<[string, [number, number]]> = [];
      for (const [el, xy] of mine) if (!out.has(el)) fresh.push([el, xy]);
      if (out.has(key(loc, "a map's location") as string) && sized(cw) && sized(ch) && mine.size >= 3 && fresh.length) {
        const sc = TILE * REST / root(cw, ch, mine.size, `the map ${c}`);
        const [lx, ly, lz] = out.get(loc as string) as [number, number, number];
        const rise = REST * (mine.size >= 20 ? 4 : 2);
        for (const [el, [x, y]] of fresh) out.set(el, [lx + (x - (cw as number) / 2) * sc, ly + (y - (ch as number) / 2) * sc, lz + rise]);
        todo.splice(todo.indexOf(c), 1);
        small += 1; more += fresh.length; moved = true;
      }
    }
  }
  return {
    at: out,
    first: onFirst,
    facts: {
      map: map.name === undefined ? null : map.name, map_id: m as string, map_width: W, map_height: H, pinned: out.size,
      on_the_first_map: first, maps_as_small_plates: small, elements_on_them: more, maps_left_out: todo.length,
      scale, maps_in_the_world: maps.size,
    },
  };
}
