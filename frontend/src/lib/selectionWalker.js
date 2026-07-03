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
