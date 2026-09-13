<script>
  // "Baby-Step Giant-Step Clock" — Shanks' algorithm for g^x = h (mod p)
  // played out on the clock of powers of g.  Position x on the clock holds
  // g^x mod p.  The baby steps g^0, g^1, ..., g^(N-1) colour the first N
  // positions clockwise from the top (teal); the giant steps h, h g^(-N),
  // h g^(-2N), ... then hop counter-clockwise around the clock in strides of
  // N (red) until one of them lands on a baby step — the collision (gold),
  // which reads off x = j + kN.  Arithmetic lives in babygiant.js and
  // powerclock.js.
  import { onDestroy } from 'svelte';
  import DemoShell from './DemoShell.svelte';
  import {
    isPrime, nextPrime, prevPrime, powerCycle, isPrimitiveRoot, primitiveRoots,
    nextPrimitiveRoot, prevPrimitiveRoot, MAX_P, MIN_P
  } from './powerclock.js';
  import { babyGiantTrace } from './babygiant.js';

  export let open = false;

  // The worked example in the text: 2^x = 5 (mod 29), x = 22.
  let pText = '29';
  let gText = '2';
  let hText = '5';
  let t = 0;                    // how many steps of the algorithm have been revealed
  let playing = false;
  let timer = null;

  // ---- validation ---------------------------------------------------------
  $: p = parseInt(pText, 10);
  $: g = parseInt(gText, 10);
  $: h = parseInt(hText, 10);
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
  $: hError = (() => {
    if (pError) return '';
    if (!Number.isInteger(h) || String(h) !== hText.trim()) return 'Enter a whole number for h.';
    if (h < 1 || h > p - 1) return `h must be a residue between 1 and ${p - 1}.`;
    return '';
  })();
  $: ready = !pError && !gError && !hError;

  // ---- the cycle and the algorithm ------------------------------------------
  $: cycle = ready ? powerCycle(g, p) : [];
  $: n = cycle.length;
  $: primitive = ready && n === p - 1;
  $: posOf = new Map(cycle.map((r, k) => [r, k]));          // residue -> position on the clock
  $: trace = ready ? babyGiantTrace(g, h, p) : { N: 0, gInvN: null, baby: [], giant: [], collision: null };
  $: N = trace.N;
  $: total = trace.baby.length + trace.giant.length;        // steps until the algorithm stops
  $: reachable = ready && posOf.has(h);
  $: if (t > total) t = total;
  $: babyShown = Math.min(t, trace.baby.length);
  $: giantShown = Math.max(0, t - trace.baby.length);
  $: done = ready && t >= total;
  $: found = done && trace.collision;

  // Colour of each clock position: 'baby', 'giant', 'both' (the collision) or null.
  $: mark = (() => {
    const m = new Map();
    for (let i = 0; i < babyShown; i++) { const k = posOf.get(trace.baby[i].r); if (k !== undefined) m.set(k, 'baby'); }
    for (let i = 0; i < giantShown; i++) {
      const k = posOf.get(trace.giant[i].r);
      if (k === undefined) continue;
      m.set(k, m.get(k) === 'baby' ? 'both' : 'giant');
    }
    return m;
  })();
  // The step most recently revealed, for the readout in the hub.
  $: last = t === 0 ? null
    : t <= trace.baby.length ? { kind: 'baby', ...trace.baby[t - 1] }
    : { kind: 'giant', ...trace.giant[t - trace.baby.length - 1] };
  $: lastPos = last ? posOf.get(last.r) : undefined;

  // ---- animation ------------------------------------------------------------
  $: interval = N <= 8 ? 550 : N <= 16 ? 300 : 160;
  function step() { if (t < total) t += 1; if (t >= total) pause(); }
  function play() {
    if (!ready) return;
    if (t >= total) t = 0;
    playing = true;
    clearInterval(timer);
    timer = setInterval(step, interval);
  }
  function pause() { playing = false; clearInterval(timer); timer = null; }
  function reset() { pause(); t = 0; }
  function toggle() { playing ? pause() : play(); }
  onDestroy(pause);

  function setP(v) { pText = String(v); reset(); }
  function setG(v) { gText = String(v); reset(); }
  function setH(v) { hText = String(v); reset(); }
  function stepP(dir) {
    const q = dir > 0 ? nextPrime(Number.isFinite(p) ? p : 2, MAX_P) : prevPrime(Number.isFinite(p) ? p : MAX_P + 1, MIN_P);
    if (!q) return;
    setP(q);
    if (Number.isFinite(g) && (g < 1 || g > q - 1 || !isPrimitiveRoot(g, q))) setG(primitiveRoots(q)[0] ?? 1);
    if (Number.isFinite(h) && (h < 1 || h > q - 1)) setH(Math.min(Math.max(h, 1), q - 1));
  }
  function stepG(dir) {
    if (pError) return;
    const base = Number.isFinite(g) ? g : (dir > 0 ? 0 : p);
    const r = dir > 0 ? nextPrimitiveRoot(base, p) : prevPrimitiveRoot(base, p);
    if (r) setG(r);
  }
  function stepH(dir) {
    if (pError) return;
    const base = Number.isFinite(h) ? h : 1;
    const v = ((base - 1 + dir) % (p - 1) + (p - 1)) % (p - 1) + 1;    // wraps within 1 .. p-1
    setH(v);
  }

  // ---- geometry (shared with the Primitive Root Clock) ------------------------
  const W = 520, H = 520, CX = 260, CY = 260;
  const R = 200;                     // ring of residues
  const R_OUT = 238;                 // ring of exponent labels
  const R_STRIDE = 168;              // inner ring where the giant strides are drawn
  $: level = n <= 48 ? 'full' : n <= 130 ? 'compact' : 'dots';
  $: spacing = (2 * Math.PI * R) / Math.max(n, 1);
  $: nodeR = level === 'full' ? Math.min(13, spacing * 0.38) : level === 'compact' ? 2.4 : 2.2;
  $: fontPx = level === 'full' ? Math.max(9, Math.min(13, nodeR)) : level === 'compact' ? 9 : 0;
  $: labelR = (k) => (level === 'compact' ? (k % 2 ? R + 15 : R - 15) : R);
  $: angle = (k) => -Math.PI / 2 + (2 * Math.PI * k) / Math.max(n, 1);
  $: pos = (k, r = R) => ({ px: CX + r * Math.cos(angle(k)), py: CY + r * Math.sin(angle(k)) });

  // Baby step arc from position k to k + 1 along the ring, clockwise.
  $: arc = (k) => {
    const gap = (nodeR + 3) / R;
    const a0 = angle(k) + gap, a1 = angle(k + 1) - gap;
    if (a1 <= a0) return '';
    return `M ${(CX + R * Math.cos(a0)).toFixed(2)} ${(CY + R * Math.sin(a0)).toFixed(2)} A ${R} ${R} 0 0 1 ${(CX + R * Math.cos(a1)).toFixed(2)} ${(CY + R * Math.sin(a1)).toFixed(2)}`;
  };
  // Giant stride: an inner arc from the position of giant step i - 1 to that
  // of giant step i, counter-clockwise (dividing by g^N walks backwards N places).
  $: stride = (i) => {
    const a = posOf.get(trace.giant[i - 1]?.r), b = posOf.get(trace.giant[i]?.r);
    if (a === undefined || b === undefined || N >= n) return '';
    const span = (2 * Math.PI * N) / n;                 // angle travelled, backwards
    const gap = Math.min(0.06, span / 4);
    const a0 = angle(a) - gap, a1 = angle(a) - span + gap;
    const large = span - 2 * gap > Math.PI ? 1 : 0;
    return `M ${(CX + R_STRIDE * Math.cos(a0)).toFixed(2)} ${(CY + R_STRIDE * Math.sin(a0)).toFixed(2)} A ${R_STRIDE} ${R_STRIDE} 0 ${large} 0 ${(CX + R_STRIDE * Math.cos(a1)).toFixed(2)} ${(CY + R_STRIDE * Math.sin(a1)).toFixed(2)}`;
  };
  const ringArrows = [0, 0.25, 0.5, 0.75].map((f) => {
    const a = -Math.PI / 2 + 2 * Math.PI * f, b = a + 0.02;
    return `M ${(CX + R * Math.cos(a)).toFixed(2)} ${(CY + R * Math.sin(a)).toFixed(2)} A ${R} ${R} 0 0 1 ${(CX + R * Math.cos(b)).toFixed(2)} ${(CY + R * Math.sin(b)).toFixed(2)}`;
  });
