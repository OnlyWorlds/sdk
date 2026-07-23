"""schema -> TypeScript types generator (SDK 3.0 single-source pipeline).

Reads the canonical OnlyWorlds schema YAMLs (the same files that drive keel's
Django models via codegen/generate_models.py) and emits src/v2/types.generated.ts:
one interface per element type, the ElementType union, and the link-field maps the
client uses for link-aware helpers.

Field-kind parsing mirrors keel/codegen/generate_models.py -- the proven consumer
of these YAMLs. TypeScript shapes are pinned to the v2 wire, not to Django columns:
single-links serialize as `string | null`, multi-links as `string[]`, ints as
`number | null`, link fields use BARE schema names (no `_ids` suffix), and the four
server-managed fields (type, created_at, updated_at, change_seq) plus an extension
index signature ride the shared base.

Run:  python codegen/generate_types.py [--schema ../keel/schema]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SCHEMA_DIR = REPO.parent / "keel" / "schema"
OUT_PATH = REPO / "src" / "v2" / "types.generated.ts"

# The 22 element types, in the canonical order (matches generate_models.py, then
# re-sorted below for the union so slugs read alphabetically -- kept here as the
# authoritative membership list).
ELEMENT_TYPES = [
    "ability", "collective", "character", "construct", "creature", "event",
    "family", "institution", "language", "law", "location", "map", "marker",
    "narrative", "object", "phenomenon", "pin", "relation", "species", "title",
    "trait", "zone",
]

# category (YAML link target, singular TitleCase) -> type slug.
KNOWN_CATEGORIES = {t.capitalize(): t for t in ELEMENT_TYPES}
KNOWN_CATEGORIES["World"] = "world"

drift_notes: list[str] = []


def note(msg: str) -> None:
    drift_notes.append(msg)


def load_yaml(schema_dir: Path, name: str) -> dict:
    with open(schema_dir / f"{name}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def flatten_fields(doc: dict, type_slug: str) -> list[dict]:
    """Walk the grouped YAML (Group -> properties -> fields) and return a flat,
    ordered list of field specs. Each spec: {name, kind, target?, desc?} where kind
    in {scalar_str, scalar_int, single, multi, generic}. Mirrors the Django
    generator's flatten_fields + _collect_field, including the dedupe pass.
    """
    fields: list[dict] = []
    props = doc.get("properties", {})
    for group_name, group in props.items():
        group_props = group.get("properties")
        if group_props is None:
            note(
                f"{type_slug}: top-level property `{group_name}` outside a group "
                f"object -- parsed directly."
            )
            _collect_field(group_name, group, type_slug, fields)
            continue
        for fname, fspec in group_props.items():
            _collect_field(fname, fspec, type_slug, fields)

    # Dedupe by field name (keep first). relation.yaml declares `events` in BOTH
    # the Nature and Involves groups -- a YAML irregularity.
    seen: set[str] = set()
    deduped: list[dict] = []
    for f in fields:
        if f["name"] in seen:
            note(
                f"{type_slug}.{f['name']}: field declared more than once across "
                f"groups (YAML irregularity) -- kept first, dropped duplicate."
            )
            continue
        seen.add(f["name"])
        deduped.append(f)
    return deduped


def _collect_field(fname: str, fspec: dict, type_slug: str, out: list[dict]) -> None:
    ftype = fspec.get("type")
    desc = fspec.get("description")
    if ftype == "string":
        out.append({"name": fname, "kind": "scalar_str", "desc": desc})
    elif ftype == "integer":
        out.append({"name": fname, "kind": "scalar_int", "desc": desc})
    elif ftype == "single-link":
        out.append(
            {"name": fname, "kind": "single",
             "target": _resolve_target(fname, fspec, type_slug), "desc": desc}
        )
    elif ftype == "multi-link":
        out.append(
            {"name": fname, "kind": "multi",
             "target": _resolve_target(fname, fspec, type_slug), "desc": desc}
        )
    elif ftype == "generic-link":
        # pin.element only. The v2 wire serializes it as a type discriminator
        # (element_type) + a UUID (element_id). Mirrors the Django pair.
        note(
            f"{type_slug}.{fname}: `generic-link` (link to any element type). "
            f"Emitted as {fname}_type (string|null) + {fname}_id (string|null)."
        )
        out.append({"name": fname, "kind": "generic", "desc": desc})
    elif ftype == "array":
        note(f"{type_slug}.{fname}: unexpected `array` scalar -- skipped.")
    else:
        note(f"{type_slug}.{fname}: unknown YAML type `{ftype}` -- skipped.")


def _resolve_target(fname: str, fspec: dict, type_slug: str) -> str | None:
    cat = fspec.get("category")
    if cat is None:
        note(f"{type_slug}.{fname}: link with no `category` -- target unresolved.")
        return None
    slug = KNOWN_CATEGORIES.get(cat)
    if slug is None:
        note(f"{type_slug}.{fname}: link category `{cat}` not a known element type.")
        return cat.lower()
    if type_slug == "collective" and fname == "equipment":
        note(
            "collective.equipment: YAML declares target Object, but keel production "
            "implements Construct. Generated per YAML (Object) to match the wire."
        )
    return slug


# ---------------------------------------------------------------------------
# TypeScript emission
# ---------------------------------------------------------------------------
HEADER = """\
// GENERATED from OnlyWorlds canonical schema YAML -- do not hand-edit. Regenerate: python codegen/generate_types.py
//
// One interface per element type, extending OwElementBase. Field shapes are the v2
// wire shapes: single-links are `string | null`, multi-links `string[]`, ints
// `number | null`. Link fields use bare schema names (no `_ids` suffix). The four
// server-managed fields (type, created_at, updated_at, change_seq) and the
// extension index signature live on OwElementBase.

