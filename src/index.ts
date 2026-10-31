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
  OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwFrontDoor, OwMySeat, OwReadingAids, OwServedReadingAids, OwReadingAidsCharter, OwReadingAidsGuide, OwReadingAidsDomain, OwReadingAidsHub, OwMember, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwMemberLenses, OwAccountWorld, OwAccountToken, OwMintedKey, OwDraught, OwDraughtCompact, OwDraughtPolicy, OwDraughtComponent, OwDraughtItem, OwDraughtLens, OwWorldLenses, OwWorldLens, OwWorldLensReading, OwJoined, OwAgentJoined, OwPlayerJoined, OwSignedIn,
  OwSortRef, OwSortNote, OwSortRow, OwSortMakeRow, OwSortAddToRow, OwSortLinkRow, OwSortAskRow, OwSortAnswer,
  OwWriteDoor, OwChangeUpsert, OwChangeDelete, OwDeleteReason, OwHiddenRow, OwResyncReason,
  OwProposal, OwProposalState, OwProposalList, OwProposed, OwProposalAccepted, OwProposalConflict, OwProposeInput, OwProposalQuery, OwWorldProposalQuery,
  OwProposedNewElement, OwWorldProposalRow, OwWorldProposalList, OwReviewInput, OwReviewed,
  OwCreateAccountWorldInput, OwCreatedAccountWorld,
} from './v2';

// The room profile (schema-dist profiles/room.md): the pairs a parlor puts in a world, and the
// matcher a lore view uses to leave them out (ROOM_PAIRS generated from the vendored dist); and the reading
// aids' matcher (the charter, its guide, its domains: the pair and the mark x_charter_of), and which aid a
// pair alone makes an element (readingAidOf, the mark ignored)
export { ROOM_PAIRS, isRoomElement, isCharterElement, readingAidOf } from './room';
// The charter profile (schema-dist profiles/charter.md): a world's reading aids, the Charter, the Guide and the
// Domains, as one reader sees them (CHARTER_PAIRS generated from the vendored dist)
export { CHARTER_PAIRS, charterOf, domainsOf } from './charter';
export type { OwCharterWorld } from './charter';
// The strand profile (schema-dist profiles/strand.md): a world in miniature, its story, one happening, the place
// then, the hero and the place now, as one reader sees them
export { STRAND_FIELD, strandOf } from './strand';
export type { OwStrand, OwStrandSlot, OwStrandWorld } from './strand';
// The message profile (schema-dist profiles/message.md): a message between a world's members, to whom
// it is addressed, whether its sender is proved, who edited it, a reader's read mark and unread list, a
// thread, and a Character's Note, which is not a message (MESSAGE_PAIR and NOTE_PAIR generated from the
// vendored dist)
export type { OwAddressingOptions } from './message';
export { MESSAGE_PAIR, NOTE_PAIR, isMessage, isNote, recipientsOf, isAddressedTo, isToEveryone, hasUnseenRecipients, isSentBy, senderStatus, editedBy, readMarkOf, unreadFor, threadOf, noteOf } from './message';
export type { OwSender, OwSenderStatus, OwEdited, OwMessageMember } from './message';
// The review profile (schema-dist profiles/review.md): an element written as proposed, as a reader that
// shows a world shows the mark, and as a reader that hands a world on leaves it out.
export { PROPOSED_MARK, proposedMarkOf, handsOnAsProposed } from './review';
export type { OwProposedMark } from './review';
// The lens profile (schema-dist profiles/lens.md): a saved way of reading a world, a Construct with
// supertype Lens whose links are its anchors and whose x_lens is the recipe, and the one resolution every
// reader agrees on. Its date table, and an element's date as the table reads it.
export { isLens, isTemplate, lensesInUse, resolveLens, DATE_FIELD, dateOf } from './lens';
export type { OwLensReader, OwLensWorld, OwLensOptions, OwLensReading, OwLensMail, OwLensCutReason } from './lens';
// The lens profile's graph section: a reading of a world as nodes and edges, for the same reader.
export { worldGraph, degreeOf, outDegreeOf } from './graph';
export type { OwGraphOptions, OwGraphMark, OwGraphCutReason, OwGraphNode, OwGraphEdge, OwWorldGraph } from './graph';
// The names profile (schema-dist profiles/names.md): a world's own words for the types, x_names on the World.
export { typeWord } from './names';
export type { OwNamesMap, OwWordPair } from './names';
// The address profile (schema-dist profiles/address.md): an element's three spellings (the site's address
// and the two ow:// text forms) and a world's own, with an optional moment and lens, written and read.
export { elementAddress, parseOwLink, OwAddressError } from './address';
export type { OwAddress, OwAddressReading, OwAddressForm, OwAddressReason } from './address';
// The Open with menu: the rows that open a world or an element in a tool, each with its word, from the
// OnlyWorlds tools list (baked at this release as TOOLS).
export { openersFor } from './openers';
export { TOOLS } from './tools.generated';
export type { OwTool, OwToolOpen, OwToolNeeds, OwOpener, OwOpenerKind, OwOpenerState, OwOpenerSurface } from './openers';
// The door history: which tools wrote an element, newest first, from its doors field (or its last write),
// and where each entry wrote it, in the Open with menu's words.
export { doorsOf, doorWhere } from './doors';
export type { OwDoor } from './doors';

// Canonical element colour palette (colour groups and hexes generated from the distribution; hexes CVD-validated).
// The FAMILY names are the pre-4.102.0 words, deprecated, and leave in 5.0.
export { ELEMENT_GROUPS, GROUP_COLORS, GROUP_ORDER, groupOf, elementColor } from './v2';
export { ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf } from './v2';
export type { ElementGroup, ElementFamily } from './v2';
// The link a drag between two types writes (the distribution's pairs.json, baked at this release), either order
export { dragField } from './drag';
export type { OwDragField } from './drag';

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
  WORLD_FILE_MEDIA_TYPE,
} from './world-file';
export { nfc } from './nfc';
export { simpleCaseFold } from './case-fold';
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

// A draught as plain text: one Character's context packet (draught()) as the text to paste, the
// same byte for byte as the Python package's draught_text
export { draughtText } from './draught-text';

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
