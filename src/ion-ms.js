// =============================================================================
// ion-ms.js — REAL Mølmer–Sørensen two-qubit gate engine (Substrate 3, M7).
//
// A NEW small engine: 2 qubits ⊗ 1 shared motional mode. Hilbert space
//   dim = 4 · N_FOCK  (default N_FOCK = 20 ⇒ dim = 80).
// It integrates the Lindblad master equation with the SAME flat interleaved
// [re,im] Float64Array RK4 core used by src/ion.js / src/jc.js, so it is
// framework-free (node-importable for the test). ion.js is UNTOUCHED — the MS
// gate needs a genuinely different Hilbert space (two spins), so it lives here.
//
// -----------------------------------------------------------------------------
// Physics — Ion_Trap_Visualizer_Spec.md §4 (M7) + docs/ion-physics-constants.md §8.
//
// A bichromatic drive symmetric about the qubit transition, detuned by δ from the
// motional sidebands, gives (interaction picture, Lamb–Dicke, RWA) the MS
// Hamiltonian — a spin-dependent force on the shared mode:
//
//   H(t) = (ηΩ/2) · S_φ · ( a e^{−iδ t} + a† e^{+iδ t} ),   S_φ = σ_φ^(1) + σ_φ^(2)
//
// (We drive along φ = x, so S_φ = S_x = σ_x^(1)+σ_x^(2).) The motional operators
// a, a† rotate in the interaction picture, so there is NO ω_z a†a term here — the
// only frequency left is the small detuning δ. Each S_x eigenvalue s ∈ {−2,0,+2}
// sees a displacement force: the mode traces a phase-space loop
//   β_s(t) = −i s (ηΩ/2) (1 − e^{−iδ t})/δ ,   |β_s|_max = |s| ηΩ/δ ,
// a circle that CLOSES at the gate time τ_g = 2πK/δ (K = integer # of loops). The
// enclosed area is a geometric phase Θ·S_x² that entangles the two qubits, and at
// closure the motion returns to its start (spin–motion DISENTANGLED).
//
// -----------------------------------------------------------------------------
// CONVENTION LOCK (hardcoded — see docs/ion-physics-constants.md §8 flags):
//   • Detuning sign: the e^{−iδt} tone multiplies a (and e^{+iδt} multiplies a†),
//     with δ > 0. This is ONE fixed choice of the two symmetric-tone sign flags.
//   • χ / coupling factor: the collective-spin coupling prefactor is ηΩ/2 (i.e.
//     H = ηΩ·J_φ·(…) with J_φ = (σ+σ)/2 the collective spin). This is exactly the
//     factor-of-2 flag §8 calls out (χ = (ηΩ)²/Δν vs (ηΩ)²/2Δν). This particular
//     choice is what makes the §8 loop-closure pair
//         τ_g = 2πK/δ ,   ηΩ = δ/(2√K)
//     land on the MAXIMALLY entangling gate. A Magnus expansion (the [H(t1),H(t2)]
//     commutator is a c-number × S_x², so the series terminates at 2nd order) gives
//         U(τ_g) = exp[ i Θ S_x² ] ,   Θ(τ_g) = 2πK (ηΩ/2)²/δ² .
//     With ηΩ = δ/(2√K):  Θ = π/8, so U = exp[i(π/8)S_x²], and since S_x² =
//     2 + 2σ_x^(1)σ_x^(2), that is the canonical entangling MS unitary. It maps
//         |gg⟩ → e^{iπ/4}(|gg⟩ + i|ee⟩)/√2   (Bell state, global phase e^{iπ/4}).
//   • Bell target / i-sign: with the above signs the engine produces
//     |Φ⟩ = (|gg⟩ + i|ee⟩)/√2 (up to global phase). bellFidelity() uses that target
//     (empirically confirmed by test/ion-ms.test.mjs — the fidelity IS the check).
//   The literal §8 "ηΩ · S_φ" (prefactor 1, S=σ+σ) would give Θ = π/2 ⇒ U = I
//   (a full, trivial 4-loop of geometric phase). The /2 is therefore REQUIRED, and
//   the numerical Bell fidelity > 0.999 (assertion 15) is the verification of it.
//
// Units: δ, ηΩ, κ, γ_φ share one angular-frequency unit; times in units of 1/(that
// unit). η is dimensionless; only the product ηΩ enters the gate, but η and Ω are
// stored separately (settable) so the UI can show both. Break-it (assertion 16):
// mis-set δ off the loop-closure value while keeping the drive/gate-time from the
// nominal δ ⇒ the loop fails to close ⇒ residual spin–motion entanglement drags the
// Bell fidelity down.
// =============================================================================

