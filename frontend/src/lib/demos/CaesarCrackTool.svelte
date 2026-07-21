<script>
  // "Caesar Cracking Tool" — paste any Caesar ciphertext and scan all 26
  // shifts for the one that reads as language.
  import DemoShell from './DemoShell.svelte';
  import { caesarCandidates } from './ciphers.js';

  export let open = false;

  let cipher = 'WFYDAKZLWPL';
  let hovered = null;

  $: rows = caesarCandidates(cipher);
  $: half = Math.ceil(rows.length / 2);
</script>

<DemoShell title="Caesar Cracking Tool" {open}>
  <div class="demo-io">
    <label>
      Ciphertext
      <textarea rows="2" bind:value={cipher} spellcheck="false"></textarea>
    </label>

    <div class="cols" on:mouseleave={() => (hovered = null)}>
      {#each [rows.slice(0, half), rows.slice(half)] as colRows}
        <table>
          <tr><th>key</th><th>candidate</th></tr>
          {#each colRows as { key, text }}
            <tr class:hot={hovered === key} on:mouseenter={() => (hovered = key)}>
              <td class="k">{key}</td>
              <td class="t">{text.length > 24 ? text.slice(0, 24) + '…' : text}</td>
            </tr>
          {/each}
        </table>
      {/each}
    </div>
    <p class="demo-note">Each row shifts every letter of the ciphertext by the key.
      An exhaustive search of a 26-key keyspace fits on one screen — that is the lesson.</p>
  </div>
</DemoShell>

<style>
  .cols { display: flex; gap: 1.5rem; flex-wrap: wrap; justify-content: center; }
  table { border-collapse: collapse; cursor: default; }
  th { font-size: 0.72rem; font-variant-caps: small-caps; color: var(--color-ink-soft, #55493a);
       padding: 0 0.5rem 0.2rem; text-align: left; }
  td { padding: 0.03rem 0.5rem; font-size: 0.88rem; }
  td.k { color: var(--color-ink-soft, #55493a); text-align: right; }
  td.t { letter-spacing: 0.08em; color: var(--color-ink, #2b2117); white-space: nowrap; }
  tr.hot td { background: var(--wash-red, #f3dede); }
  tr.hot td.t { color: var(--accent-red, #a23c3c); font-weight: 600; }
</style>
