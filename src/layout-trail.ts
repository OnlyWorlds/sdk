/**
 * A layout method, `trail-by-place`: a world laid out along a route on a ground map. The places sit in travel order,
 * at their own pins on the ground map or between pinned ones, and every other element hangs on a spiral round the
 * place it belongs to, lifted to the height of its kind. The answer is a layout in the standard's own fields: a Map
 * frame (width, height, depth) and one Pin per element, whole numbers in the Map's pixels, read back by `mapSpace`.
 *
 * The method places; it does not read. Which elements are in, the order of travel, which pinned places an unpinned
 * place falls between and which place each element hangs from are the caller's (they come from the world's own text
 * or links, and no two worlds read them alike). Same input, same answer.
 */
import { byCodePoint } from './lens';
import { refuseUnknownOptions } from './options';

/** A place on the route, in travel order. Exactly one of `pin`, `between` or `parent` says where it sits. */
export interface OwTrailPlace {
  id: string;
  type: string;
  name: string;
  /** Its point on the ground map, `[x, y]` in the ground map's pixels (the margin is added). */
  pin?: [number, number];
  /** Two pinned places it sits between, evenly, with any others between the same two, in travel order. */
  between?: [string, string];
  /** A place it sits inside: on a ring round that place, siblings by id. */
  parent?: string;
  /** The caller's words for why it sits there: a pinned place's whole `by` line; a `between` or `parent` place's reason. */
  by?: string;
}

/** An element that hangs from one or more places: on the spiral round their point (the mean of their points). */
export interface OwTrailHanger {
  id: string;
  type: string;
  name: string;
  /** The places it hangs from, by id; each must be one of `places`. */
  at: string[];
  /** The caller's words for why it hangs there; the method adds its tier and its place on the spiral. */
  by?: string;
}

/** One floor of the layout: the kinds (element type words) that stand at this height. */
export interface OwTrailTier {
  name: string;
  z: number;
  kinds: string[];
}

export interface OwTrailSpiral {
  /** The first member's distance from the place's point, in pixels; above 0, so nothing shares a place's own point. */
  r0: number;
  /** The n-th member stands at `r0 + c * sqrt(n)`. */
  c: number;
  /** The turn between members, in radians, `n * angle`. */
  angle: number;
}

/** The method's settings: what a Map's recipe carries, so the layout can be run again from the Map alone. */
export interface OwTrailSettings {
  /**
   * The ground map's own frame; the layout's frame is it plus `margin` on every side. `map` is the ground Map's element
   * id in the same world, so a tool reading the recipe finds its picture (left out when the caller gives none).
   */
  ground: OwTrailGround;
  margin: number;
  depth: number;
  tiers: OwTrailTier[];
  spiral: OwTrailSpiral;
  /** How far a place sits from the place it is inside. */
  parentRing: number;
}

export interface OwTrailGround {
  map?: string;
  width: number;
  height: number;
}

export interface OwTrailInput extends Partial<Omit<OwTrailSettings, 'ground' | 'depth'>> {
  ground: OwTrailGround;
  depth: number;
  places: OwTrailPlace[];
  hangers: OwTrailHanger[];
  /** Stands first on its place's spiral. */
  hero?: OwTrailHanger;
}

export interface OwTrailPin {
  element_type: string;
  element_id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Why it stands there, in plain words. */
  by: string;
}

export interface OwTrailLayout {
  /** The layout Map's frame. */
  map: { width: number; height: number; depth: number };
  /** One per place, hanger and hero, sorted by element id (code point order). */
  pins: OwTrailPin[];
  /** The places' points in travel order, `[x, y, 0]`, rounded and not moved. */
  route: [number, number, number][];
  /** The method and the settings it ran with, for the Map's recipe. */
  recipe: { method: 'trail-by-place'; settings: OwTrailSettings };
  /** Points moved one pixel at a time off a point already taken, and points pulled back inside the frame. */
  nudged: number;
  clamped: number;
}

// Literal entries, each freeze marked pure: a bundler drops the whole table from a tool that never reads it.
const tier = (name: string, z: number, kinds: readonly string[]): OwTrailTier =>
  /* @__PURE__ */ Object.freeze({ name, z, kinds: /* @__PURE__ */ Object.freeze(kinds) as unknown as string[] });
