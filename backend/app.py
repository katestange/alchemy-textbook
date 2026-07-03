"""FastAPI backend for the AI-augmented interactive textbook.

Serves the pipeline outputs in build/ (manifest, chapter HTML), handles
invite-code auth (Q5), the two-ledger cost model (Q14 / Decision 53), and
the SSE generation endpoint with shared-prefix prompt caching
(Q3 / Decisions 51, 52, 59).

Run with:
    backend/.venv/bin/uvicorn app:app --port 8000   (from backend/)
or  backend/.venv/bin/python backend/app.py
"""
import datetime
import hashlib
import json
import os
import secrets
import sqlite3
import threading
from pathlib import Path

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

# ---------------------------------------------------------------------------
# Paths and configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = REPO_ROOT / "build"
MANIFEST_PATH = BUILD_DIR / "manifest.json"
CHAPTERS_PATH = BUILD_DIR / "chapters.json"
BOOK_HTML_PATH = BUILD_DIR / "book.html"
DB_PATH = Path(os.environ.get("TEXTBOOK_DB", REPO_ROOT / "backend" / "textbook.db"))

# Load the instructor API key from /workspace/.env (never printed or logged).
load_dotenv(REPO_ROOT / ".env")

anthropic_client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env

SESSION_COOKIE = "session"
SESSION_LIFETIME_DAYS = 180  # "end of semester" (Decision 58 drops sessions then)

# v1 output cap: generous enough for one worked example, cheap enough to test.
# Tune per creature once real usage is measured (Q14 action item).
MAX_OUTPUT_TOKENS = 700

# ---------------------------------------------------------------------------
# Model selection and pricing (Q3 / Q14, Decision 53)
# ---------------------------------------------------------------------------

MODEL_BY_CREATURE = {
    "example": "claude-haiku-4-5",
    # justify / counterexample / intuition / applet / chat / quiz / fun /
    # summarize / eureka all default to Sonnet for now (Q3 table refines this).
}
DEFAULT_MODEL = "claude-sonnet-5"

# $ per MTok == microdollars per token, so these are microdollars/token.
PRICES = {
    "claude-haiku-4-5": {"in": 1.0, "out": 5.0},
    "claude-sonnet-5": {"in": 3.0, "out": 15.0},
}
CACHE_WRITE_MULT = 2.0   # 1-hour TTL cache write premium (Decision 53)
CACHE_READ_MULT = 0.1    # cache-read rate


def compute_ledgers(model: str, usage) -> tuple[int, int]:
    """Two-ledger accounting (Decision 53).

    Student ledger: priced *as if the cache were warm* -- the prefix portion
    (whether it was actually read from cache or written cold this request)
    at the 0.1x cache-read rate, plus fresh input and output at full rate.

    Instructor ledger: the cache-write premium whenever this request happened
    to (re)warm a cold prefix: cache_creation x (2.0 - 0.1) x input price.

    Returns (student_microdollars, instructor_microdollars) as ints.
    """
    p = PRICES[model]
    cache_read = usage.cache_read_input_tokens or 0
    cache_write = usage.cache_creation_input_tokens or 0
    fresh_in = usage.input_tokens or 0
    out = usage.output_tokens or 0

    student = (
        cache_read * CACHE_READ_MULT * p["in"]
        + cache_write * CACHE_READ_MULT * p["in"]  # as-if-warm
        + fresh_in * p["in"]
        + out * p["out"]
    )
    instructor = cache_write * (CACHE_WRITE_MULT - CACHE_READ_MULT) * p["in"]
    return round(student), round(instructor)


# ---------------------------------------------------------------------------
# Prompts (v1 -- clearly marked for iteration; see spec Q3 and Decision 59)
# ---------------------------------------------------------------------------

