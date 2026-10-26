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
export { pkceChallenge, base64url } from './v2';
export type { OwSignInStorage, OwSignInBegin, OwSignInBegun, OwSignInComplete, OwSignInResult } from './v2';
export { OwApiError, OwPreconditionFailedError, OwProposedError, OwStaleProposalError, OwNetworkError, OwSignInError, errorFromResponse } from './v2';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './v2';
export type { OwKeyKind, OwAuthErrorCode, OwSignInReason } from './v2';

// Schema-generated types (the single ElementType) + wire shapes
export { ELEMENT_TYPES, SPATIAL_TYPES, AGENT_DOORS, isAgentDoor, isKnownOf } from './v2';
export type {
  ElementType, OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwMediaTicket, OwPage, OwRemovalTicket, OwRemovedImage, OwUploadedImage, OwWorldMeta, OwWorldPublicPage,
  OwWorldOrigin, OwWorldSource, OwWorldProducer,
  OwFileKind, OwFileAddedBy, OwFileRow, OwWorldFileRow, OwWorldFiles, OwFileTicket, OwUploadedFile, OwFileDownload,
  OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwFrontDoor, OwMySeat, OwMember, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwAccountWorld, OwMintedKey, OwDraught, OwDraughtCompact, OwDraughtPolicy, OwDraughtComponent, OwDraughtItem, OwJoined, OwAgentJoined, OwPlayerJoined, OwSignedIn,
  OwSortRef, OwSortNote, OwSortRow, OwSortMakeRow, OwSortAddToRow, OwSortLinkRow, OwSortAskRow, OwSortAnswer,
  OwWriteDoor, OwChangeUpsert, OwChangeDelete, OwDeleteReason, OwHiddenRow, OwResyncReason,
  OwProposal, OwProposalState, OwProposalList, OwProposed, OwProposalAccepted, OwProposalConflict, OwProposeInput, OwProposalQuery, OwWorldProposalQuery,
  OwProposedNewElement, OwWorldProposalRow, OwWorldProposalList, OwReviewInput, OwReviewed,
  OwCreateAccountWorldInput, OwCreatedAccountWorld,
} from './v2';

// The room profile (schema-dist profiles/room.md): the pairs a parlor puts in a world, and the
// matcher a lore view uses to leave them out (ROOM_PAIRS generated from the vendored dist)
export { ROOM_PAIRS, isRoomElement } from './room';
// The message profile (schema-dist profiles/message.md): a message between a world's members, to whom
// it is addressed, whether its sender is proved, a reader's read mark and unread list, a thread
// (MESSAGE_PAIR generated from the vendored dist)
export { MESSAGE_PAIR, isMessage, recipientsOf, isAddressedTo, isToEveryone, isSentBy, senderStatus, readMarkOf, unreadFor, threadOf } from './message';
export type { OwSender, OwSenderStatus, OwMessageMember } from './message';
// The review profile (schema-dist profiles/review.md): an element written as proposed, as a reader that
// shows a world shows the mark, and as a reader that hands a world on leaves it out.
export { PROPOSED_MARK, proposedMarkOf, handsOnAsProposed } from './review';
export type { OwProposedMark } from './review';
// The names profile (schema-dist profiles/names.md): a world's own words for the types, x_names on the World.
export { typeWord } from './names';
export type { OwNamesMap, OwWordPair } from './names';

// Canonical element colour palette (families generated from schema; hexes CVD-validated)
export { ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf, elementColor } from './v2';
export type { ElementFamily } from './v2';

// Field labels: a field name as the words a tool shows (sentence case, acronyms kept)
export { FIELD_ACRONYMS, fieldLabel } from './v2';

// Element metadata (ported onto v2 slugs in 4.0; contents unchanged except number→integer)
export {
  ELEMENT_ICONS, ELEMENT_LABELS, ELEMENT_SECTIONS, FIELD_SCHEMA, PUBLIC_FIELDS,
  ONLYWORLDS_VERSION, getElementIcon, getElementLabel,
} from './v2';
export type { FieldType, FieldInfo, SectionInfo } from './v2';

// The world file: one .zip holding one world as a portable copy (Folder Format §4.1), read and written
export {
  readWorldFile, writeWorldFile, OwWorldFileError, WORLD_FILE_MAX_BYTES, WORLD_FILE_MAX_ENTRIES,
  WORLD_FILE_MEDIA_TYPE, simpleCaseFold,
} from './world-file';
export { nfc } from './nfc';
export type {
  OwReadWorldFile, OwReadWorldFileOptions, OwWorldFileEntry, OwWorldFileReason, OwWriteWorldFileOptions, OwWriteWorldFileReport,
} from './world-file';

// World lookup: the elements a question is about, ranked, no model (the Lantern Ask trial, round 2)
export { buildWorldIndex, lookupWorld, renderElement } from './lookup';
export type {
  OwWorldIndex, OwLookupHit, OwLookupReason, OwLookupLink, OwLookupElement, OwLookupOptions, OwRenderOptions,
} from './lookup';

// Ask your world: the context keel's AI proxy takes, from the elements the user sees, with proposed,
// hidden and room elements left out unless asked (REVIEW_PROPOSED_LABEL generated from the vendored dist)
export { buildAskContext, ASK_LIMITS, REVIEW_PROPOSED_LABEL } from './ask';
export type { OwAskContext, OwAskContextOptions, OwAskLeftOut } from './ask';

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
