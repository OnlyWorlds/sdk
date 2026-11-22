/**
 * An export's HTML as Markdown, read the way the Python package reads it: its HTML parser
 * (Python 3.14's `html.parser.HTMLParser` with `convert_charrefs`, the tokenizer ported rule for
 * rule, `html.unescape` with the HTML5 references) builds a forgiving tree (an end tag closes up to
 * its own open tag, a stray one is ignored), and the tree becomes Markdown: paragraphs, line breaks,
 * headings, bold, italic, strike, code, links, lists, quotes, rules, images and tables; any other
 * tag is read through to its text. Mentions and other tokens in the text are left as written.
 *
 * Module-internal: not in the package's exports.
 */

import { HTML5_ENTITIES, INVALID_CHARREFS, INVALID_CODEPOINTS } from './html-entities.generated';
import { intOfDigits, lstrip, PY_SPACE, rstrip, strip } from './py';

// --- html.unescape ------------------------------------------------------------------

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

let dropped: Set<number> | null = null;
function droppedCodepoints(): Set<number> {
  if (!dropped) {
    dropped = new Set();
    for (const part of INVALID_CODEPOINTS.split(',')) {
      const [a, b] = part.split('-').map(h => parseInt(h, 16));
      for (let c = a; c <= (b ?? a); c++) dropped.add(c);
    }
  }
  return dropped;
}

function replaceCharref(s: string): string {
  if (s[0] === '#') {
    const num = s[1] === 'x' || s[1] === 'X' ? parseInt(s.slice(2).replace(/;+$/, ''), 16) : Number(s.slice(1).replace(/;+$/, ''));
    if (has(INVALID_CHARREFS, String(num))) return INVALID_CHARREFS[num];
    if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return '\ufffd';
    if (droppedCodepoints().has(num)) return '';
    return String.fromCodePoint(num);
  }
  if (has(HTML5_ENTITIES, s)) return HTML5_ENTITIES[s];
  for (let x = s.length - 1; x > 1; x--) {
    if (has(HTML5_ENTITIES, s.slice(0, x))) return HTML5_ENTITIES[s.slice(0, x)] + s.slice(x);
  }
  return `&${s}`;
}

const CHARREF = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/gu;

/** Python's `html.unescape`. */
export function unescape(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(CHARREF, (_m, ref: string) => replaceCharref(ref));
}

const ATTR_CHARREF = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*)[;=]?/g;

function unescapeAttrValue(s: string): string {
  return s.replace(ATTR_CHARREF, (ref: string) => {
    if (ref.startsWith('&#')) return unescape(ref);
    if (!ref.endsWith('=') && has(HTML5_ENTITIES, ref.slice(1))) return unescape(ref);
    return ref;
  });
}

// --- html.parser.HTMLParser, the parts convert_charrefs=True reaches -------------------

const STARTTAGOPEN = /<[a-zA-Z]/y;
const ENDTAGOPEN = /<\/[a-zA-Z]/y;
const COMMENTCLOSE = /--!?>/g;
const COMMENTABRUPTCLOSE = /-?>/y;
const TAGFIND = /([a-zA-Z][^\t\n\r\f />]*)(?:[\t\n\r\f ]|\/(?!>))*/y;
const ATTRFIND = /((?<=['"\t\n\r\f /])[^\t\n\r\f />][^\t\n\r\f /=>]*)([\t\n\r\f ]*=[\t\n\r\f ]*('[^']*'|"[^"]*"|(?!['"])[^>\t\n\r\f ]*))?(?:[\t\n\r\f ]|\/(?!>))*/y;
const LOCATETAGEND = /[a-zA-Z][^\t\n\r\f />]*[\t\n\r\f /]*(?:(?<=['"\t\n\r\f /])[^\t\n\r\f />][^\t\n\r\f /=>]*(?:[\t\n\r\f ]*=[\t\n\r\f ]*(?:'[^']*'|"[^"]*"|(?!['"])[^>\t\n\r\f ]*))?[\t\n\r\f /]*)*>?/y;
const CDATA_CONTENT = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes']);
const RCDATA_CONTENT = new Set(['textarea', 'title']);

const matchAt = (re: RegExp, s: string, at: number): RegExpExecArray | null => {
  re.lastIndex = at;
  return re.exec(s);
};
const searchFrom = (re: RegExp, s: string, at: number): RegExpExecArray | null => {
  re.lastIndex = at;
  return re.exec(s);
};