// ---------------------------------------------------------------------------
// Flat complex matrix core (dim-aware, interleaved [re,im]). Mirrors ion.js/jc.js.
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

// Two-qubit index convention: q = 2·s1 + s2, s∈{0=g,1=e}:
//   0 = |gg⟩, 1 = |ge⟩, 2 = |eg⟩, 3 = |ee⟩.
// Global index of |q⟩⊗|n⟩ is idx = q·N_FOCK + n (qubit blocks contiguous).
const QGG = 0, QGE = 1, QEG = 2, QEE = 3;

// S_x = σ_x^(1) + σ_x^(2) on the 4-dim two-qubit space (real symmetric).
//   σ_x^(1): |gg⟩↔|eg⟩ (0↔2), |ge⟩↔|ee⟩ (1↔3)
//   σ_x^(2): |gg⟩↔|ge⟩ (0↔1), |eg⟩↔|ee⟩ (2↔3)
function buildSx4() {
  const S = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  S[QGG][QEG] = 1; S[QEG][QGG] = 1;   // σx1
  S[QGE][QEE] = 1; S[QEE][QGE] = 1;
  S[QGG][QGE] = 1; S[QGE][QGG] = 1;   // σx2
  S[QEG][QEE] = 1; S[QEE][QEG] = 1;
  return S;
}

// =============================================================================
// MSGate — the engine.
//
// constructor(opts), all optional:
//   N_FOCK  Fock cutoff                         (default 20  ⇒ dim 80)
//   eta     Lamb–Dicke parameter η              (default 0.1)
//   Omega   carrier Rabi Ω (product ηΩ is what enters; auto-matched by default)
//   delta   sideband detuning δ (> 0)           (default 1)
//   K       integer # of phase-space loops      (default 1)
//   matchClosure  if true (default) set Ω so ηΩ = δ/(2√K) (loop closure)
//   kappa   motional heating rate (bath), quanta/s        (default 0, off)
//   nBath   bath occupation for heating                    (default 0)
//   gammaPhi qubit pure-dephasing rate γ_φ (both qubits)   (default 0, off)
//
// Dissipators default OFF ⇒ a fresh MSGate is unitary (global purity preserved).
// =============================================================================
export class MSGate {
  constructor(opts = {}) {
    this.N_FOCK = opts.N_FOCK !== undefined ? opts.N_FOCK : 20;
    this.eta    = opts.eta    !== undefined ? opts.eta    : 0.1;
    this.delta  = opts.delta  !== undefined ? opts.delta  : 1;
    this.K      = opts.K      !== undefined ? opts.K      : 1;

    // Coupling: only the product ηΩ enters. Default to the loop-closure value.
    const match = opts.matchClosure !== undefined ? opts.matchClosure : (opts.Omega === undefined);
    if (opts.Omega !== undefined && !match) this.Omega = opts.Omega;
    else this.Omega = this.closureCoupling() / this.eta;   // ηΩ = δ/(2√K)

    // Optional dissipators (default off).
    this.kappa    = opts.kappa    !== undefined ? opts.kappa    : 0;
    this.nBath    = opts.nBath    !== undefined ? opts.nBath    : 0;
    this.gammaPhi = opts.gammaPhi !== undefined ? opts.gammaPhi : 0;
    this.heatOn   = !!opts.heatOn;
    this.dephaseOn = !!opts.dephaseOn;

    // ---- U3: open-system verification of shaped / imperfect gates -------------
    // pulse: { tau, amp:[Ω₀,Ω₁,…] } piecewise-constant physical Rabi Ω(t) (overrides
    //   the constant drive & gate time — e.g. a robust waveform from solveShapeRobust,
    //   with amp already scaled to physical Ω); the amplitudes multiply this.Omega.
    // deltaOmega: common-mode asymmetric (center-line) error Δω → (Δω/2)(σz¹+σz²).
    // carrier: include the leading beyond-RWA off-resonant carrier (≈ω_z) — matters
    //   only at high peak Ω/ω_z; reports the RWA gap. omegaZ sets that scale (natural 1).
    this._pulse = opts.pulse || null;
    this.deltaOmega = opts.deltaOmega || 0;
    this.carrierOn = !!opts.carrier;
    this.omegaZ = opts.omegaZ !== undefined ? opts.omegaZ : 1;
    // thetaSign flips the entangling-phase sign Θ→−Θ via the drive quadrature (HS→−HS)
    // WITHOUT changing the gate time or closure (unlike δ→−δ). Used for GBC's −Θ leg.
    this.thetaSign = opts.thetaSign !== undefined ? opts.thetaSign : 1;

    this._Sx4 = buildSx4();
    this._build();
    this.reset();
  }

