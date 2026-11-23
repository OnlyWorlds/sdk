/**
 * Element names found in prose: `nameFinder` reads a world's names once and answers a function that finds them in
 * any text. It finds and never writes: what a tool does with a found name (a hover, a suggestion, a link a person
 * chooses to make) is the tool's.
 *
 * A rule of this package and the Python package's `name_finder`, not of the standard: both run one file of cases
 * (`test/fixtures/name-finder.cases.json`, the same bytes in both repositories).
 */

import { findOwLinks } from './address';
import { foldCodePoint } from './case-fold';
import { refuseUnknownOptions } from './options';
import { trimWhiteSpace } from './room';

/** How a name is compared with the text: `'exact'` as written, `'folded'` by simple case folding (Unicode 15.1). */
export type OwNameCase = 'exact' | 'folded';

/** What `nameFinder` reads beside the elements. */
export interface OwNameFinderOptions<T> {
  /** Required: `'exact'` or `'folded'`. There is no default, so a tool never gets the other rule by leaving it out. */
  case: OwNameCase;
  /** The names one element is found by; by default its `name` alone. A value that is not a string is passed over. */
  names?: (element: T) => Iterable<unknown>;
}

/** One name found in a text. */
export interface OwNameFound<T> {
  /** The index of the name's first character in the text (a JavaScript string index, as `findOwLinks` counts). */
  start: number;
  /** The index just past the name's last character. */
  end: number;
  /** The element the name belongs to: the same object `nameFinder` was given. */
  element: T;
}

/** A name shorter than this many characters (code points, after its white space is trimmed) is never looked for. */
const NAME_MIN = 3;
const OPTION_KEYS = ['case', 'names'] as const;
/** Beside one of these a name is inside a word: a letter of any script, a combining mark, a decimal digit or an underscore. */
const IN_A_WORD = /^[\p{L}\p{M}\p{Nd}_]/u;

interface TrieNode<T> {
  next: Map<number, TrieNode<T>>;
  /** The element whose name ends here, and whether a second element's name ends here too. */
  hit: { id: string; element: T; shared: boolean } | null;
}

function isWord(codePoint: number): boolean {
  if (codePoint < 0x80) {
    return (codePoint >= 0x30 && codePoint <= 0x39) || (codePoint >= 0x41 && codePoint <= 0x5a)
      || (codePoint >= 0x61 && codePoint <= 0x7a) || codePoint === 0x5f;
  }
  return IN_A_WORD.test(String.fromCodePoint(codePoint));
}

/** Whether the code point that ends just before `i` is a word character; false at the start of the text. */
function wordBefore(text: string, i: number): boolean {
  if (i <= 0) return false;
  const low = text.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) {
    const high = text.charCodeAt(i - 2);
    if (high >= 0xd800 && high <= 0xdbff) return isWord(text.codePointAt(i - 2)!);
  }
  return isWord(low);
}

/**
 * Every Markdown link `[label](target)` in a text as `[start, end)`: a `[`, a label up to the first `]`, a `(` right
 * after it, a target up to the first `)`. One pass: each bracket and parenthesis is searched for once.
 */
function markdownLinks(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let close = -2;
  let paren = -2;
  let open = text.indexOf('[');
  while (open !== -1) {
    if (close <= open) close = text.indexOf(']', open + 1);
    if (close === -1) break;
    if (text.charCodeAt(close + 1) !== 0x28) {
      open = text.indexOf('[', open + 1);
      continue;
    }
    if (paren < close + 2) paren = text.indexOf(')', close + 2);
    if (paren === -1) break;
    spans.push([open, paren + 1]);
    open = text.indexOf('[', paren + 1);
  }
  return spans;
}

/** The stretches no name is read in: every address and every Markdown link, in order, none overlapping. */
function passedOver(text: string): Array<[number, number]> {
  const spans = markdownLinks(text);
  for (const a of findOwLinks(text)) spans.push([a.start, a.end]);
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && s[0] < last[1]) {
      if (s[1] > last[1]) last[1] = s[1];
    } else {
      out.push([s[0], s[1]]);
    }
  }
  return out;
}

