/**
 * Photo preparation: make a picture from a phone's camera or files ready for
 * `uploadImage` (webp, png, jpeg or avif, at most 15 MB), in the browser,
 * before it leaves the device. Lifted from the upload page's converter
 * (upload.onlyworlds.com, Boss's): canvas, webp at quality 0.82, alpha kept.
 *
 * Two traps it handles:
 * - A browser that cannot encode webp hands back a PNG instead (Safari has
 *   long done this), and a PNG of a photo is huge. The result's real type is
 *   checked; when webp did not come back, a photo falls back to JPEG at the
 *   same quality and a PNG source stays PNG (it may have transparency).
 * - Re-encoding an already compressed file at the same size can make it
 *   bigger: then the original is kept, if its type is one keel accepts.
 *
 * `planPhoto` is the pure part (sizes and types), so it is tested anywhere;
 * `preparePhoto` needs a browser (`createImageBitmap` and a canvas).
 */

/** The picture types keel's image upload accepts. */
export const PHOTO_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/avif'] as const;
/** keel's limit for one picture. */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

export interface OwPhotoOptions {
  /** The longest side in pixels, after shrinking. Default 2048: a notebook page stays readable and a phone upload stays small. */
  maxSide?: number;
  /** Encoder quality for webp and jpeg, 0 to 1. Default 0.82 (the media pipeline's q82). */
  quality?: number;
  /** Refuse a result over this many bytes. Default 15 MB, keel's limit. */
  maxBytes?: number;
}

export interface OwPhotoPlan {
  width: number;
  height: number;
  /** 1 when no shrinking is needed. */
  scale: number;
  /** The types to try, in order; the first one the browser really produces wins. */
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
  const maxSide = opts.maxSide ?? 2048;
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

/**
 * Shrink and convert a picture for upload. Throws `TypeError` outside a
 * browser, for a file the browser cannot decode, or when the result is still
 * over `maxBytes`.
 */
export async function preparePhoto(input: Blob, opts: OwPhotoOptions = {}): Promise<OwPreparedPhoto> {
  const quality = opts.quality ?? 0.82;
  const maxBytes = opts.maxBytes ?? PHOTO_MAX_BYTES;
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
    (canvas.getContext('2d') as { drawImage(i: unknown, x: number, y: number, w: number, h: number): void }).drawImage(bitmap, 0, 0, plan.width, plan.height);
    let made: Blob | null = null;
    for (const type of plan.targets) {
      const b = await encode(type, quality);
      if (b && b.type === type) { made = b; break; }
    }
    if (!made) throw new TypeError('preparePhoto: this browser could not encode the picture');
    const keepOriginal = plan.scale === 1 && made.size >= input.size && (PHOTO_TYPES as readonly string[]).includes(input.type);
    const out = keepOriginal
      ? { blob: input, type: input.type, width: original.width, height: original.height, kept: true }
      : { blob: made, type: made.type, width: plan.width, height: plan.height, kept: false };
    if (out.blob.size > maxBytes) {
      throw new TypeError(`preparePhoto: still ${Math.ceil(out.blob.size / 1048576)} MB after shrinking; try a smaller maxSide`);
    }
    return { ...out, original };
  } finally {
    bitmap.close?.();
  }
}
