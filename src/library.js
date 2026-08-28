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
const introEl = document.getElementById('lib-approach-intro');
const apprEl = document.getElementById('lib-approaches');

// ---- the three main approaches (qubit encoding × gate drive) ----------------
const APPROACHES = {
  optical: { short: 'Optical · Ca⁺', label: 'Optical qubit (⁴⁰Ca⁺, laser)', color: '#4A90D9',
    desc: 'Optical qubit on the narrow S₁/₂–D₅/₂ line (⁴⁰Ca⁺, 729 nm), driven directly by a narrow laser — Innsbruck / AQT.' },
  raman: { short: 'Raman · Yb⁺', label: 'Laser Raman (¹⁷¹Yb⁺ hyperfine)', color: '#50C878',
    desc: 'Hyperfine qubit (¹⁷¹Yb⁺, 12.6 GHz) driven by two-photon laser Raman beams — the commercial mainstream: IonQ / Quantinuum.' },
  magic: { short: 'MAGIC · Yb⁺', label: 'Microwave / MAGIC (¹⁷¹Yb⁺, laser-free)', color: '#FF8C00',
    desc: 'Hyperfine qubit driven by microwaves + a static ∂B/∂z gradient (MAGIC) for the spin–motion coupling — laser-free gates: Wunderlich / Siegen / eleQtron.' },
  general: { short: 'General', label: 'Foundational & general', color: '#b57edc',
    desc: 'Reviews, trap physics, and technique papers that apply across all approaches.' },
};
const APPROACH_ORDER = ['optical', 'raman', 'magic', 'general'];
let activeApproach = 'all';

