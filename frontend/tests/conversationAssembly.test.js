import { describe, it, expect } from 'vitest';
import {
  quoteBlock,
  messageContent,
  assembleFirstUserTurn,
  buildApiMessages
} from '../src/lib/conversationAssembly.js';

describe('conversationAssembly (Decision 65 opening-context / quote-into-conversation wiring)', () => {
  it('quoteBlock prefixes every line with "> " and adds a trailing blank line', () => {
    expect(quoteBlock('one line')).toBe('> one line\n\n');
    expect(quoteBlock('line one\nline two')).toBe('> line one\n> line two\n\n');
  });

  it('assembleFirstUserTurn: selection -> quoted user turn', () => {
    expect(assembleFirstUserTurn('the selected passage', 'what does this mean?')).toBe(
      '> the selected passage\n\nwhat does this mean?'
    );
  });

  it('assembleFirstUserTurn: with no selection, the user text passes through untouched', () => {
    expect(assembleFirstUserTurn(null, 'hello')).toBe('hello');
    expect(assembleFirstUserTurn('', 'hello')).toBe('hello');
  });

  it('assembleFirstUserTurn: quiz\'s automatic opening turn (empty selection-derived text is fine too)', () => {
    expect(assembleFirstUserTurn('Section 3.2 text...', 'Quiz me on this section.')).toBe(
      '> Section 3.2 text...\n\nQuiz me on this section.'
    );
  });

  it('messageContent folds a per-message quote (quote-into-conversation) ahead of the typed text', () => {
    expect(messageContent({ role: 'user', text: 'is this right?', quote: 'an excerpt' })).toBe(
      '> an excerpt\n\nis this right?'
    );
    expect(messageContent({ role: 'user', text: 'no quote here' })).toBe('no quote here');
  });

  it('buildApiMessages drops "note" (scope-toggle) transcript entries', () => {
    const messages = [
      { role: 'user', text: 'hi' },
      { role: 'note', text: '— now reading the whole book —' },
      { role: 'assistant', text: 'hello!' }
    ];
    expect(buildApiMessages(messages, null)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' }
    ]);
  });

  it('buildApiMessages folds the opening context into the FIRST user turn only', () => {
    const messages = [
      { role: 'user', text: 'what does x mean?' },
      { role: 'assistant', text: 'x is the base point.' },
      { role: 'user', text: 'and y?' }
    ];
    const out = buildApiMessages(messages, 'Let E be an elliptic curve...');
    expect(out[0]).toEqual({
      role: 'user',
      content: '> Let E be an elliptic curve...\n\nwhat does x mean?'
    });
    expect(out[1]).toEqual({ role: 'assistant', content: 'x is the base point.' });
    // Second user turn is untouched by the opening quote.
    expect(out[2]).toEqual({ role: 'user', content: 'and y?' });
  });

  it('buildApiMessages: a per-turn quote (quote-into-conversation) on the first user message stacks with the opening quote', () => {
    const messages = [{ role: 'user', text: 'compare these', quote: 'a later excerpt' }];
    const out = buildApiMessages(messages, 'opening excerpt');
    expect(out[0].content).toBe(
      '> opening excerpt\n\n> a later excerpt\n\ncompare these'
    );
  });

  it('buildApiMessages: with no opening context, messages pass through via messageContent', () => {
    const messages = [
      { role: 'user', text: 'q', quote: 'excerpt' },
      { role: 'assistant', text: 'a' }
    ];
    expect(buildApiMessages(messages, null)).toEqual([
      { role: 'user', content: '> excerpt\n\nq' },
      { role: 'assistant', content: 'a' }
    ]);
  });

  it('buildApiMessages returns [] for an empty or all-notes history', () => {
    expect(buildApiMessages([], 'opening')).toEqual([]);
    expect(buildApiMessages([{ role: 'note', text: 'x' }], 'opening')).toEqual([]);
  });
});
