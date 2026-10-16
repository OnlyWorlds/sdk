/**
 * The id a create mints when the caller passes an Idempotency-Key and no id: a UUIDv5 of the
 * key and the element's position, so the same key with the same element sends the same body and
 * keel replays the first answer instead of refusing a second body (409 `idempotency_error`).
 * The same namespace and name as the Python package's `_minted_id`, so both clients mint the
 * same id for the same key. SHA-1 is computed here, synchronously: `crypto.subtle` is async and
 * missing on pages served over plain http.
 */

/** The Python package's `_KEYED_IDS` (onlyworlds/http.py). */
const KEYED_IDS = '0199b6a0-6f0e-7c2a-9d1e-3b5c7a8e4f21';

function sha1(msg: Uint8Array): Uint8Array {
  const ml = msg.length;
  const total = (((ml + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[ml] = 0x80;
  const bits = ml * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999] :
        i < 40 ? [b ^ c ^ d, 0x6ed9eba1] :
        i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] :
        [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

const hexBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.replace(/-/g, '').match(/../g)!.map((b) => parseInt(b, 16)));

/** RFC 4122 UUIDv5 of `name` (UTF-8) in the namespace `ns`. */
export function uuid5(ns: string, name: string): string {
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(hexBytes(ns));
  input.set(nameBytes, 16);
  const b = sha1(input).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The id for an element at `index` written under the caller's `idempotencyKey`. */
export function keyedId(idempotencyKey: string, index: number): string {
  return uuid5(KEYED_IDS, `${idempotencyKey}\n${index}`);
}
