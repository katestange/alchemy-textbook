// Enigma I (German Army, 3-rotor) simulation: rotors I-V with historical
// wirings and turnover notches, reflector B, ring settings, plugboard, and
// odometer stepping including the middle rotor's double-step anomaly.
// Pure logic, no DOM — the EnigmaTool component drives this, and the test
// suite checks it against published machine vectors.

const A = 'A'.charCodeAt(0);
const mod = (n, m) => ((n % m) + m) % m;
const toNum = (ch) => ch.charCodeAt(0) - A;
const toChar = (n) => String.fromCharCode(A + mod(n, 26));

// Historical wirings: entry contact A..Z -> output letter, plus the window
// letter(s) at which the rotor's turnover notch engages the next rotor.
export const ROTORS = {
  I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
  II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
  IV: { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
  V: { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' }
};

export const REFLECTOR_B = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';

// 'AB CD' -> involution map {A:'B', B:'A', ...}. Throws on malformed input so
// the UI can surface the message. Empty/blank input -> identity (no leads).
export function parsePlugboard(text) {
  const map = {};
  const pairs = (text || '').toUpperCase().match(/[A-Z]{2}/g) || [];
  const leftover = (text || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (leftover.length % 2 !== 0) throw new Error('plugboard letters must come in pairs');
  const used = new Set();
  for (const [x, y] of pairs) {
    if (x === y) throw new Error(`cannot plug ${x} to itself`);
    if (used.has(x) || used.has(y)) throw new Error(`letter ${used.has(x) ? x : y} used twice`);
    used.add(x); used.add(y);
    map[x] = y; map[y] = x;
  }
  return map;
}

export function createEnigma({
  rotors = ['I', 'II', 'III'], // left to right, as seen by the operator
  positions = 'AAA', // window letters, left to right
  rings = 'AAA', // ring settings (Ringstellung), left to right
  plugboard = ''
} = {}) {
  const spec = rotors.map((name) => {
    const r = ROTORS[name];
    if (!r) throw new Error(`unknown rotor ${name}`);
    return {
      name,
      forward: [...r.wiring].map(toNum),
      backward: [...r.wiring].reduce((acc, ch, i) => ((acc[toNum(ch)] = i), acc), []),
      notch: toNum(r.notch)
    };
  });
  const ringNums = [...rings.toUpperCase()].map(toNum);
  const startNums = [...positions.toUpperCase()].map(toNum);
  const plugs = typeof plugboard === 'string' ? parsePlugboard(plugboard) : plugboard;
  const reflect = [...REFLECTOR_B].map(toNum);

  let pos = [...startNums];

  const atNotch = (i) => pos[i] === spec[i].notch;

  function step() {
    // Middle rotor at its notch: it and the left rotor advance (double step).
    // Otherwise the right rotor at its notch advances the middle rotor.
    // The right rotor advances on every keypress.
    if (atNotch(1)) {
      pos[0] = mod(pos[0] + 1, 26);
      pos[1] = mod(pos[1] + 1, 26);
    } else if (atNotch(2)) {
      pos[1] = mod(pos[1] + 1, 26);
    }
    pos[2] = mod(pos[2] + 1, 26);
  }

  const through = (i, c, dir) => {
    const offset = pos[i] - ringNums[i];
    return mod(spec[i][dir][mod(c + offset, 26)] - offset, 26);
  };

  return {
    // Encipher one letter (a keypress): rotors step first, then the signal
    // runs plugboard -> rotors R,M,L -> reflector -> rotors L,M,R -> plugboard.
    press(letter) {
      const ch = letter.toUpperCase();
      if (!/^[A-Z]$/.test(ch)) return null;
      step();
      let c = toNum(plugs[ch] || ch);
      for (const i of [2, 1, 0]) c = through(i, c, 'forward');
      c = reflect[c];
      for (const i of [0, 1, 2]) c = through(i, c, 'backward');
      const out = toChar(c);
      return plugs[out] || out;
    },
    // Encipher a string; non-letters are dropped (the real machine had only
    // 26 keys). Does NOT reset first — call reset() between messages.
    encode(text) {
      let out = '';
      for (const ch of text.toUpperCase()) {
        const enc = this.press(ch);
        if (enc) out += enc;
      }
      return out;
    },
    reset() {
      pos = [...startNums];
    },
    get positions() {
      return pos.map(toChar).join('');
    }
  };
}
