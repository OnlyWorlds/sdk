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

/** A name two or more elements hold: `find` answers nothing for it, and this says that it is there. */
export interface OwNameShared<T> {
  /** The name as the finder compares it: trimmed of white space, and folded when `case` is `'folded'`. */
  name: string;
  /** The elements that hold it, two at least, in the order they were given: the same objects `nameFinder` was given. */
  elements: readonly T[];
}

/** What `nameFinder` answers: a function over a text, with the names it holds as shared beside it. */
export interface OwNameFinder<T> {
  (text: string): OwNameFound<T>[];
  /**
   * Every name two or more elements hold, in the order each name was first met. `find` never answers one of
   * these, so a tool reads this list to say why a name stays plain. The list and its entries are frozen.
   */
  readonly shared: readonly OwNameShared<T>[];
}

/** A name shorter than this many characters (code points, after its white space is trimmed) is never looked for. */
const NAME_MIN = 3;
const OPTION_KEYS = ['case', 'names'] as const;
/** Beside one of these a name is inside a word: a letter of any script, a combining mark, a decimal digit or an underscore. */
const IN_A_WORD = /^[\p{L}\p{M}\p{Nd}_]/u;
/**
 * The mark the matcher reads between two characters wherever a name may end: before a character that is not a
 * word character, and at the end of the text. No code point is negative.
 */
const END = -1;

/** One name, as compared, and every element that holds it. */
interface Hit<T> {
  /** The name's length in code points. */
  length: number;
  elements: T[];
  /** The ids of `elements`, kept once a second element holds the name. */
  ids: Set<string> | null;
  name: string;
}

/**
 * A state of the matcher. The names are held backwards, each from its last character to its first, with `END`
 * before every character that is not a word character and once at the name's end: so a text read from its end
 * towards its start, with the same mark laid wherever a name may end, passes each character once (Aho and
 * Corasick's failure links), and the state after a character says which whole names start there.
 */
interface State<T> {
  next: Map<number, State<T>>;
  fail: State<T> | null;
  /** The name that is this state, read backwards. */
  hit: Hit<T> | null;
  /** The longest name that ends, read backwards, at this state: `hit`, or the failure state's. */
  longest: Hit<T> | null;
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
 * `find.shared` lists every name two or more elements hold, each as `{ name, elements }`: the name as it is
 * compared (trimmed, and folded when `case` is `'folded'`) and the elements that hold it, in the order given. A
 * name too short to be looked for is not on it.
 *
 * `element` in an answer is the object that was passed in. Nothing given is changed. The work for one text grows
 * with its length alone, whatever the names and however many: the text is read once, from its end to its start,
 * and no character is read again for another name. Reading the names grows with their total length.
 * `start` and `end` count JavaScript string indexes, as `findOwLinks` does. An unknown option, a `case` that is
 * neither word, an element without a string `id`, or a `text` that is not a string is a TypeError.
 *
 * ```ts
 * const find = nameFinder([{ id: 'a1', name: 'Iron Gate' }, { id: 'b2', name: 'Kira' }], { case: 'exact' });
 * find("Kira's watch ends at the Iron Gate.");
 * // [{ start: 0, end: 4, element: { id: 'b2', … } }, { start: 25, end: 34, element: { id: 'a1', … } }]
 * find.shared; // [] here: no two elements hold one name
 * ```
 */
export function nameFinder<T extends { id: string; name?: unknown }>(
  elements: Iterable<T>,
  options: OwNameFinderOptions<T>,
): OwNameFinder<T> {
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
  const root: State<T> = { next: new Map(), fail: null, hit: null, longest: null };
  const hits: Hit<T>[] = [];
  for (const element of elements) {
    if (element === null || typeof element !== 'object' || typeof element.id !== 'string' || element.id === '') {
      throw new TypeError('nameFinder: every element is an object with a string id.');
    }
    const names: Iterable<unknown> = namesOf ? namesOf(element) : [element.name];
    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const points: number[] = [];
      for (const c of trimWhiteSpace(raw)) points.push(folded ? foldCodePoint(c.codePointAt(0)!) : c.codePointAt(0)!);
      if (points.length < NAME_MIN) continue;
      // The name backwards: END, then each character from the last to the first, and END again after (so, in the
      // text, before) every character but the first that is not a word character.
      const tokens: number[] = [END];
      for (let k = points.length - 1; k >= 0; k--) {
        tokens.push(points[k]);
        if (k > 0 && !isWord(points[k])) tokens.push(END);
      }
      let state = root;
      for (const token of tokens) {
        let child = state.next.get(token);
        if (child === undefined) {
          child = { next: new Map(), fail: null, hit: null, longest: null };
          state.next.set(token, child);
        }
        state = child;
      }
      const hit = state.hit;
      if (hit === null) {
        let name = '';
        for (const p of points) name += String.fromCodePoint(p);
        state.hit = { length: points.length, elements: [element], ids: null, name };
        hits.push(state.hit);
      } else if (hit.ids === null) {
        if (hit.elements[0].id !== element.id) {
          hit.ids = new Set([hit.elements[0].id, element.id]);
          hit.elements.push(element);
        }
      } else if (!hit.ids.has(element.id)) {
        hit.ids.add(element.id);
        hit.elements.push(element);
      }
    }
  }

