// =============================================================================
// ion-ui.js — UI helpers for the trapped-ion page: module tabs, slider wiring,
// the excitation-spectrum point evaluator (M3), and the two-way thermometry
// measurement (spec §3.4). The draggable detuning line itself lives in
// LevelDiagram (ion-levels.js) and is wired to the engine in ion-main.js.
//
// The excitation-scan and thermometry routines build their OWN short-lived
// IonSystem instances (same discipline as test/ion.test.mjs) so a measurement is
// a clean, reproducible experiment independent of the live animated engine.
// =============================================================================
import { IonSystem } from './ion.js';
import { Spectrum } from './spectrum.js';

// ---- module metadata (M1/M2 classical + M3/M5 engine; room for M4/M6/M7/M8) -
export const MODULES = {
  M1: {
    name: 'Paul trap (Mathieu)',
    classical: true,
    desc: 'Why is there a harmonic oscillator at all? RF confinement obeys the Mathieu equation <code>ü + [a − 2q·cos(2τ)]u = 0</code>. Stability comes from the <b>monodromy (Floquet) matrix</b>: stable ⟺ <code>|Tr M| &lt; 2</code>. The a=0 boundary <code>q* ≈ 0.908</code> is <b>derived by bisection</b>, not hard-coded.',
    breakIt: 'Break it: push <code>q</code> past <code>q* ≈ 0.908</code> — the trajectory diverges and the ion is lost.',
  },
  M2: {
    name: 'Coulomb normal modes',
    classical: true,
    desc: 'N ions in a 1D harmonic well + Coulomb repulsion. Equilibrium by <b>Newton iteration</b>; modes from <b>eigendecomposing James\'s Hessian</b>. The COM mode is <code>ω_z</code> for any N; the two-ion stretch is <code>√3·ω_z</code>. Sets up which mode a two-qubit gate (M7) uses as its bus.',
    breakIt: 'Break it: raise <code>N</code> until the linear chain would zigzag (transverse mode goes soft).',
  },
  M3: {
    name: 'Sideband spectroscopy',
    desc: 'Drag the δ line and watch which arrow family ignites: <code>carrier δ=0</code>, <code>RSB δ=−ω_z</code>, <code>BSB δ=+ω_z</code>. Scan δ to build the excitation spectrum — carrier plus both resolved sidebands.',
    breakIt: 'Break it: push <code>Ω &gt; ω_z</code> — the sidebands stop being resolved and merge into the carrier.',
  },
  M5: {
    name: 'Sideband cooling ★',
    desc: 'Drive the red sideband (<code>δ=−ω_z</code>) with spontaneous emission on: the ladder depopulates downward and n̄ falls toward the floor. The RSB amplitude vanishes as n̄→0 because <code>|g,0⟩</code> is dark.',
    breakIt: 'Break it: raise the heating rate (motional bath) until cooling stalls at a higher floor.',
  },
  M6: {
    name: 'Single-qubit gates',
    desc: 'A carrier (<code>δ=0</code>) pulse of area <code>Ω_eff·t</code> rotates the internal qubit — a real <b>Rx(θ)</b> on the Bloch sphere (the engine exposes only a real Ω → σx drive, no phase, so no native Ry). Off-resonant (<code>δ≠0</code>) tilts the axis: <b>AC Stark</b>, precession at the generalized Rabi <code>√(δ²+Ω²)</code>, light shift <code>≈Ω²/4δ</code>.',
    breakIt: 'Break it: shorten the pulse (raise <code>Ω</code> toward/above <code>ω_z</code>) — the bandwidth ~Ω reaches the ±ω_z sidebands, the motion heats (n̄ grows) and spin–motion entanglement drops the gate fidelity. Selectivity is EMERGENT from Ω vs ω_z.',
  },
  M4: {
    name: 'Doppler cooling',
    desc: 'The OPPOSITE regime to sideband cooling: <b>broad linewidth</b> <code>Γ ≳ ω_z</code> (sidebands unresolved), <b>red-detuned</b> drive <code>δ&lt;0</code> + spontaneous emission with the <b>recoil kernel</b>. Velocity-dependent scattering (friction) balances recoil heating → a steady state. The friction is strongest at <b>δ = −Γ/2</b> (the scan minimum), where the textbook Doppler limit is <code>k_BT_D=ħΓ/2 ⇒ n̄≈Γ/2ω_z</code>.',
    breakIt: 'Break it: detune <b>blue</b> (<code>δ&gt;0</code>) — friction reverses into anti-friction and the motion <b>heats</b> (n̄ runs away up) instead of cooling.',
    note: 'LD-valid regime: this O(η̃²) recoil kernel is honest only for <code>η̃²(2n̄+1)≪1</code>, so we run at moderate <code>Γ/ω_z</code> (≈3–6) where the floor is a few quanta. There the engine gives <code>n̄_ss = c·Γ/2ω_z</code> with <code>c≈0.5–0.65</code> (partially-resolved sidebands over-cool below the asymptote). The canonical <code>n̄=Γ/2ω_z</code> is the <code>Γ≫ω_z</code> asymptote (⁴⁰Ca⁺: n̄≈10.8) — exactly where the LD kernel breaks down. That break-down IS the lesson.',
  },
};

