// =============================================================================
// quantum.js — REAL quantum density-matrix engine for a 3-spin-1/2 NMR system.
//
// This REPLACES the old classical single-vector Bloch engine (src/physics.js).
// It integrates the Lindblad master equation for an 8x8 density matrix rho with
// an RK4 stepper, supports instantaneous RF pulses, J-coupling (ZZ) evolution,
// T1/T2 relaxation, and QRC-style encoding.
//
// Conventions (ħ = 1, angular frequencies in rad/s = 2π·Hz, time in seconds):
//   3 spin-1/2 nuclei:  index 0 = ¹H, 1 = ³¹P, 2 = ¹⁹F.  Hilbert dim = 8.
//   Basis:  |0> = up (σz = +1),  |1> = down (σz = −1).
//   Tensor order is (H, P, F): spin 0 is the most-significant tensor factor.
//
// Linear algebra is done with math.js (complex dense matrices). We keep the
// hot RK4 path on plain nested Complex arrays for speed.
// =============================================================================

import { create, all } from 'mathjs';
const math = create(all);

// ---------------------------------------------------------------------------
// Canonical SPINQ Gemini Lab parameters (see CLAUDE.md SPINQ_PARAMS).
//   T1/T2 in seconds. J values in Hz are PHYSICAL couplings.
//   `offset_Hz` (ν) is a DISPLAY precession rate in the rotating frame — the
//   real MHz Larmor frequencies are far too fast to visualize, so we substitute
//   small chemical-shift-like offsets. These are a DISPLAY parameter, kept
//   clearly separate from the physical J couplings.
// ---------------------------------------------------------------------------
export const SPINQ_PARAMS = {
  nuclei: [
    { symbol: '¹H',  name: 'Hydrogen',   T1: 5.0, T2: 0.20, color: 0x4A90D9, offset_Hz: 12 },
    { symbol: '³¹P', name: 'Phosphorus', T1: 4.5, T2: 0.15, color: 0x50C878, offset_Hz: 20 },
    { symbol: '¹⁹F', name: 'Fluorine',   T1: 6.0, T2: 0.25, color: 0xFF8C00, offset_Hz: 30 },
  ],
  // Physical scalar J-couplings (Hz).
  couplings: [
    { pair: 'H-P', i: 0, j: 1, J_Hz: 42  },
    { pair: 'H-F', i: 0, j: 2, J_Hz: 220 },
    { pair: 'P-F', i: 1, j: 2, J_Hz: 430 },
  ],
  B0_T: 1.084,
};

const N_SPINS = 3;
const DIM = 8;                 // 2^3
const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Fast complex-matrix core.
//
// An 8x8 complex matrix is stored as a flat Float64Array of length 2·DIM·DIM
// (= 128), interleaved [re, im]: element (i,j) lives at index 2·(i·DIM + j)
// (real) and +1 (imag). Flat typed arrays avoid per-element object allocation
// and keep the RK4 hot loop (~a dozen 8x8 multiplies per step) cache-friendly
// and GC-free — essential for real-time (~30 fps) stepping in the browser.
//
// Small helper matrices (2x2 single-qubit ops, kron results) still use nested
// {re,im} arrays for readability; those are only touched at setup time.
// ---------------------------------------------------------------------------
const MLEN = 2 * DIM * DIM;                 // 128
const IDX = (i, j) => 2 * (i * DIM + j);    // real index; imag = +1

function zerosF() { return new Float64Array(MLEN); }

// C = A·B  (complex 8x8 matrix product) into out (or a fresh array).
function mmul(A, B, out) {
  const C = out || zerosF();
  C.fill(0);
  for (let i = 0; i < DIM; i++) {
    const iB = i * DIM;
    for (let k = 0; k < DIM; k++) {
      const aIdx = 2 * (iB + k);
      const ar = A[aIdx], ai = A[aIdx + 1];
      if (ar === 0 && ai === 0) continue;
      const kB = k * DIM;
      for (let j = 0; j < DIM; j++) {
        const bIdx = 2 * (kB + j);
        const br = B[bIdx], bi = B[bIdx + 1];
        const cIdx = 2 * (iB + j);
        C[cIdx]     += ar * br - ai * bi;
        C[cIdx + 1] += ar * bi + ai * br;
      }
    }
  }
  return C;
}

