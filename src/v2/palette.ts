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
 * Provenance: first proven live in atlas (`src/core/element-colors.ts`) and
 * council (`src/cosmos/element-families.ts`) — both are re-exports-in-waiting
 * of this module. Do not change any value here without re-running the CVD
 * validation (every brighter World green collides with Temporal amber for
 * protan viewers — the green is pinned BY the accessibility budget).
 *
 * NOTE: `ELEMENT_FAMILIES` is hand-authored until the canonical schema YAML
 * grows a per-type `family:` key (Skeld's side of the seam), at which point it
 * moves into `types.generated.ts` and this module re-exports it. Until then,
 * completeness is gated by test: `test/palette.test.mjs` asserts every slug in
 * `ELEMENT_TYPES` has a family and no stray keys exist.
 */
import { ELEMENT_TYPES, type ElementType } from './types.generated';

/** The four semantic families. Spatial types fold into `world` (a pin is coloured by its TARGET element's type in practice). */
export type ElementFamily = 'agents' | 'world' | 'abstract' | 'temporal';

/** Per-type semantic family — the schema fact (colour-independent). */
export const ELEMENT_FAMILIES: Record<ElementType, ElementFamily> = {
  character: 'agents',
  creature: 'agents',
  species: 'agents',
  family: 'agents',
  collective: 'agents',
  institution: 'agents',
  location: 'world',
  object: 'world',
  construct: 'world',
  map: 'world',
  pin: 'world',
  marker: 'world',
  zone: 'world',
  ability: 'abstract',
  trait: 'abstract',
  title: 'abstract',
  language: 'abstract',
  law: 'abstract',
  event: 'temporal',
  narrative: 'temporal',
  phenomenon: 'temporal',
  relation: 'temporal',
};

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

// Completeness invariant restated for readers: keys of ELEMENT_FAMILIES ===
// ELEMENT_TYPES exactly. Enforced in test/palette.test.mjs; typed by
// Record<ElementType, ...> at compile time.
void ELEMENT_TYPES;
