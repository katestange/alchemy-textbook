<script>
  // Quiet-mode typed-icon chips (Decision 56 -- base UI, no creature art yet).
  // Launch roster: example and intuition are wired; chat/quiz remain visible
  // but disabled ("coming soon").
  export let top = 0;
  export let left = 0;
  export let onSelect = (_creatureType) => {};

  const creatures = [
    { type: 'example', label: 'Ex.', title: 'Example', enabled: true },
    { type: 'intuition', label: 'Int.', title: 'Intuition', enabled: true },
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
