// =============================================================================
// ion-msn-shape.test.mjs — shaped-pulse MS gate DESIGN (src/ion-msn-shape.js).
//
//   node test/ion-msn-shape.test.mjs   (or: npm test)
//
// Validates the shaped-pulse evaluators by REDUCTION to the constant-drive kernel
// (ion-msn.js, itself cross-checked to 1e-9 vs the Lindblad integrator): a 1-segment
// and a 3-equal-segment "shaped" pulse must reproduce the constant-drive Bell
// fidelity exactly — this exercises the segment envelope AND the quadratic phase
// form (incl. the cross-segment W_nm terms). Then the headline: solveShape designs
// a Ω(t) that closes ALL modes and recovers fidelity where a constant drive can't.
// =============================================================================

import { IonChain } from '../src/ion-modes.js';
import { bellFidelity, chainModes, chainClosureCOM, symMode, twoIonAxial, closurePoint } from '../src/ion-msn.js';
import { shapedBellFidelity, shapedResiduals, shapedThetaEnt, solveShape, solveShapeRobust, envelope } from '../src/ion-msn-shape.js';

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const THETA_MS = Math.PI / 8;

// ---------------------------------------------------------------------------
// 1. Reduction: a shaped pulse of equal segments = the constant drive.
//    Ties the shaped evaluators to the 1e-9-validated constant kernel.
// ---------------------------------------------------------------------------
{
  const { tau } = closurePoint(1, 1);
  const modes = twoIonAxial(0.1, 3.0, 1.3, {});               // 2 modes, generic (off-closure)
  const Fconst = bellFidelity(modes, tau);
  const F1 = shapedBellFidelity(modes, { tau, amp: [1] });
  const F3 = shapedBellFidelity(modes, { tau, amp: [1, 1, 1] });
  check('shaped 1-seg = constant drive', near(F1, Fconst, 1e-12), `|Δ|=${Math.abs(F1 - Fconst).toExponential(2)}`);
  check('shaped 3-seg (equal) = constant drive (validates W_nm cross terms)', near(F3, Fconst, 1e-12),
    `F3=${F3.toFixed(10)} vs ${Fconst.toFixed(10)}`);
}

