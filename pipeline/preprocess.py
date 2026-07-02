#!/usr/bin/env python3
"""
Pre-process the textbook .tex into a LaTeXML-safe copy.

LaTeXML 0.8.7 hangs for many minutes when it has to load the expl3 kernel,
which three lightly-used packages drag in.  Each has a trivial, faithful
replacement (see spec.md Q1):

  * lipsum      -> deleted (only ever loaded; \\lipsum is never called)
  * tcolorbox   -> its sole use is \\tcbhighmath inside the \\card macro; shim
                   it to \\boxed
  * nicematrix  -> its sole use is one NiceTabular with \\Block bordered cells;
                   map NiceTabular -> tabular and stub the two commands

We also fix two author typos that break *any* LaTeX engine (surfaced by the
conversion, not caused by it):

  * \\footenote -> \\footnote
  * \\mathcbf   -> \\mathbf

Nothing here is destructive: the author's source is untouched; we emit a
build-only copy.  This keeps the build pipeline AI-free and deterministic
(spec.md Q8).
"""
import re
import sys
from pathlib import Path

SRC = Path("textbook_source/introduction-to-crypto.tex")
DST = Path("build/book-clean.tex")

# Shims injected into the preamble, just before \begin{document}.
PREAMBLE_SHIMS = r"""
%% ---- pipeline shims (injected by pipeline/preprocess.py) ----
\providecommand{\tcbhighmath}[1]{\boxed{#1}}   % tcolorbox: only \card uses this
\providecommand{\NiceMatrixOptions}[1]{}        % nicematrix: stub
\providecommand{\Block}[3][]{#3}                 % nicematrix: \Block[opts]{a}{content}
%% ------------------------------------------------------------
"""

# (pattern, replacement, human-readable label). Order matters.
SUBSTITUTIONS = [
    (r"\\usepackage\{lipsum\}", "", "drop lipsum (unused; pulls expl3)"),
    (r"\\usepackage\[theorems,skins\]\{tcolorbox\}", "",
     "drop tcolorbox (pulls expl3; shimmed)"),
    (r"\\usepackage\{nicematrix\}", "",
     "drop nicematrix (pulls expl3; shimmed)"),
    (r"NiceTabular", "tabular", "map NiceTabular -> tabular"),
    (r"\\footenote", r"\\footnote", "typo: \\footenote -> \\footnote"),
    (r"\\mathcbf", r"\\mathbf", "typo: \\mathcbf -> \\mathbf"),
]


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 1
    text = SRC.read_text(encoding="utf-8")

    print(f"pre-processing {SRC} ({len(text.splitlines())} lines)")
    for pattern, repl, label in SUBSTITUTIONS:
        text, n = re.subn(pattern, repl, text)
        print(f"  [{n:>2}x] {label}")

    # Inject shims once, right before \begin{document}.  Use str.replace, not
    # re.sub: the replacement contains backslash macros (\providecommand,
    # \boxed) that regex would mis-read as escape sequences.
    marker = r"\begin{document}"
    if text.count(marker) < 1:
        print(r"ERROR: could not find \begin{document} to inject shims",
              file=sys.stderr)
        return 1
    text = text.replace(marker, PREAMBLE_SHIMS + marker, 1)
    print("  [ 1x] injected preamble shims before \\begin{document}")

    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(text, encoding="utf-8")
    print(f"wrote {DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
