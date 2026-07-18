"""Validation gate: generated interfaces vs the real W11 v2 wire dump.

Loads every element from the W11 cache (22 <type>.json files, v2-shaped) and, for
each element, checks that every non-extension key exists in the generated interface
for that type, and that link-kind fields hold the right JS shapes on the wire
(single -> string|null, multi -> list[str], generic -> the _type/_id pair). The wire
is truth: a mismatch means the generator is wrong, unless the key is a genuine
server-side extension (atlas_* / shadow_* / x_* -- allowed by the index signature).

Reads the schema directly (same parsing as generate_types.py) to know the expected
key set per type, rather than re-parsing the emitted .ts. Run after generation:
    python codegen/validate_against_cache.py [--schema ../keel/schema] [--cache DIR]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from generate_types import ELEMENT_TYPES, flatten_fields, load_yaml

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SCHEMA_DIR = REPO.parent / "keel" / "schema"
DEFAULT_CACHE = Path(
    "C:/Users/Titus/AppData/Local/Temp/claude/"
    "C--Users-Titus-Carrier-Orrery/0583abc5-9073-4c6a-ae05-7bd4bc9776f3/"
    "scratchpad/w11"
)

# Base + server-managed keys carried by every element (OwElementBase).
BASE_KEYS = {
    "type", "id", "name", "description", "supertype", "subtype", "image_url",
    "created_at", "updated_at", "change_seq",
}
EXT_PREFIXES = ("atlas_", "shadow_", "x_")


def expected_shape(fields: list[dict]) -> tuple[set[str], dict[str, str]]:
    """Return (all expected keys, {key: kind}) for a type's schema fields.
    kind in {str, int, single, multi} for shape checks; generics expand to two keys.
    """
    keys = set(BASE_KEYS)
    kinds: dict[str, str] = {}
    for f in fields:
        k = f["kind"]
        if k == "generic":
            keys.add(f'{f["name"]}_type')
            keys.add(f'{f["name"]}_id')
            kinds[f'{f["name"]}_type'] = "gen_str"
            kinds[f'{f["name"]}_id'] = "gen_str"
        else:
            keys.add(f["name"])
            kinds[f["name"]] = {
                "scalar_str": "str", "scalar_int": "int",
                "single": "single", "multi": "multi",
            }[k]
    return keys, kinds


def shape_ok(kind: str, val) -> bool:
    if kind in ("single", "gen_str"):
        return val is None or isinstance(val, str)
    if kind == "multi":
        return isinstance(val, list) and all(isinstance(x, str) for x in val)
    if kind == "int":
        return val is None or isinstance(val, int)
    if kind == "str":
        return val is None or isinstance(val, str)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default=str(DEFAULT_SCHEMA_DIR))
    ap.add_argument("--cache", default=str(DEFAULT_CACHE))
    args = ap.parse_args()
    schema_dir = Path(args.schema).resolve()
    cache = Path(args.cache)

    total_pass = 0
    total_mismatch = 0
    empty_types: list[str] = []
    print(f"Validating generated interfaces against {cache}\n")

    for tslug in ELEMENT_TYPES:
        doc = load_yaml(schema_dir, tslug)
        fields = flatten_fields(doc, tslug)
        keys, kinds = expected_shape(fields)

        path = cache / f"{tslug}.json"
        elems = json.load(open(path, encoding="utf-8")) if path.exists() else []
        if not elems:
            empty_types.append(tslug)
            print(f"  {tslug:12} 0 elements (no coverage)")
            continue

        type_pass = 0
        type_mismatch = 0
        for e in elems:
            eid = e.get("id", "?")
            ok = True
            for k, v in e.items():
                if k in keys:
                    if k in kinds and not shape_ok(kinds[k], v):
                        print(
                            f"  MISMATCH {tslug} {eid} field `{k}` "
                            f"(kind {kinds[k]}): wire value {v!r}"
                        )
                        ok = False
                        type_mismatch += 1
                    continue
                if k.startswith(EXT_PREFIXES):
                    continue  # extension, allowed by index signature
                print(
                    f"  MISMATCH {tslug} {eid} unknown key `{k}` "
                    f"(not in interface, not an extension prefix)"
                )
                ok = False
                type_mismatch += 1
            if ok:
                type_pass += 1
        total_pass += type_pass
        total_mismatch += type_mismatch
        flag = "" if type_mismatch == 0 else f"  <-- {type_mismatch} MISMATCH"
        print(f"  {tslug:12} {type_pass}/{len(elems)} clean{flag}")

    print()
    print(f"TOTAL: {total_pass} elements clean, {total_mismatch} mismatches")
    if empty_types:
        print(f"No coverage (empty in W11): {', '.join(empty_types)}")


if __name__ == "__main__":
    main()
