// library.js — render the downloaded paper library (library-index.json) with a
// PARAMETER-AWARE search (type η, ω_z, Doppler, Mølmer–Sørensen, readout … and it
// maps the concept to the relevant module(s) and surfaces the related papers),
// module (M1-M8) filter chips, and a Read + AI copilot link per paper.
const listEl = document.getElementById('lib-list');
const countEl = document.getElementById('lib-count');
const noteEl = document.getElementById('lib-note');
const filtersEl = document.getElementById('lib-filters');
const hintEl = document.getElementById('lib-hint');
const suggestEl = document.getElementById('lib-suggest');
const search = document.getElementById('lib-search');

const MODULE_LABELS = {
  M1: 'Paul trap', M2: 'Normal modes', M3: 'Sidebands', M4: 'Doppler cool',
  M5: 'Sideband cool', M6: '1-qubit gate', M7: 'MS gate', M8: 'Readout',
  Other: 'Applications & foundations', Ref: 'Foundational references', Thesis: 'PhD theses & long-form',
};
const MODULE_ORDER = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'Other', 'Ref', 'Thesis'];

// ---- concept dictionary: a physics parameter/term → module(s) it relates to.
// `terms` are the strings a user might type (symbols + synonyms, lowercase).
const CONCEPTS = [
  { label: 'Trap / secular frequency ω_z', modules: ['M1'],
    terms: ['ω_z', 'ωz', 'wz', 'w_z', 'omega_z', 'omega z', 'trap frequency', 'secular frequency', 'paul trap', 'mathieu', 'q parameter', 'micromotion', 'pseudopotential', 'rf trap', 'confinement', 'trap depth', 'ion trap chip'] },
  { label: 'Normal modes', modules: ['M2'],
    terms: ['normal mode', 'normal modes', 'com mode', 'center of mass', 'centre of mass', 'stretch mode', 'ion string', 'ion strings', 'coulomb crystal', 'phonon mode', 'phonon modes', 'mode frequency', 'zigzag', 'linear chain'] },
  { label: 'Sidebands & addressing', modules: ['M3'],
    terms: ['sideband', 'sidebands', 'carrier', 'red sideband', 'blue sideband', 'spectroscopy', 'individual addressing', 'addressing', 'spin-motion', 'spin motion', 'detuning', 'δ', 'delta'] },
  { label: 'Doppler cooling', modules: ['M4'],
    terms: ['doppler cooling', 'doppler limit', 'doppler', 'laser cooling'] },
  { label: 'Sideband cooling', modules: ['M5'],
    terms: ['sideband cooling', 'ground-state cooling', 'ground state cooling', 'sympathetic cooling', 'resolved sideband', 'cooling', 'heating rate'] },
  { label: 'Single-qubit gates', modules: ['M6'],
    terms: ['single-qubit', 'single qubit', 'rabi', 'rabi frequency', 'Ω', 'omega', 'rf pulse', 'microwave', 'dressed state', 'dressed states', 'ac stark', 'stark shift', 'carrier pulse', 'dynamical decoupling', 'robust gate', 'error-resistant', 'spin resonance', 'bloch sphere'] },
  { label: 'Two-qubit / Mølmer–Sørensen gate', modules: ['M7'],
    terms: ['mølmer', 'molmer', 'sorensen', 'sørensen', 'ms gate', 'two-qubit', 'two qubit', 'entangling gate', 'entanglement', 'magic', 'magnetic gradient', 'gradient induced coupling', 'spin-spin', 'spin spin', 'j-coupling', 'conditional gate', 'geometric phase', 'bell state', 'phase-space loop'] },
  { label: 'Readout / fluorescence detection', modules: ['M8'],
    terms: ['readout', 'read out', 'fluorescence', 'state detection', 'detection', 'shelving', 'photon', 'poisson', 'discrimination', 'histogram'] },
  { label: 'Lamb–Dicke parameter η', modules: ['M3', 'M5', 'M6', 'M7'],
    terms: ['lamb-dicke', 'lamb dicke', 'η', 'eta', 'recoil', 'lamb dicke parameter'] },
  { label: 'Decoherence / coherence time', modules: ['M6', 'Other'],
    terms: ['decoherence', 'dephasing', 't2', 'coherence', 'relaxation', 'noise'] },
  { label: 'Motional heating', modules: ['M1', 'M5'],
    terms: ['heating', 'anomalous heating', 'motional bath', 'electric field noise'] },
];

let activeModule = 'all';
let papers = [];

