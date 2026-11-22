/**
 * `@onlyworlds/sdk/folder`: a world folder as the client's source. `folderFetch(entries)` is a
 * `fetch` that answers the client's reads from a folder's files, as the platform answers them for
 * the world's owner, so a tool that reads through `OwV2Client` reads a folder by changing one line:
 *
 * ```ts
 * import { OwV2Client } from '@onlyworlds/sdk';
 * import { folderFetch, entriesFromDirectory } from '@onlyworlds/sdk/folder';
 *
 * const client = new OwV2Client({ fetch: folderFetch(await entriesFromDirectory('./my-world')) });
 * const page = await client.list('character');
 * ```
 *
 * `entries` is the list `readWorldFile` returns, so a `.owworld` file is a source too:
 * `folderFetch(readWorldFile(bytes).files)`. The source reads its entries once, on the first
 * request, and answers from that snapshot: when the folder changes, make a new fetch.
 *
 * What it answers: `GET /world/`, `GET /{type}/` (the platform's filters, order, cursor, `fields`
 * and `expand`), `GET /{type}/{id}/`, `GET /search` and `GET /health/`. Everything else refuses with
 * one answer, a 501 whose error code is `not_in_a_folder` (an `OwApiError` with that status and
 * code): every write, before anything is read; `/changes`, `/me`, members, files, proposals, the
 * draught, the account routes; and `as=` or `world=` on a read, which name a reader or a world on
 * the platform. Hidden elements are served with their `hidden: true`, since a folder is its
 * holder's own view. Leave the client's `world` option unset: it sends `world=`.
 *
 * The client needs no key with this fetch (nothing leaves the process); one given is never read.
 * `entriesFromDirectory` is for Node and loads `node:fs` only when called, so a browser imports
 * this subpath safely; there a tool builds the entries from its own files.
 */

import { refuseUnknownOptions } from '../options';
import { LOCAL_FETCH } from '../v2/local-fetch';
import type { OwWorldFileEntry } from '../world-file';
import { byCodePoint, isTransientPath, readFolder, type FolderSnapshot, type OwFolderReadReport } from './read';
import {
  NOT_IN_A_FOLDER, NOT_IN_A_FOLDER_MESSAGE, NOT_IN_A_FOLDER_STATUS, Query, Served, asksThePlatform, getAnswer, isType,
  listAnswer, refusal, searchAnswer, unreadable, worldAnswer, type Answer,
} from './serve';

export { NOT_IN_A_FOLDER, NOT_IN_A_FOLDER_MESSAGE, NOT_IN_A_FOLDER_STATUS };
export type { OwFolderReadReport, OwFolderServed, OwFolderSkip, OwFolderSkipReason } from './read';
export type { OwWorldFileEntry };

export interface OwFolderFetchOptions {
  /** Called once, when the first request reads the entries: each file served (its path, type, id and name), and each file skipped with why. */
  onRead?: (report: OwFolderReadReport) => void;
}

/** The path a request names, as the platform's routes read it: after `/api/v2` when the URL holds it, no trailing slash. */
function routeOf(url: URL): string[] {
  let path = url.pathname;
  const at = path.indexOf('/api/v2/');
  if (at !== -1) path = path.slice(at + '/api/v2'.length);
  else if (path.endsWith('/api/v2')) path = '/';
  return path.split('/').filter((s, i, all) => !(s === '' && (i === 0 || i === all.length - 1))).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

function respond(answer: Answer): Response {
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
}

function answerFor(served: Served | null, url: URL): Answer {
  const route = routeOf(url);
  const q = new Query(url.searchParams);
  if (route.length === 1 && route[0] === 'health') return served ? { status: 200, body: { status: 'ok' } } : unreadable();
  const known = (route.length === 1 && (route[0] === 'world' || route[0] === 'search' || isType(route[0])))
    || (route.length === 2 && isType(route[0]));
  if (!known) return refusal();
  if (!served) return unreadable();
  if (asksThePlatform(q)) return refusal();
  if (route[0] === 'world') return worldAnswer(served);
  if (route[0] === 'search') return searchAnswer(served, q);
  const type = route[0];
  if (!isType(type)) return refusal();
  return route.length === 1 ? listAnswer(served, type, q) : getAnswer(served, type, route[1], q);
}

function checkEntries(entries: unknown): OwWorldFileEntry[] {
  if (!Array.isArray(entries)) throw new TypeError('folderFetch takes the folder\'s files, an array of { path, data }; nothing was read');
  for (const e of entries) {
    if (!e || typeof e !== 'object' || typeof (e as OwWorldFileEntry).path !== 'string' || !((e as OwWorldFileEntry).data instanceof Uint8Array)) {
      throw new TypeError('folderFetch: each entry is { path: string, data: Uint8Array }, its path relative to the world\'s folder and /-separated');
    }
  }
  return [...entries];
}

/**
 * A `fetch` answering the client's reads from a world folder's files (`{path, data}`, relative to
 * the world's folder, `/`-separated): pass it as `new OwV2Client({ fetch: folderFetch(entries) })`.
 * Read once, on the first request. A write, or a route only the platform can answer, is refused
 * with a 501 `not_in_a_folder`.
 */
export function folderFetch(entries: readonly OwWorldFileEntry[], opts: OwFolderFetchOptions = {}): typeof globalThis.fetch {
  refuseUnknownOptions('folderFetch', opts, ['onRead']);
  if (opts.onRead !== undefined && typeof opts.onRead !== 'function') throw new TypeError('folderFetch: onRead is a function');
  const files = checkEntries(entries);
  let served: Served | null | undefined;
  const read = (): Served | null => {
    if (served === undefined) {
      const snapshot: FolderSnapshot = readFolder(files);
      served = snapshot.world ? new Served(snapshot) : null;
      opts.onRead?.(snapshot.report);
    }
    return served;
  };
  const fetchFolder = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = typeof input === 'object' && input !== null && !(input instanceof URL) ? (input as Request) : undefined;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    // Reads only: every other method is refused before anything is read.
    if (method !== 'GET') return respond(refusal());
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (request as Request).url;
    return respond(answerFor(read(), new URL(href, 'http://folder.invalid/')));
  };
  Object.defineProperty(fetchFolder, LOCAL_FETCH, { value: true });
  return fetchFolder as typeof globalThis.fetch;
}

/**
 * Node only: the files of the world folder at `path` that the folder source reads (`world.json`,
 * `elements/`, and the legacy `spatial/`), as the entries `folderFetch` takes, in code point order.
 * Dot-prefixed folders and files are never read, nor a browser's or editor's swap file; links are
 * not followed. `node:fs` is loaded only when this is called.
 */
export async function entriesFromDirectory(path: string): Promise<OwWorldFileEntry[]> {
  if (typeof path !== 'string' || path === '') throw new TypeError('entriesFromDirectory takes the path of a world folder, a string');
  const fs = await import('node:fs/promises');
  const { join } = await import('node:path');
  const out: OwWorldFileEntry[] = [];
  const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory() && depth < 2 && (depth > 0 || d.name === 'elements' || d.name === 'spatial')) await walk(join(dir, d.name), rel, depth + 1);
      else if (d.isFile() && (rel === 'world.json' || (depth === 2 && d.name.endsWith('.json'))) && !isTransientPath(rel)) {
        out.push({ path: rel, data: new Uint8Array(await fs.readFile(join(dir, d.name))) });
      }
    }
  };
  await walk(path, '', 0);
  return out.sort((a, b) => byCodePoint(a.path, b.path));
}
