# SDK types codegen

`generate_types.py` reads the OnlyWorlds schema YAML (the 22 element types)
and emits `src/v2/types.generated.ts` and `SCHEMA.md`: the `ElementType` union, one `<Type>V2`
interface per element type extending a shared `OwElementBase`, and the `ELEMENT_TYPES` /
`ELEMENT_GROUPS` / `GROUP_ORDER` / `GROUP_COLORS` / `ELEMENT_ICONS` / `PUBLIC_FIELDS` / `ELEMENT_SECTIONS` / `FIELD_SCHEMA` /
`SINGLE_LINK_FIELDS` / `MULTI_LINK_FIELDS` / `ROOM_PAIRS` / `ROOM_MARK` / `MESSAGE_PAIR` /
`MESSAGE_READ_MARK` / `NOTE_PAIR` / `READING_AID_PAIRS` / `READING_AID_MARK` / `CHARTER_PAIRS` / `DRAG_PAIRS` /
`ONLYWORLDS_VERSION` constants. Field shapes are pinned to
the v2 wire, not to Django columns -- single-links are `string | null`, multi-links `string[]`,
integers `number | null`, link fields use bare schema names (no `_ids` suffix), and the ten
server-managed fields plus a namespaced-extension index signature (`atlas_*` / `shadow_*` / `x_*`)
ride the base.

**`OwElementBase` is DERIVED from `base_properties.yaml`** (since 2026-07-29) under a mapping
declared in `render_element_base()`. It has to be a mapping rather than a copy: the wire base
is not the schema base. TitleCase keys become snake_case; **`World` is dropped**, because the
schema's `required: [Id, Name, World]` speaks storage truth while the v2 API rejects `world` in
a request body (rulings.yaml: `required-world-wire-caveat`); ten server-managed fields
(`WIRE_ONLY_BASE_FIELDS`: `type`, `created_at`, `updated_at`, `change_seq`, `created_by`,
`changed_by`, `changed_via`, `changed_client`, `hidden`, `known_of`) are added, since they ride
wire bodies and appear in no element YAML; and `type`, `id` and `name` are non-optional (`id`
and `name` from `BASE_NON_OPTIONAL`, `type` from its own mapping row).

Two guards, both watched firing: a new field in `base_properties.yaml` with no mapping **exits
1** rather than silently omitting part of the standard from all 22 interfaces, and a mapped
field disappearing from the standard **exits 1** rather than emitting a base that invents
fields.

*(Until that date it was a hardcoded template literal emitted under the "GENERATED from
canonical schema YAML" banner, with `base_properties.yaml` never opened — the authority of
generated output without the derivation. Deriving it changed not one field declaration, which
is why nothing had ever caught it.)*

## Where the schema comes from (changed 2026-07-28)

The schema is **vendored** from the public distribution `github.com/OnlyWorlds/schema-dist` into
`codegen/schema-dist/`, pinned in `codegen/schema-pin.json`. Vendoring is a supported path, not a
workaround; what is **not** supported is editing the vendored copy -- a forked decoder is how one
standard quietly becomes several.

Before this, codegen read `../keel/schema` -- a sibling checkout of the **private** keel repo. Two
consequences, both now closed:

- `codegen:check` could never run in CI, because that path does not exist on a runner. It was a
  drift guard that had **never once fired**.
- The published package recorded **no provenance** for its generated types. The honest description
  was "whatever was in a local keel checkout when someone last ran the script" -- two different
  upstream commits sharing a `VERSION` string were indistinguishable from inside this repo. The
  generated file now carries the source repo, tag, commit and MANIFEST hash in its header.

