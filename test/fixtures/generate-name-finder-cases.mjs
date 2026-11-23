/**
 * Writes test/fixtures/name-finder.cases.json: the cases nameFinder is held to here and name_finder is held to in
 * the Python package (the same bytes in both repositories; each test pins the file's sha256).
 *
 * Every want is written by hand, in the text itself: `{{id|words}}` marks words that must be found as the element
 * `id`, and the generator only strips the marks and counts where they stood, in code points. No answer here comes
 * from the finder. Run: node test/fixtures/generate-name-finder-cases.mjs  (then move both tests' sha256).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const u = (...points) => String.fromCodePoint(...points);
const E_ACUTE = u(0xc9); // É
const e_acute = u(0xe9); // é
const e_dia = u(0xeb); // ë
const i_dia = u(0xef); // ï
const COMBINING_ACUTE = u(0x301);
const LONG_S = u(0x17f); // ſ, folds to s
const KELVIN = u(0x212a); // K, folds to k
const DOTTED_I = u(0x130); // İ, has no simple fold
const SHARP_S = u(0xdf); // ß
const CAPITAL_SHARP_S = u(0x1e9e); // ẞ, folds to ß
const NBSP = u(0xa0);
const EM_SPACE = u(0x2003);
const NEL = u(0x85); // White_Space, which JavaScript's trim() leaves
const BOM = u(0xfeff); // not White_Space, which JavaScript's trim() strips
const FS = u(0x1c); // not White_Space, which Python's strip() strips
const DRAGON = u(0x1f409); // one code point, two UTF-16 units
const DESERET = u(0x10400, 0x10401, 0x10402); // three letters above the BMP
const DESERET_TWO = u(0x10400, 0x10401);
const DESERET_SMALL = u(0x10428, 0x10429, 0x1042a); // their small forms: the fold of the three above
const ARABIC_THREE = u(0x663); // a decimal digit (Nd)
const SUPER_TWO = u(0xb2); // a number that is not a decimal digit (No)
const TOKYO = u(0x6771, 0x4eac, 0x90fd);
const WA = u(0x306f);
const NI = u(0x306b);
const IDEOGRAPHIC_STOP = u(0x3002);
const ID = '01a1d4ef-0000-7000-8000-000000000084';
const WORLD = '0193a1c2-7d3e-7f00-8a11-3c5e7b9d2f40';

const el = (id, ...names) => (names.length === 1 ? { id, name: names[0] } : { id, names });

/** name, case, elements, marked text. */
const CASES = [
  ['two names, in order', 'exact', [el('a', 'Iron Gate'), el('b', 'Kira')], "{{b|Kira}}'s watch ends at the {{a|Iron Gate}}."],
  ['a possessive and a hyphen leave the name whole', 'exact', [el('t', 'Odran'), el('j', 'Tamsin')], "{{t|Odran}}'s map, a {{j|Tamsin}}-led crew."],
  ['a name inside a longer word is not found, at either end', 'exact', [el('k', 'Kira')], 'Kiran and McKira and McKiran.'],
  ['a digit on either side is inside a word', 'exact', [el('u', 'Unit 7'), el('k', 'Kira')], '{{u|Unit 7}}. Unit 73. 2Kira. Kira2.'],
  ['an underscore on either side is inside a word', 'exact', [el('k', 'Kira')], 'Kira_x, _Kira, {{k|Kira}}.'],
  ['a name that starts or ends with a letter outside ASCII is found whole', 'exact', [el('e', E_ACUTE + 'lodie'), el('z', 'Zo' + e_dia)], `Then {{e|${E_ACUTE}lodie}} rode with {{z|Zo${e_dia}}}.`],
  ['a letter outside ASCII after or before a name is inside a word', 'exact', [el('a', 'Ana'), el('z', 'Zo' + e_dia), el('w', 'lodie')], `Ana${i_dia}s and Zo${e_dia}x and ${E_ACUTE}lodie.`],
  ['a combining mark after a name is inside a word', 'exact', [el('a', 'Ana')], `Ana${COMBINING_ACUTE} came, then {{a|Ana}}.`],
  ['a decimal digit of another script is inside a word; a superscript is not', 'exact', [el('k', 'Kira')], `Kira${ARABIC_THREE} and {{k|Kira}}${SUPER_TWO}.`],
  ['places count code points: a character above the BMP before a name', 'exact', [el('k', 'Kira')], `${DRAGON} {{k|Kira}} ${DRAGON}${DRAGON} {{k|Kira}}`],
  ['a name of letters above the BMP; two of them are too short', 'exact', [el('d', DESERET), el('s', DESERET_TWO)], `{{d|${DESERET}}} and ${DESERET_TWO}.`],
  ['the longest whole name wins', 'exact', [el('i', 'Iron'), el('g', 'Iron Gate')], 'The {{g|Iron Gate}} and the {{i|Iron}} Gates and {{i|Iron}}.'],
  ['the leftmost name is taken, and the search goes on after it', 'exact', [el('g', 'Iron Gate'), el('k', 'Gate Keeper')], 'The {{g|Iron Gate}} Keeper and the {{k|Gate Keeper}}.'],
  ['every mention is answered', 'exact', [el('k', 'Kira'), el('m', 'Mira')], '{{k|Kira}},{{m|Mira}};{{k|Kira}} {{k|Kira}}'],
  ['a name two elements share stays plain', 'exact', [el('a', 'Ember'), el('b', 'Ember'), el('k', 'Kira')], 'Ember called to {{k|Kira}}.'],
  ['nothing inside a shared name is answered', 'exact', [el('a', 'Old Ember'), el('b', 'Old Ember'), el('e', 'Ember')], 'Old Ember, then {{e|Ember}}.'],
  ['a shared name is plain where a longer name is not whole', 'exact', [el('a', 'Ember'), el('b', 'Ember'), el('l', 'Ember Lake')], 'Ember Lakes, then {{l|Ember Lake}}.'],
  ['one element listed twice, or found by the same name twice, is one element', 'exact', [el('k', 'Kira'), el('k', 'Kira'), el('m', 'Mira', 'Mira')], '{{k|Kira}} and {{m|Mira}}.'],
  ['an element is found by each of its names', 'exact', [el('v', 'Consul Varro', 'Varro', 'the Consul')], '{{v|Consul Varro}} spoke. {{v|Varro}} sat. So did {{v|the Consul}}.'],
  ['two elements that share one of several names: that name is plain, the others are found', 'exact', [el('v', 'Varro', 'the Consul'), el('w', 'Wren', 'the Consul')], '{{v|Varro}} and {{w|Wren}}: which is the Consul?'],
  ['a name under three characters is never looked for; three is enough', 'exact', [el('a', 'Al'), el('b', '  Bo  '), el('c', 'Ada')], 'Al met Bo and {{c|Ada}}.'],
  ['a name is trimmed of white space, every kind of it', 'exact', [el('k', `  Kira${NBSP}`), el('m', `${EM_SPACE}Mira${NEL}`)], '{{k|Kira}} and {{m|Mira}}.'],
  ['a byte order mark and a file separator are not white space: the name keeps them', 'exact', [el('k', `${BOM}Kira`), el('m', `${FS}Mira`)], 'Kira and Mira.'],
  ['exact: another case is another word', 'exact', [el('c', 'Consul')], 'The consul and the CONSUL and the {{c|Consul}}.'],
  ['folded: case is ignored, and the answer is the text as written', 'folded', [el('c', 'Consul')], 'The {{c|consul}} and the {{c|CONSUL}} and the {{c|Consul}}.'],
  ['folded: two names that differ only by case are shared', 'folded', [el('a', 'Ember'), el('b', 'EMBER'), el('k', 'Kira')], 'Ember, ember, {{k|KIRA}}.'],
  ['exact: two names that differ only by case are two names', 'exact', [el('a', 'Ember'), el('b', 'EMBER')], '{{a|Ember}}, ember, {{b|EMBER}}.'],
  ['folded: letters outside ASCII fold too, and above the BMP', 'folded', [el('e', E_ACUTE + 'lodie'), el('d', DESERET)], `{{e|${e_acute}lodie}} and {{d|${DESERET_SMALL}}}.`],
  ['folded: the long s and the Kelvin sign fold to s and k', 'folded', [el('r', 'Rose'), el('k', 'Kira')], `{{r|Ro${LONG_S}e}} and {{k|${KELVIN}ira}}.`],
  ['folded: simple folding only: a dotted capital I stays itself, and a sharp s is never two letters', 'folded', [el('i', `${DOTTED_I}stan`), el('s', `Stra${SHARP_S}e`)], `istan, Istan, {{i|${DOTTED_I}STAN}}, STRASSE, {{s|STRA${CAPITAL_SHARP_S}E}}.`],
  ['text is compared as written: a letter with a combining mark is not its one-character form', 'folded', [el('e', E_ACUTE + 'lodie')], `E${COMBINING_ACUTE}lodie rode.`],
  ['a space in a name is that one space', 'exact', [el('g', 'Iron Gate')], 'Iron  Gate, Iron\nGate, Iron-Gate, {{g|Iron Gate}}.'],
  ['a name may hold punctuation, and may start or end with it', 'exact', [el('s', "St. Brannoc's"), el('q', '"Lucky" Finn'), el('w', 'Who?')], `At {{s|St. Brannoc's}}, {{q|"Lucky" Finn}} asked {{w|Who?}} and Who?s.`],
  ['nothing is read inside an address, in either form', 'folded', [el('c', 'character'), el('i', 'iron'), el('k', 'Kira')], `ow://character/${ID} and https://www.onlyworlds.com/w/iron-gate/character/${ID} and ow://${WORLD}/character/${ID}, said {{k|Kira}}.`],
  ['an address that is not one is prose', 'folded', [el('c', 'character')], 'elbow://{{c|character}}/x and ow://{{c|character}}/not-an-id'],
  ['nothing is read inside a Markdown link, label or target', 'exact', [el('k', 'Kira'), el('g', 'Iron Gate')], `[Kira](ow://character/${ID}) met {{k|Kira}} at [the Iron Gate](https://example.com/Kira).`],
  ["an address inside a link's target does not end the link", 'exact', [el('k', 'Kira'), el('m', 'Mira')], `[x](ow://character/${ID} Kira) {{m|Mira}}`],
  ['brackets that are not a link are prose', 'exact', [el('k', 'Kira')], '[{{k|Kira}}] and [{{k|Kira}}] (x) and [{{k|Kira}}](unclosed'],
  ['a bracket that is not a link does not hide a later link', 'exact', [el('k', 'Kira')], '[sic] [Kira](x) and {{k|Kira}}.'],
  ['a link takes its label from the first bracket and its target to the first parenthesis', 'exact', [el('k', 'Kira'), el('m', 'Mira')], '[a [Kira](Mira) {{m|Mira}}) and [{{k|Kira}}]{{m|Mira}}[x](y)'],
  ['no name is read across the edge of a link; a shorter whole one before it is', 'exact', [el('n', 'Gate [1'), el('g', 'Gate')], '{{g|Gate}} [1](note) and {{n|Gate [1}}.'],
  ['a name is found right beside a link', 'exact', [el('k', 'Kira')], '{{k|Kira}}[x](y){{k|Kira}}'],
  ['a script written without spaces: a name is whole only between punctuation or spaces', 'exact', [el('t', TOKYO)], `${WA}${TOKYO}${NI}${IDEOGRAPHIC_STOP}{{t|${TOKYO}}}${IDEOGRAPHIC_STOP}`],
  ['a name that is not a string is passed over', 'exact', [{ id: 'n', name: null }, { id: 'x', name: 7 }, { id: 'm' }, { id: 'l', names: ['Kira', null, 7] }], '{{l|Kira}} and 7 and null.'],
  ['a name alone is the whole text', 'exact', [el('k', 'Kira')], '{{k|Kira}}'],
  ['no elements, and no text', 'exact', [], 'Kira.'],
  ['an empty text', 'exact', [el('k', 'Kira')], ''],
];

