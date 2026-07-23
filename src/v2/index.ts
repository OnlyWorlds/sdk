/**
 * keel v2 engine absorbed from Assembly's ow-v2-client v0.9.0 (Kael),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * Public barrel for the v2 dialect. Re-exported from the package root under
 * v2-scoped names (OwV2Client + Ow* types) alongside the frozen v1 surface.
 */

export { OwV2Client, parseEnvelope } from './client';
export { OwApiError, OwNetworkError, errorFromResponse } from './errors';
export type { OwAuthErrorCode } from './errors';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './keys';
export type { OwKeyKind } from './keys';
export { ELEMENT_TYPES, SPATIAL_TYPES } from './types';
export {
  ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf, elementColor,
} from './palette';
export type { ElementFamily } from './palette';
export type {
  ElementType, OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwPage, OwWorldMeta,
} from './types';
