// =============================================================================
// ion-msn.js — analytic multi-mode Mølmer–Sørensen gate VERIFIER (2 qubits, M
// motional modes). Substrate 3 · "gate & calibration verifier" MVP.
//
// PURPOSE (the DPS "analog backend" niche): given a 2-ion MS gate and the modes
// it couples to, decide — WITHOUT integrating the 2ⁿ·∏N_Fock Hilbert space —
// whether the gate closes every motional loop, what Bell fidelity it reaches,
// and WHERE the error comes from (coherent phase vs per-mode residual motion).
// This is the pre-hardware calibration check, not a teaching visual.
//
// WHY ANALYTIC (the key idea from the design thread): the MS Hamiltonian couples
// a spin operator Q_p = Σ_i g_{p,i} σx_i to each mode p. All Q_p are sums of σx_i,
// so they MUTUALLY COMMUTE — the whole problem is DIAGONAL in the σx product
// basis {|ε₁ε₂⟩}, εᵢ ∈ {+1,−1}. Each basis state ε sees, per mode:
//   • a displacement       α_{p,ε}(t) = −q_p(ε)(e^{iδ_p t} − 1)/δ_p ,  q_p(ε)=Σ_i g_{p,i}εᵢ
//   • a geometric phase     Φ_{p,ε}(t) = q_p(ε)²(δ_p t − sin δ_p t)/δ_p²
// Because [H(t),H(t′)] is a c-number, the Magnus series terminates (2nd order) —
// this is EXACT under Lamb–Dicke + RWA (the same regime src/ion-ms.js integrates
// numerically). Tracing out the (thermal, mean n̄_p) motion, the reduced 2-qubit
// coherence between sectors ε,ε′ is multiplied by the motional overlap
//   C_{εε′} = ∏_p exp[ −(2n̄_p+1) |α_{p,ε} − α_{p,ε′}|² / 2 ]   (real; ⟨coh|coh⟩).
// So the whole gate is captured by {Φ_ε, C_{εε′}} over 4 states — O(M) work, no
// Fock tensor. At loop closure (δ_p t = 2πK) every α returns to 0 ⇒ C=1 and the
// gate is exact and TEMPERATURE-INSENSITIVE (the signature MS property).
//
// Conventions locked to src/ion-ms.js so the two agree numerically:
//   • Loop closure: ηΩ = δ/(2√K),  τ_g = 2πK/δ  ⇒  Φ_{s=±2} = π/2, Φ_{s=0}=0.
//   • Target gate:  U = exp[i(π/8)S_x²],  S_x=σx¹+σx², i.e. |gg⟩→(|gg⟩+i|ee⟩)/√2.
//   • Bell fidelity F = ⟨Φ|ρ₂q|Φ⟩ to that target — validated cell-for-cell against
//     MSGate.runGate().bellFidelity() (the independent Lindblad integrator) at
//     n̄=0 in test/ion-msn.test.mjs (closure, phase-error, and non-closure paths).
//
// Physics: Sørensen & Mølmer PRA 62, 022311 (2000); Ion_Trap_Visualizer_Spec §4
// (M7); docs/ion-physics-constants.md §8. Framework-free (only Math) → node-import.
// =============================================================================

export const THETA_MS = Math.PI / 8;   // maximally-entangling 2-ion MS phase (S_x² spectrum {4,0,0,4} ⇒ relative π/2)

// The four σx product-basis states |ε₁ε₂⟩ and their S_x eigenvalue s = ε₁+ε₂.
const EPS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SVAL = EPS.map(([a, b]) => a + b);          // [+2, 0, 0, −2]

// A "mode" is { delta, g:[g₁,g₂], nbar } where gᵢ = η_{p,i}·Ω/2 (per-ion coupling,
// angular-freq units), delta = μ − ω_p (drive detuning from this mode's sideband),
// nbar = mean phonon occupation of the mode at gate start.

// q_p(ε) = Σ_i g_{p,i} εᵢ — the spin-dependent force amplitude on mode p for state ε.
function qval(mode, e) { return mode.g[0] * e[0] + mode.g[1] * e[1]; }

