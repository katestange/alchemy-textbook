<script>
  // Chat/quiz side panel (Decision 65). Pushes the reading column (see
  // ReadingPane.svelte's `.reading-layout` flex wrapper); this component
  // owns the transcript UI, streaming send flow, and error handling. All
  // conversation *state* lives in chatStore.js (kept separate so it's
  // testable without mounting Svelte -- see tests/chatStore.test.js).
  import { tick, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { chatStore } from '../stores/chatStore.js';
  import { session } from '../stores/session.js';
  import { budgetNotice, refreshRequired } from '../stores/banners.js';
  import { manifestStore } from '../stores/manifestStore.js';
  import { streamGenerate } from '../api.js';
  import { buildApiMessages } from '../conversationAssembly.js';
  import { renderStreamedMath } from '../mathRender.js';

  let inputText = '';
  let sending = false;
  let panelError = null;
  let transcriptEl;

  const TITLE = { chat: 'Chat', quiz: 'Quiz' };

  $: title = TITLE[$chatStore.creatureType] || 'Chat';
  $: washClass = $chatStore.creatureType === 'quiz' ? 'wash-quiz' : 'wash-chat';

  // Auto-scroll to the newest turn whenever the transcript changes.
  $: if ($chatStore.messages) {
    scrollToBottom();
  }

  function scrollToBottom() {
    tick().then(() => {
      if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
    });
  }

  onMount(() => {
    // Quiz opening (spec BUILD item 7): sends an automatic first turn so the
    // raven immediately responds asking what kind of quiz.
    if ($chatStore.creatureType === 'quiz' && $chatStore.messages.length === 0) {
      sendTurn('Quiz me on this section.');
    }
  });

  async function sendTurn(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || sending) return;
    panelError = null;

    const quote = get(chatStore).draftQuote;
    chatStore.appendUserTurn({ text: trimmed, quote });
    chatStore.clearDraftQuote();
    inputText = '';
    sending = true;

    const snapshot = get(chatStore);
    const apiMessages = buildApiMessages(snapshot.messages, snapshot.openingQuote);

    let gotContent = false;
    await streamGenerate(
      {
        creatureType: snapshot.creatureType,
        blockHash: snapshot.anchor && snapshot.anchor.block ? snapshot.anchor.block.content_hash : null,
        selectionText: snapshot.openingQuote,
        prompt: null,
        buildVersion: $manifestStore.buildVersion,
        messages: apiMessages,
        scope: snapshot.scope
      },
      (event, data) => {
        if (event === 'delta') {
          gotContent = true;
          chatStore.appendAssistantDelta(data.text || '');
        } else if (event === 'done') {
          chatStore.finalizeAssistantTurn();
          handleCaptured(data.captured, snapshot);
          if (typeof data.budget_remaining_microdollars === 'number') {
            session.updateBudget(data.budget_remaining_microdollars);
          } else if (
            typeof data.cost_microdollars === 'number' &&
            $session.budgetRemainingMicrodollars != null
          ) {
            session.updateBudget(Math.max(0, $session.budgetRemainingMicrodollars - data.cost_microdollars));
          }
          sending = false;
        } else if (event === 'error') {
          if (!gotContent) chatStore.dropEmptyAssistantTurn();
          handleError(data);
          sending = false;
        }
      }
    );
  }

  // Hide the capture-control tokens from the transcript; their effect (a
  // pinned eureka / a forwarded question) is surfaced as a note instead.
  function chatText(t) {
    return (t || '').replace(/\[\[EUREKA\]\]/g, '').replace(/\[\[TEXTBOOK_QUESTION\]\]/g, '');
  }

  // A conversation can leave two things behind (server-side, Decision 41): a
  // eureka pinned to the margin, or a question forwarded to the instructor.
  function handleCaptured(captured, snapshot) {
    if (!Array.isArray(captured)) return;
    for (const c of captured) {
      if (c.creature_type === 'eureka') {
        chatStore.appendNote('💡 Pinned to your margin as a eureka.');
        const xmlId = snapshot.anchor && snapshot.anchor.xml_id;
        if (xmlId) {
          document.dispatchEvent(
            new CustomEvent('alchemy:eureka', {
              detail: {
                xmlId,
                contentHash: c.content_hash,
                text: c.text,
                selectionText: snapshot.openingQuote
              }
            })
          );
        }
      } else if (c.creature_type === 'suggested_question') {
        chatStore.appendNote('📩 Sent to your instructor as a suggested textbook question.');
      }
    }
  }

  function handleError(data) {
    const code = data && data.code;
    if (code === 'refresh_required') {
      refreshRequired.set(true);
      panelError = 'The textbook was updated — refresh the page to continue.';
    } else if (code === 'budget_exceeded') {
      budgetNotice.set(
        'You have used up your AI budget for this course. Cached content is still available.'
      );
    } else if (code === 'auth_required') {
      session.reset();
    } else if (code === 'conversation_too_long') {
      panelError =
        "This conversation has grown long enough to bump into the model's limits — start a new conversation to keep going.";
    } else {
      panelError = 'Something went wrong. Please try again.';
    }
  }

  function submit() {
    sendTurn(inputText);
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onScopeChange(e) {
    chatStore.setScope(e.target.value);
  }

  function cancelQuote() {
    chatStore.clearDraftQuote();
  }

  // Event delegation for [[solution]] reveal toggles rendered inside
  // {@html ...} message bodies -- mirrors inSituResult.js's
  // wireSolutionToggles, but as one delegated listener on the transcript
  // container since messages come and go as a dynamic Svelte #each list
  // rather than one static vanilla-DOM box.
  function onTranscriptClick(e) {
    const btn = e.target.closest && e.target.closest('.solution-toggle-btn');
    if (!btn) return;
    const wrap = btn.closest('.solution-toggle');
    if (!wrap) return;
    const revealed = wrap.classList.toggle('revealed');
    btn.innerHTML = revealed ? 'Hide solution &#9662;' : 'Show solution &#9656;';
    btn.setAttribute('aria-expanded', String(revealed));
    const content = wrap.querySelector('.solution-content');
    if (content) content.hidden = !revealed;
  }
</script>

<div class="chat-panel {washClass}" role="complementary" aria-label="{title} panel">
  <div class="chat-panel-header">
    <span class="chat-panel-title">{title}</span>
    <div class="chat-panel-header-actions">
      <button
        type="button"
        class="chat-panel-close"
        on:click={() => chatStore.close()}
        aria-label="Close {title} panel"
      >
        ✕
      </button>
    </div>
  </div>

  {#if $chatStore.creatureType === 'chat'}
    <div class="context-selector">
      <label>
        Reading:
        <select value={$chatStore.scope} on:change={onScopeChange}>
          <option value="chapter">this chapter</option>
          <option value="book">the whole book (~4× faster budget use)</option>
        </select>
      </label>
      {#if $chatStore.scope === 'book'}
        <span class="cost-hint">Reading the whole book uses your budget ~4× faster.</span>
      {/if}
    </div>
  {/if}

  <div class="chat-transcript" bind:this={transcriptEl} on:click={onTranscriptClick}>
    {#if $chatStore.openingQuote}
      <div class="opening-context">
        <span class="opening-label">You're asking about:</span>
        <blockquote>{$chatStore.openingQuote}</blockquote>
      </div>
    {/if}

    {#each $chatStore.messages as m, i (i)}
      {#if m.role === 'note'}
        <div class="transcript-note">{m.text}</div>
      {:else if m.role === 'user'}
        <div class="turn turn-user">
          {#if m.quote}
            <blockquote class="turn-quote">{m.quote}</blockquote>
          {/if}
          <div class="turn-body">{@html renderStreamedMath(m.text)}</div>
        </div>
      {:else}
        <div class="turn turn-assistant">
          <div class="turn-body">{@html renderStreamedMath(chatText(m.text), { streaming: !!m.streaming })}</div>
        </div>
      {/if}
    {/each}
  </div>

  {#if panelError}
    <div class="chat-panel-error" role="alert">{panelError}</div>
  {/if}

  {#if $chatStore.draftQuote}
    <div class="draft-quote">
      <span class="draft-quote-label">Quoting:</span>
      <span class="draft-quote-text">{$chatStore.draftQuote}</span>
      <button type="button" class="draft-quote-cancel" on:click={cancelQuote} aria-label="Remove quote">
        ✕
      </button>
    </div>
  {/if}

  <div class="chat-input-row">
    <textarea
      bind:value={inputText}
      on:keydown={onKeydown}
      placeholder={$chatStore.creatureType === 'quiz'
        ? 'Answer, or ask for a different kind of quiz…'
        : 'Ask a question…'}
      aria-label="Message"
      disabled={sending}
    ></textarea>
    <button type="button" class="send-btn" on:click={submit} disabled={sending || !inputText.trim()}>
      Send
    </button>
  </div>

  <div class="ephemerality-notice">
    Conversations aren't saved anywhere. When you close this panel, it's gone.
    {#if $chatStore.creatureType === 'quiz'}
      <br />📩 Like a question? Say “add that to the textbook” to forward it to your instructor.
    {:else}
      <br />💡 Want to keep an insight? Say “capture this as a eureka” — it pins a note to your margin (the one thing that's kept).
    {/if}
  </div>
</div>
