// Pure helpers for turning the chat/quiz panel's local conversation state
// (Decision 65) into the wire payload the backend expects, and for the
// "quote a passage into the conversation" formatting used in two places:
//   1. Opening context (spec item 3): the text the reader selected before
//      opening the panel is shown as a quoted block at the top of the
//      transcript, and is folded into the FIRST user turn's content sent to
//      the backend (the backend has no separate channel for it -- Decision
//      66's client-owns-history means everything rides in `messages`).
//   2. Quote-into-conversation (spec item 6): selecting reader text while the
//      panel is open queues an excerpt that gets prepended to whatever the
//      student types next, the same way.
//
// No Svelte here on purpose -- this is the part of the panel that's cheap to
// unit test without a DOM (mirrors mathSegmenter.js / solutionSegmenter.js).

// Renders `text` as a markdown-style blockquote (each line prefixed "> "),
// followed by a blank line, so it reads as a quoted excerpt ahead of the
// student's own words in the same message.
export function quoteBlock(text) {
  const quoted = String(text)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${quoted}\n\n`;
}

// Builds the `content` string for a single local message, folding in its
// quote (if any) as a leading blockquote.
export function messageContent(message) {
  if (message.quote) {
    return quoteBlock(message.quote) + message.text;
  }
  return message.text;
}

// Assembles the exact `messages: [{role, content}]` array to send to
// /api/generate from the panel's local message list plus the opening
// context captured when the panel was opened (spec item 3).
//
// - `note` role entries (scope-toggle transcript notes, spec item 4) are
//   transcript-only annotations, never sent to the backend.
// - The opening context (the originally-selected passage) is prepended, as a
//   quote block, to the content of the FIRST user-role message only -- it
//   already renders as its own fixed block at the top of the transcript, so
//   it isn't also stored as that message's `quote` field (that would double
//   it up in the UI); this function is the one place it gets folded in for
//   the wire payload.
// The first-turn assembly proper (spec TESTS: "selection -> quoted user
// turn"): given the text the reader had selected before opening the panel
// and the student's own first message (may be '' for quiz's automatic
// opening turn, spec item 7), produces the `content` string for that turn.
export function assembleFirstUserTurn(selectionText, userText) {
  if (!selectionText) return userText;
  return quoteBlock(selectionText) + userText;
}

export function buildApiMessages(messages, openingQuote) {
  const out = [];
  let firstUserSeen = false;
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue; // drop notes
    let content = messageContent(m);
    if (!firstUserSeen && m.role === 'user') {
      firstUserSeen = true;
      if (openingQuote) {
        content = assembleFirstUserTurn(openingQuote, content);
      }
    }
    out.push({ role: m.role, content });
  }
  return out;
}
