// =============================================================================
// ion-gbc.js — asymmetric-error + Generator-Based Compensation (GBC) for the MS
// gate, in the motion-free two-qubit (4×4) space. Upgrade U2 of the robust-MS-gate
// manuscript (docs/robust-ms-gate-manuscript.md); after Zhang et al., arXiv:2501.02847.
//
// Once a robust waveform closes every motional loop (α_m(τ)=0, Sec. II.C), the MS
// operator collapses to a purely two-qubit unitary [Zhang25, Eq. (12)]:
//
//     U_ε(Θ) = exp[ i Θ σ_x^{(1)}σ_x^{(2)} − i ε E ],   E = ½(σ_z^{(1)}+σ_z^{(2)}),  ε ≡ Δω τ,
//
// where Δω is the COMMON-mode asymmetric (center-line) error — a σ_z on BOTH qubits,
// *not* a qubit-to-qubit asymmetry. Because E does not commute with the entangler
// G = σ_x σ_x ({G,E}=0), it cannot be undone by a trailing single-qubit Z. GBC cancels
// it to first order in ε with a three-gate sequence [Zhang25, Eqs. (13)–(17)]:
//
//     U_ε^{gbc} = U_ε(Θ) · U_{2ε}^†(Θ) · U_ε(Θ) = U_ideal + o(ε²),
//     U_{2ε}^† = Π U_{2ε}(−Θ) Π  = exp[−iΘ G + i·2ε E] = U(−Θ, −2ε),   Π = σ_x⊗σ_x,
//
// realized physically by doubling the gate time (ε→2ε) and flipping the error sign
// with global σ_x gates (ΠGΠ=G, ΠEΠ=−E). The residual infidelity therefore scales as
// O(ε⁴) with GBC versus O(ε²) uncompensated — the result we reproduce here.
//
// Everything is exact 4×4 linear algebra: A = ΘG − εE is REAL SYMMETRIC, so
// U=exp(iA) is one eigendecomposition. math.js supplies the symmetric eig only.
// Basis: |q⟩, q = 2 s₁+s₂, s∈{0,1}; σ_z eigenvalue +1 for |0⟩, −1 for |1⟩.
// =============================================================================

import { create, all } from 'mathjs';
const math = create(all);

const G4 = [[0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0], [1, 0, 0, 0]];   // σ_x⊗σ_x
const E4 = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, -1]];   // ½(σ_z¹+σ_z²)=diag(1,0,0,−1)
export const THETA_MS = Math.PI / 4;                                    // U_ideal = exp(iΘ σ_xσ_x)

function eigSym(A) {
  const r = math.eigs(math.matrix(A));
  return {
    vals: r.values.toArray().map((v) => (typeof v === 'object' ? v.re : v)),
    vecs: r.eigenvectors.map((e) => e.vector.toArray().map((c) => (typeof c === 'object' ? c.re : c))),
  };
}

// U = exp(iA) for real-symmetric 4×4 A → complex U = {re,im} (arrays of 4×4).
function expIA(A) {
  const { vals, vecs } = eigSym(A);
  const re = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const im = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let k = 0; k < 4; k++) {
    const c = Math.cos(vals[k]), s = Math.sin(vals[k]), v = vecs[k];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const p = v[i] * v[j]; re[i][j] += c * p; im[i][j] += s * p; }
  }
  return { re, im };
}

// MS unitary U(Θ,ε) = exp[i(Θ G − ε E)].
export function msUnitary(theta, eps) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) A[i][j] = theta * G4[i][j] - eps * E4[i][j];
  return expIA(A);
}

// complex 4×4 product.
function cmul(A, B) {
  const re = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const im = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let sr = 0, si = 0;
    for (let k = 0; k < 4; k++) {
      sr += A.re[i][k] * B.re[k][j] - A.im[i][k] * B.im[k][j];
      si += A.re[i][k] * B.im[k][j] + A.im[i][k] * B.re[k][j];
    }
    re[i][j] = sr; im[i][j] = si;
  }
  return { re, im };
}

// GBC-compensated gate U_ε U_{2ε}^† U_ε, with U_{2ε}^† = U(−Θ, −2ε).
export function gbcUnitary(theta, eps) {
  const Ue = msUnitary(theta, eps), Ud2 = msUnitary(-theta, -2 * eps);
  return cmul(cmul(Ue, Ud2), Ue);
}

