<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { manifestStore } from '../stores/manifestStore.js';
  import { fetchManifest, fetchChapters } from '../api.js';
  import BookFrontMatter from './BookFrontMatter.svelte';

  const dispatch = createEventDispatcher();

  let loading = true;
  let loadError = null;

  onMount(async () => {
    try {
      const [manifest, chapters] = await Promise.all([fetchManifest(), fetchChapters()]);
      manifestStore.setManifest(manifest, chapters);
    } catch (e) {
      loadError = 'Could not load the textbook manifest from the backend. Is it running on :8000?';
    } finally {
      loading = false;
    }
  });

  // Top-level (level 1) sections are the chapters (Decision 50).
  $: topLevelSections = $manifestStore.sections.filter((s) => s.level === 1);
</script>

<div class="page-shell">
  <BookFrontMatter>
    <h2 class="toc-heading">Table of Contents</h2>
    {#if loading}
      <p>Loading…</p>
    {:else if loadError}
      <p class="error">{loadError}</p>
    {:else}
      <ul class="chapter-list">
        {#each topLevelSections as section (section.id)}
          <li>
            <button class="chapter-card" on:click={() => dispatch('select', { chapter: section.id })}>
              <span class="num">{section.id}</span>{section.title}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </BookFrontMatter>
</div>
