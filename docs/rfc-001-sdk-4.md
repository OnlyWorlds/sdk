# RFC-001 — What the SDK Should Be (the 4.0 line)

**Author**: Kael (Assembly), SDK maintainer
**Date**: 2026-07-23
**Status**: CIRCULATING — review requested from Captain (rules), Skeld (wire contract / schema YAML), Temper (largest consumer estate)
**Grounding**: repo survey 2026-07-23 · 39-repo consumer census (`Assembly/Notes/2026-07-23-sdk-census.json`) · web research on 2026 SDK practice · Skeld's AI-legibility memo (2026-07-23)

---

## 1. The target, in one paragraph

`@onlyworlds/sdk` should be **the canonical typed client for the v2 API plus the canonical constants — everything generated or test-gated from the single-source schema YAML, nothing hand-synced**. Meaning travels with shape: an AI (or human) reading the package cold gets not just the types but what the fields *mean*, generated from the same source so it can't rot. Small, ESM-first, tree-shakeable, with CHANGELOG + CI + a documented release path. The SDK is the cheap deterministic path for known operations; the MCP server owns live/exploratory access — and the README says so.

## 2. What we have (honest state, post-3.0)

- **v2 half: good.** `OwV2Client` wire-corrected against live S22 fixtures, 20 tests green on the compiled bundle, types generated from keel's YAML and validated against 1,086 live elements. Palette landed 2026-07-23 (`a782cf5`), test-gated.
- **v1 half: the structural debt.** Two `ElementType` definitions (v1 enum vs v2 slug union) reconciled by barrel aliasing. The rich metadata tables (`ELEMENT_SECTIONS`, `FIELD_SCHEMA`, `ELEMENT_ICONS`, `ONLYWORLDS_VERSION`) are keyed on the **v1 enum**, hand-maintained, ungated — the drift-prone half.
- **No CI, manual publish, CHANGELOG just started.** Codegen assumes a sibling `../keel` checkout, undocumented.
- **Census facts** (repo half; wire half pending): 20 estate repos depend on the SDK; **15 use the v1 client as live transport** (active: council, obsidian-plugin, base-tool, mobile-crud, little-element-viewer, element-viewer-trial, whatidos-civic). All pin `^2.x`. **Zero repos import `OwV2Client` yet.** Six active tools hand-roll their API calls (tactical-tangle, toolkit, write-tool, OnlyWorldsMobile, opd-converter, ecosystem-mapper).

## 3. Releases

### 3.1.0 — non-breaking, next
1. **Palette export** — done in main. Mint AFTER Skeld adds `family:` to the canonical YAML and codegen emits `ELEMENT_FAMILIES` into `types.generated.ts` (the release that kills the color-drift class should not itself ship a hand map).
2. **CI gate**: GitHub Action, build + full test suite on every push/PR. `npm publish --provenance` documented as the release path (OTP stays Captain's).
3. **Codegen coupling pinned**: document the `../keel` assumption; fail with a clear message when absent.
4. Small fixes: `FIELD_SCHEMA` `'number'` vs declared `'integer'` union mismatch.

### 4.0.0 — v2-native only (the breaking one)
1. **Delete the v1 client, v1 enum, token machinery** (census: token routes used only by council — see §5). 3.x stays on npm forever; pinned consumers never notice.
2. **Metadata tables regenerated onto v2 slugs**: `ELEMENT_SECTIONS`, `FIELD_SCHEMA`, `ELEMENT_ICONS` re-keyed on the slug union and emitted by codegen from the YAML — same gate as the types. One `ElementType`, one source, zero hand-sync.
3. **ESM-only** + sealed `exports` map (`types` first, `sideEffects: false`, no deep imports). Named exports only. Kills the dual-package hazard; every 2026 runtime is ESM-first.
4. **AI-legibility layer** (Skeld's four moves + research, converged):
   - `SCHEMA.md`/llms-full.txt **generated from the YAML** — one paragraph per type, field list with one-line descriptions, disambiguation notes (Trait/Ability, Institution/Collective), link-direction facts. Not hand-written, cannot drift. *Requires the YAML `description:` fields — Skeld's committed leg.*
   - **Field descriptions as JSDoc in the generated `.d.ts`** — semantics inline where every editor and agent already looks.
   - **One wire-true worked example** in the README (create world → two linked elements → read back, byte-true v2 dialect).
   - **`AGENTS.md`** + a README line stating the SDK/MCP division of labor (SDK = typed deterministic path; MCP = live/exploratory; the SDK is 4–32× cheaper in tokens for known ops).
5. **Migration guide + `npm deprecate` message** on 3.x pointing at it.

## 4. Gates before the 4.0 axe (order matters)

1. RFC sign-offs (this doc).
2. 3.1.0 shipped and settled — proves the release pipeline non-breakingly.
3. **Skeld's wire-log query**: live v1-dialect hit counts off keel — the census instrument that can't be stale (user-is-the-fixture). Repo census under-counts by construction.
4. Migration story per named consumer: council, obsidian-plugin, base-tool either migrate or explicitly stay pinned. Staying pinned forever is a legitimate outcome — keel serves the v1 *API* for years regardless; this RFC only removes the v1 *client library* from future SDK versions.

## 5. Open questions (owners named)

- **Skeld**: does `family:` land as a per-type YAML key exactly as discussed? Do `description:` fields exist in the YAML today or is that net-new schema-side work? Token routes (`token-resource.ts`) — carried by keel long-term, or deprecated wire-side too (decides whether 4.0 deletes or ports the token client)?
- **Temper**: does the tangle/toolkit/write-tool hand-rolled fleet *want* `OwV2Client`, or is hand-rolling deliberate (bundle size, control)? Consumer veto on anything in §3 that makes your ports harder. Council's v1-auth path — migrate at 4.0, or pin?
- **Captain**: green-light the 4.0 scope as written? Any public-consumer concern (npm downloads beyond the estate) that should raise the deprecation-overlap bar?

## 6. Governance (the seam, restated once)

Skeld holds the wire contract: keel, schema YAML, v2 spec, staging, fixtures. Kael holds the client package: codegen consumer, constants, tests, CHANGELOG/CI, release gating. Improvements flow message-or-PR → gated → published. Server and client independently owned, fixtures as the treaty — the two-witness structure stays.
