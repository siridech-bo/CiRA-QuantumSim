// =============================================================================
// ion-ms.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/ion-ms.test.mjs        (or: npm test)
//
// Real-physics validation of the Mølmer–Sørensen two-qubit gate engine
// (src/ion-ms.js), Substrate 3 Module M7. Prints PASS/FAIL per test with measured
// numbers; exits non-zero on any failure. Covers Ion_Trap_Visualizer_Spec.md §6
// assertions 15–16 plus CPTP invariants.
//
// Physics conventions: docs/ion-physics-constants.md §8. The Bell fidelity > 0.999
// IS the numerical verification of the hardcoded loop-closure convention (detuning
// sign, ηΩ/2 coupling prefactor, ηΩ = δ/(2√K), τ_g = 2πK/δ). See src/ion-ms.js.
// =============================================================================

import assert from 'node:assert';
import { create, all } from 'mathjs';
import { MSGate } from '../src/ion-ms.js';

const math = create(all);
let failures = 0, passes = 0;

function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// Pull the engine's flat ρ into a math.js complex matrix.
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

// =============================================================================
// Test 15 — Loop closure ⇒ maximally entangling MS gate. At τ_g = 2πK/δ with
// ηΩ = δ/(2√K), from |gg,0⟩:
//   (a) Bell-state fidelity F(|Φ⟩=(|gg⟩+i|ee⟩)/√2) > 0.999   [validates convention]
//   (b) residual spin–motion entanglement 1−Tr(ρ_2q²) → 0    [motion disentangles]
//   (c) reduced-mode purity Tr(ρ_mode²) ≈ 1                  [motion returns to vacuum]
// Checked for K = 1 and K = 2 (both loop-closure conditions). No dissipation.
// =============================================================================
let closeF1 = null, closeR1 = null;
{
  let ok = true, details = [];
  for (const K of [1, 2]) {
    const sys = new MSGate({ N_FOCK: 18, delta: 1, K, eta: 0.1 });   // matchClosure default
    // sanity: the drive really is at loop closure.
    const mismatch = Math.abs(sys.closureMismatch());
    sys.runGate(sys.gateTime());   // from |gg,0⟩ for τ_g
    const F = sys.bellFidelity();
    const resid = sys.residualEntanglement();
    const modePur = sys.modePurity();
    const gPur = sys.purity();     // global purity preserved (unitary)
    if (K === 1) { closeF1 = F; closeR1 = resid; }
    const kOk = F > 0.999 && resid < 1e-3 && modePur > 0.999 && mismatch < 1e-12 && Math.abs(gPur - 1) < 1e-6;
    if (!kOk) ok = false;
    details.push(`K=${K}: F=${F.toFixed(6)}, resid=${resid.toExponential(2)}, modePur=${modePur.toFixed(6)}, τ_g=${sys.gateTime().toFixed(3)}, ηΩ=${sys.etaOmega().toFixed(4)}(=δ/2√K=${sys.closureCoupling().toFixed(4)})`);
  }
  report('15 loop closure: Bell F>0.999 & residual spin–motion entanglement→0 (K=1,2)', ok, details.join(' | '));
}

// =============================================================================
// Test 16 — Break it: mis-set δ by ~10% off loop closure. Keep the drive (ηΩ) and
// gate time τ_g from the NOMINAL δ₀, but run the evolution with δ = 1.1·δ₀. The
// phase-space loop no longer closes at τ_g ⇒ residual spin–motion entanglement is
// nonzero AND the Bell fidelity drops measurably. BOTH asserted.
// =============================================================================
{
  const K = 1, d0 = 1;
  // Nominal (matched) reference for the drive + gate time.
  const ref = new MSGate({ N_FOCK: 18, delta: d0, K, eta: 0.1 });
  const gOmega = ref.etaOmega();      // ηΩ = δ₀/(2√K)
  const tau = ref.gateTime();         // τ_g = 2πK/δ₀

  // Mis-set engine: δ = 1.1 δ₀, but the SAME ηΩ (so Ω = gOmega/η) and run for the
  // same τ_g. matchClosure off so the drive is NOT re-matched to the wrong δ.
  const eta = 0.1;
  const bad = new MSGate({ N_FOCK: 18, delta: 1.1 * d0, K, eta, Omega: gOmega / eta, matchClosure: false });
  bad.runGate(tau);
  const Fbad = bad.bellFidelity();
  const residBad = bad.residualEntanglement();
  const modePurBad = bad.modePurity();

  const dropsOk = Fbad < 0.95 && Fbad < closeF1 - 0.03;         // fidelity clearly down
  const residOk = residBad > 0.01 && residBad > 10 * closeR1;   // real spin–motion residual
  const loopOpenOk = modePurBad < 0.99;                          // mode did NOT return to vacuum
  const ok = dropsOk && residOk && loopOpenOk;
  report('16 mis-set δ +10%: loop fails to close ⇒ Bell F drops & residual entanglement > 0', ok,
    `matched F=${closeF1.toFixed(5)} (resid=${closeR1.toExponential(2)}) → mis-set F=${Fbad.toFixed(5)} ` +
    `(resid=${residBad.toExponential(3)}, modePurity=${modePurBad.toFixed(4)})`);
}

