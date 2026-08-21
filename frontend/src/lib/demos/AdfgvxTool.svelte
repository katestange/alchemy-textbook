<script>
  // "ADFGVX Cipher Tool" — the book's fixed 6×6 square plus a keyed columnar
  // transposition. The intermediate pair stream is shown between the boxes.
  import DemoShell from './DemoShell.svelte';
  import AdfgvxSquare from './AdfgvxSquare.svelte';
  import { adfgvxEncode, adfgvxDecode, adfgvxSubstitute, parseColumnOrder } from './ciphers.js';

  export let open = false;

  let keyText = '3 4 2 1';
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';

  $: order = parseColumnOrder(keyText);
  $: keyError = order ? null : 'Key must be the numbers 1…n in some order, e.g. “3 4 2 1” or “3421”.';
  $: if (order) {
    if (source === 'plain') cipher = adfgvxEncode(plain, order);
    else plain = adfgvxDecode(cipher, order);
  } else if (source === 'plain') {
    // Unusable key: blank the derived box rather than leaving the previous
    // key's ciphertext sitting there, which reads as a live answer and makes
    // the tool look stuck when the plaintext is edited (author report).
    cipher = '';
  }
  $: stream = adfgvxSubstitute(plain);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="ADFGVX Cipher Tool" {open}>
  <div class="demo-controls">
    <AdfgvxSquare />
  </div>

  <div class="demo-io">
    <label class="demo-field key-field">
      transposition key (read order)
      <input type="text" bind:value={keyText} spellcheck="false" />
    </label>
    {#if keyError}<p class="demo-error">{keyError}</p>{/if}

    <label>
      Plaintext
      <textarea rows="3" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <label>
      Pair stream (after the square)
      <textarea rows="2" readonly value={stream}></textarea>
    </label>
    <label>
      Ciphertext (after the transposition)
      <textarea rows="3" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Letters and digits only (the square holds a–z and 0–9); the pair
      stream is padded with X to fill the transposition grid.</p>
  </div>
</DemoShell>

<style>
  .key-field input { width: 8rem; }
</style>
