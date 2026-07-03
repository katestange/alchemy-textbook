#!/usr/bin/env python3
"""
Pre-process the textbook .tex into a LaTeXML-safe copy.

PRINCIPLE: this file only adapts *valid* LaTeX that the web converter (LaTeXML)
can't handle -- constructs that compile fine to PDF but that LaTeXML mis-parses.
Genuine LaTeX *bugs* (things that also break a normal pdflatex build) are fixed
in the author's source, NOT masked here -- otherwise a later source edit could
silently un-fix them.  The author keeps writing standard, portable LaTeX
(spec.md Q11); this step only bridges LaTeXML's limitations.

Two "fancy" packages work in pdflatex but make LaTeXML 0.8.7 hang for minutes
(they drag in the expl3 kernel), so we drop them and shim their few uses.  Both
target the preamble, so editing content never disturbs them:

  * tcolorbox   -> its sole use is \\tcbhighmath inside \\card; shim to \\boxed
  * nicematrix  -> its sole use is one NiceTabular with \\Block cells; map
                   NiceTabular -> tabular and stub the two commands

(Other LaTeXML snags -- an unused lipsum import, a dcolumn D-column, and a few
genuine typos -- were fixed in the source itself, so no shim is needed here.)

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

# (pattern, replacement, human-readable label, min_count, max_count).
# Order matters.  Counts are FAIL-CLOSED: if a substitution matches fewer
# than min_count (or more than max_count) times, we abort the build instead
# of silently emitting a .tex that will hang LaTeXML for ~10 minutes (e.g.
# because the author reworded a \usepackage line and the expl3-pulling
# package stayed in).  If a count trips after a legitimate source edit,
# update the pattern/count here deliberately.
# Each pattern is anchored to the uncommented part of a line
# ("^([^%\n]*?)" + keep the prefix), so a commented-out `%\usepackage...`
# (the source has one at line 11) neither matches nor counts.
SUBSTITUTIONS = [
    (r"(?m)^([^%\n]*?)\\usepackage\[theorems,skins\]\{tcolorbox\}", r"\1",
     "drop tcolorbox (pulls expl3; shimmed)", 1, 1),
    (r"(?m)^([^%\n]*?)\\usepackage\{nicematrix\}", r"\1",
     "drop nicematrix (pulls expl3; shimmed)", 1, 1),
    # Only rewrite the environment delimiters, never prose that happens to
    # mention NiceTabular.  \2 keeps begin/end as matched.
    (r"(?m)^([^%\n]*?)\\(begin|end)\{NiceTabular\}", r"\1\\\2{tabular}",
     "map NiceTabular env -> tabular", 2, None),
]


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 1
    text = SRC.read_text(encoding="utf-8")

    print(f"pre-processing {SRC} ({len(text.splitlines())} lines)")
    for pattern, repl, label, min_n, max_n in SUBSTITUTIONS:
        text, n = re.subn(pattern, repl, text)
        print(f"  [{n:>2}x] {label}")
        if n < min_n or (max_n is not None and n > max_n):
            expected = (f"exactly {min_n}" if max_n == min_n
                        else f">= {min_n}" + (f", <= {max_n}" if max_n else ""))
            print(f"ERROR: substitution '{label}' matched {n}x, expected "
                  f"{expected}.\n"
                  f"  The source no longer matches this shim's pattern "
                  f"(pattern: {pattern}).\n"
                  f"  Refusing to continue: an unshimmed expl3 package would "
                  f"hang LaTeXML.\n"
                  f"  Fix: update SUBSTITUTIONS in pipeline/preprocess.py to "
                  f"match the current source.", file=sys.stderr)
            return 1

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
