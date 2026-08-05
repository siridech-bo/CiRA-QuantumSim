// =============================================================================
// jc.js — REAL Jaynes-Cummings (JC) qubit-boson reservoir engine.
//
// A cavity-QED substrate: a bosonic Fock mode (truncated to Nc levels) coupled
// to a single qubit (two-level atom). It integrates the Lindblad master equation
// for the (2·Nc)×(2·Nc) density matrix ρ with the SAME flat interleaved [re,im]
// Float64Array RK4 core + adaptive internal sub-step used by quantum.js, so it is
// framework-free (importable in node for tests).
//
// Implements the reservoir from:
//   Das, Giorgi, Zambrini, "Quantum reservoir computing in Jaynes-Cummings
//   models", Phys. Rev. Research 8, 023148 (2026).
//
// Hilbert space (ħ = 1):
//   H = H_boson ⊗ H_qubit,  dim = 2·Nc.  Tensor order: (boson ⊗ qubit).
//   Basis index of |n⟩⊗|q⟩ is  idx = n·2 + q,  n ∈ [0,Nc), q ∈ {0:e, 1:g}.
//
// Operators:
//   Boson: a|n⟩ = √n |n−1⟩ (annihilation), a† (creation), N = a†a = diag(0..Nc−1).
//          Embedded as a ⊗ I₂.
//   Qubit: |e⟩ = index 0, |g⟩ = index 1 (in the 2-dim qubit factor).
//          σz = |e⟩⟨e| − |g⟩⟨g| = diag(1,−1),
//          σ⁺ = |e⟩⟨g|, σ⁻ = |g⟩⟨e|, σx = σ⁺+σ⁻. Embedded as I_Nc ⊗ σ.
//
// Two selectable Hamiltonians (rotating frame of the drives):
//   JC :  H = Δ_a σz + Δ_b a†a + χ(a σ⁺ + a† σ⁻) + iβ(t)(a − a†) + α σx   [Eq. 3]
//   DJC:  H = χ′ a†a σz + iβ(t)(a − a†) + α σx                            [Eq. 5]
//
// Dissipation: cavity photon loss, collapse operator L = √κ · a (κ default 0.1):
//   dρ/dt = −i[H,ρ] + κ( a ρ a† − ½{a†a, ρ} ).
//
// Input encoding: the drive amplitude β = input value s, held CONSTANT during an
// evolution window of duration dt (default 10); between windows β updates. α is a
// fixed tuning drive (NOT an input; default 0 for JC, 1 for DJC).
// =============================================================================

// ---------------------------------------------------------------------------
// Flat complex matrix core (dim-aware, interleaved [re,im]). Mirrors quantum.js.
// ---------------------------------------------------------------------------
function makeFlatOps(DIM) {
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
  function trace(A) {
    let re = 0, im = 0;
    for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += A[d]; im += A[d + 1]; }
    return { re, im };
  }
  // Tr(A·B) = Σ_ij A_ij B_ji.
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
  return { DIM, MLEN, IDX, zerosF, mmul, daggerF, axpyF, scaleF, trace, traceProd };
}

// =============================================================================
// JCReservoir — the engine.
//
// constructor({ regime, Nc, chi, kappa, deltaA, deltaB, chiP, alpha, dt })
//   regime : 'JC' | 'DJC'                    (default 'JC')
//   Nc     : Fock cutoff                     (default 15)
//   chi    : JC coupling χ                   (default 1)
//   kappa  : cavity loss rate κ              (default 0.1)
//   deltaA : qubit detuning Δ_a              (default 1  → Δ_b+Δ with Δ=0)
//   deltaB : cavity detuning Δ_b             (default 1)
//   chiP   : DJC coupling χ′                 (default 1)
//   alpha  : fixed tuning drive α            (default 0 for JC, 1 for DJC)
//   dt     : default input-window duration   (default 10)
// =============================================================================
export class JCReservoir {
  constructor(opts = {}) {
    this.regime = opts.regime || 'JC';
    this.Nc = opts.Nc || 15;
    this.chi = opts.chi !== undefined ? opts.chi : 1;
    this.kappa = opts.kappa !== undefined ? opts.kappa : 0.1;
    this.deltaA = opts.deltaA !== undefined ? opts.deltaA : 1;
    this.deltaB = opts.deltaB !== undefined ? opts.deltaB : 1;
    this.chiP = opts.chiP !== undefined ? opts.chiP : 1;
    this.alpha = opts.alpha !== undefined ? opts.alpha
      : (this.regime === 'DJC' ? 1 : 0);
    this.dt = opts.dt !== undefined ? opts.dt : 10;

    this.beta = 0;   // current drive amplitude β (input value)

    this._build();
    this.reset();
  }

