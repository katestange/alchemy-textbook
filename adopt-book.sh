#!/usr/bin/env bash
# adopt-book.sh — guided onboarding for a NEW textbook (or a first-time setup).
#
# Run this once after editing book.toml to point at your own .tex. It:
#   1. checks the toolchain (LaTeXML version, Python, node)
#   2. validates book.toml
#   3. builds the book (.tex -> web), explaining the common failure modes
#   4. ACCEPTS the fresh build as this book's baseline (error/warning/manifest
#      gates) — required once per new book, since the shipped baselines
#      fingerprint whichever book was adopted before
#   5. builds the frontend
#   6. prints the remaining by-hand steps (.env, admin password, invite codes)
#
# Safe to re-run. For day-to-day edits to an ALREADY-adopted book, use
# ./publish.sh instead — it gates against the baselines rather than
# overwriting them.
set -uo pipefail
cd "$(dirname "$0")"

step()  { printf '\n\033[1m===== %s =====\033[0m\n' "$*"; }
fail()  { printf '\n\033[1;31mSTOPPING:\033[0m %s\n' "$*" >&2; exit 1; }

step "1/6 toolchain"
MISSING=""
for c in python3 latexml latexmlpost node npm; do
    command -v "$c" >/dev/null 2>&1 || MISSING="$MISSING $c"
done
[ -z "$MISSING" ] || fail "missing tools:$MISSING
  Install them first (Debian/Ubuntu: apt-get install latexml python3 python3-venv nodejs npm;
  see deploy/README.md for the full server recipe)."
LATEXML_VERSION=$(latexml --VERSION 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
echo "  python3 $(python3 --version 2>&1 | cut -d' ' -f2), latexml ${LATEXML_VERSION:-?}, node $(node --version)"
if [ "$LATEXML_VERSION" != "0.8.7" ]; then
    fail "this pipeline is verified against LaTeXML 0.8.7 exactly (you have '${LATEXML_VERSION:-none}').
  LaTeXML's splitting/id behavior varies across versions. Install 0.8.7
  (Debian 12 ships it), or re-verify and update EXPECTED_LATEXML_VERSION in
  pipeline/build.sh."
fi

step "2/6 book.toml"
python3 bookconfig.py || fail "fix book.toml and re-run (see the comments in that file)."
TEX_SRC=$(python3 bookconfig.py source.tex)
[ -f "$TEX_SRC" ] || fail "book.toml points at '$TEX_SRC' but that file does not exist.
  Put your book's main .tex there, or update [source] tex in book.toml."

step "3/6 building the book (~5-7 minutes)"
echo "  (If this fails in 'pre-process': your book's preamble differs from the"
echo "   shims in pipeline/preprocess.py — packages that hang LaTeXML must be"
echo "   dropped+shimmed per book. That table is not yet config-driven; see"
echo "   ADAPTABILITY.md 'Preprocessor generalization' for what to change."
echo "   If latexml itself fails: build/latexml.log has the details.)"
bash pipeline/build.sh || fail "the build failed — see the message above.
  Preprocessor shim mismatch -> edit pipeline/preprocess.py (SUBSTITUTIONS).
  LaTeXML errors               -> read build/latexml.log; often a package or
                                  macro LaTeXML can't handle; ADAPTABILITY.md
                                  lists known limitations (multi-file books,
                                  book-class \\chapter, bibliographies)."

step "4/6 accepting this build as the new baseline"
echo "  A new book means new (harmless) LaTeXML warnings and a new structural"
echo "  fingerprint. Accepting makes THIS build the reference that future"
echo "  edits are gated against (publish.sh will then catch regressions)."
bash pipeline/check.sh --accept-current || fail "could not accept baselines."
git add pipeline/error-baseline.txt pipeline/warning-baseline.txt \
        pipeline/manifest-snapshot.json 2>/dev/null || true
echo "  Baselines regenerated (staged for commit if this is a git checkout)."

step "5/6 building the frontend"
( cd frontend && npm install --no-audit --no-fund && npm run build ) \
    || fail "frontend build failed (npm output above)."

step "6/6 done — remaining by-hand steps"
TITLE=$(python3 bookconfig.py book.title)
cat <<EOF
  "$TITLE" is built and ready to serve.

  1. Secrets: copy .env.example to .env, set ANTHROPIC_API_KEY (funds the AI
     tools) and ADMIN_PASSWORD (instructor dashboard, seeded on first start).
  2. Start it:  backend/.venv/bin/uvicorn app:app --app-dir backend --port 8000
     (or use the deploy/ container setup for a real server — deploy/README.md).
  3. Sign in at /admin (your ADMIN_PASSWORD), open /admin/codes, and generate
     invite codes with budgets for your students.
  4. Read a chapter as an anonymous reader to sanity-check the rendering, and
     skim /admin/solutions to choose which solutions start hidden.

  Day-to-day from here on: edit your .tex, then run ./publish.sh — it
  rebuilds, gates against today's baselines, and commits/pushes.
EOF
