<script>
  // "The Daily Cryptogram" — a newspaper-style cryptogram puzzle. A random
  // cryptology saying is encrypted with a random substitution key (no letter
  // stands for itself, as in the newspaper puzzles). The reader pencils in
  // guesses via the alphabet at the bottom; guesses (and the solution) appear
  // in a handwriting face under each ciphertext letter.
  import DemoShell from './DemoShell.svelte';
  import { LETTERS, randomPuzzle } from './cryptogram.js';

  export let open = false;

  let puzzle = randomPuzzle();
  let guesses = {}; // cipher letter -> pencilled-in plain letter
  let showSolution = false;

  $: words = puzzle.cipher.split(' ').map((w) => [...w]);
  $: lettersInPuzzle = new Set([...puzzle.cipher].filter((ch) => /[A-Z]/.test(ch)));
  // plain letters pencilled in under two different cipher letters are conflicts
  $: guessCounts = Object.values(guesses).reduce((acc, g) => ((acc[g] = (acc[g] || 0) + 1), acc), {});

  function newPuzzle() {
    puzzle = randomPuzzle();
    guesses = {};
    showSolution = false;
  }

  function clearGuesses() {
    guesses = {};
  }

  function setGuess(cipherLetter, e) {
    const v = e.target.value.replace(/[^a-zA-Z]/g, '').slice(-1).toUpperCase();
    e.target.value = v; // a fresh keystroke replaces the old letter
    if (v) guesses = { ...guesses, [cipherLetter]: v };
    else {
      const { [cipherLetter]: _drop, ...rest } = guesses;
      guesses = rest; // blank the slot: nothing chosen for this letter
    }
  }
</script>