/** An ASCII case-blind pattern for an end tag of `elem` (Python: re.IGNORECASE | re.ASCII). */
function endTagOf(elem: string): RegExp {
  const name = [...elem].map(c => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`<\\/${name}(?=[\\t\\n\\r\\f />])`, 'g');
}

interface Handlers {
  starttag(tag: string, attrs: [string, string | null][]): void;
  startendtag(tag: string, attrs: [string, string | null][]): void;
  endtag(tag: string): void;
  data(text: string): void;
}

class Parser {
  private raw = '';
  private cdataElem: string | null = null;
  private interesting: RegExp | null = null;
  private escapable = true;

  constructor(private readonly h: Handlers) {}

  feed(data: string): void {
    this.raw += data;
    this.goahead(false);
  }

  close(): void {
    this.goahead(true);
  }

  private setCdataMode(elem: string, escapable: boolean): void {
    this.cdataElem = elem.toLowerCase();
    this.escapable = escapable;
    this.interesting = this.cdataElem === 'plaintext' ? null : endTagOf(this.cdataElem);
  }

  private clearCdataMode(): void {
    this.interesting = null;
    this.cdataElem = null;
    this.escapable = true;
  }

  private goahead(end: boolean): void {
    const raw = this.raw;
    let i = 0;
    const n = raw.length;
    while (i < n) {
      let j: number;
      if (!this.cdataElem) {
        j = raw.indexOf('<', i);
        if (j < 0) {
          const amppos = raw.lastIndexOf('&');
          if (amppos >= Math.max(i, n - 34) && !/[\t\n\r\f ;]/.test(raw.slice(amppos))) break;
          j = n;
        }
      } else if (this.cdataElem === 'plaintext') {
        j = n; // `\z`: the rest is text
      } else {
        const m = searchFrom(this.interesting!, raw, i);
        if (m) j = m.index;
        else break;
      }
      if (i < j) this.h.data(this.escapable ? unescape(raw.slice(i, j)) : raw.slice(i, j));
      i = j;
      if (i === n) break;
      // raw[i] is '<': the text mode searches for nothing else
      let k: number;
      if (matchAt(STARTTAGOPEN, raw, i)) k = this.parseStarttag(i);
      else if (raw.startsWith('</', i)) k = this.parseEndtag(i);
      else if (raw.startsWith('<!--', i)) k = this.parseComment(i);
      else if (raw.startsWith('<?', i)) k = this.parsePi(i);
      else if (raw.startsWith('<!', i)) k = this.parseHtmlDeclaration(i);
      else if (i + 1 < n || end) {
        this.h.data('<');
        k = i + 1;
      } else break;
      if (k < 0) {
        if (!end) break;
        // Cut short at the end: a lone `</` is text; a start or end tag, a comment, a declaration
        // or a processing instruction is dropped with everything after it (the tree keeps none).
        if (!matchAt(STARTTAGOPEN, raw, i) && raw.startsWith('</', i) && i + 2 === n) this.h.data('</');
        k = n;
      }
      i = k;
    }
    if (end && i < n) {
      this.h.data(this.escapable ? unescape(raw.slice(i, n)) : raw.slice(i, n));
      i = n;
    }
    this.raw = raw.slice(i);
  }

  private parseHtmlDeclaration(i: number): number {
    const raw = this.raw;
    if (raw.startsWith('<!--', i)) return this.parseComment(i);
    if (raw.startsWith('<![CDATA[', i)) {
      const j = raw.indexOf(']]>', i + 9);
      return j < 0 ? -1 : j + 3;
    }
    if (raw.slice(i, i + 9).toLowerCase() === '<!doctype') {
      const gt = raw.indexOf('>', i + 9);
      return gt === -1 ? -1 : gt + 1;
    }
    return this.parseBogusComment(i);
  }

  private parseComment(i: number): number {
    const raw = this.raw;
    let m = searchFrom(COMMENTCLOSE, raw, i + 4);
    if (!m) {
      m = matchAt(COMMENTABRUPTCLOSE, raw, i + 4);
      if (!m) return -1;
    }
    return m.index + m[0].length;
  }

  private parseBogusComment(i: number): number {
    const pos = this.raw.indexOf('>', i + 2);
    return pos === -1 ? -1 : pos + 1;
  }

