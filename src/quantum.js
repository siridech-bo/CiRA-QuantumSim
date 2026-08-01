// =============================================================================
// quantum.js — REAL quantum density-matrix engine for an ARBITRARY n-spin-1/2
// NMR system, driven by a MOLECULE record (src/molecules.js).
//
// It integrates the Lindblad master equation for a 2^n × 2^n density matrix rho
// with an RK4 stepper, supports instantaneous + finite-duration RF pulses,
// weak-coupling (secular ZZ) J-coupling evolution, T1/T2 relaxation, and QRC-
// style encoding.
//
// GENERALIZATION (Phase 1): the engine was originally hardcoded to a fixed
// 3-spin (¹H/³¹P/¹⁹F) system. It now builds all operators/Hamiltonian/collapse
// from a Molecule of any n (dim = 2^n). BACKWARD COMPATIBILITY is preserved:
// `new QuantumSpinSystem()` with NO molecule defaults to the original 3-spin
// SpinQ demo and behaves IDENTICALLY (legacy tests pass unchanged).
//
// SCOPE: heteronuclear (weak) AND homonuclear (weak). Homonuclear molecules use
// their REAL chemical-shift offsets as rotating-frame detunings and realize
// single-qubit gates via frequency-selective SOFT pulses — see softPulse()
// below. The full isotropic (flip-flop) J Hamiltonian is ALSO supported per
// molecule via couplingModel:'full' (for future strongly-coupled systems); no
// shipped molecule uses it. See docs/multi-molecule-extension-plan.md §Phase 2.
//
// PERFORMANCE — diagonal-H optimization: for weak heteronuclear coupling the
// Hamiltonian H = Σ 2π ν_k Iz_k + Σ 2π J_ij Iz_i Iz_j is DIAGONAL. We precompute
// its diagonal energies E and evaluate the coherent commutator ELEMENTWISE:
//   [H,ρ]_ij = (E_i − E_j) ρ_ij   (O(dim²) instead of a dense O(dim³) matmul).
// Numerically identical (~1e-10) to the dense reference (tested). During an RF
// pulse H is no longer diagonal (H_rf added), so we fall back to the dense
// commutator path for that op.
// TODO (Phase 3): statevector fast path when relaxation is OFF (evolve a 2^n
// complex vector under Schrödinger, O(dim²)); default for n≥5.
// TODO (Phase 2): homonuclear full isotropic J (IxIx+IyIy+IzIz flip-flop) —
// H becomes non-diagonal even for delays; the dense path already handles it.
//
// Conventions (ħ = 1, angular frequencies in rad/s = 2π·Hz, time in seconds):
//   n spin-1/2 nuclei; Hilbert dim = 2^n.
//   Basis:  |0> = up (σz = +1),  |1> = down (σz = −1).
//   Tensor order: spin 0 is the MOST-significant tensor factor. Basis index
//   b = Σ_k q_k · 2^(n−1−k). (For n=3: b = 4·q0 + 2·q1 + q2, as before.)
//
// The hot RK4 path uses plain flat Float64Array (interleaved [re,im]).
// =============================================================================

import { create, all } from 'mathjs';
import { defaultMolecule } from './molecules.js';
const math = create(all);

const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Legacy SPINQ Gemini parameters (kept for backward compatibility with any code
// that imports SPINQ_PARAMS — gates.js used to; tests still may). This mirrors
// the DEFAULT molecule's data in the ORIGINAL shape. Physics unchanged.
// ---------------------------------------------------------------------------
export const SPINQ_PARAMS = {
  nuclei: [
    { symbol: '¹H',  name: 'Hydrogen',   T1: 5.0, T2: 0.20, color: 0x4A90D9, offset_Hz: 12 },
    { symbol: '³¹P', name: 'Phosphorus', T1: 4.5, T2: 0.15, color: 0x50C878, offset_Hz: 20 },
    { symbol: '¹⁹F', name: 'Fluorine',   T1: 6.0, T2: 0.25, color: 0xFF8C00, offset_Hz: 30 },
  ],
  couplings: [
    { pair: 'H-P', i: 0, j: 1, J_Hz: 42  },
    { pair: 'H-F', i: 0, j: 2, J_Hz: 220 },
    { pair: 'P-F', i: 1, j: 2, J_Hz: 430 },
  ],
  B0_T: 1.084,
};

// ---------------------------------------------------------------------------
// Single-qubit 2x2 complex operators (nested {re,im}; setup-time only).
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

// ---------------------------------------------------------------------------
// exp(−i (α/2) σ_a) for a single qubit, as an explicit 2x2 rotation matrix.
//   Rn(α) = cos(α/2) I − i sin(α/2) σ_a.
// ---------------------------------------------------------------------------
function singleRot(angle, axis) {
  const c = Math.cos(angle / 2);
  const s = Math.sin(angle / 2);
  let sigma;
  if (axis === 'x') sigma = SX;
  else if (axis === 'y') sigma = SY;
  else if (axis === 'z') sigma = SZ;
  else throw new Error(`unknown axis ${axis}`);
  const U = [[R2(0), R2(0)], [R2(0), R2(0)]];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const cosRe = (i === j) ? c : 0;
      const sig = sigma[i][j];
      // −i·s·sig = s·(sig.im − i·sig.re)
      U[i][j] = { re: cosRe + s * sig.im, im: -s * sig.re };
    }
  return U; // nested 2x2
}

