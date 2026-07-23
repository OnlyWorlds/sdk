# For AI agents using @onlyworlds/sdk

**What this package is**: the canonical typed TypeScript client for the OnlyWorlds v2 API,
plus the canonical constants (element types, icons, colour families, field schema).
OnlyWorlds is an open standard for portable world data — 22 element types, UUID-linked.

**Use the v2 surface.** `OwV2Client` + the `V2ElementType` slug union + the generated
interfaces in `types.generated.ts` (emitted from the canonical schema YAML, validated
against live data). The v1 surface (`OnlyWorldsClient`, the `ElementType` enum) is frozen
legacy — do not build new work on it.

**SDK vs MCP server — pick correctly**:
- Known, deterministic operations (CRUD, sync, bulk) → **this SDK**. Typed calls, typed
  responses, far cheaper than tool-schema reasoning.
- Live exploration of a user's world from a chat/agent context → the **MCP server** at
  `https://www.onlyworlds.com/mcp` (same `API-Key`/`API-Pin` headers, 11 tools).

**Wire facts that bite** (full details in README):
- Never send a `"world"` field in payloads — world identity comes from the API key (422 otherwise).
- v2 link fields use ONE name both directions (no `_ids` suffix — that is v1 dialect only).
- PATCH is destructive on sent fields; use `editLinks` (atomic add/remove) for relationships.
- World-meta changes do NOT appear in `/changes` — poll `GET /world` separately.
- Extension fields: `x_<toolname>_*` is the sanctioned namespace for tool-specific state;
  unknown unprefixed fields 422.
- Colour carries the element's FAMILY (`elementColor(type, mode)`); the icon
  (`ELEMENT_ICONS`) carries the TYPE. Icon + label are required alongside colour, not optional.

**Auth**: prefixed keys — `ow_w_` (read+write), `ow_r_` (read-only, no PIN — the share
primitive), `ow_a_` (account Bearer). Demo keys `0000000000`–`0000000009` are read-only
test credentials against real data.
