# Changelog

All notable changes to `@onlyworlds/sdk`. Maintained from 3.1.0 onward (Kael, Assembly);
earlier history lives in git log only.

## [Unreleased]

### Changed
- **`SCHEMA.md` now opens with its own provenance** (dist tag, canonical version, publish
  date — rendered from `schema-pin.json`, never the wall clock). It ships in the tarball
  and is read cold by agents outside this repo, where the pin file is not present; a
  generated reference that cannot name its source was the one remaining self-dating gap.
- **`AGENTS.md` carries a "Current as of" line, asserted by `codegen:check`** — the tag it
  names must match the pin or CI fails. A hand-maintained agent doc with an ungated date
  is how this repo's previous agent doc went a major version stale. Gate watched firing
  (tampered tag → exit 1, restored → 0).

## [4.1.0] — 2026-07-29

Public-surface hygiene. Nothing breaks; one member is now marked for removal, and one
piece of long-standing speculation is retired by measurement.

⚑ **4.0.2 was tagged in git and superseded before it reached npm.** Everything in it ships
here — the tag stays as a record rather than being moved or deleted.

### Deprecated
- **`FieldType.integer_max` and `FieldInfo.max`** — removal scheduled for **5.0.0**. No
  `FIELD_SCHEMA` entry has ever carried either, in this repository's entire history. They
  existed to surface the schema's `maximum:` constraint, and that constraint is **advisory**:
  keel declares no `MaxValueValidator`, and a `charisma: 9999` write against a `maximum: 100`
  field returns 201 and stores it verbatim. The canonical schema walk therefore stays silent
  on bounds permanently. There is no source to wire them to and no promise they could keep —
  and a public type member meaning "hint the wire ignores" is one consumers read as
  validation. Deprecating now rather than at the major so the signal arrives early; the
  `@deprecated` tags surface in editors via the shipped `.d.ts`.

### Changed
- **`TokenResource` is confirmed staying.** RFC-001 §5 asked the platform owner whether the
  token routes were carried long-term or deprecated wire-side, and the question was never
  answered in writing — so this package's own barrel carried "wire fate under review; may be
  removed in a later 4.x" for months, on nobody's authority. Probed against production:
  `GET /api/v2/tokens/status/` and `/tokens/encryption-info/` both return **200**, with a 404
  control on a nonexistent route proving the check meant something. The wire carries it. The
  speculation is retired and the comment now records the evidence instead.

## [4.0.2] — 2026-07-29

Re-pinned to `v0.30.1-dist.13` (canonical **00.30.01**). No field shape changed and no
`FIELD_SCHEMA` entry changed — the schema walk is byte-identical between the two pins, so
nothing about decoding moved. Three things changed and nothing else.

### Fixed
- **`construct.relations` and `event.languages` shipped with no description at all** — in
  `types.generated.ts` and in `SCHEMA.md`. Their descriptions were nested one level too deep
  inside `items:` in the canonical YAML, which made them invisible to every consumer that reads
  field descriptions, this package included. `SCHEMA.md` is the package's AI-legibility artifact,
  so the gap landed where it did the most harm.
- **Five description typos** corrected in published JSDoc and `SCHEMA.md`: `beapplied`,
  `phyiscal`, `relating the`, `object grant`, `eventuated`. The rendered docs site had already
  fixed all five by hand — the downstream copy was the correct one, and nobody noticed because
  the fix went where it was visible rather than where it was true.

### Changed
- `ONLYWORLDS_VERSION` `'00.30.00'` → `'00.30.01'`. It is a public `as const`, so its **literal
  type** changes. Depending on that literal is pathological, but it is a type-level change and
  should not be discovered rather than announced.
- The pin now carries canonical's numeric-bounds correction: the `maximum: 0` sentinel is gone
  from 26 fields, 8 fields gained `minimum: 0`, and `rulings.yaml` carries the numeric-bounds
  row. Nothing in this package consumes bounds — `maximum:` is **advisory** (keel does not
  enforce it; a `charisma: 9999` write returns 201 and stores verbatim) and the walk stays
  silent on bounds permanently. `integer_max` / `max` therefore remain declared no-ops here.

## [4.0.1] — 2026-07-29

**Metadata correction release.** No wire-path change: the client's reads and writes never
consulted `FIELD_SCHEMA`, and the generated interfaces carried the correct targets throughout.
The exposure is anything that builds UI or validation by **iterating `FIELD_SCHEMA`**.

