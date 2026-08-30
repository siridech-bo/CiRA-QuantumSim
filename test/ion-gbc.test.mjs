// =============================================================================
// ion-gbc.test.mjs — asymmetric-error + GBC module (src/ion-gbc.js), U2 of the
// robust-MS-gate program. Reproduces the central result of Zhang et al.
// (arXiv:2501.02847): generator-based compensation turns the O(ε²) asymmetric-
// error infidelity into O(ε⁴), where ε=Δωτ.
//
//   node test/ion-gbc.test.mjs   (or: npm test)
// =============================================================================

import { msUnitary, gbcUnitary, gateFidelity, asymmetricSweep, THETA_MS } from '../src/ion-gbc.js';

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// unitarity: max |U†U − I|.
function unitarityErr(U) {
  let m = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let sr = 0, si = 0;
    for (let k = 0; k < 4; k++) { sr += U.re[k][i] * U.re[k][j] + U.im[k][i] * U.im[k][j]; si += U.re[k][i] * U.im[k][j] - U.im[k][i] * U.re[k][j]; }
    m = Math.max(m, Math.abs(sr - (i === j ? 1 : 0)), Math.abs(si));
  }
  return m;
}

// ---------------------------------------------------------------------------
// 1. No error (ε=0): both the bare and GBC gates are ideal.
// ---------------------------------------------------------------------------
{
  check('ε=0: uncompensated F=1', near(gateFidelity(msUnitary(THETA_MS, 0)), 1, 1e-12));
  check('ε=0: GBC F=1', near(gateFidelity(gbcUnitary(THETA_MS, 0)), 1, 1e-12));
}

// ---------------------------------------------------------------------------
// 2. The ideal gate is the canonical MS Bell gate: |00⟩ → (|00⟩+i|11⟩)/√2.
// ---------------------------------------------------------------------------
{
  const U = msUnitary(THETA_MS, 0);   // column 0 = U|00⟩
  const ok = near(U.re[0][0], Math.SQRT1_2, 1e-9) && near(U.im[0][0], 0, 1e-9)
    && near(U.re[3][0], 0, 1e-9) && near(U.im[3][0], Math.SQRT1_2, 1e-9)
    && near(U.re[1][0], 0, 1e-9) && near(U.re[2][0], 0, 1e-9);
  check('ideal gate: |00⟩ → (|00⟩ + i|11⟩)/√2', ok,
    `gg=${U.re[0][0].toFixed(3)}, ee=${U.im[3][0].toFixed(3)}i`);
}

// ---------------------------------------------------------------------------
// 3. Uncompensated asymmetric error: infidelity ∝ ε² (quadratic).
// ---------------------------------------------------------------------------
{
  const inf = (e) => 1 - gateFidelity(msUnitary(THETA_MS, e));
  const r = inf(0.08) / inf(0.04);
  check('uncompensated infidelity ∝ ε² (ratio→4 per doubling)', near(r, 4, 0.05),
    `inf(0.04)=${inf(0.04).toExponential(2)}, ratio=${r.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 4. HEADLINE — GBC suppresses the error to O(ε⁴): quartic scaling and a huge
//    reduction vs the uncompensated gate (reproduces Zhang et al. Fig. 5).
// ---------------------------------------------------------------------------
{
  const infG = (e) => 1 - gateFidelity(gbcUnitary(THETA_MS, e));
  const infU = (e) => 1 - gateFidelity(msUnitary(THETA_MS, e));
  const rG = infG(0.08) / infG(0.04);
  check('GBC infidelity ∝ ε⁴ (ratio→16 per doubling)', near(rG, 16, 0.5),
    `infG(0.04)=${infG(0.04).toExponential(2)}, ratio=${rG.toFixed(2)}`);
  check('GBC ≫ suppresses asymmetric error vs uncompensated', infG(0.05) < 1e-3 * infU(0.05),
    `1−F: GBC=${infG(0.05).toExponential(2)} ≪ uncomp=${infU(0.05).toExponential(2)} (${(infU(0.05) / infG(0.05)).toExponential(1)}×)`);
}

// ---------------------------------------------------------------------------
// 5. Unitarity of the composed GBC gate.
// ---------------------------------------------------------------------------
{
  check('GBC gate is unitary', unitarityErr(gbcUnitary(THETA_MS, 0.12)) < 1e-12,
    `|U†U−I|=${unitarityErr(gbcUnitary(THETA_MS, 0.12)).toExponential(1)}`);
}

// ---------------------------------------------------------------------------
// 6. Sweep API returns monotone-in-|Δω| infidelities with GBC below uncompensated.
// ---------------------------------------------------------------------------
{
  const s = asymmetricSweep([-0.2, -0.1, 0, 0.1, 0.2], 1.0);
  const mid = s.find((p) => p.deltaOmega === 0);
  check('sweep: at Δω=0 both infidelities ≈ 0', mid.uncompensated < 1e-12 && mid.gbc < 1e-12);
  check('sweep: GBC below uncompensated at every nonzero Δω',
    s.filter((p) => p.deltaOmega !== 0).every((p) => p.gbc < p.uncompensated),
    `Δω=0.2: gbc=${s[4].gbc.toExponential(2)} < unc=${s[4].uncompensated.toExponential(2)}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
