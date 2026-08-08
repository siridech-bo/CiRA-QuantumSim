// =============================================================================
// ion.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/ion.test.mjs        (or: npm test)
//
// Real-physics validation of the trapped-ion substrate engine (src/ion.js),
// Substrate 3 Phase 1a. Prints PASS/FAIL per test with measured numbers; exits
// non-zero on any failure. Covers Ion_Trap_Visualizer_Spec.md §6 assertions 1–9
// plus a guard on the Lamb–Dicke η computation.
//
// Physics conventions: docs/ion-physics-constants.md. Sources: Wineland et al.
// J. Res. NIST 103, 259 (1998); Meekhof et al. PRL 76, 1796 (1996).
// =============================================================================

import assert from 'node:assert';
import { create, all } from 'mathjs';
import { IonSystem } from '../src/ion.js';
import { Spectrum } from '../src/spectrum.js';   // Phase 1b: FFT thermometry (spec §3.3, assertion 10)
import {                                          // Phase 2b: M6 single-qubit gates (spec §4 M6)
  driveCarrierGate, gateReport, idealRxAmps, fidelityToPure, measureGeneralizedRabi,
} from '../src/ion-gates.js';

const math = create(all);
let failures = 0, passes = 0;

function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// Pull the engine's flat ρ into a math.js complex matrix (dim×dim).
function rhoMathMatrix(sys) {
  const DIM = sys.dim, r = sys.rho();
  const IDX = (i, j) => 2 * (i * DIM + j);
  const data = [];
  for (let i = 0; i < DIM; i++) {
    data[i] = [];
    for (let j = 0; j < DIM; j++) {
      const idx = IDX(i, j);
      data[i][j] = math.complex(r[idx], r[idx + 1]);
    }
  }
  return math.matrix(data);
}
function maxHermitianDeviation(M) {
  const data = M.toArray(), DIM = data.length;
  let mx = 0;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const dev = math.abs(math.subtract(data[i][j], math.conj(data[j][i])));
      if (dev > mx) mx = dev;
    }
  return mx;
}
function minEigenvalue(M) {
  const res = math.eigs(M);
  const vals = res.values.toArray().map((v) => (typeof v === 'object' ? v.re : v));
  return Math.min(...vals);
}
function traceReal(M) { const t = math.trace(M); return typeof t === 'object' ? t.re : t; }

// Measure the flopping frequency Ω_flop of P_e(t) by locating the FIRST peak
// (t = π/Ω_flop) with parabolic interpolation — amplitude-independent, so it
// is insensitive to reduced off-resonant contrast. `expect` sizes the grid.
function flopFrequency(sys, expect) {
  const tPi = Math.PI / expect, dt = tPi / 300, tmax = 3 * tPi;
  let t = 0;
  const hist = [{ t: 0, pe: sys.pExcited() }];
  while (t < tmax) {
    sys.step(dt); t += dt;
    hist.push({ t, pe: sys.pExcited() });
    const L = hist.length;
    if (L >= 3 && hist[L - 2].pe > hist[L - 3].pe && hist[L - 2].pe >= hist[L - 1].pe && hist[L - 2].pe > 0.05) {
      const a = hist[L - 3].pe, b = hist[L - 2].pe, c = hist[L - 1].pe;
      const off = 0.5 * (a - c) / (a - 2 * b + c);   // sub-sample peak offset (units of dt)
      return Math.PI / (hist[L - 2].t + off * dt);
    }
  }
  return NaN;
}

// Build an IonSystem whose η equals `target` (by solving for the trap frequency,
// η ∝ 1/√ν_z), keeping λ=729 nm, m=40 u. Used by the exact-vs-ld tests.
function ionWithEta(target, N, mode = 'exact') {
  const s = new IonSystem({ N_FOCK: N, mode });
  const e0 = s.etaValue();                    // η at ν_z = 1 MHz
  const nu = 1e6 * (e0 / target) * (e0 / target);
  s.setTrap({ nuTrapHz: nu });
  return s;
}

const ETA = new IonSystem({}).etaValue();     // ⁴⁰Ca⁺ 729 nm, 1 MHz

