# CLAUDE.md - OnlyWorlds TypeScript SDK

## Project Overview
545689
This is the **TypeScript SDK** for OnlyWorlds, an open-source framework for creating, storing, and exchanging structured world-building data.

### What is OnlyWorlds?

OnlyWorlds is a universal standard for defining digital worlds as portable, text-based data:
- **22 element types** for comprehensive world-building (Character, Location, Object, etc.)
- **RESTful API** with OpenAPI documentation
- **Data portability** - worlds work across different tools and applications
- **Free ecosystem** - Parse Tool, Map Tool, Browse Tool, Obsidian Plugin, Mobile Companion
- **AI integration** via MCP (Model Context Protocol)

Production site: [onlyworlds.com](https://onlyworlds.com)

### This Repository

The **OnlyWorlds TypeScript SDK** (`@onlyworlds/sdk`) provides:
- Type-safe TypeScript client for the OnlyWorlds API
- Full type definitions for all 22 element types
- CRUD operations for all elements
- Branded types for compile-time relationship safety
- Zero runtime overhead

**NPM Package**: `npm install @onlyworlds/sdk`

## Architecture

### Directory Structure
```
/sdk
├── src/
│   ├── index.ts       # Main exports
│   ├── types.ts       # Auto-generated element types
│   └── client.ts      # API client implementation
├── dist/              # Build output (gitignored)
├── package.json       # NPM package config
├── tsconfig.json      # TypeScript config
└── README.md          # User-facing documentation
```

### Type System

The SDK uses **branded types** for type-safe element relationships:

```typescript
// Prevents mixing up element IDs at compile time
type ElementId<T extends ElementType> = string & Brand<T>;

// Example: location field only accepts Location IDs
interface Character extends BaseElement {
  location?: ElementId<'Location'>;
  abilities?: ElementIds<'Ability'>;
}
```

### Auto-Generation

**IMPORTANT**: The type definitions in `src/types.ts` are **auto-generated** from the Django backend schema.

Source of truth: `django/ow/mcp/schemas/typed_schema.json` (in the main onlyworlds.com repo)

Do NOT manually edit `src/types.ts` - changes will be overwritten on next generation.

## Development

### Building
```bash
npm install
npm run build    # Outputs to dist/
npm run dev      # Watch mode
```

### Publishing
```bash
npm version patch|minor|major
npm publish
```

### Testing Changes Locally
```bash
# In this repo
npm run build

# In a test project
npm link @onlyworlds/sdk
```

## API Structure

The SDK client provides methods for all element types:

```typescript
const client = new OnlyWorldsClient({
  apiKey: 'your-api-key',
  apiPin: '1234',
  baseUrl: 'https://onlyworlds.com'
});

// Each element type has:
await client.character.list(options);      // GET /api/worldapi/character/
await client.character.get(id);            // GET /api/worldapi/character/{id}/
await client.character.create(data);       // POST /api/worldapi/character/
await client.character.update(id, data);   // PUT /api/worldapi/character/{id}/
await client.character.delete(id);         // DELETE /api/worldapi/character/{id}/
```

## Element Types

All 22 OnlyWorlds element types are supported:

**Core Elements**:
- Character, Location, Object, Creature, Species, Event

**Attributes & Abilities**:
- Ability, Trait, Title

**Groups & Structure**:
- Family, Institution, Collective, Construct

**World Systems**:
- Language, Law, Narrative, Phenomenon, Zone

**Mapping**:
- Map, Pin, Marker, Relation

### Base Fields
Every element inherits these base fields:
- `id` (UUIDv7)
- `name` (required)
- `description`
- `image_url`
- `supertype`, `subtype`
- `world` (reference to World)
- `created_at`, `updated_at`

### Relationships
- **Single link fields**: Append `_id` (e.g., `location_id`)
- **Multi link fields**: Append `_ids` (e.g., `abilities_ids`)
- All links use UUIDv7 string values

## Guidelines

### When Adding Features
- Match the OnlyWorlds API specification
- Maintain type safety with branded types
- Keep zero runtime overhead
- Update README.md with examples

### When Types Change
- DO NOT manually edit `src/types.ts`
- Types are auto-generated from Django schema
- Changes must be made in the main onlyworlds.com repo
- Re-run generation script to update SDK

### Code Style
- Use TypeScript strict mode
- Prefer interfaces over types for public API
- Document public methods with JSDoc
- Keep client.ts focused on API communication

## Links

- **Documentation**: https://onlyworlds.github.io/
- **Main Website**: https://onlyworlds.com
- **API Docs**: https://onlyworlds.com/api/docs
- **Main Repo**: https://github.com/OnlyWorlds/onlyworlds.com
- **NPM Package**: https://www.npmjs.com/package/@onlyworlds/sdk
- **Issues**: https://github.com/OnlyWorlds/sdk/issues

## Related Projects

- **OnlyWorlds/onlyworlds.com** - Django backend and API implementation
- **OnlyWorlds/OnlyWorlds** - Open-source framework and schema definitions
- **@onlyworlds/mcp-client** - MCP bridge for AI integration
- **onlyworlds-python** - Python SDK (planned)
