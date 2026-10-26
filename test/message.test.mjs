/**
 * The message profile (schema-dist profiles/message.md, serial 72): MESSAGE_PAIR against the
 * fixture's pair, and the readers (isMessage, isAddressedTo, senderStatus, readMarkOf, unreadFor,
 * threadOf) on every conformance case in codegen/schema-dist/profiles/message.fixture.json,
 * vendored with the distribution. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MESSAGE_PAIR, ROOM_PAIRS, isMessage, recipientsOf, isAddressedTo, isSentBy, senderStatus, readMarkOf, unreadFor, threadOf,
} from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/message.fixture.json', import.meta.url));
const COUNTS = { pair: 9, addressed: 8, sent_by: 2, sender: 9, unread: 8, mark: 5, thread: 2 };

function loadFixture() {
  assert.ok(existsSync(FIXTURE), `no message fixture at ${FIXTURE}`);
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  assert.equal(doc.profile, 'message');
  return doc;
}

const ids = (list) => list.map(m => m.id);

/** One case's answer as the fixture writes it, from the package's readers. */
function answer(c, doc) {
  const members = 'members' in c ? c.members : doc.members;
  switch (c.kind) {
    case 'pair': return { is_message: isMessage(c.element) };
    case 'addressed': return { addressed: isAddressedTo(c.message, c.character) };
    // Sent by X is the claim: narrator, which senderStatus hands back as `claimed`.
    case 'sent_by': return { sent_by: isSentBy(c.message, c.character) };
    case 'sender': {
      const s = senderStatus(c.message, members);
      const got = { status: s.status, claimed: s.claimed };
      if (s.writtenBy !== null) got.written_by = s.writtenBy;
      return got;
    }
    case 'mark': return { mark: readMarkOf(c.relations, c.reader, members)?.id ?? null };
    case 'unread': return { unread: ids(unreadFor(c.messages, c.reader, c.read_mark)) };
    case 'thread': return { thread: ids(threadOf(c.messages, c.root)) };
    default: throw new Error(`a case of unknown kind ${c.kind}`);
  }
}

const EXPECTED_KEYS = {
  pair: ['is_message'], addressed: ['addressed'], sent_by: ['sent_by'], sender: ['status', 'claimed', 'written_by'],
  mark: ['mark'], unread: ['unread'], thread: ['thread'],
};

test('MESSAGE_PAIR is the fixture\'s pair, and one of the room profile\'s pairs', () => {
  const doc = loadFixture();
  assert.deepEqual({ ...MESSAGE_PAIR }, doc.pair);
  assert.ok(ROOM_PAIRS.some(p => p.type === MESSAGE_PAIR.type && p.supertype === MESSAGE_PAIR.supertype));
  assert.deepEqual(
    { type: doc.read_mark.type, supertype: doc.read_mark.supertype, reader: doc.read_mark.reader_field, messages: doc.read_mark.messages_field },
    { type: 'relation', supertype: 'Read', reader: 'actor', messages: 'narratives' },
  );
});

test('the message readers answer every case of the message fixture', (t) => {
  const doc = loadFixture();
  const { cases } = doc;
  const wrong = [];
  const counts = {};
  for (const c of cases) {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    const want = Object.fromEntries(EXPECTED_KEYS[c.kind].filter(k => k in c).map(k => [k, c[k]]));
    let got;
    try {
      got = answer(c, doc);
    } catch (err) {
      got = { threw: String(err) };
    }
    try {
      assert.deepEqual(got, want);
    } catch {
      wrong.push(`${c.kind}/${c.name}: gave ${JSON.stringify(got)}, the fixture says ${JSON.stringify(want)}`);
    }
  }
  t.diagnostic(`the message fixture: ${cases.length} cases run, ${wrong.length} disagreeing, from ${FIXTURE}`);
  assert.deepEqual(wrong, []);
  assert.equal(cases.length, 43, `the fixture holds ${cases.length} cases, serial 72 has 43`);
  assert.deepEqual(counts, COUNTS);
});

