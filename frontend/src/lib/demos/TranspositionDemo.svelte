<script>
  // Interactive transposition-cipher example (the figure's worked case):
  // ATTACKATDAWN written in rows of 4, read off down the columns. Hover any
  // letter — in the plaintext, the grid, or the ciphertext — to trace it
  // through the transposition.
  import { columnarEncode } from './ciphers.js';

  const PLAIN = 'ATTACKATDAWN';
  const COLS = 4;
  const ROWS = Math.ceil(PLAIN.length / COLS);
  const CIPHER = columnarEncode(PLAIN, COLS);       // ACDTKATAWATN

  // plain index p sits at grid (row = p/COLS, col = p%COLS); cipher index
  // j reads (col = j/ROWS, row = j%ROWS) — simple column order.
  const plainToCipher = (p) => (p % COLS) * ROWS + Math.floor(p / COLS);
  const cipherToPlain = (j) => (j % ROWS) * COLS + Math.floor(j / ROWS);

  let hovered = null;   // plaintext index, or null
</script>

<div class="transpo" on:mouseleave={() => (hovered = null)}>
  <div class="line">
    <span class="tag">plaintext</span>
    {#each PLAIN as ch, p}
      <span class="cell" class:hot={hovered === p}
            on:mouseenter={() => (hovered = p)}>{ch}</span>
    {/each}
  </div>

  <div class="middle">
    <table>
      {#each Array(ROWS) as _, r}
        <tr>
          {#each Array(COLS) as _, c}
            {@const p = r * COLS + c}
            <td class:hot={hovered === p} on:mouseenter={() => (hovered = p)}>{PLAIN[p]}</td>
          {/each}
        </tr>
      {/each}
    </table>
    <div class="arrow">read down the columns ↓</div>
  </div>

  <div class="line">
    <span class="tag">ciphertext</span>
    {#each CIPHER as ch, j}
      <span class="cell cipher" class:hot={hovered === cipherToPlain(j)}
            on:mouseenter={() => (hovered = cipherToPlain(j))}>{ch}</span>
    {/each}
  </div>

  <div class="readout" aria-live="polite">
    {#if hovered !== null}
      plaintext position {hovered + 1} (<b>{PLAIN[hovered]}</b>) → row {Math.floor(hovered / COLS) + 1},
      column {(hovered % COLS) + 1} → ciphertext position {plainToCipher(hovered) + 1}
    {/if}
  </div>
</div>

<style>
  .transpo { display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
             font-family: var(--font-serif, Georgia, serif); }
  .line { display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; justify-content: center; }
  .tag { font-size: 0.8rem; font-variant-caps: small-caps; color: var(--color-ink-soft, #55493a);
         margin-right: 0.5rem; }
  .cell { display: inline-flex; width: 1.6rem; height: 1.6rem; align-items: center;
          justify-content: center; border: 1px solid var(--color-rule, #d9c9a3);
          border-radius: 4px; background: var(--color-bg, #f4ecd8);
          color: var(--color-ink, #2b2117); cursor: default; }
  .cell.cipher { color: var(--accent-teal, #2b6b66); }
  .middle { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  table { border-collapse: collapse; }
  td { width: 2rem; height: 2rem; text-align: center; border: 1px solid var(--color-rule, #d9c9a3);
       background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117); cursor: default; }
  .hot, td.hot { background: var(--wash-red, #f3dede) !important;
                 color: var(--accent-red, #a23c3c) !important; font-weight: 600; }
  .arrow { font-size: 0.8rem; color: var(--color-ink-soft, #55493a); font-style: italic; }
  .readout { min-height: 1.4em; font-size: 0.9rem; color: var(--color-ink-soft, #55493a);
             text-align: center; }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
