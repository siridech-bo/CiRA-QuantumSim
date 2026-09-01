// =============================================================================
// ion-smooth.js — the "smooth gate" (adiabatic elimination of spin-motion
// entanglement, AESE) of Hughes et al., arXiv:2510.17286, brought into the CiRA
// framework so it can be compared with — and combined with — GBC.
//
// Semiclassical picture (paper Sec. II, App. B): in the frame of their Eq. (1),
// H = δ(t) a†a + Ω(t) (a+a†) on the ±-forced spin sector, the spin-dependent
// displacement α(t) obeys a driven-oscillator ODE
//        α̇ = −i( δ(t) α + Ω(t) ).
// The gate is clean when α closes (α(τ)=0 ⇒ no residual spin-motion) and the
// forced states accumulate the geometric phase θ_g = ∫ Ω²/δ dt (their Eq. 14).
// DESE (diabatic): constant δ, fast Ω ramp, closure only at τ=2πK/δ. AESE (smooth):
// constant Ω, slow δ(t) ramp so the forced state adiabatically follows Ω/δ and
// ends at the origin regardless of small δ drift — the source of motional robustness.
//
// This module works entirely with the classical α(t) trajectory (fast, no Fock
// space), which reproduces the paper's spin-motion error ∝(2n̄+1)|α(τ)|² and its
// filter-function robustness (App. B) — exactly the quantities we need for the
// smooth×GBC trade-off. Open-system costs (heating, dephasing) enter as rate terms.
// =============================================================================

const cI = (re, im) => ({ re, im });
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cscale = (a, s) => ({ re: a.re * s, im: a.im * s });
const cmulI = (a) => ({ re: -a.im, im: a.re });   // ×i

// ---- ramp schedules ----------------------------------------------------------
// smooth (AESE): Ω sin²-ramped on over τ_ramp at δ=δmax, δ ramped δmax→δmin (Eq. 18,
// j) over τ_d, held tc, ramped back, Ω off. Returns { deltaFn, omegaFn, tau, kind }.
export function smoothProtocol({ deltaMax, deltaMin, tauD, tauRamp, tc = 0, j = 3, Omega }) {
  const tau = 2 * tauRamp + 2 * tauD + tc;
  const s2 = (x) => Math.sin(Math.PI / 2 * Math.max(0, Math.min(1, x))) ** 2;   // smooth 0→1
  // Eq.(18): δ(s)=(b+c·g(s))^{-1/j}, s∈[0,1] over a τ_d ramp. b,c set so δ(0)=δmax,
  // δ(1)=δmin (1/δ^j linear-in-g ⇒ δ changes fast near δmax, slow near δmin).
  const b = 1 / Math.pow(deltaMax, j), cc = (1 / Math.pow(deltaMin, j) - 1 / Math.pow(deltaMax, j));
  const g = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);               // ∫sin², normalized so g(1)=1
  const deltaRamp = (s) => Math.pow(b + cc * g(s), -1 / j);                     // δmax at s=0 → δmin at s=1
  const omegaFn = (t) => {
    if (t < tauRamp) return Omega * s2(t / tauRamp);
    if (t > tau - tauRamp) return Omega * s2((tau - t) / tauRamp);
    return Omega;
  };
  const deltaFn = (t) => {
    if (t <= tauRamp) return deltaMax;
    if (t <= tauRamp + tauD) return deltaRamp((t - tauRamp) / tauD);
    if (t <= tauRamp + tauD + tc) return deltaMin;
    if (t <= tauRamp + 2 * tauD + tc) return deltaRamp(1 - (t - tauRamp - tauD - tc) / tauD);
    return deltaMax;
  };
  return { deltaFn, omegaFn, tau, kind: 'smooth' };
}

