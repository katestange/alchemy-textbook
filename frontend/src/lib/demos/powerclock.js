// The arithmetic behind the Primitive Root Clock (Diffie-Hellman section):
// primes, multiplicative orders, primitive roots, and the cycle of powers
// 1, g, g^2, ... modulo a prime p.  Everything here is small-integer exact
// arithmetic (p is capped so the clock stays legible), so plain Numbers are
// safe: products stay far below 2^53.

export const MAX_P = 499;     // largest prime the clock will draw
export const MIN_P = 3;

export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

// Smallest prime strictly greater than n (null past MAX_P when capped).
export function nextPrime(n, cap = Infinity) {
  let m = Math.max(Math.floor(n) + 1, 2);
  while (m <= cap) { if (isPrime(m)) return m; m++; }
  return null;
}

// Largest prime strictly less than n (null if none >= floor).
export function prevPrime(n, floor = 2) {
  let m = Math.ceil(n) - 1;
  while (m >= floor) { if (isPrime(m)) return m; m--; }
  return null;
}

export function modPow(base, exp, mod) {
  let result = 1;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return result;
}

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// The cycle of powers 1, g, g^2, ..., g^(k-1) modulo p, where k is the
// multiplicative order of g (the first return to 1).  Requires gcd(g, p) = 1.
export function powerCycle(g, p) {
  const g0 = ((g % p) + p) % p;
  if (gcd(g0, p) !== 1) return [];
  const cycle = [1];
  let v = g0 % p;
  while (v !== 1) { cycle.push(v); v = (v * g0) % p; }
  return cycle;
}

export function multiplicativeOrder(g, p) {
  const c = powerCycle(g, p);
  return c.length || null;
}

export function isPrimitiveRoot(g, p) {
  if (!isPrime(p)) return false;
  const g0 = ((g % p) + p) % p;
  if (g0 === 0) return false;
  return multiplicativeOrder(g0, p) === p - 1;
}

export function primitiveRoots(p) {
  if (!isPrime(p)) return [];
  const roots = [];
  for (let g = 1; g < p; g++) if (isPrimitiveRoot(g, p)) roots.push(g);
  return roots;
}

// Neighbouring primitive roots, for the ◂ ▸ buttons.
export function nextPrimitiveRoot(g, p) {
  for (let h = g + 1; h < p; h++) if (isPrimitiveRoot(h, p)) return h;
  return null;
}
export function prevPrimitiveRoot(g, p) {
  for (let h = g - 1; h >= 1; h--) if (isPrimitiveRoot(h, p)) return h;
  return null;
}
