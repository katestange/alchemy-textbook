<script>
  // Interactive ADFGVX example (the figure's worked case): ATTACK AT DAWN
  // through both stages — substitution by the 6×6 square, then columnar
  // transposition under the key 3 4 2 1. Hover a plaintext or ciphertext
  // letter to trace it through the square, the pair stream, and the grid.
  import AdfgvxSquare from './AdfgvxSquare.svelte';
  import { adfgvxSubstitute, columnarEncode, colReadSequence } from './ciphers.js';

  const PLAIN = 'attackatdawn';
  const ORDER = [3, 4, 2, 1];
  const COLS = ORDER.length;

  const stream = adfgvxSubstitute(PLAIN).replace(/ /g, '');   // 24 chars
  const ROWS = stream.length / COLS;
  const CIPHER = columnarEncode(stream, COLS, ORDER);
  const readSeq = colReadSequence(COLS, ORDER);               // column indices in read order

  // stream char s sits at grid (row ⌊s/COLS⌋, col s%COLS); its ciphertext
  // position is readSeq.indexOf(col)*ROWS + row.
  const streamToCipher = (s) => readSeq.indexOf(s % COLS) * ROWS + Math.floor(s / COLS);
  const cipherToStream = (j) => (j % ROWS) * COLS + readSeq[Math.floor(j / ROWS)];

  let hovered = null;   // plaintext index 0..11, or null
  $: hotStream = hovered === null ? [] : [2 * hovered, 2 * hovered + 1];
  $: hotCipher = hotStream.map(streamToCipher);
</script>

<div class="adfgvx" on:mouseleave={() => (hovered = null)}>
  <div class="stage">
    <div class="stage-label">1 · substitute by the square</div>
    <AdfgvxSquare mark={hovered === null ? null : PLAIN[hovered]} />
  </div>

  <div class="stage">
    <div class="line">
      <span class="tag">plaintext</span>
      {#each PLAIN as ch, i}
        <span class="cell" class:hot={hovered === i} on:mouseenter={() => (hovered = i)}>{ch}</span>
      {/each}
    </div>
    <div class="line">
      <span class="tag">pairs</span>
      {#each Array(PLAIN.length) as _, i}
        <span class="pair" class:hot={hovered === i} on:mouseenter={() => (hovered = i)}>
          {stream[2 * i]}{stream[2 * i + 1]}</span>
      {/each}
    </div>

    <div class="stage-label">2 · transpose the pair stream under the key</div>
    <table>
      <tr>{#each ORDER as k, c}
        <th class:hot={hovered !== null && hotStream.some((s) => s % COLS === c)}>{k}</th>
      {/each}</tr>
      {#each Array(ROWS) as _, r}
        <tr>
          {#each Array(COLS) as _, c}
            {@const s = r * COLS + c}
            <td class:hot={hotStream.includes(s)}
                on:mouseenter={() => (hovered = Math.floor(s / 2))}>{stream[s]}</td>
          {/each}
        </tr>
      {/each}
    </table>
    <div class="hint">read the columns in key order 1, 2, 3, 4 ↓</div>

    <div class="line">
      <span class="tag">ciphertext</span>
      {#each CIPHER as ch, j}
        <span class="cell cipher" class:hot={hotCipher.includes(j)}
              on:mouseenter={() => (hovered = Math.floor(cipherToStream(j) / 2))}>{ch}</span>
      {/each}
    </div>

    <div class="readout" aria-live="polite">
      {#if hovered !== null}
        ‘<b>{PLAIN[hovered]}</b>’ → pair <b>{stream[2 * hovered]}{stream[2 * hovered + 1]}</b>
        → ciphertext positions {hotCipher.map((j) => j + 1).sort((a, b) => a - b).join(' and ')}
      {/if}
    </div>
  </div>
</div>

<style>
  .adfgvx { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center;
            align-items: flex-start; font-family: var(--font-serif, Georgia, serif); }
  .stage { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .stage-label { font-size: 0.8rem; font-variant-caps: small-caps;
                 color: var(--color-ink-soft, #55493a); }
  .line { display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; justify-content: center; }
  .tag { font-size: 0.75rem; font-variant-caps: small-caps; color: var(--color-ink-soft, #55493a);
         margin-right: 0.4rem; min-width: 4.2rem; text-align: right; }
  .cell, .pair { display: inline-flex; height: 1.5rem; align-items: center; justify-content: center;
          border: 1px solid var(--color-rule, #d9c9a3); border-radius: 4px;
          background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117);
          cursor: default; font-size: 0.9rem; }
  .cell { width: 1.5rem; }
  .pair { padding: 0 0.3rem; color: var(--accent-gold, #a97917); }
  .cell.cipher { color: var(--accent-teal, #2b6b66); }
  .hot, td.hot { background: var(--wash-red, #f3dede) !important;
                 color: var(--accent-red, #a23c3c) !important; font-weight: 600; }
  table { border-collapse: collapse; }
  th { width: 1.7rem; height: 1.5rem; color: var(--accent-gold, #a97917); font-size: 0.9rem; }
  th.hot { color: var(--accent-red, #a23c3c); }
  td { width: 1.7rem; height: 1.5rem; text-align: center; font-size: 0.9rem;
       border: 1px solid var(--color-rule, #d9c9a3); background: var(--color-bg, #f4ecd8);
       color: var(--color-ink, #2b2117); cursor: default; }
  .hint { font-size: 0.78rem; font-style: italic; color: var(--color-ink-soft, #55493a); }
  .readout { min-height: 1.4em; font-size: 0.88rem; color: var(--color-ink-soft, #55493a);
             text-align: center; max-width: 24rem; }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
