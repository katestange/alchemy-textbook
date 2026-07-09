# Adaptability: running this system on *other* LaTeX textbooks

Goal: a professor in the department drops in their own LaTeX textbook and
gets the full interactive reader — with onboarding that a single
tech-comfortable person can do in an afternoon, and day-to-day use
(publish.sh + the /admin dashboard) that any professor can manage alone.

**Status (2026-07-09).** A full three-layer audit (pipeline / backend /
frontend) found the core machinery — manifest + content-hash anchoring,
chapter navigation, caching, review queue, creature prompts — genuinely
book-agnostic. The book-specific coupling was concentrated and has been
partly extracted:

**Done** (see `book.toml`, `adopt-book.sh`, `deploy/`):
- `book.toml` config layer: title/subject/voice (AI prompts), slug
  (browser-storage namespace), source .tex path, images path, split level,
  solution/question environment names, invite-code prefix, Desmos API key.
  Served to the frontend via `GET /api/book`; no branding in the bundle.
- Baseline regeneration: `adopt-book.sh` (toolchain check → build → accept
  error/warning/manifest baselines → frontend build → handoff checklist).
  The stale hardcoded block count in `tests/test_postprocess.py` is gone.
- Deployment: `deploy/` (Dockerfile, one-service-per-book compose, nginx
  TLS template, ops doc). `TEXTBOOK_HOST/PORT/BUILD_DIR/COOKIE_SECURE` env
  vars; session + admin cookies take a Secure flag; `DEV-TEST-1` seeding is
  gated behind `TEXTBOOK_SEED_DEV_CODE=1`.

**The one-instance-per-book decision.** Multi-tenancy (several books in one
process/DB with per-course admins) was considered and rejected: the schema
has no tenant column, admin auth is a single password, and the payoff is
low on a department server. One container per book keeps billing, budgets,
moderation, and failure isolation per professor for free. Revisit only if
the deployment target becomes "dozens of books on managed hosting."

The rest of this file is the plan for what remains, in priority order.
Effort scale: S (≤half a day), M (1–3 days), L (a week+, open-ended).

---

## Phase 1 — Preprocessor generalization (L) — THE blocker

`pipeline/preprocess.py` is the one place a new book still fails outright.
Its `SUBSTITUTIONS` table drops/shims the exact expl3-pulling packages of
*this* book (`tcolorbox[theorems,skins]`, `nicematrix`/`NiceTabular`), with
fail-closed exact-match counts. A different preamble (a) trips the counts
and aborts even when the shims are irrelevant, and (b) leaves its *own*
problem packages unshimmed, which is the LaTeXML-hangs-10-minutes failure
the table exists to prevent.

Plan:
1. **Move the shim table into `book.toml`** (`[[preprocess.drop]]` /
   `[[preprocess.shim]]` entries: package pattern, expected count,
   replacement commands). `preprocess.py` becomes a generic engine; the
   current table becomes this book's config. (M — do this first, it makes
   every later shim a config edit, not a code edit.)
2. **Known-troublemaker catalog.** Ship a default list of packages known to
   hang/break LaTeXML 0.8.7 (expl3-heavy: tcolorbox, nicematrix, tabularray,
   pgfplots-current, …). At preprocess time, *scan* the new book's preamble:
   anything on the list without a configured shim → fail with a message
   naming the package and pointing at the catalog entry's suggested shim.
   Turns "hangs mysteriously" into "add these 3 lines to book.toml". (M)
3. **Multi-file books** (`\input`/`\include`): resolve includes into the
   build copy before shimming (LaTeXML would follow them, but the shim
   engine and line-count reporting must see the whole preamble; content
   files matter for the fail-closed counts). Most colleagues' books are
   multi-file — this is required for real adoption. (M)
4. **Timeout tripwire**: run latexml with the existing 600s timeout but
   detect the hang case and report "a preamble package likely needs a
   shim — see the catalog", instead of a bare timeout. (S)

Acceptance: a *second real textbook from a colleague* builds end-to-end
with only book.toml edits. Acquire one early and let its actual variance
drive the catalog — don't build speculative shims.

## Phase 2 — Structural generality: book-class, appendices, bibliography (L)

Current model: article class, top-level `\section` = reader "chapter",
3-level dotted numeric IDs; `chapter = section_id.split(".")[0]` in
`pipeline/solutions.py`, `pipeline/snapshot.py`, `backend/app.py` (chapter
text assembly, usage aggregation), `backend/admin.py` (natural sort).

