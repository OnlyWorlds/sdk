/**
 * Photo preparation: make a picture from a phone's camera or files ready for
 * `uploadImage` (webp, png, jpeg or avif, at most 15 MB), in the browser,
 * before it leaves the device. Lifted from the upload page's converter
 * (upload.onlyworlds.com): canvas, webp at quality 0.82, alpha kept.
 *
 * Two traps it handles:
 * - A browser that cannot encode webp hands back a PNG instead (Safari has
 *   long done this), and a PNG of a photo is huge. The result's real type is
 *   checked; when webp did not come back, the result is PNG when the source
 *   is PNG or when the picture as drawn on the (resized) canvas has any pixel
 *   that is not fully opaque, read with one `getImageData` over that canvas
 *   (pixels that cannot be read count as transparent), and JPEG at the same
 *   quality otherwise. A JPEG source holds no alpha and is never read.
 *
 * Alpha is kept on every path: webp carries it, the fallback is PNG whenever
 * a pixel is not fully opaque, and a kept original is the input's own bytes.
 * - Re-encoding an already compressed file at the same size can make it
 *   bigger: then the original is kept, if its type is one keel accepts.
 *
 * `planPhoto` is the pure part (sizes and types), so it is tested anywhere;
 * `preparePhoto` needs a browser (`createImageBitmap` and a canvas).
 */

import { refuseUnknownOptions } from './options';

/** The picture types keel's image upload accepts. */
export const PHOTO_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/avif'] as const;
/** keel's limit for one picture. */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
/** The default longest side, in pixels: planPhoto and preparePhoto read the one number. */
const DEFAULT_MAX_SIDE = 2048;

export interface OwPhotoOptions {
  /** The longest side in pixels, after shrinking. Default 2048: a notebook page stays readable and a phone upload stays small. */
  maxSide?: number;
  /** Encoder quality for webp and jpeg, 0 to 1. Default 0.82 (the media pipeline's q82). */
  quality?: number;
  /** Refuse a result over this many bytes. Default 15 MB, keel's limit. */
  maxBytes?: number;
}

/** Every key `OwPhotoOptions` declares; planPhoto and preparePhoto refuse any other by name, never dropped. */
const PHOTO_OPTION_KEYS: readonly (keyof OwPhotoOptions)[] = ['maxSide', 'quality', 'maxBytes'];

export interface OwPhotoPlan {
  width: number;
  height: number;
  /** 1 when no shrinking is needed. */
  scale: number;
  /**
   * The types to try, in order; the first one the browser really produces wins. From sizes and
   * type alone: preparePhoto tries PNG in place of a JPEG fallback when the drawn picture has a
   * pixel that is not fully opaque.
   */
  targets: string[];
}

export interface OwPreparedPhoto {
  blob: Blob;
  type: string;
  width: number;
  height: number;
  /** The input, for showing "4032×3024 · 3.1 MB → 2048×1536 webp · 410 KB". */
  original: { width: number; height: number; type: string; size: number };
  /** True when the original bytes were kept unchanged. */
  kept: boolean;
}

/** Sizes and types for one picture: pure, no browser needed. */
export function planPhoto(source: { width: number; height: number; type: string }, opts: OwPhotoOptions = {}): OwPhotoPlan {
  refuseUnknownOptions('planPhoto', opts, PHOTO_OPTION_KEYS);
  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE;
  if (!(maxSide > 0)) throw new TypeError('preparePhoto: maxSide must be a positive number');
  if (!(source.width > 0 && source.height > 0)) throw new TypeError('preparePhoto: the picture has no size');
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const fallback = source.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return { width, height, scale, targets: ['image/webp', fallback] };
}

type Canvas = { width: number; height: number; getContext(id: '2d'): unknown };

function makeCanvas(width: number, height: number): { canvas: Canvas; encode: (type: string, quality: number) => Promise<Blob | null> } {
  const g = globalThis as unknown as {
    OffscreenCanvas?: new (w: number, h: number) => Canvas & { convertToBlob(o: { type: string; quality: number }): Promise<Blob> };
    document?: { createElement(tag: 'canvas'): Canvas & { toBlob(cb: (b: Blob | null) => void, type: string, q: number): void } };
  };
  if (g.OffscreenCanvas) {
    const canvas = new g.OffscreenCanvas(width, height);
    return { canvas, encode: (type, quality) => canvas.convertToBlob({ type, quality }).catch(() => null) };
  }
  if (g.document) {
    const canvas = g.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, encode: (type, quality) => new Promise(res => canvas.toBlob(res, type, quality)) };
  }
  throw new TypeError('preparePhoto needs a browser: no canvas here');
}

