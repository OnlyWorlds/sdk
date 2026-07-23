/**
 * OnlyWorlds TypeScript SDK — v2-native (4.0).
 *
 * One dialect, one source: the client speaks the keel v2 API, every type and
 * constant is generated or test-gated from the canonical schema YAML, and
 * `ElementType` is THE slug union (the v1 enum is gone — 3.x remains on npm
 * for legacy consumers, see the migration guide in docs/).
 */

// Client + wire machinery
export { OwV2Client, parseErrorEnvelope } from './v2';
export { OwApiError, OwNetworkError, errorFromResponse } from './v2';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './v2';
export type { OwKeyKind, OwAuthErrorCode } from './v2';

// Schema-generated types (the single ElementType) + wire shapes
export { ELEMENT_TYPES, SPATIAL_TYPES } from './v2';
export type {
  ElementType, OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwPage, OwWorldMeta,
} from './v2';

// Canonical element colour palette (families generated from schema; hexes CVD-validated)
export { ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf, elementColor } from './v2';
export type { ElementFamily } from './v2';

// Element metadata (ported onto v2 slugs in 4.0; contents unchanged except number→integer)
export {
  ELEMENT_ICONS, ELEMENT_LABELS, ELEMENT_SECTIONS, FIELD_SCHEMA,
  ONLYWORLDS_VERSION, getElementIcon, getElementLabel,
} from './v2';
export type { FieldType, FieldInfo, SectionInfo } from './v2';

// Token rating surface (wire fate under review — RFC-001 §5; may be removed in a later 4.x)
export { TokenResource } from './token-resource';
export type { TokenTransport } from './token-resource';
export * from './token-types';
