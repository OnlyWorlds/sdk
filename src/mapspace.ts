/**
 * The map-space profile (draft): how a reader turns a world's Map, Zone, Marker and Pin elements into geometry, a
 * Map's frame, a Zone's outline from its Markers, a Pin's point. Structure and coordinates in the Map's own pixels;
 * looks, cameras and units are a drawing tool's. The profile's fixture is the test.
 */
import { byCodePoint } from './lens';

/** A point `[x, y, z]`, whole numbers in the Map's pixels; z counts upward and reads 0 when the row has none. */
export type OwMapSpacePoint = [number, number, number];

export interface OwMapSpaceMap {
  id: string;
  /** The Map's own `width` when it is a whole number, else the largest x among its own points; null with no point. */
  width: number | null;
  height: number | null;
  /** The Map's `depth` when it is a whole number, else null. */
  depth: number | null;
  /** Metres per pixel: `x_metres_per_pixel` when it is a positive number, else null. */
  scale: number | null;
  location: string | null;
  parent_map: string | null;
  /** `points` when `width` or `height` was measured from the Map's own points; absent when both were written. */
  extent?: 'points';
}

export interface OwMapSpaceOutline {
  zone: string;
  map: string;
  /** The Zone's own `shape` when it is `polygon` or `line`, else `polygon`. */
  shape: 'polygon' | 'line';
  points: OwMapSpacePoint[];
}

export interface OwMapSpacePin {
  pin: string;
  map: string;
  /** Both keys or neither: a Pin with one of the two reads both null. */
  element_type: string | null;
  element_id: string | null;
  x: number;
  y: number;
  z: number;
}

export type OwMapSpaceOutReason = 'no_point' | 'no_markers' | 'dangling' | 'no_map';

