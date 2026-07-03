// Creates/updates the "in situ" AI-result box that appears directly after an
// anchor content block (Q3/Q11: pastel wash, "AI-generated · unreviewed"
// tag). This is plain DOM manipulation rather than a mounted Svelte
// component: the anchor element lives inside HTML injected via {@html}
// (the pre-rendered LaTeXML chapter, Decision 45), and Svelte doesn't own
// that subtree, so we insert a sibling node next to it directly.
import { renderStreamedMath } from './mathRender.js';

const CREATURE_LABEL = {
  example: 'Example'
};

// Ensures a result box exists immediately after `anchorEl`, keyed by
// `key` (e.g. the block's content_hash) so repeated calls for the same
// generation update the same box instead of creating duplicates.
export function ensureResultBox(anchorEl, creatureType, key, status = 'unreviewed') {
  const existingId = `ai-result-${cssEscape(key)}`;
  let box = document.getElementById(existingId);
  if (box) return box;

  box = document.createElement('div');
  box.id = existingId;
  box.className = 'ai-result';
  box.dataset.creature = creatureType;
  box.setAttribute(
    'aria-label',
    `${CREATURE_LABEL[creatureType] || creatureType}, ${status}, generated content`
  );

  const head = document.createElement('div');
  head.className = 'ai-result-head';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = `AI-generated · ${status}`;
  head.appendChild(tag);

  const dismiss = document.createElement('button');
  dismiss.className = 'dismiss';
  dismiss.type = 'button';
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.addEventListener('click', () => box.remove());
  head.appendChild(dismiss);

  const body = document.createElement('div');
  body.className = 'body';

  box.appendChild(head);
  box.appendChild(body);

  anchorEl.insertAdjacentElement('afterend', box);
  return box;
}

// Re-renders the accumulated text into the box's body on every SSE delta.
// Buffering strategy (spec Q3/Q13): re-segment the FULL accumulated text
// each time and let segmentMathSpans() decide what's safe to render as math
// vs. plain text (an unclosed trailing "$"-span stays literal until its
// close arrives) -- see lib/mathSegmenter.js for the actual rule.
export function updateResultBox(box, accumulatedText) {
  const body = box.querySelector('.body');
  body.innerHTML = renderStreamedMath(accumulatedText);
}

export function showResultError(box, message) {
  const body = box.querySelector('.body');
  body.innerHTML = `<em>${message.replace(/</g, '&lt;')}</em>`;
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}