// =============================================================================
// η guard — Lamb–Dicke parameter COMPUTED from real quantities (spec §2.8).
//   ⁴⁰Ca⁺ 729 nm @ 1 MHz ≈ 0.097 ; 397 nm ≈ 0.178.
// =============================================================================
{
  const e729 = new IonSystem({ lambdaNm: 729 }).etaValue();
  const e397 = new IonSystem({ lambdaNm: 397 }).etaValue();
  const ok = Math.abs(e729 - 0.097) / 0.097 < 0.03 && Math.abs(e397 - 0.178) / 0.178 < 0.03;
  report('η computed from real quantities: 729 nm≈0.097, 397 nm≈0.178',
    ok, `η(729)=${e729.toFixed(4)}, η(397)=${e397.toFixed(4)}`);
}

// =============================================================================
// Test 1 — Invariants: Tr(ρ)=1, Hermitian, PSD at init, after a driven pulse,
// and after further (dissipative) evolution, at several time points.
// =============================================================================
{
  const sys = new IonSystem({ N_FOCK: 8, omegaZ: 1, delta: -1, rabi: 0.3, mode: 'exact' });
  sys.setSpontaneousEmission(true, 0.05);
  sys.setMotionalBath(true, { heating: 0.02, nBath: 0.5 });
  sys.setDephasing(true, 0.03);
  sys.setFock(1, 'g');

  const checkpoints = [['init', rhoMathMatrix(sys)]];
  sys.step(3);  checkpoints.push(['driven t=3', rhoMathMatrix(sys)]);
  sys.step(5);  checkpoints.push(['driven t=8', rhoMathMatrix(sys)]);
  sys.setRabi(0); sys.step(10); checkpoints.push(['decay t=18', rhoMathMatrix(sys)]);

  let allOk = true, worstTr = 0, worstHerm = 0, worstNeg = 0;
  for (const [label, M] of checkpoints) {
    const tr = traceReal(M), herm = maxHermitianDeviation(M), minEig = minEigenvalue(M);
    worstTr = Math.max(worstTr, Math.abs(tr - 1));
    worstHerm = Math.max(worstHerm, herm);
    worstNeg = Math.min(worstNeg, minEig);
    const ok = Math.abs(tr - 1) < 1e-6 && herm < 1e-9 && minEig > -1e-8;
    if (!ok) { allOk = false; console.log(`      [${label}] tr=${tr}, herm=${herm}, minEig=${minEig}`); }
  }
  report('T1 invariants (Tr=1, Hermitian, PSD) at init/driven/decay',
    allOk, `max|Tr−1|=${worstTr.toExponential(2)}, maxHermDev=${worstHerm.toExponential(2)}, minEig=${worstNeg.toExponential(2)}`);
}

// =============================================================================
// Test 2 — Unitary evolution (all dissipators off) preserves purity Tr(ρ²)=1
// over an evolution after a pulse.
// =============================================================================
{
  const sys = new IonSystem({ N_FOCK: 8, omegaZ: 1, delta: -1, rabi: 0.15, mode: 'exact' });
  sys.setFock(1, 'g');
  let worst = 0;
  for (let i = 0; i < 40; i++) { sys.step(2.5); worst = Math.max(worst, Math.abs(sys.purity() - 1)); }
  const ok = worst < 1e-6;
  report('T2 unitary evolution preserves purity Tr(ρ²)=1', ok,
    `max|Tr(ρ²)−1|=${worst.toExponential(2)} (< 1e-6)`);
}

// =============================================================================
// Test 3 — Truncation occupancy < 1e-6 for the default parameter set over a
// representative driven run (default N_FOCK=25).
// =============================================================================
{
  const sys = new IonSystem({});               // default set: N_FOCK=25, η≈0.097
  sys.setCoherent(1.5);                         // motional coherent |α=1.5⟩, n̄≈2.25
  sys.setDetuning(+1); sys.setRabi(0.05);       // blue sideband — climbs motion
  let maxTop = 0;
  const t0 = Date.now();
  const T = 100;
  sys.step(T);
  maxTop = sys.truncationOccupancy();
  const ms = Date.now() - t0;
  const perUnit = ms / (sys.omegaZ * T);
  const ok = maxTop < 1e-6;
  report('T3 truncation occupancy < 1e-6 (default N_FOCK=25)', ok,
    `top-3 Fock pop = ${maxTop.toExponential(3)}; perf ≈ ${perUnit.toFixed(2)} ms per unit ω_z·t (dim ${sys.dim})`);
}

