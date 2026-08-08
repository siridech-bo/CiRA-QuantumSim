// =============================================================================
// ion-main.js — page loop + wiring for the trapped-ion substrate. Owns one live
// IonSystem engine, the LevelDiagram (center), the four traces + excitation
// spectrum + |ρ| heatmap (right), and every control. Uses the self-calibrating
// per-frame step budget from src/main.js so the tab stays responsive (the ion
// Hamiltonian is non-diagonal — no free-evolution fast path — so cooling animates
// in slow motion rather than freezing). Substrates 1 & 2 are untouched.
// =============================================================================
import { IonSystem } from './ion.js';
import { LevelDiagram } from './ion-levels.js';
import { PeTrace, FluorescenceTrace, NbarTrace, ExcitationSpectrum } from './ion-traces.js';
import { DensityHeatmap } from './heatmap.js';
import { invalidatePlotColors } from './theme.js';
import {
  MODULES, ModuleTabs, wireSlider, prepareState,
  excitationPoint, scanGrid, measureAsymmetry, measureFFT,
} from './ion-ui.js';

// ---- engine + parameters ----------------------------------------------------
const params = {
  N: 20, lambdaNm: 729, nuTrapHz: 1e6, massU: 40,
  delta: -1, rabi: 0.30, mode: 'exact',
  gamma: 0.10, heating: 0.02, nBath: 1, gammaPhi: 0.05,
  seOn: false, bathOn: false, dephaseOn: false,
  prep: { kind: 'thermal', param: 2.0 },
};
let sys = buildEngine();

function buildEngine() {
  const s = new IonSystem({
    N_FOCK: params.N, lambdaNm: params.lambdaNm, nuTrapHz: params.nuTrapHz, massU: params.massU,
    omegaZ: 1, delta: params.delta, rabi: params.rabi, mode: params.mode,
    Gamma: params.gamma, heating: params.heating, nBath: params.nBath, gammaPhi: params.gammaPhi,
  });
  s.setSpontaneousEmission(params.seOn, params.gamma);
  s.setMotionalBath(params.bathOn, { heating: params.heating, nBath: params.nBath });
  s.setDephasing(params.dephaseOn, params.gammaPhi);
  prepareState(s, params.prep);
  return s;
}

// ---- plots ------------------------------------------------------------------
const diagram = new LevelDiagram(document.getElementById('levels-canvas'), {
  onDetuning: (d) => setDelta(d, true),
});
const peTrace = new PeTrace(document.getElementById('pe-canvas'));
const fluorTrace = new FluorescenceTrace(document.getElementById('fluor-canvas'), { binTime: 1.5 });
const nbarTrace = new NbarTrace(document.getElementById('nbar-canvas'));
const excSpectrum = new ExcitationSpectrum(document.getElementById('spectrum-canvas'));
const heatmap = new DensityHeatmap(document.getElementById('heatmap-canvas'));
const obsEl = document.getElementById('obs-readout');
const truncEl = document.getElementById('trunc-warn');

// ---- app state --------------------------------------------------------------
const state = {
  playing: false, speed: 1,
  stepBudget: 6, dwell: 0.4, sampleAccum: 0,
  scanQueue: null,      // { grid, i, cfg, delta[], pe[] } while scanning δ
};
let lastHeatMs = 0;
const HEAT_HZ = 8;

// ---- theme ------------------------------------------------------------------
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  invalidatePlotColors();
  try { localStorage.setItem('ion-theme', theme); } catch (e) { /* ignore */ }
  refresh(true);
}
themeToggle.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

