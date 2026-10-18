/**
 * Signing in with a password (keel #211): signInWithPassword turns an email (or username) and
 * password into a new account token through keel's sign-in service, keeps only the token and ends
 * the session. Every case runs on a client with NO key, the client a person signing in has (a fake
 * holding a key would prove nothing for them). Bodies are keel's and allauth's as production sent
 * them (2026-10-17). Runs against dist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwSignInError } from '../dist/index.js';

const BASE = 'https://www.onlyworlds.com/api/v2';
const AUTH = `${BASE}/auth/app/v1`;
const PASSWORD = 'pw-Zq81!never-shown';
const SESSION = 'sess_abc123';

const json = (status, body, headers = {}) =>
  () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const html = (status, text, headers = {}) =>
  () => new Response(text, { status, headers: { 'Content-Type': 'text/html', ...headers } });
const offline = () => { throw new TypeError('fetch failed'); };

const LOGGED_IN = json(200, {
  status: 200,
  data: { user: { id: 7, email: 'ana@example.org' }, methods: [] },
  meta: { is_authenticated: true, session_token: SESSION },
});
const MINTED = json(201, {
  id: 'tok-1', name: 'Lantern on iPhone', last4: 'wxyz', last_used_at: null, revoked: false, token: 'ow_a_secretwxyz',
});
// allauth's answer to ending the session: 401 is its signed-out state (seen on production, 2026-10-17).
const SIGNED_OUT = json(401, { status: 401, data: { flows: [] }, meta: { is_authenticated: false } });
const MISMATCH = json(400, {
  status: 400,
  errors: [{ message: 'The email address and/or password you specified are not correct.', code: 'email_password_mismatch', param: 'password' }],
});

/** A fetch that answers each request with the next responder, and records what was sent. */
function script(...responders) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers ?? {}, body: init.body });
    const next = responders[calls.length - 1];
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
    return next();
  };
  return { fetch, calls };
}

const keyless = (fetch, baseUrl) => new OwV2Client({ fetch, ...(baseUrl ? { baseUrl } : {}) });
const credentials = (h) => Object.keys(h).filter((k) => ['api-key', 'api-pin', 'authorization'].includes(k.toLowerCase()));
const signIn = (c, extra = {}) => c.signInWithPassword({ email: 'ana@example.org', password: PASSWORD, tokenName: 'Lantern on iPhone', ...extra });

/** Every refusal seen in this file, checked at the end for the password. */
const refusals = [];
async function refused(promise, check) {
  let caught;
  await assert.rejects(promise, (e) => { caught = e; return true; });
  refusals.push(caught);
  assert.ok(caught instanceof OwSignInError, `an OwSignInError, got ${caught?.name}: ${caught?.message}`);
  check?.(caught);
  return caught;
}

test('signInWithPassword: sign in, mint, end the session; only the token comes back, no key sent', async () => {
  const f = script(LOGGED_IN, MINTED, SIGNED_OUT);
  const c = keyless(f.fetch);
  assert.equal(c.keyKind, 'none');
  const got = await signIn(c);
  assert.deepEqual(got, { token: 'ow_a_secretwxyz', id: 'tok-1', name: 'Lantern on iPhone', last4: 'wxyz' });

  assert.deepEqual(f.calls.map((x) => [x.method, x.url]), [
    ['POST', `${AUTH}/auth/login`],
    ['POST', `${BASE}/account/tokens`],
    ['DELETE', `${AUTH}/auth/session`],
  ]);
  for (const x of f.calls) assert.deepEqual(credentials(x.headers), [], `no key on ${x.method} ${x.url}`);
  assert.equal(f.calls[0].headers['Content-Type'], 'application/json');
  assert.equal(f.calls[0].headers['X-Session-Token'], undefined);
  assert.deepEqual(JSON.parse(f.calls[0].body), { email: 'ana@example.org', password: PASSWORD });
  assert.equal(f.calls[1].headers['X-Session-Token'], SESSION);
  assert.deepEqual(JSON.parse(f.calls[1].body), { name: 'Lantern on iPhone' });
  assert.equal(f.calls[2].headers['X-Session-Token'], SESSION);
  assert.equal(f.calls[2].body, undefined);
});

