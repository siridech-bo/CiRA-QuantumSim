// =============================================================================
// ion-validation.js — theory predictions for the Experiment↔Theory validation page
// (ion-validation.html). Turns the paper's E1–E4 trade-off into fast, live functions
// an experimentalist can overlay their measured data against. The COHERENT parts are
// the exact 4×4 analytic gates (ion-gbc.js); the INCOHERENT part is a leading-order
// rate model calibrated to reproduce the paper's numerical E1–E3 map (labelled as such
// in the UI — it is not a live Lindblad run). No data is ever altered here.
// =============================================================================

import { msUnitary, gbcUnitary, gateFidelity, THETA_MS } from './ion-gbc.js';

// Gate time (single leg) in dimensionless units (δ≡1): τ = 2πK/δ.
export const gateTau = (delta = 1, K = 1) => 2 * Math.PI * K / delta;

// ---- Incoherent floor (leading-order rate model) ---------------------------------
// I_incoh(single) = kHeat·κ·τ·(2n̄+1) + kDeph·γφ·τ + Γ·τ.  kHeat is fixed so the model
// reproduces the E3 table (single incoherent ≈ 4.67κ at τ=2π, n̄=1): kHeat = 4.67/(2π·3).
// GBC pays exactly 4× (its 4τ). These are the SAME channels/scaling the paper integrates
// numerically; the rate model is their validated linear envelope.
export const K_HEAT = 4.67 / (2 * Math.PI * 3);   // ≈ 0.2478
export function incoherentSingle({ tau, kappa = 0, nbar = 1, gammaPhi = 0, Gamma = 0, kDeph = 1 }) {
  return K_HEAT * kappa * tau * (2 * nbar + 1) + kDeph * gammaPhi * tau + Gamma * tau;
}
export const incoherentGBC = (p) => 4 * incoherentSingle(p);

// ---- Coherent infidelity under asymmetric (center-line) error ε=Δω·τ (exact 4×4) --
export const coherentSingle = (eps) => 1 - gateFidelity(msUnitary(THETA_MS, eps));   // ∝ε²
export const coherentGBC = (eps) => 1 - gateFidelity(gbcUnitary(THETA_MS, eps));     // ∝ε⁴

// ---- Total (additive) infidelity vs Δω for single robust gate and GBC ------------
export function tradeoffCurve({ delta = 1, K = 1, kappa = 0, nbar = 1, gammaPhi = 0, Gamma = 0, deltaOmegas }) {
  const tau = gateTau(delta, K);
  const Is = incoherentSingle({ tau, kappa, nbar, gammaPhi, Gamma });
  const Ig = 4 * Is;
  return deltaOmegas.map((dw) => {
    const eps = dw * tau, cs = coherentSingle(eps), cg = coherentGBC(eps);
    return { deltaOmega: dw, single: cs + Is, gbc: cg + Ig, singleCoh: cs, gbcCoh: cg, Is, Ig };
  });
}

// ---- Crossover Δω^× where single-gate and GBC total infidelities cross ------------
// Below it the single robust gate wins (k*=0); above it, one GBC wins (k*=1). Returns
// null if they never cross in [0,max] (e.g. noise so high that GBC never pays off).
export function crossoverDeltaOmega({ delta = 1, K = 1, kappa = 0, nbar = 1, gammaPhi = 0, Gamma = 0, max = 0.4, N = 800 }) {
  const tau = gateTau(delta, K);
  const Is = incoherentSingle({ tau, kappa, nbar, gammaPhi, Gamma }), Ig = 4 * Is;
  const diff = (dw) => { const e = dw * tau; return (coherentSingle(e) + Is) - (coherentGBC(e) + Ig); };
  let prev = diff(0), prevDw = 0;   // at Δω=0, single (Is) < gbc (4Is) ⇒ diff<0
  for (let i = 1; i <= N; i++) {
    const dw = max * i / N, d = diff(dw);
    if (prev < 0 && d >= 0) { const t = prev / (prev - d); return prevDw + t * (dw - prevDw); }   // linear interp
    prev = d; prevDw = dw;
  }
  return null;
}

// Optimal robustness depth at a given operating point: 0 (single) or 1 (one GBC).
// (E4: nesting never helps; k*∈{0,1}.) Returns { kStar, single, gbc, verdict }.
export function recommend({ delta = 1, K = 1, deltaOmega, kappa = 0, nbar = 1, gammaPhi = 0, Gamma = 0 }) {
  const tau = gateTau(delta, K), eps = deltaOmega * tau;
  const Is = incoherentSingle({ tau, kappa, nbar, gammaPhi, Gamma });
  const single = coherentSingle(eps) + Is, gbc = coherentGBC(eps) + 4 * Is;
  const kStar = gbc < single ? 1 : 0;
  return { kStar, single, gbc, tau, eps, verdict: kStar === 1 ? 'Add one GBC' : 'Single robust gate' };
}

// ---- Physical-unit conversions (δ sets the frequency unit) -----------------------
// deltaHz: physical gate detuning δ/2π in Hz. Everything dimensionless × (2π·deltaHz).
export function toPhysical({ deltaHz }) {
  const w = 2 * Math.PI * deltaHz;                       // angular δ [rad/s]
  return {
    tauSeconds: (tauDimless) => tauDimless / w,          // τ[1/δ] → s
    freqHz: (dimless) => dimless * deltaHz,              // Δω[units δ] → Hz (ordinary)
    kappaFromNdot: (ndotPerSec) => ndotPerSec / w,       // ṅ[/s] → κ dimensionless
    ndotFromKappa: (kappa) => kappa * w,                 // κ → ṅ[/s]
    gammaFromT2: (T2sec) => 1 / (T2sec * w),             // T2[s] → γφ dimensionless
  };
}
