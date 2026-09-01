// test/ion-smooth.test.mjs — the "smooth gate" (AESE) engine (src/ion-smooth.js),
// brought in for comparison/combination with GBC. Validates the semiclassical
// α(t)-trajectory picture: DESE closes at τ=2πK/δ; AESE (smooth δ-ramp) also closes
// and reaches θ_g=π/2; and — the marquee result — AESE suppresses spin-motion under a
// mode-frequency offset far better than DESE, with a low-ω filter-function advantage
// (reproducing Hughes et al., arXiv:2510.17286, Fig. 2).
import assert from 'node:assert';
import { smoothProtocol, constProtocol, integrateAlpha, residualUnderOffset, filterFunction, calibrateOmega,
  buildContext, residualPair, schemes, winner, crossoverDeltaOmega } from '../src/ion-smooth.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };

const dese0 = (Om) => constProtocol({ delta: 1, Omega: Om, K: 1, tauRamp: 0 });
const dese = dese0(calibrateOmega(dese0, 0.5));
const sm0 = (Om) => smoothProtocol({ deltaMax: 18, deltaMin: 1, tauD: 40, tauRamp: 3, tc: 0, Omega: Om });
const sm = sm0(calibrateOmega(sm0, 0.5));

// ---- A. DESE closes at τ=2πK/δ with θ_g=π/2 ------------------------------------------
{
  const r = integrateAlpha(dese);
  assert.ok(Math.abs(dese.tau - 2 * Math.PI) < 1e-6, 'DESE τ=2π (K=1,δ=1)');
  assert.ok(r.residual < 1e-6, `DESE closes: |α(τ)|=${r.residual.toExponential(1)}`);
  assert.ok(Math.abs(r.theta - Math.PI / 2) < 1e-3, `θ_g=π/2 (got ${r.theta.toFixed(4)})`);
  ok('DESE (constant δ) closes at τ=2πK/δ, θ_g calibrated to π/2');
}

// ---- B. AESE (smooth) closes and reaches θ_g=π/2 over a long adiabatic gate ----------
{
  const r = integrateAlpha(sm);
  assert.ok(r.residual < 2e-3, `AESE closes: |α(τ)|=${r.residual.toExponential(1)}`);
  assert.ok(Math.abs(r.theta - Math.PI / 2) < 1e-3, 'AESE θ_g=π/2');
  assert.ok(sm.tau > 5 * dese.tau, `AESE gate is long (adiabatic): τ_s=${sm.tau.toFixed(0)} ≫ τ_DESE=${dese.tau.toFixed(1)}`);
  ok('AESE (smooth δ-ramp) closes with θ_g=π/2 over a long adiabatic gate');
}

// ---- C. AESE suppresses spin-motion under a static mode-frequency offset -------------
{
  const dd = 0.02, rD = residualUnderOffset(dese, dd), rS = residualUnderOffset(sm, dd);
  assert.ok(rS < rD / 100, `AESE residual ${rS.toExponential(2)} ≪ DESE ${rD.toExponential(2)} under Δδ=${dd}`);
  // and AESE residual is ~flat vs offset (robustness), DESE grows
  const rD2 = residualUnderOffset(dese, 2 * dd), rS2 = residualUnderOffset(sm, 2 * dd);
  assert.ok(rD2 / rD > 1.5, 'DESE residual grows with offset');
  assert.ok(rS2 / rS < 1.3, 'AESE residual ~flat with offset (adiabatic robustness)');
  ok(`AESE suppresses mode-frequency-offset spin-motion by ≥100× (${(rD / rS).toFixed(0)}×) and stays flat`);
}

// ---- D. AESE filter function ≪ DESE at low frequency ---------------------------------
{
  const w = 0.05, fD = filterFunction(dese, w), fS = filterFunction(sm, w);
  assert.ok(fS < fD / 100, `AESE F(ω=${w})=${fS.toExponential(2)} ≪ DESE ${fD.toExponential(2)}`);
  ok(`AESE filter function suppressed vs DESE at low ω (${(fD / fS).toExponential(1)}×) — Hughes et al. Fig. 2`);
}

// ---- E. smooth × GBC combination: complementary axes + a real threshold -------------
{
  const ctx = buildContext({});
  assert.ok(ctx.tauS > 10 * ctx.tauP, 'smooth gate is long (asymmetric-fragile)');
  const noise = { kappa: 1e-4, gammaPhi: 1e-4, nbar: 3 };
  // (a) high symmetric error, low asymmetric ⇒ smooth (not plain, not GBC)
  const rHi = residualPair(ctx, 0.04);
  const wSym = winner(schemes(ctx, rHi, { ...noise, deltaOmega: 0 }));
  assert.strictEqual(wSym, 'smooth', `high Δδ, Δω=0 ⇒ smooth (got ${wSym})`);
  // (b) high symmetric AND high asymmetric ⇒ smooth+GBC (need both)
  const wBoth = winner(schemes(ctx, rHi, { ...noise, deltaOmega: 0.006 }));
  assert.strictEqual(wBoth, 'smoothGbc', `high Δδ & Δω ⇒ smooth+GBC (got ${wBoth})`);
  // (c) low symmetric error ⇒ smooth never wins (its long-gate floor isn't worth it)
  const rLo = residualPair(ctx, 0);
  const wLo = winner(schemes(ctx, rLo, { ...noise, deltaOmega: 0.002 }));
  assert.ok(wLo === 'plain' || wLo === 'gbc', `low Δδ ⇒ plain/gbc, not smooth (got ${wLo})`);
  // (d) THE threshold: on the smooth gate, GBC starts paying at a finite Δω×
  const dwx = crossoverDeltaOmega(ctx, residualPair(ctx, 0.02), noise, 'smooth', 'smoothGbc');
  assert.ok(dwx != null && dwx > 0, `smooth→smooth+GBC threshold exists: Δω×=${dwx?.toExponential(2)}`);
  ok(`smooth×GBC: complementary axes (smooth↔symmetric, GBC↔asymmetric); combining threshold Δω×≈${dwx.toExponential(2)}`);
}

console.log(`\nion-smooth: ${n} tests passed`);