test('signInWithPassword: a username signs in as { username, password }; a key the client holds is not sent', async () => {
  const f = script(LOGGED_IN, MINTED, SIGNED_OUT);
  await keyless(f.fetch).signInWithPassword({ username: 'Walker', password: PASSWORD, tokenName: 'Atlas' });
  assert.deepEqual(JSON.parse(f.calls[0].body), { username: 'Walker', password: PASSWORD });

  const g = script(LOGGED_IN, MINTED, SIGNED_OUT);
  await signIn(new OwV2Client({ apiKey: 'ow_a_other', fetch: g.fetch }));
  for (const x of g.calls) assert.deepEqual(credentials(x.headers), []);
});

test('signInWithPassword: ending the session failing on the network is still a sign-in', async () => {
  const f = script(LOGGED_IN, MINTED, offline);
  assert.equal((await signIn(keyless(f.fetch))).token, 'ow_a_secretwxyz');
  assert.equal(f.calls.length, 3);
});

test('signInWithPassword: a wrong password (production\'s answer) is invalid_credentials, nothing more sent', async () => {
  const f = script(MISMATCH);
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'invalid_credentials');
    assert.equal(e.status, 400);
    assert.equal(e.code, 'email_password_mismatch');
    assert.equal(e.message, 'The email address and/or password you specified are not correct.');
  });
  assert.equal(f.calls.length, 1);

  const g = script(json(400, { status: 400, errors: [{ message: 'The username and/or password you specified are not correct.', code: 'username_password_mismatch', param: 'password' }] }));
  await refused(keyless(g.fetch).signInWithPassword({ username: 'Walker', password: PASSWORD, tokenName: 'x' }),
    (e) => assert.equal(e.reason, 'invalid_credentials'));
});

test('signInWithPassword: allauth\'s failed-login throttle (too_many_login_attempts) is rate_limited', async () => {
  const f = script(json(400, { status: 400, errors: [{ message: 'Too many failed login attempts. Try again later.', code: 'too_many_login_attempts' }] }));
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'rate_limited');
    assert.equal(e.status, 400);
    assert.equal(e.code, 'too_many_login_attempts');
  });
});

test('signInWithPassword: a 429 with an HTML page and Retry-After: 30 is rate_limited, retryAfter 30', async () => {
  const f = script(html(429, '<!doctype html><title>Too many requests</title>', { 'Retry-After': '30' }));
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'rate_limited');
    assert.equal(e.status, 429);
    assert.equal(e.retryAfter, 30);
  });
  assert.equal(f.calls.length, 1);
});

test('signInWithPassword: an unconfirmed email (a pending verify_email flow) is email_unverified', async () => {
  const pending = { status: 401, data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] }, meta: { is_authenticated: false } };
  const f = script(json(401, pending));
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'email_unverified');
    assert.equal(e.status, 401);
  });
  assert.equal(f.calls.length, 1);

  // A pending flow that hands out a session: that session is ended too.
  const g = script(json(401, { ...pending, meta: { is_authenticated: false, session_token: SESSION } }), SIGNED_OUT);
  await refused(signIn(keyless(g.fetch)), (e) => assert.equal(e.reason, 'email_unverified'));
  assert.deepEqual(g.calls.map((x) => [x.method, x.url, x.headers['X-Session-Token']]), [
    ['POST', `${AUTH}/auth/login`, undefined],
    ['DELETE', `${AUTH}/auth/session`, SESSION],
  ]);
});

test('signInWithPassword: no connection is offline, nothing more sent', async () => {
  const f = script(offline);
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'offline');
    assert.equal(e.status, undefined);
  });
  assert.equal(f.calls.length, 1);
});

test('signInWithPassword: other refusals are failed, with keel\'s message when there is one', async () => {
  const f = script(json(400, { status: 400, errors: [{ message: 'This account is inactive.', code: 'account_inactive' }] }));
  await refused(signIn(keyless(f.fetch)), (e) => {
    assert.equal(e.reason, 'failed');
    assert.equal(e.code, 'account_inactive');
    assert.equal(e.message, 'This account is inactive.');
  });
  const g = script(html(502, '<html>Bad gateway</html>'));
  await refused(signIn(keyless(g.fetch)), (e) => { assert.equal(e.reason, 'failed'); assert.equal(e.status, 502); });
  // A 200 without a session token: nothing to mint with.
  const h = script(json(200, { status: 200, meta: { is_authenticated: true } }));
  await refused(signIn(keyless(h.fetch)), (e) => { assert.equal(e.reason, 'failed'); assert.equal(e.status, 200); });
  assert.equal(h.calls.length, 1);
});

