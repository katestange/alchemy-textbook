# Backend — FastAPI vertical slice

The real backend (spec Q2, Decision 54): serves the built frontend, the
chapter-split textbook, the content manifest, and `/api/generate` — a
streaming SSE proxy to the Anthropic API implementing the shared-prefix cache
discipline (Decision 52), instructor/student two-ledger accounting (53),
moderate-everything cache writes (47/48), and stale-tab protection (60).

## Run

```bash
# one-time deps (venv already exists):
backend/.venv/bin/pip install -r backend/requirements.txt

# start (from the repo root; reads ANTHROPIC_API_KEY from /workspace/.env):
backend/.venv/bin/uvicorn app:app --app-dir backend --port 8000
```

Then browse **http://localhost:8000/** — if `frontend/dist/` exists (built via
`cd frontend && npm run build`), the reader app is served there. Dev invite
code: `DEV-TEST-1` ($5.00 budget) — seeded on first startup **only when
`TEXTBOOK_SEED_DEV_CODE=1`** (never set in production; see `.env.example`
for this and the other deployment env vars: `TEXTBOOK_HOST`, `TEXTBOOK_PORT`,
`TEXTBOOK_COOKIE_SECURE`, `TEXTBOOK_BUILD_DIR`, `TEXTBOOK_DB`).

Book identity (title, tutor subject/voice, invite-code prefix) comes from the
repo's `book.toml` — the backend formats it into the system prompt at startup
and serves it to the frontend at `/api/book`.

## Endpoints

| Route | What |
|---|---|
| `GET /` | Built frontend (`frontend/dist`), if present |
| `GET /api/book` | Book identity from `book.toml`: title, slug, invite-code example, Desmos key, plus the instructor's `creature_art` choice (Decision 85) |
| `GET /api/manifest` | Content manifest + `build_version` |
| `GET /api/chapters` | Chapter number → HTML file map |
| `GET /chapter/{n}` | Chapter reader HTML (whatever `build/chapters.json` lists); hidden solutions stripped server-side per the per-solution visibility settings (Decision 77) |
| `GET /x{name}` | Chapter figures (LaTeXML's bare `x3.jpg`/`x12.png`), served from `build/` (Decision 71) |
| `GET /book` | Single-file book |
| `POST /api/claim` | Invite code → HttpOnly SameSite=Lax session cookie (per-IP throttled, Decision 82) |
| `GET /api/whoami` | Session check (reload survival) + remaining budget + `is_admin` |
| `GET /api/content/{hash}` | Cached artifacts visible to the caller (approved ∪ own-unreviewed) |
| `GET /api/chapter-content/{n}` | All artifacts visible to the caller anchored anywhere in chapter `n` (one request per chapter view) |
| `POST /api/generate` | SSE: `delta` events, then `done` (cost, remaining budget, usage, any eureka/question captures) or `error` (see codes below) |
| `POST /api/flag` | Signed-in flag of an AI artifact or base-textbook passage (category + optional comment) → `/admin/flags` (Decision 79) |
| `DELETE /api/content/{id}` | Delete-forever; creator (own) or instructor (anyone) only, else 403 (Decision 76) |
| `GET /admin` | Instructor dashboard (see below) |

`/api/generate` error codes: `auth_required`, `rate_limited` (burst throttle,
Decision 82), `refresh_required` (stale tab, Decision 60), `budget_exceeded`,
`unknown_block`, `invalid_scope`, `invalid_messages`, `conversation_too_long`,
`upstream_error`.

## Instructor dashboard (`/admin`)

Server-rendered (Jinja2, `backend/templates/admin/`, code in
`backend/admin.py`), keyboard-first, no CDN assets. Implements Decisions 42
(admin password), 48 (moderate everything), 53 (two ledgers), 57 (lockout),
60 (orphan re-anchor, never automatic).

**Setup:** add `ADMIN_PASSWORD=...` to `/workspace/.env` and (re)start the
server. On startup, if the `admin` table is **empty** and `ADMIN_PASSWORD` is
set, the password is seeded — stored as a stdlib `hashlib.scrypt` hash
(memory-hard like argon2, zero extra dependencies). The env var is only read
for that one-time seed; to change the password, delete the `admin` table row
and restart with the new value. Login mints a separate HttpOnly SameSite=Lax
`admin_session` cookie (path `/`, so the admin session also reaches `/api` for
instructor-level deletes — widened from `/admin` in Decision 76), distinct from
student `session` cookies. After 5 consecutive wrong passwords, login refuses attempts for 15
minutes (counter and lock timestamp persist in the `admin` table across
restarts).

**Screens** (all guarded by the admin session):

- `/admin/review` — unreviewed + flagged artifacts, newest first, with the
  anchor block's section + preview (orphaned anchors degrade gracefully and
  point to the orphans queue), the selection, flag comments, and the full
  response. Keys: `j`/`k` move, `a` approve, `r` remove, `e` edit, `Esc`
  closes the editor. Edit can save (stays unreviewed) or save + approve in
  one step.
