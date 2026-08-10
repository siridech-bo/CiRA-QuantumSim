// =============================================================================
// ion-main.js — page loop + wiring for the trapped-ion substrate. Owns one live
// IonSystem engine, the LevelDiagram (center), the four traces + excitation
// spectrum + |ρ| heatmap (right), and every control. Uses the self-calibrating
// per-frame step budget from src/main.js so the tab stays responsive (the ion
// Hamiltonian is non-diagonal — no free-evolution fast path — so cooling animates
// in slow motion rather than freezing). Substrates 1 & 2 are untouched.
// =============================================================================
import { IonSystem } from './ion.js';
import { MSGate } from './ion-ms.js';
import { LevelDiagram } from './ion-levels.js';
import { PeTrace, FluorescenceTrace, NbarTrace, ExcitationSpectrum, DopplerScan, poissonSample } from './ion-traces.js';
import { optimalThreshold, poissonPMFArray } from './ion-readout.js';
import { DensityHeatmap } from './heatmap.js';
import { BlochScene } from './scene.js';
import { WignerPlot } from './jc-ui.js';
import { wignerGrid } from './wigner.js';
import { invalidatePlotColors, plotColors } from './theme.js';
import {
  MODULES, ModuleTabs, wireSlider, prepareState,
  excitationPoint, scanGrid, measureAsymmetry, measureFFT,
  dopplerScanPoint, dopplerFloorExtrap, dopplerScanGrid,
} from './ion-ui.js';
import { MathieuView, ChainView } from './ion-modes-ui.js';
import {
  carrierGateDuration, gateReport, measureGeneralizedRabi,
} from './ion-gates.js';
import { initInfo } from './info.js';
import { ION_INFO } from './ion-info.js';

// Educational ⓘ info buttons: inject one next to every [data-info] label / graph
// heading and open a sourced popup on click (src/info.js + src/ion-info.js).
initInfo(ION_INFO);

// ---- engine + parameters ----------------------------------------------------
const params = {
  N: 20, lambdaNm: 729, nuTrapHz: 1e6, massU: 40,
  delta: -1, rabi: 0.30, mode: 'exact',
  gamma: 0.10, heating: 0.02, nBath: 1, gammaPhi: 0.05,
  seOn: false, bathOn: false, dephaseOn: false,
  recoil: 'none', recoilGeom: 'sigma',
  prep: { kind: 'thermal', param: 2.0 },
  m6: { rabi: 0.20, delta: 0.30, theta: 1.0 },   // M6: pulse Ω, AC-Stark δ, angle θ·π
  m4: { Gamma: 4, delta: -2, rabi: 1.2, nbar0: 4 },  // M4 Doppler: broad Γ, red δ, Ω, initial n̄
  // M7 Mølmer–Sørensen: nominal detuning δ, loop count K, break-it δ-mismatch %, and
  // η (only the product ηΩ enters; Ω auto-set to δ/(2√K)). Kept ENTIRELY in its own
  // namespace — M7 runs a dedicated MSGate (state.m7.engine) and never writes the
  // shared params.gamma/delta/rabi (that was the M4 leak bug — not repeated here).
  m7: { N: 20, delta: 1.0, K: 1, deltaErrPct: 0, eta: 0.1 },
  // M8 state readout: detection window t_d, bright scatter rate R, background R_bg.
  // Pure Poisson photon-count model (n̄_bright=R·t_d, n̄_dark=R_bg·t_d). Kept ENTIRELY
  // in its own namespace — M8 touches no engine and never writes the shared
  // params.gamma/delta/rabi (no M4-style leak).
  m8: { td: 1.0, R: 20, Rbg: 0.5 },
};
let sys = buildEngine();

