// Wires the REAL quantum density-matrix engine, 3D scene, FID plot, live
// spectrum, and |ρ| heatmap to the UI controls. The engine, scene, circuit grid
// and histogram are all molecule-driven and rebuilt on a molecule switch.
import { QuantumSpinSystem } from './quantum.js';
import { getMolecule, listMolecules, defaultMolecule, viewParams, isHomonuclear } from './molecules.js';
import { BlochScene } from './scene.js';
import { FidPlot } from './fid.js';
import { Spectrum } from './spectrum.js';
import { DensityHeatmap } from './heatmap.js';
import { compileCircuit, HOMO_TWO_QUBIT_ENABLED } from './gates.js';
import { CircuitRunner } from './runner.js';
import { CircuitUI, Histogram } from './circuit-ui.js';
import { invalidatePlotColors } from './theme.js';
import { initInfo } from './info.js';
import { NMR_INFO } from './nmr-info.js';

// Educational ⓘ info buttons: inject one next to every [data-info] label / graph
// heading and open a sourced popup on click (src/info.js + src/nmr-info.js).
initInfo(NMR_INFO);

// Active molecule + engine (both reassigned by loadMolecule()).
let molecule = defaultMolecule();
let system = new QuantumSpinSystem({ molecule, relaxation: true, coupling: true });

// Bloch-scene nuclei descriptor { symbol, color } from a molecule.
function sceneNuclei(mol) { return mol.nuclei.map((n) => ({ symbol: n.label, color: n.color })); }
function qubitLabels(mol) { return mol.nuclei.map((n, i) => `q${i} ${n.label}`); }
// Two-qubit gates allowed for this molecule? (Disabled for homonuclear.)
function twoQubitOK(mol) { return !isHomonuclear(mol) || HOMO_TWO_QUBIT_ENABLED; }

const scene = new BlochScene(document.getElementById('scene-container'), sceneNuclei(molecule));
const fid = new FidPlot(document.getElementById('fid-canvas'));

// ADAPTIVE dwell / spectrum window (per molecule). Heteronuclear: 1 ms / ±300 Hz.
// Homonuclear real offsets reach ~21 kHz, so dwell shrinks (avoids aliasing) and
// the spectrum window widens to show the real multiplets. See molecules.viewParams.
let view = viewParams(molecule);
const spectrum = new Spectrum(document.getElementById('spectrum-canvas'),
  { dwell: view.dwell, fftSize: 1024, viewHz: view.viewHz });
const heatmap = new DensityHeatmap(document.getElementById('heatmap-canvas'));
const histogram = new Histogram(document.getElementById('histogram-canvas'), molecule.nuclei.length);

const state = {
  playing: false,
  speed: 1.0,
  relaxation: true,
  coupling: true,
  sampleAccum: 0,     // sim-time accumulator for fixed-dwell FID sampling
  circuitMode: false, // true while a compiled circuit is running/stepping
  stepBudget: 8,      // max engine steps per frame (self-calibrated per molecule)
};

// Size the per-frame engine-step budget to a compute target by MEASURING the
// actual cost of a step for the active molecule (homonuclear real-offset
// molecules need µs sub-steps ⇒ a step is far costlier). Keeps the tab
// responsive on any molecule/hardware; heteronuclear stays fast (capped by
// MAX_SIM_PER_FRAME), homonuclear degrades to slow-but-smooth instead of hanging.
function calibrateStepBudget() {
  const TARGET_MS = 12;
  try {
    const probe = new QuantumSpinSystem({ molecule, relaxation: state.relaxation, coupling: state.coupling });
    probe.applyPulse('all', Math.PI / 2, 'x');
    probe.step(view.dwell);                    // warm up JIT (discard)
    const t0 = performance.now();
    probe.step(view.dwell);
    let perStep = performance.now() - t0;
    if (perStep < 8) {                          // fast molecule: average a few warm steps
      const t1 = performance.now();
      for (let i = 0; i < 4; i++) probe.step(view.dwell);
      perStep = (performance.now() - t1) / 4;
    }                                          // slow molecule: trust the single measurement
    state.stepBudget = Math.max(1, Math.min(64, Math.floor(TARGET_MS / Math.max(perStep, 0.05))));
  } catch (e) {
    state.stepBudget = 8;
  }
}

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
  invalidatePlotColors();   // plots re-read CSS colors on next draw
  try { localStorage.setItem('nmr-theme', theme); } catch (e) { /* ignore */ }
}

applyTheme(localStorage.getItem('nmr-theme') || 'dark');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  refresh();                // redraw all plots immediately with new colors
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
  const el = document.querySelector('input[name="target"]:checked');
  if (!el) return 'all';
  const val = el.value;
  return val === 'all' ? 'all' : parseInt(val, 10);
}

