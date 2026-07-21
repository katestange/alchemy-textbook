<script>
  // "Vigenère Cipher Tool" — keyword-driven polyalphabetic cipher. For short
  // messages the KEY / PLAINTEXT / CIPHERTEXT rows are shown aligned, as in
  // the book's worked example.
  import DemoShell from './DemoShell.svelte';
  import { vigenereEncode, vigenereDecode, vigenereShifts, LETTERS } from './ciphers.js';

  export let open = false;

  let keyword = 'POLLEN';
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';

  $: shifts = vigenereShifts(keyword);
  $: keyError = keyword.trim() && !shifts.length ? 'The keyword needs at least one letter.' : null;
  $: if (source === 'plain') cipher = shifts.length ? vigenereEncode(plain, keyword) : plain;
      else plain = shifts.length ? vigenereDecode(cipher, keyword) : cipher;

  // Aligned rows for short texts: key letter above each plaintext LETTER
  // (non-letters shown but not keyed), as in fig:vig-example.
  $: rows = (() => {
    const p = plain.toUpperCase();
    if (!shifts.length || p.replace(/[^A-Z]/g, '').length === 0 || p.length > 26) return null;
    const c = cipher.toUpperCase();
    let ki = 0;
    const key = [...p].map((ch) => (ch >= 'A' && ch <= 'Z' ? LETTERS[shifts[ki++ % shifts.length]] : ' '));
    return { key, plain: [...p], cipher: [...c] };
  })();

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<DemoShell title="Vigenère Cipher Tool" {open}>
  <div class="demo-io">
    <label class="demo-field kw">
      keyword
      <input type="text" bind:value={keyword} spellcheck="false" />
    </label>
    {#if keyError}<p class="demo-error">{keyError}</p>{/if}

    {#if rows}
      <table class="aligned">
        <tr><th>KEY</th>{#each rows.key as ch}<td class="key">{ch}</td>{/each}</tr>
        <tr><th>PLAINTEXT</th>{#each rows.plain as ch}<td>{ch}</td>{/each}</tr>
        <tr><th>CIPHERTEXT</th>{#each rows.cipher as ch}<td class="ct">{ch}</td>{/each}</tr>
      </table>
    {/if}

    <label>
      Plaintext
      <textarea rows="3" value={plain} on:input={onPlain} spellcheck="false"></textarea>
    </label>
    <div class="io-arrow" aria-hidden="true">⇅</div>
    <label>
      Ciphertext
      <textarea rows="3" value={cipher} on:input={onCipher} spellcheck="false"></textarea>
    </label>
    <p class="demo-note">Each key letter is a shift (A = 0 … Z = 25), applied letter by letter
      and repeating; the aligned rows appear for messages up to 26 characters.</p>
  </div>
</DemoShell>

<style>
  .kw input { width: 10rem; text-transform: uppercase; }
  .aligned { border-collapse: collapse; align-self: center; }
  .aligned th { font-size: 0.7rem; text-align: right; padding-right: 0.5rem;
                color: var(--color-ink-soft, #55493a); font-variant-caps: small-caps; }
  .aligned td { width: 1.35rem; height: 1.35rem; text-align: center;
                border: 1px solid var(--color-rule, #d9c9a3);
                background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117); }
  .aligned td.key { color: var(--accent-gold, #a97917); }
  .aligned td.ct { color: var(--accent-teal, #2b6b66); }
</style>