`--schema` still accepts an out-of-tree path, but only a `schema/` folder with the distribution's
`presentation.json` beside it: presentation metadata is read from that sidecar alone (keel's inline
wrapper keys are no longer read). **The colour groups are generated whole** (4.102.0, serial 86):
`ELEMENT_GROUPS` from `types.<type>.family`, the type's colour word; `GROUP_ORDER` from
`colors.order`; `GROUP_COLORS` from `colors.families`, keyed by the same words. `load_colors()` exits
1 unless the order is four distinct lowercase words, the pairs name exactly those groups, and every
hex is `#rrggbb`; a type whose group is outside the order exits 1 too. The deprecated
`ELEMENT_FAMILIES`, `FAMILY_COLORS`, `FAMILY_ORDER` and `familyOf` are derived in `src/v2/palette.ts`
through one legacy table, the only place the pre-4.102.0 words stand, and leave in 5.0.
`DRAG_PAIRS` (serial 95 on, read by `dragField`) comes from the `pairs.json` sidecar beside it, presentation too:
`load_drag_pairs()` exits 1 unless the version is 1, no key repeats, each key is two distinct type slugs in code
point order joined by `+`, and each row's `field` is a link field of its `on` whose target, by the walk, is the
other type. `PUBLIC_FIELDS` (serial 28 on: `types.<type>.public`, the fields the platform shows on a
known-of stub) has no wrapper-key fallback: it is platform behaviour, not a default, so a tree
without the sidecar, a type without the key, or a name the walk does not give for that type
exits 1.

One trap worth knowing: the distribution's `VERSION` lives at the dist root and is three lines of
YAML (`canonical:` / `serial:` / `published:`), while keel's is the bare string inside `schema/`.
`ONLYWORLDS_VERSION` is a **public export with an `as const` literal type** and a documented
compatibility promise, so `read_canonical_version()` parses the `canonical:` *value* and never a
line. Taking the first line yields `'canonical: 00.30.00'` and silently changes a published type.

## The checks -- two of them, catching different things

```bash
npm run schema:verify   # the vendored tree IS the distribution we pinned
npm run codegen:check   # the committed generated output matches that schema
npm run schema:check    # both, in order
```

Neither implies the other. A correct pin with stale generated output passes the first and fails
the second; regenerated output from a substituted schema passes the second and fails the first.
Both run in CI (`.github/workflows/ci.yml`, job `schema`).

`verify_dist.py` checks the vendored files against `MANIFEST.json` **and** checks `MANIFEST.json`
itself against the hash recorded in `schema-pin.json` at pin time. The second check is the one
that catches a **moved tag**: a re-fetched manifest always agrees with the tree it arrived with,
so contents-verification alone proves internal consistency and says nothing about identity. It
also prints the pin's age and warns (never fails) once it is stale -- a check that compares you to
what you chose cannot tell you your choice went stale.

## The optional wire validator

```bash
python codegen/validate_against_cache.py --cache <dir-of-type.json-dumps>
```

Loads a real v2 world dump and confirms every non-extension wire key exists in the generated
interface for its type, and that link-kind fields hold the right JS shapes (single -> `str|None`,
multi -> `list[str]`, generic -> the `_type`/`_id` pair). The wire is truth: a mismatch means the
generated types are wrong, unless the key is a genuine namespaced extension.

⚑ **This file used to call that script "the gate". It was not one.** Its `--cache` default pointed
at a dead session-scoped temp directory belonging to another process, a missing path yielded
"0 elements (no coverage)" rather than an error, and `main()` never called `sys.exit` -- so on any
machine it printed 22 no-coverage lines and exited 0. Fixed 2026-07-28: `--cache` is required and
must exist, a mismatch exits non-zero, and a run that validated **zero** elements is itself a
failure. A check that cannot fail is worse than no check, because it answers "is this verified?"
with a yes.

It is not wired into CI, because it needs a world dump CI has no credentials for. Run it by hand
after a schema bump. (An `ow-folder-store` snapshot converts to the expected layout trivially --
one array of bodies per `<type>.json`.)

## Regenerating

```bash
npm run codegen        # writes types.generated.ts + SCHEMA.md
```

Stdlib plus **PyYAML** (codegen's only third-party dependency; this repo carries no
`requirements.txt`, so CI installs it explicitly). Do not hand-edit `types.generated.ts` or
`SCHEMA.md` -- change the schema upstream (via the schema council for the standard, or the
register for presentation metadata), re-pin, and regenerate. `codegen:check` compares full file
bytes **including the provenance comments**, so a docs reword to those strings fails the check
until you regenerate.
