<script>
  export let top = 0;
  export let left = 0;
  export let initialPrompt = '';
  export let onSubmit = (_text) => {};
  export let onCancel = () => {};

  let text = initialPrompt;
</script>

<div class="prompt-box" style="top:{top}px; left:{left}px" role="dialog" aria-label="Edit prompt">
  <textarea bind:value={text} aria-label="Prompt"></textarea>
  <div class="row">
    <button type="button" on:click={onCancel}>Cancel</button>
    <button type="button" class="primary" on:click={() => onSubmit(text)}>Go</button>
  </div>
</div>
