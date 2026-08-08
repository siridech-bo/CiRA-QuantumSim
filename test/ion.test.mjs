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
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
