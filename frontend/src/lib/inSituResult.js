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
import { mountDesmosCalculator } from './desmos.js';
import { mountGeoGebra } from './geogebra.js';

// An applet's code may begin with a tool marker; the model chooses per
// selection (see the applet prompt). No marker => a SageMath cell.
const DESMOS_MARKER = '[[DESMOS]]';
const GEOGEBRA_MARKER = '[[GEOGEBRA]]';

// --- Per-reader "hide" list (author feedback: too many chips can be confusing
// to navigate; let a student banish ones they don't want). Non-destructive and
// client-only: the artifact stays on the server for everyone else, this reader
// just doesn't see it. Persisted in localStorage keyed by item-key
// (`creatureType:content_hash`) so it survives reloads. A change dispatches a
// document event so the reading pane can update its "N hidden — show" control.
// The key is namespaced by the book's slug (book.toml via /api/book, stashed
// on window.__BOOK_CONFIG__) so two books hosted on one domain don't share
// hidden-item state. Initialized lazily — first use happens well after the
// config fetch — with a one-time migration from the old un-namespaced key.
const HIDDEN_KEY_LEGACY = 'alchemy:hidden-ai-items';

function hiddenKey() {
  const slug =
    (typeof window !== 'undefined' && window.__BOOK_CONFIG__?.slug) || 'book';
  return `alchemy:${slug}:hidden-ai-items`;
}

let hiddenSet = null;

function getHidden() {
  if (hiddenSet === null) {
    try {
      const legacy = localStorage.getItem(HIDDEN_KEY_LEGACY);
      if (legacy !== null && localStorage.getItem(hiddenKey()) === null) {
        localStorage.setItem(hiddenKey(), legacy);
        localStorage.removeItem(HIDDEN_KEY_LEGACY);
      }
      hiddenSet = new Set(JSON.parse(localStorage.getItem(hiddenKey()) || '[]'));
    } catch {
      hiddenSet = new Set();
    }
  }
  return hiddenSet;
}

function persistHidden() {
  try {
    localStorage.setItem(hiddenKey(), JSON.stringify([...getHidden()]));
  } catch {
    /* private-mode / quota: hiding still works for this session */
  }
  try {
    document.dispatchEvent(new CustomEvent('alchemy:hidden-changed', { detail: getHidden().size }));
  } catch {
    /* no DOM (tests) */
  }
}

export function hiddenCount() {
  return getHidden().size;
}

export function unhideAll() {
  hiddenSet = new Set();
  persistHidden();
}

const CREATURE_LABEL = {
  example: 'Example',
  intuition: 'Intuition',
  justify: 'Justify',
  counterexample: 'Counterexample',
  fun: 'Fun',
  applet: 'Applet',
  eureka: 'Eureka'
};

const CREATURE_CHIP_LABEL = {
  example: 'Ex.',
  intuition: 'Int.',
  justify: 'Just.',
  counterexample: 'CtEx.',
  fun: 'Fun',
  applet: 'App.',
  eureka: '💡'
};

// Finds (or creates) the shared cluster sibling that holds every chip+box
// pair anchored to `anchorEl`.
function getOrCreateCluster(anchorEl, injectAfter) {
  // `injectAfter` (e.g. the <li> or heading the reader selected inside) is a
  // better insertion point than the big enclosing block; fall back to the
  // anchor block element. The cluster id keys off the insertion host so
  // separate list items get separate clusters.
  const host = injectAfter || anchorEl;
  const clusterId = `ai-cluster-${cssEscape(host.id || anchorEl.id || '')}`;
  let cluster = document.getElementById(clusterId);
  if (cluster) return cluster;

  cluster = document.createElement('div');
  cluster.id = clusterId;
  cluster.className = 'ai-cluster';
  host.insertAdjacentElement('afterend', cluster);
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
  updateAnchorHighlight(item.closest('.ai-cluster'));
}

// While a note is expanded, softly highlight the passage it's anchored to -- a
// calming cue that links the note to its text (author feedback). We paint the
// EXACT selected sentence, not the whole enclosing paragraph, using the CSS
// Custom Highlight API (::highlight(ai-anchor) in theme.css): it highlights a
// Range without wrapping any DOM, so it never disturbs the LaTeXML structure or
// inline MathML. When the browser lacks the API or the exact text can't be
// found, we fall back to the old whole-block amber wash.
const HL_NAME = 'ai-anchor';
const anchorRanges = new Map(); // cluster.id -> Range[] of its expanded notes

function highlightApiOk() {
  return !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
}

