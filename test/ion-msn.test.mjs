// =============================================================================
// ion-msn.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/ion-msn.test.mjs        (or: npm test)
//
// Validates the ANALYTIC multi-mode Mølmer–Sørensen gate verifier (src/ion-msn.js).
// The headline check cross-validates the analytic Bell fidelity against the
// INDEPENDENT Lindblad integrator MSGate (src/ion-ms.js) at n̄=0 — two unrelated
// methods must agree on the closure, phase-error, and non-closure paths.
//
// Also asserts the physics that makes the verifier useful:
//   • loop closure ⇒ F=1 and Θ=π/8 (maximally entangling),
//   • MS temperature-insensitivity: F=1 at closure for ANY n̄ (the signature),
//   • off-closure ⇒ residual motion ⇒ F<1, and warm motion amplifies it,
//   • drive error ⇒ closed loops but wrong phase (coherent error, attributed),
//   • a spectator mode (2-ion stretch) shows up as per-mode residual-motion error.
// =============================================================================

import assert from 'node:assert';
import { MSGate } from '../src/ion-ms.js';
import { IonChain } from '../src/ion-modes.js';
import {
  THETA_MS, bellFidelity, accumulatedTheta, closureResiduals, report,
  closurePoint, symMode, twoIonAxial, chainModes, chainClosureCOM,
} from '../src/ion-msn.js';

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// 1. Ideal gate at loop closure (motional ground): F=1, Θ=π/8, loop closed.
// ---------------------------------------------------------------------------
{
  const { tau, etaOmega } = closurePoint(1, 1);            // δ=1, K=1 ⇒ τ=2π, ηΩ=0.5
  const modes = [symMode(1, etaOmega, 0)];
  const r = report(modes, tau);
  check('closure: F=1', near(r.fidelity, 1, 1e-9), `F=${r.fidelity.toFixed(12)}`);
  check('closure: Θ=π/8', near(r.theta, THETA_MS, 1e-12), `Θ=${r.theta.toFixed(10)}`);
  check('closure: loop closed', r.closure[0].closed, `|α|=${r.closure[0].residual.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
// 2. MS temperature-insensitivity: at closure F=1 for ANY n̄ (the signature).
// ---------------------------------------------------------------------------
{
  const { tau, etaOmega } = closurePoint(1, 1);
  const Fhot = bellFidelity([symMode(1, etaOmega, 8)], tau);   // n̄=8
  check('closure is temperature-insensitive (n̄=8 ⇒ F=1)', near(Fhot, 1, 1e-9), `F=${Fhot.toFixed(12)}`);
}

// ---------------------------------------------------------------------------
// 3. Off-closure time ⇒ residual motion ⇒ F<1, and warm motion amplifies it.
// ---------------------------------------------------------------------------
{
  const { etaOmega } = closurePoint(1, 1);
  const tOff = 0.9 * 2 * Math.PI;                              // loop not yet closed
  const Fcold = bellFidelity([symMode(1, etaOmega, 0)], tOff);
  const Fwarm = bellFidelity([symMode(1, etaOmega, 5)], tOff);
  const res = closureResiduals([symMode(1, etaOmega, 0)], tOff)[0];
  check('off-closure: loop open', !res.closed && res.residual > 0.01, `|α|=${res.residual.toFixed(3)}`);
  check('off-closure: F<1', Fcold < 0.999, `F=${Fcold.toFixed(4)}`);
  check('warm motion amplifies infidelity', Fwarm < Fcold - 1e-4, `F(n̄=0)=${Fcold.toFixed(4)} > F(n̄=5)=${Fwarm.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// 4. Drive error at the closure TIME: loop still closes (δτ=2π) but Θ≠π/8 ⇒
//    a purely COHERENT phase error — attribution must blame phase, not decoherence.
// ---------------------------------------------------------------------------
{
  const tau = 2 * Math.PI;
  const modes = [symMode(1, 0.6, 0)];                          // ηΩ=0.6 ≠ 0.5
  const r = report(modes, tau);
  check('drive error: loop still closed', r.closure[0].closed, `|α|=${r.closure[0].residual.toExponential(2)}`);
  check('drive error: Θ over-rotated', r.theta > THETA_MS + 1e-3, `Θ=${r.theta.toFixed(4)} > π/8`);
  check('drive error: F<1', r.fidelity < 0.99, `F=${r.fidelity.toFixed(4)}`);
  check('drive error attributed to phase, not decoherence',
    r.attribution.phase > 10 * r.attribution.decoherence.total,
    `phase=${r.attribution.phase.toFixed(4)} ≫ decoh=${r.attribution.decoherence.total.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
// 5. CROSS-CHECK vs the independent Lindblad integrator MSGate (n̄=0).
//    Three paths: (A) closure, (B) drive/phase error, (C) time/non-closure.
// ---------------------------------------------------------------------------
{
  const eta = 0.1, N = 26;
  // (A) closure
  const gA = new MSGate({ N_FOCK: N, eta, delta: 1, K: 1 });   // matchClosure default
  gA.runGate();                                                // t = τ_g = 2π
  const FnumA = gA.bellFidelity();
  const FanaA = bellFidelity([symMode(1, eta * gA.Omega, 0)], gA.gateTime());
  check('cross-check A (closure): both ≈1', FnumA > 0.999 && FanaA > 0.999, `num=${FnumA.toFixed(5)} ana=${FanaA.toFixed(5)}`);
  check('cross-check A: analytic ≈ numeric', near(FanaA, FnumA, 3e-3), `|Δ|=${Math.abs(FanaA - FnumA).toExponential(2)}`);

  // (B) drive error (ηΩ=0.6): closed loop, over-rotation
  const gB = new MSGate({ N_FOCK: N, eta, delta: 1, K: 1, matchClosure: false, Omega: 0.6 / eta });
  gB.runGate(2 * Math.PI);
  const FnumB = gB.bellFidelity();
  const FanaB = bellFidelity([symMode(1, 0.6, 0)], 2 * Math.PI);
  check('cross-check B (drive error): both <1', FnumB < 0.99 && FanaB < 0.99, `num=${FnumB.toFixed(4)} ana=${FanaB.toFixed(4)}`);
  check('cross-check B: analytic ≈ numeric', near(FanaB, FnumB, 6e-3), `|Δ|=${Math.abs(FanaB - FnumB).toExponential(2)}`);

  // (C) non-closure (run to 0.9 τ_g): residual motion
  const gC = new MSGate({ N_FOCK: N, eta, delta: 1, K: 1 });
  gC.runGate(0.9 * 2 * Math.PI);
  const FnumC = gC.bellFidelity();
  const FanaC = bellFidelity([symMode(1, eta * gC.Omega, 0)], 0.9 * 2 * Math.PI);
  check('cross-check C (non-closure): both <1', FnumC < 0.999 && FanaC < 0.999, `num=${FnumC.toFixed(4)} ana=${FanaC.toFixed(4)}`);
  check('cross-check C: analytic ≈ numeric', near(FanaC, FnumC, 6e-3), `|Δ|=${Math.abs(FanaC - FnumC).toExponential(2)}`);
}

// ---------------------------------------------------------------------------
// 6. Multi-mode: 2-ion axial pair (COM + stretch). Park the drive at COM closure;
//    the stretch mode is a spectator ⇒ per-mode residual-motion error, and the
//    verifier attributes the infidelity to stretch, not COM.
// ---------------------------------------------------------------------------
{
  const eta = 0.1, dCOM = 0.3, mu = 1 + dCOM;                  // δ_COM=0.3
  const etaCOM = eta * Math.SQRT1_2;
  const Omega = (dCOM / 4) * 2 / etaCOM;                       // COM loop closure (Θ_COM=π/8)
  const modes = twoIonAxial(eta, Omega, mu, {});              // [COM, stretch]
  const tau = 2 * Math.PI / dCOM;                             // COM K=1 closure time
  const r = report(modes, tau);

  check('multi-mode: COM loop closed', r.closure[0].closed, `|α_COM|=${r.closure[0].residual.toExponential(2)}`);
  check('multi-mode: stretch loop OPEN', !r.closure[1].closed, `|α_str|=${r.closure[1].residual.toFixed(3)}`);
  check('multi-mode: spectator drags F below 1', r.fidelity < 0.999 && r.fidelity > 0.5, `F=${r.fidelity.toFixed(4)}`);

  const Fcom = bellFidelity(modes, tau, { only: 'decoh', modeMask: [true, false] });
  const Ffull = bellFidelity(modes, tau, { only: 'decoh' });
  check('multi-mode: dropping stretch recovers F', Fcom > Ffull + 1e-3, `F(COM only)=${Fcom.toFixed(4)} > F(both)=${Ffull.toFixed(4)}`);
  check('multi-mode: error attributed to stretch, not COM',
    r.attribution.decoherence.perMode[1].infidelity > r.attribution.decoherence.perMode[0].infidelity + 1e-6 &&
    r.attribution.decoherence.perMode[0].infidelity < 1e-6,
    `str=${r.attribution.decoherence.perMode[1].infidelity.toFixed(4)}, COM=${r.attribution.decoherence.perMode[0].infidelity.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
// 7. Chain wiring: chainModes fed from the REAL IonChain(N=2) mode solver must
//    reproduce the hand-built (independently validated) twoIonAxial case.
// ---------------------------------------------------------------------------
{
  const eta0 = 0.1;
  const op = chainClosureCOM(2, { eta0, deltaCOM: 0.3, K: 1 });
  const spec = new IonChain({ N: 2 }).modes(2).modes;         // [COM(freq 1), stretch(freq √3)]
  const mChain = chainModes(spec, [0, 1], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 0 });
  const mHand = twoIonAxial(eta0, op.Omega, op.muDrive, {});
  const Fc = report(mChain, op.tau).fidelity, Fh = report(mHand, op.tau).fidelity;
  check('chain wiring: IonChain(2) reproduces twoIonAxial', near(Fc, Fh, 1e-6),
    `F(chain)=${Fc.toFixed(6)}  F(hand)=${Fh.toFixed(6)}  |Δ|=${Math.abs(Fc - Fh).toExponential(2)}`);
  check('chain wiring: modes = 2 (COM + stretch)', mChain.length === 2 && Math.abs(spec[0].freq - 1) < 1e-9,
    `freqs=[${spec.map((m) => m.freq.toFixed(4)).join(', ')}]`);
}

// ---------------------------------------------------------------------------
// 8. REAL 4-ion chain: MS gate on ions 1&3 via the COM mode. COM closes cleanly
//    (Θ=π/8); the other 3 axial modes are spectators ⇒ residual-motion error the
//    verifier attributes per mode. This is the "verify at 2–4 ions" capability.
// ---------------------------------------------------------------------------
{
  const eta0 = 0.05;
  const op = chainClosureCOM(4, { eta0, deltaCOM: 0.2, K: 1 });
  const spec = new IonChain({ N: 4 }).modes(4).modes;         // 4 axial modes, COM first
  const modes = chainModes(spec, [0, 2], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 0 });
  const r = report(modes, op.tau);

  check('4-ion: 4 axial modes, COM freq=1', modes.length === 4 && Math.abs(spec[0].freq - 1) < 1e-9,
    `freqs=[${spec.map((m) => m.freq.toFixed(3)).join(', ')}]`);
  // COM loop closes cleanly; total Θ is pulled OFF π/8 by the (unclosed) spectator
  // modes' own phase — the verifier correctly surfaces spectator phase, not just decoherence.
  check('4-ion: COM loop closes cleanly', r.closure[0].closed,
    `|α_COM|=${r.closure[0].residual.toExponential(2)}`);
  check('4-ion: spectators shift total Θ off π/8', Math.abs(r.phaseError) > 1e-3,
    `Θ_total=${r.theta.toFixed(5)} vs π/8=${THETA_MS.toFixed(5)} (Δ=${r.phaseError.toFixed(4)})`);
  check('4-ion: spectator modes open ⇒ F<1', r.closure.slice(1).some((c) => !c.closed) && r.fidelity < 0.999,
    `F=${r.fidelity.toFixed(4)}, open spectators=${r.closure.slice(1).filter((c) => !c.closed).length}`);
  check('4-ion: infidelity attributed to a spectator, not COM',
    r.attribution.decoherence.perMode[0].infidelity < 1e-6 &&
    Math.max(...r.attribution.decoherence.perMode.slice(1).map((m) => m.infidelity)) > r.attribution.decoherence.perMode[0].infidelity,
    `COM=${r.attribution.decoherence.perMode[0].infidelity.toExponential(2)}, max spectator=${Math.max(...r.attribution.decoherence.perMode.slice(1).map((m) => m.infidelity)).toFixed(4)}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
