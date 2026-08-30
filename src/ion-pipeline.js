// =============================================================================
// ion-pipeline.js — U4 driver: design → open-system verify → sweep. Runs a single
// MS gate and the full GBC sequence through the Lindblad integrator (ion-ms.js) so
// the coherent ε⁴ advantage of GBC competes with its ~4× incoherent gate-time cost.
// Generates the coherent–incoherent trade-off data (E1–E5) of the manuscript.
//
// GBC sequence (Zhang25 Sec. III.C):  U_ε(Θ) · [Π U_{2ε}(−Θ) Π] · U_ε(Θ).
//   - each U_ε is a physical MS gate of duration τ (with the ambient Δω + noise);
//   - the middle leg realizes −Θ over 2τ by tuning to δ_mid = −δ/2 (so τ_g=2τ and, at
//     closure, Θ=−π/4 — the sign follows sin[δ(t₁−t₂)]); it thereby accrues 2ε of σz
//     error, and the two ideal Π=σx⊗σx gates flip that error sign (ΠEΠ=−E).
//   - total sequence time ≈ 4τ ⇒ ~4× the incoherent accumulation of a single gate.
// Single-mode (2 qubits ⊗ 1 shared mode), the canonical MS test.
// =============================================================================

import { MSGate } from './ion-ms.js';
import { gbcUnitary, gateFidelity } from './ion-gbc.js';

// Coherent GBC infidelity (the ε⁴-suppressed asymmetric-error residual) from the
// validated U2 4×4 gate. GBC needs β_m=0 (robust waveform) to reach ε⁴; a constant
// single-mode drive has ∫α dt≠0 ⇒ β≠0, so we take the coherent part analytically
// (U2) and the incoherent part from the numerically-integrated 4τ sequence at Δω=0.
// The two are combined additively (leading order) — see manuscript scope note.
const coherentGBC = (deltaOmega, tau) => 1 - gateFidelity(gbcUnitary(Math.PI / 4, deltaOmega * tau));

// One MS-gate leg: build at closure (Θ=±π/4 over its own τ_g), evolve from rhoInit
// (or |gg,0⟩), return the engine. δ<0 gives −Θ; its τ_g=2πK/|δ|.
function runLeg({ N = 18, eta = 0.1, delta = 1, K = 1, deltaOmega = 0, kappa = 0, nBath = 0, gammaPhi = 0, thetaSign = 1 }, rhoInit) {
  const sys = new MSGate({
    N_FOCK: N, eta, delta, K, matchClosure: true, deltaOmega, thetaSign,
    heatOn: kappa > 0, kappa, nBath, dephaseOn: gammaPhi > 0, gammaPhi,
  });
  if (rhoInit) sys.setRho(rhoInit); else sys.reset();
  const dt = sys.gateTime() / 120;
  for (let i = 0; i < 120; i++) sys.step(dt);
  return sys;
}

// Single robust/uncompensated MS gate (duration τ): infidelity under Δω + noise.
// (For the σz asymmetric error, the symmetric-robust and non-robust waveforms coincide,
//  so this one leg is the "no-GBC" baseline.)
export function singleGateInfidelity(cfg) {
  return 1 - runLeg(cfg, null).bellFidelity();
}

// Full GBC sequence (≈4τ): infidelity under Δω + noise.
export function gbcInfidelity(cfg) {
  const leg1 = runLeg(cfg, null);                              // U_ε(+Θ), τ
  leg1.applyPiX();                                             // Π
  // middle: −Θ over 2τ ⇒ δ_mid = δ/2 (τ_g=2τ, positive) with thetaSign=−1 (flip Θ sign).
  const leg2 = runLeg({ ...cfg, delta: cfg.delta / 2, thetaSign: -1 }, Float64Array.from(leg1.rhoM));
  leg2.applyPiX();                                             // Π
  const leg3 = runLeg(cfg, Float64Array.from(leg2.rhoM));      // U_ε(+Θ), τ
  return 1 - leg3.bellFidelity();
}

// The gate time of a single leg (τ) and the GBC total (~4τ) — for reporting the
// incoherent-cost ratio.
export function gateTimes(cfg) {
  const tau = 2 * Math.PI * (cfg.K || 1) / (cfg.delta || 1);
  return { single: tau, gbc: 4 * tau };
}

// ---- experiment sweeps (E1–E4) ----------------------------------------------

// E1 — incoherent baseline: infidelity vs a noise rate at Δω=0, single vs GBC.
//   noiseKey ∈ {'kappa','gammaPhi'}. Returns [{rate, single, gbc, ratio}].
export function E1_incoherentBaseline(base, noiseKey, rates) {
  return rates.map((rate) => {
    const cfg = { ...base, deltaOmega: 0, [noiseKey]: rate };
    const single = singleGateInfidelity(cfg), gbc = gbcInfidelity(cfg);
    return { rate, single, gbc, ratio: gbc / Math.max(single, 1e-15) };
  });
}

// E2 — the trade-off curve: net infidelity vs Δω at fixed noise, single vs GBC.
//   single  = fully numerical MS gate (its ε² coherent + 1τ incoherent, one run);
//   gbc     = coherentGBC(Δω) [analytic ε⁴, U2]  +  incoherent of the 4τ sequence
//             [numerical, gbcInfidelity at Δω=0]  (leading-order additive).
//   The crossover Δω× is where GBC's extra 4× incoherent cost stops being worth the
//   coherent gain. Returns the curves + the interpolated crossover.
export function E2_tradeoffCurve(base, deltaOmegas) {
  const tau = gateTimes(base).single;
  const incohGbc = gbcInfidelity({ ...base, deltaOmega: 0 });   // pure 4τ incoherent
  const pts = deltaOmegas.map((dw) => {
    const single = singleGateInfidelity({ ...base, deltaOmega: dw });
    const gbc = coherentGBC(dw, tau) + incohGbc;
    return { deltaOmega: dw, single, gbc, gbcBetter: gbc < single };
  });
  // crossover: smallest |Δω| where GBC becomes the better choice (single − gbc changes sign).
  let cross = null;
  const pos = pts.filter((p) => p.deltaOmega >= 0).sort((a, b) => a.deltaOmega - b.deltaOmega);
  for (let i = 1; i < pos.length; i++) if (!pos[i - 1].gbcBetter && pos[i].gbcBetter) { cross = 0.5 * (pos[i - 1].deltaOmega + pos[i].deltaOmega); break; }
  return { incohSingle: singleGateInfidelity({ ...base, deltaOmega: 0 }), incohGbc, crossover: cross, points: pts };
}

// E3 — trade-off map: for each noise rate, the crossover Δω× (region where GBC wins).
export function E3_tradeoffMap(base, noiseKey, rates, deltaOmegas) {
  return rates.map((rate) => {
    const r = E2_tradeoffCurve({ ...base, [noiseKey]: rate }, deltaOmegas);
    return { rate, crossover: r.crossover, incohSingle: r.incohSingle, incohGbc: r.incohGbc };
  });
}