// Locate `needleRaw` as a text Range inside `root`, matching on
// whitespace-normalized text so newlines/indentation in the source HTML don't
// defeat the match. Returns a Range or null.
function findTextRange(root, needleRaw) {
  const needle = (needleRaw || '').replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let hay = '';
  const map = []; // map[i] -> { node, offset } for normalized-haystack char i
  let prevSpace = false;
  let node;
  while ((node = walker.nextNode())) {
    const t = node.nodeValue;
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i])) {
        if (prevSpace || hay.length === 0) continue; // collapse runs / leading ws
        hay += ' ';
        map.push({ node, offset: i });
        prevSpace = true;
      } else {
        hay += t[i];
        map.push({ node, offset: i });
        prevSpace = false;
      }
    }
  }
  const idx = hay.indexOf(needle);
  if (idx === -1) return null;
  const start = map[idx];
  const end = map[idx + needle.length - 1];
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

// Rebuild the single document-wide Highlight from every cluster's live ranges
// (pruning any that were detached by a chapter reload or item removal).
function rebuildHighlights() {
  if (!highlightApiOk()) return;
  const live = [];
  for (const [id, ranges] of anchorRanges) {
    const kept = ranges.filter((r) => r.startContainer && r.startContainer.isConnected);
    if (kept.length) {
      anchorRanges.set(id, kept);
      live.push(...kept);
    } else {
      anchorRanges.delete(id);
    }
  }
  if (live.length) CSS.highlights.set(HL_NAME, new Highlight(...live));
  else CSS.highlights.delete(HL_NAME);
}