type Context2d = {
  drawImage(i: unknown, x: number, y: number, w: number, h: number): void;
  getImageData?(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
};

/** True when any pixel of the drawn canvas is not fully opaque, or when its pixels cannot be read. */
function mayBeTransparent(ctx: Context2d, width: number, height: number): boolean {
  try {
    const data = ctx.getImageData!(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
    return false;
  } catch {
    return true;
  }
}

/** A byte count as digits with thousands separators, so two counts in one message can be told apart. */
function bytesText(n: number): string {
  return `${n.toLocaleString('en-US')} bytes`;
}

/**
 * Shrink and convert a picture for upload. Throws `TypeError`:
 * - for an unknown option, a `maxSide` or a `maxBytes` that is not a positive
 *   number, or a `quality` that is not a finite number from 0 to 1 (all
 *   before anything is decoded);
 * - outside a browser (no `createImageBitmap`, or no canvas);
 * - for a file the browser cannot decode, or one that decodes with no size;
 * - when the browser cannot encode the picture as any of the types it tries;
 * - when the result is over `maxBytes`.
 *
 * Whether a small original is kept or re-encoded can differ between browsers:
 * it is kept only when no shrinking was needed, its type is one keel accepts
 * and re-encoding did not make it smaller, and encoders differ.
 */
export async function preparePhoto(input: Blob, opts: OwPhotoOptions = {}): Promise<OwPreparedPhoto> {
  refuseUnknownOptions('preparePhoto', opts, PHOTO_OPTION_KEYS);
  if (!((opts.maxSide ?? DEFAULT_MAX_SIDE) > 0)) throw new TypeError('preparePhoto: maxSide must be a positive number');
  const q: unknown = opts.quality ?? 0.82;
  if (!(typeof q === 'number' && q >= 0 && q <= 1)) { // NaN and the infinities fail the range
    throw new TypeError(`preparePhoto: quality must be a finite number from 0 to 1, not ${typeof q === 'string' ? JSON.stringify(q) : String(q)}.`);
  }
  const quality = q;
  const maxBytes = opts.maxBytes ?? PHOTO_MAX_BYTES;
  if (!(maxBytes > 0)) throw new TypeError('preparePhoto: maxBytes must be a positive number'); // NaN would switch the limit off
  const decode = (globalThis as unknown as { createImageBitmap?: (b: Blob, o?: object) => Promise<{ width: number; height: number; close?(): void }> }).createImageBitmap;
  if (!decode) throw new TypeError('preparePhoto needs a browser: no createImageBitmap here');
  let bitmap: { width: number; height: number; close?(): void };
  try {
    bitmap = await decode(input, { imageOrientation: 'from-image' });
  } catch {
    throw new TypeError('preparePhoto: this browser cannot read that picture');
  }
  const original = { width: bitmap.width, height: bitmap.height, type: input.type, size: input.size };
  try {
    const plan = planPhoto(original, opts);
    const { canvas, encode } = makeCanvas(plan.width, plan.height);
    const ctx = canvas.getContext('2d') as Context2d;
    ctx.drawImage(bitmap, 0, 0, plan.width, plan.height);
    let made: Blob | null = null;
    for (const target of plan.targets) {
      // The fallback: JPEG would drop alpha, so a picture with any pixel not fully opaque goes to PNG.
      // A JPEG source holds no alpha, so it is never read: it stays JPEG, also where pixels cannot be read.
      const type = target === 'image/jpeg' && input.type !== 'image/jpeg' && mayBeTransparent(ctx, plan.width, plan.height) ? 'image/png' : target;
      const b = await encode(type, quality);
      if (b && b.type === type) { made = b; break; }
    }
    if (!made) throw new TypeError('preparePhoto: this browser could not encode the picture');
    const keepOriginal = plan.scale === 1 && made.size >= input.size && (PHOTO_TYPES as readonly string[]).includes(input.type);
    const out = keepOriginal
      ? { blob: input, type: input.type, width: original.width, height: original.height, kept: true }
      : { blob: made, type: made.type, width: plan.width, height: plan.height, kept: false };
    if (out.blob.size > maxBytes) {
      const over = `${bytesText(out.blob.size)}, over the limit of ${bytesText(maxBytes)} (maxBytes)`;
      throw new TypeError(out.kept
        ? `preparePhoto: the file as given is ${over}; it was kept unchanged because re-encoding did not make it smaller; try a smaller maxSide`
        : `preparePhoto: the result is ${over} after ${plan.scale < 1 ? 'shrinking' : 're-encoding'}; try a smaller maxSide`);
    }
    return { ...out, original };
  } finally {
    bitmap.close?.();
  }
}
