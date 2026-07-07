<script>
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { manifestStore } from '../stores/manifestStore.js';
  import { session } from '../stores/session.js';
  import { refreshRequired, budgetNotice } from '../stores/banners.js';
  import {
    fetchChapterHtml,
    fetchCachedContent,
    fetchChapterContent,
    streamGenerate,
    deleteContent
  } from '../api.js';
  import { resolveSelectionAnchorFromRange, chooseInjectAfter } from '../selectionWalker.js';
  import {
    ensureResultBox,
    updateResultBox,
    showResultError,
    removeResultItem,
    hiddenCount,
    unhideAll,
    markEphemeral
  } from '../inSituResult.js';
  import SelectionToolbar from './SelectionToolbar.svelte';
  import PromptBox from './PromptBox.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import { chatStore } from '../stores/chatStore.js';
  import { builtinApplets } from '../builtinApplets.js';
  import { mountEditableCell } from '../sageCell.js';
  import { mountDesmosCalculator } from '../desmos.js';
  import { mountGeoGebra } from '../geogebra.js';

  export let chapter;
  // A fragment id to scroll to once the (possibly just-navigated) chapter is
  // rendered -- set when the reader follows an internal cross-reference.
  export let scrollTo = null;

  const dispatch = createEventDispatcher();

  let containerEl;
  let mainEl; // the reading column wrapper -- positioning context for the toolbar
  let html = '';
  let loading = true;
  let loadError = null;

  let toolbar = null; // { top, left, anchor, selectionText }
  let promptBox = null; // { top, left, creatureType }

  const DEFAULT_PROMPTS = {
    example: 'Create a worked example for this.',
    intuition: 'Explain the intuition behind this.',
    applet: 'Make a small, editable interactive Sage demo for this.'
  };

  $: loadChapter(chapter);

  async function loadChapter(n) {
    loading = true;
    loadError = null;
    toolbar = null;
    promptBox = null;
    try {
      const raw = await fetchChapterHtml(n);
      // Contract ambiguity (see README "Contract ambiguities"): LaTeXML's
      // --split output is a full standalone <html> document (doctype, head,
      // body), but the API contract just says "text/html for chapter n".
      // Whether the real backend re-serves the full document or a
      // pre-extracted <body> fragment isn't nailed down, so handle both:
      // parse with DOMParser and take .body.innerHTML either way (a no-op
      // if `raw` was already a bare fragment).
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      html = doc.body ? doc.body.innerHTML : raw;
    } catch (e) {
      loadError = `Could not load chapter ${n} from the backend.`;
    } finally {
      loading = false;
    }
    // After the chapter HTML is in the DOM, surface any existing AI content
    // for this chapter (one request, not one per block).
    await tick();
    wireAiSolutions();
    wireWideMath();
    hydrateChapterContent(n);
    injectBuiltinApplets();
    if (scrollTo) {
      const el = document.getElementById(scrollTo);
      if (el) el.scrollIntoView({ block: 'start' });
      scrollTo = null;
    }
  }

  // Internal cross-references in the LaTeXML HTML are relative links to other
  // chapter files (e.g. `S3.html`, `book.html`, `S2.html#S2.F12`). Left alone
  // they navigate the browser away from the SPA to a URL the backend answers
  // with a 404 JSON body ("detail: Not Found"). Intercept them and route
  // within the app instead. Pure in-page `#frag` links keep the browser
  // default (they scroll to an element already on the page).
  function handleContentClick(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !containerEl.contains(a)) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#') || /^[a-z]+:/i.test(href)) return; // in-page or external
    const m = href.match(/^(?:\.\/)?(?:S(\d+)|book)\.html(?:#(.+))?$/i);
    if (!m) return;
    e.preventDefault();
    const targetChapter = m[1] ? Number(m[1]) : null; // book.html -> table of contents
    const frag = m[2] || null;
    if (targetChapter === chapter) {
      // Same chapter: just scroll to the fragment.
      if (frag) {
        const el = document.getElementById(frag);
        if (el) el.scrollIntoView({ block: 'start' });
      }
      return;
    }
    dispatch('navigate', { chapter: targetChapter, frag });
  }

  async function hydrateChapterContent(n) {
    let entries;
    try {
      entries = await fetchChapterContent(n);
    } catch {
      return; // best-effort: reading never depends on this
    }
    if (!entries || !entries.length) return;
    // hash -> xml_id lookup from the manifest
    const hashToId = new Map($manifestStore.blocks.map((b) => [b.content_hash, b.xml_id]));
    // latest artifact per (block, creature)
    const latest = new Map();
    for (const e of entries) {
      if (!(e.status === 'approved' || e.own)) continue;
      const key = `${e.content_hash}:${e.creature_type}`;
      const prev = latest.get(key);
      if (!prev || new Date(e.created_at) > new Date(prev.created_at)) latest.set(key, e);
    }
    for (const e of latest.values()) {
      const xmlId = hashToId.get(e.content_hash);
      const anchorEl = xmlId && document.getElementById(xmlId);
      if (!anchorEl) continue;
      // Decision 61: content hydrated on chapter load rests as a collapsed
      // chip (book-first) -- only a just-streamed generation opens expanded.
      const box = ensureResultBox(anchorEl, e.creature_type, e.content_hash, e.status, {
        collapsed: true,
        selectionText: e.selection_text,
        skipIfHidden: true,
        canDelete: e.own || $session.isInstructor,
        contentId: e.id
      });
      if (box) updateResultBox(box, e.response);
    }
  }

  // AI-written solutions (LaTeX `aisolution` env -> .ltx_theorem_aisolution)
  // are hidden behind a per-solution "Show solution" click. When the admin
  // toggle is OFF the backend has already stripped them, so this finds none.
  function wireAiSolutions() {
    if (!containerEl) return;
    containerEl.querySelectorAll('.ltx_theorem_aisolution').forEach((sol) => {
      if (sol.dataset.aiSolWired) return;
      sol.dataset.aiSolWired = '1';
      sol.classList.add('ai-solution', 'ai-solution-collapsed');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-solution-toggle';
      btn.textContent = 'Show solution ▸';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const open = sol.classList.toggle('ai-solution-open');
        sol.classList.toggle('ai-solution-collapsed', !open);
        btn.textContent = open ? 'Hide solution ▾' : 'Show solution ▸';
        btn.setAttribute('aria-expanded', String(open));
      });
      sol.parentNode.insertBefore(btn, sol);
    });
  }

  // Only give a horizontal scrollbar to displayed math that is GENUINELY wider
  // than the column (big matrices), not to ordinary equations -- a blanket
  // overflow:auto produced phantom 1-2px scrollbars in Chrome. The 6px buffer
  // ignores sub-pixel rounding.
  function wireWideMath() {
    if (!containerEl) return;
    containerEl
      .querySelectorAll('math[display="block"], .ltx_equation, .ltx_equationgroup')
      .forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 6) el.classList.add('math-scroll');
      });
  }

  // Inject the pre-authored SageMath demos (builtinApplets.js) for whichever
  // of their anchor blocks exist in this chapter -- an editable, always-on
  // SageCell right after the block. Idempotent (guarded by a per-anchor id).
  function injectBuiltinApplets() {
    for (const app of builtinApplets) {
      const anchorEl = document.getElementById(app.xmlId);
      if (!anchorEl) continue;
      const wrapId = `builtin-applet-${app.xmlId}`;
      if (document.getElementById(wrapId)) continue;
      const wrap = document.createElement('div');
      wrap.id = wrapId;
      wrap.className = 'builtin-applet';
      // The title is a toggle bar: collapsing hides the cell but leaves the
      // titled bar in place (author feedback: not a tiny chip like creatures).
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'builtin-applet-bar';
      bar.setAttribute('aria-expanded', 'true');
      const caret = document.createElement('span');
      caret.className = 'builtin-applet-caret';
      caret.setAttribute('aria-hidden', 'true');
      const title = document.createElement('span');
      title.className = 'builtin-applet-title';
      title.textContent = app.title;
      bar.appendChild(caret);
      bar.appendChild(title);
      const host = document.createElement('div');
      host.className = 'applet-host';
      // Reserve the applet's height up front with a loading placeholder, so
      // the surrounding text doesn't jump when the library finishes loading.
      reserveAppletSpace(host, app.tool);
      bar.addEventListener('click', () => {
        const collapsed = wrap.classList.toggle('collapsed');
        bar.setAttribute('aria-expanded', String(!collapsed));
      });
      wrap.appendChild(bar);
      wrap.appendChild(host);
      if (app.replaceFigure) {
        // Swap out the static figure image for the applet, in place: hide the
        // <img> and drop the applet above the caption inside the same figure.
        // The figure was sized to the small image (centered); widen it to the
        // full column so the applet has room.
        anchorEl.classList.add('applet-figure');
        const img = anchorEl.querySelector('img');
        if (img) img.style.display = 'none';
        const cap = anchorEl.querySelector('figcaption');
        if (cap) anchorEl.insertBefore(wrap, cap);
        else anchorEl.appendChild(wrap);
      } else {
        anchorEl.insertAdjacentElement('afterend', wrap);
      }
      // async; each mounts its own fallback on failure
      if (app.tool === 'desmos') {
        mountDesmosCalculator(host, app.code);
      } else if (app.tool === 'geogebra') {
        mountGeoGebra(host, app.code);
      } else {
        mountEditableCell(host, app.code);
      }
    }
  }

  // Reserve an applet's eventual height with a "Loading…" placeholder so the
  // page doesn't reflow when the (async) library finishes loading. The mount
  // functions clear the placeholder but the host's min-height persists.
  function reserveAppletSpace(host, tool) {
    host.style.minHeight = tool === 'sage' ? '160px' : '440px';
    const ph = document.createElement('div');
    ph.className = 'applet-loading';
    ph.textContent = 'Loading interactive demo…';
    host.appendChild(ph);
  }

  function containerOffset() {
    // The floating toolbar is positioned inside `mainEl` (its offset parent),
    // so its coordinates must be measured relative to `mainEl` -- not the
    // inner, now-centered page-shell (which is inset by its auto margins).
    // Measuring against page-shell is what put the toolbar in the wrong place
    // once the reading column stopped spanning the full width.
    const rect = mainEl.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  }

  async function handleMouseUp(e) {
    // Clicks inside our own injected UI (AI result boxes, built-in applets)
    // must NOT re-run the selection-anchor flow. Otherwise, because the text
    // that summoned the box often stays highlighted, clicking a control like
    // "Show solution" is seen as a fresh selection and re-hydrates the box,
    // wiping the reveal (the "flicker in and out" bug).
    if (e && e.target && e.target.closest && e.target.closest('.ai-item, .builtin-applet')) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) {
      return;
    }
    const anchor = resolveSelectionAnchorFromRange(range, $manifestStore.blockMap);
    if (!anchor) {
      toolbar = null;
      return;
    }

    const rect = range.getBoundingClientRect();
    const offset = containerOffset();
    toolbar = {
      top: rect.bottom + window.scrollY - offset.top + 6,
      left: rect.left + window.scrollX - offset.left,
      anchor,
      selectionText: selection.toString(),
      // where the result should be inserted (after the <li>/heading selected,
      // not after the big enclosing block); null => after the anchor block
      injectAfter: chooseInjectAfter(range)
    };
    promptBox = null;

    // Slice simplification (spec step 5, and see api.js): fetch cached
    // content on-demand for the block the user just selected, rather than
    // sweeping all ~817 manifest hashes on chapter load. If an approved (or
    // this reader's own) artifact of any wired creature type already exists,
    // surface it immediately (as a resting chip, Decision 61) so clicking
    // "Ex."/"Int." again isn't the only way to see it.
    hydrateExistingContent(anchor);
  }

  async function hydrateExistingContent(anchor) {
    if (!anchor.block || !anchor.block.content_hash) return;
    let entries;
    try {
      entries = await fetchCachedContent(anchor.block.content_hash);
    } catch {
      return; // best-effort; selection/toolbar UX doesn't depend on this
    }
    // Latest approved-or-own artifact PER creature type (e.g. an example AND
    // an intuition can both already exist for the same block) -- each gets
    // its own chip, so surface all of them, not just one.
    const latestByType = new Map();
    for (const e of entries || []) {
      if (!(e.status === 'approved' || e.own)) continue;
      const prev = latestByType.get(e.creature_type);
      if (!prev || new Date(e.created_at) > new Date(prev.created_at)) latestByType.set(e.creature_type, e);
    }
    if (!latestByType.size) return;

    const anchorEl = document.getElementById(anchor.xml_id);
    if (!anchorEl) return;
    for (const e of latestByType.values()) {
      // Decision 61: surfaced-on-selection existing content also rests
      // collapsed -- only a fresh generation this session opens expanded.
      const box = ensureResultBox(anchorEl, e.creature_type, anchor.block.content_hash, e.status, {
        collapsed: true,
        selectionText: e.selection_text,
        skipIfHidden: true,
        canDelete: e.own || $session.isInstructor,
        contentId: e.id
      });
      if (box) updateResultBox(box, e.response);
    }
  }

  function openPrompt(creatureType) {
    if (!toolbar) return;
    // Chat and quiz are side-panel creatures (Decision 65) -- they open the
    // conversation panel rather than the in-situ prompt box.
    if (creatureType === 'chat' || creatureType === 'quiz') {
      chatStore.open({
        creatureType,
        selectionText: toolbar.selectionText,
        anchor: toolbar.anchor,
        chapterNum: chapter
      });
      toolbar = null;
      return;
    }
    promptBox = {
      top: toolbar.top,
      left: toolbar.left,
      creatureType,
      anchor: toolbar.anchor,
      selectionText: toolbar.selectionText,
      injectAfter: toolbar.injectAfter
    };
    toolbar = null;
  }

  // While a panel is open, selecting reader text offers "Quote into
  // conversation" instead of a new panel (Decision 65, item 6).
  function quoteSelection() {
    if (!toolbar) return;
    chatStore.queueQuote(toolbar.selectionText);
    toolbar = null;
  }

  function cancelPrompt() {
    promptBox = null;
  }

  async function submitPrompt(promptText) {
    const { creatureType, anchor, selectionText, injectAfter } = promptBox;
    promptBox = null;

    if ($session.anonymous) {
      budgetNotice.set('AI generation needs an invite code or your own API key — you are reading anonymously.');
      return;
    }

    const anchorEl = document.getElementById(anchor.xml_id);
    if (!anchorEl) return;

    const box = ensureResultBox(anchorEl, creatureType, anchor.block.content_hash, 'unreviewed', {
      selectionText,
      injectAfter,
      canDelete: true // your own fresh generation
    });
    updateResultBox(box, '');
    // The anchor block can sit well above a long selected/displayed element
    // (e.g. a displayed matrix), which put the streaming box off-screen
    // ("no response"). Bring it into view so the student sees it fill in.
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    let accumulated = '';

    await streamGenerate(
      {
        creatureType,
        blockHash: anchor.block.content_hash,
        selectionText,
        prompt: promptText,
        buildVersion: $manifestStore.buildVersion
      },
      (event, data) => {
        if (event === 'delta') {
          accumulated += data.text || '';
          updateResultBox(box, accumulated, { streaming: true });
        } else if (event === 'done') {
          // Stream is over: re-render once more with streaming: false so a
          // dangling, never-closed [[solution]] marker finalizes into a
          // normal toggle instead of staying a "being written" placeholder
          // forever (Decision 62: "treat stream-end-without-close as close").
          updateResultBox(box, accumulated, { streaming: false });
          // Stamp the stored id so the "delete forever" control can purge it.
          if (data.content_id != null) box.dataset.contentId = String(data.content_id);
          // Unusable-selection redirect: shown once, not stored (server sent
          // no content_id). Turn it into a self-dismissing one-time note.
          if (data.ephemeral) markEphemeral(box);
          if (typeof data.budget_remaining_microdollars === 'number') {
            // authoritative figure from the server
            session.updateBudget(data.budget_remaining_microdollars);
          } else if (typeof data.cost_microdollars === 'number' && $session.budgetRemainingMicrodollars != null) {
            session.updateBudget(Math.max(0, $session.budgetRemainingMicrodollars - data.cost_microdollars));
          }
        } else if (event === 'error') {
          handleGenerateError(data, box);
        }
      }
    );
  }

  function handleGenerateError(data, box) {
    const code = data && data.code;
    if (code === 'refresh_required') {
      refreshRequired.set(true);
      showResultError(box, 'The textbook was updated — refresh the page to continue.');
    } else if (code === 'budget_exceeded') {
      budgetNotice.set('You have used up your AI budget for this course. Cached content is still available.');
      // Nothing was ever generated here, so unlike a normal dismiss (which
      // collapses to a chip, Decision 61) there's no content worth resting
      // as a chip -- remove the attempt entirely.
      removeResultItem(box);
    } else if (code === 'auth_required') {
      session.reset();
    } else {
      showResultError(box, 'Something went wrong generating this. Please try again.');
    }
  }

  function handleDocumentMouseDown(e) {
    const el = e.target;
    if (el.closest && (el.closest('.creature-toolbar') || el.closest('.prompt-box'))) {
      return;
    }
    // Any mousedown outside the floating UI dismisses it immediately -- don't
    // wait for the selection to collapse (checking isCollapsed here needed a
    // second click, because on the first mousedown the old selection is still
    // live). A fresh drag-selection re-opens the toolbar on mouseup.
    toolbar = null;
  }

  // "N hidden — show" restore control (author feedback). hiddenCount() is
  // module state in inSituResult; the custom event fires whenever a hide or
  // unhide happens so this stays live.
  let hiddenN = hiddenCount();
  function onHiddenChanged() {
    hiddenN = hiddenCount();
  }
  function showHidden() {
    unhideAll();
    hiddenN = 0;
    hydrateChapterContent(chapter); // re-inject this chapter's now-visible items
  }

  // A eureka captured in the chat panel (Decision 41) is the one thing a
  // conversation persists: drop its chip into the margin at the anchor block.
  function onEurekaCreated(e) {
    const d = e.detail || {};
    const anchorEl = d.xmlId && document.getElementById(d.xmlId);
    if (!anchorEl) return;
    const box = ensureResultBox(anchorEl, 'eureka', d.contentHash || d.xmlId, 'unreviewed', {
      collapsed: false,
      selectionText: d.selectionText,
      canDelete: true,
      contentId: d.contentId
    });
    if (box) {
      updateResultBox(box, d.text || '');
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Delete-forever dispatched from an AI box (inSituResult); the box removes
  // itself from the DOM, this purges it server-side.
  function onDeleteContent(e) {
    const id = e.detail && e.detail.contentId;
    if (id != null) deleteContent(id);
  }

  onMount(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('alchemy:hidden-changed', onHiddenChanged);
    document.addEventListener('alchemy:eureka', onEurekaCreated);
    document.addEventListener('alchemy:delete-content', onDeleteContent);
  });
  onDestroy(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown);
    document.removeEventListener('alchemy:hidden-changed', onHiddenChanged);
    document.removeEventListener('alchemy:eureka', onEurekaCreated);
    document.removeEventListener('alchemy:delete-content', onDeleteContent);
  });
