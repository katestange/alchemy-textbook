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

**Decision:** Option (b) -- **Python backend (Flask or FastAPI) with SQLite.**

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
- **System prompt:** role, tool-specific instructions, author voice samples,
  output format constraints.
- **Textbook context:** the current section + all prior sections in the current
  chapter.  This means the AI "has read what the student has read."
- **For chat only:** full textbook (so it can reference later material and
  give a complete picture).
- **User's selection:** the specific text the user highlighted or the scope
  they indicated.

More context = better answers but higher cost.  The per-chapter approach is the
sweet spot for most tools.  Monitor costs and adjust if needed.

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
2. **Author voice samples:** A few paragraphs of the author's writing showing
   her explanatory style.  For fun mode, samples of the comic tone.  These
   samples will be iterated on during development.
3. **Tool-specific instructions:** what to produce, at what level, in what
   format.
4. **Output format:** "Render all math as LaTeX between `$...$` (inline) or
   `$$...$$` (display).  For SageMath code, produce valid Sage code that runs
   in a SageCell widget."
5. **Guardrails:** don't solve homework problems outright (for "test me" and
   chat); encourage the student to think.

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
  usage.  This keeps the application FERPA-clean.
- Student enters code once in the browser.  Browser receives a session token
  stored in an HttpOnly cookie (secure against XSS).  Cookie persists until
  end of semester or revocation.
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
- Key stored in browser localStorage, never sent to the server.
- AI calls go directly from the browser to the Anthropic API using the SDK's
  explicit browser-access mode (`dangerouslyAllowBrowser` / the
  `anthropic-dangerous-direct-browser-access` header).  This is acceptable
  *only* because the key is the user's own -- the instructor key is never
  exposed this way.  Alternatively the call is proxied through the backend,
  which forwards it without persisting the key.
- Generated content is still cached to the database for all users.
- This is a secondary option, not prominently featured -- most students will
  use invite codes.

---

### Q6: Caching and Community-Generated Content

**Core idea:** When any user generates AI content (an example, a justification,
an applet, etc.), it is cached and made available to all future readers --
including those not logged in.  The textbook *grows* with usage.

**Decision:** Hybrid caching with review workflow.

**Content lifecycle:**
1. User generates AI content (example, justification, remark, applet, etc.).
2. Content is stored in the database, keyed to the nearest semantic unit in
   the textbook (section, definition, theorem, paragraph).  Immediately
   visible to all users, marked as **unreviewed**.
3. Any user can **flag** content for errors, with a comment.
4. Instructor **reviews** via a dashboard: approve, edit, or remove.
5. The best approved content remains as permanent supplementary material
   alongside the base textbook.

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
  after each build that changes the content structure.

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
small caps variant.  Math rendered by KaTeX (using its default fonts, which
pair well with Garamond).

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

**Tables:**

**`invite_codes`** -- auth and budgets

| Column | Type | Notes |
|--------|------|-------|
| `code` | TEXT PRIMARY KEY | e.g. "CRYPTO-7X4M-Q2" |
| `budget_cents` | INTEGER | Total budget in cents |
| `spent_cents` | INTEGER DEFAULT 0 | Running total |
| `daily_limit_cents` | INTEGER | Safety cap per day |
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
| `cost_cents` | INTEGER | What this generation cost |
| `status` | TEXT DEFAULT 'unreviewed' | "unreviewed", "approved", "flagged", "removed" |
| `created_at` | TIMESTAMP | |
| `section_id` | TEXT | Section from content manifest |

