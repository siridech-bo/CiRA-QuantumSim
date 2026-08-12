// =============================================================================
// wizard.js — non-modal "guided walkthrough" panel.
//
// A floating, draggable card (NOT a modal — the page stays fully interactive) that
// walks a student step-by-step through running one module's experiment. Each step
// shows an instruction and HIGHLIGHTS the exact control it refers to (a pulsing ring
// + scroll-into-view), with Back / Next navigation and progress dots.
//
// Content lives in a registry keyed by module id (see src/ion-wizard.js):
//   { M3: { title, steps: [ { title, body, target? }, … ] }, … }
//   target = a CSS selector for the element to highlight (optional).
//
// Usage:  import { initWizard, startWizard, closeWizard } from './wizard.js';
//         initWizard(ION_WIZARDS);
//         btn.onclick = () => startWizard(state.module, MODULES[state.module].name);
// =============================================================================

let REG = {};
let panel = null, titleEl, stepLabelEl, stepTitleEl, bodyEl, dotsEl, backBtn, nextBtn;
let cur = null;                 // { id, name, steps, i }
let highlighted = null;

// ---------------------------------------------------------------------------
function ensurePanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.className = 'wz-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Guided walkthrough');
  panel.innerHTML = `
    <div class="wz-head">
      <span class="wz-grip">⠿</span>
      <span class="wz-title"></span>
      <button class="wz-close" type="button" aria-label="Close walkthrough">&times;</button>
    </div>
    <div class="wz-body">
      <div class="wz-steplabel"></div>
      <div class="wz-steptitle"></div>
      <div class="wz-text"></div>
      <div class="wz-dots"></div>
    </div>
    <div class="wz-foot">
      <button class="wz-back" type="button">◂ Back</button>
      <button class="wz-next primary" type="button">Next ▸</button>
    </div>`;
  document.body.appendChild(panel);

  titleEl     = panel.querySelector('.wz-title');
  stepLabelEl = panel.querySelector('.wz-steplabel');
  stepTitleEl = panel.querySelector('.wz-steptitle');
  bodyEl      = panel.querySelector('.wz-text');
  dotsEl      = panel.querySelector('.wz-dots');
  backBtn     = panel.querySelector('.wz-back');
  nextBtn     = panel.querySelector('.wz-next');

  panel.querySelector('.wz-close').addEventListener('click', closeWizard);
  backBtn.addEventListener('click', back);
  nextBtn.addEventListener('click', next);
  makeDraggable(panel, panel.querySelector('.wz-head'));
}

// ---------------------------------------------------------------------------
export function initWizard(registry) { REG = registry || {}; }

export function startWizard(moduleId, moduleName) {
  const w = REG[moduleId];
  if (!w) { console.warn(`[wizard] no walkthrough for "${moduleId}"`); return; }
  ensurePanel();
  cur = { id: moduleId, name: moduleName || w.title || moduleId, steps: w.steps || [], i: 0 };
  panel.classList.add('open');
  render();
}

export function closeWizard() {
  clearHighlight();
  if (panel) panel.classList.remove('open');
  cur = null;
}

// ---------------------------------------------------------------------------
function render() {
  if (!cur) return;
  const { steps, i, name } = cur;
  const s = steps[i] || {};
  titleEl.textContent = `${name} — walkthrough`;
  stepLabelEl.textContent = `Step ${i + 1} of ${steps.length}`;
  stepTitleEl.textContent = s.title || '';
  bodyEl.innerHTML = s.body || '';
  dotsEl.innerHTML = steps.map((_, k) =>
    `<span class="wz-dot${k === i ? ' on' : ''}${k < i ? ' done' : ''}"></span>`).join('');
  backBtn.disabled = i === 0;
  nextBtn.textContent = i === steps.length - 1 ? 'Done ✓' : 'Next ▸';
  highlight(s.target);
}

function next() {
  if (!cur) return;
  if (cur.i >= cur.steps.length - 1) { closeWizard(); return; }
  cur.i++; render();
}
function back() { if (cur && cur.i > 0) { cur.i--; render(); } }

// ---------------------------------------------------------------------------
function highlight(sel) {
  clearHighlight();
  if (!sel) return;
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.add('wizard-highlight');
  highlighted = el;
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
}
function clearHighlight() {
  if (highlighted) { highlighted.classList.remove('wizard-highlight'); highlighted = null; }
}

// ---------------------------------------------------------------------------
// Drag the panel by its header (so it can be moved off a control it covers).
function makeDraggable(el, handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.wz-close')) return;
    dragging = true;
    const r = el.getBoundingClientRect();
    // switch from right/bottom anchoring to left/top for free dragging
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const nx = Math.max(4, Math.min(window.innerWidth - 60, ox + e.clientX - sx));
    const ny = Math.max(4, Math.min(window.innerHeight - 40, oy + e.clientY - sy));
    el.style.left = nx + 'px'; el.style.top = ny + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}
