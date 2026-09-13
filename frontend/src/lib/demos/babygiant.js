// The arithmetic behind the Baby-Step Giant-Step clock (section on the
// discrete logarithm problem).  Solves g^x = h (mod p) exactly as the text
// describes it: N = ceil(sqrt(p - 1)); the baby steps are g^j for
// j = 0 .. N-1; the giant steps are h * g^(-kN) for k = 0, 1, 2, ..., and the
// first giant step that equals a baby step gives x = j + kN.  Small-integer
// exact arithmetic (p is capped by the clock), so plain Numbers are safe.
import { modPow, gcd } from './powerclock.js';

// Inverse of a modulo m by the extended Euclidean algorithm (null if none).
export function modInverse(a, m) {
  let [r0, r1] = [((a % m) + m) % m, m];
  let [s0, s1] = [1, 0];
  while (r1) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1) return null;
  return ((s0 % m) + m) % m;
}

export function babyGiantN(p) { return Math.ceil(Math.sqrt(p - 1)); }

// Run the algorithm and record everything it computes, in order.
//   baby   : [{ j, r }]  the N baby steps r = g^j
//   giant  : [{ k, r }]  the giant steps r = h g^(-kN), stopping at the first
//                        collision (or after N of them if there is none)
//   collision : { j, k, x } with x = j + kN, or null when h is not a power of g
// Requires gcd(g, p) = 1 and 1 <= h < p.
export function babyGiantTrace(g, h, p) {
  const N = babyGiantN(p);
  const g0 = ((g % p) + p) % p;
  const h0 = ((h % p) + p) % p;
  if (gcd(g0, p) !== 1 || h0 === 0) return { N, gInvN: null, baby: [], giant: [], collision: null };

  const baby = [];
  const babyIndex = new Map();         // residue -> smallest j with g^j = residue
  let r = 1;
  for (let j = 0; j < N; j++) {
    baby.push({ j, r });
    if (!babyIndex.has(r)) babyIndex.set(r, j);
    r = (r * g0) % p;
  }

  const gInvN = modInverse(modPow(g0, N, p), p);
  const giant = [];
  let collision = null;
  let v = h0;
  for (let k = 0; k < N; k++) {
    giant.push({ k, r: v });
    if (babyIndex.has(v)) { const j = babyIndex.get(v); collision = { j, k, x: j + k * N }; break; }
    v = (v * gInvN) % p;
  }
  return { N, gInvN, baby, giant, collision };
}
