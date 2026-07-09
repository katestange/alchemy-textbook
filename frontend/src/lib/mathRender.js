// Renders accumulating AI-streamed text to an HTML string. Pipeline, outer to
// inner:
//   1. segmentSolutions()  -- split out [[solution]]...[[/solution]] wrapped
//      spans (Decision 62) from plain-text runs.
//   2. segmentMathSpans()  -- within each plain-text run (including a
//      revealed solution's inner content), split "$...$"/"$$...$$" math from
//      text, withholding an unclosed trailing span until it closes.
//   3. escapeHtml() + renderMarkdown() -- non-math text is HTML-escaped
//      FIRST, then the minimal markdown subset (Decision 63) is applied to
//      the already-inert escaped text; math segments are handed to Temml
//      instead.
// Base-textbook math never touches this path -- it's already native MathML
// in the LaTeXML HTML (Decision 49) and is injected verbatim.
import temml from 'temml';
import { segmentMathSpans } from './mathSegmenter.js';
import { segmentSolutions } from './solutionSegmenter.js';
import { renderMarkdown } from './markdown.js';

const SOLUTION_PENDING_HTML =
  '<span class="solution-pending">&hellip;solution being written (hidden until you reveal)</span>';

// `opts.streaming`: true while more SSE deltas may still arrive for this
// generation. An unclosed [[solution]] span is only shown as a "being
// written" placeholder while streaming; once the caller knows the stream has
// ended (the `done` SSE event, or any already-complete/hydrated content) it
// should pass `streaming: false` (the default) so a dangling opener with no
// close is finalized into a normal toggle instead -- "treat stream-end-
// without-close as close" (Decision 62).
export function renderStreamedMath(text, opts = {}) {
  const streaming = !!opts.streaming;
  return segmentSolutions(text)
    .map((seg) => renderSolutionSegment(seg, streaming))
    .join('');
}

function renderSolutionSegment(seg, streaming) {
  if (seg.type === 'text') {
    return renderPlainRun(seg.value);
  }
  // seg.type === 'solution'
  if (!seg.closed && streaming) {
    // Still being generated: never show the partial, possibly mid-sentence
    // answer text.
    return SOLUTION_PENDING_HTML;
  }
  const inner = renderPlainRun(seg.value);
  return (
    '<span class="solution-toggle">' +
    '<button type="button" class="solution-toggle-btn" aria-expanded="false">Show solution</button>' +
    `<span class="solution-content" hidden>${inner}</span>` +
    '</span>'
  );
}

// Renders one plain-text run (outside any solution marker, or the revealed
// content inside one): math segmented out and Temml-rendered, remaining text
// escaped then markdown-processed.
function renderPlainRun(text) {
  const segments = segmentMathSpans(text);
  return segments
    .map((seg) => {
      if (seg.type === 'text') {
        return renderMarkdown(escapeHtml(seg.value));
      }
      try {
        return temml.renderToString(seg.value, { displayMode: !!seg.display });
      } catch (e) {
        // Malformed LaTeX from the model: show it literally rather than
        // breaking the whole result box.
        const delim = seg.display ? '$$' : '$';
        return escapeHtml(`${delim}${seg.value}${delim}`);
      }
    })
    .join('');
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
