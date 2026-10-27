// The message profile (schema-dist profiles/message.md, serial 76): a message between the members
// of a world, a Narrative with supertype Message. To whom it is addressed, whether its sender is
// proved, who edited it, which messages a reader has read, a thread, and the Note beside them, which
// is not a message. MESSAGE_PAIR, NOTE_PAIR and MESSAGE_READ_MARK are generated from the vendored
// dist; the trim and the fold are the room profile's (room.ts), never a second copy. The fixture,
// profiles/message.fixture.json, is this file's own test.

import { MESSAGE_PAIR, MESSAGE_READ_MARK, NOTE_PAIR } from './v2/types.generated';
import { fold } from './room';
import { proposedMarkOf } from './review';
import { refuseUnknownOptions } from './options';

export { MESSAGE_PAIR, NOTE_PAIR };

/** What `senderStatus` answers: proved, contradicted, a claim nobody can check, or a sender hidden from this reader. */
export type OwSenderStatus = 'verified' | 'mismatch' | 'unverifiable' | 'unseen';

/**
 * The addressing readers' one option. `keyless`: the body was read with no credential (the keyless
 * public reader), which leaves hidden recipients out and never carries `x_served_trimmed`, so an
 * empty list cannot be told from one trimmed for the reader. False by default.
 */
export interface OwAddressingOptions {
  keyless?: boolean;
}
const ADDRESSING_KEYS = ['keyless'] as const;

/** `senderStatus`'s answer. */
export interface OwSender {
  status: OwSenderStatus;
  /** The message's `narrator`: the Character it claims as its sender, or null (show it as from nobody). */
  claimed: string | null;
  /** On a mismatch, the Character of the membership that wrote it (from `created_by`); null otherwise. */
  writtenBy: string | null;
}

/** `editedBy`'s answer. */
export interface OwEdited {
  /** True when a later hand changed the message: it carries `changed_by` and that is not its `created_by`. */
  edited: boolean;
  /** The Character the editing membership plays, or null: not edited, or the editor plays none, is off the members list, or there is no list. */
  by: string | null;
}

/** One row of the world's members list (`client.members()` gives `OwMember` rows); only `id` and `character` are read. */
export interface OwMessageMember {
  /** The membership id, what `created_by` holds; null for the owner, matching a `created_by` of null. */
  id?: string | null;
  /** The Character this member plays, or null (none, or hidden from the reader's key). */
  character?: string | null;
}

type Body = Record<string, unknown>;
type Members = readonly OwMessageMember[] | null | undefined;

const isBody = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: Body): unknown => v.id;
/** True when the body carries the key with a value (null counts: it is the owner's hand); a missing key or undefined does not. */
const carries = (v: Body, key: string): boolean => Object.prototype.hasOwnProperty.call(v, key) && v[key] !== undefined;

/** The type and supertype, each trimmed and folded as the room profile defines them, against one pair. */
function matchesPair(el: unknown, pair: { readonly type: string; readonly supertype: string }): el is Body {
  if (!isBody(el) || typeof el.type !== 'string' || typeof el.supertype !== 'string') return false;
  return fold(el.type) === fold(pair.type) && fold(el.supertype) === fold(pair.supertype);
}

