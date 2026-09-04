// The math behind the Big-Oh Explorer. The expectations mirror the worked
// examples and exercises in the Big-Oh section of the book, so the tool and
// the text can never disagree about which way the comparisons go.
import { describe, it, expect } from 'vitest';
import { parseExpression, checkBound, findConstants, fmt, niceCeil } from '../src/lib/demos/bigoh.js';

const fn = (s) => {
  const r = parseExpression(s);
  if (r.error) throw new Error(`${s}: ${r.error}`);
  return r.fn;
};

describe('parseExpression', () => {
  it('handles calculator syntax with implicit multiplication', () => {
    expect(fn('100x^2')(3)).toBe(900);
    expect(fn('2 x')(4)).toBe(8);
    expect(fn('x^2 + 3')(2)).toBe(7);
    expect(fn('1/2')(99)).toBe(0.5);
    expect(fn('2^x')(10)).toBe(1024);
    expect(fn('2^-x')(2)).toBe(0.25);
    expect(fn('-x^2')(3)).toBe(-9);            // unary minus binds looser than ^
    expect(fn('x^2^3')(2)).toBe(256);          // right-associative
  });
  it('knows the usual functions and constants', () => {
    expect(fn('500 log(x)')(Math.E)).toBeCloseTo(500);
    expect(fn('log x')(Math.E)).toBeCloseTo(1);
    expect(fn('|sin(x)|')(-Math.PI / 2)).toBeCloseTo(1);
    expect(fn('abs(cos x)')(Math.PI)).toBeCloseTo(1);
    expect(fn('sqrt(x)')(16)).toBe(4);
    expect(fn('e^x')(1)).toBeCloseTo(Math.E);
    expect(fn('pi x')(2)).toBeCloseTo(2 * Math.PI);
    expect(fn('sin x^2')(2)).toBeCloseTo(Math.sin(4));
    expect(fn('x sin x')(2)).toBeCloseTo(2 * Math.sin(2));
  });
  it('splits run-together names', () => {
    expect(fn('xlogx')(Math.E)).toBeCloseTo(Math.E);
    expect(fn('2xsinx')(2)).toBeCloseTo(4 * Math.sin(2));
  });
  it('reports errors instead of throwing', () => {
    expect(parseExpression('foo(x)').error).toMatch(/Unknown name/);
    expect(parseExpression('x +').error).toMatch(/end of expression/);
    expect(parseExpression('(x').error).toMatch(/Missing/);
    expect(parseExpression('|x').error).toMatch(/Missing/);
    expect(parseExpression('').error).toBeTruthy();
    expect(parseExpression('x $ 2').error).toMatch(/Unexpected character/);
  });
});

describe('checkBound on the figure: f = 100x^2, g = x^3', () => {
  const f = fn('100x^2'), g = fn('x^3');
  it('accepts the book’s C = 1, M = 100', () => {
    expect(checkBound(f, g, 1, 100, 150).ok).toBe(true);
  });
  it('rejects M just short of the crossover, with a witness', () => {
    const r = checkBound(f, g, 1, 99, 150);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('violation');
    expect(r.x).toBeGreaterThan(99);
    expect(r.x).toBeLessThan(100);
  });
  it('accepts a bigger C with a smaller M', () => {
    expect(checkBound(f, g, 2, 50, 150).ok).toBe(true);
    expect(checkBound(f, g, 0.5, 100, 150).ok).toBe(false);
  });
  it('rejects the reverse claim as growing without bound', () => {
    const r = checkBound(g, f, 1e6, 1, 150);
    expect(r.ok).toBe(false);
    expect(['violation', 'growing']).toContain(r.kind);
  });
});

describe('checkBound edge cases', () => {
  it('requires the bounding function to be positive', () => {
    const r = checkBound(fn('x'), fn('x sin x'), 1e9, 1, 50);   // C huge: only the sign can fail
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('nonpositive');
    expect(r.x).toBeGreaterThan(Math.PI);
    expect(r.x).toBeLessThan(2 * Math.PI);
  });
  it('finds violations between samples near zeros of g', () => {
    // |sin| vs |cos|: any C fails just beside each zero of cos.
    expect(checkBound(fn('|sin x|'), fn('|cos x|'), 100, 1, 20).kind).toBe('violation');
    expect(checkBound(fn('|sin x|'), fn('|cos x|'), 1e4, 1, 20).kind).toBe('violation');
  });
  it('is not fooled by a huge C when the ratio keeps growing', () => {
    // x vs 500 log x: the ratio x / (500 log x) climbs forever.
    const r = checkBound(fn('x'), fn('500 log x'), 1e6, 1, 50);
    expect(r.ok).toBe(false);
    const r2 = checkBound(fn('x log x'), fn('x'), 100, 1, 50);
    expect(r2.ok).toBe(false);
    expect(r2.kind).toBe('growing');
  });
  it('tolerates equality (300x^2 <= 300 x^2) despite rounding', () => {
    expect(checkBound(fn('300x^2'), fn('x^2'), 300, 1, 10).ok).toBe(true);
  });
  it('flags functions undefined inside the window', () => {
    expect(checkBound(fn('1/(x-5)'), fn('x'), 1, 1, 10).kind).toBe('invalid');
  });
});