// Average gate fidelity of U to U_ideal=exp(iΘ σ_xσ_x): (|Tr(U_id† U)|²+d)/(d(d+1)), d=4.
export function gateFidelity(U, theta = THETA_MS) {
  const Uid = msUnitary(theta, 0);
  let tr = 0, ti = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const ar = Uid.re[i][j], ai = Uid.im[i][j], br = U.re[i][j], bi = U.im[i][j];
    tr += ar * br + ai * bi;      // Re[ conj(U_id)·U ]
    ti += ar * bi - ai * br;      // Im[ conj(U_id)·U ]
  }
  return ((tr * tr + ti * ti) + 4) / 20;
}

// Sweep asymmetric error: infidelity vs Δω for the uncompensated and GBC gates.
//   ε = Δω·τ. Returns [{deltaOmega, uncompensated, gbc}].
export function asymmetricSweep(deltaOmegas, tau, { theta = THETA_MS } = {}) {
  return deltaOmegas.map((dw) => {
    const eps = dw * tau;
    return {
      deltaOmega: dw,
      uncompensated: 1 - gateFidelity(msUnitary(theta, eps), theta),
      gbc: 1 - gateFidelity(gbcUnitary(theta, eps), theta),
    };
  });
}

// =============================================================================
// E4 — recursive (nested) GBC and the optimal robustness depth.
//
// The physical error-flip in GBC is Π(·)Π with Π=σ_x⊗σ_x (ΠGΠ=G, ΠEΠ=−E). Nest it:
//     U^{(k)}(Θ,ε) = U^{(k−1)}(Θ,ε) · [ Π U^{(k−1)}(−Θ,2ε) Π ] · U^{(k−1)}(Θ,ε),
// with U^{(0)}=U(Θ,ε). Each level triples the sub-gates and doubles the middle-leg
// time, so the TOTAL gate time grows as 4^k·τ.
//
// KEY RESULT (measured): the coherent infidelity does NOT keep improving. It drops
// ε²→ε⁴ from k=0→1, then PLATEAUS at ε⁴ for all k≥1 — and k≥2 is in fact WORSE. The
// residual left by one GBC is EVEN in E (∼ε²[E,[E,G]]), and Π only sign-flips terms
// ODD in E, so nested Π-conjugation cannot cancel it. Reaching ε⁸ needs a genuinely
// higher-order (tuned-angle composite) sequence, not naive nesting — out of scope.
// Consequence: in the physical regime (ε≲0.2) the optimal depth is k*∈{0,1} (k≥2 loses
// in BOTH channels — worse coherent error AND 4^k× more incoherent exposure), decided by
// the E3 crossover. (k=3 wins only in a non-perturbative sliver at ε≳0.34 with a near-ideal
// trap I≲1e-5 — a 34% center-line error, physically irrelevant.)
// =============================================================================

// Π U Π (Π=σ_x⊗σ_x): the physical global-π error-flip. Π swaps basis index i↔3−i.
export function piConjugate(U) {
  const re = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const im = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { re[i][j] = U.re[3 - i][3 - j]; im[i][j] = U.im[3 - i][3 - j]; }
  return { re, im };
}

// Depth-k recursive GBC (k=0 → bare gate, k=1 → standard GBC).
export function gbcUnitaryK(theta, eps, k) {
  if (k <= 0) return msUnitary(theta, eps);
  const Ue = gbcUnitaryK(theta, eps, k - 1);
  const mid = piConjugate(gbcUnitaryK(-theta, 2 * eps, k - 1));   // Π U^{(k−1)}(−Θ,2ε) Π
  return cmul(cmul(Ue, mid), Ue);
}

// Total gate-time multiple (in units of the bare τ) of depth-k GBC.
export const gbcTimeFactor = (k) => Math.pow(4, k);

// Optimal robustness depth for a given center-line error and incoherent budget.
//   deltaOmega  — asymmetric (center-line) drift; ε = Δω·τ.
//   incohI1     — incoherent infidelity of ONE bare gate (time τ); U^{(k)} pays 4^k·incohI1.
//   Returns { kStar, rows:[{k, coherent, incoherent, net}] }.
export function optimalDepth(deltaOmega, tau, incohI1, { kMax = 3, theta = THETA_MS } = {}) {
  const eps = deltaOmega * tau, rows = [];
  for (let k = 0; k <= kMax; k++) {
    const coherent = 1 - gateFidelity(gbcUnitaryK(theta, eps, k), theta);
    const incoherent = gbcTimeFactor(k) * incohI1;
    rows.push({ k, coherent, incoherent, net: coherent + incoherent });
  }
  const kStar = rows.reduce((best, r) => (r.net < rows[best].net ? r.k : best), 0);
  return { kStar, rows };
}
