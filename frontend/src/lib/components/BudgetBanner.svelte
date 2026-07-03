<script>
  import { budgetNotice } from '../stores/banners.js';
</script>

{#if $budgetNotice}
  <div class="banner budget" role="status">
    {$budgetNotice}
    <button on:click={() => budgetNotice.set(null)}>Dismiss</button>
  </div>
{/if}