// =============================================================================
// Test 4 — Red sideband (δ=−ω_z, Ω≪ω_z, 'exact'): from |g,n⟩ the g↔e population
// flops at ηΩ√n. Check n=1,2 within a few %.
// =============================================================================
{
  const Om = 0.02;
  let ok = true, details = [];
  for (const n of [1, 2]) {
    const s = new IonSystem({ N_FOCK: 7, omegaZ: 1, delta: -1, rabi: Om, mode: 'exact' });
    s.setFock(n, 'g');
    const expect = ETA * Om * Math.sqrt(n);
    const meas = flopFrequency(s, expect);
    const err = Math.abs(meas - expect) / expect;
    if (err > 0.03) ok = false;
    details.push(`n=${n}: ${(err * 100).toFixed(2)}%`);
  }
  report('T4 red sideband flops at ηΩ√n', ok, `err ${details.join(', ')} (< 3%)`);
}

// =============================================================================
// Test 5 — Blue sideband (δ=+ω_z): from |g,n⟩ flops at ηΩ√(n+1). Check n=0,1.
// =============================================================================
{
  const Om = 0.02;
  let ok = true, details = [];
  for (const n of [0, 1]) {
    const s = new IonSystem({ N_FOCK: 7, omegaZ: 1, delta: +1, rabi: Om, mode: 'exact' });
    s.setFock(n, 'g');
    const expect = ETA * Om * Math.sqrt(n + 1);
    const meas = flopFrequency(s, expect);
    const err = Math.abs(meas - expect) / expect;
    if (err > 0.03) ok = false;
    details.push(`n=${n}: ${(err * 100).toFixed(2)}%`);
  }
  report('T5 blue sideband flops at ηΩ√(n+1)', ok, `err ${details.join(', ')} (< 3%)`);
}

// =============================================================================
// Test 6 — |g,0⟩ is DARK on the red sideband: δ=−ω_z, start |g,0⟩, drive;
// P_e stays < 1e-10 (√0 = 0; the same physics that makes ground-state cooling
// detectable).
// =============================================================================
{
  const s = new IonSystem({ N_FOCK: 6, omegaZ: 1, delta: -1, rabi: 2e-6, mode: 'exact' });
  s.setFock(0, 'g');
  let maxPe = 0;
  for (let i = 0; i < 60; i++) { s.step(5); maxPe = Math.max(maxPe, s.pExcited()); }
  const ok = maxPe < 1e-10;
  report('T6 |g,0⟩ dark on red sideband (P_e < 1e-10)', ok,
    `max P_e = ${maxPe.toExponential(3)}`);
}

// =============================================================================
// Test 7 — Carrier Debye–Waller: Ω_{n,n}/Ω = 1−η²n to first order; exact carrier
// Ω_{0,0} = Ω·e^(−η²/2). The residual (½η² that the LD form drops) is the
// Debye–Waller factor itself.
// =============================================================================
{
  const sys = new IonSystem({ N_FOCK: 8, mode: 'exact' });
  const cm = sys.couplingMatrix(), N = sys.N_FOCK, Om = sys.rabi(), eta2 = ETA * ETA;

  // exact Ω_{0,0}/Ω = e^(−η²/2) (machine precision)
  const r00 = cm[0] / Om;
  const dw = Math.exp(-eta2 / 2);
  const exactOk = Math.abs(r00 - dw) < 1e-12;

  // Ω_{n,n}/Ω ≈ 1−η²n to within the Debye–Waller residual (< 1%).
  let ldOk = true, worst = 0;
  for (let n = 0; n <= 4; n++) {
    const ratio = cm[n * N + n] / Om;
    const dev = Math.abs(ratio - (1 - eta2 * n));
    worst = Math.max(worst, dev);
    if (dev > 0.01) ldOk = false;
  }
  const ok = exactOk && ldOk;
  report('T7 carrier Debye–Waller: Ω_{0,0}=Ω·e^(−η²/2), Ω_{n,n}/Ω≈1−η²n', ok,
    `Ω_{0,0}/Ω=${r00.toFixed(8)} vs e^(−η²/2)=${dw.toFixed(8)}; max|ratio−(1−η²n)|=${worst.toExponential(2)} (< 1e-2)`);
}

