# OnlyWorlds TypeScript SDK

[![npm version](https://badge.fury.io/js/@onlyworlds%2Fsdk.svg)](https://www.npmjs.com/package/@onlyworlds/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The canonical typed client for the [OnlyWorlds](https://onlyworlds.github.io) v2 API, plus the
canonical constants (element types, icons, colour families, field schema) — generated from the
same schema source the server runs on.

**4.x is v2-native and ESM-only (Node 18+).** If you need the legacy v1 API dialect
(`OnlyWorldsClient`) or CommonJS `require()`, stay on 3.x — it remains published and the v1 API
remains served. See [docs/migrating-3-to-4.md](docs/migrating-3-to-4.md).

## Installation

```bash
npm install @onlyworlds/sdk
```

## Quick Start

```typescript
import { OwV2Client } from '@onlyworlds/sdk';

const client = new OwV2Client({ apiKey: 'ow_r_your_key' }); // read-only key: that's all you need
const page = await client.list('character');                 // { data, has_more, next_cursor }
```

Key kinds: `ow_w_` write / `ow_r_` read-only (no PIN — the "give this to your players" key) /
`ow_a_` account Bearer / 10-digit legacy. Writes on a PIN-protected world also pass `apiPin`.
Demo keys `0000000000`–`0000000009` read real sample worlds.

## The full round-trip

```typescript
const writer = new OwV2Client({ apiKey: 'ow_w_your_key', apiPin: '1234' });

// v2 dialect rules, worth internalizing once:
// - link fields use ONE bare name both directions (no _ids suffix — that's v1)
// - NEVER send a "world" field (identity comes from the key; the client strips it anyway)
const location = await writer.create('location', {
  name: 'Dragon Peak',
  description: 'A treacherous mountain peak where dragons nest',
}); // id minted client-side when omitted (retries stay idempotent)

const dragon = await writer.create('creature', {
  name: 'Vorrath the Ember-Scaled',
  location: location.id,            // single link: UUID (or null)
});

const fetched = await writer.get('creature', dragon.id);
// fetched.location === location.id — reads the way it writes

// PATCH is destructive on sent fields; arrays replace wholesale
await writer.patch('location', location.id, { supertype: 'Mountain' });

// For relationships, use the atomic link merge — returns the full updated element
const fireBreath = await writer.create('ability', { name: 'Ember Breath' });
await writer.editLinks('creature', dragon.id, 'abilities', { add: [fireBreath.id], remove: [] });

// Walk every page of a type
for await (const character of writer.listAll('character')) { /* ... */ }
```

## Bulk writes — always check `errors`

`/bulk` **succeeds partially by default** (HTTP 200 with per-slot statuses). The one mistake to
never make: treating a 200 as "everything landed."

```typescript
const res = await writer.bulk(
  [
    { type: 'character', element: { name: 'A' } },
    { type: 'event', element: { name: 'B' } },
  ],
  { idempotencyKey: crypto.randomUUID() }, // mint FRESH per attempt — a failed batch is
);                                          // cached under its key; never reuse across retries
if (res.errors) {
  for (const slot of res.items.filter((s) => s.status >= 400)) {
    console.warn(slot.error?.code, slot.error?.message, slot.error?.doc_url);
  }
}
// Pass { atomic: true } for all-or-nothing instead. res.wasReplay flags idempotent replays.
```

## Sync

```typescript
let cursor; // opaque, never expires; persist it
for await (const change of client.changesAll(cursor)) {
  // ops arrive in (change_seq, id) order — apply in order → convergence
}
// GOTCHA: world-meta edits (name, calendar, public_read) do NOT enter /changes.
// Poll client.getWorld() and compare updated_at separately.
```

## Errors

Every non-2xx throws `OwApiError` carrying the platform envelope: `.status`, `.type`, `.code`,
`.param` (the exact field that failed), and `.docUrl` — surface `docUrl` in your UX. Transport
failures throw `OwNetworkError`. `err.isValidationError` is the common branch.

## Canonical constants (all generated or test-gated from schema)

```typescript
import {
  ELEMENT_TYPES,        // the 22 slugs (and the ElementType union)
  ELEMENT_ICONS,        // Material Symbols icon per type
  ELEMENT_LABELS,       // plural display labels
  ELEMENT_SECTIONS,     // canonical field grouping + display order
  FIELD_SCHEMA,         // per-field type/target metadata
  elementColor,         // canonical colour: family carries COLOUR, icon carries TYPE
} from '@onlyworlds/sdk';

elementColor('character', 'dark'); // '#3987e5' — four CVD-validated families
// Always pair colour with icon + label; colour alone is not accessible.
```

The full schema with per-field meaning lives in [SCHEMA.md](SCHEMA.md) (generated, ships in this
package). AI agents: read [AGENTS.md](AGENTS.md) first.

## Token rating system

```typescript
import { TokenResource } from '@onlyworlds/sdk';
const tokens = new TokenResource(writer); // OwV2Client.request() satisfies TokenTransport
const status = await tokens.getStatus();
```

## AI access — when to use which

For **known, deterministic operations** (CRUD, sync, bulk) use this SDK — typed calls, no
tool-schema overhead. For **live exploration of a user's world from a chat/agent context**, use
the MCP server at `https://www.onlyworlds.com/mcp` (same `API-Key`/`API-Pin` headers, 11 tools;
unaffected by SDK versioning).

## License

MIT

## Links

- [OnlyWorlds](https://www.onlyworlds.com) · [Docs](https://onlyworlds.github.io) · [API reference](https://www.onlyworlds.com/api/docs)
- [Issues](https://github.com/OnlyWorlds/sdk/issues) · [CHANGELOG](CHANGELOG.md) · [Migration 3→4](docs/migrating-3-to-4.md)
