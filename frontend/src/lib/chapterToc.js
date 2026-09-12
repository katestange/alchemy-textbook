// Per-chapter table of contents (author request, 2026-09-12): every chapter
// page opens with a clickable list of its sections and subsections.
//
// The book is compiled with the article class, so a *chapter* is LaTeXML's
// `ltx_section` (h1) and the chapter's own sections / subsections are
// `ltx_subsection` (h2) / `ltx_subsubsection` (h3). The list is built from the
// rendered chapter DOM rather than the manifest so it can never drift from
// what is actually on the page (titles keep their MathML, unnumbered
// headings simply appear without a number).

const NAV_CLASS = 'chapter-toc';

// Split a LaTeXML heading into its number ("2.1 ") and title, cloning the
// title markup so math in titles renders the same way as in the heading
// itself. Cloned nodes must not carry ids (they would duplicate the
// heading's own anchors).
function entryHtml(heading) {
  const clone = heading.cloneNode(true);
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  const tag = clone.querySelector(':scope > .ltx_tag');
  let num = '';
  if (tag) {
    num = tag.textContent.trim();
    tag.remove();
  }
  const text = clone.innerHTML.trim();
  return (
    (num ? `<span class="${NAV_CLASS}-num">${num}</span>` : '') +
    `<span class="${NAV_CLASS}-text">${text}</span>`
  );
}

function headingOf(section, titleClass) {
  return section.querySelector(`:scope > .${titleClass}`);
}

// Sections produced by starred commands have a heading but no id; give them
// one so they can still be linked from the list.
function ensureId(section, fallback) {
  if (!section.id) section.id = fallback;
  return section.id;
}

// Collect [{ id, html, children: [{ id, html }] }] for the chapter.
export function collectChapterOutline(containerEl) {
  const outline = [];
  const subsections = containerEl.querySelectorAll('section.ltx_subsection');
  subsections.forEach((sec, i) => {
    const h = headingOf(sec, 'ltx_title_subsection');
    if (!h) return;
    const id = ensureId(sec, `${NAV_CLASS}-s${i + 1}`);
    const children = [];
    sec.querySelectorAll('section.ltx_subsubsection').forEach((sub, j) => {
      const hh = headingOf(sub, 'ltx_title_subsubsection');
      if (!hh) return;
      children.push({
        id: ensureId(sub, `${id}-ss${j + 1}`),
        html: entryHtml(hh)
      });
    });
    outline.push({ id, html: entryHtml(h), children });
  });
  return outline;
}

function listHtml(entries, depth) {
  const items = entries
    .map((e) => {
      const kids = e.children && e.children.length ? listHtml(e.children, depth + 1) : '';
      return `<li><a href="#${e.id}">${e.html}</a>${kids}</li>`;
    })
    .join('');
  return `<ol class="${NAV_CLASS}-list ${NAV_CLASS}-depth${depth}">${items}</ol>`;
}

// Build the <nav> and insert it directly under the chapter title. Returns the
// nav element, or null when the chapter has no sections to list. Safe to call
// again on the same container (the previous list is replaced).
export function wireChapterToc(containerEl) {
  if (!containerEl) return null;
  containerEl.querySelectorAll(`.${NAV_CLASS}`).forEach((old) => old.remove());

  const outline = collectChapterOutline(containerEl);
  if (outline.length === 0) return null;

  const title = containerEl.querySelector('.ltx_title_section');
  if (!title) return null;

  const nav = document.createElement('nav');
  nav.className = NAV_CLASS;
  nav.setAttribute('aria-label', 'Chapter contents');
  nav.innerHTML =
    `<details class="${NAV_CLASS}-details" open>` +
    `<summary class="${NAV_CLASS}-summary">Contents</summary>` +
    listHtml(outline, 1) +
    `</details>`;
  title.insertAdjacentElement('afterend', nav);
  return nav;
}