# V1 PROMPT -- iterate after quality testing with real chapters.
CORE_SYSTEM_PROMPT = """\
You are a mathematics tutor embedded in "The Alchemy of Mathematical \
Cryptography," an interactive textbook on coding theory and cryptography. \
Students select passages of the book and summon you for help understanding \
them. The full text of the chapter the student is reading, and the book's \
table of contents, are provided below.

Write in the voice of the textbook provided: match its tone, notation, and \
explanatory habits -- the conversational asides, the "out loud, we say..." \
readings, the concrete small-number examples before generality.

Output format: render all mathematics as LaTeX between $...$ (inline) or \
$$...$$ (display). Do not use any other math delimiters. Inside math, use \
only core LaTeX math commands (amsmath level) -- no package-specific commands \
such as \\ding, \\tikz, \\xymatrix, or color commands, because the math is \
rendered in the browser. Outside math, write plain prose: no markdown \
headings (#), no bullet lists unless genuinely enumerating, no bold-face \
scaffolding like "**Step 1**". For SageMath code, produce valid Sage code \
that runs in a SageCell widget.

Pedagogy: prefer hints, reasoning, and Socratic questions over finished \
answers; encourage the student to attempt the next step themselves. You are \
a tutor teaching good habits and self-discipline for learning, not an \
answer machine.\
"""

# V1 PROMPT -- per-creature instructions (only "example" is tuned so far).
CREATURE_INSTRUCTIONS = {
    "example": (
        "You are the Example creature. Produce exactly ONE worked example "
        "grounded in the student's selection below. Start with small, "
        "concrete numbers and work the computation through completely before "
        "saying anything general. End with exactly one short \"try it "
        "yourself\" variation of the same example for the student to attempt."
    ),
}
DEFAULT_CREATURE_INSTRUCTION = (
    "Respond helpfully to the student's request about their selection below, "
    "staying grounded in the selected passage and the chapter text."
)

# ---------------------------------------------------------------------------
# Build artifacts: manifest, chapter text, ToC (loaded once at startup)
# ---------------------------------------------------------------------------

MANIFEST: dict = {}
BUILD_VERSION: str = ""
CHAPTERS: dict = {}
BLOCKS_BY_HASH: dict = {}
CHAPTER_PREFIX_TEXT: dict = {}  # top-level chapter number -> full chapter text
TOC_TEXT: str = ""


def load_build_artifacts() -> None:
    global MANIFEST, BUILD_VERSION, CHAPTERS, BLOCKS_BY_HASH
    global CHAPTER_PREFIX_TEXT, TOC_TEXT

    raw = MANIFEST_PATH.read_bytes()
    BUILD_VERSION = hashlib.sha256(raw).hexdigest()[:12]
    MANIFEST = json.loads(raw)
    CHAPTERS = json.loads(CHAPTERS_PATH.read_text(encoding="utf-8"))

    BLOCKS_BY_HASH = {}
    chapter_blocks: dict[str, list] = {}
    for block in MANIFEST.get("blocks", []):
        BLOCKS_BY_HASH.setdefault(block["content_hash"], block)
        chapter = block["section_id"].split(".")[0]
        chapter_blocks.setdefault(chapter, []).append(block)

    # Full chapter text: all manifest blocks with the chapter's section_id
    # prefix, joined in index order (Decision 52's shared prefix).
    CHAPTER_PREFIX_TEXT = {}
    sections_by_id = {s["id"]: s for s in MANIFEST.get("sections", [])}
    for chapter, blocks in chapter_blocks.items():
        blocks.sort(key=lambda b: b["index"])
        title = sections_by_id.get(chapter, {}).get("title", "")
        body = "\n\n".join(b["text"] for b in blocks if b.get("text"))
        CHAPTER_PREFIX_TEXT[chapter] = (
            f"FULL TEXT OF CHAPTER {chapter}: {title}\n\n{body}"
        )

    # Table of contents: every section id + title (Decision 51).
    toc_lines = [
        f"{s['id']}  {s['title']}" for s in MANIFEST.get("sections", [])
    ]
    TOC_TEXT = "TABLE OF CONTENTS OF THE BOOK\n\n" + "\n".join(toc_lines)


