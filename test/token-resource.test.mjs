/**
 * TokenResource after keel dropped four of its routes (2026-10): a 404 names what keel still
 * serves and where the token rating lives now, and the four dead methods carry @deprecated in
 * the published types (what an editor shows a user). Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TokenResource } from '../dist/index.js';

test('a 404 on a token route says keel does not serve it, not that the server is old', async () => {
  const transport = {
    async request() { const e = new Error('Not Found'); e.status = 404; throw e; },
  };
  const tokens = new TokenResource(transport);
  await assert.rejects(tokens.consume({ amount: 1 }), (e) => {
    assert.match(e.message, /keel serves only \/tokens\/status\/ and \/tokens\/encryption-info\//);
    assert.match(e.message, /allowance\(\)/);
    assert.doesNotMatch(e.message, /older server/);
    return true;
  });
});

test('the four routes keel no longer serves are @deprecated in the published types; the two it serves are not', () => {
  const all = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const from = all.indexOf('declare class TokenResource');
  assert.ok(from > 0, 'TokenResource is declared in the published types');
  const dts = all.slice(from, all.indexOf('\n}', from));
  const deprecatedBefore = (name) => {
    const at = dts.indexOf(`${name}(`);
    assert.ok(at > 0, `${name} is in the published types`);
    const doc = dts.slice(dts.lastIndexOf('/**', at), at);
    return doc.includes('@deprecated');
  };
  for (const m of ['consume', 'getAccessKey', 'revokeSession', 'revokeAllSessions']) assert.ok(deprecatedBefore(m), `${m} is deprecated`);
  for (const m of ['getStatus', 'getEncryptionInfo']) assert.ok(!deprecatedBefore(m), `${m} is still served and not deprecated`);
});
