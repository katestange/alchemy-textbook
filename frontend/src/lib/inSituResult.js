// Creates/updates the "in situ" AI-result box that appears directly after an
// anchor content block (Q3/Q11: pastel wash, "AI-generated · unreviewed"
// tag). This is plain DOM manipulation rather than a mounted Svelte
// component: the anchor element lives inside HTML injected via {@html}
// (the pre-rendered LaTeXML chapter, Decision 45), and Svelte doesn't own
// that subtree, so the result box is inserted as a plain DOM sibling.
//
// Resting state (Decision 61): the box's default/idle appearance is a small
// collapsed chip at the anchor -- the quiet-mode analog of "the creature
// settles" -- not the full box. Content hydrated on chapter load starts
// collapsed (book-first, Q11); a fresh generation streams in expanded, and
// its dismiss control now COLLAPSES the box back to a chip rather than
// removing it (the author's #1 first-user-test complaint was AI content
// vanishing with no way back). Multiple artifacts anchored to the same block
// (e.g. an example AND an intuition) each get their own chip+box pair,
// grouped in one flex-wrap "cluster" sibling so the chips sit side by side
// until one is expanded (CSS: an expanded item takes the full row width,
// pushing any other chips onto their own line -- see .ai-cluster/.ai-item in
// theme.css).
import { renderStreamedMath, escapeHtml } from './mathRender.js';
import { mountEditableCell } from './sageCell.js';

// --- Per-reader "hide" list (author feedback: too many chips can be confusing
// to navigate; let a student banish ones they don't want). Non-destructive and
// client-only: the artifact stays on the server for everyone else, this reader
// just doesn't see it. Persisted in localStorage keyed by item-key
// (`creatureType:content_hash`) so it survives reloads. A change dispatches a
// document event so the reading pane can update its "N hidden — show" control.
const HIDDEN_KEY = 'alchemy:hidden-ai-items';

function loadHidden() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
let hiddenSet = loadHidden();

function persistHidden() {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenSet]));
  } catch {
    /* private-mode / quota: hiding still works for this session */
  }
  try {
    document.dispatchEvent(new CustomEvent('alchemy:hidden-changed', { detail: hiddenSet.size }));
  } catch {
    /* no DOM (tests) */
  }
}

export function hiddenCount() {
  return hiddenSet.size;
}

export function unhideAll() {
  hiddenSet = new Set();
  persistHidden();
}

const CREATURE_LABEL = {
  example: 'Example',
  intuition: 'Intuition',
  applet: 'Applet'
};

const CREATURE_CHIP_LABEL = {
  example: 'Ex.',
  intuition: 'Int.',
  applet: 'App.'
};

// Finds (or creates) the shared cluster sibling that holds every chip+box
// pair anchored to `anchorEl`.
function getOrCreateCluster(anchorEl) {
  const clusterId = `ai-cluster-${cssEscape(anchorEl.id || '')}`;
  let cluster = document.getElementById(clusterId);
  if (cluster) return cluster;

  cluster = document.createElement('div');
  cluster.id = clusterId;
  cluster.className = 'ai-cluster';
  anchorEl.insertAdjacentElement('afterend', cluster);
  return cluster;
}

function setExpanded(item, expanded) {
  item.classList.toggle('expanded', expanded);
  item.classList.toggle('collapsed', !expanded);
  const chip = item.querySelector('.ai-chip');
  if (chip) chip.setAttribute('aria-expanded', String(expanded));
  // An applet's SageCell is heavy (loads the SageCell library + an editor), so
  // a collapsed/hydrated applet defers mounting until it's actually expanded.
  if (expanded) mountAppletIfPending(item);
}

// If this item is an applet whose code is stashed but not yet turned into a
// live editable SageCell, mount it now. Safe to call repeatedly.
function mountAppletIfPending(item) {
  const box = item.querySelector('.ai-result');
  if (!box || box.dataset.creature !== 'applet') return;
  const body = box.querySelector('.body');
  if (body && body.dataset.sage != null && body.dataset.appletMounted !== 'true') {
    mountApplet(body, body.dataset.sage);
  }
}

