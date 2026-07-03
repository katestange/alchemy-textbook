#!/usr/bin/env bash
# pipeline/check.sh — regression gate for LaTeXML build errors, warnings, and
# manifest structure.
#
# Runs the build, extracts a normalized set of LaTeXML error "signatures"
# from build/latexml.log, and diffs them against the accepted baseline in
# pipeline/error-baseline.txt. Any signature present now but not in the
# baseline is a NEW error (regression) and causes a non-zero exit, so this
# script can be used as a CI gate (spec Q8 GitHub Actions build).
#
# The same treatment applies to `Warning:not_parsed` lines (math the
# MathParser failed to parse) against pipeline/warning-baseline.txt: a new
# math-parse failure is a regression and fails the check; a resolved one is
# reported but does not fail.
#
# After the error/warning gates, pipeline/snapshot.py --check diffs the
# manifest's structural fingerprint (block counts by type, per chapter)
# against pipeline/manifest-snapshot.json. This is the gate that catches a
# *silent* regression -- one that produces no LaTeXML error/warning at all
# but still merges, splits, or drops content blocks (e.g. the \small
# font-leak bug that motivated this).
#
# Usage:
#   pipeline/check.sh                    build, diff vs baselines/snapshot, gate on NEW
#   pipeline/check.sh --update-baseline  build, then overwrite error baseline,
#                                         warning baseline, and manifest snapshot
#                                         with the current state (use after an
#                                         intentional change so the new state
#                                         becomes the accepted baseline)
#   pipeline/check.sh --accept-current   like --update-baseline but WITHOUT
#                                         rebuilding: accept the artifacts of the
#                                         build that just ran (used by publish.sh
#                                         after showing the author the diff)
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="pipeline/error-baseline.txt"
WARNING_BASELINE="pipeline/warning-baseline.txt"
LOG="build/latexml.log"
MANIFEST="build/manifest.json"

# --- shared normalization -------------------------------------------------
# Turn raw LaTeXML "Error:" lines into stable signatures that survive line
# number shifts:
#   - keep only lines starting with "Error:"
#   - strip the trailing location clause, e.g.
#       " at book-clean.tex; line 763 col 0"
#       " at String; line 3 col 0"
#   - collapse any other embedded "line N" / "col N" references that might
#     appear inside the message body itself
#   - sort unique
# This function MUST be used both to regenerate pipeline/error-baseline.txt
# (via --update-baseline) and to compute the current signatures, so the two
# sides of the diff are always produced the same way.
normalize_errors() {
    local logfile="$1"
    { grep '^Error:' "$logfile" || true; } \
        | sed -E 's/ at [^;]+; line [0-9]+ col [0-9]+.*$//' \
        | sed -E 's/\bline [0-9]+/line N/g; s/\bcol [0-9]+/col N/g' \
        | sort -u
}

# Same normalization, for "Warning:not_parsed" lines (MathParser failures).
# These don't carry the same " at FILE; line N col N" trailing clause shape
# as errors necessarily, but line/col numbers do appear inline, e.g.:
#   Warning:not_parsed:UNKNOWN>RELOP MathParser failed to match rule
#   'Anything' at book-clean.tex; line 1760 col 571
# so the same stripping applies.
normalize_warnings() {
    local logfile="$1"
    { grep '^Warning:not_parsed' "$logfile" || true; } \
        | sed -E 's/ at [^;]+; line [0-9]+ col [0-9]+.*$//' \
        | sed -E 's/\bline [0-9]+/line N/g; s/\bcol [0-9]+/col N/g' \
        | sort -u
}

UPDATE_BASELINE=0
SKIP_BUILD=0
if [ "${1:-}" = "--update-baseline" ]; then
    UPDATE_BASELINE=1
elif [ "${1:-}" = "--accept-current" ]; then
    UPDATE_BASELINE=1
    SKIP_BUILD=1
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
    echo "===== running build ====="
    bash pipeline/build.sh
else
    echo "===== accepting current build artifacts (no rebuild) ====="
    [ -f "$LOG" ] && [ -f "$MANIFEST" ] || {
        echo "FATAL: no current build to accept ($LOG / $MANIFEST missing) — run pipeline/check.sh first" >&2
        exit 1
    }
fi

[ -f "$LOG" ] || { echo "FATAL: $LOG not found after build" >&2; exit 1; }

