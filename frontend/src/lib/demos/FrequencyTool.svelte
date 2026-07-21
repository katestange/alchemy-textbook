<script>
  // "Frequency Analysis Tool" — paste any text (a ciphertext, say) and
  // compare its letter distribution against standard English.
  import DemoShell from './DemoShell.svelte';
  import FrequencyChart from './FrequencyChart.svelte';
  import { letterFrequencies } from './ciphers.js';

  export let open = false;

  let text = 'PHELGXPHOLAA';
  $: ({ freqs, total } = letterFrequencies(text));
</script>

<DemoShell title="Frequency Analysis Tool" {open}>
  <div class="demo-io">
    <label>
      Text to analyse
      <textarea rows="4" bind:value={text} spellcheck="false"></textarea>
    </label>
    {#if total}
      <FrequencyChart user={freqs} />
      <p class="demo-note">{total} letters counted. A monoalphabetic cipher merely permutes
        the English profile; a polyalphabetic one flattens it.</p>
    {:else}
      <p class="demo-note">Type or paste some text to see its letter distribution.</p>
    {/if}
  </div>
</DemoShell>
