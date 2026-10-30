"""schema -> TypeScript types generator (SDK 3.0 single-source pipeline).

Reads the canonical OnlyWorlds schema YAMLs (the same files that drive keel's
Django models via codegen/generate_models.py) and emits src/v2/types.generated.ts:
one interface per element type, the ElementType union, and the link-field maps the
client uses for link-aware helpers.

Field-kind parsing mirrors keel/codegen/generate_models.py -- the proven consumer
of these YAMLs. TypeScript shapes are pinned to the v2 wire, not to Django columns:
single-links serialize as `string | null`, multi-links as `string[]`, ints as
`number | null`, link fields use BARE schema names (no `_ids` suffix), and the eight
server-managed fields (type, created_at, updated_at, change_seq, created_by, changed_by,
changed_via, changed_client), the stub marker `known_of` (present only on a stub), the message
and lens profiles' served-only `x_served_trimmed` (present only on a message or a lens whose ids were left out), plus an extension
index signature ride the shared base.

Run:  python codegen/generate_types.py [--schema <a schema-dist tree>/schema]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CODEGEN = Path(__file__).resolve().parent

# The vendored, hash-verified schema distribution (github.com/OnlyWorlds/schema-dist),
# pinned in codegen/schema-pin.json and checked by codegen/verify_dist.py.
#
# BEFORE 2026-07-28 this read `REPO.parent / "keel" / "schema"` — a sibling
# checkout of the PRIVATE keel repo on one developer's disk. Two consequences,
# both of which the repoint closes:
#   - `codegen:check` could never run in CI, because that path does not exist on
#     a runner. It was a drift guard that had never once fired.
#   - The published package recorded NO provenance for its generated types. The
#     honest description was "whatever was in a local keel checkout when someone
#     last ran the script". Two different keel commits sharing a VERSION string
#     were indistinguishable from inside this repo.
DIST_DIR = CODEGEN / "schema-dist"
DEFAULT_SCHEMA_DIR = DIST_DIR / "schema"
OUT_PATH = REPO / "src" / "v2" / "types.generated.ts"

# THE WALK — imported from the vendored distribution, never re-implemented.
#
# Until 2026-07-29 this file carried its OWN copy of flatten_fields /
# _collect_field / _resolve_target / ELEMENT_TYPES / KNOWN_CATEGORIES, ~90 lines
# whose docstring said it "mirrors keel/codegen/generate_models.py". That made it
# the ELEVENTH copy of the walk — in the repo whose maintainer had just had the
# other ten deleted and written "never copy it; vendor it" into three documents.
# The copies agreed on the day they were checked, which is the only reason this
# was cheap: the founding drift case (collective.equipment) is exactly a pair of
# copies whose emitted specs matched while their rulings diverged.
# ⚑ Bytecode writing OFF before the import, and it is load-bearing, not tidiness:
# importing from the vendored tree makes CPython drop `walk/__pycache__/*.pyc`
# INSIDE it, and verify_dist.py correctly refuses any untracked file in a
# hash-verified directory. Caught by that guard on the first run of this swap —
# schema:verify went red for a file the swap itself created.
sys.dont_write_bytecode = True
sys.path.insert(0, str(DIST_DIR / "walk"))
import schema_walk as walk  # noqa: E402  (path must be set first)

# The 22 element types, in canonical order, and the link-category map — both from
# the walk, so this file holds no second membership list to drift against.
ELEMENT_TYPES = walk.ELEMENT_TYPES
KNOWN_CATEGORIES = walk.KNOWN_CATEGORIES

drift_notes: list[str] = []
_schema_version = ""


def note(msg: str) -> None:
    drift_notes.append(msg)


def load_yaml(schema_dir: Path, name: str) -> dict:
    return walk.load_yaml(schema_dir, name)


def flatten_fields(doc: dict, type_slug: str, include_required: bool = False) -> list[dict]:
    """Delegate to the vendored walk, with THIS generator's note sink attached.

    The sink is not optional decoration: the walk's default is a no-op, so a
    vendored walk meeting a newer schema drops the unknown field in total
    silence (rulings.yaml: unknown-field-types-must-be-surfaced). Passing `note`
    is what turns that silence into a drift note on every run.
    """
    return walk.flatten_fields(
        doc, type_slug, note=note,
        include_required=include_required, include_desc=True,
    )


# ---------------------------------------------------------------------------
# TypeScript emission
# ---------------------------------------------------------------------------
HEADER = """\
// GENERATED from OnlyWorlds canonical schema YAML -- do not hand-edit. Regenerate: python codegen/generate_types.py
//
__PROVENANCE__
//
// One interface per element type, extending OwElementBase. Field shapes are the v2
// wire shapes: single-links are `string | null`, multi-links `string[]`, ints
// `number | null`. Link fields use bare schema names (no `_ids` suffix). The eight
// server-managed fields (type, created_at, updated_at, change_seq, created_by, changed_by,
// changed_via, changed_client), the stub marker `known_of` (present only on a stub), the served-only
// `x_served_trimmed` (present only on a message or a lens whose ids were left out) and the
// extension index signature live on OwElementBase.