test('recipientsOf gives the ids as written; empty is everyone, which isAddressedTo reads', () => {
  const A = '019a3b10-0000-7000-8000-0000000000a1';
  assert.deepEqual(recipientsOf({ characters: [A] }), [A]);
  assert.deepEqual(recipientsOf({ characters: null }), []);
  assert.deepEqual(recipientsOf({}), []);
  assert.deepEqual(recipientsOf(null), []);
  assert.equal(isAddressedTo({ characters: [] }, A), true);
});

test('the documented calls compile against the built types: bodies and member rows as the client returns them', async () => {
  const ts = (await import('typescript')).default;
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'ow-message-'));
  try {
    const dist = fileURLToPath(new URL('../dist/index.js', import.meta.url)).replace(/\\/g, '/');
    const file = join(dir, 'use.ts');
    writeFileSync(file, [
      `import { OwV2Client, MESSAGE_PAIR, isMessage, recipientsOf, isAddressedTo, senderStatus, readMarkOf, unreadFor, threadOf,`,
      `  type OwMember, type OwSender, type OwElement } from '${dist}';`,
      'declare const c: OwV2Client;',
      'export async function use(me: string): Promise<void> {',
      "  const messages: OwElement[] = (await c.list('narrative', { filter: { supertype: MESSAGE_PAIR.supertype } })).data.filter(isMessage);",
      "  const marks: OwElement[] = (await c.list('relation', { filter: { supertype: 'Read' } })).data;",
      '  const members: OwMember[] = await c.members();',
      '  const mark: OwElement | null = readMarkOf(marks, me, members);',
      '  const unread: OwElement[] = unreadFor(messages, me, mark);',
      '  const thread: OwElement[] = threadOf(messages, messages[0].id);',
      '  const from: OwSender = senderStatus(messages[0], members);',
      '  senderStatus(messages[0], null);',
      '  const to: string[] = recipientsOf(messages[0]);',
      "  const one = { id: 'm', type: 'narrative' as const, name: 'Hi', supertype: 'Message', narrator: me, characters: [] };",
      '  const mine: boolean = isAddressedTo(one, me) && isMessage(one);',
      "  readMarkOf([{ id: 'r', type: 'relation', supertype: 'Read', actor: me, narratives: [] }], me, [{ id: null, character: me }]);",
      '  void unread; void thread; void from; void to; void mine;',
      '}',
    ].join('\n'));
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10,
      lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], strict: true, skipLibCheck: true, noEmit: true,
    });
    const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the readers on element bodies: microseconds order, and a loop in a chain ends the walk', () => {
  const msg = { id: 'm', type: 'narrative', name: 'Hello', supertype: ' MESSAGE ', narrator: 'a', characters: [], created_at: '2026-10-26T09:40:00.000100Z' };
  const later = { ...msg, id: 'n', created_at: '2026-10-26T09:40:00.000050Z' };
  assert.equal(isMessage(msg), true);
  // Microseconds order too: 50 before 100, though both are the same millisecond.
  assert.deepEqual(ids(unreadFor([msg, later], 'b', null)), ['n', 'm']);
  const loop = [{ ...msg, id: 'x', parent_narrative: 'y' }, { ...msg, id: 'y', parent_narrative: 'x' }];
  assert.deepEqual(ids(threadOf(loop, 'r')), [], 'a loop in the chain ends the walk');
  assert.deepEqual(ids(threadOf(loop, 'x')), ['x', 'y'], 'a loop through the root reaches it');
});

test('recipients keep their order and a malformed list is not everyone (the Python package asserts the same)', () => {
  const ADA = 'a1', MARA = 'a2';
  assert.deepEqual(recipientsOf({ characters: [MARA, ADA] }), [MARA, ADA]);
  assert.deepEqual(recipientsOf({}), []);
  assert.deepEqual(recipientsOf({ characters: ADA }), []);
  for (const characters of [ADA, [''], [5], { 0: ADA }]) assert.equal(isAddressedTo({ characters }, ADA), false, JSON.stringify(characters));
  for (const characters of [[], null]) assert.equal(isAddressedTo({ characters }, ADA), true, JSON.stringify(characters));
  assert.equal(isAddressedTo({}, ADA), true);
  assert.equal(isAddressedTo({ characters: [] }, ''), false);
  assert.equal(isSentBy({ narrator: ADA }, ADA), true);
  assert.equal(isSentBy({ narrator: ADA }, MARA), false);
  assert.equal(isSentBy({}, ''), false);
});
