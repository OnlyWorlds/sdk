/**
 * A file the package did not write, holding JSON it cannot hold as written: nested past 200, or a
 * number too large for a double. The folder source skips it with its own reason and goes on; the
 * Kanka door skips it with a note, as the Python package's door does. Neither serves a value the
 * file does not hold, and neither fails a read of anything else. The world file's writer, which
 * reads an element file only to leave out the hidden or the author fields, leaves a file it could
 * not read out of a share and counts it apart, and carries it byte for byte in a copy.
 *
 * Each case sits at the line and one past it, so every runtime in CI shows both. The last test
 * lists every `JSON.parse` in `src/`: one that reads text from outside goes through
 * `src/outside-json.ts`, or is named here with what it reads.
 * Runs against the compiled public bundle (dist), same as the other tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { OwV2Client, OwApiError, readWorldFile, writeWorldFile } from '../dist/index.js';
import { folderFetch } from '../dist/folder.js';
import { convertKanka } from '../dist/convert.js';

const enc = new TextEncoder();
const W = '0192a000-aaaa-7bbb-8ccc-000000000001';
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const PLANTED = `elements/ability/${A}.json`;
/** `n` arrays, one inside the next: as a field's value in an element file it reaches depth `n + 1`. */
const nest = (n) => '['.repeat(n) + ']'.repeat(n);

/** [what stands where the field's value goes, the reason the file is skipped with, or null when it is served] */
const CASES = {
  'nested 200 deep, the line': [nest(199), null],
  'nested 201 deep, one past it': [nest(200), 'too_deep'],
  'nested 100,000 deep': [nest(100000), 'too_deep'],
  'objects nested 201 deep': ['{"a":'.repeat(200) + '1' + '}'.repeat(200), 'too_deep'],
  'the largest double': ['1.7976931348623157e308', null],
  'a number past the largest double': ['1e400', 'number_out_of_range'],
  'a negative number past it': ['-1e400', 'number_out_of_range'],
  'an integer of 4,301 digits': ['9'.repeat(4301), 'number_out_of_range'],
  'such a number inside a list inside an object': ['{"a":[1,{"b":1e999}]}', 'number_out_of_range'],
  'both at once': [`[1e400,${nest(200)}]`, 'too_deep'],
};

const folder = (planted, world = `{"id":"${W}","name":"Hold"}`) => [
  { path: 'world.json', data: enc.encode(world) },
  { path: PLANTED, data: enc.encode(`{"id":"${A}","name":"Planted","x_planted":${planted}}`) },
  { path: `elements/ability/${B}.json`, data: enc.encode(JSON.stringify({ id: B, name: 'Beside it' })) },
  { path: `elements/character/${C}.json`, data: enc.encode(JSON.stringify({ id: C, name: 'Another type' })) },
];

for (const [name, [planted, reason]] of Object.entries(CASES)) {
  test(`the folder source, ${name}: ${reason ? `skipped as ${reason}, and every other read answers` : 'served as written'}`, async () => {
    let report;
    const client = new OwV2Client({ fetch: folderFetch(folder(planted), { onRead: (r) => { report = r; } }) });
    const abilities = (await client.list('ability')).data.map((e) => e.name);
    assert.deepEqual((await client.list('character')).data.map((e) => e.name), ['Another type']);
    assert.equal((await client.getWorld()).name, 'Hold');
    if (reason === null) {
      assert.deepEqual(abilities, ['Planted', 'Beside it']);
      assert.deepEqual(report.skipped, []);
      const got = await client.get('ability', A);
      assert.equal(JSON.stringify(got.x_planted), planted.startsWith('[') ? planted : JSON.stringify(Number(planted)), 'the value the file holds');
      return;
    }
    assert.deepEqual(abilities, ['Beside it'], 'the list of its type answers, without it');
    assert.deepEqual(report.skipped, [{ path: PLANTED, reason }]);
    assert.deepEqual(report.served.map((s) => s.path), [`elements/ability/${B}.json`, `elements/character/${C}.json`]);
    assert.equal(report.elements, 2);
    await assert.rejects(client.get('ability', A), (e) => e instanceof OwApiError && e.status === 404);
  });
}

test('the folder source: a world.json it cannot hold is no world, as one that does not parse', async () => {
  for (const extra of [nest(200), '1e400']) {
    let report;
    const f = folderFetch(folder('"plain"', `{"id":"${W}","name":"Hold","x":${extra}}`), { onRead: (r) => { report = r; } });
    const res = await f('https://www.onlyworlds.com/api/v2/world/');
    assert.equal(res.status, 500);
    assert.equal(report.world, false);
  }
});

