#!/usr/bin/env node
/**
 * verify-promise.mjs: holds the package to its written promise (the docs' Stability page): a patch release
 * fixes and a minor release adds; neither removes nor renames a public name; a name that will go is marked
 * `@deprecated` first, says since which release and the major it leaves in, stays at least six months and goes
 * only in a major.
 *
 * Usage: node scripts/verify-promise.mjs          check the built declarations (dist/) against scripts/public-names.json
 *        node scripts/verify-promise.mjs --write  add the names the build has and the file lacks, and update marks;
 *                                                 a name is taken out only when the major has moved
 *
 * Reads every `types` file of package.json's exports map (each is self-contained: the build bundles them), with
 * the TypeScript compiler. A public name is an export of an entry, and a member (property or method) of an
 * exported class or interface, written `Owner.member`. Checks (fail):
 *   (1) every `@deprecated` tag in those files opens with `Since X.Y.Z.` (a release at or before this one) and
 *       has a sentence naming the release it leaves in, a major above this one;
 *   (2) every name the file lists is still in the build while the major is the file's, and every name in the
 *       build is in the file (a release that adds names runs --write);
 *   (3) when the major has moved, a name gone from the build was marked in the file, and its `since` release is
 *       dated (CHANGELOG.md headings `## [x.y.z] - YYYY-MM-DD`) at least six months before this release.
 * Not checked: whether a mark's words are true, a change of behaviour under an unchanged name (the changelog's),
 * a union's literal values, a function's parameters.
 * Watched failing: scripts/mutants-promise.mjs.
 *
 * Exit: 0 PASS, 1 FAIL, 2 BLIND (no dist, a types file missing, an unreadable names file or changelog).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = process.env.OW_PROMISE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = process.env.OW_PROMISE_NAMES ?? join(ROOT, 'scripts', 'public-names.json');
const WRITE = process.argv.includes('--write');
const LEAVES = /\b(?:leaves?|removed|removal|until)\b[^.]*?(\d+)\.\d+(?:\.\d+)?/i;
const SINCE = /^\s*Since (\d+\.\d+\.\d+)\./;

const blind = (why) => { console.log(`BLIND: ${why}`); process.exit(2); };
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const major = Number(version.split('.')[0]);
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

const entries = Object.entries(pkg.exports ?? {}).filter(([, v]) => v && typeof v === 'object' && v.types);
if (!entries.length) blind('package.json names no types file in its exports map');

const fails = [];
const build = {};
const seenText = new Set();
const norm = (s) => s.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const tagText = (tag) => (typeof tag.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag.comment) ?? '').replace(/\s+/g, ' ').trim();
const markOf = (node) => {
  const tag = ts.getJSDocTags(node).find((t) => t.tagName.text === 'deprecated');
  if (!tag) return null;
  const text = tagText(tag);
  seenText.add(norm(text));
  return { since: text.match(SINCE)?.[1] ?? null, leaves: text.match(LEAVES)?.[1] ?? null, text };
};

for (const [entry, v] of entries) {
  const file = join(ROOT, v.types);
  if (!existsSync(file)) blind(`${v.types} (the exports map's ${entry}) is not built: run npm run build`);
  const text = readFileSync(file, 'utf8');
  const program = ts.createProgram([file], { noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) blind(`${v.types} exports nothing the compiler can read`);
  const names = {};
  let tags = 0;
  const put = (name, node) => {
    const mark = markOf(node);
    if (mark) {
      tags++;
      if (!mark.since) fails.push(`(1) ${entry} ${name}: its @deprecated does not open with "Since X.Y.Z.": "${mark.text.slice(0, 90)}"`);
      else if (cmp(mark.since, version) > 0) fails.push(`(1) ${entry} ${name}: deprecated "since ${mark.since}", after this release ${version}`);
      if (!mark.leaves) fails.push(`(1) ${entry} ${name}: its @deprecated names no release it leaves in`);
      else if (Number(mark.leaves) <= major) fails.push(`(1) ${entry} ${name}: it leaves in ${mark.leaves}.0, not a major above ${major}`);
    }
    const prior = names[name];
    if (!prior || (mark && !prior.deprecated)) names[name] = mark ? { deprecated: { since: mark.since, leaves: mark.leaves ? `${mark.leaves}.0` : null } } : {};
  };
  for (let sym of checker.getExportsOfModule(mod)) {
    const name = sym.getName();
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    for (const decl of sym.declarations ?? []) {
      put(name, decl);
      if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
        for (const m of decl.members) {
          if (!m.name || !(ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) continue;
          if (m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
          if (ts.isIdentifier(m.name) && m.name.text.startsWith('#')) continue;
          put(`${name}.${m.name.text}`, m);
        }
      }
    }
  }
  // A tag the walk above did not reach (a union member, a nested type) is still a mark: read it from the text.
  const inText = (text.match(/@deprecated\b/g) ?? []).length;
  if (inText > tags) {
    for (const hit of text.matchAll(/@deprecated\b([\s\S]*?)\*\//g)) {
      const said = hit[1].replace(/^\s*\*+\s?/gm, ' ').replace(/\s+/g, ' ').trim();
      if (seenText.has(norm(said))) continue;
      if (!SINCE.test(said)) fails.push(`(1) ${entry}: a @deprecated tag does not open with "Since X.Y.Z.": "${said.slice(0, 90)}"`);
      const l = said.match(LEAVES)?.[1];
      if (!l || Number(l) <= major) fails.push(`(1) ${entry}: a @deprecated tag names no major above ${major} to leave in: "${said.slice(0, 90)}"`);
    }
  }
  build[entry] = names;
}

let file = null;
if (existsSync(NAMES)) {
  try { file = JSON.parse(readFileSync(NAMES, 'utf8')); } catch { blind(`${NAMES} is not JSON`); }
  if (!file || typeof file.major !== 'number' || typeof file.entries !== 'object') blind(`${NAMES} has no major or entries`);
} else if (!WRITE) blind(`${NAMES} does not exist: run with --write once`);

const dates = () => {
  let text;
  try { text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { blind('CHANGELOG.md unreadable'); }
  const out = {};
  for (const m of text.matchAll(/^## \[(\d+\.\d+\.\d+)\]\s*[-—]\s*(\d{4}-\d{2}-\d{2})/gm)) out[m[1]] = m[2];
  return out;
};

if (file) {
  const moved = major !== file.major;
  const dated = moved ? dates() : null;
  const today = dated?.[version] ?? new Date().toISOString().slice(0, 10);
  for (const [entry, names] of Object.entries(file.entries)) {
    for (const [name, info] of Object.entries(names)) {
      if (build[entry]?.[name]) continue;
      if (!moved) { fails.push(`(2) ${entry} ${name}: listed at ${file.version}, gone from ${version}, and the major is still ${major}`); continue; }
      const since = info.deprecated?.since;
      if (!since) { fails.push(`(3) ${entry} ${name}: gone in major ${major} without a deprecation first`); continue; }
      const from = dated[since];
      if (!from) { fails.push(`(3) ${entry} ${name}: deprecated since ${since}, a release CHANGELOG.md does not date`); continue; }
      const due = new Date(`${from}T00:00:00Z`); due.setUTCMonth(due.getUTCMonth() + 6);
      if (new Date(`${today}T00:00:00Z`) < due) fails.push(`(3) ${entry} ${name}: deprecated since ${since} (${from}), gone ${today}, before ${due.toISOString().slice(0, 10)}`);
    }
  }
  if (!WRITE) {
    for (const [entry, names] of Object.entries(build)) {
      for (const name of Object.keys(names)) if (!file.entries[entry]?.[name]) fails.push(`(2) ${entry} ${name}: public in ${version} and not in scripts/public-names.json: run --write`);
    }
  }
}

const count = Object.values(build).reduce((n, e) => n + Object.keys(e).length, 0);
const marked = Object.values(build).reduce((n, e) => n + Object.values(e).filter((x) => x.deprecated).length, 0);
if (WRITE) {
  const out = { about: 'Every public name of @onlyworlds/sdk, by exports-map entry, and its deprecation: written by scripts/verify-promise.mjs --write, read by it in CI. A name leaves this file only in a major.', version, major, entries: {} };
  for (const entry of Object.keys(build).sort()) {
    const keep = (file && file.major === major) ? (file.entries[entry] ?? {}) : {};
    const merged = { ...keep, ...build[entry] };
    out.entries[entry] = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
  }
  writeFileSync(NAMES, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${NAMES}: ${count} names in ${Object.keys(build).length} entries, ${marked} marked`);
}
for (const f of fails) console.log(`  FAIL ${f}`);
if (fails.length) { console.log(`FAIL: ${fails.length} break(s) of the promise in ${version}.`); process.exit(1); }
console.log(`PASS: ${count} public names in ${Object.keys(build).length} entries of ${version}, ${marked} marked deprecated, each with its since and the major it leaves in; none gone within major ${major}. Not checked: a mark's words, behaviour under an unchanged name.`);
