/**
 * The draughtText fixture, test/fixtures/draught-text/: one folder per case, `draught.json` (a draught
 * body) and `expected.txt` (its text), and MANIFEST.json (each file's sha256). The Python package
 * vendors the folder byte for byte and replays it against draught_text.
 *
 * The real cases (`as-of-*`) are server answers, kept as served; this script never writes their
 * draught.json. The planted cases are small packets made from the as-of-453 packet's shape, each with
 * a `-compact` twin made by the server's compact rule (each element body less its null, "", [] and {}
 * fields, id, type and name kept; then each empty section and an empty cut left out, the frame kept),
 * except the cases in NO_TWIN. A float the file must write as `249.0` goes in as F('249.0').
 * Every expected.txt is the compiled draughtText's answer.
 *
 *   npm run build && node test/fixtures/generate-draught-text.mjs --write
 *
 * Without --write it writes nothing and exits 1 on any file that differs from what it would write, so
 * `npm test` (which runs every .mjs under test/) catches a stale fixture.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draughtText } from '../../dist/index.js';

const DIR = fileURLToPath(new URL('./draught-text/', import.meta.url));
const WRITE = process.argv.includes('--write');

const clone = (v) => structuredClone(v);
const cp = (...points) => String.fromCodePoint(...points);

const real = JSON.parse(readFileSync(join(DIR, 'as-of-453', 'draught.json'), 'utf8'));
const herId = real.character.element.id;
const byName = (rows, name) => clone(rows.find((r) => r.element.name === name));

// Ids no element in any packet holds, and membership ids.
const NOT_HELD = ['0699aa00-0000-7000-8000-00000000a001', '0699aa00-0000-7000-8000-00000000a002', '0699aa00-0000-7000-8000-00000000a003'];
const M = ['5b0c4a1e-2f3d-4e5a-8b6c-7d8e9f000001', '5b0c4a1e-2f3d-4e5a-8b6c-7d8e9f000002', '5b0c4a1e-2f3d-4e5a-8b6c-7d8e9f000003', '5b0c4a1e-2f3d-4e5a-8b6c-7d8e9f000004'];

/** A small packet in the real one's shape: her element with four of its links, one Event, one Construct, five sheet rows, the owner. */
function base() {
  const d = clone(real);
  for (const f of ['languages', 'objects', 'institutions', 'family']) d.character.element[f] = [];
  d.events = d.events.slice(0, 1);
  d.names = { construct: d.names.construct.slice(0, 1) };
  d.sheet = ['Puddleton', 'Feltropolis', 'Moppet', 'Puddle Moppet', 'Captain Snoot'].map((n) => byName(real.sheet, n));
  d.roster = [clone(real.roster[0])];
  return d;
}

/** The server's compact rule (see the head of this file). */
function compact(d) {
  const empty = (v) => v === null || v === '' || (typeof v === 'object' && (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0));
  const body = (el) => Object.fromEntries(Object.entries(el).filter(([k, v]) => ['id', 'type', 'name'].includes(k) || !empty(v)));
  const c = clone(d);
  if (c.character) c.character.element = body(c.character.element);
  if (c.style) c.style.element = body(c.style.element);
  for (const k of ['role', 'work', 'events', 'knowledge', 'sheet', 'messages', 'room', 'proposed']) {
    for (const r of c[k] ?? []) r.element = body(r.element);
  }
  for (const rows of Object.values(c.names ?? {})) for (const r of rows) r.element = body(r.element);
  c.policy.compact = true;
  const always = new Set(['world', 'calendar', 'as_of', 'now', 'mode', 'policy']);
  return Object.fromEntries(Object.entries(c).filter(([k, v]) => always.has(k) || v === null || typeof v !== 'object' || !empty(v)));
}

/** A row in the packet's shape. */
const row = (element, via, extra = {}) => ({ via, her_links: 1, grade: 'whole', ...extra, element });

