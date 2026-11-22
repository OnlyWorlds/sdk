// A Kanka JSON export as a world folder, from the command line, through the built package (dist/):
// the same folder and the same printed report as the Python package's `python -m onlyworlds.kanka`.
//
//   node scripts/convert-kanka.mjs EXPORT.zip OUT-DIR [--producer TOOL VERSION]
//   node scripts/convert-kanka.mjs EXPORT.zip --plan
//
// OUT-DIR must not exist yet, or be empty: a folder is written whole, once. `--plan` prints what would
// become what and writes nothing. The producer line names this package and its version unless
// `--producer` names another (the Python door's, to compare the two folders byte for byte).
// Paths in the report are written as Python writes them on this platform. Exit 0 written or planned,
// 2 on bad arguments (a missing export, an OUT-DIR that is not empty, a file that is not a zip, an
// export with no campaign.json).

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { EOL } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertKanka, kankaReportText, OwConvertError } from '../dist/convert.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A path as Python's `str(pathlib.Path(p))` gives it on this platform. */
function pyPath(p) {
  const win = process.platform === 'win32';
  const sep = win ? '\\' : '/';
  let s = win ? p.replace(/\//g, '\\') : p;
  let head = '';
  if (win) {
    const drive = /^[A-Za-z]:/.exec(s);
    if (drive) {
      head = drive[0];
      s = s.slice(2);
    }
    if (s.startsWith('\\')) {
      head += '\\';
      s = s.replace(/^\\+/, '');
    }
  } else if (s.startsWith('//') && !s.startsWith('///')) {
    head = '//';
    s = s.slice(2);
  } else if (s.startsWith('/')) {
    head = '/';
    s = s.replace(/^\/+/, '');
  }
  const parts = s.split(sep).filter((x) => x !== '' && x !== '.');
  const out = head + parts.join(sep);
  return out || '.';
}

function fail(message) {
  process.stderr.write(`${message}${EOL}`);
  process.exit(2);
}

const args = process.argv.slice(2);
let plan = false;
let producer;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--plan') plan = true;
  else if (args[i] === '--producer') {
    if (i + 2 >= args.length) fail('--producer takes TOOL VERSION');
    producer = { tool: args[i + 1], version: args[i + 2] };
    i += 2;
  } else rest.push(args[i]);
}
const [source, out] = rest;
if (!source || rest.length > 2) fail('usage: node scripts/convert-kanka.mjs EXPORT.zip OUT-DIR [--plan] [--producer TOOL VERSION]');
if (out === undefined && !plan) fail('give OUT-DIR, or --plan');
producer ??= { tool: '@onlyworlds/sdk', version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version };

if (!plan && existsSync(out) && (!statSync(out).isDirectory() || readdirSync(out).length > 0)) {
  fail(`${pyPath(out)} exists and is not an empty directory; a folder is written whole, once`);
}
if (!existsSync(source)) fail(`${pyPath(source)}: no such file or directory`);
if (statSync(source).isDirectory()) fail(`${pyPath(source)}: an unzipped folder; this script reads the zip`);

let result;
try {
  result = convertKanka(new Uint8Array(readFileSync(source)), { source: pyPath(source), producer });
} catch (err) {
  if (err instanceof OwConvertError) fail(err.message);
  throw err;
}
if (!plan) {
  for (const f of result.files) {
    const dest = join(out, ...f.path.split('/'));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.data);
  }
}
// As Python's text-mode stdout writes it: each line ending in the platform's own.
process.stdout.write(kankaReportText(result.report, plan ? null : pyPath(out)).replace(/\n/g, EOL));
