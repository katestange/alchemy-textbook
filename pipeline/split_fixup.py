#!/usr/bin/env python3
"""
Post-fix and verify the chapter-split HTML (spec Decision 50).

LaTeXML's --split rewrites every anchor *relative to its page*: an element
whose canonical xml:id is `S2.SS1.p3` is emitted in S2.html as id="SS1.p3"
(LaTeXML::Post::Scan::inPageID strips the page-root prefix; the XSLT emits
that `fragid` as the HTML id).  The manifest (build/manifest.json) and the
reader SPA address blocks by the *full* xml:id, so this script:

  1. restores full ids in each chapter file (deterministically inverting the
     prefix-strip, using build/book.xml as the ground truth for real ids),
     and rewrites all same-file and cross-file href fragments to match;
  2. writes build/chapters.json  {"1": "S1.html", ...};
  3. verifies the three classic split gotchas:
       a. every manifest xml_id appears as id="..." in exactly one chapter
          file (fatal if not);
       b. every internal href fragment resolves in its target file (fatal);
       c. every <img src> resolves against the output dir (warning only:
          a missing graphic is an author-source issue, not a split bug).

Exits non-zero on any fatal check so the build fails closed.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HTML_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("build/html")
BOOK_XML = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("build/book.xml")
MANIFEST = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("build/manifest.json")
CHAPTERS_JSON = Path(sys.argv[4]) if len(sys.argv) > 4 else Path("build/chapters.json")

LTX = "{http://dlmf.nist.gov/LaTeXML}"
XMLID = "{http://www.w3.org/XML/1998/namespace}id"

ID_RE = re.compile(r'\bid="([^"]+)"')
HREF_RE = re.compile(r'\bhref="([^"#]*)#([^"]+)"')
IMG_RE = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"')


def fail(msg: str) -> None:
    print(f"SPLIT-CHECK FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    root = ET.parse(BOOK_XML).getroot()

    # Top-level <section>s of the document are our chapters, in order.
    chapters = []  # [(chapter_number, root_id)]
    for n, sec in enumerate(root.findall(f"{LTX}section"), start=1):
        rid = sec.get(XMLID)
        if not rid:
            fail(f"chapter {n} has no xml:id in {BOOK_XML}")
        chapters.append((n, rid))
    if not chapters:
        fail(f"no top-level sections found in {BOOK_XML}")

    all_ids = {e.get(XMLID) for e in root.iter() if e.get(XMLID)}

    # Per chapter: LaTeXML strips the page-root prefix "R." from descendant
    # ids; build the inverse map  stripped-frag -> full id.
    fragmap = {}  # root_id -> {frag: full}
    for _, rid in chapters:
        sec = next(e for e in root.findall(f"{LTX}section") if e.get(XMLID) == rid)
        m = {}
        for e in sec.iter():
            full = e.get(XMLID)
            if full and full.startswith(rid + "."):
                frag = full[len(rid) + 1:]
                if frag in all_ids:
                    fail(f"ambiguous anchor: '{frag}' is both a real xml:id and "
                         f"the stripped form of '{full}' in chapter {rid}")
                m[frag] = full
        fragmap[rid] = m

    # ---- rewrite ids and hrefs in the split HTML --------------------------
    chapter_files = {rid: HTML_DIR / f"{rid}.html" for _, rid in chapters}
    for rid, path in chapter_files.items():
        if not path.exists():
            fail(f"expected chapter file missing: {path} "
                 "(did latexmlpost --split file naming change?)")

    html_files = sorted(HTML_DIR.glob("*.html"))
    for path in html_files:
        text = path.read_text(encoding="utf-8")
        own = fragmap.get(path.stem, {})
        if own:  # restore full ids + same-file fragments in a chapter file
            text = ID_RE.sub(lambda m: f'id="{own.get(m.group(1), m.group(1))}"', text)

        def fix_href(m):
            target, frag = m.group(1), m.group(2)
            tmap = own if target == "" else fragmap.get(Path(target).stem, {})
            return f'href="{target}#{tmap.get(frag, frag)}"'
        text = HREF_RE.sub(fix_href, text)
        path.write_text(text, encoding="utf-8")

    # ---- chapters.json -----------------------------------------------------
    mapping = {str(n): f"{rid}.html" for n, rid in chapters}
    CHAPTERS_JSON.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {CHAPTERS_JSON}: {len(mapping)} chapters "
          f"({', '.join(mapping.values())})")

    # ---- check (a): manifest anchors ---------------------------------------
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    want = [b["xml_id"] for b in manifest["blocks"]]
    id_locations = {}  # id -> [chapter file, ...]
    for rid, path in chapter_files.items():
        for i in ID_RE.findall(path.read_text(encoding="utf-8")):
            id_locations.setdefault(i, []).append(path.name)
    missing = [i for i in want if i not in id_locations]
    dupes = [i for i in want if len(id_locations.get(i, [])) > 1]
    print(f"  anchors: {len(want) - len(missing)}/{len(want)} manifest xml_ids "
          f"present in chapter files ({len(dupes)} duplicated)")
    if missing:
        fail(f"{len(missing)} manifest xml_ids missing from split HTML, "
             f"e.g. {missing[:5]}")
    if dupes:
        fail(f"xml_ids duplicated across chapter files: {dupes[:5]}")

    # ---- check (b): every internal href fragment resolves ------------------
    ids_by_file = {p.name: set(ID_RE.findall(p.read_text(encoding="utf-8")))
                   for p in html_files}
    dangling, cross_file = [], 0
    for path in html_files:
        for target, frag in HREF_RE.findall(path.read_text(encoding="utf-8")):
            if target.startswith(("http:", "https:")):
                continue
            tname = path.name if target == "" else target
            if tname not in ids_by_file:
                dangling.append(f"{path.name}: href to unknown file {target}#{frag}")
            elif frag not in ids_by_file[tname]:
                dangling.append(f"{path.name}: dangling {target or ''}#{frag}")
            elif target != "" and tname != path.name:
                cross_file += 1
    print(f"  hrefs: {cross_file} cross-file fragment links, "
          f"{len(dangling)} dangling")
    if dangling:
        fail(f"dangling internal hrefs, e.g. {dangling[:5]}")

    # ---- check (c): images --------------------------------------------------
    imgs, unresolved = set(), []
    for path in html_files:
        for src in IMG_RE.findall(path.read_text(encoding="utf-8")):
            if src.startswith("data:"):
                continue
            imgs.add(src)
            if not (HTML_DIR / src).exists():
                unresolved.append(f"{path.name}: {src}")
    print(f"  images: {len(imgs) - len({u.split(': ')[1] for u in unresolved})}"
          f"/{len(imgs)} <img src> resolve under {HTML_DIR}")
    for u in sorted(set(unresolved)):
        print(f"    WARNING: unresolved image {u} "
              "(graphic missing from textbook_source/ — author-source issue)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
