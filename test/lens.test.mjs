/**
 * The lens profile (schema-dist profiles/lens.md, serial 78): isLens, isTemplate, lensesInUse and
 * resolveLens on every conformance case in codegen/schema-dist/profiles/lens.fixture.json, vendored with
 * the distribution, and the fixture's own tables (anchor fields, type order, date table, room pairs,
 * defaults) read back through the reader. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOM_PAIRS, isLens, isTemplate, lensesInUse, resolveLens, worldGraph } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.fixture.json', import.meta.url));
const COUNTS = { shape: 6, keys: 23, resolve: 51, invariant: 4, uses: 4, graph: 34 };

function loadFixture() {
  assert.ok(existsSync(FIXTURE), `no lens fixture at ${FIXTURE}`);
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  assert.equal(doc.profile, 'lens');
  return doc;
}

/** A reader as the fixture writes it, its `as` (a reader's name) turned into that reader. */
function readerOf(world, name) {
  const r = world.readers[name];
  assert.ok(r, `no reader ${name}`);
  return r.as ? { ...r, as: world.readers[r.as] } : r;
}

function read(doc, worldName, lens, readerName, c = {}, world = doc.worlds[worldName]) {
  return resolveLens(world, lens, readerOf(doc.worlds[worldName], readerName), { asOf: c.as_of, clock: c.clock });
}

/** One case's answer as the fixture writes it, from the package's readers; an invariant answers with its broken parts. */
function answer(c, doc) {
  switch (c.kind) {
    case 'shape': return { is_lens: isLens(c.element), is_template: isTemplate(c.element) };
    case 'keys': {
      const got = resolveLens({ elements: [] }, { id: 'k', type: 'construct', name: 'k', supertype: 'Lens', x_lens: c.x_lens }, { rung: 'owner' });
      return { legal: got.unreadable === null, bad: got.unreadable };
    }
    case 'resolve': {
      const got = read(doc, c.world, c.lens, c.reader, c);
      const out = { kept: got.kept, cut: got.cut };
      if ('rows' in c) out.rows = got.rows;
      if ('notes_ignored' in c) out.notes_ignored = got.notesIgnored;
      if ('mail' in c) out.mail = got.mail === null ? null : Object.fromEntries(Object.keys(c.mail).map(k => [k, got.mail[k]]));
      return out;
    }
    case 'invariant': {
      const world = doc.worlds[c.world];
      const broken = [];
      if (c.claim === 'subset') {
        const owner = read(doc, c.world, c.lens, 'owner');
        const names = world.elements.filter(e => c.secrets.includes(e.id)).map(e => e.name);
        for (const name of c.readers) {
          const got = read(doc, c.world, c.lens, name);
          if (!got.kept.every(id => owner.kept.includes(id))) broken.push(`${name}: not a subset of the owner's`);
          const text = JSON.stringify(got);
          for (const s of [...c.secrets, ...names]) if (text.includes(s)) broken.push(`${name}: names ${s}`);
        }
      } else if (c.claim === 'same_without') {
        const without = { ...world, elements: world.elements.filter(e => !c.without.includes(e.id)) };
        for (const name of c.readers) {
          try {
            assert.deepEqual(read(doc, c.world, c.lens, name, {}, without), read(doc, c.world, c.lens, name));
          } catch {
            broken.push(`${name}: moved without ${c.without.join(', ')}`);
          }
        }
      } else if (c.claim === 'unchanged') {
        const before = JSON.stringify(world);
        for (const name of c.readers) {
          const got = read(doc, c.world, c.lens, name);
          // A reading is the reader's own copy: changing it changes nothing in the world.
          for (const row of got.rows) for (const k of Object.keys(row)) if (Array.isArray(row[k])) row[k].push('planted');
          if (JSON.stringify(world) !== before) broken.push(`${name}: the world moved`);
        }
      } else broken.push(`an invariant of unknown claim ${c.claim}`);
      return { broken };
    }
    case 'uses': return { lenses: lensesInUse(c.membership, c.x_lens_uses) };
    default: throw new Error(`a case of unknown kind ${c.kind}`);
  }
}

function want(c) {
  switch (c.kind) {
    case 'shape': return { is_lens: c.is_lens, is_template: c.is_template };
    case 'keys': return { legal: c.legal, bad: c.bad };
    case 'resolve': {
      const out = { kept: c.kept, cut: c.cut };
      for (const k of ['rows', 'notes_ignored', 'mail']) if (k in c) out[k] = c[k];
      return out;
    }
    case 'invariant': return { broken: [] };
    case 'uses': return { lenses: c.lenses };
    default: return { 'a reader for this kind': true };
  }
}