/** The default floors, each named by its own kinds: location, object and zone on the ground; character, collective, creature and species at 240; event at 480; the other eleven kinds at 720. */
export const TRAIL_TIERS: readonly OwTrailTier[] = /* @__PURE__ */ Object.freeze([
  /* @__PURE__ */ tier('location, object, zone', 0, ['location', 'object', 'zone']),
  /* @__PURE__ */ tier('character, collective, creature, species', 240, ['character', 'collective', 'creature', 'species']),
  /* @__PURE__ */ tier('event', 480, ['event']),
  /* @__PURE__ */ tier('ability, construct, family, institution, language, law, narrative, phenomenon, relation, title, trait', 720, ['ability', 'construct', 'family', 'institution', 'language', 'law', 'narrative', 'phenomenon', 'relation', 'title', 'trait']),
]);

const DEFAULT_SPIRAL: OwTrailSpiral = { r0: 140, c: 20, angle: 2.399963 };
const DEFAULT_PARENT_RING = 140;

/** Round half to even on the number's exact value (the rounding both packages use, so they agree to the pixel). */
export function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const INPUT_KEYS = ['ground', 'margin', 'depth', 'tiers', 'spiral', 'parentRing', 'places', 'hangers', 'hero'] as const;
const PLACE_KEYS = ['id', 'type', 'name', 'pin', 'between', 'parent', 'by'] as const;
const HANGER_KEYS = ['id', 'type', 'name', 'at', 'by'] as const;

function fail(msg: string): never {
  throw new TypeError(`trailByPlace: ${msg}`);
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const wholeAbove = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > min;

function checkElement(e: unknown, what: string, keys: readonly string[]): asserts e is { id: string; type: string; name: string } {
  if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`${what} is not an object`);
  refuseUnknownOptions(`trailByPlace: ${what}`, e, keys);
  const o = e as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) fail(`${what} has no id`);
  if (typeof o.type !== 'string' || !o.type) fail(`${what} (${o.id}) has no type`);
  if (typeof o.name !== 'string') fail(`${what} (${o.id}) has no name`);
  if (o.by !== undefined && typeof o.by !== 'string') fail(`${what} (${o.id}): by is not a string`);
}

/**
 * Lay out a trail. Places first: a pinned place at its pin plus the margin; a place `between` two pinned places
 * evenly along the line between them, with the others between the same two, in travel order; a place inside a
 * `parent` on a ring round it. Then every hanger and the hero: grouped by the rounded mean of their places' points,
 * each group on one sunflower spiral round that point (the hero first, then by tier, then by id; the n-th member at
 * `r0 + c * sqrt(n)` and `n * angle`), at its tier's height. Last, every point is rounded half to even, kept inside
 * the frame, and, by element id order, a point already taken moves along x from its own point (one pixel right, one
 * left, two right, two left, and on), so no two Pins share a point. Throws a TypeError, naming what, on an input it cannot place: an unknown key, a place with no one rule, a
 * reference to a place it does not hold, a kind with no tier, an id twice, a row of the frame with no free point left.
 */
