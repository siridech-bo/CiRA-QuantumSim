// =============================================================================
// ion.js — REAL single-ion trapped-ion substrate engine (Substrate 3, Phase 1a).
//
// A 1D single ion: two internal levels (g,e) ⊗ a truncated motional Fock space
// (N_FOCK levels). It integrates the Lindblad master equation for the
// (2·N_FOCK)×(2·N_FOCK) density matrix ρ with the SAME flat interleaved [re,im]
// Float64Array RK4 core + adaptive internal sub-step used by src/jc.js and
// src/quantum.js, so it is framework-free (importable in node for tests).
//
// ion.js is a GENERALIZATION of jc.js: the resonant red sideband in the
// Lamb–Dicke regime IS the Jaynes–Cummings Hamiltonian. Here the full
// displacement operator D(iη) is the DEFAULT coupling path, and carrier / red
// sideband / blue sideband EMERGE from the laser detuning δ versus the Rabi
// frequency Ω — they are never hard-wired.
//
// Physics: Ion_Trap_Visualizer_Spec.md §2 + docs/ion-physics-constants.md.
// Primary sources: Wineland et al. J. Res. NIST 103, 259 (1998) [W98];
// Meekhof et al. PRL 76, 1796 (1996) [M96]; Steane APB 64, 623 (1997) [S97].
//
// -----------------------------------------------------------------------------
// Hilbert space (ħ = 1):
//   dim = 2·N_FOCK. Basis index of |s⟩⊗|n⟩ is  idx = s·N_FOCK + n,
//   s ∈ {0 = g, 1 = e}, n ∈ [0, N_FOCK).  This keeps the g/e population blocks
//   contiguous: g = [0, N), e = [N, 2N) — the level diagram slices without gather.
//
// Hamiltonian (frame rotating at the laser frequency; optical RWA only, NO
// sideband RWA — this single H is the DEFAULT path):
//   H/ħ = −δ|e⟩⟨e| + ω_z a†a + (Ω/2)[σ⁺ D(iη) + σ⁻ D(iη)†],
//   δ = ω_L − ω_0,  D(iη) = exp[iη(a + a†)]  (acts on motion only).
//   Energies: E(g,n) = ω_z n,  E(e,n) = −δ + ω_z n.
//   ⇒ carrier |g,n⟩↔|e,n⟩ degenerate at δ=0; red sideband |g,n⟩↔|e,n−1⟩ at
//     δ=−ω_z; blue sideband |g,n⟩↔|e,n+1⟩ at δ=+ω_z. All EMERGENT.
//
// Units: ω_z, δ, Ω, Γ, κ, γ_φ share one angular-frequency unit — natural units
// where the working ω_z ≡ 1 (i.e. frequencies measured in units of the trap
// secular frequency), times in units of 1/ω_z. η is DIMENSIONLESS and is
// computed separately from real SI quantities (mass, wavelength, trap frequency),
// so it is correct regardless of the working time unit — seeing η fall as the
// trap stiffens is itself a lesson (spec §2.8).
// =============================================================================

// Physical constants (SI) — for the Lamb–Dicke η computation only.
const HBAR = 1.054571817e-34;      // J·s
const U    = 1.66053906660e-27;    // kg (atomic mass unit)

// ---------------------------------------------------------------------------
// Flat complex matrix core (dim-aware, interleaved [re,im]). Mirrors jc.js.
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

// ---------------------------------------------------------------------------
// i^s cycle (phase of the displacement matrix element (iη)^s). Returns [re,im].
// ---------------------------------------------------------------------------
function iPow(s) {
  switch (((s % 4) + 4) % 4) {
    case 0: return [1, 0];
    case 1: return [0, 1];
    case 2: return [-1, 0];
    default: return [0, -1];
  }
}

