// =============================================================================
// jc-main.js — wires the JCReservoir engine, the qubit Bloch sphere (reusing
// BlochScene), the Wigner heatmap, the Fock-population bar chart, and the ⟨N⟩/⟨X⟩
// time trace to the jc.html controls.
//
// The reservoir evolves in input WINDOWS: β is held constant for a window of
// duration dt, then updated. A dim-30 window (~0.3–0.4 s) is far too heavy to run
// synchronously per animation frame, so:
//   • "Play" injects the current β and runs ONE window per frame (smooth, live).
//   • The Wigner function (the costliest plot) is throttled to ~10 Hz.
//   • The input-sequence mode feeds a short series of random β values, one window
//     per frame, so the fading-memory / non-Gaussian response is visible live.
// =============================================================================
import { JCReservoir } from './jc.js';
import { wignerGrid } from './wigner.js';
import { BlochScene } from './scene.js';
import { WignerPlot, FockBar, TracePlot } from './jc-ui.js';
import { invalidatePlotColors } from './theme.js';

// ---- engine -----------------------------------------------------------------
const params = {
  regime: 'JC', Nc: 15, chi: 1, chiP: 1, kappa: 0.1,
  deltaA: 1, deltaB: 1, alpha: 0, dt: 10, beta: 0.5,
};
let sys = new JCReservoir(params);
sys.setBeta(params.beta);

// ---- scene: single-qubit Bloch sphere (reuse BlochScene, 1-item nuclei) ------
const QUBIT_COLOR = 0x4A90D9;
const scene = new BlochScene(document.getElementById('scene-container'),
  [{ symbol: 'qubit', color: QUBIT_COLOR }]);

// ---- plots ------------------------------------------------------------------
const wignerPlot = new WignerPlot(document.getElementById('wigner-canvas'));
const fockBar = new FockBar(document.getElementById('fock-canvas'));
const trace = new TracePlot(document.getElementById('trace-canvas'), { labelA: '⟨N⟩', labelB: '⟨X⟩' });
const wignerMinEl = document.getElementById('wigner-min');
const obsEl = document.getElementById('obs-readout');

const WIGNER_XMAX = 5;      // phase-space half-window
const WIGNER_N = 60;        // grid resolution (spec: modest 60×60)
let lastWignerMs = 0;
const WIGNER_HZ = 10;       // recompute ceiling

// ---- app state --------------------------------------------------------------
const state = {
  playing: false,
  speed: 1.0,
  seqQueue: [],        // pending β values for the input-sequence mode
  seqTotal: 0,
};