// ---- generic slider wiring --------------------------------------------------
export function wireSlider(id, onChange, fmt = (v) => v.toFixed(2)) {
  const el = document.getElementById(id);
  const val = document.getElementById(id + '-val');
  const handler = () => {
    const v = parseFloat(el.value);
    if (val) val.textContent = fmt(v);
    onChange(v);
  };
  el.addEventListener('input', handler);
  return { el, set: (v) => { el.value = String(v); if (val) val.textContent = fmt(parseFloat(el.value)); } };
}

// ---- module tab manager -----------------------------------------------------
export class ModuleTabs {
  constructor(container, onSelect) {
    this.onSelect = onSelect;
    this.current = 'M3';
    container.querySelectorAll('.mod-btn[data-module]').forEach((b) => {
      b.addEventListener('click', () => this.select(b.dataset.module));
    });
    this.container = container;
  }
  select(id) {
    if (!MODULES[id]) return;
    this.current = id;
    this.container.querySelectorAll('.mod-btn[data-module]').forEach((b) =>
      b.classList.toggle('primary', b.dataset.module === id));
    this.onSelect(id);
  }
}

// ---- state preparation applied to a system ---------------------------------
export function prepareState(sys, prep) {
  if (prep.kind === 'g0') sys.reset();
  else if (prep.kind === 'fock') sys.setFock(Math.round(prep.param), 'g');
  else if (prep.kind === 'thermal') sys.setThermal(prep.param, 'g');
  else if (prep.kind === 'coherent') sys.setCoherent(prep.param, 0, 'g');
}

// ---- one excitation-spectrum point: fresh engine, probe at δ, return P_e ----
// cfg: { N, lambdaNm, nuTrapHz, massU, rabi, mode, prep, tProbe }
export function excitationPoint(cfg, delta) {
  const sys = new IonSystem({
    N_FOCK: cfg.N, lambdaNm: cfg.lambdaNm, nuTrapHz: cfg.nuTrapHz, massU: cfg.massU,
    omegaZ: 1, delta, rabi: cfg.rabi, mode: cfg.mode,
  });
  prepareState(sys, cfg.prep);
  sys.step(cfg.tProbe);
  return sys.pExcited();
}

// Build the δ grid for a scan (±dMax·ω_z).
export function scanGrid(dMax = 1.5, steps = 61) {
  const g = [];
  for (let i = 0; i < steps; i++) g.push(-dMax + (2 * dMax) * i / (steps - 1));
  return g;
}

// =============================================================================
// Thermometry (spec §3.4): measure n̄ TWO independent ways and compare —
//   • sideband asymmetry  r = A_red/A_blue → n̄ = r/(1−r)   (precise)
//   • FFT of the blue-sideband P_e(t) via spectrum.js → P(1)/P(0) → n̄
// Mirrors test/ion.test.mjs (T10/T11). Light defaults so the button stays
// responsive; the test suite validates the method at higher resolution.
// =============================================================================
function ionWithEta(N, eta, opts = {}) {
  const s = new IonSystem({ N_FOCK: N, omegaZ: 1, mode: 'exact', ...opts });
  const e0 = s.etaValue();
  s.setTrap({ nuTrapHz: 1e6 * (e0 / eta) * (e0 / eta) });
  return s;
}

export function measureAsymmetry(nbarSet, { N = 18, eta = 0.3, Om = 0.03, tPulse = 25 } = {}) {
  const amp = (delta) => {
    const s = ionWithEta(N, eta, { rabi: Om });
    s.setRabi(Om); s.setDetuning(delta); s.setThermal(nbarSet, 'g');
    s.step(tPulse);
    return s.pExcited();
  };
  const red = amp(-1), blue = amp(+1);
  const r = red / blue;
  return r / (1 - r);
}