  // ---- loop-closure helpers (docs §8) --------------------------------------
  closureCoupling() { return this.delta / (2 * Math.sqrt(this.K)); }   // target ηΩ
  gateTime()        { return this._pulse ? this._pulse.tau : 2 * Math.PI * this.K / this.delta; }   // τ_g = 2πK/δ (or pulse duration)
  etaOmega()        { return this.eta * this.Omega; }                   // current ηΩ
  // Fractional deviation of the current drive from exact loop closure.
  closureMismatch() { return this.etaOmega() / this.closureCoupling() - 1; }

  // -------------------------------------------------------------------------
  // Build the constant time-independent pieces of H(t) and the dissipators.
  //   H(t) = HC·cos(δt) + HS·sin(δt), with
  //     HC = (ηΩ/2) S_x ⊗ (a + a†)      (real, symmetric)
  //     HS = i (ηΩ/2) S_x ⊗ (a† − a)    (pure-imaginary entries; Hermitian)
  // Both stored as flat complex; H(t) is assembled elementwise per RK4 stage.
  // -------------------------------------------------------------------------
  _build() {
    const N = this.N_FOCK, DIM = 4 * N;
    this.dim = DIM;
    const F = makeFlatOps(DIM);
    this._F = F;
    this.mlen = F.MLEN;
    const { IDX, zerosF } = F;

    // motional a, a† (embedded per qubit block).
    const a = zerosF(), adag = zerosF(), nOp = zerosF();
    for (let q = 0; q < 4; q++)
      for (let n = 0; n < N; n++) {
        const row = q * N + n;
        nOp[IDX(row, row)] = n;
        if (n >= 1) {
          const sq = Math.sqrt(n);
          a[IDX(q * N + (n - 1), row)] = sq;      // a|q,n⟩ = √n|q,n−1⟩
          adag[IDX(row, q * N + (n - 1))] = sq;   // a†|q,n−1⟩ = √n|q,n⟩
        }
      }
    this.aOp = a; this.adagOp = adag; this.nOpM = nOp;

    // HC = (ηΩ/2) S_x⊗(a+a†) real; HS = i(ηΩ/2) S_x⊗(a†−a) imaginary.
    const g = 0.5 * this.eta * this.Omega;   // ηΩ/2
    const HC = zerosF(), HS = zerosF();
    const Sx = this._Sx4;
    for (let q1 = 0; q1 < 4; q1++)
      for (let q2 = 0; q2 < 4; q2++) {
        const sxv = Sx[q1][q2];
        if (sxv === 0) continue;
        for (let n = 0; n < N; n++) {
          const m = n + 1;
          if (m >= N) continue;
          const rt = Math.sqrt(m);   // √(n+1)
          // (a+a†): element (m,n)=√(n+1)=rt, (n,m)=rt   → real, symmetric
          const rowU = q1 * N + m, colU = q2 * N + n;   // (m,n) upper
          const rowL = q1 * N + n, colL = q2 * N + m;   // (n,m) lower
          HC[IDX(rowU, colU)] += g * sxv * rt;
          HC[IDX(rowL, colL)] += g * sxv * rt;
          // i(a†−a): a†→(m,n)=+rt, a→(n,m)=+rt, so (a†−a) has (m,n)=+rt,(n,m)=−rt.
          //   HS = i·g·sxv·(a†−a): imaginary parts.
          HS[IDX(rowU, colU) + 1] += g * sxv * rt;    // +i g sxv rt at (m,n)
          HS[IDX(rowL, colL) + 1] += -g * sxv * rt;   // −i g sxv rt at (n,m)
        }
      }
    this._HC = HC; this._HS = HS;

    // U3: asymmetric-error term H_z = (Δω/2)(σz¹+σz²)⊗I — constant, diagonal over the
    // qubit blocks (q=0 |gg⟩→+2, q=3 |ee⟩→−2). Does NOT commute with the σx entangler,
    // so GBC (src/ion-gbc.js) is needed to cancel it — here we integrate it exactly.
    const Hz = zerosF();
    if (this.deltaOmega) {
      const dz = [this.deltaOmega, 0, 0, -this.deltaOmega];    // (Δω/2)·[+2,0,0,−2]
      for (let q = 0; q < 4; q++) if (dz[q]) for (let n = 0; n < N; n++) { const idx = q * N + n; Hz[IDX(idx, idx)] = dz[q]; }
    }
    this._Hz = Hz;
    // U3: collective σx (⊗I on motion) for the leading beyond-RWA carrier term.
    const Sx0 = zerosF();
    if (this.carrierOn)
      for (let q1 = 0; q1 < 4; q1++) for (let q2 = 0; q2 < 4; q2++) { const v = Sx[q1][q2]; if (v) for (let n = 0; n < N; n++) Sx0[IDX(q1 * N + n, q2 * N + n)] = v; }
    this._Sx0 = Sx0;
    this._dw = Math.exp(-this.eta * this.eta / 2);              // Debye–Waller carrier reduction

    // Scratch buffers for the RK4 hot path.
    this._k1 = zerosF(); this._k2 = zerosF(); this._k3 = zerosF(); this._k4 = zerosF();
    this._y = zerosF();
    this._Hrho = zerosF(); this._rhoH = zerosF();
    this._m1 = zerosF(); this._m2 = zerosF(); this._tmp = zerosF(); this._tmp2 = zerosF();
    this._H = zerosF();

    // qubit projectors |q⟩⟨q|⊗I for populations.
    this._Pq = [];
    for (let q = 0; q < 4; q++) {
      const P = zerosF();
      for (let n = 0; n < N; n++) { const idx = q * N + n; P[IDX(idx, idx)] = 1; }
      this._Pq.push(P);
    }

    this._buildDissipators();
    this._setSubStep();
  }

