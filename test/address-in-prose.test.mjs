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

test('index and end are JavaScript string indexes (UTF-16 code units): an emoji before the address, found by indexOf, still slices right', () => {
  const address = `ow://object/${doc.ids.E}@4`;
  const text = `Built ${String.fromCodePoint(0x1f6a2)} the gate: ${address}.`;
  const index = text.indexOf('ow://');
  assert.equal(index, 19, 'the emoji is two code units: 18 code points come before the address');
  const got = readOwLinkAt(text, index);
  assert.equal(got.end, index + address.length);
  assert.equal(text.slice(index, got.end), address);
  assert.equal(text[got.end], '.');
  assert.deepEqual(got.reading, parseOwLink(address));
});

// The site's form after `/w/` (serial 123, amendments 6 and 8): the run is read whole, once, with no order between
// an id and a slug. It ends at the first character outside the slug's alphabet (lowercase letters, digits, hyphens)
// or the id's (either case of hex); exactly an id's form is the id, any other legal slug run is the slug, else no
// address. A run followed by a letter or an underscore is cut inside a word and is no address.
test('the site\'s form: the run after /w/ is read whole, an id or a slug, or no address', () => {
  const H = 'https://www.onlyworlds.com/w/';
  const W = doc.ids.W, E = doc.ids.E;
  const found = (text) => {
    const got = readOwLinkAt(text);
    return got === null ? null : text.slice(0, got.end);
  };
  // the five slug cases of the profile's fixture (serial 123), by their names there
  assert.equal(found(`${H}hyperion.`), `${H}hyperion`, 'slug-ends-at-its-alphabet-the-full-stop-is-prose');
  assert.equal(found(`${H}event.`), null, 'slug-that-is-a-type-word-is-no-address');
  assert.equal(found(`${H}my-world-.`), null, 'slug-run-ending-in-a-hyphen-is-no-address');
  assert.equal(found(`${H}${'a'.repeat(41)}.`), null, 'slug-run-past-forty-characters-is-no-address');
  assert.equal(found(`${H}Moppetopia.`), null, 'slug-starting-outside-its-alphabet-is-no-address');
  // a run is the whole run, never a shorter slug inside it, and never an id that a slug run starts with
  assert.equal(found(`${H}${'a'.repeat(40)}.`), `${H}${'a'.repeat(40)}`);
  assert.equal(found(`${H}${W}-x.`), `${H}${W}-x`);
  assert.equal(readOwLinkAt(`${H}${W}-x.`).reading.worldIsSlug, true);
  assert.equal(found(`${H}${W}abc.`), `${H}${W}abc`);
  assert.equal(readOwLinkAt(`${H}${W}abc.`).reading.worldIsSlug, true);
  // exactly an id's form, in either case, is the id
  assert.deepEqual(readOwLinkAt(`${H}${W.toUpperCase()}.`)?.reading.world, W);
  assert.equal(found(`${H}${W.toUpperCase()}.`), `${H}${W.toUpperCase()}`);
  assert.equal(found(`${H}${W.toUpperCase()}x.`), null, 'an upper-case id run on into slug letters is neither');
  // cut inside a word: a run followed by a letter or an underscore is no address
  assert.equal(found(`${H}mopPetopia.`), null);
  assert.equal(found(`${H}hyper_ion.`), null);
  assert.equal(found(`${H}${W}G.`), null);
  assert.equal(found(`${H}caf${String.fromCodePoint(0xe9)}.`), null);
  // a combining mark counts with the letters: a decomposed cafe-acute is cut inside a word
  assert.equal(found(`${H}cafe${String.fromCodePoint(0x301)}.`), null);
  // what follows a whole run is read as before: an element, a moment, a lens, or prose
  assert.equal(found(`${H}hyperion/object/${E}.`), `${H}hyperion/object/${E}`);
  assert.equal(found(`${H}hyperion/charcter/${E}.`), `${H}hyperion`);
  assert.equal(found(`${H}hyperion@3, then`), `${H}hyperion@3`);
  assert.equal(found(`${H}${W}/object/${E}abc.`), `${H}${W}/object/${E}`);
  // the longest slug with the longest type word still reads its element
  const long = `${H}${'a'.repeat(40)}/institution/${E}`;
  assert.equal(found(`${long}.`), long);
});

test('a text that is not a string,or an index that is not a whole number from 0, is a TypeError; past the end, nothing', () => {
  for (const v of [null, undefined, 42, ['ow://x']]) assert.throws(() => readOwLinkAt(v), TypeError, String(v));
  for (const i of [-1, 1.5, NaN, '0', null]) assert.throws(() => readOwLinkAt('ow://x', i), TypeError, String(i));
  assert.equal(readOwLinkAt('ow://x', 99), null);
  assert.equal(readOwLinkAt('', 0), null);
});
