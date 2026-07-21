<script>
  // Interactive scytale example: the message strip is wound around a rod;
  // reading ALONG the rod row by row gives the ciphertext. − / + changes how
  // many times the strip wraps (the rod's girth — the secret key). Hover any
  // letter to follow it between strip, rod, and ciphertext.
  import { scytaleEncode } from './ciphers.js';

  export let plain = 'ATTACKATDAWN';
  export let wraps = 3;

  $: letters = plain.toUpperCase().replace(/[^A-Z0-9]/g, '');
  $: turns = Math.ceil(letters.length / wraps);
  $: padded = letters.padEnd(turns * wraps, 'X');
  $: cipher = scytaleEncode(letters, wraps);
  // strip index p ↔ rod cell (row = p % wraps, turn = ⌊p / wraps⌋);
  // ciphertext index j reads rod row-by-row: p = (j % turns) * wraps + ⌊j / turns⌋
  const cipherToStrip = (j, wraps, turns) => (j % turns) * wraps + Math.floor(j / turns);

  let hovered = null;   // strip index or null
  function clampWraps(d) { wraps = Math.min(6, Math.max(2, wraps + d)); hovered = null; }
</script>

<div class="scytale" on:mouseleave={() => (hovered = null)}>
  <div class="line">
    <span class="tag">the strip</span>
    {#each padded as ch, p}
      <span class="cell" class:hot={hovered === p} class:pad={p >= letters.length}
            on:mouseenter={() => (hovered = p)}>{ch}</span>
    {/each}
  </div>

  <div class="rod-wrap">
    <div class="rod">
      {#each Array(wraps) as _, r}
        <div class="rod-row">
          {#each Array(turns) as _, t}
            {@const p = t * wraps + r}
            <span class="cell rod-cell" class:hot={hovered === p} class:pad={p >= letters.length}
                  on:mouseenter={() => (hovered = p)}>{padded[p]}</span>
          {/each}
        </div>
      {/each}
    </div>
    <div class="wraps-ctl">
      <button type="button" on:click={() => clampWraps(-1)} aria-label="fewer wraps">−</button>
      <span>wraps <b>{wraps}</b></span>
      <button type="button" on:click={() => clampWraps(1)} aria-label="more wraps">+</button>
    </div>
    <div class="hint">wound {wraps} times around the rod — read along the rod →</div>
  </div>

  <div class="line">
    <span class="tag">ciphertext</span>
    {#each cipher as ch, j}
      {@const p = cipherToStrip(j, wraps, turns)}
      <span class="cell cipher" class:hot={hovered === p}
            on:mouseenter={() => (hovered = p)}>{ch}</span>
    {/each}
  </div>

  <div class="readout" aria-live="polite">
    {#if hovered !== null && hovered < letters.length}
      strip position {hovered + 1} (<b>{padded[hovered]}</b>) → turn {Math.floor(hovered / wraps) + 1},
      ring {(hovered % wraps) + 1} of the rod
    {/if}
  </div>
</div>

<style>
  .scytale { display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
             font-family: var(--font-serif, Georgia, serif); }
  .line { display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; justify-content: center; }
  .tag { font-size: 0.8rem; font-variant-caps: small-caps; color: var(--color-ink-soft, #55493a);
         margin-right: 0.5rem; }
  .cell { display: inline-flex; width: 1.55rem; height: 1.55rem; align-items: center;
          justify-content: center; border: 1px solid var(--color-rule, #d9c9a3);
          border-radius: 4px; background: var(--color-bg, #f4ecd8);
          color: var(--color-ink, #2b2117); cursor: default; font-size: 0.95rem; }
  .cell.cipher { color: var(--accent-teal, #2b6b66); }
  .cell.pad { opacity: 0.4; }
  .cell.hot { background: var(--wash-red, #f3dede); color: var(--accent-red, #a23c3c);
              font-weight: 600; }
  .rod-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
  .rod { display: flex; flex-direction: column; gap: 2px; padding: 0.6rem 1.2rem;
         border: 1px solid var(--color-rule, #d9c9a3); border-radius: 999px;
         background: var(--color-bg-raised, #ede2c8); }
  .rod-row { display: flex; gap: 2px; }
  .rod-cell { border-radius: 2px; }
  .wraps-ctl { display: flex; align-items: center; gap: 0.7rem; font-size: 0.9rem;
               color: var(--color-ink-soft, #55493a); }
  .wraps-ctl b { color: var(--color-ink, #2b2117); }
  .wraps-ctl button { width: 1.8rem; height: 1.8rem; border-radius: 50%;
    border: 1px solid var(--color-rule, #d9c9a3); background: var(--color-bg-raised, #ede2c8);
    color: var(--color-ink, #2b2117); font-size: 1.05rem; line-height: 1; cursor: pointer; }
  .wraps-ctl button:hover { border-color: var(--accent-teal, #2b6b66); }
  .hint { font-size: 0.8rem; font-style: italic; color: var(--color-ink-soft, #55493a); }
  .readout { min-height: 1.4em; font-size: 0.9rem; color: var(--color-ink-soft, #55493a);
             text-align: center; }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