CURRENT="$(mktemp)"
CURRENT_WARN="$(mktemp)"
trap 'rm -f "$CURRENT" "$CURRENT_WARN"' EXIT
normalize_errors "$LOG" > "$CURRENT"
normalize_warnings "$LOG" > "$CURRENT_WARN"

if [ "$UPDATE_BASELINE" -eq 1 ]; then
    cp "$CURRENT" "$BASELINE"
    cp "$CURRENT_WARN" "$WARNING_BASELINE"
    echo
    echo "Baseline updated: $(wc -l < "$BASELINE" | tr -d ' ') error signatures written to $BASELINE"
    echo "Baseline updated: $(wc -l < "$WARNING_BASELINE" | tr -d ' ') warning signatures written to $WARNING_BASELINE"
    echo
    echo "===== regenerating manifest snapshot ====="
    python3 pipeline/snapshot.py --write
    exit 0
fi

[ -f "$BASELINE" ] || {
    echo "FATAL: $BASELINE not found. Run 'pipeline/check.sh --update-baseline' first." >&2
    exit 1
}
[ -f "$WARNING_BASELINE" ] || {
    echo "FATAL: $WARNING_BASELINE not found. Run 'pipeline/check.sh --update-baseline' first." >&2
    exit 1
}

NEW="$(comm -13 "$BASELINE" "$CURRENT")"
RESOLVED="$(comm -23 "$BASELINE" "$CURRENT")"
NEW_WARN="$(comm -13 "$WARNING_BASELINE" "$CURRENT_WARN")"
RESOLVED_WARN="$(comm -23 "$WARNING_BASELINE" "$CURRENT_WARN")"

echo
echo "===== error diff vs baseline ====="
if [ -n "$NEW" ]; then
    echo "NEW errors (regressions):"
    echo "$NEW" | sed 's/^/  + /'
else
    echo "NEW errors (regressions): none"
fi

if [ -n "$RESOLVED" ]; then
    echo "RESOLVED errors (fixed since baseline):"
    echo "$RESOLVED" | sed 's/^/  - /'
else
    echo "RESOLVED errors: none"
fi

echo
echo "===== not_parsed warning diff vs baseline ====="
if [ -n "$NEW_WARN" ]; then
    echo "NEW math-parse failures (regressions):"
    echo "$NEW_WARN" | sed 's/^/  + /'
else
    echo "NEW math-parse failures (regressions): none"
fi

if [ -n "$RESOLVED_WARN" ]; then
    echo "RESOLVED math-parse failures (fixed since baseline):"
    echo "$RESOLVED_WARN" | sed 's/^/  - /'
else
    echo "RESOLVED math-parse failures: none"
fi

echo
echo "===== manifest summary ====="
if [ -f "$MANIFEST" ]; then
    python3 - "$MANIFEST" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
b = d.get("build", {})
blocks = d.get("blocks", [])
from collections import Counter
counts = Counter(blk.get("block_type", "?") for blk in blocks)
breakdown = ", ".join(f"{k}={v}" for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
block_count = b.get("block_count", len(blocks))
section_count = b.get("section_count", len(d.get("sections", [])))
print(f"manifest: blocks={block_count} sections={section_count} | types: {breakdown}")
PYEOF
else
    echo "manifest: $MANIFEST not found"
fi

echo
SNAPSHOT_RC=0
python3 pipeline/snapshot.py --check || SNAPSHOT_RC=$?

FAIL=0
if [ -n "$NEW" ]; then
    FAIL=1
fi
if [ -n "$NEW_WARN" ]; then
    FAIL=1
fi
if [ "$SNAPSHOT_RC" -ne 0 ]; then
    FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
    echo
    if [ -n "$NEW" ]; then
        echo "FAIL: new LaTeXML errors introduced (see NEW list above)." >&2
    fi
    if [ -n "$NEW_WARN" ]; then
        echo "FAIL: new math-parse failures introduced (see NEW list above)." >&2
    fi
    if [ "$SNAPSHOT_RC" -ne 0 ]; then
        echo "FAIL: manifest structure changed vs pipeline/manifest-snapshot.json (see diff above)." >&2
    fi
    exit 1
fi

echo
echo "OK: no new LaTeXML errors, no new math-parse failures, manifest structure unchanged."