// Build the "Target nucleus" radio row for the active molecule's nuclei + All.
function buildTargetRadios(mol) {
  const host = document.getElementById('target-radios');
  host.innerHTML = '';
  mol.nuclei.forEach((n, i) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="target" value="${i}" /> ${n.label}`;
    host.appendChild(label);
  });
  const all = document.createElement('label');
  all.innerHTML = `<input type="radio" name="target" value="all" checked /> All`;
  host.appendChild(all);
}
buildTargetRadios(molecule);

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
  qubitLabels: qubitLabels(molecule),
  twoQubitEnabled: twoQubitOK(molecule),
  onChange: (circuit) => {
    compiled = circuit.length ? compileCircuit(circuit, molecule) : null;
    circuitUI.setDuration(compiled ? compiled.durationSeconds : 0);
  },
});

let runner = new CircuitRunner(system, {
  onSample: (s) => { fid.push(s); spectrum.push(s); },
  onColumn: (colIdx) => circuitUI.setPlayColumn(colIdx),
  onDone: () => {
    state.circuitMode = false;
    refresh();
  },
}, { dwell: view.dwell });

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

// ---- Molecule picker --------------------------------------------------------
// Populates a dropdown from listMolecules(); on change, loadMolecule() rebuilds
// the engine, scene spheres, circuit grid, histogram, target radios and readout,
// clears FID/spectrum/circuit, resets and re-renders. Existing controls stay.

const molSelect = document.getElementById('molecule-select');
const molReadout = document.getElementById('molecule-readout');
const appSubtitle = document.getElementById('app-subtitle');

function populateMoleculePicker() {
  molSelect.innerHTML = '';
  for (const m of listMolecules()) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} — ${m.n} qubit${m.n === 1 ? '' : 's'}`;
    molSelect.appendChild(opt);
  }
  molSelect.value = molecule.id;
}

// Small readout of the active molecule: nuclei, J value(s), citation.
function renderMoleculeReadout(mol) {
  const nuc = mol.nuclei.map((n) => n.label).join(' · ');
  const n = mol.nuclei.length;
  const js = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (mol.J[i][j] !== 0)
        js.push(`J(${mol.nuclei[i].label}-${mol.nuclei[j].label}) = ${mol.J[i][j]} Hz`);
  const homo = isHomonuclear(mol);
  const addr = homo ? 'homonuclear' : 'heteronuclear';
  const addrNote = homo
    ? 'shared RF channel — single-qubit gates use frequency-selective soft pulses'
    : 'separate RF channels per nucleus — hard pulses address each spin';
  molReadout.innerHTML =
    `<div class="mol-nuclei">${nuc}</div>` +
    `<div class="mol-addr"><span class="addr-tag ${homo ? 'homo' : 'hetero'}">${addr}</span> ${addrNote}</div>` +
    `<div class="mol-j">${js.join('<br>')}</div>` +
    (homo ? '<div class="mol-note">Two-qubit gates (CNOT/CZ) are experimental for '
      + 'homonuclear molecules and disabled in this build.</div>' : '') +
    `<div class="mol-cite">${mol.source}</div>`;
  if (appSubtitle) appSubtitle.textContent =
    `${mol.name} — real ${n}-spin ${addr} density-matrix (Lindblad) engine`;
}

function loadMolecule(id) {
  molecule = getMolecule(id);

  // Rebuild the engine from the new molecule (preserve the current toggles).
  system = new QuantumSpinSystem({ molecule, relaxation: state.relaxation, coupling: state.coupling });

  // Recompute the adaptive FID/spectrum view for the new molecule.
  view = viewParams(molecule);
  spectrum.setDwell(view.dwell);
  spectrum.setView(view.viewHz);
  calibrateStepBudget();

  // Rebuild the runner around the new engine (with the molecule's dwell).
  runner.pause();
  runner = new CircuitRunner(system, {
    onSample: (s) => { fid.push(s); spectrum.push(s); },
    onColumn: (colIdx) => circuitUI.setPlayColumn(colIdx),
    onDone: () => { state.circuitMode = false; refresh(); },
  }, { dwell: view.dwell });
  state.circuitMode = false;

  // Rebuild the scene spheres/arrows/coupling-lines (disposes old meshes).
  scene.setMolecule(sceneNuclei(molecule));
  scene.setCoupling(state.coupling);

  // Rebuild circuit grid rows + target radios + histogram bars.
  circuitUI.setMolecule(qubitLabels(molecule), twoQubitOK(molecule));   // clears placed gates → onChange fires
  buildTargetRadios(molecule);
  histogram.setQubits(molecule.nuclei.length);

  // Clear traces + reset state, re-render.
  compiled = null;
  circuitUI.setDuration(0);
  fid.clear();
  spectrum.clear();
  system.reset();
  state.playing = false;
  state.sampleAccum = 0;
  playBtn.textContent = '▶ Play';

  renderMoleculeReadout(molecule);
  refresh();
}

populateMoleculePicker();
renderMoleculeReadout(molecule);
molSelect.addEventListener('change', () => loadMolecule(molSelect.value));

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
    // Cap engine steps per frame. Homonuclear molecules use a tiny adaptive dwell
    // (~15 µs) to resolve their kHz shifts; without a cap the loop below would run
    // hundreds of heavy steps per frame and freeze the tab. Larger systems get a
    // smaller budget (each step costs more). Sim-time then advances slower in
    // wall-clock for homonuclear molecules — inherent to their fast dynamics — but
    // the UI stays responsive.
    const stepBudget = state.stepBudget;
    const dtSim = Math.min(MAX_SIM_PER_FRAME, dtReal * state.speed, stepBudget * view.dwell);

    // Advance in fixed DWELL-sized steps, sampling the FID/spectrum AFTER each
    // step so every point is a distinct instant. The `steps < stepBudget` guard
    // hard-bounds the work per frame no matter the dwell/speed.
    state.sampleAccum += dtSim;
    let steps = 0;
    while (state.sampleAccum >= view.dwell && steps < stepBudget) {
      system.step(view.dwell);
      const s = system.fid();
      fid.push(s);
      spectrum.push(s);
      state.sampleAccum -= view.dwell;
      steps++;
    }
    if (steps >= stepBudget) state.sampleAccum = 0;   // drop backlog, don't accrue

    refresh();
  }

  scene.render();
  requestAnimationFrame(frame);
}

// Initial paint.
scene.setCoupling(state.coupling);
calibrateStepBudget();
refresh();
requestAnimationFrame(frame);