function buildEngine() {
  const s = new IonSystem({
    N_FOCK: params.N, lambdaNm: params.lambdaNm, nuTrapHz: params.nuTrapHz, massU: params.massU,
    omegaZ: 1, delta: params.delta, rabi: params.rabi, mode: params.mode,
    Gamma: params.gamma, heating: params.heating, nBath: params.nBath, gammaPhi: params.gammaPhi,
  });
  s.setRecoil(params.recoil, { geometry: params.recoilGeom });
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
const m4Scan = new DopplerScan(document.getElementById('m4-scan-canvas'));
const heatmap = new DensityHeatmap(document.getElementById('heatmap-canvas'));
const obsEl = document.getElementById('obs-readout');
const truncEl = document.getElementById('trunc-warn');

// ---- app state --------------------------------------------------------------
const state = {
  playing: false, speed: 1, classical: false, module: 'M3',
  stepBudget: 6, dwell: 0.4, sampleAccum: 0,
  scanQueue: null,      // { grid, i, cfg, delta[], pe[] } while scanning δ (M3)
  m4scan: null,         // { grid, i, cfg, delta[], nbar[] } while scanning the Doppler floor (M4)
  m4prevSys: null,      // stashed pre-M4 engine (M4 swaps in its own dedicated engine)
  m6gate: null,         // { kind, tTotal, tElapsed, theta } while an M6 gate runs
  m7: null,             // { engine (MSGate), running, tElapsed, tTotal, traj, ... } — M7's own namespace
  m8: null,             // { kMax, bright[], dark[], shots, lamB, lamD, opt } — M8's Poisson readout (no engine)
};
let lastHeatMs = 0;
const HEAT_HZ = 8;

// ---- theme ------------------------------------------------------------------
const SCENE_BG = { dark: 0x0d1117, light: 0xeef1f5 };
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  invalidatePlotColors();
  try { localStorage.setItem('ion-theme', theme); } catch (e) { /* ignore */ }
  if (m6Scene) m6Scene.setBackground(SCENE_BG[theme]);
  refresh(true);
  // classical views cache no colors of their own — repaint the active one
  if (state.classical) {
    if (mathieuView && !document.getElementById('m1-panel').hidden) mathieuView.drawStability();
    if (chainView && !document.getElementById('m2-panel').hidden) chainView.drawAll();
  }
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
  if (state.module === 'M4') m4Scan.draw();   // recolors the floor map on theme toggle
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
const appShell = document.getElementById('app-shell');
const levelsPanel = document.getElementById('levels-panel');
const m1Panel = document.getElementById('m1-panel');
const m2Panel = document.getElementById('m2-panel');

// Classical M1/M2 views are lazily built on first selection (each does a little
// upfront work: M1 samples the stability map + derives q*, M2 solves the chain).
let mathieuView = null, chainView = null;
function ensureMathieuView() {
  if (mathieuView) return mathieuView;
  mathieuView = new MathieuView({
    stabilityCanvas: document.getElementById('m1-stability'),
    trajCanvas: document.getElementById('m1-traj'),
    statusEl: document.getElementById('m1-status'),
  });
  wireSlider('m1-q', (v) => mathieuView.setQ(v), (v) => v.toFixed(3));
  wireSlider('m1-a', (v) => mathieuView.setA(v), (v) => v.toFixed(3));
  return mathieuView;
}
function ensureChainView() {
  if (chainView) return chainView;
  chainView = new ChainView({
    posCanvas: document.getElementById('m2-positions'),
    barCanvas: document.getElementById('m2-bars'),
    shapeCanvas: document.getElementById('m2-shape'),
    statusEl: document.getElementById('m2-status'),
  });
  wireSlider('m2-n', (v) => chainView.setN(Math.round(v)), (v) => String(Math.round(v)));
  return chainView;
}

// ---- M6: internal-state Bloch sphere (reuse BlochScene, single qubit) --------
let m6Scene = null;
const M6_GATE_FRAMES = 90;   // frames to animate one gate/precession (smooth arrow sweep)
function ensureM6Scene() {
  if (m6Scene) return m6Scene;
  m6Scene = new BlochScene(document.getElementById('m6-scene'), [{ symbol: 'ion', color: 0x4aa3ff }]);
  m6Scene.setCoupling(false);                       // single sphere → no coupling lines
  m6Scene.setBackground(SCENE_BG[document.documentElement.dataset.theme] || 0x0d1117);
  return m6Scene;
}

// Reset the shared engine to the gate-ready state |g,0⟩ (south pole) at the M6 drive.
function m6ResetEngine() {
  state.m6gate = null;
  sys.setDetuning(0); sys.setRabi(params.m6.rabi);
  sys.reset();                                       // |g,0⟩
  updateM6Sphere();
}
function updateM6Sphere() { if (m6Scene) m6Scene.update([sys.blochVector()]); }

// Schedule a gate: an on-resonant Rx(θ) (delta=0) or an off-resonant precession
// about the tilted axis (delta≠0). Always starts fresh from |g,0⟩ so n̄ and the
// gate fidelity are measured from a known state.
function m6StartGate(kind, thetaRad) {
  if (state.classical || state.module !== 'M6') return;
  const delta = kind === 'precess' ? params.m6.delta : 0;
  sys.setDetuning(delta); sys.setRabi(params.m6.rabi);
  sys.reset();                                       // |g,0⟩
  // Rx(θ): rotation rate = carrier Rabi Ω_eff. Precession: rate = generalized Rabi.
  let tTotal;
  if (kind === 'precess') {
    const genRabi = Math.sqrt(delta * delta + params.m6.rabi * params.m6.rabi);
    tTotal = 2 * (2 * Math.PI) / genRabi;            // two full turns about the tilted axis
  } else {
    tTotal = carrierGateDuration(sys, thetaRad);
  }
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  state.m6gate = { kind, tTotal, tElapsed: 0, theta: thetaRad };
  setM6Status(`<span class="k">firing</span> ${kind === 'precess' ? 'off-resonant precession (δ=' + params.m6.delta.toFixed(2) + ')' : 'Rx(' + (thetaRad / Math.PI).toFixed(2) + 'π)'} at Ω=${params.m6.rabi.toFixed(2)}…`);
}

// Advance the running M6 gate by one animation slice; finalize when complete.
function m6StepGate() {
  const g = state.m6gate;
  if (!g) return;
  const dt = g.tTotal / M6_GATE_FRAMES;
  const remaining = g.tTotal - g.tElapsed;
  const h = Math.min(dt, remaining);
  if (h > 1e-12) { sys.step(h); g.tElapsed += h; sampleTraces(); }
  updateM6Sphere();
  peTrace.draw(); fluorTrace.draw(); nbarTrace.draw();
  drawObservables(); drawTrunc();
  const now = performance.now();
  if (now - lastHeatMs > 1000 / HEAT_HZ) { heatmap.draw(nestedRhoAbs()); lastHeatMs = now; }
  if (g.tElapsed >= g.tTotal - 1e-9) { m6FinalizeGate(); }
}

function m6FinalizeGate() {
  const g = state.m6gate; state.m6gate = null;
  const nbar = sys.nBar();
  const hot = nbar > 1e-2;
  if (g.kind === 'precess') {
    setM6Status(
      `<span class="k">precessed about tilted axis</span> — δ=${params.m6.delta.toFixed(2)}, Ω=${params.m6.rabi.toFixed(2)}, ` +
      `Ω_gen=√(δ²+Ω²)=${Math.sqrt(params.m6.delta ** 2 + params.m6.rabi ** 2).toFixed(3)}. n̄=${nbar.toExponential(2)}`, hot);
  } else {
    const rep = gateReport(sys, g.theta);
    setM6Status(
      `<span class="k">Rx(${(g.theta / Math.PI).toFixed(2)}π) done</span> — fidelity F=<b>${rep.fidelity.toFixed(5)}</b>, ` +
      `n̄=<b>${nbar.toExponential(2)}</b> (Δn̄ from 0), P_e=${rep.pExcited.toFixed(4)}` +
      (hot ? ' &nbsp;⚠ Ω≳ω_z: motion heated, gate no longer selective' : ''), hot);
  }
}

function setM6Status(html, hot = false) {
  const el = document.getElementById('m6-status');
  el.innerHTML = html;
  el.classList.toggle('hot', hot);
}

// ---- M4: Doppler cooling ----------------------------------------------------
// M4 runs on its OWN engine instance (swapped into `sys` while the tab is active,
// restored on leave) so it never contaminates the M3/M5 drive/dissipator params —
// its broad Γ would otherwise break M5's resolved-sideband cooling. Config = the
// ⁴⁰Ca⁺ 397 nm cooling geometry (drive η = emitted-photon η̃ ≈ 0.178 at λ=397 nm,
// ν_z=1 MHz, σ), broad linewidth Γ ≳ ω_z, spontaneous emission WITH the recoil
// kernel, and a warm thermal seed. Same physics the M4 test + scan helper use.
function buildDopplerEngine() {
  const s = new IonSystem({
    N_FOCK: params.N, omegaZ: 1, delta: params.m4.delta, rabi: params.m4.rabi,
    mode: 'exact', lambdaNm: 397,                 // η = η̃ ≈ 0.178 at ν_z = 1 MHz
  });
  s.setRecoil('kernel', { geometry: 'sigma' });
  s.setSpontaneousEmission(true, params.m4.Gamma);  // broad Γ (independent of the 0–1 slider)
  s.setThermal(params.m4.nbar0, 'g');               // warm start
  return s;
}

// Update the "optimum δ = −Γ/2" marker + warn when the user has detuned blue.
function updateM4Opt() {
  const opt = -params.m4.Gamma / 2;
  const el = document.getElementById('m4-opt');
  if (params.m4.delta > 0) {
    el.innerHTML = `⚠ blue detuning (δ=+${params.m4.delta.toFixed(1)}) — friction reversed, motion <b>heats</b>`;
    el.classList.add('hot');
  } else {
    el.innerHTML = `optimum δ = −Γ/2 = <b>${opt.toFixed(1)}</b>`;
    el.classList.remove('hot');
  }
}

function setM4Readout(html, hot = false) {
  const el = document.getElementById('m4-readout');
  el.innerHTML = html;
  el.classList.toggle('hot', hot);
}

// Kick off the live cooling run (or the blue-detuned heating "break it"): rebuild
// the M4 engine so the curve starts from a fresh warm state, then play.
function m4StartCooling() {
  sys = buildDopplerEngine();
  calibrateStepBudget();
  peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
  state.playing = true; playBtn.textContent = '⏸ Pause';
  const heating = params.m4.delta > 0;
  document.getElementById('m4-note').innerHTML = heating
    ? '⚠ δ>0 (blue): the motion is HEATING — n̄(t) climbs. Drag δ back to −Γ/2 to cool.'
    : `cooling: red-detuned δ=${params.m4.delta.toFixed(1)}, broad Γ=${params.m4.Gamma.toFixed(1)}. Watch n̄(t) fall to the floor (right).`;
  refresh(true);
}

// Finish the δ-scan: render the n̄(δ) map, then measure an ACCURATE floor at −Γ/2
// (single-exponential extrapolation, same as the test) and report it against the
// canonical Doppler limit Γ/2ω_z with the honest coefficient c and the LD caveat.
function m4FinishScan(q) {
  m4Scan.set({ delta: q.delta, nbar: q.nbar, Gamma: q.cfg.Gamma });
  m4Scan.draw();
  const G = q.cfg.Gamma, half = -G / 2, canonical = G / 2;
  const { nSS } = dopplerFloorExtrap({ N: 12, Gamma: G, Om: q.cfg.Om, nInit: Math.max(1.5, G / 3), tSample: 220 }, half);
  const c = nSS / canonical;
  const ld = 0.178 * 0.178 * (2 * nSS + 1);
  setM4Readout(
    `<div><span class="lbl">measured floor at δ=−Γ/2:</span> <span class="big">n̄_ss ≈ ${nSS.toFixed(2)}</span></div>` +
    `<div><span class="lbl">canonical Doppler limit Γ/2ω_z:</span> ${canonical.toFixed(2)}</div>` +
    `<div><span class="lbl">honest coefficient c = n̄_ss/(Γ/2ω_z):</span> <b>${c.toFixed(2)}</b></div>` +
    `<span class="ld">LD-valid: η̃²(2n̄+1)=${ld.toFixed(2)} ≲ 0.2 ✓. The partially-resolved sideband over-cools below the ` +
    `asymptote, so c&lt;1; c→1 only as Γ/ω_z→large (⁴⁰Ca⁺ n̄≈10.8), exactly where this O(η̃²) kernel breaks down.</span>`);
  document.getElementById('m4-note').innerHTML =
    `floor mapped: minimum near δ=−Γ/2=${half.toFixed(1)}, rising toward the carrier and running away on the blue side.`;
}

// ---- M7: Mølmer–Sørensen gate ----------------------------------------------
// M7 runs its OWN dedicated MSGate engine (2 qubits ⊗ 1 mode, dim 4·N_FOCK) held
// in state.m7.engine — the shared `sys` (M3/M5 IonSystem) is left UNTOUCHED, so
// there is no engine swap and no way for MS state to leak into the M1–M6 params.
// All MS knobs live in params.m7.*. The phase-space loop and break-it are read
// straight off the engine: conditionalXP() gives the |++⟩ ⟨X⟩,⟨P⟩ loop coordinate,
// reducedMode() feeds wigner.js, bellFidelity()/residualEntanglement() the readout.
let m7Wigner = null;
function ensureM7Wigner() {
  if (!m7Wigner) m7Wigner = new WignerPlot(document.getElementById('m7-wigner'));
  return m7Wigner;
}

// Build a fresh MSGate from the current M7 controls. Break-it: keep the drive (ηΩ)
// and gate time τ_g from the NOMINAL δ, but run at δ = δ₀·(1+Δδ%). At 0% this is
// exact loop closure; off 0% the loop no longer closes at τ_g.
function m7BuildEngine() {
  const p = params.m7;
  const ref = new MSGate({ N_FOCK: p.N, delta: p.delta, K: p.K, eta: p.eta });  // matchClosure
  const gOmega = ref.etaOmega();          // ηΩ = δ₀/(2√K)
  const tauG = ref.gateTime();            // τ_g = 2πK/δ₀
  const actualDelta = p.delta * (1 + p.deltaErrPct / 100);
  const engine = new MSGate({
    N_FOCK: p.N, delta: actualDelta, K: p.K, eta: p.eta,
    Omega: gOmega / p.eta, matchClosure: false,
  });
  return { engine, tauG, gOmega, actualDelta };
}

function m7UpdateDrive() {
  const p = params.m7;
  const ref = new MSGate({ N_FOCK: 4, delta: p.delta, K: p.K, eta: p.eta });
  document.getElementById('m7-drive').innerHTML =
    `τ_g = 2πK/δ = <b>${ref.gateTime().toFixed(3)}</b>, ηΩ = δ/(2√K) = <b>${ref.closureCoupling().toFixed(4)}</b> ` +
    `(Ω=${(ref.closureCoupling() / p.eta).toFixed(3)}, η=${p.eta})`;
}

// Reset the M7 engine to |gg,0⟩ and clear the accumulated loop trajectory.
function m7Reset() {
  const built = m7BuildEngine();
  state.m7 = { engine: built.engine, running: false, tElapsed: 0, tTotal: built.tauG,
               traj: [{ x: 0, p: 0 }], actualDelta: built.actualDelta };
  m7UpdateDrive();
  m7Render();
  setM7Readout('<span class="lbl">ready — press <b>Run MS gate</b> to fire from |gg,0⟩.</span>');
  document.getElementById('m7-note').innerHTML =
    'The |++⟩ component traces a phase-space loop; at loop closure it returns to the origin and the qubits are left in a Bell state.';
}

function m7StartGate() {
  const built = m7BuildEngine();
  state.m7 = { engine: built.engine, running: true, tElapsed: 0, tTotal: built.tauG,
               traj: [{ x: 0, p: 0 }], actualDelta: built.actualDelta };
  setM7Readout('<span class="lbl">running the gate…</span>');
}

// Advance the running gate one animation slice, sampling the loop coordinate.
const M7_FRAMES = 150;   // base animation slices per loop (×K)
function m7StepGate() {
  const m = state.m7; if (!m || !m.running) return;
  const eng = m.engine;
  const frames = M7_FRAMES * params.m7.K;
  const dt = m.tTotal / frames;
  const h = Math.min(dt, m.tTotal - m.tElapsed);
  if (h > 1e-12) {
    eng.step(h); m.tElapsed += h;
    const xp = eng.conditionalXP();
    m.traj.push({ x: xp.x, p: xp.p });
  }
  m7Render();
  if (m.tElapsed >= m.tTotal - 1e-9) { m.running = false; m7Finalize(); }
}

function m7Finalize() {
  const eng = state.m7.engine;
  const F = eng.bellFidelity();
  const resid = eng.residualEntanglement();
  const modePur = eng.modePurity();
  const [pgg, pge, peg, pee] = eng.qubitPopulations();
  const err = params.m7.deltaErrPct;
  const good = F > 0.99 && resid < 5e-3;
  setM7Readout(
    `<div><span class="lbl">Bell fidelity ⟨Φ⁺|ρ|Φ⁺⟩, Φ⁺=(|gg⟩+i|ee⟩)/√2:</span> <span class="big">F = ${F.toFixed(4)}</span></div>` +
    `<div><span class="lbl">residual spin–motion entanglement 1−Tr(ρ²_2q):</span> <b>${resid.toExponential(2)}</b> ` +
    `(mode purity ${modePur.toFixed(3)})</div>` +
    `<div><span class="lbl">populations:</span> gg=${pgg.toFixed(3)} ge=${pge.toFixed(3)} eg=${peg.toFixed(3)} ee=${pee.toFixed(3)}</div>`,
    !good);
  document.getElementById('m7-note').innerHTML = good
    ? `loop CLOSED (Δδ=${err}%): the motion returned to vacuum and the qubits are maximally entangled — a Bell state.`
    : `loop OPEN (Δδ=${err}%): at τ_g the displacement did NOT return to the origin, so the spins stay entangled with the motion and F drops. Set Δδ→0% to close it.`;
}

function setM7Readout(html, hot = false) {
  const el = document.getElementById('m7-readout');
  el.innerHTML = html;
  el.classList.toggle('hot', hot);
}

// -- render: phase-space loop + reduced-mode Wigner + population bars --
function m7Render() {
  const m = state.m7; if (!m) return;
  drawM7Loop(m.traj, !m.running);
  try {
    const grid = wignerGrid(m.engine.reducedMode(), { xmax: 3.5, n: 44 });
    ensureM7Wigner().draw(grid);
  } catch (e) { /* ignore transient */ }
  drawM7Pops(m.engine.qubitPopulations());
}

function drawM7Loop(traj, done) {
  const cv = document.getElementById('m7-loop'); if (!cv) return;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, c = plotColors();
  ctx.clearRect(0, 0, w, h);
  const R = 2.2, cx = w / 2, cy = h / 2, sc = (Math.min(w, h) / 2 - 18) / R;
  const px = (v) => cx + v * sc, py = (v) => cy - v * sc;
  // axes
  ctx.strokeStyle = c.line; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px(-R), cy); ctx.lineTo(px(R), cy);
  ctx.moveTo(cx, py(-R)); ctx.lineTo(cx, py(R)); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.text; ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.fillText('X', px(R) - 4, cy - 5);
  ctx.textAlign = 'left'; ctx.fillText('P', cx + 5, py(R) + 11);
  // trajectory
  if (traj.length > 1) {
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < traj.length; i++) {
      const X = px(traj[i].x), Y = py(traj[i].p);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }
  // origin marker + current point
  ctx.fillStyle = c.text; ctx.beginPath(); ctx.arc(px(0), py(0), 3, 0, 2 * Math.PI); ctx.fill();
  const last = traj[traj.length - 1];
  const endR = Math.hypot(last.x, last.p);
  ctx.fillStyle = (done && endR < 0.05) ? '#50C878' : c.accent2;
  ctx.beginPath(); ctx.arc(px(last.x), py(last.p), 5, 0, 2 * Math.PI); ctx.fill();
  if (done) {
    ctx.fillStyle = endR < 0.05 ? '#50C878' : '#d08a4a';
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(endR < 0.05 ? 'loop CLOSED (r→0)' : `loop OPEN (r=${endR.toFixed(2)})`, cx, h - 6);
  }
}

