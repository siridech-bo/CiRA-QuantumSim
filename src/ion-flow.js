// =============================================================================
// ion-flow.js — the experiment pipeline. One shared definition drives three UI
// affordances that convey "these modules are stages of ONE real experiment, run
// in this order, each depending on the one before":
//   (1) a clickable "🧭 Experiment map" overlay (openFlowMap),
//   (2) phase labels on the center tab bar (data lives here, markup in ion.html),
//   (3) a per-module breadcrumb with prev/next jumps (renderCrumb).
// The flow is atom-agnostic — the STAGES are identical for ⁴⁰Ca⁺ and ¹⁷¹Yb⁺; the
// hardware differences live in each module's "🔬 In the lab" panel.
// =============================================================================

export const PHASES = [
  {
    key: 'prep', label: 'Prepare', hint: 'trap & structure the ion(s)',
    modules: [
      { id: 'M1', name: 'Paul trap', why: 'Confine the ion — the RF trap makes the harmonic oscillator everything else needs.' },
      { id: 'M2', name: 'Normal modes', why: 'Add ions → shared vibrational modes, the "bus" a two-qubit gate later rides.' },
    ],
  },
  {
    key: 'cool', label: 'Cool', hint: 'hot → motional ground state',
    modules: [
      { id: 'M4', name: 'Doppler cool', why: 'A freshly loaded ion is hot; broad-line Doppler cooling brings it to ~10 quanta.' },
      { id: 'M5', name: 'Sideband cool', why: 'Resolved-sideband cooling takes it from the Doppler limit down to the ground state |0⟩.' },
    ],
  },
  {
    key: 'char', label: 'Characterize', hint: 'measure & calibrate',
    modules: [
      { id: 'M3', name: 'Sidebands', why: 'Spectroscopy: read n̄ from the red/blue asymmetry and confirm the ion is cold (dark red sideband).' },
      { id: 'M9', name: 'Rabi', why: 'Drive the carrier to calibrate the π-pulse time (2π/Ω) that every gate uses.' },
      { id: 'M10', name: 'Ramsey', why: 'Measure the coherence time T₂* and the qubit detuning.' },
    ],
  },
  {
    key: 'comp', label: 'Compute', hint: 'run the gates',
    modules: [
      { id: 'M6', name: '1-qubit gate', why: 'With calibrated pulses, rotate the qubit — real Rx gates on the Bloch sphere.' },
      { id: 'M7', name: 'MS gate', why: 'Entangle two qubits through the cold shared mode (Mølmer–Sørensen).' },
    ],
  },
  {
    key: 'read', label: 'Read', hint: 'measure the result',
    modules: [
      { id: 'M8', name: 'Readout', why: 'Read the qubits by state-selective fluorescence — bright |g⟩ vs dark |e⟩.' },
    ],
  },
];

// Phase-to-phase "why this order" note, shown on the arrows in the map.
const PHASE_HANDOFF = {
  cool: 'cool BEFORE you compute — a hot ion loses gate fidelity',
  char: 'verify & calibrate on the now-cold ion',
  comp: 'calibrated pulses → run the gates',
  read: 'read out the result',
};

// Flatten to the linear experimental order: [{id,name,phase,phaseLabel,why,idx}].
export const FLOW = [];
for (const ph of PHASES) for (const m of ph.modules) {
  FLOW.push({ ...m, phase: ph.key, phaseLabel: ph.label, idx: FLOW.length });
}
const BY_ID = Object.fromEntries(FLOW.map((s) => [s.id, s]));

// ---- module-tab phase membership (for coloring the tabs) --------------------
export const MODULE_PHASE = Object.fromEntries(FLOW.map((s) => [s.id, s.phase]));

