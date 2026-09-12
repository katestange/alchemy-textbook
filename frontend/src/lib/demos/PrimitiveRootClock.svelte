<script>
  // "Primitive Root Clock" — the unit group (Z/pZ)* drawn as the cycle of
  // powers of a primitive root g, the picture behind Diffie-Hellman.  Position
  // x on the clock (grey exponent outside, counting clockwise from the top)
  // holds the residue g^x mod p.  Change p and g and watch the residues
  // scramble; slide or hover x to see which residue a given exponent lands
  // on.  Arithmetic lives in powerclock.js.
  import DemoShell from './DemoShell.svelte';
  import {
    isPrime, nextPrime, prevPrime, powerCycle, isPrimitiveRoot, primitiveRoots,
    nextPrimitiveRoot, prevPrimitiveRoot, MAX_P, MIN_P
  } from './powerclock.js';

  export let open = false;

  let pText = '23';
  let gText = '5';
  let x = 0;              // the exponent the slider points at
  let hoverK = null;      // the position the pointer is over, if any

  // ---- validation ---------------------------------------------------------
  $: p = parseInt(pText, 10);
  $: g = parseInt(gText, 10);
  $: pError = (() => {
    if (!Number.isInteger(p) || String(p) !== pText.trim()) return 'Enter a whole number for p.';
    if (p > MAX_P) return `The clock draws primes up to ${MAX_P}.`;
    if (p < MIN_P) return `p must be at least ${MIN_P}.`;
    if (!isPrime(p)) {
      const lo = prevPrime(p), hi = nextPrime(p, MAX_P);
      return `${p} is not prime` + (lo && hi ? ` (the nearest primes are ${lo} and ${hi}).` : '.');
    }
    return '';
  })();
  $: gError = (() => {
    if (pError) return '';
    if (!Number.isInteger(g) || String(g) !== gText.trim()) return 'Enter a whole number for g.';
    if (g < 1 || g > p - 1) return `g must be a residue between 1 and ${p - 1}.`;
    return '';
  })();
  $: ready = !pError && !gError;

  // ---- the cycle ------------------------------------------------------------
  $: cycle = ready ? powerCycle(g, p) : [];
  $: n = cycle.length;
  $: primitive = ready && n === p - 1;
  $: roots = ready ? primitiveRoots(p) : [];
  $: rootsText = roots.length <= 12 ? roots.join(', ')
    : `${roots.slice(0, 12).join(', ')}, … (${roots.length} in all)`;
  $: if (x > Math.max(0, n - 1)) x = 0;
  $: shown = hoverK ?? x;                    // the exponent being pointed at
  $: shownResidue = n ? cycle[shown] : null;

  function setP(v) { pText = String(v); hoverK = null; }
  function setG(v) { gText = String(v); hoverK = null; }
  function stepP(dir) {
    const q = dir > 0 ? nextPrime(Number.isFinite(p) ? p : 2, MAX_P) : prevPrime(Number.isFinite(p) ? p : MAX_P + 1, MIN_P);
    if (q) { setP(q); if (Number.isFinite(g) && (g < 1 || g > q - 1 || !isPrimitiveRoot(g, q))) setG(primitiveRoots(q)[0] ?? 1); }
  }
  function stepG(dir) {
    if (pError) return;
    const base = Number.isFinite(g) ? g : (dir > 0 ? 0 : p);
    const h = dir > 0 ? nextPrimitiveRoot(base, p) : prevPrimitiveRoot(base, p);
    if (h) setG(h);
  }

  // ---- geometry -------------------------------------------------------------
  const W = 520, H = 520, CX = 260, CY = 260;
  const R = 200;                     // ring of residues
  const R_OUT = 238;                 // ring of exponent labels
  // Three levels of detail so the clock stays readable up to MAX_P.
  $: level = n <= 48 ? 'full' : n <= 130 ? 'compact' : 'dots';
  $: spacing = (2 * Math.PI * R) / Math.max(n, 1);          // px between neighbours on the ring
  $: nodeR = level === 'full' ? Math.min(13, spacing * 0.38) : level === 'compact' ? 2.4 : 2.2;
  $: fontPx = level === 'full' ? Math.max(9, Math.min(13, nodeR)) : level === 'compact' ? 9 : 0;
  // Compact clocks put the residue labels beside the dots, alternating inside
  // and outside the ring so neighbours never overlap.
  $: labelR = (k) => (level === 'compact' ? (k % 2 ? R + 15 : R - 15) : R);
  $: angle = (k) => -Math.PI / 2 + (2 * Math.PI * k) / Math.max(n, 1);   // clockwise from the top
  $: pos = (k, r = R) => ({ px: CX + r * Math.cos(angle(k)), py: CY + r * Math.sin(angle(k)) });

  // An arc of the ring from position k to k + 1, trimmed so it starts and
  // ends just outside the two nodes; drawn with an arrowhead.
  $: arc = (k) => {
    const gap = (nodeR + 3) / R;                 // radians to leave clear around a node
    const a0 = angle(k) + gap, a1 = angle(k + 1) - gap;
    if (a1 <= a0) return '';
    const x0 = CX + R * Math.cos(a0), y0 = CY + R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  // For a crowded clock (compact / dots), one plain ring with four arrowheads instead of n arcs.
  const ringArrows = [0, 0.25, 0.5, 0.75].map((f) => {
    const a = -Math.PI / 2 + 2 * Math.PI * f, b = a + 0.02;
    return `M ${(CX + R * Math.cos(a)).toFixed(2)} ${(CY + R * Math.sin(a)).toFixed(2)} A ${R} ${R} 0 0 1 ${(CX + R * Math.cos(b)).toFixed(2)} ${(CY + R * Math.sin(b)).toFixed(2)}`;
  });

  $: cycleText = cycle.join(', ');
</script>

<DemoShell title="Primitive Root Clock" {open}>
  <div class="clock">
    <div class="controls">
      <label>
        <span class="name">prime p</span>
        <span class="stepper">
          <button type="button" on:click={() => stepP(-1)} title="previous prime" aria-label="previous prime">◂</button>
          <input type="text" inputmode="numeric" value={pText} on:input={(e) => setP(e.target.value)} spellcheck="false" aria-label="prime p" />
          <button type="button" on:click={() => stepP(1)} title="next prime" aria-label="next prime">▸</button>
        </span>
        {#if pError}<span class="err">{pError}</span>{/if}
      </label>
      <label>
        <span class="name">primitive root g</span>
        <span class="stepper">
          <button type="button" on:click={() => stepG(-1)} title="previous primitive root" aria-label="previous primitive root" disabled={!!pError}>◂</button>
          <input type="text" inputmode="numeric" value={gText} on:input={(e) => setG(e.target.value)} spellcheck="false" aria-label="primitive root g" />
          <button type="button" on:click={() => stepG(1)} title="next primitive root" aria-label="next primitive root" disabled={!!pError}>▸</button>
        </span>
        {#if gError}<span class="err">{gError}</span>{/if}
      </label>
    </div>

    {#if ready}
      <p class="note" class:warn={!primitive}>
        {#if primitive}
          {g} is a primitive root modulo {p}: its powers visit all {p - 1} elements of (ℤ/{p}ℤ)* in one big cycle.
          The primitive roots modulo {p} are {rootsText}.
        {:else}
          {g} is <em>not</em> a primitive root modulo {p}: it has order {n}, so its powers return to 1 after only {n} of the {p - 1} units.
          The primitive roots modulo {p} are {rootsText}.
        {/if}
      </p>

      <svg viewBox="0 0 {W} {H}" role="img" aria-label="The powers of {g} modulo {p} arranged around a clock"
           on:pointerleave={() => (hoverK = null)}>
        <defs>
          <marker id="prc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" class="arrowhead" />
          </marker>
        </defs>

        {#if level !== 'full'}
          <circle class="ring" cx={CX} cy={CY} r={R} />
          {#each ringArrows as d}<path class="ring-arrow" {d} marker-end="url(#prc-arrow)" />{/each}
        {:else}
          {#each cycle as _, k}
            {@const d = arc(k)}
            {#if d}<path class="edge" {d} marker-end="url(#prc-arrow)" />{/if}
          {/each}
        {/if}

        <!-- residues on the ring -->
        {#each cycle as r, k}
          {@const q = pos(k)}
          <g class="node" class:lit={k === shown} class:dot={level !== 'full'}
             on:pointerenter={() => (hoverK = k)} on:pointerdown={() => { x = k; hoverK = null; }} role="button" tabindex="-1"
             aria-label="{g}^{k} = {r} mod {p}">
            <circle class="hit" cx={q.px} cy={q.py} r={Math.max(nodeR + 4, 5)} />
            <circle class="disc" cx={q.px} cy={q.py} r={nodeR} />
            {#if fontPx}
              {@const t = pos(k, labelR(k))}
              <text class="residue" class:beside={level === 'compact'} x={t.px} y={t.py + fontPx * 0.36} font-size={fontPx}>{r}</text>
            {/if}
          </g>
        {/each}

        <!-- exponents outside the ring -->
        {#if level === 'full'}
          {#each cycle as _, k}
            {@const q = pos(k, R_OUT)}
            <text class="exponent" class:lit={k === shown} x={q.px} y={q.py + 4}>{k}</text>
          {/each}
        {/if}

        <!-- the spoke to the exponent being pointed at -->
        {#if n}
          {@const q = pos(shown, R - nodeR - 2)}
          {@const q0 = pos(shown, 62)}
          <line class="spoke" x1={q0.px} y1={q0.py} x2={q.px} y2={q.py} />
          <circle class="hub" cx={CX} cy={CY} r="3" />
          <text class="readout" x={CX} y={CY - 16}>x = {shown}</text>
          <text class="readout big" x={CX} y={CY + 24}>{g}<tspan class="sup" dy="-9" font-size="14">{shown}</tspan><tspan dy="9">&#160;≡ {shownResidue}</tspan></text>
          <text class="readout" x={CX} y={CY + 46}>(mod {p})</text>
        {/if}
      </svg>

      <label class="slider">
        <span>exponent x = <strong>{shown}</strong> &nbsp;→&nbsp; {g}<sup>{shown}</sup> ≡ <strong>{shownResidue}</strong> (mod {p})</span>
        <input type="range" min="0" max={Math.max(0, n - 1)} step="1" bind:value={x} on:input={() => (hoverK = null)} aria-label="exponent x" />
      </label>

      <p class="cycle-list"><span class="lbl">Reading clockwise from the top:</span> {cycleText}, back to 1.</p>
    {:else}
      <p class="note warn">Choose a prime p and a residue g to draw the clock.</p>
    {/if}

    <p class="demo-note">Position x on the clock (the grey exponent outside the ring) holds the residue g<sup>x</sup> mod p, and
      each arrow multiplies by g. Slide x, or hover a residue, to see which exponent produced it. Use the ◂ ▸ buttons to
      step through primes and primitive roots. Notice that the residues around the clock look shuffled: reading off x
      from g<sup>x</sup> is the <em>discrete logarithm problem</em>.</p>
  </div>
</DemoShell>

<style>
  .clock { flex: 1 1 100%; display: flex; flex-direction: column; gap: 0.7rem; min-width: 0;
           font-family: var(--font-serif, Georgia, serif); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; align-items: flex-start; }
  .controls label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem;
                    color: var(--color-ink-soft, #55493a); flex: 1 1 12rem; min-width: 0; }
  .name { font-variant-caps: small-caps; letter-spacing: 0.03em; }
  .stepper { display: inline-flex; align-items: stretch; border: 1px solid var(--color-rule, #d9c9a3);
             border-radius: 6px; overflow: hidden; background: var(--color-bg, #f4ecd8); }
  .stepper input { flex: 1 1 4rem; min-width: 0; width: 5rem; text-align: center; border: none; background: transparent;
                   font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: 1.05rem; line-height: 1.4;
                   padding: 0.3rem 0.4rem; color: var(--color-ink, #2b2117); }
  .stepper button { font: inherit; font-size: 1rem; padding: 0 0.7rem; border: none; cursor: pointer;
                    background: var(--color-bg-raised, #ede2c8); color: var(--color-ink-soft, #55493a); }
  .stepper button:hover:not(:disabled) { background: var(--accent-teal, #2b6b66); color: var(--color-bg, #f4ecd8); }
  .stepper button:disabled { opacity: 0.4; cursor: default; }
  .err { font-size: 0.78rem; color: var(--accent-red, #a23c3c); }

  .note { margin: 0; font-size: 0.9rem; padding: 0.45rem 0.8rem; border-radius: 6px;
          border-left: 3px solid var(--accent-green, #5b6f3a); background: var(--wash-green, #e6ecda);
          color: var(--color-ink, #2b2117); }
  .note.warn { border-left-color: var(--accent-gold, #a97917); background: var(--wash-gold, #f3e6c8); }

  svg { width: 100%; max-width: 30rem; height: auto; display: block; margin: 0 auto; border-radius: 8px;
        background: var(--color-bg, #f4ecd8); border: 1px solid var(--color-rule, #d9c9a3);
        touch-action: manipulation; user-select: none; }
  .arrowhead { fill: var(--color-ink-soft, #55493a); }
  .edge, .ring-arrow { fill: none; stroke: var(--color-ink-soft, #55493a); stroke-width: 1.6; }
  .ring { fill: none; stroke: var(--color-rule, #d9c9a3); stroke-width: 1.4; }
  .node { cursor: pointer; }
  .node .hit { fill: transparent; }
  .node .disc { fill: var(--color-bg-raised, #ede2c8); stroke: var(--color-ink, #2b2117); stroke-width: 1.2;
                transition: fill 0.15s, stroke 0.15s; }
  .node.dot .disc { fill: var(--color-ink, #2b2117); stroke: none; }
  .node:hover .disc { stroke: var(--accent-gold, #a97917); stroke-width: 2; }
  .node.lit .disc { fill: var(--accent-gold, #a97917); stroke: var(--accent-gold, #a97917); }
  .node.dot.lit .disc { r: 4; }
  .residue { text-anchor: middle; fill: var(--color-ink, #2b2117); font-family: var(--font-serif, Georgia, serif);
             font-weight: 600; pointer-events: none; }
  .node.lit .residue { fill: var(--color-bg, #f4ecd8); }
  .residue.beside { fill: var(--color-ink, #2b2117); font-weight: 400; }
  .node.lit .residue.beside { fill: var(--accent-gold, #a97917); font-weight: 700; }
  .exponent { font-size: 11px; text-anchor: middle; fill: var(--accent-grey, #55524c); opacity: 0.85;
              font-family: var(--font-serif, Georgia, serif); }
  .exponent.lit { fill: var(--accent-gold, #a97917); opacity: 1; font-weight: 700; font-size: 13px; }
  .spoke { stroke: var(--accent-gold, #a97917); stroke-width: 1.4; stroke-dasharray: 4 3; opacity: 0.8; }
  .hub { fill: var(--accent-gold, #a97917); }
  .readout { font-size: 14px; text-anchor: middle; fill: var(--color-ink-soft, #55493a);
             font-family: var(--font-serif, Georgia, serif); pointer-events: none; }
  .readout.big { font-size: 22px; fill: var(--color-ink, #2b2117); font-weight: 600; }

  .slider { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.9rem; color: var(--color-ink-soft, #55493a); }
  .slider input[type='range'] { width: 100%; accent-color: var(--accent-gold, #a97917); }
  .cycle-list { margin: 0; font-size: 0.88rem; color: var(--color-ink, #2b2117); line-height: 1.5;
                padding: 0.45rem 0.8rem; border-radius: 6px; background: var(--wash-grey, #e7e5e0);
                border: 1px solid var(--color-rule, #d9c9a3); word-break: break-word; }
  .lbl { font-variant-caps: small-caps; letter-spacing: 0.03em; color: var(--color-ink-soft, #55493a); }
  .demo-note { margin: 0; font-size: 0.85rem; color: var(--color-ink-soft, #55493a); line-height: 1.5; }
  sup { font-size: 0.75em; }
</style>