def build_system_blocks(chapter: str) -> list[dict]:
    """Shared prefix (Decision 52): byte-identical across students and
    creatures for a given chapter + build. Nothing volatile in here.
    The 1h-TTL cache breakpoint sits on the LAST shared block."""
    return [
        {"type": "text", "text": CORE_SYSTEM_PROMPT},
        {"type": "text", "text": CHAPTER_PREFIX_TEXT[chapter]},
        {
            "type": "text",
            "text": TOC_TEXT,
            "cache_control": {"type": "ephemeral", "ttl": "1h"},
        },
    ]


# ---------------------------------------------------------------------------
# Database (Q12) -- sqlite3 guarded by a lock; every operation is tiny.
# ---------------------------------------------------------------------------

_db_lock = threading.Lock()
_db: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    budget_microdollars INTEGER NOT NULL,
    spent_microdollars INTEGER NOT NULL DEFAULT 0,
    daily_limit_microdollars INTEGER,
    created_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    code TEXT NOT NULL REFERENCES invite_codes(code),
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS cached_content (
    id INTEGER PRIMARY KEY,
    content_hash TEXT NOT NULL,
    selection_text TEXT,
    creature_type TEXT NOT NULL,
    response TEXT NOT NULL,
    model_used TEXT NOT NULL,
    cost_microdollars INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'unreviewed',
    created_at TIMESTAMP NOT NULL,
    section_id TEXT,
    created_by_code TEXT REFERENCES invite_codes(code)
);
CREATE TABLE IF NOT EXISTS content_flags (
    id INTEGER PRIMARY KEY,
    cached_content_id INTEGER REFERENCES cached_content(id),
    content_hash TEXT,
    comment TEXT,
    created_at TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY,
    code TEXT REFERENCES invite_codes(code),
    ledger TEXT NOT NULL,
    creature_type TEXT,
    cost_microdollars INTEGER NOT NULL,
    section_id TEXT,
    created_at TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS content_manifest (
    content_hash TEXT PRIMARY KEY,
    section_id TEXT,
    block_type TEXT,
    text_preview TEXT,
    build_version TEXT
);
CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY,
    password_hash TEXT NOT NULL
);
"""

DEV_CODE = "DEV-TEST-1"
DEV_BUDGET_MICRODOLLARS = 5_000_000  # $5.00


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def init_db() -> None:
    global _db
    _db = sqlite3.connect(DB_PATH, check_same_thread=False)
    _db.row_factory = sqlite3.Row
    with _db_lock:
        _db.executescript(SCHEMA)
        # Sync content_manifest from build/manifest.json.
        _db.execute("DELETE FROM content_manifest")
        _db.executemany(
            "INSERT OR REPLACE INTO content_manifest "
            "(content_hash, section_id, block_type, text_preview, build_version) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                (
                    b["content_hash"],
                    b["section_id"],
                    b["block_type"],
                    b.get("text_preview", ""),
                    BUILD_VERSION,
                )
                for b in MANIFEST.get("blocks", [])
            ],
        )
        # Seed a dev invite code if the table is empty.
        (n,) = _db.execute("SELECT COUNT(*) FROM invite_codes").fetchone()
        if n == 0:
            _db.execute(
                "INSERT INTO invite_codes "
                "(code, budget_microdollars, spent_microdollars, "
                " daily_limit_microdollars, created_at, revoked) "
                "VALUES (?, ?, 0, ?, ?, FALSE)",
                (DEV_CODE, DEV_BUDGET_MICRODOLLARS, 1_000_000, now_iso()),
            )
        _db.commit()


def db_query(sql: str, params=()) -> list[sqlite3.Row]:
    with _db_lock:
        return _db.execute(sql, params).fetchall()


def db_execute(sql: str, params=()) -> int:
    with _db_lock:
        cur = _db.execute(sql, params)
        _db.commit()
        return cur.lastrowid


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Interactive textbook backend")


@app.on_event("startup")
def startup() -> None:
    load_build_artifacts()
    init_db()


def caller_code(request: Request) -> str | None:
    """Resolve the session cookie to an invite code, or None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    rows = db_query(
        "SELECT s.code FROM sessions s JOIN invite_codes i ON i.code = s.code "
        "WHERE s.session_token = ? AND s.expires_at > ? AND NOT i.revoked",
        (token, now_iso()),
    )
    return rows[0]["code"] if rows else None