function updateAnchorHighlight(cluster) {
  if (!cluster) return;
  const anchor = cluster.previousElementSibling;
  if (!anchor || !anchor.classList) return;
  // Clear both mechanisms for this cluster before recomputing.
  anchor.classList.remove('ai-anchor-highlight');
  anchorRanges.delete(cluster.id);

  const expanded = cluster.querySelectorAll('.ai-item.expanded');
  if (expanded.length) {
    const ranges = [];
    if (highlightApiOk()) {
      expanded.forEach((it) => {
        const r = findTextRange(anchor, it.dataset.selectionText || '');
        if (r) ranges.push(r);
      });
    }
    if (ranges.length) anchorRanges.set(cluster.id, ranges);
    else anchor.classList.add('ai-anchor-highlight'); // fallback: whole-block wash
  }
  rebuildHighlights();
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

// Turns the applet body into a live, editable demo seeded with `code` -- a
// Desmos graph if the code is marked [[DESMOS]], otherwise a SageCell.
function mountApplet(body, code) {
  if (body.dataset.appletMounted === 'true') return;
  body.dataset.appletMounted = 'true';
  body.textContent = '';
  const host = document.createElement('div');
  host.className = 'applet-host';
  const trimmed = code.trimStart();
  const isDesmos = trimmed.startsWith(DESMOS_MARKER);
  const isGeoGebra = trimmed.startsWith(GEOGEBRA_MARKER);
  // Reserve the height with a loading placeholder so the box doesn't jump when
  // the (async) library finishes loading.
  host.style.minHeight = isDesmos || isGeoGebra ? '440px' : '160px';
  const ph = document.createElement('div');
  ph.className = 'applet-loading';
  ph.textContent = 'Loading interactive demo…';
  host.appendChild(ph);
  body.appendChild(host);
  if (isDesmos) {
    mountDesmosCalculator(host, trimmed.slice(DESMOS_MARKER.length));
  } else if (isGeoGebra) {
    mountGeoGebra(host, trimmed.slice(GEOGEBRA_MARKER.length));
  } else {
    mountEditableCell(host, code); // async; renders its own fallback on failure
  }
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
  if (getHidden().has(itemKey)) {
    if (opts.skipIfHidden) return null;
    getHidden().delete(itemKey);
    persistHidden();
  }

  const cluster = getOrCreateCluster(anchorEl, opts.injectAfter);
  // Look the item up document-wide, not just in this cluster: a fresh
  // generation keys its cluster off the inject point (the <li>/heading) while
  // hydration keys off the anchor block, so the same artifact could otherwise
  // land in two clusters as duplicate chip+box pairs.
  let item = document.querySelector(`.ai-cluster [data-item-key="${itemKey}"]`)
    || cluster.querySelector(`[data-item-key="${itemKey}"]`);
  if (item) {
    const existing = item.querySelector('.ai-result');
    // A regeneration on the same block may discuss a different phrase --
    // keep the "On: ..." line current.
    if (opts.selectionText !== undefined) setOnLine(existing, item, opts.selectionText);
    if (opts.contentId != null) existing.dataset.contentId = String(opts.contentId);
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
  if (opts.contentId != null) box.dataset.contentId = String(opts.contentId);
  box.setAttribute('aria-label', `${creatureLabel}, ${status}, generated content`);

  const head = document.createElement('div');
  head.className = 'ai-result-head';

  // Type title (author feedback: the header should say what KIND it is).
  const name = document.createElement('span');
  name.className = 'creature-name';
  name.textContent = creatureLabel;
  head.appendChild(name);

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = `AI-generated · ${status}`;
  head.appendChild(tag);

  // Delete-forever (author feedback: purge a bad AI output). Shown to the
  // creator on their own content, and to an instructor on anyone's. The
  // content id arrives with the `done` event / hydration and is stamped on the
  // box; clicking before that just removes it locally.
  if (opts.canDelete) {
    const del = document.createElement('button');
    del.className = 'delete-forever';
    del.type = 'button';
    del.textContent = 'delete';
    del.title = 'Delete this forever — removes it for everyone (only you, its creator, can)';
    del.setAttribute('aria-label', 'Delete this AI item forever');
    del.addEventListener('click', () => {
      if (!window.confirm('Delete this AI output forever? It will be removed for everyone and cannot be undone.')) {
        return;
      }
      const id = box.dataset.contentId;
      if (id) {
        document.dispatchEvent(
          new CustomEvent('alchemy:delete-content', { detail: { contentId: Number(id) } })
        );
      }
      const cluster = item.closest('.ai-cluster');
      item.remove();
      updateAnchorHighlight(cluster);
    });
    head.appendChild(del);
  }

  // Flag to the instructor (author feedback): report AI content as
  // incorrect/misleading or inappropriate. Meaningful once the content has a
  // stored id (arrives with `done`/hydration); a still-streaming box has none.
  const flag = document.createElement('button');
  flag.className = 'flag-content';
  flag.type = 'button';
  flag.textContent = 'flag';
  flag.title = 'Flag this AI content for your instructor';
  flag.setAttribute('aria-label', 'Flag this AI content for your instructor');
  flag.addEventListener('click', () => {
    const id = box.dataset.contentId;
    if (!id) return; // nothing persisted to flag yet
    document.dispatchEvent(
      new CustomEvent('alchemy:flag', { detail: { contentId: Number(id) } })
    );
  });
  head.appendChild(flag);

  const hide = document.createElement('button');
  hide.className = 'hide';
  hide.type = 'button';
  hide.textContent = 'hide';
  hide.title = 'Hide this — remove it from the page (generating it again brings it back)';
  hide.setAttribute('aria-label', 'Hide this AI item');
  hide.addEventListener('click', () => {
    getHidden().add(itemKey);
    persistHidden();
    const cluster = item.closest('.ai-cluster');
    item.remove();
    updateAnchorHighlight(cluster);
  });
  head.appendChild(hide);

  const dismiss = document.createElement('button');
  dismiss.className = 'dismiss';
  dismiss.type = 'button';
  dismiss.textContent = '×';  // U+00D7 multiplication sign; EB Garamond has it
                              // (the heavier U+2715 close glyph tofu'd)
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
  // Stash the full (untruncated) selection so the anchor highlight can locate
  // and paint the exact sentence, not just the enclosing block.
  if (text) item.dataset.selectionText = text;
  else delete item.dataset.selectionText;
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
  // Strip a leading [[EPHEMERAL]] marker (unusable-selection redirect) so the
  // reader never sees the raw token; the marker's effect is applied on `done`.
  const text = (accumulatedText || '').replace(/^\s*\[\[EPHEMERAL\]\]\s*/, '');
  if (box.dataset.creature === 'applet') {
    renderApplet(box, body, stripCodeFences(text), !!opts.streaming);
    return;
  }
  body.innerHTML = renderStreamedMath(text, opts);
  wireSolutionToggles(body);
}

// Turns a result into an ephemeral, one-time note (author idea): the model
// marked the selection unusable ([[EPHEMERAL]]), so it was never stored. It
// can't rest as a persistent chip -- it self-removes on the next click
// outside it, and its controls are dropped since there's nothing to keep.
export function markEphemeral(box) {
  const item = box.closest('.ai-item');
  if (!item) return;
  item.classList.add('ephemeral');
  const head = box.querySelector('.ai-result-head');
  const tag = head && head.querySelector('.tag');
  if (tag) tag.textContent = 'One-time note · not saved';
  // Nothing to keep, so drop the collapse/hide/flag controls...
  if (head) head.querySelectorAll('.hide, .dismiss, .flag-content').forEach((b) => b.remove());

  // ...and offer both dismiss affordances a reader might reach for: an × at
  // the top-right, an "ok!" button at the end, and a click anywhere outside.
  function remove() {
    document.removeEventListener('mousedown', onDown, true);
    item.remove();
  }
  function onDown(e) {
    if (!item.contains(e.target)) remove();
  }

  if (head) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ephemeral-close';
    close.setAttribute('aria-label', 'Dismiss this note');
    close.textContent = '×';
    close.addEventListener('click', remove);
    head.appendChild(close);
  }

  const okRow = document.createElement('div');
  okRow.className = 'ephemeral-ok-row';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'ephemeral-ok';
  ok.textContent = 'ok!';
  ok.addEventListener('click', remove);
  okRow.appendChild(ok);
  box.appendChild(okRow);

  setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
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
    el.textContent = hasCode ? code.replace(/^\s*\[\[(DESMOS|GEOGEBRA)\]\]\s*/, '') : 'Writing the demo…';
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
      btn.textContent = revealed ? 'Hide solution' : 'Show solution';
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
