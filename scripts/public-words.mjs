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
//
// Exit 1 and one line per finding; exit 0 when the tree is clean. Not scanned: CHANGELOG.md
// (the dated record, kept as written), test/, and codegen/schema-dist/ (vendored and
// hash-verified).

import { execFileSync } from 'node:child_process';
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
const VENDORED = ['codegen/schema-dist/'];
const SELF = 'scripts/public-words.mjs'; // its patterns would match themselves

// Each row: a pattern, and what a writer puts instead.
const PATTERNS = [
  [/\bh[0-9]{1,3} #[0-9]+/g, 'the date of the ruling'],
  [/\bh[0-9]{1,3}(?= [0-9]{4}-[0-9]{2}-[0-9]{2})/g, 'the date alone'],
  [/\b(?:[Kk]eel|OW [A-Z][a-z]+) #[0-9]+/g, 'the date, or what changed'],
  [/(?<![\w/.&-])#[0-9]{4,5}\b/g, 'the date of the ruling'],
  [/\bD[0-9]{2,3}[a-z]?\b/g, 'nothing: an internal decision id'],
  [/\bCaptain\b/g, 'Titus, or the founder'],
  [/\bthe Deck\b/g, 'nothing: an internal surface'],
  [/\bCarrier\b/g, 'nothing: an internal surface'],
  [/allthecarriercrew/g, 'nothing: an internal mailbox'],
  [
    /\b(?:Orrery|Hatchery|Armature|Hangar|Bridge|Forge|Assembly|Studio)\b/g,
    'nothing, or the thing described plainly: a team folder',
  ],
  [
    /\b(?:Kael|Skeld|Temper|Seethe|Quillon|Nucleus|Simmer|Boss|TC|Claudette|Vesper)\b/g,
    'nothing, Titus, or the maintainers',
  ],
  [/[A-Za-z]:[/\\]Users[/\\]/g, "nothing: a path on a maintainer's machine"],
];

// Lines allowed by their exact text (trimmed), never by file.
const EXEMPT_LINES = new Set([
  // README: the one line that says who maintains the repository.
  '**Who writes this repository.** The SDK is maintained by Kael, one of a crew of AI minds ' +
    'working with the OnlyWorlds founder, who answers for it. Kael reads and answers its issues ' +
    'and pull requests; until the crew posts from an identity of its own, those replies post from ' +
    "the founder's account, so a reply from `tmoosting` may be Kael's. `CHANGELOG.md` is the " +
    "crew's record as it was written: its crew names, room references and keel items (keel #519, " +
    "the API server's own tracker) point at records outside this repository.",
  // release.yml: the changelog-entry check's own list of the words it refuses.
  "if grep -nE 'h[0-9]{1,3} #[0-9]+|\\bCaptain\\b|\\bthe Deck\\b|\\bCarrier\\b|Armature|Orrery|" +
    "Hangar|Hatchery|allthecarriercrew' entry.md; then",
]);

export function scanText(text, where) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (EXEMPT_LINES.has(line.trim())) return;
    const taken = []; // "h37 #3053" is one finding, not two
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
      .filter((p) => !VENDORED.some((v) => p.startsWith(v)) && p !== SELF)
      .map((p) => join(ROOT, p));
  }
  return args.flatMap((a) => (statSync(a).isDirectory() ? walk(a) : [a]));
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