// =============================================================================
// Test I1 — CPTP invariants (Tr=1, Hermitian, PSD) through a full gate, and with
// dissipation OFF the global purity Tr(ρ²)=1 is preserved (coherent gate).
//
// Trace / Hermiticity / purity are checked at EVERY checkpoint (cheap: traceProd,
// no eigendecomposition). Positive-semidefiniteness needs eigenvalues, and math.js
// eigs on a dim-4·N matrix is O(seconds) (dim-56 ≈ 16 s), so the PSD check runs
// ONCE, at the end, at a modest N_FOCK=10 (dim 40).
//
// PSD tolerance is minEig > −1e-6: the dim-80 time-dependent RK4 gate accumulates a
// tiny NEGATIVE eigenvalue (~−1.7e-8) — genuine integrator positivity drift, NOT a
// physics defect. That it is drift (and the gate is exact) is proven by Tr=1 to
// 3e-16, Hermiticity to machine zero, purity dev < 1e-8, and Bell F = 1.0. The
// sub-step cap (0.03) was tightened to hold purity dev to O(1e-9); pushing minEig
// below −1e-8 would need a ~2× slower cap for no physical gain, so the honest
// integrator-accuracy tolerance is used here (never the 0.999 Bell threshold).
// =============================================================================
{
  const sys = new MSGate({ N_FOCK: 10, delta: 1, K: 1, eta: 0.1 });
  const tau = sys.gateTime();
  let worstPur = 0, worstTr = 0, worstHerm = 0;
  const nSeg = 6;
  const checkTrHerm = () => {
    const M = rhoMathMatrix(sys);
    worstTr = Math.max(worstTr, Math.abs(traceReal(M) - 1));
    worstHerm = Math.max(worstHerm, maxHermitianDeviation(M));
  };
  checkTrHerm();
  for (let i = 0; i < nSeg; i++) {
    sys.step(tau / nSeg);
    worstPur = Math.max(worstPur, Math.abs(sys.purity() - 1));
    if (i === 2 || i === nSeg - 1) checkTrHerm();
  }
  const worstNeg = minEigenvalue(rhoMathMatrix(sys));   // single PSD eigendecomposition
  const ok = worstTr < 1e-9 && worstHerm < 1e-9 && worstNeg > -1e-6 && worstPur < 1e-8;
  report('I1 CPTP invariants (Tr=1, Hermitian, PSD>−1e-6) + unitary purity dev<1e-8', ok,
    `max|Tr−1|=${worstTr.toExponential(2)}, maxHermDev=${worstHerm.toExponential(2)}, minEig=${worstNeg.toExponential(2)} (RK4 drift), max|Tr(ρ²)−1|=${worstPur.toExponential(2)}`);
}

// =============================================================================
// Test I2 — Only |gg⟩,|ee⟩ populated at τ_g (the MS signature): the gate keeps the
// population in the even {gg,ee} subspace; |ge⟩,|eg⟩ are empty at loop closure, and
// P_gg ≈ P_ee ≈ 1/2 (maximal superposition).
// =============================================================================
{
  const sys = new MSGate({ N_FOCK: 18, delta: 1, K: 1, eta: 0.1 });
  sys.runGate(sys.gateTime());
  const [pgg, pge, peg, pee] = sys.qubitPopulations();
  const ok = pge < 1e-3 && peg < 1e-3 && Math.abs(pgg - 0.5) < 0.02 && Math.abs(pee - 0.5) < 0.02;
  report('I2 τ_g populations: P_gg≈P_ee≈½, P_ge≈P_eg≈0 (MS signature)', ok,
    `P_gg=${pgg.toFixed(4)}, P_ge=${pge.toExponential(2)}, P_eg=${peg.toExponential(2)}, P_ee=${pee.toFixed(4)}`);
}

// =============================================================================
// Test I3 — Phase-space loop closes at τ_g. The conditional |++⟩ mode coordinate
// ⟨X⟩,⟨P⟩ traces a loop that departs the origin mid-gate and RETURNS to it at τ_g
// (loop closed); when δ is mis-set it stays off the origin at τ_g (loop open).
// =============================================================================
{
  const sys = new MSGate({ N_FOCK: 18, delta: 1, K: 1, eta: 0.1 });
  const tau = sys.gateTime();
  sys.reset();
  const nSeg = 60;
  let maxR = 0;
  for (let i = 0; i < nSeg; i++) {
    sys.step(tau / nSeg);
    const { x, p } = sys.conditionalXP();
    maxR = Math.max(maxR, Math.hypot(x, p));
  }
  const end = sys.conditionalXP();
  const endR = Math.hypot(end.x, end.p);

  // Mis-set for the "open" comparison.
  const eta = 0.1, ref = new MSGate({ N_FOCK: 18, delta: 1, K: 1, eta });
  const bad = new MSGate({ N_FOCK: 18, delta: 1.1, K: 1, eta, Omega: ref.etaOmega() / eta, matchClosure: false });
  bad.runGate(ref.gateTime());
  const badR = Math.hypot(bad.conditionalXP().x, bad.conditionalXP().p);

  const ok = maxR > 0.3 && endR < 1e-2 && badR > 0.1 && badR > 10 * endR;
  report('I3 phase-space loop: |++⟩ ⟨X⟩,⟨P⟩ departs origin (r_max) & returns at τ_g; mis-set stays open', ok,
    `r_max=${maxR.toFixed(3)}, r(τ_g)=${endR.toExponential(2)} (closed); mis-set r(τ_g)=${badR.toFixed(3)} (open)`);
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
