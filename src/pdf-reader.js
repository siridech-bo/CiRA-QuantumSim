// =============================================================================
// pdf-reader.js — SciSpace-style reader. Renders the PDF with pdf.js (canvas +
// selectable text layer), lets the user highlight text OR drag a box over an
// equation/figure, and asks Claude to explain the selection grounded in the
// paper. Streaming answers appear in the right-hand copilot panel.
// =============================================================================
import * as pdfjsLib from 'pdfjs-dist';
import { explainStream, getApiKey, setApiKey, hasApiKey } from './claude-client.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';

// ---- theme (mirror the app: data-theme + localStorage) ----------------------
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(t) { document.documentElement.dataset.theme = t; themeBtn.textContent = t === 'dark' ? '🌙' : '☀️'; try { localStorage.setItem('ion-theme', t); } catch {} }
themeBtn.onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
applyTheme(localStorage.getItem('ion-theme') || 'dark');

// ---- state ------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const fileParam = params.get('file') || '';
const state = {
  paper: null,
  pageText: {},           // pageNum -> full text string (for grounding context)
  pageCanvas: {},         // pageNum -> canvas + outputScale (for region snips)
  regionMode: false,
  history: [],            // [{role, content}] for follow-up turns
  lastContextText: '',    // page text of the most recent selection
  streaming: false,
};

const pagesEl = document.getElementById('pr-pages');
const viewer = document.getElementById('pr-viewer');
const titleEl = document.getElementById('pr-title');
const pageInfo = document.getElementById('pr-pageinfo');
const selpop = document.getElementById('pr-selpop');
const thread = document.getElementById('pr-thread');
const emptyEl = document.getElementById('pr-empty');

// ---- API-key panel ----------------------------------------------------------
const keyPanel = document.getElementById('pr-key');
const keyInput = document.getElementById('pr-key-input');
document.getElementById('pr-key-save').onclick = () => {
  const k = keyInput.value.trim(); if (k) { setApiKey(k); keyInput.value = ''; refreshKeyPanel(); }
};
function refreshKeyPanel() { keyPanel.classList.toggle('hide', hasApiKey()); }
refreshKeyPanel();

// ---- load paper metadata + PDF ----------------------------------------------
(async function init() {
  try {
    const idx = await fetch('Library/library-index.json').then((r) => r.json());
    state.paper = (idx.papers || []).find((p) => p.file === fileParam) || null;
  } catch { /* index optional */ }
  const title = state.paper ? state.paper.title : decodeURIComponent(fileParam);
  titleEl.textContent = title;
  document.title = `${title} — Reader`;
  if (!fileParam) { titleEl.textContent = 'No paper specified.'; return; }
  try {
    const url = 'Library/' + fileParam;
    const pdf = await pdfjsLib.getDocument(url).promise;
    pageInfo.textContent = `${pdf.numPages} pages`;
    for (let n = 1; n <= pdf.numPages; n++) await renderPage(pdf, n);
  } catch (e) {
    pagesEl.innerHTML = `<div class="pr-empty">Couldn't open this PDF (${e.message}).</div>`;
  }
})();

// ---- render one page: canvas + text layer + region overlay ------------------
async function renderPage(pdf, num) {
  const page = await pdf.getPage(num);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  const wrap = document.createElement('div');
  wrap.className = 'pr-page'; wrap.dataset.page = num;
  wrap.style.width = viewport.width + 'px'; wrap.style.height = viewport.height + 'px';

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = viewport.width + 'px'; canvas.style.height = viewport.height + 'px';
  const ctx = canvas.getContext('2d');
  wrap.appendChild(canvas);

  const textLayerDiv = document.createElement('div');
  textLayerDiv.className = 'pr-textlayer';
  textLayerDiv.style.setProperty('--scale-factor', scale);
  wrap.appendChild(textLayerDiv);

  const overlay = document.createElement('div');
  overlay.className = 'pr-region-overlay';
  wrap.appendChild(overlay);
  wireRegion(overlay, wrap, num);

  pagesEl.appendChild(wrap);
  state.pageCanvas[num] = { canvas, outputScale };

  await page.render({ canvasContext: ctx, viewport, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined }).promise;

  const tc = await page.getTextContent();
  state.pageText[num] = tc.items.map((i) => i.str).join(' ');
  const tl = new pdfjsLib.TextLayer({ textContentSource: tc, container: textLayerDiv, viewport });
  await tl.render();
}

