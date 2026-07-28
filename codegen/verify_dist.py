#!/usr/bin/env python3
"""Verify the vendored OnlyWorlds schema distribution.

Two checks that catch DIFFERENT things, and both are needed:

  1. Every vendored file hashes to what MANIFEST.json says.
     -> catches local edits, partial copies, line-ending corruption.

  2. MANIFEST.json itself hashes to what schema-pin.json recorded AT PIN TIME.
     -> catches a MOVED TAG. This is the one that is easy to skip and fatal to
        skip. A fetched manifest always agrees with the tree it came with, so
        check (1) alone proves internal consistency and nothing about identity.
        If someone force-pushes the tag, the manifest moves with the files and
        both agree perfectly about the wrong content. Recording the hash we
        first accepted is the only thing that makes that visible. This is the
        go.sum / package-lock `integrity` pattern.
        (Boss's finding, 2026-07-28. CVE-2025-30066 is the same shape.)

Plus a freshness WARNING (never a failure): a check that compares you to what
you chose can never tell you your choice went stale. Failing on age turns a
guard into a nag, and people delete nags.

Usage:  python codegen/verify_dist.py [--quiet]
Exit:   0 ok · 1 verification failure
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE / "schema-dist"
PIN = HERE / "schema-pin.json"

STALE_AFTER_DAYS = 90


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(msg: str) -> None:
    print(f"schema:verify FAILED — {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    def say(msg: str) -> None:
        if not args.quiet:
            print(msg)

    if not DIST.is_dir():
        fail(
            f"vendored distribution missing at {DIST}. "
            "Vendoring is a SUPPORTED path, not a workaround — it is what makes "
            "offline and air-gapped builds possible. Re-vendor from the pinned tag."
        )
    if not PIN.is_file():
        fail(f"pin record missing at {PIN} — there is nothing to verify against.")

    pin = json.loads(PIN.read_text(encoding="utf-8"))
    manifest_path = DIST / "MANIFEST.json"
    if not manifest_path.is_file():
        fail(f"MANIFEST.json missing from the vendored tree at {manifest_path}")

    # --- check 2 FIRST: identity before contents. -------------------------
    # Order matters. Verifying contents against a manifest we have not yet
    # authenticated is exactly the complicit-manifest case.
    actual_manifest_sha = sha256_of(manifest_path)
    recorded = pin.get("manifest_sha256")
    if not recorded:
        fail("schema-pin.json carries no manifest_sha256 — the moved-tag check cannot run.")
    if actual_manifest_sha != recorded:
        fail(
            "MANIFEST.json does not match the hash recorded at pin time.\n"
            f"  recorded : {recorded}\n"
            f"  actual   : {actual_manifest_sha}\n"
            f"  pinned   : {pin.get('tag')} @ {pin.get('commit')}\n"
            "This is what a MOVED TAG looks like. The vendored tree may be internally\n"
            "consistent and still not be what was reviewed. Do not 'fix' this by\n"
            "updating the pin — establish what changed upstream first."
        )
    say(f"  manifest identity : OK ({recorded[:16]}...)  [{pin.get('tag')}]")

    # --- check 1: contents against the now-authenticated manifest ---------
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if not isinstance(files, dict):
        fail("MANIFEST.json has no `files` object — unexpected manifest shape.")

    ok = 0
    problems: list[str] = []
    for rel, entry in files.items():
        want = entry["sha256"] if isinstance(entry, dict) else entry
        p = DIST / rel
        if not p.is_file():
            problems.append(f"missing: {rel}")
            continue
        got = sha256_of(p)
        if got != want:
            problems.append(f"hash mismatch: {rel}\n      want {want}\n      got  {got}")
        else:
            ok += 1

    # The manifest cannot hash itself, so it is legitimately absent from `files`.
    # Anything ELSE untracked in the vendored tree is a local addition and the
    # kind of thing this check exists to surface.
    tracked = {(DIST / r).resolve() for r in files}
    tracked.add(manifest_path.resolve())
    for p in DIST.rglob("*"):
        if p.is_file() and p.resolve() not in tracked:
            problems.append(f"untracked file in vendored tree: {p.relative_to(DIST)}")

    if problems:
        fail("vendored tree does not match its manifest:\n    " + "\n    ".join(problems))
    say(f"  file contents     : OK ({ok}/{len(files)} hashed; MANIFEST.json self-excluded)")

    # --- freshness: WARN, never fail --------------------------------------
    published = pin.get("published")
    if published:
        try:
            age = (_dt.date.today() - _dt.date.fromisoformat(published)).days
            say(f"  pin age           : {age} day(s) (published {published})")
            if age > STALE_AFTER_DAYS:
                print(
                    f"schema:verify WARNING — the pinned distribution is {age} days old "
                    f"(>{STALE_AFTER_DAYS}). A check that compares you to what you chose "
                    "cannot tell you your choice went stale. Consider re-pinning.",
                    file=sys.stderr,
                )
        except ValueError:
            pass

    say("schema:verify OK")


if __name__ == "__main__":
    main()
