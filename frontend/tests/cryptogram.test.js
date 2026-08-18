import { describe, it, expect } from 'vitest';
import { LETTERS, SAYINGS, randomDerangement, encryptSaying, randomPuzzle } from '../src/lib/demos/cryptogram.js';

describe('randomDerangement', () => {
  it('is a bijection on the alphabet with no fixed points', () => {
    for (let trial = 0; trial < 50; trial++) {
      const key = randomDerangement();
      const values = Object.values(key);
      expect(Object.keys(key).sort().join('')).toBe(LETTERS);
      expect([...values].sort().join('')).toBe(LETTERS);
      for (const ch of LETTERS) expect(key[ch]).not.toBe(ch);
    }
  });
});

describe('encryptSaying', () => {
  it('substitutes letters and passes punctuation through', () => {
    const key = {};
    [...LETTERS].forEach((ch, i) => (key[ch] = LETTERS[(i + 1) % 26]));
    expect(encryptSaying('AB, Z!', key)).toBe('BC, A!');
  });
});

describe('randomPuzzle', () => {
  it('produces a cipher that decrypts back to the saying via reverse', () => {
    const p = randomPuzzle();
    const decrypted = [...p.cipher].map((ch) => p.reverse[ch] || ch).join('');
    expect(decrypted).toBe(p.saying.text.toUpperCase());
    expect(SAYINGS).toContain(p.saying);
  });

  it('cipher text differs from the plaintext at every letter', () => {
    const p = randomPuzzle();
    [...p.saying.text.toUpperCase()].forEach((ch, i) => {
      if (/[A-Z]/.test(ch)) expect(p.cipher[i]).not.toBe(ch);
    });
  });
});
