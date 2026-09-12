import { describe, it, expect } from 'vitest';
import { groupPictureRows, rowScale, labelFontPx, fitFigures, fitFigureLabels, MAX_SCALE } from '../src/lib/figureFit.js';

const pic = (id, w, h) => `<svg id="${id}" class="ltx_picture" width="${w}" height="${h}"><g><foreignObject width="6" height="8"><div class="fig-label">g</div></foreignObject></g></svg>`;

describe('figureFit', () => {
  it('groups side-by-side pictures into rows split by <br>', () => {
    document.body.innerHTML = `<div class="ltx_para ltx_align_center">${pic('a', 100, 50)}${pic('b', 200, 50)}<br><br>${pic('c', 100, 50)}</div><div>${pic('d', 300, 50)}</div>`;
    const rows = groupPictureRows(document.body).map((r) => r.map((s) => s.id));
    expect(rows).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('scales a row up to the cap, but only as far as the column allows, never below 1', () => {
    expect(rowScale([100], 0, 1000)).toBe(MAX_SCALE);
    expect(rowScale([300, 300], 40, 640)).toBe(1);
    expect(rowScale([300, 300], 40, 940)).toBeCloseTo(1.5);
    expect(rowScale([300, 300], 0, 100)).toBe(1);
    expect(rowScale([], 0, 900)).toBe(1);
  });

  it('shrinks labels towards body size as the picture grows, within bounds', () => {
    expect(labelFontPx(1, 18.4)).toBe(16);
    expect(labelFontPx(1.6, 18.4)).toBeCloseTo(11.5);
    expect(labelFontPx(4, 18.4)).toBe(11);
  });

  it('sets a viewBox and remembers natural sizes so refitting is stable', () => {
    document.body.innerHTML = `<div>${pic('a', 100, 50)}</div>`;
    const svg = document.getElementById('a');
    fitFigures(document.body, 18.4);
    fitFigures(document.body, 18.4);
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg.dataset.naturalWidth).toBe('100');
    // jsdom has no layout (available width 0) so the scale floors at 1.
    expect(svg.style.width).toBe('100px');
    expect(svg.style.getPropertyValue('--fig-font')).toBe('16px');
  });

  it('never shrinks a label box below LaTeXML\'s own size', () => {
    document.body.innerHTML = `<div>${pic('a', 100, 50)}</div>`;
    const fo = document.querySelector('foreignObject');
    fitFigureLabels(document.body); // offsetWidth is 0 in jsdom
    expect(fo.getAttribute('width')).toBe('6');
    expect(fo.getAttribute('height')).toBe('8');
    expect(fo.getAttribute('x')).toBe('0');
  });
});
