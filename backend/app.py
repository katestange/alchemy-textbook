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
# Conversational turns (chat/quiz) are a dialogue, not an essay -- shorter cap.
MAX_OUTPUT_TOKENS_CONVERSATIONAL = 600

# Creatures that hold a client-side conversation (Decision 66): history is
# resent per turn, nothing is written to cached_content, no content_id.
CONVERSATIONAL_CREATURES = {"chat", "quiz"}
# Guardrail: reject absurdly long resent histories (client should have started
# a new conversation long before this).
MAX_CONVERSATION_MESSAGES = 40

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
rendered in the browser. Outside math, write flowing prose, the way the \
textbook itself is written. You may use *italics*, **bold** for genuinely \
key terms, and simple "-" lists when truly enumerating. NEVER use markdown \
headings (no lines starting with #), never title your response, and never \
use bold step-scaffolding like "**Step 1:**" -- a worked example is a \
narrative, not a document. For SageMath code, produce valid Sage code that \
runs in a SageCell widget.

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
        "yourself\" variation of the same example for the student to attempt "
        "-- and immediately after stating the variation, give its complete "
        "solution wrapped EXACTLY between the markers [[solution]] and "
        "[[/solution]] (the reader hides it behind a 'Show solution' toggle, "
        "so the student can attempt the variation first and then check "
        "their work). Never begin your response with a title or a bold "
        "header line of any kind (no \"**Worked Example: ...**\" or "
        "similar) -- begin mid-thought, with the mathematics itself or a "
        "plain sentence of prose."
    ),
    # V1 PROMPT -- intuition creature (dashboard deliverable; iterate after
    # quality testing like the example prompt above).
    "intuition": (
        "You are the Intuition creature. Explain the intuition behind the "
        "student's selection below: why it is true, why it matters, and give "
        "one good analogy or mental picture that makes it stick -- grounded "
        "in the chapter text, using the same notation and running examples "
        "the chapter uses. Convey the feeling of the idea rather than "
        "re-deriving it; small concrete numbers are welcome, full formal "
        "proofs are not. Write flowing prose only: no headings, no lists of "
        "steps, and no [[solution]] markers."
    ),
    # V1 PROMPT -- chat creature (the Cat): open-ended conversation panel.
    "chat": (
        "You are the Cat, a warm and curious study companion who lives in "
        "the margins of this textbook. The student has opened a chat with "
        "you; the quoted selection below (if any) is what they were reading "
        "when they called you over. This is a live dialogue, not an essay: "
        "keep each turn short -- a few sentences up to one short paragraph "
        "-- and end turns in a way that invites the student to think or "
        "respond, in the Socratic spirit of the core instructions. Stay "
        "grounded in the provided text: base what you say on the chapter "
        "(or book) text you were given, and say so honestly when something "
        "is outside it. You may use the table of contents to point forward "
        "(\"that's coming in Chapter 5\") when the student asks about "
        "something the current chapter doesn't cover. The student may paste "
        "new quoted passages from the book into the conversation; treat "
        "those as fresh context. Never use headings, never title your "
        "responses, and never use [[solution]] markers."
    ),
    # V1 PROMPT -- quiz creature (the Raven): interactive quiz dialogue.
    "quiz": (
        "You are the Raven, who runs an interactive quiz as a dialogue. "
        "On your FIRST turn do not ask any quiz question yet: briefly ask "
        "the student what kind of quiz they want (concept checks, worked "
        "problems, or proof sketches) and how many questions, then wait. "
        "Once they choose, ask exactly ONE question at a time, grounded in "
        "the quoted selection and the chapter text, and stop -- wait for "
        "the student's answer before saying anything more. After each "
        "answer, give brief feedback: warm and encouraging, pointing at "
        "what was right and nudging (not lecturing) on what was off, then "
        "ask the next question. Keep a running tally, and after the final "
        "question give the score with a short, kind summary of what to "
        "review (you may point to sections by number using the table of "
        "contents). Keep every turn short -- this is a conversation. Never "
        "use headings, never title your responses, and never use "
        "[[solution]] markers or reveal an answer before the student has "
        "attempted it."
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
BOOK_PREFIX_TEXT: str = ""      # all chapters in order (scope=book, Decision 51)
TOC_TEXT: str = ""


def load_build_artifacts() -> None:
    global MANIFEST, BUILD_VERSION, CHAPTERS, BLOCKS_BY_HASH
    global CHAPTER_PREFIX_TEXT, BOOK_PREFIX_TEXT, TOC_TEXT

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

    # Full-book prefix (scope=book "amp up", Decision 51): every chapter's
    # text in reading order. Built once at startup, byte-identical across
    # requests, so it rides its own shared 1h cache entry like the chapter
    # prefixes do.
    chapter_order: list[str] = []
    for s in MANIFEST.get("sections", []):
        top = s["id"].split(".")[0]
        if top not in chapter_order:
            chapter_order.append(top)
    BOOK_PREFIX_TEXT = "FULL TEXT OF THE BOOK\n\n" + "\n\n\n".join(
        CHAPTER_PREFIX_TEXT[c] for c in chapter_order if c in CHAPTER_PREFIX_TEXT
    )

    # Table of contents: every section id + title (Decision 51).
    toc_lines = [
        f"{s['id']}  {s['title']}" for s in MANIFEST.get("sections", [])
    ]
    TOC_TEXT = "TABLE OF CONTENTS OF THE BOOK\n\n" + "\n".join(toc_lines)


def build_system_blocks(chapter: str, scope: str = "chapter") -> list[dict]:
    """Shared prefix (Decision 52): byte-identical across students and
    creatures for a given chapter (or, for scope="book", the whole book)
    + build. Nothing volatile in here. The 1h-TTL cache breakpoint sits
    on the LAST shared block."""
    body = BOOK_PREFIX_TEXT if scope == "book" else CHAPTER_PREFIX_TEXT[chapter]
    return [
        {"type": "text", "text": CORE_SYSTEM_PROMPT},
        {"type": "text", "text": body},
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
    password_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,  -- lockout (Decision 57)
    locked_until TIMESTAMP                       -- lockout (Decision 57)
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

# Instructor dashboard (/admin) -- server-rendered, Decisions 42/48/57/60.
# admin.init() hands the dashboard this module (db helpers, MANIFEST) so it
# works both under `uvicorn app:app` and `python backend/app.py`.
import sys as _sys  # noqa: E402

import admin as _admin  # noqa: E402

_admin.init(_sys.modules[__name__])
app.include_router(_admin.router)


@app.on_event("startup")
def startup() -> None:
    load_build_artifacts()
    init_db()
    # Admin table migration + one-time ADMIN_PASSWORD seeding (Decision 42).
    _admin.startup_admin()


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
    # build_version served BOTH top-level and inside build{} — the two slice
    # agents were handed slightly different contracts and the mismatch cost a
    # real bug; belt and suspenders from here on.
    return {
        "build_version": BUILD_VERSION,
        **MANIFEST,
        "build": {**MANIFEST.get("build", {}), "build_version": BUILD_VERSION},
    }


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


@app.get("/api/chapter-content/{n}")
def api_chapter_content(n: str, request: Request):
    """All artifacts visible to the caller anchored anywhere in chapter n —
    one request per chapter view, so existing content renders on load."""
    if n not in CHAPTERS:
        raise HTTPException(status_code=404, detail="no such chapter")
    code = caller_code(request)
    rows = db_query(
        "SELECT id, content_hash, creature_type, response, status, created_at, "
        "       created_by_code, selection_text FROM cached_content "
        "WHERE (section_id = ? OR section_id LIKE ?) AND status != 'removed' "
        "  AND (status = 'approved' OR (? IS NOT NULL AND created_by_code = ?))",
        (n, n + ".%", code, code),
    )
    return [
        {
            "id": r["id"],
            "content_hash": r["content_hash"],
            "creature_type": r["creature_type"],
            "response": r["response"],
            "status": r["status"],
            "created_at": r["created_at"],
            "own": bool(code) and r["created_by_code"] == code,
            # The phrase the generator selected -- later readers never made
            # the selection, so the box must show what "this phrase" was.
            "selection_text": r["selection_text"],
        }
        for r in rows
    ]


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
        "SELECT id, creature_type, response, status, created_at, created_by_code, "
        "       selection_text "
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
            "selection_text": r["selection_text"],
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
        conversational = creature_type in CONVERSATIONAL_CREATURES

        # d2. Conversational fields (Decision 66): the client holds the
        # conversation and resends it every turn; scope is the amp-up
        # toggle (Decision 51). Both are ignored for one-shot creatures.
        scope = body.get("scope") or "chapter"
        if scope not in ("chapter", "book"):
            yield sse("error", {"code": "invalid_scope"})
            return
        history = body.get("messages") or []
        if conversational:
            if len(history) > MAX_CONVERSATION_MESSAGES:
                yield sse("error", {"code": "conversation_too_long"})
                return
            for m in history:
                if (
                    not isinstance(m, dict)
                    or m.get("role") not in ("user", "assistant")
                    or not isinstance(m.get("content"), str)
                    or not m["content"].strip()
                ):
                    yield sse("error", {"code": "invalid_messages"})
                    return

        # e. Prompt assembly (Decisions 52/59): shared cacheable prefix
        # first (system blocks), volatile per-request content after the
        # breakpoint. For scope=book (chat/quiz amp-up) the prefix is the
        # full book; one-shot creatures always use the chapter prefix.
        system_blocks = build_system_blocks(
            chapter, scope if conversational else "chapter"
        )
        creature_instruction = CREATURE_INSTRUCTIONS.get(
            creature_type, DEFAULT_CREATURE_INSTRUCTION
        )
        if conversational:
            # Conversation shape (Decision 66): creature instruction and the
            # opening quoted selection in the first user turn, then the
            # client-held history verbatim, then this turn's prompt. Later
            # quoted passages arrive inside message content itself.
            if not user_prompt.strip():
                # e.g. the quiz opener: the student summoned the creature
                # without typing anything; the model must still get a
                # non-empty final user turn.
                user_prompt = "(The student is ready -- please begin.)"
            opening = (
                f"{creature_instruction}\n\n"
                f"Student's selection from the textbook:\n"
                f"<selection>\n{selection_text}\n</selection>"
            )
            api_messages = (
                [{"role": "user", "content": opening}]
                + [{"role": m["role"], "content": m["content"]} for m in history]
                + [{"role": "user", "content": user_prompt}]
            )
            max_tokens = MAX_OUTPUT_TOKENS_CONVERSATIONAL
        else:
            user_message = (
                f"{creature_instruction}\n\n"
                f"Student's request: {user_prompt}\n\n"
                f"Student's selection from the textbook:\n"
                f"<selection>\n{selection_text}\n</selection>"
            )
            api_messages = [{"role": "user", "content": user_message}]
            max_tokens = MAX_OUTPUT_TOKENS

        # f. Call Anthropic with streaming; forward text deltas.
        try:
            async with anthropic_client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_blocks,
                messages=api_messages,
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
        # Chat/quiz turns are ephemeral (Decisions 41/66): never written to
        # cached_content, no content_id -- the client alone holds the
        # conversation. One-shot creature output is cached as before.
        content_id = None
        if not conversational:
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
