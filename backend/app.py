"""Minimal Flask app that serves the textbook content manifest.

Proves that build/manifest.json (produced by the build pipeline) is usable:
lets the author pick a section in a browser and see its blocks.

Run with:  python app.py   (see README.md for setup)
"""
import json
from pathlib import Path

from flask import Flask, jsonify, abort, Response

# Resolve paths relative to the repo root (this file lives in backend/,
# so the repo root is one directory up) so the app runs from anywhere.
REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "build" / "manifest.json"
BOOK_HTML_PATH = REPO_ROOT / "build" / "book.html"

app = Flask(__name__)


def load_manifest():
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(
            f"Manifest not found at {MANIFEST_PATH}. "
            "Run the build pipeline to generate build/manifest.json first."
        )
    with MANIFEST_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


try:
    MANIFEST = load_manifest()
except FileNotFoundError as exc:
    # Fail loudly and clearly at startup rather than a confusing 500 later.
    raise SystemExit(str(exc))

# Index blocks by section_id for fast lookup by /api/section/<section_id>.
BLOCKS_BY_SECTION = {}
for block in MANIFEST.get("blocks", []):
    BLOCKS_BY_SECTION.setdefault(block["section_id"], []).append(block)


@app.get("/api/sections")
def api_sections():
    return jsonify(MANIFEST.get("sections", []))


@app.get("/api/section/<section_id>")
def api_section(section_id):
    blocks = BLOCKS_BY_SECTION.get(section_id)
    if not blocks:
        abort(404, description=f"No blocks found for section_id '{section_id}'")
    return jsonify(blocks)


@app.get("/api/manifest")
def api_manifest():
    return jsonify(MANIFEST)


@app.get("/book")
def book():
    if not BOOK_HTML_PATH.exists():
        abort(404, description=f"Rendered book not found at {BOOK_HTML_PATH}")
    return Response(
        BOOK_HTML_PATH.read_text(encoding="utf-8"), mimetype="text/html"
    )


INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Textbook manifest viewer</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; display: flex; height: 100vh; }
  #sections { width: 320px; overflow-y: auto; border-right: 1px solid #ccc; padding: 0.5rem; box-sizing: border-box; }
  #sections h2 { font-size: 1rem; margin: 0.25rem 0; }
  #sections ul { list-style: none; padding: 0; margin: 0; }
  #sections li { padding: 0.25rem 0.4rem; cursor: pointer; border-radius: 4px; }
  #sections li:hover { background: #eef; }
  #sections li.active { background: #dde; font-weight: bold; }
  .lvl-1 { font-weight: bold; }
  .lvl-2 { padding-left: 1rem; }
  .lvl-3 { padding-left: 2rem; font-size: 0.9em; color: #444; }
  #main { flex: 1; overflow-y: auto; padding: 1rem 1.5rem; }
  .block { border: 1px solid #ddd; border-radius: 6px; padding: 0.6rem 0.9rem; margin-bottom: 0.7rem; }
  .badge { display: inline-block; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.03em;
           background: #333; color: #fff; padding: 0.1rem 0.5rem; border-radius: 10px; margin-bottom: 0.4rem; }
  .preview { white-space: pre-wrap; color: #222; }
  #status { color: #666; }
  a.book-link { font-size: 0.85em; }
</style>
</head>
<body>
<div id="sections">
  <h2>Sections</h2>
  <div id="status">Loading...</div>
  <ul id="section-list"></ul>
</div>
<div id="main">
  <p>Pick a section on the left to see its blocks.
     &nbsp;<a class="book-link" href="/book" target="_blank">Open full rendered book &rarr;</a></p>
</div>
<script>
async function loadSections() {
  const res = await fetch('/api/sections');
  const sections = await res.json();
  document.getElementById('status').textContent = sections.length + ' sections';
  const list = document.getElementById('section-list');
  sections.forEach(function (s) {
    const li = document.createElement('li');
    li.className = 'lvl-' + s.level;
    li.textContent = s.id + '  ' + s.title;
    li.dataset.id = s.id;
    li.addEventListener('click', function () { selectSection(s.id, li); });
    list.appendChild(li);
  });
}

async function selectSection(sectionId, liEl) {
  document.querySelectorAll('#section-list li').forEach(function (el) {
    el.classList.remove('active');
  });
  if (liEl) liEl.classList.add('active');

  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading section ' + sectionId + '...</p>';

  const res = await fetch('/api/section/' + encodeURIComponent(sectionId));
  if (!res.ok) {
    main.innerHTML = '<p>No blocks found for section ' + sectionId + '.</p>';
    return;
  }
  const blocks = await res.json();
  main.innerHTML = '<h1>Section ' + sectionId + '</h1>';
  blocks.forEach(function (b) {
    const div = document.createElement('div');
    div.className = 'block';
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = b.block_type;
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = b.text_preview;
    div.appendChild(badge);
    div.appendChild(preview);
    main.appendChild(div);
  });
}

loadSections();
</script>
</body>
</html>
"""


@app.get("/")
def index():
    return Response(INDEX_HTML, mimetype="text/html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
