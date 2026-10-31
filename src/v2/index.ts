/**
 * keel v2 engine absorbed from an earlier v2 client (ow-v2-client v0.9.0),
 * wire-corrected against live staging fixtures 2026-07-18.
 *
 * Public barrel for the v2 dialect — since 4.0 the only dialect in the package.
 * Re-exported from the package root under v2-scoped names (OwV2Client + Ow* types).
 */

export { OwV2Client, parseErrorEnvelope, FILE_EXTENSIONS, fileKindOf } from './client';
export { pkceChallenge, base64url } from './oauth';
export type { OwSignInStorage, OwSignInBegin, OwSignInBegun, OwSignInComplete, OwSignInResult } from './oauth';
export { OwApiError, OwPreconditionFailedError, OwProposedError, OwStaleProposalError, OwNetworkError, OwSignInError, errorFromResponse } from './errors';
export type { OwAuthErrorCode, OwSignInReason } from './errors';
export { detectKeyKind, isDemoKey, kindCanWrite, pinExpectation } from './keys';
export type { OwKeyKind } from './keys';
export { ELEMENT_TYPES, SPATIAL_TYPES, AGENT_DOORS, isAgentDoor, isKnownOf } from './types';
export {
  ELEMENT_GROUPS, GROUP_COLORS, GROUP_ORDER, groupOf, elementColor,
  ELEMENT_FAMILIES, FAMILY_COLORS, FAMILY_ORDER, familyOf,
} from './palette';
export type { ElementGroup, ElementFamily } from './palette';
export { FIELD_ACRONYMS, fieldLabel } from './labels';
export type {
  ElementType, OwElement, OwElementBase, ListParams, OwBulkItem, OwBulkResponse,
  OwBulkItemResult, OwErrorBody, OwChange, OwChangesPage, OwClientConfig,
  OwLinkEdit, OwMediaTicket, OwPage, OwRemovalTicket, OwRemovedImage, OwUploadedImage, OwWorldMeta, OwWorldPublicPage,
  OwWorldOrigin, OwWorldSource, OwWorldProducer,
  OwFileKind, OwFileAddedBy, OwFileRow, OwWorldFileRow, OwWorldFiles, OwFileTicket, OwUploadedFile, OwFileDownload,
  OwJoinPreview, OwJoinedMembership, OwAskAnswer, OwAllowance, OwMe, OwFrontDoor, OwMySeat, OwReadingAids, OwServedReadingAids, OwReadingAidsCharter, OwReadingAidsGuide, OwReadingAidsDomain, OwReadingAidsHub, OwMember, OwMemberRole, OwWorldLink, OwCreatedWorldLink, OwSeat, OwSeatCreated, OwMemberLenses, OwAccountWorld, OwMintedKey, OwDraught, OwDraughtCompact, OwDraughtPolicy, OwDraughtComponent, OwDraughtItem, OwDraughtLens, OwWorldLenses, OwWorldLens, OwWorldLensReading, OwJoined, OwAgentJoined, OwPlayerJoined, OwSignedIn,
  OwSortRef, OwSortNote, OwSortRow, OwSortMakeRow, OwSortAddToRow, OwSortLinkRow, OwSortAskRow, OwSortAnswer,
  OwWriteDoor, OwChangeUpsert, OwChangeDelete, OwDeleteReason, OwHiddenRow, OwResyncReason,
  OwProposal, OwProposalState, OwProposalList, OwProposed, OwProposalAccepted, OwProposalConflict, OwProposeInput, OwProposalQuery, OwWorldProposalQuery,
  OwProposedNewElement, OwWorldProposalRow, OwWorldProposalList, OwReviewInput, OwReviewed,
  OwCreateAccountWorldInput, OwCreatedAccountWorld,
} from './types';
export {
  ELEMENT_LABELS, ELEMENT_SECTIONS, ELEMENT_ICONS, FIELD_SCHEMA, PUBLIC_FIELDS,
  ONLYWORLDS_VERSION, getElementIcon, getElementLabel,
} from './constants';
export type { FieldType, FieldInfo, SectionInfo } from './constants';
