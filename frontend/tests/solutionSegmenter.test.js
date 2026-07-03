import { describe, it, expect } from 'vitest';
import { segmentSolutions } from '../src/lib/solutionSegmenter.js';

describe('segmentSolutions', () => {
  it('returns a single text segment when there are no markers', () => {
    expect(segmentSolutions('just plain text')).toEqual([{ type: 'text', value: 'just plain text' }]);
  });

  it('segments a complete solution block with surrounding text', () => {
    expect(segmentSolutions('Try it. [[solution]]x = 2[[/solution]] Nice work.')).toEqual([
      { type: 'text', value: 'Try it. ' },
      { type: 'solution', value: 'x = 2', closed: true },
      { type: 'text', value: ' Nice work.' }
    ]);
  });

  it('strips the markers themselves from the segmented value', () => {
    const segs = segmentSolutions('[[solution]]answer[[/solution]]');
    expect(segs).toEqual([{ type: 'solution', value: 'answer', closed: true }]);
  });

  it('treats an unclosed trailing opener as an open, not-yet-closed segment', () => {
    // Simulates a delta arriving mid-solution: no "[[/solution]]" yet.
    expect(segmentSolutions('Try it. [[solution]]x = ')).toEqual([
      { type: 'text', value: 'Try it. ' },
      { type: 'solution', value: 'x = ', closed: false }
    ]);
  });

  it('flips an unclosed solution to closed once the closing marker arrives', () => {
    const partial = segmentSolutions('[[solution]]x = ');
    expect(partial).toEqual([{ type: 'solution', value: 'x = ', closed: false }]);

    const complete = segmentSolutions('[[solution]]x = 2[[/solution]]');
    expect(complete).toEqual([{ type: 'solution', value: 'x = 2', closed: true }]);
  });

  it('segments multiple solution blocks in one text', () => {
    expect(
      segmentSolutions('a [[solution]]1[[/solution]] b [[solution]]2[[/solution]] c')
    ).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'solution', value: '1', closed: true },
      { type: 'text', value: ' b ' },
      { type: 'solution', value: '2', closed: true },
      { type: 'text', value: ' c' }
    ]);
  });

  it('preserves math-looking content unchanged inside a solution segment', () => {
    expect(segmentSolutions('[[solution]]$x^2 + 1$[[/solution]]')).toEqual([
      { type: 'solution', value: '$x^2 + 1$', closed: true }
    ]);
  });

  it('returns an empty array for an empty string (matches segmentMathSpans convention)', () => {
    expect(segmentSolutions('')).toEqual([]);
  });

  it('does not treat a lone opener with immediate close as nested/greedy across a later opener', () => {
    // Ends at the FIRST close after its opener -- not nested.
    expect(segmentSolutions('[[solution]]a[[/solution]] and [[solution]]b[[/solution]]')).toEqual([
      { type: 'solution', value: 'a', closed: true },
      { type: 'text', value: ' and ' },
      { type: 'solution', value: 'b', closed: true }
    ]);
  });
});