  // -------------------------------------------------------------------------
  // Dissipators (all default off). Motional heating (bath) + qubit dephasing.
  //   L₋ = √(κ(n̄+1)) a, L₊ = √(κ n̄) a†  (κ = heating rate / n̄_bath, as in ion.js)
  //   L_φ^(k) = √(γ_φ/2) σz^(k) ⊗ I  for each qubit
  // -------------------------------------------------------------------------
  _buildDissipators() {
    const F = this._F, N = this.N_FOCK, { IDX, zerosF, scaleF } = F;
    const ops = [];
    if (this.heatOn && this.kappa > 0) {
      ops.push(scaleF(this.aOp, Math.sqrt(this.kappa * (this.nBath + 1))));
      if (this.nBath > 0) ops.push(scaleF(this.adagOp, Math.sqrt(this.kappa * this.nBath)));
    }
    if (this.dephaseOn && this.gammaPhi > 0) {
      // σz^(k) = |e⟩⟨e| − |g⟩⟨g| on qubit k, identity on the other qubit + motion.
      const sgn = (q, which) => {   // which: 1 or 2 → sign of that qubit's σz
        const s1 = (q >> 1) & 1, s2 = q & 1;
        const s = which === 1 ? s1 : s2;
        return s === 1 ? 1 : -1;
      };
      for (const which of [1, 2]) {
        const sz = zerosF();
        for (let q = 0; q < 4; q++)
          for (let n = 0; n < N; n++) { const idx = q * N + n; sz[IDX(idx, idx)] = sgn(q, which); }
        ops.push(scaleF(sz, Math.sqrt(this.gammaPhi / 2)));
      }
    }
    const collapse = [];
    let halfA = zerosF();
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

  // RK4 sub-step from a Gershgorin bound on |HC|+|HS| plus the dissipator scale,
  // and capped to resolve the drive oscillation at δ (accuracy on cos/sin δt).
  _setSubStep() {
    const F = this._F, DIM = this.dim, IDX = F.IDX;
    const HC = this._HC, HS = this._HS, A = this._halfA;
    let rowH = 0, rowA = 0;
    for (let i = 0; i < DIM; i++) {
      let sH = 0, sA = 0;
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
        sH += Math.hypot(HC[idx], HC[idx + 1]) + Math.hypot(HS[idx], HS[idx + 1]);   // drive (at Ω₀)
        sA += Math.hypot(A[idx], A[idx + 1]);                                        // dissipator
      }
      if (sH > rowH) rowH = sH; if (sA > rowA) rowA = sA;
    }
    // U3: scale the drive part by the PEAK Ω/Ω₀ of the pulse, and add the constant
    // H_z (Δω) and the carrier (≈Ω·e^{−η²/2}) so the CPTP-safe sub-step shrinks with
    // any of them; also resolve the fastest oscillation (δ and, if on, the carrier ω_z).
    const peak = this._pulse ? Math.max(...this._pulse.amp.map(Math.abs)) / Math.max(this.Omega, 1e-12) : 1;
    const extra = 2 * Math.abs(this.deltaOmega) + (this.carrierOn ? 2 * Math.abs(this.Omega * this._dw) : 0);
    const bound = peak * rowH + rowA + extra;
    const byH = bound > 0 ? 2.5 / bound : 0.03;
    const fastOsc = Math.max(this.delta, this.carrierOn ? Math.abs(this.omegaZ - this.delta) : 0);
    const byDrive = fastOsc > 0 ? 0.08 / fastOsc : 0.03;                             // resolve cos(δt)/cos(ω_z t)
    const cap = (this._pulse || this.carrierOn || this.deltaOmega) ? 0.02 : 0.03;    // tighter for time-dep / stiff H
    this.subStep = Math.min(cap, byH, byDrive);
  }

