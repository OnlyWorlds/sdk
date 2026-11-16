/**
 * The by-links-3d layout, in front of step 4: the world's Maps and Pins as the map-space profile reads them.
 *
 * The standard has one reading of a world's Maps and Pins, the map-space profile's (`mapSpace`), and one of the
 * layout mark (`layoutOf`). A method that read Pins a second way could disagree with every other tool on which Pins
 * a world has. So the caller hands the method the world's elements, and this file turns them into the rows plate()
 * reads, through those two readers and nothing of its own:
 *
 * spaceRows(elements) -> rows, or null
 *   elements   the world's elements as served (any types; only Map and Pin elements are read), or null / undefined:
 *              no rows, so no plate
 *
 * The rows, in this order:
 *   one { type: 'map', id, width, height, location, name } for each Map `mapSpace` lists (by id, code point order)
 *       that is no layout map: `layoutOf(map, maps, pins).layout === null`. width and height are mapSpace's (the
 *       Map's own when a whole number, else the largest x or y among its own points, null with no point: plate()
 *       then takes no plate from it); location is mapSpace's (a non-empty string, or null).
 *   one { type: 'pin', id, map, element_id, x, y } for each Pin `mapSpace` lists, by id, code point order, with the
 *       element mapSpace reads for it: null unless the Pin has both `element_type` and `element_id` (the profile's
 *       rule: one key alone reads as neither). plate() counts no Pin whose element is no node, so a null needs no
 *       line here. A Pin of a layout map is among the rows and counts for no map: plate() holds no row for its Map.
 * Not read here: a Pin's z. The plate is flat: every element of the first map stands at z 0 on it, whatever its Pin's
 * z. A Pin names its element by `element_id`; its `element_type` must be there (the profile's rule) and is not
 * compared with the node's type: an id names one element.
 *
 * The one thing written here that mapSpace also does: which raw row is a Map's or a Pin's (a row with a string `type`
 * and a non-empty string `id`; of two rows of one type with one id, the last served). layoutOf needs the raw Map row
 * for its mark, and mapSpace's answer does not carry it. Module-internal.
 */
import { mapSpace } from '../mapspace';
import { layoutOf } from '../layout-of';

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function spaceRows(elements: readonly unknown[] | null | undefined): Row[] | null {
  if (elements === null || elements === undefined) return null;
  const space = mapSpace(elements);
  const rawMaps = new Map<string, Row>(), rawPins = new Map<string, Row>();
  for (const e of elements) {
    if (!isRow(e) || typeof e.type !== 'string') continue;
    const id = idOf(e.id);
    if (id === null) continue;
    if (e.type === 'map') rawMaps.set(id, e);
    else if (e.type === 'pin') rawPins.set(id, e);
  }
  const maps = [...rawMaps.values()], pins = [...rawPins.values()];
  const rows: Row[] = [];
  for (const m of space.maps) {
    const raw = rawMaps.get(m.id) as Row;
    if (layoutOf(raw, maps, pins).layout !== null) continue; // a layout map is no map of the world's space
    rows.push({ type: 'map', id: m.id, width: m.width, height: m.height, location: m.location, name: raw.name });
  }
  for (const p of space.pins) {
    rows.push({ type: 'pin', id: p.pin, map: p.map, element_id: p.element_id, x: p.x, y: p.y });
  }
  return rows;
}
