/**
 * keel v2 engine absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * OnlyWorlds key-kind detection. Prefixes make leaked keys grep-scannable
 * (Stripe/GitHub precedent) -- and tell a client what auth shape to expect.
 */

export type OwKeyKind =
  /** ow_w_ -- world key, read + write. Writes need the world's PIN if it has one. */
  | 'write'
  /** ow_r_ -- world key, read-only, works bare (no PIN). The share-with-players primitive. */
  | 'read'
  /** ow_a_ -- account Bearer token for /account/* routes; can mint world keys. */
  | 'account'
  /** Grandfathered 10-digit key. Needs PIN to read private worlds. */
  | 'legacy'
  | 'unknown';

const LEGACY_RE = /^[0-9]{10}$/;

/** Demo range 0000000000-0000000009: read-only aliases, safe as live read gates. */
export function isDemoKey(key: string): boolean {
  return LEGACY_RE.test(key) && key >= '0000000000' && key <= '0000000009';
}

export function detectKeyKind(key: string): OwKeyKind {
  if (key.startsWith('ow_w_')) return 'write';
  if (key.startsWith('ow_r_')) return 'read';
  if (key.startsWith('ow_a_')) return 'account';
  if (LEGACY_RE.test(key)) return 'legacy';
  return 'unknown';
}

/** Can this key kind ever perform world writes? (PIN is a separate, per-world question.) */
export function kindCanWrite(kind: OwKeyKind): boolean {
  return kind === 'write' || kind === 'legacy';
}

/**
 * Should a credential UI ask for a PIN with this key?
 * Prefixed keys read PIN-less; legacy keys may need it; writes on pinned
 * worlds always need it. 'optional' means: show the field, don't require it.
 */
export function pinExpectation(kind: OwKeyKind): 'never' | 'optional' | 'required-for-private-reads' {
  switch (kind) {
    case 'read': return 'never';
    case 'account': return 'never';
    case 'write': return 'optional';
    case 'legacy': return 'required-for-private-reads';
    default: return 'optional';
  }
}
