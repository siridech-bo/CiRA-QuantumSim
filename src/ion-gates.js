// =============================================================================
// ion-gates.js — M6 single-qubit-gate helpers for the trapped-ion substrate.
//
// The trapped-ion engine (src/ion.js) drives the internal qubit through the SAME
// Hamiltonian used everywhere else: at the carrier (δ=0), in the Lamb–Dicke limit,
//   H ≈ (Ω/2)·⟨0|D(iη)|0⟩·σ_x   (the coupling coefficient is REAL, so a carrier
// pulse is a rotation about the x-axis — an Rx gate). The engine exposes only a
// real Rabi frequency Ω (NO drive phase), so the native gate set is:
//   • Rx(θ)  — a resonant (δ=0) carrier pulse of area θ = Ω_eff·t.
//   • δ-tilted rotations — an OFF-RESONANT carrier (δ≠0) rotates about an axis
//     tilted in the x–z plane at the generalized Rabi frequency √(δ²+Ω²). This is
//     the AC-Stark / light-shift regime.
// There is no native Ry (that would need a phase-φ drive σ_φ = cosφ σx + sinφ σy);
// this module documents that limitation rather than faking it.
//
// NOTHING here re-implements the physics — every routine drives the real IonSystem
// and reads its density matrix. Shared by ion-main.js (live M6 tab) and
// test/ion.test.mjs so the app and the assertions exercise the same code path.
// =============================================================================
import { IonSystem } from './ion.js';

// Effective carrier Rabi frequency for the motional ground state |n=0⟩:
// Ω_eff = Ω·|⟨0|D(iη)|0⟩| = Ω·e^{−η²/2} (the Debye–Waller-reduced carrier).
export function carrierRabi0(sys) {
  return sys.couplingMatrix()[0];   // couplingMatrix[0] = Ω·|D[0][0]|
}

// Duration of a carrier pulse of Bloch-rotation area `theta` (radians) on |n=0⟩.
export function carrierGateDuration(sys, theta) {
  return theta / carrierRabi0(sys);
}

// Reduced 2×2 internal density matrix (trace over motion), basis {g=0, e=1}.
// Returns { rr:[[..]], ri:[[..]] } (real / imag parts).
export function reducedInternal(sys) {
  const N = sys.N_FOCK, r = sys.rho(), DIM = sys.dim, IDX = (i, j) => 2 * (i * DIM + j);
  const rr = [[0, 0], [0, 0]], ri = [[0, 0], [0, 0]];
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let n = 0; n < N; n++) {
        const idx = IDX(a * N + n, b * N + n);
        rr[a][b] += r[idx]; ri[a][b] += r[idx + 1];
      }
  return { rr, ri };
}

// Fidelity F = ⟨ψ|ρ_int|ψ⟩ of the reduced internal state to a pure state given by
// its {g,e} amplitudes cg=[re,im], ce=[re,im]. (For a spin–motion-entangled ρ the
// reduced state is mixed and F drops — that is exactly the break-it signal.)
export function fidelityToPure(sys, cg, ce) {
  const { rr, ri } = reducedInternal(sys);
  const c = [cg, ce];
  let re = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      const car = c[a][0], cai = -c[a][1];          // conj(c_a)
      const rab_r = rr[a][b], rab_i = ri[a][b];
      const cbr = c[b][0], cbi = c[b][1];
      const pr = car * rab_r - cai * rab_i;
      const pi = car * rab_i + cai * rab_r;
      re += pr * cbr - pi * cbi;                     // Re[ conj(c_a)·ρ_ab·c_b ]
    }
  return re;
}

// Ideal state / Bloch vector for a carrier gate Rx(θ) applied to |g⟩:
//   Rx(θ)|g⟩ = cos(θ/2)|g⟩ − i·sin(θ/2)|e⟩ ,  Bloch = (0, sinθ, −cosθ).
export function idealRxAmps(theta) {
  return { cg: [Math.cos(theta / 2), 0], ce: [0, -Math.sin(theta / 2)] };
}
export function idealRxBloch(theta) {
  return { x: 0, y: Math.sin(theta), z: -Math.cos(theta) };
}

// Gate fidelity of the current engine state to the ideal Rx(θ)|g⟩, plus n̄.
export function gateReport(sys, theta) {
  const { cg, ce } = idealRxAmps(theta);
  return { fidelity: fidelityToPure(sys, cg, ce), nbar: sys.nBar(), pExcited: sys.pExcited() };
}

// Drive the REAL engine through a carrier pulse of area `theta` about x (δ held at
// its current value — 0 for a clean Rx, ≠0 for the AC-Stark tilt). Blocking; splits
// the pulse into `steps` RK4 slices so short/broadband pulses stay accurate. Returns
// the pulse duration. Used by the tests and by the app's "instant" gate path.
export function driveCarrierGate(sys, theta, steps = 400) {
  const t = carrierGateDuration(sys, theta);
  const dt = t / steps;
  for (let i = 0; i < steps; i++) sys.step(dt);
  return t;
}

// =============================================================================
// AC-Stark / generalized-Rabi thermometer (clean two-level regime).
//
// Builds a short-lived engine with the motional sidebands pushed FAR away
// (ω_z ≫ δ,Ω) so the off-resonant CARRIER drive is pure two-level AC Stark with no
// motional contamination, then measures the internal-state precession frequency by
// timing the k-th full P_e revival (high precision over many periods). Returns the
// measured generalized Rabi Ω_gen and the derived per-level light shift
//   Δ_LS = ½(Ω_gen − |δ|) ≈ Ω²/(4δ)   (dressed-state expansion for δ ≫ Ω),
// each next to its closed-form value. Shared by the app readout and the test.
// =============================================================================
export function measureGeneralizedRabi(delta, Omega, { N = 6, omegaZ = 30, periods = 10 } = {}) {
  const s = new IonSystem({ N_FOCK: N, omegaZ, delta, rabi: Omega, mode: 'exact' });
  s.reset();                                   // |g,0⟩
  const gen = Math.sqrt(delta * delta + Omega * Omega);
  const Tper = 2 * Math.PI / gen;
  const dt = Tper / 2000, tMax = periods * Tper * 1.3;
  let t = 0, prev = s.pExcited(), prev2 = prev, minCount = 0, tMin = NaN;
  while (t < tMax) {
    s.step(dt); t += dt;
    const cur = s.pExcited();
    if (prev < prev2 && prev <= cur && prev < 0.5) {   // local P_e minimum (full revival)
      const a = prev2, b = prev, c = cur;
      const off = 0.5 * (a - c) / (a - 2 * b + c);      // parabolic sub-sample
      const tm = (t - dt) + off * dt;
      if (++minCount === periods) { tMin = tm; break; }
    }
    prev2 = prev; prev = cur;
  }
  const measGen = 2 * Math.PI * periods / tMin;
  return {
    measGen, formulaGen: gen,
    lightShiftMeas: 0.5 * (measGen - Math.abs(delta)),
    lightShiftFormula: Omega * Omega / (4 * delta),
  };
}
