/**
 * Photo preparation: the pure plan (sizes, the type order) here; the browser
 * half (canvas encoding, the webp fallback) is walked in real browsers by
 * Playwright outside this suite, since Node has no canvas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
