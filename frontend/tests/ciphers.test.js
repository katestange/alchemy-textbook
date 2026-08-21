// The pure cipher functions behind the bespoke demos. These also back the
// worked examples printed in Chapter 1, so the expectations below double as a
// guard that the book and the tools can never drift apart.
import { describe, it, expect } from 'vitest';
import {
  caesarShift, vigenereEncode, vigenereDecode,
  scytaleEncode, scytaleDecode, columnarEncode, parseColumnOrder,
  adfgvxEncode, adfgvxDecode, adfgvxSubstitute,
  polybiusEncode, polybiusDecode, otpEncode, otpDecode, xorBits
} from '../src/lib/demos/ciphers.js';

// The permutation printed in Chapter 1 (the input/output table, the arrow
// diagram and the cycle notation are all this one permutation).
const SUB_IN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SUB_OUT = 'MLRBSUAQNKJIEDCTFYGOHWZXPV';
const substitute = (t) => [...t].map((c) => SUB_OUT[SUB_IN.indexOf(c)]).join('');
const unsubstitute = (t) => [...t].map((c) => SUB_IN[SUB_OUT.indexOf(c)]).join('');

describe('parseColumnOrder', () => {
  it('accepts separated keys', () => {
    expect(parseColumnOrder('3 4 2 1')).toEqual([3, 4, 2, 1]);
    expect(parseColumnOrder('1,3,2,4')).toEqual([1, 3, 2, 4]);
  });

  // Regression (author report): "1324" typed without spaces parsed as the
  // single number 1324, so the key was rejected and the ADFGVX tool silently
  // stopped updating its ciphertext.
  it('accepts unseparated digit keys', () => {
    expect(parseColumnOrder('1324')).toEqual([1, 3, 2, 4]);
    expect(parseColumnOrder('3421')).toEqual([3, 4, 2, 1]);
    expect(parseColumnOrder('12')).toEqual([1, 2]);
    expect(parseColumnOrder('1')).toEqual([1]);
  });

  it('rejects non-permutations', () => {
    expect(parseColumnOrder('1 1 2')).toBeNull();
    expect(parseColumnOrder('2 3 4')).toBeNull();
    expect(parseColumnOrder('1124')).toBeNull();
    expect(parseColumnOrder('')).toBeNull();
    expect(parseColumnOrder('abc')).toBeNull();
  });

  it('still reads a ten-column key when it is separated', () => {
    const key = '10 1 2 3 4 5 6 7 8 9';
    expect(parseColumnOrder(key)).toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('the examples printed in the book', () => {
  it('reproduces the figure examples', () => {
    expect(caesarShift('CIPHER', 17)).toBe('TZGYVI');             // fig:cipher-wheel
    expect(columnarEncode('ATTACKATDAWN', 4)).toBe('ACDTKATAWATN'); // fig:transposition-example
    expect(vigenereEncode('ATTACKATDAWN', 'POLLEN')).toBe('PHELGXPHOLAA'); // fig:vig-example
    expect(adfgvxEncode('ATTACKATDAWN', [3, 4, 2, 1]))
      .toBe('GGDGGAXDDXDFDXADFFGGAGXD');                          // fig:adfgvx-example
  });

  it('reproduces the Caesar worked example and exercises', () => {
    expect(caesarShift('LIVELONGANDPROSPER', 7)).toBe('SPCLSVUNHUKWYVZWLY');
    expect(caesarShift('MAXGXXWLHYMAXFTGR', -19)).toBe('THENEEDSOFTHEMANY');
    expect(caesarShift('SETPHASERSTOSTUN', 12)).toBe('EQFBTMEQDEFAEFGZ');
    expect(caesarShift('WTEGIXLIJMREPJVSRXMIV', -4)).toBe('SPACETHEFINALFRONTIER');
  });

  it('reproduces the skytale worked example and exercises', () => {
    expect(scytaleEncode('RESISTANCEISFUTILE', 6)).toBe('RAFENUSCTIEISILTSE');
    expect(scytaleDecode('BPESACMOMTETUY', 7)).toBe('BEAMMEUPSCOTTY');
    expect(scytaleEncode('ENGAGETHEWARPDRIVE', 6)).toBe('ETPNHDGERAWIGAVERE');
    expect(scytaleDecode('TRTEFOIOKISVSTNTEEOD', 4)).toBe('TOSTRIVETOSEEKTOFIND');
  });

  it('reproduces the Vigenère worked example and exercises', () => {
    expect(vigenereEncode('SPACETHEFINALFRONTIER', 'VULCAN')).toBe('NJLEEGCYQKNNGZCQNGDYC');
    expect(vigenereDecode('SSJOTHRTDSZYGIKOMS', 'BORG')).toBe('RESISTANCEISFUTILE');
    expect(vigenereEncode('TOBOLDLYGO', 'KLINGON')).toBe('DZJBRRYIRW');
    expect(vigenereDecode('UJGOVUJGOVCFRXMORBBMHST', 'BLAKE')).toBe('TYGERTYGERBURNINGBRIGHT');
  });

  it('reproduces the ADFGVX worked example and exercises', () => {
    expect(adfgvxSubstitute('WARPCOREBREACH'))
      .toBe('FD DG VX VA AA AD VX XA VG VX XA DG AA GV');
    expect(adfgvxEncode('WARPCOREBREACH', [3, 1, 4, 2]))
      .toBe('DXAXGAAGADAXGVFVAVVXADVAXVDG');
    expect(adfgvxDecode('DGGGVGVGXGXFGDDFDDXFAVAX', [2, 4, 1, 3]).toUpperCase())
      .toBe('RAISESHIELDS');
    expect(adfgvxEncode('REDALERT', [3, 1, 4, 2])).toBe('XXDXAGAGVFVVXDXX');
    expect(adfgvxDecode('GXAXDFDAFADXVVVF', [4, 2, 1, 3]).toUpperCase()).toBe('LIVELONG');
  });
});

describe('the monoalphabetic substitution printed in Chapter 1', () => {
  it('is a bijection whose cycle notation matches its table', () => {
    expect(new Set(SUB_OUT).size).toBe(26);
    for (const cycle of ['CRYPTO', 'GAMES', 'BLIND', 'FUHQ', 'VWZ', 'JK', 'X']) {
      for (let i = 0; i < cycle.length; i++) {
        const from = cycle[i], to = cycle[(i + 1) % cycle.length];
        expect(substitute(from), `cycle ${cycle}: ${from}`).toBe(to);
      }
    }
    expect(substitute('X')).toBe('X'); // the lone fixed point the example notes
  });

  it('reproduces the worked example and exercises', () => {
    expect(substitute('MAKEITSO')).toBe('EMJSNOGC');
    expect(unsubstitute('CTSDMRQMDDSI')).toBe('OPENACHANNEL');
    expect(substitute('THEPRIMEDIRECTIVE')).toBe('OQSTYNESBNYSRONWS');
    expect(unsubstitute('GSOMRCHYGSUCYQCES')).toBe('SETACOURSEFORHOME');
  });
});

describe('the Polybius worked example and exercises', () => {
  it('matches the square printed in the book', () => {
    expect(polybiusEncode('SPOCK LIVES')).toBe('43 35 34 13 25 31 24 51 15 43');
    expect(polybiusEncode('STARFLEET COMMAND'))
      .toBe('43 44 11 42 21 31 15 15 44 13 34 32 32 11 33 14');
    expect(polybiusEncode('CAPTAIN KIRK')).toBe('13 11 35 44 11 24 33 25 24 42 25');
    expect(polybiusDecode('52 11 42 35 21 11 13 44 34 42 33 24 33 15')).toBe('WARPFACTORNINE');
  });

  it('shares one cell between I and J, as the example warns', () => {
    expect(polybiusEncode('I')).toBe('24');
    expect(polybiusEncode('J')).toBe('24');
    expect(polybiusDecode('24')).toBe('I');
  });
});

describe('binary one-time pad (the tool default)', () => {
  it('XORs bit by bit and is its own inverse', () => {
    expect(xorBits('01101001', '11010110')).toBe('10111111');
    expect(xorBits('10111111', '11010110')).toBe('01101001');
    // the chapter's worked examples and exercises
    expect(xorBits('10011100', '11000101')).toBe('01011001');
    expect(xorBits('11100010', '01011011')).toBe('10111001');
    expect(xorBits('00111011', '10110110')).toBe('10001101');
    // and the Concept Check: which pad sends 0100 to 1110?
    expect(xorBits('0100', '1110')).toBe('1010');
    expect(xorBits('0100', '1010')).toBe('1110');
  });

  it('ignores separators and handles empty input', () => {
    expect(xorBits('0110 1001', '11010110')).toBe('10111111');
    expect(xorBits('', '1010')).toBe('');
    expect(xorBits('1010', '')).toBe('');
  });

  it('repeats a short pad, which is the misuse the text warns about', () => {
    expect(xorBits('11110000', '10')).toBe('01011010');
  });
});

describe('round trips', () => {
  const text = 'ATTACKATDAWN';
  it('caesar, vigenère, scytale and OTP invert cleanly', () => {
    expect(caesarShift(caesarShift(text, 9), -9)).toBe(text);
    expect(vigenereDecode(vigenereEncode(text, 'KEY'), 'KEY')).toBe(text);
    expect(scytaleDecode(scytaleEncode(text, 4), 4)).toBe(text);
    expect(otpDecode(otpEncode(text, 'QWERTYUIOPAS'), 'QWERTYUIOPAS')).toBe(text);
  });

  it('adfgvx inverts for every key the tool accepts', () => {
    for (const key of ['3 4 2 1', '1324', '12', '3142']) {
      const order = parseColumnOrder(key);
      expect(order, `key ${key} should parse`).not.toBeNull();
      expect(adfgvxDecode(adfgvxEncode(text, order), order).toUpperCase()).toBe(text);
    }
  });

  it('polybius inverts (J decodes as I)', () => {
    expect(polybiusDecode(polybiusEncode('ATTACK'))).toBe('ATTACK');
    expect(polybiusDecode(polybiusEncode('JAM'))).toBe('IAM');
  });
});
