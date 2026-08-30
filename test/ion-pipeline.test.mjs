// =============================================================================
// ion-pipeline.test.mjs — U4 pipeline driver (src/ion-pipeline.js): design →
// open-system verify → sweep, producing the coherent–incoherent trade-off.
//
//   node test/ion-pipeline.test.mjs   (or: npm test)
//
// Validates the GBC-sequence construction (−Θ middle leg + Π sign flip gives the
// ideal gate at Δω=0), the ≈4× incoherent gate-time cost, and that a trade-off
// crossover Δω× exists. Uses a small N_Fock for speed.
// =============================================================================

import { singleGateInfidelity, gbcInfidelity, E1_incoherentBaseline, E2_tradeoffCurve } from '../src/ion-pipeline.js';

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

const base = { N: 16, eta: 0.1, delta: 1, K: 1, nBath: 1 };

// 1. GBC construction: at Δω=0 with no noise the 3-gate sequence is the ideal gate
//    (validates the −Θ middle leg via thetaSign + the Π sign flips).
{
  const g = gbcInfidelity({ ...base, deltaOmega: 0 });
  const s = singleGateInfidelity({ ...base, deltaOmega: 0 });
  check('GBC sequence is ideal at Δω=0 (no noise)', g < 1e-6 && s < 1e-6, `GBC 1−F=${g.toExponential(2)}, single 1−F=${s.toExponential(2)}`);
}

// 2. Incoherent cost: GBC (≈4τ) infidelity ≈ 4× the single gate (≈τ) at Δω=0.
{
  const row = E1_incoherentBaseline(base, 'kappa', [0.005])[0];
  check('GBC incoherent cost ≈ 4× single (its 4× gate time)', row.ratio > 3 && row.ratio < 4.5,
    `single=${row.single.toExponential(2)}, GBC=${row.gbc.toExponential(2)}, ratio=${row.ratio.toFixed(2)}`);
}

// 3. Trade-off: a crossover Δω× exists (single wins at Δω=0, GBC wins at large Δω).
{
  const dws = [0, 0.02, 0.04, 0.06, 0.08, 0.1];
  const r = E2_tradeoffCurve({ ...base, kappa: 0.0007, gammaPhi: 0 }, dws);
  const flips = r.points[0].single < r.points[0].gbc && r.points[r.points.length - 1].single > r.points[r.points.length - 1].gbc;
  check('trade-off crossover Δω× exists (single→GBC as Δω grows)', r.crossover !== null && r.crossover > 0 && flips,
    `Δω×≈${r.crossover === null ? 'none' : r.crossover.toFixed(3)}; single∈[${r.points[0].single.toExponential(2)},${r.points[r.points.length - 1].single.toExponential(2)}], GBC≈${r.incohGbc.toExponential(2)}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
