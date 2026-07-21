<script>
  // Interactive Caesar cipher wheel. Outer ring = plaintext A–Z (fixed);
  // inner ring = ciphertext A–Z, rotated by `key`. Drag the wheel (or use the
  // nudge buttons) to set the key; hover a spoke to read off a letter pairing.
  // Muted palette via the reader's theme CSS variables.
  export let key = 3;          // shift 0..25, bindable
  export let size = 340;
  export let interactive = true;

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const N = 26;
  const step = 360 / N;
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.43;   // outer letters
  const rInner = size * 0.32;   // inner letters
  const ringOut = size * 0.475, ringMid = size * 0.375, ringIn = size * 0.265;

  let hovered = null;           // index of hovered plaintext letter
  let svgEl;

  // position of index i on a ring of radius r, i=0 at top, clockwise
  function pos(i, r) {
    const a = (i * step - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  $: innerRot = -key * step;    // aligns ciphertext (i+key) under plaintext i
  $: cipherOf = (i) => (i + key) % N;

  // ---- drag to rotate ----
  let dragging = false, startAngle = 0, startKey = 0;
  function angleAt(ev) {
    const r = svgEl.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2),
                      ev.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  }
  function down(ev) {
    if (!interactive) return;
    dragging = true; startAngle = angleAt(ev); startKey = key;
    svgEl.setPointerCapture?.(ev.pointerId);
  }
  function move(ev) {
    if (!dragging) return;
    const delta = angleAt(ev) - startAngle;
    key = ((startKey + Math.round(delta / step)) % N + N) % N;
  }
  function up() { dragging = false; }
  function nudge(d) { key = ((key + d) % N + N) % N; }
</script>

<div class="wheel" style="--wheel:{size}px">
  <svg
    bind:this={svgEl}
    viewBox="0 0 {size} {size}"
    role="img"
    aria-label="Caesar cipher wheel, key {key}"
    class:interactive
    on:pointerdown={down}
    on:pointermove={move}
    on:pointerup={up}
    on:pointerleave={() => { up(); hovered = null; }}
  >
    <!-- transparent backdrop so a drag registers anywhere on the wheel, not
         only when the pointer happens to be over a letter or ring stroke -->
    <circle class="backdrop" cx={cx} cy={cy} r={size / 2} />

    <!-- rings -->
    <circle class="ring" cx={cx} cy={cy} r={ringOut} />
    <circle class="ring" cx={cx} cy={cy} r={ringMid} />
    <circle class="ring ring-fill" cx={cx} cy={cy} r={ringIn} />

    <!-- outer ring: plaintext (fixed) -->
    <g>
      {#each LETTERS as L, i}
        {@const p = pos(i, rOuter)}
        <g class="spoke" class:hot={hovered === i}
           on:mouseenter={() => (hovered = i)}>
          <circle class="hit" cx={p.x} cy={p.y} r={size * 0.05} />
          <text class="plain" x={p.x} y={p.y}>{L}</text>
        </g>
      {/each}
    </g>

    <!-- inner ring: ciphertext (rotates with the key) -->
    <g transform="rotate({innerRot} {cx} {cy})">
      {#each LETTERS as L, m}
        {@const p = pos(m, rInner)}
        <text class="cipher" class:hot={hovered !== null && cipherOf(hovered) === m}
              x={p.x} y={p.y}
              transform="rotate({-innerRot} {p.x} {p.y})">{L}</text>
      {/each}
    </g>

    <!-- fixed top marker -->
    <path class="marker" d="M{cx-7} {cy-ringOut-6} L{cx+7} {cy-ringOut-6} L{cx} {cy-ringOut+6} Z" />
  </svg>

  <div class="readout" aria-live="polite">
    {#if hovered !== null}
      plaintext <b>{LETTERS[hovered]}</b> = ciphertext <b>{LETTERS[cipherOf(hovered)]}</b>
    {:else}
      key = <b>{key}</b> &nbsp;(A → {LETTERS[key]}){#if interactive} · drag the wheel to change{/if}
    {/if}
  </div>

  {#if interactive}
    <div class="nudge">
      <button type="button" on:click={() => nudge(-1)} aria-label="decrease key">−</button>
      <span>key {key}</span>
      <button type="button" on:click={() => nudge(1)} aria-label="increase key">+</button>
    </div>
  {/if}
</div>

<style>
  .wheel {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.5rem; width: var(--wheel); max-width: 100%; margin: 0 auto;
    font-family: var(--font-serif, Georgia, serif);
  }
  svg { width: 100%; height: auto; touch-action: none; user-select: none; }
  svg.interactive { cursor: grab; }
  svg.interactive:active { cursor: grabbing; }

  .backdrop { fill: transparent; }
  .ring { fill: none; stroke: var(--color-rule, #d9c9a3); stroke-width: 1; }
  .ring-fill { fill: var(--color-bg, #f4ecd8); opacity: 0.55; }

  text { font-size: calc(var(--wheel) * 0.052); text-anchor: middle;
         dominant-baseline: central; }
  .plain  { fill: var(--color-ink, #2b2117); }
  .cipher { fill: var(--accent-teal, #2b6b66); }
  .hit    { fill: transparent; }

  .spoke { cursor: pointer; }
  .spoke.hot .plain { fill: var(--accent-red, #a23c3c); font-weight: 600; }
  .cipher.hot { fill: var(--accent-red, #a23c3c); font-weight: 600; }

  .marker { fill: var(--color-ink-soft, #55493a); }

  .readout { font-size: 0.95rem; color: var(--color-ink-soft, #55493a);
             text-align: center; min-height: 1.4em; }
  .readout b { color: var(--color-ink, #2b2117); }

  .nudge { display: flex; align-items: center; gap: 0.75rem;
           font-size: 0.85rem; color: var(--color-ink-soft, #55493a); }
  .nudge button {
    width: 1.9rem; height: 1.9rem; border-radius: 50%;
    border: 1px solid var(--color-rule, #d9c9a3);
    background: var(--color-bg-raised, #ede2c8); color: var(--color-ink, #2b2117);
    font-size: 1.1rem; line-height: 1; cursor: pointer;
  }
  .nudge button:hover { border-color: var(--accent-teal, #2b6b66); }
</style>