__ELEMENT_BASE__
"""


# --- OwElementBase: DERIVED from base_properties.yaml, under a declared mapping ---
#
# Until 2026-07-29 this interface was a hardcoded literal sitting inside HEADER --
# emitted under a "GENERATED from OnlyWorlds canonical schema YAML" banner while the
# generator had never once opened base_properties.yaml, which the distribution ships.
# It carried the authority of generated output without the derivation. It was also
# correct, which is why nothing ever caught it.
#
# It cannot be a straight copy of the schema base, and that is the whole reason the
# mapping is spelled out here instead of being implied:
#
#   - Schema keys are TitleCase (Id, Name, Image_URL); the wire is snake_case.
#   - `World` is DROPPED. The schema's `required: [Id, Name, World]` speaks storage
#     truth -- every element row has a world -- while the v2 API REJECTS `world` in a
#     request body, because the API key determines the world. (rulings.yaml:
#     required-world-wire-caveat. Canonical truing rides a later YAML bump.)
#   - Nine server-managed fields are ADDED. They exist on wire bodies and in no
#     element YAML: type, created_at, updated_at, change_seq, created_by, changed_by,
#     changed_via, changed_client, and doors (the last four served to members only).
#   - One server-managed marker is ADDED that rides only some bodies: `known_of`,
#     present and true only on a stub, never on a whole element.
#   - Only Id and Name stay non-optional. Everything else is optional per
#     rulings.yaml: nullable-by-default -- only `name` is truly required, and `id` is
#     present on every body the server returns.
#
# Descriptions now come from the YAML rather than from paraphrase, so the published
# JSDoc says what the standard says.
WIRE_ONLY_BASE_FIELDS = [
    ("type", "Element type slug (server-managed, read-only).", "string", True),
    ("created_at", "Creation timestamp (server-managed, read-only).", "string", False),
    ("updated_at", "Last-update timestamp (server-managed, read-only).", "string", False),
    ("change_seq", "Per-world change cursor, stamped on every write (server-managed, read-only).", "number", False),
    ("created_by", "The membership that created this element (server-managed, read-only); null for the world's owner and for anything created before memberships existed.", "string | null", False),
    # The last write's author and the door it came through.
    ("changed_by", "The membership whose write last changed this element (server-managed, read-only; served to the world's members only, absent for the public reader); null for the world's owner and for anything last changed before writes recorded it.", "string | null", False),
    ("changed_via", "The door of the last write (server-managed, read-only; served to the world's members only, absent for the public reader): `seat` (an agent seat), `mcp`, `declared` (a client that sent X-OW-Agent), then `api`, `v1`, `sync`, `server` (keel's own writes) or `site` (the owner signed in on onlyworlds.com). The first three are agent-made. Null for anything last changed before writes recorded it.", "'seat' | 'mcp' | 'declared' | 'api' | 'v1' | 'sync' | 'server' | 'site' | null", False),
    # The client's own name for itself, from X-OW-Client.
    ("changed_client", "The name the client gave in the X-OW-Client header on the last write (server-managed, read-only; served to the world's members only, absent for the public reader): lower case letters, digits and hyphens, 1 to 32 characters, such as `sdk` or `atlas`. It is the client's claim about itself, never proof, and says nothing about whether an agent drove the write (that is `changed_via`). Null when the last write sent no name or one outside the rule, for keel's own writes, and for anything last changed before names were recorded. Sent in a write it is ignored. This SDK sends its `client` option, `sdk` by default.", "string | null", False),
    # Each tool that wrote it, and when (members only).
    ("doors", "Each tool that wrote this element, with the time of its last write there (server-managed, read-only): one key per tool, the name it gave in X-OW-Client or else the door word of that write (`site`, `api`, `mcp`, ...), each value the `updated_at` that write left; at most 16 keys, the one with the oldest time dropped past that. Stamped from 2026-10-29 on, so an element not written since carries none. Served to the world's members only: absent for the public reader, on a known-of stub, in the change feed's bodies and in a world file.", "Record<string, string>", False),
    # The sheet grant's stub marker.
    # The hidden mark, shown to the readers who still see the element.
    ("hidden", "Present, and true, only when the world's owner or a co-builder hid this element and this reader still sees it (server-managed, read-only): the owner, a co-builder, a key the owner minted, or the member who made it; to every other reader the element does not exist. Absent otherwise, whatever `fields` asked; on the read, the list, the change feed's upserts and MCP, never in the download, world sync or v1. Sent on a create (a POST, a PUT of a new id, a bulk item that creates), `hidden: true` creates the element hidden, from the owner's keys or a co-builder's; any other key gets 403 `hidden_not_allowed` and nothing is created. On any other write it is ignored: hide and unhide with hide() and unhide().", "true", False),
    ("known_of", "Present, and true, only on a stub (server-managed, read-only): an element a guest or player reaches only through its own Character's sheet. A stub keeps id, type, name, description, supertype, subtype, image_url, created_at, updated_at and change_seq, and the fields its type lists in PUBLIC_FIELDS with their values; every other field reads unset (\"\", null, []), created_by/changed_by/changed_via null, no extension fields, and its files are 404. Its empties are not values and not a deletion: never write a stub back. Absent: the element is whole. See isKnownOf().", "true", False),
    # The message and lens profiles' served-only mark (keel serves it on a message, a Narrative, and on a
    # lens, a Construct; every write refuses it by name). Never stripped from a body this SDK is given, unlike known_of: the refusal is the signal.
    ("x_served_trimmed", "Served only, on a message or a lens, never which ids or how many. On a message (the message profile, schema-dist `profiles/message.md`): present when ids in `characters` or `narrator` were left out because this reader may not see them, naming those fields (`characters` before `narrator`). An empty `characters` with `characters` named here is to someone the reader cannot see, never to everyone; a null `narrator` with `narrator` named is a sender the reader cannot see. On a lens (a Construct with supertype Lens, schema-dist `profiles/lens.md`): present when anchor ids were left out because this reader may not see them, naming those anchor fields in the schema's order, then `notes` when an anchor's note was left out of `x_lens` with it. A lens whose anchor fields are empty and that carries the mark is anchored (it resolves to nothing for this reader), never a filter over the whole world. Absent when nothing was left out, and always for the keyless public reader; on a lens also always for the world's owner, its co-builders and keys the owner minted. A write that carries it is refused (422 `served_trimmed_not_writable`): never send it back. See hasUnseenRecipients(), senderStatus() and resolveLens().", "string[]", False),
]
BASE_KEY_TO_WIRE = {
    "Id": "id", "Name": "name", "Description": "description",
    "Supertype": "supertype", "Subtype": "subtype", "Image_URL": "image_url",
}
BASE_DROPPED_FROM_WIRE = {"World"}
BASE_NON_OPTIONAL = {"id", "name"}


def render_element_base(schema_dir: Path) -> str:
    doc = walk.load_yaml(schema_dir, "base_properties")
    props = doc.get("properties") or {}

    unknown = set(props) - set(BASE_KEY_TO_WIRE) - BASE_DROPPED_FROM_WIRE
    if unknown:
        raise SystemExit(
            f"base_properties.yaml grew field(s) this generator has no mapping for: "
            f"{sorted(unknown)}. Add them to BASE_KEY_TO_WIRE (with the wire spelling) "
            f"or to BASE_DROPPED_FROM_WIRE (with a reason), then regenerate. Refusing to "
            f"emit a base that silently omits part of the standard."
        )
    missing = set(BASE_KEY_TO_WIRE) - set(props)
    if missing:
        raise SystemExit(
            f"base_properties.yaml no longer declares {sorted(missing)}, which this "
            f"generator maps onto the wire base. The standard moved under us -- resolve "
            f"deliberately rather than emitting a base that invents fields."
        )

    lines = [
        "/** Every element carries these. The extension index signature admits namespaced",
        " *  pass-through fields (atlas_* / shadow_* / x_*) returned verbatim by the server.",
        " *  Derived from base_properties.yaml: `World` is dropped (the API rejects it in",
        " *  bodies -- the key determines the world) and the eight server-managed fields are",
        " *  added, since they ride every wire body and appear in no element YAML; `known_of`",
        " *  rides only a stub, `x_served_trimmed` only a message or a lens whose ids were left out. */",
        "export interface OwElementBase {",
    ]
    emitted: set[str] = set()

    def emit(name: str, desc: str, ts: str, required: bool) -> None:
        lines.append(f"  /** {desc} */")
        lines.append(f"  {name}{'' if required else '?'}: {ts};")
        emitted.add(name)

    type_field = next(f for f in WIRE_ONLY_BASE_FIELDS if f[0] == "type")
    emit(*type_field)
    for schema_key, wire_name in BASE_KEY_TO_WIRE.items():
        spec = props[schema_key] or {}
        desc = (spec.get("description") or "").strip()
        if not desc:
            note(f"base_properties.{schema_key}: no description in the YAML.")
            desc = wire_name
        emit(wire_name, f"{desc}.", "string", wire_name in BASE_NON_OPTIONAL)
    for name, desc, ts, required in WIRE_ONLY_BASE_FIELDS:
        if name not in emitted:
            emit(name, desc, ts, required)

    lines.append("  /** Namespaced extension fields (atlas_* / shadow_* / x_*), returned verbatim. */")
    lines.append("  [ext: string]: unknown;")
    lines.append("}")
    return "\n".join(lines)


def _ts_field(f: dict) -> list[str]:
    """Return TS interface lines for one field (JSDoc + declaration)."""
    lines: list[str] = []
    desc = f.get("desc")
    kind = f["kind"]
    if kind == "generic":
        # Emitted as a pair; annotate both with the shared description.
        if desc:
            lines.append(f"  /** {desc} (type discriminator half of the generic link). */")
        lines.append(f'  {f["name"]}_type: string | null;')
        if desc:
            lines.append(f"  /** {desc} (UUID half of the generic link). */")
        lines.append(f'  {f["name"]}_id: string | null;')
        return lines

    if desc:
        lines.append(f"  /** {desc} */")
    if kind == "scalar_str":
        lines.append(f'  {f["name"]}?: string;')
    elif kind == "scalar_int":
        lines.append(f'  {f["name"]}: number | null;')
    elif kind == "single":
        tgt = f.get("target") or "any"
        lines.append(f'  {f["name"]}: string | null;  // -> {tgt}')
    elif kind == "multi":
        tgt = f.get("target") or "any"
        lines.append(f'  {f["name"]}: string[];  // -> {tgt}')
    return lines


def render_interface(type_slug: str, fields: list[dict]) -> str:
    cls = f"{type_slug.capitalize()}V2"
    scalars = [f for f in fields if f["kind"] in ("scalar_str", "scalar_int")]
    singles = [f for f in fields if f["kind"] == "single"]
    generics = [f for f in fields if f["kind"] == "generic"]
    multis = [f for f in fields if f["kind"] == "multi"]

    lines = [f"export interface {cls} extends OwElementBase {{"]
    lines.append(f'  type: "{type_slug}";')
    # Field order follows the wire: scalars, single-links, generics, multi-links.
    for group in (scalars, singles, generics, multis):
        for f in group:
            lines.extend(_ts_field(f))
    lines.append("}")
    return "\n".join(lines)


HEX = re.compile(r"#[0-9a-f]{6}")


def parse_sections(doc: dict, tslug: str) -> list[dict]:
    """Sections ARE the canonical document structure: top-level `properties`
    keys are section names, their nested `properties` are the fields, both in
    document order (order IS display order; ruling 2026-07-23 —
    sections are DERIVED from the standard tier, not a wrapper key)."""
    out = []
    props = doc.get("properties") or {}
    for i, (section_name, section) in enumerate(props.items()):
        fields = list((section.get("properties") or {}).keys())
        if not fields:
            note(f"{tslug}.{section_name}: empty section in canonical YAML")
        out.append({"name": section_name, "order": i + 1, "fields": fields})
    return out


def render_maps(all_fields: dict[str, list[dict]], groups: dict[str, str],
                colors: tuple[list[str], dict[str, dict[str, str]]],
                icons: dict[str, str], sections: dict[str, list[dict]],
                public: dict[str, list[str]]) -> str:
    types_sorted = sorted(ELEMENT_TYPES)
    lines: list[str] = []

    union = " | ".join(f"'{t}'" for t in types_sorted)
    lines.append(f"export type ElementType = {union};")
    lines.append("")

    arr = ", ".join(f"'{t}'" for t in types_sorted)
    lines.append(f"export const ELEMENT_TYPES: ElementType[] = [{arr}];")
    lines.append("")

    lines.append("/** Canonical OnlyWorlds schema version. Source: the `canonical:` value of the pinned")
    lines.append(" *  distribution's VERSION file (see the provenance block at the top of this file). */")
    lines.append(f"export const ONLYWORLDS_VERSION = '{_schema_version}' as const;")
    lines.append("")

    group_order, group_colors = colors
    group_union = " | ".join(f"'{g}'" for g in group_order)
    lines.append("/** The four colour groups, named by their colour. A visual aid for drawing the 22 types,")
    lines.append(" *  not part of the standard: colour carries the group, ELEMENT_ICONS carries the type. */")
    lines.append(f"export type ElementGroup = {group_union};")
    lines.append("")
    lines.append("/** Per-type colour group. Source: the distribution's `presentation.json` sidecar")
    lines.append(" *  (`types.<type>.family`): first-party drawing DEFAULTS, NOT part of the council-governed")
    lines.append(" *  OnlyWorlds standard, and explicitly overridable by any consumer. */")
    lines.append("export const ELEMENT_GROUPS: Record<ElementType, ElementGroup> = {")
    for t in types_sorted:
        lines.append(f"  {t}: '{groups[t]}',")
    lines.append("};")
    lines.append("")
    arr = ", ".join(f"'{g}'" for g in group_order)
    lines.append("/** The four colour groups in the distribution's order (`colors.order`), the order the")
    lines.append(" *  palette was checked for colour-vision separation in. */")
    lines.append(f"export const GROUP_ORDER: readonly ElementGroup[] = [{arr}];")
    lines.append("")
    lines.append("/** Each colour group's hex per surface mode, from the sidecar's `colors`: `light` assumes")
    lines.append(" *  near-white surfaces, `dark` near-black (measured against #0a0a0a). Checked for")
    lines.append(" *  colour-vision separation; dark-mode pairs sit in the 6-8 deltaE floor band, so show")
    lines.append(" *  the icon and label with the colour, never the colour alone. */")
    lines.append("export const GROUP_COLORS: Record<ElementGroup, { light: string; dark: string }> = {")
    for g in group_order:
        pair = group_colors[g]
        lines.append(f"  {g}: {{ light: '{pair['light']}', dark: '{pair['dark']}' }},")
    lines.append("};")
    lines.append("")

    lines.append("/** Material Symbols icon name per type. Source: the distribution's `presentation.json` sidecar. */")
    lines.append("export const ELEMENT_ICONS: Record<ElementType, string> = {")
    for t in types_sorted:
        lines.append(f"  {t}: '{icons[t]}',")
    lines.append("};")
    lines.append("")

    lines.append("/** The fields onlyworlds.com shows on a known-of element (`known_of: true`, see isKnownOf)")
    lines.append(" *  besides the base fields, with their values; every other field of a stub reads unset.")
    lines.append(" *  Platform behaviour, not a default to override. Source: the distribution's")
    lines.append(" *  `presentation.json` sidecar, `types.<type>.public`. */")
    lines.append("export const PUBLIC_FIELDS = {")
    for t in types_sorted:
        arr = ", ".join(f"'{n}'" for n in public[t])
        lines.append(f"  {t}: [{arr}],")
    lines.append("} as const satisfies Record<ElementType, readonly string[]>;")
    lines.append("")

    lines.append("/** Field grouping for display. DERIVED from the canonical schema's own document")
    lines.append(" *  structure (top-level property groups, document order = display order). */")
    lines.append("export interface SectionInfo { name: string; order: number; fields: string[]; }")
    lines.append("")
    lines.append("export const ELEMENT_SECTIONS: Record<ElementType, SectionInfo[]> = {")
    for t in types_sorted:
        lines.append(f"  {t}: [")
        for s in sections[t]:
            lines.append(f"    {{ name: '{s['name']}', order: {s['order']}, fields: {_ts_str_array(s['fields'])} }},")
        lines.append("  ],")
    lines.append("};")
    lines.append("")

    lines.append("/** Single-link field names per type (bare schema names). */")
    lines.append("export const SINGLE_LINK_FIELDS: Record<ElementType, string[]> = {")
    for t in types_sorted:
        names = [f["name"] for f in all_fields[t] if f["kind"] == "single"]
        lines.append(f"  {t}: {_ts_str_array(names)},")
    lines.append("};")
    lines.append("")

    lines.append("/** Multi-link field names per type (bare schema names). */")
    lines.append("export const MULTI_LINK_FIELDS: Record<ElementType, string[]> = {")
    for t in types_sorted:
        names = [f["name"] for f in all_fields[t] if f["kind"] == "multi"]
        lines.append(f"  {t}: {_ts_str_array(names)},")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


FIELD_SCHEMA_INTRO = """
// ---------------------------------------------------------------------------
// FIELD_SCHEMA -- per-type field metadata (type, link target, required flag).
//
// GENERATED since 2026-07-29. It was ~650 hand-maintained lines, publicly
// exported, with a test that checked only that its keys matched ELEMENT_TYPES
// and that nothing was still typed 'number' -- not one field name, link target
// or required flag was ever compared to the schema. It was wrong in two places
// when the comparison was finally run:
//
//   collective.equipment  target 'construct' -> 'object'. The founding case of
//     the ruling table (rulings.yaml: collective-equipment-target), ruled on
//     2026-07-23 and fixed the same week in the GENERATED path, while this
//     hand-maintained copy of the same fact in the same package kept shipping
//     the decommissioned v1 value on `latest` for six days. The fix went where
//     someone happened to be looking.
//   relation.relations    removed. A multi_link to 'relation' that does not
//     exist in relation.yaml at all -- a phantom field, exported, that the v2
//     API would 422 on as an unknown key.
//
// Two DECLARED deviations from a naive schema read, both matching what codegen
// already emits for the interfaces:
//   - pin.element is a `generic-link` and is split into element_type (text) +
//     element_id (single_link, target 'any'), which is what the v2 wire serves.
//   - `integer_max` / `max` are deprecated (removal at 5.0.0) and emitted by
//     nothing. The schema's `maximum:` is advisory -- the wire does not enforce
//     it -- so the walk stays silent on bounds permanently (ruled 2026-07-29).
//     There is no source for them, and none is coming.
//
// `required: true` appears on `name` only, which is all the schema requires since
// canonical 00.30.02 (rulings.yaml: nullable-by-default). Through 4.3.0 this table copied
// the older pin/marker lists, so a form built from it demanded coordinates the server
// does not; 4.4.0 to 4.7.0 dropped them by hand.
// ---------------------------------------------------------------------------