// =============================================================================
// IonSystem — the engine.
//
// constructor(opts) with (all optional):
//   N_FOCK    Fock cutoff                       (default 25)
//   massU     ion mass in u                     (default 40  → ⁴⁰Ca⁺)
//   lambdaNm  drive wavelength in nm            (default 729 → S₁/₂–D₅/₂)
//   nuTrapHz  physical trap freq ν_z in Hz      (default 1e6 → 1 MHz)  [η only]
//   omegaZ    working motional frequency ω_z    (default 1)   [dynamics unit]
//   delta     laser detuning δ = ω_L − ω_0      (default 0)
//   rabi      carrier Rabi frequency Ω          (default 0.05·omegaZ)
//   mode      'exact'|'ld'|'jc'|'ajc'           (default 'exact')
//   Gamma     spontaneous-emission rate Γ       (default 0.1)  [toggle off]
//   nBath     bath occupation n̄_bath            (default 0.1)  [toggle off]
//   heating   heating rate dn̄/dt (quanta/s)     (default 10)   [toggle off]
//   gammaPhi  pure-dephasing rate γ_φ           (default 0.05) [toggle off]
//
// Dissipators default OFF (a fresh IonSystem is unitary). η is COMPUTED from
// massU/lambdaNm/nuTrapHz — the ⁴⁰Ca⁺ default gives η ≈ 0.097.
// =============================================================================
export class IonSystem {
  constructor(opts = {}) {
    this.N_FOCK  = opts.N_FOCK  !== undefined ? opts.N_FOCK  : 25;
    this.massU   = opts.massU   !== undefined ? opts.massU   : 40;
    this.lambdaNm= opts.lambdaNm!== undefined ? opts.lambdaNm: 729;
    this.nuTrapHz= opts.nuTrapHz!== undefined ? opts.nuTrapHz: 1e6;
    this.omegaZ  = opts.omegaZ  !== undefined ? opts.omegaZ  : 1;
    this.delta   = opts.delta   !== undefined ? opts.delta   : 0;
    this.Omega   = opts.rabi    !== undefined ? opts.rabi    : 0.05 * (opts.omegaZ !== undefined ? opts.omegaZ : 1);
    this.mode    = opts.mode    || 'exact';

    // Dissipator rates + toggles (all groups individually togglable, default off).
    this.Gamma    = opts.Gamma    !== undefined ? opts.Gamma    : 0.1;
    this.nBath    = opts.nBath    !== undefined ? opts.nBath    : 0.1;
    this.heating  = opts.heating  !== undefined ? opts.heating  : 10;   // dn̄/dt (quanta/s)
    this.gammaPhi = opts.gammaPhi !== undefined ? opts.gammaPhi : 0.05;
    this.seOn     = !!opts.seOn;       // spontaneous emission
    this.bathOn   = !!opts.bathOn;     // motional bath (heating)
    this.dephaseOn= !!opts.dephaseOn;  // pure dephasing

    // η computed from real SI quantities (spec §2.8).
    this.eta = this._computeEta();

    this._build();
    this.reset();
  }

  // ---- Lamb–Dicke parameter from real quantities: η = k·√(ħ/2mω_z) ----------
  _computeEta() {
    const k = 2 * Math.PI / (this.lambdaNm * 1e-9);   // wavevector (1/m)
    const m = this.massU * U;                          // mass (kg)
    const omega = 2 * Math.PI * this.nuTrapHz;         // trap ang. freq (rad/s)
    const x0 = Math.sqrt(HBAR / (2 * m * omega));      // ground-state extent (m)
    return k * x0;
  }

