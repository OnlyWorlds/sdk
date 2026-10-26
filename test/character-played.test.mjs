/**
 * A Character someone plays on the roster is never deleted out from under them (keel #688):
 * delete answers 422 character_played, param id, and isCharacterPlayed names it. A malformed
 * id's 422 carries the same param and is not it. Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client } from '../dist/index.js';

function fake(status, body) {
  const fetch = async () => {
    const text = body === undefined ? '' : JSON.stringify(body);
    return { ok: status < 300, status, headers: new Headers(), async text() { return text; }, async json() { return body; } };
  };
  return fetch;
}

const env = (code, param) => ({ error: { type: 'invalid_request', code, message: code, param,
  doc_url: `https://onlyworlds.github.io/api/errors#${code}` } });

async function thrown(status, body) {
  const client = new OwV2Client({ apiKey: 'ow_w_key', apiPin: '1234', fetch: fake(status, body) });
  try { await client.delete('character', '0196f2a0-0000-7000-8000-000000000001'); } catch (err) { return err; }
  assert.fail('expected a throw');
}

test('422 character_played on a delete is isCharacterPlayed', async () => {
  const played = await thrown(422, env('character_played', 'id'));
  assert.equal(played.isCharacterPlayed, true);
  assert.equal(played.param, 'id');
  assert.equal(played.isValidationError, true);
  assert.equal(played.isNotAuthor, false);
});

test('a malformed id, the same param, is not isCharacterPlayed; nor is the code on another status', async () => {
  const malformed = await thrown(422, env('invalid_request', 'id'));
  assert.equal(malformed.isCharacterPlayed, false);
  assert.equal(malformed.param, 'id');
  assert.equal((await thrown(409, env('character_played', 'id'))).isCharacterPlayed, false);
  const notAuthor = await thrown(403, { error: { type: 'permission_error', code: 'not_author', message: 'x', param: null, doc_url: null } });
  assert.equal(notAuthor.isCharacterPlayed, false);
});
