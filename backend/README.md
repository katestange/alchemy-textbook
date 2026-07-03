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
code: `DEV-TEST-1` ($5.00 budget, seeded on first startup).

## Endpoints

| Route | What |
|---|---|
| `GET /` | Built frontend (`frontend/dist`), if present |
| `GET /api/manifest` | Content manifest + `build_version` |
| `GET /api/chapters` | Chapter number → HTML file map |
| `GET /chapter/{n}` | Chapter reader HTML (1–9) |
| `GET /book` | Single-file book |
| `POST /api/claim` | Invite code → HttpOnly SameSite=Lax session cookie |
| `GET /api/whoami` | Session check (reload survival) + remaining budget |
| `GET /api/content/{hash}` | Cached artifacts visible to the caller (approved ∪ own-unreviewed) |
| `POST /api/generate` | SSE: `delta` events, then `done` (cost, remaining budget, usage) or `error` (`refresh_required`, `budget_exceeded`, `auth_required`, `unknown_block`) |

## Data

SQLite at `backend/textbook.db` (git-ignored; override with `TEXTBOOK_DB`).
Full Q12 schema: invite_codes / sessions / cached_content / content_flags /
usage_log (student+instructor ledgers, microdollars) / content_manifest /
admin. The manifest table resyncs from `build/manifest.json` at startup.

## Notes

- The v1 creature prompts live at the top of `app.py`, marked for iteration
  (known issue: Haiku sometimes still emits a markdown heading).
- Prices and cache multipliers are constants in `app.py`; re-check against
  Anthropic list prices before launch (spec Q14).
