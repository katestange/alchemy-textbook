// Tiny mock backend for manual smoke-testing the frontend against the API
// contract, without the real FastAPI backend (which a sibling agent owns).
// NOT part of the build; run with `npm run mock-server` (defaults to :8000,
// matching vite.config.js's dev proxy target).
//
// Implements just enough of the contract to exercise every UI path:
//   GET  /api/manifest    -- proxies build/manifest.json, with a build_version added
//   GET  /api/chapters    -- proxies build/chapters.json
//   GET  /chapter/:n      -- proxies build/html/S:n.html
//   POST /api/claim       -- accepts any non-empty code
//   GET  /api/content/:hash -- returns [] unless the hash matches DEMO_HASH
//                              (seeded below) so the "hydrate on selection"
//                              path has something to show
//   POST /api/generate    -- streams canned SSE deltas, including inline and
//                            display math, to exercise the Temml buffering
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../'); // frontend/mock-server -> repo root
const BUILD_DIR = path.join(REPO_ROOT, 'build');

const PORT = process.env.MOCK_PORT || 8000;
const BUILD_VERSION = 'mock-build-0001';

// Filled in lazily from build/manifest.json's first anchorable block so the
// "hydrate existing content on selection" demo has a real block_hash to key
// off of.
let DEMO_HASH = null;

async function loadManifest() {
  const raw = await readFile(path.join(BUILD_DIR, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(raw);
  manifest.build = { ...manifest.build, build_version: BUILD_VERSION };
  if (!DEMO_HASH) {
    const firstAnchorable = manifest.blocks.find((b) => b.anchorable);
    DEMO_HASH = firstAnchorable && firstAnchorable.content_hash;
  }
  return manifest;
}

function sendJSON(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

// "example" canned response also exercises: math split across two deltas
// (both inline and display) and a [[solution]]...[[/solution]] block split
// across a delta boundary (Decision 62), plus a markdown list (Decision 63).
const CANNED_DELTAS_EXAMPLE = [
  'Sure — here', ' is a worked example', '.\n\nSuppose $a', '=3$ and $b=4$.',
  ' Then by the Pythagorean relation ', '$$a^2 + b', '^2 = c^2$$', ' so ',
  '$c = 5$', '.\n\nThis is the ', '(3,4,5) triple.',
  '\n\n**Try it yourself:** what is $c$ if $a=6$ and $b=8$?\n\n',
  '[[solution]]By the same relation, ', '$c = \\sqrt{6^2+8^2} = 10$', '.[[/solution]]',
  '\n\nSteps used:\n- square each leg\n- add them\n- take the square root'
];

// "intuition" canned response exercises plain markdown (bold/italic) with no
// math and no solution marker, to check that path renders exactly as before.
const CANNED_DELTAS_INTUITION = [
  'Think of it ', 'this way: a *Pythagorean triple* is just three whole ',
  'numbers that happen to fit together as the sides of a right triangle.\n\n',
  'The **key idea** is that ', '$a^2+b^2=c^2$', ' is really just the Pythagorean ',
  'theorem in disguise — ', 'nothing more than "the areas of the two small ',
  'squares add up to the area of the big one."'
];

async function handleGenerate(req, res) {
  const bodyText = await readBody(req);
  let payload = {};
  try {
    payload = JSON.parse(bodyText);
  } catch {
    /* ignore */
  }

  if (payload.build_version && payload.build_version !== BUILD_VERSION) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`event: error\ndata: ${JSON.stringify({ code: 'refresh_required' })}\n\n`);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const deltas = payload.creature_type === 'intuition' ? CANNED_DELTAS_INTUITION : CANNED_DELTAS_EXAMPLE;
  for (const piece of deltas) {
    res.write(`event: delta\ndata: ${JSON.stringify({ text: piece })}\n\n`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 120));
  }

  res.write(
    `event: done\ndata: ${JSON.stringify({ content_id: 1, cost_microdollars: 7000 })}\n\n`
  );
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/book') {
      return sendJSON(res, 200, {
        title: 'Interactive Textbook (mock)',
        slug: 'mock-book',
        code_example: 'MOCK-7X4M-Q2',
        desmos_api_key: null
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/manifest') {
      return sendJSON(res, 200, await loadManifest());
    }

    if (req.method === 'GET' && url.pathname === '/api/chapters') {
      const raw = await readFile(path.join(BUILD_DIR, 'chapters.json'), 'utf-8');
      return sendJSON(res, 200, JSON.parse(raw));
    }

    const chapterMatch = url.pathname.match(/^\/chapter\/(\d+)$/);
    if (req.method === 'GET' && chapterMatch) {
      const n = chapterMatch[1];
      const html = await readFile(path.join(BUILD_DIR, 'html', `S${n}.html`), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    if (req.method === 'POST' && url.pathname === '/api/claim') {
      const bodyText = await readBody(req);
      let payload = {};
      try {
        payload = JSON.parse(bodyText);
      } catch {
        /* ignore */
      }
      if (!payload.code) {
        return sendJSON(res, 400, { detail: 'code required' });
      }
      res.setHeader('Set-Cookie', 'session=mock; HttpOnly; SameSite=Lax; Path=/');
      return sendJSON(res, 200, { ok: true, budget_remaining_microdollars: 5_000_000 });
    }

    const contentMatch = url.pathname.match(/^\/api\/content\/(.+)$/);
    if (req.method === 'GET' && contentMatch) {
      await loadManifest(); // ensures DEMO_HASH is populated
      const hash = decodeURIComponent(contentMatch[1]);
      if (hash === DEMO_HASH) {
        // Two artifacts on the same block, so the collapsed-chip cluster
        // (Decision 61) shows two chips side by side on hydrate.
        return sendJSON(res, 200, [
          {
            id: 1,
            creature_type: 'example',
            response:
              'A previously-approved example: $2+2=4$.\n\n[[solution]]And doubling again gives $8$.[[/solution]]',
            status: 'approved',
            created_at: new Date().toISOString(),
            own: false
          },
          {
            id: 2,
            creature_type: 'intuition',
            response: 'The **intuition**: addition is just *combining* two piles and counting the total.',
            status: 'approved',
            created_at: new Date().toISOString(),
            own: false
          }
        ]);
      }
      return sendJSON(res, 200, []);
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      return await handleGenerate(req, res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { detail: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Mock backend listening on http://localhost:${PORT}`);
  console.log(`(serving build/ from ${BUILD_DIR})`);
});
