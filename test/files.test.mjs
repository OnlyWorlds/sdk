/**
 * Files on elements: listFiles, worldFiles, createFileTicket, uploadFile,
 * fileDownloadLink and removeFile. Each route's method, path and body; no Idempotency-Key on
 * the ticket; the kind read from the name as keel reads it; the two-step upload (the ticket
 * from keel, the raw bytes to upload_url with the ticket alone); keel's and the upload host's
 * refusals as typed OwApiErrors; and the progress path through a fake XMLHttpRequest. Runs
 * against dist, with a fake fetch: nothing here reaches a server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwV2Client, OwApiError, OwNetworkError, FILE_EXTENSIONS, fileKindOf } from '../dist/index.js';

const API = 'https://www.onlyworlds.com/api/v2';
const EL = '018f0000-0000-7000-8000-0000000000e1';
const FID = '018f0000-0000-7000-8000-0000000000f1';

const ROW = {
  id: FID, name: 'Map notes.pdf', kind: 'pdf', size: 5, label: 'description',
  added_by: { name: 'Ada', membership: null, agent: false }, added_at: '2026-10-19T18:00:00Z',
};
const WORLD = {
  data: [{ ...ROW, element_type: 'location', element_id: EL }],
  used_bytes: 42991616, cap_bytes: 262144000,
};
const TICKET = {
  ticket: 'f1.sig', upload_url: 'https://upload.example/v1/file', prefix: `w/w1/${EL}/`,
  key: `w/w1/${EL}/${FID}.pdf`, max_bytes: 8, exp: 1900000000, uses: 1,
  issued_to: { account: 'a1', membership: null }, kind: 'file', file_id: FID,
};
const STORED = { key: TICKET.key, fid: FID, bytes: 5, type: 'application/pdf', etag: 'e' };
const LINK = { url: 'https://files.example/v1/get?t=g1.sig', exp: 1900000300, name: 'Map notes.pdf', kind: 'pdf', size: 5 };

/** A scripted fetch: `answer(url, init)` gives {status, body, headers}; every call is kept. */
function fake(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const r = answer(url, init);
    const status = r.status ?? 200;
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300, status, headers: new Headers(r.headers ?? {}),
      async text() { return text; }, async json() { return r.body; },
    };
  };
  return { fetch, calls };
}

/** keel answers the ticket with `keel` (default: the 201), the upload host answers `host`. */
function uploadFake(host = { status: 201, body: STORED }, keel = { status: 201, body: TICKET }) {
  return fake((url) => (url.startsWith(API) ? keel : host));
}

const client = (fetch, cfg = {}) => new OwV2Client({ apiKey: 'ow_w_test', apiPin: '1234', fetch, ...cfg });
const pdf = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

// -- the API routes -------------------------------------------------------------------------

test('listFiles: GET /{type}/{id}/files with the key, the rows back', async () => {
  const f = fake(() => ({ status: 200, body: { data: [ROW] } }));
  assert.deepEqual(await client(f.fetch).listFiles('location', EL), [ROW]);
  const { url, init } = f.calls[0];
  assert.equal(url, `${API}/location/${EL}/files`);
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined);
  assert.equal(init.headers['API-Key'], 'ow_w_test');
});

test('worldFiles: GET /world/files, the rows and the total as keel sends them', async () => {
  const f = fake(() => ({ status: 200, body: WORLD }));
  assert.deepEqual(await client(f.fetch).worldFiles(), WORLD);
  assert.equal(f.calls[0].url, `${API}/world/files`);
  assert.equal(f.calls[0].init.method, 'GET');
});

