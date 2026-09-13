// The arithmetic behind the Baby-Step Giant-Step clock.  The main expectation
// is the worked example in the text: 2^x = 5 (mod 29), N = 6, collision at
// the baby step j = 4 and giant step k = 3, so x = 22.
import { describe, it, expect } from 'vitest';
import { modInverse, babyGiantN, babyGiantTrace } from '../src/lib/demos/babygiant.js';
import { modPow, isPrime, powerCycle } from '../src/lib/demos/powerclock.js';

describe('modInverse', () => {
  it('inverts units and refuses non-units', () => {
    expect(modInverse(6, 29)).toBe(5);        // 6 * 5 = 30 = 1 (mod 29), as in the text
    expect(modInverse(5, 29)).toBe(6);
    expect(modInverse(1, 7)).toBe(1);
    expect(modInverse(-1, 7)).toBe(6);
    expect(modInverse(3, 9)).toBe(null);
    for (let a = 1; a < 97; a++) expect((a * modInverse(a, 97)) % 97).toBe(1);
  });
});

describe('babyGiantTrace', () => {
  it('reproduces the worked example 2^x = 5 (mod 29)', () => {
    const t = babyGiantTrace(2, 5, 29);
    expect(t.N).toBe(6);
    expect(t.gInvN).toBe(5);
    expect(t.baby.map((b) => b.r)).toEqual([1, 2, 4, 8, 16, 3]);
    expect(t.giant.map((s) => s.r)).toEqual([5, 25, 9, 16]);
    expect(t.collision).toEqual({ j: 4, k: 3, x: 22 });
    expect(modPow(2, 22, 29)).toBe(5);
  });
  it('N is the ceiling of sqrt(p - 1)', () => {
    expect(babyGiantN(29)).toBe(6);
    expect(babyGiantN(5)).toBe(2);
    expect(babyGiantN(101)).toBe(10);
    expect(babyGiantN(499)).toBe(23);
  });
  it('h = 1 collides immediately with the baby step j = 0', () => {
    const t = babyGiantTrace(5, 1, 23);
    expect(t.giant).toEqual([{ k: 0, r: 1 }]);
    expect(t.collision).toEqual({ j: 0, k: 0, x: 0 });
  });
  it('solves every instance for a primitive root, and every reachable one otherwise', () => {
    for (const p of [3, 5, 7, 11, 13, 23, 29, 97, 101, 499]) {
      expect(isPrime(p)).toBe(true);
      for (const g of [2, 3, 5]) {
        if (g >= p) continue;
        const reach = new Set(powerCycle(g, p));
        for (let h = 1; h < p; h++) {
          const t = babyGiantTrace(g, h, p);
          expect(t.baby.length).toBe(t.N);
          expect(t.giant.length).toBeLessThanOrEqual(t.N);
          if (reach.has(h)) {
            expect(t.collision).not.toBe(null);
            expect(modPow(g, t.collision.x, p)).toBe(h);
            expect(t.giant.at(-1).r).toBe(t.baby[t.collision.j].r);
          } else {
            expect(t.collision).toBe(null);
            expect(t.giant.length).toBe(t.N);     // ran the full N giant steps, no luck
          }
        }
      }
    }
  });
  it('is empty when g is not a unit or h is 0', () => {
    expect(babyGiantTrace(0, 3, 7).baby).toEqual([]);
    expect(babyGiantTrace(3, 0, 7).giant).toEqual([]);
  });
});
