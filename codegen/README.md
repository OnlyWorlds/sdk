# SDK types codegen

`generate_types.py` reads the canonical OnlyWorlds schema YAML (22 element types plus
`base_properties.yaml`) and emits `src/v2/types.generated.ts`: the `ElementType` union,
one `<Type>V2` interface per element type extending a shared `OwElementBase`, and the
`ELEMENT_TYPES` / `SINGLE_LINK_FIELDS` / `MULTI_LINK_FIELDS` constants the client uses
for link-aware helpers. Field shapes are pinned to the v2 wire, not to Django columns --
single-links are `string | null`, multi-links `string[]`, integers `number | null`, link
fields use bare schema names (no `_ids` suffix), and the four server-managed fields plus a
namespaced-extension index signature (`atlas_*` / `shadow_*` / `x_*`) ride the base. The
YAML parsing mirrors keel's `codegen/generate_models.py`, the proven consumer of these
files. `validate_against_cache.py` is the gate: it loads a real v2 world dump and confirms
every non-extension wire key exists in the generated interface for its type and that
link-kind fields hold the right JS shapes.

Regenerate with `python codegen/generate_types.py` (stdlib plus PyYAML; `--schema` points at
the schema dir, default `../keel/schema`). Validate with `python codegen/validate_against_cache.py`
(`--cache` points at a `<type>.json` dump dir). The schema is the single source of truth and
lives in the keel repo at `keel/schema/*.yaml`; it also drives keel's Django models, so the
SDK types and the server models stay in lockstep by construction. Do not hand-edit
`types.generated.ts` -- change the YAML (via the schema council) and regenerate.