test('createFileTicket: POST /{type}/{id}/files with {name, kind, size, label}, the key and PIN, and no Idempotency-Key', async () => {
  const f = fake(() => ({ status: 201, body: TICKET }));
  const c = client(f.fetch);
  assert.deepEqual(await c.createFileTicket('location', EL, { name: 'Map notes.pdf', size: 5, label: 'description' }), TICKET);
  await c.createFileTicket('location', EL, { name: 'Map notes.pdf', size: 5 });
  const [first, second] = f.calls;
  assert.equal(first.url, `${API}/location/${EL}/files`);
  assert.equal(first.init.method, 'POST');
  assert.deepEqual(JSON.parse(first.init.body), { name: 'Map notes.pdf', kind: 'pdf', size: 5, label: 'description' });
  assert.deepEqual(JSON.parse(second.init.body), { name: 'Map notes.pdf', kind: 'pdf', size: 5 });
  for (const { init } of f.calls) {
    assert.equal(init.headers['API-Key'], 'ow_w_test');
    assert.equal(init.headers['API-Pin'], '1234');
    assert.equal(Object.keys(init.headers).some((h) => h.toLowerCase() === 'idempotency-key'), false);
  }
});

test('the kind is read from the name as keel reads it: .yml is yaml, .markdown is md, case and folders ignored', async () => {
  const f = fake(() => ({ status: 201, body: TICKET }));
  const c = client(f.fetch);
  const cases = [
    ['rules.yml', 'yaml'], ['rules.yaml', 'yaml'], ['README.markdown', 'md'], ['notes.md', 'md'],
    ['MAP.PDF', 'pdf'], ['a.tar.zip', 'zip'], ['C:\\worlds\\lore.txt', 'txt'], ['data/table.csv', 'csv'],
    ['x.json', 'json'], ['Cargo.toml', 'toml'],
  ];
  for (const [name] of cases) await c.createFileTicket('character', EL, { name, size: 1 });
  assert.deepEqual(f.calls.map((x) => JSON.parse(x.init.body).kind), cases.map(([, k]) => k));
  // the name goes as given: keel cleans it
  assert.equal(JSON.parse(f.calls[6].init.body).name, 'C:\\worlds\\lore.txt');
});

test('a kind passed is sent as passed, with no reading of the name', async () => {
  const f = fake(() => ({ status: 201, body: TICKET }));
  await client(f.fetch).createFileTicket('character', EL, { name: 'odd.bin', kind: 'txt', size: 1 });
  assert.equal(JSON.parse(f.calls[0].init.body).kind, 'txt');
});

test('a name with no extension keel takes is a TypeError naming the ones it takes, before any request', async () => {
  const f = uploadFake();
  const c = client(f.fetch);
  for (const name of ['report.docx', 'noextension', '.pdf', 'trailing.', 'image.png']) {
    await assert.rejects(c.createFileTicket('character', EL, { name, size: 1 }),
      (e) => e instanceof TypeError && /\.pdf .*\.yml .*\.zip/.test(e.message), name);
    await assert.rejects(c.uploadFile('character', EL, pdf(), { name }), TypeError, name);
  }
  await assert.rejects(c.createFileTicket('character', EL, { name: '', size: 1 }), TypeError);
  assert.equal(f.calls.length, 0);
});

test('fileDownloadLink: GET /{type}/{id}/files/{file_id}/download, the link and its exp back', async () => {
  const f = fake(() => ({ status: 200, body: LINK }));
  assert.deepEqual(await client(f.fetch).fileDownloadLink('location', EL, FID), LINK);
  assert.equal(f.calls[0].url, `${API}/location/${EL}/files/${FID}/download`);
  assert.equal(f.calls[0].init.method, 'GET');
});

test('removeFile: DELETE /{type}/{id}/files/{file_id}; a 204 resolves to nothing', async () => {
  const f = fake(() => ({ status: 204 }));
  assert.equal(await client(f.fetch).removeFile('location', EL, FID), undefined);
  assert.equal(f.calls[0].url, `${API}/location/${EL}/files/${FID}`);
  assert.equal(f.calls[0].init.method, 'DELETE');
  assert.equal(f.calls[0].init.body, undefined);
});

test('removeFile: a key that is neither the owner\'s nor the uploader\'s is a 403 permission_error', async () => {
  const f = fake(() => ({ status: 403, body: { error: { type: 'permission_error', code: 'permission_error', message: 'Only the file\'s uploader or the world\'s owner can remove it.' } } }));
  await assert.rejects(client(f.fetch).removeFile('location', EL, FID), (e) => e instanceof OwApiError && e.status === 403 && e.type === 'permission_error');
});

// -- the upload ---------------------------------------------------------------------------------

