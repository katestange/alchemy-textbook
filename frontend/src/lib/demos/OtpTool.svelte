<script>
  // "One-Time Pad Tool" — the chapter defines the one-time pad on binary
  // bitstrings (XOR), so that is the default mode here. The letterwise variant
  // (mod-26 addition with a pad of letters) is offered as an alternative,
  // since it is the form that turns up in the Vigenère discussion. Either way
  // the pad is generated to the message's length; reusing a pad, or letting a
  // short one repeat, is exactly the misuse that breaks the cipher.
  import DemoShell from './DemoShell.svelte';
  import { otpEncode, otpDecode, randomPad, randomBits, xorBits } from './ciphers.js';

  export let open = false;

  let mode = 'binary'; // 'binary' (the chapter's definition) | 'letters'
  let source = 'plain';

  // Each mode keeps its own message/pad, so switching back and forth does not
  // shove bitstrings through the letter cipher or vice versa.
  let binPlain = '01101001';
  let binCipher = '';
  let binPad = randomBits(16);

  let letPlain = 'attack at dawn';
  let letCipher = '';
  let letPad = randomPad(24);

  $: binary = mode === 'binary';
  // Switching modes always starts from that mode's plaintext. Without this, a
  // reader who was typing in the ciphertext box and then flipped the mode
  // would run the other mode's (empty) ciphertext backwards and blank its
  // message.
  $: mode, (source = 'plain');
  $: plain = binary ? binPlain : letPlain;
  $: cipher = binary ? binCipher : letCipher;
  $: pad = binary ? binPad : letPad;

  // Units consumed from the pad by whichever box the reader is typing in.
  $: unitCount = binary
    ? (source === 'plain' ? binPlain : binCipher).replace(/[^01]/g, '').length
    : (source === 'plain' ? letPlain : letCipher).replace(/[^a-z]/gi, '').length;
  $: padShort = unitCount > pad.replace(binary ? /[^01]/g : /[^a-z]/gi, '').length;
  // Only flag stray characters in binary mode: the letter cipher deliberately
  // passes spaces and punctuation through, but "2" in a bitstring is a typo.
  $: strayBits = binary && /[^01\s]/.test(source === 'plain' ? binPlain : binCipher);

  $: if (binary) {
    if (source === 'plain') binCipher = xorBits(binPlain, binPad);
    else binPlain = xorBits(binCipher, binPad);
  } else {
    if (source === 'plain') letCipher = otpEncode(letPlain, letPad);
    else letPlain = otpDecode(letCipher, letPad);
  }

  function onPlain(e) {
    source = 'plain';
    if (binary) binPlain = e.target.value; else letPlain = e.target.value;
  }
  function onCipher(e) {
    source = 'cipher';
    if (binary) binCipher = e.target.value; else letCipher = e.target.value;
  }
  function regenerate() {
    if (binary) binPad = randomBits(Math.max(unitCount, 16));
    else letPad = randomPad(Math.max(unitCount, 24));
  }
</script>

<DemoShell title="One-Time Pad Tool" {open}>
  <div class="demo-io">
    <div class="demo-field">
      <span class="mode-row">
        <span id="otp-mode-label">the pad works on</span>
        <span class="modes" role="group" aria-labelledby="otp-mode-label">
          <label class="mode-opt">
            <input type="radio" bind:group={mode} value="binary" />
            bits (XOR)
          </label>
          <label class="mode-opt">
            <input type="radio" bind:group={mode} value="letters" />
            letters (mod 26)
          </label>
        </span>
      </span>
    </div>

    <!-- not a <label>: a button may not sit inside a label wrapping a control -->
    <div class="demo-field">
      <span class="pad-row">
        {binary ? 'the pad (random bits, shared in secret)' : 'the pad (random shifts, shared in secret)'}
        <button class="regen" type="button" on:click={regenerate}>new pad</button>
      </span>
      <textarea class="pad" rows="2" readonly aria-label="the pad" value={pad}></textarea>
    </div>
    {#if padShort}
      <p class="demo-error">The message is longer than the pad, so the pad repeats — a real
        one-time pad must be at least as long as the message (generate a new pad).</p>
    {/if}
    {#if strayBits}
      <p class="demo-error">Only 0 and 1 are used in binary mode; anything else is ignored.</p>
    {/if}

    <label>
      Plaintext
      <textarea rows="3" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      {binary ? 'Ciphertext (plaintext bit XOR pad bit)' : 'Ciphertext (letter + pad letter, mod 26)'}
      <textarea rows="3" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">
      {#if binary}
        Each pad bit is XORed with one message bit, then destroyed:  a 1 in the pad flips the
        bit, a 0 leaves it alone.  Encryption and decryption are the same operation, so typing
        the ciphertext above returns the plaintext.
      {:else}
        Each pad letter is a shift A = 0 … Z = 25 applied to one message letter, then destroyed
        — used once, the ciphertext is information-theoretically secure.
      {/if}
    </p>
  </div>
</DemoShell>

<style>
  .pad-row, .mode-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .modes { display: flex; gap: 0.9rem; }
  .mode-opt { display: flex; flex-direction: row; align-items: center; gap: 0.3rem; cursor: pointer; }
  .mode-opt input { accent-color: var(--accent-teal, #2b6b66); margin: 0; }
  .regen { font-family: inherit; font-size: 0.78rem; padding: 0.15rem 0.6rem;
           border: 1px solid var(--color-rule, #d9c9a3); border-radius: 6px;
           background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117); cursor: pointer; }
  .regen:hover { border-color: var(--accent-teal, #2b6b66); }
  .pad { letter-spacing: 0.15em; color: var(--accent-gold, #a97917) !important; }
</style>
