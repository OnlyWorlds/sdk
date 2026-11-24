/**
 * Photo preparation: the pure plan (sizes, the type order) here, and preparePhoto's
 * own decisions (option refusals, the fallback type, the over-limit message) against a
 * stand-in canvas. A stand-in tests this file's reading of a browser, not a browser:
 * the browser half (canvas encoding, the webp fallback) is walked in real browsers by
 * Playwright outside this suite, since Node has no canvas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planPhoto, preparePhoto, PHOTO_TYPES, PHOTO_MAX_BYTES } from '../dist/index.js';

test('keel\'s picture types and limit', () => {
  assert.deepEqual([...PHOTO_TYPES], ['image/webp', 'image/png', 'image/jpeg', 'image/avif']);
  assert.equal(PHOTO_MAX_BYTES, 15 * 1024 * 1024);
});

test('a phone photo shrinks to 2048 on its longest side, keeping its shape', () => {
  const p = planPhoto({ width: 4032, height: 3024, type: 'image/jpeg' });
  assert.equal(p.width, 2048);
  assert.equal(p.height, 1536);
  assert.ok(Math.abs(p.scale - 2048 / 4032) < 1e-12);
  const tall = planPhoto({ width: 3024, height: 4032, type: 'image/jpeg' });
  assert.deepEqual([tall.width, tall.height], [1536, 2048]);
});

test('a small picture is never enlarged', () => {
  const p = planPhoto({ width: 800, height: 600, type: 'image/png' });
  assert.deepEqual([p.width, p.height, p.scale], [800, 600, 1]);
});

test('maxSide is honoured, and a very thin picture keeps at least one pixel', () => {
  assert.equal(planPhoto({ width: 8000, height: 2000, type: 'image/jpeg' }, { maxSide: 4096 }).width, 4096);
  assert.equal(planPhoto({ width: 10000, height: 1, type: 'image/jpeg' }, { maxSide: 100 }).height, 1);
});

test('webp first; a photo falls back to jpeg, a png to png (it may be transparent)', () => {
  assert.deepEqual(planPhoto({ width: 10, height: 10, type: 'image/jpeg' }).targets, ['image/webp', 'image/jpeg']);
  assert.deepEqual(planPhoto({ width: 10, height: 10, type: 'image/heic' }).targets, ['image/webp', 'image/jpeg']);
  assert.deepEqual(planPhoto({ width: 10, height: 10, type: 'image/png' }).targets, ['image/webp', 'image/png']);
});

test('a bad size or maxSide is a TypeError', () => {
  assert.throws(() => planPhoto({ width: 0, height: 10, type: 'image/png' }), TypeError);
  assert.throws(() => planPhoto({ width: 10, height: 10, type: 'image/png' }, { maxSide: 0 }), TypeError);
});

test('outside a browser, preparePhoto says it needs one', async () => {
  await assert.rejects(preparePhoto(new Blob([new Uint8Array(4)], { type: 'image/png' })), /needs a browser/);
});

// ---------------------------------------------------------------- preparePhoto on a stand-in browser

const file = (type, bytes) => new Blob([new Uint8Array(bytes)], { type });

/**
 * Runs `fn(seen)` with a stand-in browser on globalThis, then takes it away again.
 * createImageBitmap answers `width` x `height`; OffscreenCanvas.convertToBlob answers a blob of the
 * asked type, `sizes[type]` bytes long (100 when not given), or a PNG for a webp request when `webp`
 * is false (what the HTML spec has an engine do for a type it cannot encode). Every pixel of the
 * drawn picture is opaque except the last one, whose alpha is `alpha`. `pixels: 'throws'` makes
 * getImageData throw (a canvas whose pixels cannot be read); `'missing'` leaves it out.
 * `seen` counts decodes and records each getImageData rectangle and each encode request.
 */
async function withBrowser({ width, height, webp = true, alpha = 255, pixels = 'read', sizes = {} }, fn) {
  const g = globalThis;
  const had = { createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas };
  const seen = { decodes: 0, reads: [], encodes: [] };
  g.createImageBitmap = async () => { seen.decodes++; return { width, height, close() {} }; };
  g.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      const ctx = { drawImage() {} };
      if (pixels !== 'missing') {
        ctx.getImageData = (x, y, w, h) => {
          seen.reads.push([x, y, w, h]);
          if (pixels === 'throws') throw new Error('the canvas cannot be read');
          const data = new Uint8ClampedArray(w * h * 4).fill(255);
          data[data.length - 1] = alpha;
          return { data };
        };
      }
      return ctx;
    }
    async convertToBlob({ type }) {
      seen.encodes.push(type);
      const real = !webp && type === 'image/webp' ? 'image/png' : type;
      return file(real, sizes[real] ?? 100);
    }
  };
  try {
    return await fn(seen);
  } finally {
    for (const [k, v] of Object.entries(had)) { if (v === undefined) delete g[k]; else g[k] = v; }
  }
}

