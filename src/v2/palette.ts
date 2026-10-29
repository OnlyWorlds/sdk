/**
 * Canonical element colour palette — four colour groups.
 *
 * Ruled 2026-07-22 after a measurement pass: 22 mutually-separable hues
 * is structurally impossible; four groups is the ceiling that passes
 * all-pairs CVD separation in both modes. **Colour carries the GROUP; the
 * icon (`ELEMENT_ICONS`) carries the TYPE.** Dark-mode pairs land in the 6–8
 * CVD floor band, so secondary encoding (icon + label) is REQUIRED alongside
 * colour, not optional.
 *
 * The groups are a visual aid for drawing the 22 types, not part of the
 * standard, and are named only by their colour (`blue`, `green`, `pink`,
 * `amber`). Everything here is GENERATED since 4.102.0: `ELEMENT_GROUPS`,
 * `GROUP_ORDER` and `GROUP_COLORS` are emitted by `codegen/generate_types.py`
 * from the distribution's `presentation.json` (`types.<type>.family`,
 * `colors.order`, `colors.families`), which validates every group against the
 * order and every hex as `#rrggbb`. `test/palette.test.mjs` holds them to the
 * vendored sidecar. Do not change a hex without re-running the CVD validation
 * (every brighter green collides with the amber for protan viewers — the green
 * is pinned BY the accessibility budget).
 *
 * Provenance: first proven live in atlas (`src/core/element-colors.ts`) and
 * council (`src/cosmos/element-families.ts`) — both become re-exports of this
 * module.
 */
import {
  ELEMENT_GROUPS, GROUP_COLORS, GROUP_ORDER, ELEMENT_TYPES, type ElementGroup, type ElementType,
} from './types.generated';

export { ELEMENT_GROUPS, GROUP_COLORS, GROUP_ORDER };
export type { ElementGroup };

/** The colour group of an element type slug. */
export function groupOf(type: ElementType): ElementGroup {
  return ELEMENT_GROUPS[type];
}

/**
 * The convenience most callers want: canonical colour for an element type.
 * Name matches the live atlas/council implementations so their SDK swap is a
 * re-export, not a rename. Defaults to `dark` (both current consumers are
 * dark-surface).
 *
 * An unknown type throws a TypeError naming it (since 4.2.0; before, it crashed
 * with "Cannot read properties of undefined"). This is the one place a swap from
 * atlas's own copy is NOT a pure re-export: atlas falls back to the green
 * group for an unknown type. A caller that wants a fallback catches, or checks
 * `type in ELEMENT_GROUPS` first; which fallback, if any, is a design call
 * this package does not make for its consumers.
 */
export function elementColor(type: ElementType, mode: 'light' | 'dark' = 'dark'): string {
  const group = ELEMENT_GROUPS[type];
  if (group === undefined) throw new TypeError(`elementColor: unknown element type "${String(type)}"`);
  return GROUP_COLORS[group][mode];
}

// The names before 4.102.0, kept until 5.0 so a consumer that types one of the old words
// still builds. This table is the only place the old words stand; every name below is
// derived through it, so its membership follows the pinned serial.
const LEGACY_WORD = { blue: 'agents', green: 'world', pink: 'abstract', amber: 'temporal' } as const satisfies Record<ElementGroup, string>;

/** @deprecated Since 4.102.0. Use `ElementGroup`, the colour words; this name leaves in 5.0. */
export type ElementFamily = (typeof LEGACY_WORD)[ElementGroup];

/** @deprecated Since 4.102.0. Use `ELEMENT_GROUPS`; this name leaves in 5.0. Each type's group in its pre-4.102.0 word. */
export const ELEMENT_FAMILIES: Record<ElementType, ElementFamily> = Object.fromEntries(
  ELEMENT_TYPES.map(t => [t, LEGACY_WORD[ELEMENT_GROUPS[t]]]),
) as Record<ElementType, ElementFamily>;

/** @deprecated Since 4.102.0. Use `GROUP_COLORS`; this name leaves in 5.0. The same hexes, keyed by the pre-4.102.0 words. */
export const FAMILY_COLORS: Record<ElementFamily, { light: string; dark: string }> = Object.fromEntries(
  GROUP_ORDER.map(g => [LEGACY_WORD[g], { ...GROUP_COLORS[g] }]),
) as Record<ElementFamily, { light: string; dark: string }>;

/** @deprecated Since 4.102.0. Use `GROUP_ORDER`; this name leaves in 5.0. */
export const FAMILY_ORDER: readonly ElementFamily[] = GROUP_ORDER.map(g => LEGACY_WORD[g]);

/** @deprecated Since 4.102.0. Use `groupOf`; this name leaves in 5.0. */
export function familyOf(type: ElementType): ElementFamily {
  return ELEMENT_FAMILIES[type];
}