export interface OwMapSpace {
  /** By id in code point order. */
  maps: OwMapSpaceMap[];
  /** By Zone id, then Map id. */
  zones: OwMapSpaceOutline[];
  /** By id in code point order. */
  pins: OwMapSpacePin[];
  /** What the reading left aside, by reason, in the order `no_point`, `no_markers`, `dangling`, `no_map`; a reason with nothing counted is absent. */
  out: Partial<Record<OwMapSpaceOutReason, number>>;
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A whole number: a JSON number with no fractional part. Never a boolean or a string. */
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** An id: a string that is not empty; anything else reads as none. */
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const byId = (a: string, b: string): number => byCodePoint(a, b);

function point(e: Row): OwMapSpacePoint {
  return [e.x as number, e.y as number, whole(e.z) ? e.z : 0];
}

/** The largest value at `index` among `points`, null when there are none. */
function largest(points: number[][], index: number): number | null {
  let best: number | null = null;
  for (const p of points) if (best === null || p[index] > best) best = p[index];
  return best;
}

/**
 * A world's map space (the map-space profile, draft): `{maps, zones, pins, out}`, all four keys always present, from
 * the elements as the reader is served them (so a Zone the reader may not see is not in the input, and not brought
 * back). Everything is keyed by id and holds whole numbers in the Map's pixels; ids sort by code point, so the same
 * input gives the same bytes.
 *
 * A Zone's outline is the Markers that name the Zone and one Map, by `order` ascending; a Marker without a whole
 * `order` sorts after every ordered one, then by id. A Marker whose Zone or Map is not served is counted `dangling`
 * (checked first), one without a whole `x` and `y` `no_point`; a Zone without a placed Marker `no_markers`; a Pin whose
 * Map is not served `no_map`, one without a whole `x` and `y` `no_point`. A `z` past a Map's `depth` is kept as written.
 */
export function mapSpace(elements: readonly unknown[]): OwMapSpace {
  if (!Array.isArray(elements)) throw new TypeError('mapSpace: elements is a list of elements.');
  const byType = new Map<string, Row[]>();
  for (const e of elements) {
    if (!isRow(e) || typeof e.type !== 'string') continue;
    const list = byType.get(e.type);
    if (list) list.push(e); else byType.set(e.type, [e]);
  }
  const rowsOf = (type: string): Row[] => byType.get(type) ?? [];
  const indexed = (type: string): Map<string, Row> => {
    const m = new Map<string, Row>();
    for (const r of rowsOf(type)) {
      const id = idOf(r.id);
      if (id !== null) m.set(id, r);
    }
    return m;
  };
  const maps = indexed('map');
  const zones = indexed('zone');
  const out = { no_point: 0, no_markers: 0, dangling: 0, no_map: 0 };

  // Markers: dangling first, then no_point; a Marker counts once.
  const placed = new Map<string, { zone: string; map: string; markers: Row[] }>();
  for (const mk of rowsOf('marker')) {
    const z = idOf(mk.zone);
    const m = idOf(mk.map);
    if (z === null || m === null || !zones.has(z) || !maps.has(m)) { out.dangling++; continue; }
    if (!(whole(mk.x) && whole(mk.y))) { out.no_point++; continue; }
    const key = JSON.stringify([z, m]);
    const group = placed.get(key);
    if (group) group.markers.push(mk); else placed.set(key, { zone: z, map: m, markers: [mk] });
  }

  const rowId = (mk: Row): string => idOf(mk.id) ?? '';
  const markerOrder = (a: Row, b: Row): number => {
    const oa = whole(a.order);
    const ob = whole(b.order);
    if (oa && ob && a.order !== b.order) return (a.order as number) - (b.order as number);
    if (oa !== ob) return oa ? -1 : 1;
    return byId(rowId(a), rowId(b));
  };

  const outlines: OwMapSpaceOutline[] = [];
  for (const zid of [...zones.keys()].sort(byId)) {
    const groups = [...placed.values()].filter((g) => g.zone === zid).sort((a, b) => byId(a.map, b.map));
    if (groups.length === 0) { out.no_markers++; continue; }
    const s = zones.get(zid)!.shape;
    const shape = s === 'line' ? 'line' : 'polygon';
    for (const g of groups) {
      outlines.push({ zone: zid, map: g.map, shape, points: [...g.markers].sort(markerOrder).map(point) });
    }
  }

  const pins: OwMapSpacePin[] = [];
  for (const p of [...rowsOf('pin')].sort((a, b) => byId(rowId(a), rowId(b)))) {
    const m = idOf(p.map);
    if (m === null || !maps.has(m)) { out.no_map++; continue; }
    if (!(whole(p.x) && whole(p.y))) { out.no_point++; continue; }
    let et = idOf(p.element_type);
    let ei = idOf(p.element_id);
    if (et === null || ei === null) et = ei = null; // a link needs both keys; one alone reads as neither
    const [x, y, z] = point(p);
    pins.push({ pin: rowId(p), map: m, element_type: et, element_id: ei, x, y, z });
  }

  const mapRows: OwMapSpaceMap[] = [];
  for (const mid of [...maps.keys()].sort(byId)) {
    const mp = maps.get(mid)!;
    const own: number[][] = [];
    for (const o of outlines) if (o.map === mid) own.push(...o.points);
    for (const q of pins) if (q.map === mid) own.push([q.x, q.y]);
    let measured = false;
    const slot = (key: 'width' | 'height', i: number): number | null => {
      const v = mp[key];
      if (whole(v)) return v;
      measured = true;
      return largest(own, i);
    };
    const width = slot('width', 0);
    const height = slot('height', 1);
    const sc = mp.x_metres_per_pixel;
    const row: OwMapSpaceMap = {
      id: mid,
      width,
      height,
      depth: whole(mp.depth) ? mp.depth : null,
      scale: typeof sc === 'number' && sc > 0 ? sc : null,
      location: idOf(mp.location),
      parent_map: idOf(mp.parent_map),
    };
    if (measured) row.extent = 'points';
    mapRows.push(row);
  }

  const counted: OwMapSpace['out'] = {};
  for (const k of ['no_point', 'no_markers', 'dangling', 'no_map'] as const) if (out[k] > 0) counted[k] = out[k];
  return { maps: mapRows, zones: outlines, pins, out: counted };
}
