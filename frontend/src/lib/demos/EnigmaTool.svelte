<script>
  // Enigma I simulator: pick rotors, start positions and plugboard leads,
  // then type (or click) letters — the lampboard lights the enciphered
  // letter and the rotor windows advance, exactly as on the machine. Reset
  // returns the rotors to the configured start so a message can be decrypted
  // by typing the ciphertext back in (enigma symmetry).
  import DemoShell from './DemoShell.svelte';
  import { createEnigma } from './enigma.js';

  export let open = false;

  const ROTOR_NAMES = ['I', 'II', 'III', 'IV', 'V'];
  const ALPHA = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  // the machine's historical keyboard rows
  const KEY_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'].map((r) => [...r]);

  let sel = ['I', 'II', 'III']; // left, middle, right
  let startPos = ['A', 'A', 'A'];
  let rings = ['A', 'A', 'A'];
  let plugText = 'AB CD';
  let showAdvanced = false;

  let machine = null;
  let error = '';
  let positions = 'AAA';
  let inputTape = '';
  let outputTape = '';
  let lamp = null;

  $: configure(sel[0], sel[1], sel[2], startPos.join(''), rings.join(''), plugText);

  function configure() {
    error = '';
    lamp = null;
    inputTape = '';
    outputTape = '';
    if (new Set(sel).size !== 3) {
      error = 'choose three different rotors';
      machine = null;
      return;
    }
    try {
      machine = createEnigma({
        rotors: [...sel],
        positions: startPos.join(''),
        rings: rings.join(''),
        plugboard: plugText
      });
      positions = machine.positions;
    } catch (e) {
      error = e.message;
      machine = null;
    }
  }

  function pressKey(letter) {
    if (!machine) return;
    const out = machine.press(letter);
    if (!out) return;
    inputTape += letter.toUpperCase();
    outputTape += out;
    lamp = out;
    positions = machine.positions;
  }

  function reset() {
    if (!machine) return;
    machine.reset();
    positions = machine.positions;
    inputTape = '';
    outputTape = '';
    lamp = null;
  }

  function onKeydown(e) {
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      pressKey(e.key);
    }
  }

  const grouped = (tape) => tape.replace(/(.{5})/g, '$1 ').trim();
</script>