// ---- text selection popup ---------------------------------------------------
document.addEventListener('mouseup', () => {
  if (state.regionMode) return;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || !sel.rangeCount) { selpop.classList.remove('show'); return; }
    const range = sel.getRangeAt(0);
    if (!viewer.contains(range.commonAncestorContainer)) { selpop.classList.remove('show'); return; }
    const rect = range.getBoundingClientRect();
    const vr = viewer.getBoundingClientRect();
    selpop.style.left = (rect.left - vr.left + viewer.scrollLeft + rect.width / 2 - 60) + 'px';
    selpop.style.top = (rect.top - vr.top + viewer.scrollTop - 42) + 'px';
    selpop.classList.add('show');
  }, 10);
});
viewer.addEventListener('scroll', () => selpop.classList.remove('show'));

function selectionPage() {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  const pg = el && el.closest('.pr-page');
  return pg ? +pg.dataset.page : null;
}

document.getElementById('pr-explain').onclick = () => {
  const sel = window.getSelection(); const text = sel && sel.toString().trim();
  if (!text) return;
  const p = selectionPage();
  selpop.classList.remove('show'); sel.removeAllRanges();
  ask({ selectionText: text, contextText: state.pageText[p] || '' });
};
document.getElementById('pr-ask-sel').onclick = () => {
  const sel = window.getSelection(); const text = sel && sel.toString().trim();
  const p = selectionPage();
  state.lastContextText = (text ? `[Selected] ${text}\n\n` : '') + (state.pageText[p] || '');
  selpop.classList.remove('show');
  document.getElementById('pr-ask-input').focus();
};

// ---- region (equation / figure) capture -------------------------------------
document.getElementById('pr-region').onclick = (e) => {
  state.regionMode = !state.regionMode;
  e.currentTarget.classList.toggle('on', state.regionMode);
  document.querySelectorAll('.pr-page').forEach((p) => p.classList.toggle('region-mode', state.regionMode));
  document.querySelectorAll('.pr-textlayer').forEach((t) => t.classList.toggle('region-mode', state.regionMode));
  selpop.classList.remove('show');
};

function wireRegion(overlay, wrap, num) {
  let rectEl = null, sx = 0, sy = 0;
  overlay.addEventListener('pointerdown', (e) => {
    if (!state.regionMode) return;
    const r = wrap.getBoundingClientRect(); sx = e.clientX - r.left; sy = e.clientY - r.top;
    rectEl = document.createElement('div'); rectEl.className = 'pr-region-rect';
    rectEl.style.left = sx + 'px'; rectEl.style.top = sy + 'px';
    overlay.appendChild(rectEl); overlay.setPointerCapture(e.pointerId);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!rectEl) return;
    const r = wrap.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    rectEl.style.left = Math.min(sx, cx) + 'px'; rectEl.style.top = Math.min(sy, cy) + 'px';
    rectEl.style.width = Math.abs(cx - sx) + 'px'; rectEl.style.height = Math.abs(cy - sy) + 'px';
  });
  overlay.addEventListener('pointerup', (e) => {
    if (!rectEl) return;
    const x = parseFloat(rectEl.style.left), y = parseFloat(rectEl.style.top);
    const w = parseFloat(rectEl.style.width) || 0, h = parseFloat(rectEl.style.height) || 0;
    rectEl.remove(); rectEl = null;
    if (w < 12 || h < 12) return;                 // ignore stray clicks
    const { canvas, outputScale } = state.pageCanvas[num];
    const crop = document.createElement('canvas');
    crop.width = Math.round(w * outputScale); crop.height = Math.round(h * outputScale);
    crop.getContext('2d').drawImage(canvas, x * outputScale, y * outputScale, w * outputScale, h * outputScale, 0, 0, crop.width, crop.height);
    const dataUrl = crop.toDataURL('image/png');
    // leave region mode after a capture
    state.regionMode = false; document.getElementById('pr-region').classList.remove('on');
    document.querySelectorAll('.pr-page').forEach((p) => p.classList.remove('region-mode'));
    document.querySelectorAll('.pr-textlayer').forEach((t) => t.classList.remove('region-mode'));
    ask({ imageDataUrl: dataUrl, contextText: state.pageText[num] || '' });
  });
}