// diabatic (DESE): constant δ, Ω sin²-ramped on/off fast; τ = 2πK/δ (+ ramps).
export function constProtocol({ delta, Omega, K = 1, tauRamp = 0 }) {
  const tHold = 2 * Math.PI * K / delta, tau = tHold + 2 * tauRamp;
  const s2 = (x) => Math.sin(Math.PI / 2 * Math.max(0, Math.min(1, x))) ** 2;
  const omegaFn = (t) => (tauRamp === 0 ? Omega : (t < tauRamp ? Omega * s2(t / tauRamp) : t > tau - tauRamp ? Omega * s2((tau - t) / tauRamp) : Omega));
  return { deltaFn: () => delta, omegaFn, tau, kind: 'const' };
}

// ---- α(t) trajectory: α̇ = −i( δ(t) α + Ω(t) ), forced (+) sector -------------
// deltaShift(t): optional additive mode-frequency error (static Δδ or fluctuation).
export function integrateAlpha(proto, { N = 4000, deltaShift = null } = {}) {
  const { deltaFn, omegaFn, tau } = proto, dt = tau / N;
  let a = cI(0, 0), theta = 0, excursion = 0;
  const traj = new Array(N + 1); traj[0] = a;
  const dOf = (t) => deltaFn(t) + (deltaShift ? deltaShift(t) : 0);
  const rhs = (al, t) => cscale(cmulI(cadd(cscale(al, dOf(t)), cI(omegaFn(t), 0))), -1);   // −i(δα+Ω)
  for (let k = 0; k < N; k++) {
    const t = k * dt, Om = omegaFn(t), d = dOf(t + dt / 2);
    const k1 = rhs(a, t), k2 = rhs(cadd(a, cscale(k1, dt / 2)), t + dt / 2);
    const k3 = rhs(cadd(a, cscale(k2, dt / 2)), t + dt / 2), k4 = rhs(cadd(a, cscale(k3, dt)), t + dt);
    a = cadd(a, cscale(cadd(cadd(k1, cscale(k2, 2)), cadd(cscale(k3, 2), k4)), dt / 6));
    traj[k + 1] = a;
    const dd = Math.abs(dOf(t)) > 1e-12 ? dOf(t) : 1e-12;
    theta += Om * Om / dd * dt;                       // θ̇_g = Ω²/δ
    excursion += (a.re * a.re + a.im * a.im) * dt;     // ∫|α|² dt  (heating proxy)
  }
  return { alphaTau: a, residual: Math.hypot(a.re, a.im), theta, excursion, traj, tau };
}

// Residual |α(τ)| under a STATIC mode-frequency offset Δδ (robustness probe).
export function residualUnderOffset(proto, dDelta) {
  return integrateAlpha(proto, { deltaShift: () => dDelta }).residual;
}

// Filter function F(ω) for oscillatory mode-freq noise ε cos(ωt+φ): ⟨|α(τ)|²⟩_φ/ε²
// (paper Eq. 21 / App. B). ε small so the response is linear; average over φ∈{0,π/2}.
export function filterFunction(proto, omega, { eps = 1e-4, N = 4000 } = {}) {
  const base = integrateAlpha(proto, { N }).alphaTau;   // residual at ε=0 (≈0 for a good gate)
  let acc = 0;
  for (const phi of [0, Math.PI / 2]) {
    const a = integrateAlpha(proto, { N, deltaShift: (t) => eps * Math.cos(omega * t + phi) }).alphaTau;
    const dr = a.re - base.re, di = a.im - base.im;
    acc += (dr * dr + di * di);
  }
  return acc / 2 / (eps * eps);
}

// Calibrate Ω (smooth: via δ_min is external; here scale Ω) so θ_g = target (π/2).
// For a given protocol, θ_g ∝ Ω², so Ω_target = Ω·√(target/θ_g).
export function calibrateOmega(protoFactory, Omega0, target = Math.PI / 2) {
  const th = integrateAlpha(protoFactory(Omega0)).theta;
  return Omega0 * Math.sqrt(target / th);
}