const PLANTED = {
  // Marks are words: hidden and proposed on rows, and on her own element.
  'hidden-and-proposed': (d) => {
    d.character.element.hidden = true;
    d.sheet[0].element.hidden = true;
    d.events[0].element.x_review_proposed = { by: M[0], expires: '2026-11-30' };
    d.names.construct[0].element.hidden = true;
    d.names.construct[0].element.x_review_proposed = { by: M[0] };
  },
  // The door history keel serves a member (keel #760): never a field line.
  'doors': (d) => {
    d.character.element.doors = { atlas: '2026-10-29T14:31:07.123456Z', site: '2026-10-29T14:20:00Z' };
    d.sheet[0].element.doors = { mcp: '2026-10-29T14:33:00Z' };
  },
  // What the budget left out, two keys in the server's order.
  'cut': (d) => {
    d.cut = { events: 3, proposed: 1 };
  },
  // She is hidden from this reader.
  'character-null': (d) => {
    d.character = null;
  },
  // Line breaks (CRLF, a lone CR, a blank line, a trailing CRLF) and text beyond Latin: Greek, Japanese,
  // an emoji outside the BMP, and a combining acute accent.
  'text': (d) => {
    const greek = cp(0x1f08, 0x3b8, 0x3ae, 0x3bd, 0x3b1, 0x3b9);
    const japanese = cp(0x6c34, 0x305f, 0x307e, 0x308a);
    const duck = cp(0x1f986);
    const accented = `cafe${cp(0x301)}`;
    const el = d.character.element;
    el.description = `First line.\r\nSecond line, after a CRLF.\rThird line, after a lone CR.\r\n\r\nAfter a blank line: ${greek}, ${japanese}, ${duck}, ${accented}.`;
    el.mentality = `Dreams of ${japanese} and ${duck}.`;
    d.sheet[0].element.description = `Two lines\r\nand a trailing break\r\n`;
    d.sheet[1].element.name = `Feltropolis ${duck}`;
    d.events[0].element.description = `${accented}\r${greek}`;
  },
  // Read through the caller's view.
  'act': (d) => {
    d.mode = 'act';
    d.policy.mode = 'act';
  },
  // No horizon.
  'no-as-of': (d) => {
    d.as_of = null;
    d.policy.as_of = null;
  },
  // No time unit: the dates are bare integers.
  'no-unit': (d) => {
    d.calendar.time_basic_unit = '';
  },
  // Links to ids the packet does not hold: one alone, two beside a resolved name, one alone in a list.
  'links-not-held': (d) => {
    const el = d.character.element;
    el.birthplace = NOT_HELD[0];
    el.species = [d.sheet[2].element.id, NOT_HELD[1], NOT_HELD[2]];
    el.rivals = [NOT_HELD[2]];
    d.sheet = d.sheet.filter((r) => !['Puddleton', 'Puddle Moppet', 'Captain Snoot'].includes(r.element.name));
  },
  // Names by two types, in the object's own order.
  'names-two-types': (d) => {
    d.names = { relation: clone(real.names.relation), construct: clone(real.names.construct) };
  },
  // The three sections served only when named.
  'messages-room-proposed': (d) => {
    const at = d.policy.components.indexOf('roster');
    d.policy.components.splice(at, 0, 'messages', 'room', 'proposed');
    const roster = d.roster;
    delete d.roster;
    d.messages = [row({
      type: 'narrative', id: '0699bb00-0000-7000-8000-00000000b001', name: 'Re: the patrol',
      description: 'Hold the line at the Crumblefields.', supertype: 'Message', subtype: '',
      characters: [herId], start_date: null, x_room_of: real.world.id,
    }, ['characters'], { author: { membership: M[0], kind: 'agent', role: 'co_builder' } })];
    d.room = [row({
      type: 'narrative', id: '0699bb00-0000-7000-8000-00000000b002', name: 'Patrol board',
      description: '', supertype: 'Board', subtype: null, characters: [herId], start_date: 451, x_room_of: real.world.id,
    }, ['characters'])];
    d.proposed = [row({
      type: 'location', id: '0699bb00-0000-7000-8000-00000000b003', name: 'Drip Harbor',
      description: 'A harbor someone proposed.', supertype: 'Settlement', subtype: '', parent_location: null,
      x_review_proposed: { by: M[0], expires: '2026-11-30' },
    }, [])];
    d.roster = roster;
  },
  // What changed around her: an upsert by the owner, a delete by an unrecorded writer, writers by
  // membership (named on the roster, and not on it), a door left off, and more than these.
  'recent': (d) => {
    d.policy.since = 'c1';
    d.recent_cursor = 'c9';
    d.recent_more = true;
    d.recent = [
      { op: 'upsert', type: 'character', id: herId, when: '2026-10-20T09:15:00.000000+00:00', who: 'owner', door: 'site' },
      { op: 'delete', type: 'object', id: NOT_HELD[0], when: '2026-10-21T10:00:00.000000+00:00', who: null, door: null },
      { op: 'upsert', type: 'event', id: d.events[0].element.id, when: '2026-10-22T11:30:00.000000+00:00', who: M[0], door: 'seat' },
      { op: 'upsert', type: 'location', id: d.sheet[0].element.id, when: '2026-10-23T12:45:00.000000+00:00', who: M[3], door: 'api' },
    ];
    d.roster.push({ id: M[0], kind: 'agent', role: 'co_builder', character: null, status: 'active', name: 'Harbor Scribe' });
  },
  // Who plays whom: the owner playing her, a member playing a Character the packet holds, one playing a
  // Character it does not, a removed member, and a member with no name.
  'roster': (d) => {
    d.roster = [
      { id: null, kind: 'owner', role: 'owner', character: herId, status: 'active' },
      { id: M[0], kind: 'agent', role: 'co_builder', character: d.sheet[4].element.id, status: 'active', name: 'Harbor Scribe' },
      { id: M[1], kind: 'player', role: 'guest', character: NOT_HELD[0], status: 'active', name: 'Tide Reader' },
      { id: M[2], kind: 'agent', role: 'contributor', character: null, status: 'removed', name: 'Old Hand' },
      { id: M[3], kind: 'person', role: 'contributor', character: null, status: 'active' },
    ];
  },
  // No cut key at all.
  'cut-absent': (d) => {
    delete d.cut;
  },
  // Nothing in any section: her links all point outside the packet.
  'empty': (d) => {
    Object.assign(d, { role: [], work: [], style: null, events: [], knowledge: [], names: {}, sheet: [], recent: [], roster: [] });
  },
  // A float with an integral value reads as that integer wherever a number is read (written 249.0 in
  // the file); a fraction is skipped.
  'float-integral': (d) => {
    d.as_of = F('300.0');
    d.policy.as_of = F('300.0');
    d.now = F('453.0');
    d.character.element.birth_date = F('249.0');
    d.character.element.height = 1.5;
    d.events[0].element.start_date = F('249.0');
    d.cut = { events: F('2.0') };
  },
  // `self` not asked: no character key at all, so no block of her own and nothing said hidden.
  'no-self': (d) => {
    d.policy.components = d.policy.components.filter((c) => c !== 'self');
    delete d.character;
  },
  // More changes than these, and no rows read.
  'recent-more-only': (d) => {
    d.policy.since = 'c1';
    d.recent_cursor = 'c1';
    d.recent_more = true;
    d.recent = [];
  },
  // Line breaks in field values, a blank line among them, and in the description.
  'field-line-breaks': (d) => {
    const el = d.character.element;
    el.description = 'Admiral of the Puddle Navy.\r\n\r\nPink felt, immaculately kept.';
    el.background = 'Son of Admiral Stuffington.\r\nNaval Academy graduate.\r\n\r\nCarries an eye.';
    el.mentality = 'Duty first.\rDenial second.\n';
  },
  // Line breaks in values outside her field lines: her name (title, frame, heading), the world's name,
  // a row's name, a recent row's time and a member's role, each continued two spaces in.
  'value-line-breaks': (d) => {
    d.world.name = 'Moppet\r\nopia';
    d.character.element.name = 'Admiral\rFluffington';
    d.sheet[1].element.name = 'Felt\r\n\r\nropolis';
    d.policy.since = 'c1';
    d.recent_cursor = 'c2';
    d.recent_more = false;
    d.recent = [{ op: 'upsert', type: 'character', id: herId, when: '2026-10-20\nT09:15', who: 'owner', door: 'site' }];
    d.roster = [{ id: null, kind: 'owner', role: 'own\ner', character: herId, status: 'active' }];
  },
  // Proposed is a present mark (handsOnAsProposed): false is, and "" and {} are empty, so settled, as
  // compact drops them (no compact twin: compact drops "" and {}).
  'proposed-odd-values': (d) => {
    d.events[0].element.x_review_proposed = false;
    d.names.construct[0].element.x_review_proposed = '';
    d.sheet[0].element.x_review_proposed = {};
    d.sheet[1].element.x_review_proposed = null;
    d.sheet[2].element.hidden = false;
  },
  // Unset names, a recent row with no time and one with an op the text does not know, list items that
  // are neither strings nor integers, a non-dated type with a date, and cut counts that are not integers.
  'ratified-edges': (d) => {
    d.world.name = '';
    d.policy.since = 'c1';
    d.recent_cursor = 'c3';
    d.recent_more = false;
    d.recent = [
      { op: 'upsert', type: 'character', id: herId, when: null, who: 'owner', door: 'site' },
      { op: 'touch', type: 'location', id: d.sheet[0].element.id, when: '2026-10-24T08:00:00.000000+00:00', who: null, door: null },
    ];
    const el = d.character.element;
    el.species = [d.sheet[2].element.id, 7, null, { id: d.sheet[3].element.id }, d.sheet[3].element.id];
    el.nicknames = ['Fluff', 3, true, null, 2.5, {}, 'Admiral F'];
    d.sheet[4].element.name = '';
    d.names.location = [row({
      type: 'location', id: '0699bb00-0000-7000-8000-00000000b004', name: 'Old Drydock', description: '',
      supertype: 'Ruin', subtype: '', start_date: 120,
    }, ['locations'])];
    d.cut = { events: '3', proposed: 1.5 };
  },
};