test('no webp: a picture with a pixel not fully opaque comes back PNG whatever its source type, an opaque one JPEG, read once from the resized canvas', async () => {
  for (const type of ['image/webp', 'image/avif', 'image/gif']) {
    await withBrowser({ width: 300, height: 200, webp: false, alpha: 0 }, async (seen) => {
      const out = await preparePhoto(file(type, 50_000));
      assert.equal(out.type, 'image/png', `${type} with a transparent pixel`);
      assert.equal(out.kept, false);
      assert.deepEqual(seen.reads, [[0, 0, 300, 200]], 'one getImageData over the whole canvas');
    });
  }
  await withBrowser({ width: 300, height: 200, webp: false, alpha: 254 }, async () => {
    assert.equal((await preparePhoto(file('image/webp', 50_000))).type, 'image/png', 'alpha 254 is not fully opaque');
  });
  await withBrowser({ width: 4000, height: 3000, webp: false, alpha: 0 }, async (seen) => {
    const out = await preparePhoto(file('image/webp', 5_000_000));
    assert.deepEqual([out.type, out.width, out.height], ['image/png', 2048, 1536]);
    assert.deepEqual(seen.reads, [[0, 0, 2048, 1536]], 'the resized canvas, not the source size');
  });
  await withBrowser({ width: 300, height: 200, webp: false, alpha: 255 }, async (seen) => {
    const out = await preparePhoto(file('image/webp', 50_000));
    assert.equal(out.type, 'image/jpeg', 'every pixel opaque');
    assert.equal(seen.reads.length, 1);
    assert.deepEqual(seen.encodes, ['image/webp', 'image/jpeg']);
  });
  // No read where none is needed: webp came back, or the source is PNG (PNG either way).
  await withBrowser({ width: 300, height: 200, webp: true, alpha: 0 }, async (seen) => {
    assert.equal((await preparePhoto(file('image/webp', 50_000))).type, 'image/webp');
    assert.equal(seen.reads.length, 0);
  });
  await withBrowser({ width: 300, height: 200, webp: false, alpha: 0 }, async (seen) => {
    assert.equal((await preparePhoto(file('image/png', 50_000))).type, 'image/png');
    assert.equal(seen.reads.length, 0);
  });
});

test('no webp: pixels that cannot be read count as possibly transparent (PNG), never as opaque', async () => {
  for (const pixels of ['throws', 'missing']) {
    await withBrowser({ width: 300, height: 200, webp: false, pixels }, async (seen) => {
      const out = await preparePhoto(file('image/webp', 50_000));
      assert.equal(out.type, 'image/png', `getImageData ${pixels}`);
      assert.deepEqual(seen.encodes, ['image/webp', 'image/png']);
    });
  }
});

test('no webp: a JPEG source stays JPEG and its pixels are never read, also where they cannot be', async () => {
  for (const pixels of ['read', 'throws', 'missing']) {
    await withBrowser({ width: 300, height: 200, webp: false, pixels }, async (seen) => {
      const out = await preparePhoto(file('image/jpeg', 50_000));
      assert.equal(out.type, 'image/jpeg', `getImageData ${pixels}`);
      assert.equal(seen.reads.length, 0, 'no read of a source that holds no alpha');
      assert.deepEqual(seen.encodes, ['image/webp', 'image/jpeg']);
    });
  }
});

test('a maxBytes that is not a positive number is refused before any decode', async () => {
  await withBrowser({ width: 10, height: 10 }, async (seen) => {
    for (const maxBytes of [0, -1, NaN]) {
      await assert.rejects(preparePhoto(file('image/jpeg', 10), { maxBytes }),
        (e) => e instanceof TypeError && e.message === 'preparePhoto: maxBytes must be a positive number', String(maxBytes));
    }
    assert.equal(seen.decodes, 0, 'nothing decoded');
    await preparePhoto(file('image/jpeg', 10), { maxBytes: 1_000_000 });
    assert.equal(seen.decodes, 1);
  });
});

test('a quality that is not a finite number from 0 to 1 is refused by name and value, before any decode', async () => {
  const bad = [[5, '5'], [NaN, 'NaN'], [-0.1, '-0.1'], [1.5, '1.5'], [Infinity, 'Infinity'], ['0.5', '"0.5"']];
  await withBrowser({ width: 10, height: 10 }, async (seen) => {
    for (const [quality, shown] of bad) {
      await assert.rejects(preparePhoto(file('image/jpeg', 10), { quality }),
        (e) => e instanceof TypeError && e.message === `preparePhoto: quality must be a finite number from 0 to 1, not ${shown}.`, String(quality));
    }
    assert.equal(seen.decodes, 0, 'nothing decoded');
    for (const quality of [0, 0.5, 1]) await preparePhoto(file('image/jpeg', 10), { quality });
    assert.equal(seen.decodes, 3, 'the ends of the range are accepted');
  });
  // With no browser at all, the option is still the first thing refused.
  await assert.rejects(preparePhoto(file('image/jpeg', 10), { quality: 5 }), /quality must be a finite number from 0 to 1, not 5\./);
});

