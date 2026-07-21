<script>
  import { session } from '../stores/session.js';
  import { bookConfig } from '../stores/bookConfig.js';
  import { claimCode } from '../api.js';
  import BookFrontMatter from './BookFrontMatter.svelte';

  let code = '';
  let submitting = false;
  let error = null;

  async function submit() {
    if (!code.trim() || submitting) return;
    submitting = true;
    error = null;
    try {
      const result = await claimCode(code.trim());
      session.setClaimed(result.budget_remaining_microdollars);
    } catch (e) {
      error = e.status === 401 || e.status === 404
        ? 'That code was not recognized. Double check it and try again.'
        : 'Something went wrong claiming that code. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="page-shell">
  <BookFrontMatter>
    <div class="code-entry">
      <p class="entry-lead">Enter your invite code to unlock AI-assisted study tools (live mode). You can also read the base textbook without a code.</p>
      <form on:submit|preventDefault={submit}>
        <input
          type="text"
          placeholder={$bookConfig.code_example}
          bind:value={code}
          autocomplete="off"
          spellcheck="false"
        />
        <button type="submit" disabled={submitting}>{submitting ? 'Checking…' : 'Enter'}</button>
      </form>
      {#if error}
        <p class="error">{error}</p>
      {/if}
      <p class="hint">
        No code? <button class="link-btn" type="button" on:click={() => session.continueAnonymous()}>
          Continue as an anonymous reader
        </button> (base textbook only — no AI generation).
      </p>
    </div>
  </BookFrontMatter>
</div>
