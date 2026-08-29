// =============================================================================
// ion-msn-shape.js — SHAPED-pulse extension of the MS verifier: turn *verify* into
// *design*. Solve for a piecewise-constant Ω(t) that closes EVERY motional mode
// simultaneously (not just the driven one) and lands the entangling phase on π/8.
//
// KEY IDEA: the closure integral E_p = ∫₀^τ Ω(t) e^{iδ_p t} dt is LINEAR in the
// segment amplitudes {Ω_n}: E_p = Σ_n Ω_n·s_{p,n}, s_{p,n}=(e^{iδ_p t_n}−e^{iδ_p t_{n-1}})/δ_p.
// Requiring E_p = 0 for all M modes is 2M real linear equations. Take N_seg = 2M+1
// segments ⇒ the closure matrix (2M×(2M+1)) has a 1-D nullspace = THE closing shape
// (via cofactors, no SVD). The geometric phase is QUADRATIC in Ω, so a single overall
// scale sets it: the fidelity-relevant part is the entangling coefficient
//   Θ_ent = Σ_p form_p·g_{p,0}·g_{p,1}   (NOT Φ₊₊/4 — that carries a global phase),
// and form_p is quadratic in the amplitudes ⇒ scale by √(π/8 / Θ_ent).
//
// The shaped evaluators mirror src/ion-msn.js's constant-drive ones (and reduce to
// them for a single segment), so a designed pulse is verified with the SAME honest
// Bell-fidelity metric. Framework-free (a tiny LU determinant, no math.js).
//
// Physics: amplitude-modulated MS gates — Choi et al. PRL 112, 190502 (2014);
// Zhu/Kim et al. Standard multi-mode closure. Ion_Trap_Visualizer_Spec §4 (M7).
// =============================================================================

const EPS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SVAL = EPS.map(([a, b]) => a + b);
const THETA_MS = Math.PI / 8;
const qval = (mode, e) => mode.g[0] * e[0] + mode.g[1] * e[1];
const qmax = (mode) => Math.abs(mode.g[0]) + Math.abs(mode.g[1]);

// A pulse is { tau, amp:[Ω_0..Ω_{ns-1}] } — equal-duration segments, seg k = [τk/ns, τ(k+1)/ns].
const segT = (pulse, k) => [pulse.tau * k / pulse.amp.length, pulse.tau * (k + 1) / pulse.amp.length];

// s_{p,k} = ∫_seg e^{iδt}dt = (e^{iδ t1} − e^{iδ t0})/δ.
function segKernel(delta, t0, t1) {
  return { re: (Math.cos(delta * t1) - Math.cos(delta * t0)) / delta,
           im: (Math.sin(delta * t1) - Math.sin(delta * t0)) / delta };
}

// Envelope integral E_p = Σ_k Ω_k s_{p,k} (complex). |E_p|=0 ⇒ mode p's loop closes.
export function envelope(mode, pulse) {
  let re = 0, im = 0;
  for (let k = 0; k < pulse.amp.length; k++) {
    const [t0, t1] = segT(pulse, k), s = segKernel(mode.delta, t0, t1);
    re += pulse.amp[k] * s.re; im += pulse.amp[k] * s.im;
  }
  return { re, im };
}

// Partial envelope ∫₀ᵗ Ω(t′)e^{iδt′}dt′ — for drawing a mode's phase-space loop as it evolves.
export function envelopeAt(mode, pulse, t) {
  let re = 0, im = 0;
  for (let k = 0; k < pulse.amp.length; k++) {
    const [t0, t1] = segT(pulse, k);
    if (t <= t0) break;
    const s = segKernel(mode.delta, t0, Math.min(t, t1));
    re += pulse.amp[k] * s.re; im += pulse.amp[k] * s.im;
    if (t <= t1) break;
  }
  return { re, im };   // α_max-sector(t) = −qmax·(this)
}

// Per-mode max-sector closure residual |α|_max = qmax·|E_p|.
export function shapedResiduals(modes, pulse, tol = 1e-3) {
  return modes.map((m) => {
    const E = envelope(m, pulse), res = qmax(m) * Math.hypot(E.re, E.im);
    return { delta: m.delta, residual: res, closed: res < tol };
  });
}

// Quadratic phase form_p = Σ_n Ω_n² W_nn + Σ_{n>m} Ω_n Ω_m W_nm (causal double integral
// of sin(δ(t−t′))). Φ_{p,ε} = q_p(ε)²·form_p.
function formP(mode, pulse) {
  const d = mode.delta, ns = pulse.amp.length; let f = 0;
  for (let n = 0; n < ns; n++) {
    const [a, b] = segT(pulse, n), L = b - a;
    f += pulse.amp[n] * pulse.amp[n] * (d * L - Math.sin(d * L)) / (d * d);       // W_nn (within)
    for (let m = 0; m < n; m++) {
      const [c, e] = segT(pulse, m);                                              // seg m before n
      const W = (Math.sin(d * (b - e)) - Math.sin(d * (b - c)) - Math.sin(d * (a - e)) + Math.sin(d * (a - c))) / (d * d);
      f += pulse.amp[n] * pulse.amp[m] * W;
    }
  }
  return f;
}