test('the lens readers answer every case of the lens fixture', (t) => {
  const doc = loadFixture();
  const { cases } = doc;
  const wrong = [];
  const counts = {};
  for (const c of cases) {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    if (c.kind === 'graph') continue; // worldGraph's, run with the section's invariants in graph.test.mjs
    let got;
    try {
      got = answer(c, doc);
    } catch (err) {
      got = { threw: String(err) };
    }
    try {
      assert.deepEqual(got, want(c));
    } catch {
      wrong.push(`${c.kind}/${c.name}: gave ${JSON.stringify(got)}, the fixture says ${JSON.stringify(want(c))}`);
    }
  }
  t.diagnostic(`the lens fixture: ${cases.length} cases run, ${wrong.length} disagreeing, from ${FIXTURE}`);
  for (const line of wrong) t.diagnostic(line);
  assert.deepEqual(wrong, []);
  assert.equal(cases.length, 122, `the fixture holds ${cases.length} cases, serial 81 has 122`);
  assert.deepEqual(counts, COUNTS);
});

const id = (n) => `019a7f00-0000-7000-8000-${String(n).padStart(12, '0')}`;
const LENS = { id: id(900), type: 'construct', name: 'L', supertype: 'Lens' };
const OWNER = { rung: 'owner' };

test('the fixture\'s tables, read back through the reader: pair, anchor fields, type order, date table, room pairs, cut reasons, defaults', () => {
  const doc = loadFixture();
  assert.deepEqual(doc.pair, { type: 'construct', supertype: 'Lens' });
  assert.equal(isTemplate({ type: 'construct', supertype: 'Lens', subtype: doc.template_subtype }), true);
  assert.equal(doc.field, 'x_lens');
  // Anchor fields: one element per field, linked in the reverse order; the kept order is the field order.
  const fields = doc.anchor_fields;
  const elements = fields.map((f, i) => ({ id: id(i + 1), type: 'object', name: f }));
  const lens = { ...LENS, x_lens: { depth: 0 } };
  [...fields].reverse().forEach((f) => { lens[f] = [id(fields.indexOf(f) + 1)]; });
  lens.titles = [id(99)];
  elements.push({ id: id(99), type: 'title', name: 'not an anchor' });
  assert.deepEqual(resolveLens({ elements }, lens, OWNER).kept, fields.map((_, i) => id(i + 1)));
  // Type order: a filter over one element of each type, every one updated at the same time.
  const all = [...doc.type_order].reverse().map((type, i) => ({ id: id(200 + i), type, name: type, updated_at: '2026-10-01T00:00:00Z' }));
  const got = resolveLens({ elements: all }, LENS, OWNER).kept.map(k => all.find(e => e.id === k).type);
  assert.deepEqual(got, doc.type_order);
  // The date table: a dated type after as_of is cut, a timeless one is never fenced.
  for (const type of doc.type_order) {
    const field = doc.date_table[type];
    const el = { id: id(300), type, name: type, ...(field ? { [field]: 10 } : {}) };
    const r = resolveLens({ elements: [el], now: 5 }, { ...LENS, x_lens: { types: [type] } }, OWNER);
    assert.deepEqual(r.cut, field ? { after_as_of: 1 } : {}, type);
    const u = resolveLens({ elements: [{ id: id(301), type, name: type }], now: 5 }, { ...LENS, x_lens: { types: [type], undated: 'exclude' } }, OWNER);
    assert.deepEqual(u.cut, field ? { undated: 1 } : {}, `${type} undated`);
  }
  assert.deepEqual(doc.room_pairs, ROOM_PAIRS.map(p => `${p.type}/${p.supertype.toLowerCase()}`));
  for (const pair of doc.room_pairs) {
    assert.equal(resolveLens({ elements: [] }, { ...LENS, x_lens: { types: [pair.toUpperCase()] } }, OWNER).unreadable, null, pair);
  }
  assert.deepEqual(doc.cut_reasons, ['budget', 'types', 'window', 'undated', 'after_as_of', 'anchor_not_visible', 'not_visible', 'hops_not_served']);
  assert.deepEqual(doc.owner_only_reasons, ['anchor_not_visible', 'not_visible']);
  // Defaults: depth 1, budget 50, undated include, show full, mail none, thirty days of mail.
  assert.deepEqual(doc.defaults, { depth: 1, budget: 50, undated: 'include', show: 'full', mail: 'none', mail_days: 30 });
  const many = Array.from({ length: 51 }, (_, i) => ({ id: id(400 + i), type: 'object', name: `o${i}` }));
  const filtered = resolveLens({ elements: many }, LENS, OWNER);
  assert.equal(filtered.kept.length, 50);
  assert.deepEqual(filtered.cut, { budget: 1 });
  assert.deepEqual(filtered.rows[0], many[0]);
  assert.equal(filtered.mail, null);
  const hop = resolveLens({ elements: [{ id: id(1), type: 'object', name: 'a', materials: [id(2)] }, { id: id(2), type: 'object', name: 'b', materials: [id(3)] }, { id: id(3), type: 'object', name: 'c' }] }, { ...LENS, objects: [id(1)] }, OWNER);
  assert.deepEqual(hop.kept, [id(1), id(2)]);
});

// The shared edge cases: inputs the fixture leaves open (a stub's links, the window's edge, the World's
// time_current as its now, no window without a now, a to after
// as_of, the fence on anchors, the members list in the mail rule, a message not repeated among the kept,
// the thirty days' edge, ties by id by code point, an umbrella's child a guest knows only as a stub), the same file byte for byte as the Python package's
// tests/fixtures/lens-edges.json (both suites hold its sha256), answers written by hand.
const EDGES_FILE = fileURLToPath(new URL('./fixtures/lens-edges.json', import.meta.url));
const EDGES_SHA256 = '68cbdb16afa7498e432e86f0e1124cd1403c2a1c15e137996092a6ef88e94682';