<DemoShell title="Enigma Machine Simulator" {open}>
  <div class="machine" role="application" aria-label="Enigma machine simulator" tabindex="0" on:keydown={onKeydown}>
    <div class="settings">
      {#each ['left', 'middle', 'right'] as slot, i}
        <label class="setting">
          {slot} rotor
          <select bind:value={sel[i]}>
            {#each ROTOR_NAMES as name}<option value={name}>{name}</option>{/each}
          </select>
          <select bind:value={startPos[i]} aria-label={slot + ' start position'}>
            {#each ALPHA as ch}<option value={ch}>{ch}</option>{/each}
          </select>
        </label>
      {/each}
      <label class="setting plug">
        plugboard pairs
        <input type="text" bind:value={plugText} spellcheck="false" placeholder="e.g. AB CD" />
      </label>
      <button class="advanced-toggle" type="button" on:click={() => (showAdvanced = !showAdvanced)}>
        {showAdvanced ? 'hide' : 'show'} ring settings
      </button>
      {#if showAdvanced}
        <label class="setting">
          rings
          {#each rings as _, i}
            <select bind:value={rings[i]} aria-label={'ring setting ' + (i + 1)}>
              {#each ALPHA as ch}<option value={ch}>{ch}</option>{/each}
            </select>
          {/each}
        </label>
      {/if}
    </div>
    {#if error}
      <p class="demo-error">{error}</p>
    {/if}

    <div class="windows" aria-label="rotor windows">
      {#each [...positions] as ch}
        <span class="window">{ch}</span>
      {/each}
      <button class="reset" type="button" on:click={reset}>Reset machine</button>
    </div>

    <div class="board lampboard" aria-label="lampboard">
      {#each KEY_ROWS as row}
        <div class="row">
          {#each row as ch}
            <span class="lamp" class:lit={lamp === ch}>{ch}</span>
          {/each}
        </div>
      {/each}
    </div>

    <div class="board keyboard" aria-label="keyboard">
      {#each KEY_ROWS as row}
        <div class="row">
          {#each row as ch}
            <button class="key" type="button" on:click={() => pressKey(ch)}>{ch}</button>
          {/each}
        </div>
      {/each}
    </div>

    <div class="tapes">
      <div class="tape"><span class="tape-label">typed</span> <span class="tape-text">{grouped(inputTape)}</span></div>
      <div class="tape"><span class="tape-label">lit up</span> <span class="tape-text out">{grouped(outputTape)}</span></div>
    </div>

    <p class="demo-note">Click the keys (or focus the machine and type). The rotors step
      <em>before</em> each letter lights. To decrypt, press <em>Reset machine</em> — returning the
      rotors to the start position — and type the ciphertext: the plaintext lights up.</p>
  </div>
</DemoShell>

<style>
  .machine { flex: 1 1 100%; outline: none; }
  .machine:focus-visible { box-shadow: 0 0 0 2px var(--accent-teal, #2b6b66); border-radius: 8px; }

  .settings { display: flex; flex-wrap: wrap; gap: 0.7rem 1.1rem; align-items: flex-end; margin-bottom: 0.6rem; }
  .setting { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem;
             font-variant-caps: small-caps; letter-spacing: 0.05em; color: var(--color-ink-soft, #55493a); }
  .setting select, .setting input {
    font-family: inherit; font-size: 0.85rem; padding: 0.15rem 0.3rem;
    border: 1px solid var(--color-rule, #d9c9a3); border-radius: 5px;
    background: var(--color-bg, #f4ecd8); color: var(--color-ink, #2b2117);
  }
  .setting { flex-direction: row; align-items: center; gap: 0.3rem; }
  .setting.plug input { width: 9rem; text-transform: uppercase; letter-spacing: 0.1em; }
  .advanced-toggle {
    font-family: inherit; font-size: 0.72rem; font-variant-caps: small-caps;
    border: none; background: none; color: var(--accent-teal, #2b6b66);
    cursor: pointer; padding: 0; text-decoration: underline dotted;
  }

  .windows { display: flex; align-items: center; gap: 0.4rem; margin: 0.6rem 0; }
  .window {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.9rem; height: 2.3rem; font-size: 1.25rem; font-weight: 600;
    background: var(--color-ink, #2b2117); color: var(--color-bg, #f4ecd8);
    border-radius: 4px; border: 2px solid var(--color-rule, #d9c9a3);
  }
  .reset {
    margin-left: 0.8rem; font-family: inherit; font-size: 0.8rem;
    padding: 0.3rem 0.8rem; border: 1px solid var(--color-rule, #d9c9a3); border-radius: 6px;
    background: var(--color-bg-raised, #ede2c8); color: var(--color-ink, #2b2117); cursor: pointer;
  }
  .reset:hover { border-color: var(--accent-red, #a03123); }

  .board { margin: 0.45rem 0; }
  .row { display: flex; gap: 0.3rem; justify-content: center; margin-bottom: 0.3rem; }
  .lamp {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.7rem; height: 1.7rem; border-radius: 50%;
    border: 1px solid var(--color-rule, #d9c9a3);
    background: var(--color-bg, #f4ecd8); color: var(--color-ink-soft, #55493a);
    font-size: 0.85rem;
  }
  .lamp.lit {
    background: var(--accent-gold, #a97917); color: #fff8e0;
    border-color: var(--accent-gold, #a97917); font-weight: 700;
    box-shadow: 0 0 10px var(--accent-gold, #a97917);
  }
  .lampboard { padding: 0.4rem 0; border: 1px solid var(--color-rule, #d9c9a3); border-radius: 8px;
               background: var(--color-bg-raised, #ede2c8); }
  .key {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.9rem; height: 1.9rem; border-radius: 50%;
    border: 2px solid var(--color-ink-soft, #55493a);
    background: var(--color-ink, #2b2117); color: var(--color-bg, #f4ecd8);
    font-family: inherit; font-size: 0.9rem; cursor: pointer;
  }
  .key:active { transform: translateY(1px); }

  .tapes { margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .tape { display: flex; gap: 0.6rem; align-items: baseline; }
  .tape-label { font-size: 0.7rem; font-variant-caps: small-caps; letter-spacing: 0.06em;
                color: var(--color-ink-soft, #55493a); width: 3.2rem; text-align: right; }
  .tape-text { font-family: ui-monospace, 'Courier New', monospace; letter-spacing: 0.12em;
               min-height: 1.2em; word-break: break-all; }
  .tape-text.out { color: var(--accent-gold, #a97917); font-weight: 600; }
</style>
