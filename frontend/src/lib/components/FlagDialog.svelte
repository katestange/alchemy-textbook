<script>
  // A small modal for flagging something to the instructor (author feedback:
  // students should be able to report a suspect passage of the textbook, or
  // flag a piece of AI-generated content as incorrect/misleading or
  // inappropriate, with an optional note on any flag).
  //
  // `target` is { mode: 'text', contentHash } or { mode: 'ai', contentId }.
  import { submitFlag } from '../api.js';

  export let target;                 // { mode, contentHash?, contentId? }
  export let onClose = () => {};

  const AI_CATEGORIES = [
    { value: 'incorrect', label: 'Incorrect or misleading' },
    { value: 'inappropriate', label: 'Inappropriate' }
  ];

  // Text flags are always "I think this passage is wrong"; AI flags let the
  // student pick which kind of problem it is.
  let category = target.mode === 'text' ? 'text-error' : 'incorrect';
  let comment = '';
  let submitting = false;
  let done = false;
  let error = null;

  $: isText = target.mode === 'text';

  async function submit() {
    if (submitting) return;
    submitting = true;
    error = null;
    const res = await submitFlag({
      cachedContentId: target.contentId,
      contentHash: target.contentHash,
      category,
      comment: comment.trim() || null
    });
    submitting = false;
    if (res.ok) {
      done = true;
      setTimeout(onClose, 1200);
    } else if (res.error === 'rate_limited') {
      error = 'Too many requests just now — give it a few seconds and try again.';
    } else {
      error = 'Could not send the flag. Please try again.';
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="flag-backdrop" on:click={onClose}>
  <div
    class="flag-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Flag for instructor"
    on:click|stopPropagation
  >
    {#if done}
      <p class="flag-done">✓ Sent to your instructor. Thank you!</p>
    {:else}
      <h2 class="flag-title">
        {isText ? 'Flag this passage for your instructor' : 'Flag this AI-generated content'}
      </h2>
      <p class="flag-lead">
        {#if isText}
          Think something here is wrong? This sends the passage to your
          instructor to take a look. Add a note if you like.
        {:else}
          Let your instructor know what's wrong with this AI answer.
        {/if}
      </p>

      {#if !isText}
        <fieldset class="flag-cats">
          {#each AI_CATEGORIES as c}
            <label class="flag-cat">
              <input type="radio" name="flag-category" value={c.value} bind:group={category} />
              {c.label}
            </label>
          {/each}
        </fieldset>
      {/if}

      <textarea
        class="flag-note"
        bind:value={comment}
        rows="3"
        maxlength="1000"
        placeholder={isText
          ? 'Optional: what looks wrong? (e.g. “I think the exponent should be n−1”)'
          : 'Optional: add a note'}
      ></textarea>

      {#if error}<p class="flag-error" role="alert">{error}</p>{/if}

      <div class="flag-actions">
        <button type="button" class="flag-cancel" on:click={onClose}>Cancel</button>
        <button type="button" class="flag-submit" on:click={submit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send flag'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .flag-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(38, 32, 25, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .flag-dialog {
    background: var(--color-parchment, #fbf7ee);
    color: var(--color-ink, #2a2118);
    border: 1px solid var(--color-rule, #d9cdb8);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(38, 32, 25, 0.3);
    padding: 1.3rem 1.4rem;
    width: 100%;
    max-width: 26rem;
    font: inherit;
  }
  .flag-title {
    font-size: 1.05rem;
    margin: 0 0 0.4rem;
  }
  .flag-lead {
    font-size: 0.9rem;
    color: var(--color-ink-soft, #6b5f4d);
    margin: 0 0 0.9rem;
  }
  .flag-cats {
    border: none;
    margin: 0 0 0.9rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .flag-cat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.92rem;
  }
  .flag-note {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 0.9rem;
    border: 1px solid var(--color-rule, #d9cdb8);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
    background: #fff;
    resize: vertical;
  }
  .flag-error {
    color: #b42318;
    font-size: 0.85rem;
    margin: 0.6rem 0 0;
  }
  .flag-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .flag-actions button {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.4rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--color-rule, #d9cdb8);
    background: #fff;
    cursor: pointer;
  }
  .flag-submit {
    background: #b42318;
    border-color: #b42318;
    color: #fff;
  }
  .flag-submit:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .flag-done {
    margin: 0;
    font-size: 0.98rem;
    color: #1a7f37;
    text-align: center;
    padding: 0.6rem 0;
  }
</style>
