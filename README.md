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
textbook_source/         Canonical source: the LaTeX book + its images
pipeline/                Deterministic .tex -> web build
  preprocess.py            .tex  -> LaTeXML-safe copy (fixes/shims, logged)
  postprocess.py           LaTeXML XML -> JSON content manifest (typed, hashed)
  build.sh                 orchestrates: preprocess -> latexml -> manifest -> HTML
creature_art_prompts.md  Image-generation prompts for the ten creatures
creature_art_HOWTO.md    How to turn those prompts into usable sprites
HELPCLAUDE.txt           Host/root setup: toolchain install + API key
GIT_SETUP.md             How this repo was set up + how to push to GitHub
build/                   Generated artifacts (git-ignored; regenerable)
```

## Building the web content

Prerequisites (LaTeXML, TeX, Python, Node) are installed per
[`HELPCLAUDE.txt`](HELPCLAUDE.txt). Then:

```bash
bash pipeline/build.sh
```

This produces, in `build/`:

- `book.xml` — LaTeXML semantic XML
- `manifest.json` — content blocks with type, section, stable content hash, and
  preview (what the AI tools and cache anchor to)
- `book.html` — rendered reader HTML

The author's source is never modified; all fixes live in the pre-processor.

## Tech stack (see spec for rationale)

LaTeXML → structured HTML/JSON · Python (Flask/FastAPI) + SQLite backend ·
Svelte SPA frontend · KaTeX · SageCell for interactives · Anthropic Claude API
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