</script>

<div class="reading-pane" class:panel-open={$chatStore.open}>
 <div class="reading-main" bind:this={mainEl}>
  {#if loading}
    <div class="page-shell"><p>Loading chapter {chapter}…</p></div>
  {:else if loadError}
    <div class="page-shell"><p class="error">{loadError}</p></div>
  {:else}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- The mouseup listener here is a mouse-only convenience for triggering
         AI tools on a text selection; it adds no requirement on top of the
         underlying LaTeXML HTML's own semantics/keyboard nav (Q13: "the
         reading pane is plain semantic LaTeXML HTML, it stays fully
         navigable even with the interactive layer disabled"). -->
    <div
      class="page-shell ltx_page_content"
      bind:this={containerEl}
      on:mouseup={handleMouseUp}
      on:click={handleContentClick}
    >
      {@html html}
    </div>
    {#if toolbar}
      <SelectionToolbar
        top={toolbar.top}
        left={toolbar.left}
        panelOpen={$chatStore.open}
        onSelect={openPrompt}
        onQuote={quoteSelection}
      />
    {/if}
    {#if promptBox}
      <PromptBox
        top={promptBox.top}
        left={promptBox.left}
        initialPrompt={DEFAULT_PROMPTS[promptBox.creatureType] || ''}
        onSubmit={submitPrompt}
        onCancel={cancelPrompt}
      />
    {/if}
    {#if hiddenN > 0}
      <button class="show-hidden" type="button" on:click={showHidden}>
        Show {hiddenN} hidden AI item{hiddenN === 1 ? '' : 's'}
      </button>
    {/if}
  {/if}
 </div>
 {#if $chatStore.open}
   <aside class="panel-slot">
     <ChatPanel />
   </aside>
 {/if}
</div>

<style>
  /* "N hidden — show" restore control (author feedback: let students banish
     AI items, but always give them a quiet way back). */
  .show-hidden {
    display: block;
    margin: 1.5rem auto 0;
    background: none;
    border: 1px dashed var(--color-rule);
    border-radius: 999px;
    padding: 0.25rem 0.9rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--color-ink-soft);
  }
  .show-hidden:hover {
    color: var(--color-ink);
    border-color: var(--color-ink-soft);
  }

  /* Decision 65 + author feedback: the reading column is left-anchored (a
     left-of-centre gutter that's the SAME whether or not the panel is open,
     so the text never moves), and the chat/quiz panel FILLS the whole space
     to its right rather than sitting at a fixed narrow width leaving the
     right margin half-empty.

     The column is biased left of centre (centre would be 50vw - halfColumn);
     pulling ~10rem further left leaves room for the panel. Below the drawer
     breakpoint the layout collapses to a single centred column with the panel
     as a bottom drawer. */
  .reading-pane {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2rem;
    padding-left: max(1.5rem, calc(50vw - var(--content-max-width) / 2 - 10rem));
    padding-right: 1rem;
  }
  .reading-main {
    flex: 0 1 var(--content-max-width);
    min-width: 0;
    position: relative;
  }
  .panel-slot {
    flex: 1 1 20rem; /* fills the remaining width... */
    max-width: 48rem; /* ...up to a sane cap on very wide screens */
    align-self: stretch;
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    padding: 0.5rem 0;
    z-index: 40;
  }
  /* Narrow: no room for a side panel, so the layout is a single centred
     column and the panel becomes a bottom drawer. */
  @media (max-width: 84rem) {
    .reading-pane {
      display: block;
      padding-left: 0;
      padding-right: 0;
    }
    .panel-slot {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: auto;
      max-width: none;
      height: auto;
      max-height: 70vh;
      padding: 0;
      box-shadow: 0 -4px 16px rgba(38, 32, 25, 0.25);
    }
  }
</style>