/** The `options` of an addressing reader: an object or nothing (a bare `true` is a TypeError, never read as false). */
function keylessOf(fn: string, options: unknown): boolean {
  if (options !== undefined && options !== null && !isBody(options)) {
    throw new TypeError(`${fn}: options is an object, such as { keyless: true }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions(fn, options, ADDRESSING_KEYS);
  const keyless = isBody(options) ? options.keyless : undefined;
  if (keyless !== undefined && typeof keyless !== 'boolean') {
    throw new TypeError(`${fn}: keyless is true or false; got ${JSON.stringify(keyless) ?? typeof keyless}.`);
  }
  return keyless === true;
}

/**
 * The Character a membership plays: the row on the members list whose `id` is the membership
 * (`null` is the owner's row). Undefined when there is no list, no such row, or the row names no
 * Character.
 */
function characterOf(membership: unknown, members: Members): string | undefined {
  if (!Array.isArray(members)) return undefined;
  const row = members.find(m => isBody(m) && m.id === membership);
  return row !== undefined && typeof row.character === 'string' && row.character !== '' ? row.character : undefined;
}

/**
 * The Character of the hand that wrote a body: its `created_by` looked up on the members list.
 * Undefined when there is no hand to read: no `created_by` key (a folder, an export), no members
 * list, an author not on it, or a row that names no Character. `created_by` null is the owner.
 */
function handOf(body: Body, members: Members): string | undefined {
  return carries(body, 'created_by') ? characterOf(body.created_by, members) : undefined;
}

// A time a reader can order by: an RFC 3339 date-time, `YYYY-MM-DDTHH:MM:SS`, an optional fraction
// of a second after `.`, then `Z` or `+HH:MM` / `-HH:MM` (`T` and `Z` in either case), or the same
// with no zone, read as UTC. The date must exist (Gregorian, leap years), hours 00-23, minutes and
// seconds 00-59. ASCII digits only, the whole string, nothing trimmed. The Python package reads
// the same rule (message._instant); anything else is unreadable and sorts last.
const DATE_TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(?:[Zz]|([+-])([0-9]{2}):([0-9]{2}))?$/;

const floorDiv = (a: number, b: number): number => Math.floor(a / b);
const isLeap = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days from 1970-01-01 to a proleptic Gregorian date (exact integer arithmetic, any year 0000-9999). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400;
  const doy = floorDiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** A time as [whole seconds since the epoch, microseconds], so microseconds still order; null when unreadable. Module-internal (the lens reader orders by it too): not in the package's exports. */
export function timeKey(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null;
  const m = DATE_TIME.exec(value);
  if (m === null) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > (mo === 2 && isLeap(y) ? 29 : DAYS_IN[mo - 1]) || h > 23 || mi > 59 || s > 59) return null;
  let offset = 0;
  if (m[8] !== undefined) {
    const oh = Number(m[9]), om = Number(m[10]);
    if (oh > 23 || om > 59) return null;
    offset = (oh * 3600 + om * 60) * (m[8] === '-' ? -1 : 1);
  }
  const seconds = daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s - offset;
  return [seconds, Number(((m[7] ?? '') + '000000').slice(0, 6))];
}

/** Module-internal: not in the package's exports. */
export const compareKeys = (a: [number, number], b: [number, number]): number => a[0] - b[0] || a[1] - b[1];

/** By `created_at`; equal times keep the input's order (the server's list order); unreadable times last, in the input's order. Never by id. */
function inCreatedOrder<T extends object>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, key: timeKey((item as Body).created_at) }))
    .sort((a, b) => {
      if (a.key && b.key) return compareKeys(a.key, b.key) || a.index - b.index;
      if (a.key) return -1;
      if (b.key) return 1;
      return a.index - b.index;
    })
    .map(e => e.item);
}

/**
 * True when the element is a message: a Narrative with supertype `Message`, the type and the
 * supertype each trimmed (Unicode White_Space at both ends) and compared without regard to case,
 * the whole word (`Messages` is not one). A parlor's line (one carrying `x_room_of`) is a message
 * too. A message view (an inbox, a room, a thread) reads it by these rules; it stays an ordinary
 * Narrative in every other view.
 */
export function isMessage(element: object | null | undefined): boolean {
  return matchesPair(element, MESSAGE_PAIR);
}

/**
 * True when the element is a Note: a Narrative with supertype `Note` (`NOTE_PAIR`), trimmed and
 * folded as `isMessage` reads its pair. A Note is a member's own line in the world (`narrator` its
 * author's Character, `story` its text), never a message: it is addressed to nobody, never unread
 * and in no thread, whatever its `characters` holds. `noteOf` finds a Character's line.
 */
export function isNote(element: object | null | undefined): boolean {
  return matchesPair(element, NOTE_PAIR);
}

/**
 * The message's recipients: the Character ids in its `characters`, as written. An empty list
 * (the field absent, null or `[]`) means the message is addressed to every member of the world;
 * use `isAddressedTo` for the question "is it for X". No other field addresses a message. A Note
 * has no recipients: `[]`, whatever its `characters` holds.
 */
export function recipientsOf(message: object | null | undefined): string[] {
  const list = isBody(message) && !isNote(message) ? message.characters : undefined;
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && c !== '') : [];
}

/**
 * True when the message is addressed to the Character: its id is in `characters`, or `characters`
 * is empty (absent, null or `[]`) and the server did not trim it for this reader (`isToEveryone`).
 * An empty list whose `x_served_trimmed` names `characters` is to someone the reader cannot see and
 * addresses no Character the reader is given. Not `narrator`, not a name or an id in the text, not
 * any other link. A sender is not addressed by sending. An empty id (`""`) is no Character: nothing
 * is addressed to it, not even a message to everyone. A Note is addressed to nobody.
 */
export function isAddressedTo(message: object | null | undefined, characterId: string): boolean {
  if (!isBody(message) || isNote(message) || typeof characterId !== 'string' || characterId === '') return false;
  if (isToEveryone(message)) return true;
  const list = message.characters;
  return Array.isArray(list) && list.includes(characterId);
}

/**
 * True when the message is addressed to every member: its `characters` is absent, null or `[]`.
 * A list that names no valid id (`['']`) or a value that is not a list is addressed to nobody,
 * so it is false here, though `recipientsOf` gives `[]` for both. A list the server trimmed for
 * this reader (`x_served_trimmed` names `characters`) is never everyone, even when it arrives empty:
 * see `hasUnseenRecipients`. A body read keyless is never to everyone (`{ keyless: true }`): it
 * carries no mark, so an empty list may hold someone the reader cannot see. A Note is to nobody.
 */
export function isToEveryone(message: object | null | undefined, options?: OwAddressingOptions): boolean {
  const keyless = keylessOf('isToEveryone', options);
  if (!isBody(message) || isNote(message) || keyless || hasUnseenRecipients(message) === true) return false;
  const list = message.characters;
  return list === undefined || list === null || (Array.isArray(list) && list.length === 0);
}

/**
 * True when the message is addressed to someone this reader cannot see: the server served it with
 * `characters` trimmed (its `x_served_trimmed` list names `characters`), whatever is left in the
 * list. It says that such a recipient exists, never who or how many. Null for a body read keyless
 * (`{ keyless: true }`): it carries no mark, so the reader cannot say either way. False for a Note,
 * which has no recipients.
 */
export function hasUnseenRecipients(message: object | null | undefined, options?: OwAddressingOptions): boolean | null {
  const keyless = keylessOf('hasUnseenRecipients', options);
  if (!isBody(message) || isNote(message)) return false;
  if (keyless) return null;
  const mark = message.x_served_trimmed;
  return Array.isArray(mark) && mark.includes('characters');
}

/**
 * True when the message's `narrator` is the Character: the claim, whether or not `senderStatus`
 * proves it. A message with no `narrator` is sent by nobody: false for every id.
 */
export function isSentBy(message: object | null | undefined, characterId: string): boolean {
  return isBody(message) && typeof characterId === 'string' && characterId !== '' && message.narrator === characterId;
}

/**
 * Whether the message's sender is proved. The claimed sender is `narrator`; the author is the
 * membership in `created_by`, which the server records, and its Character is that membership's
 * `character` on the world's members list (`client.members()`; the owner's row has `id` null, matching
 * a `created_by` of null). `verified`: the author's Character is the narrator (a removed member's
 * row still proves it, and a Character taken by a new member verifies that member's messages: the
 * proof names the membership that wrote each one). `mismatch`: the narrator is another Character
 * than the author's, named in `writtenBy`; show "claims to be from <claimed>, written by
 * <writtenBy>'s key", never the plain sender. `unverifiable`: no narrator (show "from nobody"), no
 * `created_by` key at all (a folder, an export), no members list (pass null), the author not on
 * it, or its row naming no Character; show "claims to be from <claimed>". `unseen`: the sender is
 * hidden from this reader (no narrator, and the server's `x_served_trimmed` names `narrator`);
 * show "from someone you cannot see", never "from nobody". A body read keyless carries no mark, so
 * its missing narrator stays `unverifiable`. Never give an unverified sender the verified look.
 * An edit never changes the answer: see `editedBy`.
 */
export function senderStatus(message: object | null | undefined, members: Members): OwSender {
  const narrator = isBody(message) ? message.narrator : undefined;
  const claimed = typeof narrator === 'string' && narrator !== '' ? narrator : null;
  const mark = isBody(message) ? message.x_served_trimmed : undefined;
  if (claimed === null && Array.isArray(mark) && mark.includes('narrator')) return { status: 'unseen', claimed, writtenBy: null };
  if (claimed === null || !isBody(message)) return { status: 'unverifiable', claimed, writtenBy: null };
  const hand = handOf(message, members);
  if (hand === undefined) return { status: 'unverifiable', claimed, writtenBy: null };
  return hand === claimed
    ? { status: 'verified', claimed, writtenBy: null }
    : { status: 'mismatch', claimed, writtenBy: hand };
}

/**
 * Whether a later hand changed the message, and whose. The proof of sending is the first write,
 * `created_by`; the edit is the last hand, `changed_by` (null for the owner, as `created_by` is).
 * `edited` is true when the message carries `changed_by` and it is not equal to `created_by` (an
 * absent `created_by` is never equal). `by` is the Character the editing membership plays on the
 * members list; null when it plays none, is off the list, or there is no list (show "edited by
 * another hand"), and null whenever `edited` is false. A message with no `changed_by` (a folder,
 * an export) says nothing of edits. Shown beside the sender's answer, never instead of it.
 */
export function editedBy(message: object | null | undefined, members: Members): OwEdited {
  if (!isBody(message) || !carries(message, 'changed_by')) return { edited: false, by: null };
  if (carries(message, 'created_by') && message.changed_by === message.created_by) return { edited: false, by: null };
  return { edited: true, by: characterOf(message.changed_by, members) ?? null };
}

/**
 * The reader's read mark among the given Relations, or null when it has none (always null for an
 * empty id). A mark is a Relation with supertype `Read` (trimmed and folded like the pair) whose
 * `actor` is the reader, and it counts only when every write on it was the reader's own hand.
 * Its author: where it carries `created_by`, that membership on the members list must play the
 * reader's Character (`created_by` null is the owner's hand). Its last writer: where it carries
 * `changed_by` (null for the owner, as `created_by` is), that must equal its `created_by`, so a
 * mark another hand changed since it was made is ignored, the owner's hand included, and a mark
 * with `changed_by` but no `created_by` is ignored too (a writer with no creator is no hand). A
 * mark with neither key (a folder, an export) has no hand to check and counts. Of several that
 * count, the newest `updated_at` is the mark wherever it stands in the list (a readable time beats
 * an unreadable one; equal times keep the first); a newer one in another's hand is ignored and the
 * reader's own stands.
 */
export function readMarkOf<T extends object>(relations: readonly T[], characterId: string, members: Members): T | null {
  if (!Array.isArray(relations) || typeof characterId !== 'string' || characterId === '') return null;
  let mark: T | null = null;
  let markKey: [number, number] | null = null;
  for (const rel of relations) {
    if (!matchesPair(rel, MESSAGE_READ_MARK) || rel[MESSAGE_READ_MARK.readerField] !== characterId) continue;
    const hasAuthor = carries(rel, 'created_by');
    if (carries(rel, 'changed_by') && (!hasAuthor || rel.changed_by !== rel.created_by)) continue;
    if (hasAuthor && handOf(rel, members) !== characterId) continue;
    const key = timeKey(rel.updated_at);
    if (mark === null || (key !== null && (markKey === null || compareKeys(key, markKey) > 0))) {
      mark = rel as T;
      markKey = key;
    }
  }
  return mark;
}

/**
 * True when the body is the Character's own, written in its hand: a message for `unreadFor`, a
 * Note for `noteOf`. A body with no `created_by` key (a folder, an export) has no hand to check:
 * its `narrator` is trusted. One that carries `created_by` (the wire) is the Character's own only
 * when `senderStatus` proves it: the author's Character, on the members list, is the Character.
 * Decided per body.
 */
function isOwnHand(body: Body, characterId: string, members: Members): boolean {
  if (!carries(body, 'created_by')) return body.narrator === characterId;
  const sender = senderStatus(body, members);
  return sender.status === 'verified' && sender.claimed === characterId;
}

/**
 * The messages unread for the Character, in `created_at` order (equal times keep the input's
 * order; a `created_at` that cannot be read as a date and time comes after every one that can):
 * addressed to it (`isAddressedTo`; an empty id is addressed by nothing, a Note never), not its
 * own, and not on its read mark's `narratives`. Its own: where a message carries no `created_by`
 * (a folder, an export), its `narrator` is trusted, so one whose narrator is the reader is not
 * unread. Where it carries `created_by` (the wire), only a verified sender makes it the reader's
 * own (`senderStatus` against `members`: the author's Character is the reader); a claim never
 * makes a message read for the Character it names, so a mismatch, an author off the list or
 * playing no Character, and every wire message when `members` is not given, stays unread for the
 * Character it claims. Pass the world's members list (`client.members()`) for wire data. `readMark`
 * is `readMarkOf`'s answer; null means no mark, so everything addressed is unread. An id on the
 * mark that names a message not addressed to the reader changes nothing. Pass messages
 * (`isMessage`); every element given but a Note is read as one.
 */
export function unreadFor<T extends object>(
  messages: readonly T[],
  characterId: string,
  readMark: object | null | undefined,
  members?: readonly OwMessageMember[] | null,
): T[] {
  if (!Array.isArray(messages)) return [];
  const onMark = isBody(readMark) ? readMark[MESSAGE_READ_MARK.messagesField] : undefined;
  const read = new Set(Array.isArray(onMark) ? onMark.filter(id => typeof id === 'string') : []);
  return inCreatedOrder(messages.filter(m => {
    if (!isBody(m) || !isAddressedTo(m, characterId)) return false;
    return !isOwnHand(m, characterId, members) && !read.has(idOf(m) as string);
  }));
}

/**
 * The thread of a root message: every message whose chain of `parent_narrative` reaches the root,
 * the root included, in `created_at` order (equal times keep the input's order; unreadable times
 * last). A walk stops at an id it has already visited, so a loop in the chain ends it, and at a
 * `parent_narrative` that is not a string id (a number, null, an object): the chain ends there. A
 * message whose chain leaves the given list is not in the thread unless its chain reached the root
 * first. A Note is in no thread: it is never listed, though a chain walks through its
 * `parent_narrative` like any other (a reply to a Note that answers the root is in the thread).
 */
export function threadOf<T extends object>(messages: readonly T[], rootId: string): T[] {
  if (!Array.isArray(messages) || typeof rootId !== 'string' || rootId === '') return [];
  const byId = new Map<string, Body>();
  for (const m of messages) {
    const id = isBody(m) ? idOf(m) : undefined;
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, m as Body);
  }
  const reaches = (start: Body): boolean => {
    const seen = new Set<string>();
    let at: Body | undefined = start;
    while (at !== undefined) {
      const id = idOf(at);
      if (id === rootId) return true;
      if (typeof id !== 'string' || seen.has(id)) return false;
      seen.add(id);
      const parent: unknown = at.parent_narrative;
      if (parent === rootId) return true;
      at = typeof parent === 'string' ? byId.get(parent) : undefined;
    }
    return false;
  };
  return inCreatedOrder(messages.filter(m => isBody(m) && !isNote(m) && reaches(m)));
}

/**
 * The Character's line: the id of the Character's newest own-hand Note among the given
 * Narratives, or null when it has none (always null for an empty id). A Note (`isNote`) counts
 * when its `narrator` is the Character, it is in its author's hand (no `created_by` key, a folder:
 * the narrator is trusted; with `created_by`, the wire: `senderStatus` against `members` is
 * `verified`, so a mismatch or an unverifiable Note is nobody's), it is not hidden
 * (the platform's hidden mark: any `hidden` but absent, null or false, as every reader of this package
 * reads it) and not proposed (`x_review_proposed` an object, the review profile), and its
 * id is a string. Of those, the newest by `created_at` (the last in `created_at` order among those
 * whose time can be read; equal times: the later in the list), or the last in the list when none
 * can be read. A Note is never a message: it is never unread and in no thread.
 */
/** The hidden mark as every reader in this package reads it: any value but absent, null and false, so a doubt is left out. */
const isHiddenMark = (value: unknown): boolean => value !== undefined && value !== null && value !== false;

export function noteOf(narratives: readonly object[], characterId: string, members: Members): string | null {
  if (!Array.isArray(narratives) || typeof characterId !== 'string' || characterId === '') return null;
  let line: string | null = null;
  let lineKey: [number, number] | null = null;
  for (const el of narratives) {
    if (!isNote(el)) continue;
    const note = el as Body;
    const id = idOf(note);
    if (typeof id !== 'string' || id === '' || note.narrator !== characterId) continue;
    if (isHiddenMark(note.hidden) || proposedMarkOf(note) !== null || !isOwnHand(note, characterId, members)) continue;
    const key = timeKey(note.created_at);
    // A readable time beats an unreadable one; the newer, or the later of two equal, wins.
    if (line === null || (key !== null ? lineKey === null || compareKeys(key, lineKey) >= 0 : lineKey === null)) {
      line = id;
      lineKey = key;
    }
  }
  return line;
}
