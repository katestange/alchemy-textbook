// desmos.js — lazily load the public Desmos Graphing Calculator API and mount
// EDITABLE interactive graphs. Analogue of sageCell.js.
//
// Self-contained: ZERO imports on other project files, so it builds and imports cleanly.
//
// The Desmos API is loaded by injecting calculator.js (with the public demo apiKey).
// After it loads, window.Desmos exists. A calculator is created via
// window.Desmos.GraphingCalculator(elt) into a sized div; it is fully interactive by
// default. Expressions are added one-per-call with calc.setExpression(...).

const DESMOS_SRC =
  'https://www.desmos.com/api/v1.11/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
const LOAD_TIMEOUT_MS = 15000;

// Module-level cache of the in-flight (or resolved) load Promise so the <script>
// tag is injected into <head> at most once, even across many concurrent callers.
let loadPromise = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load script: ' + src));
    document.head.appendChild(el);
  });
}

/**
 * ensureDesmosLoaded() -> Promise<window.Desmos>
 *
 * Idempotent. Resolves immediately with window.Desmos if it already exists (no
 * injection). Otherwise injects calculator.js once, resolving on its onload (guarding
 * that window.Desmos is present). Rejects on onerror or a ~15000ms timeout. The
 * in-flight Promise is cached so injection happens only once.
 */
export function ensureDesmosLoaded() {
  if (typeof window !== 'undefined' && window.Desmos) {
    return Promise.resolve(window.Desmos);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      loadPromise = null; // allow a later retry
      reject(new Error('Timed out loading Desmos library'));
    }, LOAD_TIMEOUT_MS);

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      loadPromise = null; // allow a later retry
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      if (!window.Desmos) {
        fail(new Error('Desmos script loaded but window.Desmos is undefined'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(window.Desmos);
    };

    injectScript(DESMOS_SRC).then(succeed).catch(fail);
  });

  return loadPromise;
}

/**
 * parseExpressions(text) -> string[]
 *
 * Splits text on newlines, trims each line, and drops empty lines and comment lines
 * (first non-space char is '#'). Returns the remaining expression strings in order.
 */
export function parseExpressions(text) {
  if (text == null) return [];
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line[0] !== '#');
}

/**
 * mountDesmosCalculator(hostEl, expressions) -> Promise<void>
 *
 * `expressions` may be an array of latex strings or a single newline-delimited string
 * (run through parseExpressions). Idempotent per host (dataset.desmosMounted guard).
 * On any failure, falls back to a read-only <pre> listing the expressions and resolves
 * without throwing (mounted flag left unset).
 */
export function mountDesmosCalculator(hostEl, expressions) {
  if (hostEl && hostEl.dataset && hostEl.dataset.desmosMounted === 'true') {
    return Promise.resolve();
  }

  const exprs = Array.isArray(expressions)
    ? expressions
    : parseExpressions(expressions);

  hostEl.textContent = '';
  const div = document.createElement('div');
  div.className = 'desmos-graph';
  div.style.cssText = 'width:100%;height:420px;';
  hostEl.appendChild(div);

  return ensureDesmosLoaded()
    .then((Desmos) => {
      const calc = Desmos.GraphingCalculator(div);
      exprs.forEach((expr, index) => {
        calc.setExpression({ id: 'e' + index, latex: expr });
      });
      hostEl.dataset.desmosMounted = 'true';
    })
    .catch(() => {
      renderFallback(hostEl, exprs);
    });
}

function renderFallback(hostEl, exprs) {
  hostEl.textContent = '';
  const pre = document.createElement('pre');
  pre.className = 'desmos-fallback';
  pre.textContent = exprs.join('\n');
  hostEl.appendChild(pre);

  const note = document.createElement('p');
  note.className = 'desmos-fallback-note';
  note.textContent = 'Interactive graph unavailable — here are the expressions.';
  hostEl.appendChild(note);
}