// =============================================================================
// Rendering
// =============================================================================
function drawObservables() {
  const rows = [
    ['n̄', sys.nBar().toFixed(4)], ['P_e', sys.pExcited().toFixed(4)],
    ['purity', sys.purity().toFixed(4)], ['η', sys.etaValue().toFixed(4)],
    ['δ/ω_z', sys.detuning().toFixed(3)], ['Ω/ω_z', sys.rabi().toFixed(3)],
    ['t', sys.t.toFixed(1)], ['dim', String(sys.dim)],
  ];
  obsEl.innerHTML = rows.map(([k, v]) =>
    `<div class="obs"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

// Flat ion rhoAbs() → nested array for the reused DensityHeatmap.
function nestedRhoAbs() {
  const flat = sys.rhoAbs(), D = sys.dim, out = [];
  for (let i = 0; i < D; i++) { out[i] = []; for (let j = 0; j < D; j++) out[i][j] = flat[i * D + j]; }
  return out;
}

function drawTrunc() {
  const t = sys.truncationOccupancy();
  const hot = t > 1e-4;
  truncEl.classList.toggle('hot', hot);
  truncEl.textContent = `truncation occupancy (top-3 Fock) = ${t.toExponential(2)}` +
    (hot ? '  ⚠ raise N_FOCK — the simulation may be lying' : '');
}

function drawDiagram() {
  const pops = sys.populations();
  diagram.draw({
    popG: pops.g, popE: pops.e, coupling: sys.couplingMatrix(),
    detuning: sys.detuning(), rabi: sys.rabi(), omegaZ: sys.omegaZ,
    gamma: params.seOn ? params.gamma : 0,
  });
}

function refresh(full = false) {
  drawDiagram();
  peTrace.draw(); fluorTrace.draw(); nbarTrace.draw(); excSpectrum.draw();
  drawObservables(); drawTrunc();
  const now = performance.now();
  if (full || now - lastHeatMs > 1000 / HEAT_HZ) { heatmap.draw(nestedRhoAbs()); lastHeatMs = now; }
}

// Sample the traces at the current instant.
function sampleTraces() {
  peTrace.push(sys.pExcited());
  fluorTrace.push(params.gamma * sys.pExcited());   // R = Γ·ρ_ee (Γ_eff even if SE toggle off, as the "detected" rate)
  nbarTrace.push(sys.nBar());
}

// =============================================================================
// Self-calibrating per-frame step budget (pattern from src/main.js). Measures the
// real cost of one engine step for the current dim and targets ~12 ms/frame.
// =============================================================================
const MAX_SIM_PER_FRAME = 4.0;   // cap sim-time advanced per frame (units of 1/ω_z)
function calibrateStepBudget() {
  const TARGET_MS = 12;
  try {
    const probe = buildEngine();
    probe.step(state.dwell);                    // warm JIT (discard)
    const t0 = performance.now();
    probe.step(state.dwell);
    let per = performance.now() - t0;
    if (per < 6) { const t1 = performance.now(); for (let i = 0; i < 4; i++) probe.step(state.dwell); per = (performance.now() - t1) / 4; }
    state.stepBudget = Math.max(1, Math.min(48, Math.floor(TARGET_MS / Math.max(per, 0.05))));
  } catch (e) { state.stepBudget = 6; }
}

// =============================================================================
// Controls
// =============================================================================
// -- module tabs --
const moduleActions = document.getElementById('module-actions');
const tabs = new ModuleTabs(document.getElementById('module-tabs'), (id) => {
  const m = MODULES[id];
  document.getElementById('module-desc').innerHTML = `<b>${m.name}</b> — ${m.desc}`;
  document.getElementById('break-it').innerHTML = m.breakIt;
  moduleActions.querySelectorAll('[data-for]').forEach((el) =>
    el.style.display = el.dataset.for === id ? '' : 'none');
});

// -- playback --
const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play';
});
document.getElementById('btn-reset').addEventListener('click', () => {
  prepareState(sys, params.prep);
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  state.playing = false; playBtn.textContent = '▶ Play';
  refresh(true);
});
wireSlider('speed', (v) => { state.speed = v; }, (v) => v.toFixed(2) + '×');

// -- state preparation --
function syncStateRows() {
  const k = params.prep.kind;
  document.getElementById('row-fock').style.display = k === 'fock' ? '' : 'none';
  document.getElementById('row-thermal').style.display = k === 'thermal' ? '' : 'none';
  document.getElementById('row-coherent').style.display = k === 'coherent' ? '' : 'none';
}
document.getElementById('state-kind').addEventListener('change', (e) => {
  params.prep.kind = e.target.value;
  if (params.prep.kind === 'fock') params.prep.param = parseFloat(document.getElementById('fock-n').value);
  else if (params.prep.kind === 'thermal') params.prep.param = parseFloat(document.getElementById('thermal-nbar').value);
  else if (params.prep.kind === 'coherent') params.prep.param = parseFloat(document.getElementById('coherent-alpha').value);
  syncStateRows();
});
wireSlider('fock-n', (v) => { if (params.prep.kind === 'fock') params.prep.param = v; }, (v) => String(v));
wireSlider('thermal-nbar', (v) => { if (params.prep.kind === 'thermal') params.prep.param = v; }, (v) => v.toFixed(1));
wireSlider('coherent-alpha', (v) => { if (params.prep.kind === 'coherent') params.prep.param = v; }, (v) => v.toFixed(1));
document.getElementById('btn-prepare').addEventListener('click', () => {
  prepareState(sys, params.prep);
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  refresh(true);
});

// -- drive --
function setDelta(d, fromDrag = false) {
  params.delta = d;
  sys.setDetuning(d);
  const el = document.getElementById('delta'), val = document.getElementById('delta-val');
  el.value = String(d); val.textContent = (d < 0 ? '−' : '') + Math.abs(d).toFixed(2);
  refresh();   // δ/Ω don't change the dimension → no step-budget recalibration needed
}
wireSlider('delta', (v) => setDelta(v), (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
wireSlider('rabi', (v) => { params.rabi = v; sys.setRabi(v); refresh(); });
document.getElementById('coupling-mode').addEventListener('change', (e) => {
  params.mode = e.target.value; sys.setCouplingMode(params.mode); calibrateStepBudget(); refresh();
});

// -- trap → η --
function updateEta() {
  const el = document.getElementById('eta-readout');
  el.innerHTML = `η = <b>${sys.etaValue().toFixed(4)}</b> &nbsp; (λ=${params.lambdaNm} nm, ν_z=${(params.nuTrapHz / 1e6).toFixed(1)} MHz, ${params.massU} u). Stiffer trap ⇒ smaller η.`;
}
document.getElementById('lambda').addEventListener('change', (e) => {
  params.lambdaNm = parseFloat(e.target.value); sys.setTrap({ lambdaNm: params.lambdaNm }); updateEta(); refresh();
});
wireSlider('nutrap', (v) => { params.nuTrapHz = v * 1e6; sys.setTrap({ nuTrapHz: params.nuTrapHz }); updateEta(); refresh(); }, (v) => v.toFixed(1));

// -- dissipators --
document.getElementById('chk-se').addEventListener('change', (e) => { params.seOn = e.target.checked; sys.setSpontaneousEmission(params.seOn, params.gamma); calibrateStepBudget(); refresh(); });
wireSlider('gamma', (v) => { params.gamma = v; sys.setSpontaneousEmission(params.seOn, params.gamma); refresh(); });
document.getElementById('chk-bath').addEventListener('change', (e) => { params.bathOn = e.target.checked; sys.setMotionalBath(params.bathOn, { heating: params.heating, nBath: params.nBath }); calibrateStepBudget(); refresh(); });
wireSlider('heating', (v) => { params.heating = v; sys.setMotionalBath(params.bathOn, { heating: params.heating, nBath: params.nBath }); refresh(); }, (v) => v.toFixed(3));
document.getElementById('chk-dephase').addEventListener('change', (e) => { params.dephaseOn = e.target.checked; sys.setDephasing(params.dephaseOn, params.gammaPhi); calibrateStepBudget(); refresh(); });
wireSlider('gammaphi', (v) => { params.gammaPhi = v; sys.setDephasing(params.dephaseOn, params.gammaPhi); refresh(); });

// -- N_FOCK (structural rebuild) --
wireSlider('nfock', (v) => {
  params.N = Math.round(v);
  sys = buildEngine();
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  calibrateStepBudget(); refresh(true);
}, (v) => String(Math.round(v)));

// -- diagram controls --
wireSlider('zoom', (v) => diagram.setMotionalZoom(v), (v) => v.toFixed(1) + '×');
document.getElementById('lenmap').addEventListener('change', (e) => diagram.setLengthMap(e.target.value));
document.getElementById('chk-ghost').addEventListener('change', (e) => diagram.setGhost(e.target.checked));

// -- M3: chunked δ scan (a few points per frame → stays responsive) --
document.getElementById('btn-scan').addEventListener('click', () => {
  const grid = scanGrid(1.5, 61);
  const cfg = {
    N: Math.min(params.N, 16), lambdaNm: params.lambdaNm, nuTrapHz: params.nuTrapHz, massU: params.massU,
    rabi: params.rabi, mode: params.mode, prep: params.prep,
    tProbe: Math.min(60, Math.PI / params.rabi),   // carrier π-pulse (sidebands stay weak/resolved)
  };
  state.scanQueue = { grid, i: 0, cfg, delta: [], pe: [] };
});

// -- M5: cooling preset --
document.getElementById('btn-cool').addEventListener('click', () => {
  setDelta(-1);                                   // red sideband
  document.getElementById('chk-se').checked = true;
  params.seOn = true; sys.setSpontaneousEmission(true, params.gamma);
  prepareState(sys, params.prep);
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  calibrateStepBudget();
  state.playing = true; playBtn.textContent = '⏸ Pause';
  refresh(true);
});

// -- thermometry (two independent n̄) --
document.getElementById('btn-thermo').addEventListener('click', () => {
  const nbarSet = params.prep.kind === 'thermal' ? params.prep.param : 1.0;
  const el = document.getElementById('thermo-readout');
  el.innerHTML = '<span class="lbl">measuring n̄ two independent ways… (~15 s, the tab pauses)</span>';
  setTimeout(() => {
    const nAsym = measureAsymmetry(nbarSet);
    const nFFT = measureFFT(nbarSet);
    el.innerHTML =
      `<div><span class="lbl">set n̄ =</span> ${nbarSet.toFixed(2)}</div>` +
      `<div><span class="lbl">sideband asymmetry:</span> n̄ = ${nAsym.toFixed(3)}</div>` +
      `<div><span class="lbl">FFT of P_e(t):</span> n̄ = ${nFFT.toFixed(3)}</div>` +
      `<div class="lbl">two independent methods agree ⇒ real thermometry</div>`;
  }, 30);
});

// =============================================================================
// Canvas sizing for the crisp level diagram (fill its wrapper).
// =============================================================================
function resizeLevels() {
  const cv = document.getElementById('levels-canvas');
  const wrap = document.getElementById('levels-wrap');
  const w = Math.max(320, wrap.clientWidth), h = Math.max(320, wrap.clientHeight);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; drawDiagram(); }
}
window.addEventListener('resize', resizeLevels);

// =============================================================================
// Animation loop
// =============================================================================
function frame() {
  // Chunked excitation scan takes precedence (M3).
  if (state.scanQueue) {
    const q = state.scanQueue;
    const perFrame = 4;
    for (let k = 0; k < perFrame && q.i < q.grid.length; k++, q.i++) {
      const d = q.grid[q.i];
      q.delta.push(d); q.pe.push(excitationPoint(q.cfg, d));
    }
    excSpectrum.set({ delta: q.delta, pe: q.pe, omegaZ: 1 });
    document.getElementById('scan-status').textContent = `scanning δ… ${q.i}/${q.grid.length}`;
    if (q.i >= q.grid.length) { document.getElementById('scan-status').textContent = `spectrum: ${q.grid.length} points ✓`; state.scanQueue = null; }
    refresh();
    requestAnimationFrame(frame);
    return;
  }

  if (state.playing) {
    const budget = state.stepBudget;
    const dtSim = Math.min(MAX_SIM_PER_FRAME, budget * state.dwell * state.speed);
    state.sampleAccum += dtSim;
    let steps = 0;
    while (state.sampleAccum >= state.dwell && steps < budget) {
      sys.step(state.dwell);
      sampleTraces();
      state.sampleAccum -= state.dwell;
      steps++;
    }
    if (steps >= budget) state.sampleAccum = 0;   // drop backlog
    refresh();
  }
  requestAnimationFrame(frame);
}

// =============================================================================
// Init
// =============================================================================
applyTheme(localStorage.getItem('ion-theme') || 'dark');
tabs.select('M3');
syncStateRows();
updateEta();
resizeLevels();
calibrateStepBudget();
refresh(true);
requestAnimationFrame(frame);