// A† (conjugate transpose).
function daggerF(A, out) {
  const C = out || zerosF();
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const s = IDX(i, j), d = IDX(j, i);
      C[d] = A[s]; C[d + 1] = -A[s + 1];
    }
  return C;
}

// C = A + s·B  (s real). If out omitted, fresh array.
function axpyF(A, B, s, out) {
  const C = out || zerosF();
  for (let n = 0; n < MLEN; n++) C[n] = A[n] + s * B[n];
  return C;
}
// C = s·A.
function scaleF(A, s, out) {
  const C = out || zerosF();
  for (let n = 0; n < MLEN; n++) C[n] = s * A[n];
  return C;
}
function cloneF(A) { return Float64Array.from(A); }

// ---------------------------------------------------------------------------
// Single-qubit operators as 2x2 complex arrays (setup-time only).
// ---------------------------------------------------------------------------
const R2 = (re, im = 0) => ({ re, im });
const I2  = [[R2(1), R2(0)], [R2(0), R2(1)]];
const SX  = [[R2(0), R2(1)], [R2(1), R2(0)]];
const SY  = [[R2(0), R2(0, -1)], [R2(0, 1), R2(0)]];
const SZ  = [[R2(1), R2(0)], [R2(0), R2(-1)]];
// Raise-to-up operator R = |0><1| = [[0,1],[0,0]] : takes |1> (down) -> |0> (up).
const RUP = [[R2(0), R2(1)], [R2(0), R2(0)]];

function cMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }

// Kronecker product of two nested-array complex matrices (arbitrary size).
function kron(A, B) {
  const ar = A.length, ac = A[0].length, br = B.length, bc = B[0].length;
  const C = [];
  for (let i = 0; i < ar * br; i++) {
    C[i] = [];
    for (let j = 0; j < ac * bc; j++) C[i][j] = { re: 0, im: 0 };
  }
  for (let ia = 0; ia < ar; ia++)
    for (let ja = 0; ja < ac; ja++) {
      const a = A[ia][ja];
      for (let ib = 0; ib < br; ib++)
        for (let jb = 0; jb < bc; jb++)
          C[ia * br + ib][ja * bc + jb] = cMul(a, B[ib][jb]);
    }
  return C;
}

// Convert a nested 8x8 {re,im} array to a flat Float64Array.
function toFlat(nested) {
  const f = zerosF();
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const e = nested[i][j];
      const idx = IDX(i, j);
      f[idx] = e.re; f[idx + 1] = e.im;
    }
  return f;
}

// Embed single-qubit operator `op` on spin `k` (tensor order H,P,F), I2 elsewhere,
// returning a flat 8x8. e.g. embed(SZ, 1) = I2 ⊗ σz ⊗ I2.
function embed(op, k) {
  let m = (k === 0) ? op : I2;
  for (let s = 1; s < N_SPINS; s++) {
    m = kron(m, s === k ? op : I2);
  }
  return toFlat(m);
}

// Precompute the embedded Pauli/relaxation operators for each spin.
const SXk = [], SYk = [], SZk = [], RUPk = [];
for (let k = 0; k < N_SPINS; k++) {
  SXk[k]  = embed(SX,  k);
  SYk[k]  = embed(SY,  k);
  SZk[k]  = embed(SZ,  k);
  RUPk[k] = embed(RUP, k);
}

// Iz^(k) = σz^(k) / 2  (flat 8x8).
function Izk(k) { return scaleF(SZk[k], 0.5); }

// ---------------------------------------------------------------------------
// exp(−i (α/2) σ_a) for a single qubit, as an explicit 2x2 rotation matrix.
//   Rn(α) = cos(α/2) I − i sin(α/2) σ_a.
// ---------------------------------------------------------------------------
function singleRot(angle, axis) {
  const c = Math.cos(angle / 2);
  const s = Math.sin(angle / 2);
  // −i·s·σ_a
  let sigma;
  if (axis === 'x') sigma = SX;
  else if (axis === 'y') sigma = SY;
  else if (axis === 'z') sigma = SZ;
  else throw new Error(`unknown axis ${axis}`);
  const U = [[R2(0), R2(0)], [R2(0), R2(0)]];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      // cos term (only on diagonal via I) + (−i s) σ
      const cosRe = (i === j) ? c : 0;
      const sig = sigma[i][j];
      // −i·s·sig = s·(sig.im − i·sig.re)  → re: s*sig.im, im: −s*sig.re
      U[i][j] = { re: cosRe + s * sig.im, im: -s * sig.re };
    }
  return U; // nested 2x2
}

