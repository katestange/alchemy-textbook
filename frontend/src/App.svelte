<script>
  import { onMount } from 'svelte';
  import { whoami } from './lib/api.js';
  import { session } from './lib/stores/session.js';
  import { loadBookConfig } from './lib/stores/bookConfig.js';
  import CodeEntry from './lib/components/CodeEntry.svelte';
  import ChapterPicker from './lib/components/ChapterPicker.svelte';
  import ReadingPane from './lib/components/ReadingPane.svelte';
  import RefreshBanner from './lib/components/RefreshBanner.svelte';
  import BudgetBanner from './lib/components/BudgetBanner.svelte';

  let currentChapter = null;
  let pendingScrollTo = null; // fragment id to jump to after a cross-reference nav

  // If the HttpOnly session cookie is still valid (e.g. after a reload),
  // skip code entry and restore the live budget.
  onMount(async () => {
    loadBookConfig(); // sets document.title + branding store; no need to await
    const me = await whoami();
    if (me.ok) session.setClaimed(me.budget_remaining_microdollars ?? null, me.is_admin);
  });

  function formatBudget(microdollars) {
    if (microdollars == null) return null;
    return `$${(microdollars / 1_000_000).toFixed(2)}`;
  }

  function selectChapter(e) {
    currentChapter = e.detail.chapter;
  }

  function backToChapters() {
    currentChapter = null;
  }

  // An internal cross-reference in the reading pane (e.g. a next/prev/TOC link
  // in the chapter's own header/footer). chapter === null means "book.html" ->
  // the table of contents.
  function handleNavigate(e) {
    pendingScrollTo = e.detail.frag || null;
    currentChapter = e.detail.chapter;
    window.scrollTo(0, 0);
  }
</script>

<RefreshBanner />
<BudgetBanner />

{#if !$session.claimed}
  <CodeEntry />
{:else}
  <div class="top-bar">
    <button class="link-btn" type="button" on:click={backToChapters}>Table of contents</button>
    {#if $session.anonymous}
      <span class="mode-tag">
        Static mode ·
        <button class="link-btn" type="button" on:click={() => session.reset()}>Have an invite code?</button>
      </span>
    {:else if $session.budgetRemainingMicrodollars != null}
      <span>Budget remaining: {formatBudget($session.budgetRemainingMicrodollars)}</span>
    {/if}
  </div>

  {#if currentChapter == null}
    <ChapterPicker on:select={selectChapter} />
  {:else}
    <ReadingPane chapter={currentChapter} scrollTo={pendingScrollTo} on:navigate={handleNavigate} />
  {/if}
{/if}
