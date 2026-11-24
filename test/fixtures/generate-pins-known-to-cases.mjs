/**
 * Writes test/fixtures/pins-known-to.cases.json: the cases pinsKnownTo is held to here and pins_known_to is held to
 * in the Python package (the same bytes in both repositories; each test pins the file's sha256).
 *
 * Every want is written by hand below. No answer here comes from the reader.
 * Run: node test/fixtures/generate-pins-known-to-cases.mjs  (then move both tests' sha256).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const u = (...points) => String.fromCodePoint(...points);
const FULLWIDTH_TILDE = u(0xff5e); // one UTF-16 unit, above every surrogate
const DRAGON = u(0x1f409); // one code point, two UTF-16 units: after the tilde by code point, before it by unit

const pin = (id, map, type, element, more = {}) => ({ type: 'pin', id, map, element_type: type, element_id: element, x: 10, y: 20, ...more });
const el = (type, id, more = {}) => ({ type, id, name: `${type} ${id}`, ...more });
const stub = (type, id) => el(type, id, { known_of: true });
const known = (p, map, type, element, how) => ({ pin: p, map, element_type: type, element_id: element, how });

const cases = [
  {
    name: 'a Pin whose element was served whole',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [el('location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'location', 'loc-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'a Pin whose element was served as a stub',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [stub('location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'location', 'loc-1', 'known_of')], unknown: 0, out: {} },
  },
  {
    name: 'a Pin whose element was not served',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [el('location', 'loc-2')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'nothing served: every linked Pin is unknown',
    pins: [pin('p1', 'm1', 'location', 'loc-1'), pin('p2', 'm1', 'character', 'cha-1')],
    served: [],
    want: { known: [], unknown: 2, out: {} },
  },
  {
    name: 'no Pins',
    pins: [],
    served: [el('location', 'loc-1')],
    want: { known: [], unknown: 0, out: {} },
  },
  {
    name: 'one of each: whole, stub, unseen, no link',
    pins: [
      pin('p4', 'm1', undefined, undefined),
      pin('p3', 'm1', 'event', 'eve-1'),
      pin('p2', 'm2', 'institution', 'ins-1'),
      pin('p1', 'm1', 'character', 'cha-1'),
    ],
    served: [el('character', 'cha-1'), stub('institution', 'ins-1'), el('event', 'eve-2')],
    want: {
      known: [known('p1', 'm1', 'character', 'cha-1', 'whole'), known('p2', 'm2', 'institution', 'ins-1', 'known_of')],
      unknown: 1,
      out: { no_link: 1 },
    },
  },
  {
    name: 'the type is read as written: the Pin says Location, the row location',
    pins: [pin('p1', 'm1', 'Location', 'loc-1')],
    served: [el('location', 'loc-1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'the type is read as written: the row says Location, the Pin location',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [el('Location', 'loc-1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'a type that is no element type is matched as written all the same',
    pins: [pin('p1', 'm1', 'wizard', 'w-1')],
    served: [el('wizard', 'w-1')],
    want: { known: [known('p1', 'm1', 'wizard', 'w-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'the same id under another type is another element',
    pins: [pin('p1', 'm1', 'location', 'x-1')],
    served: [el('character', 'x-1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'the id is read as written: another case is another id',
    pins: [pin('p1', 'm1', 'location', 'LOC-1')],
    served: [el('location', 'loc-1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'two served rows of one type and id, whole then stub: the last decides',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [el('location', 'loc-1'), stub('location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'location', 'loc-1', 'known_of')], unknown: 0, out: {} },
  },
  {
    name: 'two served rows of one type and id, stub then whole: the last decides',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [stub('location', 'loc-1'), el('location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'location', 'loc-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'a stub of another type with the same id does not make a whole element a stub',
    pins: [pin('p1', 'm1', 'location', 'x-1')],
    served: [el('location', 'x-1'), stub('character', 'x-1')],
    want: { known: [known('p1', 'm1', 'location', 'x-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'known_of is a stub only when it is true',
    pins: [
      pin('p1', 'm1', 'location', 'loc-1'),
      pin('p2', 'm1', 'location', 'loc-2'),
      pin('p3', 'm1', 'location', 'loc-3'),
      pin('p4', 'm1', 'location', 'loc-4'),
      pin('p5', 'm1', 'location', 'loc-5'),
    ],
    served: [
      el('location', 'loc-1', { known_of: 'true' }),
      el('location', 'loc-2', { known_of: 1 }),
      el('location', 'loc-3', { known_of: false }),
      el('location', 'loc-4', { known_of: null }),
      el('location', 'loc-5', { known_of: true }),
    ],
    want: {
      known: [
        known('p1', 'm1', 'location', 'loc-1', 'whole'),
        known('p2', 'm1', 'location', 'loc-2', 'whole'),
        known('p3', 'm1', 'location', 'loc-3', 'whole'),
        known('p4', 'm1', 'location', 'loc-4', 'whole'),
        known('p5', 'm1', 'location', 'loc-5', 'known_of'),
      ],
      unknown: 0,
      out: {},
    },
  },
  {
    name: 'a served row that is no element is not read',
    pins: [
      pin('p1', 'm1', 'location', 'loc-1'),
      pin('p2', 'm1', 'location', 'loc-2'),
      pin('p3', 'm1', 'location', '7'),
      pin('p4', 'm1', 'location', 'loc-4'),
    ],
    served: [
      { id: 'loc-1', name: 'no type' },
      { type: 7, id: 'loc-2' },
      { type: 'location', id: 7 },
      { type: 'location', id: '' },
      { type: 'location' },
      null,
      'loc-4',
      ['location', 'loc-4'],
      [{ type: 'location', id: 'loc-4' }],
    ],
    want: { known: [], unknown: 4, out: {} },
  },
  {
    name: 'a Pin with only a type, only an id, empty words or nulls places nothing',
    pins: [
      { type: 'pin', id: 'p1', map: 'm1', element_type: 'location' },
      { type: 'pin', id: 'p2', map: 'm1', element_id: 'loc-1' },
      { type: 'pin', id: 'p3', map: 'm1', element_type: '', element_id: 'loc-1' },
      { type: 'pin', id: 'p4', map: 'm1', element_type: 'location', element_id: '' },
      { type: 'pin', id: 'p5', map: 'm1', element_type: null, element_id: null },
      { type: 'pin', id: 'p6', map: 'm1' },
      { type: 'pin', id: 'p7', map: 'm1', element_type: 'location', element_id: 7 },
      { type: 'pin', id: 'p8', map: 'm1', element_type: ['location'], element_id: 'loc-1' },
    ],
    served: [el('location', 'loc-1'), el('location', ''), el('', 'loc-1'), { type: 'location', id: 7 }],
    want: { known: [], unknown: 0, out: { no_link: 8 } },
  },
  {
    name: 'the map is echoed as written, and null when it is no id',
    pins: [
      pin('p1', 'm-not-served', 'location', 'loc-1'),
      pin('p2', '', 'location', 'loc-1'),
      pin('p3', null, 'location', 'loc-1'),
      pin('p4', 7, 'location', 'loc-1'),
      { type: 'pin', id: 'p5', element_type: 'location', element_id: 'loc-1' },
      pin('p6', ' m1 ', 'location', 'loc-1'),
    ],
    served: [el('location', 'loc-1')],
    want: {
      known: [
        known('p1', 'm-not-served', 'location', 'loc-1', 'whole'),
        known('p2', null, 'location', 'loc-1', 'whole'),
        known('p3', null, 'location', 'loc-1', 'whole'),
        known('p4', null, 'location', 'loc-1', 'whole'),
        known('p5', null, 'location', 'loc-1', 'whole'),
        known('p6', ' m1 ', 'location', 'loc-1', 'whole'),
      ],
      unknown: 0,
      out: {},
    },
  },
  {
    name: 'a Pin with no point is answered all the same',
    pins: [{ type: 'pin', id: 'p1', map: 'm1', element_type: 'location', element_id: 'loc-1' }, pin('p2', 'm1', 'location', 'loc-1', { x: 'ten', y: null })],
    served: [el('location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'location', 'loc-1', 'whole'), known('p2', 'm1', 'location', 'loc-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'two Pin rows with one id, known then unseen: the last is read',
    pins: [pin('p1', 'm1', 'location', 'loc-1'), pin('p1', 'm2', 'location', 'loc-9')],
    served: [el('location', 'loc-1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'two Pin rows with one id, unseen then known: the last is read',
    pins: [pin('p1', 'm1', 'location', 'loc-9'), pin('p1', 'm2', 'location', 'loc-1')],
    served: [el('location', 'loc-1')],
    want: { known: [known('p1', 'm2', 'location', 'loc-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'two Pin rows with one id, linked then with no link: the last is read',
    pins: [pin('p1', 'm1', 'location', 'loc-1'), { type: 'pin', id: 'p1', map: 'm1' }],
    served: [el('location', 'loc-1')],
    want: { known: [], unknown: 0, out: { no_link: 1 } },
  },
  {
    name: 'rows that are no Pin are not read and not counted',
    pins: [
      el('map', 'm1'),
      el('location', 'loc-1', { element_type: 'location', element_id: 'loc-1' }),
      { type: 'Pin', id: 'p1', map: 'm1', element_type: 'location', element_id: 'loc-1' },
      { type: 'pin', map: 'm1', element_type: 'location', element_id: 'loc-1' },
      { type: 'pin', id: '', map: 'm1', element_type: 'location', element_id: 'loc-1' },
      { type: 'pin', id: 7, map: 'm1', element_type: 'location', element_id: 'loc-1' },
      { id: 'p2', map: 'm1', element_type: 'location', element_id: 'loc-1' },
      null,
      'pin',
      [pin('p3', 'm1', 'location', 'loc-1')],
      pin('p9', 'm1', 'location', 'loc-1'),
    ],
    served: [el('location', 'loc-1')],
    want: { known: [known('p9', 'm1', 'location', 'loc-1', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'a served Pin does not make what it places known',
    pins: [pin('p1', 'm1', 'location', 'loc-1')],
    served: [pin('p1', 'm1', 'location', 'loc-1'), el('map', 'm1')],
    want: { known: [], unknown: 1, out: {} },
  },
  {
    name: 'a Pin that places a Pin is known when that Pin was served',
    pins: [pin('p1', 'm1', 'pin', 'p2'), pin('p2', 'm1', 'location', 'loc-1')],
    served: [pin('p2', 'm1', 'location', 'loc-1')],
    want: { known: [known('p1', 'm1', 'pin', 'p2', 'whole')], unknown: 1, out: {} },
  },
  {
    name: 'a Pin that places the reader\'s own Character',
    pins: [pin('p1', 'm1', 'character', 'cha-self')],
    served: [el('character', 'cha-self', { self: true })],
    want: { known: [known('p1', 'm1', 'character', 'cha-self', 'whole')], unknown: 0, out: {} },
  },
  {
    name: 'several Pins on several Maps place one element: each is known',
    pins: [pin('p3', 'm3', 'location', 'loc-1'), pin('p1', 'm1', 'location', 'loc-1'), pin('p2', 'm2', 'location', 'loc-1')],
    served: [stub('location', 'loc-1')],
    want: {
      known: [
        known('p1', 'm1', 'location', 'loc-1', 'known_of'),
        known('p2', 'm2', 'location', 'loc-1', 'known_of'),
        known('p3', 'm3', 'location', 'loc-1', 'known_of'),
      ],
      unknown: 0,
      out: {},
    },
  },
  {
    name: 'known is ordered by Pin id as text: a capital before a small letter, 10 before 9',
    pins: [
      pin('pin-a', 'm1', 'location', 'loc-1'),
      pin('pin-9', 'm1', 'location', 'loc-1'),
      pin('pin-B', 'm1', 'location', 'loc-1'),
      pin('pin-10', 'm1', 'location', 'loc-1'),
    ],
    served: [el('location', 'loc-1')],
    want: {
      known: [
        known('pin-10', 'm1', 'location', 'loc-1', 'whole'),
        known('pin-9', 'm1', 'location', 'loc-1', 'whole'),
        known('pin-B', 'm1', 'location', 'loc-1', 'whole'),
        known('pin-a', 'm1', 'location', 'loc-1', 'whole'),
      ],
      unknown: 0,
      out: {},
    },
  },
  {
    name: 'known is ordered by code point, not by UTF-16 unit',
    pins: [pin(`pin-${DRAGON}`, 'm1', 'location', 'loc-1'), pin(`pin-${FULLWIDTH_TILDE}`, 'm1', 'location', 'loc-1')],
    served: [el('location', 'loc-1')],
    want: {
      known: [known(`pin-${FULLWIDTH_TILDE}`, 'm1', 'location', 'loc-1', 'whole'), known(`pin-${DRAGON}`, 'm1', 'location', 'loc-1', 'whole')],
      unknown: 0,
      out: {},
    },
  },
  {
    name: 'an id above the BMP is matched whole',
    pins: [pin('p1', 'm1', 'location', `loc-${DRAGON}`), pin('p2', 'm1', 'location', `loc-${u(0x1f40a)}`)],
    served: [el('location', `loc-${DRAGON}`)],
    want: { known: [known('p1', 'm1', 'location', `loc-${DRAGON}`, 'whole')], unknown: 1, out: {} },
  },
  {
    name: 'the answer carries no name or body of the element',
    pins: [pin('p1', 'm1', 'character', 'cha-1', { name: 'the Pin\'s own name', description: 'x' })],
    served: [{ type: 'character', id: 'cha-1', name: 'A secret name', description: 'A body', known_of: true, supertype: 'Spy' }],
    want: { known: [known('p1', 'm1', 'character', 'cha-1', 'known_of')], unknown: 0, out: {} },
  },
];

const refusals = [
  { name: 'pins is null', pins: null, served: [], refuses: 'pins' },
  { name: 'pins is an object', pins: { type: 'pin', id: 'p1' }, served: [], refuses: 'pins' },
  { name: 'pins is a string', pins: 'pin', served: [], refuses: 'pins' },
  { name: 'pins is a number', pins: 7, served: [], refuses: 'pins' },
  { name: 'served is null', pins: [], served: null, refuses: 'served' },
  { name: 'served is an object', pins: [], served: { type: 'location', id: 'loc-1' }, refuses: 'served' },
  { name: 'served is a string', pins: [], served: 'location', refuses: 'served' },
  { name: 'both are wrong: pins is named', pins: null, served: null, refuses: 'pins' },
];

const names = [...cases, ...refusals].map((c) => c.name);
if (new Set(names).size !== names.length) throw new Error('two cases share a name');

const doc = {
  about:
    'Cases for pinsKnownTo (@onlyworlds/sdk) and pins_known_to (the onlyworlds Python package): the same bytes in both repositories. A case passes pins and served as they stand and wants the whole answer, key order included: known by Pin id in code point order, each as pin, map, element_type, element_id, how; unknown as a count; out with no_link only when one was counted. A refusal passes its two values and wants a TypeError that names the argument in refuses. Made by test/fixtures/generate-pins-known-to-cases.mjs in the SDK repository; every want is written by hand there.',
  version: 1,
  cases,
  refusals,
};

const out = fileURLToPath(new URL('./pins-known-to.cases.json', import.meta.url));
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(`${cases.length} cases, ${refusals.length} refusals -> ${out}`);
