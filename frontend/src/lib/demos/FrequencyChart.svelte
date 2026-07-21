<script>
  // Letter-frequency bar chart in the book's muted palette. Shows the English
  // distribution (fig:frequencies values); optionally overlays a second
  // series (a user text's frequencies) as paired bars. Hover a letter's bars
  // to read the numbers.
  import { LETTERS, ENGLISH_FREQUENCIES } from './ciphers.js';

  export let user = null;        // {A: pct, ...} or null for English-only

  const W = 560, H = 190, PAD = { l: 8, r: 8, t: 18, b: 22 };
  $: maxVal = Math.max(
    ...LETTERS.map((l) => ENGLISH_FREQUENCIES[l]),
    ...(user ? LETTERS.map((l) => user[l] || 0) : [0])
  );
  $: slot = (W - PAD.l - PAD.r) / 26;
  $: barW = user ? slot * 0.34 : slot * 0.6;
  $: scaleY = (v) => (H - PAD.t - PAD.b) * (v / maxVal);

  let hovered = null;            // letter index or null
</script>

<div class="freq-chart">
  {#if user}
    <div class="legend">
      <span><i class="swatch english"></i> English</span>
      <span><i class="swatch yours"></i> your text</span>
    </div>
  {/if}
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Letter frequency chart"
       on:mouseleave={() => (hovered = null)}>
    <line class="axis" x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} />
    {#each LETTERS as L, i}
      {@const x = PAD.l + i * slot}
      {@const ev = ENGLISH_FREQUENCIES[L]}
      {@const uv = user ? user[L] || 0 : null}
      <g class="col" class:hot={hovered === i} on:mouseenter={() => (hovered = i)}>
        <rect class="hit" x={x} y={PAD.t - 8} width={slot} height={H - PAD.t - PAD.b + 8} />
        <rect class="bar english" x={x + (slot - (user ? 2 * barW + 2 : barW)) / 2}
              y={H - PAD.b - scaleY(ev)} width={barW} height={scaleY(ev)} />
        {#if user}
          <rect class="bar yours" x={x + (slot - 2 * barW - 2) / 2 + barW + 2}
                y={H - PAD.b - scaleY(uv)} width={barW} height={scaleY(uv)} />
        {/if}
        <text class="xlabel" x={x + slot / 2} y={H - PAD.b + 14}>{L}</text>
        {#if hovered === i}
          <text class="value" x={x + slot / 2} y={Math.max(10, H - PAD.b - scaleY(Math.max(ev, uv ?? 0)) - 5)}>
            {user ? `${(uv ?? 0).toFixed(1)}` : ev.toFixed(1)}</text>
        {/if}
      </g>
    {/each}
  </svg>
  <div class="readout" aria-live="polite">
    {#if hovered !== null}
      <b>{LETTERS[hovered]}</b> — English {ENGLISH_FREQUENCIES[LETTERS[hovered]].toFixed(1)}%{#if user},
        your text {(user[LETTERS[hovered]] || 0).toFixed(1)}%{/if}
    {/if}
  </div>
</div>

<style>
  .freq-chart { display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
                width: 100%; font-family: var(--font-serif, Georgia, serif); }
  svg { width: 100%; max-width: 36rem; height: auto; }
  .axis { stroke: var(--color-rule, #d9c9a3); }
  .hit { fill: transparent; }
  .bar.english { fill: var(--accent-gold, #a97917); opacity: 0.55; }
  .bar.yours { fill: var(--accent-teal, #2b6b66); }
  .col.hot .bar { opacity: 1; }
  .col.hot .bar.english { fill: var(--accent-gold, #a97917); }
  .xlabel { font-size: 9px; text-anchor: middle; fill: var(--color-ink-soft, #55493a); }
  .col.hot .xlabel { fill: var(--accent-red, #a23c3c); font-weight: 700; }
  .value { font-size: 10px; text-anchor: middle; fill: var(--accent-red, #a23c3c); }
  .legend { display: flex; gap: 1.2rem; font-size: 0.8rem; color: var(--color-ink-soft, #55493a); }
  .swatch { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px;
            vertical-align: -0.05rem; margin-right: 0.3rem; }
  .swatch.english { background: var(--accent-gold, #a97917); opacity: 0.55; }
  .swatch.yours { background: var(--accent-teal, #2b6b66); }
  .readout { min-height: 1.3em; font-size: 0.9rem; color: var(--color-ink-soft, #55493a); }
  .readout b { color: var(--accent-red, #a23c3c); }
</style>