function drawM7Pops(pops) {
  const cv = document.getElementById('m7-pops'); if (!cv) return;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, c = plotColors();
  ctx.clearRect(0, 0, w, h);
  const labels = ['|gg⟩', '|ge⟩', '|eg⟩', '|ee⟩'];
  const pad = 26, base = h - 20, plotW = w - pad - 8, plotH = base - 10;
  const bw = plotW / 4;
  ctx.strokeStyle = c.line; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(pad, base); ctx.lineTo(w - 8, base); ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    const bh = Math.max(0, pops[i]) * plotH;   // populations already in [0,1]
    ctx.fillStyle = (i === 0 || i === 3) ? c.accent : c.accent2;
    ctx.fillRect(pad + i * bw + bw * 0.2, base - bh, bw * 0.6, bh);
    ctx.fillStyle = c.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], pad + i * bw + bw / 2, h - 5);
    ctx.fillText(pops[i].toFixed(3), pad + i * bw + bw / 2, base - bh - 5);
  }
  ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('1.0', 4, base - plotH + 4); ctx.fillText('0', 12, base);
}

// ---- M8: state readout (Poisson photon-count discrimination) ----------------
// M8 is a PURE Poisson readout model — it touches NO engine (the shared `sys` is
// left alone) and lives entirely in params.m8.* / state.m8, so nothing can leak
// into the M1–M7 params. Two histograms (bright |g⟩ ~ Poisson(R·t_d) vs dark |e⟩ ~
// Poisson(R_bg·t_d)) accumulate sampled shots via the SAME poissonSample generator
// the fluorescence trace uses (spec §3.2 — written once). The optimal threshold +
// readout fidelity come from the analytic Poisson overlap (ion-readout.js). Shorten
// t_d → n̄_bright shrinks below the Poisson width √n̄ → histograms overlap → F drops.
function m8Means() {
  const p = params.m8;
  return { lamB: p.R * p.td, lamD: p.Rbg * p.td };
}

