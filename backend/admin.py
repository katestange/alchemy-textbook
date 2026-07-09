"""Instructor dashboard (/admin) -- spec Q5/Q6/Q8, Decisions 42/48/53/57/60.

Server-rendered Jinja2 pages, keyboard-first, self-contained (no CDN assets).

Auth (Decisions 42 + 57): a single admin password whose hash lives in the
`admin` table.  Hashing is stdlib `hashlib.scrypt` -- memory-hard like argon2,
zero extra dependencies, and no exposure to passlib's bcrypt-compat bitrot.
Seeding: on startup, if the admin table is empty and env ADMIN_PASSWORD is
set, the hash is written (the author puts ADMIN_PASSWORD in /workspace/.env).
Lockout: 5 consecutive failures -> refuse for 15 minutes; the counter and
lock timestamp persist in the admin table so a restart doesn't reset them.

Sessions: a random token in an HttpOnly SameSite=Lax cookie named
"admin_session" (distinct from the student "session" cookie), held in an
in-process dict -- an app restart simply logs the instructor out.

Wiring: app.py calls `init(module)` after its own globals exist, then mounts
`router`; we reach the db helpers and build artifacts through that module
reference so both `uvicorn app:app` and `python backend/app.py` work.
"""
import datetime
import difflib
import hashlib
import os
import re
import secrets
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

core = None  # the app module; set by init()

router = APIRouter(prefix="/admin")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
templates.env.filters["dollars"] = lambda md: f"${(md or 0) / 1_000_000:,.4f}"

ADMIN_COOKIE = "admin_session"
ADMIN_SESSION_HOURS = 12
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

_admin_sessions: dict[str, datetime.datetime] = {}  # token -> expiry (UTC)

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I lookalikes


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


