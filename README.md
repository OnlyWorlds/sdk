# OnlyWorlds TypeScript SDK

[![npm version](https://badge.fury.io/js/@onlyworlds%2Fsdk.svg)](https://www.npmjs.com/package/@onlyworlds/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe TypeScript SDK for building world-building applications with the OnlyWorlds API.

The SDK speaks two dialects of the same API:

- **v2 (`OwV2Client`)** -- the current, recommended default. Local-first shape: one-shape read/write (no `_ids` suffix), an opaque `/changes` sync feed, atomic bulk writes, and client-side UUID minting for safe retries. Base URL `https://www.onlyworlds.com/api/v2`.
- **v1 (`OnlyWorldsClient`)** -- the original resource-style client. Fully served forever; kept below as the legacy section. Existing 2.x code keeps working unchanged -- v2 is purely additive.

## Installation

```bash
npm install @onlyworlds/sdk
```

## Quick Start (v2 -- recommended)

```typescript
import { OwV2Client } from '@onlyworlds/sdk';

const client = new OwV2Client({
  apiKey: 'ow_w_your_world_key', // ow_w_ write / ow_r_ read / ow_a_ account / 10-digit legacy
  apiPin: '1234',                // needed for writes on a PIN-protected world
});
// baseUrl defaults to https://www.onlyworlds.com/api/v2

// Read a page, or walk every page of a type
const page = await client.list('character');           // { data, has_more, next_cursor }
for await (const character of client.listAll('character')) {
  // ...
}

// A worked round-trip: two elements, linked, read back. Byte-true v2 dialect:
// link fields use ONE bare name both directions (no _ids suffix — that's v1),
// and you NEVER send a "world" field (identity comes from the key; sending it 422s).
const location = await client.create('location', {
  name: 'Dragon Peak',
  description: 'A treacherous mountain peak where dragons nest',
}); // id minted client-side when omitted (retries stay idempotent)

const dragon = await client.create('creature', {
  name: 'Vorrath the Ember-Scaled',
  location: location.id,            // single link: UUID (or null)
});

const fetched = await client.get('creature', dragon.id);
// fetched.location === location.id — reads the way it writes

// Partial update (PATCH is destructive on sent fields; arrays replace wholesale)
await client.patch('location', location.id, { supertype: 'Mountain' });

// For relationships, prefer the atomic link merge -- returns the full updated element
const fireBreath = await client.create('ability', { name: 'Ember Breath' });
await client.editLinks('creature', dragon.id, 'abilities', { add: [fireBreath.id], remove: [] });

// Bulk write (up to ~1000; partial success by default, atomic:true for all-or-nothing)
const res = await client.bulk([
  { type: 'character', element: { name: 'A' } },
  { type: 'event', element: { name: 'B' } },
]);
// res.items[i].status is the per-slot HTTP status; res.errors flags any failure

// Sync: walk the opaque change feed and persist the final cursor
let cursor;
for await (const change of client.changesAll(cursor)) {
  // apply change in order
}
```

### Canonical element colours

```typescript
import { elementColor, ELEMENT_FAMILIES, FAMILY_COLORS } from '@onlyworlds/sdk';

elementColor('character', 'dark');  // '#3987e5' — colour carries the FAMILY
// (agents / world / abstract / temporal); ELEMENT_ICONS carries the TYPE.
// CVD-validated: always pair colour with icon + label, never colour alone.
```

### AI-assistant access (MCP) — and when to use which

An MCP server exists at `https://www.onlyworlds.com/mcp` for AI assistants (Claude and other MCP clients) to read and write worlds directly -- no SDK code required. See the [docs](https://onlyworlds.github.io) for setup.

Division of labor: for **known, deterministic operations** (CRUD, sync, bulk) use this SDK — typed calls, no tool-schema overhead. For **live exploration of a user's world from a chat/agent context**, use the MCP server. Agents: see `AGENTS.md` in this package.

## Legacy: v1 client (`OnlyWorldsClient`)

The v1 resource-style client remains fully supported and served forever. Prefer `OwV2Client` for new code.

```typescript
import { OnlyWorldsClient } from '@onlyworlds/sdk';

const client = new OnlyWorldsClient({
  apiKey: 'your-api-key',
  apiPin: '1234'
});
// baseUrl defaults to https://www.onlyworlds.com/api/worldapi — only override it
// when pointing at a different host (it must include the full API path)

// Get your world (API keys are world-scoped)
const world = await client.worlds.get();

// Fetch characters (paginated)
const characters = await client.characters.list();

// Create a new location
const location = await client.locations.create({
  name: 'Dragon Peak',
  description: 'A treacherous mountain peak where dragons nest',
  supertype: 'mountain'
});

// Get a specific element
const character = await client.characters.get('element-id');

// Update an element
await client.characters.update('element-id', {
  name: 'Updated Name'
});

// Delete an element
await client.characters.delete('element-id');
```

## Features

- ✅ **Full Type Safety** - Complete TypeScript definitions for all 22 OnlyWorlds element types
- ✅ **Schema-Aligned Types** - Type definitions track the OnlyWorlds schema
- ✅ **CRUD Operations** - Create, read, update, and delete operations for all elements
- ✅ **Token Management** - Built-in support for OnlyWorlds token rating system
- ✅ **Branded Types** - Compile-time safety for element relationships
- ✅ **Zero Runtime Overhead** - Type system has no runtime cost
- ✅ **Modern ESM/CJS** - Supports both ES modules and CommonJS

## API Reference

### World Endpoint

The `worlds` resource is special because API keys are world-scoped (one key = one world). The endpoint returns a single `World` object directly, not a paginated list.

```typescript
// Get your world
const world = await client.worlds.get();

// Update your world
const updated = await client.worlds.update({
  description: 'A dark fantasy realm'
});
```

**Note**: The `worlds` resource only has `get()` and `update()` methods (no `list()`, `create()`, or `delete()`) because API keys are world-scoped.

### Element Endpoints

All other element types return paginated results:

```typescript
// List with pagination
const response = await client.characters.list({
  limit: 10,
  offset: 0,
  ordering: '-created_at',
  search: 'dragon'
});

console.log(response.count);      // Total count
console.log(response.results);    // Array of Characters
console.log(response.next);       // URL for next page
console.log(response.previous);   // URL for previous page
```

## Type-Safe Relationships

```typescript
import { ElementId, Character, Location } from '@onlyworlds/sdk';

// Branded types ensure you can't mix up element IDs
const locationId: ElementId<'Location'> = 'some-location-id';
const character: Character = {
  name: 'Aragorn',
  location: locationId  // Type-safe!
};
```

## Token Management

OnlyWorlds provides a token rating system for tracking API usage and enabling AI-powered features. Users get a daily token allowance (default: 10,000 tokens) that resets every day.

### Working Reference Implementation

See [base-tool/src/llm/token-service.ts](https://github.com/OnlyWorlds/base-tool) for the complete working implementation that this SDK enables.

### Check Token Status

```typescript
// Get current token status
const status = await client.tokens.getStatus();

console.log(`Available: ${status.tokens_available_today}/${status.token_rating}`);
console.log(`Used today: ${status.tokens_used_today}`);
console.log(`Active sessions: ${status.sessions_active}`);
console.log(`Last reset: ${status.last_reset}`);
```

### Consume Tokens

Report token consumption when your tool uses AI features or other token-tracked services:

```typescript
// Report token usage
const result = await client.tokens.consume({
  amount: 500,
  service: 'my_worldbuilding_tool',
  metadata: {
    feature: 'character_generation',
    model: 'gpt-4',
    prompt_tokens: 300,
    completion_tokens: 200
  }
});

// Check if consumption succeeded
if (result.error) {
  console.warn('Token warning:', result.error);
}

console.log(`Consumed ${result.tokens_consumed} tokens`);
console.log(`${result.tokens_remaining} tokens remaining`);
```

**Important**: The API allows consumption even when exceeding available tokens (tracks as debt), but returns a warning in the `error` field.

### Advanced: Encrypted API Key Access

For tools that need direct OpenAI API access using OnlyWorlds tokens:

```typescript
// Get encrypted OpenAI key (requires 100+ tokens)
const access = await client.tokens.getAccessKey();

console.log('Session ID:', access.session_id);
console.log('Expires:', access.expires_at);
console.log('Available tokens:', access.tokens_available);

// Decrypt the key client-side (see base-tool for full implementation)
// 1. Derive decryption key from world ID using SHA-256
// 2. Use 'fernet' npm package to decrypt
// 3. Use decrypted OpenAI key for direct API calls
// 4. Report usage with session_id

// See base-tool/src/llm/token-service.ts:99-235 for complete example
```

**Full decryption implementation** (based on base-tool):

```typescript
import { fernet } from 'fernet';

// Derive decryption key from world ID
async function deriveKey(worldId: string): Promise<string> {
  const salt = 'onlyworlds-token-api-2024-public-salt';
  const keyMaterial = `${worldId}:${salt}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(keyMaterial);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_');
}

// Decrypt the API key
async function decryptApiKey(encryptedKey: string, worldId: string): Promise<string> {
  const derivedKey = await deriveKey(worldId);
  const secret = new fernet.Secret(derivedKey);
  const token = new fernet.Token({
    secret: secret,
    token: encryptedKey,
    ttl: 0  // Don't enforce TTL client-side
  });
  return token.decode();
}

// Usage
const world = await client.worlds.get();
const access = await client.tokens.getAccessKey();
const apiKey = await decryptApiKey(access.encrypted_key, world.id);

// Use apiKey for OpenAI API calls, then report usage:
await client.tokens.consume({
  amount: tokensUsed,
  sessionId: access.session_id,
  service: 'direct_openai',
  metadata: { model: 'gpt-4', /* ... */ }
});
```

### Session Management

```typescript
// Revoke a specific session
await client.tokens.revokeSession(sessionId);

// Revoke all sessions (emergency cleanup)
const result = await client.tokens.revokeAllSessions();
console.log(`Revoked ${result.sessions_revoked} sessions`);
```

### Encryption Info

Get public encryption details (no auth required):

```typescript
const info = await client.tokens.getEncryptionInfo();
console.log('Algorithm:', info.algorithm);
console.log('Key derivation:', info.key_derivation);
console.log('Public salt:', info.salt);
console.log(info.javascript_example);
```

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- [OnlyWorlds Website](https://onlyworlds.com)
- [Documentation](https://onlyworlds.github.io/)
- [NPM Package](https://www.npmjs.com/package/@onlyworlds/sdk)
- [Report Issues](https://github.com/OnlyWorlds/sdk/issues)
