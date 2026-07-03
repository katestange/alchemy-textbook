import { describe, it, expect } from 'vitest';
import { segmentMathSpans } from '../src/lib/mathSegmenter.js';

describe('segmentMathSpans', () => {
  it('returns a single text segment when there is no math', () => {
    expect(segmentMathSpans('just plain text')).toEqual([
      { type: 'text', value: 'just plain text' }
    ]);
  });

  it('segments closed inline math with surrounding text', () => {
    expect(segmentMathSpans('before $x^2$ after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'math', value: 'x^2', display: false },
      { type: 'text', value: ' after' }
    ]);
  });

  it('segments closed display math', () => {
    expect(segmentMathSpans('start $$a=b$$ end')).toEqual([
      { type: 'text', value: 'start ' },
      { type: 'math', value: 'a=b', display: true },
      { type: 'text', value: ' end' }
    ]);
  });

  it('treats an unclosed trailing inline span as plain text (no flash)', () => {
    // Simulates a delta arriving mid-formula: "$x^2" has no closing "$" yet.
    expect(segmentMathSpans('here is $x^2')).toEqual([
      { type: 'text', value: 'here is $x^2' }
    ]);
  });

  it('treats an unclosed trailing display span as plain text', () => {
    expect(segmentMathSpans('here is $$x^2')).toEqual([
      { type: 'text', value: 'here is $$x^2' }
    ]);
  });

  it('flips an unclosed span to math once the closing delimiter arrives', () => {
    const partial = segmentMathSpans('here is $x^2');
    expect(partial).toEqual([{ type: 'text', value: 'here is $x^2' }]);

    const complete = segmentMathSpans('here is $x^2$ done');
    expect(complete).toEqual([
      { type: 'text', value: 'here is ' },
      { type: 'math', value: 'x^2', display: false },
      { type: 'text', value: ' done' }
    ]);
  });

  it('treats an escaped dollar sign as a literal character, not a delimiter', () => {
    expect(segmentMathSpans('that costs \\$5 today')).toEqual([
      { type: 'text', value: 'that costs $5 today' }
    ]);
  });

  it('handles multiple math spans in one string', () => {
    expect(segmentMathSpans('$a$ and $b$')).toEqual([
      { type: 'math', value: 'a', display: false },
      { type: 'text', value: ' and ' },
      { type: 'math', value: 'b', display: false }
    ]);
  });

  it('handles a display span followed by an unclosed inline span', () => {
    expect(segmentMathSpans('$$a=b$$ and then $c')).toEqual([
      { type: 'math', value: 'a=b', display: true },
      { type: 'text', value: ' and then $c' }
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(segmentMathSpans('')).toEqual([]);
  });
});
