// Minimal markdown subset for AI-generated text (Decision 63): `**bold**`,
// `*italic*`, and simple `- ` unordered lists. Any heading line (`#`..`######`
// followed by a space) is DEMOTED to a bold paragraph -- never rendered as an
// <h1>-<h6> -- so a model can't visually hijack the reader's actual section
// structure, and prompts separately forbid heading/step scaffolding anyway
// (Decision 63).
//
// SECURITY INVARIANT: `text` must already be HTML-escaped (see `escapeHtml`
// in mathRender.js) by the time it reaches this function. renderMarkdown
// never re-parses or unescapes its input -- it only wraps already-inert text
// in a small fixed set of safe tags (<strong>, <em>, <ul>, <li>, <p>, <br>).
// It must be called on non-math text segments only, AFTER math has been
// segmented out by segmentMathSpans -- see mathRender.js for the pipeline.
//
// renderMarkdown(escapedText) -> htmlString
const LIST_ITEM_RE = /^\s*-\s+(.+)$/;
const HEADING_RE = /^#{1,6}\s+(.+)$/;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /\*(.+?)\*/g;

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let pendingLines = [];
  let i = 0;

  const flushLines = () => {
    if (pendingLines.length > 0) {
      blocks.push(pendingLines.map(renderInline).join('<br>'));
      pendingLines = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    const listMatch = LIST_ITEM_RE.exec(line);
    if (listMatch) {
      flushLines();
      const items = [];
      while (i < lines.length) {
        const m = LIST_ITEM_RE.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[1])}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flushLines();
      blocks.push(`<p><strong>${renderInline(headingMatch[1])}</strong></p>`);
      i += 1;
      continue;
    }

    pendingLines.push(line);
    i += 1;
  }
  flushLines();

  return blocks.join('');
}

function renderInline(line) {
  return line.replace(BOLD_RE, '<strong>$1</strong>').replace(ITALIC_RE, '<em>$1</em>');
}
