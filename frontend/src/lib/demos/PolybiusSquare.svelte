<script>
  // Interactive Polybius square (the book's 5×5, I/J merged). Hover a cell to
  // highlight its row/column coordinates and read off e.g. "B = (1, 2)".
  import { POLYBIUS_GRID } from './ciphers.js';

  let hovered = null;   // {row, col} 0-indexed, or null
</script>

<div class="polybius">
  <table on:mouseleave={() => (hovered = null)}>
    <tr>
      <th></th>
      {#each [1, 2, 3, 4, 5] as c}
        <th class:hot={hovered && hovered.col === c - 1}>{c}</th>
      {/each}
    </tr>
    {#each POLYBIUS_GRID as row, r}
      <tr>
        <th class:hot={hovered && hovered.row === r}>{r + 1}</th>
        {#each row as cell, c}
          <td
            class:hot={hovered && hovered.row === r && hovered.col === c}
            class:dim={hovered && !(hovered.row === r || hovered.col === c)}
            on:mouseenter={() => (hovered = { row: r, col: c })}
          >{cell}</td>
        {/each}
      </tr>
    {/each}
  </table>

  <div class="readout" aria-live="polite">
    {#if hovered}
      <b>{POLYBIUS_GRID[hovered.row][hovered.col]}</b> = ({hovered.row + 1}, {hovered.col + 1})
    {/if}
  </div>
</div>

<style>
  .polybius { display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
              font-family: var(--font-serif, Georgia, serif); }
  table { border-collapse: collapse; cursor: default; }
  th, td { width: 2.2rem; height: 2.2rem; text-align: center; font-size: 1.05rem; }
  th { color: var(--color-ink-soft, #55493a); font-weight: 600; }
  th.hot { color: var(--accent-red, #a23c3c); }
  td { border: 1px solid var(--color-rule, #d9c9a3); color: var(--color-ink, #2b2117);
       background: var(--color-bg, #f4ecd8); transition: background 0.08s ease; }
  td.hot { background: var(--wash-red, #f3dede); color: var(--accent-red, #a23c3c);
           font-weight: 600; }
  td.dim { opacity: 0.45; }
  .readout { min-height: 1.4em; font-size: 0.95rem; color: var(--color-ink-soft, #55493a); }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