// ---- theme ------------------------------------------------------------------
const SCENE_BG = { dark: 0x0d1117, light: 0xeef1f5 };
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  scene.setBackground(SCENE_BG[theme]);
  invalidatePlotColors();
  try { localStorage.setItem('jc-theme', theme); } catch (e) { /* ignore */ }
  drawPlots(true);
}
applyTheme(localStorage.getItem('jc-theme') || 'dark');
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ---- rendering --------------------------------------------------------------
function drawObservables() {
  const N = sys.photonNumber();
  const N2 = sys.photonNumberSq();
  const varN = Math.max(0, N2 - N * N);
  const { X, P } = sys.quadratures();
  const pur = sys.purity();
  const bl = sys.qubitBloch();
  const rows = [
    ['⟨N⟩', N.toFixed(4)], ['ΔN²', varN.toFixed(4)],
    ['⟨X⟩', X.toFixed(4)], ['⟨P⟩', P.toFixed(4)],
    ['⟨σz⟩', bl.z.toFixed(4)], ['purity', pur.toFixed(4)],
    ['β', sys.beta.toFixed(3)], ['t', sys.t.toFixed(1)],
  ];
  obsEl.innerHTML = rows.map(([k, v]) => `<div class="obs"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

function drawPlots(forceWigner = false) {
  scene.update([sys.qubitBloch()]);
  fockBar.draw(sys.fockPopulations());
  trace.draw();
  drawObservables();
  const now = performance.now();
  if (forceWigner || now - lastWignerMs > 1000 / WIGNER_HZ) {
    const grid = wignerGrid(sys.rhoBoson(), { xmax: WIGNER_XMAX, n: WIGNER_N });
    const mn = wignerPlot.draw(grid);
    wignerMinEl.textContent = `min(W) = ${mn.toFixed(4)}${mn < -1e-3 ? '  (negative!)' : ''}`;
    lastWignerMs = now;
  }
}

// Push the current observables to the scrolling trace.
function sampleTrace() { trace.push(sys.photonNumber(), sys.quadX()); }

// ---- controls: playback -----------------------------------------------------
const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play';
});
document.getElementById('btn-reset').addEventListener('click', () => {
  sys.reset();
  trace.clear();
  state.playing = false; state.seqQueue = []; state.seqTotal = 0;
  playBtn.textContent = '▶ Play';
  document.getElementById('seq-status').textContent = '';
  drawPlots(true);
});

const speed = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
speed.addEventListener('input', () => { state.speed = parseFloat(speed.value); speedVal.textContent = state.speed.toFixed(2) + '×'; });

// ---- controls: drive + single window ----------------------------------------
const betaEl = document.getElementById('beta'), betaVal = document.getElementById('beta-val');
betaEl.addEventListener('input', () => { params.beta = parseFloat(betaEl.value); betaVal.textContent = params.beta.toFixed(2); sys.setBeta(params.beta); });
const dtEl = document.getElementById('dt'), dtVal = document.getElementById('dt-val');
dtEl.addEventListener('input', () => { params.dt = parseFloat(dtEl.value); dtVal.textContent = String(params.dt); sys.dt = params.dt; });

document.getElementById('btn-window').addEventListener('click', () => {
  sys.evolveWindow(params.beta, params.dt);
  sampleTrace();
  drawPlots(true);
});

// ---- controls: input-sequence mode ------------------------------------------
const seqN = document.getElementById('seq-n'), seqNVal = document.getElementById('seq-n-val');
seqN.addEventListener('input', () => { seqNVal.textContent = seqN.value; });
document.getElementById('btn-seq').addEventListener('click', () => {
  const n = parseInt(seqN.value, 10);
  state.seqQueue = Array.from({ length: n }, () => Math.random() * (parseFloat(betaEl.max) - parseFloat(betaEl.min)) + parseFloat(betaEl.min));
  state.seqTotal = n;
  state.playing = false;            // sequence takes over the run loop
  playBtn.textContent = '▶ Play';
  updateSeqStatus();
});
function updateSeqStatus() {
  const done = state.seqTotal - state.seqQueue.length;
  const el = document.getElementById('seq-status');
  el.textContent = state.seqTotal ? `window ${done}/${state.seqTotal}${state.seqQueue.length ? '  (running…)' : '  ✓ done'}` : '';
}

// ---- controls: regime + parameters ------------------------------------------
const regimeDesc = document.getElementById('regime-desc');
function renderRegimeDesc() {
  if (params.regime === 'JC') {
    regimeDesc.innerHTML = 'Jaynes-Cummings: <code>H = Δ_a σz + Δ_b a†a + χ(aσ⁺+a†σ⁻) + iβ(a−a†) + ασx</code>. Coherent photon↔qubit exchange (vacuum Rabi).';
  } else {
    regimeDesc.innerHTML = 'Dispersive JC: <code>H = χ′ a†a σz + iβ(a−a†) + ασx</code>. With α=0 the qubit ⟨σz⟩ is conserved (separable).';
  }
}
function setRegimeUI() {
  document.querySelectorAll('.regime-btn').forEach((b) => b.classList.toggle('primary', b.dataset.regime === params.regime));
  // χ (JC) vs χ′ (DJC): show the relevant one.
  document.getElementById('row-chi').style.display = params.regime === 'JC' ? '' : 'none';
  document.getElementById('row-chip').style.display = params.regime === 'DJC' ? '' : 'none';
  renderRegimeDesc();
}
document.querySelectorAll('.regime-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (params.regime === btn.dataset.regime) return;
    params.regime = btn.dataset.regime;
    // Apply the regime's default α (0 for JC, 1 for DJC) and reflect in the slider.
    params.alpha = params.regime === 'DJC' ? 1 : 0;
    rebuildEngine();
    const alphaEl = document.getElementById('alpha');
    alphaEl.value = String(params.alpha);
    document.getElementById('alpha-val').textContent = params.alpha.toFixed(2);
    setRegimeUI();
    drawPlots(true);
  });
});

// Generic parameter slider wiring. Nc rebuilds (dim change); others live-update.
function wireParam(id, key, fmt = (v) => v.toFixed(2), structural = false) {
  const el = document.getElementById(id), val = document.getElementById(id + '-val');
  el.addEventListener('input', () => {
    params[key] = parseFloat(el.value);
    val.textContent = fmt(params[key]);
    if (structural) rebuildEngine();
    else sys.setParams({ [key]: params[key] });
    // κ needs the collapse operator rebuilt.
    if (key === 'kappa') sys.setKappa(params.kappa);
    drawPlots(true);
  });
}
wireParam('chi', 'chi');
wireParam('chiP', 'chiP');
wireParam('kappa', 'kappa');
wireParam('alpha', 'alpha');
wireParam('deltaA', 'deltaA');
wireParam('deltaB', 'deltaB');
wireParam('Nc', 'Nc', (v) => String(v), true);

// Rebuild the engine from `params` (used for regime + Nc changes). Preserves the
// current β; resets ρ (dimension may change).
function rebuildEngine() {
  sys = new JCReservoir(params);
  sys.setBeta(params.beta);
  trace.clear();
  state.seqQueue = []; state.seqTotal = 0;
  document.getElementById('seq-status').textContent = '';
}

// ---- animation loop ---------------------------------------------------------
// One reservoir window per frame keeps the tab responsive (a dim-30 window is
// ~0.3–0.4 s of compute; running one per rAF yields a live, smooth substrate).
function frame() {
  let advanced = false;
  if (state.seqQueue.length) {
    // Input-sequence mode: pop one β, evolve one window.
    const b = state.seqQueue.shift();
    params.beta = b;
    betaEl.value = String(Math.max(parseFloat(betaEl.min), Math.min(parseFloat(betaEl.max), b)));
    betaVal.textContent = b.toFixed(2);
    sys.evolveWindow(b, params.dt);
    sampleTrace();
    updateSeqStatus();
    advanced = true;
  } else if (state.playing) {
    // Free run: inject current β, evolve one window.
    sys.evolveWindow(params.beta, params.dt);
    sampleTrace();
    advanced = true;
  }

  if (advanced) drawPlots(false);
  scene.render();
  requestAnimationFrame(frame);
}

// ---- init -------------------------------------------------------------------
setRegimeUI();
scene.setCoupling(false);   // single sphere → no coupling lines
drawPlots(true);
requestAnimationFrame(frame);