<DemoShell title="Cryptogram Puzzle" {open}>
  <div class="paper">
    <div class="masthead">
      <div class="mast-title">The Daily Cryptogram</div>
      <div class="mast-rule"></div>
      <div class="mast-sub">puzzles &amp; diversions &mdash; solve over breakfast</div>
    </div>

    <p class="howto">One letter stands for another throughout (a letter never stands for
      itself). Pencil your guesses into the alphabet below the puzzle.</p>

    <div class="puzzle" class:solved={showSolution}>
      {#each words as word}
        <span class="word">
          {#each word as ch}
            {#if /[A-Z]/.test(ch)}
              <span class="cell">
                <span class="cipher-letter">{ch}</span>
                <span class="hand" class:solution={showSolution}>
                  {showSolution ? puzzle.reverse[ch] : guesses[ch] || ' '}
                </span>
              </span>
            {:else}
              <span class="cell punct"><span class="cipher-letter">{ch}</span><span class="hand">&nbsp;</span></span>
            {/if}
          {/each}
        </span>
      {/each}
    </div>

    {#if showSolution}
      <p class="attribution">&mdash; {puzzle.saying.author}</p>
    {/if}

    <div class="alpha">
      <div class="alpha-label">your key so far (cipher letter above, your guess below):</div>
      <div class="alpha-grid">
        {#each [...LETTERS] as ch}
          <span class="alpha-cell" class:unused={!lettersInPuzzle.has(ch)}>
            <span class="alpha-letter">{ch}</span>
            <input
              class="alpha-input"
              class:conflict={guesses[ch] && guessCounts[guesses[ch]] > 1}
              type="text"
              maxlength="2"
              value={guesses[ch] || ''}
              aria-label={'your guess for cipher letter ' + ch}
              on:input={(e) => setGuess(ch, e)}
            />
          </span>
        {/each}
      </div>
      <p class="demo-note">Type a letter under any cipher letter to pencil it in everywhere;
        delete it to blank the slot again. Two slots sharing the same guess turn red.</p>
    </div>

    <div class="demo-controls">
      <button type="button" on:click={newPuzzle}>New puzzle</button>
      <button type="button" on:click={() => (showSolution = !showSolution)}>
        {showSolution ? 'Hide solution' : 'Show solution'}
      </button>
      <button type="button" on:click={clearGuesses}>Erase guesses</button>
    </div>
  </div>
</DemoShell>

<style>
  .paper {
    flex: 1 1 100%;
    border: 3px double var(--color-rule, #d9c9a3);
    background: var(--color-bg, #f4ecd8);
    padding: 1rem 1.2rem 0.8rem;
    font-family: var(--font-serif, Georgia, serif);
    color: var(--color-ink, #2b2117);
  }
  .masthead { text-align: center; margin-bottom: 0.6rem; }
  .mast-title {
    font-variant-caps: small-caps; font-weight: 700; font-size: 1.6rem;
    letter-spacing: 0.06em;
  }
  .mast-rule {
    border-top: 1px solid var(--color-ink, #2b2117);
    border-bottom: 3px double var(--color-ink, #2b2117);
    height: 5px; margin: 0.25rem 0;
  }
  .mast-sub {
    font-size: 0.72rem; font-variant-caps: small-caps; letter-spacing: 0.14em;
    color: var(--color-ink-soft, #55493a);
  }
  .howto { font-size: 0.82rem; font-style: italic; color: var(--color-ink-soft, #55493a); margin: 0.4rem 0 0.8rem; }

  .puzzle { display: flex; flex-wrap: wrap; gap: 0.9rem 1.1rem; justify-content: center; margin: 0.8rem 0 0.4rem; }
  .word { display: inline-flex; }
  .cell { display: inline-flex; flex-direction: column; align-items: center; width: 1.05rem; }
  .cell.punct { width: 0.6rem; }
  .cipher-letter { font-size: 0.95rem; letter-spacing: 0.02em; }
  .hand {
    font-family: var(--font-hand, cursive);
    font-size: 1.15rem; line-height: 1.1; min-height: 1.25rem;
    color: var(--accent-teal, #2b6b66);
    border-top: 1px solid var(--color-rule, #d9c9a3);
    width: 100%; text-align: center;
  }
  .cell.punct .hand { border-top: none; }
  .hand.solution { color: var(--accent-red, #a03123); }
  .attribution {
    text-align: right; font-family: var(--font-hand, cursive);
    color: var(--accent-red, #a03123); font-size: 1.1rem; margin: 0.2rem 0 0;
  }

  .alpha { margin-top: 1rem; border-top: 1px solid var(--color-rule, #d9c9a3); padding-top: 0.6rem; }
  .alpha-label { font-size: 0.72rem; font-variant-caps: small-caps; letter-spacing: 0.08em; color: var(--color-ink-soft, #55493a); }
  .alpha-grid { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.4rem; }
  .alpha-cell { display: flex; flex-direction: column; align-items: center; width: 1.55rem; }
  .alpha-cell.unused { opacity: 0.35; }
  .alpha-letter { font-size: 0.8rem; font-weight: 600; }
  .alpha-input {
    width: 1.45rem; padding: 0.05rem 0; text-align: center;
    font-family: var(--font-hand, cursive); font-size: 1.05rem;
    color: var(--accent-teal, #2b6b66);
    border: 1px solid var(--color-rule, #d9c9a3); border-radius: 4px;
    background: var(--color-bg-raised, #ede2c8);
  }
  .alpha-input.conflict { color: var(--accent-red, #a03123); border-color: var(--accent-red, #a03123); }

  .demo-controls { margin-top: 0.9rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .demo-controls button {
    font-family: inherit; font-size: 0.8rem; font-variant-caps: small-caps; letter-spacing: 0.04em;
    padding: 0.25rem 0.8rem; border: 1px solid var(--color-rule, #d9c9a3); border-radius: 6px;
    background: var(--color-bg-raised, #ede2c8); color: var(--color-ink, #2b2117); cursor: pointer;
  }
  .demo-controls button:hover { border-color: var(--accent-teal, #2b6b66); }
</style>
