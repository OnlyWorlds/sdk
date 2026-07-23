/**
 * Canonical element colour palette — four semantic families.
 *
 * Ruled by Captain 2026-07-22 after Skeld's measurement pass (Orrery
 * `product/schema/element-palette-measurements.md`): 22 mutually-separable
 * hues is structurally impossible; four families is the ceiling that passes
 * all-pairs CVD separation in both modes. **Colour carries the FAMILY; the
 * icon (`ELEMENT_ICONS`) carries the TYPE.** Dark-mode pairs land in the 6–8
 * CVD floor band, so secondary encoding (icon + label) is REQUIRED alongside
 * colour, not optional.
 *
 * The type→family map is GENERATED: `ELEMENT_FAMILIES` is emitted by
 * `codegen/generate_types.py` from the `family:` key in keel's schema YAML
 * (added 2026-07-23, keel c69366b) — a keel PRESENTATION-WRAPPER key
 * (first-party rendering metadata, not part of the council-governed
 * OnlyWorlds standard). It cannot drift from the schema; membership and hex
 * invariants stay test-gated in `test/palette.test.mjs`.
 *
 * The hexes below are design constants, hand-authored beside the generated
 * map. Do not change any value without re-running the CVD validation (every
 * brighter World green collides with Temporal amber for protan viewers — the
 * green is pinned BY the accessibility budget).
 *
 * Provenance: first proven live in atlas (`src/core/element-colors.ts`) and
 * council (`src/cosmos/element-families.ts`) — both become re-exports of this
 * module.
 */
import { ELEMENT_FAMILIES, type ElementFamily, type ElementType } from './types.generated';

export { ELEMENT_FAMILIES };
export type { ElementFamily };

/**
 * Family → validated hex per surface mode. `light` assumes near-white
 * surfaces, `dark` assumes near-black (measured against #0a0a0a).
 * World green is identical in both modes and sits at its low-contrast end
 * deliberately — see module header before "fixing" it.
 */
export const FAMILY_COLORS: Record<ElementFamily, { light: string; dark: string }> = {
  agents: { light: '#2a78d6', dark: '#3987e5' },
  world: { light: '#008300', dark: '#008300' },
  abstract: { light: '#e87ba4', dark: '#d55181' },
  temporal: { light: '#eda100', dark: '#c98500' },
};

/** Semantic family for an element type slug. */
export function familyOf(type: ElementType): ElementFamily {
  return ELEMENT_FAMILIES[type];
}

/**
 * The convenience most callers want: canonical colour for an element type.
 * Name matches the live atlas/council implementations so their SDK swap is a
 * re-export, not a rename. Defaults to `dark` (both current consumers are
 * dark-surface).
 */
export function elementColor(type: ElementType, mode: 'light' | 'dark' = 'dark'): string {
  return FAMILY_COLORS[ELEMENT_FAMILIES[type]][mode];
}

/** All four families, in ruling order (the order IS the CVD-safety mechanism of the source palette). */
export const FAMILY_ORDER: readonly ElementFamily[] = ['agents', 'world', 'abstract', 'temporal'];
