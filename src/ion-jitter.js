// =============================================================================
// ion-jitter.js — timing-jitter sensitivity theory (experiment #6). A piecewise-
// constant MS waveform is realized by an AWG whose segment BOUNDARIES carry timing
// jitter (±ns). This perturbs the closure integrals E_p=∫Ω e^{iδt}dt and the geometric
// phase, degrading fidelity. We model it exactly: boundary-aware versions of the shape
// evaluators (which normally assume equal segments) let us shift each interior boundary
// and recompute the honest Bell fidelity, Monte-Carlo-averaged over jitter realizations.
//
// KEY PREDICTION (to overlay on data): 1−F grows QUADRATICALLY in the RMS jitter σ_t,
// and the PALINDROMIC robust waveform (Ω(t)=Ω(τ−t)) has a smaller coefficient than a
// generic closing pulse — first-order boundary errors partially self-cancel by symmetry.
// Framework-free (mirrors src/ion-msn-shape.js's metric with explicit boundaries).
// =============================================================================

const EPS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SVAL = EPS.map(([a, b]) => a + b);
const THETA_MS = Math.PI / 8;
const qval = (mode, e) => mode.g[0] * e[0] + mode.g[1] * e[1];

// s_{p,k}=∫_{t0}^{t1} e^{iδt}dt (δ→0 safe).
function segKernel(delta, t0, t1) {
  if (Math.abs(delta) < 1e-12) return { re: t1 - t0, im: 0 };
  return { re: (Math.cos(delta * t1) - Math.cos(delta * t0)) / delta,
           im: (Math.sin(delta * t1) - Math.sin(delta * t0)) / delta };
}

// Closure integral E_p with EXPLICIT boundaries b (length amps.length+1).
function envelopeB(mode, amps, b) {
  let re = 0, im = 0;
  for (let k = 0; k < amps.length; k++) { const s = segKernel(mode.delta, b[k], b[k + 1]); re += amps[k] * s.re; im += amps[k] * s.im; }
  return { re, im };
}
// Quadratic phase form_p with explicit boundaries.
function formPB(mode, amps, b) {
  const d = mode.delta, ns = amps.length; let f = 0;
  for (let n = 0; n < ns; n++) {
    const a = b[n], bb = b[n + 1], L = bb - a;
    f += amps[n] * amps[n] * (Math.abs(d) < 1e-9 ? L * L / 2 : (d * L - Math.sin(d * L)) / (d * d));
    for (let m = 0; m < n; m++) {
      const c = b[m], e = b[m + 1];
      const W = (Math.sin(d * (bb - e)) - Math.sin(d * (bb - c)) - Math.sin(d * (a - e)) + Math.sin(d * (a - c))) / (d * d);
      f += amps[n] * amps[m] * W;
    }
  }
  return f;
}
// Bell fidelity with explicit boundaries (mirrors shapedBellFidelity).
export function bellFidelityB(modes, amps, b, thetaTarget = THETA_MS) {
  const Es = modes.map((m) => envelopeB(m, amps, b));
  const dPhi = EPS.map((e, i) => { let phi = 0; for (const m of modes) { const q = qval(m, e); phi += q * q * formPB(m, amps, b); } return phi - thetaTarget * SVAL[i] * SVAL[i]; });
  let F = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let cexp = 0;
    for (let p = 0; p < modes.length; p++) { const dq = qval(modes[p], EPS[i]) - qval(modes[p], EPS[j]); cexp += (2 * modes[p].nbar + 1) * dq * dq * (Es[p].re * Es[p].re + Es[p].im * Es[p].im) / 2; }
    F += Math.cos(dPhi[i] - dPhi[j]) * Math.exp(-cexp);
  }
  return F / 16;
}

// equal-segment boundaries for a pulse of ns segments over [0,τ].
export const equalBounds = (ns, tau) => Array.from({ length: ns + 1 }, (_, k) => tau * k / ns);

// deterministic Gaussian via Box–Muller from a uniform rng (default Math.random).
function gauss(rng) { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Expected infidelity 1−⟨F⟩ under RMS boundary timing jitter σ (same units as τ).
// Interior boundaries are perturbed by i.i.d. Gaussian(0,σ), kept ordered; endpoints fixed.
// opts.realizations (default 300), opts.rng (uniform in [0,1), default Math.random).
export function jitterInfidelity(modes, pulse, sigma, { realizations = 300, rng = Math.random, thetaTarget = pulse.thetaTarget !== undefined ? pulse.thetaTarget : THETA_MS } = {}) {
  const ns = pulse.amp.length, tau = pulse.tau, base = equalBounds(ns, tau);
  if (sigma <= 0) return 1 - bellFidelityB(modes, pulse.amp, base, thetaTarget);
  let acc = 0;
  for (let r = 0; r < realizations; r++) {
    const b = base.slice();
    for (let k = 1; k < ns; k++) b[k] = base[k] + sigma * gauss(rng);
    b.sort((x, y) => x - y); b[0] = 0; b[ns] = tau;                 // keep monotone + endpoints fixed
    acc += 1 - bellFidelityB(modes, pulse.amp, b, thetaTarget);
  }
  return acc / realizations;
}

// Convenience: infidelity vs a list of σ values (a theory curve to overlay on data).
export function jitterCurve(modes, pulse, sigmas, opts) {
  return sigmas.map((s) => ({ sigma: s, infidelity: jitterInfidelity(modes, pulse, s, opts) }));
}

// A small seedable uniform RNG (mulberry32) for reproducible tests / demos.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
