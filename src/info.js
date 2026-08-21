// =============================================================================
// info.js — reusable "ⓘ info button + modal dialog" educational overlay, now with
// an embedded AI-copilot chat (discuss the card with Claude, grounded in its text)
// and references that link into the local Library (the reader if the paper is in
// it, else a Library search) instead of jumping to external sites.
//
// Content lives in a REGISTRY (see src/ion-info.js / nmr-info.js / jc-info.js).
// Consumed via initInfo(registry). Chat reuses src/claude-client.js (BYO key).
// =============================================================================
import { explainStream, hasApiKey, setApiKey } from './claude-client.js';

let REGISTRY = {};
let backdrop = null, dlgTitle = null, dlgKicker = null, dlgSymbol = null,
    dlgBody = null, dlgRefs = null, lastFocus = null;
let chatThread = null, chatInput = null, chatSend = null, chatKeyRow = null, chatKeyInput = null;

let curEntry = null;            // { title, symbol, plain, refsPlain }
let chatHistory = [];           // per-entry conversation
let chatStreaming = false;
let libRefs = null;             // { byArxiv:{id->file}, byDoi:{doi->file} } for reference links

// Prefetch the library index so reference citations can link to the local reader.
function loadLibIndex() {
  if (libRefs) return;
  libRefs = { byArxiv: {}, byDoi: {} };
  fetch('Library/library-index.json').then((r) => r.json()).then((j) => {
    for (const p of (j.papers || [])) {
      if (p.arxiv) libRefs.byArxiv[p.arxiv.toLowerCase()] = p.file;
      if (p.doi) libRefs.byDoi[p.doi.toLowerCase()] = p.file;
    }
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
function ensureDialog() {
  if (backdrop) return;
  backdrop = document.createElement('div');
  backdrop.className = 'info-backdrop';
  backdrop.setAttribute('role', 'presentation');
  backdrop.innerHTML = `
    <div class="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <div class="info-head">
        <div class="info-titles">
          <p class="info-kicker" hidden></p>
          <h3 class="info-title" id="info-title"></h3>
          <div class="info-symbol" hidden></div>
        </div>
        <button class="info-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="info-cols">
        <div class="info-main">
          <div class="info-body"></div>
          <div class="info-refs" hidden><h4>References</h4><ol></ol></div>
        </div>
        <div class="info-chat">
          <h4>Ask the AI copilot</h4>
          <div class="info-chat-key" hidden>
            <input class="info-key-input" type="password" autocomplete="off"
                   placeholder="Paste your Anthropic API key (sk-ant-…) to chat" />
            <button class="info-key-save" type="button">Save</button>
          </div>
          <div class="info-chat-thread"><p class="info-chat-empty">Ask a question about this parameter or graph — Claude answers grounded in this card.</p></div>
          <div class="info-chat-ask">
            <textarea class="info-chat-input" rows="1" placeholder="Ask a question about this…"></textarea>
            <button class="info-chat-send" type="button">Ask</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  dlgKicker = backdrop.querySelector('.info-kicker');
  dlgTitle  = backdrop.querySelector('.info-title');
  dlgSymbol = backdrop.querySelector('.info-symbol');
  dlgBody   = backdrop.querySelector('.info-body');
  dlgRefs   = backdrop.querySelector('.info-refs');
  chatThread = backdrop.querySelector('.info-chat-thread');
  chatInput  = backdrop.querySelector('.info-chat-input');
  chatSend   = backdrop.querySelector('.info-chat-send');
  chatKeyRow = backdrop.querySelector('.info-chat-key');
  chatKeyInput = backdrop.querySelector('.info-key-input');

  backdrop.querySelector('.info-close').addEventListener('click', closeInfo);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeInfo(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeInfo(); });

  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  backdrop.querySelector('.info-key-save').addEventListener('click', () => {
    const k = chatKeyInput.value.trim(); if (k) { setApiKey(k); chatKeyInput.value = ''; chatKeyRow.hidden = true; chatInput.focus(); }
  });
  // Live cross-tab sync: if the key is saved (or cleared) in ANY tab — the reader,
  // the Library, or another info popup — update this dialog's key prompt immediately.
  window.addEventListener('storage', (e) => {
    if (e.key === 'anthropic-api-key' || e.key === null) chatKeyRow.hidden = hasApiKey();
  });
}

// ---- references now link into the local Library --------------------------------
function extractArxiv(r) {
  if (r.href) { const m = /arxiv\.org\/abs\/([^\s"'?#]+)/i.exec(r.href); if (m) return m[1]; }
  const m2 = /arXiv:\s*([\w.\-\/]+)/i.exec(r.cite || ''); return m2 ? m2[1] : '';
}
function extractDoi(r) {
  if (r.href) { const m = /doi\.org\/(10\.[^\s"'?#]+)/i.exec(r.href); if (m) return m[1]; }
  const m2 = /\b(10\.\d{4,9}\/[^\s"'()]+)/.exec(r.cite || ''); return m2 ? m2[1] : '';
}
function firstToken(cite) {
  const t = (cite || '').split(',')[0].split('&')[0].trim().split(/\s+/).pop();
  return t || (cite || '').slice(0, 24);
}
function refHref(r) {
  const ax = extractArxiv(r);
  if (ax && libRefs && libRefs.byArxiv[ax.toLowerCase()]) return { url: 'pdf.html?file=' + encodeURIComponent(libRefs.byArxiv[ax.toLowerCase()]), inLib: true };
  const doi = extractDoi(r);
  if (doi && libRefs && libRefs.byDoi[doi.toLowerCase()]) return { url: 'pdf.html?file=' + encodeURIComponent(libRefs.byDoi[doi.toLowerCase()]), inLib: true };
  return { url: 'library.html?q=' + encodeURIComponent(ax || doi || firstToken(r.cite)), inLib: false };
}
function refLine(r) {
  const tag = r.tag ? `<span class="tag">[${r.tag}]</span> ` : '';
  const { url, inLib } = refHref(r);
  const label = inLib ? '📖 open in Library reader' : '🔎 find in Library';
  return `${tag}<a href="${url}" target="_blank" rel="noopener" title="${inLib ? 'This paper is in your Library — open it in the AI reader' : 'Search your Library for this reference'}">${r.cite}</a> <span class="ref-lib">${label}</span>`;
}

// ---------------------------------------------------------------------------
export function openInfo(key) {
  ensureDialog();
  const entry = REGISTRY[key];
  if (!entry) { console.warn(`[info] no entry for "${key}"`); return; }

  if (entry.kicker) { dlgKicker.textContent = entry.kicker; dlgKicker.hidden = false; } else dlgKicker.hidden = true;
  dlgTitle.textContent = entry.title || key;
  if (entry.symbol) { dlgSymbol.innerHTML = entry.symbol; dlgSymbol.hidden = false; } else dlgSymbol.hidden = true;
  dlgBody.innerHTML = entry.body || '';

  const ol = dlgRefs.querySelector('ol'); ol.innerHTML = '';
  if (entry.refs && entry.refs.length) {
    for (const r of entry.refs) { const li = document.createElement('li'); li.innerHTML = refLine(r); ol.appendChild(li); }
    dlgRefs.hidden = false;
  } else dlgRefs.hidden = true;

  // reset the chat for this card
  curEntry = {
    title: entry.title || key,
    symbol: (entry.symbol || '').replace(/<[^>]+>/g, ''),
    plain: (entry.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    refsPlain: (entry.refs || []).map((r) => `[${r.tag}] ${r.cite}`).join('  '),
  };
  chatHistory = [];
  chatThread.innerHTML = '<p class="info-chat-empty">Ask a question about this parameter or graph — Claude answers grounded in this card.</p>';
  chatKeyRow.hidden = hasApiKey();
  chatStreaming = false; chatSend.disabled = false;

  lastFocus = document.activeElement;
  backdrop.classList.add('open');
  dlgBody.scrollTop = 0;
  backdrop.querySelector('.info-close').focus();
}

export function closeInfo() {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

// ---- chat -------------------------------------------------------------------
function esc(s) { return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function addChat(cls, text) {
  const empty = chatThread.querySelector('.info-chat-empty'); if (empty) empty.remove();
  const el = document.createElement('div'); el.className = 'ic-msg ic-' + cls;
  const who = document.createElement('div'); who.className = 'ic-who'; who.textContent = cls === 'user' ? 'You' : 'Claude';
  const body = document.createElement('div'); body.className = 'ic-body'; body.textContent = text || '';
  el.appendChild(who); el.appendChild(body); chatThread.appendChild(el); chatThread.scrollTop = chatThread.scrollHeight;
  return body;
}
function sendChat() {
  if (chatStreaming || !curEntry) return;
  const q = chatInput.value.trim(); if (!q) return;
  if (!hasApiKey()) { chatKeyRow.hidden = false; chatKeyInput.focus(); return; }
  chatInput.value = '';
  addChat('user', q);
  const bubble = addChat('ai', '');
  chatStreaming = true; chatSend.disabled = true;

  const ctx = `${curEntry.symbol ? curEntry.symbol + '\n\n' : ''}${curEntry.plain}` +
    (curEntry.refsPlain ? `\n\nReferences: ${curEntry.refsPlain}` : '');
  explainStream({
    system: `You are the AI copilot inside the CiRA QuantumSim trapped-ion physics visualizer. The user is reading the info card titled “${curEntry.title}”. Discuss and explain it for a graduate student, grounded in the card text below and standard trapped-ion physics. Define symbols, unpack the physics, note regimes of validity. Be rigorous and concise; use plain-text math (no LaTeX). If the card doesn't cover something the user asks, say so plainly.`,
    contextText: ctx,
    selectionText: curEntry.title,
    question: q,
    history: chatHistory,
  }, {
    onDelta: (t) => { bubble.textContent += t; chatThread.scrollTop = chatThread.scrollHeight; },
    onDone: (full) => {
      chatStreaming = false; chatSend.disabled = false;
      chatHistory.push({ role: 'user', content: q }); chatHistory.push({ role: 'assistant', content: full });
      if (chatHistory.length > 10) chatHistory.splice(0, chatHistory.length - 10);
    },
    onError: (e) => { chatStreaming = false; chatSend.disabled = false; bubble.parentElement.classList.add('err'); bubble.textContent = 'Error: ' + e.message; },
  });
}

// ---- button injection (unchanged) ------------------------------------------
function makeButton(key) {
  const btn = document.createElement('button');
  btn.className = 'info-btn'; btn.type = 'button'; btn.textContent = 'info';
  btn.title = 'What is this?'; btn.setAttribute('aria-label', 'More information'); btn.dataset.infoBtn = key;
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openInfo(key); });
  return btn;
}
export function initInfo(registry, opts = {}) {
  REGISTRY = registry || {};
  loadLibIndex();
  ensureDialog();
  attachButtons(opts.root);
}
export function attachButtons(root) {
  const scope = !root ? document : (typeof root === 'string' ? document.querySelector(root) : root);
  if (!scope) return;
  scope.querySelectorAll('[data-info]').forEach((el) => {
    const key = el.dataset.info;
    if (el.querySelector(':scope > .info-btn')) return;
    if (!REGISTRY[key]) console.warn(`[info] element requests missing key "${key}"`);
    el.appendChild(makeButton(key));
  });
}