  private parsePi(i: number): number {
    const j = this.raw.indexOf('>', i + 2);
    return j < 0 ? -1 : j + 1;
  }

  private parseStarttag(i: number): number {
    const raw = this.raw;
    const loc = matchAt(LOCATETAGEND, raw, i + 1)!;
    const endpos = i + 1 + loc[0].length;
    if (raw[endpos - 1] !== '>') return -1;
    const attrs: [string, string | null][] = [];
    const tm = matchAt(TAGFIND, raw, i + 1)!;
    let k = i + 1 + tm[0].length;
    const tag = tm[1].toLowerCase();
    while (k < endpos) {
      const m = matchAt(ATTRFIND, raw, k);
      if (!m) break;
      const [, attrname, rest] = m;
      let value: string | null = m[3] ?? null;
      if (!rest) value = null;
      else if (value !== null && ((value.slice(0, 1) === "'" && value.slice(-1) === "'") || (value.slice(0, 1) === '"' && value.slice(-1) === '"'))) {
        value = value.slice(1, -1);
      }
      if (value) value = unescapeAttrValue(value);
      attrs.push([attrname.toLowerCase(), value]);
      k += m[0].length;
    }
    const endText = strip(raw.slice(k, endpos));
    if (endText !== '>' && endText !== '/>') {
      this.h.data(raw.slice(i, endpos));
      return endpos;
    }
    if (endText.endsWith('/>')) {
      this.h.startendtag(tag, attrs);
    } else {
      this.h.starttag(tag, attrs);
      if (CDATA_CONTENT.has(tag) || tag === 'plaintext') this.setCdataMode(tag, false);
      else if (RCDATA_CONTENT.has(tag)) this.setCdataMode(tag, true);
    }
    return endpos;
  }

  private parseEndtag(i: number): number {
    const raw = this.raw;
    if (raw.indexOf('>', i + 2) < 0) return -1;
    if (!matchAt(ENDTAGOPEN, raw, i)) {
      if (raw.slice(i + 2, i + 3) === '>') return i + 3;
      return this.parseBogusComment(i);
    }
    const loc = matchAt(LOCATETAGEND, raw, i + 2)!;
    const j = i + 2 + loc[0].length;
    if (raw[j - 1] !== '>') return -1;
    const tm = matchAt(TAGFIND, raw, i + 2)!;
    this.h.endtag(tm[1].toLowerCase());
    this.clearCdataMode();
    return j;
  }
}

// --- the tree -----------------------------------------------------------------------

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col', 'area', 'source', 'embed']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption', 'section', 'article', 'header',
  'footer', 'aside', 'details', 'summary', 'dl', 'dt', 'dd']);

/** A parsed element: its tag, its attributes (the last of a repeated name), its children. */
export interface HtmlNode {
  tag: string;
  attrs: Map<string, string>;
  children: (HtmlNode | string)[];
}

const attrMap = (attrs: [string, string | null][]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const [k, v] of attrs) m.set(k, v || '');
  return m;
};

/** HTML as a forgiving tree: an end tag closes up to its own open tag, a stray one is ignored. */
export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: 'root', attrs: new Map(), children: [] };
  const stack = [root];
  const parser = new Parser({
    starttag(tag, attrs) {
      const node: HtmlNode = { tag, attrs: attrMap(attrs), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!VOID.has(tag)) stack.push(node);
    },
    startendtag(tag, attrs) {
      stack[stack.length - 1].children.push({ tag, attrs: attrMap(attrs), children: [] });
    },
    endtag(tag) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          return;
        }
      }
    },
    data(text) {
      stack[stack.length - 1].children.push(text);
    },
  });
  parser.feed(html);
  parser.close();
  return root;
}

// --- the tree as Markdown -------------------------------------------------------------

const RUN = new RegExp(`[${PY_SPACE}]+`, 'g');
const isBlock = (c: HtmlNode | string): c is HtmlNode => typeof c !== 'string' && BLOCK.has(c.tag);

function wrap(text: string, mark: string): string {
  const core = strip(text);
  if (!core) return text;
  const lead = text.slice(0, text.length - lstrip(text).length);
  const trail = text.slice(rstrip(text).length);
  return `${lead}${mark}${core}${mark}${trail}`;
}