// (Re)initialize the accumulation buffers for the current means; clears shots.
function m8ResetHistograms() {
  const { lamB, lamD } = m8Means();
  const kMax = Math.max(8, Math.ceil(lamB + 6 * Math.sqrt(lamB + 1) + 6));
  state.m8 = {
    kMax, lamB, lamD, opt: optimalThreshold(lamB, lamD),
    bright: new Float64Array(kMax + 1),
    dark: new Float64Array(kMax + 1),
    shots: 0,
  };
}

// Sample a batch of shots from each Poisson distribution into the histograms.
function m8SampleBatch(n = 300) {
  const m = state.m8; if (!m) return;
  for (let i = 0; i < n; i++) {
    m.bright[Math.min(m.kMax, poissonSample(m.lamB))] += 1;
    m.dark[Math.min(m.kMax, poissonSample(m.lamD))] += 1;
  }
  m.shots += n;
}

function setM8Readout(html, hot = false) {
  const el = document.getElementById('m8-readout');
  el.innerHTML = html; el.classList.toggle('hot', hot);
}

// Rebuild the buffers for the current means, seed them, and redraw everything.
function m8Recompute() {
  m8ResetHistograms();
  m8SampleBatch(1500);          // seed so the histograms aren't empty on a slider change
  m8Refresh();
}

