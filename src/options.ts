/**
 * The package's one rule for an options object: a key it does not know by name is refused with a
 * TypeError, before anything is sent or done, never dropped. TypeScript refuses it at compile time;
 * a plain-JavaScript caller had nothing until 4.51.0, and a dropped key turned a filter into the
 * whole list (W11: 99 Characters deleted on a test world, 2026-10-22). A new option joins its
 * function's key list in the same commit; test/options.test.mjs holds every fenced function and
 * fails on an exported options parameter it does not hold.
 *
 * Module-internal: not in the package's exports.
 */

/** The first own enumerable key of `opts` not in `keys`, or undefined. Anything but an object (undefined, null) has none. */
export function unknownKey(opts: unknown, keys: readonly string[]): string | undefined {
  if (!opts || typeof opts !== 'object') return undefined;
  for (const k of Object.keys(opts)) if (!keys.includes(k)) return k;
  return undefined;
}

/**
 * Throw `fn: unknown option 'k'. The keys are a, b.` (then `after`, when given) for the first key of
 * `opts` not in `keys`. For a function that sends nothing; the client's methods say "Nothing was
 * sent." through their own `only()`.
 */
export function refuseUnknownOptions(fn: string, opts: unknown, keys: readonly string[], after = ''): void {
  const k = unknownKey(opts, keys);
  if (k !== undefined) {
    throw new TypeError(`${fn}: unknown option '${k}'. The keys are ${keys.join(', ')}.${after ? ` ${after}` : ''}`);
  }
}