Note: no `prompt` column, no `created_by_code` -- student inputs and
identity are not stored.  Cost tracking for budget enforcement is in
`usage_log` only.

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
| `code` | TEXT REFERENCES invite_codes | |
| `creature_type` | TEXT | |
| `cost_cents` | INTEGER | |
| `section_id` | TEXT | |
| `created_at` | TIMESTAMP | |

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
else follows from earlier decisions (KaTeX and creature art in Q11, SSE
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
/section/<id>         pre-rendered LaTeXML HTML for one section
/manifest             JSON: blocks, hashes, section tree, block types
/content/<hash>       cached AI artifacts anchored to a block
/api/generate (SSE)   streamed AI generation for a creature
```
The SPA fetches the section HTML + manifest, injects the HTML into the reading
pane, then walks the manifest to wire up selection handling and to place any
cached creatures that already exist for the loaded section.

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

**Math rendering:** KaTeX (Q11).  Base-textbook math is rendered on load (or
pre-rendered at build for speed).  **Streamed** AI math is rendered
incrementally: the generation store withholds a `$...$` or `$$...$$` span from
KaTeX until its closing delimiter arrives, so half-typed formulas never flash
(matches the streaming note in Q3).

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
`/api/generate`, taking `{ creature_type, block_hash, selection_text, prompt }`;
auth is the HttpOnly session cookie (Q5); the backend runs the budget check
before opening the stream and emits a terminal "budget exceeded" event if the
cap is hit (Q5).  Cached content is plain JSON from `/content/<hash>`.

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

**Per-generation estimate.**  Context per call = system prompt + author-voice
samples + current section + prior sections in the chapter (Q3): ballpark 3-8K
input tokens, 300-1,500 output tokens for an in-situ tool.

| Tool class | Typical in / out | Model | Est. cost |
|------------|------------------|-------|-----------|
| Haiku tool (example, quiz, fun, summarize) | ~5K / ~800 | Haiku | ~$0.01 |
| Sonnet tool (justify, counterexample, intuition, applet) | ~6K / ~1,200 | Sonnet | ~$0.035 |
| Chat turn (full-textbook context) | ~40-80K / ~1,000 | Sonnet | ~$0.15 uncached; **~$0.02 cached** |

**Prompt caching is the dominant lever.**  The textbook context is stable
across calls, so caching the shared prefix (system prompt + voice samples +
textbook context) cuts its input cost by ~90% on every repeat.  For chat
especially -- full-textbook context -- caching is the difference between viable
and not.  The backend should cache-tag that stable prefix on every call.

**Budget math:**

- At a blended ~$0.02 / generation (caching on, mixed tiers), a $5 student
  budget funds ~250 generations -- comfortably a semester of exploratory use.
- 35 students x $5 = **$175 / semester ceiling**, hard-capped by Q5's
  enforcement.
- Community caching (Q6) drives realized spend *below* the ceiling: popular
  content is generated once and served free thereafter.
- The per-student daily rate limit (Q5) caps a single runaway user.

**Not a cost factor:** the Batch API's 50% discount doesn't apply (all calls are
interactive / streamed); SageCell is free (Q4); hosting is free-tier initially
(Q7).  The only variable cost is Claude API usage, bounded above by the
invite-code budgets.

**Action:** instrument real token usage during the prototype phase and replace
these estimates with measured per-tool averages before committing the $5
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
| 43 | EB Garamond font; small caps headings; KaTeX for math (Q11) | 2026-07-02 |
| 44 | Frontend is a plain Svelte SPA built with Vite; static assets served by the Python backend, no Node runtime in production (Q13) | 2026-07-02 |
| 45 | Base textbook served as pre-rendered LaTeXML HTML; Svelte hydrates an interaction layer over it, anchored to block hashes (Q13) | 2026-07-02 |
| 46 | Dark mode via CSS custom properties: warm near-black parchment, lower-lightness accents, pastel washes as accent tints (Q13) | 2026-07-02 |

---

## 5. Remaining Work

**Not yet built:**

- [ ] **Prototype LaTeX-to-web pipeline** -- test LaTeXML with the actual
  `.tex` files; build the post-processor and JSON manifest.
- [ ] **Creature art generation** -- take descriptions to an image generator
  and iterate on style.  Need sprite sheets (~10 frames) per creature per
  status variant.
- [ ] **Detailed prompt engineering** -- craft per-creature system prompts
  with author voice samples.

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
