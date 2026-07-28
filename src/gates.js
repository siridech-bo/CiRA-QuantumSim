// =============================================================================
// gates.js — the PHYSICS-CRITICAL gate compiler.
//
// Compiles named quantum-circuit gates into an ordered, TIMED schedule of
// primitive NMR operations that execute on the REAL density-matrix engine
// (src/quantum.js). NO gate matrix is ever applied directly as "the physics":
// every gate is realized as real selective RF pulses, virtual-Z frame changes,
// and/or J-coupling free-evolution delays.
//
// Qubit ↔ spin map:  q0 → spin0 (¹H),  q1 → spin1 (³¹P),  q2 → spin2 (¹⁹F).
//
// Primitive op kinds (consumed by src/runner.js):
//   { kind:'rf',    spin, phase, angle, omega1 }   selective finite RF pulse
//   { kind:'vz',    spin, angle }                  instantaneous virtual-Z
//   { kind:'delay', tau }                          free evolution under H_system
//                                                   (coupling forced ON)
//
// Each compileGate returns { ops, idealUnitary, durationSeconds }:
//   - idealUnitary is the EXACT 8x8 (flat) unitary the gate should realize on
//     the full 3-spin register (up to global phase), for verification and the
//     ideal reference simulator.
// =============================================================================

import { SPINQ_PARAMS, _internal } from './quantum.js';

const {
  DIM, MLEN, IDX, zerosF, mmul, toFlat, kron, I2, SX, SY, SZ, singleRot,
} = _internal;

const TWO_PI = 2 * Math.PI;
const PI = Math.PI;

// Default RF nutation rate for compiled pulses (rad/s). Must match the engine's
// defaultOmega1 so t_p = angle/omega1 is consistent. omega1/2π = 8 kHz ⇒
// t_90 ≈ 31 µs: short enough that off-resonance (chemical-shift) error over the
// pulse is negligible, yet real finite timing that carries decoherence.
export const DEFAULT_OMEGA1 = TWO_PI * 8000;

// J-coupling lookup by unordered pair of spin indices (Hz).
const J_HZ = {};
for (const cp of SPINQ_PARAMS.couplings) {
  J_HZ[`${cp.i},${cp.j}`] = cp.J_Hz;
  J_HZ[`${cp.j},${cp.i}`] = cp.J_Hz;
}
export function jHz(i, j) { return J_HZ[`${i},${j}`]; }

// Chemical-shift / display offset (Hz) per spin, used to compute deterministic
// z-phase accumulated over a delay (so we can cancel it with virtual-Z).
const OFFSET_HZ = SPINQ_PARAMS.nuclei.map((n) => n.offset_Hz);

// ---------------------------------------------------------------------------
// Flat-8x8 unitary builders (for idealUnitary + the ideal reference sim).
// ---------------------------------------------------------------------------

// Embed a nested 2x2 op on spin k (I on the others) → flat 8x8.
function embed2(op2, k) {
  const blocks = [I2, I2, I2];
  blocks[k] = op2;
  let U = blocks[0];
  for (let s = 1; s < 3; s++) U = kron(U, blocks[s]);
  return toFlat(U);
}

// Identity flat 8x8.
function eye8() {
  const m = zerosF();
  for (let i = 0; i < DIM; i++) m[IDX(i, i)] = 1;
  return m;
}

// Single-qubit rotation exp(−i(θ/2)σ_a) on spin k → flat 8x8.
function rot(k, angle, axis) { return embed2(singleRot(angle, axis), k); }

// 2x2 Hadamard (nested), for idealUnitary of H.
const s2 = 1 / Math.sqrt(2);
const H2 = [
  [{ re: s2, im: 0 }, { re: s2, im: 0 }],
  [{ re: s2, im: 0 }, { re: -s2, im: 0 }],
];

