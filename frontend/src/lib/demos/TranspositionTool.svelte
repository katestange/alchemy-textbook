<script>
  // "Transposition Cipher Tool" — columnar transposition on user text: pick
  // the number of columns and (optionally) a keyed read order like "3 4 2 1".
  import DemoShell from './DemoShell.svelte';
  import { columnarEncode, columnarDecode, parseColumnOrder } from './ciphers.js';

  export let open = false;

  let cols = 4;
  let keyText = '';
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';

  $: order = keyText.trim() ? parseColumnOrder(keyText) : null;
  $: keyError = keyText.trim() && (!order || order.length !== cols)
    ? `Key must be the numbers 1–${cols} in some order (e.g. “3 4 2 1”).` : null;
  $: effOrder = keyError ? null : order;
  $: if (source === 'plain') cipher = columnarEncode(plain, cols, effOrder);
      else plain = columnarDecode(cipher, cols, effOrder);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="Transposition Cipher Tool" {open}>
  <div class="demo-io">
    <div class="row">
      <label class="demo-slider">
        columns
        <input type="range" min="2" max="8" bind:value={cols} />
        <b>{cols}</b>
      </label>
      <label class="demo-field key-field">
        read order (optional)
        <input type="text" placeholder="e.g. 3 4 2 1" bind:value={keyText} spellcheck="false" />
      </label>
    </div>
    {#if keyError}<p class="demo-error">{keyError}</p>{/if}

    <label>
      Plaintext
      <textarea rows="4" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext
      <textarea rows="4" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Letters and digits only; the message is padded with X to fill the grid.
      Blank read order means the columns are read left to right.</p>
  </div>
</DemoShell>

<style>
  .row { display: flex; gap: 1.25rem; align-items: flex-end; flex-wrap: wrap; }
  .key-field input { width: 8rem; }
</style>