// ---------------------------------------------------------------------------
// 2. HEADLINE — 4-ion chain: constant drive leaves spectators open (F<0.96);
//    solveShape designs a Ω(t) that closes ALL modes ⇒ F ≈ 1.
// ---------------------------------------------------------------------------
{
  const eta0 = 0.05;
  const op = chainClosureCOM(4, { eta0, deltaCOM: 0.2, K: 1 });
  const spec = new IonChain({ N: 4 }).modes(4).modes;
  const modes = chainModes(spec, [0, 2], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 0 });
  const Fconst = bellFidelity(modes, op.tau);

  const sol = solveShape(modes, op.tau);
  check('4-ion: constant drive is imperfect (baseline)', Fconst < 0.96, `F_const=${Fconst.toFixed(4)}`);
  check('4-ion: solveShape succeeded (nSeg=2M+1=9)', sol.ok && sol.nSeg === 9, sol.ok ? `nSeg=${sol.nSeg}` : sol.reason);
  const maxRes = Math.max(...sol.residuals.map((r) => r.residual));
  check('4-ion: shaped pulse closes ALL modes', sol.residuals.every((r) => r.closed) && maxRes < 1e-6,
    `max residual=${maxRes.toExponential(2)}`);
  check('4-ion: shaped |Θ_ent| = π/8', near(Math.abs(sol.thetaEnt), THETA_MS, 1e-9),
    `Θ_ent=${sol.thetaEnt.toFixed(8)} (sign ${sol.sign > 0 ? '+' : '−'} ⇒ ${sol.sign > 0 ? 'MS' : 'conjugate-MS'})`);
  check('4-ion: shaping recovers fidelity (F: const → shaped)', sol.fidelity > 0.9999,
    `F ${Fconst.toFixed(4)} → ${sol.fidelity.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
// 3. 2-ion axial (COM + stretch): a stretch spectator makes constant drive leak;
//    solveShape closes both ⇒ F ≈ 1.
// ---------------------------------------------------------------------------
{
  const modes = twoIonAxial(0.1, 3.0, 1.3, {});               // δ_COM=0.3, δ_str=1.3−√3
  const tau = 2 * Math.PI / (1.3 - 1);                         // COM-ish gate time
  const sol = solveShape(modes, tau);
  check('2-ion: solveShape closes both modes', sol.ok && sol.residuals.every((r) => r.closed),
    sol.ok ? `residuals=[${sol.residuals.map((r) => r.residual.toExponential(1)).join(', ')}]` : sol.reason);
  check('2-ion: shaped fidelity ≈ 1', sol.ok && sol.fidelity > 0.9999, sol.ok ? `F=${sol.fidelity.toFixed(6)}` : '—');
}

// ---------------------------------------------------------------------------
// 4. Temperature robustness: closing the loops makes the shaped gate insensitive
//    to n̄ (residuals=0 ⇒ decoherence factor=1 regardless of temperature).
// ---------------------------------------------------------------------------
{
  const eta0 = 0.05;
  const op = chainClosureCOM(4, { eta0, deltaCOM: 0.2, K: 1 });
  const spec = new IonChain({ N: 4 }).modes(4).modes;
  const modesCold = chainModes(spec, [0, 2], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 0 });
  const sol = solveShape(modesCold, op.tau);
  // re-evaluate the SAME pulse against a warm chain (n̄=6 per mode)
  const modesWarm = chainModes(spec, [0, 2], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 6 });
  const Fwarm = shapedBellFidelity(modesWarm, sol.pulse, { thetaTarget: sol.thetaTarget });
  check('4-ion: shaped gate is temperature-insensitive (n̄=6 ⇒ F≈1)', Fwarm > 0.9999, `F(n̄=6)=${Fwarm.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
// 5. U1 — Appendix-C ROBUST designer (solveShapeRobust): palindromic + zero
//    time-averaged displacement ⇒ closure AND first-order δ-drift insensitivity.
// ---------------------------------------------------------------------------
{
  const modes = twoIonAxial(0.1, 3.0, 1.3, {});
  const tau = 2 * Math.PI / (1.3 - 1);
  const sR = solveShapeRobust(modes, tau);
  const sP = solveShape(modes, tau);

  check('robust: solves, closes all modes, |Θ|=π/8, F≈1', sR.ok
    && sR.residuals.every((r) => r.closed) && near(Math.abs(sR.thetaEnt), THETA_MS, 1e-9) && sR.fidelity > 0.9999,
    sR.ok ? `Θ=${sR.thetaEnt.toFixed(6)}, F=${sR.fidelity.toFixed(6)}, maxRes=${Math.max(...sR.residuals.map((r) => r.residual)).toExponential(1)}` : sR.reason);

  const amp = sR.pulse.amp;
  check('robust: pulse is palindromic (Ω(t)=Ω(τ−t))',
    amp.every((a, k) => Math.abs(a - amp[amp.length - 1 - k]) < 1e-9), `nSeg=${sR.nSeg}`);

  // symmetric-error robustness: evaluate the SAME pulse on modes with δ_m → δ_m+Δδ.
  const resAt = (pulse, dd) => Math.max(...shapedResiduals(modes.map((m) => ({ ...m, delta: m.delta + dd })), pulse).map((r) => r.residual));
  const rR = resAt(sR.pulse, 0.01), rP = resAt(sP.pulse, 0.01);
  check('robust: symmetric-drift residual ≪ non-robust', rR < 0.05 * rP, `robust=${rR.toExponential(2)} ≪ plain=${rP.toExponential(2)} (${(rP / rR).toFixed(0)}×)`);
  const qRobust = resAt(sR.pulse, 0.02) / rR, qPlain = resAt(sP.pulse, 0.02) / rP;
  check('robust: residual scales QUADRATICALLY in Δδ (first-order insensitive)', qRobust > 3.0 && qPlain < 2.5,
    `robust res(2Δ)/res(Δ)=${qRobust.toFixed(2)} (→4), plain=${qPlain.toFixed(2)} (→2)`);
}

// ---------------------------------------------------------------------------
// 6. U1 on a real 4-ion chain: closes all axial modes, F≈1.
// ---------------------------------------------------------------------------
{
  const eta0 = 0.05;
  const op = chainClosureCOM(4, { eta0, deltaCOM: 0.2, K: 1 });
  const spec = new IonChain({ N: 4 }).modes(4).modes;
  const modes = chainModes(spec, [0, 2], { eta0, Omega: op.Omega, muDrive: op.muDrive, nbar: 0 });
  const s = solveShapeRobust(modes, op.tau);
  check('robust 4-ion: closes all 4 modes, F≈1', s.ok && s.residuals.every((r) => r.closed) && s.fidelity > 0.9999,
    s.ok ? `F=${s.fidelity.toFixed(6)}, maxRes=${Math.max(...s.residuals.map((r) => r.residual)).toExponential(1)}` : s.reason);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
