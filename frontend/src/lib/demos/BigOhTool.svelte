<script>
  // "Big-Oh Explorer" — type f and g, pick a direction (f = O(g) or g = O(f)),
  // then drag the two constants of the definition onto the graph: M (the
  // vertical line, "from here on") and C (the grip on the curve C·g, which
  // shades the tube |y| <= C g(x) for x > M).  When the bounded function lies
  // inside the tube the statement lights up.  "Verify" checks the current
  // guess numerically and, if it fails, searches for constants that work (or
  // explains why none can).  Math lives in bigoh.js.
  import DemoShell from './DemoShell.svelte';
  import { parseExpression, checkBound, findConstants, fmt, niceCeil } from './bigoh.js';

  export let open = false;

  const PRESETS = [
    { label: 'f = 100x²,  g = x³  (the figure)', f: '100x^2', g: 'x^3', xmax: 150 },
    { label: 'f = x² + 3,  g = x²', f: 'x^2 + 3', g: 'x^2', xmax: 10 },
    { label: 'f = 300x²,  g = x²', f: '300x^2', g: 'x^2', xmax: 10 },
    { label: 'f = x²,  g = x³', f: 'x^2', g: 'x^3', xmax: 5 },
    { label: 'f = 500 log x,  g = x', f: '500 log(x)', g: 'x', xmax: 50 },
    { label: 'f = |sin x|,  g = |cos x|', f: '|sin(x)|', g: '|cos(x)|', xmax: 20 },
    { label: 'f = |sin x|,  g = 1/2', f: '|sin(x)|', g: '1/2', xmax: 20 },
    { label: 'f = 2ˣ,  g = 3ˣ', f: '2^x', g: '3^x', xmax: 10 }
  ];

  let presetIdx = 0;
  let fText = PRESETS[0].f;
  let gText = PRESETS[0].g;
  let xmaxText = String(PRESETS[0].xmax);
  let ymaxText = '';          // '' = automatic
  let dir = 'fg';             // 'fg': f = O(g)   'gf': g = O(f)
  let C = 1;
  let M = 20;
  let verdict = null;         // { tone: 'ok' | 'bad' | 'note', text }

  function applyPreset(i) {
    const p = PRESETS[i];
    fText = p.f; gText = p.g; xmaxText = String(p.xmax); ymaxText = '';
    C = 1; M = Number((p.xmax * 0.15).toPrecision(2));
    verdict = null;
  }
  function onPresetChange(e) {
    presetIdx = Number(e.target.value);
    if (presetIdx >= 0) applyPreset(presetIdx);
  }

  const round3 = (v) => Number(v.toPrecision(3));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- parsing & window -------------------------------------------------
  $: fParsed = parseExpression(fText);
  $: gParsed = parseExpression(gText);
  $: xmaxParsed = parseFloat(xmaxText);
  $: xmax = xmaxParsed > 0 && Number.isFinite(xmaxParsed) ? xmaxParsed : 50;
  $: if (M > xmax) M = round3(xmax * 0.5);
  $: ready = !!(fParsed.fn && gParsed.fn);
  $: small = dir === 'fg' ? fParsed.fn : gParsed.fn;     // the bounded function
  $: big = dir === 'fg' ? gParsed.fn : fParsed.fn;       // the bounding function
  $: smallName = dir === 'fg' ? 'f' : 'g';
  $: bigName = dir === 'fg' ? 'g' : 'f';

  // ---- curve samples for drawing ---------------------------------------
  const N = 600;
  const safe = (fn, x) => { try { const v = fn(x); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } };
  $: xs = Array.from({ length: N + 1 }, (_, i) => (i / N) * xmax);
  $: fy = ready ? xs.map((x) => safe(fParsed.fn, x)) : [];
  $: gy = ready ? xs.map((x) => safe(gParsed.fn, x)) : [];
  $: bigY = dir === 'fg' ? gy : fy;

  // Auto y-range: the largest |value| either curve reaches in the window (the
  // tube may run off the top -- that is fine, the C grip follows it).
  $: yRange = (() => {
    const vals = fy.concat(gy).filter((v) => Number.isFinite(v));
    let top = parseFloat(ymaxText);
    if (!(top > 0)) top = vals.length ? Math.max(...vals.map(Math.abs)) : 1;
    if (!(top > 0)) top = 1;
    const neg = vals.some((v) => v < 0);
    const bottom = neg ? -top : 0;
    return { ymin: bottom, ymax: top * 1.06 };
  })();
  $: ({ ymin, ymax } = yRange);

  // ---- the check ----------------------------------------------------------
  $: check = ready ? checkBound(small, big, C, M, xmax) : null;
  $: ok = !!(check && check.ok);
  $: reason = check ? describe(check) : '';

  function describe(res) {
    const s = smallName, b = bigName;
    switch (res.kind) {
      case 'ok':
        return `|${s}(x)| ≤ C·${b}(x) at every point checked with x > M (out to x = ${fmt(res.xChecked)}).`;
      case 'violation': {
        const where = res.x > xmax ? ` (beyond the window, at x = ${fmt(res.x)})` : ` at x = ${fmt(res.x)}`;
        return `Not yet${where}: |${s}(x)| = ${fmt(Math.abs(res.fx))} but C·${b}(x) = ${fmt(res.cgx)}.`;
      }
      case 'nonpositive':
        return `${b}(x) = ${fmt(res.gx)} at x = ${fmt(res.x)}: the bounding function must be positive for x > M.`;
      case 'growing': {
        const gr = res.growth;
        return `The ratio |${s}|/${b} is still climbing far out (about ${fmt(gr.prev)} on [${fmt(gr.prevRange[0])}, ${fmt(gr.prevRange[1])}], then ${fmt(gr.last)} on [${fmt(gr.lastRange[0])}, ${fmt(gr.lastRange[1])}]). No constant C survives that.`;
      }
      case 'invalid':
        return res.reason || `${s} or ${b} is not a finite number at x = ${fmt(res.x)}.`;
      default:
        return '';
    }
  }

  // ---- Verify: report on the guess; if it fails, look for constants -------
  function verify() {
    if (!ready) return;
    const s = smallName, b = bigName;
    if (check.ok) {
      verdict = {
        tone: 'ok',
        text: `Your C = ${fmt(C)}, M = ${fmt(M)} work: |${s}(x)| ≤ C·${b}(x) held at all ${check.count.toLocaleString()} points tested with M < x ≤ ${fmt(check.xChecked)}, and |${s}|/${b} is not growing at the far end. That is strong numerical evidence — a computer can only test finitely many x, so the proof is still yours to write.`
      };
      return;
    }
    const guess = `Your C = ${fmt(C)}, M = ${fmt(M)} don't work. ${reason}`;
    const found = findConstants(small, big, xmax);
    if (found.found) {
      C = round3(found.C);
      M = round3(found.M);
      if (M > xmax) xmaxText = String(niceCeil(M * 1.5, 1));
      const peak = found.peak && found.peak.ratio > 0
        ? ` (beyond M the ratio |${s}|/${b} is largest, about ${fmt(found.peak.ratio)}, near x = ${fmt(found.peak.x)})`
        : '';
      verdict = {
        tone: 'ok',
        text: `${guess} But C = ${fmt(C)}, M = ${fmt(M)} do${peak} — the handles have been moved there. So numerically ${s} = O(${b}).`
      };
    } else {
      let why;
      switch (found.kind) {
        case 'growing': {
          const gr = found.growth;
          why = `the ratio |${s}(x)|/${b}(x) keeps growing (about ${fmt(gr.prev)} on [${fmt(gr.prevRange[0])}, ${fmt(gr.prevRange[1])}], then ${fmt(gr.last)} on [${fmt(gr.lastRange[0])}, ${fmt(gr.lastRange[1])}]), so no C works once x is large enough`;
          break;
        }
        case 'nonpositive':
          why = `${b}(x) keeps returning to zero or below (e.g. ${b}(${fmt(found.x)}) = ${fmt(found.gx)}), so it cannot bound anything however large C is`;
          break;
        case 'unbounded':
          why = `even C = 10⁹ fails for every M tried — |${s}|/${b} has no ceiling (typically because ${b} keeps coming arbitrarily close to zero)`;
          break;
        default:
          why = `${s} or ${b} is not a finite number somewhere in the window (x = ${fmt(found.x)})`;
      }
      verdict = { tone: 'bad', text: `${guess} And I cannot find any C and M that do: ${why}. So it appears that ${s} ≠ O(${b}).` };
    }
  }

  // ---- geometry -----------------------------------------------------------
  const W = 640, H = 380, PAD = { l: 64, r: 20, t: 18, b: 40 };
  $: plotW = W - PAD.l - PAD.r;
  $: plotH = H - PAD.t - PAD.b;
  $: sx = (x) => PAD.l + (x / xmax) * plotW;
  $: sy = (y) => PAD.t + (1 - (y - ymin) / (ymax - ymin)) * plotH;
  $: invX = (px) => ((px - PAD.l) / plotW) * xmax;
  $: invY = (py) => ymin + (1 - (py - PAD.t) / plotH) * (ymax - ymin);
  const clampY = (y, lo, hi) => clamp(y, lo - 3 * (hi - lo), hi + 3 * (hi - lo));

  function pathOf(ys) {
    let d = '', pen = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (!Number.isFinite(y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(clampY(y, ymin, ymax)).toFixed(1)} `;
      pen = true;
    }
    return d;
  }
  $: fPath = pathOf(fy);
  $: gPath = pathOf(gy);
  $: tubeTop = bigY.map((v) => (Number.isFinite(v) ? C * v : NaN));
  $: tubePath = (() => {
    if (!ready) return '';
    const top = [], bot = [];
    const gM = safe(big, M);
    if (Number.isFinite(gM)) { top.push([M, C * gM]); bot.push([M, -C * gM]); }
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] <= M || !Number.isFinite(tubeTop[i])) continue;
      top.push([xs[i], tubeTop[i]]);
      bot.push([xs[i], -tubeTop[i]]);
    }
    if (top.length < 2) return '';
    const pt = ([x, y]) => `${sx(x).toFixed(1)} ${sy(clampY(y, ymin, ymax)).toFixed(1)}`;
    return `M${top.map(pt).join(' L')} L${bot.reverse().map(pt).join(' L')} Z`;
  })();
  $: tubeEdge = (() => {
    if (!ready) return '';
    let d = '', pen = false;
    const gM = safe(big, M);
    if (Number.isFinite(gM)) { d += `M${sx(M).toFixed(1)} ${sy(clampY(C * gM, ymin, ymax)).toFixed(1)} `; pen = true; }
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] <= M) continue;
      const y = tubeTop[i];
      if (!Number.isFinite(y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(clampY(y, ymin, ymax)).toFixed(1)} `;
      pen = true;
    }
    return d;
  })();

  // The C grip rides the curve C·big(x): at the last x (before the right
  // margin) where that curve is still inside the plot, or pinned to the top
  // edge just right of M when the whole tube runs off the top.
  $: grip = (() => {
    if (!ready) return null;
    const right = xmax * 0.965;
    let first = null;
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i], y = tubeTop[i];
      if (x > right || x <= M || !Number.isFinite(y) || bigY[i] <= 0) continue;
      first = i;
      if (y <= ymax) return { x, y, px: sx(x), py: sy(y), pinned: false };
    }
    if (first === null) return null;
    // everything above the top: pin at the first usable x after M
    let j = first;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] > M && Number.isFinite(tubeTop[i]) && bigY[i] > 0) { j = i; break; }
    }
    return { x: xs[j], y: ymax, px: sx(xs[j]) + 10, py: PAD.t + 2, pinned: true };
  })();

  // ---- dragging -----------------------------------------------------------
  let svgEl;
  let drag = null;          // { what: 'C' | 'M', xh, gxh }
  function svgPoint(e) {
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }
  function startDrag(what, e) {
    if (!ready) return;
    e.preventDefault();
    if (what === 'C') {
      if (!grip) return;
      const gxh = safe(big, grip.x);
      if (!(gxh > 0)) return;
      drag = { what, xh: grip.x, gxh };
    } else drag = { what };
    verdict = null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function moveDrag(e) {
    if (!drag) return;
    const p = svgPoint(e);
    if (drag.what === 'M') {
      M = round3(clamp(invX(p.x), xmax / 1000, xmax));
    } else {
      const y = invY(p.y);
      C = round3(clamp(y / drag.gxh, 1e-4, 1e9));
    }
  }
  function endDrag() { drag = null; }

  // Sliders (keyboard-friendly twins of the handles).
  $: logC = Math.log10(C);
  function setLogC(v) { C = round3(Math.pow(10, Number(v))); verdict = null; }
  function setC(v) { const n = parseFloat(v); if (n > 0) { C = clamp(n, 1e-4, 1e9); verdict = null; } }
  function setM(v) { const n = parseFloat(v); if (n >= 0 && Number.isFinite(n)) { M = clamp(n, 0, xmax); verdict = null; } }
  function setDir(d) { dir = d; verdict = null; }

  // ---- axes ---------------------------------------------------------------
  function ticks(lo, hi, n = 5) {
    const span = hi - lo;
    if (!(span > 0)) return [];
    const raw = span / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) out.push(Number(v.toPrecision(6)));
    return out;
  }
  $: xTicks = ticks(0, xmax, 6);
  $: yTicks = ticks(ymin, ymax, 5);

  // Curve labels: at the last in-range point of each curve.
  function labelPos(ys) {
    for (let i = ys.length - 1; i >= 0; i--) {
      const y = ys[i];
      if (Number.isFinite(y) && y >= ymin && y <= ymax) return { px: sx(xs[i]), py: sy(y) };
    }
    return null;
  }
  $: fLabel = labelPos(fy);
  $: gLabel = labelPos(gy);

  $: marker = (() => {
    if (!check || check.x === undefined || check.x > xmax) return null;
    if (check.kind === 'violation') return { px: sx(check.x), py: sy(clampY(check.fx, ymin, ymax)) };
    if (check.kind === 'nonpositive') return { px: sx(check.x), py: sy(clampY(check.gx, ymin, ymax)) };
    return null;
  })();
