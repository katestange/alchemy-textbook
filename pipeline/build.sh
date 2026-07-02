#!/usr/bin/env bash
# Build pipeline for the interactive textbook (spec.md Q1, Q8).
#
#   .tex  --preprocess-->  book-clean.tex
#         --latexml----->  book.xml        (semantic XML)
#         --postprocess->  manifest.json   (content blocks + hashes, for AI tools)
#         --latexmlpost->  book.html       (rendered reader HTML)   [non-fatal]
#
# The author's source is never modified; all artifacts land in build/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

echo "===== [1/4] pre-process ====="
python3 pipeline/preprocess.py

echo
echo "===== [2/4] latexml -> semantic XML ====="
start=$SECONDS
timeout 600 latexml --dest=build/book.xml build/book-clean.tex \
    > build/latexml.log 2>&1 || true
[ -s build/book.xml ] || { echo "FATAL: book.xml not produced — see build/latexml.log"; exit 1; }
echo "  book.xml: $(du -h build/book.xml | cut -f1)  in $((SECONDS-start))s"
echo "  latexml errors: $(grep -c '^Error:' build/latexml.log)   warnings: $(grep -c '^Warning:' build/latexml.log)"

echo
echo "===== [3/4] post-process -> content manifest ====="
python3 pipeline/postprocess.py

echo
echo "===== [4/4] latexmlpost -> reader HTML (non-fatal) ====="
start=$SECONDS
if timeout 600 latexmlpost --dest=build/book.html --format=html5 --pmml \
       --path=textbook_source build/book.xml > build/latexmlpost.log 2>&1; then
    echo "  book.html: $(du -h build/book.html | cut -f1)  in $((SECONDS-start))s"
else
    echo "  latexmlpost skipped/failed after $((SECONDS-start))s (see build/latexmlpost.log) — manifest build still succeeded"
fi

echo
echo "===== build complete ====="
ls -la build/book.clean.tex build/book.xml build/manifest.json build/book.html 2>/dev/null || true
