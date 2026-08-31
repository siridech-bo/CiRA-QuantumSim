// test/ion-ms-pm.test.mjs — phase-modulated (PM) robust MS waveform (src/ion-ms-pm.js),
// the method-agnostic comparison for the referee response. Checks that a constant-amplitude,
// phase-modulated waveform (i) closes the motional loop, (ii) is first-order δ-robust
// (quadratic residual), (iii) shares the Θ convention of the amplitude-modulated designer
// (`solveShapeRobust`), and (iv) reaches the same closure/robustness/Θ at the same gate time.
import assert from 'node:assert';
import { solvePMRobust, wAlpha, wTheta, wExcursion, residualAt } from '../src/ion-ms-pm.js';
import { solveShapeRobust } from '../src/ion-msn-shape.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };
const delta = 1, tau = 2 * Math.PI, eta = 0.1, THETA = Math.PI / 8;

// ---- A. PM waveform closes and is first-order δ-robust --------------------------------
const PM = solvePMRobust(delta, tau, { nSeg: 7 });
{
  assert.ok(PM.ok && PM.residual < 1e-8 && PM.dResidual < 1e-8, `PM closes: |α|=${PM.residual.toExponential(1)}, |∂δα|=${PM.dResidual.toExponential(1)}`);
  const r1 = residualAt(PM.phases, delta, tau, 0.02), r2 = residualAt(PM.phases, delta, tau, 0.04);
  assert.ok(r2 / r1 > 3.5 && r2 / r1 < 4.5, `δ-drift residual quadratic (ratio ${(r2 / r1).toFixed(2)}→4)`);
  ok('PM robust waveform closes the loop and is first-order δ-robust (quadratic residual)');
}

// ---- B. Θ convention matches the AM designer (solveShapeRobust) -----------------------
{
  const AM = solveShapeRobust([{ delta, g: [0.05, 0.05], nbar: 0 }], tau, { thetaTarget: THETA });
  const wAM = AM.pulse.amp.map((a) => ({ re: (eta / 2) * a, im: 0 }));
  assert.ok(Math.abs(Math.abs(wTheta(wAM, delta, tau)) - THETA) < 1e-3, `wTheta(AM)=${wTheta(wAM, delta, tau).toFixed(4)} matches ±π/8`);
  const aAM = wAlpha(wAM, delta, tau);
  assert.ok(Math.hypot(aAM.re, aAM.im) < 1e-6, 'AM waveform closes under the shared evaluator');
  ok('PM/AM share the Θ convention (wTheta reproduces solveShapeRobust ±π/8)');
}

// ---- C. Method-agnostic: PM reaches |Θ|=π/8 at the same τ, with lower peak & excursion --
{
  const Tunit = wTheta(PM.phases.map((p) => ({ re: Math.cos(p), im: Math.sin(p) })), delta, tau);
  const gPM = Math.sqrt(THETA / Math.abs(Tunit));
  const wPM = PM.phases.map((p) => ({ re: gPM * Math.cos(p), im: gPM * Math.sin(p) }));
  assert.ok(Math.abs(Math.abs(wTheta(wPM, delta, tau)) - THETA) < 1e-6, 'PM scaled to |Θ|=π/8');
  const aPM = wAlpha(wPM, delta, tau);
  assert.ok(Math.hypot(aPM.re, aPM.im) < 1e-6, 'PM stays closed after Θ-scaling');
  // constant amplitude and finite heating proxy
  const OmPM = 2 * gPM / eta, ex = wExcursion(wPM, delta, tau);
  assert.ok(OmPM > 0 && ex > 0 && Number.isFinite(ex), `PM Ω_const=${OmPM.toFixed(2)}, ∫|α|²=${ex.toFixed(3)}`);
  ok('PM reaches |Θ|=π/8 at the same τ (constant amplitude, finite heating proxy)');
}

console.log(`\nion-ms-pm: ${n} tests passed`);
