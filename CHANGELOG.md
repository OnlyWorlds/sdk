# Changelog

All notable changes to `@onlyworlds/sdk`. Maintained from 3.1.0 onward;
earlier history lives in git log only.

## [Unreleased]

### Added

- **The lens profile's reader** (schema-dist `v0.33.0-dist.78`, `profiles/lens.md`; the schema repinned from dist.77, the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'` and no element field moved). `isLens(element)`: a Construct with supertype `Lens`, trimmed and case-blind, the whole word; `isTemplate(element)`: a lens with subtype `Template`, which resolves to nothing. `resolveLens(world, lens, reader, { asOf, clock })` returns `OwLensReading` (`kept`, `rows`, `cut` by reason, `notesIgnored`, `mail`, `unreadable`): the profile's ten rules over a world snapshot, pure, for one reader (`OwLensReader`: `owner`, `contributor`, `guest` with `whole` and `known_of`, `public`, and an owner reading `as` another). A value outside the profile's table names the key in `unreadable` and resolves nothing. The mail rule reads the message profile's own readers. `lensesInUse(membership, xLensUses)`: the membership's choice wins over a Character's `x_lens_uses`. The fixture's 84 cases run as `test/lens.test.mjs`, beside eight shared edge cases (`test/fixtures/lens-edges.json`, the same bytes as the Python package's) for what the fixture leaves open; the answers equal the Python package's `resolve_lens` on thousands of random worlds.

## [4.90.0] - 2026-10-27

### Added

- **`mintWorldKey(worldId, { keep: true })`**: the key is kept across a sign-out, so revoking the token that minted it leaves it live, for a tool that stores a key on the device; disconnecting the tool, or a replayed sign-in code, still takes it. `OwMintedKey.kept` says so. Without `keep`, revoking a token revokes the keys it minted unless the tool holds another live token of its own; a token made by hand, or one of a tool that asks each time, never takes its keys. A `keep` that is not true or false is a TypeError before anything is sent.

## [4.89.1] - 2026-10-27

### Fixed

- **`noteOf` reads the hidden mark as every other reader in the package does**: any `hidden` but absent, null or false leaves a Note out (it read only `true`), so a doubt is left out, as the review and world-file readers already decide. The shared edge case moves with it, in both packages.

## [4.89.0] - 2026-10-27

### Added

- **The address profile's readers (schema-dist serial 77): `elementAddress(address)` and `parseOwLink(text)`.** One element is named by one triple, the world's id, the type word and the element's id, in three spellings: the site's address `https://www.onlyworlds.com/w/<world id>/<type>/<id>`, `ow://<type>/<id>` inside a world and `ow://<world id>/<type>/<id>` across worlds; a world by itself is `https://www.onlyworlds.com/w/<world id>` or `ow://<world id>`. Each may carry a moment (`@<step>`, one whole step of the world's time line) and a lens (`?lens=<id>`). `elementAddress` writes the canonical string: lowercase, the world's id and never its slug, the moment before the lens. `parseOwLink` reads one string whole and gives `{ form, world, worldIsSlug, type, id, lens, moment, canonical }`; a slug in the site's address reads, and is never canonical. Both refuse with `OwAddressError`, whose `reason` is one of the profile's ten names (`OwAddressReason`), the first check that fails in the profile's order. The parser is written out, not the runtime's URL class: nothing is percent-decoded and case is ASCII case. An address object with a key it does not know is a TypeError, so a misspelt `world` cannot write an address inside a world. The fixture's 133 cases are its test, and the Python package's `element_address` and `parse_ow_link` give the same answer on every input (compared on 54,018 random and adversarial inputs, no disagreement). Schema repinned to schema-dist v0.33.0-dist.77 (from dist.76; same canonical 00.33.00, no generated type changed).

## [4.88.0] - 2026-10-27

### Added

- **`world`, a constructor option: an account token, or no key, reads the world it names.** `new OwV2Client({ apiKey: 'ow_a_…', world: id })` sends `world=<id>` (URL-encoded, beside the call's own parameters, on every page of `listAll`) with the Bearer and no API-Key or PIN on `list`, `listAll`, `get` and `getWorld`, and keel answers as that account's own access in the world: the owner reads it whole, a member as its member key reads, any other account as the public reads (a world not open to the public is a 404). `new OwV2Client({ world: id })` with no key sends the same four reads with no credential at all, keel's public reader. The account calls (`/account` routes, sign-in, key and link management) work on the same client as before. Refused with a TypeError before anything is sent: `world` with a world key (`ow_w_`, `ow_r_`, a seat's key, a 10-digit key) or as anything but a non-empty string, at construction; on an account client, every call that needs a world key (element writes, hide, the change feed, the draught, files, images, proposals, `me`, `members`), which keel answered with a 401 before; on an account client without `world`, the four reads; and `world` inside a `list` or `listAll` filter, on any client. The rule sits in `request()`, read from the request: an /account route, or a GET marked `worldRead` (a new `request()` option, which adds `world=` on such a client). A client with no key and no `world` refuses as before, and its message now names the four reads.
- **`signal` on `list`, `listAll`, `get` and `getWorld`**: an AbortSignal passed to fetch as given; on `listAll` it covers every page of the walk. A time limit per request goes in the client's own `fetch`.
- **`counts` on `OwWorldMeta`**: a keyless world read's count of what the public reads, in all and per type (`{ total, types }`), absent with a key; `patchWorld` never sends it back.
- **`isRateLimited` and `isServedTrimmedNotWritable` on `OwApiError`**: a 429 `too_many_requests` (over the request budget; wait `retryAfter`), told from a daily allowance's `quota_exceeded`; and a 422 `served_trimmed_not_writable`, a write that carried the mark keel serves on a body it trimmed for its reader. The mark is left in an echoed body on purpose: the refusal is the signal.
- **The message profile's serial 76 readers** (schema-dist `v0.33.0-dist.76`). `hasUnseenRecipients(message, { keyless })`: true when the server left out recipients this reader may not see (`x_served_trimmed` names `characters`), never who or how many; `null` for a body read with no credential. `editedBy(message, members)` returns `OwEdited`, `{ edited, by }`: whether a later hand changed the message (`changed_by` present and not equal to `created_by`) and that membership's Character, or `null` when it plays none, is off the members list or there is no list. `NOTE_PAIR` (generated from the dist), `isNote(element)` and `noteOf(narratives, characterId, members)`: a Note is a member's own line, never a message, and `noteOf` gives the id of the Character's newest own-hand Note that is neither hidden (`hidden: true`) nor proposed (`x_review_proposed` an object), or `null`; on the wire only a verified sender's Note counts, in a folder its `narrator` is trusted.
- **`OwElementBase` declares `x_served_trimmed?: string[]`**, the mark the server sets on a message whose `characters` or `narrator` lost ids this reader may not see. It is served only, and a write that carries it is refused by name (422 `served_trimmed_not_writable`); the client leaves it in a body you hand back, unlike `known_of`, so that refusal is the signal and nothing is dropped silently.

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.76`** (from dist.75; the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'` and no element field moved). Serial 76 changes only the message profile and its fixture (55 to 81 cases, all run as the message test).
- **An empty `characters` with `x_served_trimmed` naming `characters` is to someone the reader cannot see**: `isAddressedTo` is false for every Character and `isToEveryone` false; a list that still holds ids beside the mark addresses those ids. `isToEveryone(message, { keyless: true })` is never true, since a body served with no credential carries no mark. Passing anything but an options object (a bare `true`) or a `keyless` that is not a boolean is a TypeError, never read as false.
- **`senderStatus` answers `unseen`** for a message with no `narrator` whose `x_served_trimmed` names `narrator` (show "from someone you cannot see", never "from nobody"); without the mark it stays `unverifiable`.
- **A Note is addressed to nobody on every reader**: `recipientsOf` gives `[]`, `isAddressedTo`, `isToEveryone` and `hasUnseenRecipients` (keyless or not) are false, `unreadFor` never lists one, and `threadOf` never includes one, though a chain of `parent_narrative` walks through it.
- **Order by `created_at` reads one rule, the same as the Python package's**: an RFC 3339 date-time (`YYYY-MM-DDTHH:MM:SS`, an optional fraction, `Z` or an offset; `T` and `Z` in either case), or one with no zone, read as UTC; the date must exist, hours 00 to 23, minutes and seconds 00 to 59. Anything else (absent, `null`, `09:61`, a word, a date alone, a space for the `T`, surrounding spaces) comes after every readable time, in the list's order. Before, `Date.parse` decided: a time with no zone was read in the machine's local time, and a date alone or other forms it accepts sorted as times. `readMarkOf` reads `updated_at` by the same rule.

### Fixed

- **`listAll` stops when a page hands back the cursor it was sent** with more to come, with an `OwNetworkError`, instead of reading the same page forever. What it yielded before stays with the caller.

## [4.87.1] - 2026-10-26

### Fixed

- **`OwDraught`'s `recent` rows declare `door`** (`string | null`, the door the change came through), which the API's document requires on every row and keel has always served. The type left it out, so `row.door` compiled only through the row's index signature as `unknown`; `draughtText` already read it. Found by checking every nested object in the document against the SDK's types.

## [4.87.0] - 2026-10-26

### Changed

- **`draughtText` names what the date horizon left out.** When the draught has an `as_of`, a line above the budget line says it: `Not listed: rows dated after Year 300.` when the read was the Character's own view (`mode: voice`, where the horizon fences every section), and `Not listed: Events, Knowledge and proposed Events or Narratives dated after Year 300.` when it was the caller's (`act`, where it fences only those). The packet carries no count of those rows, so the line gives none. Before, only the title said the horizon, and `Left out by the budget: nothing.` could be read as a complete record when the text was pasted alone.
- **A removed member reads `removed from the world`**, not `removed`, so the word cannot be read as part of the member's name. The shared fixture's expected texts are regenerated (45 of 47 cases change; the two with no `as_of` are unchanged), and the Python package's `draught_text` gives the same bytes from 0.71.0.

## [4.86.0] - 2026-10-26

### Added

- **`draughtText(draught)`**: one Character's context packet (`draught(characterId)`, full or compact) as plain text to paste into a prompt or a note, the same bytes from both packages and held to them by one shared fixture (47 cases, the full and compact reads of each giving the same text). It reads the packet alone and calls nothing: a link the packet does not hold is counted, never looked up. The title claims only the read's horizon ("dated up to Year 300"), never what the Character knew; every row says how it was reached (`via`), its grade or date, and the marks hidden and proposed; the sections that hold nothing are named on one line, and the last line says only what the budget left out (`cut`). Nothing is trimmed or cut by length, so the two languages cannot disagree on where a string ends. One known difference between a full and a compact read: the server's compact form drops an empty `x_review_proposed` (`""`, `[]`, `{}`), which the full read counts as proposed. The Python package's `draught_text` (0.70.0) gives the same text.

## [4.85.0] - 2026-10-26

### Changed

- **`resolveCalendar` is the new name of `resolveCalendarLens`**, with the same arguments and answers. "Lens" now names a cut of a world (what a reader is shown of it), so the function that picks a world's chosen calendar no longer uses the word. `resolveCalendarLens` stays as a deprecated function with the same answers until 5.0; its refusal of an unknown option names the function called.

## [4.84.1] - 2026-10-26

### Fixed

- **`validateCalendarConfig` answers with its errors, never a TypeError, when `bundles.months` has no names list** (`0`, `''`, `false`, `{}`, or `names` that is not an array). It read `months?.names.length` and threw where it should have listed the problem; such months now count as none for the festival-day check, and their own error is listed as before. `readCalendarValue` was not affected (it answered `null`). Found by comparing this reader with the Python package's port of it, input by input.

