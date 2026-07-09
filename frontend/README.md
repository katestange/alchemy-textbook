# Frontend (vertical slice)

Plain **Svelte + Vite** SPA (no SvelteKit, no Node runtime in production --
Decision 44) that hydrates an interaction layer over the pre-rendered
LaTeXML chapter HTML (Decision 45).  All eight tool-creatures are now wired
end-to-end: six **in-situ** creatures (example, intuition, justify,
counterexample, fun, applet) stream into result boxes via `/api/generate`, and
**chat** and **quiz** run as live conversation panels (`ChatPanel.svelte`,
Decisions 65/74) — the earlier "coming soon" state is gone. Summarize and
section-scoped selection remain unbuilt (Decisions 80/36).

## Scaffold

- **Vite** 5.4 + **Svelte** 4.2 + `@sveltejs/vite-plugin-svelte` 3.1 (all
  Node-18-compatible; `npm create vite@latest` currently requires Node
  >=20.19, so this project was hand-scaffolded instead).
- **Vitest** 1.6 + **jsdom** 24 for the pure-logic test suite.
- **Temml** 0.11 for client-side LaTeX -> MathML (base textbook math is
  already native MathML in the LaTeXML HTML and needs no library --
  Decision 49).
- **@fontsource/eb-garamond** 5.2 -- EB Garamond self-hosted as a real local
  `@font-face` (bundled at build time, not fetched from Google Fonts/any CDN
  at runtime -- required, since CSP forbids third-party origins). Falls back
  to Iowan Old Style / Palatino / Georgia / serif.
- `src/styles/latexml.css` and `src/styles/ltx-article.css` are verbatim
  copies of `build/LaTeXML.css` / `build/ltx-article.css` (structural styles
  for theorem/definition/proof/figure/table markup), imported before
  `theme.css` so the parchment palette + typography still wins.

## Dev workflow

```bash
cd frontend
npm install

# Terminal 1: the real backend (owned by the backend agent), OR the
# included mock for a UI-only smoke check:
python ../backend/app.py            # real thing, expected on :8000
# -- or --
npm run mock-server                 # tiny canned-response stand-in, :8000

# Terminal 2:
npm run dev                         # Vite dev server on :5173, proxies
                                     # /api, /chapter, /book -> :8000
```

Open http://localhost:5173. Enter any code at the code-entry screen (the
mock backend accepts anything non-empty); the real backend will validate
against `invite_codes`.

## Build

```bash
npm run build     # -> dist/ (static assets; backend serves these + its API)
npm run preview   # serve dist/ locally to sanity-check the production build
```

Last verified build: `dist/` ~1.3 MB total (dominated by EB Garamond's
per-script-subset woff/woff2 files; a browser only ever fetches the
`unicode-range` subsets it needs, so real network cost per reader is much
smaller -- typically just the `latin` + `latin-ext` subsets, roughly 90 KB
gzipped combined). JS bundle ~229 KB (~70 KB gzip), CSS ~26 KB (~6 KB gzip).

## Tests

```bash
npx vitest run
```

Covers the three pieces of pure logic pulled out specifically so they're
testable without a DOM/network:

- `src/lib/sse.js` -- incremental SSE (text/event-stream) frame parser
  (`tests/sse.test.js`): chunk-boundary splitting, multi-line `data:`,
  comments, CRLF, missing trailing blank line (`flush()`), default event
  name, error events.
- `src/lib/mathSegmenter.js` -- the `$...$` / `$$...$$` buffering rule
  (`tests/mathSegmenter.test.js`): closed inline/display spans, an unclosed
  trailing span rendered as literal text until it closes, escaped `\$`,
  multiple spans, mixed display+unclosed.
- `src/lib/selectionWalker.js` -- selection -> block-id ancestor walk
  (`tests/selectionWalker.test.js`, using jsdom): id on the node itself vs.
  several ancestors up, text-node start, nearest-vs-outer id when nested,
  no match, and the non-anchorable-block case (`resolveSelectionAnchor`
  returns `null`).

