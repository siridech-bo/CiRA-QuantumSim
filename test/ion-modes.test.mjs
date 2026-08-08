// =============================================================================
// ion-modes.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/ion-modes.test.mjs        (or: npm test)
//
// Real-physics validation of the CLASSICAL trapped-ion solvers (src/ion-modes.js),
// Substrate 3 Phase 2a (M1 Paul-trap Mathieu stability + M2 Coulomb normal modes).
// Prints PASS/FAIL per test with the DERIVED numbers; exits non-zero on any failure.
// Covers Ion_Trap_Visualizer_Spec.md §6 assertions 17, 18, 19.
//
// Every physical claim is a genuine computation from first principles:
//   • q* ≈ 0.908 falls out of a monodromy (Floquet) |Tr M| = 2 bisection — no lookup.
//   • the two-ion spacing comes from the Newton equilibrium solve, checked against
//     the closed form 2^(1/3).
//   • the mode eigenvalues come from eigendecomposing James's Hessian.
//
// Physics sources: docs/ion-physics-constants.md §9; James, Appl. Phys. B 66, 181
// (1998); standard Mathieu/Floquet theory.
// =============================================================================

import assert from 'node:assert';
import { MathieuTrap, IonChain } from '../src/ion-modes.js';

let failures = 0, passes = 0;
function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}
function check(name, fn, detail = '') {
  try { fn(); report(name, true, typeof detail === 'function' ? detail() : detail); }
  catch (e) { report(name, false, (typeof detail === 'function' ? detail() : detail) + '  ::  ' + e.message); }
}

console.log('\n=== M1 — Paul trap: Mathieu stability (monodromy / Floquet) ===\n');

// ---------------------------------------------------------------------------
// 17. a=0 lowest stability boundary q* ≈ 0.908, DERIVED via monodromy |Tr M|=2
//     bisection. Plus: a point inside is stable, a point past the boundary is not.
// ---------------------------------------------------------------------------
const qStar = MathieuTrap.lowestBoundaryQ(0, { steps: 3000, iters: 90 });
check('17a. Mathieu q* (a=0) derived from monodromy bisection ≈ 0.908', () => {
  assert.ok(Math.abs(qStar - 0.9080) < 0.01, `q*=${qStar} not within ±0.01 of 0.908`);
}, () => `q* = ${qStar.toFixed(6)}  (Tr M(q*) = ${MathieuTrap.traceMonodromy(0, qStar, 3000).toFixed(5)} ≈ −2)`);

check('17b. point INSIDE the stable region is stable (a=0, q=0.5)', () => {
  const tr = MathieuTrap.traceMonodromy(0, 0.5, 3000);
  assert.ok(MathieuTrap.isStable(0, 0.5, 3000), `q=0.5 should be stable, Tr M=${tr}`);
  assert.ok(Math.abs(tr) < 2, `|Tr M| must be < 2, got ${Math.abs(tr)}`);
}, () => `Tr M(0,0.5) = ${MathieuTrap.traceMonodromy(0, 0.5, 3000).toFixed(4)}  (|·| < 2)`);

check('17c. point PAST the boundary is unstable (a=0, q=1.0 > q*)', () => {
  const tr = MathieuTrap.traceMonodromy(0, 1.0, 3000);
  assert.ok(!MathieuTrap.isStable(0, 1.0, 3000), `q=1.0 should be unstable, Tr M=${tr}`);
  assert.ok(Math.abs(tr) > 2, `|Tr M| must be > 2, got ${Math.abs(tr)}`);
  // and the full-ODE trajectory visibly diverges there
  const traj = new MathieuTrap({ a: 0, q: 1.0 }).trajectory({ tauMax: 20 * Math.PI, steps: 6000 });
  assert.ok(traj.diverged, 'trajectory past q* must diverge');
}, () => `Tr M(0,1.0) = ${MathieuTrap.traceMonodromy(0, 1.0, 3000).toFixed(4)}  (|·| > 2, trajectory diverges)`);

// bonus sanity: det M = 1 (energy-conserving Floquet system)
check('17d. monodromy det M = 1 (Hamiltonian/Floquet consistency)', () => {
  const M = MathieuTrap.monodromy(0, 0.5, 3000);
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  assert.ok(Math.abs(det - 1) < 1e-4, `det M = ${det}`);
}, () => `det M = ${(() => { const M = MathieuTrap.monodromy(0, 0.5, 3000); return (M[0][0] * M[1][1] - M[0][1] * M[1][0]).toFixed(6); })()}`);