## [4.84.0] - 2026-10-26

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.75`** (from dist.74; the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'`, no schema file moved and no generated type changed). Serial 75 changes the message profile's rules and its fixture (43 to 55 cases), and text in the calendar, import-map and names pages.
- **`unreadFor(messages, characterId, readMark, members?)` takes the world's members list, and on the wire a message is the reader's own only when its sender is verified.** Before, a message whose `narrator` was the reader was never unread for them, so anyone could write a message claiming to be from you and it would never show as unread to you. Now a message that carries `created_by` (wire data) is the reader's own only when `senderStatus(message, members)` is `verified` with the reader as sender: a mismatch, an author off the members list or playing no Character, and every wire message when no members list is given, stays unread for the Character it claims. A message with no `created_by` key (a world folder, an export) has no hand to check, so its `narrator` is trusted as before. The decision is made per message. **Callers who pass wire data and no `members` will now see their own sent messages in the unread list**: pass `await client.members()` as the fourth argument.
- **`readMarkOf` counts a mark only when every write on it was its reader's own hand.** Besides the author check (its `created_by` on the members list plays the reader's Character), a mark that carries `changed_by` counts only when `changed_by` equals `created_by` (both null for the owner), so a mark someone else changed after it was made is ignored, the owner's hand included, and the reader's own older mark stands. A mark with `changed_by` but no `created_by` is ignored; a mark with `created_by` and no `changed_by` key gets the author check only; a mark with neither (a folder) counts as before.
- **The edge rulings now written in the doc comments**, which the readers already answered: a message with no `narrator` is sent by nobody, an empty id (`""`) is addressed by nothing and has no mark, and a thread walk stops at a `parent_narrative` that is not a string. The fixture's 12 new cases run as the message test; 3 of them failed on 4.83.0's readers (a mark changed by another hand, a mismatched sender, an author off the members list), and all 55 pass now.

## [4.83.0] - 2026-10-26

### Added

- **The review profile's readers: `proposedMarkOf`, `handsOnAsProposed`, `PROPOSED_MARK` and `OwProposedMark`.** An element whose `x_review_proposed` is an object was written as proposed and is not canon until a keeper settles it. `proposedMarkOf(element, today?)` gives the mark as a reader that shows a world shows it, `{ by, expires, lapsed }`, or null for a settled element (absent, null, or a value that is not an object); `by` and `expires` are trimmed of Unicode White_Space as the room profile trims, `expires` is read only as a day (YYYY-MM-DD, ASCII digits), and `lapsed` is true from that day on, in UTC as keel reads it (`today` defaults to today in UTC; a `today` that is not a day is a TypeError). `handsOnAsProposed(element)` is what a reader that hands a world on leaves out: `x_review_proposed` with any value but absent or null, so a malformed value (a doubt) is left out too (the profile's rule 4). `buildAskContext` now reads the same function. The profile has no fixture yet; the tests hold 17 cases, the Python package's `tests/test_review.py` the same ones, including one per language default that would read differently (a byte order mark, U+001C, Arabic-Indic digits).

## [4.82.1] - 2026-10-26

### Changed

- **The draught's words follow keel's 2026-10-26 change.** Under `compact: true` every element body in the packet now leaves out each field whose value is `null`, `""`, `[]` or `{}` (`id`, `type` and `name` always stay; `0` and `false` are values and stay), so a compact body is the list route's body less its empty fields, not byte for byte the same. And a Message without the room mark is placed as any Narrative unless `messages` is named, when it is in `messages` and no other section; a room-marked Message is in `messages` or nowhere. The doc comments on `draught()`, `OwDraughtItem.element` and `OwDraughtCompact` said the body was the list route's exactly; they now say both rules. Types only in words: `OwElement` already lets every field but `id`, `type` and `name` be absent, so no type changed.

## [4.82.0] - 2026-10-26

### Added

- **`front_door.my_seats`, and `OwMySeat`** (keel's front door, live 2026-10-26). `me()`, `setMyCharacter()` and an agent's `redeemJoin()` answer now list the live AI and player seats the key's holder answers for, agent seats first: each row is `{ id, kind, name, character }`, with `id` the seat's membership id as `members()` lists it, `kind` `'agent'` or `'player'`, `name` null when the seat has none, and `character` the Character it plays (null when it plays none the key can read). The list is empty for an AI or a player seat's own key and for anyone who answers for none; a seat made from a link for an email address is never listed. Types only: the client already passed the body through. Required on `OwFrontDoor`, as keel's document declares it; a hand-built `OwMe` or `OwAgentJoined` in a consumer's test needs the field.
- Tests: `me()` reads a front door with seats and one with an empty list through unchanged; the published `OwFrontDoor` declares its six keys in the document's order and `OwMySeat` its four.
- Test: `readMarkOf` takes the newest read mark wherever it stands in the list. The message profile's fixture lists the newer mark first, so a reader that kept the first mark that counts passed every case; the new test lists it last (and replays the fixture's case reversed), and fails on that reader. No reader changed.

## [4.81.1] - 2026-10-26

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.74`** (from dist.73; the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'`, no schema file moved and no generated type changed). Serial 74 is text only: the dist's README ends on a maintainer line, and six profile pages (checks, names, packet, review, room, spine) no longer name people or point inside the project's own tracker. No reader and no fixture changed.

## [4.81.0] - 2026-10-26

### Added

- **`isToEveryone(message)`**: true when a message is addressed to every member (its `characters` absent, null or `[]`). A list that names no valid id, or a value that is not a list, is addressed to nobody and false here, though `recipientsOf` gives `[]` for both; this is the one call that tells them apart.

## [4.80.0] - 2026-10-26

### Added