// ---------------------------------------------------------------------------
// Trace(A) and Trace(A·B) helpers.
// ---------------------------------------------------------------------------
function trace(A) {
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += A[d]; im += A[d + 1]; }
  return { re, im };
}
// Tr(A·B) without forming the full product (sum over i,j of A_ij B_ji), flat.
function traceProd(A, B) {
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const ai = IDX(i, j), bi = IDX(j, i);
      const ar = A[ai], aii = A[ai + 1], br = B[bi], bii = B[bi + 1];
      re += ar * br - aii * bii;
      im += ar * bii + aii * br;
    }
  return { re, im };
}

// =============================================================================
// QuantumSpinSystem — the engine.
// =============================================================================
export class QuantumSpinSystem {
  constructor(opts = {}) {
    this.params = SPINQ_PARAMS;
    this.coupling = opts.coupling !== undefined ? opts.coupling : true;
    this.relaxation = opts.relaxation !== undefined ? opts.relaxation : true;

    // Precompute collapse operators c and c†c per the Lindblad spec.
    //   c1_k = sqrt(1/T1_k) · R^(k)                        (amplitude relaxation, Mz→+1)
    //   c2_k = sqrt(Γφ_k/2) · σz^(k),  Γφ_k = max(0, 1/T2_k − 1/(2 T1_k))
    this.collapse = [];      // { c, cdag, cdagc } list (flat 8x8)
    for (let k = 0; k < N_SPINS; k++) {
      const { T1, T2 } = this.params.nuclei[k];
      const gAmp = 1 / T1;
      const c1 = scaleF(RUPk[k], Math.sqrt(gAmp));
      this._pushCollapse(c1);

      const gPhi = Math.max(0, 1 / T2 - 1 / (2 * T1));
      if (gPhi > 0) {
        const c2 = scaleF(SZk[k], Math.sqrt(gPhi / 2));
        this._pushCollapse(c2);
      }
    }

    // Preallocated scratch buffers for the RK4 hot path (no per-step GC).
    this._k1 = zerosF(); this._k2 = zerosF(); this._k3 = zerosF(); this._k4 = zerosF();
    this._tmp = zerosF(); this._tmp2 = zerosF(); this._y = zerosF();
    this._Hrho = zerosF(); this._rhoH = zerosF();
    this._m1 = zerosF(); this._m2 = zerosF();

    this._buildHamiltonian();
    this.reset();
  }

  _pushCollapse(c) {
    const cdag = daggerF(c);
    const cdagc = mmul(cdag, c);
    this.collapse.push({ c, cdag, cdagc });
  }

  // H = Σ_k 2π·ν_k·Iz^(k) + [coupling] Σ_{i<j} 2π·J_ij·Iz^(i)·Iz^(j).
  // Weak/heteronuclear secular coupling: ONLY the ZZ term (correct for
  // different nuclei). Rebuilt whenever the coupling toggle changes.
  _buildHamiltonian() {
    let H = zerosF();
    // Chemical-shift / display-offset term.
    for (let k = 0; k < N_SPINS; k++) {
      const w = TWO_PI * this.params.nuclei[k].offset_Hz;
      H = axpyF(H, Izk(k), w);
    }
    // ZZ J-coupling term.
    if (this.coupling) {
      for (const cp of this.params.couplings) {
        const wJ = TWO_PI * cp.J_Hz;
        const IziIzj = mmul(Izk(cp.i), Izk(cp.j)); // Iz^(i)·Iz^(j)
        H = axpyF(H, IziIzj, wJ);
      }
    }
    this.H = H;

    // Choose a stability-limited internal sub-step. The spec asks for ~0.5 ms,
    // but RK4 error on the coherent part scales like (ω·h)^5 where ω is the
    // largest Hamiltonian frequency. With the physical couplings (J_PF=430 Hz,
    // J_HF=220 Hz) the fastest eigen-splitting reaches a few hundred Hz, and a
    // flat 0.5 ms step lets ~3% of the total purity leak over 0.3 s of unitary
    // evolution. We therefore cap the sub-step at min(0.5 ms, 1/(100·f_max)),
    // where f_max is an upper bound on |H|/(2π) (Gershgorin row-sum bound). This
    // keeps ~0.5 ms when frequencies are small and tightens automatically when
    // the ZZ couplings are active, preserving purity to <1e-6 in the tests.
    let rowMax = 0;
    for (let i = 0; i < DIM; i++) {
      let s = 0;
      for (let j = 0; j < DIM; j++) { const idx = IDX(i, j); s += Math.hypot(H[idx], H[idx + 1]); }
      if (s > rowMax) rowMax = s;
    }
    const fMax = rowMax / TWO_PI;                 // Hz upper bound on |H|
    const stabStep = fMax > 0 ? 1 / (100 * fMax) : Infinity;
    this.subStep = Math.min(0.0005, stabStep);
  }