# ---------------------------------------------------------------------------
# Password hashing (hashlib.scrypt, stdlib)
# ---------------------------------------------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 16384, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt,
                       n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        h = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                           n=int(n), r=int(r), p=int(p))
        return secrets.compare_digest(h.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Startup: schema migration + password seeding (called from app.startup)
# ---------------------------------------------------------------------------

def init(app_module) -> None:
    global core
    core = app_module


def startup_admin() -> None:
    """Migrate the admin table (lockout columns) and seed the password."""
    cols = {r[1] for r in core.db_query("PRAGMA table_info(admin)")}
    if "failed_attempts" not in cols:
        core.db_execute(
            "ALTER TABLE admin ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0")
    if "locked_until" not in cols:
        core.db_execute("ALTER TABLE admin ADD COLUMN locked_until TIMESTAMP")

    rows = core.db_query("SELECT id FROM admin")
    pw = os.environ.get("ADMIN_PASSWORD")
    if not rows and pw:
        core.db_execute(
            "INSERT INTO admin (password_hash, failed_attempts) VALUES (?, 0)",
            (hash_password(pw),),
        )


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def is_admin(request: Request) -> bool:
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        return False
    expiry = _admin_sessions.get(token)
    if expiry is None:
        return False
    if expiry < _now():
        _admin_sessions.pop(token, None)
        return False
    return True


def _login_redirect() -> RedirectResponse:
    return RedirectResponse("/admin/login", status_code=303)


def _render(request: Request, template: str, ctx: dict) -> HTMLResponse:
    ctx = {"request": request, **ctx}
    return templates.TemplateResponse(request, template, ctx)


# ---------------------------------------------------------------------------
# Login / logout (Decision 42 password, Decision 57 lockout)
# ---------------------------------------------------------------------------

@router.get("/login", response_class=HTMLResponse)
def login_form(request: Request):
    configured = bool(core.db_query("SELECT id FROM admin"))
    return _render(request, "admin/login.html",
                   {"error": None, "configured": configured})


@router.post("/login")
async def login_submit(request: Request):
    form = await request.form()
    password = str(form.get("password") or "")
    rows = core.db_query(
        "SELECT id, password_hash, failed_attempts, locked_until FROM admin "
        "ORDER BY id LIMIT 1")
    if not rows:
        return _render(request, "admin/login.html",
                       {"error": None, "configured": False})
    row = rows[0]

    # Lockout check first: while locked, refuse without even verifying.
    if row["locked_until"]:
        locked_until = datetime.datetime.fromisoformat(row["locked_until"])
        if locked_until > _now():
            mins = int((locked_until - _now()).total_seconds() // 60) + 1
            return _render(request, "admin/login.html", {
                "error": f"Locked out after repeated failures. "
                         f"Try again in about {mins} minute(s).",
                "configured": True})

    if not verify_password(password, row["password_hash"]):
        failures = row["failed_attempts"] + 1
        locked_until = None
        if failures >= LOCKOUT_THRESHOLD:
            locked_until = (
                _now() + datetime.timedelta(minutes=LOCKOUT_MINUTES)
            ).isoformat()
            failures = 0  # counter restarts after the lock expires
        core.db_execute(
            "UPDATE admin SET failed_attempts = ?, locked_until = ? WHERE id = ?",
            (failures, locked_until, row["id"]))
        msg = ("Too many failures -- locked for "
               f"{LOCKOUT_MINUTES} minutes." if locked_until
               else "Wrong password.")
        return _render(request, "admin/login.html",
                       {"error": msg, "configured": True})

    # Success: reset the counter, mint a session.
    core.db_execute(
        "UPDATE admin SET failed_attempts = 0, locked_until = NULL WHERE id = ?",
        (row["id"],))
    token = secrets.token_urlsafe(32)
    _admin_sessions[token] = _now() + datetime.timedelta(hours=ADMIN_SESSION_HOURS)
    resp = RedirectResponse("/admin/review", status_code=303)
    resp.set_cookie(ADMIN_COOKIE, token, httponly=True, samesite="lax",
                    secure=core.COOKIE_SECURE,
                    max_age=ADMIN_SESSION_HOURS * 3600, path="/")
    return resp


@router.post("/logout")
def logout(request: Request):
    token = request.cookies.get(ADMIN_COOKIE)
    if token:
        _admin_sessions.pop(token, None)
    resp = _login_redirect()
    resp.delete_cookie(ADMIN_COOKIE, path="/")
    return resp


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def admin_root(request: Request):
    return RedirectResponse(
        "/admin/review" if is_admin(request) else "/admin/login",
        status_code=303)


# ---------------------------------------------------------------------------
# Review queue (Decision 48: moderate everything)
# ---------------------------------------------------------------------------

@router.get("/review", response_class=HTMLResponse)
def review_queue(request: Request):
    if not is_admin(request):
        return _login_redirect()
    rows = core.db_query(
        "SELECT cc.id, cc.content_hash, cc.selection_text, cc.creature_type, "
        "       cc.response, cc.model_used, cc.cost_microdollars, cc.status, "
        "       cc.created_at, cc.section_id, cc.created_by_code, "
        "       cm.text_preview AS anchor_preview, "
        "       cm.section_id  AS anchor_section "
        "FROM cached_content cc "
        "LEFT JOIN content_manifest cm ON cm.content_hash = cc.content_hash "
        "WHERE cc.status = 'unreviewed' "
        "ORDER BY cc.created_at DESC, cc.id DESC")
    flags = {}
    for f in core.db_query(
            "SELECT cached_content_id, comment, created_at FROM content_flags "
            "WHERE cached_content_id IS NOT NULL ORDER BY created_at"):
        flags.setdefault(f["cached_content_id"], []).append(f)
    counts = {r["status"]: r["n"] for r in core.db_query(
        "SELECT status, COUNT(*) AS n FROM cached_content GROUP BY status")}
    return _render(request, "admin/review.html",
                   {"items": rows, "flags": flags, "counts": counts,
                    "active": "review"})


@router.post("/review/{item_id}/approve")
def review_approve(item_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    core.db_execute(
        "UPDATE cached_content SET status = 'approved' WHERE id = ?", (item_id,))
    return RedirectResponse("/admin/review", status_code=303)


@router.post("/review/{item_id}/remove")
def review_remove(item_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    core.db_execute(
        "UPDATE cached_content SET status = 'removed' WHERE id = ?", (item_id,))
    return RedirectResponse("/admin/review", status_code=303)


@router.post("/review/{item_id}/edit")
async def review_edit(item_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    form = await request.form()
    response_text = str(form.get("response") or "")
    if response_text.strip():
        if form.get("save_approve"):
            # One keystroke fewer: save the edit and approve together.
            core.db_execute(
                "UPDATE cached_content SET response = ?, status = 'approved' "
                "WHERE id = ?", (response_text, item_id))
        else:
            # Edited but still unreviewed until explicitly approved (Q6).
            core.db_execute(
                "UPDATE cached_content SET response = ?, status = 'unreviewed' "
                "WHERE id = ?", (response_text, item_id))
    return RedirectResponse("/admin/review", status_code=303)


# ---------------------------------------------------------------------------
# Invite codes (Q5)
# ---------------------------------------------------------------------------

def _new_code() -> str:
    def chunk(n):
        return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))
    prefix = core.BOOK_CFG["invites"]["code_prefix"]
    return f"{prefix}-{chunk(4)}-{chunk(2)}"


@router.get("/codes", response_class=HTMLResponse)
def codes_screen(request: Request):
    if not is_admin(request):
        return _login_redirect()
    rows = core.db_query(
        "SELECT i.*, (SELECT COUNT(*) FROM sessions s WHERE s.code = i.code) "
        "       AS session_count "
        "FROM invite_codes i ORDER BY i.created_at DESC, i.code")
    generated = request.query_params.get("generated", "")
    new_codes = [c for c in generated.split(",") if c]
    return _render(request, "admin/codes.html",
                   {"codes": rows, "new_codes": new_codes, "active": "codes"})


@router.post("/codes/generate")
async def codes_generate(request: Request):
    if not is_admin(request):
        return _login_redirect()
    form = await request.form()
    try:
        n = max(1, min(500, int(form.get("count") or 1)))
        budget = int(round(float(form.get("budget_dollars") or 5) * 1_000_000))
    except ValueError:
        return RedirectResponse("/admin/codes", status_code=303)
    made = []
    for _ in range(n):
        code = _new_code()
        while core.db_query("SELECT 1 FROM invite_codes WHERE code = ?", (code,)):
            code = _new_code()
        core.db_execute(
            "INSERT INTO invite_codes (code, budget_microdollars, "
            " spent_microdollars, created_at, revoked) "
            "VALUES (?, ?, 0, ?, FALSE)",
            (code, budget, core.now_iso()))
        made.append(code)
    return RedirectResponse(
        "/admin/codes?generated=" + ",".join(made), status_code=303)


@router.post("/codes/{code}/revoke")
def codes_revoke(code: str, request: Request):
    if not is_admin(request):
        return _login_redirect()
    core.db_execute("UPDATE invite_codes SET revoked = TRUE WHERE code = ?", (code,))
    core.db_execute("DELETE FROM sessions WHERE code = ?", (code,))  # kill sessions
    return RedirectResponse("/admin/codes", status_code=303)


@router.post("/codes/{code}/topup")
async def codes_topup(code: str, request: Request):
    if not is_admin(request):
        return _login_redirect()
    form = await request.form()
    try:
        amount = int(round(float(form.get("amount_dollars") or 0) * 1_000_000))
    except ValueError:
        amount = 0
    if amount > 0:
        core.db_execute(
            "UPDATE invite_codes SET budget_microdollars = "
            "budget_microdollars + ? WHERE code = ?", (amount, code))
    return RedirectResponse("/admin/codes", status_code=303)


# ---------------------------------------------------------------------------
# Usage (Q5 aggregate stats, two ledgers per Decision 53)
# ---------------------------------------------------------------------------

@router.get("/usage", response_class=HTMLResponse)
def usage_screen(request: Request):
    if not is_admin(request):
        return _login_redirect()
    by_ledger = core.db_query(
        "SELECT ledger, COUNT(*) AS n, SUM(cost_microdollars) AS total "
        "FROM usage_log GROUP BY ledger ORDER BY ledger")
    by_creature = core.db_query(
        "SELECT COALESCE(creature_type, '(none)') AS creature_type, "
        "       COUNT(*) AS n, SUM(cost_microdollars) AS total "
        "FROM usage_log GROUP BY creature_type ORDER BY total DESC")
    # Top-level chapter = section_id prefix before the first dot.
    chapters: dict[str, dict] = {}
    for r in core.db_query(
            "SELECT section_id, cost_microdollars FROM usage_log"):
        ch = (r["section_id"] or "?").split(".")[0]
        agg = chapters.setdefault(ch, {"chapter": ch, "n": 0, "total": 0})
        agg["n"] += 1
        agg["total"] += r["cost_microdollars"]
    by_chapter = sorted(chapters.values(),
                        key=lambda a: (a["chapter"] != "?", a["chapter"]))
    recent = core.db_query(
        "SELECT * FROM usage_log ORDER BY created_at DESC, id DESC LIMIT 50")
    grand_total = sum(r["total"] or 0 for r in by_ledger)
    return _render(request, "admin/usage.html",
                   {"by_ledger": by_ledger, "by_creature": by_creature,
                    "by_chapter": by_chapter, "recent": recent,
                    "grand_total": grand_total, "active": "usage"})


# ---------------------------------------------------------------------------
# Orphan re-anchor queue (Q8 / Decision 60)
# ---------------------------------------------------------------------------

_ws = re.compile(r"\s+")


def _norm(s: str) -> str:
    return _ws.sub(" ", (s or "")).strip()


def _candidates(selection_text: str, response: str, top_n: int = 3) -> list[dict]:
    """Top-N manifest blocks by fuzzy similarity to the orphan's context.

    The query is the stored selection_text; when that is missing or very
    short we pad with the start of the response so there is *something* to
    match on.  Scoring is difflib.SequenceMatcher.ratio() against each
    block's full normalized text, pre-screened with real_quick_ratio /
    quick_ratio so most of the ~817 blocks never pay for a full ratio().
    An exact containment of the selection in a block scores 1.0 outright.
    Nothing here ever *acts* -- suggestions only; re-anchoring is always an
    explicit instructor action (Decision 60 / Q8).
    """
    sel = _norm(selection_text)
    query = sel if len(sel) >= 40 else _norm(f"{sel} {(response or '')[:300]}")
    if not query:
        return []
    sm = difflib.SequenceMatcher(autojunk=False)
    sm.set_seq2(query)  # seq2 is cached across set_seq1 calls
    scored = []
    best_floor = 0.0
    for block in core.MANIFEST.get("blocks", []):
        text = _norm(block.get("text") or "")
        if not text:
            continue
        if sel and len(sel) >= 40 and sel in text:
            scored.append((1.0, block))
            continue
        sm.set_seq1(text)
        if sm.real_quick_ratio() <= best_floor or sm.quick_ratio() <= best_floor:
            continue
        ratio = sm.ratio()
        scored.append((ratio, block))
        if len(scored) >= top_n:
            best_floor = sorted(s for s, _ in scored)[-top_n]
    scored.sort(key=lambda t: -t[0])
    return [
        {"ratio": s, "content_hash": b["content_hash"],
         "section_id": b["section_id"], "block_type": b["block_type"],
         "text_preview": b["text_preview"]}
        for s, b in scored[:top_n]
    ]


@router.get("/orphans", response_class=HTMLResponse)
def orphans_screen(request: Request):
    if not is_admin(request):
        return _login_redirect()
    rows = core.db_query(
        "SELECT cc.* FROM cached_content cc "
        "WHERE cc.status != 'removed' AND cc.content_hash NOT IN "
        "  (SELECT content_hash FROM content_manifest) "
        "ORDER BY cc.created_at DESC, cc.id DESC")
    orphans = [
        {"row": r, "candidates": _candidates(r["selection_text"], r["response"])}
        for r in rows
    ]
    return _render(request, "admin/orphans.html",
                   {"orphans": orphans, "active": "orphans"})


@router.post("/orphans/{item_id}/reanchor")
async def orphan_reanchor(item_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    form = await request.form()
    new_hash = str(form.get("content_hash") or "")
    row = core.db_query(
        "SELECT section_id FROM content_manifest WHERE content_hash = ?",
        (new_hash,))
    if row:  # only ever re-anchor to a block that exists in the current build
        core.db_execute(
            "UPDATE cached_content SET content_hash = ?, section_id = ? "
            "WHERE id = ?", (new_hash, row[0]["section_id"], item_id))
    return RedirectResponse("/admin/orphans", status_code=303)


@router.post("/orphans/{item_id}/delete")
def orphan_delete(item_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    core.db_execute("DELETE FROM content_flags WHERE cached_content_id = ?", (item_id,))
    core.db_execute("DELETE FROM cached_content WHERE id = ?", (item_id,))
    return RedirectResponse("/admin/orphans", status_code=303)


# ---------------------------------------------------------------------------
# Settings -> superseded by the per-solution Solutions page; keep a redirect so
# an old bookmark still lands somewhere sensible.
# ---------------------------------------------------------------------------

@router.get("/settings")
def settings_page(request: Request):
    if not is_admin(request):
        return _login_redirect()
    return RedirectResponse("/admin/solutions", status_code=303)


# ---------------------------------------------------------------------------
# Flags (student-reported problems: suspect passages + bad AI content)
# ---------------------------------------------------------------------------

CATEGORY_LABEL = {
    "text-error": "Suspected textbook error",
    "incorrect": "AI: incorrect / misleading",
    "inappropriate": "AI: inappropriate",
}


@router.get("/flags", response_class=HTMLResponse)
def flags_screen(request: Request):
    if not is_admin(request):
        return _login_redirect()
    rows = core.db_query(
        "SELECT f.id, f.cached_content_id, f.content_hash, f.category, "
        "       f.comment, f.created_by_code, f.created_at, "
        "       cc.creature_type, cc.response, cc.status AS cc_status, "
        "       COALESCE(cm.text_preview, ccm.text_preview) AS preview, "
        "       COALESCE(cm.section_id, ccm.section_id, cc.section_id) AS section_id "
        "FROM content_flags f "
        "LEFT JOIN cached_content cc ON cc.id = f.cached_content_id "
        "LEFT JOIN content_manifest cm ON cm.content_hash = f.content_hash "
        "LEFT JOIN content_manifest ccm ON ccm.content_hash = cc.content_hash "
        "WHERE f.resolved = 0 "
        "ORDER BY f.created_at DESC, f.id DESC")
    items = []
    for r in rows:
        d = dict(r)
        d["category_label"] = CATEGORY_LABEL.get(r["category"], r["category"])
        d["is_ai"] = r["cached_content_id"] is not None
        items.append(d)
    return _render(request, "admin/flags.html",
                   {"items": items, "active": "flags"})


@router.post("/flags/{flag_id}/resolve")
def flags_resolve(flag_id: int, request: Request):
    if not is_admin(request):
        return _login_redirect()
    core.db_execute(
        "UPDATE content_flags SET resolved = 1 WHERE id = ?", (flag_id,))
    return RedirectResponse("/admin/flags", status_code=303)


# ---------------------------------------------------------------------------
# Solutions: multi-level visibility (book / section / subsection / item)
# ---------------------------------------------------------------------------

def _natural_key(sid: str):
    """Sort section ids numerically per component so 6.20 follows 6.9."""
    try:
        return tuple(int(p) for p in sid.split("."))
    except ValueError:
        return (10 ** 9,)


def _build_solution_tree():
    """Nested tree of sections that contain solutions, each node annotated with
    a (visible, total) count over its subtree and each leaf solution with its
    effective visibility. Returns (roots, book_visible, book_total)."""
    overrides = core.solution_overrides()
    default = core.solutions_default()

    sols_by_sec: dict[str, list] = {}
    for s in core.SOLUTIONS:
        sols_by_sec.setdefault(s["section_id"], []).append(s)
    titles = {s["id"]: s["title"] for s in core.SOLUTION_SECTIONS}

    # Every section id with solutions, plus all its ancestors.
    needed: set[str] = set()
    for sec in sols_by_sec:
        parts = sec.split(".")
        for i in range(1, len(parts) + 1):
            needed.add(".".join(parts[:i]))

    nodes = {
        sid: {
            "id": sid,
            "title": titles.get(sid, ""),
            "level": sid.count(".") + 1,
            "children": [],
            "solutions": [
                {**s, "visible": overrides.get(s["sol_key"], default)}
                for s in sols_by_sec.get(sid, [])
            ],
        }
        for sid in needed
    }
    roots = []
    for sid in sorted(needed, key=_natural_key):
        node = nodes[sid]
        parent = nodes.get(sid.rsplit(".", 1)[0]) if "." in sid else None
        (parent["children"] if parent else roots).append(node)

    def count(node):
        vis = sum(1 for s in node["solutions"] if s["visible"])
        tot = len(node["solutions"])
        for c in node["children"]:
            cv, ct = count(c)
            vis += cv
            tot += ct
        node["visible"] = vis
        node["total"] = tot
        return vis, tot

    bvis = btot = 0
    for r in roots:
        v, t = count(r)
        bvis += v
        btot += t
    return roots, bvis, btot


@router.get("/solutions", response_class=HTMLResponse)
def solutions_screen(request: Request):
    if not is_admin(request):
        return _login_redirect()
    roots, bvis, btot = _build_solution_tree()
    return _render(request, "admin/solutions.html", {
        "roots": roots,
        "book_visible": bvis,
        "book_total": btot,
        "default_visible": core.solutions_default(),
        "active": "solutions",
    })


@router.post("/solutions/item")
async def solutions_item(request: Request):
    if not is_admin(request):
        return JSONResponse({"ok": False}, status_code=403)
    form = await request.form()
    sol_key = str(form.get("sol_key") or "")
    if not sol_key:
        return JSONResponse({"ok": False}, status_code=400)
    core.set_solution_override(sol_key, form.get("visible") == "1")
    return JSONResponse({"ok": True})


@router.post("/solutions/bulk")
async def solutions_bulk(request: Request):
    """Master action: set every solution under a node (prefix) on/off. An empty
    prefix means the whole book, and also updates the book-wide default."""
    if not is_admin(request):
        return JSONResponse({"ok": False}, status_code=403)
    form = await request.form()
    prefix = str(form.get("prefix") or "")
    visible = form.get("visible") == "1"
    n = core.bulk_set_solutions(prefix, visible)
    if prefix == "":
        core.set_setting("solutions_default", "1" if visible else "0")
    return JSONResponse({"ok": True, "affected": n})


@router.post("/solutions/default")
async def solutions_default_set(request: Request):
    """Book-wide default for solutions with no explicit override (and new ones)."""
    if not is_admin(request):
        return JSONResponse({"ok": False}, status_code=403)
    form = await request.form()
    core.set_setting("solutions_default", "1" if form.get("visible") == "1" else "0")
    return JSONResponse({"ok": True})
