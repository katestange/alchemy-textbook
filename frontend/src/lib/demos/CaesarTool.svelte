<script>
  // "Caesar Cipher Tool" — set a key with the wheel (or slider) and
  // encipher/decipher longer strings. Editing either box updates the other;
  // changing the key re-derives from whichever box was last edited.
  import DemoShell from './DemoShell.svelte';
  import CaesarWheel from './CaesarWheel.svelte';
  import { caesarShift } from './ciphers.js';

  export let open = false;

  let key = 3;
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';         // which box is authoritative on a key change

  $: if (source === 'plain') cipher = caesarShift(plain, key);
      else plain = caesarShift(cipher, -key);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="Caesar Cipher Tool" {open}>
  <div class="demo-controls">
    <CaesarWheel bind:key size={280} />
    <label class="demo-slider">
      key
      <input type="range" min="0" max="25" bind:value={key} />
      <b>{key}</b>
    </label>
  </div>

  <div class="demo-io">
    <label>
      Plaintext
      <textarea rows="4" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext
      <textarea rows="4" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
  </div>
</DemoShell>