// =============================================================================
// Test 8 — 'exact' vs 'ld': agree <1% for η√(n+1)<0.1 (small η), and diverge
// >10% for η=0.5, n=10 (η²(2n+1)=5.25 ≫ 1). BOTH halves asserted — the
// approximation working AND failing.
// =============================================================================
{
  // small η: use η=0.05 so η√(n+1)<0.1 for n≤2. Compare RSB elements Ω_{n,n−1}.
  const eSmall = 0.05;
  const se = ionWithEta(eSmall, 8, 'exact'), sl = ionWithEta(eSmall, 8, 'ld');
  const cme = se.couplingMatrix(), cml = sl.couplingMatrix(), Ns = 8, Oms = se.rabi();
  let agreeOk = true, worstAgree = 0;
  for (const n of [1, 2]) {                       // η√(n+1): 0.071, 0.087 (< 0.1)
    const ex = cme[(n - 1) * Ns + n] / Oms, ld = cml[(n - 1) * Ns + n] / Oms;
    const rel = Math.abs(ex - ld) / ld;
    worstAgree = Math.max(worstAgree, rel);
    if (rel > 0.01) agreeOk = false;
  }

  // large η, high n: η=0.5, n=10 — the linearized form breaks down.
  const sxE = ionWithEta(0.5, 16, 'exact'), sxL = ionWithEta(0.5, 16, 'ld');
  const cxe = sxE.couplingMatrix(), cxl = sxL.couplingMatrix(), Nx = 16, Omx = sxE.rabi();
  const exBig = cxe[9 * Nx + 10] / Omx, ldBig = cxl[9 * Nx + 10] / Omx;
  const relBig = Math.abs(exBig - ldBig) / ldBig;
  const divergeOk = relBig > 0.10;

  const ok = agreeOk && divergeOk;
  report('T8 exact vs ld: agree <1% (small η), diverge >10% (η=0.5,n=10)', ok,
    `small-η max reldiff=${(worstAgree * 100).toFixed(2)}% (<1%); η=0.5,n=10 reldiff=${(relBig * 100).toFixed(1)}% (>10%)`);
}

// =============================================================================
// Test 9 — Emergent selectivity: from |g,1⟩ with δ=−ω_z and Ω≪ω_z, population
// transfers to |e,0⟩ (RSB) and NOT |e,2⟩ (BSB, off-resonant by 2ω_z);
// P(e,0)≫P(e,2). Raising Ω above ω_z destroys the selectivity: P(e,2) becomes
// significant. Selectivity is EMERGENT, never hard-wired.
// =============================================================================
{
  // resolved regime: Ω≪ω_z, drive ~one RSB π-pulse.
  const OmLo = 0.03;
  const sLo = new IonSystem({ N_FOCK: 6, omegaZ: 1, delta: -1, rabi: OmLo, mode: 'exact' });
  sLo.setFock(1, 'g');
  const tPi = Math.PI / (ETA * OmLo);
  const dt = tPi / 300; for (let i = 0; i < 300; i++) sLo.step(dt);
  const eLo = sLo.populations().e;
  const selectiveOk = eLo[0] > 0.9 && eLo[2] < 1e-3 && eLo[0] / (eLo[2] + 1e-30) > 1e3;

  // unresolved regime: Ω>ω_z — sidebands overlap, |e,2⟩ gets significant pop.
  const OmHi = 3.0;
  const sHi = new IonSystem({ N_FOCK: 6, omegaZ: 1, delta: -1, rabi: OmHi, mode: 'exact' });
  sHi.setFock(1, 'g');
  let e2max = 0;
  for (let i = 0; i < 400; i++) { sHi.step(0.05); e2max = Math.max(e2max, sHi.populations().e[2]); }
  const destroyedOk = e2max > 0.01;

  const ok = selectiveOk && destroyedOk;
  report('T9 emergent sideband selectivity (P(e,0)≫P(e,2); destroyed at Ω>ω_z)', ok,
    `Ω≪ω_z: P(e,0)=${eLo[0].toFixed(4)}, P(e,2)=${eLo[2].toExponential(2)}; ` +
    `Ω>ω_z: max P(e,2)=${e2max.toFixed(4)} (>0.01)`);
}

