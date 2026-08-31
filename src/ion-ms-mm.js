// =============================================================================
// ion-ms-mm.js — MULTI-MODE open-system MS gate (E5). Generalizes ion-ms.js from
// 2 qubits ⊗ 1 mode to 2 qubits ⊗ M motional modes, so a gate on a pair in an
// N-ion chain can be run under the full Lindblad master equation with the target
// mode AND its spectators (each with its own δ_m, coupling, heating).
//
// Hilbert space: dim = 4·∏_m N_Fock[m]. The MS Hamiltonian is sparse (each mode
// couples only nearest Fock neighbours), so the zero-skipping flat mmul gives
// Hρ at O(dim²·M) — tractable for M=2 with modest cutoffs.
//
//   H(t) = Ω(t) Σ_m [ HC_m cos(δ_m t) + HS_m sin(δ_m t) ] + H_z,
//   HC_m = ½ S_x^{(m)} ⊗ (a_m+a_m†),  HS_m = ½ i S_x^{(m)} ⊗ (a_m†−a_m),
//   S_x^{(m)} = Σ_j g^m_j σx_j   (g^m_j = η_m b^m_j, the ion-j coupling to mode m),
//   H_z = (Δω/2)(σz¹+σz²)  (common-mode asymmetric error).
// Dissipators: per-mode heating √(κ_m(n̄+1)) a_m, √(κ_m n̄) a_m†; qubit dephasing.
// Convention matches ion-ms.js (q=2s1+s2, |gg⟩=0; Bell target (|gg⟩+i|ee⟩)/√2).
// =============================================================================

function makeFlatOps(DIM) {
  const MLEN = 2 * DIM * DIM, IDX = (i, j) => 2 * (i * DIM + j), zerosF = () => new Float64Array(MLEN);
  function mmul(A, B, out) {
    const C = out || zerosF(); C.fill(0);
    for (let i = 0; i < DIM; i++) {
      const iB = i * DIM;
      for (let k = 0; k < DIM; k++) {
        const aIdx = 2 * (iB + k), ar = A[aIdx], ai = A[aIdx + 1];
        if (ar === 0 && ai === 0) continue;
        const kB = k * DIM;
        for (let j = 0; j < DIM; j++) {
          const bIdx = 2 * (kB + j), br = B[bIdx], bi = B[bIdx + 1], cIdx = 2 * (iB + j);
          C[cIdx] += ar * br - ai * bi; C[cIdx + 1] += ar * bi + ai * br;
        }
      }
    }
    return C;
  }
  const daggerF = (A, out) => { const C = out || zerosF(); for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) { const s = IDX(i, j), d = IDX(j, i); C[d] = A[s]; C[d + 1] = -A[s + 1]; } return C; };
  const axpyF = (A, B, s, out) => { const C = out || zerosF(); for (let m = 0; m < MLEN; m++) C[m] = A[m] + s * B[m]; return C; };
  const trace = (A) => { let re = 0; for (let i = 0; i < DIM; i++) re += A[IDX(i, i)]; return re; };
  return { DIM, MLEN, IDX, zerosF, mmul, daggerF, axpyF, trace };
}

const QGG = 0, QGE = 1, QEG = 2, QEE = 3;
// weighted collective σx: S_x^{(m)} = g1·σx¹ + g2·σx² on the 4-dim qubit space.
function buildSxW(g1, g2) {
  const S = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  S[QGG][QEG] += g1; S[QEG][QGG] += g1; S[QGE][QEE] += g1; S[QEE][QGE] += g1;   // σx¹
  S[QGG][QGE] += g2; S[QGE][QGG] += g2; S[QEG][QEE] += g2; S[QEE][QEG] += g2;   // σx²
  return S;
}