  // -------------------------------------------------------------------------
  // Parameter setters (rebuild only what changed).
  // -------------------------------------------------------------------------
  setDelta(delta)  { this.delta = delta;  this._build(); this.reset(); }
  setK(K)          { this.K = K;          this._build(); this.reset(); }
  setEta(eta)      { this.eta = eta;      this._build(); this.reset(); }
  setOmega(Omega)  { this.Omega = Omega;  this._build(); this.reset(); }
  setEtaOmega(g)   { this.Omega = g / this.eta; this._build(); this.reset(); }
  // Set Ω so that ηΩ = δ/(2√K) exactly (loop closure at τ_g = 2πK/δ).
  matchClosure()   { this.Omega = this.closureCoupling() / this.eta; this._build(); this.reset(); }
  setNFock(N)      { this.N_FOCK = N;     this._build(); this.reset(); }

  setMotionalHeating(on, opts = {}) {
    this.heatOn = !!on;
    if (opts.kappa !== undefined) this.kappa = opts.kappa;
    if (opts.nBath !== undefined) this.nBath = opts.nBath;
    this._buildDissipators(); this._setSubStep();
  }
  setDephasing(on, gammaPhi) {
    this.dephaseOn = !!on;
    if (gammaPhi !== undefined) this.gammaPhi = gammaPhi;
    this._buildDissipators(); this._setSubStep();
  }

  dimension() { return this.dim; }
  Ncutoff()   { return this.N_FOCK; }

  // -------------------------------------------------------------------------
  // Initial state |gg,0⟩ (both qubits ground, motional vacuum).
  // -------------------------------------------------------------------------
  reset() {
    this.t = 0;
    const m = this._F.zerosF();
    m[this._F.IDX(0, 0)] = 1;   // |gg,0⟩ = idx 0
    this.rhoM = m;
  }
  setRho(flat) { this.rhoM = Float64Array.from(flat); this.t = 0; }

  // Physical Rabi Ω(t): a piecewise-constant pulse envelope, else the constant drive.
  _omegaAt(tAbs) {
    const p = this._pulse; if (!p) return this.Omega;
    const ns = p.amp.length; let k = Math.floor(tAbs / p.tau * ns);
    return p.amp[k < 0 ? 0 : k >= ns ? ns - 1 : k];
  }

