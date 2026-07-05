// Standalone bundle for the instructor dashboard (server-rendered Jinja2, no
// build step of its own). Reuses the EXACT same rendering pipeline students
// see -- Temml math + the markdown subset + [[solution]] toggles -- so a
// reviewer reads answers the way a reader will, LaTeX and all, instead of raw
// source. Built to backend-served static JS via `npm run build:admin`
// (esbuild IIFE); wired in templates/admin/base.html.
//
// Elements with class `js-latex` have their raw text (the LaTeX/markdown
// source, carried in a data-src attribute so Jinja escaping never mangles it)
// replaced with rendered HTML.
import { renderStreamedMath } from './lib/mathRender.js';
import { mountEditableCell } from './lib/sageCell.js';

function renderAll() {
  document.querySelectorAll('.js-latex').forEach((el) => {
    const src = el.getAttribute('data-src');
    if (src == null) return;
    el.innerHTML = renderStreamedMath(src, { streaming: false });
  });
  // Applet responses are Sage code, not prose -- mount an editable, runnable
  // SageCell so the instructor can actually try it before approving, instead
  // of markdown-rendering the code (which mangled the leading `#` comment into
  // a heading, etc.).
  document.querySelectorAll('.js-sage-applet').forEach((el) => {
    const src = el.getAttribute('data-src');
    if (src == null) return;
    el.textContent = '';
    mountEditableCell(el, src);
  });
  wireSolutionToggles(document);
}

// Same reveal/hide behavior as the reader (inSituResult.wireSolutionToggles),
// via one delegated listener so it also covers content rendered later.
function wireSolutionToggles(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.solution-toggle-btn');
    if (!btn) return;
    const wrap = btn.closest('.solution-toggle');
    if (!wrap) return;
    const revealed = wrap.classList.toggle('revealed');
    btn.innerHTML = revealed ? 'Hide solution &#9662;' : 'Show solution &#9656;';
    btn.setAttribute('aria-expanded', String(revealed));
    const content = wrap.querySelector('.solution-content');
    if (content) content.hidden = !revealed;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAll);
} else {
  renderAll();
}