export class MSGateMM {
  // opts: Nfock:[N_1..N_M], modes:[{delta, eta, bvec:[b1,b2], nBath?}], Omega,
  //       deltaOmega, kappa (per-mode heating, scalar or array), gammaPhi.
  constructor(opts) {
    this.Nf = opts.Nfock.slice();
    this.modes = opts.modes;
    this.M = this.modes.length;
    this.Omega = opts.Omega;
    this.deltaOmega = opts.deltaOmega || 0;
    this.kappa = opts.kappa || 0;
    this.gammaPhi = opts.gammaPhi || 0;
    this.Dmot = this.Nf.reduce((a, b) => a * b, 1);
    this.dim = 4 * this.Dmot;
    this._build();
    this.reset();
  }

  // strides for the flattened motional multi-index (row-major over modes).
  _stride(m) { let s = 1; for (let k = m + 1; k < this.M; k++) s *= this.Nf[k]; return s; }
  _nOf(mi, m) { return Math.floor(mi / this._stride(m)) % this.Nf[m]; }   // occupation of mode m

  _build() {
    const F = makeFlatOps(this.dim); this._F = F;
    const { IDX, zerosF } = F, N = this.Dmot;
    // per-mode a_m, a_m†
    this.a = []; this.adag = [];
    for (let m = 0; m < this.M; m++) {
      const a = zerosF(), adag = zerosF(), st = this._stride(m);
      for (let q = 0; q < 4; q++) for (let mi = 0; mi < N; mi++) {
        const n = this._nOf(mi, m);
        if (n >= 1) { const sq = Math.sqrt(n), lo = q * N + (mi - st), hi = q * N + mi; a[IDX(lo, hi)] = sq; adag[IDX(hi, lo)] = sq; }
      }
      this.a.push(a); this.adag.push(adag);
    }
    // HC_m, HS_m per mode
    this.HC = []; this.HS = [];
    for (let m = 0; m < this.M; m++) {
      const { eta, bvec } = this.modes[m], Sx = buildSxW(eta * bvec[0], eta * bvec[1]);
      const HC = zerosF(), HS = zerosF(), st = this._stride(m);
      for (let q1 = 0; q1 < 4; q1++) for (let q2 = 0; q2 < 4; q2++) {
        const sx = Sx[q1][q2]; if (sx === 0) continue;
        for (let mi = 0; mi < N; mi++) {
          const n = this._nOf(mi, m); if (n + 1 >= this.Nf[m]) continue;
          const rt = Math.sqrt(n + 1), rowU = q1 * N + (mi + st), colU = q2 * N + mi, rowL = q1 * N + mi, colL = q2 * N + (mi + st);
          HC[IDX(rowU, colU)] += 0.5 * sx * rt; HC[IDX(rowL, colL)] += 0.5 * sx * rt;          // ½ Sx (a+a†)
          HS[IDX(rowU, colU) + 1] += 0.5 * sx * rt; HS[IDX(rowL, colL) + 1] += -0.5 * sx * rt;  // ½ i Sx (a†−a)
        }
      }
      this.HC.push(HC); this.HS.push(HS);
    }
    // Hz = (Δω/2)(σz¹+σz²) diagonal: q=0→+Δω, q=3→−Δω
    const Hz = zerosF();
    if (this.deltaOmega) { const dz = [this.deltaOmega, 0, 0, -this.deltaOmega]; for (let q = 0; q < 4; q++) if (dz[q]) for (let mi = 0; mi < N; mi++) { const idx = q * N + mi; Hz[IDX(idx, idx)] = dz[q]; } }
    this.Hz = Hz;
    // dissipators
    this._buildDiss();
    // scratch
    this._H = zerosF(); this._Hrho = zerosF(); this._rhoH = zerosF();
    this._k1 = zerosF(); this._k2 = zerosF(); this._k3 = zerosF(); this._k4 = zerosF(); this._y = zerosF();
    this._t1 = zerosF(); this._t2 = zerosF(); this._m1 = zerosF(); this._m2 = zerosF(); this._m3 = zerosF();
    this._setSub();
  }

