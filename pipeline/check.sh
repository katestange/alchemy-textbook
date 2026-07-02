#!/usr/bin/env bash
# pipeline/check.sh — regression gate for LaTeXML build errors.
#
# Runs the build, extracts a normalized set of LaTeXML error "signatures"
# from build/latexml.log, and diffs them against the accepted baseline in
# pipeline/error-baseline.txt. Any signature present now but not in the
# baseline is a NEW error (regression) and causes a non-zero exit, so this
# script can be used as a CI gate (spec Q8 GitHub Actions build).
#
# Usage:
#   pipeline/check.sh                    build, diff vs baseline, gate on NEW errors
#   pipeline/check.sh --update-baseline  build, then overwrite the baseline with
#                                         the current signatures (use after an
#                                         intentional fix so the new state becomes
#                                         the accepted baseline)
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="pipeline/error-baseline.txt"
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

UPDATE_BASELINE=0
if [ "${1:-}" = "--update-baseline" ]; then
    UPDATE_BASELINE=1
fi

echo "===== running build ====="
bash pipeline/build.sh

[ -f "$LOG" ] || { echo "FATAL: $LOG not found after build" >&2; exit 1; }

CURRENT="$(mktemp)"
trap 'rm -f "$CURRENT"' EXIT
normalize_errors "$LOG" > "$CURRENT"

if [ "$UPDATE_BASELINE" -eq 1 ]; then
    cp "$CURRENT" "$BASELINE"
    echo
    echo "Baseline updated: $(wc -l < "$BASELINE" | tr -d ' ') signatures written to $BASELINE"
    exit 0
fi

[ -f "$BASELINE" ] || {
    echo "FATAL: $BASELINE not found. Run 'pipeline/check.sh --update-baseline' first." >&2
    exit 1
}

NEW="$(comm -13 "$BASELINE" "$CURRENT")"
RESOLVED="$(comm -23 "$BASELINE" "$CURRENT")"

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

if [ -n "$NEW" ]; then
    echo
    echo "FAIL: new LaTeXML errors introduced (see NEW list above)." >&2
    exit 1
fi

echo
echo "OK: no new LaTeXML errors vs baseline."
