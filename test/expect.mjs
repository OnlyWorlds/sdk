/**
 * The few vitest matchers Atlas's calendar tests use, over node:test and node:assert, so
 * those tests run here as Atlas wrote them (ported in 4.20.0). A
 * matcher the port meets that is not here fails loudly, as a TypeError, never silently.
 */
import assert from 'node:assert/strict';

export { describe, it } from 'node:test';

export function expect(actual) {
  return {
    toBe: (expected) => assert.ok(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toBeGreaterThan: (n) => assert.ok(actual > n, `expected ${actual} > ${n}`),
    toBeLessThanOrEqual: (n) => assert.ok(actual <= n, `expected ${actual} <= ${n}`),
    not: {
      toBe: (expected) => assert.ok(!Object.is(actual, expected), `expected ${String(actual)} not to be ${String(expected)}`),
    },
  };
}
