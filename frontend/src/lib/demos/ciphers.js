// Pure cipher functions shared by the bespoke demo components (figure demos +
// fold-out tools), kept free of DOM/Svelte so they can be verified directly
// against the worked examples printed in the book:
//   Caesar    : CIPHER --17--> TZGYVI                (fig:cipher-wheel)
//   ADFGVX    : ATTACKATDAWN -> GGDGGAXDDXDFDXADFFGGAGXD (fig:adfgvx-example)
//   Exhaustive: WFYDAKZLWPL shifted +8 = ENGLISHTEXT (fig:caesar-exhaustive)
//   Vigenère  : ATTACKATDAWN + POLLEN -> PHELGXPHOLAA (fig:vig-example, A=0
//               tabula-recta convention, matching the mod-26 addition table)
// Non-letters pass through unchanged unless a cipher's nature forbids it
// (grid ciphers strip to letters, as the historical systems did).

const A = 'A'.charCodeAt(0);
const N = 26;
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const mod = (k, n) => ((k % n) + n) % n;

// ---- Caesar --------------------------------------------------------------

/** Shift letters by k (negative to reverse); case preserved, rest untouched. */
export function caesarShift(text, k) {
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(mod(ch.charCodeAt(0) - base + k, N) + base);
  });
}

/** All 26 candidate shifts of a ciphertext, in the book's presentation:
 *  row k = ciphertext shifted forward by k. Returns [{key, text}]. */
export function caesarCandidates(cipher) {
  return Array.from({ length: N }, (_, k) => ({ key: k, text: caesarShift(cipher, k) }));
}

// ---- Polybius square -----------------------------------------------------
// The book's 5x5 grid (fig:polybius-example): I and J share a cell; a letter
// encrypts to (row, column), 1-indexed — "B is encrypted as (1,2)".

export const POLYBIUS_GRID = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I/J', 'K'],
  ['L', 'M', 'N', 'O', 'P'],
  ['Q', 'R', 'S', 'T', 'U'],
  ['V', 'W', 'X', 'Y', 'Z']
];

/** (row, col) 1-indexed for an A-Z letter (J shares I's cell), else null. */
export function polybiusCoords(letter) {
  const ch = letter.toUpperCase().replace('J', 'I');
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (POLYBIUS_GRID[r][c].startsWith(ch)) return { row: r + 1, col: c + 1 };
    }
  }
  return null;
}

/** Letters -> "(r,c)" pairs joined by spaces; non-letters dropped. */
export function polybiusEncode(text) {
  return [...text.toUpperCase()]
    .map((ch) => polybiusCoords(ch))
    .filter(Boolean)
    .map(({ row, col }) => `${row}${col}`)
    .join(' ');
}

/** Digit pairs (any separators) -> letters. Unreadable pairs are skipped. */
export function polybiusDecode(text) {
  const digits = text.replace(/[^1-5]/g, '');
  let out = '';
  for (let i = 0; i + 1 < digits.length; i += 2) {
    const r = +digits[i] - 1, c = +digits[i + 1] - 1;
    out += POLYBIUS_GRID[r][c][0]; // I/J cell decodes as I
  }
  return out;
}

// ---- Columnar transposition ---------------------------------------------
// Write the message in rows of `cols` columns (padding with X), read the
// columns in `order` (1-indexed read positions per column, as in the book's
// ADFGVX figure where the label k above a column means "read k-th").
// order = null means plain left-to-right columns (the simple square of
// fig:transposition-example's prose).

function toGrid(letters, cols) {
  const rows = Math.ceil(letters.length / cols);
  const padded = letters.padEnd(rows * cols, 'X');
  return Array.from({ length: rows }, (_, r) => padded.slice(r * cols, (r + 1) * cols));
}

export function columnarEncode(text, cols, order = null) {
  const letters = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!letters) return '';
  const grid = toGrid(letters, cols);
  const readSeq = colReadSequence(cols, order);
  return readSeq.map((c) => grid.map((row) => row[c]).join('')).join('');
}

