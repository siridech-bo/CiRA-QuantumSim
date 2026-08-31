// test/ion-jitter.test.mjs — timing-jitter sensitivity theory (src/ion-jitter.js),
// experiment #6 of the validation page. Checks: (i) the boundary-aware Bell fidelity
// reproduces the designed-pulse fidelity at zero jitter; (ii) independent per-boundary
// jitter degrades fidelity QUADRATICALLY in σ; (iii) a common/global timing skew is
// strongly suppressed relative to independent jitter (systematic offsets are benign);
// (iv) a single-segment (constant) waveform has no interior boundaries → jitter-immune.
import assert from 'node:assert';
import { twoIonAxial } from '../src/ion-msn.js';
import { solveShapeRobust } from '../src/ion-msn-shape.js';
import { jitterInfidelity, bellFidelityB, equalBounds, mulberry32 } from '../src/ion-jitter.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };
const modes = twoIonAxial(0.1, 3.0, 1.3, {}), tau = 2 * Math.PI;
const rob = solveShapeRobust(modes, tau), tt = rob.thetaTarget;
const inf = (s, seed = 2024, reps = 500) => jitterInfidelity(modes, rob.pulse, s, { realizations: reps, rng: mulberry32(seed), thetaTarget: tt });

// ---- A. zero-jitter reproduces the designed fidelity ---------------------------------
{
  assert.ok(rob.ok, 'robust pulse designed');
  const F0 = bellFidelityB(modes, rob.pulse.amp, equalBounds(rob.pulse.amp.length, tau), tt);
  assert.ok(Math.abs(F0 - rob.fidelity) < 1e-6, `boundary-aware F ${F0.toFixed(6)} = shaped F ${rob.fidelity.toFixed(6)}`);
  assert.ok(inf(0) < 1e-6, 'zero jitter ⇒ ~zero infidelity');
  ok('boundary-aware Bell fidelity matches the designed pulse at σ=0');
}

// ---- B. independent jitter infidelity ∝ σ² -------------------------------------------
{
  const i1 = inf(2e-3 * tau), i2 = inf(4e-3 * tau);
  const p = Math.log2(i2 / i1);
  assert.ok(p > 1.7 && p < 2.3, `independent jitter ∝ σ^${p.toFixed(2)} (≈2)`);
  ok(`independent per-boundary jitter degrades fidelity ∝ σ² (exponent ${p.toFixed(2)})`);
}

// ---- C. common global skew is strongly suppressed vs independent jitter --------------
{
  const s = 4e-3 * tau, amps = rob.pulse.amp, ns = amps.length, base = equalBounds(ns, tau);
  const rng = mulberry32(7); const g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let indep = 0, common = 0; const R = 500;
  for (let r = 0; r < R; r++) {
    const bi = base.slice(); for (let k = 1; k < ns; k++) bi[k] = base[k] + s * g(); bi.sort((x, y) => x - y); bi[0] = 0; bi[ns] = tau; indep += 1 - bellFidelityB(modes, amps, bi, tt);
    const d = s * g(), bc = base.map((b, k) => (k === 0 || k === ns) ? b : b + d); common += 1 - bellFidelityB(modes, amps, bc, tt);
  }
  indep /= R; common /= R;
  assert.ok(common < 0.2 * indep, `common skew ${common.toExponential(2)} ≪ independent ${indep.toExponential(2)}`);
  ok(`common/global timing skew is strongly suppressed (${(indep / common).toFixed(0)}× below independent jitter)`);
}

// ---- D. a single-segment (constant) waveform is timing-jitter-immune ------------------
{
  const constPulse = { tau, amp: [1] };   // one segment ⇒ no interior boundaries
  const a = jitterInfidelity(modes, constPulse, 0, { thetaTarget: tt });
  const b = jitterInfidelity(modes, constPulse, 8e-3 * tau, { realizations: 200, rng: mulberry32(1), thetaTarget: tt });
  assert.ok(Math.abs(a - b) < 1e-12, 'constant pulse infidelity unchanged by jitter');
  ok('single-segment (constant) waveform has no interior boundaries → jitter-immune');
}

console.log(`\nion-jitter: ${n} tests passed`);