- `/admin/orphans` — artifacts whose `content_hash` is missing from the
  current build's manifest, each with the top-3 candidate blocks by fuzzy
  similarity (difflib `SequenceMatcher` ratio of the stored selection —
  padded with response text when the selection is short — against full
  block text, `real_quick_ratio`/`quick_ratio` pre-screened; exact
  containment of the selection scores 1.0). Keys: `j`/`k` move, `1`/`2`/`3`
  re-anchor to that candidate, `x` delete. Nothing is ever re-anchored
  automatically (Decision 60).
- `/admin/codes` — generate batches (`CRYPTO-XXXX-XX`, crypto-random from an
  unambiguous alphabet), top up, revoke (revoking also deletes the code's
  sessions). Budgets shown in dollars, stored in microdollars.
- `/admin/stats` — the two-audience dashboard (Decision 84): headline "pitch"
  tiles (spend, per-active-student cost, cache leverage — surfacings per paid
  generation, library size, chapter views) plus teaching signals (ToC usage
  tree to subsection depth, top help-request sections with creature mix,
  per-creature table, 14-day activity, most-surfaced artifacts). All
  pseudonymous — no per-student drill-down.
- `/admin/usage` — totals per ledger (student vs instructor), per creature
  type, per top-level chapter, plus the 50 most recent `usage_log` rows.
- `/admin/flags` — student-reported problems (suspect base-textbook passages
  and bad AI content), categorized (`incorrect` / `inappropriate` /
  `text-error`) with optional comments; resolve-only (Decision 79).
- `/admin/solutions` — per-solution visibility tree (book / section /
  subsection / individual item), with bulk master actions and a book-wide
  default (Decision 77).
- `/admin/settings` — book-wide appearance choices (Decision 85): creature
  style, illustrated creature art vs. the classic colored chips (quiet
  mode). Served to the reader as `creature_art` in `GET /api/book`.

## Data

SQLite at `backend/textbook.db` (git-ignored; override with `TEXTBOOK_DB`).
Schema: invite_codes / sessions / cached_content (incl. `served_count` — times
an artifact was surfaced at selection, Decision 84) / content_flags
(categorized, Decision 79) / usage_log (student+instructor ledgers,
microdollars; plus per-request `model`, token breakdown, and `ephemeral` flag,
Decision 84) / **chapter_views** (day × chapter × signed-in/anon view tallies,
no identity, Decision 84) / content_manifest / admin / **settings** (key–value,
e.g. `solutions_default`) / **solution_overrides** (per-solution visibility,
Decision 77). The manifest table resyncs from `build/manifest.json` at
startup.

## Notes

- The v1 creature prompts live at the top of `app.py`, marked for iteration
  (known issue: Haiku sometimes still emits a markdown heading).
- Prices and cache multipliers are constants in `app.py`; re-check against
  Anthropic list prices before launch (spec Q14).
