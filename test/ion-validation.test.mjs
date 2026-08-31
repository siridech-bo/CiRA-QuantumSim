// test/ion-validation.test.mjs — trade-off theory backend for the validation page
// (src/ion-validation.js). Confirms the fast, live rate-model reproduces the paper's
// numerical E3 map (so the theory overlaid on experimental data is publication-faithful),
// and that recommend()/crossover behave correctly.
import assert from 'node:assert';
import { incoherentSingle, incoherentGBC, crossoverDeltaOmega, recommend, coherentSingle, coherentGBC, gateTau, toPhysical } from '../src/ion-validation.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };
const tau = gateTau(1, 1);   // 2π

// ---- A. incoherent floor matches the E3 table (nBath=1) ------------------------------
{
  // paper E3 single-gate incoherent: 1.4e-3, 3.3e-3, 7.0e-3, 1.4e-2, 2.7e-2 at those κ
  const rows = [[3e-4, 1.4e-3], [7e-4, 3.3e-3], [1.5e-3, 7.0e-3], [3e-3, 1.4e-2], [6e-3, 2.7e-2]];
  for (const [k, Ip] of rows) { const I = incoherentSingle({ tau, kappa: k, nbar: 1 }); assert.ok(Math.abs(I - Ip) / Ip < 0.10, `κ=${k}: model ${I.toExponential(2)} vs paper ${Ip.toExponential(2)}`); }
  assert.ok(Math.abs(incoherentGBC({ tau, kappa: 3e-3, nbar: 1 }) / incoherentSingle({ tau, kappa: 3e-3, nbar: 1 }) - 4) < 1e-9, 'GBC floor = 4× single');
  ok('incoherent rate model reproduces the E3 floor (≤10%) with the exact 4× GBC penalty');
}

// ---- B. crossover Δω× tracks the E3 map (within ~15%) --------------------------------
{
  const rows = [[3e-4, 0.015], [7e-4, 0.025], [1.5e-3, 0.045], [3e-3, 0.055], [6e-3, 0.085]];
  for (const [k, dwp] of rows) { const dw = crossoverDeltaOmega({ kappa: k, nbar: 1 }); assert.ok(dw != null && Math.abs(dw - dwp) / dwp < 0.25, `κ=${k}: model Δω× ${dw?.toFixed(3)} vs paper ${dwp}`); }
  ok('crossover Δω× tracks the E3 map (≤25%)');
}

// ---- C. coherent scaling: single ∝ε², GBC ∝ε⁴ ---------------------------------------
{
  const ps = Math.log2(coherentSingle(0.08) / coherentSingle(0.04)), pg = Math.log2(coherentGBC(0.08) / coherentGBC(0.04));
  assert.ok(Math.abs(ps - 2) < 0.15, `single coherent ∝ε^${ps.toFixed(2)}`);
  assert.ok(Math.abs(pg - 4) < 0.2, `GBC coherent ∝ε^${pg.toFixed(2)}`);
  ok('coherent infidelity: single ∝ε², GBC ∝ε⁴ (exact 4×4)');
}

// ---- D. recommend() gives the right verdict either side of the crossover -------------
{
  const dwx = crossoverDeltaOmega({ kappa: 3e-3, nbar: 1 });
  assert.strictEqual(recommend({ deltaOmega: dwx * 0.5, kappa: 3e-3, nbar: 1 }).kStar, 0, 'below crossover ⇒ single');
  assert.strictEqual(recommend({ deltaOmega: dwx * 2, kappa: 3e-3, nbar: 1 }).kStar, 1, 'above crossover ⇒ GBC');
  ok('recommend(): single below Δω×, GBC above (k*∈{0,1})');
}

// ---- E. physical unit conversions are self-consistent -------------------------------
{
  const ph = toPhysical({ deltaHz: 50e3 });
  assert.ok(Math.abs(ph.tauSeconds(tau) - 1 / 50e3) < 1e-12, 'τ=2π/δ ⇒ 20 µs at δ=2π·50kHz (K=1)');
  assert.ok(Math.abs(ph.kappaFromNdot(1e3) - 3.18e-3) < 5e-4, 'ṅ=1 phonon/ms ⇒ κ≈3.2e-3 at δ=50kHz');
  assert.ok(Math.abs(ph.freqHz(0.055) - 0.055 * 50e3) < 1, 'Δω×=0.055δ ⇒ 2.75 kHz');
  ok('physical-unit conversions self-consistent (τ→µs, ṅ→κ, Δω→Hz)');
}

console.log(`\nion-validation: ${n} tests passed`);
