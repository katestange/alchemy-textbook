<script>
  // "One-Time Pad Tool" — letterwise mod-26 addition with a random pad. The
  // pad is generated to the message's length; using it twice (or a pad
  // shorter than the message) is exactly the misuse that breaks OTP.
  import DemoShell from './DemoShell.svelte';
  import { otpEncode, otpDecode, randomPad } from './ciphers.js';

  export let open = false;

  let plain = 'attack at dawn';
  let cipher = '';
  let pad = randomPad(24);
  let source = 'plain';

  $: letterCount = (source === 'plain' ? plain : cipher).replace(/[^a-z]/gi, '').length;
  $: padShort = letterCount > pad.length;
  $: if (source === 'plain') cipher = otpEncode(plain, pad);
      else plain = otpDecode(cipher, pad);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
  function regenerate() { pad = randomPad(Math.max(letterCount, 24)); }
</script>

<DemoShell title="One-Time Pad Tool" {open}>
  <div class="demo-io">
    <!-- not a <label>: a button may not sit inside a label wrapping a control -->
    <div class="demo-field">
      <span class="pad-row">
        the pad (random shifts, shared in secret)
        <button class="regen" type="button" on:click={regenerate}>new pad</button>
      </span>
      <textarea class="pad" rows="2" readonly aria-label="the pad" value={pad}></textarea>
    </div>
    {#if padShort}
      <p class="demo-error">The message is longer than the pad, so the pad repeats — a real
        one-time pad must be at least as long as the message (generate a new pad).</p>
    {/if}

    <label>
      Plaintext
      <textarea rows="3" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext (letter + pad letter, mod 26)
      <textarea rows="3" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Each pad letter is a shift A = 0 … Z = 25 applied to one message
      letter, then destroyed — used once, the ciphertext is information-theoretically secure.</p>
  </div>
</DemoShell>

<style>
  .pad-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .regen { font-family: inherit; font-size: 0.78rem; padding: 0.15rem 0.6rem;
           border: 1px solid var(--color-rule, #d9c9a3); border-radius: 6px;
           background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117); cursor: pointer; }
  .regen:hover { border-color: var(--accent-teal, #2b6b66); }
  .pad { letter-spacing: 0.15em; color: var(--accent-gold, #a97917) !important; }
</style>