export function trailByPlace(input: OwTrailInput): OwTrailLayout {
  if (!input || typeof input !== 'object') fail('the input is not an object');
  refuseUnknownOptions('trailByPlace', input, INPUT_KEYS);
  const { places, hangers, hero } = input;
  const g = input.ground;
  if (!g || typeof g !== 'object') fail('no ground');
  refuseUnknownOptions('trailByPlace: ground', g, ['map', 'width', 'height']);
  if (g.map !== undefined && (typeof g.map !== 'string' || !g.map)) fail("ground.map is the ground Map's element id, a non-empty string");
  if (!wholeAbove(g.width, 0) || !wholeAbove(g.height, 0)) fail('the ground\'s width and height are whole numbers above 0');
  const margin = input.margin ?? 0;
  if (!Number.isSafeInteger(margin) || margin < 0) fail('margin is a whole number, 0 or more');
  if (!wholeAbove(input.depth, 0)) fail('depth is a whole number above 0');
  const spiral = input.spiral ?? DEFAULT_SPIRAL;
  refuseUnknownOptions('trailByPlace: spiral', spiral, ['r0', 'c', 'angle']);
  if (!finite(spiral.r0) || spiral.r0 <= 0 || !finite(spiral.c) || spiral.c < 0 || !finite(spiral.angle)) {
    fail('spiral is {r0 above 0, c 0 or more, angle}');
  }
  const parentRing = input.parentRing ?? DEFAULT_PARENT_RING;
  if (!finite(parentRing) || parentRing <= 0) fail('parentRing is a number above 0');
  const tiers = input.tiers ?? (TRAIL_TIERS as OwTrailTier[]);
  if (!Array.isArray(tiers) || tiers.length === 0) fail('tiers is a list of at least one tier');
  for (const t of tiers) {
    refuseUnknownOptions('trailByPlace: tier', t, ['name', 'z', 'kinds']);
    if (typeof t.name !== 'string' || !Number.isSafeInteger(t.z) || t.z < 0 || !Array.isArray(t.kinds)) fail('a tier is {name, z (a whole number, 0 or more), kinds}');
  }
  const tierOf = (type: string, id: string): number => {
    const k = tiers.findIndex((t) => t.kinds.includes(type));
    if (k < 0) fail(`no tier holds the kind '${type}' (${id})`);
    return k;
  };
  if (!Array.isArray(places) || places.length === 0) fail('places is a list of at least one place');
  if (!Array.isArray(hangers)) fail('hangers is a list');

  const M = margin;
  const W = g.width + 2 * M;
  const H = g.height + 2 * M;
  const D = input.depth;
  const seenIds = new Set<string>();
  const once = (id: string) => {
    if (seenIds.has(id)) fail(`the id ${id} is given twice`);
    seenIds.add(id);
  };
  const placeById = new Map<string, OwTrailPlace>();
  for (const [i, p] of places.entries()) {
    checkElement(p, `place ${i}`, PLACE_KEYS);
    once(p.id);
    const rules = ['pin', 'between', 'parent'].filter((k) => (p as unknown as Record<string, unknown>)[k] !== undefined);
    if (rules.length !== 1) fail(`place ${p.name} (${p.id}) needs exactly one of pin, between, parent; it has ${rules.length ? rules.join(', ') : 'none'}`);
    if (p.pin !== undefined && !(Array.isArray(p.pin) && p.pin.length === 2 && p.pin.every(finite))) fail(`place ${p.name}: pin is [x, y]`);
    if (p.between !== undefined && !(Array.isArray(p.between) && p.between.length === 2 && p.between.every((v) => typeof v === 'string'))) fail(`place ${p.name}: between is [place id, place id]`);
    if (p.parent !== undefined && typeof p.parent !== 'string') fail(`place ${p.name}: parent is a place id`);
    placeById.set(p.id, p);
  }

  // Places: pins, then the places between them, then the places inside others.
  const pt = new Map<string, [number, number]>();
  const by = new Map<string, string>();
  for (const p of places) {
    if (!p.pin) continue;
    pt.set(p.id, [p.pin[0] + M, p.pin[1] + M]);
    by.set(p.id, p.by ?? `its pin on the ground (${p.pin[0]}, ${p.pin[1]}), plus the ${M} px margin`);
  }
  const groups = new Map<string, OwTrailPlace[]>();
  for (const p of places) {
    if (!p.between) continue;
    for (const end of p.between) {
      if (!placeById.has(end)) fail(`place ${p.name}: between names ${end}, which is not one of the places`);
      if (!pt.has(end)) fail(`place ${p.name}: between names ${placeById.get(end)!.name}, which has no pin`);
    }
    const k = `${p.between[0]}\u0000${p.between[1]}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  for (const ids of groups.values()) {
    ids.forEach((p, n) => {
      const [a, b] = p.between!;
      const f = (n + 1) / (ids.length + 1);
      const pa = pt.get(a)!;
      const pb = pt.get(b)!;
      pt.set(p.id, [pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f]);
      const base = `no pin: between ${placeById.get(a)!.name} and ${placeById.get(b)!.name}`;
      by.set(p.id, p.by ? `${base} (${p.by})` : base);
    });
  }
  const sibs = new Map<string, string[]>();
  for (const p of places) {
    if (!p.parent) continue;
    if (!placeById.has(p.parent)) fail(`place ${p.name}: parent ${p.parent} is not one of the places`);
    if (!sibs.has(p.parent)) sibs.set(p.parent, []);
    sibs.get(p.parent)!.push(p.id);
  }
  for (const s of sibs.values()) s.sort(byCodePoint);
  for (let pass = 0, left = true; left && pass <= places.length; pass++) {
    left = false;
    for (const p of places) {
      if (!p.parent || pt.has(p.id)) continue;
      const c = pt.get(p.parent);
      if (!c) { left = true; continue; }
      const s = sibs.get(p.parent)!;
      const a = Math.PI / 4 + (2 * Math.PI * s.indexOf(p.id)) / s.length;
      pt.set(p.id, [c[0] + parentRing * Math.cos(a), c[1] + parentRing * Math.sin(a)]);
      by.set(p.id, `no pin: inside ${placeById.get(p.parent)!.name} (${p.by ?? 'its parent_location'}), beside it`);
    }
  }
  for (const p of places) if (!pt.has(p.id)) fail(`place ${p.name} (${p.id}) sits inside a ring of parents that never reaches a placed place`);

  // Everything else: one spiral round each place point, the hero first.
  const raw: OwTrailPin[] = places.map((p) => ({ element_type: p.type, element_id: p.id, name: p.name, x: pt.get(p.id)![0], y: pt.get(p.id)![1], z: 0, by: by.get(p.id)! }));
  const members = [...hangers.map((h, i) => ({ h, what: `hanger ${i}` })), ...(hero ? [{ h: hero, what: 'the hero' }] : [])];
  const clusters = new Map<string, { cx: number; cy: number; hs: { h: OwTrailHanger; tier: number }[] }>();
  for (const { h, what } of members) {
    checkElement(h, what, HANGER_KEYS);
    once(h.id);
    if (!Array.isArray(h.at) || h.at.length === 0) fail(`${what} ${h.name}: at is a list of at least one place id`);
    for (const q of h.at) if (!pt.has(q)) fail(`${what} ${h.name}: at names ${q}, which is not one of the places`);
    const cx = roundHalfEven(h.at.reduce((s, q) => s + pt.get(q)![0], 0) / h.at.length);
    const cy = roundHalfEven(h.at.reduce((s, q) => s + pt.get(q)![1], 0) / h.at.length);
    const k = `${cx},${cy}`;
    if (!clusters.has(k)) clusters.set(k, { cx, cy, hs: [] });
    clusters.get(k)!.hs.push({ h, tier: tierOf(h.type, h.id) });
  }
  const heroId = hero?.id;
  for (const { cx, cy, hs } of clusters.values()) {
    hs.sort((p, q) => Number(p.h.id !== heroId) - Number(q.h.id !== heroId) || p.tier - q.tier || byCodePoint(p.h.id, q.h.id));
    hs.forEach(({ h, tier }, n) => {
      const r = spiral.r0 + spiral.c * Math.sqrt(n);
      const a = n * spiral.angle;
      const where = `tier ${tiers[tier].name}; ${n + 1} of ${hs.length} on the spiral round it`;
      raw.push({ element_type: h.type, element_id: h.id, name: h.name, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: tiers[tier].z, by: h.by ? `${h.by}; ${where}` : where });
    });
  }

  // The frame: whole numbers inside it, and no two Pins on one point.
  raw.sort((p, q) => byCodePoint(p.element_id, q.element_id));
  const taken = new Set<string>();
  let nudged = 0;
  let clamped = 0;
  for (const p of raw) {
    for (const [k, hi] of [['x', W], ['y', H], ['z', D]] as const) {
      const v = roundHalfEven(p[k]);
      const c = Math.min(Math.max(v, 0), hi);
      if (c !== v) clamped++;
      p[k] = c;
    }
    // From its own point: one pixel right, one left, two right, two left, and on, kept inside the frame.
    // Every x on the row is tried within 2 * width + 2 steps; a row with none free is refused, never walked forever.
    const x0 = p.x;
    for (let step = 1; taken.has(`${p.x},${p.y},${p.z}`); step++) {
      if (step > 2 * W + 2) fail(`no free point left for ${p.name} (${p.element_id}) on its row (y ${p.y}, z ${p.z}): the frame is ${W} wide`);
      p.x = Math.min(Math.max(x0 + (step % 2 ? 1 : -1) * Math.floor((step + 1) / 2), 0), W);
      nudged++;
    }
    taken.add(`${p.x},${p.y},${p.z}`);
  }
  return {
    map: { width: W, height: H, depth: D },
    pins: raw,
    route: places.map((p) => [roundHalfEven(pt.get(p.id)![0]), roundHalfEven(pt.get(p.id)![1]), 0]),
    recipe: {
      method: 'trail-by-place',
      settings: {
        ground: g.map !== undefined ? { map: g.map, width: g.width, height: g.height } : { width: g.width, height: g.height },
        margin: M,
        depth: D,
        tiers: tiers.map((t) => ({ name: t.name, z: t.z, kinds: [...t.kinds] })),
        spiral: { r0: spiral.r0, c: spiral.c, angle: spiral.angle },
        parentRing,
      },
    },
    nudged,
    clamped,
  };
}
