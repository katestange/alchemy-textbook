<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { manifestStore } from '../stores/manifestStore.js';
  import { session } from '../stores/session.js';
  import { refreshRequired, budgetNotice } from '../stores/banners.js';
  import { fetchChapterHtml, fetchCachedContent, fetchChapterContent, streamGenerate } from '../api.js';
  import { resolveSelectionAnchor } from '../selectionWalker.js';
  import { ensureResultBox, updateResultBox, showResultError, removeResultItem } from '../inSituResult.js';
  import SelectionToolbar from './SelectionToolbar.svelte';
  import PromptBox from './PromptBox.svelte';

  export let chapter;

  let containerEl;
  let html = '';
  let loading = true;
  let loadError = null;

  let toolbar = null; // { top, left, anchor, selectionText }
  let promptBox = null; // { top, left, creatureType }

  const DEFAULT_PROMPTS = {
    example: 'Create a worked example for this.',
    intuition: 'Explain the intuition behind this.'
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
    hydrateChapterContent(n);
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
        collapsed: true
      });
      updateResultBox(box, e.response);
    }
  }

  function containerOffset() {
    const rect = containerEl.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  }

  async function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) {
      return;
    }
    const anchor = resolveSelectionAnchor(range.commonAncestorContainer, $manifestStore.blockMap);
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
      selectionText: selection.toString()
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
        collapsed: true
      });
      updateResultBox(box, e.response);
    }
  }

  function openPrompt(creatureType) {
    if (!toolbar) return;
    promptBox = {
      top: toolbar.top,
      left: toolbar.left,
      creatureType,
      anchor: toolbar.anchor,
      selectionText: toolbar.selectionText
    };
    toolbar = null;
  }

  function cancelPrompt() {
    promptBox = null;
  }

  async function submitPrompt(promptText) {
    const { creatureType, anchor, selectionText } = promptBox;
    promptBox = null;

    if ($session.anonymous) {
      budgetNotice.set('AI generation needs an invite code or your own API key — you are reading anonymously.');
      return;
    }

    const anchorEl = document.getElementById(anchor.xml_id);
    if (!anchorEl) return;

    const box = ensureResultBox(anchorEl, creatureType, anchor.block.content_hash, 'unreviewed');
    updateResultBox(box, '');
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
    // A plain click (no drag-selection) elsewhere dismisses the floating UI;
    // mouseup selection handling above will re-open it if a new selection
    // is made.
    if (window.getSelection().isCollapsed) {
      toolbar = null;
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown);
  });
  onDestroy(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown);
  });
</script>

<div class="reading-pane">
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
    <div class="page-shell ltx_page_content" bind:this={containerEl} on:mouseup={handleMouseUp}>
      {@html html}
    </div>
    {#if toolbar}
      <SelectionToolbar top={toolbar.top} left={toolbar.left} onSelect={openPrompt} />
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
  {/if}
</div>
