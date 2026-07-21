<script>
  // "Polybius Square Tool" — encode plaintext to (row, column) digit pairs
  // and back, with the interactive square alongside.
  import DemoShell from './DemoShell.svelte';
  import PolybiusSquare from './PolybiusSquare.svelte';
  import { polybiusEncode, polybiusDecode } from './ciphers.js';

  export let open = false;

  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';

  $: if (source === 'plain') cipher = polybiusEncode(plain);
      else plain = polybiusDecode(cipher);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="Polybius Square Tool" {open}>
  <div class="demo-controls">
    <PolybiusSquare />
  </div>

  <div class="demo-io">
    <label>
      Plaintext
      <textarea rows="4" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext (row–column pairs)
      <textarea rows="4" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Letters only are encoded; J shares I’s cell, so decoding returns I.</p>
  </div>
</DemoShell>
