// Wires the REAL quantum density-matrix engine, 3D scene, FID plot, live
// spectrum, and 8x8 |ρ| heatmap to the UI controls.
import { QuantumSpinSystem, SPINQ_PARAMS } from './quantum.js';
import { BlochScene } from './scene.js';
import { FidPlot } from './fid.js';
import { Spectrum } from './spectrum.js';
import { DensityHeatmap } from './heatmap.js';
import { compileCircuit } from './gates.js';
import { CircuitRunner } from './runner.js';
import { CircuitUI, Histogram } from './circuit-ui.js';

const system = new QuantumSpinSystem({ relaxation: true, coupling: true });
const scene = new BlochScene(document.getElementById('scene-container'), SPINQ_PARAMS.nuclei);
const fid = new FidPlot(document.getElementById('fid-canvas'));

// Fixed dwell time for FID sampling / spectrum. 1 ms → ±500 Hz bandwidth,
// enough to resolve the 12–30 Hz display offsets and 42/220 Hz J-splittings.
const DWELL = 1e-3;
const spectrum = new Spectrum(document.getElementById('spectrum-canvas'), { dwell: DWELL, fftSize: 1024 });
const heatmap = new DensityHeatmap(document.getElementById('heatmap-canvas'));
const histogram = new Histogram(document.getElementById('histogram-canvas'));

const state = {
  playing: false,
  speed: 1.0,
  relaxation: true,
  coupling: true,
  sampleAccum: 0,     // sim-time accumulator for fixed-dwell FID sampling
  circuitMode: false, // true while a compiled circuit is running/stepping
};

// Cap simulation time advanced per animation frame. The internal RK4 sub-step
// tightens with the Hamiltonian's fastest frequency (~50 µs when J is on), so
// advancing too much sim-time per frame would blow the frame budget. ~8 ms of
// sim per frame keeps ~30 fps smooth while the FID/precession still animate.
const MAX_SIM_PER_FRAME = 0.008;

// ---- Theme (day / night) ----------------------------------------------------
// Chrome is themed via CSS variables on <html data-theme>; the 3D scene
// background is switched here to match. Preference persists in localStorage.
const SCENE_BG = { dark: 0x0d1117, light: 0xeef1f5 };
const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  scene.setBackground(SCENE_BG[theme]);
  try { localStorage.setItem('nmr-theme', theme); } catch (e) { /* ignore */ }
}

applyTheme(localStorage.getItem('nmr-theme') || 'dark');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// ---- UI wiring --------------------------------------------------------------

const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  system.reset();
  fid.clear();
  spectrum.clear();
  state.playing = false;
  state.sampleAccum = 0;
  playBtn.textContent = '▶ Play';
  refresh();
});

const speed = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
speed.addEventListener('input', () => {
  state.speed = parseFloat(speed.value);
  speedVal.textContent = state.speed.toFixed(1) + '×';
});

document.getElementById('relax').addEventListener('change', (e) => {
  state.relaxation = e.target.checked;
  system.setRelaxation(state.relaxation);
});

const couplingToggle = document.getElementById('coupling');
couplingToggle.addEventListener('change', (e) => {
  state.coupling = e.target.checked;
  system.setCoupling(state.coupling);   // rebuilds H
  scene.setCoupling(state.coupling);
});

function currentTarget() {
  const val = document.querySelector('input[name="target"]:checked').value;
  return val === 'all' ? 'all' : parseInt(val, 10);
}

document.querySelectorAll('button.pulse').forEach((btn) => {
  btn.addEventListener('click', () => {
    const angle = parseFloat(btn.dataset.angle) * Math.PI / 180;
    system.applyPulse(currentTarget(), angle, btn.dataset.axis);
    refresh();
  });
});

// Encoding demo: s -> θ = arcsin(√s) -> Rx(θ) on the current target.
const encodeS = document.getElementById('encode-s');
const encodeTheta = document.getElementById('encode-theta');
function updateThetaLabel() {
  const s = parseFloat(encodeS.value);
  const theta = Math.asin(Math.sqrt(Math.max(0, Math.min(1, s))));
  encodeTheta.textContent = `θ = ${theta.toFixed(3)} rad`;
}
encodeS.addEventListener('input', updateThetaLabel);
updateThetaLabel();

