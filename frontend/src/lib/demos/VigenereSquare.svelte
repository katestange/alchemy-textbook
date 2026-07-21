<script>
  // Interactive Vigenère square (tabula recta): row = key letter, column =
  // plaintext letter, entry = ciphertext letter (plain + key, A = 0 — the
  // mod-26 addition table). Hover an entry to light up its row, column, and
  // the resulting pairing.
  import { LETTERS } from './ciphers.js';

  let hovered = null;   // {k, p} row/col indices, or null
  const cipherAt = (k, p) => LETTERS[(k + p) % 26];
</script>

<div class="vigsq">
  <div class="scroller">
    <table on:mouseleave={() => (hovered = null)}>
      <tr>
        <th class="corner"></th>
        {#each LETTERS as L, p}
          <th class:hot={hovered && hovered.p === p}>{L}</th>
        {/each}
      </tr>
      {#each LETTERS as K, k}
        <tr>
          <th class:hot={hovered && hovered.k === k}>{K}</th>
          {#each LETTERS as _, p}
            <td
              class:hot={hovered && hovered.k === k && hovered.p === p}
              class:band={hovered && (hovered.k === k || hovered.p === p)}
              on:mouseenter={() => (hovered = { k, p })}
            >{cipherAt(k, p)}</td>
          {/each}
        </tr>
      {/each}
    </table>
  </div>

  <div class="readout" aria-live="polite">
    {#if hovered}
      plain <b>{LETTERS[hovered.p]}</b> + key <b>{LETTERS[hovered.k]}</b>
      = cipher <b class="result">{cipherAt(hovered.k, hovered.p)}</b>
    {:else}
      rows: key letter · columns: plaintext letter
    {/if}
  </div>
</div>

<style>
  .vigsq { display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
           font-family: var(--font-serif, Georgia, serif); max-width: 100%; }
  .scroller { max-width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; cursor: default; }
  th, td { width: 1.15rem; height: 1.15rem; text-align: center; font-size: 0.62rem;
           line-height: 1; padding: 0; }
  th { color: var(--color-ink-soft, #55493a); font-weight: 600; }
  th.hot { color: var(--accent-red, #a23c3c); }
  td { border: 1px solid var(--color-rule, #d9c9a3); color: var(--accent-teal, #2b6b66);
       background: var(--color-bg, #f4ecd8); }
  td.band { background: var(--wash-teal, #dcece9); }
  td.hot { background: var(--wash-red, #f3dede); color: var(--accent-red, #a23c3c);
           font-weight: 700; }
  .readout { min-height: 1.4em; font-size: 0.92rem; color: var(--color-ink-soft, #55493a); }
  .readout b { color: var(--color-ink, #2b2117); }
  .readout b.result { color: var(--accent-red, #a23c3c); }
</style>
