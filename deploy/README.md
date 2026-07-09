# Deploying on a department server

This directory is the production story for hosting one or more interactive
textbooks. The model is deliberately **one instance per book**: each book is
its own repo checkout, Docker image, database, Anthropic API key (billing!),
and admin password. Nothing is shared between books, so one professor can
never affect another's budget, students, or content. nginx sits in front,
giving each book its own HTTPS subdomain.

```
crypto.math.example.edu   ──►  nginx (TLS)  ──►  127.0.0.1:8001  crypto container ── crypto-data volume
analysis.math.example.edu ──►      "        ──►  127.0.0.1:8002  analysis container ── analysis-data volume
```

## Prerequisites (server, once)

- Docker + the compose plugin, nginx, certbot.
- A DNS subdomain per book pointing at the server.

## Onboarding a book (per book, ~an hour, done by one tech-comfortable person)

1. **Get the professor's book building.** Clone this repo (or fork it) into
   its own directory, drop their `.tex` + images into `textbook_source/`,
   edit **`book.toml`** (title, subject, voice, slug, source path, invite
   prefix, solution/question environment names), then run **`./adopt-book.sh`**.
   It checks the toolchain, builds the book, and accepts the new pipeline
   baselines. If the build fails at the pre-process step, that book's LaTeX
   preamble needs shims — see `ADAPTABILITY.md` (this is the one step that
   can require real LaTeX/pipeline knowledge).
2. **Secrets.** `cp .env.example .env`; set that professor's
   `ANTHROPIC_API_KEY` (their own key — it funds their students' AI usage)
   and an `ADMIN_PASSWORD`. Do this on the server; never commit `.env`.
3. **Container.** Add a service block for the book in
   `deploy/docker-compose.yml` (copy the template block: new name, that
   checkout as build context, its `.env`, a fresh volume, the next
   localhost port), then `docker compose up -d --build`.
4. **nginx.** Add the matching server block from `nginx.conf.example`
   (new subdomain → that localhost port), run
   `certbot --nginx -d <subdomain>`, reload nginx.
5. **Hand off to the professor.** They sign in at
   `https://<subdomain>/admin`, generate invite codes with budgets at
   `/admin/codes`, choose solution visibility at `/admin/solutions`, and
   they're running. Their day-to-day is the admin dashboard only.

## Updating a book's content

The professor edits their `.tex` and runs `./publish.sh` in the checkout
(it rebuilds, gates against the baselines, commits). Then rebuild the
container image and restart:

```sh
docker compose build crypto && docker compose up -d crypto
```

(The book is baked into the image at build time; students see the new build
after the restart. The database — codes, budgets, cached AI content — lives
on the volume and is untouched.)

## Operational notes

- **Backups**: each book's state is exactly one SQLite file on its volume
  (`/data/textbook.db`). `docker compose cp crypto:/data/textbook.db ...`
  on a cron is a complete backup.
- **Cookies are Secure-flagged** (`TEXTBOOK_COOKIE_SECURE=1` in the image):
  the app must be reached via HTTPS, which the nginx template enforces.
- **One uvicorn worker per book** (the default here). Do not add
  `--workers N`: admin sessions and rate-limit windows are in-process. A
  single worker comfortably serves a class; scale by CPU only if a book
  actually needs it (see ADAPTABILITY.md).
- **Restarting a container** logs the instructor out of `/admin` (student
  sessions survive — they're in SQLite).
- **Applets call third-party services** (sagecell.sagemath.org, desmos.com,
  geogebra.org) from the *student's browser*. If the campus network or a
  CSP blocks them, applets degrade to read-only code listings. For real
  course use, put a licensed (free for education) Desmos key in
  `book.toml` — the default is Desmos's demo key.
- **Costs**: all AI spend for a book lands on the `ANTHROPIC_API_KEY` in
  that book's `.env`. Budgets and per-code spending are visible at
  `/admin/usage`; model prices are pinned in `backend/app.py` (`PRICES`) —
  re-check against current Anthropic list prices each semester.