  // Toggle J-coupling and rebuild H.
  setCoupling(on) {
    if (this.coupling === on) return;
    this.coupling = on;
    this._buildHamiltonian();
  }

  setRelaxation(on) { this.relaxation = on; }

  // Initial state: thermal-equilibrium approximation = all spins up = |000><000|.
  reset() {
    this.t = 0;
    const m = zerosF();
    m[IDX(0, 0)] = 1;      // |000><000|
    this.rhoM = m;
  }

  // -------------------------------------------------------------------------
  // Lindblad RHS:  dρ/dt = −i[H,ρ] + Σ_c ( c ρ c† − ½(c†c ρ + ρ c†c) ).
  // Writes the result into `out` (flat 8x8). `withRelax` controls whether
  // collapse ops are included (OFF ⇒ pure unitary evolution).
  // -------------------------------------------------------------------------
  _rhs(rho, withRelax, out) {
    const H = this.H;
    // Coherent part: −i[H,ρ] = −i(Hρ − ρH).
    const Hrho = mmul(H, rho, this._Hrho);
    const rhoH = mmul(rho, H, this._rhoH);
    // out = −i·(Hrho − rhoH). For a complex z, −i·z has re = z.im, im = −z.re.
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        const cr = Hrho[idx] - rhoH[idx];       // commutator re
        const ci = Hrho[idx + 1] - rhoH[idx + 1]; // commutator im
        out[idx] = ci;        // re of −i·comm
        out[idx + 1] = -cr;   // im of −i·comm
      }

    if (withRelax) {
      for (const { c, cdag, cdagc } of this.collapse) {
        // c ρ c†
        const crho = mmul(c, rho, this._m1);
        const cRhoCd = mmul(crho, cdag, this._m2);      // into _m2
        // ½(c†c ρ + ρ c†c)
        const t1 = mmul(cdagc, rho, this._tmp);
        const t2 = mmul(rho, cdagc, this._tmp2);
        // out += cRhoCd − ½(t1 + t2)
        for (let n = 0; n < MLEN; n++)
          out[n] += cRhoCd[n] - 0.5 * (t1[n] + t2[n]);
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // step(dt, {relaxation, coupling}) — advance ρ by dt seconds.
  // Uses a fixed internal sub-step of ~0.5 ms (SUB, capped for stability) and
  // RK4; any larger dt is subdivided. Optional per-call overrides.
  // -------------------------------------------------------------------------
  step(dt, opts = {}) {
    if (opts.relaxation !== undefined) this.setRelaxation(opts.relaxation);
    if (opts.coupling !== undefined) this.setCoupling(opts.coupling);

    const SUB = this.subStep;           // ~0.5 ms, capped for stability (see _buildHamiltonian)
    const withRelax = this.relaxation;
    let remaining = dt;
    while (remaining > 1e-12) {
      const h = Math.min(SUB, remaining);
      this._rk4(h, withRelax);
      remaining -= h;
    }
    this.t += dt;
    // Re-Hermitize to suppress tiny numerical asymmetry accumulation.
    this._hermitize();
  }

  // One RK4 sub-step, in place on this.rhoM using preallocated scratch.
  _rk4(h, withRelax) {
    const rho = this.rhoM;
    // Note: _y is a dedicated buffer, distinct from _rhs's internal scratch
    // (_tmp/_tmp2/_Hrho/_rhoH/_m1/_m2), so intermediate states are not clobbered.
    const k1 = this._rhs(rho, withRelax, this._k1);
    let y = axpyF(rho, k1, h / 2, this._y);        // y2 = rho + (h/2)k1
    const k2 = this._rhs(y, withRelax, this._k2);
    y = axpyF(rho, k2, h / 2, this._y);            // y3 = rho + (h/2)k2
    const k3 = this._rhs(y, withRelax, this._k3);
    y = axpyF(rho, k3, h, this._y);                // y4 = rho + h·k3
    const k4 = this._rhs(y, withRelax, this._k4);
    // rho += (h/6)(k1 + 2k2 + 2k3 + k4)
    const c = h / 6;
    for (let n = 0; n < MLEN; n++)
      rho[n] += c * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]);
  }

