#!/usr/bin/env python3
"""
TikZ figure cache: skip re-running LaTeXML's TikZ interpreter (~40s/figure,
the bulk of the build) for figures whose source hasn't changed.

Two subcommands, called from pipeline/build.sh:

  substitute   (after preprocess.py, before latexml)
      Find every tikzpicture in build/book-clean.tex.  Key each by a hash of
      (preamble + any mid-document definitions it uses + its own source).
      Render cache misses standalone -- one small latexml run per figure, in
      parallel -- and store the resulting <picture> XML fragment in
      pipeline/figure-cache/<key>.xml.  Then replace each tikzpicture in
      book-clean.tex with a marker, padded with comment lines so line numbers
      downstream don't shift.  The marker is \\includegraphics of a dummy
      image (build/figure-dummies/figcache-<key>.png), NOT plain text,
      because LaTeXML's paragraph builder treats <graphics> and <picture>
      identically (verified: lone figures sit directly in <para> with no <p>
      wrapper, and \\\\ line breaks between figures survive) while a text
      marker would get <p>-wrapped and merge breaks.

  splice       (after latexml, before postprocess.py / latexmlpost)
      Replace each marker <graphics> element in build/book.xml with its
      cached fragment, rewriting the fragment's xml:ids to what LaTeXML
      would have generated in place (<nearest ancestor id>.picN, same scheme
      LaTeXML uses), so anchors, hover previews, and manifest hashes are
      identical to an uncached build.  Each figure's cached Error:/Warning:
      log lines are appended to build/latexml.log so check.sh's baseline
      gates see the same signatures whether a figure was rendered this build
      or years ago.

The final book.xml -- and therefore manifest.json and every HTML page -- is
equivalent to what a full uncached build produces (verified by diff when this
was introduced).  Figures keep their inline SVG with foreignObject text/math,
so figure labels still render in the reader's page fonts.

Fail-closed: any figure that can't be rendered standalone (e.g. it uses a
macro defined mid-document in a way the definition harvester below doesn't
catch) aborts the build with instructions.  FIGURE_CACHE=off bypasses the
whole mechanism and builds the slow, original way.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CLEAN_TEX = Path("build/book-clean.tex")
BOOK_XML = Path("build/book.xml")
LATEXML_LOG = Path("build/latexml.log")
MAP_FILE = Path("build/figure-map.json")
CACHE_DIR = Path("pipeline/figure-cache")
RENDER_DIR = Path("build/figure-render")

LTX_NS = "http://dlmf.nist.gov/LaTeXML"
XMLID = "{http://www.w3.org/XML/1998/namespace}id"
DUMMY_DIR = Path("build/figure-dummies")
MARKER_GRAPHIC_RE = re.compile(r"figcache-([0-9a-f]{16})(?:\.png)?$")
PER_FIGURE_TIMEOUT = 300  # seconds; the slowest figure today takes ~40s
# 1x1 transparent PNG: the marker \includegraphics target.  Only its
# existence matters (a missing graphic would add a LaTeXML warning and trip
# check.sh's baseline); the <graphics> node is spliced away before any
# postprocessor would measure or copy it.
import base64
DUMMY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAC"
    "hwGA60e6kgAAAABJRU5ErkJggg==")

# Mid-document definition forms we harvest into a figure's standalone render
# (and into its cache key) when the figure's body uses the defined name.
# Deliberately NOT here: \setlength & friends (usually group-scoped table
# tweaks) -- a figure relying on one of those fails closed with a message.
DEF_RE = re.compile(
    r"(?m)^[ \t]*\\(?:(?:re)?newcommand\*?|providecommand\*?|def|newif|"
    r"DeclareMathOperator\*?|tikzset|tikzstyle)\b")
DEF_NAME_RE = re.compile(r"^[ \t]*\\[A-Za-z@]+\*?[ \t]*\{?\\([A-Za-z@]+)")


def die(msg: str) -> "NoReturn":
    print(f"ERROR (figure cache): {msg}", file=sys.stderr)
    print("  To build without the figure cache: FIGURE_CACHE=off pipeline/build.sh",
          file=sys.stderr)
    raise SystemExit(1)


def cache_off() -> bool:
    return os.environ.get("FIGURE_CACHE", "").lower() in ("off", "0", "no")


# --------------------------------------------------------------------------
# Scanning book-clean.tex
# --------------------------------------------------------------------------

def comment_starts(text: str) -> list:
    """For each line, the offset (within the line) where a comment begins,
    or None.  A % escaped as \\% does not start a comment."""
    starts = []
    for line in text.split("\n"):
        pos = None
        i = 0
        while i < len(line):
            if line[i] == "\\":
                i += 2
                continue
            if line[i] == "%":
                pos = i
                break
            i += 1
        starts.append(pos)
    return starts


def find_tikzpictures(text: str) -> list:
    """Char spans [(start, end)] of uncommented tikzpicture environments."""
    line_start_offsets = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            line_start_offsets.append(i + 1)
    cstarts = comment_starts(text)

    def commented(pos: int) -> bool:
        # binary search for the line containing pos
        import bisect
        ln = bisect.bisect_right(line_start_offsets, pos) - 1
        cs = cstarts[ln]
        return cs is not None and (pos - line_start_offsets[ln]) > cs

    spans = []
    begin_re = re.compile(r"\\begin\{tikzpicture\}")
    end_re = re.compile(r"\\end\{tikzpicture\}")
    pos = 0
    while True:
        mb = begin_re.search(text, pos)
        if not mb:
            break
        if commented(mb.start()):
            pos = mb.end()
            continue
        # find the matching (uncommented) \end
        epos = mb.end()
        while True:
            me = end_re.search(text, epos)
            if not me:
                die(f"unterminated tikzpicture at offset {mb.start()}")
            if commented(me.start()):
                epos = me.end()
                continue
            break
        inner = begin_re.search(text, mb.end(), me.start())
        if inner and not commented(inner.start()):
            die("nested tikzpicture environments are not supported by the "
                "figure cache")
        spans.append((mb.start(), me.end()))
        pos = me.end()
    return spans


def harvest_defs(body: str, fig_spans: list) -> list:
    """[(offset_in_body, name, full_definition_text)] for line-start
    definition commands in the document body, excluding those inside figures."""
    defs = []
    for m in DEF_RE.finditer(body):
        if any(s <= m.start() < e for s, e in fig_spans):
            continue
        nm = DEF_NAME_RE.match(body[m.start():m.start() + 200])
        if not nm:
            continue
        # the definition ends at the first newline outside any brace group,
        # so `\newcommand{\card}[1]{...}` and multi-line bodies both work
        i = m.start()
        depth = 0
        end = None
        j = i
        while j < len(body):
            c = body[j]
            if c == "\\":
                j += 2
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth = max(0, depth - 1)
            elif c == "\n" and depth == 0:
                end = j
                break
            j += 1
        if end is None:
            end = len(body)
        defs.append((m.start(), nm.group(1), body[i:end]))
    return defs


def figure_signature(preamble: str, defs_text: str, fig_src: str) -> str:
    h = hashlib.sha256()
    for part in (preamble, defs_text, fig_src):
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


# --------------------------------------------------------------------------
# Rendering a cache miss
# --------------------------------------------------------------------------

def render_figure(sig: str, preamble: str, defs_text: str, fig_src: str) -> str:
    """Run latexml on a standalone doc containing one figure; cache and
    return the <picture> fragment.  Returns an error string on failure."""
    workdir = RENDER_DIR / sig
    workdir.mkdir(parents=True, exist_ok=True)
    doc = workdir / "fig.tex"
    doc.write_text(preamble + "\\begin{document}\n" + defs_text +
                   fig_src + "\n\\end{document}\n", encoding="utf-8")
    out = workdir / "fig.xml"
    log = workdir / "fig.log"
    with open(log, "w") as lf:
        try:
            rc = subprocess.run(
                ["latexml", f"--dest={out}", str(doc)],
                stdout=lf, stderr=subprocess.STDOUT,
                timeout=PER_FIGURE_TIMEOUT).returncode
        except subprocess.TimeoutExpired:
            return f"latexml timed out after {PER_FIGURE_TIMEOUT}s (see {log})"
    if rc != 0 or not out.exists():
        return f"latexml exited with status {rc} (see {log})"
    log_lines = [ln for ln in log.read_text(encoding="utf-8").splitlines()
                 if ln.startswith("Error:") or ln.startswith("Warning:")]
    errors = [ln for ln in log_lines if ln.startswith("Error:")]
    if errors:
        return ("standalone render hit LaTeXML errors (likely a dependency "
                f"on mid-document state the harvester missed):\n    "
                + "\n    ".join(errors[:5]) + f"\n  (full log: {log})")

    ET.register_namespace("", LTX_NS)
    ET.register_namespace("svg", "http://www.w3.org/2000/svg")
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    ET.register_namespace("m", "http://www.w3.org/1998/Math/MathML")
    root = ET.parse(out).getroot()
    pics = [e for e in root.iter() if e.tag == f"{{{LTX_NS}}}picture"]
    if len(pics) != 1:
        return (f"expected exactly 1 <picture> in standalone render, got "
                f"{len(pics)} (see {out})")
    frag = ET.tostring(pics[0], encoding="unicode")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{sig}.xml").write_text(frag, encoding="utf-8")
    (CACHE_DIR / f"{sig}.log").write_text(
        "\n".join(log_lines) + ("\n" if log_lines else ""), encoding="utf-8")
    return ""


# --------------------------------------------------------------------------
# substitute
# --------------------------------------------------------------------------

def cmd_substitute() -> int:
    if cache_off():
        MAP_FILE.write_text(json.dumps({"sigs": []}), encoding="utf-8")
        print("figure cache: OFF (FIGURE_CACHE=off) — tikz stays inline")
        return 0
    text = CLEAN_TEX.read_text(encoding="utf-8")
    doc_at = text.find(r"\begin{document}")
    if doc_at < 0:
        die(r"no \begin{document} in " + str(CLEAN_TEX))
    preamble, body = text[:doc_at], text[doc_at:]

    body_spans = [(s - doc_at, e - doc_at)
                  for s, e in find_tikzpictures(text) if s >= doc_at]
    if not body_spans:
        MAP_FILE.write_text(json.dumps({"sigs": []}), encoding="utf-8")
        print("figure cache: no tikzpicture environments found")
        return 0
    defs = harvest_defs(body, body_spans)

    figures = []  # (start, end, sig, defs_text, src) offsets into `body`
    for s, e in body_spans:
        src = body[s:e]
        used = set(re.findall(r"\\([A-Za-z@]+)", src))
        fig_defs = [d for d in defs if d[0] < s and d[1] in used]
        defs_text = "".join(d[2] + "\n" for d in fig_defs)
        figures.append((s, e, figure_signature(preamble, defs_text, src),
                        defs_text, src))

    misses = {sig: (dt, src) for _, _, sig, dt, src in figures
              if not (CACHE_DIR / f"{sig}.xml").exists()}
    print(f"figure cache: {len(figures)} tikzpictures, "
          f"{len(figures) - len(misses)} cached, {len(misses)} to render")
    if misses:
        jobs = int(os.environ.get("FIGURE_CACHE_JOBS",
                                  min(len(misses), os.cpu_count() or 4)))
        print(f"  rendering {len(misses)} figure(s) with {jobs} parallel "
              f"latexml job(s) (~40s each)...")
        failures = {}
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            futs = {sig: ex.submit(render_figure, sig, preamble, dt, src)
                    for sig, (dt, src) in misses.items()}
            for sig, fut in futs.items():
                err = fut.result()
                if err:
                    failures[sig] = err
                else:
                    print(f"  rendered {sig}")
        if failures:
            for sig, err in failures.items():
                print(f"  FAILED {sig}: {err}", file=sys.stderr)
            die(f"{len(failures)} figure(s) failed to render standalone")

    # Replace figures back-to-front so earlier offsets stay valid.  Pad with
    # full-line comments to preserve the file's line count (log line numbers,
    # error baselines).  Padding lines go first; a trailing '%' on the marker
    # line would eat legitimate following content, so the marker line is bare.
    DUMMY_DIR.mkdir(parents=True, exist_ok=True)
    for s, e, sig, _, src in reversed(figures):
        (DUMMY_DIR / f"figcache-{sig}.png").write_bytes(DUMMY_PNG)
        pad = "%FIGCACHE pad\n" * src.count("\n")
        body = (body[:s] + pad
                + f"\\includegraphics{{figcache-{sig}.png}}" + body[e:])

    CLEAN_TEX.write_text(preamble + body, encoding="utf-8")
    MAP_FILE.write_text(json.dumps(
        {"sigs": [f[2] for f in figures]}, indent=1), encoding="utf-8")
    return 0


# --------------------------------------------------------------------------
# splice
# --------------------------------------------------------------------------

def marker_events(root):
    """Doc-order list of ('marker', ancestor_id, sig) / ('native', aid, elem)
    where ancestor_id is the nearest enclosing xml:id -- the scheme LaTeXML
    itself uses to mint picture ids (<ancestor>.picN).  Markers are the
    <graphics> elements whose graphic= names a figcache dummy; their own
    xml:id (a .gN id) is about to be discarded, so the ancestor is taken
    from the enclosing element, never the marker itself."""
    events = []
    gfx_tag = f"{{{LTX_NS}}}graphics"

    def walk(el, aid):
        if el.tag == f"{{{LTX_NS}}}picture":
            events.append(("native", aid, el))
            return
        if el.tag == gfx_tag:
            m = MARKER_GRAPHIC_RE.search(el.get("graphic", ""))
            events.append(("marker", aid, m.group(1)) if m
                          else ("graphics", aid, el))
            return
        my = el.get(XMLID) or aid
        for ch in el:
            walk(ch, my)

    walk(root, None)
    return events


def cmd_splice() -> int:
    if not MAP_FILE.exists():
        die(f"{MAP_FILE} missing — run 'figures.py substitute' first")
    sigs = json.loads(MAP_FILE.read_text(encoding="utf-8"))["sigs"]
    if not sigs:
        print("figure cache: nothing to splice")
        return 0

    xml_text = BOOK_XML.read_text(encoding="utf-8")
    root = ET.fromstring(xml_text)
    events = marker_events(root)
    markers = [ev for ev in events if ev[0] == "marker"]
    if len(markers) != len(sigs):
        die(f"expected {len(sigs)} figure markers in {BOOK_XML}, found "
            f"{len(markers)} — did latexml drop a marker \\includegraphics?")

    # Assign ids: per nearest-id ancestor, pictures are numbered .pic1,
    # .pic2, ... in document order (native pictures, if any, count too).
    # A real \includegraphics sharing a scope with a marker would have had
    # its .gN id shifted by the marker (LaTeXML counted the marker as a
    # graphic) -- no such mixed scope exists in this book, so refuse rather
    # than emit ids that differ from an uncached build's.
    from collections import defaultdict
    counters = defaultdict(int)
    native_ids = {ev[2].get(XMLID) for ev in events if ev[0] == "native"}
    marker_scopes = {ev[1] for ev in markers}
    for kind, aid, payload in events:
        if kind == "graphics" and aid in marker_scopes:
            die(f"scope {aid} mixes a real \\includegraphics with a cached "
                f"figure; its .gN ids would differ from an uncached build")
    assignments = []  # (sig, new_id) in doc order
    for kind, aid, payload in events:
        if kind == "graphics":
            continue
        if aid is None:
            die("figure marker outside any element with an xml:id")
        counters[aid] += 1
        if kind == "marker":
            new_id = f"{aid}.pic{counters[aid]}"
            if new_id in native_ids:
                die(f"id collision splicing figure: {new_id} already exists")
            assignments.append((payload, new_id))

    # Textual replacement keeps LaTeXML's own serialization (processing
    # instructions, namespace prefixes, formatting) byte-for-byte outside
    # the spliced spans.
    out = []
    cursor = 0
    for sig, new_id in assignments:
        m = re.compile(
            r"<graphics\b[^>]*\bgraphic=\"[^\"]*figcache-" + sig
            + r"(?:\.png)?\"[^>]*/>").search(xml_text, cursor)
        if not m:
            die(f"marker <graphics> for {sig} not found in {BOOK_XML} text")
        frag_file = CACHE_DIR / f"{sig}.xml"
        if not frag_file.exists():
            die(f"cache fragment missing: {frag_file}")
        frag = frag_file.read_text(encoding="utf-8")
        idm = re.search(r'xml:id="([^"]+)"', frag)
        if not idm:
            die(f"no xml:id in cached fragment {frag_file}")
        frag = frag.replace(f'"{idm.group(1)}', f'"{new_id}')
        out.append(xml_text[cursor:m.start()])
        out.append(frag)
        cursor = m.end()
    out.append(xml_text[cursor:])
    result = "".join(out)
    if "figcache-" in result:
        die("figcache marker(s) left over after splice — count mismatch")
    BOOK_XML.write_text(result, encoding="utf-8")

    # Append each figure's cached LaTeXML error/warning lines to the main
    # log so check.sh's baseline diff is identical to an uncached build's.
    with open(LATEXML_LOG, "a", encoding="utf-8") as lf:
        lf.write("\n(figure cache: replayed per-figure LaTeXML messages)\n")
        for sig in sorted(set(sigs)):
            logf = CACHE_DIR / f"{sig}.log"
            if logf.exists():
                lf.write(logf.read_text(encoding="utf-8"))
    print(f"figure cache: spliced {len(assignments)} figure(s) into "
          f"{BOOK_XML}")
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "substitute":
        return cmd_substitute()
    if cmd == "splice":
        return cmd_splice()
    print("usage: figures.py {substitute|splice}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
