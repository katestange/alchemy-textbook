// The arithmetic behind the Primitive Root Clock.  Expectations mirror the
// examples in the multiplicative-dynamics and Diffie-Hellman sections (the
// unit-group portraits mod 7, 9, 10; the p = 23, g = 5 clock figure).
import { describe, it, expect } from 'vitest';
import {
  isPrime, nextPrime, prevPrime, modPow, gcd, powerCycle, multiplicativeOrder,
  isPrimitiveRoot, primitiveRoots, nextPrimitiveRoot, prevPrimitiveRoot, MAX_P
} from '../src/lib/demos/powerclock.js';

describe('primes', () => {
  it('recognises primes and non-primes', () => {
    expect([2, 3, 5, 7, 11, 13, 23, 97, 499].every(isPrime)).toBe(true);
    expect([0, 1, 4, 9, 15, 21, 25, 91, 1.5, -7, NaN].some(isPrime)).toBe(false);
  });
  it('steps to neighbouring primes', () => {
    expect(nextPrime(23)).toBe(29);
    expect(nextPrime(24)).toBe(29);
    expect(nextPrime(1)).toBe(2);
    expect(prevPrime(29)).toBe(23);
    expect(prevPrime(3)).toBe(2);
    expect(prevPrime(2)).toBe(null);
    expect(nextPrime(MAX_P, MAX_P)).toBe(null);
    expect(isPrime(MAX_P)).toBe(true);   // the cap itself is drawable
  });
});

describe('modular arithmetic', () => {
  it('modPow agrees with repeated multiplication', () => {
    expect(modPow(5, 0, 23)).toBe(1);
    expect(modPow(5, 1, 23)).toBe(5);
    expect(modPow(5, 22, 23)).toBe(1);        // Fermat
    expect(modPow(3, 32, 100)).toBe(3 ** 32 % 100);  // exact: 3^32 < 2^53
    expect(modPow(13, 9, 100)).toBe(73);      // worked example in the book
    expect(modPow(-1, 3, 7)).toBe(6);
  });
  it('gcd', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(7, 0)).toBe(7);
    expect(gcd(-4, 6)).toBe(2);
  });
});

describe('cycles of powers', () => {
  it('reproduces the p = 23, g = 5 clock figure from the text', () => {
    expect(powerCycle(5, 23)).toEqual(
      [1, 5, 2, 10, 4, 20, 8, 17, 16, 11, 9, 22, 18, 21, 13, 19, 3, 15, 6, 7, 12, 14]);
  });
  it('matches the unit-group portraits in the multiplicative dynamics section', () => {
    expect(powerCycle(3, 10)).toEqual([1, 3, 9, 7]);        // x -> 3x on (Z/10Z)*
    expect(powerCycle(2, 9)).toEqual([1, 2, 4, 8, 7, 5]);   // x -> 2x on (Z/9Z)*
    expect(multiplicativeOrder(3, 8)).toBe(2);              // x -> 3x on (Z/8Z)*: 2-cycles
    expect(multiplicativeOrder(2, 7)).toBe(3);              // x 2 mod 7: two 3-cycles
    expect(multiplicativeOrder(1, 7)).toBe(1);
  });
  it('is empty when g is not a unit', () => {
    expect(powerCycle(0, 7)).toEqual([]);
    expect(powerCycle(6, 9)).toEqual([]);
    expect(multiplicativeOrder(0, 7)).toBe(null);
  });
  it('order divides p - 1 (Fermat) for every g mod 23', () => {
    for (let g = 1; g < 23; g++) expect(22 % multiplicativeOrder(g, 23)).toBe(0);
  });
});

describe('primitive roots', () => {
  it('lists them for the small primes used in the text', () => {
    expect(primitiveRoots(7)).toEqual([3, 5]);
    expect(primitiveRoots(23)).toEqual([5, 7, 10, 11, 14, 15, 17, 19, 20, 21]);
    expect(primitiveRoots(2)).toEqual([1]);
    expect(primitiveRoots(15)).toEqual([]);   // not prime: the tool refuses
  });
  it('there are phi(p - 1) of them', () => {
    const phi = (n) => { let c = 0; for (let k = 1; k <= n; k++) if (gcd(k, n) === 1) c++; return c; };
    for (const p of [5, 11, 13, 17, 19, 29, 31, 97, 101]) expect(primitiveRoots(p).length).toBe(phi(p - 1));
  });
  it('steps to neighbouring primitive roots', () => {
    expect(isPrimitiveRoot(5, 23)).toBe(true);
    expect(isPrimitiveRoot(4, 23)).toBe(false);    // order 11
    expect(isPrimitiveRoot(0, 23)).toBe(false);
    expect(nextPrimitiveRoot(5, 23)).toBe(7);
    expect(prevPrimitiveRoot(5, 23)).toBe(null);
    expect(nextPrimitiveRoot(21, 23)).toBe(null);
    expect(prevPrimitiveRoot(7, 23)).toBe(5);
  });
});
