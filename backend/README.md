# Backend (minimal manifest viewer)

A tiny Flask app that proves `build/manifest.json` is usable: pick a
section in the browser and see its blocks (type badge + text preview).

This is intentionally minimal — no database, no auth, no frontend
framework/build step. It reads `build/manifest.json` (and, for the
bonus `/book` route, `build/book.html`) at startup. `build/` is treated
as read-only; nothing here modifies it.

## Run it

From the repo root (Debian/Ubuntu blocks global `pip`, so use a venv):

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
python backend/app.py
```

The app resolves `build/manifest.json` relative to its own file
location (one directory up from `backend/`), so it works regardless of
your current working directory when you run it.

It listens on **http://127.0.0.1:5000**.

## Endpoints

| Method | Path                       | Description                                              |
|--------|----------------------------|------------------------------------------------------------|
| GET    | `/`                        | Minimal HTML page: section list + click-to-view blocks   |
| GET    | `/api/sections`            | JSON list of all sections                                |
| GET    | `/api/section/<section_id>` | JSON list of blocks for that section (404 if none)       |
| GET    | `/api/manifest`            | The full manifest JSON (build summary + sections + blocks) |
| GET    | `/book`                    | The full rendered book (`build/book.html`)                |

## Notes

- If `build/manifest.json` is missing, the app exits at startup with a
  clear error message instead of failing on first request.
- Dependency-light by design: Flask only, standard library otherwise.
