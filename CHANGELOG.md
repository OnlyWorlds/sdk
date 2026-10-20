# Changelog

All notable changes to `@onlyworlds/sdk`. Maintained from 3.1.0 onward;
earlier history lives in git log only.

## [Unreleased]

## [4.35.0] - 2026-10-20

### Added

- **`createWorldLink(worldId, { preview })`** and `preview` on `OwWorldLink` (keel #422 PR 1, live 2026-10-20): a person or player link with `preview: true` is `/join/<world_id>#<code>`, so a chat that unfurls it shows the world's name and picture; the code stays in the fragment. Absent means off, as keel rules for the API; `true` on an agent link is 422, param `preview`. The wire gate failed on production's document until this release.

## [4.34.0] - 2026-10-20

### Added

- **`fieldLabel(name)`** and **`FIELD_ACRONYMS`**: a field name as the words a tool shows, by the house rule (OW Style, the Captain 2026-10-20): sentence case, acronyms kept wherever they fall (`birth_date` → "Birth date", `image_url` → "Image URL"). Seeded from Atlas's `humanizeFieldName` as of 1.59.1, so Atlas, Lantern and Council read one copy (h63 #8109, #8119). The name is taken as given: a tool that hides an extension prefix drops it first.

## [4.33.1] - 2026-10-19

### Fixed
- An `agent: true` client's file uploads now declare it: `createFileTicket` (and so `uploadFile`) sends
  `X-OW-Agent`, the one files route keel's document lists it on (keel PR 95), so the file reads
  `added_by.agent: true`. The other files routes and the upload host get no such header.

## [4.33.0] - 2026-10-19

### Added
- `FILE_EXTENSIONS` (every extension a file on an element may end in, to its kind: keel's list, `.yml` and
  `.markdown` included) and `fileKindOf(name)` (the kind, or `undefined`), so a file picker's accept list reads
  the SDK's instead of a copy (Atlas, h20 #7841).

## [4.32.0] - 2026-10-19

### Added
- **Files on elements** (keel #393), for Atlas's file list on an element:
  - `listFiles(type, id)`: the element's files, newest first (`OwFileRow`: `id`, `name`, `kind`,
    `size`, `label`, `added_by` with `name`, `membership` and `agent`, `added_at`), as keel sends them.
  - `uploadFile(type, id, file, { name?, kind?, label?, ticket?, onProgress? })`: a ticket from the API,
    then the bytes to the upload host, as `uploadImage` does. Takes a File, Blob, ArrayBuffer or
    Uint8Array; the name is a File's own unless given; the kind comes from the name's extension
    (`.yml` is yaml, `.markdown` is md; anything else not taken is a TypeError before any request).
    `onProgress(loaded, total)` reports the bytes sent through XMLHttpRequest where there is one (a
    browser); elsewhere it is called once, at the end. Returns the host's 201 (`OwUploadedFile`).
  - `createFileTicket(type, id, { name, kind?, size, label? })`: the first step alone. No
    Idempotency-Key, by keel's rule.
  - `fileDownloadLink(type, id, fileId)`: the link (`url`) and when it stops working (`exp`, 5 minutes
    on); the link is the credential, so fetch it when the file is opened and don't keep it.
  - `removeFile(type, id, fileId)`: the world's owner or whoever added the file.
  - `worldFiles()`: every file the key may see, with `used_bytes` and `cap_bytes` for "41 MB of 250 MB".
  - `err.isFileTooLarge` (413 `file_too_large`, over 25 MB) and `err.isFilesFull` (403 `files_full`, the
    world's 250 MB has no room). The world's 200 file tickets a day use up as `err.isQuotaExceeded` (429,
    with `retryAfter`), as image tickets do. The upload host's refusals (409 `exists`, 415
    `unsupported_type`, 401 `ticket_*`) arrive as `OwApiError` with their codes, as the image edge's do.
  - Types: `OwFileKind`, `OwFileAddedBy`, `OwFileRow`, `OwWorldFileRow`, `OwWorldFiles`, `OwFileTicket`,
    `OwUploadedFile`, `OwFileDownload`.
  - An `agent: true` client sends no `X-OW-Agent` on the files routes: keel's document declares it
    on the element writes only.

## [4.31.0] — 2026-10-18

### Added
- **Signing in with a password** (keel #211): `signInWithPassword({ email | username, password, tokenName })`
  turns an email address (or username) and password into a new account token (`ow_a_`) for this device,
  named `tokenName`, the name the account's tokens page lists it under. It signs in at keel's sign-in service
  (`{baseUrl}/auth/app/v1`), mints the token with that session at `POST /account/tokens`, then ends the
  session, whether the mint worked or not. Only the token comes back (`OwSignedIn`: `token`, `id`, `name`,
  `last4`); the password is sent once and held nowhere. Works on a client with no key, and sends no key
  whatever the client holds. Exactly one of `email` and `username`, else a TypeError before sending.
- `OwSignInError`, with a `reason`: `invalid_credentials`, `email_unverified`, `rate_limited` (with
  `retryAfter` when keel sends it), `offline`, `mint_failed` or `failed`, plus keel's `status` and `code`.
  The password is never in its message or properties. For Atlas's sign-in (atlas #387) and Lantern, which
  carried its own copy. The session's end is cut off after five seconds, so a hung network never holds a
  sign-in whose token is already made. Checked live on production (a sign-in, the token reading the
  account's worlds, revoked and read back as `key_revoked`).

### Changed
- `me()`'s doc names the player kind (keel #353).

## [4.30.1] — 2026-10-16

### Fixed
- **`changes()` and `changesAll()` hand back every cursor as a string**, as `OwChangesPage.cursor` has
  always said. keel sends the cursor of a page at the head of the feed (an empty page, for any key but
  a guest's) as a number, and it passed through as one: a walk of an up-to-date world returned
  `{ cursor: 818 }`, so a cursor stored and compared as a string could miss. `changesHead()` already
  did this. Found on production with a demo key.

## [4.30.0] — 2026-10-16

### Added
- **A friend with only a link** (keel #353, D111):
  - `redeemJoin(code, { name?, agentName? })`: redeems a join code that needs no account, at `POST /join`,
    sending no credential whatever key the client holds. The answer's `kind` tells the two apart:
    `OwPlayerJoined` (a read key, `ow_r_`, no PIN, and the Character the player reads as) or
    `OwAgentJoined` (a seat's write key, secret and `.env` lines). Shown once; the code is spent, so a
    lost answer means a new link. Every bad code is one 404.
  - `createWorldLink(worldId, { reader: 'player', character? })`: a player link, guest only; `character`
    is a Character's id or `new` (the default). `OwWorldLink.character` names it on the list.
  - `player` joins the `kind` of `OwMe` and `OwMember`.
- **A client with no key**: `apiKey` is optional. `new OwV2Client()` (or an empty key) has `keyKind: 'none'`
  and can call `health`, `previewJoin` and `redeemJoin`, which is what a friend with only a link has; any
  other call is a TypeError before anything is sent. Until now a key was required even for the routes
  that send none.

## [4.29.0] — 2026-10-16

### Added
- `rekeySeat(worldId, seatId)` (keel #355 piece 3, D108): a new key and secret for a seat whose AI lost
  its own, by its sponsor or the world's owner. The old key and secret stop at once; the answer has
  `createSeat`'s shape (`OwSeatCreated`: `key`, `pin`, `env`), shown once. No Idempotency-Key, by keel's
  rule: if the answer is lost too, ask for another.

### Changed
- `createSeat`'s doc names `rekeySeat` as the way back from a lost answer.
- `OwApiError.param`'s doc: `API-Pin` on a 401 PIN refusal (keel #357, D107), not only a 422/400's field.

## [4.28.0] — 2026-10-16

### Added
- **Seats for your own AI** (keel #355, D106), on an account token (`ow_a_`):
  - `createSeat(worldId, { name, role?, character? })`: a seat for your own AI in a world you own or
    belong to, with its own write key and `ow_s_` secret and no join link. You answer for it. `role` is at
    most your own; `character` is `new` (default), `none`, or `mine` (it plays the Character you play).
    The answer (`OwSeatCreated`) carries `key`, `pin` and the `.env` lines in `env`, shown once.
  - `listSeats(worldId)`: the seats you can see (yours, or every seat for the world's owner), as `OwSeat`
    rows with their `sponsor`, no keys.
  - `removeSeat(worldId, seatId)`: its sponsor or the world's owner removes it; its key and secret stop.
  - No Idempotency-Key on `createSeat`, by keel's rule (a replay would keep the key). A lost answer:
    `listSeats` shows the seat, `removeSeat` it and make another.

## [4.27.2] — 2026-10-16

### Fixed
- **`bulk` mints an id for each element that has none, as `create` does.** It sent id-less elements
  bare and keel minted them. With an `idempotencyKey`, each id is now derived from the key and the
  element's position in `items` (the ids the Python package mints), so the same key and items send the
  same body from either client, and a resend after keel's 24-hour replay window rewrites the same
  elements instead of creating new ones. Without a key, a fresh UUIDv7 each. Ids you pass are kept, and
  your items are not changed. Found by Quillon's parity audit of the Unity SDK (h37 #5794).

## [4.27.1] — 2026-10-16

### Fixed
- **A retried `create` with the same `idempotencyKey` now replays instead of failing.** `create` minted a
  fresh id on every call, so a retry of an id-less element sent a different body and keel answered 409
  `idempotency_error`. With a key and no id, the id is now derived from the key (a UUIDv5, the same id the
  Python package mints), so the retry sends the same body and gets the first answer back. Without a key,
  a fresh UUIDv7 as before; an id you pass is kept.
- `create`'s doc said a keyed retry "rewrites the same element"; keel's replay writes nothing. Found by
  Quillon's parity audit of the Unity SDK (h37 #5764).

## [4.27.0] — 2026-10-16

### Added
- `OwApiError.isIdempotencyInFlight` (keel #307, D105): a request with the same Idempotency-Key is still
  running (409 `idempotency_in_flight`, `retryAfter` 1). Nothing was written by this one; send again with
  the same key and body after `retryAfter` and it replays the first answer. `isIdempotencyConflict` stays
  the different-body case only. The client still does not retry for you.

## [4.26.0] — 2026-10-15

### Added
- **The door of every write** (keel #299, D104; keel 7c1b493). An opt-in
  `agent: true` on `OwClientConfig` sends `X-OW-Agent` on every element write (create, upsert,
  patch, delete, editLinks, bulk: the operations keel's document declares it on; never on reads,
  account routes or the image edge); keel records such writes as `declared`, agent-made, and stores only that the header was
  there. Off by default: it describes the caller, so a tool people use never sets it.
- `OwElementBase` gains the read-only `changed_by` (the membership of the last write) and
  `changed_via` (its door: `seat`, `mcp`, `declared`, `api`, `v1`, `sync`, `server`); a `/changes`
  delete op gains `deleted_by` and `deleted_via`. Keel drops them from a write body, like `created_by`.
- `OwWriteDoor`, `AGENT_DOORS` and `isAgentDoor(door)`: seat, mcp and declared are agent-made.
- The two kinds of `/changes` item are named types, `OwChangeUpsert` and `OwChangeDelete` (`OwChange` is their union, as before), and both declare `change_seq`, which keel always sends and the type never named.

## [4.25.0] — 2026-10-15

### Changed
- **`OwWorldMeta` types every field keel's `World` declares** (it named four): the description and
  picture, the calendar (`time_format_names`, `time_format_equivalents`, `time_basic_unit`, the three
  `time_range_*`), the three unit labels, `public_read`, `owner_character`, `created_at`, and new
  **`agent_narrator_rule`** (keel #298, D103: whether a Narrative written through an agent seat is
  narrated by that seat's own Character; read-only, set on the world page). Past `id` and `name`
  they stay optional so code that builds a world meta keeps compiling; keel always sends all of them.
  `updated_at` and `created_at` read `string | null`, as the document says. Assembly's wire gate now
  holds this type to `World` (it had held only the PATCH body). Council and Lantern type-check on it.

## [4.24.0] — 2026-10-15

### Added
- **A world's invite links** (keel C1, 48c10d4), on the owner's account token (`ow_a_`):
  `createWorldLink(worldId, { reader, role?, days?, inviterName?, withCharacter? })` answers the
  new link with its `code`, `link` and the one `line` to send (the code is in this answer only:
  keel keeps a hash); `listWorldLinks(worldId)` the links without codes, each with its `status`
  and `uses`; `revokeWorldLink(worldId, linkId)`. Types `OwWorldLink`, `OwCreatedWorldLink`. A
  non-owner, and a world that doesn't exist, get 404; a world key is a TypeError before sending.
  For Lantern's Invite someone (Temper, h29 #5152).

### Changed
- `acceptJoin`'s doc comment and the README: accepting needs no account PIN for any role (keel
  #297, ed73c90), so its refusals are 404 and 409 `already_member`; `pin_required` now belongs to
  minting a write key for the membership. `isPinRequired` stays.
- Doc comments say "token rating" for the account's daily budget (`ask`, `sort`, `allowance`,
  `OwAllowance`, the answers' `token_rating`), as the README did in 4.23.0; the docs site's
  generated reference reads them. No code change.

## [4.23.0] — 2026-10-14

### Deprecated
- **`TokenResource.consume()`, `getAccessKey()`, `revokeSession()`, `revokeAllSessions()`**: keel
  serves none of these routes (each answers 404 `not_found` on production; `accounts/token_api.py`
  mounts only `status/` and `encryption-info/`). Spending is server-side, in the route that does the
  work (the Council's acts through keel's council proxy, keel #274, Skeld's ruling h37 #4632), and
  `OwV2Client.allowance()` reads the token rating. They stay callable and leave in 5.0. A 404 from
  any token route now says what keel serves instead of "an older server". Found by Assembly's wire
  gate, which until now never drove this class (its routes are not in keel's document).

### Changed
- README and docs: "token rating" is the one word for the account's daily budget (the Captain,
  h37 #4642, OW Infra #273). Names in the API (`allowance()`, `/account/allowance`) are unchanged.

## [4.22.0] — 2026-10-14

### Added
- **`client.me()` and `client.members()`**: GET /me (who this world key is: world, scope, kind,
  role, membership id, Character) and GET /members (the roster's rows, unwrapped from `{ data }`).
  Lantern reads a player's role from /me by hand today. Types `OwMe`, `OwMember`, typed from
  keel's declared schemas and held to them by Assembly's wire gate. An account token is a
  TypeError before sending; the tests fail with that guard removed, or with the rows left
  wrapped.

### Changed
- The calendar kernel is the SDK's own: Atlas 245aad3 deleted its `core/calendar.ts` and imports
  this one (Temper, h37 #4472), so the copy record (`src/calendar/SOURCES.json`) and the re-copy
  script (`codegen/atlas-calendar.mjs`) are gone. A kernel change is an SDK release now. No code
  change.

## [4.21.0] — 2026-10-14

### Added
- **`client.allowance()`**: GET /account/allowance (keel 872431f, Skeld h37 #4308), the
  account's daily AI allowance read without spending: `token_rating`, `tokens_used_today`,
  `tokens_remaining`, `resets_at` (the next midnight UTC). Account token only, like ask and
  sort. Type `OwAllowance`, held by Assembly's wire gate to the route's declared schema, as
  `OwAskAnswer`, `OwSortAnswer` and `OwJoinPreview` now are to theirs.

### Fixed
- README and AGENTS.md no longer say a sort counts as one ask: since keel a6244db both spend
  tokens from the allowance.

## [4.20.0] — 2026-10-14

### Added
- **World calendars**, Atlas's calendar code in the SDK so Lantern can name dates (Temper,
  h37 #4284): `formatStep`, `formatYearLabel`, `breakdownStep`, `parseDate` and the rest of
  Atlas's `src/core/calendar.ts` (Atlas 02d6a6d), plus `worldCalendars`,
  `resolveCalendarLens` and `readCalendarValue` from its `calendar-lens.ts`, on any element
  shape. `CALENDAR_FIELD` is `atlas_calendar`: Atlas owns the field, its meaning and its
  writes, and other tools read it (Skeld, h37 #4286).
- `src/calendar/calendar.ts` is Atlas's file byte for byte, recorded in
  `src/calendar/SOURCES.json` (Assembly's copy-drift); `codegen/atlas-calendar.mjs` re-copies it
  and ports Atlas's 48 kernel tests (TypeScript's transpiler, a five-matcher `test/expect.mjs`
  over node:test). Watched failing: a planted `floorMod` edit failed two tests and the record
  (EDITED); a lens edit failed its test. An app that imports none of it bundles none of it.

## [4.19.0] — 2026-10-14

### Added
- **`tokens_remaining` and `token_rating` on `OwAskAnswer` and `OwSortAnswer`**: since keel
  a6244db (Skeld, h37 #4233) ask and sort spend from the account's daily token rating, one
  meter with the Council. `remaining` stays a count of answers: how many more calls of this
  size fit in what is left today (keel 504437b), never tokens. Typed from keel's code
  (`accounts/ask.py`), since its OpenAPI document gives these answers no schema.

### Changed
- **Custom fields (`x_*`) are in the lookup and on the card.** `buildWorldIndex` finds an
  element by its custom text and numbers, and `renderElement` (so `buildAskContext`) shows
  each one by its own name: `x_eye_colour` reads `eye colour: grey`; an id in one is a link,
  by name; a long value is cut like a description. `atlas_*` machinery stays out, and so do
  object values (a tool's state). Lantern shows and edits custom fields now, so Ask can answer
  what find already could (Temper, h37 #4069). The trial's lookup (`dossiers/lantern-ask`)
  still skips them; parity holds on its ten questions, whose fixture has no custom text.
- The lookup's stopword set is an array literal, so bundlers mark it pure and drop it from
  apps that never call the lookup (451 bytes; Temper, h17 #4247).

## [4.18.1] — 2026-10-12

### Changed
- **Schema repinned to schema-dist v0.32.0-dist.23** (same canonical 00.32.00). The one
  generated change is the `id` doc comment: a UUID, new ids minted as uuidv7, earlier uuidv4
  ids still valid. No type changes. The vendored dist gains `walk/lint_folder.py`.
- README and AGENTS.md describe `sort()`.

## [4.18.0] — 2026-10-12

### Added
- **`client.sort({ worldId, notes, slice })`**: POST /account/sort, ask's sibling (Temper for
  Lantern, h37 #3599; Skeld's route, #3591, #3594, #3596, #3597). Notes as words or
  `{ text, image_url }`; the slice is the app's own lookup. Rows of four kinds come back to
  review (`make`, `add_to`, `link`, `ask` with an optional `then`) and `not_proposed` with
  reasons; nothing is written. One allowance with `ask`, and the same refusals. Types
  `OwSortRef`, `OwSortNote`, `OwSortRow` and its four kinds, `OwSortAnswer`. Built against
  keel PR #4 (90961fa, Skeld's final for the types, #3618), released once it was on keel
  main and in production (#3663): verify-sdk-wire PASS 1,111 against production's document.

## [4.17.0] — 2026-10-12

### Added
- **`changesAll` returns `epoch`** beside `cursor` and `head`: the last page's, so a full walk
  says which view epoch it ran under (a guest's integer; `null` for other keys or a keel
  without the field) and the first poll after it needs no extra walk to learn it. Live on
  Moppetopia: a full walk of 465 changes returns `{ cursor, head: 818, epoch: null }`. The first
  tests of `changesAll`'s return value (Temper, h29 #3534).

## [4.16.0] — 2026-10-12

### Added
- **`epoch` on the feed** (keel 979eb0c). `OwChangesPage.epoch` and `changesHead()`'s
  `epoch`: a guest's view epoch (an integer), `null` for every other key. It moves when what a
  guest may see changes, even with `head` unchanged, so a poll walks when either `head` or
  `epoch` moved; nothing needs to read inside the cursor. `changesHead()` answers
  `epoch: null` from a keel without the field. Checked live on Moppetopia (the head read and a
  page both carry `epoch: null`). The wire gate now holds `OwChangesPage` and `OwBulkResponse`
  to keel's `ChangesPage` and `BulkResult` (keel #108), and failed on 4.15.0 for the missing
  `epoch` before this release.
  Published from tag `v4.16.0`; the workflow's read-back gave up before npm showed the
  version, so the tarball (shasum `d08de22b`) was read back by hand against a build of the tag.

## [4.15.0] — 2026-10-12

### Added
- **`changesHead()`**: `GET /changes?head=true`, the feed's position now without a page
  (keel reads no element). Returns `{ head, cursor }`: `head` is the world's `change_seq`,
  `cursor` a position to pass as `since` that re-sends nothing (a guest's carries its view's
  epoch). The cheap "anything new?" for a poll: compare `head` with the head you last applied
  and walk `changesAll` only when it moved. keel sends the owner's cursor as a number; it comes
  back as a string, like every cursor the SDK hands out. Checked live on Moppetopia: a walk
  from the returned cursor brings nothing. Asked for by Lantern's 20-second poll (Temper,
  Skeld's S15).

## [4.14.0] — 2026-10-12

### Fixed
- **The co-builder role is `co_builder` on the wire.** `OwJoinPreview.role` and
  `OwJoinedMembership.role` listed `'co-builder'`, which is only the label keel shows (keel
  `MemberRole.CO_BUILDER = "co_builder"`). The types were open, so nothing broke at runtime, but
  a comparison written from them would never match. Caught by Temper from Lantern's fakes.

### Added
- `OwMemberRole` (`'co_builder' | 'contributor' | 'guest'`, open), the type both now use.

## [4.13.0] — 2026-10-12

### Added
- **Ask your world (keel #159).** `client.ask({ worldId, question, context })` sends a
  question to keel's AI proxy with the account's `ow_a_` token (a world key is a `TypeError`
  before sending) and returns `OwAskAnswer` (`answer`, `model`, `stop_reason`, `usage`,
  `remaining`). The answer comes from `context` only, or is "The world doesn't say.".
  `buildAskContext(items, index)` turns the elements the user sees (lookup hits or plain
  elements, in the caller's order, never re-looked-up) into that `context` within keel's
  limits (`ASK_LIMITS`: 8 items, 2,000 characters each, 12,000 in all, counted in characters
  as keel counts them) and says what it did: `kept`, `dropped` (past the 8th, or from the first
  one the total cannot hold, so what is sent is always the top of the list) and `truncated`.
  New getters: `isQuotaExceeded` (429; `retryAfter` runs to midnight UTC), `isAskUnavailable`
  (503), `isAskFailed` (502). keel's document gives no request schema for `/account/ask`, so
  the body (`world_id`, `question`, `context`) is read from keel's code (`accounts/ask.py`).
  Not yet run live: no crew session holds an account token.

## [4.12.0] — 2026-10-12

### Added
- **Joining a world by link (keel #212).** `previewJoin(code)` reads what a join code holds
  without using it (`OwJoinPreview`: `reader`, `world`, `invited_by`, `owner_character`,
  `role`, `with_character`, `expires_at`) and sends no credential, whatever key the client
  holds. `acceptJoin(code)` accepts an invite link as the account behind the client's `ow_a_`
  token and returns the new membership (`OwJoinedMembership`, `roster_character` included);
  a world key is a `TypeError` before anything is sent. New getters on `OwApiError`:
  `isNotFound` (every bad code is one 404), `isAlreadyMember` and `isPinRequired` (the two
  409s, told apart by code). Shapes read from keel's code (`accounts/join_api.py`,
  `accounts/api.py`), since the OpenAPI document gives no response bodies for these routes.
  Checked live: a bad code on production answers `isNotFound`. A real accept has not been
  run from here (no account token); Lantern's door is its first live use.

## [4.11.0] — 2026-10-12

### Added
- **World lookup.** `buildWorldIndex(elements)`, `lookupWorld(index, question, { limit })` and
  `renderElement(element, index)` find the elements a plain-language question is about, in a
  world held in memory: no model, no network, a few milliseconds. Ranking: names and short
  forms first, then name words, supertype and subtype, one link step in both directions, then
  other text and numbers (always below any name hit). Each hit says why it matched.
  `renderElement` gives a compact text card with links by name, which is what a model reads
  when one phrases the answer. Measured on two real worlds (Assembly's Lantern Ask trial):
  the answer was in the first three results for 60 of 60 questions that name their subject
  and 17 of 24 held-out questions that only describe it; this code returns the same top 8
  as the trial's on all 100 questions. Names in any script are matched (Chinese and Japanese
  only where spaces or punctuation separate the words: there is no word splitting). The question words
  that steer the link step ("where", "rules", "allies") are English.
- **Photo preparation.** `preparePhoto(blob, { maxSide, quality, maxBytes })` shrinks and
  converts a picture in the browser before `uploadImage`: longest side 2048 by default, webp at
  quality 0.82, from the upload page's converter. A browser that cannot encode webp returns a
  PNG when asked; the result's real type is checked, and a photo then falls back to JPEG while a
  PNG stays PNG. When re-encoding would only make a file bigger, the original is kept.
  `planPhoto` is the pure part (sizes and type order). Walked in Chromium, WebKit and Firefox
  (a 4032×3024 photo became a 2048-wide webp of about 0.5 MB) and with webp encoding forced off.
  Needs a browser; in Node it throws a `TypeError` that says so. `PHOTO_TYPES`,
  `PHOTO_MAX_BYTES` are keel's accepted types and its 15 MB limit.

## [4.10.0] — 2026-10-11

### Added
- **World files.** `readWorldFile(bytes, { maxBytes, maxEntries, skip })` opens a `.zip` that
  holds one world folder (Folder Format §4.1, a portable copy) and returns
  `{ worldId, name, world, files }`; `writeWorldFile(files, topDir)` makes one. Bytes in,
  bytes out: no DOM or file system, so it runs in the browser and in Node. Absorbed from
  Atlas's reader (Temper's), so Atlas, Lantern and scripts open one file the same way.
  The reader refuses before returning anything, with **`OwWorldFileError`** and a `reason`:
  `unsafe_path` (climbs out, absolute, a drive, a backslash, an empty part, a path that is
  both a file and a folder), `too_big` / `too_many` (1 GiB and 200,000 files uncompressed,
  `WORLD_FILE_MAX_BYTES` / `WORLD_FILE_MAX_ENTRIES`; the inflated bytes are counted again,
  since a declared size can lie), `not_a_world` (no `world.json`, unreadable, no string
  `id`), `more_than_one` (two worlds, loose files beside the folder, a nested world.json),
  `not_openable` (not a zip). Archive junk (`__MACOSX`, `.DS_Store`, `Thumbs.db`) is
  dropped. `world.json`'s `api` (the link and its key) is removed on read and on write; a
  `world.json` without one keeps its exact bytes. The writer refuses a `world.json` that will
  not parse rather than zip it raw. Every world in a real Atlas folder (15, up to 3,832
  files) round-trips byte for byte.
- **First runtime dependency**: `fflate` (zip, no dependencies of its own, the one Atlas
  uses). Tree-shaken away for code that never calls the world-file functions.

## [4.9.0] — 2026-10-11

### Added
- **Only if unchanged (keel #210).** `patch(type, id, partial, { ifMatch })` and
  `editLinks(type, id, field, edit, { ifMatch })` send `If-Match: "<change_seq>"`: the write
  lands only if the element is still at that `change_seq`. When it has moved, nothing is
  written and the call throws **`OwPreconditionFailedError`** (412 `precondition_failed`), an
  `OwApiError` whose `current` is the element as it is now, so the client's re-read is free.
  `OwApiError.isPreconditionFailed` names the case. The server never merges; the client
  compares the copy it edited from with `current`. An `ifMatch` that is not a whole number
  throws `TypeError` before anything is sent. Without `ifMatch`, nothing changes.
  Checked live on keel-staging: a matching token lands, a stale one is refused with
  `current` at the live `change_seq`, the refused write changes nothing, and the links
  route behaves the same.

## [4.8.1] — 2026-10-11

### Changed
- **Schema repinned `v0.31.0-dist.19` → `v0.32.0-dist.20`** (canonical 00.31.00 → 00.32.00).
  The standard's World gains `public_read`, the walk's first boolean field (`scalar_bool`).
  `OwWorldMeta` already carried `public_read` from `GET /world`; it stays read-only, since
  `PATCH /world` refuses it (flipping a world public is an owner-level act on
  onlyworlds.com). `ONLYWORLDS_VERSION` is now `'00.32.00'`. No element type, field or
  `FIELD_SCHEMA` entry changed.

## [4.8.0] — 2026-10-10

### Added
- **`removeImage(keyOrUrl, { ticket? })`**: removes one uploaded image. A removal ticket from
  keel (`POST /media/remove-ticket`, keel D91), then the removal at the ticket's `remove_url`
  with the ticket only, never the API key. Takes the object key or the whole `image_url`. The
  image's uploader or the world's owner key may remove it; the bytes go back to the uploader's
  storage. Elements keep their `image_url`: clear it yourself.
- **`createRemovalTicket(key)`** and the types **`OwRemovalTicket`** (`ticket`, `remove_url`,
  `exp` in unix seconds, `key`, `referenced`: how many elements still show the image) and
  **`OwRemovedImage`** (`removed`, `bytes`, `cache`). Refusals arrive as `OwApiError`: keel's
  `permission_error`, `not_found`, `removal_in_flight` and `upload_pending` (both 409 with
  Retry-After); the edge's `ticket_expired`, `ticket_used`, `ticket_invalid`, `not_removable`,
  `remove_failed`.

## [4.7.3] — 2026-10-10

### Changed
- **Schema repinned `v0.31.0-dist.18` → `v0.31.0-dist.19`** (canonical unchanged, 00.31.00).
  Two generated values move: `ELEMENT_ICONS.zone` `architecture` → `pentagon`,
  `ELEMENT_ICONS.marker` `location_on` → `polyline` (Material Symbols names; Marker no longer
  shares the pin glyph). No field, type or `FIELD_SCHEMA` entry changed. The vendored tree grows
  from 31 to 69 files (dist.19 adds `schema.json` and an example world); 69/69 hashed against
  the pinned manifest.
- **`AGENTS.md` re-read against the new pin** (its gate fired on the repin, as designed); its
  wire facts hold, its "Current as of" line moves.

## [4.7.2] — 2026-10-09

### Changed
- **README first run** finds Admiral Fluffington by name (the demo world's default list order moves with every edit, so "the first three" could not be promised); the npm page shows the corrected output.
- **Schema repinned `v0.30.2-dist.16` → `v0.31.0-dist.18`** (canonical **00.31.00**).
  `ONLYWORLDS_VERSION` is now `'00.31.00'`. The World gains three optional free-text settings,
  `length_unit`, `mass_unit` and `distance_unit`; the nine element fields that promised "world
  LENGTH / MASS / DISTANCE units" now name them in their descriptions (Ability `range`, Character
  and Creature `height` and `weight`, Creature `speed`, Location `elevation`, Object and Species
  `weight`). No element field shape and no `FIELD_SCHEMA` entry changed. The world body is not
  typed per field (`OwWorldMeta` is open), so `getWorld` returns the three keys and `patchWorld`
  sends them with no code change; a test says so.

## [4.7.1] — 2026-10-08

### Changed
- **README rewritten**: install, a first run against the public demo world (its output shown,
  run as written), your own world with an agent seat for writes, then the reference. It no
  longer calls a `world` field in a payload an error: the API ignores it.
- Comments, the RFC and pin-file prose no longer name people or internal places.
- **Schema repinned `v0.30.1-dist.15` → `v0.30.2-dist.16`** (canonical **00.30.02**).
  `ONLYWORLDS_VERSION` is now `'00.30.02'`. Field descriptions move with the schema: Location's
  `rivalries` and `partnerships`, Marker's `order`, and Pin's `element` pair. No field shape and
  no `FIELD_SCHEMA` entry changed: canonical now requires only `name` on every type, which is
  what `FIELD_SCHEMA` already said, so its hand-made exception for the old Pin and Marker
  lists is gone. If the schema lists more than `name` again, codegen stops and asks for a
  ruling instead of dropping the list. 31/31 file hashes recomputed from the tag.

## [4.7.0] — 2026-10-08

### Added
- **`OwApiError.isResyncRequired`**: 409 `resync_required` from `/changes`. Guests can follow the
  feed since keel D79; when a guest's view or a key's role changes, its stored cursor is refused. Drop
  it, walk from zero, and replace the local copy rather than merging.

### Documented
- `uploadImage` accepts webp, png, jpeg and avif. 4.6.0's JSDoc and README also listed gif, which
  the edge refuses (415 `unsupported_type`); checked against the Worker's type table.
- `changes()`: the old rewind rule compared a stored cursor with `head`, which an opaque cursor
  cannot do; replaced with the reset rule (`isResyncRequired`).
- The doc comments of `OwClientConfig`, `create` and `uploadImage` are written for users: internal
  ruling numbers and test-harness notes are gone, and each opens with what the option or method does.
  The docs site's TypeScript reference is generated from these comments.

## [4.6.0] — 2026-10-06

Published from `e198298` (tag `v4.6.0`); the tarball was checked against a build of that commit.

Includes 4.5.1's documentation fixes: 4.5.1 was staged and never published.

### Added
- **`uploadImage(image, { key?, ticket? })`**: upload one image (webp, png, jpeg, avif;
  never SVG; 4.6.0's docs also said gif, which the edge refuses with 415) and get its permanent public URL. Two requests: a ticket from keel
  (`POST /media/ticket`), then the bytes straight to the edge at the ticket's `upload_url`
  (keel never sees them). Only the ticket goes to the edge, never the API key or PIN. An image
  larger than the ticket's `max_bytes` throws 413 `too_large` before anything is sent; the edge's
  refusals (`ticket_used`, `ticket_expired`, `bad_key`, `exists`, `unsupported_type`, ...) arrive
  as `OwApiError` with their code. Set the returned `url` as an element's `image_url` yourself.
  Checked live on 2026-10-06: one upload through keel's ticket to the edge (201), and the same
  ticket again refused with 401 `ticket_used`.
- **`createMediaTicket()`**: the first step alone, for callers that upload themselves (progress
  bars, say). Types `OwMediaTicket` and `OwUploadedImage`.

### Documented
- `ListParams.filter` lists what keel accepts now: exact `name`, and `characters=<id>` on every
  type with a `characters` link (keel D76d).

## [4.5.1] — 2026-10-05 (never published; shipped in 4.6.0)

Docs only: no code path changes.

### Documented
- **`isOwnerOnly`'s JSDoc in 4.5.0 was wrong about who sees `owner_only`.** It said owners and
  co-builders never see it. A member key, a co-builder's too, gets it on `PATCH /world`; only the
  owner's key is exempt (keel spec section 9; confirmed from keel's `patch_world`,
  2026-10-04).
- **`world_gone` is reserved.** `OwAuthErrorCode` and `isAuthError` still carry it, but keel never
  emits it: a deleted world's keys are deleted with it, so the key answers 401 `invalid_credentials`
  (2026-10-04; keel spec section 2). Found by the wire gate reading the SDK's own
  built file for the codes it keys on.

## [4.5.0] — 2026-10-04

What the staging write probes found on the wire (Python package, 2026-10-04): one new getter, and
three behaviours the server has always had that no client doc said. Additive; nothing is removed.

### Added
- **`OwApiError.isOwnerOnly`**: 403 `owner_only`, a contributor attempting a world-level change
  (`patchWorld`, publishing a show page). Owners and co-builders never see it. keel's OpenAPI
  document does not name the code yet (the schema side has that to close); the wire returns it.

### Documented
- **An atomic `/bulk` rollback still returns 201 slots** for the items that would have
  succeeded, with the ids and timestamps they would have had (keel spec: "counterfactual 201s").
  After `atomic: true` with `errors: true`, nothing was written. On `bulk()`, `OwBulkItemResult`
  and the README.
- **`name` is required as a key only**: `''` and `null` are accepted and stored as `''` (keel
  ruling 2026-09-28, spec §6; nameless Markers exist). On `create()` and the README.

## [4.4.0] — 2026-10-04

Membership, as far as the server has shipped it: who created an element, and the refusal a
contributor meets on someone else's. Additive; nothing is removed or narrows.

### Added
- **`created_by`** on `OwElementBase` (so on every element type): `string | null`, the id of the
  membership that created the element, `null` for the world's owner and for anything made
  before memberships existed (keel D72 phase 2, live 2026-09-28; keel spec §4). Read-only. The
  schema does not carry it (like `created_at` it is server bookkeeping), so the generator adds
  it to the wire base under the declared mapping. A write body that carries it has it dropped
  by the server, so the client does not strip it and a read body still round-trips.
- **`OwApiError.isNotAuthor`**: 403 `not_author`, a contributor changing, replacing, relinking
  or deleting an element someone else created. `/bulk` answers 200 and reports it in the item
  slot, so check the slot (documented on `OwBulkItemResult`).

### Fixed
- **`FIELD_SCHEMA` no longer marks `marker.map/zone/x/y/order` and `pin.map/element_type/element_id/x/y`
  as `required: true`.** The wire requires `name` and nothing else (rulings.yaml `nullable-by-default`,
  ruling 2026-07-28; keel's OpenAPI write schemas say `required: [name]`), but the schema files still
  list those fields and the generator copied the lists, so a form built from the table demanded
  coordinates the server never did. Found by comparing the SDK with keel's OpenAPI document (the
  new `verify-sdk-wire` gate). **If you read `required` from this table, marker and pin
  fields now read as optional**, which is what the server accepts. The generator notes the lists it
  ignores on every run and says when canonical stops carrying them.

### Not yet
- `me()` and `members()` wait for the server routes (keel's M2b). Nothing in this release
  guesses at their names.

## [4.3.0] — 2026-09-28

Errors you can act on: the two 409s told apart, and the busy server's `Retry-After`, in Node and
browsers. One getter narrows (see Fixed); nothing is removed.

### Fixed
- **`OwApiError.isIdempotencyConflict` no longer claims every 409.** keel sends two: 409
  `idempotency_error` (a key reused with a different body) and 409 `id_conflict` (the id is
  taken: a create with an existing id since D39, or a PUT / bulk id held by another world since
  D70). The getter was true for both, so an id conflict read as a key problem, and retrying with
  a fresh key could never help. It now matches `idempotency_error` only, and the new
  **`isIdConflict`** names the other. A caller who relied on the old catch-all for `id_conflict`
  should switch to `isIdConflict`. A 409 with no code (a proxy, a non-JSON body) now reads
  false for both. `/bulk` is unaffected: it answers 200 and reports a per-item 409 in the slot.

### Added
- **`OwApiError.retryAfter`** (seconds, or null) is parsed from `Retry-After`, as a delay or an
  HTTP date, and **`isBusy`** marks keel's 503 `server_busy` (admission control, keel D71: six
  requests at once per worker, up to 10 s of queueing, then 503 with `Retry-After: 5`). The client
  still never retries on its own; it gives callers what they need to back off. A malformed
  `Retry-After` is null, never "retry now". **Works in browsers too** since keel `4949406`
  (2026-09-28): every response exposes `Retry-After`, `Idempotent-Replay` and
  `X-OW-Schema-Version` over CORS (probed from an allowed origin), and keel reports that the
  admission gate's 503 now carries CORS headers, so a busy server reads as busy, not as
  `OwNetworkError` (keel's word; the 503 can't be triggered on demand to probe). Six tests; the
  four core ones watched failing on the previous `errors.ts`.

## [4.2.0] — 2026-09-28

Ids, honest filter docs, and the schema repin. Nothing is removed; no call needs to change.

### Changed
- **`create()` now mints an RFC 9562 UUIDv7** when the element has no id (was v4). The first
  48 bits are the creation millisecond, so ids this client mints a millisecond or more apart
  sort by creation (while the clock does not step backwards), which gives databases better
  index locality. **This holds within one client only**: worlds also hold v4 ids and legacy
  v1-server ids (`06x…`, which also carry version nibble 7 but put seconds first), so never
  order elements by id. For creation order use `created_at`; `change_seq` is last-write
  order. This is a **default, not a
  requirement**: a v4 or v7 id a caller supplies is still accepted as-is, and
  every id already stored stays valid. Keel mints v7 server-side too (ruling,
  2026-09-28). Pinned by six tests: version and variant, the big-endian timestamp above
  bit 32, fractional and pre-1970 clocks floored consistently, creation order across 50
  consecutive milliseconds, 1,000 distinct ids inside one millisecond, and the no-`crypto`
  fallback (asserting `Math.random` is actually used). Five injected defects (v4 nibble,
  32-bit truncation, a dropped random fill, a dropped variant mask, an unfloored clock)
  each fail the suite on every run, on Node 20 and 22. An independent reviewer's decoder agreed on 20,000 random timestamps and the 48-bit
  edges, and keel's `uuid7()` agrees on timestamp, version and variant for a pinned clock.
- **`elementColor()` on an unknown type now throws a `TypeError` that names the type.** It
  used to crash with `Cannot read properties of undefined (reading 'dark')`. Found while
  building a colour gate: atlas's own copy falls back to the `world` family for an
  unknown type, so swapping it for this export is not a pure re-export for that input, and the
  docstring now says so. Whether the package should fall back is left to its consumers.
- The generated field-schema comment no longer calls `maximum:` an open question or counts
  its occurrences (the count was 41; since 00.30.01 it is 15). The question was ruled on
  2026-07-29.
- **`ListParams.filter` JSDoc names what the server actually accepts**: `name__icontains`,
  `supertype`, `subtype`. It used to list `__in`, `__gte`, `__lte` and `__isnull`, copied
  from keel's spec, which described them but never built them. Probed live 2026-09-28: the
  three accepted keys answer 200; every other one, and `?ordering=`, answers 422.
- **Schema repinned `v0.30.1-dist.13` → `v0.30.1-dist.15`** (canonical unchanged, 00.30.01).
  Two generated values move: `ELEMENT_ICONS.institution` `business` → `account_balance`,
  `ELEMENT_ICONS.marker` `place` → `location_on` (both Material Symbols names). dist.15
  also adds `minimum: 0` to `ability.potency`; the walk does not surface bounds, so nothing
  generated changes for it. 31/31 file hashes recomputed from a fresh download.
- **`AGENTS.md` re-read against the new pin** (its gate fired on the repin, as designed).
  It still called the v1 client "frozen legacy" in this package; v1 was removed at 4.0.0.
  It now also names the wire behaviours keel deployed on 2026-09-28 (keel D70): the 64 KB
  extension cap, the three built filters and the `?ordering=` 422, 409 `id_conflict` for a
  PUT or bulk id that belongs to another world, and the 422 for unpaired surrogates. None of
  them needs client code.

### Also in this release (staged earlier)
- **`SCHEMA.md` now opens with its own provenance** (dist tag, canonical version, publish
  date — rendered from `schema-pin.json`, never the wall clock). It ships in the tarball
  and is read cold by agents outside this repo, where the pin file is not present; a
  generated reference that cannot name its source was the one remaining self-dating gap.
- **`AGENTS.md` carries a "Current as of" line, asserted by `codegen:check`** — the tag it
  names must match the pin or CI fails. A hand-maintained agent doc with an ungated date
  is how this repo's previous agent doc went a major version stale. Gate watched firing
  (tampered tag → exit 1, restored → 0).

## [4.1.0] — 2026-07-29

Public-surface hygiene. Nothing breaks; one member is now marked for removal, and one
piece of long-standing speculation is retired by measurement.

⚑ **4.0.2 was tagged in git and superseded before it reached npm.** Everything in it ships
here — the tag stays as a record rather than being moved or deleted.

### Deprecated
- **`FieldType.integer_max` and `FieldInfo.max`** — removal scheduled for **5.0.0**. No
  `FIELD_SCHEMA` entry has ever carried either, in this repository's entire history. They
  existed to surface the schema's `maximum:` constraint, and that constraint is **advisory**:
  keel declares no `MaxValueValidator`, and a `charisma: 9999` write against a `maximum: 100`
  field returns 201 and stores it verbatim. The canonical schema walk therefore stays silent
  on bounds permanently. There is no source to wire them to and no promise they could keep —
  and a public type member meaning "hint the wire ignores" is one consumers read as
  validation. Deprecating now rather than at the major so the signal arrives early; the
  `@deprecated` tags surface in editors via the shipped `.d.ts`.

### Changed
- **`TokenResource` is confirmed staying.** RFC-001 §5 asked the platform owner whether the
  token routes were carried long-term or deprecated wire-side, and the question was never
  answered in writing — so this package's own barrel carried "wire fate under review; may be
  removed in a later 4.x" for months, on nobody's authority. Probed against production:
  `GET /api/v2/tokens/status/` and `/tokens/encryption-info/` both return **200**, with a 404
  control on a nonexistent route proving the check meant something. The wire carries it. The
  speculation is retired and the comment now records the evidence instead.

## [4.0.2] — 2026-07-29

Re-pinned to `v0.30.1-dist.13` (canonical **00.30.01**). No field shape changed and no
`FIELD_SCHEMA` entry changed — the schema walk is byte-identical between the two pins, so
nothing about decoding moved. Three things changed and nothing else.

### Fixed
- **`construct.relations` and `event.languages` shipped with no description at all** — in
  `types.generated.ts` and in `SCHEMA.md`. Their descriptions were nested one level too deep
  inside `items:` in the canonical YAML, which made them invisible to every consumer that reads
  field descriptions, this package included. `SCHEMA.md` is the package's AI-legibility artifact,
  so the gap landed where it did the most harm.
- **Five description typos** corrected in published JSDoc and `SCHEMA.md`: `beapplied`,
  `phyiscal`, `relating the`, `object grant`, `eventuated`. The rendered docs site had already
  fixed all five by hand — the downstream copy was the correct one, and nobody noticed because
  the fix went where it was visible rather than where it was true.

### Changed
- `ONLYWORLDS_VERSION` `'00.30.00'` → `'00.30.01'`. It is a public `as const`, so its **literal
  type** changes. Depending on that literal is pathological, but it is a type-level change and
  should not be discovered rather than announced.
- The pin now carries canonical's numeric-bounds correction: the `maximum: 0` sentinel is gone
  from 26 fields, 8 fields gained `minimum: 0`, and `rulings.yaml` carries the numeric-bounds
  row. Nothing in this package consumes bounds — `maximum:` is **advisory** (keel does not
  enforce it; a `charisma: 9999` write returns 201 and stores verbatim) and the walk stays
  silent on bounds permanently. `integer_max` / `max` therefore remain declared no-ops here.

## [4.0.1] — 2026-07-29

**Metadata correction release.** No wire-path change: the client's reads and writes never
consulted `FIELD_SCHEMA`, and the generated interfaces carried the correct targets throughout.
The exposure is anything that builds UI or validation by **iterating `FIELD_SCHEMA`**.

⚑ **One way this can surface as a compile error**: `relation.relations` is removed, so
`FIELD_SCHEMA.relation.relations` is now a TypeScript error rather than a value. That is the
intended outcome — the field does not exist in the standard and the API rejects it — but it can
break a build rather than only a behaviour.

### Fixed
- **`FIELD_SCHEMA.collective.equipment` targeted `construct`; the standard says `object`.**
  This is the founding case of the schema ruling table
  (`collective-equipment-target`, ruled 2026-07-23): the v1 implementation used
  Construct, v1 is decommissioned, and keel serves per YAML. The generated code path
  in this repo was corrected the same week. The hand-maintained `FIELD_SCHEMA` copy of
  the same fact, in the same package, kept shipping the decommissioned value on
  `latest` — the fix went where someone happened to be looking.
- **`FIELD_SCHEMA.relation.relations` removed** — a `multi_link` to `relation` that does
  not exist in `relation.yaml`. A phantom field, publicly exported, that consumers
  building forms from this table would have sent to an API that 422s unknown keys.

### Changed
- **`FIELD_SCHEMA` is now GENERATED** from the pinned schema distribution and gated by
  `codegen:check`, joining `ELEMENT_ICONS` / `ELEMENT_SECTIONS` / `ELEMENT_FAMILIES`. It
  was ~650 hand-maintained lines whose test compared nothing to the schema. Regenerating
  it changed exactly 2 of 467 entries — the two above. Runtime shape and the deeply
  readonly public types (`as const`) are unchanged.
  Two declared deviations from a naive schema read are now stated in the generated file:
  `pin.element` (a `generic-link`) splits into `element_type` + `element_id`, as the wire
  serves it; and `integer_max` / `max` remain in the `FieldType` union unused, because
  the walk does not surface the schema's `maximum:` constraint (41 across 17 types).
- `codegen/generate_types.py` imports the vendored schema walk instead of carrying its
  own copy of it. Output byte-identical.

## [4.0.0] — 2026-07-23

**v2-native only.** See `docs/migrating-3-to-4.md`. 3.x stays published forever for
pinned consumers.

### Removed (BREAKING)
- The v1 client (`OnlyWorldsClient`), the v1 `ElementType` enum, `icon-utils`.
  `ElementType` at the root is now THE v2 slug union (was `V2ElementType` alias in 3.x).
- CJS build — the package is ESM-only with a sealed `exports` map (`"type": "module"`,
  `sideEffects: false`).

### Changed
- Metadata tables (`ELEMENT_ICONS`, `ELEMENT_LABELS`, `ELEMENT_SECTIONS`, `FIELD_SCHEMA`,
  `getElementIcon`, `getElementLabel`) ported onto the v2 slug union — same export names,
  same shapes, contents byte-identical EXCEPT: `FIELD_SCHEMA` `type: 'number'` →
  `'integer'` (70 entries; 'number' dropped from `FieldType`). Migration: consumers
  switching on `'number'` switch on `'integer'`.
- `TokenResource` now takes a structural `TokenTransport` (`{ request<T>(method, path,
  body?) }`) instead of the removed v1 client. Token surface retained pending the
  wire-fate ruling (RFC-001 §5) — may be removed in a later 4.x.

### Added (post-alpha.0, same night)
- **`ELEMENT_ICONS` GENERATED** from keel's `icon:` wrapper key (keel `56c124a`).
- **`ELEMENT_SECTIONS` DERIVED** from the canonical schema's own document structure
  (ruling: sections are the standard tier's property groups; document order is
  display order). Divergence check vs the old hand table found and fixed three fossils:
  creature "Behaviour"→"Behavior", pin's triple-listed generic link → `element`,
  relation "Involves" listing a nonexistent `relations` field. Canonical is truth.
- **`SCHEMA.md`** — full generated schema reference (every field with its canonical
  description, link directions, families, icons, sections), ships in the tarball;
  covered by the codegen drift guard. AGENTS.md points agents at it first.
- **`OwV2Client.request()` is public** (typed escape hatch; does not sanitize) and
  structurally satisfies `TokenTransport` — `new TokenResource(client)` just works.
  Token ruling: keel keeps `/tokens/*` long-term; ported, not deleted.
- README rewritten v2-native (v1 sections, branded types, and the encrypted-key
  walkthrough removed; bulk partial-failure and idempotency-key hygiene promoted).

### alpha.1 — consumer-pin fixes (atlas review, same night)
- **`parseEnvelope` → `parseErrorEnvelope`** (it parses the platform *error* envelope;
  renamed before the 4.0 name freeze to avoid collision with the world-export envelope).
- The never-whitelist LAW now lives as a comment on `READ_ONLY_FIELDS` itself.
- Stale v1 example in the shipped d.ts fixed (TokenResource JSDoc).

### Release gates — ALL GREEN (2026-07-23 night)
- **Gate 3 (wire-log v1-traffic query)**: GREEN — no unknown v1-SDK consumer on
  the wire; observed v1 traffic is pinned deployed builds (council proxy, legacy plugin
  walks) that an npm major cannot touch. The v1 API dialect stays served regardless.
- **`/api/v2/tokens/` live on prod + staging** (keel `e181689`; three-base byte
  agreement test-pinned). `TokenResource` annotates a 404 on token routes as
  "older server", not "no tokens". Requirement noted in the migration guide.
- **`ONLYWORLDS_VERSION` now GENERATED** from canonical's `VERSION` file (carried
  into keel `schema/` by the refresh script, keel `492168c`) — the last hand-synced
  constant is dead. Consumer soak: the atlas app pinned the alpha against its full
  static surface — strict-clean compile, correct runtime, package shape approved.
- **No `npm deprecate` on 3.x** (landscape research; 3.x stays plainly supported).
- 4.x wishlist: account client (list/mint/create — atlas first consumer), world-export
  envelope reader (§8c), per-status error classes, richer codegen JSDoc, retry/backoff
  parity audit, FIELD_SCHEMA generation with `required:` from YAML.

## [3.1.0] — 2026-07-23

### Added
- **Canonical element colour palette** (`src/v2/palette.ts`, exported from root):
  `ELEMENT_FAMILIES` (type → family), `FAMILY_COLORS` (family → `{light, dark}` hex),
  `familyOf(type)`, `elementColor(type, mode)`, `FAMILY_ORDER`, type `ElementFamily`.
  Four semantic families (agents / world / abstract / temporal) ruled 2026-07-22 after
  CVD-validated measurement.
  Colour carries the FAMILY; `ELEMENT_ICONS` carries the TYPE. Keyed on the v2 slug
  union. First proven live in atlas and council, whose local copies become re-exports.
  **`ELEMENT_FAMILIES` is GENERATED** from the `family:` key in keel's schema YAML
  (keel `c69366b`, a keel presentation-wrapper key — not part of the council-governed
  OnlyWorlds standard); hexes are hand-authored design constants beside it. Membership
  and hex invariants test-gated (`test/palette.test.mjs`); light hexes render-proven on
  the ruled OnlyWorlds light mode (ow-house-light) 2026-07-23.
- **Codegen drift guard**: `python codegen/generate_types.py --check` fails if
  `types.generated.ts` doesn't match the schema YAMLs (release gate; mirrors keel's
  schema CI job). Codegen also hard-fails on missing/invalid `family:` keys — the
  canary for a canonical-refresh that overwrote keel's wrapper layer.
- **CI**: GitHub Action building + running the full suite against the compiled bundle.
- **AGENTS.md** shipped in the tarball — usage guide for AI agents reading the package
  locally, including the SDK-vs-MCP division of labor and the wire gotchas.
- README: worked create→link→read-back round-trip, schema-verified field by field
  (also fixes the old example patching `'character'` with a location's id); canonical
  colour section; SDK-vs-MCP guidance.
- This CHANGELOG.

### Fixed
- `FieldType` union now includes `'number'` — the legacy alias that 70 `FIELD_SCHEMA`
  entries actually carry (consumers switch on it; data normalization deferred to 4.0).
- `generate_types.py` exits with a clear message when the sibling keel checkout is
  absent instead of a bare traceback.

## [3.0.0] — 2026-07-18

- v2-native client (`OwV2Client`) absorbed from an earlier v2 client (ow-v2-client v0.9.0),
  wire-corrected against live staging fixtures (S22). Generated element types from the
  canonical keel schema YAML (`src/v2/types.generated.ts`), validated against all 1,086
  live W11 elements. v1 surface unchanged and frozen.
