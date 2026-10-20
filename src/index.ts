/**
 * OnlyWorlds TypeScript SDK — v2-native (4.0).
 *
 * One dialect, one source: the client speaks the keel v2 API, every type and
 * constant is generated or test-gated from the canonical schema YAML, and
 * `ElementType` is THE slug union (the v1 enum is gone — 3.x remains on npm
 * for legacy consumers, see the migration guide in docs/).
 */

// Client + wire machinery
export { OwV2Client, parseErrorEnvelope, FILE_EXTENSIONS, fileKindOf } from './v2';
export { OwApiError, OwPreconditionFailedError, OwNetworkError, OwSignInError, errorFromResponse } from './v2';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './v2';
export type { OwKeyKind, OwAuthErrorCode, OwSignInReason } from './v2';

// Schema-generated types (the single ElementType) + wire shapes
export { ELEMENT_TYPES, SPATIAL_TYPES, AGENT_DOORS, isAgentDoor } from './v2';
export type {
  ElementType, OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwMediaTicket, OwPage, OwRemovalTicket, OwRemovedImage, OwUploadedImage, OwWorldMeta,
  OwFileKind, OwFileAddedBy, OwFileRow, OwWorldFileRow, OwWorldFiles, OwFileTicket, OwUploadedFile, OwFileDownload,
  OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwMember, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwJoined, OwAgentJoined, OwPlayerJoined, OwSignedIn,
  OwSortRef, OwSortNote, OwSortRow, OwSortMakeRow, OwSortAddToRow, OwSortLinkRow, OwSortAskRow, OwSortAnswer,
  OwWriteDoor, OwChangeUpsert, OwChangeDelete, OwDeleteReason, OwResyncReason,
} from './v2';

// Canonical element colour palette (families generated from schema; hexes CVD-validated)
export { ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf, elementColor } from './v2';
export type { ElementFamily } from './v2';

// Field labels: a field name as the words a tool shows (sentence case, acronyms kept)
export { FIELD_ACRONYMS, fieldLabel } from './v2';

// Element metadata (ported onto v2 slugs in 4.0; contents unchanged except number→integer)
export {
  ELEMENT_ICONS, ELEMENT_LABELS, ELEMENT_SECTIONS, FIELD_SCHEMA,
  ONLYWORLDS_VERSION, getElementIcon, getElementLabel,
} from './v2';
export type { FieldType, FieldInfo, SectionInfo } from './v2';

// The world file: one .zip holding one world as a portable copy (Folder Format §4.1), read and written
export {
  readWorldFile, writeWorldFile, OwWorldFileError, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_ENTRIES,
} from './world-file';
export type {
  OwReadWorldFile, OwReadWorldFileOptions, OwWorldFileEntry, OwWorldFileReason,
} from './world-file';

// World lookup: the elements a question is about, ranked, no model (the Lantern Ask trial, round 2)
export { buildWorldIndex, lookupWorld, renderElement } from './lookup';
export type {
  OwWorldIndex, OwLookupHit, OwLookupReason, OwLookupLink, OwLookupElement, OwLookupOptions, OwRenderOptions,
} from './lookup';

// Ask your world: the context keel's AI proxy takes, from the elements the user sees
export { buildAskContext, ASK_LIMITS } from './ask';
export type { OwAskContext } from './ask';

// Photo preparation: shrink and convert a picture in the browser before uploadImage
export { preparePhoto, planPhoto, PHOTO_TYPES, PHOTO_MAX_BYTES } from './photo';
export type { OwPhotoOptions, OwPhotoPlan, OwPreparedPhoto } from './photo';

// World calendars: the calendar kernel (Atlas imports it from here; Atlas owns atlas_calendar) and
// which calendars a world holds; dates on the world's integer time line, named
export * from './calendar/index';

// Token rating surface. RFC-001 §5 left its wire fate as an open question to the
// platform owner and it was never answered in writing — so this comment said "may be
// removed in a later 4.x" for months on nobody's authority. PROBED 2026-07-29 against
// production with a demo key: GET /api/v2/tokens/status/ and /tokens/encryption-info/
// both return 200, with a 404 control on a nonexistent route proving the check meant
// something. The wire carries it. It stays, and the speculation is retired.
export { TokenResource } from './token-resource';
export type { TokenTransport } from './token-resource';
export * from './token-types';
