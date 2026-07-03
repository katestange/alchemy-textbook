import { describe, it, expect } from 'vitest';
import { renderStreamedMath, escapeHtml } from '../src/lib/mathRender.js';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('<script>alert(1)</script> & co')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'
    );
  });
});

describe('renderStreamedMath', () => {
  it('escapes raw model text before any of our tags are added (no live tags survive)', () => {
    const out = renderStreamedMath('<img src=x onerror=alert(1)> and **bold**');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('applies the markdown subset to plain text', () => {
    const out = renderStreamedMath('**bold** and *italic* and\n- a\n- b');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<ul><li>a</li><li>b</li></ul>');
  });

  it('demotes headings to bold paragraphs, never <h*>', () => {
    const out = renderStreamedMath('# Heading\ntext');
    expect(out).not.toMatch(/<h[1-6]/);
    expect(out).toContain('<strong>Heading</strong>');
  });

  it('renders math via Temml and leaves math content untouched by markdown', () => {
    // "*" inside math (e.g. multiplication) must NOT become <em> -- math is
    // segmented out and handed to Temml before markdown ever sees it.
    const out = renderStreamedMath('outside *word* and $2*x$ inline');
    expect(out).toContain('<em>word</em>');
    expect(out).not.toContain('<em>x</em>');
    expect(out).toContain('<math'); // Temml MathML output
  });

  it('renders content with no [[solution]] markers exactly as before (no toggle markup)', () => {
    const out = renderStreamedMath('plain text with $x$ math');
    expect(out).not.toContain('solution-toggle');
  });

  it('renders a closed [[solution]] block as a reveal toggle with hidden content', () => {
    const out = renderStreamedMath('Try it. [[solution]]x = 2[[/solution]] done.');
    expect(out).toContain('solution-toggle-btn');
    expect(out).toContain('Show solution');
    expect(out).toMatch(/<span class="solution-content" hidden>[^<]*x = 2/);
    expect(out).not.toContain('[[solution]]');
    expect(out).not.toContain('[[/solution]]');
  });

  it('shows a placeholder, not the partial answer, for an unclosed solution while streaming', () => {
    const out = renderStreamedMath('Try it. [[solution]]x = ', { streaming: true });
    expect(out).toContain('solution-pending');
    expect(out).toContain('being written');
    expect(out).not.toContain('x = ');
  });

  it('finalizes an unclosed solution into a toggle once streaming is done (stream-end-without-close)', () => {
    const out = renderStreamedMath('Try it. [[solution]]x = 2', { streaming: false });
    expect(out).toContain('solution-toggle-btn');
    expect(out).not.toContain('solution-pending');
    expect(out).toMatch(/<span class="solution-content" hidden>[^<]*x = 2/);
  });

  it('renders math inside a revealed solution normally', () => {
    const out = renderStreamedMath('[[solution]]the answer is $x^2$[[/solution]]');
    expect(out).toContain('<math');
  });
});
