#!/usr/bin/env python3
"""Structural fingerprint of build/manifest.json (review finding #10).

The bug this is meant to catch: a silent LaTeXML/markup regression (e.g. the
\\small font-leak) that doesn't raise a LaTeXML error but quietly merges,
splits, or drops content blocks -- changing manifest *shape* without
changing the error log. pipeline/check.sh's error-baseline gate is blind to
that; this snapshot gate is not.

The fingerprint is deliberately coarse and robust: per-chapter (top-level
section) counts of blocks by block_type, plus totals. It intentionally does
NOT depend on any field beyond section_id / block_type / content_hash --
those are the only fields guaranteed to exist across manifest schema
changes (e.g. the `anchorable` field added later is ignored here on
purpose, per spec).

Usage:
    python3 pipeline/snapshot.py --write   regenerate the snapshot from the
                                            current build/manifest.json
    python3 pipeline/snapshot.py --check   diff current manifest vs the
                                            committed snapshot; print
                                            human-readable deltas; exit
                                            non-zero on any difference
"""
import json
import sys
from collections import Counter
from pathlib import Path

MANIFEST = Path("build/manifest.json")
SNAPSHOT = Path("pipeline/manifest-snapshot.json")


def chapter_of(section_id: str) -> str:
    """Top-level chapter number a block's dotted section_id lives under."""
    if not section_id:
        return "?"
    return section_id.split(".")[0]


def _chapter_sort_key(ch: str):
    return (0, int(ch)) if ch.isdigit() else (1, ch)


def fingerprint(manifest: dict) -> dict:
    blocks = manifest.get("blocks", [])
    sections = manifest.get("sections", [])

    chapters: dict[str, dict[str, int]] = {}
    for b in blocks:
        ch = chapter_of(b.get("section_id", ""))
        counts = chapters.setdefault(ch, {})
        counts[b["block_type"]] = counts.get(b["block_type"], 0) + 1

    hash_counts = Counter(b["content_hash"] for b in blocks)
    dup_groups = sum(1 for c in hash_counts.values() if c > 1)

    ordered_chapters = {
        ch: dict(sorted(chapters[ch].items()))
        for ch in sorted(chapters, key=_chapter_sort_key)
    }

    return {
        "total_blocks": len(blocks),
        "total_sections": len(sections),
        "duplicate_hash_groups": dup_groups,
        "chapters": ordered_chapters,
    }


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def do_write() -> int:
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found (run the build first)", file=sys.stderr)
        return 1
    manifest = load_json(MANIFEST)
    snap = fingerprint(manifest)
    SNAPSHOT.write_text(json.dumps(snap, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {SNAPSHOT}")
    print(f"  total_blocks={snap['total_blocks']} total_sections={snap['total_sections']}"
          f" duplicate_hash_groups={snap['duplicate_hash_groups']} chapters={len(snap['chapters'])}")
    return 0


def _diff_counts(label: str, old: dict, new: dict) -> list[str]:
    lines = []
    keys = sorted(set(old) | set(new))
    for k in keys:
        o, n = old.get(k, 0), new.get(k, 0)
        if o != n:
            lines.append(f"    {label}.{k}: {o} -> {n}")
    return lines


def do_check() -> int:
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found (run the build first)", file=sys.stderr)
        return 1
    if not SNAPSHOT.exists():
        print(f"ERROR: {SNAPSHOT} not found. Run 'python3 pipeline/snapshot.py --write' first.",
              file=sys.stderr)
        return 1

    manifest = load_json(MANIFEST)
    current = fingerprint(manifest)
    baseline = load_json(SNAPSHOT)

    diffs: list[str] = []

    for field in ("total_blocks", "total_sections", "duplicate_hash_groups"):
        o, n = baseline.get(field), current.get(field)
        if o != n:
            diffs.append(f"  {field}: {o} -> {n}")

    old_chapters = baseline.get("chapters", {})
    new_chapters = current.get("chapters", {})
    all_ch = sorted(set(old_chapters) | set(new_chapters), key=_chapter_sort_key)

    for ch in all_ch:
        o = old_chapters.get(ch)
        n = new_chapters.get(ch)
        if o is None:
            diffs.append(f"  chapter {ch}: NEW ({n})")
        elif n is None:
            diffs.append(f"  chapter {ch}: REMOVED (was {o})")
        elif o != n:
            diffs.append(f"  chapter {ch}: changed")
            diffs.extend(_diff_counts(f"chapter {ch}", o, n))

    print("===== manifest snapshot check =====")
    if diffs:
        print("STRUCTURAL DIFFERENCES vs pipeline/manifest-snapshot.json:")
        for line in diffs:
            print(line)
        print()
        print("FAIL: manifest structure changed since the last snapshot.", file=sys.stderr)
        print("If this change is intentional, run 'python3 pipeline/snapshot.py --write'"
              " (or 'pipeline/check.sh --update-baseline') to accept the new shape.",
              file=sys.stderr)
        return 1

    print("OK: manifest structure matches pipeline/manifest-snapshot.json.")
    return 0


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "--write":
        return do_write()
    if mode == "--check":
        return do_check()
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