// ζ_p(t) = −(e^{iδt} − 1)/δ, the shared (per-unit-q) displacement of mode p.
// α_{p,ε}(t) = q_p(ε)·ζ_p(t). Returns {re, im}.
function zeta(mode, t) {
  const d = mode.delta, x = d * t;
  return { re: -(Math.cos(x) - 1) / d, im: -Math.sin(x) / d };
}
function zetaAbs2(mode, t) { const z = zeta(mode, t); return z.re * z.re + z.im * z.im; }

// Displacement of mode p in state ε at time t (phase-space point of the loop).
export function displacement(mode, e, t) {
  const q = qval(mode, e), z = zeta(mode, t);
  return { re: q * z.re, im: q * z.im };
}

// Geometric phase contributed by mode p to state ε: q²(δt − sin δt)/δ².
function modePhase(mode, e, t) {
  const d = mode.delta, q = qval(mode, e);
  return q * q * (d * t - Math.sin(d * t)) / (d * d);
}

// Total accumulated geometric phase of state ε: Φ_ε(t) = Σ_p Φ_{p,ε}.
export function phaseOf(modes, e, t) {
  let s = 0; for (const m of modes) s += modePhase(m, e, t); return s;
}

// Accumulated MS phase on the |++⟩ (s=+2) sector, folded to the S_x²·Θ form:
//   Θ(t) = Φ_{s=+2}(t) / 4   (since S_x²|±2⟩ = 4). Θ→π/8 is the ideal gate.
export function accumulatedTheta(modes, t) { return phaseOf(modes, EPS[0], t) / 4; }

// Per-mode motional-overlap decoherence exponent between sectors ε,ε′:
//   (2n̄_p+1)|α_{p,ε} − α_{p,ε′}|²/2 = (2n̄_p+1)(q_p(ε)−q_p(ε′))²|ζ_p|²/2.
function modeDecohExp(mode, ei, ej, t) {
  const dq = qval(mode, EPS[ei]) - qval(mode, EPS[ej]);
  return (2 * mode.nbar + 1) * dq * dq * zetaAbs2(mode, t) / 2;
}

// -----------------------------------------------------------------------------
// Bell-state fidelity of the actual gate on |gg⟩ vs the ideal exp[i(π/8)S_x²].
//   F = (1/16) Σ_{i,j} cos(ΔΦ_i − ΔΦ_j)·C_{ij},   ΔΦ_ε = Φ_ε − (π/8)s_ε²,
//   C_{ij} = exp[−Σ_p modeDecohExp].  (imag part cancels: C symmetric, sin odd.)
// opts.only ∈ {'phase','decoh'} isolates a channel for error attribution;
// opts.modeMask restricts the C product to a subset of modes.
// -----------------------------------------------------------------------------
export function bellFidelity(modes, t, opts = {}) {
  const { only = null, modeMask = null } = opts;
  const dPhi = EPS.map((e, i) => phaseOf(modes, e, t) - THETA_MS * SVAL[i] * SVAL[i]);
  let F = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const ph = (only === 'decoh') ? 1 : Math.cos(dPhi[i] - dPhi[j]);   // coherent phase factor
      let C;
      if (only === 'phase') {
        C = 1;                                                            // no motional decoherence
      } else {
        let cexp = 0;
        for (let p = 0; p < modes.length; p++) {
          if (modeMask && !modeMask[p]) continue;
          cexp += modeDecohExp(modes[p], i, j, t);
        }
        C = Math.exp(-cexp);
      }
      F += ph * C;
    }
  return F / 16;
}

// Per-mode maximum-sector closure residual |α|_max = (|g₁|+|g₂|)·|ζ_p(t)|.
// closed ⟺ residual < tol (the loop returned to the phase-space origin).
export function closureResiduals(modes, t, tol = 1e-3) {
  return modes.map((m) => {
    const qMax = Math.abs(m.g[0]) + Math.abs(m.g[1]);
    const res = qMax * Math.sqrt(zetaAbs2(m, t));
    return { delta: m.delta, residual: res, closed: res < tol };
  });
}

