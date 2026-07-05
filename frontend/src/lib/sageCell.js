// sageCell.js — lazily load the public SageCell library and mount EDITABLE Sage code cells.
//
// Self-contained: ZERO imports on other project files, so it builds and imports cleanly.
//
// SageCell is loaded from https://sagecell.sagemath.org: first jquery.min.js, then
// embedded_sagecell.js. After the second loads, window.sagecell exists. Cells are made
// editable (default CodeMirror editor) via window.sagecell.makeSagecell(...).

const JQUERY_SRC = 'https://sagecell.sagemath.org/static/jquery.min.js';
const EMBED_SRC = 'https://sagecell.sagemath.org/embedded_sagecell.js';
const LOAD_TIMEOUT_MS = 15000;

// Module-level cache of the in-flight (or resolved) load Promise so the two <script>
// tags are injected into <head> at most once, even across many concurrent callers.
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
 * ensureSageCellLoaded() -> Promise<window.sagecell>
 *
 * Idempotent. Resolves immediately with window.sagecell if it already exists (no
 * injection). Otherwise injects jquery first, then embedded_sagecell.js after jquery's
 * onload, resolving on the embed script's onload. Rejects on either onerror or a
 * ~15000ms timeout. The in-flight Promise is cached so injection happens only once.
 */
export function ensureSageCellLoaded() {
  if (typeof window !== 'undefined' && window.sagecell) {
    return Promise.resolve(window.sagecell);
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
      reject(new Error('Timed out loading SageCell library'));
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
      if (!window.sagecell) {
        fail(new Error('SageCell script loaded but window.sagecell is undefined'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(window.sagecell);
    };

    injectScript(JQUERY_SRC)
      .then(() => {
        if (settled) return;
        return injectScript(EMBED_SRC).then(succeed);
      })
      .catch(fail);
  });

  return loadPromise;
}

/**
 * mountEditableCell(hostEl, code) -> Promise<void>
 *
 * Mounts an editable Sage cell containing `code` into hostEl. Idempotent per host
 * (dataset.sagecellMounted guard). On any failure, falls back to a read-only <pre>
 * rendering of the code and resolves without throwing (mounted flag left unset).
 */
export function mountEditableCell(hostEl, code) {
  if (hostEl && hostEl.dataset && hostEl.dataset.sagecellMounted === 'true') {
    return Promise.resolve();
  }

  // Build the cell markup: <div class="sagecell-mount"><script type="text/x-sage">CODE</script></div>
  hostEl.textContent = '';
  const div = document.createElement('div');
  div.className = 'sagecell-mount';
  const script = document.createElement('script');
  script.type = 'text/x-sage';
  // Use .text (not innerHTML) so `code` is never HTML-parsed/escaped.
  script.text = code;
  div.appendChild(script);
  hostEl.appendChild(div);

  return ensureSageCellLoaded()
    .then((sagecell) => {
      sagecell.makeSagecell({
        inputLocation: div,
        evalButtonText: 'Run',
        editor: 'codemirror',
        autoeval: false
      });
      hostEl.dataset.sagecellMounted = 'true';
    })
    .catch(() => {
      renderFallback(hostEl, code);
    });
}

function renderFallback(hostEl, code) {
  hostEl.textContent = '';
  const pre = document.createElement('pre');
  pre.className = 'sagecell-fallback';
  pre.textContent = code;
  hostEl.appendChild(pre);

  const note = document.createElement('p');
  note.className = 'sagecell-fallback-note';
  note.textContent = 'Interactive Sage unavailable — here is the code.';
  hostEl.appendChild(note);
}

/**
 * activatePreauthoredCells(root = document) -> number
 *
 * Finds every `.builtin-applet` under `root` that is not yet mounted, reads its Sage
 * code from the element's `data-sage` attribute, and mounts an editable cell into it.
 * Elements without a data-sage attribute are skipped. Returns the count of cells for
 * which mounting was started.
 */
export function activatePreauthoredCells(root = document) {
  const els = root.querySelectorAll('.builtin-applet');
  let started = 0;
  els.forEach((el) => {
    if (el.dataset && el.dataset.sagecellMounted === 'true') return;
    const code = el.getAttribute('data-sage');
    if (code == null) return;
    mountEditableCell(el, code);
    started += 1;
  });
  return started;
}