// =============================================================================
// QuantumSpinSystem — the engine.
//
// Construction:
//   new QuantumSpinSystem()                          → default 3-spin molecule
//   new QuantumSpinSystem({ relaxation, coupling })  → default molecule + opts
//   new QuantumSpinSystem({ molecule, relaxation, coupling, omega1 })
//   QuantumSpinSystem.fromMolecule(mol, opts)
// =============================================================================
export class QuantumSpinSystem {
  static fromMolecule(molecule, opts = {}) {
    return new QuantumSpinSystem({ ...opts, molecule });
  }

  constructor(opts = {}) {
    // ---- resolve the active molecule ----
    const molecule = opts.molecule || defaultMolecule();
    this.molecule = molecule;

    const n = molecule.nuclei.length;
    this.nSpins = n;
    this.dim = 1 << n;                     // 2^n
    this.mlen = 2 * this.dim * this.dim;

    // Per-instance flat-matrix constants (index of element (i,j)).
    const DIM = this.dim;
    this._IDX = (i, j) => 2 * (i * DIM + j);

    // Keep a legacy `params` view for any external code that reads it (e.g.
    // tests zeroing offsets). Backed by the molecule.
    this.params = {
      nuclei: molecule.nuclei.map((nu) => ({
        symbol: nu.label, T1: nu.T1, T2: nu.T2, color: nu.color, offset_Hz: nu.offsetHz,
      })),
      couplings: this._couplingsList(),
      B0_T: molecule.field_T,
    };

    this.coupling = opts.coupling !== undefined ? opts.coupling : true;
    this.relaxation = opts.relaxation !== undefined ? opts.relaxation : true;

    // couplingModel: 'weak' (secular ZZ only; H diagonal ⇒ fast path) or 'full'
    // (isotropic IxIx+IyIy+IzIz flip-flop; H non-diagonal ⇒ dense path forced).
    // Defaults to the molecule's declared model; overridable via opts for tests.
    this.couplingModel = opts.couplingModel || molecule.couplingModel || 'weak';

    // Is this a homonuclear molecule (shared RF channel)? Governs soft-pulse
    // frame handling; hard rfPulse still works for either.
    this.addressing = molecule.addressing || 'hetero';

    // Default RF nutation rate omega1 (rad/s) for compiled selective pulses.
    // omega1/2π = 8 kHz ⇒ a 90° pulse is t_90 ≈ 31 µs (matches gates.js).
    this.defaultOmega1 = opts.omega1 !== undefined ? opts.omega1 : TWO_PI * 8000;

    // Build embedded single-spin Pauli / relaxation operators for THIS n.
    this._buildEmbeddedOps();

    // Precompute collapse operators c and c†c per the Lindblad spec.
    //   c1_k = sqrt(1/T1_k) · R^(k)                (amplitude relaxation, Mz→+1)
    //   c2_k = sqrt(Γφ_k/2) · σz^(k),  Γφ_k = max(0, 1/T2_k − 1/(2 T1_k))
    this.collapse = [];
    for (let k = 0; k < n; k++) {
      const { T1, T2 } = molecule.nuclei[k];
      const gAmp = 1 / T1;
      this._pushCollapse(this._scaleF(this.RUPk[k], Math.sqrt(gAmp)));

      const gPhi = Math.max(0, 1 / T2 - 1 / (2 * T1));
      if (gPhi > 0) {
        this._pushCollapse(this._scaleF(this.SZk[k], Math.sqrt(gPhi / 2)));
      }
    }

    // Preallocated scratch buffers for the RK4 hot path (no per-step GC).
    this._k1 = this._zerosF(); this._k2 = this._zerosF(); this._k3 = this._zerosF(); this._k4 = this._zerosF();
    this._tmp = this._zerosF(); this._tmp2 = this._zerosF(); this._y = this._zerosF();
    this._Hrho = this._zerosF(); this._rhoH = this._zerosF();
    this._m1 = this._zerosF(); this._m2 = this._zerosF();

    // Per-spin rotating-frame z-shift (Hz), used transiently by softPulse().
    // null ⇒ no shift (the normal case).
    this._frameShiftHz = null;

    this._buildHamiltonian();
    this.reset();
  }

  // Active molecule accessor.
  getMolecule() { return this.molecule; }

  // Legacy couplings list (i, j, J_Hz) derived from the molecule's J matrix.
  _couplingsList() {
    const out = [];
    const J = this.molecule.J;
    const n = this.molecule.nuclei.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (J[i][j] !== 0) out.push({ i, j, J_Hz: J[i][j] });
    return out;
  }

  // -------------------------------------------------------------------------
  // Flat complex-matrix core (dim-aware; interleaved [re,im]).
  // -------------------------------------------------------------------------
  _zerosF() { return new Float64Array(this.mlen); }