test('uploadFile: the ticket from keel with the byte size, then the raw bytes to upload_url with the ticket alone', async () => {
  const f = uploadFake();
  const bytes = pdf();
  assert.deepEqual(await client(f.fetch).uploadFile('location', EL, bytes, { name: 'Map notes.pdf', label: 'description' }), STORED);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { name: 'Map notes.pdf', kind: 'pdf', size: 5, label: 'description' });
  const { url, init } = f.calls[1];
  assert.equal(url, TICKET.upload_url);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, bytes);
  assert.deepEqual(init.headers, { Authorization: 'Bearer f1.sig' });
});

test('uploadFile: the size is the byte length of an ArrayBuffer, a Uint8Array and a Blob', async () => {
  for (const file of [new ArrayBuffer(5), new Uint8Array(5), new Blob([new Uint8Array(5)])]) {
    const f = uploadFake();
    await client(f.fetch).uploadFile('location', EL, file, { name: 'a.txt' });
    assert.equal(JSON.parse(f.calls[0].init.body).size, 5);
    assert.equal(f.calls[1].init.body, file);
  }
});

test('uploadFile: a File gives its own name; a Blob with no name and no opts.name is a TypeError, nothing sent', { skip: typeof File === 'undefined' && 'no File in this Node' }, async () => {
  const f = uploadFake();
  const c = client(f.fetch);
  await c.uploadFile('location', EL, new File([pdf()], 'Ledger.PDF'));
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { name: 'Ledger.PDF', kind: 'pdf', size: 5 });
  await c.uploadFile('location', EL, new File([pdf()], 'Ledger.PDF'), { name: 'renamed.pdf' });
  assert.equal(JSON.parse(f.calls[2].init.body).name, 'renamed.pdf');
  const before = f.calls.length;
  await assert.rejects(c.uploadFile('location', EL, new Blob([pdf()])), (e) => e instanceof TypeError && /opts\.name/.test(e.message));
  await assert.rejects(c.uploadFile('location', EL, pdf()), TypeError);
  assert.equal(f.calls.length, before);
});

test('uploadFile: a ticket you pass is used, keel is not called, and no name is needed', async () => {
  const f = uploadFake();
  await client(f.fetch).uploadFile('location', EL, pdf(), { ticket: TICKET });
  assert.deepEqual(f.calls.map((x) => x.url), [TICKET.upload_url]);
});

test('uploadFile: larger than the ticket\'s max_bytes throws 413 too_large and sends nothing', async () => {
  const f = uploadFake();
  await assert.rejects(client(f.fetch).uploadFile('location', EL, new Uint8Array(9), { ticket: TICKET }),
    (e) => e instanceof OwApiError && e.status === 413 && e.code === 'too_large' && !e.isFileTooLarge);
  assert.equal(f.calls.length, 0);
});

test('keel\'s 413 file_too_large is isFileTooLarge with param size; the host is never called', async () => {
  const f = uploadFake(undefined, {
    status: 413,
    body: { error: { type: 'invalid_request', code: 'file_too_large', message: 'This file is 41 MB; a file can be at most 25 MB.', param: 'size', doc_url: 'https://onlyworlds.github.io/api/errors#file_too_large' } },
  });
  await assert.rejects(client(f.fetch).uploadFile('location', EL, pdf(), { name: 'big.pdf' }),
    (e) => e instanceof OwApiError && e.isFileTooLarge && e.param === 'size' && /41 MB/.test(e.message) && !e.isFilesFull);
  assert.equal(f.calls.length, 1);
});

test('keel\'s 429 quota_exceeded is isQuotaExceeded with its Retry-After in seconds', async () => {
  const f = uploadFake(undefined, {
    status: 429, headers: { 'Retry-After': '3600' },
    body: { error: { type: 'rate_limited', code: 'quota_exceeded', message: 'This world has reached its daily file upload limit.' } },
  });
  await assert.rejects(client(f.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }),
    (e) => e instanceof OwApiError && e.isQuotaExceeded && e.retryAfter === 3600);
  assert.equal(f.calls.length, 1);
});

