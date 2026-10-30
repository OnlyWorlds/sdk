// The strand profile (schema-dist profiles/strand.md, serial 98): a world in miniature, one story read off four
// links the standard already has. The World's mark x_strand names the story (a Narrative), one of its events and
// one of that event's places; the hero is the story's `protagonist` and where the hero is now is the hero's
// `location`. `strandOf` answers the six slots as one reader sees the world, through the lens reader's own view
// (lens.ts), never a second copy; the fixture, profiles/strand.fixture.json, is this file's own test. The Python
// package's `strand_of` gives the same answers on the same input.

import { Reading, checkReader, isBody } from './lens';
import type { OwLensWorld, OwLensReader } from './lens';

/** The World's field that carries the strand's mark. */
export const STRAND_FIELD = 'x_strand';

/** The world snapshot a strand is read from: the lens reader's world, the World's mark, and whether it is open to anyone. */
export interface OwStrandWorld extends OwLensWorld {
  /** The mark, `{narrative, event, location}`, three ids; any other shape is no mark. */
  x_strand?: unknown;
  /** True for a world open to anyone: only then does the public rung read anything of it. */
  open?: boolean | null;
}

/** A filled slot. */
export interface OwStrandSlot {
  id: string;
  name: string;
}

/** A world's strand as one reader sees it: five slots and whether then and now are one place. An empty slot is null. */
export interface OwStrand {
  /** The story: the Narrative the mark names. */
  narrative: OwStrandSlot | null;
  /** The happening: the Event the mark names, when it is in the story's `events`. */
  event: OwStrandSlot | null;
  /** The place, then: the Location the mark names, when it is in the event's `locations`. */
  location: OwStrandSlot | null;
  /** The hero: the story's `protagonist`. */
  character: OwStrandSlot | null;
  /** The place, now: the hero's `location`. */
  now: OwStrandSlot | null;
  /** True when `now` and `location` are both filled and one place, false when both filled and two, null otherwise. */
  same: boolean | null;
}

type Body = Record<string, unknown>;

const SLOTS = ['narrative', 'event', 'location'] as const;

const EMPTY = (): OwStrand => ({ narrative: null, event: null, location: null, character: null, now: null, same: null });

/** The mark's three ids, or null when the value is not the profile's shape (an object whose three members are each a non-empty string). */
function markOf(value: unknown): Record<(typeof SLOTS)[number], string> | null {
  if (!isBody(value)) return null;
  const v = value as Body;
  for (const slot of SLOTS) {
    if (typeof v[slot] !== 'string' || v[slot] === '') return null;
  }
  return { narrative: v.narrative as string, event: v.event as string, location: v.location as string };
}

/**
 * A world's strand as `reader` sees it (schema-dist profiles/strand.md): `{narrative, event, location, character,
 * now, same}`, each filled slot `{id, name}` and an empty one null.
 *
 * `narrative` is the element the mark names when it is a Narrative in the reader's view; with none, every slot is
 * empty. `event` is the element the mark names when it is an Event in the reader's view and in the story's `events`
 * as the reader is served them; `location` the element the mark names when it is a Location in the reader's view and
 * in that event's `locations`, empty when the event is. `character` is the story's `protagonist` when it is a
 * Character in the reader's view; `now` the hero's `location` when it is a Location in the reader's view, empty when
 * the hero is. `same` is true when `now` and `location` are both filled with one id, false when with two, else null.
 * A list's order is never read, and no slot is filled from another: not the hero from the event's `characters`, not
 * `location` from `now`, not `now` from `location`. Any mark that is not an object of three non-empty strings is no
 * mark, and the strand is empty.
 *
 * `world` holds the elements as the owner is served them (the hidden in `hidden` or each element's own `hidden`),
 * the World's `x_strand`, and `open: true` for a world open to anyone; `reader` is a lens reader (`OwLensReader`):
 * the owner, a contributor, a guest (its `whole` and `known_of` ids) or the public, which reads nothing of a world
 * that is not open. A slot's links are read from the body the reader is served, so a story known only as a stub
 * fills its own slot and nothing past it. Pure.
 */
export function strandOf(world: OwStrandWorld, reader: OwLensReader): OwStrand {
  if (!isBody(world) || !Array.isArray((world as Body).elements)) {
    throw new TypeError('strandOf: world is an object with an elements list.');
  }
  checkReader(reader, 'strandOf: reader');
  const out = EMPTY();
  const mark = markOf((world as Body)[STRAND_FIELD]);
  if (mark === null) return out;
  const r = new Reading(world as Body, reader, null);
  if (r.seenRung === 'public' && (world as Body).open !== true) return out;

  const seen = (id: unknown, type: string): id is string =>
    typeof id === 'string' && r.view.has(id) && r.typeOf.get(id) === type;
  const slot = (id: string): OwStrandSlot => {
    const name = r.body(id).name;
    return { id, name: typeof name === 'string' ? name : '' };
  };
  const listed = (holder: string, field: string, id: string): boolean => {
    const v = r.body(holder)[field];
    return Array.isArray(v) && v.includes(id);
  };

  if (!seen(mark.narrative, 'narrative')) return out;
  out.narrative = slot(mark.narrative);
  if (seen(mark.event, 'event') && listed(mark.narrative, 'events', mark.event)) {
    out.event = slot(mark.event);
    if (seen(mark.location, 'location') && listed(mark.event, 'locations', mark.location)) {
      out.location = slot(mark.location);
    }
  }
  const hero = r.body(mark.narrative).protagonist;
  if (seen(hero, 'character')) {
    out.character = slot(hero);
    const now = r.body(hero).location;
    if (seen(now, 'location')) out.now = slot(now);
  }
  if (out.now !== null && out.location !== null) out.same = out.now.id === out.location.id;
  return out;
}
