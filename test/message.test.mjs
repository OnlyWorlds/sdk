/**
 * The message profile (schema-dist profiles/message.md, serial 76): MESSAGE_PAIR and NOTE_PAIR against
 * the fixture's pairs, and the readers (isMessage, isAddressedTo, hasUnseenRecipients, isToEveryone,
 * isSentBy, senderStatus, editedBy, readMarkOf, unreadFor, threadOf, noteOf) on every conformance case in codegen/schema-dist/profiles/message.fixture.json,
 * vendored with the distribution. Runs against the compiled public bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MESSAGE_PAIR, NOTE_PAIR, ROOM_PAIRS, isMessage, isNote, recipientsOf, isAddressedTo, isToEveryone, hasUnseenRecipients, isSentBy,
  senderStatus, editedBy, readMarkOf, unreadFor, threadOf, noteOf,
} from '../dist/index.js';

const FIXTURE = fileURLToPath(new URL('../codegen/schema-dist/profiles/message.fixture.json', import.meta.url));
const COUNTS = { pair: 10, addressed: 11, sent_by: 3, sender: 14, unread: 17, mark: 10, thread: 4, unseen: 3, everyone: 3, edited: 4, note: 8 };

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
    // A case without keyless has a credential.
    case 'unseen': return { addressed: isAddressedTo(c.message, c.character), unseen_recipients: hasUnseenRecipients(c.message) };
    case 'everyone': return {
      to_everyone: isToEveryone(c.message, { keyless: c.keyless }),
      unseen_recipients: hasUnseenRecipients(c.message, { keyless: c.keyless }),
    };
    // Sent by X is the claim: narrator, which senderStatus hands back as `claimed`.
    case 'sent_by': return { sent_by: isSentBy(c.message, c.character) };
    case 'sender': {
      const s = senderStatus(c.message, members);
      const got = { status: s.status, claimed: s.claimed };
      if (s.writtenBy !== null) got.written_by = s.writtenBy;
      return got;
    }
    case 'mark': return { mark: readMarkOf(c.relations, c.reader, members)?.id ?? null };
    case 'unread': return { unread: ids(unreadFor(c.messages, c.reader, c.read_mark, members)) };
    case 'thread': return { thread: ids(threadOf(c.messages, c.root)) };
    case 'edited': {
      const e = editedBy(c.message, members);
      return { edited: e.edited, edited_by: e.by };
    }
    case 'note': return { line: noteOf(c.notes, c.character, members) };
    default: throw new Error(`a case of unknown kind ${c.kind}`);
  }
}

const EXPECTED_KEYS = {
  pair: ['is_message'], addressed: ['addressed'], sent_by: ['sent_by'], sender: ['status', 'claimed', 'written_by'],
  mark: ['mark'], unread: ['unread'], thread: ['thread'], unseen: ['addressed', 'unseen_recipients'],
  everyone: ['to_everyone', 'unseen_recipients'], edited: ['edited', 'edited_by'], note: ['line'],
};

test('MESSAGE_PAIR is the fixture\'s pair, and one of the room profile\'s pairs', () => {
  const doc = loadFixture();
  assert.deepEqual({ ...MESSAGE_PAIR }, doc.pair);
  assert.ok(ROOM_PAIRS.some(p => p.type === MESSAGE_PAIR.type && p.supertype === MESSAGE_PAIR.supertype));
  assert.deepEqual({ ...NOTE_PAIR }, doc.note_pair);
  assert.equal(isNote({ type: ' Narrative ', supertype: 'NOTE' }), true);
  assert.equal(isNote({ type: 'narrative', supertype: 'Notes' }), false);
  assert.equal(isNote({ type: 'narrative', supertype: 'Message' }), false);
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
    // A kind this replay does not know is a disagreement, never skipped.
    const want = Object.fromEntries((EXPECTED_KEYS[c.kind] ?? ['a reader for this kind']).filter(k => k in c || !EXPECTED_KEYS[c.kind]).map(k => [k, c[k]]));
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
  assert.equal(cases.length, 87, `the fixture holds ${cases.length} cases, serial 94 has 87`);
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
      `import { OwV2Client, MESSAGE_PAIR, NOTE_PAIR, isMessage, isNote, recipientsOf, isAddressedTo, senderStatus, editedBy, readMarkOf, unreadFor, threadOf, noteOf,`,
      `  type OwMember, type OwSender, type OwEdited, type OwElement } from '${dist}';`,
      'declare const c: OwV2Client;',
      'export async function use(me: string): Promise<void> {',
      "  const messages: OwElement[] = (await c.list('narrative', { filter: { supertype: MESSAGE_PAIR.supertype } })).data.filter(isMessage);",
      "  const marks: OwElement[] = (await c.list('relation', { filter: { supertype: 'Read' } })).data;",
      '  const members: OwMember[] = await c.members();',
      '  const mark: OwElement | null = readMarkOf(marks, me, members);',
      '  const unread: OwElement[] = unreadFor(messages, me, mark, members);',
      '  unreadFor(messages, me, mark); unreadFor(messages, me, null, null);',
      '  const thread: OwElement[] = threadOf(messages, messages[0].id);',
      '  const from: OwSender = senderStatus(messages[0], members);',
      '  senderStatus(messages[0], null);',
      '  const to: string[] = recipientsOf(messages[0]);',
      '  const edit: OwEdited = editedBy(messages[0], members);',
      "  const notes: OwElement[] = (await c.list('narrative', { filter: { supertype: NOTE_PAIR.supertype } })).data.filter(isNote);",
      '  const line: string | null = noteOf(notes, me, members);',
      '  const trimmed: string[] | undefined = messages[0].x_served_trimmed;',
      '  void edit; void line; void trimmed;',
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
  for (const characters of [ADA, [''], [5], [ADA]]) assert.equal(isToEveryone({ characters }), false, JSON.stringify(characters));
  for (const m of [{}, { characters: null }, { characters: [] }]) assert.equal(isToEveryone(m), true, JSON.stringify(m));
  assert.equal(isToEveryone(null), false);
});

test('a list the server trimmed is never everyone, and says someone unseen is addressed', () => {
  const ADA = 'a1';
  const trimmed = (characters, mark = ['characters']) => ({ characters, x_served_trimmed: mark });
  // every recipient hidden: keel serves an empty list with the mark, which must not read as everyone
  assert.equal(isToEveryone(trimmed([])), false);
  assert.equal(hasUnseenRecipients(trimmed([])), true);
  assert.equal(isAddressedTo(trimmed([]), ADA), false);
  // some hidden: the reader's own id is still read as written
  assert.equal(hasUnseenRecipients(trimmed([ADA])), true);
  assert.equal(isAddressedTo(trimmed([ADA]), ADA), true);
  // only the sender trimmed: the addressing is whole
  assert.equal(hasUnseenRecipients(trimmed([], ['narrator'])), false);
  assert.equal(isToEveryone(trimmed([], ['narrator'])), true);
  for (const m of [{}, { characters: [] }, { x_served_trimmed: 'characters' }, { x_served_trimmed: null }, null]) {
    assert.equal(hasUnseenRecipients(m), false, JSON.stringify(m));
  }
  // a body read keyless carries no mark: never asserted to everyone, and the unseen answer is unknown
  for (const m of [{}, { characters: [] }, { characters: null }]) {
    assert.equal(isToEveryone(m, { keyless: true }), false, JSON.stringify(m));
    assert.equal(hasUnseenRecipients(m, { keyless: true }), null, JSON.stringify(m));
    assert.equal(isToEveryone(m, { keyless: false }), true, JSON.stringify(m));
  }
  // the sender trimmed: unseen, never "from nobody"; a null narrator without the mark stays unverifiable
  assert.deepEqual(senderStatus({ narrator: null, x_served_trimmed: ['narrator'] }, []), { status: 'unseen', claimed: null, writtenBy: null });
  assert.equal(senderStatus({ narrator: null, x_served_trimmed: ['characters'] }, []).status, 'unverifiable');
  assert.equal(senderStatus({ narrator: null }, []).status, 'unverifiable');
});

test('the newest read mark wins wherever it stands in the list (the fixture lists it first)', () => {
  // The fixture's mark-newest-updated-at-wins lists the newer mark first, so a reader that kept the
  // first mark that counts would pass it. Here the newest stands last; a readable time beats an
  // unreadable one, and equal times keep the first in the list.
  const ADA = '019a3b10-0000-7000-8000-0000000000a1';
  const mark = (id, updatedAt) => ({ id, type: 'relation', supertype: 'Read', actor: ADA, narratives: [], ...(updatedAt ? { updated_at: updatedAt } : {}) });
  const older = mark('old', '2026-10-26T08:00:00Z');
  const newer = mark('new', '2026-10-26T11:00:00Z');
  const undated = mark('undated', null);
  const twin = mark('twin', '2026-10-26T11:00:00Z');
  assert.equal(readMarkOf([older, newer], ADA, null)?.id, 'new');
  assert.equal(readMarkOf([undated, older, newer], ADA, null)?.id, 'new');
  assert.equal(readMarkOf([older, undated], ADA, null)?.id, 'old');
  assert.equal(readMarkOf([newer, twin], ADA, null)?.id, 'new');
  // The fixture's own case, its relations reversed: the owner's hand, checked on the members list.
  const doc = loadFixture();
  const c = doc.cases.find((x) => x.name === 'mark-newest-updated-at-wins');
  assert.equal(readMarkOf([...c.relations].reverse(), c.reader, doc.members)?.id, c.mark);
});

test('a read mark counts only when every write on it was its reader\'s own hand (inputs the fixture leaves open)', () => {
  const doc = loadFixture();
  const OWNER_CHAR = '019a3b10-0000-7000-8000-0000000000a1', MARA = '019a3b10-0000-7000-8000-0000000000a2';
  const MARA_HAND = '019a3b10-0000-7000-8000-0000000000b2', WREN_HAND = '019a3b10-0000-7000-8000-0000000000b3';
  const mark = (actor, hands) => ({ id: 'r', type: 'relation', supertype: 'Read', actor, narratives: [], updated_at: '2026-10-26T10:00:00Z', ...hands });
  // No changed_by key: only the author is checked (a reader that cannot see the last writer).
  assert.equal(readMarkOf([mark(MARA, { created_by: MARA_HAND })], MARA, doc.members)?.id, 'r');
  // The owner made it and the owner last changed it: both null, equal, the owner's own mark.
  assert.equal(readMarkOf([mark(OWNER_CHAR, { created_by: null, changed_by: null })], OWNER_CHAR, doc.members)?.id, 'r');
  // The owner made it and a member changed it since.
  assert.equal(readMarkOf([mark(OWNER_CHAR, { created_by: null, changed_by: MARA_HAND })], OWNER_CHAR, doc.members), null);
  // changed_by with no created_by beside it: a last writer and no author to compare it to.
  assert.equal(readMarkOf([mark(MARA, { changed_by: MARA_HAND })], MARA, doc.members), null);
  assert.equal(readMarkOf([mark(MARA, { changed_by: null })], MARA, doc.members), null);
  // One hand throughout, but not the reader's: the author check still refuses it.
  assert.equal(readMarkOf([mark(MARA, { created_by: WREN_HAND, changed_by: WREN_HAND })], MARA, doc.members), null);
  // A key set to undefined is no key: the folder rule.
  assert.equal(readMarkOf([mark(MARA, { created_by: undefined, changed_by: undefined })], MARA, doc.members)?.id, 'r');
  // A changed mark is out, so the reader's own older mark stands.
  const older = { ...mark(MARA, { created_by: MARA_HAND, changed_by: MARA_HAND }), id: 'old', updated_at: '2026-10-26T08:00:00Z' };
  assert.equal(readMarkOf([older, mark(MARA, { created_by: MARA_HAND, changed_by: null })], MARA, doc.members)?.id, 'old');
});

test('unreadFor on the wire proves the reader\'s own messages only through the members list (inputs the fixture leaves open)', () => {
  const doc = loadFixture();
  const MARA = '019a3b10-0000-7000-8000-0000000000a2', MARA_HAND = '019a3b10-0000-7000-8000-0000000000b2';
  const GUEST_HAND = '019a3b10-0000-7000-8000-0000000000b5';
  const msg = (id, narrator, extra) => ({ id, type: 'narrative', supertype: 'Message', name: id, narrator, characters: [], created_at: `2026-10-26T09:0${id.length}:00Z`, ...extra });
  const mine = msg('m', MARA, { created_by: MARA_HAND });
  // Verified with the members list: Mara's own, never unread for her.
  assert.deepEqual(ids(unreadFor([mine], MARA, null, doc.members)), []);
  // No members list, a null one, or an empty one: nothing on the wire is proved.
  assert.deepEqual(ids(unreadFor([mine], MARA, null)), ['m']);
  assert.deepEqual(ids(unreadFor([mine], MARA, null, null)), ['m']);
  assert.deepEqual(ids(unreadFor([mine], MARA, null, [])), ['m']);
  // The author's row plays no Character: unverifiable, so unread for the Character it claims.
  assert.deepEqual(ids(unreadFor([msg('g', MARA, { created_by: GUEST_HAND })], MARA, null, doc.members)), ['g']);
  // Decided per message: one with no created_by among wire messages trusts its narrator.
  const folderish = msg('ff', MARA, {});
  assert.deepEqual(ids(unreadFor([mine, folderish], MARA, null, doc.members)), []);
  assert.deepEqual(ids(unreadFor([mine, folderish], MARA, null)), ['m']);
  // created_by set to undefined is no created_by: the folder rule.
  assert.deepEqual(ids(unreadFor([msg('u', MARA, { created_by: undefined })], MARA, null)), []);
  // An empty id reads nothing, though the message is to everyone.
  assert.deepEqual(ids(unreadFor([msg('e', '', {})], '', null, doc.members)), []);
});

// The shared edge cases: inputs the fixture leaves open, the same file byte for byte as the Python
// package's tests/fixtures/message-edges.json (both suites hold its sha256), answers written by hand.
const EDGES_FILE = fileURLToPath(new URL('./fixtures/message-edges.json', import.meta.url));
const EDGES_SHA256 = '48fffaf28bced5faa49024f7d541a195938e03ebde4f2a71d21099c1d10a1980';

function edgeAnswer(e) {
  switch (e.reader) {
    case 'recipients': return recipientsOf(e.message);
    case 'addressed': return isAddressedTo(e.message, e.character);
    case 'everyone': return isToEveryone(e.message, { keyless: e.keyless });
    case 'unseen': return hasUnseenRecipients(e.message, { keyless: e.keyless });
    case 'unread': return ids(unreadFor(e.messages, e.reader_id, null, e.members));
    case 'thread': return ids(threadOf(e.messages, e.root));
    case 'edited': return editedBy(e.message, e.members);
    case 'note': return noteOf(e.notes, e.character, e.members);
    default: throw new Error(`an edge of unknown reader ${e.reader}`);
  }
}

test('the shared edge cases: Notes on every reader, the created_at rule, the edit, the line (the Python package runs the same file)', async () => {
  const { createHash } = await import('node:crypto');
  const bytes = readFileSync(EDGES_FILE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EDGES_SHA256);
  const edges = JSON.parse(bytes.toString('utf8'));
  const wrong = [];
  for (const e of edges) {
    let got;
    try { got = edgeAnswer(e); } catch (err) { got = { threw: String(err) }; }
    try { assert.deepEqual(got, e.want); } catch { wrong.push(`${e.name}: gave ${JSON.stringify(got)}, want ${JSON.stringify(e.want)}`); }
  }
  assert.deepEqual(wrong, []);
  assert.equal(edges.length, 26);
});

test('keyless is an options object with a boolean: a bare true or a string is a TypeError, never read as false', () => {
  assert.throws(() => isToEveryone({ characters: [] }, true), TypeError);
  assert.throws(() => hasUnseenRecipients({ characters: [] }, true), TypeError);
  assert.throws(() => isToEveryone({ characters: [] }, { keyless: 'yes' }), TypeError);
  assert.equal(isToEveryone({ characters: [] }, null), true);
  assert.equal(isToEveryone({ characters: [] }, {}), true);
});