/** Recipes both tests build the same way; each must answer `count` names, in under `underMs`. */
const TIMED = [
  { name: 'open brackets only', elements: { count: 1000, pattern: 'Name{i} Thing' }, text: { repeat: '[', times: 300000 }, count: 0 },
  { name: 'links that never close', elements: { count: 1000, pattern: 'Name{i} Thing' }, text: { repeat: '[x](', times: 100000 }, count: 0 },
  { name: 'closing brackets with no link', elements: { count: 1000, pattern: 'Name{i} Thing' }, text: { repeat: '[x] ', times: 100000 }, count: 0 },
  { name: 'twenty thousand names, each found five times', elements: { count: 20000, pattern: 'Name{i} Thing' }, text: { cycle: 'Name{i} Thing and ', count: 20000, times: 100000 }, count: 100000 },
  { name: 'one name two hundred thousand times', elements: { count: 1, pattern: 'Kira' }, text: { repeat: 'Kira ', times: 200000 }, count: 200000 },
  { name: 'a long name that almost matches at every word', elements: { count: 1, pattern: 'a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a b' }, text: { repeat: 'a ', times: 200000 }, count: 0 },
  { name: 'address prefixes with no address', elements: { count: 1000, pattern: 'Name{i} Thing' }, text: { repeat: 'ow://character/', times: 60000 }, count: 0 },
];

