/**
 * The folder writer refuses an element id that cannot name a file (test/fixtures/unsafe-ids.cases.json, the same
 * bytes as the Python package's tests/fixtures/unsafe-ids.cases.json; both suites hold its sha256): one that holds
 * `/`, `\` or a control character, or is `.` or `..`, whatever the name, since `<id>.json` would leave its type
 * folder. Each refused case is a TypeError naming the type, the id as JSON text and the case's why, and no file;
 * each written case gives its path. Runs against the built package (dist).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { worldFolderFiles } from '../dist/convert.js';

const bytes = readFileSync(new URL('./fixtures/unsafe-ids.cases.json', import.meta.url));
const CASES_SHA256 = 'cc6c0c016b441c0ebdc2840304f28c69e05a7ddf6eb0a333b343188717eb5581';
const cases = JSON.parse(bytes.toString('utf8'));
const W = { id: 'w-1', name: 'W' };

test('the cases file is the bytes the Python package reads', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CASES_SHA256);
  assert.equal(cases.version, 1);
  assert.equal(cases.refused.length, 19);
  assert.equal(cases.written.length, 5);
});

test('every refused id: a TypeError naming the type, the id and why, and no file', () => {
  const missed = [];
  for (const c of cases.refused) {
    let files;
    let error;
    try {
      files = worldFolderFiles(W, { character: [{ id: 'ok-1', name: 'Fine' }, { id: c.id, name: c.name }] });
    } catch (e) {
      error = e;
    }
    const want = `worldFolderFiles: elements.character[1]: character element id ${JSON.stringify(c.id)} cannot be a file name: ${c.why}.`;
    if (files !== undefined || !(error instanceof TypeError) || error.message !== want) {
      missed.push(`${JSON.stringify(c.id)}: ${files ? `${files.length} files` : error?.message}`);
    }
  }
  assert.deepEqual(missed, []);
});

test('every written id: its file, at its path', () => {
  for (const c of cases.written) {
    const files = worldFolderFiles(W, { character: [{ id: c.id, name: c.name }] });
    assert.deepEqual(files.map((f) => f.path), [c.path, 'world.json'], JSON.stringify(c.id));
  }
});

test('a refused id under any type, and the world id names no path', () => {
  assert.throws(() => worldFolderFiles(W, { zone: [{ id: '..', name: 'Z' }] }),
    (e) => e instanceof TypeError && e.message.includes('zone element id ".." cannot be a file name: it is . or ..'));
  const files = worldFolderFiles({ id: '../w', name: 'W' }, { character: [{ id: 'c', name: 'C' }] });
  assert.deepEqual(files.map((f) => f.path), ['elements/character/c--c.json', 'world.json'], 'the world id is only world.json\'s text');
});