- `src/lib/solutionSegmenter.js` -- the `[[solution]]`/`[[/solution]]`
  marker segmentation (`tests/solutionSegmenter.test.js`, Decision 62): no
  markers, a complete block, multiple blocks, and the streaming edge (an
  opener with no close yet comes back `closed: false` so the caller can show
  a placeholder instead of the partial answer).
- `src/lib/markdown.js` -- the minimal AI-output markdown subset
  (`tests/markdown.test.js`, Decision 63): `**bold**`, `*italic*`, simple
  `- ` lists, and heading lines (`#`..`######`) demoted to a bold paragraph
  (never an `<h1>`-`<h6>`).
- `src/lib/mathRender.js` -- the full render pipeline end to end
  (`tests/mathRender.test.js`): the HTML-escape-before-markdown security
  invariant, math segments left untouched by markdown (a literal `*` inside
  `$...$` never becomes `<em>`), `[[solution]]` blocks rendering as a reveal
  toggle, and the streaming-vs-finalized behavior for an unclosed solution
  marker.
- `src/lib/inSituResult.js` -- the collapsed-chip resting state
  (`tests/inSituResult.test.js`, Decision 61, jsdom): fresh generations start
  expanded, hydrated/existing content starts collapsed, the chip expands on
  click, the box's dismiss control collapses (never removes) the item, two
  creature types on one block get separate chips in one cluster, and
  `removeResultItem` (used only for a budget-exceeded generation that never
  produced content) removes the pair entirely.

Run `npx vitest run` for the current suite (see `tests/` for the full set,
which has since grown to cover the desmos/geogebra/sagecell applet helpers and
the chat conversation-assembly logic).

## Manual smoke check (optional)

`mock-server/server.js` is a dependency-free Node `http` server implementing
just enough of the contract to drive the full UI: `/api/manifest` (proxies
`build/manifest.json`, stamping a `build_version`), `/api/chapters`,
`/chapter/:n` (proxies `build/html/S:n.html`), `/api/claim` (accepts any
code), `/api/content/:hash` (returns a canned "approved" example AND a
canned "approved" intuition for the first anchorable block's hash -- so the
two-chips-side-by-side cluster has something to render on load -- `[]`
otherwise), and `/api/generate` (streams canned SSE deltas per
`creature_type`: the example one includes inline math split *across* two
deltas, display math split across two more, a `[[solution]]` block split
across a delta boundary, and a markdown list, to exercise chunk-boundary
handling, math-buffering, the solution toggle, and markdown all under
realistic streaming; the intuition one is plain markdown with inline math
and no solution marker).

```bash
npm run mock-server   # :8000
npm run dev            # :5173, in another terminal
```

This was used during development to confirm, over real HTTP through the
Vite proxy, that: the SSE parser reassembles frames split across chunk
boundaries, and the math segmenter correctly withholds `$a` and `$$a^2 + b`
as literal text until their closing delimiters arrive in a later delta, then
promotes them to real math segments on the next re-render.

## Architecture notes

- **Reader flow:** code entry (`/api/claim`) -> chapter picker (`/api/manifest`
  + `/api/chapters`, chapters = top-level sections per Decision 50) ->
  reading pane (`/chapter/{n}` injected via `{@html}`).
- **Selection -> block mapping:** `src/lib/manifestMap.js` builds an
  `xml_id -> block` `Map` once per manifest load (including non-anchorable
  blocks, so the walker can positively recognize-and-ignore them rather than
  silently matching some unrelated ancestor). `src/lib/selectionWalker.js`
  walks from `range.commonAncestorContainer` up to the nearest element with
  a mapped id; `ReadingPane.svelte` wires this to `mouseup`.
- **In-situ result box:** `src/lib/inSituResult.js` is *not* a Svelte
  component -- the anchor element lives inside HTML injected via `{@html}`,
  a subtree Svelte doesn't own, so the result box is inserted as a plain DOM
  sibling (`insertAdjacentElement('afterend', ...)`) and its contents are
  updated with plain `innerHTML` on every delta.
