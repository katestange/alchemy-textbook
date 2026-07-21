<script>
  // "Scytale Tool" — wrap your own message around the rod. The number of
  // wraps is the secret key.
  import DemoShell from './DemoShell.svelte';
  import { scytaleEncode, scytaleDecode } from './ciphers.js';

  export let open = false;

  let wraps = 3;
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';

  $: if (source === 'plain') cipher = scytaleEncode(plain, wraps);
      else plain = scytaleDecode(cipher, wraps);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="Scytale Tool" {open}>
  <div class="demo-io">
    <label class="demo-slider">
      wraps
      <input type="range" min="2" max="8" bind:value={wraps} />
      <b>{wraps}</b>
    </label>

    <label>
      Plaintext (written along the strip)
      <textarea rows="4" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext (read along the rod)
      <textarea rows="4" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Letters and digits only; the strip is padded with X to fill the last turn.</p>
  </div>
</DemoShell>