// ---- copilot thread + streaming ---------------------------------------------
function addMsg(cls, html) {
  emptyEl && emptyEl.remove();
  const el = document.createElement('div'); el.className = 'pr-msg ' + cls;
  el.innerHTML = html; thread.appendChild(el); thread.scrollTop = thread.scrollHeight;
  return el;
}
function esc(s) { return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// Core: send an explain/ask request and stream the answer.
function ask(opts) {
  if (state.streaming) return;
  if (!hasApiKey()) { keyPanel.classList.remove('hide'); document.getElementById('pr-key-input').focus(); addMsg('err', '<div class="who">note</div><div class="bubble">Paste your Anthropic API key above first.</div>'); return; }

  // render the user bubble
  let uHtml = '<div class="who">you</div><div class="bubble">';
  if (opts.imageDataUrl) uHtml += `<div>Explain this equation/figure:</div><img src="${opts.imageDataUrl}" alt="snip" />`;
  else if (opts.selectionText) uHtml += `<div class="sel">${esc(opts.selectionText)}</div>`;
  if (opts.question) uHtml += `<div>${esc(opts.question)}</div>`;
  uHtml += '</div>';
  addMsg('user', uHtml);
  state.lastContextText = opts.contextText || state.lastContextText;

  const aiEl = addMsg('ai', '<div class="who">claude</div><div class="bubble">…</div>');
  const bubble = aiEl.querySelector('.bubble');
  bubble.textContent = '';
  state.streaming = true; setSendEnabled(false);

  explainStream({
    paper: state.paper,
    selectionText: opts.selectionText,
    imageDataUrl: opts.imageDataUrl,
    contextText: opts.contextText || state.lastContextText,
    question: opts.question,
    history: state.history,
  }, {
    onDelta: (t) => { bubble.textContent += t; thread.scrollTop = thread.scrollHeight; },
    onDone: (full) => {
      state.streaming = false; setSendEnabled(true);
      // record the turn for follow-ups (text-only user block keeps history light)
      const userText = opts.question || opts.selectionText || 'Explain the attached equation/figure.';
      state.history.push({ role: 'user', content: userText });
      state.history.push({ role: 'assistant', content: full });
      if (state.history.length > 12) state.history.splice(0, state.history.length - 12);
    },
    onError: (e) => { state.streaming = false; setSendEnabled(true); aiEl.classList.add('err'); bubble.textContent = 'Error: ' + e.message; },
  });
}

// ---- free-form ask box ------------------------------------------------------
const askInput = document.getElementById('pr-ask-input');
const askSend = document.getElementById('pr-ask-send');
function setSendEnabled(on) { askSend.disabled = !on; }

// Which page is most in view — so a cold Ask-box question is still grounded in
// the page the reader is currently looking at (not just the last selection).
function currentVisiblePage() {
  const vr = viewer.getBoundingClientRect();
  let best = null, bestArea = -1;
  document.querySelectorAll('.pr-page').forEach((pg) => {
    const r = pg.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top));
    if (area > bestArea) { bestArea = area; best = +pg.dataset.page; }
  });
  return best;
}
function sendAsk() {
  const q = askInput.value.trim(); if (!q) return; askInput.value = '';
  // prefer the most recent selection/snip; otherwise ground in the visible page.
  const ctx = state.lastContextText || state.pageText[currentVisiblePage()] || '';
  ask({ question: q, contextText: ctx });
}
askSend.onclick = sendAsk;
askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAsk(); } });
