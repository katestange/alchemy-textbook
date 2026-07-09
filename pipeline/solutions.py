#!/usr/bin/env python3
"""
Derive the solution-reveal map, fresh on every build (spec: multi-level
solution visibility).

Every `solution`/`aisolution` block in the book is a click-to-reveal answer
the instructor can show or hide at the level of the whole book, a section, a
subsection, or the individual item. To make that possible without any manual
bookkeeping as the textbook changes, this step runs after the HTML split and:

  1. stamps each solution <div> in build/html/S*.html with
       data-sol-key="<content_hash>"  data-sol-section="<section number>"
     so the backend can strip the hidden ones per-request; and
  2. writes build/solutions.json — the ordered list of solutions (each with a
     stable key, its section, and a human name like "Concept Check 5.5") plus
     the section hierarchy, which the instructor dashboard renders as a tree.

The stable key is the block's content hash (already computed in
build/manifest.json), so a solution's toggle survives renumbering/reordering
and only resets if that solution's own text is edited.

Inputs:  build/manifest.json, build/book.xml, build/chapters.json,
         build/html/S*.html
Output:  build/solutions.json  (+ in-place edits to the chapter HTML)
"""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Reuse the exact XML helpers the manifest builder uses, so section numbering,
# id handling, and the content-hash (block_text) stay identical across passes.
# Computing the hash here directly -- rather than looking it up in
# manifest.json -- also catches solutions nested inside another theorem (e.g.
# an aisolution inside an example), which postprocess.py's walk does not emit.
from postprocess import local, normalize, LTX, XMLID, HEADINGS, title_text, block_text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bookconfig

BUILD = Path("build")
MANIFEST = BUILD / "manifest.json"
BOOK_XML = BUILD / "book.xml"
CHAPTERS_JSON = BUILD / "chapters.json"
HTML_DIR = BUILD / "html"
OUT = BUILD / "solutions.json"

# The book's own environment names (book.toml [environments]): which theorem
# kinds are click-to-reveal solutions, and which kinds a solution answers --
# the latter give each solution the display name of the question it follows
# (Concept Check 5.5, Quiz 5.8, ...).
_ENVS = bookconfig.load()["environments"]
SOLUTION_TYPES = set(_ENVS["solutions"])
QUESTION_TYPES = set(_ENVS["questions"])

# Regex alternation matching any configured solution env's LaTeXML class,
# e.g. ltx_theorem_solution / ltx_theorem_aisolution.
SOLUTION_CLASS_ALT = "(?:" + "|".join(
    re.escape(t) for t in sorted(SOLUTION_TYPES)) + ")" if SOLUTION_TYPES else None


def theorem_type(elem) -> str:
    m = re.search(r"ltx_theorem_(\w+)", elem.get("class", ""))
    return m.group(1) if m else "theorem"


def display_tag(elem) -> str:
    """The rendered label of a theorem, e.g. 'Concept Check 5.5' -- the first
    <tag> child of <tags> that carries no role attribute."""
    tags = elem.find(LTX + "tags")
    if tags is None:
        return ""
    for t in tags.findall(LTX + "tag"):
        if not t.get("role"):
            return normalize("".join(t.itertext()))
    return ""


