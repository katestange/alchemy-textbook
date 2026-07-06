// Maps a text selection to the enclosing manifest content block.
//
// Given a starting DOM node (typically `range.commonAncestorContainer` from
// the browser Selection API) and a Map from element id -> manifest block
// (see manifestMap.js), walks up the ancestor chain looking for the nearest
// element whose `id` attribute is a key in the map. LaTeXML nests block ids
// (e.g. a `<math>` element's id lives inside a `<p id="S1.SS1.p1">`), so the
// selection anchor is very often several levels above wherever the user's
// cursor actually landed -- this walk is what finds it.
export function findEnclosingBlock(startNode, blockMap) {
  let node = startNode;

  // Text nodes (and other non-element nodes, e.g. the selection landing
  // directly in a text run) aren't in the map -- start the walk from the
  // nearest element ancestor.
  if (node && node.nodeType !== 1 /* Node.ELEMENT_NODE */) {
    node = node.parentElement || node.parentNode || null;
  }

  while (node && node.nodeType === 1) {
    const id = node.id;
    if (id && blockMap.has(id)) {
      return { xml_id: id, block: blockMap.get(id) };
    }
    node = node.parentElement || null;
  }

  return null;
}

// Convenience wrapper: like findEnclosingBlock, but returns null if the
// nearest matching block is not anchorable (spec: "If the block is not
// anchorable, ignore" -- no toolbar for selections inside e.g. stub/TODO
// paragraphs that have no stable meaning to attach content to).
export function resolveSelectionAnchor(startNode, blockMap) {
  const match = findEnclosingBlock(startNode, blockMap);
  if (!match) return null;
  if (match.block && match.block.anchorable === false) return null;
  return match;
}

// Resolves an anchor for a whole selection Range, robust to selections that
// include non-block content. LaTeXML wraps figures/images in their own
// elements (e.g. `<figure id="S2.F12">`, `<img id="S2.F12.g1">`) that are NOT
// manifest blocks, so when a selection spans an image the browser's
// `commonAncestorContainer` bubbles up past every anchorable paragraph to a
// container with no mapped id -- and the plain walk returns null, leaving the
// reader with no toolbar. Try the selection's start and end nodes too (which
// usually sit inside a real text block), and finally fall back to the nearest
// preceding anchorable block in document order (so even a figure-only
// selection attaches to the paragraph just above it).
const HEADING_SEL = '.ltx_title, h1, h2, h3, h4, h5, h6';

export function resolveSelectionAnchorFromRange(range, blockMap) {
  if (!range) return null;
  for (const node of [range.startContainer, range.commonAncestorContainer, range.endContainer]) {
    const a = resolveSelectionAnchor(node, blockMap);
    if (a) return a;
  }
  let el = range.startContainer;
  if (el && el.nodeType !== 1) el = el.parentElement;
  // A section heading isn't itself a manifest block; anchoring to the nearest
  // *preceding* block would attach the content to the previous section (and
  // place it above the heading). Prefer the section's FIRST block instead.
  const heading = el && el.closest && el.closest(HEADING_SEL);
  if (heading) {
    return followingAnchorable(heading, blockMap) || precedingAnchorable(el, blockMap);
  }
  return precedingAnchorable(el, blockMap);
}

// The DOM element the result cluster should be inserted AFTER, so it lands
// next to what the reader actually selected rather than after a big enclosing
// block. A list item or a heading is a far better insertion point than the
// paragraph/section block the content is anchored to. Returns null to fall
// back to the anchor block element.
export function chooseInjectAfter(range) {
  if (!range) return null;
  let node = range.endContainer;
  if (node && node.nodeType !== 1) node = node.parentElement;
  if (!node || !node.closest) return null;
  return node.closest('li.ltx_item, li') || node.closest(HEADING_SEL) || null;
}

// Nearest anchorable block AFTER `el` in document order (mirror of
// precedingAnchorable): scan following siblings and their descendants,
// climbing ancestors.
function followingAnchorable(el, blockMap) {
  const ok = (id) => {
    if (!id || !blockMap.has(id)) return null;
    const block = blockMap.get(id);
    return !block || block.anchorable !== false ? { xml_id: id, block } : null;
  };
  let node = el;
  while (node && node.nodeType === 1) {
    for (let nx = node.nextElementSibling; nx; nx = nx.nextElementSibling) {
      const self = ok(nx.id);
      if (self) return self;
      const inner = nx.querySelectorAll ? nx.querySelectorAll('[id]') : [];
      for (let i = 0; i < inner.length; i++) {
        const hit = ok(inner[i].id);
        if (hit) return hit;
      }
    }
    node = node.parentElement;
  }
  return null;
}

// Nearest anchorable block that appears before `el` in document order: scan
// previous element siblings (and any anchorable descendants within them) at
// each ancestor level, climbing until one is found.
function precedingAnchorable(el, blockMap) {
  const ok = (id) => {
    if (!id || !blockMap.has(id)) return null;
    const block = blockMap.get(id);
    return !block || block.anchorable !== false ? { xml_id: id, block } : null;
  };
  let node = el;
  while (node && node.nodeType === 1) {
    for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
      const self = ok(prev.id);
      if (self) return self;
      const inner = prev.querySelectorAll ? prev.querySelectorAll('[id]') : [];
      for (let i = inner.length - 1; i >= 0; i--) {
        const hit = ok(inner[i].id);
        if (hit) return hit;
      }
    }
    node = node.parentElement;
  }
  return null;
}
