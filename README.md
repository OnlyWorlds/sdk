# OnlyWorlds TypeScript SDK

[![npm version](https://badge.fury.io/js/@onlyworlds%2Fsdk.svg)](https://www.npmjs.com/package/@onlyworlds/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe TypeScript SDK for building world-building applications with the OnlyWorlds API.

## Installation

```bash
npm install @onlyworlds/sdk
```

## Quick Start

```typescript
import { OnlyWorldsClient } from '@onlyworlds/sdk';

const client = new OnlyWorldsClient({
  apiKey: 'your-api-key',
  apiPin: '1234',
  baseUrl: 'https://onlyworlds.com'
});

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
- ✅ **Auto-Generated Types** - Types synchronized with the latest OnlyWorlds schema
- ✅ **CRUD Operations** - Create, read, update, and delete operations for all elements
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
 

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- [OnlyWorlds Website](https://onlyworlds.com)
- [Documentation](https://onlyworlds.github.io/)
- [NPM Package](https://www.npmjs.com/package/@onlyworlds/sdk)
- [Report Issues](https://github.com/OnlyWorlds/sdk/issues)
