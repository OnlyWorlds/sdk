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
import { ROOM_PAIRS, isCharterElement, isLens, isTemplate, lensesInUse, resolveLens, worldGraph } from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.fixture.json', import.meta.url));
const COUNTS = { shape: 6, keys: 25, resolve: 75, invariant: 4, uses: 4, graph: 37 };

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
  assert.equal(cases.length, 151, `the fixture holds ${cases.length} cases, serial 85 has 151`);
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
  // The reading aids: each pair word is a legal `types` word, and an element of the pair is an aid only with the mark.
  assert.deepEqual(doc.reading_aid_pairs, ['law/charter', 'construct/guide', 'construct/domain']);
  assert.equal(doc.reading_aid_mark.field, 'x_charter_of');
  for (const pair of doc.reading_aid_pairs) {
    assert.equal(resolveLens({ elements: [] }, { ...LENS, x_lens: { types: [` ${pair.toUpperCase()} `] } }, OWNER).unreadable, null, pair);
    const [type, supertype] = pair.split('/');
    const el = { id: id(500), type, name: pair, supertype: supertype.toUpperCase() };
    assert.equal(isCharterElement(el), false, `${pair} without the mark`);
    assert.equal(isCharterElement({ ...el, [doc.reading_aid_mark.field]: 'w1' }), true, `${pair} with the mark`);
  }
  assert.deepEqual(doc.cut_reasons, ['budget', 'types', 'window', 'stale', 'undated', 'after_as_of', 'anchor_not_visible', 'not_visible', 'hops_not_served']);
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
// the thirty days' edge, ties by id by code point, an umbrella's child a guest knows only as a stub, a stub
// Message kept out of the mail part), the same file byte for byte as the Python package's
// tests/fixtures/lens-edges.json (both suites hold its sha256), answers written by hand.
const EDGES_FILE = fileURLToPath(new URL('./fixtures/lens-edges.json', import.meta.url));
const EDGES_SHA256 = '4cb440cde85da877e2b5ba7129dd34be90a1e0bb109eefb56f0cae040a19b080';

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
  assert.equal(edges.length, 15);
});

// The reading aids and changed_within on the public calls (the Python package holds the same cases).
const AIDS = {
  elements: [
    { id: 'desk', type: 'institution', name: 'The Desk', constructs: ['domain', 'guide'] },
    { id: 'rules', type: 'law', name: 'House Rules', supertype: 'Charter', author: 'desk', x_charter_of: 'w1' },
    { id: 'charter', type: 'law', name: 'Harbour Charter', supertype: ' charter ', author: 'desk' },
    { id: 'domain', type: 'construct', name: 'Reporting', supertype: 'Domain', x_charter_of: 'w1' },
    { id: 'guide', type: 'construct', name: 'How we work', supertype: 'GUIDE', x_charter_of: 'w1', objects: ['ledger'] },
    { id: 'ledger', type: 'object', name: 'Ledger' },
  ],
};
const lensOn = (anchors, x_lens) => ({ id: 'L', type: 'construct', name: 'L', supertype: 'Lens', ...anchors, ...(x_lens ? { x_lens } : {}) });

test('isCharterElement: the pair and the mark, both; a blank string mark is no mark, any other value is one', () => {
  assert.equal(isCharterElement(AIDS.elements[1]), true);
  assert.equal(isCharterElement(AIDS.elements[2]), false); // the pair without the mark: lore
  assert.equal(isCharterElement(AIDS.elements[3]), true);
  assert.equal(isCharterElement(AIDS.elements[4]), true); // GUIDE, folded
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charters', x_charter_of: 'w1' }), false); // the whole word
  assert.equal(isCharterElement({ type: 'object', supertype: 'Charter', x_charter_of: 'w1' }), false);
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charter', x_charter_of: '' }), false);
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charter', x_charter_of: ' 　' }), false);
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charter', x_charter_of: null }), false);
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charter', x_charter_of: 7 }), true);
  assert.equal(isCharterElement({ type: 'law', supertype: 'Charter', x_room_of: 'w1' }), false); // the room's mark is not this one
  assert.equal(isCharterElement(null), false);
});

test('an unmarked Charter is lore: a hop keeps it like any Law, and types `law` keeps it', () => {
  const plain = resolveLens(AIDS, lensOn({ institutions: ['desk'] }), OWNER);
  assert.deepEqual(plain.kept, ['desk', 'charter']);
  assert.deepEqual(plain.cut, { types: 3 });
  const laws = resolveLens(AIDS, lensOn({ institutions: ['desk'] }, { types: ['law'] }), OWNER);
  assert.deepEqual(laws.kept, ['desk', 'charter']);
  assert.deepEqual(laws.cut, { types: 3 });
});

