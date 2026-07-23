# Migrating @onlyworlds/sdk 3.x → 4.0

4.0 is **v2-native only**. If your tool still speaks the v1 API dialect through
`OnlyWorldsClient`, staying pinned on 3.x is a fully supported choice — 3.x remains on npm
permanently and the v1 API itself is served by the platform for years.

## If you only used the constants (most common)

`ELEMENT_ICONS`, `ELEMENT_LABELS`, `ELEMENT_SECTIONS`, `FIELD_SCHEMA`, `getElementIcon`,
`getElementLabel`, `ONLYWORLDS_VERSION` — **no import changes**. Same names, same shapes.
Two differences:
- Tables are keyed on the v2 slug union (`'character' | ...`). Runtime keys are identical
  strings to before (the v1 enum's values were already these slugs) — only TypeScript
  typing tightens. If you passed the v1 enum values around, they keep working as strings.
- `FIELD_SCHEMA`: `type: 'number'` is now `type: 'integer'` (70 entries). If you switch on
  `'number'`, switch on `'integer'`.

## If you used the v1 client (`OnlyWorldsClient`)

Move to `OwV2Client` — the v2 API is a cleaner contract (one-shape reads/writes, atomic
`editLinks`, `/bulk`, `/changes` sync). The README Quick Start has a schema-verified
round-trip. Key differences from v1 habits:
- Link fields use ONE bare name both directions — no `_ids` suffix anywhere.
- Never send a `"world"` field (the client strips it; the server would 422).
- `PATCH` is destructive on sent fields — use `editLinks` for relationships.
- `ElementType` at the root is now the v2 slug union; the 3.x alias `V2ElementType` is
  gone (rename imports; values unchanged).
- `parseEnvelope` is renamed `parseErrorEnvelope` (it parses the platform *error*
  envelope — renamed to avoid collision with the world-export envelope, a different
  artifact).

## If you used the token surface

`TokenResource` now takes any `{ request<T>(method, path, body?) }` transport instead of
the v1 client. Note the token routes' long-term wire status is under review; if you depend
on them, say so — that input decides whether the surface stays.

## Packaging

ESM-only (`"type": "module"`, sealed `exports` map). Every current bundler and Node >= 18
handles this natively. CJS consumers: stay on 3.x, migrate your project to ESM, or use the
async escape hatch from inside CJS:

```js
const { OwV2Client } = await import('@onlyworlds/sdk');
```

The MCP server (`www.onlyworlds.com/mcp`) is a separate product and is unaffected by SDK
versioning.
