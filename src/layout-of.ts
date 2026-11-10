/**
 * The map-space profile's layout reading (schema-dist profiles/map-space.md, rules 8 to 10): what a layout tool's two
 * marks say about one Map. `x_layout` on a Map names how its Pins were laid out (and, in its settings, the Map it
 * stands on); `x_hand: true` on a Pin says it was placed by hand, so a new lay-out keeps it where it is. The profile's
 * `layout_cases` are the test. The map-space reading (`mapSpace`) does not read either mark.
 */
import { byCodePoint } from './lens';

export interface OwLayoutOf {
  /** The `x_layout.method` string when the Map is a layout map (`"hand"` for a board), else null. A method no page names answers itself. */
  layout: string | null;
  /** When `layout` is not null: the id in `x_layout.settings.ground.map` when it names a served Map other than this one, else null. */
  ground: string | null;
  /** The ids of this Map's Pins a new lay-out keeps where they are, by id in code point order. */
  hand: string[];
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An id: a string that is not empty; anything else reads as none. */
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * One Map's layout reading: `{layout, ground, hand}`, all three keys always present.
 *
 * `map` is the Map read, `maps` the Maps the reader is served, `pins` every Pin the caller holds, of any Map, as
 * served: the reader keeps the Pins whose `map` names this Map's id. A row without a non-empty string `id` is no
 * element, and of two rows with one id the last served is read, as `mapSpace` reads them.
 *
 * The Map is a layout map when `x_layout` is an object whose `method` is a non-empty string; anything else is no
 * layout, and its ground and Pins are not read. On a board (`method` `"hand"`) every Pin of the Map is in `hand`,
 * marked or not; on any other layout map only the Pins whose `x_hand` is exactly `true`; on a plain Map `hand` is
 * empty whatever its Pins carry. A Pin whose element the reader cannot see is still a Pin. The method's own settings,
 * and the ground's size, are not returned: the caller holds the served Map.
 */
export function layoutOf(map: unknown, maps: readonly unknown[], pins: readonly unknown[]): OwLayoutOf {
  if (!isRow(map)) throw new TypeError('layoutOf: map is one Map element.');
  if (!Array.isArray(maps)) throw new TypeError('layoutOf: maps is a list of Map elements.');
  if (!Array.isArray(pins)) throw new TypeError('layoutOf: pins is a list of Pin elements.');
  const none: OwLayoutOf = { layout: null, ground: null, hand: [] };
  const id = idOf(map.id);
  if (id === null) return none;

  // Rule 8: the mark is x_layout alone, an object with a non-empty string method.
  const recipe = map.x_layout;
  if (!isRow(recipe)) return none;
  const method = recipe.method;
  if (typeof method !== 'string' || method === '') return none;

  // Rule 9: the ground is a served Map other than this one, named by settings.ground.map.
  let ground: string | null = null;
  const settings = recipe.settings;
  const g = isRow(settings) && isRow(settings.ground) ? idOf(settings.ground.map) : null;
  if (g !== null && g !== id && maps.some((m) => isRow(m) && idOf(m.id) === g)) ground = g;

  // Rule 10: one row per Pin id, the last served; this Map's Pins, every one on a board, else the marked ones.
  const held = new Map<string, Row>();
  for (const p of pins) {
    if (!isRow(p)) continue;
    const pid = idOf(p.id);
    if (pid !== null) held.set(pid, p);
  }
  const board = method === 'hand';
  const hand: string[] = [];
  for (const [pid, p] of held) {
    if (idOf(p.map) !== id) continue;
    if (board || p.x_hand === true) hand.push(pid);
  }
  hand.sort(byCodePoint);
  return { layout: method, ground, hand };
}
