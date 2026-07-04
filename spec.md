# Interactive Textbook: Coding and Cryptography

## Status: Design complete (Q1-Q13 resolved); implementation in progress

---

## 1. Vision

An AI-powered interactive textbook for an undergraduate course on coding theory
and cryptography (University of Colorado Boulder, Prof. Katherine Stange).  It
looks and navigates like a traditional textbook (table of contents, linear
narrative, definitions/theorems/proofs/examples), but layers on AI-driven
interactive tools that model the kind of mental work mathematicians do when
reading: generating examples, testing understanding, adjusting detail, and
computing.

### Goals

1. **Genuinely useful study resource** that is visibly a textbook so students
   know how to begin interacting with it.
2. **Replicable model** -- this spec (and the reference implementation) are
   published on GitHub.  Another instructor replicates the project by reading
   the spec, adapting the decisions to their own context, and using AI coding
   tools to build their own version.  The spec is the primary reusable
   artifact, not the code.
3. **Author's voice** -- channels the author's unique perspective, tone, and
   mathematical taste, as a real textbook would.

---

## 2. Design Decisions by Area

### Q1: Content Authoring Format and Pipeline

**Current thinking:** Author writes in LaTeX (the natural format for math
textbooks; many existing textbooks already exist in LaTeX).  The LaTeX source
lives in the repo and the author edits it directly.

**Questions:**
- How is LaTeX converted to web content?  Options:
  - (a) **LaTeX -> HTML at build time** (e.g. `pandoc`, `LaTeXML`, `tex4ht`,
    `plastex`).  The HTML is then rendered by the web app.
  - (b) **LaTeX -> Markdown+KaTeX/MathJax at build time**, then rendered by a
    JS framework.
  - (c) **LaTeX rendered client-side** (e.g. MathJax on raw LaTeX fragments).
  - (d) **Hybrid:** author writes content in Markdown with LaTeX math, since
    this is a *new* textbook being written.
- Do we need a "recompile" step, or can the app read source directly?
- What granularity of chunking?  (Per-section? Per-paragraph? Each
  definition/theorem/proof as a unit?)  Granularity matters for AI tools that
  operate on specific pieces of text.

**Decision:** LaTeXML.

**Pipeline detail:**
```
.tex files
    |
    v
LaTeXML (latexml + latexmlpost)
    |
    v
Structured HTML with semantic markup
(theorems, definitions, proofs, examples tagged as such)
    |
    v
Post-processing script: extract semantic units, assign IDs,
produce JSON manifest of content blocks for AI tools
    |
    v
Static assets served by the Python backend
```

**The post-processing step** parses LaTeXML's semantic HTML output and produces
a manifest (JSON) mapping each content block to its type (definition, theorem,
proof, example, paragraph), section hierarchy, and stable ID.  This manifest
is what the AI tools and the caching system use to anchor content.

**Build speed:** LaTeXML is slower than pandoc (~30-60s for a textbook) but
this only affects the author's workflow, not the student experience.  Acceptable.

**Package compatibility assessment (based on actual .tex source):**