</script>

<DemoShell title="Big-Oh Explorer" {open}>
  <div class="bigoh">
    <div class="controls">
      <label class="preset">
        Example
        <select value={presetIdx} on:change={onPresetChange}>
          {#each PRESETS as p, i}<option value={i}>{p.label}</option>{/each}
          <option value={-1}>custom</option>
        </select>
      </label>
      <label>
        f(x) =
        <input type="text" bind:value={fText} spellcheck="false" on:input={() => { presetIdx = -1; verdict = null; }} />
        {#if fParsed.error}<span class="err">{fParsed.error}</span>{/if}
      </label>
      <label>
        g(x) =
        <input type="text" bind:value={gText} spellcheck="false" on:input={() => { presetIdx = -1; verdict = null; }} />
        {#if gParsed.error}<span class="err">{gParsed.error}</span>{/if}
      </label>
      <label class="short">
        x up to
        <input type="text" bind:value={xmaxText} on:input={() => (verdict = null)} />
      </label>
      <label class="short">
        y up to
        <input type="text" bind:value={ymaxText} placeholder="auto" />
      </label>
    </div>

    <div class="claim-row">
      <span class="claim-label">Claim to test</span>
      <div class="seg" role="radiogroup" aria-label="Direction">
        <button type="button" class:on={dir === 'fg'} role="radio" aria-checked={dir === 'fg'} on:click={() => setDir('fg')}>f = O(g)</button>
        <button type="button" class:on={dir === 'gf'} role="radio" aria-checked={dir === 'gf'} on:click={() => setDir('gf')}>g = O(f)</button>
      </div>
      <span class="defn">Need C, M &gt; 0 with |{smallName}(x)| ≤ C·{bigName}(x) for all x &gt; M.</span>
    </div>

    <svg bind:this={svgEl} viewBox="0 0 {W} {H}" role="img"
         aria-label="Graph of f and g with draggable constants M and C"
         class:dragging={!!drag} class:ok
         on:pointermove={moveDrag} on:pointerup={endDrag} on:pointercancel={endDrag} on:lostpointercapture={endDrag}>
      <defs>
        <clipPath id="bigoh-clip">
          <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      <!-- axes & grid -->
      {#each yTicks as t}
        <line class="grid" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
        <text class="tick y" x={PAD.l - 6} y={sy(t) + 3}>{fmt(t)}</text>
      {/each}
      {#each xTicks as t}
        <line class="grid" y1={PAD.t} y2={H - PAD.b} x1={sx(t)} x2={sx(t)} />
        <text class="tick x" x={sx(t)} y={H - PAD.b + 14}>{fmt(t)}</text>
      {/each}
      <line class="axis" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />
      <line class="axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} />
      <text class="axis-name" x={W - PAD.r} y={H - 6}>x</text>

      {#if ready}
        <g clip-path="url(#bigoh-clip)">
          <!-- the part of the axis that matters: x > M -->
          <rect class="beyond" class:ok x={sx(M)} y={PAD.t} width={Math.max(0, sx(xmax) - sx(M))} height={plotH} />
          <!-- the tube |y| <= C·big(x), x > M -->
          <path class="tube" class:ok d={tubePath} />
          <path class="tube-edge" class:ok d={tubeEdge} />
          <!-- the two curves -->
          <path class="curve f" d={fPath} />
          <path class="curve g" d={gPath} />
          {#if marker}
            <line class="marker-line" x1={marker.px} x2={marker.px} y1={PAD.t} y2={H - PAD.b} />
            <circle class="marker" cx={marker.px} cy={marker.py} r="6" />
          {/if}
        </g>
        {#if fLabel}<text class="curve-label f" x={fLabel.px - 4} y={fLabel.py - 6}>f</text>{/if}
        {#if gLabel}<text class="curve-label g" x={gLabel.px - 4} y={gLabel.py - 6}>g</text>{/if}

        <!-- M handle: a vertical line with a grip on the axis -->
        <g class="handle m" on:pointerdown={(e) => startDrag('M', e)}>
          <line class="m-line" class:ok x1={sx(M)} x2={sx(M)} y1={PAD.t} y2={H - PAD.b} />
          <rect class="hit" x={sx(M) - 9} y={PAD.t} width="18" height={plotH + 14} />
          <circle class="grip" cx={sx(M)} cy={H - PAD.b} r="7" />
          <text class="handle-label" x={sx(M)} y={H - PAD.b + 30}>M = {fmt(M)}</text>
        </g>

        <!-- C handle: rides the curve C·big(x) -->
        {#if grip}
          <g class="handle c" class:pinned={grip.pinned} on:pointerdown={(e) => startDrag('C', e)}>
            <circle class="hit" cx={grip.px} cy={grip.py} r="14" />
            <circle class="grip" cx={grip.px} cy={grip.py} r="7" />
            <text class="handle-label c" x={grip.px} y={grip.py + (grip.py < PAD.t + 24 ? 24 : -12)}>
              C·{bigName}, C = {fmt(C)}{grip.pinned ? ' ↑' : ''}
            </text>
          </g>
        {/if}
      {/if}
    </svg>

    <div class="sliders">
      <label>
        <span>M = <input type="text" class="num" value={fmt(M)} on:change={(e) => setM(e.target.value)} /></span>
        <input type="range" min="0" max={xmax} step={xmax / 1000} value={M} on:input={(e) => setM(e.target.value)} aria-label="M" />
      </label>
      <label>
        <span>C = <input type="text" class="num" value={fmt(C)} on:change={(e) => setC(e.target.value)} /></span>
        <input type="range" min="-3" max="9" step="0.01" value={logC} on:input={(e) => setLogC(e.target.value)} aria-label="C (logarithmic)" />
      </label>
    </div>

    <div class="status" class:ok aria-live="polite">
      <div class="lamp" class:ok>
        <span class="statement">{smallName} = O({bigName})</span>
        {#if ok}<span class="tick-mark">✓</span>{:else}<span class="q">?</span>{/if}
      </div>
      <div class="status-text">
        {#if !ready}
          Enter two functions of x to begin.
        {:else if ok}
          With C = {fmt(C)} and M = {fmt(M)}: {reason}
        {:else}
          {reason}
        {/if}
      </div>
      <button type="button" class="verify" on:click={verify} disabled={!ready}
              title="Check the current C and M numerically; if they fail, look for values that work">
        Verify
      </button>
    </div>

    {#if verdict}
      <p class="verdict" class:bad={verdict.tone === 'bad'} class:good={verdict.tone === 'ok'}>{verdict.text}</p>
    {/if}

    <p class="demo-note">Drag the vertical line to choose M (the statement only cares about x &gt; M) and the grip
      on the dashed curve to choose C (it scales the shaded tube |y| ≤ C·{bigName}(x)). The light comes on when
      {smallName} stays inside the tube. Checks are numerical, out to x = 10³⁰ where the arithmetic allows —
      evidence, not proof. Syntax: <code>100x^2</code>, <code>500 log(x)</code>, <code>|sin(x)|</code>, <code>2^x</code>, <code>sqrt(x)</code>.</p>
  </div>
</DemoShell>

<style>
  .bigoh { flex: 1 1 100%; display: flex; flex-direction: column; gap: 0.7rem; min-width: 0;
           font-family: var(--font-serif, Georgia, serif); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: flex-start; }
  .controls label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem;
                    color: var(--color-ink-soft, #55493a); flex: 1 1 10rem; min-width: 0; }
  .controls label.preset { flex: 1 1 100%; }
  .controls label.short { flex: 0 1 6rem; }
  .controls input, .controls select {
    font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: 1rem; line-height: 1.4;
    padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--color-rule, #d9c9a3);
    background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117); min-width: 0; width: 100%;
    box-sizing: border-box;
  }
  .err { font-size: 0.78rem; color: var(--accent-red, #a23c3c); }

  .claim-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; font-size: 0.9rem;
               color: var(--color-ink-soft, #55493a); }
  .claim-label { font-variant-caps: small-caps; letter-spacing: 0.03em; }
  .seg { display: inline-flex; border: 1px solid var(--color-rule, #d9c9a3); border-radius: 999px; overflow: hidden; }
  .seg button { font: inherit; font-size: 0.95rem; padding: 0.25rem 0.8rem; border: none; cursor: pointer;
                background: transparent; color: var(--color-ink-soft, #55493a); }
  .seg button.on { background: var(--accent-teal, #2b6b66); color: var(--color-bg, #f4ecd8); }
  .defn { font-style: italic; }

  svg { width: 100%; height: auto; display: block; border-radius: 8px;
        background: var(--color-bg, #f4ecd8); border: 1px solid var(--color-rule, #d9c9a3);
        touch-action: none; user-select: none; }
  svg.dragging { cursor: grabbing; }
  svg.ok { border-color: var(--accent-green, #5b6f3a); border-width: 2px;
           box-shadow: 0 0 0 4px var(--wash-green, #e6ecda), 0 0 18px 2px var(--accent-green, #5b6f3a);
           transition: border-color 0.3s, box-shadow 0.3s; }
  .grid { stroke: var(--color-rule, #d9c9a3); stroke-width: 0.6; stroke-dasharray: 2 4; }
  .axis { stroke: var(--color-ink-soft, #55493a); stroke-width: 1; }
  .tick { font-size: 10px; fill: var(--color-ink-soft, #55493a); }
  .tick.y { text-anchor: end; }
  .tick.x { text-anchor: middle; }
  .axis-name { font-size: 12px; font-style: italic; text-anchor: end; fill: var(--color-ink-soft, #55493a); }
  .beyond { fill: var(--color-ink, #2b2117); opacity: 0.045; transition: fill 0.3s, opacity 0.3s; }
  .beyond.ok { fill: var(--accent-green, #5b6f3a); opacity: 0.16; }
  .tube { fill: var(--accent-grey, #55524c); opacity: 0.13; transition: fill 0.3s, opacity 0.3s; }
  .tube.ok { fill: var(--accent-green, #5b6f3a); opacity: 0.6; }
  .tube-edge { fill: none; stroke: var(--accent-grey, #55524c); stroke-width: 1.4; stroke-dasharray: 6 4; opacity: 0.9;
               transition: stroke 0.3s, stroke-width 0.3s; }
  .tube-edge.ok { stroke: var(--accent-green, #5b6f3a); stroke-width: 3; stroke-dasharray: none; opacity: 1; }
  .curve { fill: none; stroke-width: 2.2; stroke-linejoin: round; }
  .curve.f { stroke: var(--accent-red, #a23c3c); }
  .curve.g { stroke: var(--accent-teal, #2b6b66); }
  .curve-label { font-size: 15px; font-style: italic; font-weight: 600; text-anchor: end; paint-order: stroke;
                 stroke: var(--color-bg, #f4ecd8); stroke-width: 3; }
  .curve-label.f { fill: var(--accent-red, #a23c3c); }
  .curve-label.g { fill: var(--accent-teal, #2b6b66); }
  .marker { fill: none; stroke: var(--accent-red, #a23c3c); stroke-width: 2; }
  .marker-line { stroke: var(--accent-red, #a23c3c); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.7; }

  .handle { cursor: grab; }
  .handle .hit { fill: transparent; }
  .handle .grip { fill: var(--color-bg-raised, #ede2c8); stroke: var(--accent-gold, #a97917); stroke-width: 2.2; }
  .handle:hover .grip { fill: var(--accent-gold, #a97917); }
  .handle.c .grip { stroke: var(--accent-grey, #55524c); }
  .handle.c:hover .grip { fill: var(--accent-grey, #55524c); }
  svg.ok .handle.c .grip { stroke: var(--accent-green, #5b6f3a); }
  svg.ok .handle-label.c { fill: var(--accent-green, #5b6f3a); }
  .m-line { stroke: var(--accent-gold, #a97917); stroke-width: 1.6; stroke-dasharray: 5 3; transition: stroke 0.3s; }
  .m-line.ok { stroke: var(--accent-green, #5b6f3a); stroke-width: 2.4; }
  .handle-label { font-size: 11px; text-anchor: middle; fill: var(--color-ink, #2b2117); paint-order: stroke;
                  stroke: var(--color-bg, #f4ecd8); stroke-width: 3; pointer-events: none; }
  .handle-label.c { fill: var(--accent-grey, #55524c); }

  .sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1.5rem; }
  .sliders label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.9rem;
                   color: var(--color-ink-soft, #55493a); min-width: 0; }
  .sliders input[type='range'] { width: 100%; accent-color: var(--accent-teal, #2b6b66); }
  .num { width: 5.5rem; font: inherit; font-size: 0.9rem; padding: 0.1rem 0.35rem; border-radius: 4px;
         border: 1px solid var(--color-rule, #d9c9a3); background: var(--color-bg, #f4ecd8);
         color: var(--color-ink, #2b2117); }

  .status { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem;
            padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--color-rule, #d9c9a3);
            background: var(--wash-grey, #e7e5e0); transition: background 0.25s, border-color 0.25s; }
  .status.ok { background: var(--wash-green, #e6ecda); border: 2px solid var(--accent-green, #5b6f3a);
               box-shadow: 0 0 14px var(--wash-green, #e6ecda); }
  .lamp { display: inline-flex; align-items: baseline; gap: 0.35rem; font-size: 1.35rem; font-style: italic;
          color: var(--color-ink-soft, #55493a); opacity: 0.55; transition: opacity 0.25s, color 0.25s; }
  .lamp.ok { opacity: 1; color: var(--accent-green, #5b6f3a); font-weight: 700; font-size: 1.6rem;
             animation: bigoh-pop 0.45s ease-out; }
  @keyframes bigoh-pop { 0% { transform: scale(0.85); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
  .tick-mark { font-style: normal; font-weight: 700; }
  .q { font-style: normal; }
  .status-text { flex: 1 1 16rem; font-size: 0.88rem; color: var(--color-ink-soft, #55493a); }
  .verify { font: inherit; font-size: 0.95rem; padding: 0.3rem 1rem; border-radius: 999px; cursor: pointer;
            border: 1px solid var(--accent-teal, #2b6b66); background: var(--accent-teal, #2b6b66);
            color: var(--color-bg, #f4ecd8); }
  .verify:disabled { opacity: 0.5; cursor: default; }
  .verdict { margin: 0; font-size: 0.9rem; padding: 0.5rem 0.8rem; border-radius: 6px;
             border-left: 3px solid var(--accent-grey, #55524c); background: var(--wash-grey, #e7e5e0);
             color: var(--color-ink, #2b2117); }
  .verdict.good { border-left-color: var(--accent-green, #5b6f3a); background: var(--wash-green, #e6ecda); }
  .verdict.bad { border-left-color: var(--accent-red, #a23c3c); background: var(--wash-red, #f3dede); }
  code { font-size: 0.85em; }

  @media (max-width: 520px) {
    .sliders { grid-template-columns: 1fr; }
  }
</style>
