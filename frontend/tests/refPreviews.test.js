import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/api.js', () => ({
  fetchChapterHtml: vi.fn()
}));
import { fetchChapterHtml } from '../src/lib/api.js';
import { wireRefPreviews } from '../src/lib/refPreviews.js';

const THEOREM_HTML = (id, cls, text) =>
  `<div id="${id}" class="ltx_theorem ${cls}"><h6 class="ltx_title">Theorem 1.</h6>` +
  `<div id="${id}.p1" class="ltx_para"><p class="ltx_p">${text}</p></div></div>`;

function setup(bodyHtml, chapter = 2) {
  document.body.innerHTML = `<div id="container">${bodyHtml}</div>`;
  const container = document.getElementById('container');
  wireRefPreviews(container, chapter);
  return container;
}

function hover(link) {
  link.dispatchEvent(new MouseEvent('mouseenter'));
}

describe('refPreviews (hover cards for theorem/definition cross-references)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the statement in a popup on hover of a same-chapter ref, and hides on leave', async () => {
    const container = setup(
      THEOREM_HTML('S2.Thmtheorem1', 'ltx_theorem_definition', 'the statement body') +
        '<p><a class="ltx_ref" href="#S2.Thmtheorem1" title="breadcrumb">Definition 1</a></p>'
    );
    const link = container.querySelector('a.ltx_ref');
    hover(link);
    await vi.advanceTimersByTimeAsync(200);
    const popup = container.querySelector('.ref-preview');
    expect(popup).toBeTruthy();
    expect(popup.hidden).toBe(false);
    expect(popup.textContent).toContain('the statement body');
    // cloned content must not duplicate the live element's ids
    expect(popup.querySelector('[id]')).toBeNull();
    // our card supersedes the native title tooltip
    expect(link.hasAttribute('title')).toBe(false);

    link.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(400);
    expect(popup.hidden).toBe(true);
  });

  it('ignores refs to non-statement targets (figures, sections)', async () => {
    const container = setup(
      '<figure id="S2.F15" class="ltx_figure"><figcaption>cap</figcaption></figure>' +
        '<p><a class="ltx_ref" href="#S2.F15" title="breadcrumb">Figure 15</a></p>'
    );
    const link = container.querySelector('a.ltx_ref');
    hover(link);
    await vi.advanceTimersByTimeAsync(300);
    const popup = container.querySelector('.ref-preview');
    expect(popup === null || popup.hidden).toBe(true);
    // the LaTeXML breadcrumb tooltip stays for plain refs
    expect(link.getAttribute('title')).toBe('breadcrumb');
    // and the miss is remembered so we don't re-resolve every hover
    expect(link.dataset.refPreview).toBe('no');
  });

  it('fetches the other chapter for a cross-chapter ref and caches the document', async () => {
    fetchChapterHtml.mockResolvedValue(
      `<html><body>${THEOREM_HTML('S4.Thmtheorem2', 'ltx_theorem_theorem', 'from chapter four')}</body></html>`
    );
    const container = setup(
      '<p><a class="ltx_ref" href="S4.html#S4.Thmtheorem2">Theorem 4.2</a>' +
        ' and <a class="ltx_ref" href="S4.html#S4.Thmtheorem2">again</a></p>'
    );
    const [link1, link2] = container.querySelectorAll('a.ltx_ref');
    hover(link1);
    await vi.advanceTimersByTimeAsync(300);
    const popup = container.querySelector('.ref-preview');
    expect(popup.hidden).toBe(false);
    expect(popup.textContent).toContain('from chapter four');
    expect(fetchChapterHtml).toHaveBeenCalledWith(4);

    link1.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(400);
    hover(link2);
    await vi.advanceTimersByTimeAsync(300);
    expect(popup.hidden).toBe(false);
    expect(fetchChapterHtml).toHaveBeenCalledTimes(1); // cached
  });

  it('strips footnote popups and injected reader UI from the cloned preview', async () => {
    const container = setup(
      `<div id="S2.Thmtheorem3" class="ltx_theorem ltx_theorem_theorem">` +
        `<div class="ltx_para"><p class="ltx_p">keep this` +
        `<span class="ltx_note"><span class="ltx_note_content">footnote text</span></span></p>` +
        `<div class="ai-item">an AI box</div></div></div>` +
        '<p><a class="ltx_ref" href="#S2.Thmtheorem3">Theorem 3</a></p>'
    );
    hover(container.querySelector('a.ltx_ref'));
    await vi.advanceTimersByTimeAsync(300);
    const popup = container.querySelector('.ref-preview');
    expect(popup.textContent).toContain('keep this');
    expect(popup.textContent).not.toContain('footnote text');
    expect(popup.textContent).not.toContain('an AI box');
  });
});
