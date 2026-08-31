// =============================================================================
// ion-ms-pm.js — PHASE-MODULATED robust MS waveform, for a method-agnostic
// comparison against the amplitude-modulated (AM) robust designer (`ion-msn-shape`
// `solveShapeRobust`). Referee response: the trade-off crossover is set by the gate
// TIME, not the pulse-shaping method; here we build a genuinely different scheme
// (constant amplitude, modulated laser phase φ(t)) and show it achieves the same
// closure + δ-robustness + entangling phase, at the same τ, with a comparable
// motional excursion — hence the same incoherent cost and the same crossover.
//
// Single mode, interaction picture. Piecewise-constant phase φ_k over n equal
// segments of a gate of duration τ. The spin-dependent-force displacement is
//   α(τ) = g Σ_k e^{iφ_k} ∫_seg e^{iδt} dt,   g = ηΩ/2  (constant amplitude),
// closed by α(τ)=0 and made first-order δ-robust by ∂_δα(τ)=0. The two-qubit
// geometric phase Θ and the heating proxy ∫₀^τ|α(t)|²dt follow analytically.
// Framework-free except a 4×4 solve (mathjs) inside the Gauss–Newton step.
// =============================================================================

import { create, all } from 'mathjs';
const math = create(all);

const cexp = (t) => ({ re: Math.cos(t), im: Math.sin(t) });
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cabs2 = (a) => a.re * a.re + a.im * a.im;

// ∫_a^b e^{iδt} dt.
function segInt(delta, a, b) {
  if (Math.abs(delta) < 1e-12) return { re: b - a, im: 0 };
  const Nre = Math.cos(delta * b) - Math.cos(delta * a), Nim = Math.sin(delta * b) - Math.sin(delta * a);
  return { re: Nim / delta, im: -Nre / delta };   // (e^{iδb}−e^{iδa})/(iδ) = −i·N/δ
}
// d/dδ ∫_a^b e^{iδt} dt = ∫_a^b (it) e^{iδt} dt (finite-difference; robust & simple).
function dSegInt(delta, a, b) {
  const h = 1e-6, p = segInt(delta + h, a, b), m = segInt(delta - h, a, b);
  return { re: (p.re - m.re) / (2 * h), im: (p.im - m.im) / (2 * h) };
}

const times = (n, tau) => Array.from({ length: n + 1 }, (_, k) => tau * k / n);

// α(τ)/g and ∂_δα(τ)/g for phases φ (length n).
function alphaOf(phases, delta, tau) {
  const t = times(phases.length, tau); let s = { re: 0, im: 0 };
  for (let k = 0; k < phases.length; k++) s = cadd(s, cmul(cexp(phases[k]), segInt(delta, t[k], t[k + 1])));
  return s;
}
function dAlphaOf(phases, delta, tau) {
  const t = times(phases.length, tau); let s = { re: 0, im: 0 };
  for (let k = 0; k < phases.length; k++) s = cadd(s, cmul(cexp(phases[k]), dSegInt(delta, t[k], t[k + 1])));
  return s;
}

// Two-qubit geometric phase (unit g): Θ = Im ∫₀^τ dt ∫₀^t dt' e^{i[φ(t)−φ(t')]} e^{iδ(t−t')}.
// Segment-pair closed form: same-segment self term + ordered cross terms.
export function thetaOf(phases, delta, tau) {
  const n = phases.length, t = times(n, tau); let acc = 0;
  const I = (k) => segInt(delta, t[k], t[k + 1]);              // ∫_seg e^{iδt}
  for (let k = 0; k < n; k++) {
    // diagonal: ∫∫_{t>t' in seg k} e^{iδ(t−t')} = (Δ − (1−e^{−...})/... ) → compute numerically-stable
    const a = t[k], b = t[k + 1];
    // ∫_a^b dt ∫_a^t dt' e^{iδ(t−t')} : Im part
    if (Math.abs(delta) < 1e-9) { /* Im=0 to leading order for tiny δ within a seg */ }
    else {
      const d = delta, dt = b - a;
      // ∫_a^b (1−e^{−iδ(t−a)})/(iδ) dt ; Im part = ∫ [ (1−cos)/δ ] dt = (dt − sin(δ dt)/δ)/δ
      acc += (dt - Math.sin(d * dt) / d) / d;
    }
    // off-diagonal k'>k... actually ordered t>t' means later segment k over earlier l<k, whole segments
    for (let l = 0; l < k; l++) {
      // ∫_{seg k} dt ∫_{seg l} dt' e^{i(φk−φl)} e^{iδ(t−t')} = e^{i(φk−φl)} I(k) conj(I(l))
      const ph = cexp(phases[k] - phases[l]);
      const term = cmul(ph, cmul(I(k), { re: I(l).re, im: -I(l).im }));
      acc += term.im;
    }
  }
  return acc;
}