The textbook is a single 7100-line `.tex` file ("The Alchemy of Mathematical
Cryptography") with 8 major sections and ~102 theorem-style environments.

| Feature | LaTeXML support | Notes |
|---------|----------------|-------|
| `amsmath`, `amsthm`, `amssymb` | Excellent | Heavy use throughout |
| Custom `\newtheorem` types (checkin, philosophy, quiz, heuristic, fact) | Excellent | ~10 custom types, all via standard `amsthm` |
| Custom math commands (`\ZZ`, `\RR`, `\FF`, etc.) | Excellent | Standard `\newcommand` |
| `physics` package (`\ket`, `\bra`) | Good | Used in quantum chapter; LaTeXML has a binding |
| `graphicx` (`\includegraphics`) | Excellent | Many images |
| `hyperref` | Excellent | Links |
| `dcolumn`, `xcolor[table]` | Good | Used for Vigenère table |
| `nicematrix` | **Uncertain** | May need fallback to standard `amsmath` matrices |
| `tcolorbox` (with `theorems`, `skins`) | **Partial** | Only 3 uses; may need manual workaround |
| `tikz` (simple node/arrow diagrams) | **Partial** | Only 3 diagrams, simple; may need pre-rendered image fallback |
| `\KS{}` comment system | Fine | Author TODOs; can be stripped at build time |

No showstoppers.  The three risk areas (`nicematrix`, `tcolorbox`, `tikz`)
are each used only a handful of times and have straightforward fallbacks.

---

### Q2: Web Framework / Static vs. Dynamic

**Options considered:**
- (a) **Static site + client-side AI calls.**  Simplest, but can't secure API
  keys or cache across users.
- (b) **Lightweight Python server** (Flask/FastAPI) with SQLite.
- (c) **Full-stack JS framework** (Next.js, SvelteKit) with serverless functions.
- (d) **BaaS** (Supabase/Firebase + serverless functions).

**Decision:** Option (b) -- **Python backend (FastAPI) with SQLite.**

FastAPI specifically (not Flask, Decision 54): all AI responses are streamed
over SSE (Q3), and an SSE stream holds its connection open for 15-60s.  A sync
WSGI server ties up one worker per open stream -- a handful of concurrent
students would stall the whole site.  FastAPI/uvicorn is async, so idle-ish
streams cost nothing and the reading experience never blocks on AI traffic.

**Rationale:**
- A backend is required for: securing the instructor API key, auth/token
  management, and shared caching of AI-generated content.
- Python is familiar (author developed Numberscope backscope in Python).
- SQLite is zero-config, single-file, no external database service.  More than
  sufficient for course-scale usage (~30-200 students).
- Self-contained: one repo, one process, one deploy.  No external accounts
  beyond the AI provider.
- The backend serves both the API endpoints and the static frontend assets.

**Hosting plan:**
- **Development:** Run locally (`python app.py`).
- **Initial deployment:** Free tier on Fly.io or Railway while waiting for
  department server.
- **Long-term:** Department server at CU Boulder (to be requested).

**Concerns to keep in mind:**
- SQLite is single-writer (fine at course scale, but worth knowing).
- Need HTTPS and a reverse proxy (nginx/caddy) on the department server.
- Process must stay running (systemd service or Docker container).
- AI API latency (2-15s per call); UI must handle this gracefully.
- Per-student rate limits needed to prevent cost surprises.

---

### Q3: AI Provider and Integration

**Decision:** Anthropic Claude as primary provider.  Abstractable interface so
the provider can be swapped later without a rewrite.

**Model selection by tool:**

| Tool | Model tier | Rationale |
|------|-----------|-----------|
| **Example** (dragon-worm) | Haiku (fast/cheap) | Relatively formulaic output |
| **Justify** (magnifying glass) | Sonnet | Requires mathematical rigor |
| **Counterexample** | Sonnet | Requires deep understanding of hypotheses |
| **Intuition** | Sonnet | Needs to find good analogies/explanations |
| **Applet** (gear) | Sonnet | Must produce working SageMath code |
| **Fun** | Haiku | Playful rewriting, creativity over rigor |
| **Quiz** | Haiku | Question generation is straightforward |
| **Chat** | Sonnet | General-purpose, needs to be good |
| **Summarize** (spider) | Haiku | Compression, not deep reasoning |

These assignments are starting points; adjust based on quality testing.

**Context window strategy:**

Each AI call includes:
- **Shared prefix (cacheable):** core system prompt (with the voice-imitation
  instruction, Decision 59) + the **full text of the current chapter** + the
  book's table of contents
  (all chapter/section titles, so the AI can point forward: "that's covered in
  Chapter 5").  Since a reader page *is* a chapter (Q13), "what the student is
  looking at" and "what the AI sees" coincide.
- **After the cache breakpoint (per-request):** the creature-specific
  instructions, the user's selection, and (for chat) the conversation so far.
- **Chat "amp up":** the chat panel has a toggle that swaps the chapter prefix
  for the **full textbook** -- for cross-chapter questions.  Costs more (and is
  labeled as such); it rides its own shared cache entry like any other prefix.

**Prefix ordering is deliberate** (Decision 52): everything stable and shared
comes *before* the cache breakpoint, everything per-creature/per-student comes
*after*, so all nine creatures on the same chapter share ONE cache entry, and
one entry serves the whole class (the cache is organization-scoped -- all
students ride the instructor key).  The prefix must be byte-identical across
requests: no timestamps, student IDs, or other volatile content in it.

More context = better answers but higher cost.  The per-chapter approach is the
sweet spot; the amp-up toggle covers the rest.  Monitor costs and adjust.

**Streaming:** All AI responses are streamed.  The backend proxies the stream
from the Claude API to the browser via server-sent events (SSE).  Benefits:
- Better UX for anything taking >1 second
- Creature animation syncs naturally (creature "presents" while text streams in)
- Math rendering buffers until complete `$...$` blocks arrive before rendering
- The final complete response is cached to the database when the stream finishes

**Prompt architecture:**

Each tool's system prompt includes:
1. **Role:** "You are a mathematics tutor embedded in an interactive textbook
   on coding theory and cryptography."
2. **Voice-imitation instruction (Decision 59):** no curated samples -- the
   chapter text in the shared prefix (15-25K tokens of the author's actual
   prose, Q3/Decision 52) *is* the voice exemplar.  The system prompt instructs
   explicitly: "Write in the voice of the textbook provided: match its tone,
   notation, and explanatory habits," naming 2-3 salient stylistic traits
   (conversational asides, 'out loud, we say...' readings, concrete
   small-number examples before generality).  The instruction is required --
   models don't spontaneously imitate reference material.  (Fun mode
   deliberately does NOT imitate the author's comic voice -- Q10.)
3. **Tool-specific instructions:** what to produce, at what level, in what
   format.
4. **Output format:** "Render all math as LaTeX between `$...$` (inline) or
   `$$...$$` (display).  For SageMath code, produce valid Sage code that runs
   in a SageCell widget."
5. **Guardrails -- pedagogy, not police (Decision 55).**  The prompts steer
   toward good learning habits: prefer hints, reasoning, and Socratic questions
   over finished answers; encourage the student to attempt the step first.
   This is honestly a *tone*, not an enforcement mechanism: creatures are
   editable prompts, and a determined student can elicit a full solution from
   any AI tool anywhere -- this one included.  The design goal, in the author's
   words: "I want to create a tool... to teach good habits and self-discipline
   for learning.  I am not police."  Academic integrity is carried by course
   policy; the software contributes visibility (per-code usage logs, Q12's
   `created_by_code`), never surveillance or blocking.

**AI-powered tools and UX:**

**Interaction model:** All tools are creatures.  There is no toolbar, context
menu, or panel of buttons.  The UI *is* the creatures.

**Design principle (why specialized creatures exist alongside chat):**
Specialized creatures serve two purposes beyond what chat alone provides:
(1) Each carries a carefully crafted prompt encoding expert knowledge about
how to do that task *well* -- what makes a good example, a useful summary, a
revealing counterexample.  Chat can do anything, but the specialized creatures
do their one thing better because their prompts are purpose-built.
(2) They teach mathematical reading habits by making the *kinds* of thinking
visible and inviting -- a student learns to ask "do I have an example?" or
"what's the intuition?" by seeing those creatures available.

**Design principle (leverage AI, don't shoehorn):**  Each creature is really
a **pre-filled prompt that the user can edit**.  The dragon-worm doesn't force
you to get a generic example -- it starts with "Create a worked example for this" and
you can keep typing: "...using only 4-digit numbers."  The creatures lower the
barrier and model good mathematical thinking habits, but never constrain.  Chat
is the fully general escape hatch with no pre-filled prompt.

**Selection-triggered tool flow:**
1. User selects text with mouse (standard text selection).
2. A small cluster of tool-creatures flutter up near the selection -- one per
   tool type.
3. User hovers over a creature to see a tooltip ("Example," "Justify," etc.).
4. User clicks a creature.
5. A text box appears, pre-filled with the creature's default prompt (e.g.
   "Create a worked example for this selection.").  The user can edit or
   extend it, then submit.
6. The creature animates (working...) while the AI streams a response.
7. The result appears according to the creature type's presentation pattern.
8. **Refinement:** clicking a settled creature reopens the text box for
   follow-up ("I like this, but make the numbers 4 digits").  Refinements
   replace the previous version (not accumulate).  The AI retains history for
   context, but the creature shows only the latest version.
9. The final version is what gets cached for other users.

**Two presentation patterns:**

| Pattern | Used by | Behavior |
|---------|---------|----------|
| **In situ** | Example, Justify, Counterexample, Intuition, Applet, Fun | Text separates, result appears on pastel background at the point of selection.  Creature settles into text.  Content is dismissable/foldable. |
| **Side panel** | Chat, Quiz | A side panel opens with the selected text as context.  Supports interactive back-and-forth. |

**Tool creatures:** The complete roster of tool-creatures -- each with its
scope, accent color, result pattern (in situ vs. side panel), default prompt
prefix, and visual concept -- is consolidated in the master creature table
under Q11.

**Result-only creature (not a tool):** The *Eureka* creature is not summoned
from a selection; it is spawned from chat via a natural-language request (see
Chat, below).  Its visual treatment is listed with the other creatures in Q11.

**Chat specifics:**
- Chat is a creature like any other -- flutters up on text selection, clicked
  to activate.
- Opens a side panel with the selected text quoted as the starting context.
- The student can immediately type a question ("I don't get this sentence,
  what is x here?") and the AI already knows what "this" refers to.
- Chat conversation is scoped to the current reading position but can range
  across the textbook.
- **Eureka capture:** The student can ask in natural language within the chat
  to save an insight, e.g. "Please save the fact that x is a variable as a
  eureka moment."  The AI recognizes the intent, distills the insight into a
  concise remark, and spawns a eureka creature anchored to the original
  selection.  No special UI -- it's just part of the conversation.  The
  student controls exactly what gets saved by describing it in their own
  words.

**Section selection:**
- Section numbers (e.g. "3.2") are clickable.
- Clicking a section number triggers the same creature-flutter interaction,
  but only the section-scoped creatures appear (firefly, jester, raven,
  cat, spider).
- Text selection shows text-scoped creatures (dragon-worm, owl, octopus,
  firefly, beetle, jester, cat).
- This scope filtering keeps the cluster small: 7 creatures on text
  selection, 5 on section selection.

**Quiz specifics:**
- Opens in the side panel (interactive back-and-forth).
- Begins by asking what kind of quiz (concept checks, worked problems, etc.).
- AI generates questions; student answers; AI responds with feedback.
- Multiple rounds are possible.

**Cost control:**
- Per-student daily/weekly token caps (enforced by backend).
- Model tier selection keeps routine operations cheap.
- Caching means popular content is generated once, served many times.
- When a user clicks a tool creature and cached content already exists for
  that selection, the cached version is shown immediately (no API call).
  The user can request a fresh generation ("try again") if desired.

---

### Q4: SageMath Integration

**Current approach on crypto.katestange.net:** Uses SageCell server
(`sagecell.sagemath.org`) with embedded `<div class="compute">` blocks and the
sagecell.js library.  This is a proven, free, no-server-needed approach.

**For the interactive textbook:**
- Pre-authored SageMath cells embedded in the text (as currently done).
- AI-generated SageMath cells: AI writes Sage code, which is injected into a
  SageCell widget dynamically.
- The SageCell server is a free public resource -- is it reliable enough for
  course use?  (It has been for crypto.katestange.net.)

**Decision:** Use SageCell (`sagecell.sagemath.org`) for all Sage interactives,
both pre-authored and AI-generated.  (Confirmed by existing successful usage.)

---

### Q5: Authentication and Token Management

**Decision:** Invite codes with per-student budgets.  Bring-your-own-API-key as
a secondary option.

**Three tiers of access:**

| User type | Auth | AI generation? |
|-----------|------|---------------|
| Anonymous reader | None | No -- reads base textbook + cached AI content |
| Student (invite code) | Code entry, persistent session | Yes, from instructor-funded budget |
| Self-funded user (own API key) | Pastes API key in browser | Yes, using own tokens (key stays in browser, never sent to server) |
| Instructor | Admin login (separate from codes) | Yes, plus dashboard access |

**Invite code system:**

- Instructor generates a batch of codes on the dashboard (e.g. "generate 35
  codes with $5 budget each").
- Codes are short, readable strings (e.g. `CRYPTO-7X4M-Q2`), easy to print
  on a handout or email.
- Codes are pre-assigned by instructor to students via a private offline
  record (spreadsheet, text file) that maps codes to names.  **The system
  itself never stores student names** -- the dashboard shows only codes and
  usage.  This keeps the application **privacy-preserving** (pseudonymous
  codes, no content, no names -- though `usage_log` is still a reading-behavior
  trail an instructor could link to students offline, so we don't overclaim
  "FERPA-clean"; see the retention rule in Q12).
- Student enters code once in the browser.  Browser receives a session token
  stored in an HttpOnly, **SameSite=Lax** cookie (XSS- and CSRF-resistant --
  without SameSite, a cross-site request could spend a student's budget).
  Cookie persists until end of semester or revocation.
- The code-entry endpoint is **rate-limited** (codes are short enough to
  brute-force otherwise), and the admin login locks out after repeated
  failures.
- Same code works on multiple devices, drawing from one shared budget.

**Dashboard (instructor) capabilities:**
- View all codes: claimed/unclaimed, budget remaining, usage history.
  (No student names in the system -- instructor maps codes to names offline.)
- Revoke a code (kills session, reclaims budget).
- Top up a code's budget.
- Generate additional codes mid-semester.
- Transfer remaining budget from a revoked code to a new one (for lost codes).
- Aggregate usage stats: total spend, per-tool breakdown, most-used sections.

**Budget enforcement:**
- Soft warning at 80% of budget consumed.
- Hard cap at 100% -- AI generation features disabled, cached content still
  accessible.
- Per-student daily rate limit as a safety net against runaway usage (e.g.
  max $1/day).

**Bring-your-own-key flow:**
- Available to anyone (students who exhaust their budget, non-students,
  public users).
- User pastes their Anthropic API key in a settings panel.
- Key held in the browser and sent to the backend only per request; the backend
  forwards it to Anthropic and **never stores or logs it**.
- AI calls are **always proxied through the backend** -- there is no direct
  browser-to-Anthropic path.  (A browser-direct path would let any client write
  arbitrary text into the shared cache; it is deliberately excluded -- see Q6.)
- Generated content is cached only via the server-only write path (Q6), and
  becomes public only after instructor approval.
- This is a secondary option, not prominently featured -- most students will
  use invite codes.

---

### Q6: Caching and Community-Generated Content

**Core idea:** When any user generates AI content (an example, a justification,
an applet, etc.), it is cached and -- once the instructor approves it -- made
available to all future readers, including those not logged in.  The textbook
*grows* with reviewed usage.

**Decision:** Hybrid caching with review workflow.

**Content lifecycle** (moderate-everything):
1. User generates AI content (example, justification, remark, applet, etc.).
2. The **server** stores it (only the server ever writes the cache), keyed to
   the nearest semantic unit (section, definition, theorem, paragraph) and
   tagged with the generating **invite code**.  It is marked **unreviewed** and
   is visible **only to its creator** (and the instructor) -- not to other
   readers.
3. Instructor **reviews** via the dashboard: approve, edit, or remove.  Per-code
   generation rate limits and one-click takedown backstop abuse.
4. **On approval**, the content becomes public -- permanent supplementary
   material alongside the base textbook, visible to all readers.
5. Any user can **flag** approved content for errors, with a comment, which
   returns it to the review queue.

**The user's selection is freeform** -- they can highlight any span of text to
trigger an AI tool.  But cached results are anchored to the nearest semantic
unit from the textbook structure for organization and display purposes.

**Eureka capture:** As described under Chat (Q3), a student can ask in natural
language during a chat to save an insight, and the AI distills it into a
concise remark and spawns a eureka creature anchored to the selection.  These
are especially valuable because they represent things that actually helped
someone understand.

**Content statuses:**

| Status | Meaning | Visible? |
|--------|---------|----------|
| Unreviewed | AI-generated, not yet reviewed | Yes, with indicator |
| Flagged | A user reported a problem | Yes, with indicator |
| Approved | Instructor reviewed and confirmed | Yes, shown prominently |
| Removed | Instructor rejected | No |

**Error reports on base textbook:** Users can also flag errors in the authored
content (effectively a lightweight, scoped issue tracker).

**Instructor dashboard:** Admin panel to view all cached content, filterable by
section, status, and content type.  Supports one-click approve/remove, editing
before approval, and viewing flag comments.

**Where is the cache stored?** In the SQLite database alongside auth data.  The
base textbook (LaTeX -> compiled HTML) is the canonical text; all AI-generated
and community content lives in the database as supplementary material, never
merged into the LaTeX source.

**Important design note:** Users should be critical readers of AI-generated
content.  The status indicators serve as a reminder that this content may
contain errors, not as an apology -- learning to evaluate mathematical claims
is part of the pedagogical goal.

---

### Q7: Hosting

**Decision:** See Q2.  Development on localhost; initial deploy to Fly.io or
Railway (free tier); long-term on CU Boulder department server.

---

### Q8: Workflow for Author During Semester

**Decision:** Local editor + git; GitHub Actions for build and deploy.

**Author workflow:**
1. Edit `.tex` files locally in any editor.
2. `git push` to `main`.
3. GitHub Actions runs LaTeXML + post-processing, deploys the result.
4. New/updated content is live within minutes.
5. If the build fails (LaTeX error), the last good build remains deployed and
   the author is notified by email.

**SageMath in LaTeX:** Custom `\begin{sagecell}...\end{sagecell}` environment.
LaTeXML is configured to pass these through; the post-processor converts them
to `<div class="compute">` blocks with sagecell.js setup.  Author writes Sage
code directly in the `.tex` source.

**Content drift and cached AI content:**

The author expects to rewrite, reorganize, and restructure freely throughout
the semester.  Cached AI content (examples, remarks, justifications, etc.)
must handle this gracefully.

**Anchoring strategy:** Each content block in the compiled textbook is assigned
an exact content hash (of its text).  Cached AI content is keyed to this hash.

- **Exact hash match (block moved but unchanged):** Cached content follows
  automatically.  No action needed.  This handles reorganization, reordering,
  and moving content between sections.
- **No exact match (block was edited or deleted):** Cached content is
  orphaned.  A fuzzy similarity check runs against all blocks in the new
  build to find likely matches.
  - If a likely match is found (above a similarity threshold), the dashboard
    shows: "This example was attached to [old text snippet].  The closest
    match in the new build is [new text snippet] in section X.Y.  Re-anchor?
    [Yes / No / Delete]"
  - If no likely match, the item is simply listed as orphaned for deletion.
  - **Nothing fuzzy-matched is ever automatically carried over.**  Even a
    single-letter change could invalidate an example, so all non-exact
    matches require instructor approval.
- The orphan/re-anchor review is part of the instructor dashboard, shown
  after each build that changes the content structure.  **This screen must be
  keyboard-fast and batchable** (one keystroke per verdict, bulk-accept for
  high-confidence matches): an author who rewrites freely faces dozens of
  verdicts per editing session, and if the flow is slow, orphans pile up and
  silently rot.

**The authoring loop (Decision 60).**  Heavy semester-long editing is the
normal case, so the edit cycle is explicit:

1. Edit the `.tex`; run `pipeline/check.sh`.
2. The structural-snapshot diff is the edit's *receipt* -- "chapter 2:
   paragraphs 45 -> 52, definitions 12 -> 13".  Eyeball it: if it matches your
   intent, run `check.sh --update-baseline`; if it doesn't, the pipeline just
   caught something (yours or its own).
3. Commit source + updated baselines together, so every structural change is
   reviewable in git history.  CI treats a snapshot change *without* a source
   change as a hard failure (a pipeline regression); with one, the committed
   baseline is authoritative.
4. Push; CI builds and deploys; open student tabs get a refresh prompt
   (see Q13, stale tabs); orphaned content lands in the re-anchor queue.

Content edits never require touching the pipeline.  Preamble edits (a
`\usepackage` line) may trip the fail-closed pre-processor by design -- it
aborts with instructions rather than hanging the build.

**This keeps the build pipeline AI-free** -- all intelligence about re-anchoring
is simple text similarity (e.g. difflib or similar), not AI calls.  AI is only
used at runtime when students interact.

---

### Q9: Replicability for Other Instructors

**Decision:** Both the spec and the reference implementation are distributed.
The spec is the primary reusable artifact: another instructor reads it, makes
their own choices at each decision point (hosting provider, AI provider, tech
stack, etc.), and uses AI coding tools to build their own implementation.  The
reference implementation (this project's code) is also available -- people can
read it, learn from it, borrow pieces, or even fork it if it happens to suit
their needs.  But the spec is designed to stand alone as a buildable blueprint.

**Rationale:**
- A detailed spec with documented decision rationale ages better than code.
- Every instructor's constraints differ (university hosting, budget, existing
  LaTeX structure, preferred tools).  A spec lets them adapt; a codebase forces
  them to conform.
- AI coding tools are now capable enough that a good spec is a buildable
  blueprint.
- This eliminates the maintenance burden of making the codebase
  framework-agnostic and universally configurable.

**Implication for this project:** We are free to pick whatever tech stack works
best for *this* deployment.  Decisions no longer need to optimize for "can a
random professor fork this."

---

### Q10: Fun Mode / Alternate Tones

**Decision:** Fun mode is a creature, not a global toggle.

The user selects any passage and clicks the fun creature.  The AI rewrites the
selection in a **randomly chosen comic style** (noir detective, cooking show,
sports commentary, Shakespearean, etc.).  Each fun rewrite is different and
surprising.  The result appears in situ on pastel background like any other
creature content.

The prompt instructs the AI to pick a common comic trope or style at random
and be silly, while keeping the mathematical content accurate.  No attempt to
train the AI on the author's specific comic style -- this is intentional, as
other textbook authors replicating the spec won't have that information either.

Fun creature results are cached and refinable like any other creature.

---

### Q11: Creatures -- Surfacing Community Content

**Decision:** AI-generated and community content is surfaced via animated
creatures that inhabit the whitespace of the textbook -- margins, gaps between
content blocks, section headings, and other available space.

#### Design Principles

**Principle (Standard LaTeX):** The original LaTeX source should not require a
different writing style than a standard math textbook.  Standard environments
(`theorem`, `definition`, `proof`, `example`, etc.) just work.  No special
markup is needed for the interactive features.  This ensures existing LaTeX
textbooks can be adapted with minimal changes.

**Principle (Author's text is sacred):** The base text on screen is always the
author's authored content, on the base parchment background.  AI-generated
content is always visually distinct: displayed on a **tinted background**
matching the creature's accent color (pale wash) so it is immediately
distinguishable from authored text.  This distinction is maintained in both
light and dark modes.

**Principle (Textbook first):** The page looks and feels like a textbook by
default.  Creatures are present but unobtrusive.  The reading experience is
primary; the interactive layer is secondary.

#### Creature Concept

Different content types are represented by different creatures.  Creatures live
throughout the whitespace of the textbook, not only in margins.  Their spatial
behavior matches their content type.

**Creature taxonomy:**

**Tool creatures (appear on text selection):**  This master table is the single
source of truth for the tool-creatures -- functional and visual attributes
together.

| Creature | Tool | Scope | Color | Result | Default prompt prefix | Visual concept |
|----------|------|-------|-------|--------|-----------------------|----------------|
| Dragon-worm | Example | Text | **Green** (olive/moss) | In situ | "Create a worked example for this." | Serpentine, horizontal, scaly.  Coils at rest, stretches out when presenting. |
| Owl | Justify | Text | **Gold** (ochre/amber) | In situ | "Justify this claim rigorously." | Round, big-eyed, perching.  Leans forward intently when presenting.  Tawny feathers. |
| Octopus | Counterexample | Text | **Teal** (deep blue-green) | In situ | "Give a counterexample showing why a hypothesis here is necessary." | Alien, tentacled.  Compact at rest, tentacles reach out to dismantle when presenting.  Inky. |
| Firefly | Intuition | Text + section | **Gold** (ochre/amber) | In situ | "Explain the intuition behind this." | Luminous, glowing.  Tiny but transformative.  Carries its own light -- it *is* the lantern. |
| Clockwork beetle | Applet | Text | **Green** (olive/moss) | In situ (SageCell) | "Create a SageMath interactive for this." | Mechanical insect, gears and springs for legs.  Tinkering, building.  Verdigris patina. |
| Court jester | Fun | Text + section | **Red** (sealing-wax) | In situ | "Rewrite this in a randomly chosen comic style. Be silly." | Bells on hat, exaggerated expressions.  Chaotic, playful, motley. |
| Raven | Quiz | Section | **Teal** (deep blue-green) | Side panel | "What kind of quiz? Concept checks, worked problems, ...?" | Angular, spiky feathers, sharp eye.  Alert, knowing.  Asks riddles. |
| Cat | Chat | Text + section | **Warm grey** (charcoal) | Side panel | (empty -- user types freely) | Slinky, expressive, alert.  Sits beside you.  The listener. |
| Spider | Summarize | Section | **Teal** (deep blue-green) | In situ | "Summarize this section, highlighting the key ideas and their relationships." | Spins threads together.  Builds a web from the whole section.  Compact, precise. |

Each creature's hover-tooltip is simply its tool name ("Example," "Justify,"
etc.).

**Result-only creature:**

| Creature | Animal | Color | How it's created | Visual concept |
|----------|--------|-------|------------------|---------------|
| Eureka | Salamander | **Red** (sealing-wax) | Spawned from chat via a natural-language request | Glows with inner fire.  Alchemical.  Bursts into light when created, glows steadily once settled. |

**Color palette (5 colors):**

| Color | Name | Used by | AI content background |
|-------|------|---------|-----------------------|
| **Green** | Olive / moss | Dragon-worm, Clockwork beetle | Pale green wash |
| **Gold** | Ochre / amber | Owl, Firefly | Pale gold wash |
| **Teal** | Deep blue-green | Octopus, Raven, Spider | Pale teal wash |
| **Red** | Sealing-wax | Jester, Salamander | Pale red/pink wash |
| **Warm grey** | Charcoal | Cat | Pale grey wash |

Color pairings are chosen so that creatures sharing a color are visually
distinct (e.g. octopus vs. raven are unmistakable silhouettes despite
sharing teal).  The AI-generated content background uses a pale wash of the
creature's color, so content type is recognizable at a glance by color alone.

**The dragon-worm (worked example) as a model for in-text creatures:**
- At rest: a small, flat, decorative dragon-worm lying in the whitespace
  between content blocks (e.g. after a definition, before continuing text).
- Engage (hover/click): the dragon-worm animates, the text below slides down
  to make room, and the worked example appears in situ on a pastel background,
  as if the author had included it.
- Dismiss: the example folds back up, the dragon-worm settles back down, text
  closes.
- Multiple dragon-worms can coil in the same gap if there are several examples.

This pattern -- creature at rest in whitespace, content expands in situ when
engaged, always on pastel background -- may apply to other content types too,
depending on what feels natural for each.

**Placement principle (no scaffolding):** Creatures are not pre-placed at
"expected" locations (e.g. after every definition).  There are no ghost
creatures, "+" buttons, or empty slots.  The tools can be used on any text
selection -- a definition, a sentence, a single word -- and the creature
appears wherever that content was generated, anchored to the selected text.
Placement is natural and minimal, like a footnote marker: a small creature
sits at or just after the relevant text.

This means:
- A fresh deploy looks like a clean textbook.  Creatures appear only where
  users have actually generated content.
- The textbook fills up organically over usage.  Dense clusters of creatures
  reveal where students needed the most help -- this is informative for the
  instructor.
- The AI tools are not tied to any structural assumption (e.g. "definitions
  should have examples").  A student can ask for an example of anything.  If
  the selection doesn't lend itself to the requested tool, the AI says so
  ("This isn't really something you can make an example out of").
- No imposed pedagogical scaffolding.  The tools are flexible and
  student-driven.

#### Author-written vs. AI-generated content

- **Author writes `\begin{example}...\end{example}` in LaTeX:** renders as
  normal text, normal background, no creature.  It's part of the base textbook.
- **AI-generated example:** appears as a dragon-worm creature.  When expanded, shown
  on pastel background.  Always distinguishable from authored content.
- The same principle applies to all content types: author-written remarks,
  proofs, etc. are normal text.  AI-generated versions are creatures on pastel.

#### Visual style

**Overall aesthetic:** An old magic textbook -- a grimoire.  The vibe is a
cross between:
- **Illuminated manuscripts** -- fantastical creatures in ornate marginalia
- **The Voynich manuscript** -- weird, undecoded, otherworldly illustrations
- **Deyrolle naturalist drawings** -- detailed, scientific, beautiful studies
  of animals and specimens

All rendered in a **scribble-in-the-margin style** -- as if a brilliant
student doodled them in colored pen during a lecture.

- Loose, sketchy lines -- hand-drawn, not polished
- Mostly monochrome per creature, with its accent color as the primary ink
- Colored-pen-on-aged-paper feel
- Fantastical but recognizable as animals/creatures at small sizes
- Each creature must read clearly at ~30-40px (resting) and ~100-200px
  (presenting)
- Creature art created with an image generator, iterated to get the right feel
- Each creature type is a sprite sheet with ~10 states/frames

**Page background:** Aged parchment / cream, not pure white.  Evokes the
grimoire / old textbook feel.  Text boxes for AI content use modern, simple
black-lined rounded-corner boxes -- the text presentation is clean and modern
even though the creatures and page texture are archaic.

**Typography:** EB Garamond (free, web-safe Google Font).  Old-book feel that
complements the grimoire aesthetic.  Body text in regular weight; headings in
small caps variant.  Math is rendered as **native MathML** (the browser's
built-in MathML, as arXiv's LaTeXML HTML does -- no math library); AI-generated
math is converted client-side with **Temml** (LaTeX -> MathML).  One pinned math
webfont, sized to the body, keeps author and AI math identical across browsers.
(See Decision 49; supersedes the earlier KaTeX choice.)

#### Review status reflected in creature appearance

- **Unreviewed:** scrappy, young, energetic
- **Approved:** old, wise, settled -- has earned its place
- **Flagged:** looks uncertain, maybe a question mark hovering over it

#### Animation

CSS sprite animation using ~10 hand-drawn frames per creature type.  States
include: idle, alert (mouse nearby), presenting (engaged), and status variants
(young/wise/uncertain).  CSS `steps()` timing with sprite sheets -- lightweight
and performant.

#### Accessibility

- **Quiet mode:** toggle that replaces creatures with simple typed icons
  (matching the content type) and removes all animation.  Respects
  `prefers-reduced-motion` media query by default.
- **Screen readers:** each creature has an aria-label describing its content
  type and status ("Unreviewed worked example for Definition 3.2.1").
- **Keyboard navigation:** tab through creatures, enter to expand.

#### Build order: quiet mode first (Decision 56)

Quiet mode is not a fallback bolted on later -- it is **the base UI, built and
shipped first**.  Every tool works as a simple typed icon before any creature
art exists; creatures are **progressive enhancement**, layered on as sprite
sheets land.  This keeps launch independent of art production (~300 hand-drawn
frames otherwise sit on the critical path) while changing nothing about the
creature vision itself.

**Launch roster:** the first release ships four tools -- **example
(dragon-worm), intuition (firefly), chat (cat), quiz (raven)** -- the highest
pedagogical value per prompt.  The remaining creatures (justify, counterexample,
applet, fun, summarize, eureka) follow once the core loop is proven.

#### Mobile / narrow screens

Margins collapse on small viewports.  Margin creatures become a collapsible
panel or drawer.  In-text creatures (like dragon-worms) continue to work as
expandable inline elements.

#### Pedagogical purpose

The creatures make supplementary content feel inviting and alive, encouraging
exploration.  The visual distinction between creature types teaches students to
recognize *kinds* of mathematical thinking (example, justification,
computation, self-test) -- modeling the habits they should develop when reading
without AI assistance.

---

### Q12: Database Schema (SQLite)

**Privacy principle:** Student inputs (prompts, chat messages, refinement
requests) are never stored.  Only the AI's final output (the artifact visible
in the textbook) is stored.  Chat conversations are ephemeral -- only eureka
creatures that emerge from chat are persisted.  Students can be told: "Your
conversations aren't stored.  Only the artifacts that appear in the text are."

**Retention rule (Decision 58):** at semester end, `usage_log` and `sessions`
are dropped and invite codes revoked -- the pseudonymous reading-behavior trail
does not outlive the course.  Approved content (and its `created_by_code`
tags) persists as part of the textbook.

**Tables:**

**`invite_codes`** -- auth and budgets

| Column | Type | Notes |
|--------|------|-------|
| `code` | TEXT PRIMARY KEY | e.g. "CRYPTO-7X4M-Q2" |
| `budget_microdollars` | INTEGER | Total budget in microdollars ($5 = 5,000,000; sub-cent Haiku calls must not round away -- Decision 53) |
| `spent_microdollars` | INTEGER DEFAULT 0 | Running total |
| `daily_limit_microdollars` | INTEGER | Safety cap per day |
| `created_at` | TIMESTAMP | |
| `revoked` | BOOLEAN DEFAULT FALSE | |

**`sessions`** -- browser cookie to code mapping

| Column | Type | Notes |
|--------|------|-------|
| `session_token` | TEXT PRIMARY KEY | Random token in HttpOnly cookie |
| `code` | TEXT REFERENCES invite_codes | |
| `created_at` | TIMESTAMP | |
| `expires_at` | TIMESTAMP | End of semester |

**`cached_content`** -- all AI-generated artifacts visible in the textbook

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `content_hash` | TEXT | Hash of textbook block this is anchored to |
| `selection_text` | TEXT | The exact text selection (for display context) |
| `creature_type` | TEXT | "example", "justify", "counterexample", "intuition", "applet", "fun", "quiz", "summarize", "eureka" |
| `response` | TEXT | The AI's final response (after any refinements) |
| `model_used` | TEXT | e.g. "claude-haiku-4-5-20251001" |
| `cost_microdollars` | INTEGER | What this generation cost (student-ledger share) |
| `status` | TEXT DEFAULT 'unreviewed' | "unreviewed", "approved", "flagged", "removed" |
| `created_at` | TIMESTAMP | |
| `section_id` | TEXT | Section from content manifest |
| `created_by_code` | TEXT REFERENCES invite_codes | Which invite code generated this (moderation + revocation; a code, not a name) |

Note: no `prompt` column and no chat/message text -- student *inputs* are never
stored.  `created_by_code` records which invite code produced an artifact so an
abuser can be identified and revoked; codes are pseudonymous (not names), which
keeps the privacy posture -- see Q6.  Cost tracking for budget enforcement is in
`usage_log`.

**`content_flags`** -- user reports on AI content or base textbook

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `cached_content_id` | INTEGER NULL REFERENCES cached_content | If flagging AI content |
| `content_hash` | TEXT NULL | If flagging base textbook |
| `comment` | TEXT | Description of the problem |
| `created_at` | TIMESTAMP | |

**`usage_log`** -- budget enforcement and aggregate analytics

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `code` | TEXT REFERENCES invite_codes | NULL for instructor-ledger rows |
| `ledger` | TEXT | "student" or "instructor" (Decision 53) |
| `creature_type` | TEXT | |
| `cost_microdollars` | INTEGER | |
| `section_id` | TEXT | |
| `created_at` | TIMESTAMP | |

One API response may write two rows: the student's as-if-warm share
(`ledger='student'`, their code) and, when that request re-warmed a cold
prefix, the cache-write premium (`ledger='instructor'`, `code=NULL`).

**`content_manifest`** -- snapshot of current build's content blocks

| Column | Type | Notes |
|--------|------|-------|
| `content_hash` | TEXT PRIMARY KEY | Hash of block text |
| `section_id` | TEXT | e.g. "3.2.1" |
| `block_type` | TEXT | "definition", "theorem", "proof", "paragraph", etc. |
| `text_preview` | TEXT | First ~200 chars for dashboard |
| `build_version` | TEXT | Git commit or build timestamp |

Orphan detection: after each build, any `cached_content` whose
`content_hash` is absent from the new manifest is orphaned.

**`admin`** -- simple admin auth

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `password_hash` | TEXT | bcrypt or argon2 hash |

---

### Q13: Frontend Architecture

Svelte is the framework (Decision 38); this section defines how the frontend is
structured, built, and wired to the backend.  Two choices below -- the
build/serve model and the content-delivery model -- are taken as **recommended
defaults** consistent with Q2 and may be revisited by the author; everything
else follows from earlier decisions (native-MathML math and creature art in Q11, SSE
streaming and creature UX in Q3).

**Decision (build & serve):** A plain **Svelte single-page app**, built by
**Vite** to static assets (HTML/JS/CSS) that the Python backend (Q2) serves
alongside its API.  No SvelteKit and no Node runtime in production -- this
preserves the "one repo, one process, one deploy" principle from Q2.
SvelteKit's routing/SSR would add a second runtime for little gain: navigation
is simple and the heavy content is pre-compiled by LaTeXML.

**Decision (content delivery):** The base textbook is delivered as the
**pre-rendered LaTeXML HTML**, and Svelte **hydrates an interaction layer on
top of it** rather than re-rendering the content itself.  Rationale:
- The author's text renders instantly and is exactly what LaTeXML produced --
  no second renderer that could drift from the canonical output (upholds
  "author's text is sacred," Q11).
- The JSON content manifest (the `content_manifest` table, Q12) supplies the
  block hashes; the interaction layer uses them to anchor creatures and cached
  content to the exact span the user selected.
- Svelte owns only the *interactive* DOM (creatures, AI-content boxes, side
  panels) -- where a reactive framework actually earns its keep.

**Page composition (backend routes consumed by the SPA):**
```
/                     SPA shell (index.html + Svelte bundle)
/chapter/<n>          pre-rendered LaTeXML HTML for one chapter
/manifest             JSON: blocks, hashes, section tree, block types
/content/<hash>       cached AI artifacts anchored to a block
/api/generate (SSE)   streamed AI generation for a creature
```
**A reader page is a chapter** (Decision 50): the build splits the book at
top-level `\section` boundaries (`latexmlpost --split`), giving ~9 long
scrolling pages.  Rationale: preserves the continuous-reading "textbook first"
feel (Q11); page = AI-context unit (Q3), so no cross-page bookkeeping; and with
native MathML (Decision 49) even the largest chapter is cheap to render.
Within-chapter navigation uses the LaTeXML `id` anchors (the manifest's
`xml_id`s double as scroll targets), so the ToC's "3.2" jumps instantly.

The SPA fetches the chapter HTML + manifest, injects the HTML into the reading
pane, then walks the manifest to wire up selection handling and to place any
cached creatures that already exist for the loaded chapter.

**Selection -> creature lifecycle (component view):**
1. `SelectionWatcher` -- listens for text selection and section-number clicks,
   maps the selection to the enclosing content block(s) and hash(es) via the
   manifest, and determines scope (text vs. section).
2. `CreatureCluster` -- renders the scope-filtered set of tool-creatures
   fluttering near the selection (7 on text, 5 on section; Q3/Q11).
3. `CreaturePrompt` -- the editable, pre-filled prompt box for the clicked
   creature (Q3).
4. `generation` store -- opens the SSE connection to `/api/generate`, buffers
   the stream, and exposes incremental text to the view.
5. `InSituResult` / `SidePanel` -- the two presentation patterns (Q3): in-situ
   content mounts on a pastel wash at the selection; chat and quiz open the
   side panel.
6. On stream end, the final artifact is persisted server-side (Q6/Q12) and the
   creature settles into its resting sprite.

**Math rendering:** native MathML for the base text and **Temml** for AI math
(Q11, Decision 49).  Base-textbook math is already MathML in the LaTeXML HTML,
so the browser renders it with no math library (the arXiv approach -- fastest on
math-dense pages).  **Streamed** AI math (`$...$` / `$$...$$`) is converted to
MathML client-side by Temml, incrementally: the generation store withholds a
span until its closing delimiter arrives, so half-typed formulas never flash
(matches the streaming note in Q3).  Both paths end as native MathML, so author
and AI math render identically.

**Creature rendering & animation:** each creature is a sprite sheet (~10 frames)
driven by CSS `steps()` animation (Q11).  A `Creature` component takes a
creature type + review status and selects the matching sprite; states are idle,
alert (pointer near), presenting, and the status variants (young / wise /
uncertain, Q11).  `prefers-reduced-motion` and quiet mode swap the sprite for a
static typed icon (Q11).

**State management:** Svelte stores -- `session` (invite-code auth state),
`manifest` (blocks + hashes for the loaded section), and `creatures` (in-flight
generations and settled artifacts keyed by block hash).  No external state
library is needed at course scale.

**Theming / dark mode:** CSS custom properties for the parchment background, the
five creature accent colors, and the pastel content washes, toggled by a
`[data-theme]` attribute.  This resolves the dark-mode open item: darken the
parchment to a warm near-black, keep the accent hues but lower their lightness,
and derive each pastel wash as a low-opacity tint of its accent over the dark
background, so content type stays recognizable by color in both modes.

**Accessibility:** quiet mode (static icons, no animation) and
`prefers-reduced-motion` are honored by default; each creature carries an
aria-label describing type + status; creatures are keyboard-focusable and
expand on Enter (Q11).  Because the reading pane is plain semantic LaTeXML HTML,
it stays fully navigable even with the interactive layer disabled.

**Frontend <-> backend contract:** AI generation is the single SSE endpoint
`/api/generate`, taking `{ creature_type, block_hash, selection_text, prompt,
build_version }`; auth is the HttpOnly session cookie (Q5); the backend runs
the budget check before opening the stream and emits a terminal "budget
exceeded" event if the cap is hit (Q5).  Cached content is plain JSON from
`/content/<hash>`.

**Stale tabs across a deploy (Decision 60):** every request carries the
`build_version` of the manifest the client loaded.  If the server is on a newer
build, it rejects the request with a `refresh_required` response and the client
prompts a soft reload ("The textbook was just updated -- refresh to continue").
No generation is attempted against a stale anchor; the author can deploy
mid-evening without producing confusing failures in open tabs.

---

### Q14: Cost Model (Estimate)

The spec sets a $5/student budget (Q5) and tiers models by tool (Q3); this
section sanity-checks that those numbers hang together.  Treat every figure as
an order-of-magnitude estimate to validate by measurement, not a guarantee.

**Model pricing** (per million tokens, Anthropic list price, mid-2026 -- re-check
before launch):

| Tier | Model | Input | Output |
|------|-------|-------|--------|
| Cheap | Claude Haiku 4.5 (`claude-haiku-4-5`) | $1 | $5 |
| Mid | Claude Sonnet (`claude-sonnet-5`; intro $2 / $10 through 2026-08-31) | $3 | $15 |
| Reserve | Claude Opus 4.8 (`claude-opus-4-8`) | $5 | $25 |

The tool -> tier assignments live in Q3 (Haiku for example/fun/quiz/summarize,
Sonnet for justify/counterexample/intuition/applet/chat).

**The caching architecture is the heart of the cost model** (Decisions 52-53).
Every request is assembled as `[shared prefix: core prompt + chapter text +
ToC] -> cache breakpoint -> [creature instructions + selection +
conversation]`.  The shared prefix is identical for every student and every
creature on a chapter, so the whole class shares ONE cache entry per chapter
(~15-25K tokens), plus one for the full book (~120-150K, amp-up chat only).
Cache entries use the **1-hour TTL**, and every hit resets the clock -- so an
evening of study traffic keeps a prefix warm off a single write.

**Two ledgers -- instructor pays for warmth, students pay for usage**
(Decision 53).  There is no separate "warmup" request.  Every Claude response
reports its usage split (cache-written / cache-read / fresh / output tokens);
the backend's ledger applies one rule:

- **Student ledger:** priced *as if the cache were warm* -- the ~0.1x cache-read
  rate on the prefix portion, plus their own per-request tokens and the output.
  Every student pays the same regardless of arrival order; nobody is dinged for
  being first of the night.
- **Instructor ledger:** the cache-write premium, whenever a request happens to
  be the one that (re)warms a cold prefix.  Purely usage-driven: a quiet day
  costs $0, a due-date evening costs a handful of writes.

Instructor exposure (Sonnet, 1h TTL): ~$0.11 per chapter cold-start, ~$0.68 per
full-book cold-start; a busy evening with all chapters active ~= $2-3; semester
~= tens of dollars.  This is the "cost of the textbook being alive."

**Per-generation estimate** (student ledger, chapter prefix warm-priced):

| Tool class | Typical in / out | Model | Est. student cost |
|------------|------------------|-------|-------------------|
| Haiku tool (example, quiz, fun, summarize) | ~20K read + ~1K / ~800 | Haiku | ~$0.007 |
| Sonnet tool (justify, counterexample, intuition, applet) | ~20K read + ~1K / ~1,200 | Sonnet | ~$0.03 |
| Chat turn (chapter scope) | ~20K read + conv. / ~800 | Sonnet | ~$0.015-0.02 |
| Chat turn (full-book amp-up) | ~130K read + conv. / ~800 | Sonnet | ~$0.05-0.06 |

A moderate chapter-scoped conversation lands around **$0.10-0.20 all-in**.

**Budget math:**

- A $5 student budget funds roughly **30-50 real chat conversations** or a few
  hundred one-shot tool generations -- comfortably a semester of use.
- 35 students x $5 = **$175 / semester ceiling** on the student side,
  hard-capped by Q5's enforcement; instructor warmth adds tens of dollars,
  uncapped but self-limiting (it only accrues when students are active).
- Community caching (Q6) drives realized spend *below* the ceiling: approved
  content is generated once and served from the database free thereafter.
- The per-student daily rate limit (Q5) caps a single runaway user.
- Ledger precision: costs are stored in **microdollars** (a ~$0.007 Haiku call
  must not round to 0 or 1 cent) -- see Q12.

**Not a cost factor:** the Batch API's 50% discount doesn't apply (all calls are
interactive / streamed); SageCell is free (Q4); hosting is free-tier initially
(Q7).  The only variable cost is Claude API usage, bounded above by the
invite-code budgets.

**First measured data (2026-07-03, backend slice, live API):** two Haiku
`example` generations on chapter 8 (shared prefix 5,942 tokens, ~420-token
responses): call 1 (cold) wrote the prefix once -- student ledger **2,768
microdollars (~$0.0028)**, instructor warmth 11,290 microdollars (~$0.011);
call 2 (different block, same chapter) read the identical 5,942-token prefix --
student **2,975 microdollars**, no instructor row.  Ledger arithmetic verified
exact.  At these rates a $5 budget is ~1,700 Haiku generations; the estimates
above remain for Sonnet tools and chat until measured.

**Caveat (measured):** models have a *minimum cacheable prefix* -- ~4,096
tokens on Haiku, ~2,048 on Sonnet.  Chapter 4's whole prefix is ~4,216 tokens,
barely above the Haiku floor; a shorter chapter would silently never cache on
Haiku (correct output, full price).  The backend should warn when a chapter
prefix is near the floor; padding the prefix (e.g. with the ToC, which we
include anyway) helps.

**Action:** continue instrumenting real usage (Sonnet tools, chat
conversations) and replace the remaining estimates before committing the $5
default.

---

## 3. Preliminary Architecture Sketch

```
[LaTeX source files]
        |
        v
[Build pipeline: LaTeX -> structured HTML/JSON]
        |
        v
[Static assets: HTML, JS, CSS, structured content]
        |
        v
[Svelte SPA (static build served by Python backend)]
   |         |          |
   v         v          v
[SageCell]  [AI API]  [Cache/Backend]
            (Claude/   (auth, token mgmt,
             OpenAI)    cached AI content)
```

---

## 4. Decision Log

| # | Decision | Date |
|---|----------|------|
| 1 | SageMath interactives use SageCell server (sagecell.sagemath.org) | 2026-07-01 |
| 2 | Author writes content in LaTeX; converted to web content at build time | 2026-07-01 |
| 3 | Replicability via spec + reference implementation, not forkable codebase (Q9) | 2026-07-01 |
| 4 | Python backend (Flask/FastAPI) + SQLite; self-contained (Q2, Q7) | 2026-07-01 |
| 5 | Hybrid caching with review workflow; content in SQLite (Q6) | 2026-07-01 |
| 6 | Creatures inhabit whitespace (margins + between blocks), not just margins (Q11) | 2026-07-01 |
| 7 | Hand-drawn pencil-crayon art style; CSS sprite animation ~10 frames (Q11) | 2026-07-01 |
| 8 | Creature appearance reflects review status: young/wise/uncertain (Q11) | 2026-07-01 |
| 9 | Accessibility: quiet mode (icons), screen reader labels, keyboard nav (Q11) | 2026-07-01 |
| 10 | LaTeXML for LaTeX-to-web conversion (Q1) | 2026-07-02 |
| 11 | Anthropic Claude as AI provider; Haiku for simple tools, Sonnet for complex (Q3) | 2026-07-02 |
| 12 | Stream all AI responses via SSE (Q3) | 2026-07-02 |
| 13 | Context = current section + prior chapter sections; full textbook for chat (Q3) | 2026-07-02 |
| 14 | Invite codes for student auth; per-student budgets; persistent cookie session (Q5) | 2026-07-02 |
| 15 | Bring-your-own-API-key as secondary option (Q5) | 2026-07-02 |
| 16 | Local editor + git push; GitHub Actions builds and deploys (Q8) | 2026-07-02 |
| 17 | Content anchoring by exact hash; fuzzy match for re-anchor suggestions only (Q8) | 2026-07-02 |
| 18 | Failed builds deploy last good build + email notification (Q8) | 2026-07-02 |
| 19 | AI content always on pastel background; author content on normal background (Q11) | 2026-07-02 |
| 20 | Standard LaTeX principle: no special markup required in .tex source (Q11) | 2026-07-02 |
| 21 | Dragon-worm creature for worked examples; lies in gap, expands in situ (Q11) | 2026-07-02 |
| 22 | No scaffolding: no ghost creatures or pre-placed slots; creatures appear only where content was generated (Q11) | 2026-07-02 |
| 23 | Tools ARE creatures: select text, tool-creatures flutter up, click one to activate (Q3/Q11) | 2026-07-02 |
| 24 | Two result patterns: in situ (pastel bg) or side panel (chat, test me) (Q3) | 2026-07-02 |
| 25 | Chat is a creature; opens side panel with selection as context; eureka capture (Q3) | 2026-07-02 |
| 26 | Creatures are pre-filled prompts users can edit; leverage AI, don't shoehorn (Q3) | 2026-07-02 |
| 27 | One-shot with refinement (replaces, not accumulates); final version cached (Q3) | 2026-07-02 |
| 28 | Counterexample and intuition creatures added to lineup (Q3) | 2026-07-02 |
| 29 | Fun mode is a creature, not global toggle; random comic style (Q10) | 2026-07-02 |
| 30 | Detail dial and summarize dropped; covered by chat or prompt editing (Q3) | 2026-07-02 |
| 31 | Octopus for counterexample; raven for quiz; salamander for eureka (Q11) | 2026-07-02 |
| 32 | 5-color palette: green, gold, teal, red, warm grey on aged parchment (Q11) | 2026-07-02 |
| 33 | Grimoire aesthetic: Voynich + illuminated manuscript + Deyrolle naturalist, scribble style (Q11) | 2026-07-02 |
| 34 | AI content boxes: modern, simple, black-lined, rounded corners (Q11) | 2026-07-02 |
| 35 | Firefly for intuition; spider for summarize (section-level only) (Q11) | 2026-07-02 |
| 36 | Scope filtering: text selection shows 7 creatures, section click shows 5 (Q3/Q11) | 2026-07-02 |
| 37 | Specialized creatures justified by: purpose-built prompts + teaching reading habits (Q3) | 2026-07-02 |
| 38 | Svelte for frontend framework (Q13) | 2026-07-02 |
| 39 | .tex source reviewed; LaTeXML compatible with minor workarounds (Q1) | 2026-07-02 |
| 40 | Database schema designed; student inputs never stored (privacy principle) (Q12) | 2026-07-02 |
| 41 | Chat conversations ephemeral; only eureka artifacts persisted (Q12) | 2026-07-02 |
| 42 | Simple admin password for dashboard auth (Q12) | 2026-07-02 |
| 43 | EB Garamond font; small caps headings; math rendering (KaTeX, later superseded by Decision 49) (Q11) | 2026-07-02 |
| 44 | Frontend is a plain Svelte SPA built with Vite; static assets served by the Python backend, no Node runtime in production (Q13) | 2026-07-02 |
| 45 | Base textbook served as pre-rendered LaTeXML HTML; Svelte hydrates an interaction layer over it, anchored to block hashes (Q13) | 2026-07-02 |
| 46 | Dark mode via CSS custom properties: warm near-black parchment, lower-lightness accents, pastel washes as accent tints (Q13) | 2026-07-02 |
| 47 | Server is the sole cache writer; BYO keys proxied per-request and never stored; no direct browser->Anthropic path (Q5/Q6) | 2026-07-03 |
| 48 | Moderate everything: all AI content tagged with its invite code and instructor-approved before public; creator sees their own immediately (Q6/Q12) | 2026-07-03 |
| 49 | Base math as native MathML (browser MathML Core, no JS, arXiv-style); AI math via client-side Temml (LaTeX->MathML); one pinned math webfont sized to the body; supersedes KaTeX (Q11/Q13) | 2026-07-03 |
| 50 | Reader pages are chapters: build splits at top-level \section via latexmlpost --split (~9 long scrolling pages); ToC jumps use xml_id anchors (Q13) | 2026-07-03 |
| 51 | Chat context is chapter-scoped + ToC, same as other tools; chat panel has a labeled "amp up" toggle for full-textbook context (Q3) | 2026-07-03 |
| 52 | Shared-prefix cache discipline: [core prompt + voice + chapter text + ToC] before the breakpoint, everything per-creature/per-student after; prefix byte-identical, no volatile content; one entry serves all creatures and all students (Q3/Q14) | 2026-07-03 |
| 53 | Instructor-funded cache warmth via billing attribution: 1-hour TTL; students priced as-if-warm (cache-read rate), the write premium lands on an instructor ledger; no scheduled warmups; ledgers in microdollars (Q14/Q12) | 2026-07-03 |
| 54 | FastAPI (not Flask): async server so long-lived SSE streams never block the reading experience (Q2) | 2026-07-03 |
| 55 | Guardrails are pedagogy, not police: prompts steer toward hints and self-discipline; integrity is course policy + visibility, never enforcement or surveillance (Q3) | 2026-07-03 |
| 56 | Quiet mode (typed icons) is the base UI, built and shipped first; creatures are progressive enhancement as art lands; launch roster = example, intuition, chat, quiz (Q11) | 2026-07-03 |
| 57 | Auth hardening: SameSite=Lax session cookie, rate-limited code entry, admin lockout; "FERPA-clean" softened to privacy-preserving (Q5) | 2026-07-03 |
| 58 | Data retention: usage_log + sessions dropped and codes revoked at semester end; approved content persists (Q12) | 2026-07-03 |
| 59 | No curated voice samples: the chapter text in every prefix is the voice exemplar; system prompt carries an explicit imitation instruction naming 2-3 stylistic traits (Q3) | 2026-07-03 |
| 60 | Heavy editing is the normal case: documented authoring loop (snapshot diff as edit receipt, baselines committed with source); generate requests carry build_version and stale tabs get a refresh prompt, never a silent failure (Q8/Q13) | 2026-07-03 |
| 61 | AI content's resting state is a small collapsed chip at its anchor (the quiet-mode analog of the creature settling); dismissing collapses, never deletes; fresh generations open, everything else rests collapsed on load (Q11/Q13) | 2026-07-03 |
| 62 | Try-it-yourself solutions are wrapped in [[solution]]...[[/solution]] markers by the AI and rendered as a "Show solution" toggle -- attempt-first pedagogy (Q3, extends Decision 55) | 2026-07-03 |
| 63 | AI output rendering: minimal markdown subset (italic, bold, simple lists) rendered client-side; headings always demoted to bold; prompts forbid heading/step scaffolding (Q13) | 2026-07-03 |
| 64 | Deferred: students selecting AI-generated text to summon tools on it (would anchor to the parent block, tagged derived) -- revisit after chat lands, which covers most of the need (Q3) | 2026-07-03 |
| 65 | Chat panel design: side panel PUSHES the reading column (never overlays); left/right-aligned transcript without messenger bubbles (student right/narrow/tinted, cat left/full-width for math); context selector "Reading: this chapter / the whole book" with an honest cost hint, toggleable mid-conversation with a transcript note; standing ephemerality signage; selecting text while open quotes it INTO the conversation, plus an explicit new-conversation button; quiz reuses the same panel (teal, raven opening) (Q3/Q13) | 2026-07-03 |
| 66 | Chat and quiz turns are never written to cached_content and carry no content_id -- conversation history lives only in the client and is resent per turn (corollary of Decisions 41/48); budget/ledger accounting still applies per turn (Q12/Q14) | 2026-07-03 |
| 67 | An AI artifact shows its originating phrase: cached content returns `selection_text`, the expanded box opens with a muted "On: ...quote..." line, and the chip tooltip carries it -- essential for later readers who never made the selection (Q3, first-user feedback) | 2026-07-04 |
| 68 | Students can HIDE an AI item (per-reader, client-only in localStorage -- the artifact stays server-side for everyone else); a quiet "Show N hidden AI items" control always restores them; regenerating an item un-hides it. Reading measure fixed to an arXiv-ish column (was accidentally full-window from a CSS specificity bug) at a slightly larger body/math size. The chat panel's explicit "new conversation" button (Decision 65) was removed as not useful enough -- close-and-reselect covers it (Q11, first-user feedback) | 2026-07-04 |
| -- | DEFERRED nicety (do not lose): when an AI box is opened, best-effort HIGHLIGHT the originating phrase in the reading text itself (soft wash while open). Brittle across MathML selections, so must degrade silently; ships after more pressing polish (extends Decision 67) | 2026-07-04 |

---

## 5. Remaining Work

**Not yet built:**

- [x] **LaTeX-to-web pipeline** -- BUILT: preprocess -> latexml -> manifest
  (817 hashed, anchored blocks) -> HTML, 0 errors, regression-gated
  (`pipeline/check.sh`); chapter-split output per Decision 50.
- [ ] **Creature art generation** -- take descriptions to an image generator
  and iterate on style (prompts ready in `creature_art_prompts.md`; workflow in
  `creature_art_HOWTO.md`).  Launch needs only the four Decision-56 creatures --
  quiet-mode icons ship first regardless.
- [ ] **Detailed prompt engineering** -- craft per-creature system prompts
  (voice via imitation instruction, Decision 59 -- no sample curation needed).

**Resolved** (full details in the referenced sections):

- **Section selection** (Q3) -- clickable section numbers, scope-filtered
  creature set.
- **Typography** (Q11) -- EB Garamond, small caps headings.
- **Database schema** (Q12) -- designed; student inputs never stored.
- **Frontend framework** -- Svelte; full architecture in Q13.
- **Dark mode** (Q13) -- warm near-black parchment, lower-lightness accents,
  pastel washes as low-opacity accent tints.
- **Existing-textbook review** (Q1) -- 7,100 lines, 8 sections, ~102 theorem
  environments; LaTeXML-compatible with minor workarounds.
