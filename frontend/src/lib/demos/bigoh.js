// The pure functions behind the Big-Oh Explorer (BigOhTool.svelte): a small
// expression parser for the functions a student types, a numerical checker
// for "|f(x)| <= C g(x) for all x > M", and a search for constants C, M when
// the student asks the tool to find them.
//
// Honesty note baked into the design: a computer can only test finitely many
// x.  checkBound samples the visible window densely, then geometrically out
// to x = 10^30 (or until the numbers leave double precision), refines near
// the closest calls, and separately watches whether |f|/g is still climbing
// at the far end.  The UI says "verified numerically", never "proved".

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs,
  ln: Math.log, log: Math.log, log2: Math.log2, log10: Math.log10,
  sqrt: Math.sqrt, exp: Math.exp, floor: Math.floor, ceil: Math.ceil
};
const CONSTS = { e: Math.E, pi: Math.PI, 'π': Math.PI };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (!m || m[0] === '.') throw new Error(`Bad number near "${src.slice(i, i + 6)}"`);
      tokens.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Zπ_]/.test(ch)) {
      const m = src.slice(i).match(/^[a-zA-Zπ_][a-zA-Z0-9_]*/);
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (ch === '*' && src[i + 1] === '*') { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^()|,'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '·' || ch === '×') { tokens.push({ t: 'op', v: '*' }); i++; continue; }
    if (ch === '−') { tokens.push({ t: 'op', v: '-' }); i++; continue; }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

// Splits an unknown identifier such as "xlog" or "2xsinx" into known names
// ("x", "log"), so implicit products written without spaces still parse.
function splitIdent(name) {
  const known = (s) => s === 'x' || s in FUNCS || s in CONSTS;
  if (known(name)) return [name];
  const out = [];
  let rest = name;
  while (rest.length) {
    let found = null;
    for (let len = Math.min(rest.length, 5); len >= 1; len--) {
      const cand = rest.slice(0, len);
      if (known(cand)) { found = cand; break; }
    }
    if (!found) return null;
    out.push(found);
    rest = rest.slice(found.length);
  }
  return out;
}

/**
 * Parse an expression in x. Returns { fn } on success or { error } on
 * failure; fn(x) evaluates the expression (may yield NaN/Infinity).
 *
 * Grammar (loose, calculator style): + - * / ^, implicit multiplication
 * ("100x^2", "2 x", "x sin x"), |...| for absolute value, functions with or
 * without parentheses ("log x", "sin(x)"), constants e and pi.
 */
export function parseExpression(src) {
  let tokens;
  try { tokens = tokenize(String(src ?? '')); }
  catch (err) { return { error: err.message }; }
  if (!tokens.length) return { error: 'Type an expression in x' };

  // Expand unknown identifiers into products of known ones.
  const expanded = [];
  for (const tok of tokens) {
    if (tok.t !== 'id') { expanded.push(tok); continue; }
    const parts = splitIdent(tok.v) || splitIdent(tok.v.toLowerCase());
    if (!parts) return { error: `Unknown name "${tok.v}"` };
    parts.forEach((p) => expanded.push({ t: 'id', v: p }));
  }
  tokens = expanded;

  let pos = 0;
  let absDepth = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const startsAtom = () => {
    const tk = peek();
    if (!tk) return false;
    if (tk.t === 'num' || tk.t === 'id') return true;
    return tk.t === 'op' && (tk.v === '(' || (tk.v === '|' && absDepth === 0));
  };

  function parseExpr() {
    let node = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = peek().v; pos++;
      const rhs = parseTerm();
      const lhs = node;
      node = op === '+' ? (x) => lhs(x) + rhs(x) : (x) => lhs(x) - rhs(x);
    }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = peek().v; pos++;
        const rhs = parseUnary();
        const lhs = node;
        node = op === '*' ? (x) => lhs(x) * rhs(x) : (x) => lhs(x) / rhs(x);
      } else if (startsAtom()) {
        const rhs = parsePower();      // implicit multiplication, no sign
        const lhs = node;
        node = (x) => lhs(x) * rhs(x);
      } else return node;
    }
  }
  function parseUnary() {
    if (isOp('-')) { pos++; const inner = parseUnary(); return (x) => -inner(x); }
    if (isOp('+')) { pos++; return parseUnary(); }
    return parsePower();
  }
  function parsePower() {
    const base = parseAtom();
    if (isOp('^')) {
      pos++;
      const expo = parseUnary();       // right-associative, allows 2^-x
      return (x) => Math.pow(base(x), expo(x));
    }
    return base;
  }
  function parseAtom() {
    const tk = peek();
    if (!tk) throw new Error('Unexpected end of expression');
    if (tk.t === 'num') { pos++; const v = tk.v; return () => v; }
    if (tk.t === 'op' && tk.v === '(') {
      pos++;
      const inner = parseExpr();
      if (!isOp(')')) throw new Error('Missing ")"');
      pos++;
      return inner;
    }
    if (tk.t === 'op' && tk.v === '|') {
      pos++; absDepth++;
      const inner = parseExpr();
      if (!isOp('|')) throw new Error('Missing closing "|"');
      pos++; absDepth--;
      return (x) => Math.abs(inner(x));
    }
    if (tk.t === 'id') {
      pos++;
      if (tk.v === 'x') return (x) => x;
      if (tk.v in CONSTS) { const v = CONSTS[tk.v]; return () => v; }
      if (tk.v in FUNCS) {
        const fn = FUNCS[tk.v];
        let arg;
        if (isOp('(')) {
          pos++;
          arg = parseExpr();
          if (!isOp(')')) throw new Error('Missing ")"');
          pos++;
          // f(x)^2 : exponent applies to the function value
          return (x) => fn(arg(x));
        }
        arg = parseUnary();            // "log x", "sin x^2" = sin(x^2)
        return (x) => fn(arg(x));
      }
    }
    throw new Error(`Unexpected "${tk.v}"`);
  }

  try {
    const fn = parseExpr();
    if (pos < tokens.length) return { error: `Unexpected "${tokens[pos].v}"` };
    // Smoke-test so obviously broken input is reported at parse time.
    fn(1);
    return { fn };
  } catch (err) {
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export const X_FAR = 1e30;

/**
 * Sample points: `windowN` evenly spaced in (0, xmax], then `perDecade`
 * geometrically per decade out to X_FAR. Sorted ascending.
 */
export function sampleXs(xmax, { windowN = 1500, perDecade = 400 } = {}) {
  const xs = [];
  for (let i = 1; i <= windowN; i++) xs.push((i / windowN) * xmax);
  const decades = Math.log10(X_FAR / xmax);
  const n = Math.ceil(decades * perDecade);
  const lx0 = Math.log10(xmax);
  for (let i = 1; i <= n; i++) xs.push(Math.pow(10, lx0 + (i / n) * decades));
  return xs;
}

const safeEval = (fn, x) => { try { return fn(x); } catch { return NaN; } };

/**
 * Evaluate bounded/bounding functions on the samples.  Scanning stops (the
 * "precision limit") at the first x beyond the window where either value is
 * not a finite number.  Returns arrays trimmed to the usable range.
 */
function evaluate(f, g, xs, xmax) {
  const X = [], F = [], G = [];
  let invalid = null;
  for (const x of xs) {
    const fx = safeEval(f, x), gx = safeEval(g, x);
    if (!Number.isFinite(fx) || !Number.isFinite(gx)) {
      if (x > xmax) break;                 // overflow etc. -- precision limit
      invalid = { x, fx, gx };             // undefined inside the window
      continue;
    }
    X.push(x); F.push(fx); G.push(gx);
  }
  return { X, F, G, invalid, xChecked: X.length ? X[X.length - 1] : 0 };
}

// ---------------------------------------------------------------------------
// Growth test: is |f|/g still climbing at the far end of the checked range?
// ---------------------------------------------------------------------------

const GROWTH_FACTOR = 1.03;

function tailGrowth(X, F, G, xmax) {
  const xEnd = X[X.length - 1];
  const span = Math.log10(xEnd / xmax);
  if (!(span >= 0.6)) return null;
  const width = span >= 2 ? 1 : span / 2;      // decade, or half the far range
  const lEnd = Math.log10(xEnd);
  const supOn = (lo, hi) => {
    let s = -Infinity;
    for (let i = 0; i < X.length; i++) {
      const lx = Math.log10(X[i]);
      if (lx > lo && lx <= hi && G[i] > 0) s = Math.max(s, Math.abs(F[i]) / G[i]);
    }
    return s;
  };
  const last = supOn(lEnd - width, lEnd);
  const prev = supOn(lEnd - 2 * width, lEnd - width);
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null;
  return {
    growing: last > prev * GROWTH_FACTOR && last > 0,
    last, prev,
    lastRange: [Math.pow(10, lEnd - width), xEnd],
    prevRange: [Math.pow(10, lEnd - 2 * width), Math.pow(10, lEnd - width)]
  };
}

// ---------------------------------------------------------------------------
// checkBound
// ---------------------------------------------------------------------------

/**
 * Numerically test |f(x)| <= C g(x) for all x > M.
 *
 * Returns { ok, kind, ... } where kind is one of
 *   'ok'          held at every sample (and the ratio is not still growing)
 *   'violation'   witness { x, fx, cgx } with |f(x)| > C g(x)
 *   'nonpositive' g(x) <= 0 at some sampled x > M (g must be eventually positive)
 *   'growing'     |f|/g keeps climbing at the far end: no constant C survives
 *   'invalid'     f or g is not a finite number somewhere in the window
 * plus count (samples tested) and xChecked (far end of the tested range).
 */
export function checkBound(f, g, C, M, xmax, opts = {}) {
  const xs = sampleXs(xmax, opts);
  const { X, F, G, invalid, xChecked } = evaluate(f, g, xs, xmax);
  if (invalid) return { ok: false, kind: 'invalid', ...invalid, count: 0, xChecked };
  if (!X.length) return { ok: false, kind: 'invalid', x: xmax, count: 0, xChecked };

  // Scan; remember the closest calls (inside the window and beyond it
  // separately) for local refinement.  `below` is a relative tolerance so
  // that C g(x) == |f(x)| (e.g. 300x^2 vs 300 x^2) is not a rounding "violation".
  const below = (h, fx, gx) => h < -1e-12 * (Math.abs(fx) + Math.abs(C * gx));
  const worstWin = [], worstFar = [];   // [{i, h}] lowest h = C g - |f|
  const keep = (list, i, h, n) => {
    if (list.length < n || h < list[list.length - 1].h) {
      list.push({ i, h });
      list.sort((a, b) => a.h - b.h);
      if (list.length > n) list.pop();
    }
  };
  let count = 0;
  for (let i = 0; i < X.length; i++) {
    const x = X[i];
    if (!(x > M)) continue;
    count++;
    if (G[i] <= 0) return { ok: false, kind: 'nonpositive', x, gx: G[i], count, xChecked };
    const h = C * G[i] - Math.abs(F[i]);
    if (below(h, F[i], G[i])) return { ok: false, kind: 'violation', x, fx: F[i], cgx: C * G[i], count, xChecked };
    if (x <= xmax) keep(worstWin, i, h, 8); else keep(worstFar, i, h, 4);
  }
  const worst = worstWin.concat(worstFar);
  if (count === 0) return { ok: false, kind: 'invalid', x: M, count, xChecked, reason: 'M is beyond the checked range' };

  // Local refinement around the closest calls (catches sign changes that fall
  // between samples, e.g. near zeros of g or just past a crossover).
  for (const { i } of worst) {
    let lo = i > 0 ? X[i - 1] : X[i] * 0.5;
    let hi = i + 1 < X.length ? X[i + 1] : X[i] * 1.5;
    lo = Math.max(lo, M);
    for (let round = 0; round < 3; round++) {
      let bestX = X[i], bestH = Infinity;
      const n = 64;
      for (let k = 0; k <= n; k++) {
        const x = lo + ((hi - lo) * k) / n;
        if (!(x > M)) continue;
        const fx = safeEval(f, x), gx = safeEval(g, x);
        if (!Number.isFinite(fx) || !Number.isFinite(gx)) continue;
        if (gx <= 0) return { ok: false, kind: 'nonpositive', x, gx, count, xChecked };
        const h = C * gx - Math.abs(fx);
        count++;
        if (below(h, fx, gx)) return { ok: false, kind: 'violation', x, fx, cgx: C * gx, count, xChecked };
        if (h < bestH) { bestH = h; bestX = x; }
      }
      const w = (hi - lo) / n;
      lo = Math.max(bestX - w, M);
      hi = bestX + w;
    }
  }

  const growth = tailGrowth(X, F, G, xmax);
  if (growth && growth.growing) return { ok: false, kind: 'growing', growth, count, xChecked };
  return { ok: true, kind: 'ok', growth, count, xChecked };
}

// ---------------------------------------------------------------------------
// findConstants
// ---------------------------------------------------------------------------

const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

function ladder(lo, hi) {
  const out = [];
  for (let k = Math.floor(Math.log10(lo)) - 1; k <= Math.ceil(Math.log10(hi)) + 1; k++) {
    for (const m of LADDER) {
      const v = m * Math.pow(10, k);
      if (v >= lo * 0.999999 && v <= hi * 1.000001) out.push(v);
    }
  }
  return out;
}

/** Round up to `sig` significant digits (1234 -> 1300). */
export function niceCeil(v, sig = 2) {
  if (!(v > 0) || !Number.isFinite(v)) return v;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - (sig - 1));
  return Math.ceil(v / p - 1e-9) * p;
}

