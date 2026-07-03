// Minimal Server-Sent-Events (text/event-stream) frame parser.
//
// EventSource can't POST, so /api/generate is consumed via fetch() +
// ReadableStream (see api.js). That means we get raw bytes/text, not
// pre-parsed events -- this module does the parsing by hand, incrementally,
// so it works across chunk boundaries that split a frame in the middle.
//
// SSE framing rules implemented here (see the WHATWG HTML spec, "Server-sent
// events"):
//   - Frames are separated by a blank line: "\n\n" (CRLF is normalized to LF).
//   - Within a frame, lines are "field: value" (a single leading space after
//     the colon is stripped); "field:value" with no space is also accepted.
//   - Lines starting with ":" are comments and ignored.
//   - Multiple "data:" lines in one frame are joined with "\n".
//   - A frame with no "data:" line at all produces no event (per spec, an
//     event with empty data is still dispatched only if "data:" appeared at
//     least once; we treat "no data lines" as "nothing to report" since
//     every frame this backend sends carries a JSON data payload).
//   - "id" and "retry" fields are accepted by the grammar but unused here --
//     this app doesn't reconnect/resume a generation stream.
export class SSEParser {
  constructor() {
    this._buffer = '';
  }

  // Feed a chunk of decoded text; returns any complete events found so far.
  push(chunkText) {
    this._buffer += chunkText;
    return this._consumeFrames(false);
  }

  // Call once the stream has ended, in case the server's final frame wasn't
  // followed by a trailing blank line.
  flush() {
    return this._consumeFrames(true);
  }

  _consumeFrames(isFinal) {
    const events = [];
    this._buffer = this._buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let sep;
    while ((sep = this._buffer.indexOf('\n\n')) !== -1) {
      const rawFrame = this._buffer.slice(0, sep);
      this._buffer = this._buffer.slice(sep + 2);
      const evt = parseFrame(rawFrame);
      if (evt) events.push(evt);
    }

    if (isFinal && this._buffer.trim().length > 0) {
      const evt = parseFrame(this._buffer);
      this._buffer = '';
      if (evt) events.push(evt);
    }

    return events;
  }
}

function parseFrame(rawFrame) {
  const lines = rawFrame.split('\n');
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line === '' || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    let field;
    let value;
    if (idx === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, idx);
      value = line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // "id" / "retry" / unknown fields: intentionally ignored (see header note).
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
