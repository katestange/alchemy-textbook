// Hover previews for cross-references (author request): mousing over a
// "Theorem 3" / "Definition 7" link shows the statement itself in a floating
// card, the way LaTeXML footnotes pop up on hover, instead of forcing the
// reader to jump away and lose their place. Clicking still navigates.
//
// Only theorem-like STATEMENT environments get a preview -- refs to figures,
// sections, equations etc. keep their plain link behavior (the LaTeXML
// title-attribute breadcrumb stays as their tooltip).
import { fetchChapterHtml } from './api.js';

const STATEMENT_RE =
  /\bltx_theorem_(theorem|definition|proposition|lemma|corollary|fact|remark)\b/;

// chapter number -> Promise<Document> for cross-chapter targets. Module-level:
// a chapter fetched once for previews is reused across chapter switches.
const chapterDocCache = new Map();

function chapterDoc(n) {
  if (!chapterDocCache.has(n)) {
    const p = fetchChapterHtml(n)
      .then((raw) => new DOMParser().parseFromString(raw, 'text/html'))
      .catch(() => {
        chapterDocCache.delete(n); // let a transient failure retry later
        return null;
      });
    chapterDocCache.set(n, p);
  }
  return chapterDocCache.get(n);
}

// Parse an ltx_ref href into { chapter: number|null, frag } -- chapter null
// means "this same page". Returns null for anything un-previewable (external
// links, whole-chapter or book.html refs with no fragment).
function parseRefHref(href) {
  if (!href) return null;
  if (href.startsWith('#')) return { chapter: null, frag: href.slice(1) };
  const m = href.match(/^(?:\.\/)?S(\d+)\.html#(.+)$/i);
  return m ? { chapter: Number(m[1]), frag: m[2] } : null;
}

function buildPreviewContent(targetEl) {
  const clone = targetEl.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // Strip anything that doesn't belong in a static preview: footnote popups
  // (nested hover-in-hover), and any reader-injected UI that may have landed
  // inside the live element (AI boxes, solution toggles, demos).
  clone
    .querySelectorAll('.ltx_note, .ai-item, .ai-solution-toggle, .builtin-applet, .bespoke-demo')
    .forEach((el) => el.remove());
  return clone;
}

export function wireRefPreviews(containerEl, currentChapter) {
  if (!containerEl) return;

  let popup = null; // the singleton card, lazily created inside containerEl
  let hideTimer = null;
  let showToken = 0; // invalidates in-flight async shows when the mouse moves on

  function ensurePopup() {
    if (popup && popup.isConnected) return popup;
    popup = document.createElement('div');
    popup.className = 'ref-preview';
    popup.setAttribute('role', 'tooltip');
    popup.hidden = true;
    // Stays open while the pointer is over the card itself (footnote-style).
    popup.addEventListener('mouseenter', cancelHide);
    popup.addEventListener('mouseleave', scheduleHide);
    containerEl.appendChild(popup);
    return popup;
  }

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hide, 250);
  }

  function hide() {
    showToken++;
    if (popup) popup.hidden = true;
  }

  function positionAt(link) {
    const crect = containerEl.getBoundingClientRect();
    const lrect = link.getBoundingClientRect();
    // Measure with the card already rendered (hidden=false) at final width.
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = lrect.left - crect.left;
    left = Math.max(0, Math.min(left, containerEl.clientWidth - pw));
    // Below the link unless that would run off the bottom of the viewport
    // (and there IS room above) -- then flip on top.
    let top = lrect.bottom - crect.top + 8;
    if (lrect.bottom + ph + 16 > window.innerHeight && lrect.top - ph - 16 > 0) {
      top = lrect.top - crect.top - ph - 8;
    }
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  // Resolve the ref's target element, cross-chapter if needed. Returns the
  // element or null (not found / not a statement environment).
  async function resolveStatement(ref) {
    let target = null;
    if (ref.chapter === null || ref.chapter === currentChapter) {
      target = document.getElementById(ref.frag);
    } else {
      const doc = await chapterDoc(ref.chapter);
      target = doc && doc.getElementById(ref.frag);
    }
    if (!target || !STATEMENT_RE.test(target.className)) return null;
    return target;
  }

  async function show(link, ref) {
    const token = ++showToken;
    cancelHide();
    const target = await resolveStatement(ref);
    if (token !== showToken) return; // pointer already moved on
    if (!target) {
      link.dataset.refPreview = 'no'; // don't re-resolve on every hover
      return;
    }
    // Our popup supersedes the browser tooltip from LaTeXML's title attribute
    // (the "Theorem 3 ‣ 2.1 ... ‣ ..." breadcrumb) -- showing both is noise.
    link.removeAttribute('title');
    const card = ensurePopup();
    card.replaceChildren(buildPreviewContent(target));
    card.hidden = false;
    positionAt(link);
  }

  containerEl.querySelectorAll('a.ltx_ref[href]').forEach((link) => {
    if (link.dataset.refPreview) return;
    const ref = parseRefHref(link.getAttribute('href'));
    if (!ref) return;
    link.dataset.refPreview = 'yes';
    let showTimer = null;
    const enter = () => {
      cancelHide();
      if (link.dataset.refPreview === 'no') return;
      // Small delay so skimming the pointer across the text doesn't flash
      // cards; footnote popups are instant but they never fetch.
      showTimer = setTimeout(() => show(link, ref), 150);
    };
    const leave = () => {
      if (showTimer) clearTimeout(showTimer);
      scheduleHide();
    };
    link.addEventListener('mouseenter', enter);
    link.addEventListener('mouseleave', leave);
    // Keyboard parity: focusing the link previews it too.
    link.addEventListener('focus', enter);
    link.addEventListener('blur', leave);
  });
}