console.log('\n=== M2 — Coulomb normal modes (James 1998) ===\n');

// ---------------------------------------------------------------------------
// 18. Two-ion equilibrium spacing from the Newton solve matches the analytic
//     (e²/2πε₀mω_z²)^(1/3) — i.e. dimensionless spacing = 2^(1/3) — to < 0.1%.
// ---------------------------------------------------------------------------
const chain = new IonChain();
const spacingNewton = chain.twoIonSpacingNewton();
const spacingAnalytic = IonChain.twoIonSpacingAnalytic();
check('18. two-ion spacing: Newton equilibrium vs analytic 2^(1/3) (< 0.1%)', () => {
  const relErr = Math.abs(spacingNewton - spacingAnalytic) / spacingAnalytic;
  assert.ok(relErr < 1e-3, `rel err ${relErr} ≥ 0.1%`);
}, () => `Newton = ${spacingNewton.toFixed(8)},  analytic 2^(1/3) = ${spacingAnalytic.toFixed(8)},  rel err = ${(Math.abs(spacingNewton - spacingAnalytic) / spacingAnalytic).toExponential(2)}`);

// ---------------------------------------------------------------------------
// 19. COM axial mode = ω_z (eigenvalue 1) for N = 2,3,4 (N-independent);
//     two-ion stretch mode = √3·ω_z (eigenvalue 3). All to < 0.1%.
// ---------------------------------------------------------------------------
for (const N of [2, 3, 4]) {
  const m = new IonChain().modes(N);
  const com = m.eigenvalues[0];
  check(`19a. COM eigenvalue = 1 (⇒ ω_z) for N=${N}`, () => {
    assert.ok(Math.abs(com - 1) < 1e-3, `COM eig ${com} ≠ 1`);
    // COM eigenvector = all ions in phase (uniform sign)
    const v = m.modes[0].vector;
    const allSame = v.every((x) => Math.sign(x) === Math.sign(v[0]) && Math.abs(x) > 1e-6);
    assert.ok(allSame, `COM mode should be all-in-phase, got ${v.map((x) => x.toFixed(3))}`);
  }, () => `eigenvalues = [${m.eigenvalues.map((x) => x.toFixed(4)).join(', ')}],  COM freq = ${m.frequencies[0].toFixed(4)} ω_z`);
}

const two = new IonChain().modes(2);
check('19b. two-ion stretch eigenvalue = 3 (⇒ √3·ω_z), out of phase', () => {
  assert.ok(Math.abs(two.eigenvalues[1] - 3) < 1e-3, `stretch eig ${two.eigenvalues[1]} ≠ 3`);
  assert.ok(Math.abs(two.frequencies[1] - Math.sqrt(3)) < 1e-3, `stretch freq ${two.frequencies[1]} ≠ √3`);
  const v = two.modes[1].vector;
  assert.ok(Math.sign(v[0]) !== Math.sign(v[1]), `stretch mode should be out of phase, got ${v.map((x) => x.toFixed(3))}`);
}, () => `stretch eig = ${two.eigenvalues[1].toFixed(5)},  freq = ${two.frequencies[1].toFixed(5)} ω_z  (√3 = ${Math.sqrt(3).toFixed(5)})`);

// bonus: N=3 third eigenvalue = 29/5 = 5.8 (James), and zigzag threshold is finite
check('19c. N=3 breathing eigenvalue = 29/5 = 5.8 (James)', () => {
  const m3 = new IonChain().modes(3);
  assert.ok(Math.abs(m3.eigenvalues[2] - 5.8) < 5e-3, `got ${m3.eigenvalues[2]}`);
}, () => `N=3 eigenvalues = [${new IonChain().modes(3).eigenvalues.map((x) => x.toFixed(4)).join(', ')}]`);

check('19d. zigzag critical ratio (ω_x/ω_z)_crit finite & N=2 → 1', () => {
  const c2 = new IonChain().zigzagCriticalRatio(2);
  const c5 = new IonChain().zigzagCriticalRatio(5);
  assert.ok(Math.abs(c2 - 1) < 1e-3, `N=2 crit ratio ${c2} ≠ 1`);
  assert.ok(c5 > c2, 'more ions ⇒ stiffer radial confinement needed to stay linear');
}, () => `(ω_x/ω_z)_crit: N=2 → ${new IonChain().zigzagCriticalRatio(2).toFixed(4)},  N=5 → ${new IonChain().zigzagCriticalRatio(5).toFixed(4)}`);

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'ALL PASS' : 'FAILURES'}: ${passes} passed, ${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