// ---- (3) per-module breadcrumb ---------------------------------------------
// Renders "Stage N/10 · Phase — why", with ‹prev  next› jump buttons, into `el`.
export function renderCrumb(el, moduleId, onSelect) {
  if (!el) return;
  const s = BY_ID[moduleId];
  if (!s) { el.hidden = true; return; }
  el.hidden = false;
  const prev = FLOW[s.idx - 1], next = FLOW[s.idx + 1];
  const nav = (m, dir) => m
    ? `<button class="crumb-nav" data-goto="${m.id}" title="${dir === 'prev' ? 'previous' : 'next'} stage">${dir === 'prev' ? '‹ ' : ''}${m.id} ${m.name}${dir === 'next' ? ' ›' : ''}</button>`
    : `<span class="crumb-nav ghost">${dir === 'prev' ? 'start' : 'end'}</span>`;
  el.innerHTML =
    `<div class="crumb-top">
       <span class="crumb-stage" data-phase="${s.phase}">Stage ${s.idx + 1}/${FLOW.length} · ${s.phaseLabel}</span>
       <span class="crumb-map-hint">🧭 map</span>
     </div>
     <div class="crumb-why">${s.why}</div>
     <div class="crumb-navs">${nav(prev, 'prev')}${nav(next, 'next')}</div>`;
  el.querySelectorAll('.crumb-nav[data-goto]').forEach((b) =>
    b.addEventListener('click', () => onSelect && onSelect(b.dataset.goto)));
  const hint = el.querySelector('.crumb-map-hint');
  if (hint) hint.addEventListener('click', openFlowMap);
}

// ---- (1) the "🧭 Experiment map" overlay -----------------------------------
let backdrop = null, onSelectCb = null, lastFocus = null;

function ensureDialog() {
  if (backdrop) return;
  backdrop = document.createElement('div');
  backdrop.className = 'flow-backdrop';
  backdrop.innerHTML = `
    <div class="flow-dialog" role="dialog" aria-modal="true" aria-label="Experiment map">
      <div class="flow-head">
        <h3>🧭 The experiment, end&nbsp;to&nbsp;end</h3>
        <button class="flow-close" type="button" aria-label="Close">&times;</button>
      </div>
      <p class="flow-intro">The modules are the <b>stages of one real trapped-ion experiment</b> — run them in this order, because each depends on the one before. Click any stage to jump to it. (Hardware for ⁴⁰Ca⁺ vs ¹⁷¹Yb⁺ is in each module's <b>🔬 In the lab</b>.)</p>
      <div class="flow-rail"></div>
      <ul class="flow-rules"></ul>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.flow-close').addEventListener('click', closeFlowMap);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeFlowMap(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeFlowMap(); });

  // build the rail (phase columns + arrows) once
  const rail = backdrop.querySelector('.flow-rail');
  PHASES.forEach((ph, i) => {
    if (i > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'flow-arrow';
      arrow.innerHTML = `<span class="flow-arrowhead">▸</span><span class="flow-why">${PHASE_HANDOFF[ph.key] || ''}</span>`;
      rail.appendChild(arrow);
    }
    const col = document.createElement('div');
    col.className = 'flow-col'; col.dataset.phase = ph.key;
    col.innerHTML = `<div class="flow-phase">${ph.label}</div><div class="flow-phase-hint">${ph.hint}</div>`;
    for (const m of ph.modules) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'flow-chip'; chip.dataset.goto = m.id;
      chip.innerHTML = `<span class="flow-chip-id">${m.id}</span><span class="flow-chip-name">${m.name}</span>`;
      chip.title = m.why;
      chip.addEventListener('click', () => { const id = m.id; closeFlowMap(); onSelectCb && onSelectCb(id); });
      col.appendChild(chip);
    }
    rail.appendChild(col);
  });

  // the "why this order" rules
  const rules = backdrop.querySelector('.flow-rules');
  rules.innerHTML = [
    '<b>Cool before you compute</b> — a hot ion decoheres and loses gate fidelity.',
    '<b>M4 → M5</b> — sideband cooling <i>starts from</i> the Doppler limit, so Doppler-cool first.',
    '<b>M3 is the ruler</b> — use it throughout to read n̄ and confirm the ion is cold (a cold ion has a dark red sideband).',
    '<b>M9 / M10 calibrate the pulses</b> — the π-time (Rabi) and the coherence time & detuning (Ramsey) that M6 / M7 then rely on.',
    '<b>M7 needs a cold shared mode</b> — so normal modes (M2) + ground-state cooling (M5) come first.',
  ].map((t) => `<li>${t}</li>`).join('');
}

export function initFlow(opts = {}) { onSelectCb = opts.onSelect || null; ensureDialog(); }

export function openFlowMap() {
  ensureDialog();
  lastFocus = document.activeElement;
  backdrop.classList.add('open');
  backdrop.querySelector('.flow-close').focus();
}
export function closeFlowMap() {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}
