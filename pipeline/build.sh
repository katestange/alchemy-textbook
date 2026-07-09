#!/usr/bin/env bash
# Build pipeline for the interactive textbook (spec.md Q1, Q8).
#
#   .tex  --preprocess-->  book-clean.tex
#         --latexml----->  book.xml        (semantic XML)
#         --postprocess->  manifest.json   (content blocks + hashes, for AI tools)
#         --latexmlpost->  book.html       (single-file book, served at /book)  [non-fatal]
#         --latexmlpost->  html/S*.html    (chapter-split reader pages, spec Decision 50)
#         --split_fixup->  full-id anchors restored + chapters.json + split checks
#
# The author's source is never modified; all artifacts land in build/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

# Per-book configuration (book.toml): validated up front so a bad config
# fails here with one clear message, not five minutes into latexml.
python3 bookconfig.py >/dev/null
IMAGES_PATH="$(python3 bookconfig.py source.images)"
SPLIT_AT="$(python3 bookconfig.py source.split_at)"
if [ "$SPLIT_AT" != "section" ]; then
    echo "FATAL: book.toml [source] split_at='$SPLIT_AT' — only 'section'"
    echo "  (article-class top-level \\section = chapter) is supported today."
    echo "  book-class \\chapter splitting is planned: see ADAPTABILITY.md."
    exit 1
fi

# LaTeXML behavior (splitting, fragment ids, exit codes) varies across
# versions; this pipeline is verified against exactly this one.
EXPECTED_LATEXML_VERSION="0.8.7"
actual_version=$(latexml --VERSION 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
if [ "$actual_version" != "$EXPECTED_LATEXML_VERSION" ]; then
    echo "FATAL: LaTeXML version mismatch: expected $EXPECTED_LATEXML_VERSION, got '${actual_version:-unknown}'"
    echo "  (latexml --VERSION said: $(latexml --VERSION 2>&1 || echo 'latexml not found'))"
    echo "  Install LaTeXML $EXPECTED_LATEXML_VERSION or re-verify the pipeline and update EXPECTED_LATEXML_VERSION in pipeline/build.sh."
    exit 1
fi

echo "===== [1/5] pre-process ====="
python3 pipeline/preprocess.py

echo
echo "===== [2/5] latexml -> semantic XML ====="
# --path (book.toml [source] images) lets latexml resolve \includegraphics
# files and records that search path in book.xml, so latexmlpost can copy
# the images.
#
# Exit codes (verified empirically for 0.8.7): 0 on success *even when
# Error:-level messages occur* (check.sh gates on those via the log);
# nonzero only on fatal problems (1) or timeout (124).  So any nonzero
# exit is fatal here -- no need to tolerate a "nonzero on warnings" case.
start=$SECONDS
latexml_status=0
timeout 600 latexml --dest=build/book.xml --path="$IMAGES_PATH" build/book-clean.tex \
    > build/latexml.log 2>&1 || latexml_status=$?
if [ "$latexml_status" -ne 0 ]; then
    [ "$latexml_status" -eq 124 ] && echo "FATAL: latexml timed out after 600s" \
                                  || echo "FATAL: latexml exited with status $latexml_status"
    echo "  see build/latexml.log (a partially written book.xml, if any, is not trusted)"
    exit 1
fi
[ -s build/book.xml ] || { echo "FATAL: book.xml not produced — see build/latexml.log"; exit 1; }
echo "  book.xml: $(du -h build/book.xml | cut -f1)  in $((SECONDS-start))s"
echo "  latexml errors: $(grep -c '^Error:' build/latexml.log)   warnings: $(grep -c '^Warning:' build/latexml.log)"

echo
echo "===== [3/5] post-process -> content manifest ====="
python3 pipeline/postprocess.py

echo
echo "===== [4/5] latexmlpost -> single-file book.html (non-fatal) ====="
# Kept alongside the split output: backend/app.py serves it at /book.
start=$SECONDS
if timeout 600 latexmlpost --dest=build/book.html --format=html5 --pmml \
       build/book.xml > build/latexmlpost.log 2>&1; then
    echo "  book.html: $(du -h build/book.html | cut -f1)  in $((SECONDS-start))s"
else
    echo "  latexmlpost skipped/failed after $((SECONDS-start))s (see build/latexmlpost.log) — manifest build still succeeded"
fi

echo
echo "===== [5/6] latexmlpost --split -> chapter pages (spec Decision 50) ====="
# LaTeXML "section" level == our chapters (top-level \section in an article-
# class book): produces build/html/S1.html..S9.html + book.html index + CSS
# + images.  split_fixup.py then restores full xml:id anchors (LaTeXML
# emits page-relative fragment ids when splitting), rewrites hrefs to match,
# writes build/chapters.json, and fail-closed-verifies anchors/links/images.
start=$SECONDS
rm -rf build/html && mkdir -p build/html   # no stale chapter files
timeout 600 latexmlpost --dest=build/html/book.html --format=html5 --pmml \
    --split --splitat="$SPLIT_AT" \
    build/book.xml > build/latexmlpost-split.log 2>&1 \
    || { echo "FATAL: split latexmlpost failed — see build/latexmlpost-split.log"; exit 1; }
echo "  split pass in $((SECONDS-start))s"
python3 pipeline/split_fixup.py

echo
echo "===== [6/6] solutions -> reveal keys + solutions.json ====="
# Stamp each solution <div> with its stable key + section and emit
# build/solutions.json (drives the per-solution visibility toggles). Fresh
# each build so new solutions are picked up automatically.
python3 pipeline/solutions.py

echo
echo "===== build complete ====="
ls -la build/book-clean.tex build/book.xml build/manifest.json build/book.html build/chapters.json 2>/dev/null || true
ls build/html/ 2>/dev/null | tr '\n' ' '; echo