  _buildDiss() {
    const F = this._F, { zerosF, IDX } = F, N = this.Dmot, ops = [];
    const kap = Array.isArray(this.kappa) ? this.kappa : this.modes.map(() => this.kappa);
    for (let m = 0; m < this.M; m++) {
      const nb = this.modes[m].nBath || 0, k = kap[m];
      if (k > 0) { const L = zerosF(), a = this.a[m], f = Math.sqrt(k * (nb + 1)); for (let x = 0; x < a.length; x++) L[x] = f * a[x]; ops.push(L);
        if (nb > 0) { const Lp = zerosF(), ad = this.adag[m], fp = Math.sqrt(k * nb); for (let x = 0; x < ad.length; x++) Lp[x] = fp * ad[x]; ops.push(Lp); } }
    }
    if (this.gammaPhi > 0) for (const which of [1, 2]) {
      const sz = zerosF(), f = Math.sqrt(this.gammaPhi / 2);
      for (let q = 0; q < 4; q++) { const s = which === 1 ? ((q >> 1) & 1) : (q & 1), sgn = s === 1 ? 1 : -1; for (let mi = 0; mi < N; mi++) { const idx = q * N + mi; sz[IDX(idx, idx)] = f * sgn; } }
      ops.push(sz);
    }
    // ½ Σ L†L
    let halfA = zerosF(); this._collapse = [];
    for (const L of ops) { const Ld = F.daggerF(L), LdL = F.mmul(Ld, L); halfA = F.axpyF(halfA, LdL, 0.5); this._collapse.push({ L, Ld }); }
    this._halfA = halfA; this._hasDiss = ops.length > 0;
  }

  _setSub() {
    // resolve the fastest scale: peak drive coupling, Δω, and the fastest δ_m.
    const gmax = Math.max(...this.modes.map((m) => Math.abs(m.eta) * (Math.abs(m.bvec[0]) + Math.abs(m.bvec[1]))));
    const bound = Math.abs(this.Omega) * gmax * Math.sqrt(Math.max(...this.Nf)) + Math.abs(this.deltaOmega);
    const fast = Math.max(...this.modes.map((m) => Math.abs(m.delta)));
    this.sub = Math.min(0.02, bound > 0 ? 1.2 / bound : 0.02, fast > 0 ? 0.06 / fast : 0.02);
  }

  reset() { const m = this._F.zerosF(); m[this._F.IDX(0, 0)] = 1; this.rhoM = m; this.t = 0; }        // |gg,0…0⟩
  setRho(flat) { this.rhoM = Float64Array.from(flat); this.t = 0; }
  traceRho() { return this._F.trace(this.rhoM); }

  _assembleH(t, out) {
    const F = this._F, MLEN = F.MLEN; for (let x = 0; x < MLEN; x++) out[x] = this.Hz[x];
    for (let m = 0; m < this.M; m++) {
      const c = this.Omega * Math.cos(this.modes[m].delta * t), s = this.Omega * Math.sin(this.modes[m].delta * t), HC = this.HC[m], HS = this.HS[m];
      for (let x = 0; x < MLEN; x++) out[x] += c * HC[x] + s * HS[x];
    }
    return out;
  }