/** Field type definitions for OnlyWorlds elements. */
export type FieldType =
  | 'text'           // Text fields
  | 'integer'        // Positive integers
  /**
   * @deprecated Emitted by nothing, and scheduled for removal in 5.0.0.
   *
   * No `FIELD_SCHEMA` entry has ever carried this type, in the entire history of
   * this repository. It was meant to surface the schema's `maximum:` constraint,
   * and that constraint is **advisory**: keel declares no `MaxValueValidator` and
   * the wire stores `charisma: 9999` against a `maximum: 100` field (201, verbatim).
   * The canonical schema walk therefore stays silent on bounds permanently, so
   * there is no source to wire this to and no promise it could keep. A public type
   * member meaning "hint the wire ignores" is one consumers read as validation.
   */
  | 'integer_max'
  | 'single_link'    // Single element reference
  | 'multi_link';    // Array of element references

/** Field metadata structure. */
export interface FieldInfo {
  type: FieldType;
  target?: string;    // For link fields: target element type
  /** @deprecated Never populated; removed in 5.0.0. See `FieldType.integer_max`. */
  max?: number;
  required?: boolean; // True only for `name`, the one field the wire requires (rulings.yaml: nullable-by-default)
}
"""

# The five base fields every element carries, with the required flags the wire
# enforces. `name` is the only required field in the standard (rulings.yaml:
# nullable-by-default); the other four are spelled out as false rather than
# omitted because consumers read this table to build forms.
BASE_FIELD_ROWS = [
    ("name", "{ type: 'text', required: true }"),
    ("description", "{ type: 'text', required: false }"),
    ("supertype", "{ type: 'text', required: false }"),
    ("subtype", "{ type: 'text', required: false }"),
    ("image_url", "{ type: 'text', required: false }"),
]


def _field_schema_entries(f: dict, required: bool) -> list[tuple[str, str]]:
    """One walk field spec -> the (name, TS-literal) rows it contributes."""
    req = ", required: true" if required else ""
    kind = f["kind"]
    if kind == "scalar_str":
        return [(f["name"], f"{{ type: 'text'{req} }}")]
    if kind == "scalar_int":
        return [(f["name"], f"{{ type: 'integer'{req} }}")]
    if kind in ("single", "multi"):
        ts = "single_link" if kind == "single" else "multi_link"
        tgt = f.get("target") or "any"
        return [(f["name"], f"{{ type: '{ts}', target: '{tgt}'{req} }}")]
    if kind == "generic":
        # pin.element only. Declared deviation -- the wire serves the pair, and
        # render_interface() splits it the same way.
        return [
            (f"{f['name']}_type", f"{{ type: 'text'{req} }}"),
            (f"{f['name']}_id", f"{{ type: 'single_link', target: 'any'{req} }}"),
        ]
    note(f"FIELD_SCHEMA: unhandled kind `{kind}` on {f['name']} -- omitted.")
    return []


def render_field_schema(all_fields: dict[str, list[dict]],
                        sections: dict[str, list[dict]],
                        required_sets: dict[str, set[str]]) -> str:
    lines: list[str] = [FIELD_SCHEMA_INTRO.rstrip(), ""]
    lines.append("export const FIELD_SCHEMA = {")
    for tslug in sorted(ELEMENT_TYPES):
        by_name = {f["name"]: f for f in all_fields[tslug]}
        required = required_sets[tslug]
        lines.append(f"  {tslug}: {{")
        lines.append("    // Base fields (shared by all elements)")
        for fname, literal in BASE_FIELD_ROWS:
            lines.append(f"    {fname}: {literal},")
        rows: list[str] = []
        # Sections are the YAML's own groups, and a field can appear in TWO of
        # them (relation.events is declared in both Nature and Involves). The
        # walk dedupes its field LIST; iterating sections re-introduces the
        # duplicate, which in an object literal is a silently-overwritten key —
        # so dedupe here too, keeping the first section, exactly as the walk
        # keeps the first spec. Caught by esbuild warning on the first build.
        emitted_names: set[str] = {name for name, _ in BASE_FIELD_ROWS}
        for section in sections[tslug]:
            emitted_here: list[str] = []
            for fname in section["fields"]:
                spec = by_name.get(fname)
                if spec is None:
                    # An unknown YAML type the walk skipped — already noted by it.
                    continue
                for name, literal in _field_schema_entries(spec, fname in required):
                    if name in emitted_names:
                        continue
                    emitted_names.add(name)
                    emitted_here.append(f"    {name}: {literal},")
            if emitted_here:
                rows.append(f"    // {section['name']}")
                rows.extend(emitted_here)
        if rows:
            rows[-1] = rows[-1].rstrip(",")
        lines.extend(rows)
        lines.append("  },")
    lines[-1] = lines[-1].rstrip(",")
    # `as const` is NOT decoration: the hand-maintained table carried it, so the
    # published .d.ts exposes deeply-readonly literal types ({ readonly type:
    # "text" }). Emitting `satisfies` alone would silently widen every entry in
    # the public type surface — a breaking change with no runtime signal.
    # `as const satisfies` keeps the old types and adds the check.
    lines.append("} as const satisfies Record<ElementType, Record<string, FieldInfo>>;")
    return "\n".join(lines)


def _ts_str_array(names: list[str]) -> str:
    if not names:
        return "[]"
    return "[" + ", ".join(f"'{n}'" for n in names) + "]"


SCHEMA_MD_PATH = REPO / "SCHEMA.md"

SCHEMA_MD_HEADER = """\
# OnlyWorlds Schema Reference