- **The message profile** (schema-dist `profiles/message.md`, serial 72): a message between a world's members is a Narrative with supertype `Message`, from its `narrator` to the Characters in its `characters`. `MESSAGE_PAIR` is that pair, generated from the fixture's `pair` and checked at codegen against the page and against `ROOM_PAIRS` (a parlor's line is a message too). The readers:
  - `isMessage(element)`: the pair, the type and supertype each trimmed and compared without regard to case by the room profile's own trim and fold (`Messages` is not a message).
  - `recipientsOf(message)` and `isAddressedTo(message, characterId)`: an empty `characters` (absent, null or `[]`) is addressed to every member. Nothing else addresses a message: not `narrator`, not a name in the text, not `protagonist` or any other link. A list that names no valid id, or a value that is not a list, addresses nobody, never everyone.
  - `isSentBy(message, characterId)`: the `narrator` is the Character, the claimed sender, proved or not.
  - `senderStatus(message, members)`: `{ status, claimed, writtenBy }`. `verified` when the Character of the membership in `created_by` (on `client.members()`, the owner's row matching a `created_by` of null; a removed member still proves it) is the `narrator`; `mismatch` when it is another, named in `writtenBy`; `unverifiable` with no `narrator`, no `created_by` key (a folder, an export), no members list (pass null), an author not on it, or a row naming no Character. Show a claim that is not verified as a claim, never as a proved sender. `roster` is in the profile's signature and no rule reads it yet.
  - `readMarkOf(relations, characterId, members)`: the reader's read mark, a Relation with supertype `Read` whose `actor` is the reader, counted only in the reader's own hand (`created_by` on the members list; a mark without `created_by` at all, in a folder or an export, counts), the newest `updated_at` of those. A newer mark in another hand is ignored.
  - `unreadFor(messages, characterId, readMark)`: the messages addressed to the reader, not sent by them and not on the mark, in `created_at` order. A message one sent is never unread for them.
  - `threadOf(messages, rootId)`: every message whose chain of `parent_narrative` reaches the root, the root included; a loop in a chain ends the walk. Not named on the profile's page; its thread rule and fixture cases are.
  - Both lists order by `created_at` (microseconds counted), and equal times keep the order of the list given, the server's, so every reader agrees. Never by id.
  - Types `OwSender`, `OwSenderStatus`, `OwMessageMember`. A convention on the 22 types: no type, field or wire change.
- Tests: the profile's 43-case fixture, read from the vendored distribution, as its own test, with the count of each kind; the documented calls compiled against the built types.

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.73** (from dist.71; same canonical 00.33.00). Serial 72 adds `profiles/message.md` and `profiles/message.fixture.json`, and serial 73 settles the page's rule 1: a Message Narrative without the room mark stays lore in every lore view, and a message view is a second reading of it; `VERSION`, `README.md` and `MANIFEST.json` carry the new serial; no schema file moved. Generated output moves its provenance lines and gains `MESSAGE_PAIR` and the read mark's pair and fields.

## [4.79.0] - 2026-10-26

### Added

- **`revokeWorldKey(worldId, keyId, { signal, keepalive })`**: both go to `fetch` as given. With `keepalive: true` a browser finishes the revoke after the tab that sent it closes, so a page can revoke its key on Sign out and close at once; a `signal` (for example `AbortSignal.timeout(5000)`) puts a time limit on it, and an abort rejects with an `OwNetworkError` whose `cause2` is the abort. A dead account token is a 401 (`err.isAuthError`), and then the key was not revoked. An unknown option is a TypeError before anything is sent.
- **`request()` takes `signal` and `keepalive`**, passed to `fetch` as given and sent only when given.

## [4.78.0] - 2026-10-26

### Added

- **`revokeWorldKey(worldId, keyId)`**: revoke a world key by the `id` `mintWorldKey` returned (`DELETE /account/worlds/{id}/keys/{key_id}`, account token only). The key then answers 401 `key_revoked`. The owner revokes any of the world's keys, a member only their own; any other id is a 404. Revoking a revoked key answers the same 204, so a tool that mints a key when a person signs in can revoke it when they sign out without tracking whether it already did.

## [4.77.0] - 2026-10-26

### Added

- **`isCharacterPlayed`** on `OwApiError`: a delete (or a review's decline) of a Character someone plays on the roster, the world's `owner_character` or a live member's, an AI seat's or a player's, answers 422 `character_played` (`param` id) and deletes nothing. The predicate tells it from a malformed id's 422, which carries the same `param`. The way out is to re-point that member to another Character, or remove the member, then delete.

## [4.76.2] - 2026-10-25

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.71** (from dist.69; same canonical 00.33.00). The room profile now says what trimmed means: Unicode White_Space removed at both ends, a byte order mark kept. Its fixture gains three cases, 28 in all: a tab and an ideographic space around the name still match, a leading U+FEFF and a trailing U+001C do not. `isRoomElement` already read all 28, so no reader changed; the room test now asserts exactly 28 cases. No generated type changed. Serial 70 carried the same content with a manifest that did not match its files and is pinned in no release.

## [4.76.1] - 2026-10-25

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.69** (from dist.68; same canonical 00.33.00). The calendar fixture's `v2-except-chain-gregorian` case gains 12 steps, the days around Leap Day in 1900, 2000 and 2100 (no Leap Day in 1900 and 2100, one in 2000), each checked against LegendKeeper's own reading; a reader whose days ignore `except` while its year count keeps it misreads only these. The test replays all 64 cases, now 198 steps. The script that generates the amendment's cases (`scripts/calendar-fixture-cases.mjs`) adds those century days and keeps the case's earlier sampled steps as published; its 14 cases equal the published ones. No generated type changed.

## [4.76.0] - 2026-10-25

### Added

- **Calendar version 2: a leap rule with exceptions and an offset** (the calendar profile's amendment, schema-dist v0.33.0-dist.68). An intercalary entry with `every_years` may carry `except`, divisors that flip the rule in order (`every_years: 4, except: [100, 400]`: every 4, not every 100, yet every 400), and `offset`, added to the year index before the rule (1 for a calendar with no year 0). Gregorian is `every_years: 4, except: [100, 400], offset: 1`. A value that uses either key is `version: 2`; `readCalendarConfig` reads versions 1 and 2, reads the two keys only under version 2, and refuses an `except` that is not strictly ascending with each entry a multiple of the one before (the first of `every_years`), or an `offset` that is not a whole number. `validateCalendarConfig` names each of these, and the keys under version 1. Year arithmetic stays closed-form. `intercalaryInYear(cfg, entry, year)` says whether an intercalary day falls in a year.

### Changed

- **An era with no `end` runs to the next up era's start**, skipping down eras, whatever the list order. An up era listed before a down era with the same pivot no longer ends where it begins: with eras `After` (up, from 0) and `Before` (down, pivot 0), step 5 reads `6 AF`, where it read `5` with no era.
- **Schema repinned to schema-dist v0.33.0-dist.68** (from dist.66; same canonical 00.33.00). The calendar fixture's 64 cases are replayed by a test, which no test did before; the import map profile (serial 67) is vendored with the distribution and not read by this package. No generated type changed.

## [4.75.0] - 2026-10-25

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.66** (from dist.63; same canonical 00.33.00). `ROOM_PAIRS` gains the room profile's ninth pair, `relation`/`Take` (one member's take on a work item; it also carries `x_room_item`, the item's id), so `isRoomElement` counts a marked Take as a room element. The room fixture's 25 cases are replayed. No other generated type changed.

## [4.74.0] - 2026-10-25

### Added

- **A hide's and an unhide's row on `/changes`**: `OwChangeUpsert` names `changed_at`, `changed_by` and `changed_via`, which keel sends only on the upsert row a hide or an unhide gives the readers who still see the element (the owner's keys, a co-builder, the member who made it). The body carries `hidden: true` after a hide and no `hidden` after an unhide; the row's `change_seq` is the act's, the element's own stays in `element`. Every other upsert row carries none of the three.

## [4.73.0] - 2026-10-25

### Added

- **`OwSignInResult.tokenId`**: the account token's id from Sign in with OnlyWorlds' exchange answer (`token_id`, live on onlyworlds.com 2026-10-25). A tool done with the token revokes it with `DELETE /account/tokens/{tokenId}`, sending the token itself as the bearer, instead of finding it in the token list by its last four characters. `null` from a server that does not send it yet, never a made-up id.

## [4.72.4] - 2026-10-25

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.63`** (from dist.61; the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'`, no schema file moved and no generated type changed). Serials 62 and 63 change only the dist's folder checker, `walk/lint_folder.py`: it imports the schema walk only when run as a command. This package does not ship it; the repin keeps both client packages on one serial.

## [4.72.3] - 2026-10-24

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.61`** (from dist.59; the same canonical 00.33.00, so `ONLYWORLDS_VERSION` stays `'00.33.00'`, no schema file moved and no generated type changed). Serial 60 rules eight spine readings and adds `x_spine_retires`, the profile's thirteenth key; serial 61 gives `schema.json` the advisory minimum and maximum of the 15 integer fields that have them (this package's types and `FIELD_SCHEMA` are generated from the field list, which does not carry them), rules two more spine readings with four fixture cases, and has the folder lint name the format's version. The SDK reads no spine key; the profile pages it replays (names, room, review) moved only their ruled-when lines.

## [4.72.2] - 2026-10-24

### Fixed

- **`OwElementBase.hidden`'s doc comment says what a create does with it.** It said a write ignores the mark. Since 2026-10-23, a create (a POST, a PUT of a new id, a `/bulk` item that creates) carrying `hidden: true` creates the element hidden, from the owner's keys or a co-builder's; any other key gets 403 `hidden_not_allowed` and nothing is created. Every other write still ignores it. The SDK already sent the mark as the element had it; only the words were wrong, in the types an editor shows (`dist/index.d.ts`). (Corrected after release: the entry first said they reach the docs' TypeScript reference, which lists the methods and not this field.)
- Tests: `create`, `upsert` and `bulk` send `hidden` as given (it is not on the stripped list); a 403 `hidden_not_allowed` surfaces as `OwApiError.code`.

## [4.72.1] - 2026-10-24

### Fixed

- **`readWorldFile` refuses a deflate stream that ends before its entry's declared compressed size** (folder spec §4.7, OW-14, its size bullet; ruled 2026-10-24, published at schema-dist serial 58). The size bullet speaks of every size an entry declares, the compressed one too. fflate stopped at the stream's end and ignored the bytes after it, so an entry whose stream ended four bytes early, those bytes junk and its sizes and CRC honest, was read (`fail-OW-14-deflate-early-end`); it is now `not_openable`. fflate never says where a stream ended, so each deflated entry is inflated twice: once whole, as before, then again short of its last byte (in 64 KiB chunks past that size, the output dropped), where a stream that ends at its declared size runs out and fflate refuses it, and one that ends sooner still inflates. A stream that never ends (`fail-OW-14-deflate-no-end`) was already refused, as `not_openable`. A world file whose streams end where their entries say reads as before.
- Tests: the whole `.owworld` set, 96 cases, through the reader, the count floor 96; built streams with 1 and 4 junk bytes after their end, short and past 64 KiB, refused, and the same streams with nothing after them read. The three zips the fix was tested on before the serial was vendored (`test/fixtures/owworld-next/`) are gone: the set carries them.

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.59`** (commit a40a5f3; same canonical 00.33.00; no schema file moved, `schema.json` and `presentation.json` unchanged, no generated type changed, `ONLYWORLDS_VERSION` still `'00.33.00'`; generated output moves only its source header and SCHEMA.md's line). Serials 58 and 59 together bring what follows; 59's own change is text only (the set's generator and verdicts regenerated with the same 96 zips byte for byte, and the profile pages, the checks fixture's note and the folder lint say when a rule was ruled). The `.owworld` set at 96 zips: the two deflate cases above, and `pass-OW-18-nfc-unassigned`, U+11383 beside U+11382 U+113C9, two names at Unicode 15.1, which 4.71.0's `nfc` already keeps apart; none of the earlier 93 zips moved. The spine profile's serial-58 sentences: `x_spine_owner` the keeping seat's name, the projection's World mark `x_spine_projection`, the audit's one Seat and folded-name uniqueness, the Retirement Event's typed link. The dist's README, LICENSE and SECURITY.md, written by its publisher.

## [4.72.0] - 2026-10-24

### Changed

- **`buildAskContext` now leaves proposed, hidden and room elements out of the context unless asked.** A caller that passes such elements gets fewer items in `context` and `kept` than before: an element whose `x_review_proposed` is anything but absent or null (the review profile, rules 1 and 4: a value that is not a proper mark is a doubt and counts as proposed), one whose `hidden` is anything but absent, null or false (folder format §4.8, the same test as `writeWorldFile`'s `includeHidden`), and a room element (`isRoomElement`, the room profile, rules 1 and 4) are not sent. Their ids come back in the new `leftOut: { proposed, hidden, room }`, in the order given, so a tool can say how many it held back. An element carrying more than one mark is listed once, in the first of hidden, proposed, room whose option is off: a hidden proposed element is under `hidden`, so `includeProposed` alone never sends it. A sent element's link to an element a mark leaves out, anywhere in the index, reads as "not present in the world data", never by its name. `dropped` keeps its meaning (the 8 items and the 12,000 characters), counted over what remains. Until now the SDK relied on the caller (Lantern) to filter first; the rules bind the exported function itself.

### Added

- **`buildAskContext(items, index, { includeProposed, includeHidden, includeRoom })`**, each default false: true sends that kind again. A proposed element sent carries the review profile's label on its first line, `[proposed, not yet reviewed] Name (type)`, where the AI reading the text sees it. An option that is not a boolean is a TypeError, and an unknown key is refused by name (the options fence, `test/options.test.mjs`). Types `OwAskContextOptions` and `OwAskLeftOut`.
- **`REVIEW_PROPOSED_LABEL`** (`'proposed, not yet reviewed'`), generated into `types.generated.ts` from rule 1's own sentence in the vendored `profiles/review.md` ("labels each one it keeps **"…"**"); codegen exits 1 if the sentence is missing or occurs twice.
- **`minted_by: string | null` on `OwWorldLink` and `OwCreatedWorldLink`**: the membership (its id in GET /api/v2/members) of the co-builder who minted the link over POST /api/v2/links; null for a link the owner made. Served by `createWorldLink` and `listWorldLinks`. No client for `/api/v2/links` itself yet.
- Tests: each mark left out by default and listed; `hidden` as §4.8 reads it (`"true"` and 1 out, false and null in); a doubt (`"yes"`, `{}`) treated as proposed and labelled when asked, a cleared `null` settled; each `include*` bringing back its own kind only; the label on the first line; a hidden proposed element counted once, under hidden; a kept element's links to a hidden element and from a room element read without their names; the limits over what remains; the fence and the boolean check. Ten mutants, each red on its own test: no proposed filter, no hidden filter, no room filter, no label, a doubt not proposed, proposed checked before hidden, left-out elements counted toward the total, no link view, no option fence, no boolean check.

## [4.71.0] - 2026-10-24

### Added

- **`nfc(text)`**: Normalization Form C as Unicode 15.1 defines it, built from Unicode's own `UnicodeData-15.1.0.txt` and `CompositionExclusions-15.1.0.txt` (schema-dist serial 57), never the runtime's. It is the NFC half of OW-18's fold, beside `simpleCaseFold`, exported so a tool that compares names the way a world file does gets the same answer. This export is why the release is a minor, not 4.70.1.

### Fixed

- **The world file's name check uses Unicode 15.1's NFC, not the runtime's** (folder spec §4.7, OW-18, ruled at serial 57). `readWorldFile` and `writeWorldFile` folded names with `String.prototype.normalize('NFC')`, which follows the runtime's ICU: Node 22's is Unicode 16.0, which composes 20 code points 15.1 leaves unassigned (Todhri, Tulu-Tigalari, Gurung Khema, Kirat Rai), so a name with U+11383 and one with U+11382 U+113C9 were refused as one name where the spec keeps two, and an older runtime could miss what 15.1 added. Both now fold with `nfc`. Where 15.1 and the runtime both assign a code point, nothing changes (Unicode's normalization stability): the set's 93 cases read the same either way. The tables are `src/nfc-tables.generated.ts`, made by `codegen/nfc_tables.mjs` from the vendored files.

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.57`** (commit e21b867; same canonical 00.33.00; no schema file moved, `schema.json` and `presentation.json` unchanged, no generated type changed, `ONLYWORLDS_VERSION` still `'00.33.00'`; generated output moves only its source header and SCHEMA.md's line). Serials 50 to 57: the export fixture's world block is the World whole, with `origin` and `x_names` (50, 51); the review profile's reader rule, a reader that hands a world on leaves proposed elements out unless asked (52, 53); the folder lint takes `hidden` as a folder key (53); the checks profile's list case and reader rules 6 to 8 (54); the spine profile and its fixture (55, 56); the `.owworld` set at 93 zips, eight OW-18 NFC pairs with `UnicodeData-15.1.0.txt` and `CompositionExclusions-15.1.0.txt` beside `CaseFolding-15.1.0.txt` (57). None of the earlier 85 zips moved.
- Tests: the NFC against the two files for every code point (each composite composed back unless excluded, its mapping to the same NFC, each Hangul syllable from its jamo, each combining class by where ordering puts the mark), against the runtime wherever both assign a code point, and every code point 15.1 leaves unassigned left alone; U+11383 against U+11382 U+113C9 and U+16D68 against U+16D67 U+16D67 accepted as two names. The fixture count is the published 93. Four mutants (the runtime's `normalize` back in the fold, one exclusion dropped from the table, an unstable ordering, no Hangul LV+T), each red on its own line. Checked outside the repo against Unicode's `NormalizationTest-15.1.0.txt`: 19,074 lines, 0 disagreements.

## [4.70.0] - 2026-10-23

### Added

- **`writeWorldFile(files, topDir, { includeHidden: false })`** (folder spec §4.8, Skeld, 2026-10-23): a world file is a copy, so an element file carrying the hidden mark travels byte for byte by default, as before. A tool making a file to hand to someone else passes `includeHidden: false`, and every `.json` file directly in a type folder of `elements/` or the legacy `spatial/` whose JSON has a top-level `hidden` (anything but absent, `null` or `false`, so `"true"` and `1` count, as the Python package's `is_hidden`) is left out whole. A file there that is not UTF-8 JSON, or not an object, is kept. Nothing else is rewritten: a visible element's link to a hidden one keeps its id. The two defaults differ on purpose: private records out unless asked, hidden kept unless the write is a share.
- **`report: (r: OwWriteWorldFileReport) => void`**, a `writeWorldFile` option: called once with `{ hiddenLeftOut }` after the archive is made and before it is returned, never on a refusal. The return stays the bytes. An `includeHidden` that is not a boolean, or a `report` that is not a function, is a `TypeError` before anything is written; both keys join the options fence.

### Fixed

- **`draught`'s doc comment names `compact`** (4.69.0), so the docs' generated reference row carries it.
- Tests: a hidden element file byte-identical by default and with `includeHidden: true`, the report 0; left out as a share, the report 1, every other file byte-identical; the legacy layout, `.JSON`, and a doubtful mark left out; not JSON, not UTF-8, not an object, a null or nested mark, a deeper file, a non-JSON file and the other parts kept; the same bytes for the same files either way; the report not called on a refusal; the fence. Watched failing with the leave-out turned into a keep (3 tests red), restored. The 85-case `.owworld` set unchanged.

## [4.69.0] - 2026-10-23

### Added

- **`draught(id, { compact: true })`**: the draught without its empty sections. Every empty array or object section and an empty `cut` are left out. The frame (`world`, `calendar`, `as_of`, `now`, `mode`, `policy`) and every null stay, so a null is still an answer: `character` null means she is hidden from this reader, `style` null that she has no style element, `recent_cursor` null that the read had no `since`. An absent section means nothing in it, never that it was not read (`policy.components` says what was). The answer is typed `OwDraughtCompact` (`cut` optional); without `compact`, or with `compact: false`, it is `OwDraught` as before, the fixed shape. A `compact` that is not a boolean is a TypeError before anything is sent. MCP's `get_draught` defaults to compact; this route defaults to the fixed shape.

## [4.68.0] - 2026-10-23

### Fixed

- **`patchWorld` strips `counts`**, which a keyless `GET /world` carries (the public reader, on since 2026-10-23) and `PATCH` answers as an unknown key, so the body of a keyless read goes back too. Quillon's port found it (2026-10-23); the Python package's live wire test went red on the same key the same hour.
- **`reviewNewElement` refuses a reason with an accept** before sending (keel takes `{ decision: 'accept' }` alone; a reason was its 422), and **checks its answer**: an accept that answers no `element`, or a decline no `deleted`, is a `TypeError` naming the route. Both as the Python package does (Quillon, 2026-10-23).

## [4.67.0] - 2026-10-23

### Added

- **The draught's `room` and `proposed` components**: `OwDraughtComponent` is now keel's thirteen, in its order. `room` is the room profile's other elements that reach her (a board entry, a spec, a heart, a vote, a sitting, a member card, a work item that is not open or taken), each there or nowhere; the type missed it since keel shipped it. `proposed` (live 2026-10-23) is every element carrying `x_review_proposed` that reaches her, there or nowhere, whatever section would have held it; `cut.proposed` counts the ones left out, the component unnamed or its budget spent, so a tool handing a draught on can say so. Both are off unless named, as `messages` is: `draught(id, { components: [..., 'room', 'proposed'] })`. `OwDraught.room` and `OwDraught.proposed` are typed.

### Fixed

- **`OwDraughtItem` nests the element**: keel has served each draught row as `{ via, circles?, her_links, grade, dated?, element }` since the route shipped, and the type spread the element's fields onto the row instead. Read `row.element.name`, not `row.name` (which was `undefined` at runtime all along); TypeScript code that read the spread form now fails to compile where it was already wrong. In the same way `OwDraught.character` is `{ self, grade, element }`, and optional (absent unless `self` is served), `work` rows carry `packet` (the work item's `x_packet_elements`), `messages` rows carry `author` (`membership`, `kind`, `role`), and rows may carry `circles`. Read from keel's `elements/draught.py` and its OpenAPI `Draught` schema; nothing at runtime changed.
- Tests: `components: ['room', 'proposed']` is sent as `components=room,proposed`; the published `OwDraughtComponent` lists keel's COMPONENTS in order; the nested rows, `cut.proposed`, `character.element`, `packet`, `author` and `circles` compile against the built `.d.ts`, and a spread read and an unknown component do not. Watched failing with `'proposed'` cut from the type.

## [4.66.0] - 2026-10-23

### Added

- **`createAccountWorld({ name, pin?, keyName?, source?, producer? })`** (account token): `POST /account/worlds` makes a world on the account with its one write key. Sent in keel's spelling, only the keys given (`keyName` as `key_name`: 1 to 80 characters, trimmed, `null` for none; `source` and `producer`: the folder format's provenance lines, each an object or `null`, kept on the World and served by `getWorld()` as `origin`). `pin` only while the account has no PIN (it becomes the account PIN); an account with one must leave it out. Either mistake is a 422 with `err.param === 'pin'` and nothing made, so a tool that cannot tell which account it holds sends without `pin` first and again with it on that 422, as Atlas's Make online does. Returns `OwCreatedAccountWorld`: the world's row as `listAccountWorlds` lists it, plus the full write key once in `key`. No Idempotency-Key (the document declares none), and neither `X-OW-Agent` nor `X-OW-Client` (it declares neither here). keel's document gives the 201 no schema, so the type is read from keel's handler. A world key is a `TypeError`, as is an unknown option or a missing `name`, before anything is sent. Atlas can retire its own `AccountClient.createWorld` for it.
- **The world's queue lists new elements written as proposed** (live 2026-10-23): `worldProposals()` now returns `OwWorldProposalList`, whose rows are `OwWorldProposalRow`, told apart by `kind`: `OwProposal` (`kind: 'proposal'`) or `OwProposedNewElement` (`kind: 'new_element'`: an element carrying `x_review_proposed`, its `by`, `evidence` and `expires` the mark's words, `state` `open` or `lapsed`). One order, newest first by `created_at`; the cursor is opaque and goes back as it came (an old bare proposal id still reads). `listProposals` keeps `OwProposalList`: one element's proposals only.
- **`reviewNewElement(type, id, { decision, reason? })`**: `POST /{type}/{id}/review`, a keeper (the owner or a co-builder, with the PIN) settles a new element written as proposed. `accept` clears the mark and returns `{ element }`; `decline` deletes the element and returns `{ deleted }` (its id); the reason is answered back and kept nowhere. Sends `X-OW-Client`, as the document lists, and no `X-OW-Agent`. A `decision` other than `accept` or `decline`, or an unknown key, is a `TypeError` before sending. Type `OwReviewed`, options `OwReviewInput`.
- **`err.isNotProposed`**: 422 `not_proposed`, the element carries no mark to settle. `isProposedOnly` (403) also answers the seat the mark names.
- **`OwProposal.kind`** (`'proposal'`) and **`OwProposal.omitted`**: a row's `fields` now holds only what differs from the element when proposed, and `omitted` names the fields an upsert left out that were not empty (each in `fields` at its empty value, so an accept empties it; `[]` for a patch, a link edit or `propose`). A propose with nothing new is a 422 with `param: 'fields'`; a seat's write that changes nothing under the world's switch answers 200 with the element and makes no row.

### Changed

- `worldProposals()`'s answer type is `OwWorldProposalList` instead of `OwProposalList`: TypeScript code that reads a proposal's own keys (`fields`, `base`) off a queue row now narrows on `row.kind === 'proposal'` first. The wire changed under it on keel's side: the 4.65.0 type described rows keel no longer sends alone.
- Tests: the body sent for each `createAccountWorld` option alone and together, `null` included, an `undefined` option left out; the PIN dance's 422 surfacing with `err.param` `'pin'`, then the retry with it; the headers on the create (no agent, client or idempotency header); the queue's two kinds and its cursor; both review decisions, their headers and their refusals; the published types. Watched failing on 30 mutants, each restored byte for byte.

## [4.65.0] - 2026-10-23

### Fixed

- **`patchWorld` takes a `getWorld()` body back again** (live 2026-10-23). keel's `GET /world` now serves `origin`, and a PATCH naming it is a 422 (an unknown key), so a world body read and sent back failed. `patchWorld` now leaves out `origin`, and `id` too: keel answers `id` with the same 422 (it is not a key PATCH takes), so the round trip 4.57.1's entry promised never held for a whole body. `owner_character` is still sent.

### Added

- **`OwWorldMeta.origin?: OwWorldOrigin`**, read-only: where the world first came from, `{ source, producer }`, both keys always present, each the folder format's provenance line (spec 4.2) as the tool that made the world from a folder gave it, or `null`. Types `OwWorldOrigin`, `OwWorldSource` (`server`, `world`, `at`) and `OwWorldProducer` (`tool`, `version`, `input`), each open to keys keel keeps as given. The origin is written as the plain keys `source` and `producer`: `patchWorld({ source, producer })` sends them as given (an object, or `null` to clear).
- **The World's extension keys on `OwWorldMeta`**: `x_*`, `atlas_*` and `shadow_*`, typed `unknown` by template-literal index signatures (the first is `x_names`, the names profile `typeWord` reads). `patchWorld` sends every one as given, `null` included (keel removes the key); over keel's 64 KB cap on the whole store the answer is a 422 with `param: extensions`.
- Tests: a full `GET /world` body sent back sends neither `origin` nor `id` and keeps `x_names`; `source`, `producer` and a key of each extension prefix pass untouched, `null` included; the published types declare `origin` and its two keys, and the documented calls (`patchWorld(await getWorld())`, `patchWorld({ source, producer, x_names })`, `typeWord(world, …)`) compile against the built `.d.ts`. Watched failing on mutants: `origin` and `id` each out of the strip list, `origin` out of `OwWorldMeta`, and a narrowed `patchWorld` parameter.

## [4.64.0] - 2026-10-23

### Changed

- **Every options object in the package now refuses an unknown key**, not only the client's typed methods (4.51.0 to 4.53.0): `readWorldFile`, `parseDate`, `resolveCalendarLens`, `lookupWorld`, `renderElement`, `planPhoto`, `preparePhoto`, the client's `request()` escape hatch, `listAll` (with its own keys: a `cursor` it was handed was overwritten unread), the deprecated `tokens.consume` and `new OwSignInError`'s third argument throw a `TypeError` naming the function, the key and the keys it takes, before anything is read, decoded, parsed or sent. A dropped key was never harmless: `readWorldFile(bytes, { maxbytes: 1e6 })` read with the 2 GiB budget, `parseDate(cfg, input, { Now: 12 })` parsed as if the world had no now, and W11's `list('character', { name__icontains })` read every Character and a cleanup script deleted 99 of them (2026-10-22). A plain-JavaScript caller passing a misspelt key will now see a `TypeError` where the call used to run with the default; TypeScript callers were already refused at compile time. `writeWorldFile` and `typeWord` keep their refusals on the same shared check; `typeWord`'s message now reads like the others (`typeWord: unknown option 'plural'. The keys are supertype, many.`).
- Tests: one test calls every options parameter of the exported surface with `{ __unknown__: 1 }` and asserts a `TypeError` naming the key, nothing sent; a second reads `src/index.ts` with the TypeScript checker and fails on any exported object parameter that is neither in that list nor named as data (a calendar config, a world index, an element), so a new options object cannot ship unfenced. Watched failing on mutants of the `readWorldFile`, `parseDate`, `preparePhoto` and `request()` fences, and on an exported options function added without one.

## [4.63.0] - 2026-10-23

### Added

- **`writeWorldFile(files, topDir, { includePrivateRecords })`**, OW-8's private clause (folder format spec v0.3.15, §4.5 rule 11 and §4.7). By default the writer now leaves out, whole, every `records/<producer>/` directory whose entry in `records/RECORDS.json` says `"private": true`, so a tool's own notes do not travel the first time a world is shared. `RECORDS.json` itself travels byte-exact, its private entries kept, so a reader can see a producer was left out. Only the boolean `true` marks a directory private (`"true"`, a string, does not). A producer's name matches its directory by the archive's one fold (NFC, then simple case folding), so a manifest's `Fold` leaves out `records/fold/` on a disk that ignores case. With `includePrivateRecords: true` every record travels as before and the manifest is not read. No manifest, nothing is private. Type `OwWriteWorldFileOptions`.
- **A manifest the writer cannot read is refused, not guessed at**: a `RECORDS.json` that is not JSON, not an array, holds an entry that is not an object, or marks an entry private without a producer name throws a `TypeError` naming the file and the option, having written nothing, unless `includePrivateRecords: true` is passed. A world whose manifest is in an older shape now needs the option to be written. The options object refuses an unknown key, and an `includePrivateRecords` that is not a boolean, with a `TypeError`, before anything else.
- Tests: the conformance set's four private cases, written from its `sources.private` world (each source file checked by its sha256): the default side equals `pass-OW-8-private-left-out` and the asked side `pass-OW-8-private-asked`, entry for entry, and neither is `fail-OW-8-private-partial` or `fail-OW-8-private-manifest-rewritten`. Also the string `"true"`, a producer whose name is a prefix of another's, no manifest, each unreadable manifest refused and carried when asked, and the options. Each behaviour watched failing on its own mutant.

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.49`** (same canonical 00.33.00; no schema file moved, no generated type changed, `ONLYWORLDS_VERSION` still `'00.33.00'`). The `.owworld` conformance set grows to 85 zips with the four OW-8 private-records writer cases on `sources.private`; none of the earlier 81 moved.

## [4.62.0] - 2026-10-22

### Added

- **`typeWord(world, type, { supertype, many })`**, the names profile's reader (schema-dist `profiles/names.md`): a world's own word for a type, from `x_names` on the World (a `getWorld()` body, keel serving `x_` keys on the World, or a folder's `world.json`). The supertype's entry first, matched trimmed and without regard to case (the room profile's one definition, shared with `isRoomElement`), then the type's entry, else `null`: print the standard's name. `many: true` gives the plural, `one` when the pair has none. A value that is not a names map is `null` everywhere; a bad entry or an unknown slug is ignored. The options object refuses an unknown key with a `TypeError`. Types `OwNamesMap` and `OwWordPair`. Display only: the API, the folder, the schema and every id keep the standard's names.
- Tests: the profile's 23-case fixture, read from the vendored distribution, as its own test; no world, no map and an unknown option.

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.48`** (same canonical 00.33.00; no schema file moved, no generated type changed, `ONLYWORLDS_VERSION` still `'00.33.00'`). The distribution gains `profiles/names.md` and `profiles/names.fixture.json`, the names profile, and `profiles/checks.md` names the Charter by keel's D152: the newest Law with supertype `Charter` made by the owner or a co-builder, by `created_at` then id.

## [4.61.0] - 2026-10-22

### Added

- **`delete(type, id, { ifMatch })`** (live 2026-10-22 21:3x): `DELETE` reads `If-Match` exactly as `PATCH` does. With the element's `change_seq` as you read it, a delete of an element someone changed since is refused, `OwPreconditionFailedError` (412) with `current`, nothing deleted; on an element already gone it is the idempotent 204. Under a world's proposals switch a delete is never a proposal. The options object refuses an unknown key like every other.
- Tests: the header sent and left out, the unknown option, the 412; each watched failing with the header dropped. The wire gate now reads from keel's document which Character operations take `If-Match` (it held a hand list of two and missed this one) and fails on 4.60.0.

## [4.60.0] - 2026-10-22

### Added

- **`OwFrontDoor`, and `front_door` on `OwMe` and `OwAgentJoined`** (live 2026-10-22 20:1x). `me()`, `setMyCharacter()` and an agent's `redeemJoin()` answer carry the world's front door for the key: `sponsor` (`{id, kind, name}` of the person who answers for a seat, or null), `sponsor_character`, `my_character`, `charter` (the world's Charter, every member's to read: read it first) and `charter_skill` (up to five Objects the Charter names). Every id is one the key may read; anything hidden is null or left out. Types only: the client already passed the body through. Required on both types, as keel's document declares it; a hand-built `OwMe` in a consumer's test needs the field.

## [4.59.0] - 2026-10-22

### Changed

- **`API-Pin` is sent only where keel checks it** (Skeld's ruling, 2026-10-22). keel verifies a PIN wherever one is sent (argon2, 64 MiB each), and on 2026-10-22 scripts reading with the PIN OOM-killed staging on a cold cache after a restart. The client used to send a configured `apiPin` on every request. It now sends it on every request whose method is not GET (every write: elements, links, bulk, adopt, hide and unhide, media and file tickets, seats, world links, proposals, `setMyCharacter`, `mintWorldKey`, `patchWorld`, and any route added later), on `GET /me` (`me()`, the connection test: keel checks a PIN there when sent), and on every request of a 10-digit legacy key (v1 parity: such a key needs the PIN on reads of a world with a PIN). Any other read from an `ow_w_`, `ow_r_` or member key goes without it; an account token never sent it and still does not. The rule is derived in `request()` from the method and path, so a raw `request()` call follows it too. No API changed.
- Tests: `test/api-pin.test.mjs`, five, on a recorded fetch: eight reads, `me()` and ten writes across POST, PATCH, PUT and DELETE, for an `ow_w_` key with a PIN, a legacy key with a PIN, an `ow_r_` key with none and an account token with one configured; and raw `request()` GETs to other paths, `/me` and other methods. Two existing tests that expected the PIN on a GET now expect none. Mutants: the PIN on every request again fails four tests; without the `/me` clause, three; without the legacy clause, one.

## [4.58.0] - 2026-10-22

### Added

- **The proposed change** (live 2026-10-22 16:25). Six calls: `propose(type, id, { fields, evidence, expires? })` (any member key that reads the element; `fields` cleaned as a PATCH body is; `Idempotency-Key` only when given), `listProposals(type, id, { limit?, cursor? })`, `worldProposals({ state?, since?, element?, limit?, cursor? })` (the queue, newest first; keepers see every row, others their own), `acceptProposal(type, id, pid)` (`{ proposal, element }`: the keeper's own write, one feed row), `declineProposal(type, id, pid, { reason? })` and `withdrawProposal(type, id, pid)` (204). Types `OwProposal`, `OwProposalList`, `OwProposed`, `OwProposalState`, `OwProposalQuery`, `OwWorldProposalQuery`, `OwProposalAccepted`. Every options object refuses an unknown key with a `TypeError` before anything is sent. `X-OW-Client` goes on `propose` and accept, where the document lists it; `X-OW-Agent` on none of them.
- **A write held as a proposal is an error, never a body.** Under the world's **AI seats propose, a person accepts** switch an agent seat's `patch`, `upsert` or `editLinks` answers `202`: the client throws `OwProposedError` (`status` 202, `proposal`, `isProposed`) rather than returning something that is not the element; a `202` with no proposal in its body is a plain `OwApiError` 202. A `/bulk` slot with `status: 202` is left in the result as the document shapes it, typed. `create`, `adopt` and `delete` are not read for a 202: the document gives them none.
- **Five codes**: `isStaleProposal` (`OwStaleProposalError` with `conflicts: [{ field, base, current }]` and `current`, parsed like the 412), `isOwnProposal`, `isProposedOnly`, `isTooManyOpen`, `isFieldNotVisible`.
- **`OwWorldMeta.agent_writes_proposed?: boolean`**, read-only; `patchWorld` strips it with `slug`, `public_page`, `public_read` and `agent_narrator_rule`.
- Tests: 20 on a recorded fetch, 18 red first; two mutants caught. Live on production with the demo key, reads only: `getWorld()` carries `agent_writes_proposed: false`; the queue answers `404` to a read key with no member, as the document says. Not exercised live yet: `propose`, accept, decline, withdraw and the `409` (staging does not serve the proposed change at release time; a round-trip script waits for it). Not wired yet: the queue's `ETag`/`If-None-Match` (a conditional `worldProposals`, on the `changesHead` pattern, when a poller asks).

## [4.57.2] - 2026-10-22

### Changed

- **Schema repinned to schema-dist `v0.33.0-dist.47`** (same canonical 00.33.00; no schema file moved, no generated type changed). The distribution gains `profiles/checks.md` and `profiles/checks.fixture.json`, the checks profile: a work world's Charter carries its house rules as `x_checks_rules`, beside the sentences a person reads. `profiles/room.md` now defines "trimmed and without regard to case" once, for every profile that folds like the room's pairs: trimmed is leading and trailing whitespace removed, nothing inside touched; without regard to case is the trimmed value after simple case folding.

### Fixed

- **`isRoomElement` trims Unicode White_Space exactly**, the 25 code points of the property, at both ends of the type and the supertype. It used JavaScript's `trim()`, which also strips U+FEFF, a byte order mark. Skeld's ruling (2026-10-22) is that a byte order mark stays, so a supertype `"\uFEFFMessage"` is no longer a room element; `" Message\u3000"` still is, and a leading U+200B (zero width space, not White_Space) still is not. The room fixture's 23 cases answer as before.

## [4.57.1] - 2026-10-22

### Fixed

- **`patchWorld` strips `public_read` and `agent_narrator_rule`** beside `slug` and `public_page`: keel answers both as unknown fields (a 422 naming the key; `agent_narrator_rule` measured on staging, `public_read` by keel's own rule), so a world body read with `getWorld` and sent back now round-trips. `owner_character` is accepted by the server and is still sent.

## [4.57.0] - 2026-10-22

### Added

- **The conditional head poll** (live 2026-10-22): `changesHead()` keeps the last head read's `ETag` per client and sends it back as `If-None-Match` on the next one, exactly as received (keel's 200 sends a weak `W/"821:-"`; nothing is quoted, parsed or compared). keel's tag is `"<head>:<epoch>"`, so a view change moves it as a new change does. When nothing moved, keel answers 304 Not Modified with no body, and `changesHead()` returns the `head`, `cursor` and `epoch` of the last 200 with `unchanged: true`; every 200 says `unchanged: false`. keel refunds a 304 against the request budget, so a poll that mostly finds nothing costs little. A 409 `resync_required` from `changesHead()`, `changes()` or `changesAll()` clears the held tag, so the next head read is a full 200 with `epoch_reason`. A 304 while no tag is held is an `OwApiError` with status 304, never a made-up head. The client still never polls or sleeps on its own: the interval is the caller's.
- **The public page on `OwWorldMeta`** (live 2026-10-22), both read-only: `slug` (`string | null`), the page's address, onlyworlds.com/w/<slug>, null while the page is off, and also a keyless `?world=` value; `public_page` (the new `OwWorldPublicPage`), the page as its owner set it: `on`, `palette` (midnight, daylight, parchment, brass, dusk, or null for the house's), `hero` (one plain line), `sections` (the types shown in order, empty for all), `pin` (an element id or null) and `index` (always false for now), every key present with the page off. Both are set by the owner on the world page; `patchWorld()` strips them, so a body read from `getWorld()` stays writable.
- **`request()` gains two options**: `ifNoneMatch` (a tag sent as `If-None-Match` as given) and `onEtag(etag, status)` (called with each response's `ETag` and status before the body is read; with it given, a 304 returns null instead of throwing). Every other path is unchanged.

### Changed

- **`changesHead()`'s return type gains `unchanged: boolean`**, beside `head`, `cursor`, `epoch` and the optional `epoch_reason`.

## [4.56.0] - 2026-10-22

### Added

- **The client's name** (live 2026-10-22): a constructor option `client`, default `'sdk'`, sent as `X-OW-Client` on every element write (`create`, `upsert`, `patch`, `delete`, `editLinks`, `bulk`, `adopt`) and on no read. keel stores it on the element as `changed_client`, so a reader can tell which tool made the last change (`new OwV2Client({ ..., client: 'atlas' })`). The rule is keel's, exact here: lower case letters, digits and hyphens, 1 to 32 characters (`[a-z0-9-]{1,32}`). Anything else, a capital, a space, an empty string, 33 characters or a value that is not a string, is a TypeError at construction naming the option and the rule, and nothing is trimmed; keel's own fence for a stranger's header is to store null, never a 422. The name is the client's claim about itself, never proof; it changes no door and no permission, and `agent` still decides `X-OW-Agent`.
- **`changed_client`** on `OwElementBase` (`string | null`, server-managed, read-only, beside `changed_by` and `changed_via`): the name the last write gave, null when it gave none or one outside the rule, for keel's own writes, and for changes from before names were recorded. Sent back in a write it is ignored. **`deleted_client`** on a `/changes` delete (`OwChangeDelete`, beside `deleted_by` and `deleted_via`), the same for the delete; null on a `hidden` row.

### Changed

- **The constructor refuses an unknown key by name**, as every options object has since 4.52.0: `new OwV2Client({ clinet: 'atlas' })` is a `TypeError` naming the key and the eight the constructor knows, where it fell back to the defaults silently before. Every known caller (Atlas, Lantern, the toolkit) passes known keys only.
- **Schema repinned to schema-dist v0.33.0-dist.46** (same canonical 00.33.00). The dist's example export (`example/world-export.json`) gains `changed_client: null` on its bodies, `walk/lint_folder.py`'s server-key set names `changed_client`, and the README's sentence on server keys names it; `VERSION` and `MANIFEST.json` carry the new serial; no schema file moved. Generated output moves its provenance lines and gains `changed_client`.

## [4.55.0] - 2026-10-22

### Added

- **The room profile** (schema-dist `profiles/room.md`, serial 45; Skeld's rulings, 2026-10-22): `ROOM_PAIRS`, the eight type-and-supertype pairs a parlor puts in a world (narrative/Message, narrative/Board, relation/Work item, construct/Spec, relation/Heart, relation/Vote, event/Sitting, character/Member), and `isRoomElement(el)`, true when an element's type and supertype, each trimmed and compared without regard to case, match one of them **and** it carries the mark `x_room_of` (the id of the world or sitting the room belongs to) as a non-empty string. A pair without the mark is lore (a novel's letters are Narratives with supertype Message); a mark without a pair is not a room element. The pair match is the whole word, a missing or empty supertype is never a room element, and a Law with supertype `Charter` stays lore. A lore view leaves room elements out unless the person asks; the room's own views show them whole. A convention on the 22 types: no type, field or wire change. `ROOM_PAIRS` is generated from the fixture's `pairs` and checked at codegen against the page's table (they must agree, or codegen exits 1); the mark's name is generated from the fixture's `mark.field` and checked against the page. Case is folded by Unicode simple case folding (`simpleCaseFold`), the same fold as the Python package's `is_room_element`. A new test replays the fixture's 23 cases from the vendored dist.

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.45** (same canonical 00.33.00). The dist adds `profiles/room.md` and `profiles/room.fixture.json`; `VERSION`, `README.md` and `MANIFEST.json` carry the new serial; no schema file moved. Generated output moves its provenance lines and gains `ROOM_PAIRS` and the mark's name. Serial 44, the pairs without the mark, was superseded within the hour and is skipped.

## [4.54.0] - 2026-10-22

### Added

- **`Zone.shape`** (canonical 00.33.00, a minor step of the standard): a string in Zone's Scope section beside `role`, saying how the zone's markers are joined. `"polygon"` is a closed area (the last marker joins the first), `"line"` an open path drawn in marker order; lowercase. Empty, absent or any other value means not stated, and a reader draws a polygon. Generated as `shape?: string` on `ZoneV2`, `FIELD_SCHEMA.zone.shape` (`{ type: 'text' }`), and in Zone's `Scope` entry of `ELEMENT_SECTIONS`. `ONLYWORLDS_VERSION` is `'00.33.00'`.

### Changed

- **Schema repinned to schema-dist v0.33.0-dist.43** (canonical 00.33.00). Only `schema/zone.yaml` and `schema.json` moved, by the one field; `VERSION`, `README.md`, `example/world-export.json` and `MANIFEST.json` carry the new version; nothing else.

## [4.53.3] - 2026-10-22

### Changed

- **Schema repinned to schema-dist v0.32.2-dist.42** (same canonical 00.32.02; fixtures/owworld gains `fail-OW-6-marker-bom`, a `mimetype` marker that starts with a byte order mark, 81 cases; nothing else; no schema file moved). It is the case 4.53.2's fix refuses: the reader rejects it as `marker`, and the set runs 81 of 81. Generated output moves its provenance lines only.

## [4.53.2] - 2026-10-22

### Fixed

- **A `mimetype` marker with a byte order mark is refused** (`marker`, spec §4.7 OW-6). The reader compared the entry as decoded text, and `TextDecoder`'s default strips a leading BOM, so a marker of BOM plus the media type passed; the spec says bytes exactly. Found by the Python package's port of the reader (`onlyworlds` 0.17.0), which refused it. No fixture carries the case yet (proposed for the conformance set).

## [4.53.1] - 2026-10-22

### Changed

- **Schema repinned to schema-dist v0.32.2-dist.41** (same canonical 00.32.02; the dist now carries the `.owworld` conformance set at `fixtures/owworld/`, 80 cases, with `verdicts.json` and `CaseFolding-15.1.0.txt`, and its folder lint names a `world.json` with an `api` block that git tracks; no schema file moved). The set's two newest cases are `fail-OW-14-crc`, an entry whose bytes fail the CRC its headers declare, and `fail-OW-14-stored-short`, a stored entry holding fewer bytes than it declares. The reader already refused both as `not_openable`, naming the entry, and needed no change. The world-file conformance test reads the set from the vendored dist, so it runs in CI too, where it used to skip; it also checks that every zip on disk has a verdict. The fold table's test and generator read the dist's `CaseFolding-15.1.0.txt`, the same file the SDK held, and the table is unchanged. Folder spec §4.7 is RULED (v0.3.13). Nothing in the published package changes but its version and these documents: `codegen/` does not ship.

## [4.53.0] - 2026-10-22

### Changed

- **The last seven options objects refuse an unknown key** too: `patch` and `editLinks` (`ifMatch`; the edit itself is `{add, remove}`), `uploadImage`, `createFileTicket`, `uploadFile`, `createWorldLink` and `createSeat`. With 4.51.0 and 4.52.0 every method of the client that takes an object now names a stray key before anything is sent; a client that drops a key it does not know has no place left.

## [4.52.0] - 2026-10-22

### Changed

- **Every options object refuses an unknown key** the way `list()` did in 4.51.0: `draught`, `get`, `create`, `bulk`, `changes`, `changesAll`, `removeImage`, `redeemJoin`, `signInWithPassword`, `mintWorldKey`, `signInWithOnlyWorlds`, `completeSignIn`, `ask` and `sort` throw a TypeError naming the key and the known keys before anything is sent. A dropped key was never harmless: `atomc: true` ran a batch non-atomically, `idempotency_key` let a retry create twice, `afetr` read the whole feed, `mode` misspelt widened a draught to the caller's view. TypeScript callers were already refused at compile time; this is for plain JavaScript.

## [4.51.0] - 2026-10-22

### Changed

- **`list()` and `listAll()` refuse an unknown top-level key** with a TypeError before anything is sent, naming the key and where a wire filter goes (`filter: { name__icontains: ... }`). Until now an unknown key was dropped without a word, so a plain-JavaScript caller who wrote `list('character', { name__icontains: 'probe' })` got every Character, unfiltered, and TypeScript's compile-time check was the only fence. A cleanup script written that way deleted 99 Characters on a test world on 2026-10-22; this is the SDK's half of the lesson. A caller who passed a stray key by accident now hears about it; the known keys are `limit`, `cursor`, `ids`, `createdBy`, `expand`, `fields`, `filter`, `viewAs`.

## [4.50.0] - 2026-10-22

### Added

- `setMyCharacter(characterId | null)`: `PUT /me/character`, a person member's pick of the roster Character that is them in this world; answers the `/me` body. `err.isCharacterHidden` for the 422 `character_hidden` it and the member PATCH answer.
- `hidden?: true` on every element body (`OwElementBase`): present only when the owner or a co-builder hid the element and this reader still sees it; never on other readers' bodies, ignored in a write.
- `site` joins `OwWriteDoor`: a write or delete the owner made signed in on onlyworlds.com.

## [4.49.0] - 2026-10-22

### Changed

- **The world file follows Folder Format §4.7, the `.owworld` archive**, and gives the spec's verdict and cause on every one of the 74 fixtures in its conformance set (Quillon's, `owworld-fixtures`), plus its three on-demand floor cases.
  - The reader parses the central directory itself (zip64 included) and runs every check on names, kinds, methods and sizes before it inflates anything.
  - Six new refusal causes join `OwWorldFileReason`: `duplicate` (OW-17), `collision` (OW-18: NFC, then simple case folding), `link` (OW-20), `method` (OW-21), `name` (OW-22) and `marker` (OW-6). A `Record<OwWorldFileReason, …>` in a caller needs the six new keys.
  - The OW-18 fold is the C and S rows of Unicode's CaseFolding.txt 15.1, built in as a table, never the runtime's casing, so a fold a newer Unicode adds stays out until the pin moves (Skeld's ruling, 2026-10-22). `simpleCaseFold(text)` exports it.
  - Files beside the world's folder are ignored, no longer `more_than_one` (OW-4). A `world.json` under `records/` is a producer's data, not a second world (OW-5). A spanned archive is `not_openable`. An entry that inflates past the size it declares is `too_big` at any budget (OW-14).
  - The default budget is the spec's floor: `WORLD_FILE_MAX_BYTES` 2 GiB (was 1 GiB), `WORLD_FILE_MAX_ENTRIES` 500,000 (was 200,000) (OW-15).
  - A `mimetype` marker is never required. One with other bytes than `WORLD_FILE_MEDIA_TYPE` (`application/vnd.onlyworlds.world+zip`, newly exported) is refused, and the marker is never returned as a file.
  - `files` come back in code point order (the UTF-8 bytes of the name), not UTF-16 order.
  - The writer gives one set of bytes for one input (OW-12, OW-13). It places the `mimetype` marker first and stored, orders entries by the UTF-8 bytes of their names, and stamps every entry 1980-01-01 00:00 (was the clock).
  - The writer writes only `world.json`, `elements/`, `spatial/`, `media/`, `records/` and a tool's dot-folder it is handed (OW-7). It leaves out any other file, and a dot-name or `.meta` inside a content folder. It refuses a `name` or a `collision` as the reader would.

## [4.48.1] - 2026-10-22

### Changed

- Schema repinned to schema-dist `v0.32.2-dist.37` (canonical 00.32.02 unchanged, so no type, field or constant moved): the dist added `profiles/` (identity, calendar with its fixture, packet, review), its folder lint reads known-of stubs and never `records/`, and its export example carries `source` and `exported_as`. The generated headers, `SCHEMA.md` and `AGENTS.md` name the new pin.

## [4.48.0] - 2026-10-22

### Added

- `listHidden()`: `GET /world/hidden`, the world's hidden elements newest first as `OwHiddenRow[]` (`type`, `id`, `set_at`, `set_by`). Any key of the owner's or a co-builder's; served with `Cache-Control: no-store`, so read it each time. For the parlor, whose host room marks what it hid (Temper, 2026-10-22).

## [4.47.0] - 2026-10-22

### Added
- `draught(characterId, policy)`: `GET /character/{id}/context` (live 2026-10-22 02:05), one Character's context in one read, typed as `OwDraught` with the policy's seven keys (`components`, `mode`, `asOf`, `undated`, `since`, `budget`, `depth`) as `OwDraughtPolicy`.
- `list` takes `ids` (1 to 200, the list's own order; one the key cannot see is absent) and `createdBy` (a membership id, or `'owner'`), the two list filters of the same PR; both were already reachable through `filter`.

## [4.46.0] - 2026-10-22

### Added
- **Sign in with OnlyWorlds** (live 2026-10-22 01:50): `signInWithOnlyWorlds({ clientId, redirectUri, resume, storage, navigate })` mints `state` and a PKCE S256 verifier, keeps them under the client id in `storage` (sessionStorage by default; required in Node), refuses a `redirectUri` that is not an `https:` string before sending, and sends the browser to `/signin/authorize`. `completeSignIn({ clientId, storage, url })` on the callback page checks `state` and the page, takes `code` and `state` out of the address bar, trades the code once at `POST /api/v2/auth/token` with no credential, and returns `OwSignInResult` (`token`, `account`, `resume`); the record is cleared either way and the SDK keeps no token. `OwSignInError` gains `invalid_grant` and `state_mismatch`. `pkceChallenge` and `base64url` exported.

## [4.45.0] - 2026-10-22

### Added
- `hide(type, id)` and `unhide(type, id)`: the hidden mark's writes, `PUT` and `DELETE /{type}/{id}/hidden`, for the parlor (Temper, 2026-10-22). 204; the element's body and `change_seq` do not move.
- `listAccountWorlds()` (`GET /account/worlds`, `OwAccountWorld[]`: owned and shared worlds with their keys by name and last four) and `mintWorldKey(worldId, { scope, name })` (`POST /account/worlds/{id}/keys`, `OwMintedKey` with the full key once), the two account routes Atlas and the parlor hand-rolled. Account token only.

## [4.44.0] - 2026-10-22

### Added
- `changes({ after })` and `changesAll(since, { after })` (live 2026-10-22 00:55): `GET /changes?after=<ISO time>` returns only the changes made at or after that time, a filter and not a position: order, `cursor`, `has_more` and `head` are unchanged, and the window is read by passing the cursor back as `since` with the same `after`. A bad value is a 422 naming `after`.

## [4.43.0] - 2026-10-22

### Added
- `adopt(type, id, member)`: change who made an element, `POST /{type}/{id}/adopt` with `{member}` (live 2026-10-22 00:43). `member` is a membership id of the world or `'owner'` (`created_by` null). The owner's key or a co-builder's with its PIN; a contributor's is 403 `not_author` (`isNotAuthor`). Returns the updated element; the write takes a new `change_seq` and the feed carries the element with its new `created_by`.
- `createWorldLink`'s `maxUses` is documented for person links too (live the same hour): 2 to 50 lets in that many accounts, each joining once with the link's role. The client sent it already; the comment said player links only.

## [4.42.4] - 2026-10-21

### Fixed
- **`parseDate` refuses a date the typed era does not hold**, rather than reading its number as an absolute year in another era. With a down era Before Gate turning on 6 Frost, "10 Thaw, 1 BG" read as step 39 ("10 Thaw, 2 AG") and "3 Frost, 0 BG" as "3 Frost, 1 BG"; both now answer `not a date in Before Gate`. The absolute reading stays for a step in no era, where `formatStep` prints the absolute year. No date `formatStep` prints changes how it parses: 20,826 round trips over the profile fixture's calendars read the same before and after. Found by Temper in Atlas 1.67.1 (2026-10-21).

## [4.42.3] - 2026-10-21

### Fixed
- **`parseDate` reads a down era's dates back to the step they were written from, with a mid-year pivot too.** 4.42.2 moved the display count to the year holding the step before the pivot, and the parse kept the old count, so with a mid-year pivot every date before it parsed back one year early ("6 Frost, 4 BG" read 20 steps early on a 20-step year). Year-boundary pivots were never affected. Found by Quillon porting 4.42.2 to the Unity SDK and confirmed on this kernel by Temper (2026-10-20); a round-trip test now holds every step on both sides of the pivot.
- `redeemJoin`'s doc names a full world's refusal as 422 `world_full` (`isWorldFull`), as keel answers since the party link; it said `invalid_request` (Quillon, 2026-10-20).

## [4.42.2] - 2026-10-20

Two calendar reading fixes, found writing the `atlas_calendar` profile's conformance fixture (2026-10-20).

### Fixed
- **A down era has no year zero, even when its pivot falls mid-year.** Its year is now counted from the year holding the step just before the pivot, which reads `year_base` (1 by default). With the pivot mid-year, the earlier steps of the pivot's own year read year 0 ("0 BG") and every year before it one lower; with the pivot on a year's first step, nothing changes. The mirror of an up era, whose first partial year is year 1.
- **Equal-start eras resolve by a stated rule:** an up era over a down one, then the later era in the list. The comparator returned `-1` for any pair led by an up era, so two eras of one direction came out in the sort's order rather than the list's.

## [4.42.1] - 2026-10-20

The calendar reader refuses what the `atlas_calendar` profile refuses (schema-dist `profiles/calendar.md`; Quillon's Unity read, 2026-10-20).

### Fixed
- **`readCalendarValue` / `readCalendarConfig` no longer throw on a falsy `eras` or `intercalary`** (`false`, `0`, `""`): it threw a `TypeError` where the profile says a reader refuses and shows bare numbers. It now returns `null`.
- **A step is an integer, so the reader now refuses** an era whose `start` or `end` is not a whole number, a `year_base` other than `0` or `1` (a string `"1"` printed as `"01"` before), and month or weekday names that are not strings. Atlas writes none of these; the Unity SDK refuses them the same way.

## [4.42.0] - 2026-10-20

Schema 00.32.02 (Skeld, 2026-10-20): repinned to schema-dist v0.32.2-dist.29.

### Changed
- **A Narrative's `start_date`** reads "Date when the narrative is first told or recorded, measured in world TIME units; the span it recounts lives on its events" (it read "Date when the narrative begins"), and **its `end_date`** reads "Date when the narrative stops being told, measured in world TIME units; empty while it is still told" (it read "Date when the narrative ends"), in the generated doc comments and `SCHEMA.md`. No field, type or link changed.
- **`ONLYWORLDS_VERSION`** is `'00.32.02'`. It is an `as const` export, so its literal type moves too, which is why this is a minor and not a patch.

## [4.41.0] - 2026-10-20

A known-of stub's public fields, live in production, and schema-dist v0.32.1-dist.28, which publishes them.

### Added
- **`PUBLIC_FIELDS`** (generated from the distribution's `presentation.json`, `types.<type>.public`): per element type,
  the fields onlyworlds.com shows on a known-of stub besides the base fields, with their values, as a readonly
  `as const` array; all 22 types present. A Character's are `physicality`, `height`, `weight`, `species` and
  `reputation`; every other type's list is empty for now. Platform behaviour, not a default to override. Codegen
  exits 1 on a tree without the sidecar, a type without the key, or a name that is not a field of its type.
- **`err.isKnownOfNotWritable`**: keel's named refusal of a write carrying `known_of`, true or false (422
  `known_of_not_writable`, `param` known_of). This client never sends `known_of` (4.40.0's strip and refusal are
  unchanged), so it reaches you only through `request()`; `/bulk` puts it in the item's slot.

### Changed
- Repinned to schema-dist v0.32.1-dist.28: `presentation.json` gains `types.<type>.public` and `_meta.public`; no
  schema file moved, so the generated interfaces change only their source lines.
- **A stub's description** on `known_of` (the generated doc comment, `SCHEMA.md` and `AGENTS.md`) says a stub
  keeps its type's `PUBLIC_FIELDS` with their values too; it said every other field reads unset.

## [4.40.0] - 2026-10-20

The "known of" stub's client half, live in production since 2026-10-20 13:47.

### Added
- **`known_of?: true`** on `OwElementBase` (generated; `SCHEMA.md` says it too): present, and true, only on a
  stub, an element a guest or player reaches only through its own Character's sheet, one step out. A stub
  keeps `id`, `type`, `name`, `description`, `supertype`, `subtype`, `image_url`, `created_at`, `updated_at`
  and `change_seq`; every other field reads unset (`""`, `null`, `[]`), `created_by`, `changed_by` and
  `changed_via` are null, it has no extension fields, and its files are 404. For Lantern and Atlas, which
  render stubs (Temper).
- **`isKnownOf(el)`**: true only for `known_of: true`; absent or anything else is a whole element.

### Changed
- **A stub is never written**: `upsert`, `patch`, `create` and `bulk` throw a `TypeError` before sending a
  body with `known_of: true` (`bulk` names the item, and sends none of the batch). Stripping the marker would
  turn keel's 422 into a write that blanks the element for any key that may write it (an owner pushing a
  player's copy). `known_of` joins the strip list, so any other value of it is never sent.

## [4.39.0] - 2026-10-20

The party link, live in production since 2026-10-20 13:15.

### Added
- The party link (for Lantern's pick screen, Temper): one player link for a
  table of players. `createWorldLink(worldId, { reader: 'player', maxUses, characters })`, sent as `max_uses`
  and `characters`: 2 to 50 uses, each player picking one Character from the owner's list, in its order; no
  list, each player names a fresh Character after themselves. A table takes no `character`. A link for one
  sends what it sent before. `OwWorldLink` and `OwCreatedWorldLink` gain a table's `max_uses` and
  `characters` (`{ id, name, taken }`); `uses` counts a table's seats. `OwJoinPreview` gains a table's
  `max_uses`, `uses_left`, `name_required` and `characters` (`{ id, name, image_url, taken }`).
  `redeemJoin(code, { character })` sends the pick; with `name_required`, `name` alone. A pick a live seat
  already plays is 422 `character_taken` (`err.isCharacterTaken`); a pick off the list, hidden or deleted
  since the link was made, or missing, is 422 `invalid_request` with param `character`
  (`err.isCharacterInvalid`, true for that param only); a world with its 50 players is 422 `world_full` (`err.isWorldFull`, its own code at my ask, Skeld, 2026-10-20); the last place
  lost to another player is the one 404 (`err.isNotFound`).

### Changed
- Repinned to schema-dist v0.32.1-dist.27: only `example/world-export.json` moved (its `schema_version` now 00.32.01, Skeld, 2026-10-20); no schema file moved, so the generated files change only their source lines.

## [4.38.0] - 2026-10-20

Schema 00.32.01 (Titus's word, 2026-10-20): repinned to schema-dist v0.32.1-dist.26.

### Changed
- **An Event's `characters`** reads "Characters who know about the event: they were present, aware of it, or involved in it" (it read "Key characters relevant to the event"), in the generated doc comment and `SCHEMA.md`. No field, type or link changed.
- **`ONLYWORLDS_VERSION`** is `'00.32.01'`. It is an `as const` export, so its literal type moves too, which is why this is a minor and not a patch.

## [4.37.0] - 2026-10-20

The hidden mark, live in production since 2026-10-20 09:24; walked on staging with the mark on, 25 of 25.

### Added
- A `/changes` delete row's `reason` (`OwDeleteReason`: `deleted` | `hidden` | `out_of_view`; keel's hidden
  mark): an element hidden from this reader leaves its copy as a deleted one does, and a GET of it answers 404,
  not 410. `isResyncRequired`'s comment names every case keel now sends it for, not only a guest's.
- `viewAs` on `get`, `list` and `listAll`, sent as `as` (view as): the owner's key reads as a
  member (a membership id), as a Character's guest (a Character id) or as the public (`'public'`). A member key
  gets 403 `view_as_owner_only` (`err.isViewAsOwnerOnly`); an element hidden from that reader is 404, never 410;
  an unknown value is 422. Until keel's hidden mark is on, keel answers 422 (an unknown parameter).
- `err.resyncReason` (`'role'` | `'view'` | `undefined`) and `OwResyncReason`: why `/changes` answered 409
  `resync_required`, from the envelope's `reason` (only while keel's hidden mark is on).
  `epoch_reason` beside `epoch` on `OwChangesPage` and on `changesHead()`'s answer: why the epoch last moved.

### Changed
- The resync instruction adds the hidden mark's reasons to 4.36.1's keep (Titus, 2026-10-20): after a
  409 `resync_required`, walk again from the start; reason `role` (the key's own role or membership moved):
  keep what the local copy holds that the walk no longer names; reason `view`, or a delete row with reason
  `hidden`: drop it; no reason (keel's hidden mark off): keep it, a reset never empties a copy. A tool never
  empties a copy on its own. `isResyncRequired`'s comment and the `changes`,
  `changesHead` and `OwChangesPage` comments say so.

## [4.36.2] - 2026-10-20

### Changed

- `pinExpectation`'s doc comment: a legacy key that can write sends its PIN on every read of a world that has one, whether or not the world is open to read (the demo split). The `'required-for-private-reads'` literal keeps its name until 5.0, since renaming a literal in a published union is a type break. A demo-range key is kind `legacy` too and never needs a PIN. No code change.

## [4.36.1] - 2026-10-20

### Changed

- The reset rule in `isResyncRequired`'s and `changes`' doc comments: on a 409 `resync_required`, walk from zero and keep what the local copy holds that the new walk does not name; a reset never empties a copy. It said replace. Keel says keep (Titus's ruling, 2026-10-20: sharing is forward-only). No code change.

## [4.36.0] - 2026-10-20

### Changed

- **`fieldLabel`** keeps a word written all in capitals as written (`STR` reads "STR", `plan_B` "Plan B"), so a custom stat block reads the same in every tool (Temper, 2026-10-20; Lantern and Atlas both call it). Schema field names are all lowercase, so no schema label changes.

## [4.35.0] - 2026-10-20

### Added

- **`createWorldLink(worldId, { preview })`** and `preview` on `OwWorldLink` (live 2026-10-20): a person or player link with `preview: true` is `/join/<world_id>#<code>`, so a chat that unfurls it shows the world's name and picture; the code stays in the fragment. Absent means off, as keel rules for the API; `true` on an agent link is 422, param `preview`. The wire gate failed on production's document until this release.

## [4.34.0] - 2026-10-20

### Added

- **`fieldLabel(name)`** and **`FIELD_ACRONYMS`**: a field name as the words a tool shows, by the house rule (Titus, 2026-10-20): sentence case, acronyms kept wherever they fall (`birth_date` → "Birth date", `image_url` → "Image URL"). Seeded from Atlas's `humanizeFieldName` as of 1.59.1, so Atlas, Lantern and Council read one copy. The name is taken as given: a tool that hides an extension prefix drops it first.

## [4.33.1] - 2026-10-19

### Fixed
- An `agent: true` client's file uploads now declare it: `createFileTicket` (and so `uploadFile`) sends
  `X-OW-Agent`, the one files route keel's document lists it on, so the file reads
  `added_by.agent: true`. The other files routes and the upload host get no such header.

## [4.33.0] - 2026-10-19

### Added
- `FILE_EXTENSIONS` (every extension a file on an element may end in, to its kind: keel's list, `.yml` and
  `.markdown` included) and `fileKindOf(name)` (the kind, or `undefined`), so a file picker's accept list reads
  the SDK's instead of a copy (Atlas, 2026-10-19).

## [4.32.0] - 2026-10-19

### Added
- **Files on elements**, for Atlas's file list on an element:
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
- **Signing in with a password**: `signInWithPassword({ email | username, password, tokenName })`
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
- `me()`'s doc names the player kind.

## [4.30.1] — 2026-10-16

### Fixed
- **`changes()` and `changesAll()` hand back every cursor as a string**, as `OwChangesPage.cursor` has
  always said. keel sends the cursor of a page at the head of the feed (an empty page, for any key but
  a guest's) as a number, and it passed through as one: a walk of an up-to-date world returned
  `{ cursor: 818 }`, so a cursor stored and compared as a string could miss. `changesHead()` already
  did this. Found on production with a demo key.

## [4.30.0] — 2026-10-16

### Added
- **A friend with only a link**:
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
- `rekeySeat(worldId, seatId)`: a new key and secret for a seat whose AI lost
  its own, by its sponsor or the world's owner. The old key and secret stop at once; the answer has
  `createSeat`'s shape (`OwSeatCreated`: `key`, `pin`, `env`), shown once. No Idempotency-Key, by keel's
  rule: if the answer is lost too, ask for another.

### Changed
- `createSeat`'s doc names `rekeySeat` as the way back from a lost answer.
- `OwApiError.param`'s doc: `API-Pin` on a 401 PIN refusal, not only a 422/400's field.

## [4.28.0] — 2026-10-16

### Added
- **Seats for your own AI**, on an account token (`ow_a_`):
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
  your items are not changed. Found by Quillon's parity audit of the Unity SDK (2026-10-16).

## [4.27.1] — 2026-10-16

### Fixed
- **A retried `create` with the same `idempotencyKey` now replays instead of failing.** `create` minted a
  fresh id on every call, so a retry of an id-less element sent a different body and keel answered 409
  `idempotency_error`. With a key and no id, the id is now derived from the key (a UUIDv5, the same id the
  Python package mints), so the retry sends the same body and gets the first answer back. Without a key,
  a fresh UUIDv7 as before; an id you pass is kept.
- `create`'s doc said a keyed retry "rewrites the same element"; keel's replay writes nothing. Found by
  Quillon's parity audit of the Unity SDK (2026-10-16).

## [4.27.0] — 2026-10-16

### Added
- `OwApiError.isIdempotencyInFlight`: a request with the same Idempotency-Key is still
  running (409 `idempotency_in_flight`, `retryAfter` 1). Nothing was written by this one; send again with
  the same key and body after `retryAfter` and it replays the first answer. `isIdempotencyConflict` stays
  the different-body case only. The client still does not retry for you.

## [4.26.0] — 2026-10-15

### Added
- **The door of every write**. An opt-in
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
  **`agent_narrator_rule`** (whether a Narrative written through an agent seat is
  narrated by that seat's own Character; read-only, set on the world page). Past `id` and `name`
  they stay optional so code that builds a world meta keeps compiling; keel always sends all of them.
  `updated_at` and `created_at` read `string | null`, as the document says. The wire gate now
  holds this type to `World` (it had held only the PATCH body). Council and Lantern type-check on it.

## [4.24.0] — 2026-10-15

### Added
- **A world's invite links** (keel C1, 48c10d4), on the owner's account token (`ow_a_`):
  `createWorldLink(worldId, { reader, role?, days?, inviterName?, withCharacter? })` answers the
  new link with its `code`, `link` and the one `line` to send (the code is in this answer only:
  keel keeps a hash); `listWorldLinks(worldId)` the links without codes, each with its `status`
  and `uses`; `revokeWorldLink(worldId, linkId)`. Types `OwWorldLink`, `OwCreatedWorldLink`. A
  non-owner, and a world that doesn't exist, get 404; a world key is a TypeError before sending.
  For Lantern's Invite someone (Temper, 2026-10-15).

### Changed
- `acceptJoin`'s doc comment and the README: accepting needs no account PIN for any role,
  so its refusals are 404 and 409 `already_member`; `pin_required` now belongs to
  minting a write key for the membership. `isPinRequired` stays.
- Doc comments say "token rating" for the account's daily budget (`ask`, `sort`, `allowance`,
  `OwAllowance`, the answers' `token_rating`), as the README did in 4.23.0; the docs site's
  generated reference reads them. No code change.

## [4.23.0] — 2026-10-14

### Deprecated
- **`TokenResource.consume()`, `getAccessKey()`, `revokeSession()`, `revokeAllSessions()`**: keel
  serves none of these routes (each answers 404 `not_found` on production; `accounts/token_api.py`
  mounts only `status/` and `encryption-info/`). Spending is server-side, in the route that does the
  work (the Council's acts through keel's council proxy, Skeld's ruling, 2026-10-14), and
  `OwV2Client.allowance()` reads the token rating. They stay callable and leave in 5.0. A 404 from
  any token route now says what keel serves instead of "an older server". Found by the wire
  gate, which until now never drove this class (its routes are not in keel's document).

### Changed
- README and docs: "token rating" is the one word for the account's daily budget (Titus,
  2026-10-14). Names in the API (`allowance()`, `/account/allowance`) are unchanged.

## [4.22.0] — 2026-10-14

### Added
- **`client.me()` and `client.members()`**: GET /me (who this world key is: world, scope, kind,
  role, membership id, Character) and GET /members (the roster's rows, unwrapped from `{ data }`).
  Lantern reads a player's role from /me by hand today. Types `OwMe`, `OwMember`, typed from
  keel's declared schemas and held to them by the wire gate. An account token is a
  TypeError before sending; the tests fail with that guard removed, or with the rows left
  wrapped.

### Changed
- The calendar kernel is the SDK's own: Atlas 245aad3 deleted its `core/calendar.ts` and imports
  this one (Temper, 2026-10-14), so the copy record (`src/calendar/SOURCES.json`) and the re-copy
  script (`codegen/atlas-calendar.mjs`) are gone. A kernel change is an SDK release now. No code
  change.

## [4.21.0] — 2026-10-14

### Added
- **`client.allowance()`**: GET /account/allowance (keel 872431f, Skeld, 2026-10-14), the
  account's daily AI allowance read without spending: `token_rating`, `tokens_used_today`,
  `tokens_remaining`, `resets_at` (the next midnight UTC). Account token only, like ask and
  sort. Type `OwAllowance`, held by the wire gate to the route's declared schema, as
  `OwAskAnswer`, `OwSortAnswer` and `OwJoinPreview` now are to theirs.

### Fixed
- README and AGENTS.md no longer say a sort counts as one ask: since keel a6244db both spend
  tokens from the allowance.

## [4.20.0] — 2026-10-14

### Added
- **World calendars**, Atlas's calendar code in the SDK so Lantern can name dates (Temper,
  2026-10-14): `formatStep`, `formatYearLabel`, `breakdownStep`, `parseDate` and the rest of
  Atlas's `src/core/calendar.ts` (Atlas 02d6a6d), plus `worldCalendars`,
  `resolveCalendarLens` and `readCalendarValue` from its `calendar-lens.ts`, on any element
  shape. `CALENDAR_FIELD` is `atlas_calendar`: Atlas owns the field, its meaning and its
  writes, and other tools read it (Skeld, 2026-10-14).
- `src/calendar/calendar.ts` is Atlas's file byte for byte, recorded in
  `src/calendar/SOURCES.json`; `codegen/atlas-calendar.mjs` re-copies it
  and ports Atlas's 48 kernel tests (TypeScript's transpiler, a five-matcher `test/expect.mjs`
  over node:test). Watched failing: a planted `floorMod` edit failed two tests and the record
  (EDITED); a lens edit failed its test. An app that imports none of it bundles none of it.

## [4.19.0] — 2026-10-14

### Added
- **`tokens_remaining` and `token_rating` on `OwAskAnswer` and `OwSortAnswer`**: since keel
  a6244db (Skeld, 2026-10-14) ask and sort spend from the account's daily token rating, one
  meter with the Council. `remaining` stays a count of answers: how many more calls of this
  size fit in what is left today (keel 504437b), never tokens. Typed from keel's code
  (`accounts/ask.py`), since its OpenAPI document gives these answers no schema.

### Changed
- **Custom fields (`x_*`) are in the lookup and on the card.** `buildWorldIndex` finds an
  element by its custom text and numbers, and `renderElement` (so `buildAskContext`) shows
  each one by its own name: `x_eye_colour` reads `eye colour: grey`; an id in one is a link,
  by name; a long value is cut like a description. `atlas_*` machinery stays out, and so do
  object values (a tool's state). Lantern shows and edits custom fields now, so Ask can answer
  what find already could (Temper, 2026-10-13). The trial's lookup
  still skips them; parity holds on its ten questions, whose fixture has no custom text.
- The lookup's stopword set is an array literal, so bundlers mark it pure and drop it from
  apps that never call the lookup (451 bytes; Temper, 2026-10-14).

## [4.18.1] — 2026-10-12

### Changed
- **Schema repinned to schema-dist v0.32.0-dist.23** (same canonical 00.32.00). The one
  generated change is the `id` doc comment: a UUID, new ids minted as uuidv7, earlier uuidv4
  ids still valid. No type changes. The vendored dist gains `walk/lint_folder.py`.
- README and AGENTS.md describe `sort()`.

## [4.18.0] — 2026-10-12

### Added
- **`client.sort({ worldId, notes, slice })`**: POST /account/sort, ask's sibling (Temper for
  Lantern, 2026-10-12; Skeld's route). Notes as words or
  `{ text, image_url }`; the slice is the app's own lookup. Rows of four kinds come back to
  review (`make`, `add_to`, `link`, `ask` with an optional `then`) and `not_proposed` with
  reasons; nothing is written. One allowance with `ask`, and the same refusals. Types
  `OwSortRef`, `OwSortNote`, `OwSortRow` and its four kinds, `OwSortAnswer`. Built against
  keel PR #4 (90961fa, Skeld's final for the types), released once it was on keel
  main and in production: verify-sdk-wire PASS 1,111 against production's document.

## [4.17.0] — 2026-10-12

### Added
- **`changesAll` returns `epoch`** beside `cursor` and `head`: the last page's, so a full walk
  says which view epoch it ran under (a guest's integer; `null` for other keys or a keel
  without the field) and the first poll after it needs no extra walk to learn it. Live on
  Moppetopia: a full walk of 465 changes returns `{ cursor, head: 818, epoch: null }`. The first
  tests of `changesAll`'s return value (Temper, 2026-10-12).

## [4.16.0] — 2026-10-12

### Added
- **`epoch` on the feed** (keel 979eb0c). `OwChangesPage.epoch` and `changesHead()`'s
  `epoch`: a guest's view epoch (an integer), `null` for every other key. It moves when what a
  guest may see changes, even with `head` unchanged, so a poll walks when either `head` or
  `epoch` moved; nothing needs to read inside the cursor. `changesHead()` answers
  `epoch: null` from a keel without the field. Checked live on Moppetopia (the head read and a
  page both carry `epoch: null`). The wire gate now holds `OwChangesPage` and `OwBulkResponse`
  to keel's `ChangesPage` and `BulkResult`, and failed on 4.15.0 for the missing
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
- **Ask your world.** `client.ask({ worldId, question, context })` sends a
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
  Not yet run live: no account token was at hand to run it with.

## [4.12.0] — 2026-10-12

### Added
- **Joining a world by link.** `previewJoin(code)` reads what a join code holds
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
  when one phrases the answer. Measured on two real worlds (a Lantern Ask trial):
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
- **Only if unchanged.** `patch(type, id, partial, { ifMatch })` and
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