test('the folder source: a file that is only such a number is skipped for the number, not for its missing id', async () => {
  let report;
  const files = folder('"plain"');
  files[1] = { path: PLANTED, data: enc.encode('1e400') };
  await folderFetch(files, { onRead: (r) => { report = r; } })('https://www.onlyworlds.com/api/v2/world/');
  assert.deepEqual(report.skipped, [{ path: PLANTED, reason: 'number_out_of_range' }]);
  files[1] = { path: PLANTED, data: enc.encode('1e308') };
  await folderFetch(files, { onRead: (r) => { report = r; } })('https://www.onlyworlds.com/api/v2/world/');
  assert.deepEqual(report.skipped, [{ path: PLANTED, reason: 'no_id' }]);
});

test('the folder source: nothing it serves holds a null where the file holds a number', async () => {
  for (const planted of ['1e400', '9'.repeat(4301), '[1e400]']) {
    const f = folderFetch(folder(planted));
    for (const path of ['/ability/', `/ability/${A}/`]) {
      const text = await (await f(`https://www.onlyworlds.com/api/v2${path}`)).text();
      assert.ok(!text.includes('"x_planted"'), `${path} serves no x_planted for ${planted.slice(0, 12)}`);
    }
  }
});

// --- the world file's writer ------------------------------------------------------------------

/** The folder with the planted element hidden and naming who changed it: the two things the writer reads a file for. */
const hiddenFolder = (planted) => {
  const files = folder(planted);
  files[1] = { path: PLANTED, data: enc.encode(`{"id":"${A}","name":"Planted","hidden":true,"changed_by":"m-1","x_planted":${planted}}`) };
  return files;
};
const inFile = (bytes) => readWorldFile(bytes).files.find((f) => f.path === PLANTED);
/** Whether two files hold the same bytes. A boolean, so a failure names the test at once: printing a 200 KB file takes the reporter minutes. */
const same = (a, b) => a !== undefined && Buffer.from(a.data).equals(Buffer.from(b.data));

for (const [name, [planted, reason]] of Object.entries(CASES)) {
  test(`the world file's writer, ${name}: ${reason ? 'not read as an element, so a share leaves it out as unread and a copy carries it as it is' : 'read, so a share leaves the hidden element out'}`, () => {
    const files = hiddenFolder(planted);
    const write = (opts) => { let r; const bytes = writeWorldFile(files, 'Hold', { ...opts, report: (x) => { r = x; } }); return { file: inFile(bytes), report: r }; };
    // A copy that leaves nothing out reads no element file: every case travels byte for byte.
    assert.ok(same(write({ includeAuthorFields: true }).file, files[1]), 'a copy that leaves nothing out carries it byte for byte');
    const share = write({ includeHidden: false });
    const plain = write({});
    assert.ok(share.file === undefined, 'never in a share');
    if (reason === null) {
      assert.deepEqual(share.report, { hiddenLeftOut: 1, authorFieldsLeftOut: 0, unreadLeftOut: 0, unreadPaths: [] });
      assert.ok(!new TextDecoder().decode(plain.file.data).includes('changed_by'), 'a plain copy leaves the author field out');
      return;
    }
    assert.deepEqual(share.report, { hiddenLeftOut: 0, authorFieldsLeftOut: 0, unreadLeftOut: 1, unreadPaths: [PLANTED] }, 'counted apart from the hidden');
    assert.ok(same(plain.file, files[1]), 'a copy carries it byte for byte: no number rewritten as null, no error from the runtime');
    assert.deepEqual(plain.report, { hiddenLeftOut: 0, authorFieldsLeftOut: 0, unreadLeftOut: 0, unreadPaths: [] });
  });
}

test('the world file\'s writer: a hidden element\'s file cut short is left out of a share, and carried by a copy', () => {
  const files = hiddenFolder('"plain"');
  files[1] = { path: PLANTED, data: enc.encode('{"id":"a","hidden":true,') };
  let report;
  assert.ok(inFile(writeWorldFile(files, 'Hold', { includeHidden: false, report: (r) => { report = r; } })) === undefined);
  assert.deepEqual(report.unreadPaths, [PLANTED]);
  assert.ok(same(inFile(writeWorldFile(files, 'Hold')), files[1]));
});

// --- the Kanka door ---------------------------------------------------------------------------

const KANKA = new URL('./fixtures/kanka/quay-export-world_20261025_011029.zip', import.meta.url);
const ENTITY = 'characters/your-character-name_10074596.json';
const exportWith = (change) => {
  const files = unzipSync(new Uint8Array(readFileSync(KANKA)));
  const original = new TextDecoder().decode(files[ENTITY]);
  const text = change(original);
  assert.notEqual(text, original, 'the plant changed the file');
  files[ENTITY] = enc.encode(text);
  return zipSync(files);
};
const withKey = (planted) => exportWith((t) => t.replace(/\}\s*$/, `,"x_planted":${planted}}`));
const convert = (bytes) => {
  const { files, report } = convertKanka(bytes, { source: 'x.zip' });
  return { paths: files.map((f) => f.path), notes: report.notes };
};