  // -------------------------------------------------------------------------
  // Build all operators, the displacement/coupling matrix, dissipators, and H.
  // Call after any structural change that alters the dimension.
  // -------------------------------------------------------------------------
  _build() {
    const N = this.N_FOCK;
    const DIM = 2 * N;
    this.dim = DIM;
    const F = makeFlatOps(DIM);
    this._F = F;
    this.mlen = F.MLEN;
    const { IDX, zerosF } = F;

    // idx(s,n) = s·N + n, s∈{0=g,1=e}.
    this._idx = (s, n) => s * N + n;

    // ---- motional a, a†, N embedded (block-diagonal in internal state) -------
    const a = zerosF(), adag = zerosF(), nOp = zerosF();
    for (let s = 0; s < 2; s++) {
      for (let n = 0; n < N; n++) {
        const row = s * N + n;
        nOp[IDX(row, row)] = n;
        if (n >= 1) {
          const sq = Math.sqrt(n);
          a[IDX(s * N + (n - 1), row)] = sq;      // a|s,n⟩ = √n|s,n−1⟩
          adag[IDX(row, s * N + (n - 1))] = sq;   // a†|s,n−1⟩ = √n|s,n⟩
        }
      }
    }
    this.a = a; this.adag = adag; this.nOpM = nOp;

    // ---- internal σ operators embedded (identity on motion) ------------------
    const sz = zerosF(), sp = zerosF(), sm = zerosF(), sx = zerosF(), sy = zerosF();
    const Pe = zerosF();   // |e⟩⟨e| projector
    for (let n = 0; n < N; n++) {
      const g = 0 * N + n, e = 1 * N + n;
      sz[IDX(e, e)] = 1; sz[IDX(g, g)] = -1;   // σz = |e⟩⟨e| − |g⟩⟨g|
      sp[IDX(e, g)] = 1;                        // σ⁺ = |e⟩⟨g|
      sm[IDX(g, e)] = 1;                        // σ⁻ = |g⟩⟨e|
      sx[IDX(e, g)] = 1; sx[IDX(g, e)] = 1;     // σx = σ⁺+σ⁻
      // σy = i(σ⁻ − σ⁺): ⟨e|σy|g⟩ = −i, ⟨g|σy|e⟩ = +i.
      sy[IDX(e, g) + 1] = -1;
      sy[IDX(g, e) + 1] = 1;
      Pe[IDX(e, e)] = 1;
    }
    this.sz = sz; this.sp = sp; this.sm = sm; this.sx = sx; this.sy = sy; this.Pe = Pe;

    // Scratch buffers for the RK4 hot path.
    this._k1 = zerosF(); this._k2 = zerosF(); this._k3 = zerosF(); this._k4 = zerosF();
    this._y = zerosF();
    this._Hrho = zerosF(); this._rhoH = zerosF();
    this._m1 = zerosF(); this._m2 = zerosF(); this._tmp = zerosF(); this._tmp2 = zerosF();
    this._H = zerosF();

    this._buildDisplacement();   // D(iη) matrix (η/N/mode dependent) → cache
    this._buildCoupling();       // Ccoup = σ⁺⊗D + σ⁻⊗D†  (Ω-independent)
    this._buildHdiag();          // diagonal −δ|e⟩⟨e| + ω_z a†a
    this._assembleH();           // H = Hdiag + (Ω/2) Ccoup
    this._buildDissipators();
    this._setSubStep();
  }

