/**
 * OnlyWorlds TypeScript SDK
 *
 * A type-safe SDK for interacting with the OnlyWorlds API
 */

export { OnlyWorldsClient, type OnlyWorldsConfig, type ListOptions, type ApiResponse } from './client';
export * from './types';
export * from './token-types';
export { getElementIcon, ELEMENT_ICONS } from './icon-utils';

// Re-export for convenience
export { ElementType } from './types';

// ── v2 dialect (keel API) ──────────────────────────────────────────────────
// New default recommendation. The v1 surface above is frozen and served
// forever; v2 is additive. Root aliases avoid the ElementType name clash with
// the v1 enum: v2's element-slug union is exported as V2ElementType.
export { OwV2Client, parseEnvelope } from './v2';
export { OwApiError, OwNetworkError, errorFromResponse } from './v2';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './v2';
export { ELEMENT_TYPES, SPATIAL_TYPES } from './v2';
// Canonical element colour palette (four semantic families; colour carries
// FAMILY, ELEMENT_ICONS carries TYPE). Keyed on the v2 slug union.
export { ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf, elementColor } from './v2';
export type { ElementFamily } from './v2';
export type { OwKeyKind, OwAuthErrorCode } from './v2';
export type { ElementType as V2ElementType } from './v2';
export type {
  OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwPage, OwWorldMeta,
} from './v2';