test('keel\'s 403 files_full is isFilesFull, and not isNotAuthor', async () => {
  const f = uploadFake(undefined, {
    status: 403,
    body: { error: { type: 'permission_error', code: 'files_full', message: 'This world has 249.6 MB of its 250 MB. This file is 4 MB. Remove a file, or ask the owner.' } },
  });
  await assert.rejects(client(f.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }),
    (e) => e instanceof OwApiError && e.isFilesFull && !e.isNotAuthor && !e.isFileTooLarge);
});

test('the upload host\'s 409 exists and 415 unsupported_type arrive as OwApiError with their codes', async () => {
  const exists = uploadFake({ status: 409, body: { error: 'exists', key: TICKET.key, note: 'this file id is already stored; ask keel for a new ticket' } });
  await assert.rejects(client(exists.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }),
    (e) => e instanceof OwApiError && e.status === 409 && e.code === 'exists');
  const wrong = uploadFake({ status: 415, body: { error: 'unsupported_type', reason: 'not a pdf', accepted: ['pdf'] } });
  await assert.rejects(client(wrong.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }),
    (e) => e instanceof OwApiError && e.status === 415 && e.code === 'unsupported_type');
});

test('uploadFile: a host that cannot be reached is an OwNetworkError', async () => {
  const f = fake((url) => {
    if (url.startsWith(API)) return { status: 201, body: TICKET };
    throw new TypeError('fetch failed');
  });
  await assert.rejects(client(f.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }), OwNetworkError);
});

test('agent: true sends X-OW-Agent on the ticket alone, never on the other files routes or to the upload host', async () => {
  const f = fake((url, init) => {
    if (!url.startsWith(API)) return { status: 201, body: STORED };
    if (init.method === 'DELETE') return { status: 204 };
    if (init.method === 'POST') return { status: 201, body: TICKET };
    return { status: 200, body: url.endsWith('/download') ? LINK : url.endsWith('/world/files') ? WORLD : { data: [] } };
  });
  const c = client(f.fetch, { agent: true });
  await c.listFiles('location', EL);
  await c.worldFiles();
  await c.uploadFile('location', EL, pdf(), { name: 'a.pdf' });
  await c.fileDownloadLink('location', EL, FID);
  await c.removeFile('location', EL, FID);
  assert.equal(f.calls.length, 6);
  for (const { url, init } of f.calls) {
    const ticket = init.method === 'POST' && url.startsWith(API) && url.endsWith('/files');
    assert.equal('X-OW-Agent' in init.headers, ticket, `${init.method} ${url}`);
  }
  const plain = fake(() => ({ status: 201, body: TICKET }));
  await client(plain.fetch).createFileTicket('location', EL, { name: 'a.pdf', size: 3 });
  assert.equal('X-OW-Agent' in plain.calls[0].init.headers, false, 'a person\'s client never declares an agent');
});

// -- progress -------------------------------------------------------------------------------------

