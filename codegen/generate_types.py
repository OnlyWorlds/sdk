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
import json
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


def parse_sections(doc: dict, tslug: str) -> list[dict]:
    """Sections ARE the canonical document structure: top-level `properties`
    keys are section names, their nested `properties` are the fields, both in
    document order (order IS display order; Skeld's ruling 2026-07-23 —
    sections are DERIVED from the standard tier, not a wrapper key)."""
    out = []
    props = doc.get("properties") or {}
    for i, (section_name, section) in enumerate(props.items()):
        fields = list((section.get("properties") or {}).keys())
        if not fields:
            note(f"{tslug}.{section_name}: empty section in canonical YAML")
        out.append({"name": section_name, "order": i + 1, "fields": fields})
    return out


def render_maps(all_fields: dict[str, list[dict]], families: dict[str, str],
                icons: dict[str, str], sections: dict[str, list[dict]]) -> str:
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

    fam_union = " | ".join(f"'{f}'" for f in VALID_FAMILIES)
    lines.append("/** The four semantic families (colour carries the family; ELEMENT_ICONS carries the type). */")
    lines.append(f"export type ElementFamily = {fam_union};")
    lines.append("")
    lines.append("/** Per-type semantic family. Source: the distribution's `presentation.json` sidecar")
    lines.append(" *  (first-party rendering DEFAULTS — NOT part of the council-governed OnlyWorlds")
    lines.append(" *  standard, and explicitly overridable by any consumer). The colour values are")
    lines.append(" *  NOT in the sidecar: FAMILY_COLORS is hand-authored here in src/v2/palette.ts. */")
    lines.append("export const ELEMENT_FAMILIES: Record<ElementType, ElementFamily> = {")
    for t in types_sorted:
        lines.append(f"  {t}: '{families[t]}',")
    lines.append("};")
    lines.append("")

    lines.append("/** Material Symbols icon name per type. Source: the distribution's `presentation.json` sidecar. */")
    lines.append("export const ELEMENT_ICONS: Record<ElementType, string> = {")
    for t in types_sorted:
        lines.append(f"  {t}: '{icons[t]}',")
    lines.append("};")
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


def _ts_str_array(names: list[str]) -> str:
    if not names:
        return "[]"
    return "[" + ", ".join(f"'{n}'" for n in names) + "]"


SCHEMA_MD_PATH = REPO / "SCHEMA.md"

SCHEMA_MD_HEADER = """\
# OnlyWorlds Schema Reference

GENERATED from the canonical schema YAML — do not hand-edit (regenerate: `python codegen/generate_types.py`).
Written for both humans and AI agents reading this package locally.

**The shape rules** (v2 wire dialect): every element carries `id` (UUID), `name`, optional
`description`/`supertype`/`subtype`/`image_url`, server-managed `type`/`created_at`/`updated_at`/`change_seq`,
and namespaced extension fields (`x_*` etc.) returned verbatim. Link fields use ONE bare
name in both read and write (no `_ids` suffix). Single links are `UUID | null`; multi links
are `UUID[]`. **Links are owned one-way**: the type listed below owns the field (e.g.
Character owns `abilities`; Ability has no `characters`). Sections and their order are the
canonical display grouping.

Families (colour semantics; icon carries the type): agents · world · abstract · temporal.
"""


def render_schema_md(all_fields, families, icons, sections) -> str:
    kind_label = {
        "scalar_str": "text",
        "scalar_int": "integer",
        "single": "single link",
        "multi": "multi link",
        "generic": "generic link (any element type)",
    }
    by_name = {}
    parts = [SCHEMA_MD_HEADER]
    for tslug in sorted(ELEMENT_TYPES):
        fields = all_fields[tslug]
        by_name = {f["name"]: f for f in fields}
        parts.append(f"\n## {tslug}  ·  family: {families[tslug]}  ·  icon: {icons[tslug]}\n")
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
    """Load the presentation sidecar (family + icon defaults), if this tree has one.

    The distribution strips `family:`/`icon:` from the schema YAMLs into
    presentation.json, which makes the walk wrapper-agnostic by construction.
    keel keeps its inline wrapper keys for one full cycle past this repoint as
    the deliberate rollback artifact — so BOTH sources stay supported here, and
    the sidecar wins when present.
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


def presentation_for(presentation: dict | None, doc: dict, tslug: str) -> tuple[str, str]:
    """Resolve (family, icon) from the sidecar, or from keel's inline wrapper keys."""
    if presentation is not None:
        entry = presentation.get(tslug) or {}
        fam, icon, src = entry.get("family"), entry.get("icon"), "presentation.json"
    else:
        fam, icon, src = doc.get("family"), doc.get("icon"), f"{tslug}.yaml wrapper keys"

    if fam not in VALID_FAMILIES:
        raise SystemExit(
            f"{tslug}: `family` is {fam!r} from {src} — expected one of {VALID_FAMILIES}. "
            "Presentation metadata is first-party rendering data, NOT part of the "
            "council-governed standard. A refresh that OVERWRITES instead of MERGING "
            "wipes it — check that first."
        )
    if not isinstance(icon, str) or not icon:
        raise SystemExit(
            f"{tslug}: `icon` missing or empty from {src}. "
            "Same wiped-presentation check applies as for family."
        )
    return fam, icon


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
            "another source (e.g. a keel checkout, which still carries inline "
            "presentation wrapper keys for one cycle as the rollback artifact)."
        )

    global _schema_version
    _schema_version = read_canonical_version(schema_dir)
    presentation = load_presentation(schema_dir)

    all_fields: dict[str, list[dict]] = {}
    families: dict[str, str] = {}
    icons: dict[str, str] = {}
    sections: dict[str, list[dict]] = {}
    interfaces: list[str] = []
    for tslug in ELEMENT_TYPES:
        doc = load_yaml(schema_dir, tslug)
        fam, icon = presentation_for(presentation, doc, tslug)
        families[tslug] = fam
        icons[tslug] = icon
        sections[tslug] = parse_sections(doc, tslug)
        fields = flatten_fields(doc, tslug)
        all_fields[tslug] = fields
        interfaces.append(render_interface(tslug, fields))

    parts = [HEADER.replace("__PROVENANCE__", render_provenance(schema_dir)), ""]
    parts.append(render_maps(all_fields, families, icons, sections))
    parts.append("\n\n".join(interfaces))
    parts.append("")
    output = "\n".join(parts)
    schema_md = render_schema_md(all_fields, families, icons, sections)

    if args.check:
        for path, want, label in ((OUT_PATH, output, "types.generated.ts"),
                                  (SCHEMA_MD_PATH, schema_md, "SCHEMA.md")):
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != want:
                raise SystemExit(
                    f"DRIFT: {label} does not match the schema YAMLs. "
                    "Run `python codegen/generate_types.py` and commit the result."
                )
        print("drift check: clean (types.generated.ts + SCHEMA.md match schema).")
        return

    OUT_PATH.write_text(output, encoding="utf-8")
    SCHEMA_MD_PATH.write_text(schema_md, encoding="utf-8")

    print(f"Wrote {OUT_PATH.relative_to(REPO)} ({len(ELEMENT_TYPES)} interfaces) + SCHEMA.md.")
    print(f"Notes: {len(drift_notes)}")
    for n in drift_notes:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
