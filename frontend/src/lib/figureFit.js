// Sizing of TikZ figures in the reader (author feedback 2026-09-12: "the
// tikz figures are quite small compared to the font").
//
// LaTeXML emits each tikzpicture as an <svg class="ltx_picture"> whose
// width/height are TikZ's print dimensions in pt, rendered here 1pt = 1px.
// The book is a 10pt article, but the reader sets body text at ~18px, so at
// 1:1 every drawing is small against the prose while its labels (pinned to
// 16px) crowd the geometry. We scale each picture up through a viewBox --
// geometry and labels together -- then shrink the labels back towards
// body-text size (see --fig-font in theme.css), which is roughly the
// proportion the printed page has.
//
// Pictures that share a row (LaTeXML puts side-by-side tikzpictures in one
// paragraph, rows separated by <br>) get one common scale: the largest
// k <= MAX_SCALE at which the row still fits the column, never below 1.

export const MAX_SCALE = 1.6;
export const LABEL_MAX_PX = 16; // LaTeXML's calibration size for labels
export const LABEL_MIN_PX = 11;

// Group the pictures of a container into rows: pictures with the same parent
// and no <br> between them share a row.
export function groupPictureRows(containerEl) {
  const rows = [];
  const seen = new Set();
  containerEl.querySelectorAll('svg.ltx_picture').forEach((svg) => {
    const parent = svg.parentElement;
    if (!parent || seen.has(parent)) return;
    seen.add(parent);
    let row = [];
    for (const child of parent.children) {
      if (child.tagName === 'BR') {
        if (row.length) rows.push(row);
        row = [];
      } else if (child.matches('svg.ltx_picture')) {
        row.push(child);
      }
    }
    if (row.length) rows.push(row);
  });
  return rows;
}

// The common scale for one row: fit the row's natural widths (plus their
// horizontal margins) into `available` px, capped at MAX_SCALE, floored at 1.
export function rowScale(naturalWidths, margins, available) {
  const total = naturalWidths.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(available > 0)) return 1;
  const k = (available - margins) / total;
  return Math.max(1, Math.min(MAX_SCALE, k));
}

// Label font size (px, in picture coordinates) for a picture scaled by k, so
// that a \normalsize label lands near body-text size on screen.
export function labelFontPx(k, bodyPx) {
  return Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, bodyPx / k));
}

function horizontalMargin(el) {
  const cs = getComputedStyle(el);
  return (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
}

function innerWidth(el) {
  const cs = getComputedStyle(el);
  return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
}

// Apply the scaling to every picture in the container. Idempotent: natural
// sizes are remembered on the element, so calling again re-fits from scratch.
export function fitFigures(containerEl, bodyPx) {
  if (!containerEl) return;
  for (const row of groupPictureRows(containerEl)) {
    const widths = row.map((svg) => {
      if (!svg.dataset.naturalWidth) {
        svg.dataset.naturalWidth = svg.getAttribute('width');
        svg.dataset.naturalHeight = svg.getAttribute('height');
      }
      return parseFloat(svg.dataset.naturalWidth) || 0;
    });
    const margins = row.reduce((a, svg) => a + horizontalMargin(svg), 0);
    const k = rowScale(widths, margins, innerWidth(row[0].parentElement));
    const font = labelFontPx(k, bodyPx);
    row.forEach((svg, i) => {
      const w = widths[i];
      const h = parseFloat(svg.dataset.naturalHeight) || 0;
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.style.width = `${k * w}px`;
      svg.style.height = `${k * h}px`;
      svg.style.setProperty('--fig-font', `${font}px`);
    });
  }
}

// LaTeXML sizes each label's <foreignObject> from TeX metrics; the label
// rendered in the reader's fonts is wider (and, with the baseline 16px below
// the box top, taller) than that box. Chrome ignores the box (overflow is
// visible) but Safari/Firefox clip to it, which is how the author saw "-> 5x"
// for "x -> 5x" and cycle nodes missing their g. Grow each box to its
// content, keeping it centred where TikZ put it. Idempotent; call again once
// web fonts have loaded, since the measurement depends on them.
export function fitFigureLabels(containerEl) {
  if (!containerEl) return;
  containerEl.querySelectorAll('.ltx_picture foreignObject').forEach((fo) => {
    const wrap = fo.firstElementChild;
    if (!wrap || !wrap.classList.contains('fig-label')) return;
    if (!fo.dataset.w) {
      fo.dataset.w = fo.getAttribute('width') || '0';
      fo.dataset.h = fo.getAttribute('height') || '0';
      fo.dataset.x = fo.getAttribute('x') || '0';
    }
    const W = parseFloat(fo.dataset.w);
    const H = parseFloat(fo.dataset.h);
    const X = parseFloat(fo.dataset.x);
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    if (w > W) {
      fo.setAttribute('width', String(w));
      fo.setAttribute('x', String(X - (w - W) / 2));
    } else {
      fo.setAttribute('width', String(W));
      fo.setAttribute('x', String(X));
    }
    fo.setAttribute('height', String(Math.max(H, h)));
  });
}