test('signInWithPassword: a refused mint (403, 422, or 201 without a token) is mint_failed, and the session is still ended', async () => {
  const refusalsOfMint = [
    [json(403, { error: { type: 'permission_denied', code: 'forbidden', message: 'Not allowed.' } }), 403, 'forbidden'],
    [json(422, { error: { type: 'invalid_request', code: 'validation_error', message: 'name: too long', param: 'name' } }), 422, 'validation_error'],
    [json(201, { id: 'tok-1', name: 'x', last4: 'wxyz' }), 201, undefined],
  ];
  for (const [answer, status, code] of refusalsOfMint) {
    const f = script(LOGGED_IN, answer, SIGNED_OUT);
    await refused(signIn(keyless(f.fetch)), (e) => {
      assert.equal(e.reason, 'mint_failed');
      assert.equal(e.status, status);
      assert.equal(e.code, code);
    });
    assert.deepEqual(f.calls.map((x) => x.method), ['POST', 'POST', 'DELETE'], `session ended after a ${status}`);
    assert.equal(f.calls[2].headers['X-Session-Token'], SESSION);
  }
});

test('signInWithPassword: the connection dropping on the mint is offline, and the session is still ended', async () => {
  const f = script(LOGGED_IN, offline, SIGNED_OUT);
  await refused(signIn(keyless(f.fetch)), (e) => assert.equal(e.reason, 'offline'));
  assert.deepEqual(f.calls.map((x) => [x.method, x.url]), [
    ['POST', `${AUTH}/auth/login`], ['POST', `${BASE}/account/tokens`], ['DELETE', `${AUTH}/auth/session`],
  ]);
});

test('signInWithPassword: both email and username, or neither, or no password or tokenName, is a TypeError before sending', async () => {
  const f = script();
  const c = keyless(f.fetch);
  for (const opts of [
    { email: 'ana@example.org', username: 'Walker', password: PASSWORD, tokenName: 'x' },
    { password: PASSWORD, tokenName: 'x' },
    { email: '  ', password: PASSWORD, tokenName: 'x' },
    { email: 'ana@example.org', password: '', tokenName: 'x' },
    { email: 'ana@example.org', password: PASSWORD, tokenName: '' },
  ]) {
    await assert.rejects(c.signInWithPassword(opts), (e) => {
      assert.ok(e instanceof TypeError);
      assert.ok(!e.message.includes(PASSWORD));
      return true;
    });
  }
  assert.equal(f.calls.length, 0, 'nothing sent');
});

test('signInWithPassword: a custom baseUrl derives the sign-in service the same way', async () => {
  const f = script(LOGGED_IN, MINTED, SIGNED_OUT);
  await signIn(keyless(f.fetch, 'http://localhost:8000/api/v2/'));
  assert.deepEqual(f.calls.map((x) => x.url), [
    'http://localhost:8000/api/v2/auth/app/v1/auth/login',
    'http://localhost:8000/api/v2/account/tokens',
    'http://localhost:8000/api/v2/auth/app/v1/auth/session',
  ]);
});

test('signInWithPassword: keel text that holds the password is never shown', async () => {
  const f = script(json(400, { status: 400, errors: [{ message: `bad password ${PASSWORD}`, code: 'email_password_mismatch' }] }));
  await refused(signIn(keyless(f.fetch)), (e) => assert.equal(e.reason, 'invalid_credentials'));
  const g = script(LOGGED_IN, json(422, { error: { code: 'validation_error', message: `got ${PASSWORD}` } }), SIGNED_OUT);
  await refused(signIn(keyless(g.fetch)), (e) => assert.equal(e.reason, 'mint_failed'));
});

test('signInWithPassword: the password is in no refusal\'s message or properties', () => {
  assert.ok(refusals.length >= 15, `every refusal above was collected (${refusals.length})`);
  for (const e of refusals) {
    assert.ok(!e.message.includes(PASSWORD), `message: ${e.message}`);
    assert.ok(!JSON.stringify({ ...e }).includes(PASSWORD), `properties of ${e.reason}`);
    assert.ok(!String(e.stack).includes(PASSWORD), `stack of ${e.reason}`);
    assert.equal(e.cause, undefined);
  }
});

test('a client with no key names signInWithPassword among the calls it can make', async () => {
  const c = keyless(script().fetch);
  await assert.rejects(c.list('character'), (e) => e instanceof TypeError && /signInWithPassword/.test(e.message));
});
