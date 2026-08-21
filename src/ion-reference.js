// =============================================================================
// ion-reference.js — renders the standalone Trapped-Ion Parameter Reference page
// from the SAME content registry the in-app ⓘ popups use (src/ion-info.js), so the
// cheat-sheet can never drift from the popups. Builds a categorized glossary, a
// sticky table of contents, a live search filter, and a de-duplicated bibliography.
// =============================================================================
import { ION_INFO } from './ion-info.js';

// Ordered sections → which registry keys live under each. Every ION_INFO key must
// appear exactly once (a load-time check below warns if that ever breaks).
const SECTIONS = [
  { id: 'overview',    title: 'Overview',                         keys: ['engine-overview', 'modules-overview'] },
  { id: 'laser',       title: 'Laser drive & coupling',           keys: ['delta', 'rabi', 'coupling'] },
  { id: 'trap',        title: 'Trap → Lamb–Dicke η',              keys: ['eta', 'lambda', 'nutrap'] },
  { id: 'dissipators', title: 'Dissipators (relaxation & recoil)', keys: ['se', 'bath', 'dephase', 'recoil', 'geometry'] },
  { id: 'statenum',    title: 'State prep, numerics & display',    keys: ['init-state', 'nfock', 'speed', 'zoom', 'lenmap', 'ghost'] },
  { id: 'm1',          title: 'M1 · Paul trap',                    keys: ['m1-q', 'm1-a', 'm1-stability', 'm1-traj'] },
  { id: 'm2',          title: 'M2 · Normal modes',                 keys: ['m2-n', 'm2-positions', 'm2-bars', 'm2-shape'] },
  { id: 'm3',          title: 'M3 · Sidebands',                    keys: ['levels-diagram'] },
  { id: 'm4',          title: 'M4 · Doppler cooling',              keys: ['m4-gamma', 'm4-delta', 'm4-rabi', 'm4-nbar0', 'm4-scan', 'm4-floor'] },
  { id: 'm6',          title: 'M6 · Single-qubit gate',            keys: ['m6-theta', 'm6-rabi', 'm6-delta', 'm6-bloch'] },
  { id: 'm7',          title: 'M7 · Mølmer–Sørensen gate',         keys: ['m7-delta', 'm7-k', 'm7-derr', 'm7-loop', 'm7-wigner', 'm7-pops'] },
  { id: 'm8',          title: 'M8 · Readout',                      keys: ['m8-td', 'm8-r', 'm8-rbg', 'm8-hist', 'm8-sweep'] },
  { id: 'readouts',    title: 'Live readouts & traces',            keys: ['observables', 'pe-trace', 'fluor', 'nbar-trace', 'spectrum', 'thermometry', 'heatmap'] },
];

// ---- integrity check: warn if any registry key is unplaced / duplicated -----
(function checkCoverage() {
  const placed = SECTIONS.flatMap((s) => s.keys);
  const seen = new Set();
  for (const k of placed) {
    if (seen.has(k)) console.warn(`[reference] key placed twice: ${k}`);
    seen.add(k);
    if (!ION_INFO[k]) console.warn(`[reference] section references missing key: ${k}`);
  }
  for (const k of Object.keys(ION_INFO)) if (!seen.has(k)) console.warn(`[reference] key not on any section: ${k}`);
})();

// ---- helpers ----------------------------------------------------------------
function refLine(r) {
  const tag = r.tag ? `<span class="tag">[${r.tag}]</span> ` : '';
  const cite = r.href ? `<a href="${r.href}" target="_blank" rel="noopener">${r.cite}</a>` : r.cite;
  return `${tag}${cite}`;
}

