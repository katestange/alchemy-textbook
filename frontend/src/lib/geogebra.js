// geogebra.js — lazily load the public GeoGebra apps API and mount EDITABLE,
// interactive GeoGebra graphing applets. Analogue of desmos.js and sageCell.js.
//
// Self-contained: ZERO imports on other project files, so it builds and imports cleanly.
//
// The GeoGebra API is loaded by injecting deployggb.js. After it loads,
// window.GGBApplet (a constructor) exists. An applet is created via
// `new window.GGBApplet(params, true)` and mounted with `applet.inject(hostDiv)`.
// GeoGebra calls params.appletOnLoad(api) once the applet is ready; individual
// GeoGebra commands are run one-per-call with api.evalCommand(cmdString).

const GEOGEBRA_SRC = 'https://www.geogebra.org/apps/deployggb.js';
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
 * ensureGeoGebraLoaded() -> Promise<window.GGBApplet>
 *
 * Idempotent. Resolves immediately with window.GGBApplet if it already exists (no
 * injection). Otherwise injects deployggb.js once, resolving on its onload (guarding
 * that window.GGBApplet is present). Rejects on onerror or a ~15000ms timeout. The
 * in-flight Promise is cached so injection happens only once.
 */
export function ensureGeoGebraLoaded() {
  if (typeof window !== 'undefined' && window.GGBApplet) {
    return Promise.resolve(window.GGBApplet);
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
      reject(new Error('Timed out loading GeoGebra library'));
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
      if (!window.GGBApplet) {
        fail(new Error('GeoGebra script loaded but window.GGBApplet is undefined'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(window.GGBApplet);
    };

    injectScript(GEOGEBRA_SRC).then(succeed).catch(fail);
  });

  return loadPromise;
}

/**
 * parseCommands(text) -> string[]
 *
 * Splits text on newlines, trims each line, and drops empty lines and comment lines
 * (first non-space char is '#'). Returns the remaining command strings in order.
 */
export function parseCommands(text) {
  if (text == null) return [];
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line[0] !== '#');
}

/**
 * mountGeoGebra(hostEl, commands, opts = {}) -> Promise<void>
 *
 * `commands` may be an array of command strings or a single newline-delimited string
 * (run through parseCommands). Idempotent per host (dataset.ggbMounted guard). Mounts
 * an interactive graphing applet and runs each command via api.evalCommand. On any
 * failure, falls back to a read-only <pre> listing the commands and resolves without
 * throwing (mounted flag left unset).
 */
export function mountGeoGebra(hostEl, commands, opts = {}) {
  if (hostEl && hostEl.dataset && hostEl.dataset.ggbMounted === 'true') {
    return Promise.resolve();
  }

  const cmds = Array.isArray(commands) ? commands : parseCommands(commands);

  hostEl.textContent = '';
  const div = document.createElement('div');
  div.className = 'geogebra-graph';
  div.style.cssText = 'width:100%;height:440px;';
  hostEl.appendChild(div);

  return ensureGeoGebraLoaded()
    .then((GGBApplet) => {
      const params = {
        // 'classic' supports the FULL command set (Segment, Line, Intersect,
        // Point-on-curve, angles, loci) that construction demos need -- the
        // 'graphing' app rejects geometry commands like Segment with an error
        // modal. Toolbar/menu stay hidden for a clean embed.
        appName: opts.appName || 'classic',
        showToolBar: false,
        showMenuBar: false,
        showAlgebraInput: true,
        width: 800,
        height: 440,
        appletOnLoad: (api) => {
          // Suppress GeoGebra's own error dialog so an unrecognized command
          // fails quietly instead of popping a modal over the applet.
          if (api.setErrorDialogsActive) api.setErrorDialogsActive(false);
          for (const c of cmds) {
            try {
              api.evalCommand(c);
            } catch (_) {
              // ignore individual command failures
            }
          }
        }
      };
      const applet = new GGBApplet(params, true);
      applet.inject(div);
      hostEl.dataset.ggbMounted = 'true';
    })
    .catch(() => {
      renderFallback(hostEl, cmds);
    });
}

function renderFallback(hostEl, cmds) {
  hostEl.textContent = '';
  const pre = document.createElement('pre');
  pre.className = 'geogebra-fallback';
  pre.textContent = cmds.join('\n');
  hostEl.appendChild(pre);

  const note = document.createElement('p');
  note.className = 'geogebra-fallback-note';
  note.textContent = 'Interactive GeoGebra unavailable — here are the commands.';
  hostEl.appendChild(note);
}