// =============================================================================
// Phase 1b thermometry + cooling assertions (spec §6.10, §6.11, §6.14). These
// back the M3/M5 visual claims: the FFT-of-P_e phonon spectrum, the two
// independent n̄ measurements agreeing, and the sideband-cooling floor.
// =============================================================================

// Blue-sideband flopping frequencies Ω_{n,n+1} = Ω·|D[n+1][n]| from the engine's
// own coupling matrix (drives P_e(t) = Σ_n P(n) sin²(Ω_{n,n+1} t/2)).
function blueFlopFreqs(sys) {
  const N = sys.N_FOCK, cm = sys.couplingMatrix();
  const out = [];
  for (let n = 0; n + 1 < N; n++) out.push(cm[(n + 1) * N + n]);
  return out;
}

// Sideband-asymmetry thermometer: weak short probe on red (δ=−ω_z) and blue
// (δ=+ω_z); in the quadratic regime P_e,red/P_e,blue = n̄/(n̄+1) = r ⇒ n̄=r/(1−r).
function asymmetryNbar(nbarSet, { N = 18, eta = 0.3, Om = 0.03, tPulse = 25 } = {}) {
  const amp = (delta) => {
    const s = ionWithEta(eta, N, 'exact');
    s.setRabi(Om); s.setDetuning(delta); s.setThermal(nbarSet, 'g');
    s.step(tPulse);
    return s.pExcited();
  };
  const red = amp(-1), blue = amp(+1);
  const r = red / blue;
  return { r, nbar: r / (1 - r) };
}

// =============================================================================
// Test 10 — FFT thermometry: drive the BLUE sideband on a thermal state, feed
// P_e(t) into the EXISTING spectrum.js (spec §3.3 — no second FFT), and read the
// phonon distribution off the peak heights. Peaks sit at Ω_{n,n+1}; their heights
// ∝ P(n), so the ratio P(1)/P(0) = n̄/(1+n̄) recovers n̄ (Meekhof/NIST 1996). A
// stub canvas lets spectrum.js run under node. Cross-checked against the sideband-
// asymmetry thermometer at the SAME set n̄ — the two must agree (spec §3.4).
// =============================================================================
{
  const nbarSet = 0.8, N = 12, eta = 0.3, Om = 0.3, fftSize = 1024, cycles = 30;
  const s = ionWithEta(eta, N, 'exact');
  s.setRabi(Om); s.setDetuning(+1); s.setThermal(nbarSet, 'g');
  const Omega_n = blueFlopFreqs(s);

  // Sample enough cycles of the slowest peak (Ω_0) that truncation sidelobes are
  // small; stay below Nyquist for the fastest populated peak.
  const T_target = cycles * (2 * Math.PI / Omega_n[0]);
  let dwellSim = T_target / fftSize;
  const nyq = 0.5 * Math.PI / Math.max(...Omega_n);
  if (dwellSim > nyq) dwellSim = nyq;

  // spectrum.js has a fixed 3 Hz apodization (tuned for ms NMR dwell); feed it a
  // SCALED dwell D_SPEC so the two lowest peaks separate to ≫ that linewidth while
  // the window still holds signal. Frequencies invert exactly: Ω = 2π·D_SPEC·f/dt.
  let D_SPEC = (Omega_n[1] - Omega_n[0]) * dwellSim / (2 * Math.PI * 30);
  const endDecay = Math.exp(-Math.PI * 3 * (fftSize - 1) * D_SPEC);
  if (endDecay < 0.04) D_SPEC = -Math.log(0.04) / (Math.PI * 3 * (fftSize - 1));

  const spec = new Spectrum({ getContext: () => ({}) }, { dwell: D_SPEC, fftSize });
  const samples = [];
  for (let k = 0; k < fftSize; k++) { samples.push(s.pExcited()); s.step(dwellSim); }
  const mean = samples.reduce((a, b) => a + b, 0) / fftSize;
  for (const v of samples) spec.push({ real: v - mean, imag: 0 });
  const out = spec.compute();

  const toOmega = (f) => 2 * Math.PI * D_SPEC * f / dwellSim;
  const peakNear = (target, hw) => {
    let best = 0;
    for (let i = 0; i < out.freq.length; i++) {
      const om = toOmega(out.freq[i]);
      if (om > 0 && Math.abs(om - target) < hw) best = Math.max(best, out.mag[i]);
    }
    return best;
  };
  const hw = 0.5 * (Omega_n[1] - Omega_n[0]);
  const p0 = peakNear(Omega_n[0], hw), p1 = peakNear(Omega_n[1], hw), p2 = peakNear(Omega_n[2], hw);
  const q = p1 / p0;                       // P(1)/P(0) = n̄/(1+n̄)
  const nFFT = q / (1 - q);

  // Independent thermometer at the same set n̄.
  const asym = asymmetryNbar(nbarSet);

  const monotonic = p0 > p1 && p1 > p2;    // thermal geometric fall-off in the FFT
  const fftOk = Math.abs(nFFT - nbarSet) / nbarSet < 0.30;
  const agreeOk = Math.abs(nFFT - asym.nbar) < 0.35;
  const ok = monotonic && fftOk && agreeOk;
  report('T10 FFT of P_e(t) recovers P(n) → n̄ (spectrum.js, agrees w/ asymmetry)', ok,
    `set n̄=${nbarSet}; FFT peaks p0>p1>p2=${p0.toFixed(1)}>${p1.toFixed(1)}>${p2.toFixed(1)}; ` +
    `n̄(FFT)=${nFFT.toFixed(3)} (${(Math.abs(nFFT - nbarSet) / nbarSet * 100).toFixed(1)}%), ` +
    `n̄(asym)=${asym.nbar.toFixed(3)}`);
}

