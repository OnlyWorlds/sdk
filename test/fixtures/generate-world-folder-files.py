"""The worldFolderFiles fixture, test/fixtures/world-folder-files.json: one world and its elements, and
the files the Python package's ``write_folder`` writes for them, read back from disk as text (UTF-8).
test/world-folder-files.test.mjs holds ``worldFolderFiles`` to the same paths and the same bytes.

The case is written here, in Python, and stored in the fixture as JSON, so both writers are handed what
``JSON.parse`` and ``json.loads`` read from the same text: no integer-like key (a JavaScript object lists
those first) and no whole number past 2**53 (JavaScript rounds it).

Run with the released Python package, named by its version, from the repository's root:

    uv run --no-project --with onlyworlds==0.158.4 python -I test/fixtures/generate-world-folder-files.py --write

Without --write it writes nothing and exits 1 when the fixture differs from what it would write.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import onlyworlds
from onlyworlds.folder import write_folder

FIXTURE = Path(__file__).resolve().parent / "world-folder-files.json"

W = "0192a000-aaaa-7bbb-8ccc-000000000001"


def eid(n: int, head: str = "00000000") -> str:
    return f"{head}-0000-4000-8000-{n:012d}"


WORLD = {
    "id": W,
    "name": "Harbour",
    "description": "A port on a cold sea.\nIts quay is older than its name: Hafen, Ἁλιεύς.",
    "time_basic_unit": "Year",
    "time_range_current": 1200,
    "x_names": {"character": "Soul", "location": "Place"},
    "snapshot_counts": {"character": 99},
}

ELEMENTS = {
    "location": [
        {"id": eid(20), "type": "location", "name": "Copper Mine", "description": "Below the quay.", "change_seq": 1},
    ],
    "character": [
        {
            "id": eid(1),
            "type": "character",
            "name": "Ada Okafor",
            "description": "Café owner.\n\tSecond line, a quote \" and a backslash \\, a star \U0001F31F.",
            "birthplace": eid(20),
            "species": [eid(60), eid(61)],
            "height": 172,
            "x_note": {"kept": [1, 2, {"deep": True}], "empty": {}, "none": [], "nothing": None},
        },
        # Two names that land on one file name: one slug, one id tail, the lower id keeps the short form.
        {"id": eid(7, "bbbbbbbb"), "type": "character", "name": "Twin"},
        {"id": eid(7, "aaaaaaaa"), "type": "character", "name": "TWIN!"},
        # No name a slug can be made of: the file is named by the full id.
        {"id": eid(8), "type": "character", "name": "日本"},
        # A repeated id in one type: the last body is written.
        {"id": eid(9), "type": "character", "name": "Early", "supertype": "first"},
        {"id": eid(9), "type": "character", "name": "Late", "supertype": "second"},
        # A stub (known_of: true): its unset fields are left out, its kept keys written even when empty.
        {
            "id": eid(10),
            "type": "character",
            "name": "Stranger",
            "description": "",
            "supertype": "",
            "species": [],
            "birthplace": None,
            "height": 0,
            "known_of": True,
            "x_seen": False,
        },
    ],
    "object": [
        {"id": eid(30), "type": "object", "name": "Numbers", "x_a": 2.0, "x_b": 2.5, "x_c": 1e21, "x_d": -0.0, "x_e": 1e-7, "x_f": -17},
    ],
    "species": [
        {"id": eid(60), "type": "species", "name": "Human"},
        {"id": eid(61), "type": "species", "name": "Selkie"},
    ],
}


def build() -> str:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "folder"
        write_folder(root, WORLD, ELEMENTS)
        files = {p.relative_to(root).as_posix(): p.read_bytes().decode("utf-8") for p in root.rglob("*") if p.is_file()}
    fixture = {
        "about": (
            "One world and its elements, and the files the Python package's write_folder wrote for them, read back "
            "as UTF-8 text. Made by generate-world-folder-files.py; world-folder-files.test.mjs holds worldFolderFiles "
            "to the same paths and bytes."
        ),
        "producer": {"tool": "onlyworlds", "version": onlyworlds.__version__},
        "world": WORLD,
        "elements": ELEMENTS,
        "files": dict(sorted(files.items())),
    }
    return json.dumps(fixture, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    text = build()
    if "--write" in sys.argv:
        FIXTURE.write_bytes(text.encode("utf-8"))
        print(f"wrote {FIXTURE.name} (onlyworlds {onlyworlds.__version__})")
        return 0
    if not FIXTURE.exists() or FIXTURE.read_bytes() != text.encode("utf-8"):
        print(f"{FIXTURE.name} differs from what onlyworlds {onlyworlds.__version__} writes; run with --write")
        return 1
    print(f"{FIXTURE.name} matches onlyworlds {onlyworlds.__version__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
