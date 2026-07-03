// Segments accumulating AI-streamed text into alternating text/math spans.
//
// Why this exists: Temml can only render a *complete* LaTeX expression. If we
// naively re-rendered on every delta, a formula would flash as broken/partial
// markup while it's still being typed out mid-stream. Per spec (Q3/Q13), the
// fix is: withhold a "$...$" / "$$...$$" span until its closing delimiter has
// arrived. The simplest correct approach (and the one used here) is to
// re-segment the *entire accumulated text* on every delta, and treat any
// trailing, not-yet-closed "$"-span as plain text (delimiters included) --
// once the closing delimiter shows up in a later delta, that same span
// becomes a proper math segment on the next re-render.
//
// segmentMathSpans(text) -> Array<{ type: 'text', value: string }
//                                | { type: 'math', value: string, display: boolean }>
//
// Rules:
//   - "$$...$$" is display math; "$...$" is inline math.
//   - "\$" is an escaped literal dollar sign -- never treated as a delimiter,
//     and rendered back out as a plain "$".
//   - An unclosed trailing span (no matching closing delimiter yet in the
//     text seen so far) is emitted verbatim as a text segment, delimiters and
//     all, so nothing is silently dropped while streaming.
export function segmentMathSpans(text) {
  const segments = [];
  let textBuf = '';
  let i = 0;
  const n = text.length;

  const flushText = () => {
    if (textBuf.length > 0) {
      segments.push({ type: 'text', value: textBuf });
      textBuf = '';
    }
  };

  while (i < n) {
    const ch = text[i];

    if (ch === '\\' && text[i + 1] === '$') {
      textBuf += '$';
      i += 2;
      continue;
    }

    if (ch === '$') {
      const isDisplay = text[i + 1] === '$';
      const openLen = isDisplay ? 2 : 1;
      const closeDelim = isDisplay ? '$$' : '$';
      const searchFrom = i + openLen;
      const closeIdx = findUnescapedDelimiter(text, searchFrom, closeDelim);

      if (closeIdx === -1) {
        // Unclosed span: render literally (including delimiter) until a
        // future delta supplies the close.
        textBuf += text.slice(i);
        i = n;
        break;
      }

      flushText();
      const inner = text.slice(searchFrom, closeIdx);
      segments.push({ type: 'math', value: inner, display: isDisplay });
      i = closeIdx + closeDelim.length;
      continue;
    }

    textBuf += ch;
    i += 1;
  }

  flushText();
  return segments;
}

// Finds the next occurrence of `delim` at or after `from` whose dollar
// sign(s) aren't escaped by a preceding backslash (an odd run of
// backslashes immediately before the delimiter means it's escaped).
function findUnescapedDelimiter(text, from, delim) {
  let idx = from;
  for (;;) {
    idx = text.indexOf(delim, idx);
    if (idx === -1) return -1;

    let backslashes = 0;
    let j = idx - 1;
    while (j >= 0 && text[j] === '\\') {
      backslashes += 1;
      j -= 1;
    }
    if (backslashes % 2 === 0) return idx;
    idx += 1; // escaped; keep looking
  }
}
