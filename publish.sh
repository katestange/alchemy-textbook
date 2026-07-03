#!/usr/bin/env bash
# publish.sh — one command to publish textbook edits (spec Decision 60).
#
#   ./publish.sh                 interactive: build, gate, show the receipt,
#                                confirm, commit, push
#   ./publish.sh -m "message"    same, with a custom commit message
#   ./publish.sh --yes           non-interactive: accept structural/warning
#                                diffs automatically (new ERRORS still abort)
#
# What it does, in order:
#   1. rebuilds the web textbook from textbook_source/ (~5-7 minutes)
#   2. runs all regression gates (LaTeXML errors, math-parse warnings,
#      structural snapshot)
#   3. NEW ERRORS -> aborts, nothing committed (fix the LaTeX first)
#      warning/structure diffs -> shows them as the "receipt" of your edit
#      and asks you to confirm they match what you intended
#   4. commits textbook_source/ + updated baselines together, pushes to GitHub
#
# Only textbook_source/ and the pipeline baselines are committed; any other
# uncommitted work is left alone (you'll see a note).
set -euo pipefail

# --- run as the repo-owning user, not root --------------------------------
if [ "$(id -u)" -eq 0 ]; then
    echo "(running as root — re-executing as 'claude', the repo owner)"
    exec sudo -u claude -H bash "$0" "$@"
fi

cd "$(dirname "$0")"

# --- options ---------------------------------------------------------------
YES=0
MSG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --yes) YES=1 ;;
        -m) shift; MSG="${1:-}" ;;
        *) echo "unknown option: $1 (usage: ./publish.sh [--yes] [-m \"message\"])" >&2; exit 2 ;;
    esac
    shift
done

# --- anything to publish? ---------------------------------------------------
if git diff --quiet -- textbook_source/ && git diff --cached --quiet -- textbook_source/; then
    echo "No changes in textbook_source/ — nothing to publish."
    echo "(Edit the .tex first; this script rebuilds, gates, commits, and pushes.)"
    exit 0
fi
echo "===== changes to publish ====="
git status --short -- textbook_source/
OTHER_DIRTY=$(git status --short | grep -v ' textbook_source/' | grep -v '^??' || true)
if [ -n "$OTHER_DIRTY" ]; then
    echo
    echo "note: other modified files exist and will NOT be committed by this script:"
    echo "$OTHER_DIRTY" | sed 's/^/  /'
fi

# --- build + gates -----------------------------------------------------------
echo
echo "===== building and checking (~5-7 minutes) ====="
CHECK_OUT="$(mktemp)"
trap 'rm -f "$CHECK_OUT"' EXIT
CHECK_RC=0
bash pipeline/check.sh 2>&1 | tee "$CHECK_OUT" || CHECK_RC=$?

BASELINES_TOUCHED=0
if [ "$CHECK_RC" -ne 0 ]; then
    if grep -q "FAIL: new LaTeXML errors" "$CHECK_OUT"; then
        echo
        echo "ABORTING: your edit introduced new LaTeXML errors (listed above with '+')."
        echo "Fix the LaTeX and run ./publish.sh again.  Details: build/latexml.log"
        exit 1
    fi
    if ! grep -qE "FAIL: (new math-parse failures|manifest structure changed)" "$CHECK_OUT"; then
        echo
        echo "ABORTING: the build itself failed (see output above)."
        echo "Common causes: a preamble edit tripped the fail-closed pre-processor"
        echo "(it prints exactly what to update), or latexml crashed."
        exit 1
    fi
    # Only warning diffs and/or structural diffs remain — the edit's receipt.
    echo
    echo "===== your edit's receipt ====="
    echo "The diffs above (math-parse warnings and/or manifest structure) describe"
    echo "what your edit changed.  If that matches your intent, accept to continue."
    if [ "$YES" -eq 1 ]; then
        echo "(--yes: accepting)"
    else
        read -r -p "Accept and publish? [y/N] " ANSWER
        case "$ANSWER" in
            y|Y|yes|YES) ;;
            *) echo "Not accepted — nothing committed. (Your edits are untouched.)"; exit 1 ;;
        esac
    fi
    bash pipeline/check.sh --accept-current
    BASELINES_TOUCHED=1
fi

# --- commit + push -----------------------------------------------------------
echo
echo "===== committing ====="
git add textbook_source/
if [ "$BASELINES_TOUCHED" -eq 1 ]; then
    git add pipeline/error-baseline.txt pipeline/warning-baseline.txt pipeline/manifest-snapshot.json
fi

# safety: never let a secret ride along
if git diff --cached --name-only | grep -qx ".env"; then
    echo "ABORTING: .env is staged — this must never be committed." >&2
    exit 1
fi

if [ -z "$MSG" ]; then
    DEFAULT_MSG="textbook: content update (built and gated)"
    if [ "$YES" -eq 1 ]; then
        MSG="$DEFAULT_MSG"
    else
        read -r -p "Commit message [$DEFAULT_MSG]: " MSG
        MSG="${MSG:-$DEFAULT_MSG}"
    fi
fi
SUMMARY=$(grep '^manifest: ' "$CHECK_OUT" | tail -1 || true)
git commit -m "$MSG" -m "Published via publish.sh. ${SUMMARY}"

echo
echo "===== pushing ====="
git push origin main

# --- deploy hook (future) ----------------------------------------------------
# When real hosting lands (spec Q7), server deployment goes here (or in CI on
# push).  Today, publishing = the artifacts are rebuilt locally and the source
# of truth is on GitHub.
if [ -x deploy/hook.sh ]; then
    echo; echo "===== running deploy hook ====="
    ./deploy/hook.sh
fi

echo
echo "Published: $(git log --oneline -1)"
