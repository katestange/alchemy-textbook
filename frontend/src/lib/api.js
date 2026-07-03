// Thin fetch wrappers for the backend API contract (spec.md Q13 + the task's
// API CONTRACT). Auth is the HttpOnly, SameSite=Lax session cookie set by
// /api/claim (Q5) -- we never read or store the token ourselves; every call
// just needs `credentials: 'same-origin'` so the browser attaches it.
import { SSEParser } from './sse.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status}`);
  }
  return res.json();
}

export function fetchManifest() {
  return getJSON('/api/manifest');
}

export function fetchChapters() {
  return getJSON('/api/chapters');
}

export async function fetchChapterHtml(n) {
  const res = await fetch(`/chapter/${n}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`GET /chapter/${n} failed: ${res.status}`);
  }
  return res.text();
}

export async function claimCode(code) {
  const res = await fetch('/api/claim', {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.detail || `claim failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body; // { ok, budget_remaining_microdollars }
}

// Session check on load: the auth token lives in an HttpOnly cookie, so the
// only way to know "am I already claimed?" after a reload is to ask.
export async function whoami() {
  try {
    const res = await fetch('/api/whoami', { credentials: 'same-origin' });
    if (!res.ok) return { ok: false };
    return await res.json(); // { ok, budget_remaining_microdollars? }
  } catch {
    return { ok: false };
  }
}

// Slice simplification (see README / spec step 5): we do NOT sweep all ~817
// manifest hashes on chapter load. Cached content is fetched on-demand only:
// when the user selects a block (to show any existing artifact immediately)
// and when a generation completes (to refresh with the server's canonical
// stored copy). A full-chapter sweep would mean dozens of speculative
// requests per page view for content most readers will never look at.
export function fetchCachedContent(blockHash) {
  return getJSON(`/api/content/${blockHash}`);
}

// One request per chapter view (NOT per block): all artifacts visible to the
// caller anchored anywhere in chapter n, so existing AI content appears as
// soon as the chapter renders (Q13: "place any cached creatures that already
// exist for the loaded chapter").
export function fetchChapterContent(n) {
  return getJSON(`/api/chapter-content/${n}`);
}

// Streams a generation over SSE-over-fetch. EventSource cannot POST, so the
// response body is consumed manually via ReadableStream + SSEParser (see
// sse.js) rather than the browser's built-in EventSource.
//
// onEvent(eventName, data) fires for every parsed SSE frame; `data` is the
// JSON.parse of the frame's `data:` payload ({event: 'delta', data: {text}},
// {event: 'done', data: {content_id, cost_microdollars, ...}}, or
// {event: 'error', data: {code}}).
export async function streamGenerate(
  { creatureType, blockHash, selectionText, prompt, buildVersion },
  onEvent
) {
  let res;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        creature_type: creatureType,
        block_hash: blockHash,
        selection_text: selectionText,
        prompt,
        build_version: buildVersion
      })
    });
  } catch (networkErr) {
    onEvent('error', { code: 'unknown_block', message: String(networkErr) });
    return;
  }

  if (!res.ok || !res.body) {
    // Non-streaming error path: e.g. the budget/build_version check failed
    // before the stream even opened (Q13: "the backend runs the budget check
    // before opening the stream").
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* no JSON body; fall through to generic error below */
    }
    onEvent('error', body.code ? body : { code: 'unknown_block' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();

  const dispatch = (evt) => {
    let data;
    try {
      data = JSON.parse(evt.data);
    } catch {
      data = evt.data;
    }
    onEvent(evt.event, data);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const evt of parser.push(decoder.decode(value, { stream: true }))) {
      dispatch(evt);
    }
  }
  for (const evt of parser.flush()) {
    dispatch(evt);
  }
}
