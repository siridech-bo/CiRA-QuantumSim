// =============================================================================
// pdh.js — real physics for the Pound–Drever–Hall lock simulator (pure, testable).
//
// Models, from the actual formulas (Black, Am. J. Phys. 69, 79 (2001); the setup
// mirrors Wang, Subhankar & Britton, Appl. Phys. B 131, 146 (2025)):
//   • Fabry–Pérot cavity field reflection F(ν) (Airy) → |F|², phase, transmission.
//   • EOM phase modulation (β) → carrier + sidebands (Bessel J0, J1).
//   • The PDH error signal ε(ν) = 2√(Pc Ps)·Im[F(ν)F*(ν+Ω) − F*(ν)F(ν−Ω)] with a
//     demodulation-phase knob.
//   • A time-domain closed loop: a free-running (drifting, noisy) laser + a PI/PID
//     servo split into a fast (diode-current) and slow (PZT) actuator, using the REAL
//     nonlinear ε(ν) so capture range, lock/unlock and servo instability all emerge.
// Frequencies are in MHz; the cavity FSR and modulation Ω are set in MHz.
// =============================================================================

// ---- tiny complex helpers ---------------------------------------------------
const cx = (re, im = 0) => ({ re, im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const csub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cconj = (a) => ({ re: a.re, im: -a.im });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
export const cabs2 = (a) => a.re * a.re + a.im * a.im;

// ---- Bessel J_n (series; fine for β ≲ 4, the PDH regime) --------------------
export function besselJ(n, x) {
  let factn = 1; for (let i = 2; i <= n; i++) factn *= i;
  let term = Math.pow(x / 2, n) / factn;   // k = 0
  let sum = term;
  for (let k = 1; k < 40; k++) {
    term *= -(x * x / 4) / (k * (k + n));
    sum += term;
    if (Math.abs(term) < 1e-15) break;
  }
  return sum;
}

// ---- finesse ↔ mirror amplitude reflectivity r ------------------------------
// ℱ = π√R/(1−R), R = r² ⇒ ℱ = π r/(1−r²). Invert for r given ℱ.
export function finesseToR(F) { return (-Math.PI + Math.sqrt(Math.PI * Math.PI + 4 * F * F)) / (2 * F); }
export function rToFinesse(r) { return Math.PI * r / (1 - r * r); }

// ---- Fabry–Pérot field reflection F(ν) --------------------------------------
// ν measured from a resonance (MHz); fsr in MHz. Lossless symmetric cavity:
// F = r(e^{iφ} − 1)/(1 − r² e^{iφ}),  φ = 2π ν/fsr. On resonance F=0 (impedance matched).
export function cavityReflection(nu, r, fsr) {
  const phi = 2 * Math.PI * nu / fsr;
  const e = cx(Math.cos(phi), Math.sin(phi));
  const num = cx(r * (e.re - 1), r * e.im);
  const den = cx(1 - r * r * e.re, -r * r * e.im);
  return cdiv(num, den);
}
export function reflectedIntensity(nu, r, fsr) { return cabs2(cavityReflection(nu, r, fsr)); }
export function transmittedIntensity(nu, r, fsr) { return 1 - reflectedIntensity(nu, r, fsr); } // lossless
export function reflectedPhase(nu, r, fsr) { const F = cavityReflection(nu, r, fsr); return Math.atan2(F.im, F.re); }

// cavity FWHM linewidth (MHz) from FSR & finesse
export function cavityLinewidth(fsr, finesse) { return fsr / finesse; }

// ---- total reflected DC power with EOM sidebands (the reflection dip you see) --
export function reflectedPowerWithSidebands(nu, { r, fsr, Omega, beta }) {
  const J0 = besselJ(0, beta), J1 = besselJ(1, beta);
  const F0 = cavityReflection(nu, r, fsr);
  const Fp = cavityReflection(nu + Omega, r, fsr);
  const Fm = cavityReflection(nu - Omega, r, fsr);
  return J0 * J0 * cabs2(F0) + J1 * J1 * (cabs2(Fp) + cabs2(Fm));
}

// ---- PDH error signal ε(ν) --------------------------------------------------
// ε = 2√(Pc Ps)·Im[F(ν)F*(ν+Ω) − F*(ν)F(ν−Ω)], Pc=J0²P, Ps=J1²P ⇒ 2√(Pc Ps)=2P·J0 J1.
// demodPhase rotates the LO: ε(θ) = amp·(cosθ·Im − sinθ·Re) of the bracket.
export function pdhError(nu, { r, fsr, Omega, beta, demodPhase = 0, power = 1 }) {
  const F0 = cavityReflection(nu, r, fsr);
  const Fp = cavityReflection(nu + Omega, r, fsr);
  const Fm = cavityReflection(nu - Omega, r, fsr);
  const term = csub(cmul(F0, cconj(Fp)), cmul(cconj(F0), Fm));
  const amp = 2 * power * besselJ(0, beta) * besselJ(1, beta);
  return amp * (Math.cos(demodPhase) * term.im - Math.sin(demodPhase) * term.re);
}

// discriminant slope D = dε/dν at resonance (error-signal steepness) via finite diff
export function discriminantSlope(cfg) {
  const h = Math.max(1e-4, cfg.fsr * 1e-6);
  return (pdhError(h, cfg) - pdhError(-h, cfg)) / (2 * h);
}

// ---- time-domain closed loop ------------------------------------------------
// A free-running laser (drift + white frequency noise) locked by a PI/PID servo
// with a FAST (diode-current, high-bandwidth) and SLOW (PZT, integrating) path.
// Uses the REAL nonlinear ε(ν): far from resonance ε→0 ⇒ capture range & unlock;
// a loop delay makes excessive gain oscillate (servo instability). All emergent.
function gaussian(rng) { // Box–Muller
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export class PDHLock {
  // cfg: cavity/EOM (r,fsr,Omega,beta,demodPhase) + loop:
  //   Kp, Ki (fast PI on current), Kslow (slow integrator on PZT),
  //   tauFast, tauSlow (actuator response times, µs), delay (loop delay, µs),
  //   drift (MHz/µs), noise (MHz·µs^-1/2), dt (µs)
  constructor(cfg, rng) {
    this.cfg = cfg;
    this.rng = rng || Math.random;
    this.updateDiscriminant();
    this.reset(cfg.nu0 !== undefined ? cfg.nu0 : 0);
  }
  // Discriminant slope D (signed). We feed the servo the frequency-normalized error
  // e/D, which ≈ ν near lock (sign-correct → stable negative feedback for either
  // demod sign) yet still rolls off far from resonance (preserving the capture range).
  updateDiscriminant() { const d = discriminantSlope(this.cfg); this.D = Math.abs(d) < 1e-9 ? 1 : d; }
  reset(nu0 = 0) {
    this.t = 0;
    this.nuFree = nu0;         // free-running laser detuning from resonance (MHz)
    this.nu = nu0;             // actual (after correction)
    this.integ = 0;           // fast integrator state
    this.uFast = 0;           // fast actuator output (applied)
    this.uSlow = 0;           // slow actuator output (applied, PZT)
    this.uSlowTgt = 0;
    this.locked = false;
    this._eBuf = [];          // loop-delay buffer of error samples
  }
  setLocked(on) { this.locked = on; if (on) { this.integ = 0; } }
  step() {
    const c = this.cfg, dt = c.dt;
    // free-running laser: slow drift + white frequency noise
    this.nuFree += c.drift * dt + c.noise * gaussian(this.rng) * Math.sqrt(dt);
    let uF = this.uFast, uS = this.uSlow;
    if (this.locked) {
      // frequency-normalized error e/D (≈ ν near lock; rolls off far away)
      let e = pdhError(this.nu, c) / this.D;
      // loop delay: use an error sample from `delay` µs ago
      const nd = Math.max(0, Math.round((c.delay || 0) / dt));
      this._eBuf.push(e); let ed = e;
      if (this._eBuf.length > nd) ed = this._eBuf.shift();
      // fast PI (diode current): u = −(Kp e + Ki ∫e)
      this.integ += ed * dt;
      const uFtgt = -(c.Kp * ed + c.Ki * this.integ);
      // slow integrator (PZT) offloads the DC part of the fast actuator
      this.uSlowTgt += (c.Kslow || 0) * this.uFast * dt;
      // actuator low-pass responses (finite bandwidth)
      uF += (uFtgt - this.uFast) * Math.min(1, dt / Math.max(dt, c.tauFast));
      uS += (this.uSlowTgt - this.uSlow) * Math.min(1, dt / Math.max(dt, c.tauSlow || c.tauFast));
    } else {
      this._eBuf.length = 0;
    }
    this.uFast = uF; this.uSlow = uS;
    this.nu = this.nuFree + this.uFast + this.uSlow;
    this.t += dt;
    return this.nu;
  }
}