/** A run of inline content as Markdown text. */
export function inline(children: readonly (HtmlNode | string)[], pre = false): string {
  const out: string[] = [];
  for (const c of children) {
    if (typeof c === 'string') {
      out.push(pre ? c : c.replace(RUN, ' '));
      continue;
    }
    const tag = c.tag;
    if (tag === 'br') out.push('\n');
    else if (tag === 'strong' || tag === 'b') out.push(wrap(inline(c.children, pre), '**'));
    else if (tag === 'em' || tag === 'i') out.push(wrap(inline(c.children, pre), '*'));
    else if (tag === 's' || tag === 'strike' || tag === 'del') out.push(wrap(inline(c.children, pre), '~~'));
    else if (tag === 'code') out.push(wrap(inline(c.children, true), '`'));
    else if (tag === 'a') {
      const text = inline(c.children, pre);
      const href = c.attrs.get('href') ?? '';
      out.push(href && strip(text) ? `[${strip(text)}](${href})` : text);
    } else if (tag === 'img') {
      const src = c.attrs.get('src') ?? '';
      out.push(src ? `![${c.attrs.get('alt') ?? ''}](${src})` : '');
    } else if (BLOCK.has(tag)) out.push(` ${blocks(c).join(' ')} `);
    else out.push(inline(c.children, pre));
  }
  return out.join('');
}

/** Inline text with each line trimmed of the spaces HTML layout leaves. */
export function clean(text: string): string {
  return strip(text).split('\n').map(strip).join('\n');
}

/** A container's children as Markdown blocks: runs of inline content are paragraphs. */
export function blocks(node: HtmlNode): string[] {
  const out: string[] = [];
  let run: (HtmlNode | string)[] = [];
  const flush = (): void => {
    const text = clean(inline(run));
    if (text) out.push(text);
    run = [];
  };
  for (const c of node.children) {
    if (!isBlock(c)) {
      run.push(c);
      continue;
    }
    flush();
    const b = block(c);
    if (b) out.push(b);
  }
  flush();
  return out;
}

function indent(body: string, marker: string): string {
  const [first, ...rest] = body.split('\n');
  return [marker + first, ...rest.map(line => (line ? ' '.repeat(marker.length) + line : ''))].join('\n');
}

function block(node: HtmlNode): string {
  const tag = node.tag;
  if (/^h[1-6]$/.test(tag)) {
    const text = clean(inline(node.children)).split('\n').join(' ');
    return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : '';
  }
  if (tag === 'hr') return '---';
  if (tag === 'pre') return '```\n' + inline(node.children, true).replace(/^\n+|\n+$/g, '') + '\n```';
  if (tag === 'blockquote') {
    const inner = blocks(node).join('\n\n');
    return inner ? inner.split('\n').map(line => (line ? `> ${line}` : '>')).join('\n') : '';
  }
  if (tag === 'ul' || tag === 'ol') {
    const startAttr = node.attrs.get('start');
    const start = (startAttr === undefined ? null : intOfDigits(startAttr)) || 1;
    const lines: string[] = [];
    let i = 0;
    for (const li of node.children) {
      if (typeof li === 'string' || li.tag !== 'li') continue;
      const marker = tag === 'ol' ? `${start + i}. ` : '- ';
      lines.push(indent(blocks(li).join('\n'), marker));
      i++;
    }
    return lines.join('\n');
  }
  if (tag === 'table') {
    let rows: string[][] = [];
    const walk = (n: HtmlNode): void => {
      for (const c of n.children) {
        if (typeof c === 'string') continue;
        if (c.tag === 'tr') {
          const cells = c.children.filter((x): x is HtmlNode => typeof x !== 'string' && (x.tag === 'td' || x.tag === 'th'));
          rows.push(cells.map(cell => blocks(cell).join('<br>').split('|').join('\\|').split('\n').join('<br>')));
        } else walk(c);
      }
    };
    walk(node);
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    if (!width) return '';
    rows = rows.map(r => [...r, ...Array(width - r.length).fill('')]);
    const lines = [`| ${rows[0].join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`];
    return [...lines, ...rows.slice(1).map(r => `| ${r.join(' | ')} |`)].join('\n');
  }
  return blocks(node).join('\n\n');
}

/** An export's HTML as Markdown; mentions and other tokens are left as written. */
export function htmlToMarkdown(html: string | null): string {
  if (!html) return '';
  return strip(blocks(parseHtml(html)).join('\n\n'));
}