describe('findConstants matches the book', () => {
  const both = (fs, gs, xmax) => [findConstants(fn(fs), fn(gs), xmax), findConstants(fn(gs), fn(fs), xmax)];

  it('100x^2 = O(x^3) with the book’s constants, and not the reverse', () => {
    const [fg, gf] = both('100x^2', 'x^3', 150);
    expect(fg.found).toBe(true);
    expect(fg.C).toBe(1);
    expect(fg.M).toBe(100);
    expect(gf.found).toBe(false);
    expect(gf.kind).toBe('growing');
  });
  it('x^2 + 3 = O(x^2) and vice versa', () => {
    const [fg, gf] = both('x^2 + 3', 'x^2', 10);
    expect(fg.found).toBe(true);
    expect(gf.found).toBe(true);
    expect(gf.C).toBe(1);
  });
  it('300x^2 = O(x^2) and vice versa', () => {
    const [fg, gf] = both('300x^2', 'x^2', 10);
    expect(fg.found).toBe(true);
    expect(fg.C).toBeGreaterThanOrEqual(300);
    expect(fg.C).toBeLessThanOrEqual(310);
    expect(gf.found).toBe(true);
  });
  it('x^2 = O(x^3) but not the reverse', () => {
    const [fg, gf] = both('x^2', 'x^3', 5);
    expect(fg.found).toBe(true);
    expect(fg.C).toBe(1);
    expect(fg.M).toBe(1);
    expect(gf.found).toBe(false);
  });
  it('500 log x = O(x) but not the reverse', () => {
    const [fg, gf] = both('500 log(x)', 'x', 50);
    expect(fg.found).toBe(true);
    expect(fg.peak.ratio).toBeCloseTo(500 / Math.E, 0);
    expect(gf.found).toBe(false);
    expect(gf.kind).toBe('growing');
  });
  it('|sin x| and |cos x|: neither', () => {
    const [fg, gf] = both('|sin(x)|', '|cos(x)|', 20);
    expect(fg.found).toBe(false);
    expect(gf.found).toBe(false);
  });
  it('|sin x| = O(1/2) with C = 2, but 1/2 ≠ O(|sin x|)', () => {
    const [fg, gf] = both('|sin(x)|', '1/2', 20);
    expect(fg.found).toBe(true);
    expect(fg.C).toBe(2);
    expect(gf.found).toBe(false);
  });
  it('2^x = O(3^x) but not the reverse', () => {
    const [fg, gf] = both('2^x', '3^x', 10);
    expect(fg.found).toBe(true);
    expect(fg.C).toBe(1);
    expect(gf.found).toBe(false);
    expect(gf.kind).toBe('growing');
  });
  it('returned constants pass checkBound', () => {
    for (const [fs, gs, xmax] of [['100x^2', 'x^3', 150], ['x^2 + 3', 'x^2', 10], ['500 log(x)', 'x', 50], ['x sin x', 'x', 50]]) {
      const r = findConstants(fn(fs), fn(gs), xmax);
      expect(r.found).toBe(true);
      expect(checkBound(fn(fs), fn(gs), r.C, r.M, xmax).ok).toBe(true);
    }
  });
  it('is quick enough to run on every drag', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) checkBound(fn('100x^2'), fn('x^3'), 1, 20 + i, 150);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('formatting', () => {
  it('fmt is compact', () => {
    expect(fmt(100)).toBe('100');
    expect(fmt(0.5)).toBe('0.5');
    expect(fmt(1e30)).toBe('10³⁰');
    expect(fmt(3.4e6)).toBe('3.4×10⁶');
    expect(fmt(9.9999e27)).toBe('10²⁸');
    expect(fmt(-2.5)).toBe('−2.5');
    expect(fmt(Infinity)).toBe('∞');
  });
  it('niceCeil rounds up to two significant digits', () => {
    expect(niceCeil(1234)).toBe(1300);
    expect(niceCeil(306)).toBe(310);
    expect(niceCeil(2.04)).toBe(2.1);
    expect(niceCeil(100)).toBe(100);
  });
});