  // The failure links, level by level: where the matcher goes on when the text leaves the name it was reading.
  let level: State<T>[] = [];
  for (const child of root.next.values()) {
    child.fail = root;
    child.longest = child.hit;
    level.push(child);
  }
  while (level.length > 0) {
    const deeper: State<T>[] = [];
    for (const state of level) {
      for (const [token, child] of state.next) {
        let back = state.fail;
        while (back !== null && !back.next.has(token)) back = back.fail;
        child.fail = back === null ? root : back.next.get(token)!;
        child.longest = child.hit ?? child.fail.longest;
        deeper.push(child);
      }
    }
    level = deeper;
  }

  const shared: OwNameShared<T>[] = [];
  for (const hit of hits) {
    if (hit.elements.length > 1) shared.push(Object.freeze({ name: hit.name, elements: Object.freeze(hit.elements.slice()) }));
  }
  Object.freeze(shared);

  const step = (from: State<T>, token: number): State<T> => {
    let state: State<T> | null = from;
    while (state !== null) {
      const to = state.next.get(token);
      if (to !== undefined) return to;
      state = state.fail;
    }
    return root;
  };

  function find(text: string): OwNameFound<T>[] {
    if (typeof text !== 'string') throw new TypeError('nameFinder: text must be a string');
    const found: OwNameFound<T>[] = [];
    if (hits.length === 0) return found;
    const spans = passedOver(text);
    const length = text.length;
    // Where a whole name starts and the longest one that does, as the backward pass meets them: last place first.
    const starts: number[] = [];
    const longest: Hit<T>[] = [];
    /** Whether every character from that start to the stretch's end is one string index wide. */
    const narrow: boolean[] = [];
    let from = 0;
    for (let span = 0; span <= spans.length; span++) {
      const to = span < spans.length ? spans[span][0] : length;
      if (to > from) {
        starts.length = 0;
        longest.length = 0;
        narrow.length = 0;
        let pairs = false;
        let state = root;
        let k = to;
        // Whether a name may end at k: the text ends there, or the character at k is not a word character.
        let mayEnd = k >= length || !isWord(text.codePointAt(k)!);
        while (k > from) {
          if (mayEnd) state = step(state, END);
          let c = text.charCodeAt(k - 1);
          k--;
          if (c >= 0xdc00 && c <= 0xdfff && k > from) {
            const high = text.charCodeAt(k - 1);
            if (high >= 0xd800 && high <= 0xdbff) {
              k--;
              c = (high - 0xd800) * 0x400 + (c - 0xdc00) + 0x10000;
              pairs = true;
            }
          }
          mayEnd = !isWord(c);
          if (state !== root) state = step(state, folded ? foldCodePoint(c) : c);
          if (state.longest !== null && !wordBefore(text, k)) {
            starts.push(k);
            longest.push(state.longest);
            narrow.push(!pairs);
          }
        }
        // Forwards over what was met: the first place a name starts takes its longest name, and the next name
        // starts at or after that one's end.
        let free = from;
        for (let r = starts.length - 1; r >= 0; r--) {
          const start = starts[r];
          if (start < free) continue;
          const hit = longest[r];
          let end = start;
          if (narrow[r]) end += hit.length;
          else for (let n = hit.length; n > 0; n--) end += text.codePointAt(end)! > 0xffff ? 2 : 1;
          if (hit.elements.length === 1) found.push({ start, end, element: hit.elements[0] });
          free = end;
        }
      }
      if (span < spans.length) from = spans[span][1];
    }
    return found;
  }

  return Object.defineProperty(find, 'shared', { value: shared, enumerable: true }) as OwNameFinder<T>;
}