test('a marked Domain a hop reaches is cut as types unless types names construct/domain', () => {
  const none = resolveLens(AIDS, lensOn({ institutions: ['desk'] }, { types: ['construct'] }), OWNER);
  assert.deepEqual(none.kept, ['desk']);
  assert.deepEqual(none.cut, { types: 4 }); // the three aids, and the lore Charter, a Law
  const named = resolveLens(AIDS, lensOn({ institutions: ['desk'] }, { types: [' Construct/Domain '] }), OWNER);
  assert.deepEqual(named.kept, ['desk', 'domain']);
  assert.deepEqual(named.cut, { types: 3 });
  // A hop does not continue out of an aid whose pair is not named: the Ledger, behind the Guide, is never reached.
  const deep = resolveLens(AIDS, lensOn({ institutions: ['desk'] }, { depth: 2 }), OWNER);
  assert.deepEqual(deep.cut, { types: 3 });
  const through = resolveLens(AIDS, lensOn({ institutions: ['desk'] }, { depth: 2, types: ['construct/guide', 'institution'] }), OWNER);
  assert.deepEqual(through.cut, { types: 3, hops_not_served: 1 });
  // In an unlensed graph the aids are out, whatever flag is asked; a lens naming the pair keeps them as nodes.
  const g = worldGraph(AIDS, OWNER, { rooms: true, hidden: true, proposed: true, mapSpace: true });
  assert.deepEqual(g.nodes.map(n => n.id), ['charter', 'desk', 'ledger']);
  assert.deepEqual(g.cut, { reading_aid: 3 });
  assert.deepEqual(g.edgesCut, { reading_aid: 2 }); // the Desk's links to the Domain and the Guide
  assert.deepEqual(g.edges, [{ source: 'charter', field: 'author', target: 'desk', index: 0 }]);
  const lensed = worldGraph(AIDS, OWNER, { lens: lensOn({ institutions: ['desk'] }, { types: ['construct/domain', 'institution'] }) });
  assert.deepEqual(lensed.nodes.map(n => [n.id, n.marks]), [['desk', undefined], ['domain', undefined]]);
});

test('an anchor that is a marked Guide is kept and followed, whatever types says', () => {
  const r = resolveLens(AIDS, lensOn({ constructs: ['guide'] }, { types: ['object', 'institution'] }), OWNER);
  assert.deepEqual(r.kept, ['guide', 'desk', 'ledger']);
  assert.deepEqual(r.cut, {});
  const public_ = resolveLens(AIDS, lensOn({ constructs: ['guide'] }), { rung: 'public' });
  assert.deepEqual(public_.kept, ['guide', 'desk', 'ledger']); // an aid is no room element: a public reader sees it
});

test('changed_within: an element exactly that many days old is kept, a second older is stale; never an anchor', () => {
  const clock = '2026-10-27T12:00:00Z';
  const world = {
    elements: [
      { id: 'a', type: 'institution', name: 'Anchor', updated_at: '2020-01-01T00:00:00Z', objects: ['edge', 'past', 'none', 'bad'] },
      { id: 'edge', type: 'object', name: 'Seven days', updated_at: '2026-10-20T12:00:00Z' },
      { id: 'past', type: 'object', name: 'Seven days and a second', updated_at: '2026-10-20T11:59:59Z' },
      { id: 'none', type: 'object', name: 'No time' },
      { id: 'bad', type: 'object', name: 'Unreadable', updated_at: 'yesterday' },
    ],
  };
  const r = resolveLens(world, lensOn({ institutions: ['a'] }, { changed_within: 7 }), OWNER, { clock });
  assert.deepEqual(r.kept, ['a', 'edge', 'bad', 'none']); // no readable time: never cut, sorted last
  assert.deepEqual(r.cut, { stale: 1 });
  // An offset is read: 13:00+01:00 is the same instant as the edge.
  world.elements[2].updated_at = '2026-10-20T13:00:00+01:00';
  assert.deepEqual(resolveLens(world, lensOn({ institutions: ['a'] }, { changed_within: 7 }), OWNER, { clock }).cut, {});
  // A filter is cut too, after the fence, types and the window.
  const f = resolveLens(world, lensOn({}, { types: ['object'], changed_within: 1 }), OWNER, { clock });
  assert.deepEqual([f.kept, f.cut], [['bad', 'none'], { stale: 2 }]);
  for (const bad of [0, -1, 1.5, '7', true, [7]]) {
    assert.equal(resolveLens(world, lensOn({ institutions: ['a'] }, { changed_within: bad }), OWNER).unreadable, 'changed_within', String(bad));
  }
  assert.equal(resolveLens(world, lensOn({ institutions: ['a'] }, { changed_within: null }), OWNER, { clock }).unreadable, null);
});

test('changed_within reads a folder element by the newer of its two sync stamps', () => {
  const clock = '2026-10-27T12:00:00Z';
  const at = (stamps) => ({ elements: [
    { id: 'a', type: 'institution', name: 'Anchor', objects: ['o'] },
    { id: 'o', type: 'object', name: 'Folder copy', ...stamps },
  ] });
  const lens = lensOn({ institutions: ['a'] }, { changed_within: 7 });
  const kept = (stamps) => resolveLens(at(stamps), lens, OWNER, { clock }).kept.includes('o');
  assert.equal(kept({ server_updated_at: '2026-09-01T00:00:00Z', local_updated_at: '2026-10-26T00:00:00Z' }), true);
  assert.equal(kept({ server_updated_at: '2026-10-26T00:00:00Z', local_updated_at: '2026-09-01T00:00:00Z' }), true);
  assert.equal(kept({ server_updated_at: '2026-09-01T00:00:00Z', local_updated_at: '2026-09-02T00:00:00Z' }), false);
  // A folder stamp, where one reads, wins over updated_at; an unreadable one is no stamp.
  assert.equal(kept({ updated_at: '2026-10-26T00:00:00Z', local_updated_at: '2026-09-02T00:00:00Z' }), false);
  assert.equal(kept({ updated_at: '2026-10-26T00:00:00Z', local_updated_at: 'soon' }), true);
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