// Turns the applet body into a live, editable SageCell seeded with `code`.
function mountApplet(body, code) {
  if (body.dataset.appletMounted === 'true') return;
  body.dataset.appletMounted = 'true';
  body.textContent = '';
  const host = document.createElement('div');
  host.className = 'applet-host';
  body.appendChild(host);
  mountEditableCell(host, code); // async; renders its own fallback on failure
}

// Models are told to emit raw Sage only, but strip stray ```-fences defensively
// (and a lone opener that hasn't closed yet mid-stream).
function stripCodeFences(text) {
  const t = (text || '').trim();
  const fenced = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (fenced) return fenced[1].trim();
  return t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
}

// Ensures a result box (and its collapsed-chip counterpart) exists for
// `creatureType` immediately after `anchorEl`, keyed by `key` (e.g. the
// block's content_hash) so repeated calls for the same generation update the
// same box instead of creating duplicates. Returns the `.ai-result` box
// element (the same shape as before this feature, so existing callers that
// do `box.querySelector('.body')` / rely on the returned node keep working).
//
// `opts.collapsed`: start the item in its collapsed-chip resting state
// (hydrated/existing content, Decision 61's "book-first" rule) rather than
// expanded (fresh generation, streams in open).
export function ensureResultBox(anchorEl, creatureType, key, status = 'unreviewed', opts = {}) {
  const itemKey = `${creatureType}:${cssEscape(key)}`;

  // Hidden by this reader: skip silently during hydration (opts.skipIfHidden),
  // but a fresh, explicitly-requested generation un-hides and shows it again.
  if (hiddenSet.has(itemKey)) {
    if (opts.skipIfHidden) return null;
    hiddenSet.delete(itemKey);
    persistHidden();
  }

  const cluster = getOrCreateCluster(anchorEl);
  let item = cluster.querySelector(`[data-item-key="${itemKey}"]`);
  if (item) {
    const existing = item.querySelector('.ai-result');
    // A regeneration on the same block may discuss a different phrase --
    // keep the "On: ..." line current.
    if (opts.selectionText !== undefined) setOnLine(existing, item, opts.selectionText);
    return existing;
  }

  const collapsed = !!opts.collapsed;

  item = document.createElement('div');
  item.className = `ai-item ${collapsed ? 'collapsed' : 'expanded'}`;
  item.dataset.itemKey = itemKey;

  const chipLabel = CREATURE_CHIP_LABEL[creatureType] || creatureType;
  const creatureLabel = CREATURE_LABEL[creatureType] || creatureType;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'ai-chip';
  chip.dataset.creature = creatureType;
  chip.title = `${creatureLabel} — ${status}`;
  chip.setAttribute('aria-expanded', String(!collapsed));
  chip.innerHTML =
    `${escapeHtml(chipLabel)}<span class="ai-chip-dot" data-status="${escapeHtml(status)}" aria-hidden="true"></span>`;
  chip.addEventListener('click', () => setExpanded(item, true));

  const box = document.createElement('div');
  box.className = 'ai-result';
  box.dataset.creature = creatureType;
  box.setAttribute('aria-label', `${creatureLabel}, ${status}, generated content`);

  const head = document.createElement('div');
  head.className = 'ai-result-head';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = `AI-generated · ${status}`;
  head.appendChild(tag);

  const hide = document.createElement('button');
  hide.className = 'hide';
  hide.type = 'button';
  hide.textContent = 'hide';
  hide.title = 'Hide this — remove it from the page (generating it again brings it back)';
  hide.setAttribute('aria-label', 'Hide this AI item');
  hide.addEventListener('click', () => {
    hiddenSet.add(itemKey);
    persistHidden();
    item.remove();
  });
  head.appendChild(hide);

  const dismiss = document.createElement('button');
  dismiss.className = 'dismiss';
  dismiss.type = 'button';
  dismiss.textContent = '✕';
  dismiss.title = 'Collapse to chip';
  dismiss.setAttribute('aria-label', 'Collapse to chip');
  dismiss.addEventListener('click', () => setExpanded(item, false));
  head.appendChild(dismiss);

  const body = document.createElement('div');
  body.className = 'body';

  box.appendChild(head);
  box.appendChild(body);

  item.appendChild(chip);
  item.appendChild(box);
  cluster.appendChild(item);

  if (opts.selectionText) setOnLine(box, item, opts.selectionText);

  return box;
}

