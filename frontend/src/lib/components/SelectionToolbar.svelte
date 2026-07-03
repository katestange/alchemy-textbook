<script>
  // Quiet-mode typed-icon chips (Decision 56 -- base UI, no creature art yet).
  // Launch roster (Decision 56): example is wired; intuition/chat/quiz are
  // visible but disabled ("coming soon") per the task brief.
  export let top = 0;
  export let left = 0;
  export let onSelect = (_creatureType) => {};

  const creatures = [
    { type: 'example', label: 'Ex.', title: 'Example', enabled: true },
    { type: 'intuition', label: 'Int.', title: 'Intuition — coming soon', enabled: false },
    { type: 'chat', label: 'Chat', title: 'Chat — coming soon', enabled: false },
    { type: 'quiz', label: 'Quiz', title: 'Quiz — coming soon', enabled: false }
  ];
</script>

<div class="creature-toolbar" style="top:{top}px; left:{left}px" role="toolbar" aria-label="AI study tools">
  {#each creatures as c (c.type)}
    <button
      class="creature-chip"
      data-creature={c.type}
      title={c.title}
      disabled={!c.enabled}
      on:click={() => c.enabled && onSelect(c.type)}
    >
      {c.label}
    </button>
  {/each}
</div>
