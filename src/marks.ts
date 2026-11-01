// What a lore view leaves an element out by, in the lens profile's graph section's words: the room, the
// hidden mark, a proposal, map space and the reading aids. Each is read by the reader the lens and graph
// readers use (isRoomElement, handsOnAsProposed, readingAidKey, the hidden mark, the type), so a menu that
// asks "can this door open it" and worldGraph that asks "is it a node" give one answer. Light on purpose:
// the waymark entry reads it without the lens reader.

import { fold, isRoomElement, readingAidKey } from './room';
import { handsOnAsProposed } from './review';

/** One reason a lore view leaves an element out, as the graph section names it. */
export type OwElementMark = 'room' | 'hidden' | 'proposed' | 'map_space' | 'reading_aid';

/** The marks in the graph section's order. */
export const ELEMENT_MARKS: readonly OwElementMark[] = ['room', 'hidden', 'proposed', 'map_space', 'reading_aid'];

/** Map, Pin and Marker: the map space a lore view leaves out by default. A Zone is content. */
export const MAP_SPACE: ReadonlySet<string> = new Set(['map', 'pin', 'marker']);

/** The hidden mark on an element's own body: present and not null or false (folder spec §4.8). */
export function isHiddenMark(el: Record<string, unknown>): boolean {
  return el.hidden !== undefined && el.hidden !== null && el.hidden !== false;
}

/** The marks an element carries, in the graph section's order; [] for one a lore view keeps. Module-internal. */
export function marksOf(el: Record<string, unknown>): OwElementMark[] {
  const out: OwElementMark[] = [];
  if (isRoomElement(el as { type?: string })) out.push('room');
  if (isHiddenMark(el)) out.push('hidden');
  if (handsOnAsProposed(el)) out.push('proposed');
  if (typeof el.type === 'string' && MAP_SPACE.has(fold(el.type))) out.push('map_space');
  if (readingAidKey(el) !== null) out.push('reading_aid');
  return out;
}