// The phrase this artifact was generated about (the user's original
// selection). Later readers never made the selection, so the AI's "this
// phrase..." is meaningless without it: show it as a muted quoted line
// between the box head and body, and in the chip's hover tooltip.
function setOnLine(box, item, selectionText) {
  const text = (selectionText || '').trim();
  let line = box.querySelector('.ai-result-on');
  if (!text) {
    if (line) line.remove();
    return;
  }
  if (!line) {
    line = document.createElement('div');
    line.className = 'ai-result-on';
    const head = box.querySelector('.ai-result-head');
    head.insertAdjacentElement('afterend', line);
  }
  const short = text.length > 140 ? text.slice(0, 140) + '…' : text;
  line.innerHTML = `On: <q>${escapeHtml(short)}</q>`;
  const chip = item.querySelector('.ai-chip');
  if (chip) {
    const tip = text.length > 80 ? text.slice(0, 80) + '…' : text;
    chip.title = `${chip.title.split(' — on "')[0]} — on "${tip}"`;
  }
}

// Re-renders the accumulated text into the box's body on every SSE delta (or
// once, for already-complete hydrated content). See mathRender.js for the
// `opts.streaming` contract (Decision 62's [[solution]] finalize-on-close-or-
// stream-end rule).
export function updateResultBox(box, accumulatedText, opts = {}) {
  const body = box.querySelector('.body');
  if (box.dataset.creature === 'applet') {
    renderApplet(box, body, stripCodeFences(accumulatedText), !!opts.streaming);
    return;
  }
  body.innerHTML = renderStreamedMath(accumulatedText, opts);
  wireSolutionToggles(body);
}

// Applet rendering: while streaming, show the code accumulating as read-only
// source (a live SageCell can't be seeded until the code is complete). When
// the stream ends (or for already-complete hydrated content), stash the final
// code on the body and either mount the editable cell now (if the box is
// open) or leave a placeholder that mounts on first expand.
function renderApplet(box, body, code, streaming) {
  const item = box.closest('.ai-item');
  const hasCode = !!(code && code.trim());
  // Once a live cell is mounted, never clobber it on a later re-render.
  if (body.dataset.appletMounted === 'true') return;

  // Still streaming, or nothing to mount yet (the initial empty call): show the
  // code accumulating as read-only source; never mount a partial/empty cell.
  if (streaming || !hasCode) {
    body.innerHTML = '';
    const el = document.createElement(hasCode ? 'pre' : 'div');
    el.className = hasCode ? 'sage-src' : 'applet-placeholder';
    el.textContent = hasCode ? code : 'Writing the Sage demo…';
    body.appendChild(el);
    return;
  }

  // Final, with code. Mount now if open; otherwise stash and mount on expand.
  body.dataset.sage = code;
  if (item && item.classList.contains('expanded')) {
    mountApplet(body, code);
  } else {
    body.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'applet-placeholder';
    note.textContent = 'Interactive Sage demo — expand to load and run.';
    body.appendChild(note);
  }
}

// innerHTML wipes out any listeners attached on a previous render, so every
// render re-wires the reveal/hide behavior on whatever ".solution-toggle-btn"
// elements are currently in the DOM. (Streaming caveat, documented rather
// than solved here: if a reader opens a solution toggle WHILE later content
// is still streaming in below it, the next delta's full re-render resets it
// to collapsed -- an acceptable edge case given these are short one-shot
// responses and the box already re-renders wholesale on every delta.)
function wireSolutionToggles(body) {
  body.querySelectorAll('.solution-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.solution-toggle');
      if (!wrap) return;
      const revealed = wrap.classList.toggle('revealed');
      btn.innerHTML = revealed ? 'Hide solution &#9662;' : 'Show solution &#9656;';
      btn.setAttribute('aria-expanded', String(revealed));
      const content = wrap.querySelector('.solution-content');
      if (content) content.hidden = !revealed;
    });
  });
}

export function showResultError(box, message) {
  const body = box.querySelector('.body');
  body.innerHTML = `<em>${escapeHtml(message)}</em>`;
}

// Fully removes a chip+box pair -- used only when a generation never
// produced any content at all (e.g. budget_exceeded before/mid-stream), so
// there is nothing worth resting as a chip. Everything else should collapse,
// never remove (Decision 61).
export function removeResultItem(box) {
  const item = box.closest('.ai-item');
  (item || box).remove();
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}
