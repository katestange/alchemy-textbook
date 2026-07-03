// Renders accumulating AI-streamed text to an HTML string: plain-text
// segments are escaped, math segments are converted to MathML via Temml.
// Base-textbook math never touches this path -- it's already native MathML
// in the LaTeXML HTML (Decision 49) and is injected verbatim.
import temml from 'temml';
import { segmentMathSpans } from './mathSegmenter.js';

export function renderStreamedMath(text) {
  const segments = segmentMathSpans(text);
  return segments
    .map((seg) => {
      if (seg.type === 'text') {
        return escapeHtml(seg.value).replace(/\n/g, '<br>');
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

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
