import { describe, it, expect } from 'vitest';
import { SSEParser } from '../src/lib/sse.js';

describe('SSEParser', () => {
  it('parses a single complete frame', () => {
    const p = new SSEParser();
    const events = p.push('event: delta\ndata: {"text":"hi"}\n\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hi"}' }]);
  });

  it('defaults to event "message" when no event field is present', () => {
    const p = new SSEParser();
    const events = p.push('data: {"a":1}\n\n');
    expect(events).toEqual([{ event: 'message', data: '{"a":1}' }]);
  });

  it('joins multiple data lines with a newline', () => {
    const p = new SSEParser();
    const events = p.push('event: delta\ndata: line1\ndata: line2\n\n');
    expect(events).toEqual([{ event: 'delta', data: 'line1\nline2' }]);
  });

  it('ignores comment lines starting with ":"', () => {
    const p = new SSEParser();
    const events = p.push(':heartbeat\nevent: delta\ndata: {"text":"x"}\n\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"x"}' }]);
  });

  it('buffers a frame split across multiple push() calls (chunk boundary)', () => {
    const p = new SSEParser();
    let events = p.push('event: delta\ndata: {"tex');
    expect(events).toEqual([]);
    events = p.push('t":"hi"}\n\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hi"}' }]);
  });

  it('parses multiple frames delivered in one chunk, in order', () => {
    const p = new SSEParser();
    const events = p.push(
      'event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\n'
    );
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'delta', data: '{"text":"b"}' }
    ]);
  });

  it('handles CRLF line endings', () => {
    const p = new SSEParser();
    const events = p.push('event: delta\r\ndata: {"text":"hi"}\r\n\r\n');
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hi"}' }]);
  });

  it('picks up a final frame with no trailing blank line via flush()', () => {
    const p = new SSEParser();
    const midStream = p.push('event: delta\ndata: {"text":"a"}\n\nevent: done\ndata: {"content_id":1}');
    expect(midStream).toEqual([{ event: 'delta', data: '{"text":"a"}' }]);
    const final = p.flush();
    expect(final).toEqual([{ event: 'done', data: '{"content_id":1}' }]);
  });

  it('parses a terminal error event', () => {
    const p = new SSEParser();
    const events = p.push('event: error\ndata: {"code":"refresh_required"}\n\n');
    expect(events).toEqual([{ event: 'error', data: '{"code":"refresh_required"}' }]);
  });

  it('produces no event for a frame with no data line', () => {
    const p = new SSEParser();
    const events = p.push('event: delta\n\n');
    expect(events).toEqual([]);
  });
});