// -----------------------------------------------------------------------------
// Full verifier report at gate time t.
//   fidelity      — Bell-state fidelity (the headline number)
//   theta,phaseError — accumulated Θ and its deviation from π/8
//   closure       — per-mode residual displacement + closed flag
//   attribution   — infidelity split into coherent phase vs motional decoherence,
//                    with the decoherence broken down per mode (additive exponents).
// -----------------------------------------------------------------------------
export function report(modes, t, opts = {}) {
  const closureTol = opts.closureTol !== undefined ? opts.closureTol : 1e-3;
  const F = bellFidelity(modes, t);
  const theta = accumulatedTheta(modes, t);
  const Fphase = bellFidelity(modes, t, { only: 'phase' });
  const Fdecoh = bellFidelity(modes, t, { only: 'decoh' });
  const perMode = modes.map((_, p) => {
    const mask = modes.map((__, q) => q === p);
    return { infidelity: 1 - bellFidelity(modes, t, { only: 'decoh', modeMask: mask }) };
  });
  return {
    fidelity: F,
    theta,
    thetaTarget: THETA_MS,
    phaseError: theta - THETA_MS,
    closure: closureResiduals(modes, t, closureTol),
    attribution: {
      total: 1 - F,
      phase: 1 - Fphase,                       // coherent (Θ ≠ π/8) contribution
      decoherence: { total: 1 - Fdecoh, perMode },   // residual-motion contribution, per mode
    },
  };
}

// -----------------------------------------------------------------------------
// Builders / operating-point helpers.
// -----------------------------------------------------------------------------
// Loop-closure operating point for a single target mode: τ_g and the drive ηΩ
// that make Θ = π/8 (maximally entangling) after K phase-space loops.
export function closurePoint(delta, K = 1) {
  return { tau: 2 * Math.PI * K / delta, etaOmega: delta / (2 * Math.sqrt(K)) };
}

// A single symmetric collective (COM-like) mode: both ions couple equally, so
// q(ε) = (ηΩ/2)(ε₁+ε₂) reproduces the textbook S_x picture. Matches ion-ms.js.
export function symMode(delta, etaOmega, nbar = 0) {
  const g = etaOmega / 2;
  return { delta, g: [g, g], nbar };
}

// The realistic 2-ion AXIAL pair: COM (ω=ω_z, b=[1,1]/√2) + stretch (ω=√3 ω_z,
// b=[1,−1]/√2), driven by a symmetric bichromatic tone at offset μ (units of ω_z).
// η participation η_{p,i} = η·b_{p,i}·√(ω_z/ω_p); g_{p,i} = η_{p,i}·Ω/2.
//   δ_COM = μ − 1,   δ_str = μ − √3   (drive usually parked near COM ⇒ small δ_COM).
// The stretch mode couples to (σx¹−σx²) → it is a SPECTATOR for an S_x gate and
// shows up purely as residual-motion error on the s=0 sectors. Returns [COM, str].
export function twoIonAxial(eta, Omega, mu, { nbarCOM = 0, nbarStr = 0 } = {}) {
  const wStr = Math.sqrt(3);
  const s2 = Math.SQRT1_2;                     // 1/√2
  const etaCOM = eta * s2;                      // b=1/√2, ω=1
  const etaStr = eta * s2 * Math.pow(1 / wStr, 0.5);   // b=1/√2, √(1/√3)
  const gC = etaCOM * Omega / 2, gS = etaStr * Omega / 2;
  return [
    { delta: mu - 1,    g: [gC, gC],  nbar: nbarCOM },   // COM: equal sign
    { delta: mu - wStr, g: [gS, -gS], nbar: nbarStr },   // stretch: opposite sign
  ];
}

// Convenience: 2D calibration sweep of Bell fidelity over (delta, etaOmega) for a
// single symmetric mode evaluated at each point's OWN closure time τ=2πK/δ. Returns
// { deltas, etaOmegas, F:[[…]] } — the raw grid a heatmap/contour would render.
export function sweepDeltaDrive(deltas, etaOmegas, { K = 1, nbar = 0 } = {}) {
  const F = etaOmegas.map((eo) =>
    deltas.map((d) => bellFidelity([symMode(d, eo, nbar)], 2 * Math.PI * K / d)));
  return { deltas, etaOmegas, F };
}
