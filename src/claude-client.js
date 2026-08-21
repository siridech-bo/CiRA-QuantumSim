// =============================================================================
// claude-client.js — minimal browser client for the Anthropic Messages API.
//
// This app is a no-build, import-map browser project with no backend, so we call
// the Messages API directly from the browser via fetch (raw HTTP is the right
// surface here — there is no bundler for the official SDK). Each user supplies
// their OWN Anthropic API key, stored in localStorage; the request carries the
// `anthropic-dangerous-direct-browser-access` header that enables browser calls.
//
// Streaming SSE is parsed by hand (content_block_delta → text_delta). Claude is
// multimodal, so a highlighted equation/figure is sent as a base64 image block.
// Model + version follow the current Claude API guidance (claude-opus-5).
// =============================================================================

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_MODEL = 'claude-opus-5';       // per Claude API guidance
const KEY_STORE = 'anthropic-api-key';

// ---- API key management (localStorage; the user's own key) ------------------
export function getApiKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
export function setApiKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch {} }
export function hasApiKey() { return !!getApiKey(); }

// A concise, grounding system prompt: answer ONLY from the given paper context,
// aimed at a student reading the PDF; be rigorous and cite what the selection is.
function systemPrompt(paper) {
  const cite = paper ? `The reader is studying the paper: “${paper.title}” — ${paper.authors} (${paper.venue || paper.year || ''}).` : '';
  return [
    'You are a physics reading copilot embedded in a PDF reader (like SciSpace).',
    cite,
    'The user highlights text or an equation/figure region and asks you to explain it.',
    'Explain clearly for a graduate student: define symbols, unpack the physics, and note',
    'assumptions or regimes of validity. If an equation is shown as an image, transcribe it',
    'first, then explain each term. Ground your answer in the provided selection and the',
    'surrounding page context; if something needed is not in the context, say so rather than',
    'inventing it. Be rigorous and concise. Use plain text math (no LaTeX delimiters).',
  ].filter(Boolean).join(' ');
}

// Build the user content blocks for one explain request.
//   opts: { paper, selectionText, contextText, imageDataUrl, question }
function buildUserContent(opts) {
  const blocks = [];
  if (opts.imageDataUrl) {
    const m = /^data:(image\/\w+);base64,(.*)$/.exec(opts.imageDataUrl);
    if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  const parts = [];
  if (opts.contextText) parts.push(`PAGE CONTEXT (surrounding text on this page):\n"""${opts.contextText.slice(0, 6000)}"""`);
  if (opts.selectionText) parts.push(`THE HIGHLIGHTED TEXT:\n"""${opts.selectionText.slice(0, 4000)}"""`);
  else if (opts.imageDataUrl) parts.push('The highlighted region is the attached image (an equation or figure from the page).');
  parts.push(opts.question && opts.question.trim()
    ? `MY QUESTION: ${opts.question.trim()}`
    : 'Explain this to me.');
  blocks.push({ type: 'text', text: parts.join('\n\n') });
  return blocks;
}

// ---- streaming explain -------------------------------------------------------
// onDelta(textChunk), onDone(fullText), onError(err). Returns an AbortController.
export function explainStream(opts, { onDelta, onDone, onError, model = DEFAULT_MODEL } = {}) {
  const key = getApiKey();
  const controller = new AbortController();
  if (!key) { onError && onError(new Error('No API key set. Paste your Anthropic API key first.')); return controller; }

  const messages = (opts.history || []).concat([{ role: 'user', content: buildUserContent(opts) }]);
  const body = {
    model,
    max_tokens: 2048,
    stream: true,
    system: opts.system || systemPrompt(opts.paper),
    output_config: { effort: 'medium' },
    messages,
  };

  (async () => {
    let full = '';
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // SSE frames are separated by a blank line; each has a `data:` payload.
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt; try { evt = JSON.parse(payload); } catch { continue; }
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
            full += evt.delta.text; onDelta && onDelta(evt.delta.text);
          } else if (evt.type === 'error') {
            throw new Error((evt.error && evt.error.message) || 'stream error');
          }
        }
      }
      onDone && onDone(full);
    } catch (e) {
      if (e.name === 'AbortError') return;
      onError && onError(e);
    }
  })();

  return controller;
}