test('onProgress without XMLHttpRequest (Node): the bytes go through fetch, and onProgress is called once with (total, total) after success', async () => {
  assert.equal(typeof globalThis.XMLHttpRequest, 'undefined');
  const f = uploadFake();
  const seen = [];
  await client(f.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf', onProgress: (l, t) => seen.push([l, t]) });
  assert.deepEqual(seen, [[5, 5]]);
  assert.equal(f.calls[1].url, TICKET.upload_url);
  const failed = uploadFake({ status: 409, body: { error: 'exists' } });
  const none = [];
  await assert.rejects(client(failed.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf', onProgress: (l, t) => none.push([l, t]) }));
  assert.deepEqual(none, []);
});

/** A fake XMLHttpRequest that records what it is given and answers `answer` after two progress events. */
function fakeXhr(answer) {
  const made = [];
  class FakeXhr {
    constructor() {
      this.headers = {};
      this.upload = { onprogress: null };
      this.status = 0;
      this.responseText = '';
      made.push(this);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    getResponseHeader(n) {
      const hit = Object.entries(answer.headers ?? {}).find(([k]) => k.toLowerCase() === n.toLowerCase());
      return hit ? hit[1] : null;
    }
    send(body) {
      this.body = body;
      setTimeout(() => {
        if (answer.networkError) { this.onerror?.(); return; }
        this.upload.onprogress?.({ loaded: 2, total: 5, lengthComputable: true });
        if (answer.fullProgress) this.upload.onprogress?.({ loaded: 5, total: 5, lengthComputable: true });
        this.status = answer.status;
        this.responseText = answer.body === undefined ? '' : JSON.stringify(answer.body);
        this.onload?.();
      }, 0);
    }
  }
  return { FakeXhr, made };
}

async function withXhr(xhr, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'XMLHttpRequest');
  const before = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = xhr;
  try {
    return await fn();
  } finally {
    if (had) globalThis.XMLHttpRequest = before;
    else delete globalThis.XMLHttpRequest;
  }
}

test('onProgress with XMLHttpRequest: the bytes go through it with the ticket alone, each progress event is reported, ending at (total, total)', async () => {
  const { FakeXhr, made } = fakeXhr({ status: 201, body: STORED });
  const f = uploadFake();
  const seen = [];
  const bytes = pdf();
  const out = await withXhr(FakeXhr, () =>
    client(f.fetch).uploadFile('location', EL, bytes, { name: 'a.pdf', onProgress: (l, t) => seen.push([l, t]) }));
  assert.deepEqual(out, STORED);
  assert.deepEqual(f.calls.map((x) => x.url), [`${API}/location/${EL}/files`], 'only the ticket went through fetch');
  assert.equal(made.length, 1);
  assert.equal(made[0].method, 'POST');
  assert.equal(made[0].url, TICKET.upload_url);
  assert.deepEqual(made[0].headers, { Authorization: 'Bearer f1.sig' });
  assert.equal(made[0].body, bytes);
  assert.deepEqual(seen, [[2, 5], [5, 5]]);
  assert.equal(globalThis.XMLHttpRequest, undefined, 'restored');
});

test('onProgress with XMLHttpRequest: a last event at the total is not reported twice', async () => {
  const { FakeXhr } = fakeXhr({ status: 201, body: STORED, fullProgress: true });
  const seen = [];
  await withXhr(FakeXhr, () =>
    client(uploadFake().fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf', onProgress: (l, t) => seen.push([l, t]) }));
  assert.deepEqual(seen, [[2, 5], [5, 5]]);
});

test('onProgress with XMLHttpRequest: the host\'s refusal is an OwApiError with its code and Retry-After; no answer is an OwNetworkError', async () => {
  const refused = fakeXhr({ status: 409, body: { error: 'exists', key: TICKET.key }, headers: { 'Retry-After': '7' } });
  await withXhr(refused.FakeXhr, () => assert.rejects(
    client(uploadFake().fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf', onProgress: () => {} }),
    (e) => e instanceof OwApiError && e.status === 409 && e.code === 'exists' && e.retryAfter === 7));
  const dropped = fakeXhr({ networkError: true });
  await withXhr(dropped.FakeXhr, () => assert.rejects(
    client(uploadFake().fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf', onProgress: () => {} }),
    OwNetworkError));
});

test('without onProgress the configured fetch is used even where XMLHttpRequest exists', async () => {
  const { FakeXhr, made } = fakeXhr({ status: 201, body: STORED });
  const f = uploadFake();
  await withXhr(FakeXhr, () => client(f.fetch).uploadFile('location', EL, pdf(), { name: 'a.pdf' }));
  assert.equal(made.length, 0);
  assert.equal(f.calls[1].url, TICKET.upload_url);
});

test('FILE_EXTENSIONS and fileKindOf are exported for a file picker', () => {
  assert.deepEqual(Object.keys(FILE_EXTENSIONS).sort(), ['csv', 'json', 'markdown', 'md', 'pdf', 'toml', 'txt', 'yaml', 'yml', 'zip']);
  assert.ok(Object.isFrozen(FILE_EXTENSIONS));
  assert.equal(fileKindOf('Notes/Letters.PDF'), 'pdf');
  assert.equal(fileKindOf('rules.yml'), 'yaml');
  assert.equal(fileKindOf('photo.png'), undefined);
  assert.equal(fileKindOf('.md'), undefined);
});
