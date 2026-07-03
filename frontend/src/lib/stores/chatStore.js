import { writable } from 'svelte/store';

// Chat/quiz side-panel conversation state (Decision 65, spec's "BUILD"
// section). One panel at a time, and the panel OWNS the conversation --
// nothing here is ever persisted (Decision 41/66): closing the panel (or
// hitting "+ New conversation") just discards this store's state.
//
// Message shape: { role: 'user' | 'assistant' | 'note', text, quote?, streaming? }
//   - 'note' entries are the quiet centered scope-toggle annotations (spec
//     item 4, e.g. "— now reading the whole book —"); transcript-only, never
//     sent to the backend (see conversationAssembly.js's buildApiMessages).
//   - `quote` (user turns only): an excerpt quoted into that turn via the
//     "Quote into conversation" action (spec item 6); rendered as its own
//     blockquote-styled block above the typed text.
//   - `streaming` (assistant turns only): true while more deltas may still
//     arrive for this turn; the panel keeps appending into the same message
//     rather than starting a new one.
function initialState() {
  return {
    open: false,
    creatureType: null, // 'chat' | 'quiz'
    scope: 'chapter', // 'chapter' | 'book' -- Decision 51's "amp up" toggle; chat-only UI, but rides every request
    openingQuote: null, // the selection that was live when the panel opened (spec item 3)
    anchor: null, // { xml_id, block } -- resolveSelectionAnchor's shape, for block_hash
    chapterNum: null,
    messages: [],
    draftQuote: null // queued via "Quote into conversation"; consumed by the next sent turn
  };
}

function createChatStore() {
  const { subscribe, set, update } = writable(initialState());

  return {
    subscribe,

    // Opens the panel for a freshly-summoned chat or quiz creature. Replaces
    // any previous panel state outright -- "one panel at a time" (spec item 1).
    open({ creatureType, selectionText, anchor, chapterNum }) {
      set({
        ...initialState(),
        open: true,
        creatureType,
        openingQuote: selectionText || null,
        anchor: anchor || null,
        chapterNum: chapterNum ?? null
      });
    },

    // Closes (destroys) the conversation entirely (spec item 1: the × control).
    close() {
      set(initialState());
    },

    // "+ New conversation" (spec item 6): confirm-free reset that keeps the
    // panel open on the same creature/anchor but throws away the transcript.
    newConversation() {
      update((s) => ({
        ...initialState(),
        open: true,
        creatureType: s.creatureType,
        openingQuote: s.openingQuote,
        anchor: s.anchor,
        chapterNum: s.chapterNum
      }));
    },

    // Context selector toggle (spec item 4, chat only): switching scope
    // inserts a quiet centered transcript note, in either direction.
    setScope(newScope) {
      update((s) => {
        if (s.scope === newScope) return s;
        const note =
          newScope === 'book' ? '— now reading the whole book —' : '— now reading this chapter —';
        return { ...s, scope: newScope, messages: [...s.messages, { role: 'note', text: note }] };
      });
    },

    // Queues an excerpt (from the "Quote into conversation" selection-toolbar
    // action, spec item 6) to be prepended to the next turn the student sends.
    queueQuote(text) {
      update((s) => ({ ...s, draftQuote: text }));
    },

    clearDraftQuote() {
      update((s) => ({ ...s, draftQuote: null }));
    },

    // Appends a completed user turn (spec: student's typed text, plus
    // whatever quote -- if any -- was queued for it).
    appendUserTurn({ text, quote }) {
      update((s) => ({
        ...s,
        messages: [...s.messages, { role: 'user', text, quote: quote || null }]
      }));
    },

    // Starts (or continues) the assistant's streaming reply: each SSE delta
    // is folded into the same trailing assistant message rather than
    // starting a new one, mirroring inSituResult.js's accumulate-and-rerender
    // approach.
    appendAssistantDelta(delta) {
      update((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          messages[messages.length - 1] = { ...last, text: last.text + delta };
        } else {
          messages.push({ role: 'assistant', text: delta, streaming: true });
        }
        return { ...s, messages };
      });
    },

    // Marks the trailing assistant turn as complete (the SSE `done` event) --
    // mirrors mathRender's streaming:false finalize rule for a dangling
    // [[solution]] marker (Decision 62).
    finalizeAssistantTurn() {
      update((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, streaming: false };
        }
        return { ...s, messages };
      });
    },

    // Drops a trailing assistant turn that never received any content (e.g.
    // an error arrived before the first delta) -- nothing worth keeping.
    dropEmptyAssistantTurn() {
      update((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant' && last.text === '') {
          messages.pop();
        }
        return { ...s, messages };
      });
    }
  };
}

export const chatStore = createChatStore();
