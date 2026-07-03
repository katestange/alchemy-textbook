<script>
  import { refreshRequired } from '../stores/banners.js';

  // Decision 60: non-dismissable -- the only escape is a reload, since the
  // client's manifest/build_version is stale and no generation should be
  // attempted against it.
  function reload() {
    window.location.reload();
  }
</script>

{#if $refreshRequired}
  <div class="banner refresh" role="alert">
    The textbook was just updated — refresh to continue.
    <button on:click={reload}>Refresh</button>
  </div>
{/if}
