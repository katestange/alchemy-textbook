<script>
  // Quiet-mode typed-icon chips (Decision 56 -- base UI, no creature art yet).
  // Launch roster: example, intuition, chat, and quiz are all wired
  // (Decision 65: "enable both" chat and quiz, remove "coming soon").
  //
  // `panelOpen`: whether a chat/quiz conversation panel is currently open.
  //   The in-situ creatures (example, intuition) stay available regardless --
  //   a student can summon an example without closing their chat. Only chat
  //   and quiz are hidden while a panel is open (one conversation panel at a
  //   time; quiz is itself a conversation), and a "Quote into conversation"
  //   action is offered instead so a selection can be pulled into the chat.
  export let top = 0;
  export let left = 0;
  export let panelOpen = false;
  export let onSelect = (_creatureType) => {};
  export let onQuote = () => {};

  const IN_SITU = [
    { type: 'example', label: 'Ex.', title: 'Example' },
    { type: 'intuition', label: 'Int.', title: 'Intuition' },
    { type: 'detail', label: 'Det.', title: 'Detail — unpack the omitted steps' },
    { type: 'justify', label: 'Just.', title: 'Justify — why is this true?' },
    { type: 'counterexample', label: 'CtEx.', title: 'Counterexample — where does this fail?' },
    { type: 'fun', label: 'Fun', title: 'Fun — a playful, memorable take' },
    { type: 'applet', label: 'App.', title: 'Applet — an editable interactive Sage demo' }
  ];
  const CONVERSATION = [
    { type: 'chat', label: 'Chat', title: 'Chat' },
    { type: 'quiz', label: 'Quiz', title: 'Quiz' }
  ];

  $: creatures = panelOpen ? IN_SITU : [...IN_SITU, ...CONVERSATION];
</script>

<div class="creature-toolbar" style="top:{top}px; left:{left}px" role="toolbar" aria-label="AI study tools">
  {#each creatures as c (c.type)}
    <button
      class="creature-chip"
      data-creature={c.type}
      title={c.title}
      on:click={() => onSelect(c.type)}
    >
      {c.label}
    </button>
  {/each}
  {#if panelOpen}
    <button class="creature-chip quote-chip" type="button" on:click={onQuote}>
      Quote into conversation
    </button>
  {/if}
</div>