/**
 * Look for constants C, M with |f(x)| <= C g(x) for all x > M (numerically).
 *
 * Prefers an M inside the visible window [0, xmax] and, among candidates,
 * a small C over a small M (score = log10 C + 0.5 log10 M, neither rewarded
 * below 1), so 100x^2 vs x^3 lands on the book's own C = 1, M = 100 rather
 * than C = 100, M = 1 or C = 0.8, M = 150.
 *
 * Returns { found: true, C, M, peak: {x, ratio}, ... } or
 *         { found: false, kind: 'growing' | 'nonpositive' | 'unbounded' | 'invalid', ... }.
 */
export function findConstants(f, g, xmax, opts = {}) {
  const xs = sampleXs(xmax, opts);
  const { X, F, G, invalid, xChecked } = evaluate(f, g, xs, xmax);
  if (invalid) return { found: false, kind: 'invalid', ...invalid, xChecked };
  if (!X.length) return { found: false, kind: 'invalid', x: xmax, xChecked };

  const growth = tailGrowth(X, F, G, xmax);
  if (growth && growth.growing) return { found: false, kind: 'growing', growth, xChecked };

  // Ratio |f|/g, and the last x where g <= 0 (M must lie beyond it).
  const R = new Array(X.length);
  let lastBad = -1;
  for (let i = 0; i < X.length; i++) {
    if (G[i] <= 0) { lastBad = i; R[i] = Infinity; }
    else R[i] = Math.abs(F[i]) / G[i];
  }
  if (lastBad >= 0 && X[lastBad] > 100 * xmax) {
    return { found: false, kind: 'nonpositive', x: X[lastBad], gx: G[lastBad], xChecked };
  }
  // Suffix maxima: sufMax[i] = sup of R over samples i..end.
  const sufMax = new Array(X.length);
  for (let i = X.length - 1; i >= 0; i--) {
    sufMax[i] = Math.max(R[i], i + 1 < X.length ? sufMax[i + 1] : -Infinity);
  }
  const supBeyond = (M) => {
    let lo = 0, hi = X.length;                  // first index with X > M
    while (lo < hi) { const mid = (lo + hi) >> 1; if (X[mid] > M) hi = mid; else lo = mid + 1; }
    return lo < X.length ? sufMax[lo] : Infinity;
  };
  // Tail sup: over the last decade of the checked range (or the far half).
  const limsup = growth ? growth.last : supBeyond(xmax);
  if (!Number.isFinite(limsup)) return { found: false, kind: 'nonpositive', x: X[lastBad], gx: G[lastBad], xChecked };

  const Cmin = Math.max(limsup, 1e-6);
  const Cs = ladder(Cmin, 1e9);
  const nice = niceCeil(limsup * 1.02, 2);
  if (nice >= Cmin && nice <= 1e9 && !Cs.includes(nice)) Cs.push(nice);
  // M candidates: nice numbers from ~1 (or a tenth of a small window) to 100x
  // the window; anything past the window is a last resort.
  const Ms = ladder(Math.max(0.01, Math.min(1, xmax / 10)), 100 * xmax);
  const minBad = lastBad >= 0 ? X[lastBad] : 0;

  let best = null;
  for (const C of Cs) {
    for (const M of Ms) {
      if (M <= minBad) continue;
      if (supBeyond(M) > C) continue;
      // (the tiny term breaks ties toward C = 1 rather than, say, C = 0.8)
      const score = Math.max(0, Math.log10(C)) + 0.5 * Math.max(0, Math.log10(M))
        + 0.01 * Math.max(0, -Math.log10(C)) + (M > xmax ? 10 : 0);
      if (!best || score < best.score - 1e-9) best = { C, M, score };
      break;                                    // smallest M for this C
    }
  }
  if (!best) return { found: false, kind: 'unbounded', limsup, xChecked };

  // Confirm with the refined checker; if a between-sample violation shows up,
  // nudge C up the ladder a few times before giving up.
  let { C, M } = best;
  for (let tries = 0; tries < 6; tries++) {
    const res = checkBound(f, g, C, M, xmax, opts);
    if (res.ok) {
      // Where is the ratio largest beyond M?  (Nice to report.)
      let peak = { x: M, ratio: 0 };
      for (let i = 0; i < X.length; i++) {
        if (X[i] > M && R[i] > peak.ratio) peak = { x: X[i], ratio: R[i] };
      }
      return { found: true, C, M, peak, limsup, xChecked: res.xChecked, count: res.count };
    }
    if (res.kind === 'violation') {
      const need = Math.abs(res.fx) / (res.cgx / C);
      C = ladder(need * 1.02, 1e12)[0] ?? need * 1.1;
    } else if (res.kind === 'nonpositive') {
      M = ladder(res.x * 1.000001, 1e12)[0] ?? res.x * 2;
    } else {
      return { found: false, kind: res.kind, ...res };
    }
  }
  return { found: false, kind: 'unbounded', limsup, xChecked };
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared with the component)
// ---------------------------------------------------------------------------

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const superscript = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** Compact number: 3 significant digits, "×10ⁿ" beyond 6 digits. */
export function fmt(v, sig = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return '?';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    let k = Math.floor(Math.log10(a));
    let ms = Number((a / Math.pow(10, k)).toPrecision(sig));
    if (ms >= 10) { ms /= 10; k += 1; }
    const mant = ms === 1 ? '' : `${ms}×`;
    return `${v < 0 ? '−' : ''}${mant}10${superscript(k)}`;
  }
  const s = Number(a.toPrecision(sig)).toString();
  return (v < 0 ? '−' : '') + s;
}