function m8Refresh() {
  const m = state.m8; if (!m) return;
  drawM8Hist(); drawM8Sweep();
  const opt = m.opt, overlap = opt.fidelity < 0.99;
  setM8Readout(
    `<div><span class="lbl">n̄_bright = R·t_d =</span> <b>${m.lamB.toFixed(2)}</b> &nbsp; ` +
    `<span class="lbl">n̄_dark = R_bg·t_d =</span> <b>${m.lamD.toFixed(2)}</b></div>` +
    `<div><span class="lbl">optimal threshold:</span> <b>${opt.threshold}</b> (n̄_dark &lt; thr &lt; n̄_bright)</div>` +
    `<div><span class="lbl">readout fidelity F:</span> <span class="big">${opt.fidelity.toFixed(5)}</span></div>` +
    `<div><span class="lbl">err bright→dark:</span> ${opt.errBright.toExponential(2)} &nbsp; ` +
    `<span class="lbl">err dark→bright:</span> ${opt.errDark.toExponential(2)} &nbsp; ` +
    `<span class="lbl">shots:</span> ${m.shots}</div>`,
    overlap);
  document.getElementById('m8-note').innerHTML = opt.fidelity > 0.99
    ? `clean separation: n̄_bright=${m.lamB.toFixed(1)} ≫ Poisson width √n̄=${Math.sqrt(m.lamB).toFixed(1)} — the histograms barely overlap and F→1.`
    : `⚠ overlap: n̄_bright=${m.lamB.toFixed(2)} is not ≫ the Poisson width √n̄=${Math.sqrt(Math.max(m.lamB, 1e-9)).toFixed(2)}, so the bright &amp; dark histograms overlap and F=${opt.fidelity.toFixed(3)} drops. Lengthen t_d (or raise R) to recover F→1.`;
}

