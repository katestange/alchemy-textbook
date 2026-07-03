import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders plain text with no markdown unchanged (line breaks only)', () => {
    expect(renderMarkdown('just plain text')).toBe('just plain text');
  });

  it('renders **bold**', () => {
    expect(renderMarkdown('this is **important** stuff')).toBe('this is <strong>important</strong> stuff');
  });

  it('renders *italic*', () => {
    expect(renderMarkdown('this is *subtle* stuff')).toBe('this is <em>subtle</em> stuff');
  });

  it('renders bold and italic together without cross-matching', () => {
    expect(renderMarkdown('**bold** and *italic*')).toBe('<strong>bold</strong> and <em>italic</em>');
  });

  it('renders a simple "- " list as <ul><li>', () => {
    expect(renderMarkdown('- one\n- two\n- three')).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
  });

  it('applies inline bold/italic inside list items', () => {
    expect(renderMarkdown('- **a**\n- *b*')).toBe('<ul><li><strong>a</strong></li><li><em>b</em></li></ul>');
  });

  it('demotes a heading line to a bold paragraph, never an <h*> tag', () => {
    const out = renderMarkdown('# Big Heading');
    expect(out).toBe('<p><strong>Big Heading</strong></p>');
    expect(out).not.toMatch(/<h[1-6]/);
  });

  it('demotes headings of any level 1-6', () => {
    for (const hashes of ['#', '##', '###', '####', '#####', '######']) {
      const out = renderMarkdown(`${hashes} Title`);
      expect(out).toBe('<p><strong>Title</strong></p>');
    }
  });

  it('mixes headings, lists, and plain lines in one block', () => {
    const out = renderMarkdown('# Title\nsome text\n- a\n- b\nmore text');
    expect(out).toBe(
      '<p><strong>Title</strong></p>' + 'some text' + '<ul><li>a</li><li>b</li></ul>' + 'more text'
    );
  });

  it('joins consecutive plain lines with <br>', () => {
    expect(renderMarkdown('line one\nline two')).toBe('line one<br>line two');
  });

  it('does not require its input to be re-escaped (assumes it already is)', () => {
    // Simulates already-HTML-escaped input containing a literal "&lt;" --
    // renderMarkdown must not try to interpret or unescape it.
    expect(renderMarkdown('a &lt;tag&gt; stays literal')).toBe('a &lt;tag&gt; stays literal');
  });
});
