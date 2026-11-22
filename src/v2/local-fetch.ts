/**
 * The mark on a `fetch` that answers on this machine and never sends a request: the world folder
 * source (`@onlyworlds/sdk/folder`'s `folderFetch`). A client handed one needs no key, since
 * nothing leaves the process: its keyless check, which stops a request the platform would refuse
 * before it is sent, steps aside, and the folder answers each route itself (a route it cannot
 * answer is its own refusal). A registered symbol, so the mark is the same one in every copy of
 * the package a bundler may load.
 *
 * Module-internal: not in the package's exports.
 */

export const LOCAL_FETCH: symbol = Symbol.for('@onlyworlds/sdk/local-fetch');

/** True for a fetch the folder source made. */
export function isLocalFetch(f: unknown): boolean {
  return typeof f === 'function' && (f as unknown as Record<symbol, unknown>)[LOCAL_FETCH] === true;
}
