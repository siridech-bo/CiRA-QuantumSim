// Wires the physics engine, 3D scene, FID plot, and UI controls together.
import { SpinSystem, SPINQ_PARAMS } from './physics.js';
import { BlochScene } from './scene.js';
import { FidPlot } from './fid.js';

const system = new SpinSystem();
const scene = new BlochScene(document.getElementById('scene-container'), SPINQ_PARAMS.nuclei);
const fid = new FidPlot(document.getElementById('fid-canvas'));

const state = {
  playing: false,
  speed: 1.0,
  relaxation: true,
  fidDecimator: 0,
};

// ---- UI wiring --------------------------------------------------------------

const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  system.reset();
  fid.clear();
  state.playing = false;
  playBtn.textContent = '▶ Play';
  scene.update(system.spins);
  fid.draw();
});

const speed = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
speed.addEventListener('input', () => {
  state.speed = parseFloat(speed.value);
  speedVal.textContent = state.speed.toFixed(1) + '×';
});

document.getElementById('relax').addEventListener('change', (e) => {
  state.relaxation = e.target.checked;
});

function currentTarget() {
  const val = document.querySelector('input[name="target"]:checked').value;
  return val === 'all' ? 'all' : parseInt(val, 10);
}

document.querySelectorAll('button.pulse').forEach((btn) => {
  btn.addEventListener('click', () => {
    const angle = parseFloat(btn.dataset.angle) * Math.PI / 180;
    system.applyPulse(currentTarget(), angle, btn.dataset.axis);
    scene.update(system.spins);
  });
});

// ---- Animation loop ---------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000); // clamp long gaps
  last = now;

  if (state.playing) {
    const dtSim = dtReal * state.speed;
    system.step(dtSim, state.relaxation);

    // Sample FID at a steady cadence regardless of frame rate.
    state.fidDecimator += dtSim;
    while (state.fidDecimator >= 0.004) {
      fid.push(system.fid());
      state.fidDecimator -= 0.004;
    }

    scene.update(system.spins);
    fid.draw();
  }

  scene.render();
  requestAnimationFrame(frame);
}

// Initial paint.
scene.update(system.spins);
fid.draw();
requestAnimationFrame(frame);
