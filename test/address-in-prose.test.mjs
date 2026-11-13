/**
 * readOwLinkAt (serial 123): the address that starts exactly at an index of a text, and where it ends. Every case of
 * test/fixtures/address-in-prose.json, the same bytes as the Python package's copy (both suites hold its sha256), its
 * `{W}`, `{E}` and `{L}` replaced from its own `ids`. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as sdk from '../dist/index.js';

const { parseOwLink, readOwLinkAt } = sdk;
const FILE = new URL('./fixtures/address-in-prose.json', import.meta.url);
const SHA256 = '864f5e47f9faedb9dc1f378c04da74d41be8a17dd194c759e7940468ff458bfc';
const bytes = readFileSync(FILE);
const doc = JSON.parse(bytes.toString('utf8'));
const fill = (s) => s.replace(/\{([WEL])\}/g, (_, k) => doc.ids[k]);

test('the cases are the shared file, byte for byte', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256);
  assert.equal(doc.cases.length, 39);
  assert.equal(typeof readOwLinkAt, 'function', 'readOwLinkAt is exported from the package');
});

for (const c of doc.cases) {
  test(`address in prose: ${c.name}`, () => {
    const text = fill(c.text);
    const got = readOwLinkAt(text, c.index);
    if (c.address === null) {
      assert.equal(got, null);
      return;
    }
    const address = fill(c.address);
    assert.ok(got !== null, `no address read in ${text}`);
    assert.deepEqual(Object.keys(got).sort(), ['end', 'reading']);
    assert.equal(got.end, c.index + address.length);
    assert.equal(text.slice(c.index, got.end), address);
    assert.deepEqual(got.reading, parseOwLink(address));
  });
}

test('index defaults to 0', () => {
  for (const c of doc.cases.filter((x) => x.index === 0)) {
    assert.deepEqual(readOwLinkAt(fill(c.text)), readOwLinkAt(fill(c.text), 0), c.name);
  }
});

test('the moment and the lens are taken in the writer\'s order only, each whole or not at all', () => {
  const E = doc.ids.E, L = doc.ids.L;
  const end = (text) => readOwLinkAt(text)?.end ?? null;
  const base = `ow://object/${E}`.length;
  // a lens before a moment: the lens is taken, the @ after it is prose
  assert.equal(end(`ow://object/${E}?lens=${L}@4`), base + `?lens=${L}`.length);
  // a step the parser refuses (a leading zero, out of the 32-bit range) is not taken, nor any part of it
  assert.equal(end(`ow://object/${E}@0123`), base);
  assert.equal(end(`ow://object/${E}@2147483648`), base);
  assert.equal(end(`ow://object/${E}@-2147483648.`), base + '@-2147483648'.length);
  // a lens ends where its id ends, 36 characters: what runs on after it is prose
  assert.equal(end(`ow://object/${E}?lens=${L}0`), base + `?lens=${L}`.length);
  assert.equal(end(`ow://object/${E}?lens=${L}abc-d.`), base + `?lens=${L}`.length);
  assert.equal(end(`ow://object/${E}?lens=${L.slice(0, 35)}`), base, 'an id one short is no lens');
  // the key is lens, lowercase, and nothing else
  assert.equal(end(`ow://object/${E}?Lens=${L}`), base);
  assert.equal(end(`ow://object/${E}?lens=${L.toUpperCase()}.`), base + `?lens=${L}`.length);
  // the site's form with a moment after a slug
  assert.equal(end('https://www.onlyworlds.com/w/moppetopia@3, then'), 'https://www.onlyworlds.com/w/moppetopia@3'.length);
});

test('a text that is not a string, or an index that is not a whole number from 0, is a TypeError; past the end, nothing', () => {
  for (const v of [null, undefined, 42, ['ow://x']]) assert.throws(() => readOwLinkAt(v), TypeError, String(v));
  for (const i of [-1, 1.5, NaN, '0', null]) assert.throws(() => readOwLinkAt('ow://x', i), TypeError, String(i));
  assert.equal(readOwLinkAt('ow://x', 99), null);
  assert.equal(readOwLinkAt('', 0), null);
});
