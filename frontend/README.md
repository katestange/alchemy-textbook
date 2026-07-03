# Frontend (vertical slice)

Plain **Svelte + Vite** SPA (no SvelteKit, no Node runtime in production --
Decision 44) that hydrates an interaction layer over the pre-rendered
LaTeXML chapter HTML (Decision 45). This slice wires up only the **example**
creature end-to-end; intuition/chat/quiz are visible in the toolbar but
disabled ("coming soon") per Decision 56's launch roster.

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

All 28 tests pass as of this writing (`npx vitest run`).

## Manual smoke check (optional)

`mock-server/server.js` is a dependency-free Node `http` server implementing
just enough of the contract to drive the full UI: `/api/manifest` (proxies
`build/manifest.json`, stamping a `build_version`), `/api/chapters`,
`/chapter/:n` (proxies `build/html/S:n.html`), `/api/claim` (accepts any
code), `/api/content/:hash` (returns a canned "approved" example for the
first anchorable block's hash, `[]` otherwise), and `/api/generate` (streams
canned SSE deltas -- including inline math split *across* two deltas and
display math split across two more, specifically to exercise the
chunk-boundary and math-buffering logic against realistic streaming).

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
3. **Budget display after generation.** `event: done` carries
   `cost_microdollars` but not an updated `budget_remaining_microdollars`.
   The frontend locally subtracts the cost from the last known budget
   (`session.updateBudget`) as an approximation; if the backend later wants
   the authoritative remaining balance reflected immediately (e.g. to catch
   drift from concurrent multi-device usage on the same code), `done` would
   need to carry it explicitly.
4. **No `session`/`whoami` endpoint.** There's no documented way to ask "am
   I still logged in?" on a fresh page load -- only `/api/claim` (POST) is
   specified. This slice's `session` store therefore lives only in memory
   for the current tab/reload cycle; a real reload always falls back to the
   code-entry screen even though the HttpOnly cookie may still be valid
   server-side. A cheap `GET /api/manifest`-succeeds-so-we're-fine check
   isn't quite right either, since anonymous readers can also load the
   manifest. Flagging this as a likely near-term follow-up rather than
   solving it speculatively here.

## Known slice limitations (by design, per the brief)

- Only the **example** creature is wired to `/api/generate`; intuition/chat/
  quiz render as disabled chips with a "coming soon" tooltip.
- No refinement flow (clicking a settled result to re-open the prompt box)
  -- out of scope for "only example is wired" in this pass.
- No creature *art* / animation / quiet-mode toggle UI -- quiet mode (typed
  icon chips) **is** the entire UI right now, per Decision 56; there's
  nothing to toggle yet.
- Section-number click -> section-scoped creature cluster is not
  implemented (only text-selection -> text-scoped cluster).
