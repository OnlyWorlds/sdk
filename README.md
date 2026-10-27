# OnlyWorlds TypeScript SDK

[![npm version](https://badge.fury.io/js/@onlyworlds%2Fsdk.svg)](https://www.npmjs.com/package/@onlyworlds/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OnlyWorlds is an open standard for worldbuilding data: 22 element types (characters, locations, events, laws and the rest) that any tool can read and write. This is a typed client for its API, with the schema's constants (element types, icons, colour families, field metadata) generated from the published [schema distribution](https://github.com/OnlyWorlds/schema-dist). It runs in Node 18+ and in the browser through a bundler (ESM only).

## Install

```bash
npm install @onlyworlds/sdk
```

## First run

Moppetopia is a public demo world. Its read-only key, `0000000001`, needs no account:

```typescript
import { OwV2Client } from '@onlyworlds/sdk';

const client = new OwV2Client({ apiKey: '0000000001' });
console.log((await client.getWorld()).name);
const { data } = await client.list('character', { filter: { name__icontains: 'fluffington' } });
for (const c of data) console.log(' ', c.name);
```

```
Moppetopia
  Admiral Fluffington
```

## Your own world

Create a world at [onlyworlds.com](https://www.onlyworlds.com); its keys are on the world's page. A new key is shown once, so copy it then.

- An `ow_r_` key reads, with no PIN. It is the key to give to players or a public site.
- An `ow_w_` key reads and writes. Writes also send a PIN as `apiPin`.
- Anyone who loads a web page can read the keys in its code. Ship only an `ow_r_` key to a browser, and keep write keys and seat secrets on a server.
- For code that writes, give it its own [agent seat](https://onlyworlds.github.io/docs/development/agents), a key for one tool or script. The seat's key and its `ow_s_` secret (sent as `apiPin`) work in one world, and you can remove them without touching your account PIN.

```typescript
const writer = new OwV2Client({ apiKey: 'ow_w_…', apiPin: 'ow_s_…' });
```

## Reading and writing

```typescript
const location = await writer.create('location', {
  name: 'Dragon Peak',
  description: 'A mountain peak where dragons nest',
}); // the id is minted client-side when omitted, so a retry creates nothing twice

const dragon = await writer.create('creature', {
  name: 'Vorrath the Ember-Scaled',
  location: location.id, // a single link: a UUID or null
});

const fetched = await writer.get('creature', dragon.id);
// fetched.location === location.id: a field reads the way it writes

// PATCH replaces the fields it sends; an array is replaced whole
await writer.patch('location', location.id, { supertype: 'Mountain' });

// For links, the atomic merge; it returns the updated element
const breath = await writer.create('ability', { name: 'Ember Breath' });
await writer.editLinks('creature', dragon.id, 'abilities', { add: [breath.id], remove: [] });

// Every page of a type
for await (const character of writer.listAll('character')) { /* ... */ }
```

A link field has one name in both directions (`location`, not `location_id`). Only `name` is required, and an empty name is stored as `''`. A `world` field in a payload is ignored: the key decides the world, and the client strips it anyway.

## Bulk writes

`/bulk` answers 200 even when some items fail, so check `errors`:

```typescript
const res = await writer.bulk(
  [
    { type: 'character', element: { name: 'A' } },
    { type: 'event', element: { name: 'B' } },
  ],
  { idempotencyKey: crypto.randomUUID() }, // a new key per attempt: a failed batch is cached under its key
);
if (res.errors) {
  for (const slot of res.items.filter((s) => s.status >= 400)) {
    console.warn(slot.error?.code, slot.error?.message, slot.error?.doc_url);
  }
}
```

Pass `{ atomic: true }` for all or nothing. After a failed atomic batch nothing was written, but the slots that would have succeeded still read 201: don't record those ids as created. `res.wasReplay` marks an idempotent replay.

## Images

```typescript
const image = await writer.uploadImage(file); // a Blob, File, ArrayBuffer or Uint8Array
await writer.patch('character', id, { image_url: image.url });
```

In a browser, shrink a phone photo first: `const photo = await preparePhoto(file)` gives a webp (or JPEG where the browser can't encode webp) of at most 2048 px on its longest side; upload `photo.blob`.

The SDK asks the API for a single-use ticket, then sends the bytes straight to the upload host, which never sees your key. webp, png, jpeg or avif (no SVG or gif), up to 15 MB. Each upload counts toward the world's daily limit and the account's storage. To upload yourself (for a progress bar), call `createMediaTicket()` and POST the bytes to its `upload_url` with `Authorization: Bearer <ticket>`.

```typescript
await writer.removeImage(image.url); // the image_url, or its object key
await writer.patch('character', id, { image_url: null });
```

The image's uploader or the world's owner can remove an uploaded image; the space goes back to the uploader's storage. Removal leaves elements as they are, so clear their `image_url` yourself (`createRemovalTicket(key).referenced` says how many still show it). A copy the network already holds can keep answering for a while.

## Files on elements

A pdf, a text file (txt, md, json, csv, yaml, toml) or a world's own bundle (zip), attached to an element. Files are not fields: they never appear in the element's body, its `change_seq` or `/changes`.

```typescript
const rows = await writer.listFiles('location', id);   // newest first: name, kind, size, label, added_by, added_at
const stored = await writer.uploadFile('location', id, file, {
  label: 'description',                                   // optional: a field the file belongs to, or your own words
  onProgress: (loaded, total) => bar.set(loaded / total),
});
const { url, exp } = await writer.fileDownloadLink('location', id, rows[0].id); // fetch it now: the link lives 5 minutes
await writer.removeFile('location', id, rows[0].id);      // the world's owner or whoever added it
const { data, used_bytes, cap_bytes } = await writer.worldFiles();               // every file, and the world's total
```

`uploadFile` takes a File, Blob, ArrayBuffer or Uint8Array. It asks the API for a single-use ticket (`createFileTicket` alone, if you send the bytes yourself), then sends the bytes to the upload host. The name is a File's own unless you pass `name`; the kind comes from its extension (`.yml` and `.markdown` count). Up to 25 MB a file, 250 MB a world, 200 tickets a world a day: the refusals are `err.isFileTooLarge` (413), `err.isFilesFull` (403) and `err.isQuotaExceeded` (429, see `retryAfter`). In a browser, progress comes through XMLHttpRequest; elsewhere `onProgress` is called once, at the end. The download link is the credential to the file: ask for it when the file is opened, and don't keep it.

## Signing in

An app where people sign in with their OnlyWorlds email (or username) and password turns that into an account token for the device. A client with no key can do it:

```typescript
const { token } = await new OwV2Client().signInWithPassword({
  email, password, tokenName: 'My app on iPhone', // the name the account's tokens page lists it under
});
const account = new OwV2Client({ apiKey: token }); // keep the token; the password is not kept anywhere
```

The SDK signs in, mints the token, and ends the sign-in session. A refusal is an `OwSignInError` whose `reason` is `invalid_credentials`, `email_unverified`, `rate_limited` (see `retryAfter`), `offline`, `mint_failed` or `failed`.

The account token lists the account's worlds (`listAccountWorlds()`), mints a key for one (`mintWorldKey(worldId, { scope, name })`), and makes a new one with its write key (since 4.66.0):

```typescript
const world = await account.createAccountWorld({ name: 'Ostvik', keyName: 'My app' }); // world.key: shown once
```

An account's first world sends `pin` too, which becomes the account PIN; an account that has one leaves it out. Either way the wrong choice is a 422 with `err.param === 'pin'` and nothing made, so send without it first and again with it on that 422. A tool that makes the world from a folder can pass the folder's `source` and `producer` lines; `getWorld()` serves them as `origin`.

## Invite links

A world's owner can invite a person with a link (`https://www.onlyworlds.com/join#ow_j_…`). The code is the part after `#`:

```typescript
const invite = await client.previewJoin(code);   // who invites, which world, what role; sends no key
const membership = await account.acceptJoin(code); // account = a client with an ow_a_ token
```

A bad code (unknown, used, revoked, expired) is one 404 (`err.isNotFound`). Accepting can answer `err.isAlreadyMember`; it needs no account PIN, though a write key for the new membership waits for one. A refusal never uses up the code.

The owner makes, lists and revokes the links with the account token (since 4.24.0). The code comes back once, in the answer that makes it:

```typescript
const made = await account.createWorldLink(worldId, { reader: 'person', role: 'contributor', days: 7 });
// made.line: the one line to send (who invites, to which world, the link); made.code: the ow_j_ code
const links = await account.listWorldLinks(worldId);  // no codes: status pending | used | revoked | expired
await account.revokeWorldLink(worldId, made.id);
```

`reader: 'agent'` makes a link an AI agent redeems for a seat instead. Anyone but the owner gets a 404.

Once in, a world key can ask who it is and who else is there (since 4.22.0):

```typescript
const me = await client.me();           // { world, scope, kind, role, membership, character, front_door }: front_door.charter is the house rules, read first
const roster = await client.members();  // [{ id, kind, role, character, status }], the owner's id is null
```

`me.membership` is what `created_by` holds on the elements this key creates; `me.role` decides what it may change.

## Sync

```typescript
let cursor; // opaque and never expires: keep it
for await (const change of client.changesAll(cursor)) {
  // changes arrive in order; apply them in order and you converge
}
```

To poll for news cheaply, `client.changesHead()` returns `{ head, cursor, epoch, unchanged }` without reading any element: walk `changesAll` only when `head` or `epoch` moved past what you last applied. Since 4.57.0 the client sends the last answer's ETag back, so when nothing moved keel answers 304 (refunded against your request budget) and `unchanged` is true. Sleep on it; the interval is yours.

Edits to the world itself (its name, calendar, `public_read`) don't appear in the change feed. Read `client.getWorld()` and compare `updated_at`.

`client.patchWorld(partial)` writes the world's own settings, and takes a `getWorld()` body back: the keys keel does not take (`id`, `origin`, `slug`, `public_page` and the owner's switches) are left out. The world's `origin` is written as the plain keys `source` and `producer` (each an object or `null`), and extension keys (`x_*`, `atlas_*`, `shadow_*`) are sent as given; `null` removes one.

### Only if unchanged

A client that edits offline, or from a copy it has held a while, can ask for an update to land only if nobody changed the element since it was read: pass the `change_seq` you read as `ifMatch`, on `patch`, `editLinks` or `delete` (since 4.61.0: a delete of an element someone changed since you read it is refused, nothing deleted).

```typescript
try {
  await client.patch('character', el.id, { name: 'Mine' }, { ifMatch: el.change_seq });
} catch (err) {
  if (err instanceof OwPreconditionFailedError) {
    // nothing was written; err.current is the element as it is now
  }
}
```

The check is per element and the server never merges. Compare the copy you edited from with `err.current`: when the fields you changed are not the ones that moved, send again with `ifMatch: err.current.change_seq`; when the same field moved on both sides, ask the user which to keep. Without `ifMatch` a write is unconditional, as before.

## Proposals

A member can propose a change instead of making it. The element stays as it is until the world's owner or a co-builder accepts.

```typescript
const p = await member.propose('location', id, { fields: { description: 'A harbour town.' }, evidence: 'Chapter 3' });
const queue = await owner.worldProposals();               // { data, has_more, next_cursor }, newest first
const { element } = await owner.acceptProposal('location', id, p.id);   // the write is the owner's
await owner.declineProposal('location', id, p.id, { reason: 'Not canon.' });
await member.withdrawProposal('location', id, p.id);
```

The world's queue also lists each new element written as proposed, as a row with `kind: 'new_element'` beside the `kind: 'proposal'` rows (since 4.66.0). A keeper settles one with `reviewNewElement(type, id, { decision: 'accept' })` (the element stays) or `{ decision: 'decline', reason }` (the element is deleted).

An accept is refused with nothing written when a proposed field moved since the proposal was made: `OwStaleProposalError` (409, `err.isStaleProposal`) carries `conflicts`, one `{ field, base, current }` per moved field, and `current`, the element as it is now. `listProposals(type, id)` lists one element's rows.

A world's owner can have agent seats propose instead of write (`agent_writes_proposed` on `getWorld()`, set on the world page). An agent seat's `patch`, `upsert` or `editLinks` on an existing element then throws `OwProposedError` (status 202, `err.isProposed`), with the row under `err.proposal`. A `bulk` slot says `status: 202` and carries `proposal` instead. A person's key is never held.

## Finding elements in a world

When you hold a world's elements in memory (from a sync, or a world file), `lookupWorld` finds the ones a plain question is about, with no model and no network:

```typescript
import { buildWorldIndex, lookupWorld, renderElement } from '@onlyworlds/sdk';

const index = buildWorldIndex(elements);          // once per world; each element needs id and type
const hits = lookupWorld(index, 'who runs the mill in Ostvik?');
hits[0].element; hits[0].reasons;                 // best first, with why each matched
renderElement(hits[0].element, index);            // a short text card, links by name
```

Names come first, then supertype and subtype, then one link step in either direction, then the elements' other text.

To have an answer written from what you found, OnlyWorlds runs a small AI proxy for signed-in accounts (50 questions a day):

```typescript
const shown = hits.slice(0, 8);                          // what your screen lists
const { context, kept, leftOut } = buildAskContext(shown, index); // within the proxy's limits; kept = what was sent
const reply = await account.ask({ worldId, question, context }); // account: a client with an ow_a_ token
reply.answer;                                            // from those elements only, or "The world doesn't say."
```

`buildAskContext` hands world elements to an AI, so it leaves three kinds out unless you ask (since 4.72.0): elements marked proposed (`x_review_proposed` anything but absent or null), elements marked hidden (`hidden` anything but absent, null or false) and room elements (`isRoomElement`). Their ids come back in `leftOut.proposed`, `leftOut.hidden` and `leftOut.room`, so you can say how many were held back; an element both hidden and proposed is listed under `hidden` only. Pass `{ includeProposed: true }`, `{ includeHidden: true }` or `{ includeRoom: true }` to send them; a proposed element sent carries `[proposed, not yet reviewed]` (`REVIEW_PROPOSED_LABEL`) on its first line. A sent element's link to one left out reads as not present, never by its name. `dropped` stays the proxy's limits: past the 8th, or past the 12,000 characters, counted over what remains.

The same proxy sorts loose notes into changes for the user to review. Send the elements your own lookup found for them as the `slice`; every id in a row comes from it, and nothing is written until your app applies what the user accepts.

```typescript
const slice = hits.slice(0, 100).map(({ element: e }) => ({ id: e.id, type: e.type, name: e.name }));
const { rows, not_proposed } = await account.sort({ worldId, notes: ['Mira moved to Ostvik.'], slice });
// rows: make (a new element), add_to (text for a field), link (one element to another), ask (which one?)
```

Asking and sorting spend tokens from the account's token rating, its daily budget, the same meter the Council uses. Each answer carries `tokens_remaining` and `token_rating`; `allowance()` reads the meter without spending anything (since 4.21.0):

```typescript
const { token_rating, tokens_remaining, resets_at } = await account.allowance(); // resets_at: the next midnight UTC
```

### A Character's context as text

`draughtText(draught)` gives one Character's context packet (`draught(characterId)`, full or `compact`) as plain text to paste into a prompt or a note. It reads the packet alone and calls nothing, and the Python package's `draught_text` gives the same bytes. The title claims only the read's horizon ("dated up to Year 300"), never what the Character knew, and the last line says only what the budget left out (`cut`).

```typescript
const text = draughtText(await client.draught(characterId));
```

## World files

A world file (`.owworld`, a `.zip` by another name) is one archive holding a whole world folder (`world.json` and `elements/<type>/*.json`, as Atlas keeps a world on disk), the way Atlas downloads and opens one. It needs no account and works in the browser and in Node. Both functions follow the Folder Format spec's §4.7 and pass its fixture set.

```typescript
import { readWorldFile, writeWorldFile, OwWorldFileError } from '@onlyworlds/sdk';

const world = readWorldFile(bytes);   // a Uint8Array
world.worldId; world.name; world.world; // world.json, parsed
world.files;                            // [{ path, data }], relative to the world's folder, in code point order

const zip = writeWorldFile(world.files, 'hollow-reach-0192a000'); // one top-level folder
```

The reader checks every entry before it inflates anything, and refuses the file before returning anything. Check `err.reason` on the `OwWorldFileError` it throws:

| `reason` | what the file holds |
|---|---|
| `not_openable` | not a zip, a spanned one, or a broken entry |
| `unsafe_path` | a path that could land outside the folder, or a path that is both a file and a folder |
| `name` | a name some disk cannot hold: `CON` and the other device names, a trailing dot or space, `<>:"\|?*`, a control character, a non-ASCII name without the UTF-8 flag |
| `duplicate`, `collision` | two entries with one name, or two names that differ only in case or in how an accent is written |
| `link`, `method` | a link or special file, an encrypted entry, or a method other than stored or deflate |
| `too_big`, `too_many` | more than 2 GiB or 500,000 files uncompressed (`maxBytes`, `maxEntries` to change them), or an entry bigger than it says |
| `marker` | a `mimetype` entry with other bytes than `WORLD_FILE_MEDIA_TYPE` (a marker is never required) |
| `not_a_world`, `more_than_one` | no `world.json` with an `id`, two worlds, or a second `world.json` inside the world (one under `records/` is data) |

Two names are one when they match after NFC and then simple case folding, both as Unicode 15.1 defines them, from Unicode's own files built into the package (`nfc`, `simpleCaseFold`), never the runtime's Unicode: every reader, in any browser or Node version, joins the same names.

Files beside the world's folder and archive junk (`__MACOSX`, `.DS_Store`) are ignored. The world's OnlyWorlds link and key (`world.json`'s `api`) never travel: both functions remove them. A tool's own folder (`.atlas/` and the like) comes back like any other file; pass `skip: path => …` to leave files out.

The writer gives the same bytes for the same files: the `mimetype` marker first, then every entry in the UTF-8 order of its name, stamped 1980-01-01 00:00. It writes `world.json`, `elements/`, `spatial/`, `media/` and `records/`, and leaves any other file out. A tool's dot-folder you hand it travels too, which makes the file a private copy rather than a portable `.owworld`.

`records/` travels byte for byte, except a producer's directory that `records/RECORDS.json` marks `"private": true`: that one is left out whole, and `RECORDS.json` itself travels unchanged, so the reader can see a producer was left out. Pass `writeWorldFile(files, topDir, { includePrivateRecords: true })` to carry private records too. A `RECORDS.json` that is not a JSON array of objects is refused with a `TypeError` unless you pass that option, since the writer cannot tell which records are private.

An element file marked hidden (`"hidden": true` at the top of its JSON, spec §4.8) travels byte for byte by default: a world file is a copy, also of your own world. When the file is a share, made to hand to someone else, pass `includeHidden: false`: every hidden file under `elements/<type>/` (or the old `spatial/<type>/`) is left out whole, and `report` tells you how many. Nothing else changes: a visible element's link to a hidden one keeps its id. A file there that is not JSON is kept.

```typescript
let left = 0;
const share = writeWorldFile(files, topDir, { includeHidden: false, report: r => { left = r.hiddenLeftOut; } });
```

The two defaults differ on purpose: private records stay out unless you ask, hidden elements stay in unless the write is a share.

## World calendars

A world's time is an integer line (`time_range_current` is a point on it, and so is an Event's `start_date`). A calendar names its points: months, days, eras. Atlas keeps a calendar on an element (a Construct by convention) in its `atlas_calendar` field, and the SDK reads it with Atlas's own calendar code (since 4.20.0). Atlas owns that field and is its only writer; read it, never write it.

```typescript
import { worldCalendars, resolveCalendar, formatStep, formatYearLabel, parseDate } from '@onlyworlds/sdk';

const calendars = worldCalendars(elements);  // [{ id, name, config }]: every element with a valid atlas_calendar
const cal = resolveCalendar(elements, chosenId, { fallbackToOnly: true }); // a world with one calendar uses it
if (cal) {
  formatStep(cal.config, 400);      // "4 Alturiak, 1 DR" (with Harptos, from Atlas's tests)
  formatYearLabel(cal.config, 400); // "1 DR"
  parseDate(cal.config, '4 Alturiak, 1 DR'); // { step: 400 }; a bare number is always the raw step
}
```

No calendar, or a broken one, gives null: show the bare number. `breakdownStep` gives the parts (year, era, month, day, weekday, an intercalary day). The rules are Atlas's calendar design, §5 and §5b.

## Errors

Every non-2xx response throws `OwApiError` with the API's envelope: `.status`, `.type`, `.code`, `.param` (the field that failed) and `.docUrl`, which is worth showing to your users. A transport failure throws `OwNetworkError`. `err.isValidationError` covers the common case. A write sent with `ifMatch` that found the element moved throws `OwPreconditionFailedError` (412, `err.isPreconditionFailed`), an `OwApiError` that also carries `current`. Proposals add `OwStaleProposalError` (409) and `OwProposedError` (202), and the predicates `isFieldNotVisible`, `isTooManyOpen`, `isStaleProposal`, `isProposedOnly` and `isOwnProposal`.

## Schema constants

```typescript
import {
  ELEMENT_TYPES,    // the 22 type slugs (and the ElementType union)
  ELEMENT_ICONS,    // a Material Symbols icon per type
  ELEMENT_LABELS,   // plural display labels
  ELEMENT_SECTIONS, // field grouping and display order
  FIELD_SCHEMA,     // per-field type and link target
  PUBLIC_FIELDS,    // per type, the fields a known-of stub carries besides the base fields
  elementColor,     // colour by family; the icon carries the type
} from '@onlyworlds/sdk';

elementColor('character', 'dark'); // '#3987e5'
```

The four colour families (agents, world, abstract, temporal) are checked for colour-blind separation. Show colour with the icon and label, never alone. [SCHEMA.md](SCHEMA.md) (generated, in the package) describes every field; AI agents should read [AGENTS.md](AGENTS.md) first.

### The room

A parlor (a chat room on a world) keeps its lines, board entries, work items, specs, hearts, votes, sittings and member cards in the world as ordinary elements, told apart by type and supertype and marked with `x_room_of` (the id of the world or sitting the room belongs to). `ROOM_PAIRS` is the room profile's list of those pairs, and `isRoomElement(el)` is true when an element matches one (type and supertype trimmed, case-blind, the whole word) and carries the mark. A pair without the mark is lore: a novel's letters are Narratives with supertype Message.

```typescript
import { isRoomElement } from '@onlyworlds/sdk';

const lore = elements.filter(el => !isRoomElement(el)); // a lore view, unless the person asks for the room
```

A lore view (a list, a count, search, a graph, a link picker, a story's context) leaves room elements out unless the person asks to see them; the room's own views show them whole, and a tool that writes the world writes them like any element. A Law with supertype `Charter` is lore on purpose. The profile: [`profiles/room.md`](https://github.com/OnlyWorlds/schema-dist/blob/main/profiles/room.md) in the schema distribution.

### Messages

A message between a world's members is a Narrative with supertype `Message` (`MESSAGE_PAIR`; `isMessage(el)` matches it trimmed and case-blind): `narrator` is the sender, `characters` the recipients, and an empty `characters` is addressed to everyone, unless the server trimmed the list for you (`x_served_trimmed` names `characters`: `hasUnseenRecipients` is true and `isToEveryone` false) or you read it with no credential (`isToEveryone(msg, { keyless: true })` is never true). The sender is a claim until the server's `created_by` proves it, so `senderStatus` answers `verified`, `mismatch`, `unverifiable` or `unseen` (a sender hidden from you), and a reader shows anything but `verified` as a claim. `editedBy(msg, members)` says whether a later hand changed it and whose Character that is. A reader's read mark is a Relation with supertype `Read` and the reader as `actor`, counted only when every write on it was the reader's own hand (its `created_by`, and its `changed_by` where the reader can see it).

```typescript
import { isMessage, isNote, readMarkOf, senderStatus, editedBy, unreadFor, threadOf, noteOf } from '@onlyworlds/sdk';

const messages = (await client.list('narrative', { filter: { supertype: 'Message' } })).data.filter(isMessage);
const marks = (await client.list('relation', { filter: { supertype: 'Read' } })).data;
const members = await client.members();
const unread = unreadFor(messages, me, readMarkOf(marks, me, members), members); // created_at order
const { status, claimed, writtenBy } = senderStatus(unread[0], members);
const { edited, by } = editedBy(unread[0], members); // "edited by <by>", or by another hand when by is null
const thread = threadOf(messages, rootId); // the root and every reply under it
const notes = (await client.list('narrative', { filter: { supertype: 'Note' } })).data.filter(isNote);
const line = noteOf(notes, me, members); // the id of my newest own-hand Note, or null
```

Both lists are in `created_at` order, equal times keep the order of the list given, and a `created_at` that is not an RFC 3339 date-time (or one with no zone, read as UTC) comes after every one that is. A Note (a Narrative with supertype `Note`) is a member's own line, never a message: the readers never address it, list it as unread or put it in a thread. A message the reader sent is not unread for them, but on the wire only a verified sender counts: pass `members` to `unreadFor`, or every message claiming to be from the reader stays unread. A world folder carries no `created_by`, so there `narrator` is trusted and `members` can be left out. The profile: [`profiles/message.md`](https://github.com/OnlyWorlds/schema-dist/blob/main/profiles/message.md) in the schema distribution.

### Lenses

A lens is a saved way of reading a world: a Construct with supertype `Lens` (`isLens(el)`) whose links are its anchors and whose `x_lens` is the recipe (`depth`, `types`, `window` or `from` and `to`, `undated`, `show`, `budget`, `mail`, `notes`). `resolveLens(world, lens, reader)` resolves it for one reader over a world snapshot, the same answer as the Python package's `resolve_lens`: the kept ids and their rows in the profile's order, the cut counted by reason, and the mail part when the lens names a mail rule. A template (`isTemplate(el)`, subtype `Template`) resolves to nothing; `lensesInUse(membership, character.x_lens_uses)` gives the lenses a seat reads (the membership's choice wins).

```typescript
import { isLens, resolveLens } from '@onlyworlds/sdk';

const lens = elements.find(isLens);
const r = resolveLens({ elements, members, now: 1200 }, lens, { rung: 'contributor', character: me }, { asOf: 1194 });
r.kept; r.rows; r.cut; // ids in order, rows as show makes them, e.g. { budget: 3, after_as_of: 1 }
if (r.unreadable) console.warn(`x_lens.${r.unreadable} is outside the profile's table`);
```

The world holds the elements as the owner is served them; the reader's `rung` (`owner`, `contributor`, `guest` with its `whole` and `known_of` ids, `public`) decides what it sees, and an owner reading `as` another reader keeps the owner's two counts (`anchor_not_visible`, `not_visible`), which no other reader ever carries. The profile: [`profiles/lens.md`](https://github.com/OnlyWorlds/schema-dist/blob/main/profiles/lens.md).

`worldGraph(world, reader, options)` reads the same snapshot, for the same reader, as nodes and edges: `nodes` (`{ id, type, name, family, icon }`, by id), `edges` (`{ source, field, target, index }`, one per link, by source, field and index), `edgesCut` (links to elements that are not nodes, by reason) and `cut`. Room elements, hidden and proposed ones and map space are out unless `rooms`, `hidden`, `proposed` or `mapSpace` brings them back (`hidden` and `proposed` are the owner's alone, and a public reader takes no flag); with `{ lens }` the nodes are exactly what the lens kept.

```typescript
import { worldGraph } from '@onlyworlds/sdk';

const g = worldGraph({ elements }, { rung: 'owner' }, { rooms: true });
g.nodes; g.edges; g.edgesCut; // e.g. { map_space: 2, hidden: 1 }
```

### A world's own words for the types

A world may carry `x_names` on the World: its own word for a type (Character shown as *Employee* in a work world), and a finer word for a supertype inside one. `typeWord(world, type, { supertype, many })` returns that word, or `null` for the standard's name. `world` is a `getWorld()` body (keel serves `x_` keys on the World) or a folder's `world.json`. The API, the folder, the schema and every id keep the standard's names; the word is for display only.

```typescript
import { typeWord } from '@onlyworlds/sdk';

const world = await client.getWorld();
const heading = typeWord(world, 'character', { many: true }) ?? 'Characters';
const label = typeWord(world, el.type, { supertype: el.supertype }) ?? el.type;
```

The word is printed as written, never re-cased; folder names are never translated. The profile: [`profiles/names.md`](https://github.com/OnlyWorlds/schema-dist/blob/main/profiles/names.md) in the schema distribution, with its 23-case fixture, which is this function's test.

### Addresses

An element has one address in three spellings: the site's `https://www.onlyworlds.com/w/<world id>/<type>/<id>`, `ow://<type>/<id>` inside a world, and `ow://<world id>/<type>/<id>` across worlds. A world by itself is `https://www.onlyworlds.com/w/<world id>` or `ow://<world id>`. Any of them may carry a moment, `@<step>` on the world's time line, and a lens, `?lens=<id>`.

```typescript
import { elementAddress, parseOwLink, OwAddressError } from '@onlyworlds/sdk';

const link = elementAddress({ form: 'human', world: worldId, type: 'character', id: el.id });
const r = parseOwLink(text); // { form, world, worldIsSlug, type, id, lens, moment, canonical }
// a refusal throws OwAddressError: err.reason is the profile's name ('bad_id', 'uppercase', ...)
```

A field that holds an address is text: never fetch or resolve it on the server, and show one wording ("private or missing") for a world you cannot read and an element that is not there. `parseOwLink` reads one string whole; finding a link inside other text is yours. The profile: [`profiles/address.md`](https://github.com/OnlyWorlds/schema-dist/blob/main/profiles/address.md), with its 133-case fixture, which is these functions' test.

## Tokens

The account's token rating, which some OnlyWorlds tools use. `getStatus()` and `getEncryptionInfo()` are what keel still serves under `/tokens/`; `consume()`, `getAccessKey()` and the two session revokes are deprecated (keel answers 404) and leave in 5.0. To read the token rating, prefer `account.allowance()` above.

```typescript
import { TokenResource } from '@onlyworlds/sdk';
const tokens = new TokenResource(writer);
const status = await tokens.getStatus();
```

## SDK or MCP

Use this SDK for known operations in your own code (CRUD, sync, bulk). To let an AI assistant that speaks MCP (the Model Context Protocol) explore a world in a chat, connect it to `https://www.onlyworlds.com/mcp` with the same key and PIN as `API-Key` and `API-Pin` headers.

## Version 3 and the old API

4.x speaks the current (v2) API only. The v1 client (`OnlyWorldsClient`) and CommonJS `require()` stay on 3.x, which remains published and supported: see [the migration guide](docs/migrating-3-to-4.md).

## Links

[Docs](https://onlyworlds.github.io/docs/development/typescript) · [Games](https://onlyworlds.github.io/docs/development/games) · [API reference](https://www.onlyworlds.com/api/docs) · [Issues](https://github.com/OnlyWorlds/sdk/issues) · [Changelog](CHANGELOG.md)

## Licence and contributions

The code is MIT (`LICENSE`). Issues are welcome: a bug, a wrong word, a thing you could not do. Pull requests are read; a small fix is usually taken as is, and a change to what the package does is better opened as an issue first, since it may already be built or ruled out. A reply can take a few days. A vulnerability goes privately, never in an issue: `SECURITY.md`. What we ask at the door, and what you can expect: [the code of conduct](https://github.com/OnlyWorlds/OnlyWorlds/blob/main/CODE_OF_CONDUCT.md).

Maintained by Kael, an AI agent working for Titus. Issues and pull requests are read and answered here.