// =============================================================================
// Test 11 — Sideband asymmetry: r = A_red/A_blue from the excitation spectrum
// gives n̄ = r/(1−r), recovering the set n̄ (the second, precise thermometer;
// spec §3.4). Independent of the FFT — the two agreeing IS real thermometry.
// =============================================================================
{
  let ok = true, details = [];
  for (const nbarSet of [0.5, 1.0, 2.0]) {
    const { r, nbar } = asymmetryNbar(nbarSet);
    const err = Math.abs(nbar - nbarSet) / nbarSet;
    if (err > 0.05) ok = false;
    details.push(`n̄=${nbarSet}: r=${r.toFixed(3)}→${nbar.toFixed(3)} (${(err * 100).toFixed(1)}%)`);
  }
  report('T11 sideband asymmetry n̄=r/(1−r) recovers set n̄ (< 5%)', ok, details.join('; '));
}

// =============================================================================
// Test 14 — Sideband-cooling floor: from a warm thermal state, red-sideband
// (δ=−ω_z) drive + motion-preserving spontaneous emission cools n̄ to a steady
// state that (a) stays below 0.01 for Γ_eff/ω_z=0.1 and (b) SCALES as (Γ_eff/ω_z)²
// — asserted as super-linear scaling + the bound, NOT a precise prefactor (spec
// §6.14: the O(1) coefficient is recoil/convention dependent and brittle). The
// drive is scaled with Γ_eff (fixed ηΩ/Γ) so both the quantum-limit and drive
// contributions to the floor scale as Γ². Also: raising the heating rate (the M5
// motional bath "break-it" control) lifts the floor — a real effect.
// =============================================================================
{
  // ηΩ = 0.5·Γ_eff (weak, resolved sideband), η=0.25, δ=−ω_z, cool a warm n̄=2.
  const coolFloor = (GammaEff, T, heating = 0) => {
    const eta = 0.25, Om = 0.5 * GammaEff / eta;
    const s = ionWithEta(eta, 12, 'exact');
    s.setRabi(Om); s.setDetuning(-1);
    s.setSpontaneousEmission(true, GammaEff);
    if (heating > 0) s.setMotionalBath(true, { heating, nBath: 1 });
    s.setThermal(2.0, 'g');
    const nStep = 24, dt = T / nStep;
    for (let i = 0; i < nStep; i++) s.step(dt);
    return s.nBar();
  };

  const floorA = coolFloor(0.1, 900);   // Γ_eff/ω_z = 0.1
  const floorB = coolFloor(0.2, 600);   // Γ_eff/ω_z = 0.2
  const ratio = floorB / floorA;

  const boundOk = floorA < 0.01;                 // (b) bound
  const scalingOk = ratio > 3 && ratio < 12;     // (a) super-linear ≈ quadratic, not the prefactor
  const cooledOk = floorA < 2.0 && floorB < 2.0; // actually cooled below the warm start

  const cold = coolFloor(0.15, 600, 0);
  const hot  = coolFloor(0.15, 600, 0.05);       // motional-bath "break it"
  const heatOk = hot > cold * 2;                 // heating clearly raises the floor

  const ok = boundOk && scalingOk && cooledOk && heatOk;
  report('T14 RSB cooling floor < 0.01 (Γ/ω_z=0.1), ∝(Γ/ω_z)², heating lifts it', ok,
    `n̄_ss(0.1)=${floorA.toExponential(2)} (<0.01), n̄_ss(0.2)=${floorB.toExponential(2)}, ` +
    `ratio=${ratio.toFixed(2)} (∈[3,12]); heating: ${cold.toExponential(2)}→${hot.toExponential(2)}`);
}