  // -------------------------------------------------------------------------
  // Build all operators, the collapse operator, and the (β-independent part of
  // the) Hamiltonian for the current regime/params. Call after changing any
  // structural parameter (regime, Nc, chi, ...). Preserves ρ if dims unchanged.
  // -------------------------------------------------------------------------
  _build() {
    const Nc = this.Nc;
    const DIM = 2 * Nc;
    this.dim = DIM;
    const F = makeFlatOps(DIM);
    this._F = F;
    this.mlen = F.MLEN;
    const { IDX, zerosF } = F;

    // ---- boson operators embedded as (a ⊗ I₂) on the (boson⊗qubit) basis ----
    // idx(n,q) = n·2 + q. a|n⟩=√n|n−1⟩ ⇒ a couples (n,q)→(n−1,q).
    const a = zerosF();       // annihilation
    const adag = zerosF();    // creation
    const nOp = zerosF();     // number N = a†a
    for (let n = 0; n < Nc; n++) {
      for (let q = 0; q < 2; q++) {
        const row = n * 2 + q;
        nOp[IDX(row, row)] = n;                       // N|n,q⟩ = n|n,q⟩
        if (n >= 1) {
          const s = Math.sqrt(n);
          // a: ⟨n−1,q| a |n,q⟩ = √n
          a[IDX((n - 1) * 2 + q, row)] = s;
          // a†: ⟨n,q| a† |n−1,q⟩ = √n
          adag[IDX(row, (n - 1) * 2 + q)] = s;
        }
      }
    }
    this.a = a; this.adag = adag; this.N = nOp;

    // ---- qubit operators embedded as (I_Nc ⊗ σ). q=0:|e⟩, q=1:|g⟩ -----------
    const sz = zerosF();      // σz = |e⟩⟨e| − |g⟩⟨g|
    const sp = zerosF();      // σ⁺ = |e⟩⟨g|
    const sm = zerosF();      // σ⁻ = |g⟩⟨e|
    const sx = zerosF();      // σx = σ⁺ + σ⁻
    const sy = zerosF();      // σy = −i(σ⁺ − σ⁻) = i(σ⁻ − σ⁺)  [for observables]
    for (let n = 0; n < Nc; n++) {
      const e = n * 2 + 0;    // |n,e⟩
      const g = n * 2 + 1;    // |n,g⟩
      sz[IDX(e, e)] = 1;
      sz[IDX(g, g)] = -1;
      // σ⁺ = |e⟩⟨g| ⇒ ⟨e|σ⁺|g⟩ = 1
      sp[IDX(e, g)] = 1;
      // σ⁻ = |g⟩⟨e| ⇒ ⟨g|σ⁻|e⟩ = 1
      sm[IDX(g, e)] = 1;
      // σx = σ⁺+σ⁻
      sx[IDX(e, g)] = 1; sx[IDX(g, e)] = 1;
      // σy = i(σ⁻ − σ⁺) : ⟨e|σy|g⟩ = −i, ⟨g|σy|e⟩ = +i
      sy[IDX(e, g) + 1] = -1;
      sy[IDX(g, e) + 1] = 1;
    }
    this.sz = sz; this.sp = sp; this.sm = sm; this.sx = sx; this.sy = sy;

    // a σ⁺ and a† σ⁻ for the JC coupling (products of the embedded operators).
    this._aSp = F.mmul(a, sp);
    this._adagSm = F.mmul(adag, sm);
    // a†a σz for DJC.
    this._nSz = F.mmul(nOp, sz);
    // i(a − a†) drive operator (Hermitian): D = i(a−a†) ⇒ multiply by β.
    // i·(a−a†): for real matrices a,a†, i·(a−a†) has re=0, im=(a−a†).
    const Ddrive = zerosF();
    for (let m = 0; m < F.MLEN; m += 2) {
      const re = a[m] - adag[m];        // (a−a†) real part
      Ddrive[m] = 0;
      Ddrive[m + 1] = re;               // i·(a−a†)
    }
    this._Ddrive = Ddrive;

    // ---- collapse operator L = √κ · a ; precompute L, L†, L†L ----------------
    const L = F.scaleF(a, Math.sqrt(this.kappa));
    this._L = L;
    this._Ldag = F.daggerF(L);
    this._LdagL = F.mmul(this._Ldag, L);

    // Scratch buffers for the RK4 hot path (allocate BEFORE building H so the
    // Hamiltonian assembled by _buildH0 isn't clobbered).
    this._k1 = zerosF(); this._k2 = zerosF(); this._k3 = zerosF(); this._k4 = zerosF();
    this._y = zerosF();
    this._Hrho = zerosF(); this._rhoH = zerosF();
    this._m1 = zerosF(); this._m2 = zerosF(); this._tmp = zerosF(); this._tmp2 = zerosF();
    this._H = null;   // assembled by _buildH0 → _assembleH below

    // ---- static (β-independent) Hamiltonian H0 + assembled H for the regime --
    this._buildH0();

    this._setSubStep();
  }