- **Math buffering:** `src/lib/mathRender.js` re-segments the *entire*
  accumulated text on every delta (`segmentMathSpans`, see above) and joins
  escaped-text + Temml-rendered-MathML pieces into one HTML string, which
  becomes the result box's `innerHTML`. This is the "simplest correct"
  approach named in the brief: cheap because these are short one-shot
  responses, and it trivially avoids double-rendering the same span twice.
- **Hydrating existing content (spec step 5, deliberate tradeoff):** the app
  does **not** sweep all ~817 manifest hashes on chapter load. It fetches
  `/api/content/{hash}` only (a) when the user selects a block (see
  `hydrateExistingContent` in `ReadingPane.svelte`) and (b) implicitly, by
  virtue of the just-generated content already being in view, when a
  generation completes. This is called out again at both the code site
  (`api.js`) and here, as instructed.
- **Errors:** `refresh_required` sets a non-dismissable `refreshRequired`
  store (Decision 60) rendered as a sticky top banner with a reload button;
  `budget_exceeded` sets a dismissable `budgetNotice`; `auth_required` calls
  `session.reset()`, returning to the code-entry screen.
- **State:** three small Svelte stores -- `session` (claim state + budget),
  `manifestStore` (sections/blocks/blockMap/buildVersion/chapters), and the
  banners in `stores/banners.js`. No external state library, per spec.

## API contract summary (as implemented against)

| Method & path | Purpose |
|---|---|
| `GET /api/manifest` | `{ build: {..., build_version}, sections: [...], blocks: [...] }` |
| `GET /api/chapters` | `{ "1": "S1.html", ..., "9": "S9.html" }` |
| `GET /chapter/{n}` | HTML for chapter `n`; content blocks carry `id`s matching manifest `xml_id`s; math is native `<math>` MathML |
| `POST /api/claim` | `{code}` -> sets session cookie, `{ok, budget_remaining_microdollars}` |
| `GET /api/content/{block_hash}` | `[{id, creature_type, response, status, created_at, own}, ...]` |
| `POST /api/generate` | `{creature_type, block_hash, selection_text, prompt, build_version}` -> SSE: `event: delta` `{text}`, terminal `event: done` `{content_id, cost_microdollars, ...}` or `event: error` `{code}` |

`code` is one of `refresh_required`, `budget_exceeded`, `auth_required`,
`unknown_block` (see Error handling above).

## Contract ambiguities hit while building (flag for the integrator)

