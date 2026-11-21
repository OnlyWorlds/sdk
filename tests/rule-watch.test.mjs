// A test that fails on purpose. It exists only on a branch that is never merged:
// it shows that a pull request with a red check cannot reach main.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('fails on purpose', () => {
  assert.equal(1, 2);
});
