import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chatStore } from '../src/lib/stores/chatStore.js';

describe('chatStore (Decision 65 chat/quiz panel conversation state)', () => {
  beforeEach(() => {
    chatStore.close();
  });

  it('starts closed', () => {
    expect(get(chatStore).open).toBe(false);
  });

  it('open() sets creatureType/anchor/openingQuote and resets any prior transcript', () => {
    const anchor = { xml_id: 'S1.p1', block: { content_hash: 'h1' } };
    chatStore.open({ creatureType: 'chat', selectionText: 'the selected passage', anchor, chapterNum: 3 });
    const s = get(chatStore);
    expect(s.open).toBe(true);
    expect(s.creatureType).toBe('chat');
    expect(s.openingQuote).toBe('the selected passage');
    expect(s.anchor).toBe(anchor);
    expect(s.chapterNum).toBe(3);
    expect(s.messages).toEqual([]);
    expect(s.scope).toBe('chapter');
  });

  it('open() with no selection text (e.g. quiz from a bare section click) leaves openingQuote null', () => {
    chatStore.open({ creatureType: 'quiz', selectionText: '', anchor: null, chapterNum: 1 });
    expect(get(chatStore).openingQuote).toBeNull();
  });

  it('close() destroys the conversation entirely (Decision 41/66: nothing persists)', () => {
    chatStore.open({ creatureType: 'chat', selectionText: 'x', anchor: null, chapterNum: 1 });
    chatStore.appendUserTurn({ text: 'hello' });
    chatStore.close();
    expect(get(chatStore)).toEqual({
      open: false,
      creatureType: null,
      scope: 'chapter',
      openingQuote: null,
      anchor: null,
      chapterNum: null,
      messages: [],
      draftQuote: null
    });
  });

  it('appendUserTurn then appendAssistantDelta/finalizeAssistantTurn builds a turn pair', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.appendUserTurn({ text: 'what is x?' });
    chatStore.appendAssistantDelta('x is ');
    chatStore.appendAssistantDelta('the base point.');
    let s = get(chatStore);
    expect(s.messages).toEqual([
      { role: 'user', text: 'what is x?', quote: null },
      { role: 'assistant', text: 'x is the base point.', streaming: true }
    ]);
    chatStore.finalizeAssistantTurn();
    s = get(chatStore);
    expect(s.messages[1].streaming).toBe(false);
  });

  it('appendAssistantDelta after finalize starts a NEW assistant message rather than appending to the old one', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.appendUserTurn({ text: 'q1' });
    chatStore.appendAssistantDelta('a1');
    chatStore.finalizeAssistantTurn();
    chatStore.appendUserTurn({ text: 'q2' });
    chatStore.appendAssistantDelta('a2');
    const s = get(chatStore);
    expect(s.messages.map((m) => m.text)).toEqual(['q1', 'a1', 'q2', 'a2']);
  });

  it('dropEmptyAssistantTurn removes a trailing assistant turn with no content', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.appendUserTurn({ text: 'q' });
    chatStore.appendAssistantDelta('');
    chatStore.dropEmptyAssistantTurn();
    expect(get(chatStore).messages).toEqual([{ role: 'user', text: 'q', quote: null }]);
  });

  it('queueQuote/clearDraftQuote and appendUserTurn consuming a quote', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.queueQuote('an excerpt from the reader');
    expect(get(chatStore).draftQuote).toBe('an excerpt from the reader');
    chatStore.appendUserTurn({ text: 'is this related?', quote: get(chatStore).draftQuote });
    chatStore.clearDraftQuote();
    const s = get(chatStore);
    expect(s.draftQuote).toBeNull();
    expect(s.messages[0]).toEqual({
      role: 'user',
      text: 'is this related?',
      quote: 'an excerpt from the reader'
    });
  });

  it('setScope("book") inserts a centered transcript note; toggling back inserts the reverse note', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.setScope('book');
    let s = get(chatStore);
    expect(s.scope).toBe('book');
    expect(s.messages).toEqual([{ role: 'note', text: '— now reading the whole book —' }]);

    chatStore.setScope('chapter');
    s = get(chatStore);
    expect(s.scope).toBe('chapter');
    expect(s.messages[1]).toEqual({ role: 'note', text: '— now reading this chapter —' });
  });

  it('setScope is a no-op (no duplicate note) when the scope does not actually change', () => {
    chatStore.open({ creatureType: 'chat', selectionText: null, anchor: null, chapterNum: 1 });
    chatStore.setScope('chapter'); // already 'chapter'
    expect(get(chatStore).messages).toEqual([]);
  });

  it('close() destroys the conversation entirely (the panel × control)', () => {
    // Decision 68: the explicit "new conversation" button was removed as not
    // useful enough -- close-and-reselect covers the same need.
    const anchor = { xml_id: 'S1.p1', block: { content_hash: 'h1' } };
    chatStore.open({ creatureType: 'quiz', selectionText: 'a section', anchor, chapterNum: 2 });
    chatStore.appendUserTurn({ text: 'Quiz me on this section.' });
    chatStore.appendAssistantDelta('What kind of quiz would you like?');
    chatStore.close();
    const s = get(chatStore);
    expect(s.open).toBe(false);
    expect(s.creatureType).toBeNull();
    expect(s.messages).toEqual([]);
  });
});
