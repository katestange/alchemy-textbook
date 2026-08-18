import { describe, it, expect } from 'vitest';
import { createEnigma, parsePlugboard } from '../src/lib/demos/enigma.js';

describe('createEnigma', () => {
  it('matches the published vector: I-II-III, B, AAA/AAA, no plugs, AAAAA -> BDZGO', () => {
    const m = createEnigma();
    expect(m.encode('AAAAA')).toBe('BDZGO');
  });

  it('matches the ring-setting vector: rings BBB, AAAAA -> EWTYX', () => {
    const m = createEnigma({ rings: 'BBB' });
    expect(m.encode('AAAAA')).toBe('EWTYX');
  });

  it('is self-reciprocal (enigma symmetry): decrypting is re-encrypting', () => {
    const config = { rotors: ['II', 'V', 'III'], positions: 'KES', rings: 'BQL', plugboard: 'AT BS DE FG HZ' };
    const m = createEnigma(config);
    const cipher = m.encode('WEATHERREPORTFROMSTATIONNINE');
    m.reset();
    expect(m.encode(cipher)).toBe('WEATHERREPORTFROMSTATIONNINE');
  });

  it('never encrypts a letter to itself', () => {
    const m = createEnigma({ rotors: ['IV', 'I', 'V'], positions: 'QWE', plugboard: 'AB CD' });
    for (let i = 0; i < 200; i++) {
      const letter = String.fromCharCode(65 + (i % 26));
      expect(m.press(letter)).not.toBe(letter);
    }
  });

  it('steps like an odometer, with the double-step anomaly', () => {
    // Rotor III (right) has its notch at V: moving V -> W turns the middle rotor.
    const m = createEnigma({ positions: 'AAU' });
    m.press('X');
    expect(m.positions).toBe('AAV');
    m.press('X');
    expect(m.positions).toBe('ABW');
    // Double step: middle rotor at its own notch (II notches at E) advances
    // itself and the left rotor on the next press.
    const d = createEnigma({ positions: 'ADV' });
    d.press('X');
    expect(d.positions).toBe('AEW'); // right passed its notch, middle steps to its notch
    d.press('X');
    expect(d.positions).toBe('BFX'); // middle at notch: middle AND left step together
  });

  it('reset returns to the configured start positions', () => {
    const m = createEnigma({ positions: 'KAT' });
    m.encode('SOMETEXT');
    expect(m.positions).not.toBe('KAT');
    m.reset();
    expect(m.positions).toBe('KAT');
  });

  it('drops non-letters and lowercases input', () => {
    const m = createEnigma();
    const a = m.encode('aa aaa!');
    expect(a).toBe('BDZGO');
  });
});

describe('parsePlugboard', () => {
  it('builds an involution from lettered pairs', () => {
    const p = parsePlugboard('AB cd');
    expect(p.A).toBe('B');
    expect(p.B).toBe('A');
    expect(p.C).toBe('D');
  });

  it('rejects self-plugs, reused letters, and odd leftovers', () => {
    expect(() => parsePlugboard('AA')).toThrow();
    expect(() => parsePlugboard('AB AC')).toThrow();
    expect(() => parsePlugboard('AB C')).toThrow();
  });

  it('treats empty input as no leads', () => {
    expect(parsePlugboard('')).toEqual({});
  });
});
