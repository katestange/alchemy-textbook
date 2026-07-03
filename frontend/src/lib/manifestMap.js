// Builds a Map from xml_id -> block for O(1) lookup while handling text
// selection. Built once per manifest load (per spec step 3).
//
// Includes ALL block xml_ids, anchorable or not: the anchorability check
// happens at *use* time in selectionWalker.js, not at map-build time. That
// way a selection landing inside a non-anchorable block (e.g. a stub
// paragraph like "(Todo: To be written)") is still recognized as "this is a
// known block, just not one you can anchor a creature to" rather than
// silently falling through to some unrelated, possibly-wrong ancestor.
export function buildBlockMap(manifest) {
  const map = new Map();
  for (const block of (manifest && manifest.blocks) || []) {
    map.set(block.xml_id, block);
  }
  return map;
}