def main() -> int:
    for p in (MANIFEST, BOOK_XML, CHAPTERS_JSON):
        if not p.exists():
            print(f"ERROR: {p} not found (run the earlier build steps first)",
                  file=sys.stderr)
            return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sec_title = {s["id"]: s["title"] for s in manifest["sections"]}
    chapters = json.loads(CHAPTERS_JSON.read_text(encoding="utf-8"))

    def content_hash(elem) -> str:
        # Same normalization the manifest uses, so a solution's key matches its
        # manifest content_hash where both exist.
        text = block_text(elem).lstrip(" .,:;—-")
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    solutions: list[dict] = []
    unnamed_per_section: dict[str, int] = {}

    root = ET.parse(BOOK_XML).getroot()
    nums = [0, 0, 0]
    last_q = {"name": "", "section": None}  # nearest preceding question

    def walk(elem, secnum: str):
        tag = local(elem)
        if tag in HEADINGS:
            lvl = HEADINGS[tag]
            nums[lvl] += 1
            for i in range(lvl + 1, 3):
                nums[i] = 0
            secnum = ".".join(str(nums[i]) for i in range(lvl + 1))
            for ch in elem:
                walk(ch, secnum)
            return

        if tag == "theorem":
            ttype = theorem_type(elem)
            if ttype in QUESTION_TYPES:
                name = display_tag(elem)
                if name:
                    last_q["name"] = name
                    last_q["section"] = secnum
            elif ttype in SOLUTION_TYPES:
                xml_id = elem.get(XMLID, "")
                section = secnum
                # Name it after the question it answers, when that question
                # sits in the same section; otherwise fall back to a
                # section-scoped ordinal.
                if last_q["name"] and last_q["section"] == section:
                    name = last_q["name"]
                else:
                    k = unnamed_per_section.get(section, 0) + 1
                    unnamed_per_section[section] = k
                    title = sec_title.get(section) or f"§{section}"
                    name = f"{title} — solution {k}"
                solutions.append({
                    "sol_key": content_hash(elem),
                    "section_id": section,
                    "chapter": section.split(".")[0],
                    "name": name,
                    "type": ttype,
                    "xml_id": xml_id,
                })
            # descend (a solution/question may contain nested blocks)
        for ch in elem:
            walk(ch, secnum)

    walk(root, "")

    # ---- stamp the chapter HTML -------------------------------------------
    # Group solutions by chapter file so each file is read/written once.
    by_file: dict[str, list[dict]] = {}
    for s in solutions:
        fname = chapters.get(s["chapter"])
        if fname:
            by_file.setdefault(fname, []).append(s)

    stamped = 0
    for fname, sols in by_file.items():
        path = HTML_DIR / fname
        if not path.exists():
            print(f"  WARNING: {path} missing, cannot stamp", file=sys.stderr)
            continue
        text = path.read_text(encoding="utf-8")
        # Idempotent: clear any prior stamps first (a normal build starts from
        # freshly split HTML, but this makes re-runs/tests safe).
        text = re.sub(
            rf'(<div id="[^"]*" class="ltx_theorem ltx_theorem_{SOLUTION_CLASS_ALT}")'
            r' data-sol-key="[0-9a-f]+" data-sol-section="[^"]*"',
            r'\1', text)
        for s in sols:
            xid = re.escape(s["xml_id"])
            # <div id="Thmaisolutionx22" class="ltx_theorem ltx_theorem_aisolution">
            pat = re.compile(
                rf'(<div id="{xid}" class="ltx_theorem ltx_theorem_{SOLUTION_CLASS_ALT}")(>)')
            new_text, n = pat.subn(
                rf'\1 data-sol-key="{s["sol_key"]}" '
                rf'data-sol-section="{s["section_id"]}"\2', text)
            if n:
                text = new_text
                stamped += n
            else:
                print(f"  WARNING: no div id={s['xml_id']} in {fname} to stamp",
                      file=sys.stderr)
        path.write_text(text, encoding="utf-8")

    # ---- solutions.json ----------------------------------------------------
    payload = {
        "sections": manifest["sections"],
        "solutions": [
            {k: s[k] for k in ("sol_key", "section_id", "chapter", "name", "type")}
            for s in solutions
        ],
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False),
                   encoding="utf-8")

    by_type: dict[str, int] = {}
    for s in solutions:
        by_type[s["type"]] = by_type.get(s["type"], 0) + 1
    print(f"  wrote {OUT}: {len(solutions)} solutions "
          f"({', '.join(f'{k}={v}' for k, v in sorted(by_type.items()))}), "
          f"stamped {stamped} divs across {len(by_file)} chapter files")
    # Fail closed if a solution block couldn't be stamped (would silently
    # become permanently visible / unmanageable).
    if stamped != len(solutions):
        print(f"FATAL: stamped {stamped} of {len(solutions)} solutions",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