// =============================================================================
// M6 single-qubit gates (spec §4 M6). The carrier (δ=0) drive rotates the internal
// qubit — a pulse of area Ω_eff·t is a Bloch rotation Rx(θ). All three claims are
// EMERGENT from the same engine: the clean rotation, the AC-Stark tilt, and the
// break-it loss of spectral selectivity when the pulse gets short (Ω ≳ ω_z). The
// engine exposes only a real Ω (no drive phase), so the native gate is Rx / a
// δ-tilted rotation — asserted as such, not a faked Ry.
// =============================================================================

// -----------------------------------------------------------------------------
// Test M6a — Clean carrier rotation: a long (Ω≪ω_z) carrier π-pulse on |g,0⟩ →
// |e,0⟩ with the MOTION UNCHANGED (Δn̄ < 1e-3) and high fidelity to the ideal σx
// rotation; a carrier 2π returns to |g,0⟩. Selectivity here is that a spectrally
// narrow pulse does not touch the ±ω_z sidebands.
// -----------------------------------------------------------------------------
{
  const Om = 0.05;   // Ω ≪ ω_z = 1

  const sPi = new IonSystem({ N_FOCK: 20, omegaZ: 1, delta: 0, rabi: Om, mode: 'exact' });
  sPi.reset();                                   // |g,0⟩, n̄=0
  driveCarrierGate(sPi, Math.PI, 600);
  const piRep = gateReport(sPi, Math.PI);
  const dNbarPi = piRep.nbar;                    // Δn̄ from 0
  const piOk = piRep.fidelity > 0.99 && dNbarPi < 1e-3 && piRep.pExcited > 0.99;

  const s2Pi = new IonSystem({ N_FOCK: 20, omegaZ: 1, delta: 0, rabi: Om, mode: 'exact' });
  s2Pi.reset();
  driveCarrierGate(s2Pi, 2 * Math.PI, 800);
  const backFid = fidelityToPure(s2Pi, idealRxAmps(2 * Math.PI).cg, idealRxAmps(2 * Math.PI).ce);
  const twoPiOk = backFid > 0.999 && s2Pi.pExcited() < 1e-3;

  report('M6a clean carrier rotation: π→|e,0⟩ (Δn̄<1e-3, F>0.99), 2π→|g,0⟩', piOk && twoPiOk,
    `π: F=${piRep.fidelity.toFixed(6)}, P_e=${piRep.pExcited.toFixed(6)}, Δn̄=${dNbarPi.toExponential(2)}; ` +
    `2π: F(→g)=${backFid.toFixed(6)}, P_e=${s2Pi.pExcited().toExponential(2)}`);
}