  // -------------------------------------------------------------------------
  // H(t) = [Ω(t)/Ω₀]·(HC·cos δt + HS·sin δt) + H_z (+ leading carrier). For a
  // constant drive Ω(t)=Ω₀ the scale is 1 and H_z=0 ⇒ identical to before.
  // -------------------------------------------------------------------------
  _assembleH(tAbs, out) {
    const HC = this._HC, HS = this._HS, Hz = this._Hz, MLEN = this.mlen;
    const c = Math.cos(this.delta * tAbs), s = Math.sin(this.delta * tAbs);
    const sc = this._pulse ? this._omegaAt(tAbs) / this.Omega : 1, ts = this.thetaSign;
    for (let m = 0; m < MLEN; m++) out[m] = sc * (c * HC[m] + ts * s * HS[m]) + Hz[m];
    if (this.carrierOn) {
      // Leading beyond-RWA off-resonant carrier: in the sideband interaction picture it
      // rotates at ω_d = ω_z − δ (the tone's detuning from the qubit), amplitude (Ω/2)·e^{−η²/2}.
      const cc = this._omegaAt(tAbs) * 0.5 * this._dw * Math.cos((this.omegaZ - this.delta) * tAbs), Sx0 = this._Sx0;
      for (let m = 0; m < MLEN; m++) out[m] += cc * Sx0[m];
    }
    return out;
  }

  // Lindblad RHS at absolute time tAbs: dρ/dt = −i[H(t),ρ] + Σ_c(LρL† − ½{L†L,ρ}).
  _rhs(rho, out, tAbs) {
    const F = this._F, DIM = this.dim, IDX = F.IDX, MLEN = F.MLEN;
    const H = this._assembleH(tAbs, this._H);
    const Hrho = F.mmul(H, rho, this._Hrho);
    const rhoH = F.mmul(rho, H, this._rhoH);
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        const idx = IDX(i, j);
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

  _rk4(h, t0) {
    const rho = this.rhoM, F = this._F, MLEN = F.MLEN;
    const k1 = this._rhs(rho, this._k1, t0);
    let y = F.axpyF(rho, k1, h / 2, this._y);
    const k2 = this._rhs(y, this._k2, t0 + h / 2);
    y = F.axpyF(rho, k2, h / 2, this._y);
    const k3 = this._rhs(y, this._k3, t0 + h / 2);
    y = F.axpyF(rho, k3, h, this._y);
    const k4 = this._rhs(y, this._k4, t0 + h);
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

  // Advance ρ by `dt` via RK4 with adaptive sub-steps. H is time-dependent, so
  // each sub-step uses the absolute time (this.t) for the cos/sin δt drive phase.
  step(dt) {
    const SUB = this.subStep;
    let remaining = dt, t = this.t;
    while (remaining > 1e-12) {
      const h = Math.min(SUB, remaining);
      this._rk4(h, t);
      t += h;
      remaining -= h;
    }
    this.t += dt;
    this._hermitize();
  }

  // Run a full gate from |gg,0⟩: reset, then evolve for `time` (default τ_g),
  // integrating in `nChunks` chunks so a caller can sample the loop as it goes.
  // With a piecewise pulse, step segment-by-segment so no RK4 sub-step ever straddles
  // an amplitude discontinuity (Ω is constant within each step ⇒ CPTP-clean).
  runGate(time, onChunk, nChunks = 120) {
    this.reset();
    if (this._pulse && time === undefined) {
      const p = this._pulse, ns = p.amp.length, dt = p.tau / ns;
      for (let i = 0; i < ns; i++) { this.step(dt); if (onChunk) onChunk(this); }
      return this;
    }
    const T = time !== undefined ? time : this.gateTime();
    const dt = T / nChunks;
    for (let i = 0; i < nChunks; i++) {
      this.step(dt);
      if (onChunk) onChunk(this);
    }
    return this;
  }

  // Tr(ρ) — should stay 1 (CPTP invariant, asserted in the U3 tests).
  traceRho() { return this._F.trace(this.rhoM).re; }

  // Apply the ideal global Π = σx¹⊗σx² to ρ (qubit-only; identity on motion). Since
  // Π|q⟩=|3−q⟩ (both spins flipped) and Π is Hermitian, (ΠρΠ)_{ab}=ρ_{π(a)π(b)}, π(q)=3−q.
  // Used by the GBC sequence (U4) to flip the error sign around the middle gate.
  applyPiX() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM, out = F.zerosF(), p = (q) => 3 - q;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++)
      for (let n = 0; n < N; n++) for (let m = 0; m < N; m++) {
        const d = IDX(a * N + n, b * N + m), s = IDX(p(a) * N + n, p(b) * N + m);
        out[d] = r[s]; out[d + 1] = r[s + 1];
      }
    this.rhoM = out;
  }