/** Every element carries these. The extension index signature admits namespaced
 *  pass-through fields (atlas_* / shadow_* / x_*) returned verbatim by the server. */
export interface OwElementBase {
  /** Element type slug (server-managed, read-only). */
  type: string;
  /** Unique identifier, uuidv7 format. */
  id: string;
  /** Name of the element. */
  name: string;
  /** Any kind of details about the element. */
  description?: string;
  /** The top level category to which the element belongs. */
  supertype?: string;
  /** The sub level category through which the element is further classified. */
  subtype?: string;
  /** URL to an image representing the element. */
  image_url?: string;
  /** Creation timestamp (server-managed, read-only). */
  created_at?: string;
  /** Last-update timestamp (server-managed, read-only). */
  updated_at?: string;
  /** Per-world change cursor, stamped on every write (server-managed, read-only). */
  change_seq?: number;
  /** Namespaced extension fields (atlas_* / shadow_* / x_*), returned verbatim. */
  [ext: string]: unknown;
}
"""


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


VALID_FAMILIES = ("agents", "world", "abstract", "temporal")


def render_maps(all_fields: dict[str, list[dict]], families: dict[str, str]) -> str:
    types_sorted = sorted(ELEMENT_TYPES)
    lines: list[str] = []

    union = " | ".join(f"'{t}'" for t in types_sorted)
    lines.append(f"export type ElementType = {union};")
    lines.append("")

    arr = ", ".join(f"'{t}'" for t in types_sorted)
    lines.append(f"export const ELEMENT_TYPES: ElementType[] = [{arr}];")
    lines.append("")

    fam_union = " | ".join(f"'{f}'" for f in VALID_FAMILIES)
    lines.append("/** The four semantic families (colour carries the family; ELEMENT_ICONS carries the type). */")
    lines.append(f"export type ElementFamily = {fam_union};")
    lines.append("")
    lines.append("/** Per-type semantic family. Source: keel's PRESENTATION-WRAPPER schema key `family:`")
    lines.append(" *  (first-party rendering metadata, keel-only — NOT part of the council-governed")
    lines.append(" *  OnlyWorlds standard; see keel/schema-pipeline.md \"The wrapper layer\"). */")
    lines.append("export const ELEMENT_FAMILIES: Record<ElementType, ElementFamily> = {")
    for t in types_sorted:
        lines.append(f"  {t}: '{families[t]}',")
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


def _ts_str_array(names: list[str]) -> str:
    if not names:
        return "[]"
    return "[" + ", ".join(f"'{n}'" for n in names) + "]"


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
            "The canonical schema YAMLs live in the keel repo (Skeld's authority), "
            "expected as a sibling checkout: <parent>/keel/schema. "
            "Clone keel next to this repo or pass --schema <path>."
        )

    all_fields: dict[str, list[dict]] = {}
    families: dict[str, str] = {}
    interfaces: list[str] = []
    for tslug in ELEMENT_TYPES:
        doc = load_yaml(schema_dir, tslug)
        fam = doc.get("family")
        if fam not in VALID_FAMILIES:
            raise SystemExit(
                f"{tslug}.yaml: top-level `family:` is {fam!r} — expected one of {VALID_FAMILIES}. "
                "This is a keel wrapper key (see keel/schema-pipeline.md); a canonical-schema "
                "refresh that OVERWRITES instead of MERGING wipes it — check that first."
            )
        families[tslug] = fam
        fields = flatten_fields(doc, tslug)
        all_fields[tslug] = fields
        interfaces.append(render_interface(tslug, fields))

    parts = [HEADER, ""]
    parts.append(render_maps(all_fields, families))
    parts.append("\n\n".join(interfaces))
    parts.append("")
    output = "\n".join(parts)

    if args.check:
        current = OUT_PATH.read_text(encoding="utf-8") if OUT_PATH.exists() else ""
        if current != output:
            raise SystemExit(
                "DRIFT: src/v2/types.generated.ts does not match the schema YAMLs. "
                "Run `python codegen/generate_types.py` and commit the result."
            )
        print("drift check: clean (types.generated.ts matches schema).")
        return

    OUT_PATH.write_text(output, encoding="utf-8")

    print(f"Wrote {OUT_PATH.relative_to(REPO)} ({len(ELEMENT_TYPES)} interfaces).")
    print(f"Notes: {len(drift_notes)}")
    for n in drift_notes:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