const MODULE_LABELS = {
  M1: 'Paul trap', M2: 'Normal modes', M3: 'Sidebands', M4: 'Doppler cool',
  M5: 'Sideband cool', M6: '1-qubit gate', M7: 'MS gate', M8: 'Readout',
  PDH: 'Laser stabilization (PDH)',
  Other: 'Applications & foundations', Ref: 'Foundational references', Thesis: 'PhD theses & long-form',
};
const MODULE_ORDER = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'PDH', 'Other', 'Ref', 'Thesis'];

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
  { label: 'Laser frequency stabilization (Pound–Drever–Hall)', modules: ['PDH'],
    terms: ['pdh', 'pound-drever-hall', 'pound drever hall', 'pound–drever–hall', 'pound', 'drever', 'laser stabilization', 'frequency stabilization', 'laser lock', 'cavity lock', 'linewidth', 'linewidth narrowing', 'finesse', 'reference cavity', 'ule cavity', 'clock laser', 'phase noise', 'servo', 'feedback control'] },
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
    const label = m === 'Other' ? 'Other' : m === 'Ref' ? 'Foundational' : m === 'Thesis' ? 'Thesis' : m === 'PDH' ? 'PDH' : `${m} · ${MODULE_LABELS[m] || ''}`;
    return `<span class="lib-tag ${m === 'Other' ? 'other' : ''}" title="${esc(MODULE_LABELS[m] || m)}">${esc(label)}</span>`;
  }).join('');
}
function card(p) {
  const hay = (p.title + ' ' + p.authors + ' ' + (p.venue || '') + ' ' + (p.arxiv || '') + ' ' + (p.doi || '')).toLowerCase();
  const mods = (p.modules || ['Other']);
  const appr = APPROACHES[p.approach] ? p.approach : 'general';
  const apprBadge = `<span class="lib-appr appr-${appr}" title="${esc(APPROACHES[appr].label)}">${esc(APPROACHES[appr].short)}</span>`;
  // Reference-only entries (paywalled, no freely-hostable copy) show links but no reader.
  const readBtn = p.file
    ? `<a class="read" href="pdf.html?file=${encodeURIComponent(p.file)}">📖 Read + AI copilot</a>`
    : `<span class="lib-refonly" title="No freely-available copy to host — follow the DOI / publisher link">reference only ↗</span>`;
  return `<div class="lib-card" data-search="${esc(hay)}" data-mods="${esc(mods.join(' '))}" data-appr="${appr}">
    <div class="lib-rank">${p.rank}</div>
    <div class="lib-main">
      <div class="lib-title">${esc(p.title)}</div>
      <div class="lib-auth">${esc(p.authors)}</div>
      <div class="lib-venue">${esc(p.venue || '')}</div>
      <div class="lib-tags">${apprBadge}${tagChips(mods)}</div>
      <div class="lib-actions">
        ${readBtn}
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
  noteEl.innerHTML = `Papers are grouped by the <b>three main approaches</b> (optical Ca⁺ · laser-Raman Yb⁺ · microwave-MAGIC Yb⁺) and tagged by the visualizer module (M1–M8) they most relate to; “Other” covers applications, simulation, sensing, and foundations. The collection is Wunderlich-group-centric (MAGIC), with the Innsbruck theses for the optical approach and added IonQ/Quantinuum references for the Raman approach. PDFs are freely-available author/arXiv copies, for personal/educational use.`;

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
    const label = m === 'Other' ? 'Other' : m === 'Ref' ? 'Foundational refs' : m === 'Thesis' ? 'Theses' : m === 'PDH' ? 'PDH · Laser stabilization' : `${m} · ${MODULE_LABELS[m]}`;
    chips.push(`<button class="lib-chip" data-m="${m}">${label}<span class="n">${counts[m]}</span></button>`);
  }
  filtersEl.innerHTML = chips.join('');
  filtersEl.querySelectorAll('.lib-chip').forEach((b) => b.addEventListener('click', () => {
    activeModule = b.dataset.m;
    filtersEl.querySelectorAll('.lib-chip').forEach((c) => c.classList.toggle('on', c === b));
    applyFilter();
  }));

  // ---- the three-approach explainer + filter chips ----
  const acounts = {};
  for (const p of papers) { const a = APPROACHES[p.approach] ? p.approach : 'general'; acounts[a] = (acounts[a] || 0) + 1; }
  introEl.innerHTML = '<b>Three ways to build a trapped-ion qubit.</b> ' +
    APPROACH_ORDER.filter((a) => a !== 'general').map((a) =>
      `<span class="ai-item" style="--ac:${APPROACHES[a].color}"><b>${APPROACHES[a].short}</b> — ${APPROACHES[a].desc}</span>`).join('') +
    ' Pick one to filter the references, or combine with a module / parameter search.';
  const achips = [`<button class="lib-appr-chip on" data-a="all">All approaches<span class="n">${papers.length}</span></button>`];
  for (const a of APPROACH_ORDER) {
    if (!acounts[a]) continue;
    achips.push(`<button class="lib-appr-chip" data-a="${a}" style="--ac:${APPROACHES[a].color}" title="${esc(APPROACHES[a].label)}">${esc(APPROACHES[a].short)}<span class="n">${acounts[a]}</span></button>`);
  }
  apprEl.innerHTML = achips.join('');
  apprEl.querySelectorAll('.lib-appr-chip').forEach((b) => b.addEventListener('click', () => {
    activeApproach = b.dataset.a;
    apprEl.querySelectorAll('.lib-appr-chip').forEach((c) => c.classList.toggle('on', c === b));
    applyFilter();
  }));

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const matched = matchConcepts(q);
    const relMods = new Set(matched.flatMap((c) => c.modules));
    let n = 0;
    listEl.querySelectorAll('.lib-card').forEach((c) => {
      const okChip = activeModule === 'all' || c.dataset.mods.split(' ').includes(activeModule);
      const okAppr = activeApproach === 'all' || c.dataset.appr === activeApproach;
      let okQuery = true;
      if (q) {
        const textHit = c.dataset.search.includes(q);
        const conceptHit = matched.length > 0 && c.dataset.mods.split(' ').some((m) => relMods.has(m));
        okQuery = textHit || conceptHit;
      }
      const show = okChip && okAppr && okQuery; c.classList.toggle('hidden', !show); if (show) n++;
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
    const ascope = activeApproach === 'all' ? '' : ` · ${APPROACHES[activeApproach].short}`;
    countEl.textContent = `${n} of ${papers.length} papers${scope}${ascope}`;
  }

  search.addEventListener('input', applyFilter);
  // deep-link: library.html?q=…  (used by the info-popup reference links)
  const qp = new URLSearchParams(location.search).get('q');
  if (qp) search.value = qp;
  applyFilter();
})();
