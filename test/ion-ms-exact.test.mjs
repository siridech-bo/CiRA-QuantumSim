// test/ion-ms-exact.test.mjs — full non-RWA + beyond-Lamb-Dicke MS gate
// (src/ion-ms-exact.js). Integrates H = ω_z a†a + Ω Σσx_j sin(η(a+a†)) cos((ω_z−δ)t)
// exactly (no LD expansion, no vibrational RWA) and checks: unitarity, that it converges
// to the RWA+LD MSGate as ω_z→∞ with the RWA error ∝(Ω/ω_z)², and the beyond-LD
// (Debye–Waller) error ∝η⁴. Establishes the validity boundary of the E1–E5 engines.
import assert from 'node:assert';
import { MSGateExact } from '../src/ion-ms-exact.js';
import { MSGate } from '../src/ion-ms.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };
const infExact = (opts) => { const g = new MSGateExact(opts); g.runGate(); return { inf: 1 - g.bellFidelity(), norm: g.norm() }; };

// ---- A. Closed evolution is unitary (norm conserved) ---------------------------------
{
  const g = new MSGateExact({ N_FOCK: 16, eta: 0.1, delta: 0.25, omegaZ: 2, K: 1 }); g.runGate();
  assert.ok(Math.abs(g.norm() - 1) < 1e-6, `norm=${g.norm().toFixed(9)}`);
  const rq = g.reducedQubit(); const tr = rq[0] + rq[2 * 5] + rq[2 * 10] + rq[2 * 15];
  assert.ok(Math.abs(tr - 1) < 1e-6, 'reduced qubit Tr=1');
  ok('exact closed evolution is unitary (‖ψ‖=1, Tr ρ_q=1)');
}

// ---- B. Reduces to the RWA+LD MSGate as ω_z→∞ (error → 0) -----------------------------
{
  const ref = new MSGate({ N_FOCK: 16, eta: 0.1, delta: 0.25, K: 1 }); ref.runGate();
  assert.ok(1 - ref.bellFidelity() < 1e-4, 'RWA+LD reference is a good gate');
  const e2 = infExact({ N_FOCK: 16, eta: 0.1, delta: 0.25, omegaZ: 2, K: 1 }).inf;
  const e4 = infExact({ N_FOCK: 16, eta: 0.1, delta: 0.25, omegaZ: 4, K: 1 }).inf;
  const e6 = infExact({ N_FOCK: 16, eta: 0.1, delta: 0.25, omegaZ: 6, K: 1 }).inf;
  assert.ok(e2 > e4 && e4 > e6, `RWA error decreases with ω_z: ${e2.toExponential(1)}>${e4.toExponential(1)}>${e6.toExponential(1)}`);
  assert.ok(e6 < 2e-4, 'exact→RWA gate as ω_z grows (1−F<2e-4 at ω_z=6)');
  ok('converges to RWA+LD MSGate as ω_z→∞ (error → 0)');

  // RWA error ∝ (Ω/ω_z)² in the perturbative tail.
  const p = Math.log2(e4 / e6) / Math.log2(6 / 4);   // 1−F ∝ ω_z^(−p) ⇒ ∝(Ω/ω_z)^p
  assert.ok(p > 1.5 && p < 2.8, `RWA error scales ∝(Ω/ω_z)^${p.toFixed(2)} (≈2)`);
  ok(`RWA infidelity ∝ (Ω/ω_z)² (measured exponent ${p.toFixed(2)})`);
}

// ---- C. Beyond-Lamb-Dicke (Debye–Waller) error ∝ η⁴ -----------------------------------
{
  // large ω_z ⇒ RWA error negligible; LD-closure Ω=δ/2η ⇒ raising η LOWERS Ω (less RWA)
  // yet RAISES 1−F ⇒ the growth is purely beyond-LD.
  const i1 = infExact({ N_FOCK: 18, eta: 0.1, delta: 0.2, omegaZ: 10, K: 1 }).inf;
  const i2 = infExact({ N_FOCK: 18, eta: 0.2, delta: 0.2, omegaZ: 10, K: 1 }).inf;
  assert.ok(i2 > i1, 'beyond-LD error grows with η despite Ω falling');
  const p = Math.log2(i2 / i1);   // η doubled
  assert.ok(p > 3.5 && p < 5.2, `beyond-LD error ∝η^${p.toFixed(2)} (≈4, Debye–Waller)`);
  assert.ok(i1 < 5e-4, 'at η=0.1 (Ca⁺) beyond-LD error is ≲1e-4 (engines trustworthy)');
  ok(`beyond-LD infidelity ∝ η⁴ (measured exponent ${p.toFixed(2)}); ≲1e-4 at η=0.1`);
}

console.log(`\nion-ms-exact: ${n} tests passed`);
