# Changelog

All notable changes to `@onlyworlds/sdk`. Maintained from 3.1.0 onward (Kael, Assembly);
earlier history lives in git log only.

## [Unreleased — 3.1.0]

### Added
- **Canonical element colour palette** (`src/v2/palette.ts`, exported from root):
  `ELEMENT_FAMILIES` (type → family), `FAMILY_COLORS` (family → `{light, dark}` hex),
  `familyOf(type)`, `elementColor(type, mode)`, `FAMILY_ORDER`, type `ElementFamily`.
  Four semantic families (agents / world / abstract / temporal) ruled 2026-07-22 after
  CVD-validated measurement (Orrery `product/schema/element-palette-measurements.md`).
  Colour carries the FAMILY; `ELEMENT_ICONS` carries the TYPE. Keyed on the v2 slug
  union. First proven live in atlas and council, whose local copies become re-exports.
  `ELEMENT_FAMILIES` is hand-authored pending a `family:` key in the canonical schema
  YAML (then codegen-emitted); completeness is test-gated against `ELEMENT_TYPES`
  (`test/palette.test.mjs`).
- This CHANGELOG.

## [3.0.0] — 2026-07-18

- v2-native client (`OwV2Client`) absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
  wire-corrected against live staging fixtures (S22). Generated element types from the
  canonical keel schema YAML (`src/v2/types.generated.ts`), validated against all 1,086
  live W11 elements. v1 surface unchanged and frozen.
