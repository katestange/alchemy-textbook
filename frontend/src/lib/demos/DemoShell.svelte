<script>
  // Shared chrome for fold-out bespoke tools: a collapsible card with a
  // small-caps title and the "AI-created" pill, in the reader's muted
  // palette. Body goes in the slot. Extracted from the original CaesarTool
  // so every tool is labelled and behaves identically.
  export let title;
  export let open = false;
</script>

<div class="demo-shell" class:open>
  <button class="shell-head" type="button" on:click={() => (open = !open)} aria-expanded={open}>
    <span class="chevron" class:open>▸</span>
    <span class="shell-title">{title}</span>
    <span class="ai-tag" title="This interactive tool was created by AI.">✦ AI-created</span>
  </button>

  {#if open}
    <div class="shell-body">
      <slot />
    </div>
  {/if}
</div>

<style>
  .demo-shell {
    border: 1px solid var(--color-rule, #d9c9a3);
    border-radius: 10px;
    background: var(--color-bg-raised, #ede2c8);
    margin: 1.5rem auto;
    max-width: 46rem;
    overflow: hidden;
    font-family: var(--font-serif, Georgia, serif);
  }
  .shell-head {
    display: flex; align-items: center; gap: 0.6rem;
    width: 100%; padding: 0.7rem 1rem; text-align: left;
    background: none; border: none; cursor: pointer;
    color: var(--color-ink, #2b2117); font-family: inherit; font-size: 1.05rem;
  }
  .chevron { transition: transform 0.15s ease; color: var(--color-ink-soft, #55493a); }
  .chevron.open { transform: rotate(90deg); }
  .shell-title { font-variant-caps: small-caps; letter-spacing: 0.02em; font-weight: 600; }
  .ai-tag {
    margin-left: auto; font-size: 0.72rem; font-variant-caps: small-caps;
    letter-spacing: 0.04em; padding: 0.12rem 0.5rem; border-radius: 999px;
    color: var(--accent-grey, #55524c);
    background: var(--wash-grey, #e7e5e0);
    border: 1px solid var(--color-rule, #d9c9a3);
  }
  .shell-body {
    display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start;
    padding: 0.5rem 1.25rem 1.25rem;
    border-top: 1px solid var(--color-rule, #d9c9a3);
  }
</style>