  // -------------------------------------------------------------------------
  // Displacement matrix D[n'][n] = ⟨n'|D(iη)|n⟩ (flat complex N×N).
  //   ⟨n'|D(iη)|n⟩ = e^(−η²/2) (iη)^|s| √(n<!/n>!) L_{n<}^{|s|}(η²),  s = n'−n.
  // For α = iη purely imaginary the matrix is complex-SYMMETRIC (D[a][b]=D[b][a]).
  // Debye–Waller e^(−η²/2) appears ONCE, inside the element (no separate carrier
  // factor). Generalized Laguerre by UPWARD RECURRENCE in the degree; √(n<!/n>!)
  // carried as an incremental product (the factorial closed form overflows n≈20).
  // -------------------------------------------------------------------------
  _buildDisplacement() {
    const N = this.N_FOCK, eta = this.eta, mode = this.mode;
    const D = new Float64Array(2 * N * N);
    const DI = (i, j) => 2 * (i * N + j);

    if (mode === 'exact') {
      const x = eta * eta;           // η²
      const dw = Math.exp(-x / 2);   // Debye–Waller (once)
      const L = new Float64Array(N); // L_k^{(s)}(x) for k=0..N-1 at fixed s
      for (let s = 0; s < N; s++) {
        // degree recurrence for generalized Laguerre L_k^{(s)}(x):
        L[0] = 1;
        if (N > 1) L[1] = 1 + s - x;
        for (let k = 1; k < N - 1; k++)
          L[k + 1] = ((2 * k + 1 + s - x) * L[k] - (k + s) * L[k - 1]) / (k + 1);

        const etaS = Math.pow(eta, s);
        const [pr, pi] = iPow(s);
        for (let nmin = 0; nmin + s < N; nmin++) {
          const nmax = nmin + s;
          // ratio = √(nmin!/nmax!) = ∏_{j=1}^{s} 1/√(nmin+j)  (incremental product)
          let ratio = 1;
          for (let j = 1; j <= s; j++) ratio /= Math.sqrt(nmin + j);
          const mag = dw * etaS * ratio * L[nmin];
          const re = mag * pr, im = mag * pi;
          // complex-symmetric: both (nmax,nmin) and (nmin,nmax) equal.
          D[DI(nmax, nmin)] = re;  D[DI(nmax, nmin) + 1] = im;
          D[DI(nmin, nmax)] = re;  D[DI(nmin, nmax) + 1] = im;
        }
      }
    } else if (mode === 'ld') {
      // Lamb–Dicke: carrier Ω(1−η²n), first sidebands Ωη√n / Ωη√(n+1), else 0.
      // Phases match 'exact' to first order: diagonal real, |Δn|=1 element = iη√nmax.
      for (let n = 0; n < N; n++) {
        D[DI(n, n)] = 1 - eta * eta * n;   // ⟨n|D|n⟩ ≈ 1 − η²n
        if (n >= 1) {
          const v = eta * Math.sqrt(n);    // iη√n  (imaginary)
          D[DI(n - 1, n) + 1] = v;
          D[DI(n, n - 1) + 1] = v;
        }
      }
    } else if (mode === 'jc') {
      // red sideband only: (Ω/2)σ⁺D = (ηΩ/2)aσ⁺ ⇒ D = η·a  (D[n−1][n]=η√n).
      for (let n = 1; n < N; n++) D[DI(n - 1, n)] = eta * Math.sqrt(n);
    } else if (mode === 'ajc') {
      // blue sideband only: (Ω/2)σ⁺D = (ηΩ/2)a†σ⁺ ⇒ D = η·a†  (D[n+1][n]=η√(n+1)).
      for (let n = 0; n + 1 < N; n++) D[DI(n + 1, n)] = eta * Math.sqrt(n + 1);
    } else {
      throw new Error(`IonSystem: unknown coupling mode '${mode}'`);
    }
    this._D = D;
  }