/**
 * A finder of a world's element names in prose: read the names once, then call the answer on each text.
 *
 * `elements` is any list of objects with a string `id` and a `name`; `options.case` must be `'exact'` (a name as
 * written) or `'folded'` (simple case folding, Unicode 15.1, the fold the `.owworld` reader uses), with no default.
 * `options.names` gives the names an element is found by, by default its `name` alone.
 *
 * The answer, `find(text)`, lists every `{ start, end, element }` in order, none overlapping:
 *
 * - A whole name only: the character on each side of it is not a letter, a combining mark, a decimal digit or an
 *   underscore, in any script. So "Kira's" and "Kira-led" hold the name "Kira", and "Kiran" does not.
 * - A name is trimmed of white space and is three characters at least; a shorter one is never looked for.
 * - Where several names start at one place, the longest whole one is taken ("Iron Gate" over "Iron").
 * - A name two elements share is never answered, and nothing inside it is: the text stays plain there. One element
 *   listed twice, or found by two of its own names, is one element.
 * - Nothing is read inside an address (what `findOwLinks` finds) or a Markdown link `[label](target)`, and no name
 *   is read across the edge of one.
 * - Text is compared as written: no Unicode normalisation, and a space in a name matches that one space.
 *
 * `element` in an answer is the object that was passed in. Nothing given is changed. The work for one text is at
 * most its length times the longest name's length, whatever the number of names, with no pattern that backtracks.
 * `start` and `end` count JavaScript string indexes, as `findOwLinks` does. An unknown option, a `case` that is
 * neither word, an element without a string `id`, or a `text` that is not a string is a TypeError.
 *
 * ```ts
 * const find = nameFinder([{ id: 'a1', name: 'Iron Gate' }, { id: 'b2', name: 'Kira' }], { case: 'exact' });
 * find("Kira's watch ends at the Iron Gate.");
 * // [{ start: 0, end: 4, element: { id: 'b2', … } }, { start: 25, end: 34, element: { id: 'a1', … } }]
 * ```
 */
export function nameFinder<T extends { id: string; name?: unknown }>(
  elements: Iterable<T>,
  options: OwNameFinderOptions<T>,
): (text: string) => OwNameFound<T>[] {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`nameFinder: options is an object, such as { case: 'exact' }; got ${JSON.stringify(options) ?? typeof options}.`);
  }
  refuseUnknownOptions('nameFinder', options, OPTION_KEYS);
  if (options.case !== 'exact' && options.case !== 'folded') {
    throw new TypeError(`nameFinder: options.case is 'exact' or 'folded', and must be given; got ${JSON.stringify(options.case) ?? typeof options.case}.`);
  }
  if (options.names !== undefined && typeof options.names !== 'function') {
    throw new TypeError('nameFinder: options.names is a function from an element to its names.');
  }
  if (elements === null || elements === undefined || typeof (elements as Iterable<T>)[Symbol.iterator] !== 'function' || typeof elements === 'string') {
    throw new TypeError('nameFinder: elements is a list of objects with an id and a name.');
  }
  const folded = options.case === 'folded';
  const namesOf = options.names;
  const root: TrieNode<T> = { next: new Map(), hit: null };
  for (const element of elements) {
    if (element === null || typeof element !== 'object' || typeof element.id !== 'string' || element.id === '') {
      throw new TypeError('nameFinder: every element is an object with a string id.');
    }
    const names: Iterable<unknown> = namesOf ? namesOf(element) : [element.name];
    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const name = trimWhiteSpace(raw);
      const points: number[] = [];
      for (const c of name) points.push(folded ? foldCodePoint(c.codePointAt(0)!) : c.codePointAt(0)!);
      if (points.length < NAME_MIN) continue;
      let node = root;
      for (const p of points) {
        let child = node.next.get(p);
        if (child === undefined) {
          child = { next: new Map(), hit: null };
          node.next.set(p, child);
        }
        node = child;
      }
      if (node.hit === null) node.hit = { id: element.id, element, shared: false };
      else if (node.hit.id !== element.id) node.hit.shared = true;
    }
  }

  return function find(text: string): OwNameFound<T>[] {
    if (typeof text !== 'string') throw new TypeError('nameFinder: text must be a string');
    const found: OwNameFound<T>[] = [];
    if (root.next.size === 0) return found;
    const spans = passedOver(text);
    const length = text.length;
    let span = 0;
    let i = 0;
    while (i < length) {
      if (span < spans.length && i >= spans[span][0]) {
        i = spans[span][1];
        span++;
        continue;
      }
      const first = text.codePointAt(i)!;
      const width = first > 0xffff ? 2 : 1;
      if (!wordBefore(text, i)) {
        const limit = span < spans.length ? spans[span][0] : length;
        let node: TrieNode<T> | undefined = root;
        let j = i;
        let best: TrieNode<T>['hit'] = null;
        let bestEnd = -1;
        while (j < limit) {
          const c = text.codePointAt(j)!;
          node = node.next.get(folded ? foldCodePoint(c) : c);
          if (node === undefined) break;
          j += c > 0xffff ? 2 : 1;
          if (node.hit !== null && (j >= length || !isWord(text.codePointAt(j)!))) {
            best = node.hit;
            bestEnd = j;
          }
        }
        if (best !== null) {
          if (!best.shared) found.push({ start: i, end: bestEnd, element: best.element });
          i = bestEnd;
          continue;
        }
      }
      i += width;
    }
    return found;
  };
}
