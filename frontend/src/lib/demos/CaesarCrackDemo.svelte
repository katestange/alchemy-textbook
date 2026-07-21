<script>
  // Interactive exhaustive-search example (the figure's worked case): all 26
  // shifts of the ciphertext WFYDAKZLWPL. Hover a row to inspect it — one of
  // them is English. The point of the exercise is that the reader spots it.
  import { caesarCandidates } from './ciphers.js';

  const CIPHER = 'WFYDAKZLWPL';
  const rows = caesarCandidates(CIPHER);
  const half = Math.ceil(rows.length / 2);

  let hovered = null;   // key index or null
</script>

<div class="crack" on:mouseleave={() => (hovered = null)}>
  <div class="cipher-line">ciphertext: <b>{CIPHER}</b></div>
  <div class="cols">
    {#each [rows.slice(0, half), rows.slice(half)] as colRows}
      <table>
        <tr><th>key</th><th>candidate</th></tr>
        {#each colRows as { key, text }}
          <tr class:hot={hovered === key} on:mouseenter={() => (hovered = key)}>
            <td class="k">{key}</td>
            <td class="t">{text}</td>
          </tr>
        {/each}
      </table>
    {/each}
  </div>
  <div class="readout" aria-live="polite">
    {#if hovered !== null}
      shifting every letter by <b>{hovered}</b> gives <b class="cand">{rows[hovered].text}</b>
      — does it read as English?
    {:else}
      hover the rows: exactly one shift undoes the cipher
    {/if}
  </div>
</div>

<style>
  .crack { display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
           font-family: var(--font-serif, Georgia, serif); }
  .cipher-line { font-size: 0.95rem; color: var(--color-ink-soft, #55493a); }
  .cipher-line b { color: var(--accent-teal, #2b6b66); letter-spacing: 0.08em; }
  .cols { display: flex; gap: 2rem; flex-wrap: wrap; justify-content: center; }
  table { border-collapse: collapse; cursor: default; }
  th { font-size: 0.75rem; font-variant-caps: small-caps; color: var(--color-ink-soft, #55493a);
       padding: 0 0.6rem 0.25rem; text-align: left; }
  td { padding: 0.05rem 0.6rem; font-size: 0.92rem; }
  td.k { color: var(--color-ink-soft, #55493a); text-align: right; }
  td.t { letter-spacing: 0.1em; color: var(--color-ink, #2b2117); }
  tr.hot td { background: var(--wash-red, #f3dede); }
  tr.hot td.t { color: var(--accent-red, #a23c3c); font-weight: 600; }
  .readout { min-height: 1.4em; font-size: 0.9rem; color: var(--color-ink-soft, #55493a);
             text-align: center; }
  .readout b { color: var(--color-ink, #2b2117); }
  .readout b.cand { color: var(--accent-red, #a23c3c); letter-spacing: 0.08em; }
</style>
