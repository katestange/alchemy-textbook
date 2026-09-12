import { describe, it, expect } from 'vitest';
import { wireChapterToc, collectChapterOutline } from '../src/lib/chapterToc.js';

const CHAPTER = `
<section class="ltx_section">
<h1 class="ltx_title ltx_title_section"><span class="ltx_tag ltx_tag_section">2 </span>Modular arithmetic</h1>
<div id="S2.p1" class="ltx_para"><p class="ltx_p">Intro paragraph.</p></div>
<section id="S2.SS1" class="ltx_subsection">
<h2 class="ltx_title ltx_title_subsection"><span class="ltx_tag ltx_tag_subsection">2.1 </span>Modular arithmetic</h2>
<section id="S2.SS1.SSS1" class="ltx_subsubsection">
<h3 class="ltx_title ltx_title_subsubsection"><span class="ltx_tag ltx_tag_subsubsection">2.1.1 </span>The ring <math id="S2.SS1.SSS1.m1"><mi>ℤ</mi></math></h3>
</section>
<section id="S2.SS1.SSS2" class="ltx_subsubsection">
<h3 class="ltx_title ltx_title_subsubsection"><span class="ltx_tag ltx_tag_subsubsection">2.1.2 </span>Inverses</h3>
</section>
</section>
<section class="ltx_subsection">
<h2 class="ltx_title ltx_title_subsection">Exercises</h2>
</section>
</section>`;

function setup(html) {
  document.body.innerHTML = `<div id="c">${html}</div>`;
  return document.getElementById('c');
}

describe('chapterToc', () => {
  it('lists sections with nested subsections, linking to their ids', () => {
    const c = setup(CHAPTER);
    const nav = wireChapterToc(c);
    expect(nav).not.toBeNull();
    // Sits directly under the chapter title, before the intro paragraph.
    expect(c.querySelector('h1').nextElementSibling).toBe(nav);
    const top = nav.querySelectorAll(':scope > details > ol > li');
    expect(top.length).toBe(2);
    const links = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links.slice(0, 3)).toEqual(['#S2.SS1', '#S2.SS1.SSS1', '#S2.SS1.SSS2']);
    expect(nav.querySelector('a[href="#S2.SS1"] .chapter-toc-num').textContent).toBe('2.1');
    expect(nav.querySelector('a[href="#S2.SS1"] .chapter-toc-text').textContent).toBe('Modular arithmetic');
  });

  it('keeps math in titles but strips duplicated ids', () => {
    const c = setup(CHAPTER);
    const nav = wireChapterToc(c);
    const entry = nav.querySelector('a[href="#S2.SS1.SSS1"]');
    expect(entry.querySelector('math')).not.toBeNull();
    expect(entry.querySelector('[id]')).toBeNull();
    expect(document.querySelectorAll('#S2\\.SS1\\.SSS1\\.m1').length).toBe(1);
  });

  it('gives an unnumbered, id-less section a link target', () => {
    const c = setup(CHAPTER);
    const nav = wireChapterToc(c);
    const a = nav.querySelectorAll(':scope > details > ol > li > a')[1];
    expect(a.querySelector('.chapter-toc-num')).toBeNull();
    expect(a.textContent).toBe('Exercises');
    const target = a.getAttribute('href').slice(1);
    expect(document.getElementById(target).classList.contains('ltx_subsection')).toBe(true);
  });

  it('is idempotent and omits itself for chapters without sections', () => {
    const c = setup(CHAPTER);
    wireChapterToc(c);
    wireChapterToc(c);
    expect(c.querySelectorAll('.chapter-toc').length).toBe(1);
    const empty = setup('<section class="ltx_section"><h1 class="ltx_title ltx_title_section">9 Notes</h1><p>x</p></section>');
    expect(wireChapterToc(empty)).toBeNull();
    expect(empty.querySelector('.chapter-toc')).toBeNull();
    expect(collectChapterOutline(empty)).toEqual([]);
  });
});
