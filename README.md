# The Alchemy of Mathematical Cryptography — Interactive Textbook

An AI-powered interactive textbook for an undergraduate course on coding theory
and cryptography (University of Colorado Boulder, Prof. Katherine Stange).

It reads and navigates like a traditional textbook — table of contents, linear
narrative, definitions/theorems/proofs/examples — but layers on AI-driven
interactive tools that model the mental work of reading mathematics: generating
examples, testing understanding, adjusting detail, and computing. Those tools
are surfaced as **creatures** that inhabit the whitespace of the page, in a
hand-drawn grimoire aesthetic.

**Status:** design complete; build pipeline working; implementation in progress.

## The spec is the primary artifact

[`spec.md`](spec.md) is the full design — every decision, with rationale. The
project is meant to be **replicable**: another instructor reads the spec, adapts
the decisions to their own course, and builds their own version with AI coding
tools (see spec §Q9). This repository is the reference implementation.

## Repository layout

```
spec.md                  Full design spec (Q1–Q14): pipeline, backend, frontend,
                         auth, caching, creatures, cost model, DB schema
book.toml                Per-book config: title/voice for the AI, source .tex,
                         environment names, invite prefix (edit to adopt a new book)
adopt-book.sh            Guided onboarding for a NEW book: build + accept baselines
ADAPTABILITY.md          Audit + phased plan for running other LaTeX textbooks
notes-to-latex.md        AI prompts: handwritten course notes -> faithful LaTeX
                         (A: chat website, prof crops figures; B: coding agent,
                          crops + compiles itself)
deploy/                  Production hosting: Dockerfile, per-book compose, nginx TLS
.env.example             Deployment secrets/env template (copy to .env)
textbook_source/         Canonical source: the LaTeX book + its images
pipeline/                Deterministic .tex -> web build
  preprocess.py            .tex  -> LaTeXML-safe copy (fixes/shims, logged)
  postprocess.py           LaTeXML XML -> JSON content manifest (typed, hashed)
  solutions.py             stamps solution divs + writes solutions.json (Decision 77)
  build.sh                 orchestrates: preprocess -> latexml -> manifest -> HTML
backend/                 FastAPI backend: auth, SSE generation, /admin dashboard
frontend/                Svelte + Vite SPA (the reader UI)
tests/                   Pipeline (postprocess) tests; frontend tests live in frontend/tests
creature_art_prompts.md  Image-generation prompts for the ten creatures
creature_art_HOWTO.md    How to turn those prompts into usable sprites
HELPCLAUDE.txt           Host/root setup: toolchain install + API key
GIT_SETUP.md             How this repo was set up + how to push to GitHub
build/                   Generated artifacts (git-ignored; regenerable)
```

## Editing the textbook and publishing (the authoring loop)

This is the everyday workflow (spec Decision 60). Edit the LaTeX, then run one
command:

```bash
# from a terminal in the project directory (as the 'claude' user, or as root —
# the script drops privileges itself):
./publish.sh
```

It takes ~5–7 minutes (LaTeXML is the slow part) and does everything:

1. **Rebuilds** the web textbook from `textbook_source/`.
2. **Runs the regression gates.** Three outcomes:
   - **All green** → proceeds silently.
   - **New LaTeXML errors** → **aborts, commits nothing.** Your edit broke
     something; the `+` lines name it, details in `build/latexml.log`. Fix and
     re-run.
   - **Structure/warning diffs** → shows them as your edit's *receipt*
     ("chapter 2: paragraphs 45 → 52…") and asks you to confirm they match
     what you intended. `y` accepts them as the new baseline.
3. **Commits** your source changes together with the updated baselines (so
   every structural change is reviewable in git history), asks for a commit
   message (Enter accepts the default), and **pushes to GitHub**.

Options: `./publish.sh -m "rewrote CRT section"` for the message inline;
`./publish.sh --yes` for non-interactive use (new *errors* still abort).

Notes:
- Only `textbook_source/` + pipeline baselines are committed; any other
  uncommitted work is listed and left alone.
- Content edits never require touching the pipeline. Editing a **preamble**
  `\usepackage` line may trip the fail-closed pre-processor — it aborts with
  instructions rather than hanging the build.
- Once real hosting exists (spec Q7), server deployment hooks in at the end of
  the same script; today, GitHub is the destination.

## Build pieces (what publish.sh drives)

```bash
bash pipeline/build.sh    # rebuild only: preprocess -> latexml -> manifest -> HTML
bash pipeline/check.sh    # rebuild + all gates (errors, warnings, structure)
```

Artifacts in `build/` (git-ignored, regenerable): `book.xml` (semantic XML),
`manifest.json` (817 content blocks with type, section, stable content hash,
DOM anchor — what the AI tools and cache anchor to), `html/S1..S9.html`
(chapter reader pages + `chapters.json`), `book.html` (single-file book),
`solutions.json` (ordered solutions + section tree for the per-solution
visibility dashboard, Decision 77).
The author's source is never modified by the pipeline; the pre-processor
adapts a copy.

## Tech stack (see spec for rationale)

LaTeXML → structured HTML/JSON · Python **FastAPI** + SQLite backend (async, for
SSE streaming; Flask was ruled out — spec Decision 54) · Svelte SPA frontend ·
**native MathML** for the base text with **Temml** (LaTeX→MathML) for AI-generated
math and a bundled Garamond-Math webfont (Decision 49; supersedes the earlier
KaTeX plan) · SageCell / Desmos / GeoGebra for interactives · Anthropic Claude API
(tiered models, streamed) · invite-code auth with per-student budgets.

## Secrets

The backend needs an Anthropic API key in a `.env` file
(`ANTHROPIC_API_KEY=...`). `.env` is git-ignored and must never be committed —
see `HELPCLAUDE.txt` and `GIT_SETUP.md`.

## License

Dual-licensed by the kind of file:

- **Code** — the build pipeline (`pipeline/`), the backend (`backend/`), and any
  other source code — is under the **MIT License** ([`LICENSE`](LICENSE)).
- **Textbook content** — the LaTeX source and images under `textbook_source/`,
  and prose excerpts of the book — is under **CC BY-SA 4.0**
  (Attribution-ShareAlike; [`LICENSE-CONTENT`](LICENSE-CONTENT)).

In short: reuse the code freely with attribution; reuse and adapt the textbook
freely with attribution, but keep derivatives of the textbook under the same
CC BY-SA 4.0 license. © 2026 Katherine Stange.
