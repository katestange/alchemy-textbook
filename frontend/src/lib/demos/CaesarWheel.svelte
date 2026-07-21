<script>
  // Interactive Caesar cipher wheel. Outer ring = plaintext A–Z (fixed);
  // inner ring = ciphertext A–Z, rotated by `key`. Drag horizontally —
  // anywhere, the drag follows the pointer across the whole page — to set the
  // key (dragging right turns the inner ring clockwise); hover a spoke to
  // read off a letter pairing. Muted palette via the reader's theme vars.
  import { onDestroy } from 'svelte';

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
  const modN = (k) => ((k % N) + N) % N;

  // ---- hover: derive the letter from the pointer's angle on EVERY move, so
  // the highlight tracks the mouse instead of sticking at the last hit ----
  function updateHover(ev) {
    const rect = svgEl.getBoundingClientRect();
    const scale = size / rect.width;
    const dx = (ev.clientX - rect.left) * scale - cx;
    const dy = (ev.clientY - rect.top) * scale - cy;
    const r = Math.hypot(dx, dy);
    if (r < ringIn || r > size / 2) { hovered = null; return; }  // centre / outside
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;              // -180..180, 0 = 3 o'clock
    hovered = modN(Math.round((ang + 90) / step));
  }

  // ---- drag: horizontal, page-wide. Listeners go on window for the duration
  // of the drag so it keeps working when the pointer leaves the wheel.
  // Dragging right turns the inner ring clockwise (key decreases). ----
  let dragging = false, startX = 0, startKey = 0;
  $: pxPerStep = Math.max(14, size * 0.05);

  function down(ev) {
    if (!interactive) return;
    dragging = true; startX = ev.clientX; startKey = key; hovered = null;
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd);
  }
  function dragMove(ev) {
    key = modN(startKey - Math.round((ev.clientX - startX) / pxPerStep));
  }
  function dragEnd() {
    dragging = false;
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', dragEnd);
  }
  onDestroy(dragEnd);

  function nudge(d) { key = modN(key + d); }
</script>

<div class="wheel" style="--wheel:{size}px">
  <svg
    bind:this={svgEl}
    viewBox="0 0 {size} {size}"
    role="img"
    aria-label="Caesar cipher wheel, key {key}"
    class:interactive
    on:pointerdown={down}
    on:pointermove={(ev) => { if (!dragging) updateHover(ev); }}
    on:pointerleave={() => { if (!dragging) hovered = null; }}
  >
    <!-- transparent backdrop so pointer events register anywhere on the wheel -->
    <circle class="backdrop" cx={cx} cy={cy} r={size / 2} />

    <!-- rings -->
    <circle class="ring" cx={cx} cy={cy} r={ringOut} />
    <circle class="ring" cx={cx} cy={cy} r={ringMid} />
    <circle class="ring ring-fill" cx={cx} cy={cy} r={ringIn} />

    <!-- outer ring: plaintext (fixed) -->
    <g>
      {#each LETTERS as L, i}
        {@const p = pos(i, rOuter)}
        <text class="plain" class:hot={hovered === i} x={p.x} y={p.y}>{L}</text>
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

    <!-- the one instruction lives in the wheel's hub -->
    {#if interactive}
      <text class="hub" x={cx} y={cy - size * 0.028}>drag to</text>
      <text class="hub" x={cx} y={cy + size * 0.028}>change key</text>
    {/if}
  </svg>

  <!-- pairing readout: blank unless hovering (the key lives below, between − and +) -->
  <div class="readout" aria-live="polite">
    {#if hovered !== null}
      plaintext <b>{LETTERS[hovered]}</b> = ciphertext <b>{LETTERS[cipherOf(hovered)]}</b>
    {/if}
  </div>

  {#if interactive}
    <div class="nudge">
      <button type="button" on:click={() => nudge(-1)} aria-label="decrease key">−</button>
      <span>key <b>{key}</b></span>
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
         dominant-baseline: central; pointer-events: none; }
  .plain  { fill: var(--color-ink, #2b2117); }
  .cipher { fill: var(--accent-teal, #2b6b66); }
  .plain.hot, .cipher.hot { fill: var(--accent-red, #a23c3c); font-weight: 600; }

  .marker { fill: var(--color-ink-soft, #55493a); }

  .hub {
    font-size: calc(var(--wheel) * 0.038);
    font-variant-caps: small-caps; letter-spacing: 0.05em;
    fill: var(--color-ink-soft, #55493a); opacity: 0.75;
  }

  .readout { font-size: 0.95rem; color: var(--color-ink-soft, #55493a);
             text-align: center; min-height: 1.4em; }
  .readout b { color: var(--color-ink, #2b2117); }

  .nudge { display: flex; align-items: center; gap: 0.75rem;
           font-size: 0.9rem; color: var(--color-ink-soft, #55493a); }
  .nudge b { color: var(--color-ink, #2b2117); }
  .nudge button {
    width: 1.9rem; height: 1.9rem; border-radius: 50%;
    border: 1px solid var(--color-rule, #d9c9a3);
    background: var(--color-bg-raised, #ede2c8); color: var(--color-ink, #2b2117);
    font-size: 1.1rem; line-height: 1; cursor: pointer;
  }
  .nudge button:hover { border-color: var(--accent-teal, #2b6b66); }
</style>
