// The pure cipher functions behind the bespoke demos. These also back the
// worked examples printed in Chapter 1, so the expectations below double as a
// guard that the book and the tools can never drift apart.
import { describe, it, expect } from 'vitest';
import {
  caesarShift, vigenereEncode, vigenereDecode,
  scytaleEncode, scytaleDecode, columnarEncode, parseColumnOrder,
  adfgvxEncode, adfgvxDecode, adfgvxSubstitute,
  polybiusEncode, polybiusDecode, otpEncode, otpDecode
} from '../src/lib/demos/ciphers.js';

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
