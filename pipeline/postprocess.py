#!/usr/bin/env python3
"""
Parse LaTeXML's semantic XML into the JSON content manifest that anchors the
AI tools and the cache (spec.md Q1 post-processing step, Q12 content_manifest).

Each content block gets: a stable content hash (of its normalized text), its
type (definition / theorem / proof / example / <custom> / paragraph), the
dotted section number it lives under, and a short text preview.  The hash is
what cached AI content keys to, so it must depend only on the block's own text
(spec.md Q8 anchoring): move a block and it follows; edit it and it orphans.

Math is rendered from LaTeXML's `tex` attribute (the original TeX), so a block's
text reads the way a student sees it -- `... the group $\\ZZ/n\\ZZ$ ...` -- rather
than as a soup of presentation-MathML tokens.
"""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

XML = Path("build/book.xml")
OUT = Path("build/manifest.json")

LTX = "{http://dlmf.nist.gov/LaTeXML}"
XMLID = "{http://www.w3.org/XML/1998/namespace}id"
HEADINGS = {"section": 0, "subsection": 1, "subsubsection": 2}
# Elements whose text is numbering/label noise, not content.
SKIP_TEXT = {"tags", "tag", "note", "resource"}


def local(elem) -> str:
    return elem.tag.rsplit("}", 1)[-1]


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def block_text(elem) -> str:
    """Readable text of a block, with math as $tex$."""
    parts: list[str] = []

    def rec(e):
        tag = local(e)
        if tag == "Math":
            parts.append(" $" + (e.get("tex") or "").strip() + "$ ")
            return  # never descend into MathML
        if tag in SKIP_TEXT:
            return
        if e.text:
            parts.append(e.text)
        for ch in e:
            rec(ch)
            if ch.tail:
                parts.append(ch.tail)

    rec(elem)
    return normalize("".join(parts))


def block_type(tag: str, elem) -> str:
    if tag == "theorem":
        m = re.search(r"ltx_theorem_(\w+)", elem.get("class", ""))
        return m.group(1) if m else "theorem"
    return tag  # "proof" or "paragraph"


def title_text(elem) -> str:
    t = elem.find(LTX + "title")
    return block_text(t) if t is not None else ""


def has_descendant(elem, tags) -> bool:
    return any(local(d) in tags for d in elem.iter())


def main() -> int:
    if not XML.exists():
        print(f"ERROR: {XML} not found (run latexml first)", file=sys.stderr)
        return 1

    root = ET.parse(XML).getroot()
    nums = [0, 0, 0]
    blocks: list[dict] = []
    sections: list[dict] = []

    def walk(elem, secnum: str, sectitle: str):
        tag = local(elem)
        if tag in HEADINGS:
            lvl = HEADINGS[tag]
            nums[lvl] += 1
            for i in range(lvl + 1, 3):
                nums[i] = 0
            secnum = ".".join(str(nums[i]) for i in range(lvl + 1))
            sectitle = normalize(title_text(elem))
            sections.append({
                "id": secnum, "level": lvl + 1, "title": sectitle,
                "xml_id": elem.get(XMLID, ""),
            })
            for ch in elem:
                walk(ch, secnum, sectitle)
            return

        if tag in ("theorem", "proof"):
            emit(block_type(tag, elem), elem, secnum, sectitle)
            return

        if tag == "para":
            # A para may wrap a theorem/proof; descend to reach it, else emit
            # the para itself as a paragraph block.
            if has_descendant(elem, ("theorem", "proof")):
                for ch in elem:
                    walk(ch, secnum, sectitle)
            else:
                emit("paragraph", elem, secnum, sectitle)
            return

        for ch in elem:
            walk(ch, secnum, sectitle)

    def emit(btype: str, elem, secnum: str, sectitle: str):
        # Strip a leading label separator left over from the stripped theorem
        # number (e.g. "Definition 2.1.1. Let a ..." -> ". Let a ...").
        text = block_text(elem).lstrip(" .,:;—-")
        if not text:
            return
        blocks.append({
            "index": len(blocks),
            "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "block_type": btype,
            "section_id": secnum,
            "section_title": sectitle,
            "text_length": len(text),
            "text_preview": text[:200],
        })

    walk(root, "", "")

    # Sanity: hashes should be unique; collisions mean two blocks are
    # byte-identical (rare but possible -- e.g. a repeated "Proof." stub).
    seen: dict[str, int] = {}
    dupes = 0
    for b in blocks:
        seen[b["content_hash"]] = seen.get(b["content_hash"], 0) + 1
    dupes = sum(1 for c in seen.values() if c > 1)

    manifest = {
        "build": {
            "source_xml": str(XML),
            "block_count": len(blocks),
            "section_count": len(sections),
            "duplicate_hashes": dupes,
        },
        "sections": sections,
        "blocks": blocks,
    }
    OUT.write_text(json.dumps(manifest, indent=1, ensure_ascii=False),
                   encoding="utf-8")

    by_type: dict[str, int] = {}
    for b in blocks:
        by_type[b["block_type"]] = by_type.get(b["block_type"], 0) + 1

    print(f"wrote {OUT}")
    print(f"  sections: {len(sections)}   blocks: {len(blocks)}"
          f"   duplicate-hash groups: {dupes}")
    print("  blocks by type: " + ", ".join(
        f"{k}={v}" for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
