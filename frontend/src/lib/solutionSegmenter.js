// Segments AI-streamed text on the literal `[[solution]]` ... `[[/solution]]`
// markers the example-creature prompt now wraps try-it-yourself solutions in
// (Decision 62, extends Decision 55's "don't just hand over the answer"
// stance -- attempt-first pedagogy). The frontend renders a wrapped span as a
// collapsed "Show solution" toggle instead of spoiling it inline; this module
// only does the text segmentation, not the rendering.
//
// segmentSolutions(text) -> Array<{ type: 'text', value: string }
//                                | { type: 'solution', value: string, closed: boolean }>
//
// Rules:
//   - Markers are matched literally and stripped; only the wrapped content is
//     kept as the segment's value.
//   - Multiple solution blocks in one text all get segmented.
//   - Not nested: a solution segment ends at the first "[[/solution]]" found
//     after its opener.
//   - Streaming edge: if an opening marker has no matching close yet, the
//     segment runs to the end of the text with `closed: false` -- the caller
//     (see mathRender.js) is expected to show a placeholder instead of the
//     raw, possibly-mid-sentence solution text while streaming, and to
//     finalize it (treat as closed) once the stream itself has ended.
//   - Text without any markers comes back as a single `text` segment, so
//     content that never uses the feature renders exactly as before.
const OPEN = '[[solution]]';
const CLOSE = '[[/solution]]';

export function segmentSolutions(text) {
  const segments = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const openIdx = text.indexOf(OPEN, i);
    if (openIdx === -1) {
      segments.push({ type: 'text', value: text.slice(i) });
      break;
    }
    if (openIdx > i) {
      segments.push({ type: 'text', value: text.slice(i, openIdx) });
    }

    const contentStart = openIdx + OPEN.length;
    const closeIdx = text.indexOf(CLOSE, contentStart);
    if (closeIdx === -1) {
      segments.push({ type: 'solution', value: text.slice(contentStart), closed: false });
      i = n;
      break;
    }

    segments.push({ type: 'solution', value: text.slice(contentStart, closeIdx), closed: true });
    i = closeIdx + CLOSE.length;
  }

  return segments;
}