⚑ **One way this can surface as a compile error**: `relation.relations` is removed, so
`FIELD_SCHEMA.relation.relations` is now a TypeScript error rather than a value. That is the
intended outcome — the field does not exist in the standard and the API rejects it — but it can
break a build rather than only a behaviour.

### Fixed
- **`FIELD_SCHEMA.collective.equipment` targeted `construct`; the standard says `object`.**
  This is the founding case of the schema ruling table
  (`collective-equipment-target`, ruled 2026-07-23): the v1 implementation used
  Construct, v1 is decommissioned, and keel serves per YAML. The generated code path
  in this repo was corrected the same week. The hand-maintained `FIELD_SCHEMA` copy of
  the same fact, in the same package, kept shipping the decommissioned value on
  `latest` — the fix went where someone happened to be looking.
- **`FIELD_SCHEMA.relation.relations` removed** — a `multi_link` to `relation` that does
  not exist in `relation.yaml`. A phantom field, publicly exported, that consumers
  building forms from this table would have sent to an API that 422s unknown keys.

### Changed
- **`FIELD_SCHEMA` is now GENERATED** from the pinned schema distribution and gated by
  `codegen:check`, joining `ELEMENT_ICONS` / `ELEMENT_SECTIONS` / `ELEMENT_FAMILIES`. It
  was ~650 hand-maintained lines whose test compared nothing to the schema. Regenerating
  it changed exactly 2 of 467 entries — the two above. Runtime shape and the deeply
  readonly public types (`as const`) are unchanged.
  Two declared deviations from a naive schema read are now stated in the generated file:
  `pin.element` (a `generic-link`) splits into `element_type` + `element_id`, as the wire
  serves it; and `integer_max` / `max` remain in the `FieldType` union unused, because
  the walk does not surface the schema's `maximum:` constraint (41 across 17 types).
- `codegen/generate_types.py` imports the vendored schema walk instead of carrying its
  own copy of it. Output byte-identical.

## [4.0.0] — 2026-07-23

**v2-native only.** See `docs/migrating-3-to-4.md`. 3.x stays published forever for
pinned consumers.

### Removed (BREAKING)
- The v1 client (`OnlyWorldsClient`), the v1 `ElementType` enum, `icon-utils`.
  `ElementType` at the root is now THE v2 slug union (was `V2ElementType` alias in 3.x).
- CJS build — the package is ESM-only with a sealed `exports` map (`"type": "module"`,
  `sideEffects: false`).

### Changed
- Metadata tables (`ELEMENT_ICONS`, `ELEMENT_LABELS`, `ELEMENT_SECTIONS`, `FIELD_SCHEMA`,
  `getElementIcon`, `getElementLabel`) ported onto the v2 slug union — same export names,
  same shapes, contents byte-identical EXCEPT: `FIELD_SCHEMA` `type: 'number'` →
  `'integer'` (70 entries; 'number' dropped from `FieldType`). Migration: consumers
  switching on `'number'` switch on `'integer'`.
- `TokenResource` now takes a structural `TokenTransport` (`{ request<T>(method, path,
  body?) }`) instead of the removed v1 client. Token surface retained pending the
  wire-fate ruling (RFC-001 §5) — may be removed in a later 4.x.

### Added (post-alpha.0, same night)
- **`ELEMENT_ICONS` GENERATED** from keel's `icon:` wrapper key (keel `56c124a`).
- **`ELEMENT_SECTIONS` DERIVED** from the canonical schema's own document structure
  (Skeld's ruling: sections are the standard tier's property groups; document order is
  display order). Divergence check vs the old hand table found and fixed three fossils:
  creature "Behaviour"→"Behavior", pin's triple-listed generic link → `element`,
  relation "Involves" listing a nonexistent `relations` field. Canonical is truth.
- **`SCHEMA.md`** — full generated schema reference (every field with its canonical
  description, link directions, families, icons, sections), ships in the tarball;
  covered by the codegen drift guard. AGENTS.md points agents at it first.
- **`OwV2Client.request()` is public** (typed escape hatch; does not sanitize) and
  structurally satisfies `TokenTransport` — `new TokenResource(client)` just works.
  Token ruling (Skeld): keel keeps `/tokens/*` long-term; ported, not deleted.
