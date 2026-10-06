# For AI agents using @onlyworlds/sdk

**Current as of**: SDK **4.x** · schema-dist **v0.30.1-dist.15** (canonical 00.30.01).
This line is asserted by `codegen:check` in CI — if the pin moves and this file is not
re-read against it, the check fails rather than letting this document rot quietly.

**Start with [SCHEMA.md](SCHEMA.md)** (in this package): the full generated schema reference —
every type, every field with its meaning, link directions, families, icons, display sections.
It is generated from the same canonical YAML as the types, so it cannot drift.

**What this package is**: the canonical typed TypeScript client for the OnlyWorlds v2 API,
plus the canonical constants (element types, icons, colour families, field schema).
OnlyWorlds is an open standard for portable world data — 22 element types, UUID-linked.

**Use the v2 surface.** `OwV2Client` + the `V2ElementType` slug union + the generated
interfaces in `types.generated.ts` (emitted from the canonical schema YAML, validated
against live data). The v1 surface (`OnlyWorldsClient`, the `ElementType` enum) is not in
4.x — it was removed at 4.0.0 and lives only in 3.x. Do not build new work on it.

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
  unknown unprefixed fields 422. Extensions are capped at **64 KB per element** (422,
  `param: extensions`).
- List filters: `name` (exact), `name__icontains`, `supertype`, `subtype`, and
  `characters=<id>` on types with a `characters` link. Any other filter key — and
  `?ordering=` — returns 422 naming the accepted ones. Sort client-side.
- Images: `uploadImage(bytes)` returns `{ url, ... }`; set `url` as `image_url`. The bytes go
  to the edge with a single-use ticket from keel, never with the API key.
- Ids: the client mints **UUIDv7** on an id-less `create` (since 4.2.0; keel mints v7 too).
  A v4 or v7 id you supply is accepted. **Never sort elements by id**: worlds mix v7, v4
  and legacy `06x…` ids (nibble 7 too, but seconds-first). For creation order use
  `created_at`; `change_seq` is last-write order, not creation.
  A create with an id that already exists, or a PUT whose id belongs to **another world**,
  returns 409 `id_conflict` (`err.isIdConflict`; retrying won't help). `/bulk` never throws:
  check each slot for `status: 409` with `error.code: 'id_conflict'`. A different 409, `idempotency_error`, means an
  Idempotency-Key was reused with another body (`err.isIdempotencyConflict`).
- Under load keel answers 503 `server_busy` with `Retry-After` (`err.isBusy`, `err.retryAfter`
  in seconds). The client does not retry for you; back off and retry yourself. Works the same
  in browsers.
- `created_by` rides every element read: the id of the membership that created it, `null` for
  the world's owner and for anything made before memberships existed. It is read-only; a write
  body that carries it has it dropped, never an error. A **contributor** can change only what
  they created: anything else is 403 `not_author` (`err.isNotAuthor`; retrying will not help).
  `/bulk` reports it per slot, not as a throw.
- A string holding an unpaired surrogate (text cut mid-emoji) is a 422 naming the field.
  Slice strings by code point, not by UTF-16 unit.
- Colour carries the element's FAMILY (`elementColor(type, mode)`); the icon
  (`ELEMENT_ICONS`) carries the TYPE. Icon + label are required alongside colour, not optional.

**Auth**: prefixed keys — `ow_w_` (read+write), `ow_r_` (read-only, no PIN — the share
primitive), `ow_a_` (account Bearer). Demo keys `0000000000`–`0000000009` are read-only
test credentials against real data.
