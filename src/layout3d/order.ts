/**
 * The one order of ids and words every part of the by-links-3d layout uses: code point order, as Python compares
 * strings. JavaScript's own `<` compares UTF-16 units: a character past U+FFFF is two surrogate units (0xd800 to
 * 0xdfff) there, so it sorts under U+E000..U+FFFF there and over them here. Every part imports this one copy.
 *
 * On well-formed strings this is the order of the package's other readers. A lone surrogate (a unit from 0xd800 to
 * 0xdfff that is not half of a pair) sorts here over every other unit; the method's reference sorts it the same way.
 * Module-internal.
 */
export function byCodePoint(a: string, b: string): number {
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x === y) continue;
    const xs = x >= 0xd800 && x <= 0xdfff, ys = y >= 0xd800 && y <= 0xdfff;
    if (xs !== ys) return xs ? 1 : -1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}