// Entangling phase Θ_ent = Σ_p form_p·g_{p,0}·g_{p,1}  (the ε₁ε₂ coefficient; = π/8 ⇒ max entangling).
export function shapedThetaEnt(modes, pulse) {
  let t = 0; for (const m of modes) t += formP(m, pulse) * m.g[0] * m.g[1]; return t;
}

// Bell fidelity of a shaped pulse vs exp[i(π/8)S_x²] — same metric/convention as ion-msn.js.
export function shapedBellFidelity(modes, pulse, { thetaTarget = THETA_MS } = {}) {
  const Es = modes.map((m) => envelope(m, pulse));
  const dPhi = EPS.map((e, i) => {
    let phi = 0; for (const m of modes) { const q = qval(m, e); phi += q * q * formP(m, pulse); }
    return phi - thetaTarget * SVAL[i] * SVAL[i];
  });
  let F = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let cexp = 0;
      for (let p = 0; p < modes.length; p++) {
        const dq = qval(modes[p], EPS[i]) - qval(modes[p], EPS[j]);
        cexp += (2 * modes[p].nbar + 1) * dq * dq * (Es[p].re * Es[p].re + Es[p].im * Es[p].im) / 2;
      }
      F += Math.cos(dPhi[i] - dPhi[j]) * Math.exp(-cexp);
    }
  return F / 16;
}

// ---- small framework-free linear algebra ------------------------------------
function det(Min) {                    // determinant via LU with partial pivoting
  const n = Min.length, A = Min.map((r) => r.slice()); let d = 1;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-300) return 0;
    if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; d = -d; }
    d *= A[c][c];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; }
  }
  return d;
}
// Nullspace of a wide matrix A (rows × rows+1) via cofactors: v_k = (−1)^k·det(A minus col k).
function nullspaceWide(A) {
  const cols = A.length + 1, v = new Array(cols);
  for (let k = 0; k < cols; k++) {
    const minor = A.map((row) => row.filter((_, c) => c !== k));
    v[k] = (k % 2 === 0 ? 1 : -1) * det(minor);
  }
  return v;
}

// -----------------------------------------------------------------------------
// solveShape — design a piecewise-constant Ω(t) that closes ALL modes and hits π/8.
//   Returns { pulse, nSeg, thetaEnt, residuals, fidelity } (self-verified).
//   nSeg defaults to 2M+1 (⇒ 1-D closure nullspace). ok=false if the closing shape
//   can't reach +π/8 (degenerate/negative area) — caller can widen nSeg or retune.
// -----------------------------------------------------------------------------
export function solveShape(modes, tau, { nSeg } = {}) {
  const M = modes.length, ns = nSeg || 2 * M + 1;
  const pulse0 = { tau, amp: new Array(ns).fill(1) };
  // closure matrix A: rows = [Re, Im] of s_{p,k} for each mode; cols = segments.
  const A = [];
  for (const m of modes) {
    const re = [], im = [];
    for (let k = 0; k < ns; k++) { const [t0, t1] = segT(pulse0, k), s = segKernel(m.delta, t0, t1); re.push(s.re); im.push(s.im); }
    A.push(re, im);
  }
  if (A.length !== ns - 1) return { ok: false, reason: `need nSeg = 2M+1 = ${2 * M + 1}`, nSeg: ns };
  let v = nullspaceWide(A);
  const mx = Math.max(...v.map(Math.abs)) || 1;
  v = v.map((x) => x / mx);                                   // normalize for conditioning
  const Th = shapedThetaEnt(modes, { tau, amp: v });
  if (Math.abs(Th) < 1e-12) return { ok: false, reason: 'closing shape has ~zero entangling area', nSeg: ns, thetaEnt: Th };
  // The real closing shape has a fixed-sign entangling area. Scale |Θ_ent|→π/8; the
  // sign picks the MS gate exp[i(π/8)S_x²] (sign +1) or its conjugate exp[−i(π/8)S_x²]
  // (sign −1) — both maximally entangling, a local-Z relabel apart. Report which.
  const sign = Th >= 0 ? 1 : -1, thetaTarget = sign * THETA_MS;
  const pulse = { tau, amp: v.map((x) => x * Math.sqrt(THETA_MS / Math.abs(Th))) };
  return {
    ok: true, pulse, nSeg: ns, sign, thetaTarget,
    thetaEnt: shapedThetaEnt(modes, pulse),
    residuals: shapedResiduals(modes, pulse),
    fidelity: shapedBellFidelity(modes, pulse, { thetaTarget }),
  };
}