function cardHTML(key) {
  const e = ION_INFO[key];
  if (!e) return '';
  const kicker = e.kicker ? `<div class="ref-kicker">${e.kicker}</div>` : '';
  const symbol = e.symbol ? `<div class="ref-symbol">${e.symbol}</div>` : '';
  const refs = (e.refs && e.refs.length)
    ? `<div class="ref-refs"><span class="lbl">References:</span> ${e.refs.map(refLine).join(' &nbsp;·&nbsp; ')}</div>`
    : '';
  // searchable text: title + symbol + key + stripped body
  const plain = (e.title + ' ' + (e.symbol || '') + ' ' + key + ' ' +
    (e.body || '').replace(/<[^>]+>/g, ' ')).toLowerCase();
  return `<article class="ref-card" data-key="${key}" data-search="${plain.replace(/"/g, '&quot;')}">
    ${kicker}
    <h3 id="ref-${key}">${e.title}</h3>
    ${symbol}
    <div class="info-body">${e.body || ''}</div>
    ${refs}
  </article>`;
}

// ---- render -----------------------------------------------------------------
const toc = document.getElementById('ref-toc-nav');
const main = document.getElementById('ref-main');

let tocHTML = '';
let mainHTML = '';
for (const sec of SECTIONS) {
  tocHTML += `<a class="toc-sec" href="#sec-${sec.id}" data-sec="${sec.id}">${sec.title}</a>`;
  mainHTML += `<section class="ref-section" id="sec-${sec.id}" data-sec="${sec.id}"><h2>${sec.title}</h2>`;
  for (const key of sec.keys) {
    const e = ION_INFO[key];
    if (!e) continue;
    tocHTML += `<a class="toc-item" href="#ref-${key}" data-key="${key}">${e.title}</a>`;
    mainHTML += cardHTML(key);
  }
  mainHTML += `</section>`;
}
toc.innerHTML = tocHTML;
main.insertAdjacentHTML('beforeend', mainHTML);

// ---- bibliography (unique references across all entries) --------------------
(function buildBibliography() {
  const byCite = new Map();
  for (const e of Object.values(ION_INFO)) {
    for (const r of (e.refs || [])) if (!byCite.has(r.cite)) byCite.set(r.cite, r);
  }
  const items = [...byCite.values()].sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
  const html = `<section class="ref-section ref-biblio" id="sec-biblio" data-sec="biblio">
      <h2>Bibliography</h2>
      <ol>${items.map((r) => `<li>${refLine(r)}</li>`).join('')}</ol>
    </section>`;
  main.insertAdjacentHTML('beforeend', html);
  toc.insertAdjacentHTML('beforeend', `<a class="toc-sec" href="#sec-biblio" data-sec="biblio">Bibliography</a>`);
})();

// ---- live search filter -----------------------------------------------------
const search = document.getElementById('ref-search');
const noResults = document.getElementById('ref-noresults');
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  let anyVisible = false;
  document.querySelectorAll('.ref-section:not(.ref-biblio)').forEach((sec) => {
    let secVisible = false;
    sec.querySelectorAll('.ref-card').forEach((card) => {
      const hit = !q || card.dataset.search.includes(q);
      card.classList.toggle('hidden', !hit);
      if (hit) secVisible = true;
    });
    sec.classList.toggle('hidden', !secVisible);
    // matching TOC entries
    const secId = sec.dataset.sec;
    document.querySelector(`.toc-sec[data-sec="${secId}"]`)?.classList.toggle('hidden', !secVisible);
    if (secVisible) anyVisible = true;
  });
  document.querySelectorAll('.toc-item').forEach((a) => {
    const card = document.querySelector(`.ref-card[data-key="${a.dataset.key}"]`);
    a.classList.toggle('hidden', !card || card.classList.contains('hidden'));
  });
  // bibliography + its TOC link hide during an active search
  document.getElementById('sec-biblio')?.classList.toggle('hidden', !!q);
  document.querySelector('.toc-sec[data-sec="biblio"]')?.classList.toggle('hidden', !!q);
  noResults.classList.toggle('on', !anyVisible);
});

// ---- theme toggle (mirrors the app: data-theme + localStorage 'ion-theme') --
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('ion-theme', theme); } catch (_) { /* ignore */ }
}
themeBtn.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
applyTheme(localStorage.getItem('ion-theme') || 'dark');