document.getElementById('btn-encode').addEventListener('click', () => {
  const s = parseFloat(encodeS.value);
  system.encode(s, currentTarget());
  refresh();
});

// ---- render helpers ---------------------------------------------------------

function refresh() {
  scene.update(system.blochVectors());
  fid.draw();
  spectrum.draw();
  heatmap.draw(system.rhoAbs());
  histogram.set(system.populations());
}

// ---- Circuit editor + runner ------------------------------------------------
// The circuit UI builds a `circuit` model; compileCircuit → timed schedule;
// CircuitRunner drives it against the SAME live engine so the Bloch spheres,
// FID, spectrum, heatmap and histogram animate as each gate fires. A playhead
// highlights the executing column.

let compiled = null;

const circuitUI = new CircuitUI({
  palette: document.getElementById('gate-palette'),
  grid: document.getElementById('circuit-grid'),
  qasm: document.getElementById('qasm-view'),
  duration: document.getElementById('circuit-duration'),
}, {
  onChange: (circuit) => {
    compiled = circuit.length ? compileCircuit(circuit) : null;
    circuitUI.setDuration(compiled ? compiled.durationSeconds : 0);
  },
});

const runner = new CircuitRunner(system, {
  onSample: (s) => { fid.push(s); spectrum.push(s); },
  onColumn: (colIdx) => circuitUI.setPlayColumn(colIdx),
  onDone: () => {
    state.circuitMode = false;
    refresh();
  },
});

function startCircuit() {
  if (!compiled) return;
  // Reset the engine to |000⟩ and clear traces before a fresh run.
  system.reset();
  system.setRelaxation(state.relaxation);
  // Coupling is owned by the compiler during the run; leave engine as-is (the
  // runner forces coupling ON for two-qubit delays and restores it after).
  fid.clear();
  spectrum.clear();
  runner.load(compiled);
  runner.start();
  state.circuitMode = true;
  state.playing = false;          // pause the manual free-run while circuit runs
  playBtn.textContent = '▶ Play';
  refresh();
}

document.getElementById('btn-run-circuit').addEventListener('click', startCircuit);

document.getElementById('btn-step-circuit').addEventListener('click', () => {
  if (!compiled) return;
  if (!state.circuitMode || runner.done) {
    system.reset();
    system.setRelaxation(state.relaxation);
    fid.clear(); spectrum.clear();
    runner.load(compiled);
    state.circuitMode = true;
  }
  runner.step();
  refresh();
});

document.getElementById('btn-reset-circuit').addEventListener('click', () => {
  runner.pause();
  runner.reset();
  state.circuitMode = false;
  circuitUI.setPlayColumn(-1);
  system.reset();
  fid.clear(); spectrum.clear();
  refresh();
});

document.getElementById('btn-clear-circuit').addEventListener('click', () => {
  runner.pause();
  state.circuitMode = false;
  circuitUI.clear();
  circuitUI.setPlayColumn(-1);
});

// ---- Animation loop ---------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000); // clamp long gaps
  last = now;

  // Circuit playback takes priority over the manual free-run. Advance the
  // compiled schedule in scaled wall-clock time (dtReal · speed sim-seconds).
  if (state.circuitMode && runner.running) {
    runner.advance(dtReal * state.speed);
    refresh();
  } else if (state.playing) {
    // Requested sim-time this frame, capped for the frame budget.
    const dtSim = Math.min(MAX_SIM_PER_FRAME, dtReal * state.speed);

    // Advance in fixed DWELL-sized steps, sampling the FID/spectrum AFTER each
    // step so every point is a distinct instant. (Stepping the whole frame at
    // once and then sampling repeatedly pushes identical values → a staircase.)
    state.sampleAccum += dtSim;
    while (state.sampleAccum >= DWELL) {
      system.step(DWELL);
      const s = system.fid();
      fid.push(s);
      spectrum.push(s);
      state.sampleAccum -= DWELL;
    }

    refresh();
  }

  scene.render();
  requestAnimationFrame(frame);
}

// Initial paint.
scene.setCoupling(state.coupling);
refresh();
requestAnimationFrame(frame);
