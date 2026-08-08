// =============================================================================
// ion-modes.js — Substrate 3, Phase 2a: the two CLASSICAL solvers that sit
// *underneath* the trapped-ion density-matrix engine and explain where the
// harmonic oscillator (M1) and the collective mode bus (M2) come from.
//
//   • MathieuTrap — Paul-trap RF confinement. Stability of ü + [a − 2q cos(2τ)]u = 0
//     is decided from the MONODROMY (Floquet) matrix, computed by integrating the
//     two fundamental solutions over one RF period T=π (the equation has period π
//     in τ). Motion is stable ⟺ |Tr M| < 2. The a=0 lowest boundary q* ≈ 0.9080
//     (β=1) is DERIVED by bisection on Tr M = −2 — never hard-coded. Also: secular
//     frequency (pseudopotential), full-ODE trajectory (secular + micromotion).
//
//   • IonChain — N ions in a 1D axial harmonic well + Coulomb repulsion
//     (James, Appl. Phys. B 66, 181 (1998)). Dimensionless equilibrium positions
//     u_m solved by NEWTON iteration on the force balance; the Newton Jacobian IS
//     James's Hessian A. Mode frequencies = √(eig A)·ω_z, eigenvectors = mode
//     shapes. COM eigenvalue = 1 (⇒ ω_z, N-independent); two-ion stretch = 3
//     (⇒ √3·ω_z). Two-ion spacing = 2^(1/3)·ℓ, checked against the Newton solve.
//
// Framework-free apart from math.js (eigs + linear solve), so this whole file is
// importable in node for test/ion-modes.test.mjs. It NEVER touches src/ion.js —
// these are pure classical ODE / linear-algebra problems.
//
// Physics sources: docs/ion-physics-constants.md §9 (modes), spec §4 (M1/M2, §6
// assertions 17/18/19). Standard Mathieu / Floquet theory (McLachlan; Ghosh,
// *Ion Traps*). James 1998 for the Coulomb chain.
// =============================================================================
import { create, all } from 'mathjs';

const math = create(all);

// -----------------------------------------------------------------------------
// Physical constants (SI) — only used for OPTIONAL dimensional read-outs
// (length scale ℓ, physical spacing). The dimensionless physics needs none of them.
// -----------------------------------------------------------------------------
export const CONST = {
  e: 1.602176634e-19,        // C   (elementary charge)
  eps0: 8.8541878128e-12,    // F/m (vacuum permittivity)
  u: 1.66053906660e-27,      // kg  (atomic mass unit)
};

// =============================================================================
// M1 — Paul trap: Mathieu equation, Floquet/monodromy stability, trajectory.
//
//   ü + [a − 2q cos(2τ)] u = 0 ,   τ = ω_RF t / 2 ,   equation period in τ is π.
//
// Convention (standard, McLachlan): with τ = Ω_RF t/2, one RF period is Δτ = π.
// The secular frequency in the pseudopotential (adiabatic) approximation is
//   ω_sec ≈ (Ω_RF/2)·√(a + q²/2)  ⇔  β_sec ≈ √(a + q²/2)   (β = 2ω_sec/Ω_RF).
// =============================================================================
export class MathieuTrap {
  constructor({ a = 0, q = 0.4, omegaRF = 2 * Math.PI * 20e6 } = {}) {
    this.a = a;
    this.q = q;
    this.omegaRF = omegaRF;           // Ω_RF (rad/s) — only scales physical ω_sec
  }

  setParams({ a, q, omegaRF } = {}) {
    if (a !== undefined) this.a = a;
    if (q !== undefined) this.q = q;
    if (omegaRF !== undefined) this.omegaRF = omegaRF;
    return this;
  }

  // ---- one RK4 step of the state y = [u, u'] under the Mathieu ODE ----------
  static _accel(a, q, u, tau) { return -(a - 2 * q * Math.cos(2 * tau)) * u; }

