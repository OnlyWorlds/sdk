/**
 * draughtText on every case of test/fixtures/draught-text/: each file's sha256 against MANIFEST.json,
 * each draught's text against its expected.txt, byte for byte, and each full packet against its compact
 * twin (the same read gives the same text either way). The Python package vendors the same folder and
 * replays it against draught_text. Runs against the compiled public bundle (dist), as the other tests.
 * The fixture is written by test/fixtures/generate-draught-text.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draughtText } from '../dist/index.js';

const DIR = fileURLToPath(new URL('./fixtures/draught-text/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));
const cases = readdirSync(DIR).filter((n) => statSync(join(DIR, n)).isDirectory()).sort();
const read = (name, file) => readFileSync(join(DIR, name, file));

test('draughtText fixture: every file is in the manifest and matches its sha256', () => {
  const onDisk = cases.flatMap((n) => readdirSync(join(DIR, n)).map((f) => `${n}/${f}`)).sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), onDisk);
  for (const [path, sha] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(readFileSync(join(DIR, path))).digest('hex'), sha, path);
  }
});

test('draughtText: every case gives its expected text, byte for byte', () => {
  assert.ok(cases.length >= 47, `the fixture holds ${cases.length} cases`);
  for (const real of ['as-of-248', 'as-of-300', 'as-of-453']) {
    assert.ok(cases.includes(real) && cases.includes(`${real}-compact`), `the real case ${real} and its compact twin`);
  }
  for (const name of cases) {
    const got = draughtText(JSON.parse(read(name, 'draught.json').toString('utf8')));
    assert.ok(Buffer.from(got, 'utf8').equals(read(name, 'expected.txt')), `case ${name}`);
  }
});

/** The cases with no compact twin: compact drops "" and {} from a body, and the proposed mark with them. */
const NO_TWIN = ['proposed-odd-values'];

test('draughtText: a full packet and its compact twin give the same text', () => {
  const twins = cases.filter((n) => n.endsWith('-compact'));
  for (const name of NO_TWIN) assert.ok(cases.includes(name) && !cases.includes(`${name}-compact`), name);
  assert.equal(twins.length * 2 + NO_TWIN.length, cases.length, 'every other case has its twin');
  for (const twin of twins) {
    const full = twin.slice(0, -'-compact'.length);
    assert.ok(cases.includes(full), `${twin} has its full packet`);
    assert.ok(read(full, 'expected.txt').equals(read(twin, 'expected.txt')), `${full}: the expected texts differ`);
    const a = draughtText(JSON.parse(read(full, 'draught.json').toString('utf8')));
    const b = draughtText(JSON.parse(read(twin, 'draught.json').toString('utf8')));
    assert.equal(a, b, `${full}: full and compact give different text`);
  }
});

test('draughtText: the float case holds its floats as a file writes them (249.0), not as JSON.stringify does', () => {
  for (const name of ['float-integral', 'float-integral-compact']) {
    const raw = read(name, 'draught.json').toString('utf8');
    for (const literal of ['"start_date": 249.0', '"as_of": 300.0', '"now": 453.0']) assert.ok(raw.includes(literal), `${name}: ${literal}`);
  }
});

test('draughtText: LF line endings, one newline at the end, never two blank lines in a row', () => {
  for (const name of cases) {
    const text = read(name, 'expected.txt').toString('utf8');
    assert.ok(!text.includes('\r'), `${name}: a CR`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${name}: the end`);
    assert.ok(!text.includes('\n\n\n'), `${name}: two blank lines in a row`);
  }
});

test('draughtText refuses a draught that is not an object, or has no world object, with a TypeError', () => {
  for (const bad of [null, undefined, [], 'draught', 1, true]) assert.throws(() => draughtText(bad), TypeError);
  assert.throws(() => draughtText({}), TypeError);
  assert.throws(() => draughtText({ world: null }), TypeError);
  assert.throws(() => draughtText({ world: [] }), TypeError);
  assert.throws(() => draughtText({ world: 'Moppetopia' }), TypeError);
  assert.equal(draughtText.length, 1, 'takes no options');
});

test('draughtText: the frame line names the reader the packet was read as, public over mode', () => {
  const packet = (mode, reader) => ({ world: { id: 'w', name: 'W', description: '' }, calendar: {}, as_of: null, now: null, mode, ...(reader === undefined ? {} : { reader }), policy: {} });
  const line = (mode, reader) => draughtText(packet(mode, reader)).split('\n').find((l) => l.startsWith('What the record holds'));
  assert.match(line('voice', 'public'), / Read as the public reader\.$/);
  assert.match(line('act', 'public'), / Read as the public reader\.$/);
  assert.match(line('voice', 'owner'), / Read as the Character's own view\.$/);
  assert.match(line('act', 'contributor'), / Read as the caller's view\.$/);
  assert.match(line('voice'), / Read as the Character's own view\.$/, 'a packet from before keel served reader');
});