1. **`split_at = "chapter"`** for `\documentclass{book}`: shift
   `postprocess.py`'s `HEADINGS` map by one level (chapter/section/
   subsection), pass `--splitat=chapter` (already plumbed from book.toml;
   currently refused), and teach `split_fixup.py` to accept `Ch*.html`-style
   split names. The frontend's chapter-link regex
   (`ReadingPane.svelte`, `S(\d+)|book\.html`) must learn the same naming. (M)
2. **Non-numeric chapter keys** (lettered appendices via `\appendix`):
   make chapter keys opaque strings ordered by document position, not
   integers — touches `chapters.json` consumers, `_natural_key` sorting,
   and the snapshot's per-chapter buckets. (M)
3. **Bibliography** (`\bibliography`/BibTeX): add a `latexmlpost
   --bibliography` pass and treat the references page as a non-chapter
   page. Most textbooks have one; today it's silently absent. (M)
4. **Index/glossary** (`\printindex`): lower priority; likely "render as a
   final chapter page" is enough. (S–M, after 3)

Acceptance: a book-class text with two appendices and a BibTeX bibliography
renders with correct navigation, solutions tree, and usage-by-chapter.

## Phase 3 — Per-book content data out of frontend source (M)

- **Built-in applets** (`frontend/src/lib/builtinApplets.js`): five demos
  hardwired to this book's section IDs (stale anchors skip silently, so a
  new book just gets none). Move to `build/` or DB-served JSON
  (`GET /api/builtin-applets`), authored per book — editable without
  touching frontend source; `/admin` could eventually own it. The
  `replaceFigure` case assumes the anchor is a figure — validate at load.
- **Creature prompt overrides**: `CREATURE_INSTRUCTIONS` +
  `MODEL_BY_CREATURE` as optional `book.toml` overrides
  (`[creatures.applet] model=..., instructions=...`) — the applet
  prompt's example domains (elliptic curves, lattices…) are the main
  subject-specific text left; and the tool list itself (Sage vs. e.g.
  Jupyter-lite) is a per-book choice.
- **Model prices** (`PRICES` in `backend/app.py`): move to config with a
  startup staleness warning (semester-boundary check is currently a
  README note).

## Phase 4 — Hosting polish (S–M each)

- **Same-origin CSP**: the reader claims a no-third-party-origins posture
  (self-hosted fonts) but injects sagecell/desmos/geogebra scripts at
  runtime. Decide and document: recommended CSP header for nginx that
  allowlists exactly those three (script/frame/connect), so campuses that
  enforce CSP don't silently lose applets. (Decision 69 already flags this.)
- **Admin sessions to SQLite**: today in-process (restart = instructor
  logout; multi-worker unsupported). Move to a table like student sessions.
- **`GET /healthz`** for container health checks + a compose `healthcheck`.
- **Backend test suite**: there are none (pipeline tests only). Priorities:
  auth/cookie flags, budget ledger math, solution stripping, /api/book,
  admin lockout. A second book's CI needs these to trust upgrades.
- **Upstream sync story**: adopted books are forks of this repo. Document
  a `git remote add upstream` + merge flow so a professor's checkout can
  take platform fixes without clobbering their book.toml/source. (S, doc)

## Phase 5 — True self-serve onboarding (L, aspirational)

Once Phases 1–2 hold for 2–3 real books: a `/admin/setup` wizard (upload
.tex, fill the book.toml form, watch the build log, accept baselines) so
onboarding no longer needs a terminal at all. Not worth building until the
shim catalog has absorbed a few real preambles.

---

### Known limitations to state honestly to adopters (today)

- Single-file article-class LaTeX only; `\section` = chapter; no
  bibliography/index/appendix support yet (Phases 1–2).
- A preamble with expl3-heavy packages needs hand-written shims in
  `pipeline/preprocess.py` (Phase 1 moves this to config).
- Built-in (pre-authored) applets are crypto-book content; new books start
  with AI-generated applets only (Phase 3).
- Desmos ships with the public demo key unless `book.toml` provides a
  licensed one; SageCell/GeoGebra depend on free public services with no
  SLA.
- One uvicorn worker per book; instructor logins don't survive restarts.
