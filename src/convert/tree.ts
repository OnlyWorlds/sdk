/**
 * An export zip as a tree of files, read the way the Python package's doors read one: every
 * entry's name as a relative POSIX path in NFC (one that climbs out or is absolute is skipped and
 * noted), dot-files and `__MACOSX` left out and noted, a zip inside the zip read into the same tree
 * once, a repeated path kept the first time, and one top folder that holds everything taken off.
 * Entries are inflated when a door asks for them, through the world-file reader's own zip code.
 *
 * Module-internal: not in the package's exports.
 */

import { centralDirectory, inflateEntry, OwWorldFileError, type CdEntry } from '../world-file';
import { nfc } from '../nfc';
import { byCodePoint } from '../message';
import { repr } from './py';

/** An export's files: path -> its bytes, read on demand; and what the reading noted. */
export interface ExportTree {
  files: Map<string, () => Uint8Array>;
  notes: string[];
}

/** The export is not a zip (Python's `zipfile.BadZipFile`). */
export class NotAZip extends Error {}

const CP437_HIGH = [
  0xc7, 0xfc, 0xe9, 0xe2, 0xe4, 0xe0, 0xe5, 0xe7, 0xea, 0xeb, 0xe8, 0xef, 0xee, 0xec, 0xc4, 0xc5,
  0xc9, 0xe6, 0xc6, 0xf4, 0xf6, 0xf2, 0xfb, 0xf9, 0xff, 0xd6, 0xdc, 0xa2, 0xa3, 0xa5, 0x20a7, 0x192,
  0xe1, 0xed, 0xf3, 0xfa, 0xf1, 0xd1, 0xaa, 0xba, 0xbf, 0x2310, 0xac, 0xbd, 0xbc, 0xa1, 0xab, 0xbb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f, 0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  0x3b1, 0xdf, 0x393, 0x3c0, 0x3a3, 0x3c3, 0xb5, 0x3c4, 0x3a6, 0x398, 0x3a9, 0x3b4, 0x221e, 0x3c6, 0x3b5, 0x2229,
  0x2261, 0xb1, 0x2265, 0x2264, 0x2320, 0x2321, 0xf7, 0x2248, 0xb0, 0x2219, 0xb7, 0x221a, 0x207f, 0xb2, 0x25a0, 0xa0,
];

/**
 * An entry's name as Python's zipfile gives it: UTF-8 when the entry says so, else code page 437
 * (the reader decoded those bytes one to one), cut at a NUL, and `\` as `/` (zipfile on Windows;
 * a name a door reads is a relative path either way).
 */
function entryName(e: CdEntry): string {
  let name = e.name;
  if (!(e.flags & 0x0800) && e.nonAscii) {
    name = Array.from(name, ch => {
      const b = ch.charCodeAt(0);
      return b < 0x80 ? ch : String.fromCodePoint(CP437_HIGH[b - 0x80]);
    }).join('');
  }
  const nul = name.indexOf('\0');
  if (nul >= 0) name = name.slice(0, nul);
  return name.split('\\').join('/');
}

/** A name as a relative POSIX path in NFC, or null when it climbs out or is absolute. */
function safeRel(name: string): string | null {
  const rel = nfc(name.split('\\').join('/'));
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
  const parts = rel.split('/').filter(p => p !== '' && p !== '.');
  if (!parts.length || parts.includes('..')) return null;
  return parts.join('/');
}

const litter = (rel: string): boolean => rel.split('/').some(p => p.startsWith('.') || p === '__MACOSX');

function entries(bytes: Uint8Array): CdEntry[] {
  try {
    return centralDirectory(bytes);
  } catch (err) {
    if (err instanceof OwWorldFileError) throw new NotAZip('File is not a zip file');
    throw err;
  }
}

function addZip(bytes: Uint8Array, files: Map<string, () => Uint8Array>, notes: string[], nested: boolean): void {
  const named = entries(bytes).map(e => ({ e, name: entryName(e) }));
  named.sort((a, b) => byCodePoint(a.name, b.name));
  for (const { e, name } of named) {
    if (name.endsWith('/')) continue;
    const rel = safeRel(name);
    if (rel === null) {
      notes.push(`skipped ${repr(name)}: an unsafe path`);
      continue;
    }
    if (litter(rel)) {
      notes.push(`skipped ${rel}: not part of the export (a dot-file or __MACOSX)`);
      continue;
    }
    if (rel.toLowerCase().endsWith('.zip') && !nested) {
      addZip(inflateEntry(bytes, e), files, notes, true);
      continue;
    }
    if (files.has(rel)) {
      notes.push(`skipped a second ${rel} (the first one read is kept)`);
      continue;
    }
    files.set(rel, () => inflateEntry(bytes, e));
  }
}

/** The tree of an export zip; `NotAZip` when the bytes are not one. */
export function readExportZip(bytes: Uint8Array): ExportTree {
  const files = new Map<string, () => Uint8Array>();
  const notes: string[] = [];
  addZip(bytes, files, notes, false);
  const tops = new Set([...files.keys()].map(rel => rel.split('/', 1)[0]));
  if (tops.size === 1 && [...files.keys()].every(rel => rel.includes('/'))) {
    const stripped = new Map<string, () => Uint8Array>();
    for (const [rel, open] of files) stripped.set(rel.slice(rel.indexOf('/') + 1), open);
    return { files: stripped, notes };
  }
  return { files, notes };
}