// Heating proxy: ∫₀^τ |α(t)|² dt (unit g), sampled. α(t) accumulates segment by segment.
export function excursionIntegral(phases, delta, tau, nsub = 40) {
  const n = phases.length, t = times(n, tau); let acc = 0; const dt = tau / (n * nsub);
  let base = { re: 0, im: 0 };   // α at start of current segment
  for (let k = 0; k < n; k++) {
    const ph = cexp(phases[k]);
    for (let j = 0; j < nsub; j++) {
      const tt = t[k] + (j + 0.5) * (tau / n) / nsub;
      const partial = cmul(ph, segInt(delta, t[k], tt));   // contribution within seg up to tt
      const a = cadd(base, partial);
      acc += cabs2(a) * dt;
    }
    base = cadd(base, cmul(ph, segInt(delta, t[k], t[k + 1])));
  }
  return acc;
}

// Solve phases for closure α(τ)=0 AND first-order robustness ∂_δα(τ)=0 (Gauss–Newton /
// min-norm). Returns { ok, phases, residual, dResidual }. τ scales out of closure, but the
// robustness ∂_δ depends on δτ, so we solve at the operating (delta, tau).
export function solvePMRobust(delta, tau, { nSeg = 7, seed } = {}) {
  const n = nSeg;
  // seed: a linear phase ramp breaks the trivial φ=const (which cannot close) and gives GN a start.
  let phi = seed ? seed.slice() : Array.from({ length: n }, (_, k) => 2 * Math.PI * k * 1.5 / n);
  const resid = (p) => { const a = alphaOf(p, delta, tau), d = dAlphaOf(p, delta, tau); return [a.re, a.im, d.re, d.im]; };
  for (let it = 0; it < 200; it++) {
    const r = resid(phi), rn = Math.hypot(...r);
    if (rn < 1e-11) break;
    // Jacobian J (4×n): ∂r_i/∂φ_k by finite difference.
    const h = 1e-6, J = [[], [], [], []];
    for (let k = 0; k < n; k++) {
      const pp = phi.slice(); pp[k] += h; const rp = resid(pp);
      const pm = phi.slice(); pm[k] -= h; const rm = resid(pm);
      for (let i = 0; i < 4; i++) J[i][k] = (rp[i] - rm[i]) / (2 * h);
    }
    // min-norm GN: Δφ = Jᵀ (JJᵀ + μI)⁻¹ r  (Levenberg damping μ)
    const Jm = math.matrix(J), JT = math.transpose(Jm);
    const JJT = math.add(math.multiply(Jm, JT), math.multiply(1e-9, math.identity(4)));
    let dphi;
    try { const y = math.multiply(math.inv(JJT), math.matrix(r)); dphi = math.multiply(JT, y).toArray(); }
    catch { break; }
    const step = rn > 1 ? 0.5 : 1;   // damp large early steps
    for (let k = 0; k < n; k++) phi[k] -= step * dphi[k];
  }
  const a = alphaOf(phi, delta, tau), d = dAlphaOf(phi, delta, tau);
  return {
    ok: Math.hypot(a.re, a.im, d.re, d.im) < 1e-8,
    phases: phi.map((x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)),
    residual: Math.hypot(a.re, a.im), dResidual: Math.hypot(d.re, d.im),
  };
}

// Closure residual |α(τ)| at a shifted detuning δ+Δδ (for the robustness comparison).
export function residualAt(phases, delta, tau, dDelta) {
  const a = alphaOf(phases, delta + dDelta, tau); return Math.hypot(a.re, a.im);
}

// ---- Complex-weight evaluators: w_k = g_k e^{iφ_k} (per-segment coupling·phase). Lets AM
//      (real w_k) and PM (|w_k|=const) waveforms be scored with identical conventions. ----
export function wAlpha(w, delta, tau) {
  const t = times(w.length, tau); let s = { re: 0, im: 0 };
  for (let k = 0; k < w.length; k++) s = cadd(s, cmul(w[k], segInt(delta, t[k], t[k + 1])));
  return s;
}
export function wTheta(w, delta, tau) {
  const n = w.length, t = times(n, tau), I = (k) => segInt(delta, t[k], t[k + 1]); let acc = 0;
  for (let k = 0; k < n; k++) {
    const a = t[k], b = t[k + 1], dt = b - a, g2 = cabs2(w[k]);
    acc += g2 * (Math.abs(delta) < 1e-9 ? dt * dt / 2 : (dt - Math.sin(delta * dt) / delta) / delta);
    for (let l = 0; l < k; l++) acc += cmul(cmul(w[k], { re: w[l].re, im: -w[l].im }), cmul(I(k), { re: I(l).re, im: -I(l).im })).im;
  }
  return acc;
}
export function wExcursion(w, delta, tau, nsub = 60) {
  const n = w.length, t = times(n, tau), dt = tau / (n * nsub); let acc = 0, base = { re: 0, im: 0 };
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < nsub; j++) { const tt = t[k] + (j + 0.5) * (tau / n) / nsub; acc += cabs2(cadd(base, cmul(w[k], segInt(delta, t[k], tt)))) * dt; }
    base = cadd(base, cmul(w[k], segInt(delta, t[k], t[k + 1])));
  }
  return acc;
}
