import { describe, it, expect, beforeEach } from 'vitest';
import { ensureResultBox, updateResultBox, removeResultItem } from '../src/lib/inSituResult.js';

function makeAnchor(id) {
  document.body.innerHTML = `<div id="${id}">anchor content</div>`;
  return document.getElementById(id);
}

describe('inSituResult (Decision 61 collapsed-chip resting state)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a cluster + item + chip + box after the anchor', () => {
    const anchor = makeAnchor('blk1');
    const box = ensureResultBox(anchor, 'example', 'hash1', 'unreviewed');
    const cluster = anchor.nextElementSibling;
    expect(cluster.className).toBe('ai-cluster');
    expect(cluster.querySelector('.ai-chip')).toBeTruthy();
    expect(cluster.querySelector('.ai-result')).toBe(box);
  });

  it('starts expanded by default (fresh generation) and collapsed when opts.collapsed is set (hydrated content)', () => {
    const anchorA = makeAnchor('blkA');
    ensureResultBox(anchorA, 'example', 'hashA', 'unreviewed');
    expect(anchorA.nextElementSibling.querySelector('.ai-item').className).toContain('expanded');

    const anchorB = makeAnchor('blkB');
    ensureResultBox(anchorB, 'example', 'hashB', 'approved', { collapsed: true });
    expect(anchorB.nextElementSibling.querySelector('.ai-item').className).toContain('collapsed');
  });

  it('clicking the chip expands the item', () => {
    const anchor = makeAnchor('blk2');
    ensureResultBox(anchor, 'example', 'hash2', 'approved', { collapsed: true });
    const item = anchor.nextElementSibling.querySelector('.ai-item');
    expect(item.className).toContain('collapsed');
    item.querySelector('.ai-chip').click();
    expect(item.className).toContain('expanded');
    expect(item.className).not.toContain('collapsed');
  });

  it('the box dismiss button collapses back to the chip -- it never removes the item', () => {
    const anchor = makeAnchor('blk3');
    const box = ensureResultBox(anchor, 'example', 'hash3', 'unreviewed');
    const item = anchor.nextElementSibling.querySelector('.ai-item');
    expect(item.className).toContain('expanded');
    box.querySelector('.dismiss').click();
    expect(item.className).toContain('collapsed');
    // still in the DOM, content intact
    expect(document.body.contains(item)).toBe(true);
    expect(item.querySelector('.ai-result')).toBe(box);
  });

  it('calling ensureResultBox again with the same key returns the existing box (no duplicates)', () => {
    const anchor = makeAnchor('blk4');
    const box1 = ensureResultBox(anchor, 'example', 'hash4', 'unreviewed');
    const box2 = ensureResultBox(anchor, 'example', 'hash4', 'unreviewed');
    expect(box1).toBe(box2);
    expect(anchor.nextElementSibling.querySelectorAll('.ai-item').length).toBe(1);
  });

  it('two different creature types on the same anchor get separate chip+box pairs in one cluster', () => {
    const anchor = makeAnchor('blk5');
    ensureResultBox(anchor, 'example', 'hash5', 'approved', { collapsed: true });
    ensureResultBox(anchor, 'intuition', 'hash5', 'approved', { collapsed: true });
    const cluster = anchor.nextElementSibling;
    expect(cluster.querySelectorAll('.ai-item').length).toBe(2);
    expect(cluster.querySelector("[data-item-key='example:hash5']")).toBeTruthy();
    expect(cluster.querySelector("[data-item-key='intuition:hash5']")).toBeTruthy();
  });

  it('removeResultItem removes the whole chip+box pair (budget_exceeded: nothing to rest as a chip)', () => {
    const anchor = makeAnchor('blk6');
    const box = ensureResultBox(anchor, 'example', 'hash6', 'unreviewed');
    removeResultItem(box);
    expect(anchor.nextElementSibling.querySelectorAll('.ai-item').length).toBe(0);
  });

  it('updateResultBox renders content and wires the solution toggle to reveal/hide on click', () => {
    const anchor = makeAnchor('blk7');
    const box = ensureResultBox(anchor, 'example', 'hash7', 'unreviewed');
    updateResultBox(box, 'Try it. [[solution]]x = 2[[/solution]]');
    const btn = box.querySelector('.solution-toggle-btn');
    const content = box.querySelector('.solution-content');
    expect(content.hidden).toBe(true);
    btn.click();
    expect(content.hidden).toBe(false);
    expect(box.querySelector('.solution-toggle').className).toContain('revealed');
    btn.click();
    expect(content.hidden).toBe(true);
  });

  it('escapes model text end-to-end so no live/raw tags reach the DOM', () => {
    const anchor = makeAnchor('blk8');
    const box = ensureResultBox(anchor, 'example', 'hash8', 'unreviewed');
    updateResultBox(box, '<img src=x onerror=alert(1)>');
    expect(box.querySelector('.body img')).toBeNull();
    expect(box.querySelector('.body').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