export function measureFFT(nbarSet, { N = 12, eta = 0.3, Om = 0.3, fftSize = 1024, cycles = 30 } = {}) {
  const s = ionWithEta(N, eta, { rabi: Om });
  s.setRabi(Om); s.setDetuning(+1); s.setThermal(nbarSet, 'g');
  const cm = s.couplingMatrix();
  const Omega_n = [];
  for (let n = 0; n + 1 < N; n++) Omega_n.push(cm[(n + 1) * N + n]);
  const T_target = cycles * (2 * Math.PI / Omega_n[0]);
  let dwellSim = T_target / fftSize;
  const nyq = 0.5 * Math.PI / Math.max(...Omega_n);
  if (dwellSim > nyq) dwellSim = nyq;
  let D_SPEC = (Omega_n[1] - Omega_n[0]) * dwellSim / (2 * Math.PI * 30);
  if (Math.exp(-Math.PI * 3 * (fftSize - 1) * D_SPEC) < 0.04)
    D_SPEC = -Math.log(0.04) / (Math.PI * 3 * (fftSize - 1));
  const spec = new Spectrum({ getContext: () => ({}) }, { dwell: D_SPEC, fftSize });
  const samples = [];
  for (let k = 0; k < fftSize; k++) { samples.push(s.pExcited()); s.step(dwellSim); }
  const mean = samples.reduce((a, b) => a + b, 0) / fftSize;
  for (const v of samples) spec.push({ real: v - mean, imag: 0 });
  const out = spec.compute();
  const toOmega = (f) => 2 * Math.PI * D_SPEC * f / dwellSim;
  const peak = (target, hw) => {
    let best = 0;
    for (let i = 0; i < out.freq.length; i++) {
      const om = toOmega(out.freq[i]);
      if (om > 0 && Math.abs(om - target) < hw) best = Math.max(best, out.mag[i]);
    }
    return best;
  };
  const hw = 0.5 * (Omega_n[1] - Omega_n[0]);
  const q = peak(Omega_n[1], hw) / peak(Omega_n[0], hw);
  return q / (1 - q);
}

// =============================================================================
// M4 — Doppler cooling (spec §4 M4, §6 assertion 13; docs/ion-recoil-kernel-physics.md §5).
// Broad-linewidth (Γ ≳ ω_z) red-detuned drive + spontaneous emission WITH the recoil
// kernel. These build their OWN short-lived engines (same discipline as excitationPoint
// / measureAsymmetry) so a scan is a clean experiment independent of the live engine.
// Uses the ⁴⁰Ca⁺ 397 nm cooling geometry: drive η and emitted-photon η̃ both ≈0.178, σ.
// Mirrors test/ion.test.mjs (M4). See MODULES.M4.note on the LD-validity boundary.
// =============================================================================

// A fresh Doppler engine: η(drive)=η̃(recoil)=0.178 (397 nm), recoil='kernel' σ, broad Γ.
function dopplerEngine({ N = 12, Gamma, delta, Om, eta = 0.178 }) {
  const s = new IonSystem({ N_FOCK: N, omegaZ: 1, delta, rabi: Om, mode: 'exact', lambdaNm: 397 });
  const e0 = s.etaValue();                                   // η(397 nm,1 MHz) ≈ 0.178
  s.setTrap({ nuTrapHz: 1e6 * (e0 / eta) * (e0 / eta) });    // pin η (moves η̃ with it)
  s.setRecoil('kernel', { geometry: 'sigma', etaTilde: eta });
  s.setSpontaneousEmission(true, Gamma);
  return s;
}

// One n̄-vs-δ scan point: cool from a warm thermal state for a fixed time, return the
// (near-)steady n̄. Fast + crude by design (the scan only needs the SHAPE / the minimum
// near −Γ/2); the accurate floor readout uses dopplerFloorExtrap below.
export function dopplerScanPoint({ N = 10, Gamma, Om, nInit, T = 260 }, delta) {
  const s = dopplerEngine({ N, Gamma, delta, Om });
  s.setThermal(nInit, 'g');
  const nStep = 10, dt = T / nStep;
  for (let i = 0; i < nStep; i++) s.step(dt);
  return s.nBar();
}

// Accurate steady-state floor via 3-point single-exponential extrapolation (same as the
// test): n(t)≈n_ss+B e^{−Wt} ⇒ n_ss = n₄+(n₄−n₃)·r/(1−r), r=(n₄−n₃)/(n₃−n₂).
export function dopplerFloorExtrap({ N = 12, Gamma, Om, nInit, tSample = 220 }, delta) {
  const s = dopplerEngine({ N, Gamma, delta, Om });
  s.setThermal(nInit, 'g');
  const p = [];
  for (let k = 0; k < 4; k++) { s.step(tSample); p.push(s.nBar()); }
  const r = (p[3] - p[2]) / (p[2] - p[1]);
  let nSS = p[3];
  if (r > 0 && r < 0.999) nSS = p[3] + (p[3] - p[2]) * r / (1 - r);
  return { nSS, last: p[3] };
}

// δ grid for the scan: carrier-side → past −Γ (so the minimum near −Γ/2 is bracketed).
export function dopplerScanGrid(Gamma, steps = 13) {
  const dMin = -1.5 * Gamma, dMax = 0.5 * Gamma, g = [];
  for (let i = 0; i < steps; i++) g.push(dMin + (dMax - dMin) * i / (steps - 1));
  return g;
}