__SCHEMA_SOURCE__

GENERATED from the canonical schema YAML — do not hand-edit (regenerate: `python codegen/generate_types.py`).
Written for both humans and AI agents reading this package locally.

**The shape rules** (v2 wire dialect): every element carries `id` (UUID), `name`, optional
`description`/`supertype`/`subtype`/`image_url`, server-managed `type`/`created_at`/`updated_at`/`change_seq`/`created_by`,
`known_of: true` only on a stub (an element a guest knows of through its Character's sheet:
its type's `PUBLIC_FIELDS` carry values, its other fields read unset and are not values; never write a stub back),
and namespaced extension fields (`x_*` etc.) returned verbatim. Link fields use ONE bare
name in both read and write (no `_ids` suffix). Single links are `UUID | null`; multi links
are `UUID[]`. **Links are owned one-way**: the type listed below owns the field (e.g.
Character owns `abilities`; Ability has no `characters`). Sections and their order are the
canonical display grouping.

Colour groups (a visual aid for drawing the 22 types, not part of the standard; colour carries
the group, the icon carries the type): __GROUP_ORDER__.
"""


def render_schema_md_source() -> str:
    """The self-dating line for SCHEMA.md.

    SCHEMA.md ships in the npm tarball and is read by agents cold, outside this
    repo, where `schema-pin.json` is not present — so the provenance has to be
    IN the file. Rendered from pin data only (never the wall clock), so
    regeneration is reproducible and the line moves exactly when the pin moves.
    """
    pin_path = CODEGEN / "schema-pin.json"
    if not pin_path.is_file():
        return ("**Source**: an out-of-tree schema directory — this build is NOT "
                "reproducible from the pinned distribution. Do not commit it.")
    pin = json.loads(pin_path.read_text(encoding="utf-8"))
    return (f"**Source**: {pin.get('repo')} @ **{pin.get('tag')}** — canonical schema "
            f"**{pin.get('canonical_version')}**, published {pin.get('published')}.")


def render_schema_md(all_fields, groups, group_order, icons, sections) -> str:
    kind_label = {
        "scalar_str": "text",
        "scalar_int": "integer",
        "single": "single link",
        "multi": "multi link",
        "generic": "generic link (any element type)",
    }
    by_name = {}
    parts = [SCHEMA_MD_HEADER
             .replace("__SCHEMA_SOURCE__", render_schema_md_source())
             .replace("__GROUP_ORDER__", " · ".join(group_order))]
    for tslug in sorted(ELEMENT_TYPES):
        fields = all_fields[tslug]
        by_name = {f["name"]: f for f in fields}
        parts.append(f"\n## {tslug}  ·  colour: {groups[tslug]}  ·  icon: {icons[tslug]}\n")
        for sec in sections[tslug]:
            parts.append(f"\n### {sec['name']}\n")
            for fname in sec["fields"]:
                f = by_name.get(fname)
                if f is None:
                    # generic links appear in sections under their YAML name
                    parts.append(f"- `{fname}` — generic link (any element type)")
                    continue
                kind = kind_label.get(f["kind"], f["kind"])
                tgt = f" → {f['target']}" if f.get("target") else ""
                desc = f.get("desc") or ""
                parts.append(f"- `{fname}` ({kind}{tgt}){' — ' + desc if desc else ''}")
        parts.append("")
    return "\n".join(parts) + "\n"


def render_provenance(schema_dir: Path) -> str:
    """The provenance block stamped into the generated output.

    This exists because before 2026-07-28 this package recorded NOTHING about
    which schema bytes produced its types. The honest description of the old
    state was "whatever was in a local keel checkout when someone last ran the
    script" — two different upstream commits sharing a VERSION string were
    indistinguishable from inside this repo. A generated artifact that cannot
    name its source is the shape of defect this pipeline exists to prevent, so
    it should not be one.
    """
    pin_path = CODEGEN / "schema-pin.json"
    if not pin_path.is_file() or DIST_DIR not in schema_dir.parents and schema_dir != DEFAULT_SCHEMA_DIR:
        return (
            "// SOURCE: an out-of-tree schema directory passed via --schema.\n"
            "// This build is NOT reproducible from the pinned distribution — do not commit it."
        )
    pin = json.loads(pin_path.read_text(encoding="utf-8"))
    return "\n".join(
        [
            f"// SOURCE: {pin.get('repo')} @ {pin.get('tag')}",
            f"//         commit          {pin.get('commit')}",
            f"//         MANIFEST sha256 {pin.get('manifest_sha256')}",
            f"//         canonical {pin.get('canonical_version')}, dist serial {pin.get('dist_serial')}, published {pin.get('published')}",
            "//",
            "// The distribution is vendored at codegen/schema-dist/ and verified two ways by",
            "// codegen/verify_dist.py: every file against MANIFEST.json, and MANIFEST.json",
            "// itself against the hash recorded at pin time. The second check is the one that",
            "// catches a moved tag -- a re-fetched manifest always agrees with the tree it",
            "// arrived with, so contents-verification alone proves consistency, never identity.",
        ]
    )


def read_canonical_version(schema_dir: Path) -> str:
    """Return the bare canonical schema version, e.g. '00.30.00'.

    TWO shapes exist and the difference is a trap:
      - the distribution's VERSION sits at the DIST ROOT and is three lines of
        YAML: `canonical: 00.30.00` / `serial: N` / `published: DATE`
      - keel's VERSION sits INSIDE schema/ and is the bare string `00.30.00`

    `ONLYWORLDS_VERSION` is a PUBLIC export with an `as const` literal type and a
    documented compatibility promise (docs/migrating-3-to-4.md). Reading the dist
    file naively emits a three-line string literal and the build fails loudly —
    which is the good outcome. The dangerous "fix" is taking the first line,
    which yields 'canonical: 00.30.00' and silently changes the literal type of a
    published export. Parse the value; never the line.
    """
    candidates = [schema_dir.parent / "VERSION", schema_dir / "VERSION"]
    for vf in candidates:
        if not vf.is_file():
            continue
        raw = vf.read_text(encoding="utf-8").strip()
        if "canonical:" in raw:
            for line in raw.splitlines():
                key, _, value = line.partition(":")
                if key.strip() == "canonical":
                    return value.strip()
            raise SystemExit(f"{vf}: has `canonical:` but no parseable value")
        if "\n" in raw:
            raise SystemExit(
                f"{vf}: multi-line VERSION with no `canonical:` key — refusing to guess. "
                "ONLYWORLDS_VERSION is a public export; a wrong value here is a silent "
                "breaking change to the published type."
            )
        return raw
    raise SystemExit(
        f"VERSION not found beside or inside {schema_dir}. The distribution carries it at "
        "the dist root; keel carries it inside schema/. A tree with neither is not a "
        "schema source."
    )


def load_presentation(schema_dir: Path) -> dict | None:
    """Load the presentation sidecar (colour group + icon defaults), if this tree has one.

    The distribution strips the presentation keys from the schema YAMLs into
    presentation.json, which makes the walk wrapper-agnostic by construction.
    A tree without it cannot be generated from: the colour groups, their colours
    (`load_colors`) and PUBLIC_FIELDS come only from the sidecar.
    """
    p = schema_dir.parent / "presentation.json"
    if not p.is_file():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    types = data.get("types")
    if not isinstance(types, dict):
        raise SystemExit(f"{p}: no `types` object — unexpected sidecar shape.")
    missing = [t for t in ELEMENT_TYPES if t not in types]
    if missing:
        raise SystemExit(
            f"{p}: presentation sidecar does not cover all 22 types — missing {missing}. "
            "This is the wiped-wrapper guard, moved to its new home: a presentation layer "
            "that silently loses types is the failure this check exists for."
        )
    return types


def load_colors(schema_dir: Path) -> tuple[list[str], dict[str, dict[str, str]]]:
    """The colour groups in order, and each group's {light, dark} hex, from the
    sidecar's `colors` (`order`, and `families` keyed by the group's colour word,
    serial 86 on). Each group in the order has exactly one pair, no pair names a
    group outside the order, and every hex is `#rrggbb` in lowercase: a sidecar
    that breaks any of these exits 1 rather than emitting a palette that reads
    as checked."""
    p = schema_dir.parent / "presentation.json"
    if not p.is_file():
        raise SystemExit(
            f"{p}: the colour groups and their colours come only from the distribution's "
            "presentation.json (`colors`); this tree has no sidecar."
        )
    colors = json.loads(p.read_text(encoding="utf-8")).get("colors")
    if not isinstance(colors, dict):
        raise SystemExit(f"{p}: no `colors` object — unexpected sidecar shape.")
    order, pairs = colors.get("order"), colors.get("families")
    if (not isinstance(order, list) or len(order) != 4 or len(set(order)) != 4
            or not all(isinstance(g, str) and re.fullmatch(r"[a-z]+", g) for g in order)):
        raise SystemExit(f"{p}: `colors.order` is {order!r}, expected four distinct lowercase words.")
    if not isinstance(pairs, dict) or sorted(pairs) != sorted(order):
        raise SystemExit(
            f"{p}: `colors.families` names {sorted(pairs) if isinstance(pairs, dict) else pairs!r}, "
            f"expected exactly the groups of `colors.order`, {order}."
        )
    out: dict[str, dict[str, str]] = {}
    for g in order:
        pair = pairs[g]
        if not isinstance(pair, dict) or sorted(pair) != ["dark", "light"]:
            raise SystemExit(f"{p}: `colors.families.{g}` is {pair!r}, expected {{light, dark}}.")
        for mode in ("light", "dark"):
            if not isinstance(pair[mode], str) or not HEX.fullmatch(pair[mode]):
                raise SystemExit(f"{p}: `colors.families.{g}.{mode}` is {pair[mode]!r}, expected #rrggbb.")
        out[g] = {"light": pair["light"], "dark": pair["dark"]}
    return order, out


def presentation_for(presentation: dict, tslug: str, order: list[str]) -> tuple[str, str]:
    """Resolve (colour group, icon) from the sidecar; the group must be one of `colors.order`."""
    entry = presentation.get(tslug) or {}
    group, icon = entry.get("family"), entry.get("icon")

    if group not in order:
        raise SystemExit(
            f"{tslug}: `family` (the colour group) is {group!r} from presentation.json — "
            f"expected one of `colors.order`, {order}. "
            "Presentation metadata is first-party rendering data, NOT part of the "
            "council-governed standard. A refresh that OVERWRITES instead of MERGING "
            "wipes it — check that first."
        )
    if not isinstance(icon, str) or not icon:
        raise SystemExit(
            f"{tslug}: `icon` missing or empty from presentation.json. "
            "Same wiped-presentation check applies as for the colour group."
        )
    return group, icon


def public_for(presentation: dict | None, tslug: str, fields: list[dict]) -> list[str]:
    """The type's `public` list from the sidecar (schema-dist serial 28 on):
    the fields the platform shows on a known-of element besides the base fields.

    Platform behaviour, not a default, so there is no fallback: a tree without the
    sidecar, a type without the key, or a name that is not a field of the type exits 1
    rather than emitting an empty list that reads as "nothing shown"."""
    if presentation is None:
        raise SystemExit(
            f"{tslug}: PUBLIC_FIELDS comes only from the distribution's presentation.json "
            "(`types.<type>.public`, serial 28 on); this tree has no sidecar."
        )
    entry = presentation.get(tslug) or {}
    if "public" not in entry:
        raise SystemExit(
            f"{tslug}: `public` missing from presentation.json. Every type carries it since "
            "serial 28 (an empty list means the base fields only); a missing key is a wiped "
            "or older sidecar, never an empty list."
        )
    pub = entry["public"]
    if not isinstance(pub, list) or not all(isinstance(n, str) and n for n in pub):
        raise SystemExit(f"{tslug}: presentation.json `public` is {pub!r}, expected a list of field names.")
    if len(set(pub)) != len(pub):
        raise SystemExit(f"{tslug}: presentation.json `public` repeats a name: {pub!r}.")
    known = {f["name"] for f in fields}
    stray = [n for n in pub if n not in known]
    if stray:
        raise SystemExit(
            f"{tslug}: presentation.json `public` names {stray}, which the walk does not give "
            "as fields of this type. Route it to the schema-dist owner; never emit a name the "
            "standard does not have."
        )
    return list(pub)


ROOM_ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|")


def load_room_pairs(schema_dir: Path) -> list[tuple[str, str]]:
    """The room profile's pairs (schema-dist serial 44 on, `profiles/room.md`): the
    type-and-supertype pairs a parlor puts in a world.

    Emitted from the fixture's `pairs` array, the machine-readable copy, and checked
    against the page's own table, which calls itself "the one list": the two must name
    the same pairs in the same order, or this exits 1 rather than choose between them.
    A convention profile, not the standard, so there is no fallback: a tree without the
    profile exits 1 rather than emitting an empty list that reads as "no room"."""
    profiles = schema_dir.parent / "profiles"
    fixture_path, page_path = profiles / "room.fixture.json", profiles / "room.md"
    if not fixture_path.is_file() or not page_path.is_file():
        raise SystemExit(
            f"ROOM_PAIRS comes only from the distribution's profiles/room.fixture.json and "
            f"profiles/room.md (serial 44 on); this tree lacks {fixture_path if not fixture_path.is_file() else page_path}."
        )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw = fixture.get("pairs")
    if not isinstance(raw, list) or not raw or not all(
        isinstance(p, dict) and set(p) == {"type", "supertype"}
        and isinstance(p["type"], str) and isinstance(p["supertype"], str) for p in raw
    ):
        raise SystemExit(f"{fixture_path}: `pairs` is {raw!r}, expected a list of {{type, supertype}} strings.")
    pairs = [(p["type"], p["supertype"]) for p in raw]
    stray = [t for t, _ in pairs if t not in ELEMENT_TYPES]
    if stray:
        raise SystemExit(f"{fixture_path}: pairs name {stray}, which are not element types.")
    if any(s != s.strip() or not s or "'" in s or "\\" in s for _, s in pairs):
        raise SystemExit(f"{fixture_path}: a pair's supertype is empty, carries edge spaces, or a quote "
                         f"or backslash this emitter does not escape: {pairs!r}.")
    folded = [(t.lower(), s.lower()) for t, s in pairs]
    if len(set(folded)) != len(folded):
        raise SystemExit(f"{fixture_path}: pairs repeat one another without regard to case: {pairs!r}.")
    page = page_path.read_text(encoding="utf-8")
    table = [m.groups() for m in map(ROOM_ROW.match, page.splitlines()) if m]
    if table != pairs:
        raise SystemExit(
            f"the room profile's two copies disagree: room.md's table {table} against "
            f"room.fixture.json's pairs {pairs}. Route it to the schema-dist owner; never pick one."
        )
    return pairs


def load_room_mark(schema_dir: Path) -> str:
    """The room profile's mark (serial 45 on): the extension field the parlor writes on every room
    element beside the pair. From the fixture's `mark.field`; it must sit under the profile's reserved
    prefix `x_room_` and be named in room.md, or this exits 1."""
    profiles = schema_dir.parent / "profiles"
    fixture = json.loads((profiles / "room.fixture.json").read_text(encoding="utf-8"))
    mark = (fixture.get("mark") or {}).get("field")
    if not isinstance(mark, str) or not re.fullmatch(r"x_room_[a-z0-9_]+", mark):
        raise SystemExit(f"room.fixture.json: `mark.field` is {mark!r}, expected an extension key under x_room_ "
                         "(serial 45 on: a room element is the pair AND the mark).")
    if f"`{mark}`" not in (profiles / "room.md").read_text(encoding="utf-8"):
        raise SystemExit(f"room.md does not name the fixture's mark `{mark}`. Route it to the schema-dist owner.")
    return mark


def render_room_pairs(pairs: list[tuple[str, str]], mark: str) -> str:
    lines = [
        "/** The room profile's pairs (schema-dist `profiles/room.md`, a convention on the 22 types,",
        " *  never a change to the standard): a parlor's line, board entry, work item, spec, heart,",
        " *  vote, sitting or member card. An element is a room element when its type and supertype,",
        " *  each trimmed and compared without regard to case, match one of these AND it carries the",
        " *  mark (ROOM_MARK, a non-empty string); a pair without the mark is lore (a novel's letters",
        " *  are Narratives with supertype Message). A lore view leaves room elements out unless the",
        " *  person asks; the room's own views show them whole. Match with isRoomElement. Source:",
        " *  `profiles/room.fixture.json`'s `pairs`, checked against the page's table at codegen. */",
        "export const ROOM_PAIRS: ReadonlyArray<{ readonly type: ElementType; readonly supertype: string }> = [",
    ]
    lines += [f"  {{ type: '{t}', supertype: '{s}' }}," for t, s in pairs]
    lines += [
        "];",
        "",
        "/** The room profile's mark: the extension field the parlor writes on every room element, the id",
        " *  of the world (a world's parlor) or of the sitting (a workshop) the room belongs to. Source:",
        " *  `profiles/room.fixture.json`'s `mark.field`, checked against room.md at codegen. */",
        f"export const ROOM_MARK = '{mark}' as const;",
        "",
    ]
    return "\n".join(lines)


def load_reading_aids(schema_dir: Path) -> tuple[list[tuple[str, str]], str]:
    """The reading aids (schema-dist serial 82 on, `profiles/lens.md` rule 4 and `profiles/room.md`): the
    charter, its guide and its domains, each a type-and-supertype pair, and the mark that tells one from
    lore. Emitted from the lens fixture's `reading_aid_pairs` (each word `type/supertype`) and
    `reading_aid_mark.field`; each pair and the mark must be named on lens.md, and the mark on room.md, or
    this exits 1. No fallback: a tree without them exits 1 rather than emitting "no aids", which would read
    every charter as lore."""
    profiles = schema_dir.parent / "profiles"
    fixture_path, page_path, room_path = profiles / "lens.fixture.json", profiles / "lens.md", profiles / "room.md"
    if not fixture_path.is_file() or not page_path.is_file() or not room_path.is_file():
        raise SystemExit(f"READING_AID_PAIRS comes only from the distribution's {fixture_path.name}, "
                         f"{page_path.name} and {room_path.name} (serial 82 on); this tree lacks one.")
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw = fixture.get("reading_aid_pairs")
    if not isinstance(raw, list) or not raw or not all(isinstance(w, str) and w.count("/") == 1 for w in raw):
        raise SystemExit(f"{fixture_path}: `reading_aid_pairs` is {raw!r}, expected a list of 'type/supertype' words.")
    pairs = [tuple(w.split("/")) for w in raw]
    stray = [t for t, _ in pairs if t not in ELEMENT_TYPES]
    if stray:
        raise SystemExit(f"{fixture_path}: reading aid pairs name {stray}, which are not element types.")
    if any(s != s.strip() or not s or "'" in s or "\\" in s for _, s in pairs):
        raise SystemExit(f"{fixture_path}: a reading aid's supertype is empty, carries edge spaces, or a quote "
                         f"or backslash this emitter does not escape: {pairs!r}.")
    if len({(t.lower(), s.lower()) for t, s in pairs}) != len(pairs):
        raise SystemExit(f"{fixture_path}: reading aid pairs repeat one another without regard to case: {pairs!r}.")
    mark = (fixture.get("reading_aid_mark") or {}).get("field")
    if not isinstance(mark, str) or not re.fullmatch(r"x_[a-z0-9_]+", mark):
        raise SystemExit(f"{fixture_path}: `reading_aid_mark.field` is {mark!r}, expected an extension key.")
    page, room = page_path.read_text(encoding="utf-8"), room_path.read_text(encoding="utf-8")
    missing = [f"`{w}`" for w in raw if f"`{w}`" not in page] + [f"`{mark}`" for text in (page, room)
                                                                 if f"`{mark}`" not in text]
    if missing:
        raise SystemExit(f"the lens and room pages do not name the fixture's reading aids {missing}. "
                         "Route it to the schema-dist owner; never pick one.")
    return [(t, s) for t, s in pairs], mark


def render_reading_aids(pairs: list[tuple[str, str]], mark: str) -> str:
    lines = [
        "/** The reading aids (schema-dist `profiles/lens.md` rule 4 and `profiles/room.md`): the charter, its",
        " *  guide and its domains, which every tool's front door shows first and a lore view leaves out. An",
        " *  element is one when its type and supertype, each trimmed and compared without regard to case, match",
        " *  one of these AND it carries the mark READING_AID_MARK; the pair without the mark is lore (a kingdom's",
        " *  Charter in a novel's world). Module-internal: match with isCharterElement. Source:",
        " *  `profiles/lens.fixture.json`'s `reading_aid_pairs`, as it writes them, checked against the pages. */",
        "export const READING_AID_PAIRS: ReadonlyArray<{ readonly type: ElementType; readonly supertype: string }> = [",
    ]
    lines += [f"  {{ type: '{t}', supertype: '{s}' }}," for t, s in pairs]
    lines += [
        "];",
        "",
        "/** The reading aids' mark: the id of the world the aid belongs to. Source: `profiles/lens.fixture.json`'s",
        " *  `reading_aid_mark.field`, checked against lens.md and room.md at codegen. Module-internal. */",
        f"export const READING_AID_MARK = '{mark}' as const;",
        "",
    ]
    return "\n".join(lines)


CHARTER_AIDS = ("charter", "guide", "domain")


def load_charter_pairs(schema_dir: Path, aid_pairs: list[tuple[str, str]], aid_mark: str) -> list[tuple[str, str, str]]:
    """The charter profile's three pairs (schema-dist serial 83 on, `profiles/charter.md`), each with the aid it
    is (`charter`, `guide`, `domain`), as the page's table writes them. Emitted from `charter.fixture.json`'s
    `pairs`; each must be a row of charter.md's table, the fixture's mark must be the lens fixture's
    `reading_aid_mark`, and the pairs, folded, must be READING_AID_PAIRS in its order, or this exits 1: two
    lists of the aids that disagree are routed to the schema-dist owner, never picked between."""
    profiles = schema_dir.parent / "profiles"
    fixture_path, page_path = profiles / "charter.fixture.json", profiles / "charter.md"
    if not fixture_path.is_file() or not page_path.is_file():
        raise SystemExit(f"CHARTER_PAIRS comes only from the distribution's {fixture_path.name} and "
                         f"{page_path.name} (serial 83 on); this tree lacks one.")
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw = fixture.get("pairs")
    if not isinstance(raw, list) or not all(isinstance(p, dict) and isinstance(p.get("type"), str)
                                           and isinstance(p.get("supertype"), str) and p.get("aid") in CHARTER_AIDS
                                           for p in raw):
        raise SystemExit(f"{fixture_path}: `pairs` is {raw!r}, expected a list of {{type, supertype, aid}} "
                         f"with aid one of {CHARTER_AIDS}.")
    pairs = [(p["type"], p["supertype"], p["aid"]) for p in raw]
    if sorted(a for _, _, a in pairs) != sorted(CHARTER_AIDS):
        raise SystemExit(f"{fixture_path}: the pairs name the aids {[a for _, _, a in pairs]}, not each of {CHARTER_AIDS} once.")
    if any(s != s.strip() or not s or "'" in s or "\\" in s for _, s, _ in pairs):
        raise SystemExit(f"{fixture_path}: a pair's supertype is empty, carries edge spaces, or a quote or "
                         f"backslash this emitter does not escape: {pairs!r}.")
    if [(t.lower(), s.lower()) for t, s, _ in pairs] != [(t.lower(), s.lower()) for t, s in aid_pairs]:
        raise SystemExit(f"{fixture_path}: the pairs {pairs!r} are not the lens fixture's reading_aid_pairs "
                         f"{aid_pairs!r} in its order. Route it to the schema-dist owner; never pick one.")
    mark = (fixture.get("mark") or {}).get("field")
    if mark != aid_mark:
        raise SystemExit(f"{fixture_path}: `mark.field` is {mark!r}, the lens fixture's reading_aid_mark is {aid_mark!r}.")
    page = page_path.read_text(encoding="utf-8")
    missing = [f"| `{t}` | `{s}` |" for t, s, _ in pairs if f"| `{t}` | `{s}` |" not in page]
    if missing:
        raise SystemExit(f"charter.md's table has no row {missing}. Route it to the schema-dist owner; never pick one.")
    return pairs


def render_charter_pairs(pairs: list[tuple[str, str, str]]) -> str:
    lines = [
        "/** The charter profile's three pairs (schema-dist `profiles/charter.md`): the Charter (the rules here), the",
        " *  Guide (start here) and the Domains (the places in the world), each with the aid it is. An element is a",
        " *  reading aid when its type and supertype, each trimmed and compared without regard to case, match one",
        " *  of these AND it carries the mark `x_charter_of`, read by presence: match with isCharterElement, read",
        " *  the packet with charterOf. Source: `profiles/charter.fixture.json`'s `pairs`, checked against the",
        " *  page's table and the lens fixture's reading_aid_pairs. */",
        "export const CHARTER_PAIRS: ReadonlyArray<{ readonly type: ElementType; readonly supertype: string; "
        "readonly aid: 'charter' | 'guide' | 'domain' }> = [",
    ]
    lines += [f"  {{ type: '{t}', supertype: '{s}', aid: '{a}' }}," for t, s, a in pairs]
    lines += ["];", ""]
    return "\n".join(lines)


REVIEW_LABEL = re.compile(r'labels each one it keeps \*\*"([^"]+)"\*\*')


def load_review_label(schema_dir: Path) -> str:
    """The review profile's label (schema-dist serial 52 on, `profiles/review.md`, rule 1): the
    words a reader that hands a world on puts on each proposed element it keeps. Read from rule 1's
    own sentence ("labels each one it keeps **"…"**"), which must occur exactly once on a page that
    names `x_review_proposed`, or this exits 1: no fallback, since a reader with the wrong words
    hands a proposal on unlabelled."""
    page_path = schema_dir.parent / "profiles" / "review.md"
    if not page_path.is_file():
        raise SystemExit(f"REVIEW_PROPOSED_LABEL comes only from the distribution's profiles/review.md "
                         f"(serial 52 on); this tree lacks {page_path}.")
    page = page_path.read_text(encoding="utf-8")
    found = REVIEW_LABEL.findall(page)
    if len(found) != 1:
        raise SystemExit(f"review.md: rule 1's label sentence ('labels each one it keeps **\"...\"**') "
                         f"occurs {len(found)} times, expected once. Route it to the schema-dist owner.")
    label = found[0]
    if "`x_review_proposed`" not in page:
        raise SystemExit("review.md does not name `x_review_proposed`. Route it to the schema-dist owner.")
    if label != label.strip() or "'" in label or "\\" in label:
        raise SystemExit(f"review.md: the label {label!r} carries edge spaces, or a quote or backslash this "
                         "emitter does not escape.")
    return label


def render_review_label(label: str) -> str:
    lines = [
        "/** The review profile's label (schema-dist `profiles/review.md`, rule 1): the words a reader that",
        " *  hands a world on (a context for an AI, a pack, a share) puts on each proposed element it keeps,",
        " *  one whose `x_review_proposed` is present (a doubt, rule 4, included; an empty mark is settled).",
        " *  buildAskContext writes it on the element's first line. Source: rule 1's own sentence, read at",
        " *  codegen. */",
        f"export const REVIEW_PROPOSED_LABEL = '{label}' as const;",
        "",
    ]
    return "\n".join(lines)


def load_message_profile(schema_dir: Path, pairs: list[tuple[str, str]],
                         all_fields: dict[str, list[dict]]) -> tuple[tuple[str, str], dict[str, str], tuple[str, str]]:
    """The message profile (schema-dist serial 72 on, `profiles/message.md`): the pair a message is,
    the read mark's pair and fields, and (serial 76 on) the Note's pair. From the fixture's `pair`,
    `read_mark` and `note_pair`, checked against the page's own words (the pair, the mark's supertype,
    the Note's supertype), against the room profile's pairs (the page calls the message pair a line in
    the room), and against the walk's fields for the mark's two links. No fallback: a tree without the
    profile exits 1 rather than emitting a pair nobody ruled."""
    profiles = schema_dir.parent / "profiles"
    fixture_path, page_path = profiles / "message.fixture.json", profiles / "message.md"
    if not fixture_path.is_file() or not page_path.is_file():
        raise SystemExit(
            f"MESSAGE_PAIR comes only from the distribution's profiles/message.fixture.json and "
            f"profiles/message.md (serial 72 on); this tree lacks {fixture_path if not fixture_path.is_file() else page_path}."
        )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    page = page_path.read_text(encoding="utf-8")
    pair, mark, note = fixture.get("pair"), fixture.get("read_mark"), fixture.get("note_pair")
    for key, p in (("pair", pair), ("note_pair", note)):
        if not (isinstance(p, dict) and set(p) == {"type", "supertype"}
                and all(isinstance(p[k], str) and p[k] for k in p)):
            raise SystemExit(f"{fixture_path}: `{key}` is {p!r}, expected {{type, supertype}} strings.")
    keys = {"type", "supertype", "name", "reader_field", "messages_field"}
    if not (isinstance(mark, dict) and set(mark) == keys and all(isinstance(mark[k], str) and mark[k] for k in keys)):
        raise SystemExit(f"{fixture_path}: `read_mark` is {mark!r}, expected the strings {sorted(keys)}.")
    for t, s in ((pair["type"], pair["supertype"]), (mark["type"], mark["supertype"]),
                 (note["type"], note["supertype"])):
        if t not in ELEMENT_TYPES:
            raise SystemExit(f"{fixture_path}: {t!r} is not an element type.")
        if s != s.strip() or "'" in s or "\\" in s:
            raise SystemExit(f"{fixture_path}: the supertype {s!r} carries edge spaces, or a quote or backslash "
                             "this emitter does not escape.")
    if f"the pair `{pair['type']}` + supertype `{pair['supertype']}`" not in page:
        raise SystemExit(f"message.md does not name the fixture's pair `{pair['type']}` + supertype "
                         f"`{pair['supertype']}`. Route it to the schema-dist owner; never pick one.")
    if f"supertype `{mark['supertype']}`" not in page or f"`{mark['reader_field']}`" not in page \
            or f"`{mark['messages_field']}`" not in page:
        raise SystemExit(f"message.md does not name the fixture's read mark {mark!r}. Route it to the schema-dist owner.")
    if f"a Narrative with supertype `{note['supertype']}`" not in page:
        raise SystemExit(f"message.md does not name the fixture's note_pair supertype `{note['supertype']}`. "
                         "Route it to the schema-dist owner.")
    if (pair["type"].lower(), pair["supertype"].lower()) not in [(t.lower(), s.lower()) for t, s in pairs]:
        raise SystemExit(f"the message pair {pair!r} is not one of the room profile's pairs {pairs!r}, and "
                         "message.md says it is. Route it to the schema-dist owner.")
    names = {f["name"] for f in all_fields[mark["type"]]}
    stray = [mark[k] for k in ("reader_field", "messages_field") if mark[k] not in names]
    if stray:
        raise SystemExit(f"{fixture_path}: the read mark's fields {stray} are not fields of {mark['type']}.")
    return (pair["type"], pair["supertype"]), mark, (note["type"], note["supertype"])


def load_drag_pairs(schema_dir: Path, all_fields: dict[str, list[dict]]) -> list[tuple[str, str, str, bool]]:
    """The link a drag between two types writes (schema-dist serial 95 on, the `pairs.json` sidecar beside
    presentation.json): each pair as (key, on, field, holds), in key order. Presentation, as the colours are,
    and held the same way: no fallback, and a sidecar that breaks its own shape exits 1 rather than emitting
    a drag nobody ruled. Each key is two distinct type slugs in code point order joined by `+` (a repeated
    key exits 1, never the last one silently kept); `on` is one of the two; `field` a single or multi link
    field of `on` whose target, by the walk, is the other; `holds` a boolean. Version 1 only: a new version
    may change what a row means."""
    p = schema_dir.parent / "pairs.json"
    if not p.is_file():
        raise SystemExit(f"{p}: the drag pairs come only from the distribution's pairs.json (serial 95 on); this tree has none.")

    def refuse_repeats(items: list[tuple[str, object]]) -> dict:
        keys = [k for k, _ in items]
        repeated = sorted({k for k in keys if keys.count(k) > 1})
        if repeated:
            raise SystemExit(f"{p}: the keys {repeated} repeat; a reader would keep only the last.")
        return dict(items)

    doc = json.loads(p.read_text(encoding="utf-8"), object_pairs_hook=refuse_repeats)
    if not isinstance(doc, dict) or doc.get("version") != 1:
        raise SystemExit(f"{p}: `version` is {doc.get('version') if isinstance(doc, dict) else doc!r}, expected 1.")
    pairs = doc.get("pairs")
    if not isinstance(pairs, dict) or not pairs:
        raise SystemExit(f"{p}: `pairs` is {pairs!r}, expected an object of pairs.")
    out: list[tuple[str, str, str, bool]] = []
    for key in sorted(pairs):
        row = pairs[key]
        parts = key.split("+")
        if len(parts) != 2 or not all(t in ELEMENT_TYPES for t in parts) or not parts[0] < parts[1]:
            raise SystemExit(f"{p}: the key {key!r} is not two distinct type slugs in code point order joined by `+`.")
        if not isinstance(row, dict) or set(row) != {"on", "field", "holds"}:
            raise SystemExit(f"{p}: `pairs.{key}` is {row!r}, expected {{on, field, holds}}.")
        on, field, holds = row["on"], row["field"], row["holds"]
        if on not in parts:
            raise SystemExit(f"{p}: `pairs.{key}.on` is {on!r}, expected one of {parts}.")
        if not isinstance(holds, bool):
            raise SystemExit(f"{p}: `pairs.{key}.holds` is {holds!r}, expected true or false.")
        other = parts[1] if on == parts[0] else parts[0]
        spec = next((f for f in all_fields[on] if f["name"] == field), None) if isinstance(field, str) else None
        if spec is None or spec["kind"] not in ("single", "multi") or spec.get("target") != other:
            raise SystemExit(f"{p}: `pairs.{key}.field` is {field!r}, which the walk does not give as a link "
                             f"field of {on} to {other}. Route it to the schema-dist owner.")
        out.append((key, on, field, holds))
    return out


def render_drag_pairs(pairs: list[tuple[str, str, str, bool]]) -> str:
    lines = [
        "/** The link a drag between two types writes, per pair: `on` the type that carries the field, `field`",
        " *  the link field, `holds` whether the drop puts one element inside the other (one square under the",
        " *  other) or only draws a line. Source: the distribution's `pairs.json` sidecar, checked against the",
        " *  walk at codegen; each key the two type slugs in code point order joined by `+`. A drawing aid, NOT",
        " *  part of the council-governed OnlyWorlds standard: a pair absent here (same-kind pairs, and fields that",
        " *  name a role, are absent by ruling) offers no drag and draws no line. Read it with dragField. */",
        "export const DRAG_PAIRS: { readonly [pair: string]: { readonly on: ElementType; readonly field: string; readonly holds: boolean } } = {",
    ]
    for key, on, field, holds in pairs:
        lines.append(f"  '{key}': {{ on: '{on}', field: '{field}', holds: {'true' if holds else 'false'} }},")
    lines += ["};", ""]
    return "\n".join(lines)


def render_message_profile(pair: tuple[str, str], mark: dict[str, str], note: tuple[str, str]) -> str:
    lines = [
        "/** The message profile's pair (schema-dist `profiles/message.md`, a convention on the 22 types,",
        " *  never a change to the standard): a message between a world's members is a Narrative with this",
        " *  supertype, the type and supertype each trimmed and compared without regard to case. Match with",
        " *  isMessage. Source: `profiles/message.fixture.json`'s `pair`, checked against the page and against",
        " *  ROOM_PAIRS at codegen. */",
        f"export const MESSAGE_PAIR: {{ readonly type: ElementType; readonly supertype: string }} = "
        f"{{ type: '{pair[0]}', supertype: '{pair[1]}' }};",
        "",
        "/** The message profile's read mark: one Relation per reader with this supertype, the reader's",
        " *  Character in `readerField`, the ids of the messages read in `messagesField`. Source:",
        " *  `profiles/message.fixture.json`'s `read_mark`, checked against the page and the walk at codegen. */",
        "export const MESSAGE_READ_MARK = {",
        f"  type: '{mark['type']}', supertype: '{mark['supertype']}', "
        f"readerField: '{mark['reader_field']}', messagesField: '{mark['messages_field']}',",
        "} as const;",
        "",
        "/** The message profile's Note: a member's own line in the world, never a message (addressed to",
        " *  nobody, never unread, in no thread), a Narrative with this supertype, matched as MESSAGE_PAIR",
        " *  is. Match with isNote. Source: `profiles/message.fixture.json`'s `note_pair`, checked against the",
        " *  page at codegen. */",
        f"export const NOTE_PAIR: {{ readonly type: ElementType; readonly supertype: string }} = "
        f"{{ type: '{note[0]}', supertype: '{note[1]}' }};",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default=str(DEFAULT_SCHEMA_DIR))
    ap.add_argument("--check", action="store_true",
                    help="drift guard: regenerate in memory and fail (exit 1) if the "
                         "committed types.generated.ts differs; writes nothing")
    args = ap.parse_args()
    schema_dir = Path(args.schema).resolve()
    if not schema_dir.is_dir():
        raise SystemExit(
            f"schema dir not found: {schema_dir}\n"
            "The schema YAMLs are VENDORED from the public distribution "
            "(github.com/OnlyWorlds/schema-dist) at codegen/schema-dist/, pinned in "
            "codegen/schema-pin.json. Run `npm run schema:verify` first; if the tree is "
            "missing, re-vendor from the pinned tag. Pass --schema <path> to point at "
            "another source: a schema/ folder with the distribution's presentation.json "
            "beside it."
        )

    global _schema_version
    _schema_version = read_canonical_version(schema_dir)
    presentation = load_presentation(schema_dir)
    colors = load_colors(schema_dir)

    all_fields: dict[str, list[dict]] = {}
    groups: dict[str, str] = {}
    icons: dict[str, str] = {}
    public: dict[str, list[str]] = {}
    sections: dict[str, list[dict]] = {}
    required_sets: dict[str, set[str]] = {}
    dropped_required: dict[str, list[str]] = {}
    interfaces: list[str] = []
    for tslug in ELEMENT_TYPES:
        doc = load_yaml(schema_dir, tslug)
        group, icon = presentation_for(presentation, tslug, colors[0])
        groups[tslug] = group
        icons[tslug] = icon
        sections[tslug] = parse_sections(doc, tslug)
        # Since canonical 00.30.02 the schema requires `name` and nothing else, and `name`
        # is a base row, so every per-type set is empty. A type that lists more is a new
        # rule: stop and have it ruled (copy it, or keep the wire's name-only), never
        # drop it silently. Read separately from include_required so the field specs the
        # interface emitter sees stay byte-for-byte what they were.
        yaml_required = walk.required_names(doc)
        if yaml_required:
            dropped_required[tslug] = sorted(yaml_required)
        required_sets[tslug] = set()
        fields = flatten_fields(doc, tslug)
        all_fields[tslug] = fields
        public[tslug] = public_for(presentation, tslug, fields)
        interfaces.append(render_interface(tslug, fields))

    if dropped_required:
        sys.exit('FIELD_SCHEMA: the schema lists `required:` beyond name again: '
                 + '; '.join(f'{t}: {", ".join(v)}' for t, v in sorted(dropped_required.items()))
                 + '. The wire requires name only (rulings.yaml: nullable-by-default). Have it ruled '
                 'whether FIELD_SCHEMA copies the list, then change this guard.')
    header = (HEADER
              .replace("__PROVENANCE__", render_provenance(schema_dir))
              .replace("__ELEMENT_BASE__", render_element_base(schema_dir)))
    parts = [header, ""]
    parts.append(render_maps(all_fields, groups, colors, icons, sections, public))
    parts.append(render_drag_pairs(load_drag_pairs(schema_dir, all_fields)))
    room_pairs = load_room_pairs(schema_dir)
    parts.append(render_room_pairs(room_pairs, load_room_mark(schema_dir)))
    aid_pairs, aid_mark = load_reading_aids(schema_dir)
    parts.append(render_reading_aids(aid_pairs, aid_mark))
    parts.append(render_charter_pairs(load_charter_pairs(schema_dir, aid_pairs, aid_mark)))
    parts.append(render_review_label(load_review_label(schema_dir)))
    parts.append(render_message_profile(*load_message_profile(schema_dir, room_pairs, all_fields)))
    parts.append(render_field_schema(all_fields, sections, required_sets))
    parts.append("\n\n".join(interfaces))
    parts.append("")
    output = "\n".join(parts)
    schema_md = render_schema_md(all_fields, groups, colors[0], icons, sections)

    if args.check:
        for path, want, label in ((OUT_PATH, output, "types.generated.ts"),
                                  (SCHEMA_MD_PATH, schema_md, "SCHEMA.md")):
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != want:
                raise SystemExit(
                    f"DRIFT: {label} does not match the schema YAMLs. "
                    "Run `python codegen/generate_types.py` and commit the result."
                )
        # AGENTS.md is hand-maintained and self-dated against the pin. This assert
        # is its hook: a repin moves the schema under it, and without a check that
        # runs where CI already runs, its "current as of" line is a comment — and a
        # comment is the weakest guard we have. Tag-presence only, deliberately:
        # the prose is judgment, the currency claim is mechanical.
        agents_path = REPO / "AGENTS.md"
        pin_path = CODEGEN / "schema-pin.json"
        if agents_path.is_file() and pin_path.is_file():
            pin_tag = json.loads(pin_path.read_text(encoding="utf-8")).get("tag")
            if pin_tag and pin_tag not in agents_path.read_text(encoding="utf-8"):
                raise SystemExit(
                    f"DRIFT: AGENTS.md does not name the pinned dist tag {pin_tag}. "
                    "A repin moved the schema under a hand-maintained agent doc. "
                    "Re-read AGENTS.md against the new pin (wire facts may have moved "
                    "too), then update its 'Current as of' line."
                )
        print("drift check: clean (types.generated.ts + SCHEMA.md match schema; AGENTS.md names the pin).")
        return

    OUT_PATH.write_text(output, encoding="utf-8")
    SCHEMA_MD_PATH.write_text(schema_md, encoding="utf-8")

    print(f"Wrote {OUT_PATH.relative_to(REPO)} ({len(ELEMENT_TYPES)} interfaces) + SCHEMA.md.")
    print(f"Notes: {len(drift_notes)}")
    for n in drift_notes:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