test('a maxSide that is not a positive number is refused before any decode', async () => {
  await withBrowser({ width: 10, height: 10 }, async (seen) => {
    for (const maxSide of [0, -1, NaN]) {
      await assert.rejects(preparePhoto(file('image/jpeg', 10), { maxSide }),
        (e) => e instanceof TypeError && e.message === 'preparePhoto: maxSide must be a positive number', String(maxSide));
    }
    assert.equal(seen.decodes, 0, 'nothing decoded');
  });
  await assert.rejects(preparePhoto(file('image/jpeg', 10), { maxSide: 0 }), /maxSide must be a positive number/);
});

test('over maxBytes: the message gives the size and the limit in bytes, and says shrinking only when it shrank', async () => {
  // Shrunk and re-encoded (the walk's 565,986-byte result against maxBytes 1000).
  await withBrowser({ width: 4032, height: 3024, sizes: { 'image/webp': 565_986 } }, async () => {
    await assert.rejects(preparePhoto(file('image/jpeg', 3_000_000), { maxBytes: 1000 }), (e) => e instanceof TypeError
      && e.message === 'preparePhoto: the result is 565,986 bytes, over the limit of 1,000 bytes (maxBytes) after shrinking; try a smaller maxSide');
  });
  // Re-encoded at its own size (a type keel does not accept is never kept).
  await withBrowser({ width: 200, height: 150, sizes: { 'image/webp': 2_163 } }, async () => {
    await assert.rejects(preparePhoto(file('image/bmp', 90_054), { maxBytes: 1000 }), (e) => e instanceof TypeError
      && /^preparePhoto: the result is 2,163 bytes, over the limit of 1,000 bytes \(maxBytes\) after re-encoding;/.test(e.message)
      && !/shrinking/.test(e.message));
  });
  // Kept as given: re-encoding made it bigger, so it was never shrunk or re-encoded.
  await withBrowser({ width: 64, height: 48, sizes: { 'image/webp': 2_000 } }, async () => {
    await assert.rejects(preparePhoto(file('image/png', 1_509), { maxBytes: 1000 }), (e) => e instanceof TypeError
      && /^preparePhoto: the file as given is 1,509 bytes, over the limit of 1,000 bytes \(maxBytes\);/.test(e.message)
      && !/after shrinking|after re-encoding/.test(e.message));
  });
  // One byte over the default limit: both numbers still told apart.
  await withBrowser({ width: 4032, height: 3024, sizes: { 'image/webp': PHOTO_MAX_BYTES + 1 } }, async () => {
    await assert.rejects(preparePhoto(file('image/jpeg', 20_000_000)), /15,728,641 bytes, over the limit of 15,728,640 bytes/);
  });
});

test('the doc comment names every error preparePhoto throws, and why a kept original can differ by browser', () => {
  const dts = readFileSync(fileURLToPath(new URL('../dist/index.d.ts', import.meta.url)), 'utf8');
  const at = dts.indexOf('declare function preparePhoto(');
  assert.ok(at > 0, 'preparePhoto is declared in dist/index.d.ts');
  const doc = dts.slice(dts.lastIndexOf('/**', at), at);
  assert.ok(doc.endsWith('*/\n') || doc.trimEnd().endsWith('*/'), 'the comment sits right above the declaration');
  const text = doc.replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ');
  // Each throw in src/photo.ts, by its words, and the words the doc comment must carry for it.
  const causes = [
    [/maxSide must be a positive number/, /a `maxSide` or a `maxBytes` that is not a positive number/],
    [/maxBytes must be a positive number/, /a `maxSide` or a `maxBytes` that is not a positive number/],
    [/quality must be a finite number from 0 to 1/, /`quality` that is not a finite number from 0 to 1/],
    [/needs a browser: no createImageBitmap/, /outside a browser \(no `createImageBitmap`/],
    [/needs a browser: no canvas/, /or no canvas\)/],
    [/cannot read that picture/, /a file the browser cannot decode/],
    [/the picture has no size/, /decodes with no size/],
    [/could not encode the picture/, /cannot encode the picture/],
    [/preparePhoto: the (file as given|result) is/, /over `maxBytes`/],
  ];
  const src = readFileSync(fileURLToPath(new URL('../src/photo.ts', import.meta.url)), 'utf8');
  const sites = [...src.matchAll(/new TypeError\(/g)].map((m) => src.slice(m.index, m.index + 200));
  assert.ok(sites.length > 0);
  for (const site of sites) {
    const cause = causes.find(([words]) => words.test(site));
    assert.ok(cause, `a throw this test does not know (add it to the doc comment and here): ${site.split('\n')[0]}`);
    assert.match(text, cause[1]);
  }
  assert.match(src, /refuseUnknownOptions\('preparePhoto'/);
  assert.match(text, /an unknown option/);
  assert.match(text, /before anything is decoded/);
  assert.match(text, /Whether a small original is kept or re-encoded can differ between browsers/);
  assert.match(text, /re-encoding did not make it smaller, and encoders differ/);
});
