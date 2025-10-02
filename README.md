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

// Fetch characters
const characters = await client.character.list();

// Create a new location
const location = await client.location.create({
  name: 'Dragon Peak',
  description: 'A treacherous mountain peak where dragons nest',
  supertype: 'mountain',
  climate: 'cold'
});

// Get a specific element
const character = await client.character.get('element-id');

// Update an element
await client.character.update('element-id', {
  name: 'Updated Name'
});

// Delete an element
await client.character.delete('element-id');
```

## Features

- ✅ **Full Type Safety** - Complete TypeScript definitions for all 22 OnlyWorlds element types
- ✅ **Auto-Generated Types** - Types synchronized with the latest OnlyWorlds schema
- ✅ **CRUD Operations** - Create, read, update, and delete operations for all elements
- ✅ **Branded Types** - Compile-time safety for element relationships
- ✅ **Zero Runtime Overhead** - Type system has no runtime cost
- ✅ **Modern ESM/CJS** - Supports both ES modules and CommonJS

   

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