  static _rk4(a, q, u, v, tau, dt) {
    const acc = MathieuTrap._accel;
    const k1u = v,               k1v = acc(a, q, u, tau);
    const k2u = v + 0.5 * dt * k1v, k2v = acc(a, q, u + 0.5 * dt * k1u, tau + 0.5 * dt);
    const k3u = v + 0.5 * dt * k2v, k3v = acc(a, q, u + 0.5 * dt * k2u, tau + 0.5 * dt);
    const k4u = v + dt * k3v,       k4v = acc(a, q, u + dt * k3u, tau + dt);
    return [
      u + dt / 6 * (k1u + 2 * k2u + 2 * k3u + k4u),
      v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v),
    ];
  }

  // ---- integrate one fundamental solution over [0, π] -----------------------
  // Returns [u(π), u'(π)] for the given initial (u0, v0).
  static _propagate(a, q, u0, v0, steps = 2000) {
    const T = Math.PI, dt = T / steps;
    let u = u0, v = v0, tau = 0;
    for (let i = 0; i < steps; i++) {
      [u, v] = MathieuTrap._rk4(a, q, u, v, tau, dt);
      tau += dt;
    }
    return [u, v];
  }

  // ---- monodromy (Floquet) matrix over one RF period ------------------------
  //   Columns are the two fundamental solutions after one period:
  //     col 1 from (u=1, u'=0), col 2 from (u=0, u'=1)
  //   M = [[u1(π), u2(π)], [u1'(π), u2'(π)]].
  // For a Hamiltonian (energy-conserving) system det M = 1, so stability is set
  // entirely by the trace: stable ⟺ |Tr M| < 2  (Floquet multipliers on the unit
  // circle). This is the honest, first-principles stability test.
  static monodromy(a, q, steps = 2000) {
    const [u1, v1] = MathieuTrap._propagate(a, q, 1, 0, steps);   // column 1
    const [u2, v2] = MathieuTrap._propagate(a, q, 0, 1, steps);   // column 2
    return [[u1, u2], [v1, v2]];
  }

  static traceMonodromy(a, q, steps = 2000) {
    const M = MathieuTrap.monodromy(a, q, steps);
    return M[0][0] + M[1][1];
  }

  // stable ⟺ |Tr M| < 2
  static isStable(a, q, steps = 2000) {
    return Math.abs(MathieuTrap.traceMonodromy(a, q, steps)) < 2;
  }

  isStable(steps = 2000) { return MathieuTrap.isStable(this.a, this.q, steps); }

  // ---- exact characteristic exponent β from the monodromy trace -------------
  //   Tr M = 2 cos(βπ)  ⇒  β = arccos(Tr M / 2)/π   (real inside the stable band).
  static betaExact(a, q, steps = 2000) {
    const tr = MathieuTrap.traceMonodromy(a, q, steps);
    const c = Math.max(-1, Math.min(1, tr / 2));
    return Math.acos(c) / Math.PI;
  }

  // ---- pseudopotential (adiabatic) secular approximation --------------------
  static betaSecular(a, q) { return Math.sqrt(Math.max(0, a + q * q / 2)); }
  betaSecular() { return MathieuTrap.betaSecular(this.a, this.q); }

  //   ω_sec ≈ (Ω_RF/2)·√(a + q²/2)
  omegaSec() { return 0.5 * this.omegaRF * MathieuTrap.betaSecular(this.a, this.q); }

  // ==========================================================================
  // DERIVE the lowest a=0 stability boundary q* (β=1 line) by BISECTION on the
  // monodromy trace crossing −2. At a=0: Tr M(q=0)=+2, and Tr M decreases through
  // 0 to −2 as q grows; the first crossing Tr M = −2 (β=1) is q* ≈ 0.9080. Nothing
  // is looked up — the number falls out of the Floquet integration.
  // ==========================================================================
  static lowestBoundaryQ(a = 0, { steps = 2000, lo = 0.3, hi = 1.3, iters = 80 } = {}) {
    const f = (q) => MathieuTrap.traceMonodromy(a, q, steps) + 2;   // root at Tr M = −2
    let flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) throw new Error('lowestBoundaryQ: no sign change in bracket');
    for (let i = 0; i < iters; i++) {
      const mid = 0.5 * (lo + hi);
      const fmid = f(mid);
      if (flo * fmid <= 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
    }
    return 0.5 * (lo + hi);
  }

  // ==========================================================================
  // Stability map over an (a, q) grid, for the diagram. Returns a flat Uint8
  // array (1 = stable) row-major in q (inner) × a (outer), plus the axes. Coarse
  // step count keeps it interactive; the boundary itself is drawn from q*.
  // ==========================================================================
  static stabilityMap({ aMin = -0.4, aMax = 0.4, qMin = 0, qMax = 1.2,
                        na = 61, nq = 91, steps = 400 } = {}) {
    const stable = new Uint8Array(na * nq);
    const aAxis = new Float64Array(na), qAxis = new Float64Array(nq);
    for (let i = 0; i < na; i++) aAxis[i] = aMin + (aMax - aMin) * i / (na - 1);
    for (let j = 0; j < nq; j++) qAxis[j] = qMin + (qMax - qMin) * j / (nq - 1);
    for (let i = 0; i < na; i++)
      for (let j = 0; j < nq; j++)
        stable[i * nq + j] = MathieuTrap.isStable(aAxis[i], qAxis[j], steps) ? 1 : 0;
    return { stable, aAxis, qAxis, na, nq };
  }

  // ==========================================================================
  // Full-ODE trajectory u(τ): the honest secular oscillation with the fast RF
  // micromotion ripple on top (no pseudopotential smoothing). Also returns the
  // pseudopotential secular envelope u_sec(τ) = u0·cos(β_sec·τ) for comparison.
  // Past q* the true trajectory diverges — that IS the break-it demo.
  // ==========================================================================
  trajectory({ u0 = 1, v0 = 0, tauMax = 8 * Math.PI, steps = 4000 } = {}) {
    const { a, q } = this;
    const dt = tauMax / steps;
    const tau = new Float64Array(steps + 1);
    const u = new Float64Array(steps + 1);
    const v = new Float64Array(steps + 1);
    const uSec = new Float64Array(steps + 1);
    const beta = MathieuTrap.betaSecular(a, q);
    let uu = u0, vv = v0, tt = 0;
    for (let i = 0; i <= steps; i++) {
      tau[i] = tt; u[i] = uu; v[i] = vv;
      uSec[i] = u0 * Math.cos(beta * tt);
      if (i < steps) { [uu, vv] = MathieuTrap._rk4(a, q, uu, vv, tt, dt); tt += dt; }
    }
    // Diverges if the amplitude blows past a sane bound → visibly unstable.
    let amax = 0;
    for (let i = 0; i <= steps; i++) amax = Math.max(amax, Math.abs(u[i]));
    return { tau, u, v, uSec, beta, diverged: amax > 50 * Math.abs(u0 || 1), amax };
  }
}

