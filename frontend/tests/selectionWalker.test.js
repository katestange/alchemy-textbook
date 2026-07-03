import { describe, it, expect, beforeEach } from 'vitest';
import { findEnclosingBlock, resolveSelectionAnchor } from '../src/lib/selectionWalker.js';
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
});