/** The planted cases with no compact twin, and why. */
const NO_TWIN = { 'proposed-odd-values': 'compact drops "" and {} from a body, so the mark goes with them' };

/** A float as a file writes it (`249.0`): JSON.stringify writes 249, so the value is a marker until the text is out. */
function F(literal) {
  return `@@float:${literal}@@`;
}
const floats = (text) => text.replace(/"@@float:([-0-9.eE+]+)@@"/g, '$1');
const json = (v) => floats(`${JSON.stringify(v, null, 2)}\n`);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Every file the fixture holds, by its path under DIR, as bytes. */
const files = new Map();
for (const [name, plant] of Object.entries(PLANTED)) {
  const d = base();
  plant(d);
  files.set(`${name}/draught.json`, Buffer.from(json(d), 'utf8'));
  if (!(name in NO_TWIN)) files.set(`${name}-compact/draught.json`, Buffer.from(json(compact(d)), 'utf8'));
}
for (const literal of ['"start_date": 249.0', '"as_of": 300.0', '"now": 453.0']) {
  for (const path of ['float-integral/draught.json', 'float-integral-compact/draught.json']) {
    if (!files.get(path).toString('utf8').includes(literal)) throw new Error(`${path} lost ${literal} on the way out`);
  }
}
for (const name of readdirSync(DIR).filter((n) => n.startsWith('as-of-'))) {
  files.set(`${name}/draught.json`, readFileSync(join(DIR, name, 'draught.json')));
}
for (const path of [...files.keys()].filter((p) => p.endsWith('/draught.json'))) {
  const text = draughtText(JSON.parse(files.get(path).toString('utf8')));
  files.set(path.replace(/draught\.json$/, 'expected.txt'), Buffer.from(text, 'utf8'));
}
const manifest = { files: Object.fromEntries([...files.keys()].sort().map((p) => [p, sha256(files.get(p))])) };
files.set('MANIFEST.json', Buffer.from(json(manifest), 'utf8'));

let stale = 0;
for (const [path, bytes] of files) {
  const at = join(DIR, path);
  if (WRITE) {
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, bytes);
  } else if (!existsSync(at) || !readFileSync(at).equals(bytes)) {
    console.error(`stale: ${path}`);
    stale += 1;
  }
}
if (WRITE) console.log(`wrote ${files.size} files, ${(files.size - 1) / 2} cases`);
else if (stale) {
  console.error(`${stale} fixture file(s) differ from what generate-draught-text.mjs writes: npm run build, then run it with --write`);
  process.exit(1);
}