  // Static part of H (everything except the iβ(a−a†) drive, which changes with β).
  _buildH0() {
    const F = this._F;
    let H0 = F.zerosF();
    if (this.regime === 'DJC') {
      // H0 = χ′ a†a σz + α σx
      H0 = F.axpyF(H0, this._nSz, this.chiP);
      H0 = F.axpyF(H0, this.sx, this.alpha);
    } else {
      // H0 = Δ_a σz + Δ_b a†a + χ(a σ⁺ + a† σ⁻) + α σx
      H0 = F.axpyF(H0, this.sz, this.deltaA);
      H0 = F.axpyF(H0, this.N, this.deltaB);
      H0 = F.axpyF(H0, this._aSp, this.chi);
      H0 = F.axpyF(H0, this._adagSm, this.chi);
      H0 = F.axpyF(H0, this.sx, this.alpha);
    }
    this._H0 = H0;
    this._assembleH();
  }

  // H = H0 + β · i(a − a†).
  _assembleH() {
    this._H = this._F.axpyF(this._H0, this._Ddrive, this.beta, this._H);
  }

  // Internal RK4 sub-step, sized from a Gershgorin bound on the generator's
  // fastest angular frequency (|H| row-sums plus the dissipator scale). RK4 is
  // 4th-order, so the cap at 0.04 already matches a 40× finer reference to
  // machine precision for the default/benchmark params, while a default dt=10
  // window costs ~0.35 s at dim=30 — responsive in the browser without loosening
  // physics accuracy. The 3/rowMax term only tightens the step for extreme params.
  _setSubStep() {
    const F = this._F, DIM = this.dim, IDX = F.IDX;
    const H = this._H, LL = this._LdagL;
    let rowMax = 0;
    for (let i = 0; i < DIM; i++) {
      let s = 0;
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        s += Math.hypot(H[idx], H[idx + 1]);
        s += Math.hypot(LL[idx], LL[idx + 1]);
      }
      if (s > rowMax) rowMax = s;
    }
    // Cap at 0.04 (verified accurate to ~5 digits vs a 40× finer reference for
    // the default/benchmark params); the 3/rowMax term only tightens the step
    // for extreme parameter choices (very large Nc, χ, or drive β).
    this.subStep = rowMax > 0 ? Math.min(0.04, 3 / rowMax) : 0.04;
  }

  // -------------------------------------------------------------------------
  // Parameter setters. Structural ones rebuild operators/H.
  // -------------------------------------------------------------------------
  // Switch regime. If keepAlpha is false (default), reset α to the regime's
  // default (0 for JC, 1 for DJC); pass true to preserve the current α.
  setRegime(regime, keepAlpha = false) {
    if (this.regime === regime) return;
    this.regime = regime;
    if (!keepAlpha) this.alpha = regime === 'DJC' ? 1 : 0;
    this._buildH0();
    this._setSubStep();
  }
  setParams(p = {}) {
    let structural = false, dimChange = false;
    if (p.Nc !== undefined && p.Nc !== this.Nc) { this.Nc = p.Nc; dimChange = true; }
    for (const key of ['chi', 'kappa', 'deltaA', 'deltaB', 'chiP', 'alpha']) {
      if (p[key] !== undefined && p[key] !== this[key]) { this[key] = p[key]; structural = true; }
    }
    if (p.regime !== undefined && p.regime !== this.regime) { this.regime = p.regime; structural = true; }
    if (p.dt !== undefined) this.dt = p.dt;
    if (dimChange) { this._build(); this.reset(); }
    else if (structural) { this._buildH0(); this._setSubStep(); }
  }

  setBeta(beta) {
    this.beta = beta;
    this._assembleH();
    this._setSubStep();
  }

  setKappa(kappa) {
    this.kappa = kappa;
    const F = this._F;
    this._L = F.scaleF(this.a, Math.sqrt(kappa));
    this._Ldag = F.daggerF(this._L);
    this._LdagL = F.mmul(this._Ldag, this._L);
    this._setSubStep();
  }

  Ncutoff() { return this.Nc; }
  dimension() { return this.dim; }

  // -------------------------------------------------------------------------
  // Initial state. Default |0⟩⊗|g⟩ (vacuum + ground). setInitial() lets tests /
  // the echo-state UI seed alternative states.
  // -------------------------------------------------------------------------
  reset() {
    this.t = 0;
    const m = this._F.zerosF();
    // |0,g⟩ = index 0·2 + 1 = 1.
    m[this._F.IDX(1, 1)] = 1;
    this.rhoM = m;
  }

  // Seed ρ = |n,q⟩⟨n,q| (q: 'e'|'g'). Convenience for tests.
  setFockQubit(n, q = 'g') {
    const idx = n * 2 + (q === 'e' ? 0 : 1);
    const m = this._F.zerosF();
    m[this._F.IDX(idx, idx)] = 1;
    this.rhoM = m;
    this.t = 0;
  }

  // Seed a pure qubit state |ψ_q⟩ (Bloch angles) on the vacuum: |0⟩⊗|ψ_q⟩.
  // |ψ⟩ = cos(θ/2)|e⟩ + e^{iφ} sin(θ/2)|g⟩.
  setQubitBloch(theta, phi = 0) {
    const F = this._F;
    const ce = Math.cos(theta / 2);
    const sg = Math.sin(theta / 2);
    const gr = sg * Math.cos(phi), gi = sg * Math.sin(phi);
    // amplitudes on basis indices 0=|0,e⟩ and 1=|0,g⟩.
    const amp = [{ re: ce, im: 0 }, { re: gr, im: gi }];
    const m = F.zerosF();
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        // ρ = |ψ⟩⟨ψ| ⇒ ρ_ij = amp_i · conj(amp_j)
        const re = amp[i].re * amp[j].re + amp[i].im * amp[j].im;
        const im = amp[i].im * amp[j].re - amp[i].re * amp[j].im;
        const idx = F.IDX(i, j);
        m[idx] = re; m[idx + 1] = im;
      }
    this.rhoM = m;
    this.t = 0;
  }

  // Seed an arbitrary flat density matrix (must be dim×dim). Copies.
  setRho(flat) {
    this.rhoM = Float64Array.from(flat);
    this.t = 0;
  }

  // -------------------------------------------------------------------------
  // Lindblad RHS:  dρ/dt = −i[H,ρ] + κ( a ρ a† − ½{a†a,ρ} )
  //             = −i[H,ρ] + ( L ρ L† − ½(L†L ρ + ρ L†L) ),  L = √κ a.
  // Dense commutator path (H is not diagonal in general for JC).
  // -------------------------------------------------------------------------
  _rhs(rho, out) {
    const F = this._F, DIM = this.dim, IDX = F.IDX;
    const H = this._H;
    const Hrho = F.mmul(H, rho, this._Hrho);
    const rhoH = F.mmul(rho, H, this._rhoH);
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        // −i(Hρ − ρH): re = (Hρ−ρH).im, im = −(Hρ−ρH).re
        const cr = Hrho[idx] - rhoH[idx];
        const ci = Hrho[idx + 1] - rhoH[idx + 1];
        out[idx] = ci;
        out[idx + 1] = -cr;
      }
    // Dissipator.
    const L = this._L, Ldag = this._Ldag, LdagL = this._LdagL;
    const Lrho = F.mmul(L, rho, this._m1);
    const LrhoLd = F.mmul(Lrho, Ldag, this._m2);
    const t1 = F.mmul(LdagL, rho, this._tmp);
    const t2 = F.mmul(rho, LdagL, this._tmp2);
    const MLEN = F.MLEN;
    for (let m = 0; m < MLEN; m++)
      out[m] += LrhoLd[m] - 0.5 * (t1[m] + t2[m]);
    return out;
  }

  _rk4(h) {
    const rho = this.rhoM, F = this._F, MLEN = F.MLEN;
    const k1 = this._rhs(rho, this._k1);
    let y = F.axpyF(rho, k1, h / 2, this._y);
    const k2 = this._rhs(y, this._k2);
    y = F.axpyF(rho, k2, h / 2, this._y);
    const k3 = this._rhs(y, this._k3);
    y = F.axpyF(rho, k3, h, this._y);
    const k4 = this._rhs(y, this._k4);
    const c = h / 6;
    for (let m = 0; m < MLEN; m++)
      rho[m] += c * (k1[m] + 2 * k2[m] + 2 * k3[m] + k4[m]);
  }

  _hermitize() {
    const F = this._F, DIM = this.dim, IDX = F.IDX, r = this.rhoM;
    for (let i = 0; i < DIM; i++)
      for (let j = i; j < DIM; j++) {
        const a = IDX(i, j), b = IDX(j, i);
        const re = 0.5 * (r[a] + r[b]);
        const imUp = 0.5 * (r[a + 1] - r[b + 1]);
        r[a] = re; r[a + 1] = imUp;
        r[b] = re; r[b + 1] = -imUp;
      }
  }

  // Advance ρ by `dt` (dimensionless time units) via RK4 with adaptive sub-steps.
  step(dt) {
    const SUB = this.subStep;
    let remaining = dt;
    while (remaining > 1e-12) {
      const h = Math.min(SUB, remaining);
      this._rk4(h);
      remaining -= h;
    }
    this.t += dt;
    this._hermitize();
  }

  // Set the drive to β and integrate one input window of duration dt (default
  // this.dt). This is the reservoir's "input injection + evolution" primitive.
  evolveWindow(beta, dt) {
    this.setBeta(beta);
    this.step(dt !== undefined ? dt : this.dt);
  }

  // -------------------------------------------------------------------------
  // Observables.
  // -------------------------------------------------------------------------
  photonNumber() { return this._F.traceProd(this.rhoM, this.N).re; }
  photonNumberSq() {
    const N2 = this._F.mmul(this.N, this.N);
    return this._F.traceProd(this.rhoM, N2).re;
  }
  // Quadratures: X = (a+a†)/√2, P = (a−a†)/(i√2). ⟨X⟩,⟨P⟩ real.
  quadX() {
    const F = this._F;
    const Xop = F.axpyF(this.a, this.adag, 1);   // a + a†
    return F.traceProd(this.rhoM, Xop).re / Math.SQRT2;
  }
  quadP() {
    const F = this._F;
    // P = (a − a†)/(i√2) = −i(a−a†)/√2. Build −i(a−a†).
    const amAd = F.axpyF(this.a, this.adag, -1);  // a − a†  (real)
    const Pop = F.zerosF();
    for (let m = 0; m < F.MLEN; m += 2) {
      // −i·(real) ⇒ re=0, im = −real
      Pop[m] = 0;
      Pop[m + 1] = -amAd[m];
    }
    return F.traceProd(this.rhoM, Pop).re / Math.SQRT2;
  }
  quadratures() { return { X: this.quadX(), P: this.quadP() }; }

  // Reduced bosonic density matrix ρ_boson (Nc×Nc), partial trace over qubit.
  // ρ_boson[m][n] = Σ_q ρ[(m,q),(n,q)].  Returned as flat Nc×Nc [re,im].
  rhoBoson() {
    const F = this._F, IDX = F.IDX, Nc = this.Nc;
    const out = new Float64Array(2 * Nc * Nc);
    const OIDX = (i, j) => 2 * (i * Nc + j);
    const r = this.rhoM;
    for (let m = 0; m < Nc; m++)
      for (let n = 0; n < Nc; n++) {
        let re = 0, im = 0;
        for (let q = 0; q < 2; q++) {
          const idx = IDX(m * 2 + q, n * 2 + q);
          re += r[idx]; im += r[idx + 1];
        }
        const o = OIDX(m, n);
        out[o] = re; out[o + 1] = im;
      }
    out._Nc = Nc;
    return out;
  }

  // Reduced qubit density matrix ρ_qubit (2×2), partial trace over boson.
  // ρ_qubit[q][q'] = Σ_n ρ[(n,q),(n,q')].  q,q' ∈ {0:e,1:g}. Flat 2×2 [re,im].
  rhoQubit() {
    const F = this._F, IDX = F.IDX, Nc = this.Nc;
    const out = new Float64Array(2 * 2 * 2);
    const OIDX = (i, j) => 2 * (i * 2 + j);
    const r = this.rhoM;
    for (let qi = 0; qi < 2; qi++)
      for (let qj = 0; qj < 2; qj++) {
        let re = 0, im = 0;
        for (let n = 0; n < Nc; n++) {
          const idx = IDX(n * 2 + qi, n * 2 + qj);
          re += r[idx]; im += r[idx + 1];
        }
        const o = OIDX(qi, qj);
        out[o] = re; out[o + 1] = im;
      }
    return out;
  }

  // Qubit Bloch vector {x,y,z} from ρ_qubit (2×2 flat, e=0,g=1).
  //   ρ_qubit = [[ρ_ee, ρ_eg],[ρ_ge, ρ_gg]].
  //   ⟨σx⟩ = Tr(ρσx) = ρ_ge + ρ_eg = 2 Re ρ_eg.
  //   ⟨σy⟩ = Tr(ρσy) = i(ρ_eg − ρ_ge)... with σy = i(σ⁻−σ⁺):
  //          ⟨σy⟩ = i·ρ_eg·(⟨g|..) → = −2 Im ρ_eg  (verified against σ-expectations).
  //   ⟨σz⟩ = ρ_ee − ρ_gg.
  // Because σy = i(σ⁻ − σ⁺): σy has ⟨e|σy|g⟩ = −i, ⟨g|σy|e⟩ = +i, so
  //   Tr(ρσy) = ρ_ge·(σy)_eg... Tr(ρA)=Σ ρ_ij A_ji:
  //     = ρ_eg·A_ge + ρ_ge·A_eg = ρ_eg·(i) + ρ_ge·(−i) = i(ρ_eg − ρ_ge) = −2 Im ρ_eg.
  qubitBloch() {
    const rq = this.rhoQubit();
    const OIDX = (i, j) => 2 * (i * 2 + j);
    const ree = rq[OIDX(0, 0)];
    const rgg = rq[OIDX(1, 1)];
    const egRe = rq[OIDX(0, 1)], egIm = rq[OIDX(0, 1) + 1];   // ρ_eg
    return {
      x: 2 * egRe,      // ⟨σx⟩ = 2 Re ρ_eg
      y: -2 * egIm,     // ⟨σy⟩ = −2 Im ρ_eg
      z: ree - rgg,     // ⟨σz⟩ = ρ_ee − ρ_gg
    };
  }

  // ⟨σz⟩ directly from the full ρ (used by tests; equals qubitBloch().z).
  sigmaZ() { return this._F.traceProd(this.rhoM, this.sz).re; }
  sigmaX() { return this._F.traceProd(this.rhoM, this.sx).re; }

  // Fock populations: diagonal of ρ_boson (length Nc). Σ = 1.
  fockPopulations() {
    const F = this._F, IDX = F.IDX, Nc = this.Nc, r = this.rhoM;
    const p = new Array(Nc);
    for (let n = 0; n < Nc; n++) {
      let v = 0;
      for (let q = 0; q < 2; q++) v += r[IDX(n * 2 + q, n * 2 + q)];
      p[n] = v;
    }
    return p;
  }

  // Purity Tr(ρ²) of the full state.
  purity() { return this._F.traceProd(this.rhoM, this.rhoM).re; }

  // Trace of ρ (should be 1).
  trace() { return this._F.trace(this.rhoM); }

  // Raw flat ρ (interleaved [re,im], dim×dim). Live reference — copy if mutating.
  rho() { return this.rhoM; }
}