// Ideal CZ_{ij} ⊗ I_s as a flat 8x8: diagonal, phase −1 on states where both
// qubit i and qubit j are |1⟩ (down). basis b = 4·q0 + 2·q1 + q2.
function idealCZ(i, j) {
  const m = zerosF();
  for (let b = 0; b < DIM; b++) {
    const bit = (q) => (b >> (2 - q)) & 1;   // q0 is the MSB
    const sign = (bit(i) === 1 && bit(j) === 1) ? -1 : 1;
    m[IDX(b, b)] = sign;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Single-qubit gate → primitives.
//
// Rx(θ) = rf(phase 0, angle θ).   Ry(θ) = rf(phase π/2, angle θ).
// Rz(θ) = vz(θ)  (virtual-Z, exact).
//
// H (Hadamard): we use the decomposition
//        H = Ry(π/2) · Rz(π)             (matrix order: Rz first, then Ry)
// i.e. apply Rz(π) then Ry(π/2). This equals H up to a global phase e^{iπ/2}=i:
//   Ry(π/2)·Rz(π) = i·H   (verified in test/gates.test.mjs).
// In op-execution order the schedule is [ vz(π), rf(π/2-phase, π/2) ].
// ---------------------------------------------------------------------------
function rfOp(spin, phase, angle) {
  return { kind: 'rf', spin, phase, angle, omega1: DEFAULT_OMEGA1 };
}
function vzOp(spin, angle) { return { kind: 'vz', spin, angle }; }

function singleQubitOps(name, spin, angle) {
  switch (name) {
    case 'I':  return [];
    case 'X':  return [rfOp(spin, 0, PI)];
    case 'Y':  return [rfOp(spin, PI / 2, PI)];
    case 'Z':  return [vzOp(spin, PI)];
    case 'SX': return [rfOp(spin, 0, PI / 2)];        // √X
    case 'SY': return [rfOp(spin, PI / 2, PI / 2)];   // √Y
    case 'SZ': return [vzOp(spin, PI / 2)];           // √Z
    case 'Rx': return [rfOp(spin, 0, angle)];
    case 'Ry': return [rfOp(spin, PI / 2, angle)];
    case 'Rz': return [vzOp(spin, angle)];
    // H = Ry(π/2)·Rz(π): execution order is Rz(π) then Ry(π/2).
    case 'H':  return [vzOp(spin, PI), rfOp(spin, PI / 2, PI / 2)];
    default: throw new Error(`unknown single-qubit gate ${name}`);
  }
}

// Ideal 8x8 unitary for a single-qubit gate on `spin`.
function singleQubitUnitary(name, spin, angle) {
  switch (name) {
    case 'I':  return eye8();
    case 'X':  return rot(spin, PI, 'x');
    case 'Y':  return rot(spin, PI, 'y');
    case 'Z':  return rot(spin, PI, 'z');
    case 'SX': return rot(spin, PI / 2, 'x');
    case 'SY': return rot(spin, PI / 2, 'y');
    case 'SZ': return rot(spin, PI / 2, 'z');
    case 'Rx': return rot(spin, angle, 'x');
    case 'Ry': return rot(spin, angle, 'y');
    case 'Rz': return rot(spin, angle, 'z');
    case 'H':  return embed2(H2, spin);
    default: throw new Error(`unknown single-qubit gate ${name}`);
  }
}

const SINGLE_GATES = new Set(['I', 'X', 'Y', 'Z', 'SX', 'SY', 'SZ', 'Rx', 'Ry', 'Rz', 'H']);

// ---------------------------------------------------------------------------
// CZ(i, j) — the real NMR two-qubit mechanism.
//
// The system Hamiltonian's coupling term is  H_J = 2π J_ij · Iz_i·Iz_j (+ the
// two spectator couplings i-s, j-s and the chemical-shift offsets). Free
// evolution for time t under the i-j ZZ term alone gives
//     exp(−i · 2π J_ij t · Iz_i Iz_j) = exp(−i · (2π J t/4) · σz_i σz_j).
// Choosing  t = 1/(2 J_ij)  makes the ZZ phase = exp(−i (π/4) σz_i σz_j), which
// is the entangling core of CZ (up to single-qubit z-rotations + global phase).
//
// REFOCUSING SCHEME (spectator + shifts):
//   * Spectator spin s (the third qubit): a π_x pulse at the delay MIDPOINT
//     flips s, so the i-s and j-s ZZ couplings (and s's own chemical shift)
//     accrue equal-and-opposite over the two halves and CANCEL, while the i-j
//     coupling is UNAFFECTED (both i,j untouched). A second π_x on s at the end
//     returns s to its original state (net 2π ⇒ identity on s, up to global
//     phase). Thus the spectator ends unchanged.
//   * The ZZ evolution + spectator echo leaves, on each of |i=1⟩ and |j=1⟩, a
//     single-qubit z-phase of π/2 (the σz_i/σz_j part of the σz_iσz_j evolution),
//     PLUS the chemical-shift accrual 2π·ν·t over the full time t (i and j are
//     NOT refocused). Both are deterministic z-rotations, CANCELLED exactly by a
//     virtual-Z of −(π/2 + 2π·ν·t) on each of i and j (Rz is a free, exact frame
//     change). This leaves ONLY the −π two-qubit phase on |i=1,j=1⟩ = ideal CZ
//     up to global phase.
//
// Net compiled unitary (relax off) = CZ_{ij} ⊗ I_s up to global phase, verified
// to fidelity > 0.999 in test/gates.test.mjs.
//
// Timing:  CZ(H,F) J=220 → t=1/440≈2.273 ms;
//          CZ(H,P) J=42  → t=1/84 ≈11.905 ms;
//          CZ(P,F) J=430 → t=1/860≈1.163 ms.
// ---------------------------------------------------------------------------
function czOps(i, j) {
  const J = jHz(i, j);
  if (J === undefined) throw new Error(`no J coupling for pair ${i},${j}`);
  const t = 1 / (2 * J);            // total ZZ evolution time
  const s = [0, 1, 2].find((k) => k !== i && k !== j);  // spectator

  // Spectator refocusing uses HARD (instantaneous, ideal-unitary) π_x pulses.
  // A finite-duration spectator pulse would let the retained i-j ZZ coupling
  // (and offsets) evolve UNCONTROLLABLY during the ~t_π pulse, corrupting the
  // two-qubit phase; a hard π (the standard NMR refocusing idealization) flips
  // the spectator instantaneously so the i-s and j-s couplings and the
  // spectator's own chemical shift cancel exactly across the two t/2 halves,
  // while the i-j coupling accrues the full exp(−i(π/4)σz_iσz_j) core. The two
  // hard π's net to identity on s (up to global phase) ⇒ spectator unchanged.
  const spectatorPi = () => ({ kind: 'ipulse', spin: s, axis: 'x', angle: PI });

  // virtual-Z corrections applied AFTER the coupling evolution:
  // The ZZ delay + spectator echo imprints, on each of |i=1⟩ and |j=1⟩, a total
  // single-qubit phase  φ = π/2 (the σz_i / σz_j part of the σz_iσz_j evolution)
  // + 2π·ν·t (the chemical-shift accrual over the full time t; the spectator
  // echo does NOT refocus i, j). virtualZ(spin, θ) adds phase +θ/2 to |1⟩, so to
  // CANCEL a phase +φ we apply virtualZ(spin, −φ) — VERIFIED to null the residual
  // in test/gates.test.mjs. This leaves ONLY the −π two-qubit phase on |i=1,j=1⟩,
  // i.e. ideal CZ up to global phase.
  const rawPhase = (k) => PI / 2 + TWO_PI * OFFSET_HZ[k] * t;
  const vzI = -rawPhase(i);
  const vzJ = -rawPhase(j);

  return {
    ops: [
      { kind: 'delay', tau: t / 2 },
      spectatorPi(),
      { kind: 'delay', tau: t / 2 },
      spectatorPi(),
      vzOp(i, vzI),
      vzOp(j, vzJ),
    ],
    // Hard π pulses are instantaneous ⇒ the physical duration is just the two
    // free-evolution halves = t = 1/(2J).
    durationSeconds: t,
    t,
  };
}

// CNOT(control c, target g) = (I⊗H_g) · CZ(c,g) · (I⊗H_g).
// Execution order: H on g, then CZ(c,g), then H on g.
function cnotOps(c, g) {
  const hPre = singleQubitOps('H', g);
  const cz = czOps(c, g);
  const hPost = singleQubitOps('H', g);
  return {
    ops: [...hPre, ...cz.ops, ...hPost],
    durationSeconds: cz.durationSeconds + 2 * hGateDuration(),
    t: cz.t,
  };
}

function hGateDuration() {
  // H schedule = vz (0 s) + one π/2 rf pulse.
  return (PI / 2) / DEFAULT_OMEGA1;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

// Sum of primitive-op durations (rf & delay carry time; vz is instantaneous).
export function opsDuration(ops, omega1 = DEFAULT_OMEGA1) {
  let d = 0;
  for (const op of ops) {
    if (op.kind === 'rf') d += Math.abs(op.angle) / (op.omega1 || omega1);
    else if (op.kind === 'delay') d += op.tau;
  }
  return d;
}

// compileGate(name, { targets, angle }) → { ops, idealUnitary, durationSeconds }.
//   targets: array of spin indices. Single-qubit: [spin]. CZ/CNOT: [a, b]
//   where for CNOT a = control, b = target; for CZ order is symmetric.
export function compileGate(name, { targets = [], angle = PI / 2 } = {}) {
  if (SINGLE_GATES.has(name)) {
    const spin = targets[0];
    const ops = singleQubitOps(name, spin, angle);
    return {
      ops,
      idealUnitary: singleQubitUnitary(name, spin, angle),
      durationSeconds: opsDuration(ops),
    };
  }
  if (name === 'CZ') {
    const [i, j] = targets;
    const { ops, durationSeconds } = czOps(i, j);
    return { ops, idealUnitary: idealCZ(i, j), durationSeconds };
  }
  if (name === 'CNOT' || name === 'CX') {
    const [c, g] = targets;
    const { ops, durationSeconds } = cnotOps(c, g);
    return { ops, idealUnitary: idealCNOT(c, g), durationSeconds };
  }
  throw new Error(`unknown gate ${name}`);
}

// Ideal CNOT(c,g) ⊗ I_s as flat 8x8: flip qubit g iff qubit c = |1⟩.
function idealCNOT(c, g) {
  const m = zerosF();
  for (let b = 0; b < DIM; b++) {
    const bit = (q) => (b >> (2 - q)) & 1;
    let out = b;
    if (bit(c) === 1) out = b ^ (1 << (2 - g));   // flip target bit
    m[IDX(out, b)] = 1;
  }
  return m;
}

// A "circuit" is an array of columns; each column is an array of gate specs:
//   { name, targets:[...], angle? }
// compileCircuit → { schedule:[...ops with gate tags...], durationSeconds,
//                    columns:[{ ops, gates, start, end }] } for the playhead.
export function compileCircuit(circuit) {
  const schedule = [];
  const columns = [];
  let total = 0;
  circuit.forEach((column, colIdx) => {
    const colOps = [];
    const gates = [];
    for (const g of column) {
      const compiled = compileGate(g.name, { targets: g.targets, angle: g.angle });
      // Tag each op with its column so the runner can drive a playhead.
      for (const op of compiled.ops) colOps.push({ ...op, _col: colIdx });
      gates.push(g);
    }
    const dur = opsDuration(colOps);
    columns.push({ ops: colOps, gates, start: total, end: total + dur });
    schedule.push(...colOps);
    total += dur;
  });
  return { schedule, durationSeconds: total, columns };
}

export const _gatesInternal = {
  idealCZ, idealCNOT, singleQubitUnitary, embed2, eye8, rot, czOps, cnotOps,
  singleQubitOps, H2,
};
