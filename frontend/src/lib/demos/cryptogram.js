// Newspaper-cryptogram logic: a bank of cryptology sayings, random
// substitution keys with no fixed points (a letter never stands for itself,
// as in the newspaper puzzles), and the encryption map. Pure logic, no DOM.

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Short cryptology sayings and aphorisms, several already quoted in the
// chapter. Kept to public figures' famous one-liners, newspaper style.
export const SAYINGS = [
  { text: 'THE ONLY UNBREAKABLE CIPHER IS THE ONE TIME PAD', author: 'Cryptology folklore' },
  { text: 'AVOID SECURITY THROUGH OBSCURITY', author: "Kerckhoffs' principle, in brief" },
  { text: 'A CRYPTOGRAPHIC SYSTEM SHOULD BE SECURE EVEN IF EVERYTHING ABOUT THE SYSTEM, EXCEPT THE KEY, IS PUBLIC KNOWLEDGE', author: 'Auguste Kerckhoffs' },
  { text: 'CODEBREAKING IS AN ART, AND CODEMAKING IS A SCIENCE', author: 'Adi Shamir' },
  { text: 'RANDOM NUMBERS SHOULD NOT BE GENERATED WITH A METHOD CHOSEN AT RANDOM', author: 'Donald Knuth' },
  { text: 'ANYONE WHO ATTEMPTS TO GENERATE RANDOM NUMBERS BY DETERMINISTIC MEANS IS, OF COURSE, LIVING IN A STATE OF SIN', author: 'John von Neumann' },
  { text: 'THERE ARE TWO KINDS OF CRYPTOGRAPHY: ONE THAT STOPS YOUR KID SISTER, AND ONE THAT STOPS MAJOR GOVERNMENTS', author: 'Bruce Schneier' },
  { text: 'IF YOU REVEAL YOUR SECRETS TO THE WIND, YOU SHOULD NOT BLAME THE WIND FOR REVEALING THEM TO THE TREES', author: 'Kahlil Gibran' },
  { text: 'THREE MAY KEEP A SECRET, IF TWO OF THEM ARE DEAD', author: 'Benjamin Franklin' },
  { text: 'THE ENEMY KNOWS THE SYSTEM', author: "Shannon's maxim" },
  { text: 'A SECRET CEASES TO BE A SECRET IF IT IS ONCE CONFIDED', author: 'Charles Caleb Colton' },
  { text: 'HISTORY IS THE KEY THAT UNLOCKS EVERY CIPHER SOONER OR LATER', author: 'Cryptology folklore' }
];

// A random substitution key with no fixed points: plain letter -> cipher
// letter, no letter standing for itself. Fisher-Yates with rejection; the
// chance of hitting a fixed point per attempt is ~1 - 1/e, so this loop
// finishes almost immediately.
export function randomDerangement(random = Math.random) {
  for (;;) {
    const arr = [...LETTERS];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if ([...LETTERS].every((ch, i) => arr[i] !== ch)) {
      const key = {};
      [...LETTERS].forEach((ch, i) => (key[ch] = arr[i]));
      return key;
    }
  }
}

// Encrypt with a plain->cipher letter map; anything that is not a letter
// (spaces, punctuation) passes through unchanged, newspaper style.
export function encryptSaying(text, key) {
  return [...text.toUpperCase()].map((ch) => key[ch] || ch).join('');
}

export function randomPuzzle(random = Math.random) {
  const saying = SAYINGS[Math.floor(random() * SAYINGS.length)];
  const key = randomDerangement(random);
  return {
    saying,
    key,
    cipher: encryptSaying(saying.text, key),
    // cipher letter -> true plain letter, for checking and "show solution"
    reverse: Object.fromEntries(Object.entries(key).map(([p, c]) => [c, p]))
  };
}