// -----------------------------------------------------------------------------
// Test M6b — AC Stark / light shift: an OFF-RESONANT carrier (finite δ, Rabi Ω)
// rotates about a TILTED axis; the internal-state precession is the generalized
// Rabi Ω_gen = √(δ²+Ω²), and the per-level light shift ½(Ω_gen−|δ|) ≈ Ω²/(4δ) in
// the δ≫Ω regime. Measured in a clean two-level regime (ω_z pushed far away).
// -----------------------------------------------------------------------------
{
  let ok = true, details = [];
  for (const [d, O] of [[0.3, 0.05], [0.5, 0.1]]) {   // δ≫Ω and δ≪ω_z(=30)
    const m = measureGeneralizedRabi(d, O, { omegaZ: 30, periods: 10 });
    const genErr = Math.abs(m.measGen - m.formulaGen) / m.formulaGen;
    const lsErr = Math.abs(m.lightShiftMeas - m.lightShiftFormula) / Math.abs(m.lightShiftFormula);
    if (genErr > 0.02 || lsErr > 0.08) ok = false;
    details.push(`δ=${d},Ω=${O}: Ω_gen=${m.measGen.toFixed(5)} vs √(δ²+Ω²)=${m.formulaGen.toFixed(5)} (${(genErr * 100).toFixed(2)}%), ` +
      `LS=${m.lightShiftMeas.toExponential(2)} vs Ω²/4δ=${m.lightShiftFormula.toExponential(2)} (${(lsErr * 100).toFixed(1)}%)`);
  }
  report('M6b AC Stark: precession=√(δ²+Ω²) (<2%), light shift≈Ω²/4δ (<8%)', ok, details.join('; '));
}

// -----------------------------------------------------------------------------
// Test M6c — Break it (EMERGENT spectral selectivity): a LONG carrier π-pulse
// (Ω≪ω_z) leaves the motion cold and the gate clean; a SHORT/broadband π-pulse
// (Ω≈ω_z, bandwidth ~Ω reaches the ±ω_z sidebands) EXCITES the motion (the
// envelope of n̄ grows with Ω — there are coherent dips where residual sideband
// displacement briefly refocuses, which a hard-wired branch would not produce)
// and spin–motion entanglement drags the single-qubit fidelity down. BOTH halves
// asserted — selective when Ω≪ω_z, NOT selective when Ω≳ω_z. Never hard-wired.
// -----------------------------------------------------------------------------
{
  const runPi = (Om, N) => {
    const s = new IonSystem({ N_FOCK: N, omegaZ: 1, delta: 0, rabi: Om, mode: 'exact' });
    s.reset();
    driveCarrierGate(s, Math.PI, Math.max(600, Math.ceil(Math.PI / carrierRabi0Local(s) * Om * 40)));
    return gateReport(s, Math.PI);
  };
  function carrierRabi0Local(s) { return s.couplingMatrix()[0]; }

  const longP = runPi(0.05, 20);   // Ω ≪ ω_z — spectrally selective
  const shortP = runPi(1.0, 20);   // Ω ≈ ω_z — broadband, not selective

  const infidLong = 1 - longP.fidelity, infidShort = 1 - shortP.fidelity;
  const selectiveOk = longP.nbar < 1e-3 && longP.fidelity > 0.99;
  const notSelectiveOk = shortP.nbar > 3e-3 && shortP.nbar > 50 * longP.nbar && infidShort > 20 * infidLong;

  report('M6c break-it: Ω≪ω_z selective (cold, F>0.99); Ω≈ω_z heats motion + F drops', selectiveOk && notSelectiveOk,
    `long Ω=0.05: n̄=${longP.nbar.toExponential(2)}, F=${longP.fidelity.toFixed(5)}; ` +
    `short Ω=1.0: n̄=${shortP.nbar.toExponential(2)} (×${(shortP.nbar / longP.nbar).toFixed(0)}), ` +
    `F=${shortP.fidelity.toFixed(5)} (infidelity ×${(infidShort / infidLong).toFixed(0)})`);
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