function esc(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function extLinks(p) {
  const out = [];
  if (p.arxiv) out.push(`<a href="https://arxiv.org/abs/${encodeURIComponent(p.arxiv)}" target="_blank" rel="noopener">arXiv:${esc(p.arxiv)}</a>`);
  if (p.doi) out.push(`<a href="https://doi.org/${encodeURIComponent(p.doi)}" target="_blank" rel="noopener">DOI</a>`);
  return out.join('');
}
function tagChips(mods) {
  return (mods || []).map((m) => {
    const label = m === 'Other' ? 'Other' : m === 'Ref' ? 'Foundational' : m === 'Thesis' ? 'Thesis' : `${m} · ${MODULE_LABELS[m] || ''}`;
    return `<span class="lib-tag ${m === 'Other' ? 'other' : ''}" title="${esc(MODULE_LABELS[m] || m)}">${esc(label)}</span>`;
  }).join('');
}
function card(p) {
  const href = `pdf.html?file=${encodeURIComponent(p.file)}`;
  const hay = (p.title + ' ' + p.authors + ' ' + (p.venue || '') + ' ' + (p.arxiv || '') + ' ' + (p.doi || '')).toLowerCase();
  const mods = (p.modules || ['Other']);
  return `<div class="lib-card" data-search="${esc(hay)}" data-mods="${esc(mods.join(' '))}">
    <div class="lib-rank">${p.rank}</div>
    <div class="lib-main">
      <div class="lib-title">${esc(p.title)}</div>
      <div class="lib-auth">${esc(p.authors)}</div>
      <div class="lib-venue">${esc(p.venue || '')}</div>
      <div class="lib-tags">${tagChips(mods)}</div>
      <div class="lib-actions">
        <a class="read" href="${href}">📖 Read + AI copilot</a>
        ${extLinks(p)}
      </div>
    </div>
  </div>`;
}

// match a query against the concept dictionary (substring either way, so "eta"
// matches "η" via its term list, and "trap freq" matches "trap frequency").
function matchConcepts(q) {
  if (!q) return [];
  return CONCEPTS.filter((c) => c.terms.some((t) => t.includes(q) || q.includes(t)));
}

(async function () {
  let idx;
  try { idx = await fetch('Library/library-index.json').then((r) => r.json()); }
  catch (e) { listEl.innerHTML = `<div class="lib-count">Couldn't load the library index (${e.message}). Run the downloader first.</div>`; return; }
  papers = idx.papers || [];
  listEl.innerHTML = papers.map(card).join('');
  noteEl.innerHTML = `Source: <a href="${esc(idx.source)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(idx.group || 'publication list')}</a>. Type a parameter and the search maps it to the relevant module(s) and shows the related papers. Papers are tagged by the visualizer module (M1–M8) they most relate to; “Other” covers applications, simulation, sensing, and foundations. PDFs are freely-available author/arXiv copies, for personal/educational use.`;

  // autocomplete suggestions: concept labels + a couple of readable terms each
  const opts = new Set();
  for (const c of CONCEPTS) { opts.add(c.label); c.terms.slice(0, 3).forEach((t) => opts.add(t)); }
  suggestEl.innerHTML = [...opts].map((o) => `<option value="${esc(o)}">`).join('');

  // module filter chips with counts
  const counts = {};
  for (const p of papers) for (const m of (p.modules || ['Other'])) counts[m] = (counts[m] || 0) + 1;
  const chips = [`<button class="lib-chip on" data-m="all">All<span class="n">${papers.length}</span></button>`];
  for (const m of MODULE_ORDER) {
    if (!counts[m]) continue;
    const label = m === 'Other' ? 'Other' : m === 'Ref' ? 'Foundational refs' : m === 'Thesis' ? 'Theses' : `${m} · ${MODULE_LABELS[m]}`;
    chips.push(`<button class="lib-chip" data-m="${m}">${label}<span class="n">${counts[m]}</span></button>`);
  }
  filtersEl.innerHTML = chips.join('');
  filtersEl.querySelectorAll('.lib-chip').forEach((b) => b.addEventListener('click', () => {
    activeModule = b.dataset.m;
    filtersEl.querySelectorAll('.lib-chip').forEach((c) => c.classList.toggle('on', c === b));
    applyFilter();
  }));

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const matched = matchConcepts(q);
    const relMods = new Set(matched.flatMap((c) => c.modules));
    let n = 0;
    listEl.querySelectorAll('.lib-card').forEach((c) => {
      const okChip = activeModule === 'all' || c.dataset.mods.split(' ').includes(activeModule);
      let okQuery = true;
      if (q) {
        const textHit = c.dataset.search.includes(q);
        const conceptHit = matched.length > 0 && c.dataset.mods.split(' ').some((m) => relMods.has(m));
        okQuery = textHit || conceptHit;
      }
      const show = okChip && okQuery; c.classList.toggle('hidden', !show); if (show) n++;
    });

    // parameter-match hint
    if (matched.length) {
      const pills = [...relMods].filter((m) => MODULE_ORDER.includes(m))
        .sort((a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b))
        .map((m) => `<span class="pill">${m === 'Other' ? 'Other' : m}</span>`).join('');
      hintEl.innerHTML = `Parameter match: <b>${matched.map((c) => esc(c.label)).join(', ')}</b> → related modules ${pills} · showing the papers tagged to them.`;
      hintEl.classList.add('show');
    } else { hintEl.classList.remove('show'); }

    const scope = activeModule === 'all' ? '' : ` in ${activeModule === 'Other' ? 'Other' : activeModule + ' · ' + MODULE_LABELS[activeModule]}`;
    countEl.textContent = `${n} of ${papers.length} papers${scope}`;
  }

  search.addEventListener('input', applyFilter);
  // deep-link: library.html?q=…  (used by the info-popup reference links)
  const qp = new URLSearchParams(location.search).get('q');
  if (qp) search.value = qp;
  applyFilter();
})();