  // Force ρ = (ρ + ρ†)/2 to kill accumulated round-off asymmetry.
  _hermitize() {
    const r = this.rhoM;
    for (let i = 0; i < DIM; i++)
      for (let j = i; j < DIM; j++) {
        const a = IDX(i, j), b = IDX(j, i);
        const re = 0.5 * (r[a] + r[b]);
        const imUp = 0.5 * (r[a + 1] - r[b + 1]);
        r[a] = re; r[a + 1] = imUp;
        r[b] = re; r[b + 1] = -imUp;
      }
  }

  // -------------------------------------------------------------------------
  // RF pulse: instantaneous unitary. U = exp(−i(α/2)σ_a) on each target spin
  // (identity elsewhere), ρ → U ρ U†. target = spin index or 'all'.
  // -------------------------------------------------------------------------
  applyPulse(target, angleRadians, axis = 'x') {
    const rot2 = singleRot(angleRadians, axis);
    const targets = (target === 'all')
      ? [0, 1, 2]
      : [target];

    // Build the full 8x8 unitary as the tensor product of per-spin 2x2 blocks.
    const blocks = [I2, I2, I2];
    for (const k of targets) blocks[k] = rot2;
    let Un = blocks[0];
    for (let s = 1; s < N_SPINS; s++) Un = kron(Un, blocks[s]);
    const U = toFlat(Un);

    const Udag = daggerF(U);
    const UR = mmul(U, this.rhoM);
    this.rhoM = mmul(UR, Udag);
    this._hermitize();
  }

  // QRC encoding: s∈[0,1] ⇒ θ = arcsin(√s) ⇒ applyPulse(target, θ, 'x'); return θ.
  encode(s, target = 'all') {
    const clamped = Math.max(0, Math.min(1, s));
    const theta = Math.asin(Math.sqrt(clamped));
    this.applyPulse(target, theta, 'x');
    return theta;
  }

  // -------------------------------------------------------------------------
  // Observables.
  //   blochVector(k) = { x: Tr(ρ σx^(k)), y: Tr(ρ σy^(k)), z: Tr(ρ σz^(k)) }
  // Real parts (imag is ~0 for Hermitian ρ and Hermitian σ). Range [−1,1].
  // -------------------------------------------------------------------------
  blochVector(k) {
    return {
      x: traceProd(this.rhoM, SXk[k]).re,
      y: traceProd(this.rhoM, SYk[k]).re,
      z: traceProd(this.rhoM, SZk[k]).re,
    };
  }

  blochVectors() {
    const out = [];
    for (let k = 0; k < N_SPINS; k++) out.push(this.blochVector(k));
    return out;
  }

  // Complex FID: fid() = Σ_k (bx^(k) + i·by^(k)).
  fid() {
    let real = 0, imag = 0;
    for (let k = 0; k < N_SPINS; k++) {
      const b = this.blochVector(k);
      real += b.x;
      imag += b.y;
    }
    return { real, imag };
  }

  // Raw ρ as a math.js complex matrix (for a heatmap / external analysis).
  rho() {
    const data = [];
    for (let i = 0; i < DIM; i++) {
      data[i] = [];
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        data[i][j] = math.complex(this.rhoM[idx], this.rhoM[idx + 1]);
      }
    }
    return math.matrix(data);
  }

  // |ρ| magnitudes as a plain 8x8 number array (fast path for the heatmap).
  rhoAbs() {
    const out = [];
    for (let i = 0; i < DIM; i++) {
      out[i] = [];
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        out[i][j] = Math.hypot(this.rhoM[idx], this.rhoM[idx + 1]);
      }
    }
    return out;
  }

  // Purity Tr(ρ²) (real). Useful for diagnostics/tests.
  purity() {
    return traceProd(this.rhoM, this.rhoM).re;
  }

  // Trace of ρ (should be 1).
  traceRho() {
    return trace(this.rhoM);
  }
}

// Export a few internals for testing (eigenvalues, hermiticity checks).
export const _internal = { math, DIM, N_SPINS };
