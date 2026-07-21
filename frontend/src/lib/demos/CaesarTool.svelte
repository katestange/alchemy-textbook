<script>
  // "Caesar Cipher Tool" — a collapsible bespoke demo. Set a key with the wheel
  // (or slider) and encipher/decipher longer strings in the plaintext /
  // ciphertext boxes. Editing either box updates the other; changing the key
  // re-derives from whichever box was last edited. Hovering the wheel
  // highlights the paired letters. Muted palette to match the reader.
  import CaesarWheel from './CaesarWheel.svelte';

  export let open = false;      // "can be opened up" — collapsed by default

  let key = 3;
  let plain = 'attack at dawn';
  let cipher = '';
  let source = 'plain';         // which box is authoritative on a key change

  function shift(text, k) {
    return text.replace(/[a-z]/gi, (ch) => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode((ch.charCodeAt(0) - base + k + 26) % 26 + base);
    });
  }
  // reactive: keep the two boxes consistent given key + source
  $: if (source === 'plain') cipher = shift(plain, key);
      else plain = shift(cipher, -key);

  function onPlain(e) { source = 'plain'; plain = e.target.value; }
  function onCipher(e) { source = 'cipher'; cipher = e.target.value; }
</script>

<div class="caesar-tool" class:open>
  <button class="tool-head" type="button" on:click={() => (open = !open)} aria-expanded={open}>
    <span class="chevron" class:open>▸</span>
    <span class="tool-title">Caesar Cipher Tool</span>
    <span class="ai-tag" title="This interactive tool was created by AI.">✦ AI-created</span>
  </button>

  {#if open}
    <div class="tool-body">
      <div class="tool-wheel">
        <CaesarWheel bind:key size={280} />
        <label class="keyslider">
          key
          <input type="range" min="0" max="25" bind:value={key} on:input={() => (source = source)} />
          <b>{key}</b>
        </label>
      </div>

      <div class="tool-io">
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
    </div>
  {/if}
</div>

<style>
  .caesar-tool {
    border: 1px solid var(--color-rule, #d9c9a3);
    border-radius: 10px;
    background: var(--color-bg-raised, #ede2c8);
    margin: 1.5rem auto;
    max-width: 46rem;
    overflow: hidden;
    font-family: var(--font-serif, Georgia, serif);
  }
  .tool-head {
    display: flex; align-items: center; gap: 0.6rem;
    width: 100%; padding: 0.7rem 1rem; text-align: left;
    background: none; border: none; cursor: pointer;
    color: var(--color-ink, #2b2117); font-family: inherit; font-size: 1.05rem;
  }
  .chevron { transition: transform 0.15s ease; color: var(--color-ink-soft, #55493a); }
  .chevron.open { transform: rotate(90deg); }
  .tool-title { font-variant-caps: small-caps; letter-spacing: 0.02em; font-weight: 600; }
  .ai-tag {
    margin-left: auto; font-size: 0.72rem; font-variant-caps: small-caps;
    letter-spacing: 0.04em; padding: 0.12rem 0.5rem; border-radius: 999px;
    color: var(--accent-grey, #55524c);
    background: var(--wash-grey, #e7e5e0);
    border: 1px solid var(--color-rule, #d9c9a3);
  }

  .tool-body {
    display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start;
    padding: 0.5rem 1.25rem 1.25rem;
    border-top: 1px solid var(--color-rule, #d9c9a3);
  }
  .tool-wheel { flex: 0 0 300px; margin: 0 auto; }
  .keyslider { display: flex; align-items: center; gap: 0.6rem; justify-content: center;
               font-size: 0.9rem; color: var(--color-ink-soft, #55493a); margin-top: 0.4rem; }
  .keyslider input { accent-color: var(--accent-teal, #2b6b66); }

  .tool-io { flex: 1 1 260px; display: flex; flex-direction: column; gap: 0.5rem; }
  .tool-io label { display: flex; flex-direction: column; gap: 0.25rem;
                   font-size: 0.85rem; color: var(--color-ink-soft, #55493a); }
  .tool-io textarea {
    font-family: 'Iowan Old Style', Palatino, Georgia, serif;
    font-size: 1rem; letter-spacing: 0.03em; line-height: 1.5;
    padding: 0.5rem 0.6rem; border-radius: 6px; resize: vertical;
    border: 1px solid var(--color-rule, #d9c9a3);
    background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117);
  }
  .io-arrow { text-align: center; color: var(--color-ink-soft, #55493a); }
</style>
