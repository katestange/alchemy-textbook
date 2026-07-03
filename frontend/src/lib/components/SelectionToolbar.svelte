<script>
  // Quiet-mode typed-icon chips (Decision 56 -- base UI, no creature art yet).
  // Launch roster: example, intuition, chat, and quiz are all wired
  // (Decision 65: "enable both" chat and quiz, remove "coming soon").
  //
  // `mode`:
  //   - 'creatures' (default): the normal cluster of tool chips.
  //   - 'quote': while a chat/quiz panel is open, selecting reader text
  //     summons a single "Quote into conversation" action instead of a new
  //     panel (spec BUILD item 6) -- this replaces the whole cluster rather
  //     than adding a chip to it, since opening a second panel isn't
  //     possible ("one panel at a time").
  export let top = 0;
  export let left = 0;
  export let mode = 'creatures';
  export let onSelect = (_creatureType) => {};
  export let onQuote = () => {};

  const creatures = [
    { type: 'example', label: 'Ex.', title: 'Example', enabled: true },
    { type: 'intuition', label: 'Int.', title: 'Intuition', enabled: true },
    { type: 'chat', label: 'Chat', title: 'Chat', enabled: true },
    { type: 'quiz', label: 'Quiz', title: 'Quiz', enabled: true }
  ];
</script>

<div class="creature-toolbar" style="top:{top}px; left:{left}px" role="toolbar" aria-label="AI study tools">
  {#if mode === 'quote'}
    <button class="creature-chip quote-chip" type="button" on:click={onQuote}>
      Quote into conversation
    </button>
  {:else}
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
  {/if}
</div>
