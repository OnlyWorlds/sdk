/**
 * The README's examples compile against the built package. Every ```typescript block of README.md is its
 * own module, type-checked (strict, nodenext) against package.json and dist/*.d.ts copied into a scratch
 * node_modules, so a renamed method, a dropped option or a changed answer type turns a block red here
 * before a stranger copies it.
 *
 * A block often uses what an earlier block made (`writer`, `client`) or a value the reader brings (`id`,
 * `file`). The first pass compiles each block alone and reads which names it uses without defining them;
 * the second declares exactly those: a name the package exports is imported from it (so the export must
 * exist), any other is declared with its type from CONTEXT below. A name in neither fails the test by name.
 * The examples are compiled, never run: what they print and what the server answers are not checked here.
 * The write methods take an element body as `Record<string, unknown>`, so a wrong field name or value in a
 * write example compiles (a plant of `supertype: 42` in a `patch` stayed green); a method, an export, an
 * option key and an answer's shape are what this holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// What the README's prose says a name is when a block uses it without making it.
const SDK = "import('@onlyworlds/sdk')";
const CONTEXT = {
  // clients: `client` reads, `writer` writes, `account` holds an ow_a_ token, `owner` and `member` are two keys
  client: `${SDK}.OwV2Client`,
  writer: `${SDK}.OwV2Client`,
  account: `${SDK}.OwV2Client`,
  owner: `${SDK}.OwV2Client`,
  member: `${SDK}.OwV2Client`,
  // ids and words the reader brings
  id: 'string',
  worldId: 'string',
  characterId: 'string',
  rootId: 'string',
  chosenId: 'string',
  me: 'string', // the reader's own Character id
  code: 'string', // an invite link's ow_j_ code
  email: 'string',
  password: 'string',
  question: 'string',
  text: 'string',
  link: 'string',
  topDir: 'string',
  // data the reader holds
  file: 'Blob',
  bytes: 'Uint8Array',
  bar: '{ set(fraction: number): void }',
  el: `${SDK}.OwElement`,
  element: `${SDK}.OwElement`,
  elements: `${SDK}.OwElement[]`,
  members: `${SDK}.OwMember[]`,
  files: `${SDK}.OwWorldFileEntry[]`,
  // what an earlier block made
  image: `Awaited<ReturnType<${SDK}.OwV2Client['uploadImage']>>`,
  index: `${SDK}.OwWorldIndex<${SDK}.OwElement>`,
  hits: `${SDK}.OwLookupHit<${SDK}.OwElement>[]`,
};

function blocks() {
  const lines = readFileSync(join(ROOT, 'README.md'), 'utf8').split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '```typescript') continue;
    let j = i + 1;
    while (j < lines.length && lines[j] !== '```') j++;
    assert.ok(j < lines.length, `README line ${i + 1}: a typescript block that never closes`);
    found.push({ line: i + 2, body: lines.slice(i + 1, j).join('\n') });
    i = j;
  }
  return found;
}

function compile(dir, files) {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', lib: ['es2022', 'dom'],
      strict: true, noEmit: true, types: [],
    },
    files: Object.keys(files),
  }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const r = spawnSync(process.execPath, [TSC, '-p', dir], { encoding: 'utf8' });
  assert.notEqual(r.status, null, `tsc did not finish: ${r.error ?? r.signal}`);
  const errors = [];
  for (const line of (r.stdout + r.stderr).split(/\r?\n/)) {
    const m = /(b\d+_L(\d+)\.mts)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
    if (m) errors.push({ file: m[1], readmeLine: Number(m[2]) + Number(m[3]) - 1, code: m[4], text: m[5] });
    else if (/error TS\d+/.test(line)) errors.push({ file: '', readmeLine: 0, code: 'TS?', text: line });
  }
  return { status: r.status, errors };
}

test('every typescript block in the README compiles against the built package', async () => {
  const exported = new Set(Object.keys(await import(pathToFileURL(join(ROOT, 'dist', 'index.js')).href)));
  const list = blocks();
  assert.ok(list.length > 0, 'the README has no typescript block: the check would see nothing');

  const dir = mkdtempSync(join(tmpdir(), 'ow-sdk-readme-'));
  try {
    const home = join(dir, 'node_modules', '@onlyworlds', 'sdk');
    mkdirSync(join(home, 'dist'), { recursive: true });
    writeFileSync(join(home, 'package.json'), JSON.stringify(pkg));
    for (const f of readdirSync(join(ROOT, 'dist'))) {
      if (f.endsWith('.d.ts') || f.endsWith('.css')) cpSync(join(ROOT, 'dist', f), join(home, 'dist', f));
    }
    const name = (b, n) => `b${String(n).padStart(2, '0')}_L${b.line}.mts`;

    // Pass 1: each block alone; read the names it uses without making them.
    const bare = {};
    list.forEach((b, n) => { bare[name(b, n)] = `${b.body}\nexport {};\n`; });
    const first = compile(dir, bare);
    const free = new Map();
    for (const e of first.errors) {
      const m = /^(?:Cannot find name|No value exists in scope for the shorthand property) '([^']+)'/.exec(e.text);
      if (!m) continue;
      if (!free.has(e.file)) free.set(e.file, new Set());
      free.get(e.file).add(m[1]);
    }

    // Pass 2: the same blocks, each with exactly its free names imported or declared.
    const unknown = [];
    const full = {};
    list.forEach((b, n) => {
      const file = name(b, n);
      const names = [...(free.get(file) ?? [])].sort();
      const fromSdk = names.filter((x) => exported.has(x));
      const declared = names.filter((x) => !exported.has(x));
      for (const x of declared) if (!(x in CONTEXT)) unknown.push(`README line ${b.line}: \`${x}\``);
      const head = fromSdk.length ? `import { ${fromSdk.join(', ')} } from '@onlyworlds/sdk';\n` : '';
      const tail = declared.filter((x) => x in CONTEXT).map((x) => `declare const ${x}: ${CONTEXT[x]};`).join('\n');
      // The prelude goes after the body so the README's line numbers hold: a block's own imports stay first.
      full[file] = `${b.body}\n${head}${tail}\nexport {};\n`;
    });
    assert.deepEqual(unknown, [], 'a block uses a name no earlier block makes, the package does not export and CONTEXT does not type');

    const second = compile(dir, full);
    const shown = second.errors.map((e) => `README line ${e.readmeLine}: ${e.code} ${e.text}`);
    assert.deepEqual(shown, [], 'README examples that do not compile');
    assert.equal(second.status, 0, 'tsc failed with no error line read');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