test('the shared edge cases (the Python package runs the same file)', async () => {
  const { createHash } = await import('node:crypto');
  const bytes = readFileSync(EDGES_FILE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EDGES_SHA256);
  const edges = JSON.parse(bytes.toString('utf8'));
  const wrong = [];
  for (const e of edges) {
    let got;
    try {
      const r = resolveLens(e.world, e.lens, e.reader, { asOf: e.as_of, clock: e.clock });
      const all = { kept: r.kept, cut: r.cut, rows: r.rows, mail: r.mail, notes_ignored: r.notesIgnored, unreadable: r.unreadable };
      got = Object.fromEntries(Object.keys(e.want).map(k => [k, k === 'mail' && all.mail ? Object.fromEntries(Object.keys(e.want.mail).map(m => [m, all.mail[m]])) : all[k]]));
    } catch (err) {
      got = { threw: String(err) };
    }
    try { assert.deepEqual(got, e.want); } catch { wrong.push(`${e.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(e.want)}`); }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.equal(edges.length, 13);
});

test('a lens a guest knows only as a stub reads as nothing, by id, as keel reads it; whole, it reads', () => {
  const world = {
    elements: [
      { id: 'L', type: 'construct', name: 'Ada and hers', supertype: 'Lens', characters: ['c1'], x_lens: { depth: 1 } },
      { id: 'c1', type: 'character', name: 'Ada', friends: ['c2'] },
      { id: 'c2', type: 'character', name: 'Bo' },
    ],
  };
  const stub = { rung: 'guest', whole: ['c1', 'c2'], known_of: ['L'] };
  const r = resolveLens(world, 'L', stub);
  assert.deepEqual([r.kept, r.cut, r.unreadable], [[], {}, null]);
  assert.deepEqual(worldGraph(world, stub, { lens: 'L' }).nodes, []);
  const whole = { rung: 'guest', whole: ['L', 'c1', 'c2'], known_of: [] };
  assert.deepEqual(resolveLens(world, 'L', whole).kept, ['c1', 'c2']);
});

test('resolveLens refuses what is not a reading: a bad reader, world, lens, as_of or clock is a TypeError', () => {
  assert.throws(() => resolveLens({ elements: [] }, LENS, { rung: 'admin' }), TypeError);
  assert.throws(() => resolveLens({ elements: [] }, LENS, { rung: 'owner', as: { rung: 'x' } }), TypeError);
  assert.throws(() => resolveLens({}, LENS, OWNER), TypeError);
  assert.throws(() => resolveLens({ elements: [] }, 3, OWNER), TypeError);
  assert.throws(() => resolveLens({ elements: [] }, LENS, OWNER, { asOf: 1.5 }), TypeError);
  assert.throws(() => resolveLens({ elements: [] }, LENS, OWNER, { clock: 'yesterday' }), TypeError);
  assert.throws(() => resolveLens({ elements: [] }, LENS, OWNER, true), TypeError);
  // A lens id the reader cannot see, or that is not a lens, resolves to nothing.
  const world = { elements: [{ ...LENS, hidden: true }, { id: id(1), type: 'object', name: 'o' }] };
  assert.deepEqual(resolveLens(world, LENS.id, { rung: 'contributor' }).kept, []);
  assert.deepEqual(resolveLens(world, id(1), OWNER).kept, []);
  assert.deepEqual(resolveLens(world, LENS.id, OWNER).kept, [id(1)]);
});

test('the documented call compiles against the built types', async () => {
  const ts = (await import('typescript')).default;
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'ow-lens-'));
  try {
    const dist = fileURLToPath(new URL('../dist/index.js', import.meta.url)).replace(/\\/g, '/');
    const file = join(dir, 'use.ts');
    writeFileSync(file, [
      `import { OwV2Client, isLens, isTemplate, lensesInUse, resolveLens, type OwElement, type OwLensReading, type OwLensReader } from '${dist}';`,
      'declare const c: OwV2Client;',
      'export async function use(me: string): Promise<string[]> {',
      "  const elements: OwElement[] = (await c.list('character')).data;",
      "  const lenses = elements.filter(e => isLens(e) && !isTemplate(e));",
      "  const reader: OwLensReader = { rung: 'contributor', character: me };",
      '  const r: OwLensReading = resolveLens({ elements, members: await c.members(), now: 1200 }, lenses[0], reader, { asOf: 1190 });',
      "  resolveLens({ elements }, lenses[0].id, { rung: 'owner', as: { rung: 'guest', whole: [me], known_of: [] } });",
      '  return [...r.kept, ...lensesInUse(null, lenses[0].x_lens_uses), String(r.cut.budget ?? 0), r.unreadable ?? ""];',
      '}',
    ].join('\n'));
    const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10, skipLibCheck: true, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'] });
    const diags = ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(diags, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
