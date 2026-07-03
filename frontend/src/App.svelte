<script>
  import { onMount } from 'svelte';
  import { whoami } from './lib/api.js';
  import { session } from './lib/stores/session.js';
  import CodeEntry from './lib/components/CodeEntry.svelte';
  import ChapterPicker from './lib/components/ChapterPicker.svelte';
  import ReadingPane from './lib/components/ReadingPane.svelte';
  import RefreshBanner from './lib/components/RefreshBanner.svelte';
  import BudgetBanner from './lib/components/BudgetBanner.svelte';

  let currentChapter = null;

  // If the HttpOnly session cookie is still valid (e.g. after a reload),
  // skip code entry and restore the live budget.
  onMount(async () => {
    const me = await whoami();
    if (me.ok) session.setClaimed(me.budget_remaining_microdollars ?? null);
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
</script>

<RefreshBanner />
<BudgetBanner />

{#if !$session.claimed}
  <CodeEntry />
{:else}
  <div class="top-bar">
    <button class="link-btn" type="button" on:click={backToChapters}>Table of contents</button>
    {#if $session.anonymous}
      <span>Reading anonymously</span>
    {:else if $session.budgetRemainingMicrodollars != null}
      <span>Budget remaining: {formatBudget($session.budgetRemainingMicrodollars)}</span>
    {/if}
  </div>

  {#if currentChapter == null}
    <ChapterPicker on:select={selectChapter} />
  {:else}
    <ReadingPane chapter={currentChapter} />
  {/if}
{/if}
