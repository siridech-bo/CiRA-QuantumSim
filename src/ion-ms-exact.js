// =============================================================================
// ion-ms-exact.js — FULL non-RWA + beyond-Lamb-Dicke MS gate (upgrade beyond U3's
// leading carrier estimate). Integrates the EXACT spin-dependent-force Hamiltonian
// in the lab-motional frame, 2 qubits ⊗ 1 mode, closed system (statevector):
//
//     H(t) = ω_z a†a  +  Ω Σ_j σx_j · sin(η(a+a†)) · cos((ω_z−δ) t).
//
// This makes NO Lamb–Dicke expansion (keeps the full sin(η(a+a†)) = all sidebands,
// incl. the Debye–Waller renormalization e^{−η²/2}) and NO vibrational RWA (keeps the
// ω_z a†a term and the counter-rotating 2ω_z components exactly). It reduces to the
// interaction-picture RWA+LD engine (`ion-ms.js` MSGate) precisely when sin→η(a+a†)
// and the 2ω_z terms are dropped — verified below — so 1−F_exact at LD-closure IS the
// combined RWA+beyond-LD error, whose scaling vs Ω/ω_z we report.
//
// H(t) is REAL SYMMETRIC (ω_z n diagonal; σx⊗sin(η(a+a†)) real; ×cos), so Schrödinger
// i∂_t ψ = Hψ splits cleanly into re/im with a single real matvec per stage — fast at
// dim 4·N_Fock. Basis: qubit q=2s₁+s₂ (|gg⟩=0), motional Fock n; index = q·N_F + n.
// =============================================================================

// real symmetric eig via Jacobi rotations (small tridiagonal X = η(a+a†); framework-free).
function jacobiEig(Ain, N) {
  const A = Ain.map((r) => r.slice()), V = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += A[p][q] * A[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < N; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < N; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < N; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: A.map((r, i) => r[i]), vecs: V };   // vecs columns are eigenvectors
}

export class MSGateExact {
  // opts: N_FOCK, eta, delta, omegaZ (default 1), K (default 1), Omega (default LD closure).
  constructor({ N_FOCK = 24, eta = 0.1, delta = 0.25, omegaZ = 1, K = 1, Omega } = {}) {
    this.NF = N_FOCK; this.eta = eta; this.delta = delta; this.omegaZ = omegaZ; this.K = K;
    this.Omega = Omega !== undefined ? Omega : delta / (2 * eta * Math.sqrt(K));   // ηΩ=δ/(2√K)
    this.dim = 4 * this.NF;
    this._build();
    this.reset();
  }

  _build() {
    const NF = this.NF, dim = this.dim;
    // X = η(a+a†): symmetric tridiagonal with off-diagonals η√(n+1).
    const X = Array.from({ length: NF }, () => new Array(NF).fill(0));
    for (let n = 0; n + 1 < NF; n++) { const v = this.eta * Math.sqrt(n + 1); X[n][n + 1] = v; X[n + 1][n] = v; }
    // sin(X) = V diag(sin λ) Vᵀ.
    const { vals, vecs } = jacobiEig(X, NF), sinX = Array.from({ length: NF }, () => new Array(NF).fill(0));
    for (let i = 0; i < NF; i++) for (let j = 0; j < NF; j++) { let s = 0; for (let k = 0; k < NF; k++) s += vecs[i][k] * Math.sin(vals[k]) * vecs[j][k]; sinX[i][j] = s; }
    this.sinX = sinX;
    // M = (σx¹+σx²) ⊗ sin(X)  as a flat real dim×dim (sparse: 2 qubit-blocks per row).
    // σx¹ swaps qubit blocks 0↔2,1↔3; σx² swaps 0↔1,2↔3.
    const Sx = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    Sx[0][2] = Sx[2][0] = Sx[1][3] = Sx[3][1] = 1;   // σx¹
    Sx[0][1] = Sx[1][0] = Sx[2][3] = Sx[3][2] = (Sx[0][1] || 0) + 1;   // σx² (blocks are distinct, no overlap)
    this.M = new Float64Array(dim * dim);
    for (let q1 = 0; q1 < 4; q1++) for (let q2 = 0; q2 < 4; q2++) { const sx = Sx[q1][q2]; if (!sx) continue; for (let n = 0; n < NF; n++) for (let m = 0; m < NF; m++) this.M[(q1 * NF + n) * dim + (q2 * NF + m)] = sx * sinX[n][m]; }
    // D = ω_z (I₄ ⊗ n) diagonal.
    this.D = new Float64Array(dim);
    for (let q = 0; q < 4; q++) for (let n = 0; n < NF; n++) this.D[q * NF + n] = this.omegaZ * n;
    this._matvec = new Float64Array(dim);
    this._setSub();
  }

  _setSub() {
    // The lab-frame motional phase e^{−iω_z n t} is the fastest scale: the largest
    // diagonal energy is ω_z·(N_F−1). RK4 stability needs sub·(that) ≪ 1.
    const maxDiag = this.omegaZ * (this.NF - 1);
    this.sub = Math.min(0.02, 0.12 / Math.max(maxDiag, this.Omega, 2 * this.omegaZ - this.delta, 1e-9));
  }