  // Ccoup = σ⁺⊗D + σ⁻⊗D†  (Ω-independent). ⟨e,m|σ⁺⊗D|g,n⟩ = D[m][n]; h.c. below.
  _buildCoupling() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX;
    const D = this._D, DI = (i, j) => 2 * (i * N + j);
    const C = F.zerosF();
    for (let m = 0; m < N; m++)
      for (let n = 0; n < N; n++) {
        const dr = D[DI(m, n)], di = D[DI(m, n) + 1];
        if (dr === 0 && di === 0) continue;
        const eRow = 1 * N + m, gCol = 0 * N + n;   // |e,m⟩⟨g,n|
        C[IDX(eRow, gCol)] = dr;  C[IDX(eRow, gCol) + 1] = di;
        // h.c.: |g,n⟩⟨e,m| = conj(D[m][n])
        C[IDX(gCol, eRow)] = dr;  C[IDX(gCol, eRow) + 1] = -di;
      }
    this._Ccoup = C;
  }

  // Diagonal Hamiltonian −δ|e⟩⟨e| + ω_z a†a.
  _buildHdiag() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX;
    const H = F.zerosF();
    for (let s = 0; s < 2; s++)
      for (let n = 0; n < N; n++) {
        const row = s * N + n;
        H[IDX(row, row)] = this.omegaZ * n - (s === 1 ? this.delta : 0);
      }
    this._Hdiag = H;
  }

  // H = Hdiag + (Ω/2)·Ccoup.
  _assembleH() {
    this._H = this._F.axpyF(this._Hdiag, this._Ccoup, this.Omega / 2, this._H);
  }

  // -------------------------------------------------------------------------
  // Dissipators (spec §2.5). Each group individually togglable.
  //   spontaneous emission (motion-preserving): c = √Γ |g⟩⟨e| ⊗ I   [Phase 1]
  //   motional bath: L₋=√(κ(n̄+1)) a, L₊=√(κ n̄) a†,  κ = (dn̄/dt)/n̄_bath
  //   pure dephasing: L_φ = √(γ_φ/2) σz ⊗ I
  // Precompute the collapse operators + halfA = ½ Σ_c L_c†L_c.
  // (The recoil-kernel spontaneous emission is DEFERRED to Phase 2 per the
  //  locked decisions — a candidate claim was refuted in the research pass.)
  // -------------------------------------------------------------------------
  _buildDissipators() {
    const F = this._F;
    const ops = [];
    if (this.seOn && this.Gamma > 0) {
      ops.push(F.scaleF(this.sm, Math.sqrt(this.Gamma)));   // √Γ σ⁻
    }
    if (this.bathOn) {
      const kappa = this.nBath > 0 ? this.heating / this.nBath : 0;   // dn̄/dt = κ n̄
      if (kappa > 0) {
        ops.push(F.scaleF(this.a,    Math.sqrt(kappa * (this.nBath + 1))));  // L₋
        if (this.nBath > 0)
          ops.push(F.scaleF(this.adag, Math.sqrt(kappa * this.nBath)));      // L₊
      }
    }
    if (this.dephaseOn && this.gammaPhi > 0) {
      ops.push(F.scaleF(this.sz, Math.sqrt(this.gammaPhi / 2)));   // √(γφ/2) σz
    }
    const collapse = [];
    let halfA = F.zerosF();
    for (const L of ops) {
      const Ldag = F.daggerF(L);
      const LdagL = F.mmul(Ldag, L);
      halfA = F.axpyF(halfA, LdagL, 0.5, halfA);
      collapse.push({ L, Ldag });
    }
    this._collapse = collapse;
    this._halfA = halfA;
    this._hasDiss = collapse.length > 0;
  }

  // Internal RK4 sub-step from a Gershgorin bound on the generator's fastest
  // angular frequency (|H| row-sums plus the dissipator scale). Capped for RK4
  // accuracy on the fast motional oscillation.
  _setSubStep() {
    const F = this._F, DIM = this.dim, IDX = F.IDX;
    const H = this._H, A = this._halfA;
    let rowMax = 0;
    for (let i = 0; i < DIM; i++) {
      let s = 0;
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        s += Math.hypot(H[idx], H[idx + 1]);
        s += Math.hypot(A[idx], A[idx + 1]);
      }
      if (s > rowMax) rowMax = s;
    }
    this.subStep = rowMax > 0 ? Math.min(0.05, 2.5 / rowMax) : 0.05;
  }

  // -------------------------------------------------------------------------
  // Parameter setters.
  // -------------------------------------------------------------------------
  setDetuning(delta) { this.delta = delta; this._buildHdiag(); this._assembleH(); this._setSubStep(); }
  setRabi(rabi)      { this.Omega = rabi; this._assembleH(); this._setSubStep(); }
  setOmegaZ(omegaZ)  { this.omegaZ = omegaZ; this._buildHdiag(); this._assembleH(); this._setSubStep(); }

  setCouplingMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this._buildDisplacement();
    this._buildCoupling();
    this._assembleH();
    this._setSubStep();
  }

  // η via trap parameters (spec §2.8): recompute η, rebuild the coupling.
  setTrap({ massU, lambdaNm, nuTrapHz } = {}) {
    if (massU    !== undefined) this.massU    = massU;
    if (lambdaNm !== undefined) this.lambdaNm = lambdaNm;
    if (nuTrapHz !== undefined) this.nuTrapHz = nuTrapHz;
    this.eta = this._computeEta();
    this._buildDisplacement();
    this._buildCoupling();
    this._assembleH();
    this._setSubStep();
  }
  setEtaParams(p) { return this.setTrap(p); }   // alias

  setNFock(N) {
    if (N === this.N_FOCK) return;
    this.N_FOCK = N;
    this._build();
    this.reset();
  }

  // Dissipator toggles + rates.
  setSpontaneousEmission(on, Gamma) { this.seOn = !!on; if (Gamma !== undefined) this.Gamma = Gamma; this._buildDissipators(); this._setSubStep(); }
  setMotionalBath(on, opts = {})    { this.bathOn = !!on; if (opts.heating !== undefined) this.heating = opts.heating; if (opts.nBath !== undefined) this.nBath = opts.nBath; this._buildDissipators(); this._setSubStep(); }
  setDephasing(on, gammaPhi)        { this.dephaseOn = !!on; if (gammaPhi !== undefined) this.gammaPhi = gammaPhi; this._buildDissipators(); this._setSubStep(); }
  setHeatingRate(rate)              { this.heating = rate; this._buildDissipators(); this._setSubStep(); }
  setAllDissipators(on)             { this.seOn = this.bathOn = this.dephaseOn = !!on; this._buildDissipators(); this._setSubStep(); }

  Ncutoff() { return this.N_FOCK; }
  dimension() { return this.dim; }

  // -------------------------------------------------------------------------
  // Initial states. Default |g,0⟩ (internal ground, motional vacuum).
  // -------------------------------------------------------------------------
  reset() {
    this.t = 0;
    const m = this._F.zerosF();
    m[this._F.IDX(0, 0)] = 1;   // |g,0⟩ = idx 0
    this.rhoM = m;
  }

  // Seed ρ = |internal,n⟩⟨internal,n|. internal: 'g'|'e'.
  setFock(n, internal = 'g') {
    const s = internal === 'e' ? 1 : 0;
    const idx = s * this.N_FOCK + n;
    const m = this._F.zerosF();
    m[this._F.IDX(idx, idx)] = 1;
    this.rhoM = m;
    this.t = 0;
  }

  // Seed a thermal motional state (mean n̄) ⊗ internal ground |g⟩.
  setThermal(nbar, internal = 'g') {
    const N = this.N_FOCK, s = internal === 'e' ? 1 : 0, F = this._F;
    const m = F.zerosF();
    // P(n) = n̄^n/(1+n̄)^(n+1), renormalized over the truncated space.
    const p = new Float64Array(N); let norm = 0;
    for (let n = 0; n < N; n++) { p[n] = Math.pow(nbar / (1 + nbar), n) / (1 + nbar); norm += p[n]; }
    for (let n = 0; n < N; n++) {
      const idx = s * N + n;
      m[F.IDX(idx, idx)] = p[n] / norm;
    }
    this.rhoM = m;
    this.t = 0;
  }

  // Seed a coherent motional state |α⟩ ⊗ internal |g⟩ (α real or complex).
  setCoherent(alphaRe, alphaIm = 0, internal = 'g') {
    const N = this.N_FOCK, s = internal === 'e' ? 1 : 0, F = this._F;
    const mag2 = alphaRe * alphaRe + alphaIm * alphaIm;
    // amplitudes c_n = e^(−|α|²/2) α^n/√(n!)
    const cRe = new Float64Array(N), cIm = new Float64Array(N);
    let pr = Math.exp(-mag2 / 2), pi = 0;   // running α^n/√(n!) · e^(−|α|²/2)
    for (let n = 0; n < N; n++) {
      cRe[n] = pr; cIm[n] = pi;
      // multiply by α/√(n+1)
      const inv = 1 / Math.sqrt(n + 1);
      const nr = (pr * alphaRe - pi * alphaIm) * inv;
      const ni = (pr * alphaIm + pi * alphaRe) * inv;
      pr = nr; pi = ni;
    }
    const m = F.zerosF();
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const ri = s * N + i, rj = s * N + j;
        // ρ = |ψ⟩⟨ψ|: ρ_ij = c_i conj(c_j)
        const re = cRe[i] * cRe[j] + cIm[i] * cIm[j];
        const im = cIm[i] * cRe[j] - cRe[i] * cIm[j];
        m[F.IDX(ri, rj)] = re; m[F.IDX(ri, rj) + 1] = im;
      }
    this.rhoM = m;
    this.t = 0;
  }

  // Seed an arbitrary flat density matrix (dim×dim). Copies.
  setRho(flat) { this.rhoM = Float64Array.from(flat); this.t = 0; }

  // -------------------------------------------------------------------------
  // Lindblad RHS: dρ/dt = −i[H,ρ] + Σ_c( L_c ρ L_c† − ½{L_c†L_c, ρ} ).
  // -------------------------------------------------------------------------
  _rhs(rho, out) {
    const F = this._F, DIM = this.dim, IDX = F.IDX, MLEN = F.MLEN;
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
    if (this._hasDiss) {
      const halfA = this._halfA;
      const t1 = F.mmul(halfA, rho, this._tmp);
      const t2 = F.mmul(rho, halfA, this._tmp2);
      for (let m = 0; m < MLEN; m++) out[m] -= (t1[m] + t2[m]);
      for (const { L, Ldag } of this._collapse) {
        const Lrho = F.mmul(L, rho, this._m1);
        const LrhoLd = F.mmul(Lrho, Ldag, this._m2);
        for (let m = 0; m < MLEN; m++) out[m] += LrhoLd[m];
      }
    }
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

  // Advance ρ by `dt` (in units of 1/ω_z) via RK4 with adaptive sub-steps.
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

  // -------------------------------------------------------------------------
  // Derived quantities (spec §2.7).
  // -------------------------------------------------------------------------
  // { g: Float64Array(N), e: Float64Array(N) } — diagonal populations by block.
  populations() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    const g = new Float64Array(N), e = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      g[n] = r[IDX(0 * N + n, 0 * N + n)];
      e[n] = r[IDX(1 * N + n, 1 * N + n)];
    }
    return { g, e };
  }

  nBar() { return this._F.traceProd(this.rhoM, this.nOpM).re; }        // ⟨a†a⟩
  pExcited() { return this._F.traceProd(this.rhoM, this.Pe).re; }      // Tr(ρ|e⟩⟨e|)

  // Internal-state Bloch vector, reduced over motion.
  blochVector() {
    return {
      x: this._F.traceProd(this.rhoM, this.sx).re,
      y: this._F.traceProd(this.rhoM, this.sy).re,
      z: this._F.traceProd(this.rhoM, this.sz).re,
    };
  }

  rho() { return this.rhoM; }   // live flat ρ (copy if mutating)

  // |ρ| magnitudes, dim×dim (row-major), for the heatmap.
  rhoAbs() {
    const DIM = this.dim, F = this._F, IDX = F.IDX, r = this.rhoM;
    const out = new Float64Array(DIM * DIM);
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        out[i * DIM + j] = Math.hypot(r[idx], r[idx + 1]);
      }
    return out;
  }

  // Ω_{n',n} currently in force = Ω·|D[n'][n]| (N×N, row-major real). Drives the
  // level diagram / used by the tests for the Debye–Waller + exact-vs-ld checks.
  couplingMatrix() {
    const N = this.N_FOCK, D = this._D, DI = (i, j) => 2 * (i * N + j);
    const out = new Float64Array(N * N);
    for (let m = 0; m < N; m++)
      for (let n = 0; n < N; n++)
        out[m * N + n] = this.Omega * Math.hypot(D[DI(m, n)], D[DI(m, n) + 1]);
    return out;
  }

  detuning() { return this.delta; }   // current δ
  rabi()     { return this.Omega; }    // current Ω (carrier Rabi frequency)
  etaValue() { return this.eta; }      // computed Lamb–Dicke parameter η

  // Population in the top 3 Fock states (both internal blocks).
  truncationOccupancy() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    let s = 0;
    for (let n = Math.max(0, N - 3); n < N; n++)
      for (let internal = 0; internal < 2; internal++) {
        const idx = internal * N + n;
        s += r[IDX(idx, idx)];
      }
    return s;
  }

  // Diagonal over motion, traced over internal state: P(n), length N.
  fockDistribution() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    const p = new Float64Array(N);
    for (let n = 0; n < N; n++)
      p[n] = r[IDX(0 * N + n, 0 * N + n)] + r[IDX(1 * N + n, 1 * N + n)];
    return p;
  }

  purity() { return this._F.traceProd(this.rhoM, this.rhoM).re; }
  trace() { return this._F.trace(this.rhoM); }
}