function unmark(marked) {
  let text = '';
  const want = [];
  let i = 0;
  while (i < marked.length) {
    if (marked.startsWith('{{', i)) {
      const bar = marked.indexOf('|', i);
      const close = marked.indexOf('}}', bar);
      if (bar === -1 || close === -1) throw new Error(`an open mark in: ${marked}`);
      const words = marked.slice(bar + 1, close);
      want.push({ at: Array.from(text).length, length: Array.from(words).length, id: marked.slice(i + 2, bar) });
      text += words;
      i = close + 2;
    } else {
      text += marked[i];
      i++;
    }
  }
  return { text, want };
}

const names = new Set();
const cases = CASES.map(([name, fold, elements, marked]) => {
  if (names.has(name)) throw new Error(`two cases named: ${name}`);
  names.add(name);
  return { name, case: fold, elements, ...unmark(marked) };
});

const out = {
  about: 'Cases for nameFinder (@onlyworlds/sdk) and name_finder (the onlyworlds Python package): the same bytes in both repositories. In a case, an element with a names list is found by those names (the names option), one without by its name; want lists what find(text) answers, in order, each the place of its first character and its length, both in code points, and the id of its element. A timed case is built from its recipe ({i} is the count from 0) and must answer count names in under underMs milliseconds. Made by test/fixtures/generate-name-finder-cases.mjs in the SDK repository; every want is written by hand there.',
  version: 1,
  underMs: 2000,
  cases,
  timed: TIMED,
};

const BACKSLASH = String.fromCharCode(92);
const ascii = Array.from(JSON.stringify(out, null, 2), (ch) => {
  const p = ch.codePointAt(0);
  if (p < 0x80) return ch;
  return Array.from(ch.split(''), (unit) => BACKSLASH + 'u' + unit.charCodeAt(0).toString(16).padStart(4, '0')).join('');
}).join('');
const path = fileURLToPath(new URL('./name-finder.cases.json', import.meta.url));
writeFileSync(path, ascii + '\n');
console.log(`${cases.length} cases, ${TIMED.length} timed -> ${path}`);
