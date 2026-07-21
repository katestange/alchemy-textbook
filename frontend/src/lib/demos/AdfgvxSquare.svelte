<script>
  // The book's 6×6 ADFGVX substitution square. Hover a cell to read off its
  // ADFGVX pair. An external `mark` (character) highlights that cell; hover
  // events are forwarded so parents can trace the worked example.
  import { createEventDispatcher } from 'svelte';
  import { ADFGVX, ADFGVX_SQUARE } from './ciphers.js';

  export let mark = null;   // plaintext character to highlight, or null

  const dispatch = createEventDispatcher();
  let hovered = null;       // {r, c} or null

  $: marked = (() => {
    if (mark == null) return null;
    const ch = String(mark).toLowerCase();
    for (let r = 0; r < 6; r++) {
      const c = ADFGVX_SQUARE[r].indexOf(ch);
      if (c !== -1) return { r, c };
    }
    return null;
  })();
  $: active = hovered ?? marked;
</script>

<div class="adfgvx-square">
  <table on:mouseleave={() => { hovered = null; dispatch('hover', null); }}>
    <tr>
      <th></th>
      {#each ADFGVX as h, c}
        <th class:hot={active && active.c === c}>{h}</th>
      {/each}
    </tr>
    {#each ADFGVX_SQUARE as row, r}
      <tr>
        <th class:hot={active && active.r === r}>{ADFGVX[r]}</th>
        {#each row as cell, c}
          <td
            class:hot={active && active.r === r && active.c === c}
            on:mouseenter={() => { hovered = { r, c }; dispatch('hover', cell); }}
          >{cell}</td>
        {/each}
      </tr>
    {/each}
  </table>
  <div class="readout" aria-live="polite">
    {#if active}
      <b>{ADFGVX_SQUARE[active.r][active.c]}</b> → {ADFGVX[active.r]}{ADFGVX[active.c]}
    {/if}
  </div>
</div>

<style>
  .adfgvx-square { display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
                   font-family: var(--font-serif, Georgia, serif); }
  table { border-collapse: collapse; cursor: default; }
  th, td { width: 1.9rem; height: 1.9rem; text-align: center; font-size: 0.95rem; }
  th { color: var(--color-ink-soft, #55493a); font-weight: 600; }
  th.hot { color: var(--accent-red, #a23c3c); }
  td { border: 1px solid var(--color-rule, #d9c9a3); color: var(--color-ink, #2b2117);
       background: var(--color-bg, #f4ecd8); }
  td.hot { background: var(--wash-red, #f3dede); color: var(--accent-red, #a23c3c);
           font-weight: 600; }
  .readout { min-height: 1.3em; font-size: 0.9rem; color: var(--color-ink-soft, #55493a); }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
