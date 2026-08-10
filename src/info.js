// =============================================================================
// info.js — reusable "ⓘ info button + modal dialog" educational overlay.
//
// Framework-free, theme-aware, zero-dependency. A single shared modal is built
// once and reused; every element carrying a `data-info="<key>"` attribute gets a
// small ⓘ button injected that opens the modal with that key's content.
//
// Content lives in a REGISTRY object (see src/ion-info.js) keyed by the same
// strings; each entry is:
//   {
//     kicker?: string,        // small eyebrow label (e.g. "Parameter", "Graph")
//     title:   string,        // dialog heading
//     symbol?: string,        // monospace symbol / units line under the title
//     body:    string,        // long-form HTML essay (trusted, authored in-repo)
//     refs?:   [ { tag, cite, href? } ]   // sourced references
//   }
//
// Usage (once, after the DOM exists):
//   import { initInfo } from './info.js';
//   import { ION_INFO } from './ion-info.js';
//   initInfo(ION_INFO);
//
// The same component drops onto the NMR + JC pages with their own registries.
// =============================================================================

let REGISTRY = {};
let backdrop = null, dlgTitle = null, dlgKicker = null, dlgSymbol = null,
    dlgBody = null, dlgRefs = null, lastFocus = null;

// ---------------------------------------------------------------------------
// Build the single shared dialog (idempotent).
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
      <div class="info-body"></div>
      <div class="info-refs" hidden>
        <h4>References</h4>
        <ol></ol>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  dlgKicker = backdrop.querySelector('.info-kicker');
  dlgTitle  = backdrop.querySelector('.info-title');
  dlgSymbol = backdrop.querySelector('.info-symbol');
  dlgBody   = backdrop.querySelector('.info-body');
  dlgRefs   = backdrop.querySelector('.info-refs');

  backdrop.querySelector('.info-close').addEventListener('click', closeInfo);
  // click on the backdrop (outside the dialog) closes
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeInfo(); });
  // Esc closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) closeInfo();
  });
}

// ---------------------------------------------------------------------------
// Open the modal for a registry key.
// ---------------------------------------------------------------------------
export function openInfo(key) {
  ensureDialog();
  const entry = REGISTRY[key];
  if (!entry) { console.warn(`[info] no entry for "${key}"`); return; }

  if (entry.kicker) { dlgKicker.textContent = entry.kicker; dlgKicker.hidden = false; }
  else dlgKicker.hidden = true;

  dlgTitle.textContent = entry.title || key;

  if (entry.symbol) { dlgSymbol.innerHTML = entry.symbol; dlgSymbol.hidden = false; }
  else dlgSymbol.hidden = true;

  dlgBody.innerHTML = entry.body || '';

  const ol = dlgRefs.querySelector('ol');
  ol.innerHTML = '';
  if (entry.refs && entry.refs.length) {
    for (const r of entry.refs) {
      const li = document.createElement('li');
      const tag = r.tag ? `<span class="tag">[${r.tag}]</span>` : '';
      const cite = r.href
        ? `<a href="${r.href}" target="_blank" rel="noopener">${r.cite}</a>`
        : r.cite;
      li.innerHTML = `${tag}${cite}`;
      ol.appendChild(li);
    }
    dlgRefs.hidden = false;
  } else {
    dlgRefs.hidden = true;
  }

  lastFocus = document.activeElement;
  backdrop.classList.add('open');
  dlgBody.scrollTop = 0;
  backdrop.querySelector('.info-close').focus();
}

// ---------------------------------------------------------------------------
// Close the modal + restore focus.
// ---------------------------------------------------------------------------
export function closeInfo() {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

// ---------------------------------------------------------------------------
// Make one injected ⓘ button for a key.
// ---------------------------------------------------------------------------
function makeButton(key) {
  const btn = document.createElement('button');
  btn.className = 'info-btn';
  btn.type = 'button';
  btn.textContent = 'info';
  btn.title = 'What is this?';
  btn.setAttribute('aria-label', 'More information');
  btn.dataset.infoBtn = key;
  btn.addEventListener('click', (e) => {
    // never let the click toggle a wrapping <label>'s control or submit anything
    e.preventDefault();
    e.stopPropagation();
    openInfo(key);
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Scan the DOM (or a subtree) for [data-info] and inject buttons. Idempotent —
// safe to call again after new markup appears.
//   registry : the content object (stored for openInfo)
//   opts.root: optional CSS selector or Element to scope the scan
// ---------------------------------------------------------------------------
export function initInfo(registry, opts = {}) {
  REGISTRY = registry || {};
  ensureDialog();
  attachButtons(opts.root);
}

export function attachButtons(root) {
  const scope = !root ? document
    : (typeof root === 'string' ? document.querySelector(root) : root);
  if (!scope) return;
  scope.querySelectorAll('[data-info]').forEach((el) => {
    const key = el.dataset.info;
    // idempotent: skip if this element already has its own button
    if (el.querySelector(':scope > .info-btn')) return;
    if (!REGISTRY[key]) {
      // still inject (so it's visible during authoring) but warn
      console.warn(`[info] element requests missing key "${key}"`);
    }
    el.appendChild(makeButton(key));
  });
}