// =============================================================================
// smooth × GBC — the combining trade-off. Four schemes, all reaching θ_g=π/2:
//   plain      = DESE (constant δ), no GBC
//   smooth     = AESE (δ-ramp),     no GBC
//   gbc        = DESE + GBC
//   smoothGbc  = AESE + GBC
// Net infidelity = symmetric-axis (spin-motion from a mode-freq drift Δδ, ∝(2n̄+1)|α_res|²,
// which AESE crushes) + asymmetric-axis (center-line ε=Δω·τ; ε² uncompensated, ε⁴ with
// GBC — from ion-validation's exact 4×4 gates) + incoherent (κ·∫|α|²·(2n̄+1)+γ_φτ, ×4 for
// GBC's 4τ). KEY physics: the smooth gate is long (τ_s≫τ_p), so it is *symmetric*-robust
// but *asymmetric*-fragile (ε_s=Δω·τ_s is large) — which is exactly why combining it with
// GBC is natural, and why a threshold in (Δω, Δδ/n̄) decides which scheme wins.
// All quantities dimensionless (δ_min=1 unit); a leading-order model, labelled as such.
// =============================================================================
import { coherentSingle, coherentGBC } from './ion-validation.js';

export function buildContext({ deltaMin = 1, deltaMax = 18, tauD = 40, tauRamp = 3, tc = 0, K = 1, thetaTarget = Math.PI / 2 } = {}) {
  const dese0 = (Om) => constProtocol({ delta: deltaMin, Omega: Om, K, tauRamp: 0 });
  const dese = dese0(calibrateOmega(dese0, 0.5 * deltaMin, thetaTarget));
  const sm0 = (Om) => smoothProtocol({ deltaMax, deltaMin, tauD, tauRamp, tc, Omega: Om });
  const sm = sm0(calibrateOmega(sm0, 0.5 * deltaMin, thetaTarget));
  const rd = integrateAlpha(dese), rs = integrateAlpha(sm);
  return { dese, sm, tauP: dese.tau, tauS: sm.tau, excP: rd.excursion, excS: rs.excursion };
}
// residual |α(τ)| for both gates at a given static mode-freq drift Δδ (compute once per Δδ).
export function residualPair(ctx, deltaDrift) {
  return { rP: residualUnderOffset(ctx.dese, deltaDrift), rS: residualUnderOffset(ctx.sm, deltaDrift) };
}
// the four schemes' net infidelity (pass precomputed residuals for a fast Δω/noise scan).
export function schemes(ctx, { rP, rS }, { deltaOmega = 0, nbar = 0, kappa = 0, gammaPhi = 0 } = {}) {
  const th = 2 * nbar + 1;
  const symP = th * rP * rP, symS = th * rS * rS;                        // spin-motion (AESE crushes symS)
  const incP = kappa * ctx.excP * th + gammaPhi * ctx.tauP;             // incoherent floor, short gate
  const incS = kappa * ctx.excS * th + gammaPhi * ctx.tauS;             // incoherent floor, long (smooth) gate
  return {
    plain: symP + coherentSingle(deltaOmega * ctx.tauP) + incP,
    smooth: symS + coherentSingle(deltaOmega * ctx.tauS) + incS,
    gbc: symP + coherentGBC(deltaOmega * ctx.tauP) + 4 * incP,
    smoothGbc: symS + coherentGBC(deltaOmega * ctx.tauS) + 4 * incS,
  };
}
const NAMES = ['plain', 'smooth', 'gbc', 'smoothGbc'];
export function winner(vals) { return NAMES.reduce((b, k) => (vals[k] < vals[b] ? k : b), 'plain'); }

// Threshold in Δω where scheme B overtakes scheme A (A wins below, B above), else null.
export function crossoverDeltaOmega(ctx, res, base, a, b, { max = 0.02, N = 400 } = {}) {
  const f = (dw) => { const v = schemes(ctx, res, { ...base, deltaOmega: dw }); return v[a] - v[b]; };
  let prev = f(0), pdw = 0;
  for (let i = 1; i <= N; i++) { const dw = max * i / N, d = f(dw); if (prev < 0 && d >= 0) return pdw + prev / (prev - d) * (dw - pdw); prev = d; pdw = dw; }
  return null;
}