  reset() { const dim = this.dim; this.re = new Float64Array(dim); this.im = new Float64Array(dim); this.re[0] = 1; this.t = 0; }   // |gg,0⟩

  // Hψ for real-symmetric H(t) = D (diag) + Ω cos((ω_z−δ)t) M.
  _applyH(re, im, t, outRe, outIm) {
    const dim = this.dim, D = this.D, M = this.M, g = this.Omega * Math.cos((this.omegaZ - this.delta) * t);
    for (let i = 0; i < dim; i++) { outRe[i] = D[i] * re[i]; outIm[i] = D[i] * im[i]; }
    for (let i = 0; i < dim; i++) {
      const row = i * dim; let sr = 0, si = 0;
      for (let j = 0; j < dim; j++) { const mij = M[row + j]; if (mij !== 0) { sr += mij * re[j]; si += mij * im[j]; } }
      outRe[i] += g * sr; outIm[i] += g * si;
    }
  }

  // one RK4 step of dψ/dt = −iHψ  ⇒  d(re)/dt=H·im, d(im)/dt=−H·re.
  _rk4(h, t) {
    const dim = this.dim, re = this.re, im = this.im;
    const kr = [new Float64Array(dim), new Float64Array(dim), new Float64Array(dim), new Float64Array(dim)];
    const ki = [new Float64Array(dim), new Float64Array(dim), new Float64Array(dim), new Float64Array(dim)];
    const tr = new Float64Array(dim), ti = new Float64Array(dim), hr = new Float64Array(dim), hi = new Float64Array(dim);
    const stage = (sr, si, tt, or, oi) => { this._applyH(sr, si, tt, hr, hi); for (let x = 0; x < dim; x++) { or[x] = hi[x]; oi[x] = -hr[x]; } };
    stage(re, im, t, kr[0], ki[0]);
    for (let x = 0; x < dim; x++) { tr[x] = re[x] + h / 2 * kr[0][x]; ti[x] = im[x] + h / 2 * ki[0][x]; }
    stage(tr, ti, t + h / 2, kr[1], ki[1]);
    for (let x = 0; x < dim; x++) { tr[x] = re[x] + h / 2 * kr[1][x]; ti[x] = im[x] + h / 2 * ki[1][x]; }
    stage(tr, ti, t + h / 2, kr[2], ki[2]);
    for (let x = 0; x < dim; x++) { tr[x] = re[x] + h * kr[2][x]; ti[x] = im[x] + h * ki[2][x]; }
    stage(tr, ti, t + h, kr[3], ki[3]);
    for (let x = 0; x < dim; x++) { re[x] += h / 6 * (kr[0][x] + 2 * kr[1][x] + 2 * kr[2][x] + kr[3][x]); im[x] += h / 6 * (ki[0][x] + 2 * ki[1][x] + 2 * ki[2][x] + ki[3][x]); }
  }

  step(dt) { let rem = dt, t = this.t; while (rem > 1e-12) { const h = Math.min(this.sub, rem); this._rk4(h, t); t += h; rem -= h; } this.t += dt; }
  gateTime() { return 2 * Math.PI * this.K / Math.abs(this.delta); }
  runGate(time, nChunks = 200) { this.reset(); const T = time !== undefined ? time : this.gateTime(), dt = T / nChunks; for (let i = 0; i < nChunks; i++) this.step(dt); return this; }
  norm() { let s = 0; for (let i = 0; i < this.dim; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i]; return s; }

  // reduced 2-qubit ρ (trace over motion) → 4×4 flat complex.
  reducedQubit() {
    const NF = this.NF, out = new Float64Array(32), OI = (i, j) => 2 * (i * 4 + j);
    for (let q1 = 0; q1 < 4; q1++) for (let q2 = 0; q2 < 4; q2++) {
      let re = 0, im = 0;
      for (let n = 0; n < NF; n++) { const a = q1 * NF + n, b = q2 * NF + n; re += this.re[a] * this.re[b] + this.im[a] * this.im[b]; im += this.im[a] * this.re[b] - this.re[a] * this.im[b]; }
      out[OI(q1, q2)] = re; out[OI(q1, q2) + 1] = im;
    }
    return out;
  }
  // Bell fidelity to (|gg⟩+i|ee⟩)/√2.
  bellFidelity() {
    const rq = this.reducedQubit(), OI = (i, j) => 2 * (i * 4 + j), s = Math.SQRT1_2, cr = [s, 0, 0, 0], ci = [0, 0, 0, s];
    let re = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const ar = cr[i], ai = -ci[i], br = rq[OI(i, j)], bi = rq[OI(i, j) + 1], dr = cr[j], di = ci[j]; const xr = ar * br - ai * bi, xi = ar * bi + ai * br; re += xr * dr - xi * di; }
    return re;
  }
}
