/**
 * The host in front of onlyworlds.com refuses some writes before the API sees them: a 403 whose body is an HTML page
 * titled "Blocked", not the JSON envelope (measured on the production practice world 2026-11-16: a description holding
 * a backticked `python -m` was refused, the same text with `python3 -m` was created). The error says so in words a
 * person can act on, `isHostBlocked` is true, `code` stays null and `detail` keeps the page; any other 403, an HTML
 * page with another title, and the same page on another status read as before. Runs against dist, with a fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwApiError, parseErrorEnvelope } from '../dist/index.js';

// the head of the page the host served, as measured
const PAGE = '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Blocked</title>\n    <style>body{}</style>\n  </head>\n  <body><h1>Blocked</h1></body>\n</html>\n';

function fake(status, text) {
  const fetch = async () => ({ ok: false, status, headers: new Headers(), async text() { return text; }, async json() { return JSON.parse(text); } });
  return { fetch };
}

async function refusal(status, text) {
  const c = new OwV2Client({ apiKey: 'ow_w_key', apiPin: '1234', fetch: fake(status, text).fetch });
  return c.create('character', { name: 'x', description: 'Run `python -m http.server`.' }).then(() => assert.fail('expected a throw'), (e) => e);
}

test('a 403 HTML page titled Blocked is the host\'s refusal: isHostBlocked, a message to act on, no HTML in it', async () => {
  const err = await refusal(403, PAGE);
  assert.ok(err instanceof OwApiError);
  assert.equal(err.isHostBlocked, true);
  assert.equal(err.status, 403);
  assert.equal(err.code, null);
  assert.equal(err.docUrl, null);
  assert.equal(err.detail, PAGE);
  assert.match(err.message, /^The host in front of onlyworlds\.com refused this request before the API saw it/);
  assert.match(err.message, /nothing was written/);
  assert.match(err.message, /a backtick, a semicolon or a pipe/);
  assert.match(err.message, /fenced code block whose first line names a language/);
  assert.doesNotMatch(err.message, /</);
  assert.equal(err.isAuthError, false);
  assert.equal(err.isNotAuthor, false);
});

test('the title is read whatever its case and spacing, and with attributes', () => {
  for (const title of ['<title>blocked</title>', '<title>  Blocked\n</title>', '<TITLE lang="en">Blocked</TITLE>']) {
    assert.equal(parseErrorEnvelope(403, `<html><head>${title}</head></html>`).isHostBlocked, true, title);
  }
});

test('the API\'s own 403 envelope reads as before, a message naming Blocked included', async () => {
  const env = { error: { type: 'permission_error', code: 'not_author', message: 'Blocked: you did not create it.', param: null, doc_url: null } };
  const err = await refusal(403, JSON.stringify(env));
  assert.equal(err.isHostBlocked, false);
  assert.equal(err.isNotAuthor, true);
  assert.equal(err.message, 'Blocked: you did not create it.');
});

test('an HTML page with another title, the page on another status, and a JSON string are not the host\'s refusal', async () => {
  assert.equal((await refusal(403, PAGE.replace('<title>Blocked</title>', '<title>Forbidden</title>'))).isHostBlocked, false);
  assert.equal((await refusal(502, PAGE)).isHostBlocked, false);
  assert.equal((await refusal(429, PAGE)).isHostBlocked, false);
  assert.equal(parseErrorEnvelope(403, { title: '<title>Blocked</title>' }).isHostBlocked, false);
  // a JSON answer is never the page, even one whose text would hold the title
  assert.equal(parseErrorEnvelope(403, ['<title>Blocked</title>']).isHostBlocked, false);
  // a JSON string is read as its text, in both packages
  assert.equal((await refusal(403, JSON.stringify('<title>Blocked</title>'))).isHostBlocked, true);
  // a page body under the title alone, with no title element, is not read as one
  assert.equal((await refusal(403, '<html><body><h1>Blocked</h1></body></html>')).isHostBlocked, false);
});
