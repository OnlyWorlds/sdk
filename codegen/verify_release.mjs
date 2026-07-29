#!/usr/bin/env node
/**
 * verify_release.mjs — did the thing we think we released actually reach the registry?
 *
 * Run: npm run release:verify        (after any publish)
 *
 * WHY
 * ---
 * On 2026-07-29 I wrote to another bay "Shipped as 4.0.2." At that moment 4.0.2 was
 * committed, tagged and pushed — and NOT published. It never reached npm at all; its
 * content went out inside 4.1.0 an hour later. Skeld caught it by fetching
 * `dist-tags` from the registry instead of believing my letter, and asked the right
 * question: which of "tagged", "released" and "published" did I actually mean?
 *
 * A version number in a changelog, a package.json, or a git tag is a claim about
 * IDENTITY. Identity claims need a second witness; content claims do not. The only
 * witness that settles "is this published" is the registry.
 *
 * This does not check that the release is GOOD — the gates do that. It checks the
 * single fact that no local artifact can tell you: that it is THERE.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

const res = await fetch(`https://registry.npmjs.org/${pkg.name}`).catch(() => null);
if (!res || !res.ok) {
  console.log(`release:verify SKIPPED — could not reach the registry (${res ? res.status : 'network'}).`);
  console.log('  Not a failure: with no registry there is nothing to compare. Re-run when online.');
  process.exit(0);
}

const meta = await res.json();
const latest = meta['dist-tags']?.latest;
const published = Object.keys(meta.versions ?? {});
const local = pkg.version;

console.log(`local package.json : ${local}`);
console.log(`registry latest    : ${latest}`);
console.log(`on registry?       : ${published.includes(local) ? 'yes' : 'NO'}`);

const problems = [];
if (!published.includes(local)) {
  problems.push(
    `${local} is NOT in the registry. It may be tagged locally and unpublished — which is a\n` +
    `  normal intermediate state, but it means "shipped" is not yet true of it. Publish it, or\n` +
    `  say "tagged" rather than "shipped" when reporting it to anyone.`);
}
if (latest !== local) {
  problems.push(
    `registry latest is ${latest}, local is ${local}. Fine if you are mid-work on an unreleased\n` +
    `  bump; wrong if you just published and expected ${local} to be current.`);
}

// The alpha tag is a small live example of a stale identity claim: it still points at
// a pre-release of a version that has since shipped twice.
const alpha = meta['dist-tags']?.alpha;
if (alpha && published.includes(latest) && alpha.startsWith(latest.split('.')[0])) {
  console.log(`\nnote: dist-tag 'alpha' still points at ${alpha} (removing it needs the OTP holder).`);
}

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`⚑ ${p}`);
  process.exit(1);
}
console.log('\nrelease:verify OK — the local version is the registry\'s latest.');