// Histogram: bright (green) + dark (red) — sampled bars (normalized to probability)
// with the analytic Poisson PMF overlaid, decision shading, and the threshold marker.
function drawM8Hist() {
  const cv = document.getElementById('m8-hist'); if (!cv) return;
  const m = state.m8; if (!m) return;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, c = plotColors();
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 10, padT = 12, padB = 26, kMax = m.kMax;
  const plotW = w - padL - padR, plotH = h - padT - padB, bw = plotW / (kMax + 1);
  const xOf = (k) => padL + k * bw;                    // left edge of bin k
  const base = padT + plotH;
  const pB = poissonPMFArray(m.lamB, kMax), pD = poissonPMFArray(m.lamD, kMax);
  const totB = m.shots || 1, totD = m.shots || 1;
  let ymax = 1e-6;
  for (let k = 0; k <= kMax; k++) ymax = Math.max(ymax, pB[k], pD[k], m.bright[k] / totB, m.dark[k] / totD);
  ymax *= 1.15;
  const yOf = (p) => padT + (1 - p / ymax) * plotH;

  // decision shading: count ≥ thr → bright (right), < thr → dark (left)
  const thr = m.opt.threshold, xThr = xOf(thr);
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = c.ionRungG; ctx.fillRect(xThr, padT, (w - padR) - xThr, plotH);
  ctx.fillStyle = c.ionRed;   ctx.fillRect(padL, padT, xThr - padL, plotH);
  ctx.globalAlpha = 1;

  // axes
  ctx.strokeStyle = c.line; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(padL, base); ctx.lineTo(w - padR, base);
  ctx.moveTo(padL, padT); ctx.lineTo(padL, base); ctx.stroke();
  ctx.globalAlpha = 1;

  // empirical bars: bright + dark, side by side within each integer bin
  for (let k = 0; k <= kMax; k++) {
    const x = xOf(k);
    const hb = (m.bright[k] / totB) / ymax * plotH, hd = (m.dark[k] / totD) / ymax * plotH;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.ionRungG; ctx.fillRect(x + bw * 0.08, base - hb, bw * 0.4, hb);
    ctx.fillStyle = c.ionRed;   ctx.fillRect(x + bw * 0.52, base - hd, bw * 0.4, hd);
  }
  ctx.globalAlpha = 1;

  // analytic PMF overlay (stepped through bin centers)
  const pmfLine = (arr, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let k = 0; k <= kMax; k++) {
      const x = xOf(k) + bw / 2, y = yOf(arr[k]);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  pmfLine(pB, c.ionRungG); pmfLine(pD, c.ionRed);

  // threshold marker
  ctx.strokeStyle = c.text; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(xThr, padT); ctx.lineTo(xThr, base); ctx.stroke();
  ctx.setLineDash([]);

  // labels
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = c.ionRungG; ctx.textAlign = 'left'; ctx.fillText('bright |g⟩', padL + 4, padT + 9);
  ctx.fillStyle = c.ionRed; ctx.fillText('dark |e⟩', padL + 62, padT + 9);
  ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.fillText(`thr=${thr}`, xThr, padT + 9);
  const tickStep = Math.max(1, Math.round(kMax / 8));
  for (let k = 0; k <= kMax; k += tickStep) ctx.fillText(String(k), xOf(k) + bw / 2, base + 12);
  ctx.textAlign = 'right'; ctx.fillText('photon count →', w - padR, h - 4); ctx.textAlign = 'left';
}

// F-vs-t_d sweep: the emergent break-it curve, with the current t_d marked.
function drawM8Sweep() {
  const cv = document.getElementById('m8-sweep'); if (!cv) return;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, c = plotColors();
  ctx.clearRect(0, 0, w, h);
  const padL = 26, padR = 8, padT = 10, padB = 18, p = params.m8;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const tdMin = 0.02, tdMax = 2.0, steps = 60;
  const xOf = (td) => padL + (td - tdMin) / (tdMax - tdMin) * plotW;
  const yOf = (F) => padT + (1 - F) * plotH;           // F ∈ [0,1]

  ctx.strokeStyle = c.line; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(w - padR, yOf(0));
  ctx.moveTo(padL, padT); ctx.lineTo(padL, yOf(0)); ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(padL, yOf(1)); ctx.lineTo(w - padR, yOf(1)); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  ctx.strokeStyle = c.accent; ctx.lineWidth = 1.8; ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const td = tdMin + (tdMax - tdMin) * i / steps;
    const F = optimalThreshold(p.R * td, p.Rbg * td).fidelity;
    const x = xOf(td), y = yOf(F);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  const Fnow = optimalThreshold(p.R * p.td, p.Rbg * p.td).fidelity;
  ctx.fillStyle = c.accent2;
  ctx.beginPath(); ctx.arc(xOf(p.td), yOf(Fnow), 4, 0, 2 * Math.PI); ctx.fill();

  ctx.fillStyle = c.text; ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('F=1', padL + 2, yOf(1) + 10); ctx.fillText('0', padL - 12, yOf(0) + 3);
  ctx.textAlign = 'right'; ctx.fillText('t_d →', w - padR, h - 4); ctx.textAlign = 'left';
}

function m8Enter() { m8Recompute(); }

const m4Panel = document.getElementById('m4-panel');
const m6Panel = document.getElementById('m6-panel');
const m7Panel = document.getElementById('m7-panel');
const m8Panel = document.getElementById('m8-panel');
const tabs = new ModuleTabs(document.getElementById('module-tabs'), (id) => {
  const m = MODULES[id];
  const prev = state.module;
  state.module = id;

  // Keep the center tab bar in sync with the selected module.
  document.querySelectorAll('#center-tabs .ctab').forEach((b) =>
    b.classList.toggle('active', b.dataset.module === id));

  // Leaving M4: restore the pre-M4 engine so M3/M5/M6 are untouched by the swap.
  if (prev === 'M4' && id !== 'M4' && state.m4prevSys) { sys = state.m4prevSys; state.m4prevSys = null; }

  document.getElementById('module-desc').innerHTML = `<b>${m.name}</b> — ${m.desc}`;
  document.getElementById('break-it').innerHTML = m.breakIt;
  moduleActions.querySelectorAll('[data-for]').forEach((el) =>
    el.style.display = el.dataset.for === id ? '' : 'none');

  const classical = !!m.classical;
  const isM6 = id === 'M6';
  const isM4 = id === 'M4';
  const isM7 = id === 'M7';
  const isM8 = id === 'M8';
  state.classical = classical;
  if (classical || isM6 || isM4 || isM7 || isM8) { state.playing = false; playBtn.textContent = '▶ Play'; }
  if (!isM6) state.m6gate = null;
  if (!isM4) state.m4scan = null;
  if (!isM7) state.m7 = null;
  if (!isM8) state.m8 = null;

  // toggle side-groups: engine controls vs classical controls. M4/M6/M7 are
  // engine-based but swap the M3/M5 drive/state/diagram groups for their own controls.
  document.querySelectorAll('.engine-only').forEach((el) => { el.hidden = classical; });
  document.querySelectorAll('.m35-only').forEach((el) => { el.hidden = classical || isM6 || isM4 || isM7 || isM8; });
  document.getElementById('m6-controls').hidden = classical || !isM6;
  document.getElementById('m4-controls').hidden = classical || !isM4;
  document.getElementById('m7-controls').hidden = classical || !isM7;
  document.getElementById('m8-controls').hidden = classical || !isM8;
  // M4/M7 run their own dedicated engine, M8 runs a pure Poisson model → hide the
  // shared trap/dissipator/truncation controls (they target the M3/M5 engine) to
  // avoid desyncing. M7/M8 also hide the global Playback group (they have their own
  // buttons / loop; the shared frame loop is idle).
  document.querySelectorAll('.hide-m4').forEach((el) => { el.hidden = classical || isM4 || isM7 || isM8; });
  document.getElementById('playback-group').hidden = classical || isM7 || isM8;
  document.getElementById('m1-controls').hidden = id !== 'M1';
  document.getElementById('m2-controls').hidden = id !== 'M2';

  // toggle center panels. M4/M6 keep the right sidebar (engine readouts); M7 hides it
  // (its readouts live in its own center panel + its engine has a different API).
  appShell.classList.toggle('mode-classical', classical);
  appShell.classList.toggle('mode-ms', isM7);
  appShell.classList.toggle('mode-readout', isM8);
  levelsPanel.hidden = classical || isM6 || isM4 || isM7 || isM8;
  moduleActions.hidden = classical || isM6 || isM4 || isM7 || isM8;
  m1Panel.hidden = id !== 'M1';
  m2Panel.hidden = id !== 'M2';
  m6Panel.hidden = !isM6;
  m4Panel.hidden = !isM4;
  m7Panel.hidden = !isM7;
  m8Panel.hidden = !isM8;

  // stop the inactive classical view; show/refresh the active one
  if (id === 'M1') { ensureMathieuView().show(); } else if (mathieuView) mathieuView.hide();
  if (id === 'M2') { ensureChainView().show(); } else if (chainView) chainView.hide();

  if (isM6) {
    ensureM6Scene();
    peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
    m6ResetEngine();
    setM6Status('<span class="k">ready</span> — fire a carrier gate; the arrow rotates about <b>x</b>. n̄ stays ≈0 while Ω≪ω_z.');
    refresh(true);
  }

  if (isM4) {
    if (!state.m4prevSys) state.m4prevSys = sys;    // stash the M3/M5/M6 engine
    sys = buildDopplerEngine();                     // dedicated Doppler engine (broad Γ, red δ, recoil)
    calibrateStepBudget();
    peTrace.clear(); fluorTrace.clear(); nbarTrace.clear();
    m4Scan.clear();
    updateM4Opt();
    updateEta();
    document.getElementById('m4-note').innerHTML =
      'Press <b>Start Doppler cooling</b> to cool the warm ion to the floor, or <b>Scan δ</b> to map n̄(δ).';
    setM4Readout('<span class="lbl">Press <b>Scan δ → n̄ floor map</b> to measure the Doppler floor and compare it to the textbook <code>Γ/2ω_z</code>.</span>');
    refresh(true);
    m4Scan.draw();
  } else if (isM7) {
    // Entering M7: build the dedicated MSGate (own namespace), reset to |gg,0⟩ and
    // render the (empty) loop. `sys` is left untouched — no swap, no leak.
    m7Reset();
  } else if (isM8) {
    // Entering M8: build the Poisson readout histograms + fidelity. No engine touched.
    m8Enter();
  } else if (!classical && !isM6) {
    // Entering M3/M5 (incl. from M4/M7): redraw the level diagram with the live engine.
    refresh(true);
  }
});

// Route the center tab bar through the same selector as the sidebar module tabs.
document.querySelectorAll('#center-tabs .ctab').forEach((b) =>
  b.addEventListener('click', () => tabs.select(b.dataset.module)));

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
  // η is read from the LIVE engine (truthful even while M4 runs on its 397 nm engine).
  const inM4 = state.module === 'M4';
  const lam = inM4 ? 397 : params.lambdaNm, nu = inM4 ? 1.0 : params.nuTrapHz / 1e6;
  el.innerHTML = `η = <b>${sys.etaValue().toFixed(4)}</b> &nbsp; (λ=${lam} nm, ν_z=${nu.toFixed(1)} MHz, ${params.massU} u).` +
    (inM4 ? ' <span class="muted-tag">M4: 397 nm cooling, η=η̃</span>' : ' Stiffer trap ⇒ smaller η.');
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
document.getElementById('chk-recoil').addEventListener('change', (e) => { params.recoil = e.target.checked ? 'kernel' : 'none'; sys.setRecoil(params.recoil, { geometry: params.recoilGeom }); calibrateStepBudget(); refresh(); });
document.getElementById('recoil-geom').addEventListener('change', (e) => { params.recoilGeom = e.target.value; sys.setRecoil(params.recoil, { geometry: params.recoilGeom }); refresh(); });

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

// -- M6: single-qubit gates --
wireSlider('m6-rabi', (v) => {
  params.m6.rabi = v;
  if (state.module === 'M6' && !state.m6gate) { sys.setRabi(v); }
});
wireSlider('m6-delta', (v) => { params.m6.delta = v; }, (v) => v.toFixed(2));
wireSlider('m6-theta', (v) => { params.m6.theta = v; }, (v) => v.toFixed(2));
document.getElementById('m6-rx90').addEventListener('click', () => m6StartGate('rx', Math.PI / 2));
document.getElementById('m6-rx180').addEventListener('click', () => m6StartGate('rx', Math.PI));
document.getElementById('m6-rx360').addEventListener('click', () => m6StartGate('rx', 2 * Math.PI));
document.getElementById('m6-apply').addEventListener('click', () => m6StartGate('rx', params.m6.theta * Math.PI));
document.getElementById('m6-precess').addEventListener('click', () => m6StartGate('precess', 0));
document.getElementById('m6-measure').addEventListener('click', () => {
  const el = document.getElementById('m6-acstark');
  const d = params.m6.delta, O = params.m6.rabi;
  if (d < 0.05) { el.innerHTML = '<span class="lbl">set δ &gt; 0 for an off-resonant AC-Stark measurement</span>'; return; }
  el.innerHTML = '<span class="lbl">measuring in a clean two-level regime (ω_z pushed far away)…</span>';
  setTimeout(() => {
    const m = measureGeneralizedRabi(d, O, { omegaZ: 30, periods: 10 });
    const genErr = Math.abs(m.measGen - m.formulaGen) / m.formulaGen * 100;
    const lsErr = Math.abs(m.lightShiftMeas - m.lightShiftFormula) / Math.abs(m.lightShiftFormula) * 100;
    el.innerHTML =
      `<div><span class="lbl">Ω_gen (measured):</span> ${m.measGen.toFixed(4)} &nbsp; vs √(δ²+Ω²)=${m.formulaGen.toFixed(4)} (${genErr.toFixed(2)}%)</div>` +
      `<div><span class="lbl">light shift ½(Ω_gen−|δ|):</span> ${m.lightShiftMeas.toExponential(3)} &nbsp; vs Ω²/4δ=${m.lightShiftFormula.toExponential(3)} (${lsErr.toFixed(1)}%)</div>`;
  }, 30);
});

// -- M4: Doppler cooling --
// M4 drives its OWN swapped Doppler engine (sys.* while active) and stores its
// broad values in params.m4.* only. It must NOT write the shared
// params.gamma/delta/rabi — those belong to the M3/M5 engine and are not
// restored on M4 leave, so leaking M4's broad Γ/δ/Ω into them re-contaminates
// M5's resolved-sideband cooling on a later SE-toggle or N_FOCK rebuild.
wireSlider('m4-gamma', (v) => {
  params.m4.Gamma = v;
  if (state.module === 'M4') sys.setSpontaneousEmission(true, v);
  updateM4Opt();
}, (v) => v.toFixed(1));
wireSlider('m4-delta', (v) => {
  params.m4.delta = v;
  if (state.module === 'M4') sys.setDetuning(v);
  updateM4Opt();
}, (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
wireSlider('m4-rabi', (v) => {
  params.m4.rabi = v;
  if (state.module === 'M4' && !state.m4scan) sys.setRabi(v);
}, (v) => v.toFixed(1));
wireSlider('m4-nbar0', (v) => { params.m4.nbar0 = v; }, (v) => v.toFixed(1));
document.getElementById('m4-cool').addEventListener('click', m4StartCooling);

// -- M7: Mølmer–Sørensen gate --
// All M7 sliders write ONLY params.m7.* (never the shared params.gamma/delta/rabi)
// and rebuild the dedicated MSGate; the M3/M5 `sys` is never touched.
wireSlider('m7-delta', (v) => {
  params.m7.delta = v;
  if (state.module === 'M7') { m7UpdateDrive(); if (state.m7 && !state.m7.running) m7Reset(); }
}, (v) => v.toFixed(2));
wireSlider('m7-k', (v) => {
  params.m7.K = Math.round(v);
  if (state.module === 'M7') { m7UpdateDrive(); if (state.m7 && !state.m7.running) m7Reset(); }
}, (v) => String(Math.round(v)));
wireSlider('m7-derr', (v) => {
  params.m7.deltaErrPct = v;
  if (state.module === 'M7' && state.m7 && !state.m7.running) m7Reset();
}, (v) => (v > 0 ? '+' : '') + v.toFixed(0) + '%');
document.getElementById('m7-run').addEventListener('click', () => { if (state.module === 'M7') m7StartGate(); });
document.getElementById('m7-reset').addEventListener('click', () => { if (state.module === 'M7') m7Reset(); });

// -- M8: state readout --
// All M8 sliders write ONLY params.m8.* (never the shared params.gamma/delta/rabi)
// and rebuild the Poisson histograms; no engine is touched.
wireSlider('m8-td', (v) => { params.m8.td = v; if (state.module === 'M8') m8Recompute(); }, (v) => v.toFixed(2));
wireSlider('m8-r', (v) => { params.m8.R = v; if (state.module === 'M8') m8Recompute(); }, (v) => String(Math.round(v)));
wireSlider('m8-rbg', (v) => { params.m8.Rbg = v; if (state.module === 'M8') m8Recompute(); }, (v) => v.toFixed(1));
document.getElementById('m8-resample').addEventListener('click', () => { if (state.module === 'M8') m8Recompute(); });

// Chunked Doppler-floor δ-scan (stays responsive), then an accurate extrapolated
// floor at −Γ/2 for the readout vs the canonical Γ/2ω_z.
document.getElementById('m4-scan').addEventListener('click', () => {
  state.playing = false; playBtn.textContent = '▶ Play';
  const G = params.m4.Gamma;
  const grid = dopplerScanGrid(G, 13);
  const cfg = { N: 10, Gamma: G, Om: params.m4.rabi, nInit: Math.max(2, G / 2), T: 260 };
  state.m4scan = { grid, i: 0, cfg, delta: [], nbar: [] };
  setM4Readout('<span class="lbl">scanning δ to map n̄(δ)… (~15 s, the tab pauses briefly)</span>');
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
  // Classical modules (M1/M2) drive their own self-contained canvas views; the
  // density-matrix engine is idle and its panels are hidden.
  if (state.classical) { requestAnimationFrame(frame); return; }

  // M6 single-qubit gates: run a scheduled carrier pulse / precession, animating
  // the internal-state Bloch sphere off the real reduced ρ. Sphere renders every
  // frame so OrbitControls stay live even when idle.
  if (state.module === 'M6') {
    if (state.m6gate) m6StepGate();
    if (m6Scene) m6Scene.render();
    requestAnimationFrame(frame);
    return;
  }

  // M7 Mølmer–Sørensen gate: advance the dedicated MSGate while a gate is running,
  // animating the phase-space loop / Wigner / populations off the real ρ.
  if (state.module === 'M7') {
    if (state.m7 && state.m7.running) m7StepGate();
    requestAnimationFrame(frame);
    return;
  }

  // M8 state readout: live-accumulate Poisson photon-count shots into the bright/dark
  // histograms (up to a cap, then idle) so the student watches the distributions build
  // and overlap. Pure Poisson model — no engine step.
  if (state.module === 'M8') {
    const m = state.m8;
    if (m && m.shots < 20000) { m8SampleBatch(250); m8Refresh(); }
    requestAnimationFrame(frame);
    return;
  }

  // Chunked Doppler-floor δ-scan (M4): a couple of cooling runs per frame → n̄(δ) map.
  if (state.m4scan) {
    const q = state.m4scan;
    const perFrame = 2;
    for (let k = 0; k < perFrame && q.i < q.grid.length; k++, q.i++) {
      const d = q.grid[q.i];
      q.delta.push(d); q.nbar.push(dopplerScanPoint(q.cfg, d));
    }
    m4Scan.set({ delta: q.delta, nbar: q.nbar, Gamma: q.cfg.Gamma });
    m4Scan.draw();
    if (q.i >= q.grid.length) { const done = q; state.m4scan = null; m4FinishScan(done); }
    requestAnimationFrame(frame);
    return;
  }

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