  // dρ/dt. Since ρ (and every RK4 intermediate) and H, ½L†L are Hermitian, we use
  //   ρH = (Hρ)†,  ρ·A = (Aρ)†,  ρL† = (Lρ)†  ⇒ every product has a SPARSE first arg
  // (H, ½L†L, L each have O(M) nonzeros/row), so the zero-skipping mmul runs at
  // O(dim²·M) instead of the O(dim³) of a dense right-multiply — the key to M≥2.
  _rhs(rho, out, t) {
    const F = this._F, DIM = this.dim, IDX = F.IDX, MLEN = F.MLEN, H = this._assembleH(t, this._H);
    const Hrho = F.mmul(H, rho, this._Hrho), rhoH = F.daggerF(Hrho, this._rhoH);
    for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) { const idx = IDX(i, j); out[idx] = Hrho[idx + 1] - rhoH[idx + 1]; out[idx + 1] = -(Hrho[idx] - rhoH[idx]); }
    if (this._hasDiss) {
      const t1 = F.mmul(this._halfA, rho, this._t1), t2 = F.daggerF(t1, this._t2);   // ½{L†L,ρ} = Aρ + (Aρ)†
      for (let x = 0; x < MLEN; x++) out[x] -= t1[x] + t2[x];
      for (const { L } of this._collapse) {
        const Lr = F.mmul(L, rho, this._m1), LrD = F.daggerF(Lr, this._m2), LrLd = F.mmul(L, LrD, this._m3);   // LρL† = L·(Lρ)†
        for (let x = 0; x < MLEN; x++) out[x] += LrLd[x];
      }
    }
    return out;
  }

  _rk4(h, t0) {
    const F = this._F, MLEN = F.MLEN, rho = this.rhoM;
    const k1 = this._rhs(rho, this._k1, t0); let y = F.axpyF(rho, k1, h / 2, this._y);
    const k2 = this._rhs(y, this._k2, t0 + h / 2); y = F.axpyF(rho, k2, h / 2, this._y);
    const k3 = this._rhs(y, this._k3, t0 + h / 2); y = F.axpyF(rho, k3, h, this._y);
    const k4 = this._rhs(y, this._k4, t0 + h), c = h / 6;
    for (let x = 0; x < MLEN; x++) rho[x] += c * (k1[x] + 2 * k2[x] + 2 * k3[x] + k4[x]);
  }

  _hermitize() { const F = this._F, DIM = this.dim, IDX = F.IDX, r = this.rhoM; for (let i = 0; i < DIM; i++) for (let j = i; j < DIM; j++) { const a = IDX(i, j), b = IDX(j, i), re = 0.5 * (r[a] + r[b]), im = 0.5 * (r[a + 1] - r[b + 1]); r[a] = re; r[a + 1] = im; r[b] = re; r[b + 1] = -im; } }

  step(dt) { let rem = dt, t = this.t; while (rem > 1e-12) { const h = Math.min(this.sub, rem); this._rk4(h, t); t += h; rem -= h; } this.t += dt; this._hermitize(); }

  runGate(time, nChunks = 120) { this.reset(); const T = time !== undefined ? time : this.gateTime(), dt = T / nChunks; for (let i = 0; i < nChunks; i++) this.step(dt); return this; }
  gateTime() { return 2 * Math.PI / Math.abs(this.modes[0].delta); }   // τ from the target (first) mode

  // reduced 2-qubit ρ (trace over all modes) → 4×4 flat complex.
  reducedQubit() {
    const N = this.Dmot, F = this._F, IDX = F.IDX, r = this.rhoM, out = new Float64Array(32), OI = (i, j) => 2 * (i * 4 + j);
    for (let q1 = 0; q1 < 4; q1++) for (let q2 = 0; q2 < 4; q2++) { let re = 0, im = 0; for (let mi = 0; mi < N; mi++) { const idx = IDX(q1 * N + mi, q2 * N + mi); re += r[idx]; im += r[idx + 1]; } out[OI(q1, q2)] = re; out[OI(q1, q2) + 1] = im; }
    return out;
  }
  // Bell fidelity to (|gg⟩+i|ee⟩)/√2: c_gg=1/√2, c_ee=i/√2.
  bellFidelity() {
    const rq = this.reducedQubit(), OI = (i, j) => 2 * (i * 4 + j), s = Math.SQRT1_2;
    const cr = [s, 0, 0, 0], ci = [0, 0, 0, s];   // amplitudes
    let re = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      // conj(c_i) ρ_ij c_j
      const ar = cr[i], ai = -ci[i], br = rq[OI(i, j)], bi = rq[OI(i, j) + 1], dr = cr[j], di = ci[j];
      const xr = ar * br - ai * bi, xi = ar * bi + ai * br;   // conj(c_i)·ρ_ij
      re += xr * dr - xi * di;                                 // ·c_j (real part)
    }
    return re;
  }
  qubitPopulations() { const rq = this.reducedQubit(), OI = (i) => 2 * (i * 4 + i); return [0, 1, 2, 3].map((q) => rq[OI(q)]); }
}
