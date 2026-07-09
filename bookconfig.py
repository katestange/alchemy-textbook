"""Shared loader for book.toml — the per-book configuration.

Used by the pipeline scripts (pipeline/*.py, which insert the repo root on
sys.path) and the backend (backend/app.py). Values are validated and merged
over defaults so a partially filled book.toml still yields a complete config;
a missing book.toml is a hard error with a pointer to the template.
"""
import re
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = REPO_ROOT / "book.toml"

DEFAULTS = {
    "book": {
        "slug": "book",
        "title": "Interactive Textbook",
        "subject": "mathematics",
        "voice": "Write in the voice of the textbook provided: match its "
                 "tone, notation, and explanatory habits.",
    },
    "source": {
        "tex": "",
        "images": "textbook_source",
        "split_at": "section",
    },
    "environments": {
        "solutions": [],
        "questions": [],
    },
    "invites": {
        "code_prefix": "BOOK",
    },
    "frontend": {
        "desmos_api_key": "",
    },
}

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

_cached: dict | None = None


def load(path: Path = CONFIG_PATH) -> dict:
    """Load, validate, and cache the book configuration."""
    global _cached
    if _cached is not None and path == CONFIG_PATH:
        return _cached

    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Every deployment needs a book.toml describing "
            f"its textbook — copy the template from the repo and edit it.")
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    cfg = {}
    for section, defaults in DEFAULTS.items():
        got = raw.get(section, {})
        if not isinstance(got, dict):
            raise ValueError(f"book.toml: [{section}] must be a table")
        cfg[section] = {**defaults, **got}
        unknown = set(got) - set(defaults)
        if unknown:
            raise ValueError(
                f"book.toml: unknown key(s) in [{section}]: "
                f"{', '.join(sorted(unknown))}")

    errors = []
    if not cfg["book"]["title"].strip():
        errors.append("[book] title must not be empty")
    if not _SLUG_RE.match(cfg["book"]["slug"]):
        errors.append("[book] slug must be lowercase letters/digits/hyphens")
    if not cfg["source"]["tex"]:
        errors.append("[source] tex must point at your main .tex file")
    if not re.match(r"^[A-Za-z0-9]+$", cfg["invites"]["code_prefix"]):
        errors.append("[invites] code_prefix must be letters/digits only")
    for key in ("solutions", "questions"):
        vals = cfg["environments"][key]
        if not isinstance(vals, list) or not all(
                isinstance(v, str) and re.match(r"^\w+$", v) for v in vals):
            errors.append(f"[environments] {key} must be a list of "
                          f"environment names (letters/digits/_)")
    if errors:
        raise ValueError("book.toml is invalid:\n  - " + "\n  - ".join(errors))

    if path == CONFIG_PATH:
        _cached = cfg
    return cfg


if __name__ == "__main__":
    # `python3 bookconfig.py [dotted.key]` — validate, or print one value
    # (used by shell scripts, e.g. build.sh reading source.images).
    try:
        cfg = load()
    except (FileNotFoundError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
    if len(sys.argv) > 1:
        node = cfg
        for part in sys.argv[1].split("."):
            node = node[part]
        print(node if not isinstance(node, list) else " ".join(node))
    else:
        print("book.toml OK: "
              f"\"{cfg['book']['title']}\" (slug {cfg['book']['slug']}, "
              f"source {cfg['source']['tex']})")