</script>

<DemoShell title="Baby-Step Giant-Step Clock" {open}>
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
      <label>
        <span class="name">target h</span>
        <span class="stepper">
          <button type="button" on:click={() => stepH(-1)} title="previous residue" aria-label="previous residue" disabled={!!pError}>◂</button>
          <input type="text" inputmode="numeric" value={hText} on:input={(e) => setH(e.target.value)} spellcheck="false" aria-label="target h" />
          <button type="button" on:click={() => stepH(1)} title="next residue" aria-label="next residue" disabled={!!pError}>▸</button>
        </span>
        {#if hError}<span class="err">{hError}</span>{/if}
      </label>
    </div>

    {#if ready}
      <p class="problem">
        Solve <b>{g}<sup>x</sup> ≡ {h} (mod {p})</b>. &nbsp; N = ⌈√{p - 1}⌉ = <b>{N}</b>;
        the baby steps are {g}<sup>j</sup> for j = 0, …, {N - 1}, and the giant steps are {h}·{g}<sup>−{N}k</sup> = {h}·{trace.gInvN}<sup>k</sup> for k = 0, 1, 2, ….
      </p>
      {#if !primitive}
        <p class="note warn">
          {g} is <em>not</em> a primitive root modulo {p}: its powers form a cycle of only {n} of the {p - 1} units,
          {#if reachable}and {h} is on it, so the algorithm still succeeds.{:else}and {h} is not on it, so no giant step can ever land on the clock: the algorithm runs its {N} giant steps and finds nothing.{/if}
        </p>
      {/if}

      <div class="run">
        <button type="button" class="btn" on:click={step} disabled={t >= total}>Step ▸</button>
        <button type="button" class="btn" on:click={toggle}>{playing ? 'Pause' : t >= total ? 'Replay' : 'Play'}</button>
        <button type="button" class="btn" on:click={reset} disabled={t === 0}>Reset</button>
        <span class="progress">
          {#if t === 0}ready{:else if babyShown < trace.baby.length}baby step {babyShown} of {N}{:else if !done}baby steps done · giant step {giantShown}{:else if found}collision after {N} baby steps and {trace.giant.length} giant steps{:else}no collision after {N} giant steps{/if}
        </span>
      </div>

      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Baby steps and giant steps of the algorithm on the clock of powers of {g} modulo {p}">
        <defs>
          <marker id="bgc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" class="arrowhead" />
          </marker>
          <marker id="bgc-arrow-giant" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" class="arrowhead giant" />
          </marker>
        </defs>

        {#if level !== 'full'}
          <circle class="ring" cx={CX} cy={CY} r={R} />
          {#each ringArrows as d}<path class="ring-arrow" {d} marker-end="url(#bgc-arrow)" />{/each}
        {:else}
          {#each cycle as _, k}
            {@const d = arc(k)}
            {#if d}<path class="edge" class:baby={k + 1 < babyShown && k + 1 < n} {d} marker-end="url(#bgc-arrow)" />{/if}
          {/each}
        {/if}

        <!-- giant strides, drawn inside the ring -->
        {#each trace.giant.slice(0, giantShown) as _, i}
          {#if i > 0}
            {@const d = stride(i)}
            {#if d}<path class="stride" {d} marker-end="url(#bgc-arrow-giant)" />{/if}
          {/if}
        {/each}

        <!-- the collision, pulsing -->
        {#if found}
          {@const q = pos(posOf.get(trace.baby[trace.collision.j].r))}
          <circle class="pulse" cx={q.px} cy={q.py} r={nodeR + 9} />
        {/if}

        <!-- residues on the ring -->
        {#each cycle as r, k}
          {@const q = pos(k)}
          {@const m = mark.get(k)}
          <g class="node" class:dot={level !== 'full'} class:baby={m === 'baby'} class:giant={m === 'giant'} class:both={m === 'both'} class:latest={k === lastPos}>
            <circle class="disc" cx={q.px} cy={q.py} r={m && level !== 'full' ? 4.5 : nodeR} />
            {#if fontPx}
              {@const tt = pos(k, labelR(k))}
              <text class="residue" class:beside={level === 'compact'} x={tt.px} y={tt.py + fontPx * 0.36} font-size={fontPx}>{r}</text>
            {/if}
          </g>
        {/each}

        <!-- exponents outside the ring -->
        {#if level === 'full'}
          {#each cycle as _, k}
            {@const q = pos(k, R_OUT)}
            {@const m = mark.get(k)}
            <text class="exponent" class:baby={m === 'baby'} class:giant={m === 'giant'} class:both={m === 'both'} x={q.px} y={q.py + 4}>{k}</text>
          {/each}
        {/if}

        <!-- readout in the hub -->
        {#if t === 0}
          <text class="readout" x={CX} y={CY - 8}>press Step or Play</text>
          <text class="readout small" x={CX} y={CY + 14}>baby steps first, then giant steps</text>
        {:else if found}
          <text class="readout" x={CX} y={CY - 30}>collision: g<tspan class="sup" dy="-7" font-size="11">{trace.collision.j}</tspan><tspan dy="7">&#160;= h·g</tspan><tspan dy="-7" font-size="11">−{N}·{trace.collision.k}</tspan><tspan dy="7">&#160;≡ {trace.giant.at(-1).r}</tspan></text>
          <text class="readout big" x={CX} y={CY + 6}>x = {trace.collision.j} + {trace.collision.k}·{N} = {trace.collision.x}</text>
          <text class="readout" x={CX} y={CY + 32}>{g}<tspan dy="-7" font-size="11">{trace.collision.x}</tspan><tspan dy="7">&#160;≡ {h} (mod {p})</tspan></text>
        {:else if done}
          <text class="readout" x={CX} y={CY - 8}>no collision</text>
          <text class="readout small" x={CX} y={CY + 14}>{h} is not a power of {g} mod {p}</text>
        {:else if last.kind === 'baby'}
          <text class="readout baby" x={CX} y={CY - 8}>baby step j = {last.j}</text>
          <text class="readout big baby" x={CX} y={CY + 22}>{g}<tspan dy="-9" font-size="14">{last.j}</tspan><tspan dy="9">&#160;≡ {last.r}</tspan></text>
        {:else}
          <text class="readout giant" x={CX} y={CY - 8}>giant step k = {last.k}</text>
          <text class="readout big giant" x={CX} y={CY + 22}>{h}·{g}<tspan dy="-9" font-size="14">−{N}·{last.k}</tspan><tspan dy="9">&#160;≡ {last.r}</tspan></text>
        {/if}
      </svg>

      <div class="lists">
        <p class="list baby-list"><span class="lbl">Baby steps {g}<sup>j</sup>:</span>
          {#each trace.baby.slice(0, babyShown) as b}
            <span class="chip baby" class:hit={found && b.j === trace.collision.j}><span class="idx">j={b.j}</span>{b.r}</span>
          {/each}
          {#if babyShown === 0}<span class="none">—</span>{/if}
        </p>
        <p class="list giant-list"><span class="lbl">Giant steps {h}·{g}<sup>−{N}k</sup>:</span>
          {#each trace.giant.slice(0, giantShown) as s}
            <span class="chip giant" class:hit={found && s.k === trace.collision.k}><span class="idx">k={s.k}</span>{s.r}</span>
          {/each}
          {#if giantShown === 0}<span class="none">—</span>{/if}
        </p>
        {#if found}
          <p class="list result">The value <b>{trace.giant.at(-1).r}</b> is in both lists: {g}<sup>{trace.collision.j}</sup> ≡ {h}·{g}<sup>−{N}·{trace.collision.k}</sup>, so
            {g}<sup>{trace.collision.j} + {trace.collision.k}·{N}</sup> ≡ {h}, and <b>x = {trace.collision.x}</b>. That took {N} + {trace.giant.length} = {N + trace.giant.length} multiplications instead of up to {p - 1}.</p>
        {/if}
      </div>
    {:else}
      <p class="note warn">Choose a prime p, a base g and a target h to run the algorithm.</p>
    {/if}

    <p class="demo-note">Position x on the clock holds g<sup>x</sup> mod p (the grey exponent outside the ring), so the
      baby steps carpet the first N positions after the top. Each giant step divides by g<sup>N</sup>, which moves
      N positions <em>backwards</em> around the clock — a giant stride — starting from h. Since the strides are exactly
      as long as the carpet, one of them must land on it: that is the collision, and it reveals x. The clock is drawn
      with the exponents already known; the algorithm itself only ever sees the residues in the two lists.</p>
  </div>
</DemoShell>

<style>
  .clock { flex: 1 1 100%; display: flex; flex-direction: column; gap: 0.7rem; min-width: 0;
           font-family: var(--font-serif, Georgia, serif); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; align-items: flex-start; }
  .controls label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem;
                    color: var(--color-ink-soft, #55493a); flex: 1 1 9rem; min-width: 0; }
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

  .problem { margin: 0; font-size: 0.9rem; color: var(--color-ink, #2b2117); line-height: 1.5; }
  .note { margin: 0; font-size: 0.9rem; padding: 0.45rem 0.8rem; border-radius: 6px;
          border-left: 3px solid var(--accent-green, #5b6f3a); background: var(--wash-green, #e6ecda);
          color: var(--color-ink, #2b2117); }
  .note.warn { border-left-color: var(--accent-gold, #a97917); background: var(--wash-gold, #f3e6c8); }

  .run { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.6rem; font-size: 0.88rem;
         color: var(--color-ink-soft, #55493a); }
  .btn { font: inherit; font-size: 0.88rem; padding: 0.3rem 0.8rem; border-radius: 6px; cursor: pointer;
         border: 1px solid var(--color-rule, #d9c9a3); background: var(--color-bg-raised, #ede2c8);
         color: var(--color-ink, #2b2117); }
  .btn:hover:not(:disabled) { border-color: var(--accent-teal, #2b6b66); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .progress { margin-left: 0.3rem; font-style: italic; }

  svg { width: 100%; max-width: 30rem; height: auto; display: block; margin: 0 auto; border-radius: 8px;
        background: var(--color-bg, #f4ecd8); border: 1px solid var(--color-rule, #d9c9a3);
        touch-action: manipulation; user-select: none; }
  .arrowhead { fill: var(--color-ink-soft, #55493a); }
  .arrowhead.giant { fill: var(--accent-red, #a23c3c); }
  .edge, .ring-arrow { fill: none; stroke: var(--color-ink-soft, #55493a); stroke-width: 1.6; opacity: 0.55; }
  .edge.baby { stroke: var(--accent-teal, #2b6b66); stroke-width: 2.4; opacity: 1; }
  .ring { fill: none; stroke: var(--color-rule, #d9c9a3); stroke-width: 1.4; }
  .stride { fill: none; stroke: var(--accent-red, #a23c3c); stroke-width: 2; opacity: 0.8; }

  .node .disc { fill: var(--color-bg-raised, #ede2c8); stroke: var(--color-ink, #2b2117); stroke-width: 1.2;
                transition: fill 0.2s, stroke 0.2s; }
  .node.dot .disc { fill: var(--color-ink, #2b2117); stroke: none; }
  .node.baby .disc { fill: var(--accent-teal, #2b6b66); stroke: var(--accent-teal, #2b6b66); }
  .node.giant .disc { fill: var(--accent-red, #a23c3c); stroke: var(--accent-red, #a23c3c); }
  .node.both .disc { fill: var(--accent-gold, #a97917); stroke: var(--accent-gold, #a97917); }
  .node.latest .disc { stroke: var(--color-ink, #2b2117); stroke-width: 2.4; }
  .pulse { fill: none; stroke: var(--accent-gold, #a97917); stroke-width: 2.5; animation: bgc-pulse 1.4s ease-out infinite; }
  @keyframes bgc-pulse { 0% { opacity: 0.9; transform: scale(0.8); } 100% { opacity: 0; transform: scale(1.35); } }
  .pulse { transform-box: fill-box; transform-origin: center; }

  .residue { text-anchor: middle; fill: var(--color-ink, #2b2117); font-family: var(--font-serif, Georgia, serif);
             font-weight: 600; pointer-events: none; }
  .node.baby .residue, .node.giant .residue, .node.both .residue { fill: var(--color-bg, #f4ecd8); }
  .residue.beside { fill: var(--color-ink, #2b2117); font-weight: 400; }
  .node.baby .residue.beside { fill: var(--accent-teal, #2b6b66); font-weight: 700; }
  .node.giant .residue.beside { fill: var(--accent-red, #a23c3c); font-weight: 700; }
  .node.both .residue.beside { fill: var(--accent-gold, #a97917); font-weight: 700; }
  .exponent { font-size: 11px; text-anchor: middle; fill: var(--accent-grey, #55524c); opacity: 0.85;
              font-family: var(--font-serif, Georgia, serif); }
  .exponent.baby { fill: var(--accent-teal, #2b6b66); opacity: 1; font-weight: 700; }
  .exponent.giant { fill: var(--accent-red, #a23c3c); opacity: 1; font-weight: 700; }
  .exponent.both { fill: var(--accent-gold, #a97917); opacity: 1; font-weight: 700; font-size: 13px; }

  .readout { font-size: 14px; text-anchor: middle; fill: var(--color-ink-soft, #55493a);
             font-family: var(--font-serif, Georgia, serif); pointer-events: none; }
  .readout.small { font-size: 12px; opacity: 0.8; }
  .readout.big { font-size: 22px; fill: var(--color-ink, #2b2117); font-weight: 600; }
  .readout.baby { fill: var(--accent-teal, #2b6b66); }
  .readout.giant { fill: var(--accent-red, #a23c3c); }

  .lists { display: flex; flex-direction: column; gap: 0.4rem; }
  .list { margin: 0; font-size: 0.88rem; color: var(--color-ink, #2b2117); line-height: 1.9;
          padding: 0.35rem 0.8rem; border-radius: 6px; background: var(--wash-grey, #e7e5e0);
          border: 1px solid var(--color-rule, #d9c9a3); word-break: break-word; }
  .baby-list { background: var(--wash-teal, #dcece9); }
  .giant-list { background: var(--wash-red, #f3dede); }
  .result { background: var(--wash-gold, #f3e6c8); line-height: 1.5; }
  .lbl { font-variant-caps: small-caps; letter-spacing: 0.03em; color: var(--color-ink-soft, #55493a); margin-right: 0.3rem; }
  .chip { display: inline-block; margin: 0 0.25rem 0.1rem 0; padding: 0 0.45rem; border-radius: 4px; line-height: 1.55;
          color: var(--color-bg, #f4ecd8); font-weight: 600; }
  .chip.baby { background: var(--accent-teal, #2b6b66); }
  .chip.giant { background: var(--accent-red, #a23c3c); }
  .chip.hit { background: var(--accent-gold, #a97917); box-shadow: 0 0 0 2px var(--accent-gold, #a97917); }
  .idx { font-size: 0.72em; font-weight: 400; opacity: 0.85; margin-right: 0.3em; }
  .none { color: var(--color-ink-soft, #55493a); }
  .demo-note { margin: 0; font-size: 0.85rem; color: var(--color-ink-soft, #55493a); line-height: 1.5; }
  sup { font-size: 0.75em; }
</style>
