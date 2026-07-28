// Wires the REAL quantum density-matrix engine, 3D scene, FID plot, live
// spectrum, and 8x8 |ρ| heatmap to the UI controls.
import { QuantumSpinSystem, SPINQ_PARAMS } from './quantum.js';
import { BlochScene } from './scene.js';
import { FidPlot } from './fid.js';
import { Spectrum } from './spectrum.js';
import { DensityHeatmap } from './heatmap.js';

const system = new QuantumSpinSystem({ relaxation: true, coupling: true });
const scene = new BlochScene(document.getElementById('scene-container'), SPINQ_PARAMS.nuclei);
const fid = new FidPlot(document.getElementById('fid-canvas'));

// Fixed dwell time for FID sampling / spectrum. 1 ms → ±500 Hz bandwidth,
// enough to resolve the 12–30 Hz display offsets and 42/220 Hz J-splittings.
const DWELL = 1e-3;
const spectrum = new Spectrum(document.getElementById('spectrum-canvas'), { dwell: DWELL, fftSize: 1024 });
const heatmap = new DensityHeatmap(document.getElementById('heatmap-canvas'));

const state = {
  playing: false,
  speed: 1.0,
  relaxation: true,
  coupling: true,
  sampleAccum: 0,     // sim-time accumulator for fixed-dwell FID sampling
};

// Cap simulation time advanced per animation frame. The internal RK4 sub-step
// tightens with the Hamiltonian's fastest frequency (~50 µs when J is on), so
// advancing too much sim-time per frame would blow the frame budget. ~8 ms of
// sim per frame keeps ~30 fps smooth while the FID/precession still animate.
const MAX_SIM_PER_FRAME = 0.008;

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
}

// ---- Animation loop ---------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000); // clamp long gaps
  last = now;

  if (state.playing) {
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