- README rewritten v2-native (v1 sections, branded types, and the encrypted-key
  walkthrough removed; bulk partial-failure and idempotency-key hygiene promoted).

### alpha.1 — consumer-pin fixes (Temper's atlas review, same night)
- **`parseEnvelope` → `parseErrorEnvelope`** (it parses the platform *error* envelope;
  renamed before the 4.0 name freeze to avoid collision with the world-export envelope).
- The never-whitelist LAW now lives as a comment on `READ_ONLY_FIELDS` itself.
- Stale v1 example in the shipped d.ts fixed (TokenResource JSDoc).

### Release gates — ALL GREEN (2026-07-23 night)
- **Gate 3 (wire-log v1-traffic query, Skeld)**: GREEN — no unknown v1-SDK consumer on
  the wire; observed v1 traffic is pinned deployed builds (council proxy, legacy plugin
  walks) that an npm major cannot touch. The v1 API dialect stays served regardless.
- **`/api/v2/tokens/` live on prod + staging** (keel `e181689`; three-base byte
  agreement test-pinned). `TokenResource` annotates a 404 on token routes as
  "older server", not "no tokens". Requirement noted in the migration guide.
- **`ONLYWORLDS_VERSION` now GENERATED** from canonical's `VERSION` file (carried
  into keel `schema/` by the refresh script, keel `492168c`) — the last hand-synced
  constant is dead. Consumer soak: Temper pinned the alpha against atlas's full
  static surface — strict-clean compile, correct runtime, package shape approved.
- **No `npm deprecate` on 3.x** (landscape research; 3.x stays plainly supported).
- 4.x wishlist: account client (list/mint/create — atlas first consumer), world-export
  envelope reader (§8c), per-status error classes, richer codegen JSDoc, retry/backoff
  parity audit, FIELD_SCHEMA generation with `required:` from YAML.

## [3.1.0] — 2026-07-23

### Added
- **Canonical element colour palette** (`src/v2/palette.ts`, exported from root):
  `ELEMENT_FAMILIES` (type → family), `FAMILY_COLORS` (family → `{light, dark}` hex),
  `familyOf(type)`, `elementColor(type, mode)`, `FAMILY_ORDER`, type `ElementFamily`.
  Four semantic families (agents / world / abstract / temporal) ruled 2026-07-22 after
  CVD-validated measurement (Orrery `product/schema/element-palette-measurements.md`).
  Colour carries the FAMILY; `ELEMENT_ICONS` carries the TYPE. Keyed on the v2 slug
  union. First proven live in atlas and council, whose local copies become re-exports.
  **`ELEMENT_FAMILIES` is GENERATED** from the `family:` key in keel's schema YAML
  (keel `c69366b`, a keel presentation-wrapper key — not part of the council-governed
  OnlyWorlds standard); hexes are hand-authored design constants beside it. Membership
  and hex invariants test-gated (`test/palette.test.mjs`); light hexes render-proven on
  the ruled OnlyWorlds light mode (ow-house-light) 2026-07-23.
- **Codegen drift guard**: `python codegen/generate_types.py --check` fails if
  `types.generated.ts` doesn't match the schema YAMLs (release gate; mirrors keel's
  schema CI job). Codegen also hard-fails on missing/invalid `family:` keys — the
  canary for a canonical-refresh that overwrote keel's wrapper layer.
- **CI**: GitHub Action building + running the full suite against the compiled bundle.
- **AGENTS.md** shipped in the tarball — usage guide for AI agents reading the package
  locally, including the SDK-vs-MCP division of labor and the wire gotchas.
- README: worked create→link→read-back round-trip, schema-verified field by field
  (also fixes the old example patching `'character'` with a location's id); canonical
  colour section; SDK-vs-MCP guidance.
- This CHANGELOG.

### Fixed
- `FieldType` union now includes `'number'` — the legacy alias that 70 `FIELD_SCHEMA`
  entries actually carry (consumers switch on it; data normalization deferred to 4.0).
- `generate_types.py` exits with a clear message when the sibling keel checkout is
  absent instead of a bare traceback.

## [3.0.0] — 2026-07-18

- v2-native client (`OwV2Client`) absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
  wire-corrected against live staging fixtures (S22). Generated element types from the
  canonical keel schema YAML (`src/v2/types.generated.ts`), validated against all 1,086
  live W11 elements. v1 surface unchanged and frozen.