1. **`/chapter/{n}` -- full document vs. fragment.** `build/html/S*.html`
   (LaTeXML's own `--split` output) is a *complete* standalone HTML document
   (`<!DOCTYPE>`, `<head>`, `<body>`), not a bare content fragment. The
   contract doesn't say whether the real backend re-serves that whole
   document or extracts just the body. The frontend handles **both**
   transparently: `ReadingPane.svelte` parses the fetched text with
   `DOMParser` and injects `doc.body.innerHTML` either way (a no-op if the
   response was already a bare fragment). Worth confirming which the real
   backend does, since if it's the full document, `<head>`/`<title>`
   content and any `<link rel=stylesheet>` in it are silently dropped by
   this approach -- intentionally, since we bring our own copies of the
   LaTeXML CSS (see above) and don't want a `<title>` clobbering the SPA's.
2. **`GET /api/content/{block_hash}` and "own".** The contract's example
   payload includes an `own` field per entry but doesn't define its type
   precisely; this frontend treats it as truthy/falsy (`e.own`). If the real
   backend omits it for anonymous/non-owner rows rather than sending
   `false`, the current filter (`status === 'approved' || e.own`) still
   works correctly either way.
3. **Budget display after generation.** ~~`event: done` carries
   `cost_microdollars` but not an updated `budget_remaining_microdollars`.~~
   **Resolved:** the real backend's `done` event now carries the authoritative
   `budget_remaining_microdollars` (as well as `cost_microdollars`), so the
   client no longer has to approximate by subtracting locally.
4. **No `session`/`whoami` endpoint.** ~~There's no documented way to ask "am
   I still logged in?" on a fresh page load.~~ **Resolved:** `GET /api/whoami`
   exists — it reports `{ ok, budget_remaining_microdollars, is_admin }` from
   the HttpOnly session cookie, and `App.svelte` calls it on load so a reload
   restores the session instead of bouncing to the code-entry screen.

## Collapsed-chip resting state, solution toggle, markdown, intuition (Decisions 61-64)

- **Resting state (Decision 61).** `src/lib/inSituResult.js` groups every
  artifact anchored to a block into one flex-wrap `.ai-cluster` sibling of
  the anchor, each holding an `.ai-item` (chip + box) pair keyed by
  `creatureType:contentHash`. A fresh generation (`ReadingPane.submitPrompt`)
  opens its item expanded and streams into the box; the box's `✕` control
  now collapses the item back to its chip (`ai-chip`, pale creature-tint
  pill with a status dot) rather than removing it -- content is never lost,
  only rested, addressing the author's #1 first-user-test complaint.
  Content surfaced via `hydrateChapterContent` (chapter load) or
  `hydrateExistingContent` (on text selection) always starts collapsed
  (book-first, Q11); clicking a chip expands it. Multiple artifacts on one
  block (e.g. an example and an intuition) get one chip each, side by side,
  via `.ai-item.expanded { flex-basis: 100% }` forcing an open item onto its
  own row while collapsed chips stay inline.
- **`[[solution]]` reveal toggle (Decision 62).** `src/lib/solutionSegmenter.js`
  splits streamed text on the example creature's `[[solution]]`/
  `[[/solution]]` markers; `src/lib/mathRender.js` renders a closed block as
  a "Show solution ▸" toggle (math inside renders normally when revealed),
  and shows a subdued "…solution being written" placeholder for an opener
  with no close yet **while streaming** (`updateResultBox(box, text, {
  streaming: true })`). The `done` SSE handler in `ReadingPane.svelte`
  re-renders once more with `streaming: false` so a marker that never closed
  still finalizes into a normal toggle instead of staying a placeholder
  forever.
- **Minimal markdown subset (Decision 63).** `src/lib/markdown.js` applies
  `**bold**`/`*italic*`/simple `- ` lists to non-math text segments only
  (math is segmented out first by the existing `mathSegmenter.js`, so a
  literal `*` inside `$...$` is never touched). Any heading line is demoted
  to a bold paragraph, never an `<h1>`-`<h6>`. All source text is
  HTML-escaped (`escapeHtml`, exported from `mathRender.js`) before any
  markdown/toggle/chip tags are added anywhere in this box -- the only
  non-Temml HTML in it is tags this code emits itself.
- **Intuition creature enabled.** `SelectionToolbar.svelte`'s "Int." chip is
  now enabled (gold/ochre tint, matching the firefly per Q11); its default
  prompt is "Explain the intuition behind this." (Q3), and it reuses the
  same generate/hydrate/chip flow as example. (Justify, counterexample, fun,
  and applet were subsequently enabled the same way; Chat and Quiz are now live
  conversation panels, no longer "coming soon".)

## Known slice limitations (by design, per the brief)

- All eight tool-creatures are wired: six in-situ (example, intuition, justify,
  counterexample, fun, applet) plus live chat and quiz conversation panels.
  (This bullet previously said only example/intuition were wired — no longer
  true.) Summarize is not built (Decision 80).
- No refinement flow (clicking a settled result to re-open the prompt box)
  -- out of scope for this pass.
- No creature *art* / animation -- quiet mode (typed icon chips, now with a
  collapsed/expanded resting state per Decision 61) **is** the entire UI
  right now, per Decision 56; there's nothing to toggle yet.
- Section-number click -> section-scoped creature cluster is not
  implemented (only text-selection -> text-scoped cluster).
- The collapsed/expanded state of an item, and any revealed `[[solution]]`
  toggle inside it, is reset to its default on the next full re-render of
  that box's contents (each SSE delta, or a later hydrate call for the same
  key). In practice this only matters if a reader opens a solution toggle
  while later content is still streaming in underneath it -- an accepted
  edge case given these are short, one-shot responses and the box already
  re-renders wholesale on every delta (see `updateResultBox`).