/** [what stands where the new key's value goes, the Python error class the note names, or null when the file is read] */
const KANKA_CASES = {
  'nested 200 deep, the line': [nest(199), null],
  'nested 201 deep, one past it': [nest(200), 'ValueError'],
  'nested 100,000 deep': [nest(100000), 'ValueError'],
  'an integer of 4,301 digits': ['9'.repeat(4301), 'ValueError'],
  'a number past the largest double': ['1e400', 'ValueError'],
  'NaN': ['NaN', 'ValueError'],
  '-Infinity': ['-Infinity', 'ValueError'],
  '2^53 - 1, the largest integer a double holds exactly': ['9007199254740991', null],
  // The one difference from the Python door, which holds these two exactly and reads the file:
  // here the file is skipped, never written with a rounded number.
  '2^53 + 1, which a double rounds': ['9007199254740993', 'ValueError'],
  'an integer of 4,300 digits, the Python reader\'s own line': ['9'.repeat(4300), 'ValueError'],
};

test('the Kanka door: a file it cannot hold is skipped with a note, as a file that is no JSON is', () => {
  const whole = convert(new Uint8Array(readFileSync(KANKA)));
  const broken = convert(exportWith((t) => t.slice(0, -1)));
  assert.deepEqual(broken.notes.filter((n) => n.startsWith(ENTITY)), [`${ENTITY}: not readable JSON (JSONDecodeError); skipped`]);
  assert.ok(broken.paths.length < whole.paths.length, 'the entity and what hangs on it are not written');
  for (const [name, [planted, error]] of Object.entries(KANKA_CASES)) {
    const got = convert(withKey(planted));
    if (error === null) {
      assert.deepEqual(got.paths, whole.paths, name);
      assert.deepEqual(got.notes, whole.notes, name);
      continue;
    }
    assert.deepEqual(got.paths, broken.paths, `${name}: the same files as with the entity unreadable`);
    assert.deepEqual(got.notes, broken.notes.map((n) => n.replace('(JSONDecodeError)', `(${error})`)), name);
  }
});

test('the Kanka door: text that is no JSON is named a decode error even when it is also too deep', () => {
  const got = convert(exportWith((t) => t.replace(/\}\s*$/, `,"x_planted":${nest(300)}`)));
  assert.deepEqual(got.notes.filter((n) => n.startsWith(ENTITY)), [`${ENTITY}: not readable JSON (JSONDecodeError); skipped`]);
});

test('the Kanka door: text after the one JSON value is no JSON, and whitespace after it is nothing', () => {
  const whole = convert(new Uint8Array(readFileSync(KANKA)));
  const broken = convert(exportWith((t) => t.slice(0, -1)));
  for (const tail of [' {"hidden": true}', ' x', '{}']) {
    const got = convert(exportWith((t) => t + tail));
    assert.deepEqual(got.notes.filter((n) => n.startsWith(ENTITY)), [`${ENTITY}: not readable JSON (JSONDecodeError); skipped`], tail);
    assert.deepEqual(got.paths, broken.paths, tail);
  }
  const spaced = convert(exportWith((t) => t + ' \n\t\r\n'));
  assert.deepEqual(spaced.paths, whole.paths);
  assert.deepEqual(spaced.notes, whole.notes);
});

// --- every JSON.parse in src --------------------------------------------------------------------

/** Each `JSON.parse` in `src/` outside `outside-json.ts`, by file, with how many and what they read. */
const NAMED = {
  'charter.ts': [1, 'a copy of a value already in memory'],
  'world-file.ts': [2, 'an archive\'s world.json and a folder\'s records manifest: read for an id and a list of names, and refused when they do not hold them'],
  'calendar/index.ts': [1, 'a calendar config another tool wrote as a string: every number in it is checked by the calendar\'s own reader'],
  'folder/serve.ts': [1, 'a cursor this package wrote, checked field by field'],
  'mcp/index.ts': [1, 'a copy of a value already in memory'],
  'v2/client.ts': [3, 'the platform\'s own answers'],
  'v2/errors.ts': [1, 'the platform\'s own error body'],
  'v2/oauth.ts': [1, 'the sign-in record this package stored'],
};

test('every JSON.parse in src is the outside reader\'s or is named here with what it reads', () => {
  const src = new URL('../src/', import.meta.url);
  const found = {};
  for (const entry of readdirSync(src, { recursive: true })) {
    const rel = String(entry).split('\\').join('/');
    if (!rel.endsWith('.ts') || rel.endsWith('.generated.ts')) continue;
    const n = readFileSync(new URL(rel, src), 'utf8').split('JSON.parse(').length - 1;
    if (n > 0) found[rel] = n;
  }
  assert.equal(found['outside-json.ts'], 1, 'the one reader of outside text');
  delete found['outside-json.ts'];
  assert.deepEqual(found, Object.fromEntries(Object.entries(NAMED).map(([f, [n]]) => [f, n])),
    'a new JSON.parse reads through src/outside-json.ts, or gets its line in NAMED');
  assert.ok(!('folder/read.ts' in found), 'the folder reader parses only through the outside reader');
});
