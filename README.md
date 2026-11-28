# OnlyWorlds TypeScript SDK

[![npm version](https://badge.fury.io/js/@onlyworlds%2Fsdk.svg)](https://www.npmjs.com/package/@onlyworlds/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OnlyWorlds is an open standard for worldbuilding data: 22 element types (characters, locations, events, laws and the rest) that any tool can read and write. This is a typed client for its API, with the schema's constants (element types, icons, colour groups, field metadata) generated from the published [schema distribution](https://github.com/OnlyWorlds/schema-dist). It runs in Node 18+ and in the browser through a bundler (ESM only).

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

Create a world at [onlyworlds.com](https://www.onlyworlds.com); its keys are on its world page. A new key is shown once, so copy it then.

- An `ow_r_` key reads, with no PIN. It is the key to give to players or a public site.
- An `ow_w_` key reads and writes. Writes also send a PIN as `apiPin`.
- Anyone who loads a web page can read the keys in its code. Ship only an `ow_r_` key to a browser, and keep write keys and seat secrets on a server.
- For code that writes, give it its own [AI seat](https://onlyworlds.github.io/docs/development/agents), a key for one tool or script. The seat's key and its `ow_s_` secret (sent as `apiPin`) work in one world, and you can remove them without touching your account PIN.

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

The rest of the package is below, one line each, with a link to the page that holds it in full. Every method, with the route it calls and what it returns, is in the [reference](https://onlyworlds.github.io/docs/development/typescript#reference).

## Writing safely

- **Bulk writes.** `writer.bulk(items, { idempotencyKey })` answers 200 even when some items fail, so check `res.errors` and each slot's `status`; `{ atomic: true }` makes the batch all or nothing. [Bulk writes](https://onlyworlds.github.io/docs/development/typescript#bulk-writes)
- **Only if unchanged.** Pass the `change_seq` you read as `ifMatch` to `patch`, `editLinks` or `delete`: if someone changed the element since, nothing is written and `OwPreconditionFailedError` carries it as `current`. The server never merges, so send again or ask the user which to keep. [Only if unchanged](https://onlyworlds.github.io/docs/development/api/writes#only-if-unchanged)
- **Errors.** Every non-2xx answer throws `OwApiError` (`status`, `code`, `param` and `docUrl`, which is worth showing your users), and a transport failure throws `OwNetworkError`. [Errors](https://onlyworlds.github.io/docs/development/typescript#errors)

## Images and files

```typescript
const image = await writer.uploadImage(file); // a Blob, File, ArrayBuffer or Uint8Array
await writer.patch('character', id, { image_url: image.url });
```

- **Images.** `uploadImage` takes webp, png, jpeg or avif up to 15 MB and sends it straight to the upload host, which never sees your key; in a browser, `preparePhoto(file)` shrinks a phone photo first. [Images](https://onlyworlds.github.io/docs/development/typescript#images)
- **Removing an image.** `writer.removeImage(image.url)` works for the image's uploader or the world's owner; the elements that show it keep their `image_url` until you clear it. [Removing an image](https://onlyworlds.github.io/docs/development/api/images#removing-an-image)
- **Files on elements.** `uploadFile(type, id, file, { label, name, onProgress })` attaches a File, Blob, ArrayBuffer or Uint8Array (a pdf, a text file, an image or a world bundle) beside `listFiles`, `fileDownloadLink`, `removeFile` and `worldFiles`. Its refusals read as `err.isFileTooLarge`, `err.isFilesFull` and `err.isQuotaExceeded`. [Files](https://onlyworlds.github.io/docs/development/api/files)

## Following a world

- **Sync.** Poll `client.changesHead()`, which reads no element, and walk `client.changesAll(cursor)` from your saved cursor (opaque, and it never expires) when `head` or `epoch` moved. Edits to the world itself are not in the feed: compare `getWorld()`'s `updated_at`. [Follow changes](https://onlyworlds.github.io/docs/development/typescript#follow-changes)
- **The world's own settings.** `client.patchWorld(partial)` writes them and takes a `getWorld()` body back, leaving out the keys the API does not take; `origin` is sent as `source` and `producer`. [The world](https://onlyworlds.github.io/docs/development/api/writes#the-world)

## Accounts and sharing

- **Signing in.** `new OwV2Client().signInWithPassword({ email, password, tokenName })` turns an OnlyWorlds email (or username) and password into an `ow_a_` account token for the device; a refusal is an `OwSignInError` with a `reason`. [Sign in with a password](https://onlyworlds.github.io/docs/development/typescript-accounts#sign-in-with-a-password)
- **A world on the account.** The account token lists the account's worlds (`listAccountWorlds()`), mints keys (`mintWorldKey`) and makes a world with its one write key (`createAccountWorld`, the key shown once); an account's first world sends `pin`, which becomes the account PIN. [A world on the account](https://onlyworlds.github.io/docs/development/typescript-accounts#a-world-on-the-account)
- **Invite links.** The owner makes, lists and revokes links with the account token (`createWorldLink`, `listWorldLinks`, `revokeWorldLink`); the invited person previews the code with `previewJoin` and accepts it with `acceptJoin`. [Invite links](https://onlyworlds.github.io/docs/development/typescript-accounts#invite-links)
- **Who is in a world.** `client.me()` says who a key is (its `membership` is what `created_by` holds on what it creates, and `reading_aids.charter` is the house rules, to read first), and `client.members()` lists the roster, the owner's row with id `null`. [Who is in a world](https://onlyworlds.github.io/docs/development/typescript-accounts#who-is-in-a-world)
- **Proposals.** A member can `propose` a change for the owner or a co-builder to accept or decline from `worldProposals()`. Under the world's switch an AI seat's edit throws `OwProposedError` (202) instead of writing; a person's key is never held. [Proposed changes](https://onlyworlds.github.io/docs/development/typescript-accounts#proposed-changes)

## Finding and asking

- **Search.** `client.search(q, { limit })` finds the elements whose name or text holds every word of `q` as a whole word (`APP-142` is two words). There are no pages: `truncated` means more matched than `limit` (at most 200). [Search](https://onlyworlds.github.io/docs/development/api/reads#search)
- **Lookup in memory.** With a world's elements in hand, `buildWorldIndex(elements)` and `lookupWorld(index, question)` find the ones a plain question is about, with no model and no network; `renderElement` writes a short text card. [Find elements in a world](https://onlyworlds.github.io/docs/development/typescript-readers#find-elements-in-a-world)
- **Ask and sort.** A signed-in account can have the OnlyWorlds AI proxy answer from the elements you found (`buildAskContext`, then `account.ai('ask', …)`), or sort loose notes into rows for the user to review (`account.ai('sort', …)`). Proposed, hidden and room elements stay out unless you ask. [Find elements in a world](https://onlyworlds.github.io/docs/development/typescript-readers#find-elements-in-a-world)
- **The token rating.** Asking and sorting spend the account's daily token rating, the same meter the Council uses; `account.allowance()` reads it without spending anything, and `aiUses()` lists the uses the proxy runs. [Ask your world](https://onlyworlds.github.io/docs/development/ai#ask-your-world-without-a-key-of-your-own)
- **A Character's context as text.** `draughtText(await client.draught(characterId))` gives one Character's context packet as plain text for a prompt, the same bytes as the Python package's `draught_text`. [As text](https://onlyworlds.github.io/docs/development/api/draught#as-text)

## World files and folders

- **World files.** `readWorldFile(bytes)` opens an `.owworld` file (a zip of a world folder) in the browser or in Node, and refuses an unsafe file before returning anything, with `err.reason` on an `OwWorldFileError`. `writeWorldFile(files, topDir)` gives the same bytes for the same files; neither carries the world's `api` key. [World files](https://onlyworlds.github.io/docs/development/typescript#world-files)
- **What a world file leaves out.** By default the writer leaves out author fields and private records and keeps hidden elements: pass `includeHidden: false` for a share, `includeAuthorFields: true` or `includePrivateRecords: true` for your own archive. [Writing a world file](https://onlyworlds.github.io/docs/development/typescript#writing-a-world-file)
- **A folder as the source.** `folderFetch(entries)` from `@onlyworlds/sdk/folder` lets the same client read a world folder or a world file, with no account and no key. [A world folder as the source](https://onlyworlds.github.io/docs/development/typescript#a-world-folder-as-the-source)
- **The MCP tools on a folder.** `folderMcpTools` from `@onlyworlds/sdk/mcp` answers the MCP server's read tools from a world folder, for your own MCP server to carry. [The MCP tools on a world folder](https://onlyworlds.github.io/docs/development/typescript#the-mcp-tools-on-a-world-folder)
- **A Kanka export.** `convertKanka(bytes)` from `@onlyworlds/sdk/convert` turns a Kanka JSON export into a world folder's files and a report, in memory, the same folder as the Python package's Kanka import. [Kanka](https://onlyworlds.github.io/docs/development/python-import#kanka)
- **A world as a folder.** `worldFolderFiles(world, elements)` from `@onlyworlds/sdk/convert` writes a world you hold as plain objects (its record, and a list of element bodies per type) as a world folder's files, in memory, the same bytes as the Python package's `write_folder`; `writeWorldFile` packs them into a world file.

## Reading worlds as a tool

These readers take a world you have read, as its viewer is served it, and give back what a tool shows.

- **World calendars.** `worldCalendars`, `resolveCalendar`, `formatStep` and `parseDate` read the calendars Atlas keeps in an element's `atlas_calendar` (read it, never write it); with no calendar, show the bare number. `@onlyworlds/sdk/calendar` loads in a page with no build step. [World calendars](https://onlyworlds.github.io/docs/development/typescript-readers#world-calendars)
- **The room.** `isRoomElement(el)` is true for an element of a world's chat room (one of the `ROOM_PAIRS`, marked `x_room_of`); a lore view leaves those out unless the person asks. [Schema constants](https://onlyworlds.github.io/docs/development/typescript#schema-constants)
- **Reading aids.** `charterOf(world, reader)` reads a world's charter (its house rules), guide and domains as one reader sees them, the packet `me()` serves as `reading_aids`. [Reading aids](https://onlyworlds.github.io/docs/development/typescript-readers#reading-aids)
- **Messages.** `isMessage`, `senderStatus`, `readMarkOf`, `unreadFor` and `threadOf` read a world's messages (Narratives with supertype `Message`). A sender is a claim until the server's `created_by` proves it. [Messages](https://onlyworlds.github.io/docs/development/typescript-readers#messages)
- **Lenses.** `resolveLens(world, lens, reader)` reads a world through a saved lens (a Construct with supertype `Lens`) for one reader, and returns the kept ids and what was cut. [Lenses](https://onlyworlds.github.io/docs/development/typescript-readers#lenses)
- **A world as a graph.** `worldGraph(world, reader, options)` gives one reader's nodes and edges, with room, hidden and proposed elements, map space and reading aids left out unless an option brings them back. [A world as a graph](https://onlyworlds.github.io/docs/development/typescript-readers#a-world-as-a-graph)
- **A world's own words for the types.** `typeWord(world, type, { supertype, many })` gives the word a world prints for a type (*Employee* for Character in a work world), or `null` for the standard's name. [Schema constants](https://onlyworlds.github.io/docs/development/typescript#schema-constants)
- **Addresses.** `parseOwLink(text)` reads an element's address in any of its three spellings and `elementAddress` writes one; `findOwLinks` finds every address in a text. [Addresses](https://onlyworlds.github.io/docs/development/typescript-readers#addresses)
- **Names in prose.** `nameFinder(elements, { case })` finds a world's element names in any text, whole names only, and never writes. [Names in prose](https://onlyworlds.github.io/docs/development/typescript-readers#names-in-prose)
- **Open with.** `openersFor(TOOLS, kind, address, surface)` gives the rows of an Open with menu: the site first, then each listed tool, each with the words it shows when it cannot open now. [Open with](https://onlyworlds.github.io/docs/development/typescript-readers#open-with)
- **The Waymark.** `mountWaymark` from `@onlyworlds/sdk/waymark`, with `waymark.css`, draws that menu beside a name on a web page. `npm run demo` in this repository serves a demo page. [The Open with menu, drawn](https://onlyworlds.github.io/docs/development/typescript-readers#the-open-with-menu-drawn)
- **More readers.** Landing, map space, layouts, records, report threads, work items and proposed elements are on the same page. [Reading worlds as a tool](https://onlyworlds.github.io/docs/development/typescript-readers)

## More

- **Schema constants.** `ELEMENT_TYPES`, `ELEMENT_ICONS`, `FIELD_SCHEMA`, `elementColor`, `dragField` and the rest come from the schema distribution; show a type's colour with its icon and label, never alone. `SCHEMA.md` in the package describes every field, and AI agents should read `AGENTS.md` first. [Schema constants](https://onlyworlds.github.io/docs/development/typescript#schema-constants)
- **Hidden elements.** The world's owner and co-builders can `hide(type, id)` an element and `unhide` it; only they and its creator still see it. [Hidden elements](https://onlyworlds.github.io/docs/development/typescript#hidden-elements)
- **Tokens.** `TokenResource` keeps `getStatus()` and `getEncryptionInfo()`; its `consume()`, `getAccessKey()` and two session revokes are deprecated and leave in 5.0. [Deprecated names](https://onlyworlds.github.io/docs/development/typescript#deprecated-names)
- **SDK or MCP.** Use this SDK for known operations in your own code. To let an AI assistant that speaks MCP (the Model Context Protocol) explore a world in a chat, connect it to `https://www.onlyworlds.com/mcp` with the same key and PIN as `API-Key` and `API-Pin` headers. [SDK or MCP?](https://onlyworlds.github.io/docs/development/typescript#sdk-or-mcp)
- **Version 3 and the old API.** 4.x speaks the current (v2) API only; the v1 client (`OnlyWorldsClient`) and CommonJS `require()` stay on 3.x, which remains published. [TypeScript SDK](https://onlyworlds.github.io/docs/development/typescript)

## Links

[Docs](https://onlyworlds.github.io/docs/development/typescript) · [Accounts, members and sharing](https://onlyworlds.github.io/docs/development/typescript-accounts) · [Reading worlds as a tool](https://onlyworlds.github.io/docs/development/typescript-readers) · [Games](https://onlyworlds.github.io/docs/development/games) · [API reference](https://www.onlyworlds.com/api/docs) · [Migrating from 3.x](docs/migrating-3-to-4.md) · [Issues](https://github.com/OnlyWorlds/sdk/issues) · [Changelog](https://github.com/OnlyWorlds/sdk/blob/main/CHANGELOG.md)

## Licence and contributions

The code is MIT (`LICENSE`). Issues are welcome: a bug, a wrong word, a thing you could not do. Pull requests are read; a small fix is usually taken as is, and a change to what the package does is better opened as an issue first, since it may already be built or ruled out. A reply can take a few days. A vulnerability goes privately, never in an issue: `SECURITY.md`. What we ask at the door, and what you can expect: [the code of conduct](https://github.com/OnlyWorlds/OnlyWorlds/blob/main/CODE_OF_CONDUCT.md).

Maintained by Kael, an AI agent working for Titus. Issues and pull requests are read and answered here.
