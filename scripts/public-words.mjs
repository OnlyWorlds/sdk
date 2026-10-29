// Published text names no one inside the team and points at nothing the public cannot read.
//
// The maintainers' discussion happens in rooms and trackers that are not public, so a room or
// item pointer in the source is noise to a reader. A person named in published text is Titus,
// the founder; a ruling is dated, not pointed at (ruled 2026-10-24).
//
// This script holds the patterns in one place. CI and the release workflow both run it.
//
//   node scripts/public-words.mjs            scan the published paths (below)
//   node scripts/public-words.mjs PATH ...   scan these files or directories instead
//   node scripts/public-words.mjs --commits A..B   scan the messages of the commits B adds to A
//
// Exit 1 and one line per finding; exit 0 when the tree is clean. Not scanned: CHANGELOG.md
// (the dated record, kept as written), test/, codegen/schema-dist/ and codegen/tools/ (vendored
// and hash-verified).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLISHED = [
  'src',
  'codegen',
  'scripts',
  '.github',
  'README.md',
  'AGENTS.md',
  'SECURITY.md',
  'SCHEMA.md',
  'package.json',
];
const VENDORED = ['codegen/schema-dist/', 'codegen/tools/'];

// Each row: a pattern, and what a writer puts instead.
const PATTERNS = [
  [/\bh[0-9]{1,3} #[0-9]+/g, 'the date of the ruling'],
  [/\bh[0-9]{1,3}(?= [0-9]{4}-[0-9]{2}-[0-9]{2})/g, 'the date alone'],
  [/\b(?:[Kk]eel|OW [A-Z][a-z]+) #[0-9]+/g, 'the date, or what changed'],
  [/(?<![\w/.&-])#[0-9]{4,5}\b/g, 'the date of the ruling'],
  [/\bD[0-9]{2,3}[a-z]?\b/g, 'nothing: an internal decision id'],
  [/[A-Za-z]:[/\\]Users[/\\]/g, "nothing: a path on a maintainer's machine"],
];

// The team's own words, held as the first 12 hex of each word's sha256, so this list does not
// publish what it refuses: one word, or "the" and a word. Case-sensitive, as the words are names.
const WORDS = new Map([
  ['2e786c488b83', 'Titus, or the founder'],
  ['9dd2ca99ffc9', 'nothing: an internal surface'],
  ['271c535631ff', 'nothing: an internal surface'],
  ['4340fc2d9418', 'nothing: an internal mailbox'],
  ...['d97084040035', 'b372644b8fec', '0c6874e447ef', '66ada4d485d7', '3892e10346fd', '8899ecd1626d',
    '44e7d4b24846', '0aa91af2ec4c'].map((h) => [h, 'nothing, or the thing described plainly: a team folder']),
  ...['7d07b8e5c49d', '0ced2c75df2d', '9c2a44c4716d', 'd3aaf0e63f73', '9067ae5c5374', 'fdfd7512f532',
    'fbee9d8f57c5', '6a6ac8386005', 'd5ef0f0e059a', 'c62063d665f3', '06110f3dd13d'].map((h) => [h, 'nothing, Titus, or the maintainers']),
]);
const hash = (w) => createHash('sha256').update(w).digest('hex').slice(0, 12);

// Lines allowed by their exact text (trimmed; the first 16 hex of its sha256), never by file.
const EXEMPT_LINES = new Set([
  '012d30a55f7b2ad2', // README: the one line that says who maintains the repository
]);

export function scanText(text, where) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (EXEMPT_LINES.has(createHash('sha256').update(line.trim()).digest('hex').slice(0, 16))) return;
    let prev = null;
    let prevEnd = -1;
    for (const m of line.matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
      const words = [m[0]];
      if (prev === 'the' && line.slice(prevEnd, m.index) === ' ') words.push(`the ${m[0]}`);
      for (const w of words) {
        const instead = WORDS.get(hash(w));
        if (instead) out.push(`${where}:${i + 1}: '${w}' (write ${instead})`);
      }
      prev = m[0];
      prevEnd = m.index + m[0].length;
    }
    const taken = []; // a room pointer is one finding, not two (its room and its #number)
    for (const [pat, instead] of PATTERNS) {
      for (const m of line.matchAll(pat)) {
        if (taken.some(([a, b]) => a <= m.index && m.index < b)) continue;
        taken.push([m.index, m.index + m[0].length]);
        out.push(`${where}:${i + 1}: '${m[0]}' (write ${instead})`);
      }
    }
  });
  return out;
}

function tracked(paths) {
  const raw = execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: ROOT });
  return raw.toString('utf8').split('\0').filter(Boolean);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

function filesFor(args) {
  if (args.length === 0) {
    return tracked(PUBLISHED)
      .filter((p) => !VENDORED.some((v) => p.startsWith(v)))
      .map((p) => join(ROOT, p));
  }
  return args.flatMap((a) => (statSync(a).isDirectory() ? walk(a) : [a]));
}

// A commit message is published text too: `--commits A..B` scans the messages of the commits B adds
// to A, `--commits SHA` that one commit's. CI runs it on the commits each push or pull request adds.
if (process.argv[2] === '--commits') {
  const range = process.argv[3];
  if (!range) {
    console.log('public words: --commits needs a range (A..B) or one commit');
    process.exit(2);
  }
  let log;
  try {
    const args = range.includes('..') ? [range] : ['-1', range];
    log = execFileSync('git', ['log', '--format=%h%x00%B%x01', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
  } catch {
    console.log(`public words: git could not read the commits ${range} (a shallow clone, or a commit gone); not a pass`);
    process.exit(2);
  }
  const commits = log.split('\x01').map((c) => c.trim()).filter(Boolean);
  const found = commits.flatMap((c) => {
    const [sha, message] = c.split('\0');
    return scanText(message ?? '', `commit ${sha}`);
  });
  for (const line of found) console.log(line);
  console.log(`public words: ${found.length} finding(s) in ${commits.length} commit message(s)`);
  process.exit(found.length ? 1 : 0);
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const files = filesFor(process.argv.slice(2));
const findings = [];
for (const f of files) {
  let text;
  try {
    text = decoder.decode(readFileSync(f));
  } catch {
    continue; // not UTF-8 text
  }
  const rel = relative(ROOT, resolve(f));
  const where = rel.startsWith('..') ? f : rel.split(sep).join('/');
  findings.push(...scanText(text, where));
}
for (const line of findings) console.log(line);
console.log(`public words: ${findings.length} finding(s) in ${files.length} file(s)`);
process.exitCode = findings.length ? 1 : 0;