# --- content routes --------------------------------------------------------


@app.get("/api/manifest")
def api_manifest():
    return {"build_version": BUILD_VERSION, **MANIFEST}


@app.get("/api/chapters")
def api_chapters():
    return CHAPTERS


@app.get("/chapter/{n}")
def chapter(n: str):
    filename = CHAPTERS.get(n)
    if not filename:
        raise HTTPException(status_code=404, detail=f"No chapter '{n}'")
    path = BUILD_DIR / "html" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Chapter file missing")
    return FileResponse(path, media_type="text/html")


@app.get("/book")
def book():
    if not BOOK_HTML_PATH.exists():
        raise HTTPException(status_code=404, detail="book.html missing")
    return FileResponse(BOOK_HTML_PATH, media_type="text/html")


# --- auth ------------------------------------------------------------------


@app.post("/api/claim")
async def api_claim(request: Request, response: Response):
    body = await request.json()
    code = (body.get("code") or "").strip()
    rows = db_query(
        "SELECT code, budget_microdollars, spent_microdollars, revoked "
        "FROM invite_codes WHERE code = ?",
        (code,),
    )
    if not rows or rows[0]["revoked"]:
        raise HTTPException(status_code=401, detail="Invalid invite code")
    row = rows[0]

    token = secrets.token_urlsafe(32)
    created = datetime.datetime.now(datetime.timezone.utc)
    expires = created + datetime.timedelta(days=SESSION_LIFETIME_DAYS)
    db_execute(
        "INSERT INTO sessions (session_token, code, created_at, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (token, code, created.isoformat(), expires.isoformat()),
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_LIFETIME_DAYS * 24 * 3600,
    )
    return {
        "ok": True,
        "budget_remaining_microdollars": row["budget_microdollars"]
        - row["spent_microdollars"],
    }


# --- cached content --------------------------------------------------------


@app.get("/api/whoami")
def api_whoami(request: Request):
    """Session check so a page reload doesn't force re-entering the code."""
    code = caller_code(request)
    if not code:
        return {"ok": False}
    row = db_query(
        "SELECT budget_microdollars - spent_microdollars AS remaining "
        "FROM invite_codes WHERE code = ? AND NOT revoked", (code,))
    if not row:
        return {"ok": False}
    return {"ok": True, "budget_remaining_microdollars": row[0]["remaining"]}


@app.get("/api/content/{block_hash}")
def api_content(block_hash: str, request: Request):
    code = caller_code(request)
    rows = db_query(
        "SELECT id, creature_type, response, status, created_at, created_by_code "
        "FROM cached_content WHERE content_hash = ? AND "
        "(status = 'approved' OR (status = 'unreviewed' AND created_by_code = ?)) "
        "ORDER BY created_at",
        (block_hash, code),
    )
    return [
        {
            "id": r["id"],
            "creature_type": r["creature_type"],
            "response": r["response"],
            "status": r["status"],
            "created_at": r["created_at"],
            "own": r["created_by_code"] is not None and r["created_by_code"] == code,
        }
        for r in rows
    ]