  // C = A·B (dense complex matrix product) into out (or fresh).
  _mmul(A, B, out) {
    const DIM = this.dim;
    const C = out || this._zerosF();
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
  _daggerF(A, out) {
    const DIM = this.dim, IDX = this._IDX;
    const C = out || this._zerosF();
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const s = IDX(i, j), d = IDX(j, i);
        C[d] = A[s]; C[d + 1] = -A[s + 1];
      }
    return C;
  }

  // C = A + s·B (s real).
  _axpyF(A, B, s, out) {
    const C = out || this._zerosF();
    const L = this.mlen;
    for (let nI = 0; nI < L; nI++) C[nI] = A[nI] + s * B[nI];
    return C;
  }

  // C = s·A.
  _scaleF(A, s, out) {
    const C = out || this._zerosF();
    const L = this.mlen;
    for (let nI = 0; nI < L; nI++) C[nI] = s * A[nI];
    return C;
  }

  // Convert a nested dim×dim {re,im} array to a flat Float64Array.
  _toFlat(nested) {
    const DIM = this.dim, IDX = this._IDX;
    const f = this._zerosF();
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const e = nested[i][j];
        const idx = IDX(i, j);
        f[idx] = e.re; f[idx + 1] = e.im;
      }
    return f;
  }

  // Embed single-qubit operator `op` on spin `k` (I2 elsewhere), tensor order
  // spin0 = most-significant factor, returning a flat dim×dim.
  _embed(op, k) {
    const n = this.nSpins;
    let m = (k === 0) ? op : I2;
    for (let s = 1; s < n; s++) m = kron(m, s === k ? op : I2);
    return this._toFlat(m);
  }

  // Precompute embedded Pauli/relaxation operators for each spin.
  _buildEmbeddedOps() {
    const n = this.nSpins;
    this.SXk = []; this.SYk = []; this.SZk = []; this.RUPk = [];
    for (let k = 0; k < n; k++) {
      this.SXk[k]  = this._embed(SX,  k);
      this.SYk[k]  = this._embed(SY,  k);
      this.SZk[k]  = this._embed(SZ,  k);
      this.RUPk[k] = this._embed(RUP, k);
    }
  }

  // Iz^(k) = σz^(k)/2 (flat dim×dim).
  _Izk(k) { return this._scaleF(this.SZk[k], 0.5); }

  _pushCollapse(c) {
    const cdag = this._daggerF(c);
    const cdagc = this._mmul(cdag, c);
    this.collapse.push({ c, cdag, cdagc });
  }

  // Trace helpers.
  _trace(A) {
    const DIM = this.dim, IDX = this._IDX;
    let re = 0, im = 0;
    for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += A[d]; im += A[d + 1]; }
    return { re, im };
  }
  // Tr(A·B) = Σ_ij A_ij B_ji.
  _traceProd(A, B) {
    const DIM = this.dim, IDX = this._IDX;
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

  // -------------------------------------------------------------------------
  // H = Σ_k 2π·(ν_k + frameShift_k)·Iz^(k) + [coupling] H_J.
  //
  // couplingModel 'weak' (default): H_J = Σ_{i<j} 2π·J_ij·Iz^(i)·Iz^(j) — the
  // secular ZZ term. Valid for heteronuclear AND weakly-coupled homonuclear
  // (|Δν| >> |J|). H is DIAGONAL ⇒ we cache diagonal energies E_i for the fast
  // O(dim²) elementwise commutator.
  //
  // couplingModel 'full': H_J = Σ_{i<j} 2π·J_ij·(IxIx+IyIy+IzIz) — the isotropic
  // scalar coupling WITH flip-flop terms (for future strongly-coupled systems).
  // This is NON-diagonal ⇒ the diagonal fast path is disabled and the dense
  // commutator is used even for free evolution. No shipped molecule uses it.
  //
  // frameShift (this._frameShiftHz, default all-zero) lets softPulse() work in a
  // target spin's rotating frame by adding a per-spin z-offset without touching
  // the molecule data. It is restored to zero after each soft pulse.
  // -------------------------------------------------------------------------
  _buildHamiltonian() {
    const n = this.nSpins;
    let H = this._zerosF();
    // Chemical-shift / offset term. Read from the legacy `params` view
    // (initialized from the molecule) so external code that mutates
    // params.nuclei[k].offset_Hz then calls _buildHamiltonian() still works
    // (physics.test T6 zeroes offsets this way). For homonuclear molecules these
    // ARE the real chemical-shift detunings; for heteronuclear, display offsets.
    const fs = this._frameShiftHz;   // per-spin Hz frame shift (may be undefined)
    for (let k = 0; k < n; k++) {
      const shift = fs ? fs[k] : 0;
      const w = TWO_PI * (this.params.nuclei[k].offset_Hz + shift);
      H = this._axpyF(H, this._Izk(k), w);
    }
    if (this.coupling) {
      const J = this.molecule.J;
      const full = this.couplingModel === 'full';
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const Jij = J[i][j];
          if (Jij === 0) continue;
          // ZZ (secular) term — present in BOTH models.
          const IziIzj = this._mmul(this._Izk(i), this._Izk(j));
          H = this._axpyF(H, IziIzj, TWO_PI * Jij);
          if (full) {
            // Flip-flop terms IxIx + IyIy (Ix = σx/2, Iy = σy/2).
            const IxiIxj = this._mmul(this._scaleF(this.SXk[i], 0.5), this._scaleF(this.SXk[j], 0.5));
            const IyiIyj = this._mmul(this._scaleF(this.SYk[i], 0.5), this._scaleF(this.SYk[j], 0.5));
            H = this._axpyF(H, IxiIxj, TWO_PI * Jij);
            H = this._axpyF(H, IyiIyj, TWO_PI * Jij);
          }
        }
    }
    this.H = H;
    this._cacheDiagonalEnergies();

    // Stability-limited internal sub-step: cap at min(0.5 ms, 1/(100·f_max)),
    // f_max = Gershgorin row-sum bound on |H|/(2π). Tightens automatically when
    // couplings are active. (Unchanged behavior from the original engine.)
    const DIM = this.dim, IDX = this._IDX;
    let rowMax = 0;
    for (let i = 0; i < DIM; i++) {
      let s = 0;
      for (let j = 0; j < DIM; j++) { const idx = IDX(i, j); s += Math.hypot(H[idx], H[idx + 1]); }
      if (s > rowMax) rowMax = s;
    }
    const fMax = rowMax / TWO_PI;
    const stabStep = fMax > 0 ? 1 / (100 * fMax) : Infinity;
    this.subStep = Math.min(0.0005, stabStep);
  }

  // Cache the diagonal energies E_i of H (real) and mark whether H is diagonal
  // (off-diagonal magnitude below tol). Enables the O(dim²) commutator.
  _cacheDiagonalEnergies() {
    const DIM = this.dim, IDX = this._IDX, H = this.H;
    const E = new Float64Array(DIM);
    let offMax = 0;
    for (let i = 0; i < DIM; i++) {
      E[i] = H[IDX(i, i)];
      for (let j = 0; j < DIM; j++) {
        if (i === j) continue;
        const idx = IDX(i, j);
        const m = Math.hypot(H[idx], H[idx + 1]);
        if (m > offMax) offMax = m;
      }
    }
    this._E = E;
    this._Hdiagonal = offMax < 1e-9;   // true for weak-coupling H (no RF)
  }

  setCoupling(on) {
    if (this.coupling === on) return;
    this.coupling = on;
    this._buildHamiltonian();
  }

  // Switch the coupling model ('weak' | 'full') and rebuild H.
  setCouplingModel(model) {
    if (this.couplingModel === model) return;
    this.couplingModel = model;
    this._buildHamiltonian();
  }

  setRelaxation(on) { this.relaxation = on; }

  // Initial state: thermal-equilibrium approximation = all spins up = |0…0⟩.
  reset() {
    this.t = 0;
    const m = this._zerosF();
    m[this._IDX(0, 0)] = 1;
    this.rhoM = m;
  }

  // -------------------------------------------------------------------------
  // Lindblad RHS:  dρ/dt = −i[H,ρ] + Σ_c ( c ρ c† − ½(c†c ρ + ρ c†c) ).
  //
  // Coherent part: if H is diagonal (cached), use the ELEMENTWISE identity
  //   −i[H,ρ]_ij = −i(E_i − E_j) ρ_ij   →   O(dim²).
  // Otherwise (RF pulse injected H_rf) fall back to the dense commutator.
  // -------------------------------------------------------------------------
  _rhs(rho, withRelax, out) {
    const DIM = this.dim, IDX = this._IDX;

    if (this._Hdiagonal) {
      const E = this._E;
      for (let i = 0; i < DIM; i++) {
        const Ei = E[i];
        for (let j = 0; j < DIM; j++) {
          const idx = IDX(i, j);
          const w = Ei - E[j];                 // (E_i − E_j)
          // −i·w·ρ_ij : for z = ρ_ij, −i·w·z has re = w·z.im, im = −w·z.re.
          out[idx]     = w * rho[idx + 1];
          out[idx + 1] = -w * rho[idx];
        }
      }
    } else {
      // Dense commutator −i[H,ρ] = −i(Hρ − ρH).
      const H = this.H;
      const Hrho = this._mmul(H, rho, this._Hrho);
      const rhoH = this._mmul(rho, H, this._rhoH);
      for (let i = 0; i < DIM; i++)
        for (let j = 0; j < DIM; j++) {
          const idx = IDX(i, j);
          const cr = Hrho[idx] - rhoH[idx];
          const ci = Hrho[idx + 1] - rhoH[idx + 1];
          out[idx] = ci;
          out[idx + 1] = -cr;
        }
    }

    if (withRelax) {
      const L = this.mlen;
      for (const { c, cdag, cdagc } of this.collapse) {
        const crho = this._mmul(c, rho, this._m1);
        const cRhoCd = this._mmul(crho, cdag, this._m2);
        const t1 = this._mmul(cdagc, rho, this._tmp);
        const t2 = this._mmul(rho, cdagc, this._tmp2);
        for (let nI = 0; nI < L; nI++)
          out[nI] += cRhoCd[nI] - 0.5 * (t1[nI] + t2[nI]);
      }
    }
    return out;
  }

  // step(dt, {relaxation, coupling}) — advance ρ by dt seconds via RK4.
  step(dt, opts = {}) {
    if (opts.relaxation !== undefined) this.setRelaxation(opts.relaxation);
    if (opts.coupling !== undefined) this.setCoupling(opts.coupling);

    const SUB = this.subStep;
    const withRelax = this.relaxation;
    let remaining = dt;
    while (remaining > 1e-12) {
      const h = Math.min(SUB, remaining);
      this._rk4(h, withRelax);
      remaining -= h;
    }
    this.t += dt;
    this._hermitize();
  }

  _rk4(h, withRelax) {
    const rho = this.rhoM;
    const L = this.mlen;
    const k1 = this._rhs(rho, withRelax, this._k1);
    let y = this._axpyF(rho, k1, h / 2, this._y);
    const k2 = this._rhs(y, withRelax, this._k2);
    y = this._axpyF(rho, k2, h / 2, this._y);
    const k3 = this._rhs(y, withRelax, this._k3);
    y = this._axpyF(rho, k3, h, this._y);
    const k4 = this._rhs(y, withRelax, this._k4);
    const c = h / 6;
    for (let nI = 0; nI < L; nI++)
      rho[nI] += c * (k1[nI] + 2 * k2[nI] + 2 * k3[nI] + k4[nI]);
  }

  // Force ρ = (ρ + ρ†)/2 to kill accumulated round-off asymmetry.
  _hermitize() {
    const DIM = this.dim, IDX = this._IDX, r = this.rhoM;
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
    const n = this.nSpins;
    const rot2 = singleRot(angleRadians, axis);
    const targets = (target === 'all') ? Array.from({ length: n }, (_, k) => k) : [target];

    const blocks = Array.from({ length: n }, () => I2);
    for (const k of targets) blocks[k] = rot2;
    let Un = blocks[0];
    for (let s = 1; s < n; s++) Un = kron(Un, blocks[s]);
    this.applyUnitary(this._toFlat(Un));
  }

  // applyUnitary(U) — ρ → U ρ U†. U flat dim×dim. Instantaneous, no relaxation.
  applyUnitary(U) {
    const Udag = this._daggerF(U);
    const UR = this._mmul(U, this.rhoM);
    this.rhoM = this._mmul(UR, Udag);
    this._hermitize();
  }

  // virtualZ(spin, angle) — exact instantaneous z-rotation (frame change).
  virtualZ(spin, angle) {
    const n = this.nSpins;
    const rot2 = singleRot(angle, 'z');
    const blocks = Array.from({ length: n }, () => I2);
    blocks[spin] = rot2;
    let Un = blocks[0];
    for (let s = 1; s < n; s++) Un = kron(Un, blocks[s]);
    this.applyUnitary(this._toFlat(Un));
  }

  // -------------------------------------------------------------------------
  // rfPulse({ spin, phase | axis, angle, omega1, onTick }) — a FINITE-DURATION
  // selective RF pulse integrated under the FULL Lindblad generator
  // (H_system + H_rf). Heteronuclear ⇒ addressing a single spin's channel is
  // naturally selective. During the pulse H is non-diagonal ⇒ the RHS uses the
  // dense commutator path automatically (via the diagonal flag).
  // -------------------------------------------------------------------------
  rfPulse({ spin, phase, axis, angle, omega1, onTick } = {}) {
    if (angle === 0) return 0;
    if (phase === undefined) {
      if (axis === 'x') phase = 0;
      else if (axis === 'y') phase = Math.PI / 2;
      else phase = 0;
    }
    const w1 = omega1 !== undefined ? omega1 : this.defaultOmega1;
    const a = Math.abs(angle);
    const ph = angle < 0 ? phase + Math.PI : phase;
    const tp = a / w1;

    // Build H_rf = (w1/2)(cosφ σx + sinφ σy) on the target spin (flat dim×dim).
    const cx = Math.cos(ph), sy = Math.sin(ph);
    const L = this.mlen;
    const Hrf = this._zerosF();
    const X = this.SXk[spin], Y = this.SYk[spin];
    for (let nI = 0; nI < L; nI++) Hrf[nI] = 0.5 * w1 * (cx * X[nI] + sy * Y[nI]);

    const Hsave = this.H;
    const subSave = this.subStep;
    const diagSave = this._Hdiagonal;
    this.H = this._axpyF(this.H, Hrf, 1);     // H_total = H_system + H_rf
    this._Hdiagonal = false;                  // H_rf breaks diagonality
    this.subStep = Math.min(this.subStep, 1 / (100 * (w1 / TWO_PI)));
    try {
      this._evolve(tp, onTick);
    } finally {
      this.H = Hsave;
      this.subStep = subSave;
      this._Hdiagonal = diagSave;
    }
    return tp;
  }

  // -------------------------------------------------------------------------
  // softPulse({ spin, phase | axis, angle, duration, onTick }) — a FREQUENCY-
  // SELECTIVE, finite-duration, SHAPED (Gaussian-envelope) RF pulse, resonant on
  // the TARGET spin's chemical shift, integrated under the FULL Hamiltonian
  // (offsets + coupling + control) with relaxation active, under the RWA.
  //
  // This is the homonuclear single-qubit primitive: on a shared RF channel a
  // HARD pulse rotates ALL spins; a soft pulse rotates ONLY the target because
  // its narrow bandwidth (long duration) is << the chemical-shift gaps to the
  // other spins.
  //
  // Implementation:
  //   * Frame: we work in the TARGET spin's rotating frame by shifting every
  //     spin's z-offset by −ν_target (this._frameShiftHz). The target then sits
  //     on resonance (detuning 0); the other spins are detuned by their REAL
  //     shift gaps Δ_k = ν_k − ν_target. The pulse is applied on-resonance
  //     (carrier = ν_target), so the control term is time-INDEPENDENT in this
  //     frame ((cosφ σx + sinφ σy) with a Gaussian-shaped amplitude), which is
  //     exactly the RWA on-resonance control. No extra phase bookkeeping is
  //     needed on return because a global frame offset applied to ALL spins for
  //     the pulse duration only adds z-rotations that we UNDO by restoring the
  //     original H afterwards — EXCEPT we must add back the target's own free
  //     precession we removed. We therefore apply a compensating virtual-Z of
  //     +2π·ν_target·t_p on the target after the pulse (see below).
  //   * Envelope: Gaussian A(t) = exp(−(t−t0)²/(2σ²)), truncated to ±T/2, area-
  //     normalized so ∫ γB1(t) dt = angle on the (on-resonance) target ⇒ the
  //     target nutates by exactly `angle`.
  //   * Duration: chosen from the smallest relevant shift gap so bandwidth <<
  //     gap ⇒ selectivity. duration ≈ selectivity·(1/minGap) (default given).
  //   * Integration: sub-step fine enough for the fastest detuning + envelope.
  //
  // Frame-restore detail: rather than mutate offsets and re-run free precession,
  // we keep the ORIGINAL system H (real offsets) active and instead subtract the
  // target's Larmor by applying the RF in a co-rotating way is complex; simpler
  // and numerically exact here: we temporarily REBUILD H with a per-spin frame
  // shift of −ν_target (target on resonance), evolve, then rebuild the original
  // H and apply a virtual-Z to the target restoring the phase it would have
  // accrued had it precessed at ν_target for t_p. This keeps the returned state
  // consistent with the lab/rotating-frame the rest of the app uses.
  // -------------------------------------------------------------------------
  softPulse({ spin, phase, axis, angle, duration, selectivity, omega1Max, onTick } = {}) {
    if (angle === 0) return 0;
    if (phase === undefined) {
      if (axis === 'x') phase = 0;
      else if (axis === 'y') phase = Math.PI / 2;
      else phase = 0;
    }
    const a = Math.abs(angle);
    const ph = angle < 0 ? phase + Math.PI : phase;
    const n = this.nSpins;

    // ---- target chemical shift & shift gaps to the other spins --------------
    const nu = (k) => this.params.nuclei[k].offset_Hz;
    const nuT = nu(spin);
    let minGap = Infinity;
    for (let k = 0; k < n; k++) {
      if (k === spin) continue;
      const gap = Math.abs(nu(k) - nuT);
      if (gap > 0 && gap < minGap) minGap = gap;
    }
    if (!isFinite(minGap)) minGap = 1000;   // lone spin ⇒ arbitrary; stays fast

    // ---- pulse duration: bandwidth << smallest gap ⇒ selective -------------
    // A Gaussian pulse of duration T has spectral width ~1/T; requiring the
    // excitation bandwidth to be a fraction of the smallest gap gives
    // T ≈ sel / minGap. With the SHARED-channel drive above, a spectator at
    // detuning Δ=minGap is excited ∝ exp(−(π·sel/3)²/2): sel=3 ⇒ ~0.7% leakage
    // (spectator rotates <1° on a 90° pulse), which is genuine emergent
    // selectivity — NOT hard-wired. The trade-off: larger sel = more selective
    // but longer T = MORE J-coupling phase accrued DURING the pulse (∝ J·T, the
    // dominant gate-error term since the ideal single-qubit unitary ignores
    // coupling). sel=3 keeps single-qubit fidelity high for the weakly-coupled
    // shipped homo molecules while giving real selectivity.
    const sel = selectivity !== undefined ? selectivity : 3;
    const T = duration !== undefined ? duration : sel / minGap;

    // ---- Gaussian envelope, area-normalized so ∫ w1(t) dt = a --------------
    // w1(t) = Amax · exp(−(t−t0)²/(2σ²)), t∈[0,T], t0=T/2. Choose σ = T/6 so the
    // envelope is ~0 at the ends (±3σ). Amax set so the time-integral = a.
    const t0 = T / 2;
    const sigma = T / 6;
    // ∫_0^T exp(−(t−t0)²/2σ²) dt  (numerically, matches the stepper's grid).
    // We'll compute Amax from the discrete sum used during integration so the
    // realized flip angle is exact to the integrator.

    // Sub-step: resolve the fastest detuning (maxGap), the coupling, and the
    // envelope. Use a small fraction of 1/maxDetuning and of T.
    let maxDet = 0;
    for (let k = 0; k < n; k++) maxDet = Math.max(maxDet, Math.abs(nu(k) - nuT));
    const jMax = this._maxCouplingHz();
    const fFast = Math.max(maxDet, jMax, 1 / T);
    const w1peakGuess = a / (sigma * Math.sqrt(2 * Math.PI));  // ~peak nutation
    const fCtrl = w1peakGuess / TWO_PI;
    const h = Math.min(T / 200, 1 / (60 * Math.max(fFast, fCtrl, 1)));
    const nStep = Math.max(64, Math.ceil(T / h));
    const dt = T / nStep;

    // Discrete envelope samples at sub-step midpoints, and their sum for the
    // area normalization (so the realized flip = a exactly under the integrator).
    const env = new Float64Array(nStep);
    let area = 0;
    for (let s = 0; s < nStep; s++) {
      const t = (s + 0.5) * dt;
      const g = Math.exp(-((t - t0) * (t - t0)) / (2 * sigma * sigma));
      env[s] = g;
      area += g * dt;
    }
    const Amax = a / area;   // rad/s peak so Σ w1(t)·dt = a

    // ---- switch into the target's rotating frame (target on resonance) ------
    const savedFrame = this._frameShiftHz;
    const frame = new Float64Array(n);
    for (let k = 0; k < n; k++) frame[k] = -nuT;   // shift ALL spins by −ν_target
    this._frameShiftHz = frame;
    this._buildHamiltonian();                       // H_frame (target detuning 0)

    const Hsystem = this.H;                          // frame-shifted system H
    const L = this.mlen;
    const cx = Math.cos(ph), sy = Math.sin(ph);
    // Shared RF channel: the pulse drives EVERY spin (Σ_k σx_k, Σ_k σy_k), as a
    // real single-coil homonuclear experiment does. Frequency selectivity is
    // therefore EMERGENT — the target (detuning 0 in this frame) is rotated by
    // the full pulse area, while a spectator at detuning Δ is only weakly excited
    // when the Gaussian bandwidth (~1/T) << |Δ|. It is NOT hard-wired to the
    // target: a short/broadband pulse will (correctly) rotate spectators too.
    const X = this._zerosF(), Y = this._zerosF();
    for (let k = 0; k < n; k++) {
      const Xk = this.SXk[k], Yk = this.SYk[k];
      for (let nI = 0; nI < L; nI++) { X[nI] += Xk[nI]; Y[nI] += Yk[nI]; }
    }
    const Htmp = this._zerosF();

    this._Hdiagonal = false;
    try {
      for (let s = 0; s < nStep; s++) {
        const w1 = Amax * env[s];
        // H(t) = H_system(frame) + (w1/2)(cosφ σx + sinφ σy) on target.
        const g = 0.5 * w1;
        for (let nI = 0; nI < L; nI++) Htmp[nI] = Hsystem[nI] + g * (cx * X[nI] + sy * Y[nI]);
        this.H = Htmp;
        this._rk4(dt, this.relaxation);
        this.t += dt;
        if (onTick) onTick(dt);
      }
    } finally {
      // Restore the original (real-offset) system Hamiltonian; _buildHamiltonian
      // recomputes _Hdiagonal + subStep correctly for the restored H.
      this._frameShiftHz = savedFrame;
      this._buildHamiltonian();
      this._hermitize();
    }

    // Frame convention: the in-pulse Hamiltonian above (offsets shifted by
    // −ν_target) is exactly the MULTIPLY-ROTATING-FRAME (MRF) drift + static
    // on-resonance control for the target. In the MRF each spin's own chemical-
    // shift precession is already removed, so the post-pulse state IS the gate
    // output — the ideal single-qubit unitary R_target(angle)⊗I lives in this
    // same MRF. Therefore NO post-pulse virtual-Z compensation is applied.
    //
    // (Homonuclear gate compilation as a whole works in the MRF: free-evolution
    // delays used by two-qubit gates would likewise be evaluated with offsets
    // removed. Since homo two-qubit gates are currently disabled, single-qubit
    // soft pulses are self-consistent in the MRF and reach >0.99 fidelity.)

    return T;
  }

  // Largest |J| coupling (Hz) in the active molecule.
  _maxCouplingHz() {
    const J = this.molecule.J, n = this.nSpins;
    let mx = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) mx = Math.max(mx, Math.abs(J[i][j]));
    return mx;
  }

  // _evolve(dt, onTick) — like step() but invokes onTick(subDt) after each
  // internal RK4 sub-step. Uses whatever this.H currently is.
  _evolve(dt, onTick) {
    const SUB = this.subStep;
    const withRelax = this.relaxation;
    let remaining = dt;
    while (remaining > 1e-12) {
      const h = Math.min(SUB, remaining);
      this._rk4(h, withRelax);
      this.t += h;
      remaining -= h;
      if (onTick) onTick(h);
    }
    this._hermitize();
  }

  // Computational-basis populations: length-dim array of Re(ρ[b][b]). Σ = 1.
  populations() {
    const DIM = this.dim, IDX = this._IDX;
    const p = new Array(DIM);
    for (let b = 0; b < DIM; b++) p[b] = this.rhoM[IDX(b, b)];
    return p;
  }

  // QRC encoding: s∈[0,1] ⇒ θ = arcsin(√s) ⇒ applyPulse(target, θ, 'x').
  encode(s, target = 'all') {
    const clamped = Math.max(0, Math.min(1, s));
    const theta = Math.asin(Math.sqrt(clamped));
    this.applyPulse(target, theta, 'x');
    return theta;
  }

  // Observables. blochVector(k) = { x: Tr(ρσx_k), y: Tr(ρσy_k), z: Tr(ρσz_k) }.
  blochVector(k) {
    return {
      x: this._traceProd(this.rhoM, this.SXk[k]).re,
      y: this._traceProd(this.rhoM, this.SYk[k]).re,
      z: this._traceProd(this.rhoM, this.SZk[k]).re,
    };
  }

  blochVectors() {
    const out = [];
    for (let k = 0; k < this.nSpins; k++) out.push(this.blochVector(k));
    return out;
  }

  // Complex FID: fid() = Σ_k (bx^(k) + i·by^(k)).
  fid() {
    let real = 0, imag = 0;
    for (let k = 0; k < this.nSpins; k++) {
      const b = this.blochVector(k);
      real += b.x;
      imag += b.y;
    }
    return { real, imag };
  }

  // Raw ρ as a math.js complex matrix.
  rho() {
    const DIM = this.dim, IDX = this._IDX;
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

  // |ρ| magnitudes as a plain dim×dim number array (heatmap fast path).
  rhoAbs() {
    const DIM = this.dim, IDX = this._IDX;
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

  // Purity Tr(ρ²) (real).
  purity() {
    return this._traceProd(this.rhoM, this.rhoM).re;
  }

  // Trace of ρ (should be 1).
  traceRho() {
    return this._trace(this.rhoM);
  }
}

// =============================================================================
// _internal — building blocks for gates.js, ideal-sim.js, and tests.
//
// BACKWARD COMPATIBILITY: gates.js / ideal-sim.js / the legacy tests import a
// FIXED 3-spin view (DIM=8, N_SPINS=3, IDX, embed, mmul, …). We expose a set of
// FREE-FUNCTION helpers hardwired to a chosen dimension so those consumers keep
// working, PLUS a factory `flatOps(n)` for n-spin gate compilation.
// =============================================================================

// Build a self-contained flat-matrix toolkit for a given number of spins.
export function flatOps(n) {
  const DIM = 1 << n;
  const MLEN = 2 * DIM * DIM;
  const IDX = (i, j) => 2 * (i * DIM + j);

  const zerosF = () => new Float64Array(MLEN);

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
  function daggerF(A, out) {
    const C = out || zerosF();
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const s = IDX(i, j), d = IDX(j, i);
        C[d] = A[s]; C[d + 1] = -A[s + 1];
      }
    return C;
  }
  function axpyF(A, B, s, out) {
    const C = out || zerosF();
    for (let m = 0; m < MLEN; m++) C[m] = A[m] + s * B[m];
    return C;
  }
  function scaleF(A, s, out) {
    const C = out || zerosF();
    for (let m = 0; m < MLEN; m++) C[m] = s * A[m];
    return C;
  }
  function cloneF(A) { return Float64Array.from(A); }
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
  // Embed op on spin k (I2 elsewhere) → flat DIM×DIM.
  function embed(op, k) {
    let m = (k === 0) ? op : I2;
    for (let s = 1; s < n; s++) m = kron(m, s === k ? op : I2);
    return toFlat(m);
  }
  const SXk = [], SYk = [], SZk = [], RUPk = [];
  for (let k = 0; k < n; k++) {
    SXk[k]  = embed(SX,  k);
    SYk[k]  = embed(SY,  k);
    SZk[k]  = embed(SZ,  k);
    RUPk[k] = embed(RUP, k);
  }
  function trace(A) {
    let re = 0, im = 0;
    for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += A[d]; im += A[d + 1]; }
    return { re, im };
  }
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

  return {
    n, DIM, MLEN, IDX,
    zerosF, mmul, daggerF, axpyF, scaleF, cloneF, toFlat, kron, embed,
    singleRot, trace, traceProd,
    I2, SX, SY, SZ, SXk, SYk, SZk, RUPk,
  };
}

// Legacy fixed 3-spin toolkit (DIM=8). Preserved so existing imports of
// `_internal` (gates.js, ideal-sim.js, tests) keep working unchanged.
const _default3 = flatOps(3);
export const _internal = {
  math,
  ..._default3,
  flatOps,
};