export function columnarDecode(cipher, cols, order = null) {
  const letters = cipher.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!letters) return '';
  const rows = Math.ceil(letters.length / cols);
  const readSeq = colReadSequence(cols, order);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(''));
  let i = 0;
  for (const c of readSeq) {
    for (let r = 0; r < rows; r++) grid[r][c] = letters[i++] ?? '';
  }
  return grid.map((row) => row.join('')).join('');
}

/** Column indices in read order. order[i] = read position (1-indexed) of
 *  column i; e.g. the book's "3 4 2 1" reads columns 4th,3rd,1st,2nd. */
export function colReadSequence(cols, order) {
  const idx = Array.from({ length: cols }, (_, i) => i);
  if (!order) return idx;
  return idx.slice().sort((a, b) => order[a] - order[b]);
}

/** Parse a key like "3 4 2 1" / "3421" into an order array, or null if it is
 *  not a permutation of 1..n. */
export function parseColumnOrder(s) {
  const isPermutation = (nums) =>
    nums.length > 0 && new Set(nums).size === nums.length &&
    Math.min(...nums) === 1 && Math.max(...nums) === nums.length;
  const separated = ((s || '').match(/\d+/g) || []).map(Number);
  if (isPermutation(separated)) return separated;
  // Unseparated form ("3421"): one digit per column. Readers type the key both
  // ways, and /\d+/ above swallows "3421" as the single number 3421, so fall
  // back to reading it digit by digit. Ten or more columns still need
  // separators, since "10" cannot be told from "1, 0".
  const digits = [...(s || '').replace(/\D/g, '')].map(Number);
  return isPermutation(digits) ? digits : null;
}

// ---- Scytale -------------------------------------------------------------
// The strip is written along its length, wound `wraps` times around the rod;
// reading along the rod takes every `wraps`-th letter. Equivalent to writing
// in `wraps` columns and reading rows — the transpose of columnarEncode.

export function scytaleEncode(text, wraps) {
  const letters = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!letters) return '';
  const grid = toGrid(letters, wraps);        // rows of length `wraps`
  let out = '';
  for (let c = 0; c < wraps; c++) for (const row of grid) out += row[c];
  return out;
}

export function scytaleDecode(cipher, wraps) {
  const letters = cipher.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!letters) return '';
  const rows = Math.ceil(letters.length / wraps);
  return scytaleEncode(letters, rows);        // the transpose of a transpose
}

// ---- Vigenère ------------------------------------------------------------
// Standard tabula recta: A = 0, cipher = plain + key (mod 26). Matches the
// book's mod-26 addition-table square. Non-letters pass through and do not
// consume key letters.

export function vigenereShifts(keyword) {
  return [...keyword.toUpperCase()].filter((c) => c >= 'A' && c <= 'Z')
    .map((c) => c.charCodeAt(0) - A);
}

function vigenereMap(text, keyword, sign) {
  const shifts = vigenereShifts(keyword);
  if (!shifts.length) return text;
  let i = 0;
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const k = shifts[i++ % shifts.length];
    return String.fromCharCode(mod(ch.charCodeAt(0) - base + sign * k, N) + base);
  });
}

export const vigenereEncode = (text, keyword) => vigenereMap(text, keyword, +1);
export const vigenereDecode = (text, keyword) => vigenereMap(text, keyword, -1);

// ---- ADFGVX --------------------------------------------------------------
// The book's 6x6 square (fig:adfgvx-example) and two-stage encryption:
// substitute each character by its (row,col) ADFGVX pair, then columnar-
// transpose the pair stream under the keyed column order.

export const ADFGVX = 'ADFGVX'.split('');
export const ADFGVX_SQUARE = [
  ['c', 'o', '8', 'x', 'f', '4'],
  ['m', 'k', '3', 'a', 'z', '9'],
  ['n', 'w', '1', '0', 'j', 'd'],
  ['5', 's', 'i', 'y', 'h', 'u'],
  ['p', 'l', 'v', 'b', '6', 'r'],
  ['e', 'q', '7', 't', '2', 'g']
];

