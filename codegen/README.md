# SDK types codegen

`generate_types.py` reads the OnlyWorlds schema YAML (the 22 element types)
and emits `src/v2/types.generated.ts` and `SCHEMA.md`: the `ElementType` union, one `<Type>V2`
interface per element type extending a shared `OwElementBase`, and the `ELEMENT_TYPES` /
`ELEMENT_FAMILIES` / `ELEMENT_ICONS` / `ELEMENT_SECTIONS` constants. Field shapes are pinned to
the v2 wire, not to Django columns -- single-links are `string | null`, multi-links `string[]`,
integers `number | null`, link fields use bare schema names (no `_ids` suffix), and the four
server-managed fields plus a namespaced-extension index signature (`atlas_*` / `shadow_*` / `x_*`)
ride the base.

**`OwElementBase` is DERIVED from `base_properties.yaml`** (since 2026-07-29) under a mapping
declared in `render_element_base()`. It has to be a mapping rather than a copy: the wire base
is not the schema base. TitleCase keys become snake_case; **`World` is dropped**, because the
schema's `required: [Id, Name, World]` speaks storage truth while the v2 API rejects `world` in
a request body (rulings.yaml: `required-world-wire-caveat`); four server-managed fields
(`type`, `created_at`, `updated_at`, `change_seq`) are added, since they ride every wire body
and appear in no element YAML; and only `id`/`name` stay non-optional.

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

`--schema` still accepts an out-of-tree path (e.g. a keel checkout, which keeps its inline
`family:`/`icon:` presentation wrapper keys for one cycle past this repoint as the deliberate
rollback artifact). Presentation metadata is read from the distribution's `presentation.json`
sidecar when present, and from the inline wrapper keys otherwise. **Colour values are not in the
sidecar** -- `FAMILY_COLORS` is hand-authored in `src/v2/palette.ts` and stays there.

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
`SCHEMA.md` -- change the schema upstream (via the schema council for the standard, or Skeld's
register for presentation metadata), re-pin, and regenerate. `codegen:check` compares full file
bytes **including the provenance comments**, so a docs reword to those strings fails the check
until you regenerate.
