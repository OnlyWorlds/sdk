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

The SDK asks the API for a single-use ticket, then sends the bytes straight to the upload host, which never sees your key. webp, png, jpeg or avif (no SVG or gif), up to 15 MB. Each upload counts toward the world's daily limit and the account's storage. To upload yourself (for a progress bar), call `createMediaTicket()` and POST the bytes to its `upload_url` with `Authorization: Bearer <ticket>`.

## Sync

```typescript
let cursor; // opaque and never expires: keep it
for await (const change of client.changesAll(cursor)) {
  // changes arrive in order; apply them in order and you converge
}
```

Edits to the world itself (its name, calendar, `public_read`) don't appear in the change feed. Read `client.getWorld()` and compare `updated_at`.

## Errors

Every non-2xx response throws `OwApiError` with the API's envelope: `.status`, `.type`, `.code`, `.param` (the field that failed) and `.docUrl`, which is worth showing to your users. A transport failure throws `OwNetworkError`. `err.isValidationError` covers the common case.

## Schema constants

```typescript
import {
  ELEMENT_TYPES,    // the 22 type slugs (and the ElementType union)
  ELEMENT_ICONS,    // a Material Symbols icon per type
  ELEMENT_LABELS,   // plural display labels
  ELEMENT_SECTIONS, // field grouping and display order
  FIELD_SCHEMA,     // per-field type and link target
  elementColor,     // colour by family; the icon carries the type
} from '@onlyworlds/sdk';

elementColor('character', 'dark'); // '#3987e5'
```

The four colour families (agents, world, abstract, temporal) are checked for colour-blind separation. Show colour with the icon and label, never alone. [SCHEMA.md](SCHEMA.md) (generated, in the package) describes every field; AI agents should read [AGENTS.md](AGENTS.md) first.

## Tokens

The account's token allowance and ratings, which some OnlyWorlds tools use.

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

## License

MIT