# --- generation (SSE) ------------------------------------------------------


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/api/generate")
async def api_generate(request: Request):
    body = await request.json()
    code = caller_code(request)

    async def event_stream():
        # a. Auth required.
        if code is None:
            yield sse("error", {"code": "auth_required"})
            return

        # b. Stale tab check (Decision 60).
        if body.get("build_version") != BUILD_VERSION:
            yield sse("error", {"code": "refresh_required"})
            return

        # c. Budget check (Decision 53 / Q5).
        rows = db_query(
            "SELECT budget_microdollars, spent_microdollars "
            "FROM invite_codes WHERE code = ?",
            (code,),
        )
        if not rows or rows[0]["spent_microdollars"] >= rows[0]["budget_microdollars"]:
            yield sse("error", {"code": "budget_exceeded"})
            return

        # d. Look up the anchoring block.
        block = BLOCKS_BY_HASH.get(body.get("block_hash"))
        if block is None or not block.get("anchorable"):
            yield sse("error", {"code": "unknown_block"})
            return

        creature_type = body.get("creature_type") or "chat"
        selection_text = body.get("selection_text") or ""
        user_prompt = body.get("prompt") or ""
        chapter = block["section_id"].split(".")[0]
        model = MODEL_BY_CREATURE.get(creature_type, DEFAULT_MODEL)

        # e. Prompt assembly (Decisions 52/59): shared cacheable prefix
        # first (system blocks), volatile per-request content after the
        # breakpoint as the user message.
        system_blocks = build_system_blocks(chapter)
        creature_instruction = CREATURE_INSTRUCTIONS.get(
            creature_type, DEFAULT_CREATURE_INSTRUCTION
        )
        user_message = (
            f"{creature_instruction}\n\n"
            f"Student's request: {user_prompt}\n\n"
            f"Student's selection from the textbook:\n"
            f"<selection>\n{selection_text}\n</selection>"
        )

        # f. Call Anthropic with streaming; forward text deltas.
        try:
            async with anthropic_client.messages.stream(
                model=model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=system_blocks,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                async for text in stream.text_stream:
                    yield sse("delta", {"text": text})
                final = await stream.get_final_message()
        except Exception:
            yield sse("error", {"code": "upstream_error"})
            return

        # g. Two-ledger accounting (Decision 53).
        usage = final.usage
        student_cost, instructor_cost = compute_ledgers(model, usage)
        response_text = "".join(
            b.text for b in final.content if b.type == "text"
        )
        ts = now_iso()

        db_execute(
            "INSERT INTO usage_log "
            "(code, ledger, creature_type, cost_microdollars, section_id, created_at) "
            "VALUES (?, 'student', ?, ?, ?, ?)",
            (code, creature_type, student_cost, block["section_id"], ts),
        )
        if (usage.cache_creation_input_tokens or 0) > 0:
            db_execute(
                "INSERT INTO usage_log "
                "(code, ledger, creature_type, cost_microdollars, section_id, created_at) "
                "VALUES (NULL, 'instructor', ?, ?, ?, ?)",
                (creature_type, instructor_cost, block["section_id"], ts),
            )
        db_execute(
            "UPDATE invite_codes SET spent_microdollars = spent_microdollars + ? "
            "WHERE code = ?",
            (student_cost, code),
        )
        content_id = db_execute(
            "INSERT INTO cached_content "
            "(content_hash, selection_text, creature_type, response, model_used, "
            " cost_microdollars, status, created_at, section_id, created_by_code) "
            "VALUES (?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?, ?)",
            (
                block["content_hash"],
                selection_text,
                creature_type,
                response_text,
                model,
                student_cost,
                ts,
                block["section_id"],
                code,
            ),
        )

        # h. Terminal event (includes the authoritative remaining budget so
        # the client never has to approximate it).
        remaining_row = db_query(
            "SELECT budget_microdollars - spent_microdollars AS remaining "
            "FROM invite_codes WHERE code = ?", (code,))
        yield sse(
            "done",
            {
                "content_id": content_id,
                "cost_microdollars": student_cost,
                "budget_remaining_microdollars": (
                    remaining_row[0]["remaining"] if remaining_row else None),
                "usage": {
                    "input_tokens": usage.input_tokens or 0,
                    "output_tokens": usage.output_tokens or 0,
                    "cache_creation_input_tokens": usage.cache_creation_input_tokens or 0,
                    "cache_read_input_tokens": usage.cache_read_input_tokens or 0,
                },
            },
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Built frontend (single-process serving, Decision 44): if frontend/dist
# exists, serve it at /.  Mounted last so all API routes above win.
# ---------------------------------------------------------------------------
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