/** "DG" pair for a plaintext character, or null if not in the square. */
export function adfgvxPair(ch) {
  const c = ch.toLowerCase();
  for (let r = 0; r < 6; r++) {
    const k = ADFGVX_SQUARE[r].indexOf(c);
    if (k !== -1) return ADFGVX[r] + ADFGVX[k];
  }
  return null;
}

/** Stage 1 only: the pair stream (spaced), e.g. "DG XG XG ...". */
export function adfgvxSubstitute(text) {
  return [...text].map(adfgvxPair).filter(Boolean).join(' ');
}

export function adfgvxEncode(text, order) {
  // Pad the PLAINTEXT with 'x' (a square character) until the pair stream
  // fills the transposition grid exactly — keeps decoding a clean inverse.
  let chars = [...text].filter((ch) => adfgvxPair(ch));
  while ((2 * chars.length) % order.length !== 0) chars.push('x');
  const pairs = chars.map(adfgvxPair).join('');
  return columnarEncode(pairs, order.length, order);
}

export function adfgvxDecode(cipher, order) {
  const stream = columnarDecode(cipher, order.length, order);
  let out = '';
  for (let i = 0; i + 1 < stream.length; i += 2) {
    const r = ADFGVX.indexOf(stream[i]), c = ADFGVX.indexOf(stream[i + 1]);
    if (r !== -1 && c !== -1) out += ADFGVX_SQUARE[r][c];
  }
  return out;
}

// ---- Letter frequencies --------------------------------------------------
// English percentages exactly as printed in fig:frequencies.

export const ENGLISH_FREQUENCIES = {
  A: 8.2, B: 1.5, C: 2.8, D: 4.3, E: 12.7, F: 2.2, G: 2.0, H: 6.1, I: 7.0,
  J: 0.2, K: 0.8, L: 4.0, M: 2.4, N: 6.7, O: 7.5, P: 1.9, Q: 0.1, R: 6.0,
  S: 6.3, T: 9.1, U: 2.8, V: 1.0, W: 2.3, X: 0.1, Y: 2.0, Z: 0.1
};

/** Percentage frequency of each letter in `text` (letters only), as {A:..}. */
export function letterFrequencies(text) {
  const counts = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  let total = 0;
  for (const ch of text.toUpperCase()) {
    if (ch >= 'A' && ch <= 'Z') { counts[ch]++; total++; }
  }
  if (total) for (const l of LETTERS) counts[l] = (100 * counts[l]) / total;
  return { freqs: counts, total };
}

// ---- One-time pad --------------------------------------------------------
// Letterwise mod-26 addition with a random pad, as in the chapter's OTP
// discussion (the modern bitwise XOR is the same idea over bits).

export function randomPad(n) {
  const vals = new Uint8Array(n);
  crypto.getRandomValues(vals);
  return Array.from(vals, (v) => LETTERS[v % N]).join('');
}

function otpMap(text, pad, sign) {
  let i = 0;
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const k = (pad[i++ % pad.length] ?? 'A').toUpperCase().charCodeAt(0) - A;
    return String.fromCharCode(mod(ch.charCodeAt(0) - base + sign * k, N) + base);
  });
}

export const otpEncode = (text, pad) => otpMap(text, pad, +1);
export const otpDecode = (text, pad) => otpMap(text, pad, -1);

// Binary one-time pad: the form the chapter defines, XOR bit by bit. Both
// encryption and decryption are the same operation, since a XOR b XOR b = a.
// Non-bit characters in the message are ignored (so "0110 1001" is fine); the
// pad is consumed one bit per message bit and repeats if it is too short,
// which is precisely the misuse the text warns about.

export function randomBits(n) {
  const vals = new Uint8Array(n);
  crypto.getRandomValues(vals);
  return Array.from(vals, (v) => (v & 1 ? '1' : '0')).join('');
}

/** XOR `bits` with `pad`, bit by bit. Returns '' if either side has no bits. */
export function xorBits(bits, pad) {
  const b = (bits || '').replace(/[^01]/g, '');
  const k = (pad || '').replace(/[^01]/g, '');
  if (!b || !k) return '';
  return [...b].map((bit, i) => (bit === k[i % k.length] ? '0' : '1')).join('');
}