  // =========================================================================
  // Observables.
  // =========================================================================
  // [P_gg, P_ge, P_eg, P_ee].
  qubitPopulations() {
    const F = this._F;
    return this._Pq.map((P) => F.traceProd(this.rhoM, P).re);
  }

  // Reduced two-qubit density matrix (4×4 flat complex), tracing over the mode.
  reducedQubit() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    const out = new Float64Array(2 * 16);
    const OI = (i, j) => 2 * (i * 4 + j);
    for (let q1 = 0; q1 < 4; q1++)
      for (let q2 = 0; q2 < 4; q2++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const idx = IDX(q1 * N + n, q2 * N + n);
          re += r[idx]; im += r[idx + 1];
        }
        out[OI(q1, q2)] = re; out[OI(q1, q2) + 1] = im;
      }
    return out;
  }

  // Bell-state fidelity F = ⟨Φ|ρ_2q|Φ⟩ to |Φ⟩ = (|gg⟩ + i|ee⟩)/√2 (convention §8).
  // |Φ⟩ amplitudes: gg = 1/√2, ee = i/√2.  F = Σ_{q1,q2} conj(c_q1) ρ_2q[q1][q2] c_q2.
  bellFidelity() {
    const rq = this.reducedQubit();
    const OI = (i, j) => 2 * (i * 4 + j);
    // c = [1/√2, 0, 0, i/√2]
    const s = 1 / Math.SQRT2;
    const cRe = [s, 0, 0, 0], cIm = [0, 0, 0, s];   // gg real, ee imaginary
    let F = 0;   // Σ conj(c_i) ρ_ij c_j  (result is real for Hermitian ρ)
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const rre = rq[OI(i, j)], rim = rq[OI(i, j) + 1];
        // conj(c_i) = cRe[i] − i cIm[i]; c_j = cRe[j] + i cIm[j].
        // conj(c_i)*c_j = (cRe_i cRe_j + cIm_i cIm_j) + i(cRe_i cIm_j − cIm_i cRe_j)
        const wr = cRe[i] * cRe[j] + cIm[i] * cIm[j];
        const wi = cRe[i] * cIm[j] - cIm[i] * cRe[j];
        // Re[ conj(c_i) c_j ρ_ij ] = wr*rre − wi*rim   (we take the real part)
        F += wr * rre - wi * rim;
      }
    return F;
  }

  // Fidelity to an arbitrary two-qubit pure state given as amplitude arrays.
  qubitFidelityTo(cRe, cIm) {
    const rq = this.reducedQubit();
    const OI = (i, j) => 2 * (i * 4 + j);
    let F = 0;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const rre = rq[OI(i, j)], rim = rq[OI(i, j) + 1];
        const wr = cRe[i] * cRe[j] + cIm[i] * cIm[j];
        const wi = cRe[i] * cIm[j] - cIm[i] * cRe[j];
        F += wr * rre - wi * rim;
      }
    return F;
  }

  // Purity of the reduced two-qubit state Tr(ρ_2q²).
  qubitPurity() {
    const rq = this.reducedQubit();
    const OI = (i, j) => 2 * (i * 4 + j);
    let p = 0;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const are = rq[OI(i, j)], aim = rq[OI(i, j) + 1];
        const bre = rq[OI(j, i)], bim = rq[OI(j, i) + 1];
        p += are * bre - aim * bim;   // Σ ρ_ij ρ_ji
      }
    return p;
  }

  // Residual spin–motion entanglement = linear entropy of the reduced qubit state
  // 1 − Tr(ρ_2q²). For a globally pure state (dissipators off) this is EXACTLY the
  // spin↔motion entanglement; → 0 iff the motion has disentangled (loop closed).
  residualEntanglement() { return 1 - this.qubitPurity(); }

  // Reduced motional density matrix (N×N flat complex, with ._Nc), for wigner.js.
  reducedMode() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    const out = new Float64Array(2 * N * N);
    const OI = (i, j) => 2 * (i * N + j);
    for (let n = 0; n < N; n++)
      for (let m = 0; m < N; m++) {
        let re = 0, im = 0;
        for (let q = 0; q < 4; q++) {
          const idx = IDX(q * N + n, q * N + m);
          re += r[idx]; im += r[idx + 1];
        }
        out[OI(n, m)] = re; out[OI(n, m) + 1] = im;
      }
    out._Nc = N;
    return out;
  }

  // Purity of the reduced mode Tr(ρ_mode²) (→1 when motion returns to vacuum).
  modePurity() {
    const rm = this.reducedMode(), N = this.N_FOCK;
    const OI = (i, j) => 2 * (i * N + j);
    let p = 0;
    for (let n = 0; n < N; n++)
      for (let m = 0; m < N; m++) {
        const are = rm[OI(n, m)], aim = rm[OI(n, m) + 1];
        const bre = rm[OI(m, n)], bim = rm[OI(m, n) + 1];
        p += are * bre - aim * bim;
      }
    return p;
  }

  // ⟨n̄⟩ of the shared mode.
  nBar() { return this._F.traceProd(this.rhoM, this.nOpM).re; }

  // Conditional phase-space point {x,p} of the mode GIVEN the |++⟩ (S_x=+2)
  // spin eigenstate — the "stretched" component that traces the largest loop
  // (radius 2ηΩ/δ). Returns the loop coordinate that CLOSES to (0,0) at τ_g and
  // fails to close when δ is mis-set. X=(a+a†)/√2, P=(a−a†)/(i√2) (matches wigner.js).
  //   |++⟩ = ½(|gg⟩+|ge⟩+|eg⟩+|ee⟩) ⇒ v = [½,½,½,½].
  conditionalXP() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    const v = 0.5;   // all four amplitudes equal, real
    // conditional (unnormalized) mode operator ρc[n][m] = Σ_{q1,q2} v v ρ[q1n][q2m].
    // ⟨a⟩_c = Σ_n √(n+1) ρc[n][n+1];  norm = Σ_n ρc[n][n].
    let aRe = 0, aIm = 0, norm = 0;
    for (let n = 0; n < N; n++) {
      // diagonal (norm)
      for (let q1 = 0; q1 < 4; q1++)
        for (let q2 = 0; q2 < 4; q2++) {
          const idx = IDX(q1 * N + n, q2 * N + n);
          norm += v * v * r[idx];
        }
      if (n + 1 < N) {
        const rt = Math.sqrt(n + 1);
        let cre = 0, cim = 0;
        for (let q1 = 0; q1 < 4; q1++)
          for (let q2 = 0; q2 < 4; q2++) {
            const idx = IDX(q1 * N + n, q2 * N + (n + 1));
            cre += v * v * r[idx]; cim += v * v * r[idx + 1];
          }
        aRe += rt * cre; aIm += rt * cim;
      }
    }
    if (norm < 1e-12) return { x: 0, p: 0, norm };
    const meanRe = aRe / norm, meanIm = aIm / norm;
    return { x: Math.SQRT2 * meanRe, p: Math.SQRT2 * meanIm, norm };
  }

  rho() { return this.rhoM; }

  // |ρ| magnitudes, dim×dim row-major, for a heatmap.
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

  // Population in the top 3 Fock states across all qubit blocks (truncation guard).
  truncationOccupancy() {
    const N = this.N_FOCK, F = this._F, IDX = F.IDX, r = this.rhoM;
    let s = 0;
    for (let n = Math.max(0, N - 3); n < N; n++)
      for (let q = 0; q < 4; q++) { const idx = q * N + n; s += r[IDX(idx, idx)]; }
    return s;
  }

  purity() { return this._F.traceProd(this.rhoM, this.rhoM).re; }   // global Tr(ρ²)
  trace()  { return this._F.trace(this.rhoM); }
}