// =============================================================================
// M2 — Coulomb normal modes of a linear ion chain (James 1998).
//
// Dimensionless axial positions u_m (in units of the length scale
//   ℓ = (e²/(4πε₀ m ω_z²))^(1/3)).
// Equilibrium force balance (James Eq. 8):
//   f_m(u) = u_m − Σ_{n≠m} sign(u_m−u_n)/(u_m−u_n)² = 0.
// The Jacobian ∂f_m/∂u_n IS James's Hessian A:
//   A_mm = 1 + 2 Σ_{n≠m} 1/|u_m−u_n|³ ,   A_{m≠n} = −2/|u_m−u_n|³.
// Axial mode frequencies = √(eig A)·ω_z. Lowest eig = 1 (COM, all in phase,
// N-independent); for N=2 the next eig = 3 (stretch, out of phase) ⇒ √3·ω_z.
// =============================================================================
export class IonChain {
  constructor({ N = 2 } = {}) {
    this.N = N;
    this._u = null;   // cached equilibrium (dimensionless)
  }

  setN(N) { this.N = N; this._u = null; return this; }

  // ---- force vector f and Hessian A at positions u (both computed together) --
  static _forceAndHessian(u) {
    const N = u.length;
    const f = new Array(N).fill(0);
    const A = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let m = 0; m < N; m++) {
      let coulomb = 0;      // Σ sign(d)/d²
      let diag = 1;         // A_mm starts at 1 (harmonic well curvature)
      for (let n = 0; n < N; n++) {
        if (n === m) continue;
        const d = u[m] - u[n];
        const ad = Math.abs(d);
        coulomb += Math.sign(d) / (d * d);
        const c = 2 / (ad * ad * ad);
        diag += c;
        A[m][n] = -c;
      }
      f[m] = u[m] - coulomb;
      A[m][m] = diag;
    }
    return { f, A };
  }

  // ---- Newton solve for the equilibrium dimensionless positions -------------
  // Newton step: A · δ = −f (A is exactly the Jacobian of f). Starts from an
  // even spread and converges quadratically for moderate N.
  equilibrium(N = this.N, { tol = 1e-13, maxIter = 200 } = {}) {
    // initial guess: evenly spread, centred on 0 (chain is symmetric)
    const u = [];
    for (let i = 0; i < N; i++) u.push((i - (N - 1) / 2) * 2.0);
    if (N === 1) { this._u = [0]; return [0]; }

    for (let it = 0; it < maxIter; it++) {
      const { f, A } = IonChain._forceAndHessian(u);
      const rhs = f.map((x) => [-x]);
      const dx = math.lusolve(math.matrix(A), math.matrix(rhs)).toArray().map((r) => r[0]);
      let step = 0;
      for (let i = 0; i < N; i++) { u[i] += dx[i]; step = Math.max(step, Math.abs(dx[i])); }
      if (step < tol) break;
    }
    u.sort((p, q) => p - q);
    this._u = u;
    return u;
  }

  // ---- analytic two-ion spacing check --------------------------------------
  //   equilibrium: u³ = 1/4 ⇒ positions ±(1/4)^(1/3) ⇒ spacing = 2^(1/3)
  //   physical: d = 2^(1/3)·ℓ = (e²/(2πε₀ m ω_z²))^(1/3)
  static twoIonSpacingAnalytic() { return Math.cbrt(2); }

  twoIonSpacingNewton() {
    const u = this.equilibrium(2);
    return u[1] - u[0];
  }

  // ---- James Hessian at the (solved) equilibrium ----------------------------
  hessian(N = this.N) {
    const u = this._u && this._u.length === N ? this._u : this.equilibrium(N);
    return IonChain._forceAndHessian(u).A;
  }

  // ==========================================================================
  // Axial normal modes: eigendecompose the Hessian. Frequencies = √λ·ω_z (in
  // units of ω_z, so the COM comes out at exactly 1). Eigenvectors are the mode
  // SHAPES: COM = all ions in phase, stretch = out of phase, etc. Returned sorted
  // by ascending frequency (COM first).
  // ==========================================================================
  modes(N = this.N) {
    const positions = this._u && this._u.length === N ? this._u : this.equilibrium(N);
    const A = IonChain._forceAndHessian(positions).A;

    if (N === 1) {
      return {
        positions: [0],
        modes: [{ eigenvalue: 1, freq: 1, vector: [1] }],
        eigenvalues: [1], frequencies: [1],
      };
    }

    const res = math.eigs(math.matrix(A));
    const vals = res.values.toArray().map((v) => (typeof v === 'object' ? v.re : v));
    const vecs = res.eigenvectors.map((e) => ({
      value: typeof e.value === 'object' ? e.value.re : e.value,
      vector: e.vector.toArray().map((c) => (typeof c === 'object' ? c.re : c)),
    }));
    // math.eigs already returns ascending eigenvalues; pair + re-sort defensively.
    const paired = vecs.map((e, i) => ({ eigenvalue: vals[i], vector: e.vector }));
    paired.sort((p, q) => p.eigenvalue - q.eigenvalue);

    const modes = paired.map((p) => ({
      eigenvalue: p.eigenvalue,
      freq: Math.sqrt(Math.max(0, p.eigenvalue)),   // in units of ω_z
      vector: normalizeSign(p.vector),
    }));
    return {
      positions,
      modes,
      eigenvalues: modes.map((m) => m.eigenvalue),
      frequencies: modes.map((m) => m.freq),
    };
  }

  // ==========================================================================
  // Zigzag threshold (physical linear-chain limit). The transverse (radial)
  // Hessian is  B = α·I − C,  where α = (ω_x/ω_z)²  and  C = (A − I)/2  (James).
  // The chain stays linear while min eig(B) ≥ 0, i.e. α ≥ λ_max(C) = (λ_max(A)−1)/2.
  // So the critical transverse/axial ratio is (ω_x/ω_z)_crit = √((λ_max(A)−1)/2):
  // drop the radial confinement below this and the lowest transverse mode goes
  // soft → the chain buckles into a zigzag. Derived from the SAME Hessian, not a
  // fitted formula. (For N=2 this gives exactly 1.)
  // ==========================================================================
  zigzagCriticalRatio(N = this.N) {
    const A = this.hessian(N);
    const vals = math.eigs(math.matrix(A)).values.toArray()
      .map((v) => (typeof v === 'object' ? v.re : v));
    const lamMax = Math.max(...vals);
    return Math.sqrt(Math.max(0, (lamMax - 1) / 2));
  }

  // ---- OPTIONAL physical length scale ℓ = (e²/(4πε₀ m ω_z²))^(1/3) -----------
  static lengthScale({ massU = 40, omegaZ }) {
    const m = massU * CONST.u;
    return Math.cbrt(CONST.e * CONST.e / (4 * Math.PI * CONST.eps0 * m * omegaZ * omegaZ));
  }
}

// Fix each eigenvector's global sign so the first non-tiny entry is positive
// (eigensolvers return an arbitrary sign; this makes mode shapes reproducible).
function normalizeSign(v) {
  for (let i = 0; i < v.length; i++) {
    if (Math.abs(v[i]) > 1e-9) return v[i] < 0 ? v.map((x) => -x) : v.slice();
  }
  return v.slice();
}
