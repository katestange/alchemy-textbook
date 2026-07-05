import { describe, it, expect, beforeEach } from 'vitest';
import {
  findEnclosingBlock,
  resolveSelectionAnchor,
  resolveSelectionAnchorFromRange
} from '../src/lib/selectionWalker.js';
import { buildBlockMap } from '../src/lib/manifestMap.js';

// jsdom is configured as the vitest environment (vite.config.js `test.environment`),
// so `document` is available here.

function makeManifest() {
  return {
    blocks: [
      { xml_id: 'S1.SS1.p1', anchorable: true, block_type: 'paragraph' },
      { xml_id: 'S1.SS1.SSS6.p1', anchorable: false, block_type: 'paragraph' },
      { xml_id: 'S1.Thmtheorem1', anchorable: true, block_type: 'theorem' }
    ]
  };
}

describe('findEnclosingBlock / resolveSelectionAnchor', () => {
  let blockMap;

  beforeEach(() => {
    document.body.innerHTML = '';
    blockMap = buildBlockMap(makeManifest());
  });

  it('finds the block id when it lives on the node itself', () => {
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    document.body.appendChild(p);

    const result = findEnclosingBlock(p, blockMap);
    expect(result).toEqual({ xml_id: 'S1.SS1.p1', block: blockMap.get('S1.SS1.p1') });
  });

  it('walks up through several ancestors to find the id (math nested in a paragraph)', () => {
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    const span = document.createElement('span');
    const math = document.createElement('math');
    span.appendChild(math);
    p.appendChild(span);
    document.body.appendChild(p);

    const result = findEnclosingBlock(math, blockMap);
    expect(result.xml_id).toBe('S1.SS1.p1');
  });

  it('starts the walk from the parent element when given a text node', () => {
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    const textNode = document.createTextNode('hello world');
    p.appendChild(textNode);
    document.body.appendChild(p);

    const result = findEnclosingBlock(textNode, blockMap);
    expect(result.xml_id).toBe('S1.SS1.p1');
  });

  it('returns null when no ancestor has a mapped id', () => {
    const div = document.createElement('div');
    div.id = 'not-in-manifest';
    document.body.appendChild(div);

    expect(findEnclosingBlock(div, blockMap)).toBeNull();
  });

  it('finds the nearest ancestor id, not an outer one, when nested', () => {
    const outer = document.createElement('div');
    outer.id = 'S1.Thmtheorem1';
    const inner = document.createElement('p');
    inner.id = 'S1.SS1.p1';
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const result = findEnclosingBlock(inner, blockMap);
    expect(result.xml_id).toBe('S1.SS1.p1');
  });

  it('resolveSelectionAnchor passes through an anchorable block', () => {
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    document.body.appendChild(p);

    const result = resolveSelectionAnchor(p, blockMap);
    expect(result.xml_id).toBe('S1.SS1.p1');
  });

  it('resolveSelectionAnchor ignores a non-anchorable block (returns null)', () => {
    const p = document.createElement('p');
    p.id = 'S1.SS1.SSS6.p1'; // anchorable: false in the fixture manifest
    document.body.appendChild(p);

    expect(resolveSelectionAnchor(p, blockMap)).toBeNull();
  });

  it('resolveSelectionAnchor returns null when there is no match at all', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(resolveSelectionAnchor(div, blockMap)).toBeNull();
  });

  // A selection that spans an image: LaTeXML puts the figure/image in its own
  // non-block element, so commonAncestorContainer bubbles above any paragraph.
  it('resolveSelectionAnchorFromRange anchors a text-through-image selection via its start node', () => {
    const section = document.createElement('section');
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    const startText = document.createTextNode('as shown in ');
    p.appendChild(startText);
    const figure = document.createElement('figure'); // id S1.F1 -- NOT a manifest block
    figure.id = 'S1.F1';
    const img = document.createElement('img');
    img.id = 'S1.F1.g1';
    figure.appendChild(img);
    section.appendChild(p);
    section.appendChild(figure);
    document.body.appendChild(section);

    // Range from the paragraph text through the image -> commonAncestor = section.
    const range = document.createRange();
    range.setStart(startText, 0);
    range.setEnd(img, 0);
    expect(range.commonAncestorContainer).toBe(section);
    expect(resolveSelectionAnchor(range.commonAncestorContainer, blockMap)).toBeNull();

    const anchor = resolveSelectionAnchorFromRange(range, blockMap);
    expect(anchor.xml_id).toBe('S1.SS1.p1');
  });

  // A figure-only selection: no anchorable ancestor, so fall back to the
  // nearest preceding anchorable block (the paragraph above the figure).
  it('resolveSelectionAnchorFromRange falls back to the preceding block for a figure-only selection', () => {
    const section = document.createElement('section');
    const p = document.createElement('p');
    p.id = 'S1.SS1.p1';
    p.appendChild(document.createTextNode('intro'));
    const figure = document.createElement('figure');
    figure.id = 'S1.F1';
    const cap = document.createElement('figcaption');
    const capText = document.createTextNode('Figure 1: a picture');
    cap.appendChild(capText);
    figure.appendChild(cap);
    section.appendChild(p);
    section.appendChild(figure);
    document.body.appendChild(section);

    const range = document.createRange();
    range.selectNodeContents(cap);
    const anchor = resolveSelectionAnchorFromRange(range, blockMap);
    expect(anchor.xml_id).toBe('S1.SS1.p1');
  });
});
