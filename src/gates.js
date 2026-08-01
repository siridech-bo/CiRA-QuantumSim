// =============================================================================
// gates.js — the PHYSICS-CRITICAL gate compiler (n-spin, molecule-driven).
//
// Compiles named quantum-circuit gates into an ordered, TIMED schedule of
// primitive NMR operations that execute on the REAL density-matrix engine
// (src/quantum.js). NO gate matrix is ever applied directly as "the physics":
// every gate is realized as real selective RF pulses, virtual-Z frame changes,
// and/or J-coupling free-evolution delays.
//
// GENERALIZATION (Phase 1): the compiler now reads J-couplings and display
// offsets from the ACTIVE MOLECULE (src/molecules.js), not hardcoded constants,
// and builds ideal unitaries + refocusing sequences for ARBITRARY n. It
// defaults to the 3-spin SpinQ molecule so legacy callers/tests are unchanged.
//
// SCOPE: heteronuclear (weak) AND homonuclear (weak). For heteronuclear
// molecules single-qubit gates compile to hard/selective RF pulses on the
// target's channel (unchanged). For HOMONUCLEAR molecules (addressing:'homo')
// single-qubit gates compile to FREQUENCY-SELECTIVE SOFT pulses (Gaussian) on
// the target spin, since a hard pulse on the shared channel would rotate ALL
// spins. Rz stays virtual-Z in both cases. Two-qubit CZ/CNOT use the same
// J-coupling core; for homonuclear molecules spectator refocusing uses selective
// soft π pulses (see HOMO_TWO_QUBIT_ENABLED below).
//
// Qubit ↔ spin map:  q_k → spin_k. For n spins, basis b = Σ q_k·2^(n−1−k).
//
// Primitive op kinds (consumed by src/runner.js):
//   { kind:'rf',    spin, phase, angle, omega1 }   selective finite RF pulse
//   { kind:'soft',  spin, phase, angle }           frequency-selective SOFT pulse
//   { kind:'vz',    spin, angle }                  instantaneous virtual-Z
//   { kind:'ipulse',spin, axis, angle }            instantaneous hard pulse
//   { kind:'delay', tau }                          free evolution under H_system
//                                                   (coupling forced ON)
//
// Each compileGate returns { ops, idealUnitary, durationSeconds }:
//   - idealUnitary is the EXACT flat 2^n×2^n unitary the gate should realize on
//     the full register (up to global phase), for verification / ideal sim.
// =============================================================================

import { flatOps } from './quantum.js';
import { defaultMolecule } from './molecules.js';

const TWO_PI = 2 * Math.PI;
const PI = Math.PI;

// Default RF nutation rate for compiled pulses (rad/s). Must match the engine's
// defaultOmega1 so t_p = angle/omega1 is consistent. omega1/2π = 8 kHz.
export const DEFAULT_OMEGA1 = TWO_PI * 8000;

// ---------------------------------------------------------------------------
// A per-molecule compilation context: caches the flat-op toolkit for the
// molecule's n, plus J-lookup and offset arrays read FROM THE MOLECULE.
// ---------------------------------------------------------------------------
const _ctxCache = new Map();   // molecule.id → ctx

function contextFor(molecule) {
  const mol = molecule || defaultMolecule();
  const cached = _ctxCache.get(mol.id);
  if (cached && cached.mol === mol) return cached;

  const n = mol.nuclei.length;
  const ops = flatOps(n);
  const offsetHz = mol.nuclei.map((nu) => nu.offsetHz);
  const jHz = (i, j) => mol.J[i][j];
  const homo = mol.addressing === 'homo';

  const ctx = { mol, n, ops, offsetHz, jHz, homo };
  _ctxCache.set(mol.id, ctx);
  return ctx;
}

// Whether homonuclear two-qubit gates (CZ/CNOT) are shipped-enabled. Selective
// soft π refocusing of spectators does not reach the >0.95 fidelity bar within
// reason for the shipped homonuclear molecules (see docs / the report), so we
// DISABLE homo two-qubit gate placement and grey them out in the palette rather
// than ship a broken gate. Heteronuclear two-qubit gates are unaffected.
export const HOMO_TWO_QUBIT_ENABLED = false;

// ---------------------------------------------------------------------------
// Flat-unitary builders (dim-aware, via the molecule's flat-op toolkit).
// ---------------------------------------------------------------------------

// Embed a nested 2x2 op on spin k (I on others) → flat 2^n×2^n.
function embed2(ctx, op2, k) {
  const { n, ops } = ctx;
  const { I2, kron, toFlat } = ops;
  const blocks = Array.from({ length: n }, () => I2);
  blocks[k] = op2;
  let U = blocks[0];
  for (let s = 1; s < n; s++) U = kron(U, blocks[s]);
  return toFlat(U);
}

function eye(ctx) {
  const { DIM, IDX, zerosF } = ctx.ops;
  const m = zerosF();
  for (let i = 0; i < DIM; i++) m[IDX(i, i)] = 1;
  return m;
}

function rot(ctx, k, angle, axis) {
  return embed2(ctx, ctx.ops.singleRot(angle, axis), k);
}

const s2 = 1 / Math.sqrt(2);
const H2 = [
  [{ re: s2, im: 0 }, { re: s2, im: 0 }],
  [{ re: s2, im: 0 }, { re: -s2, im: 0 }],
];

// bit q of basis b (q0 = MSB) for n spins.
function bitOf(b, q, n) { return (b >> (n - 1 - q)) & 1; }

// Ideal CZ_{ij} ⊗ I (others) as flat 2^n×2^n: diagonal, −1 where both i,j =|1⟩.
function idealCZ(ctx, i, j) {
  const { DIM, IDX, zerosF } = ctx.ops;
  const n = ctx.n;
  const m = zerosF();
  for (let b = 0; b < DIM; b++) {
    const sign = (bitOf(b, i, n) === 1 && bitOf(b, j, n) === 1) ? -1 : 1;
    m[IDX(b, b)] = sign;
  }
  return m;
}

// Ideal CNOT(c,g) ⊗ I (others) as flat 2^n×2^n: flip qubit g iff qubit c=|1⟩.
function idealCNOT(ctx, c, g) {
  const { DIM, IDX, zerosF } = ctx.ops;
  const n = ctx.n;
  const m = zerosF();
  for (let b = 0; b < DIM; b++) {
    let out = b;
    if (bitOf(b, c, n) === 1) out = b ^ (1 << (n - 1 - g));
    m[IDX(out, b)] = 1;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Single-qubit gate → primitives (unchanged decomposition; n-independent).
// ---------------------------------------------------------------------------
function rfOp(spin, phase, angle) {
  return { kind: 'rf', spin, phase, angle, omega1: DEFAULT_OMEGA1 };
}
function softOp(spin, phase, angle) {
  return { kind: 'soft', spin, phase, angle };
}
function vzOp(spin, angle) { return { kind: 'vz', spin, angle }; }

// A single-qubit RF primitive: HARD/selective rf on a channel (heteronuclear),
// or a frequency-selective SOFT pulse (homonuclear shared channel).
function pulseOp(homo, spin, phase, angle) {
  return homo ? softOp(spin, phase, angle) : rfOp(spin, phase, angle);
}

function singleQubitOps(name, spin, angle, homo = false) {
  const P = (phase, ang) => pulseOp(homo, spin, phase, ang);
  switch (name) {
    case 'I':  return [];
    case 'X':  return [P(0, PI)];
    case 'Y':  return [P(PI / 2, PI)];
    case 'Z':  return [vzOp(spin, PI)];
    case 'SX': return [P(0, PI / 2)];
    case 'SY': return [P(PI / 2, PI / 2)];
    case 'SZ': return [vzOp(spin, PI / 2)];
    case 'Rx': return [P(0, angle)];
    case 'Ry': return [P(PI / 2, angle)];
    case 'Rz': return [vzOp(spin, angle)];
    // H = Ry(π/2)·Rz(π): execution order Rz(π) then Ry(π/2).
    case 'H':  return [vzOp(spin, PI), P(PI / 2, PI / 2)];
    default: throw new Error(`unknown single-qubit gate ${name}`);
  }
}

function singleQubitUnitary(ctx, name, spin, angle) {
  switch (name) {
    case 'I':  return eye(ctx);
    case 'X':  return rot(ctx, spin, PI, 'x');
    case 'Y':  return rot(ctx, spin, PI, 'y');
    case 'Z':  return rot(ctx, spin, PI, 'z');
    case 'SX': return rot(ctx, spin, PI / 2, 'x');
    case 'SY': return rot(ctx, spin, PI / 2, 'y');
    case 'SZ': return rot(ctx, spin, PI / 2, 'z');
    case 'Rx': return rot(ctx, spin, angle, 'x');
    case 'Ry': return rot(ctx, spin, angle, 'y');
    case 'Rz': return rot(ctx, spin, angle, 'z');
    case 'H':  return embed2(ctx, H2, spin);
    default: throw new Error(`unknown single-qubit gate ${name}`);
  }
}

const SINGLE_GATES = new Set(['I', 'X', 'Y', 'Z', 'SX', 'SY', 'SZ', 'Rx', 'Ry', 'Rz', 'H']);

// ---------------------------------------------------------------------------
// CZ(i, j) — the real NMR two-qubit mechanism, GENERALIZED to n spins.
//
// Free evolution under the i-j ZZ term for t = 1/(2 J_ij) yields the entangling
// core exp(−i(π/4)σz_iσz_j). Refocusing scheme:
//   * SPECTATORS (every spin s ∉ {i,j}): a hard π_x on ALL spectators at the
//     delay MIDPOINT flips them, so their couplings to i and j (and their own
//     chemical shift) accrue equal-and-opposite over the two t/2 halves and
//     CANCEL, while the i-j coupling is unaffected. A second hard π_x on every
//     spectator at the end restores each to identity (net 2π ⇒ spectator
//     unchanged, up to global phase).
//     For n=2 there are NO spectators ⇒ CZ = delay(t/2)+delay(t/2) + the vz
//     corrections (no refocusing pulses). This path is exercised by DMP.
//   * i, j receive a virtual-Z of −(π/2 + 2π·ν·t) each to cancel the σz_i/σz_j
//     part of the ZZ evolution and their chemical-shift accrual (they are NOT
//     refocused). Leaves ONLY the −π two-qubit phase = ideal CZ up to global.
//
// Reads J and offsets from the active molecule via ctx.
// ---------------------------------------------------------------------------
function czOps(ctx, i, j) {
  const J = ctx.jHz(i, j);
  if (!J) throw new Error(`no J coupling for pair ${i},${j}`);
  const t = 1 / (2 * J);
  const n = ctx.n;

  // All spectator spins (every spin other than i, j).
  const spectators = [];
  for (let k = 0; k < n; k++) if (k !== i && k !== j) spectators.push(k);

  const spectatorPis = () => spectators.map(
    (s) => ({ kind: 'ipulse', spin: s, axis: 'x', angle: PI })
  );

  const rawPhase = (k) => PI / 2 + TWO_PI * ctx.offsetHz[k] * t;
  const vzI = -rawPhase(i);
  const vzJ = -rawPhase(j);

  const ops = [
    { kind: 'delay', tau: t / 2 },
    ...spectatorPis(),
    { kind: 'delay', tau: t / 2 },
    ...spectatorPis(),
    vzOp(i, vzI),
    vzOp(j, vzJ),
  ];

  return { ops, durationSeconds: t, t };
}

// CNOT(control c, target g) = (I⊗H_g)·CZ(c,g)·(I⊗H_g).
function cnotOps(ctx, c, g) {
  const hPre = singleQubitOps('H', g, PI / 2, ctx.homo);
  const cz = czOps(ctx, c, g);
  const hPost = singleQubitOps('H', g, PI / 2, ctx.homo);
  return {
    ops: [...hPre, ...cz.ops, ...hPost],
    durationSeconds: cz.durationSeconds + 2 * hGateDuration(),
    t: cz.t,
  };
}

function hGateDuration() { return (PI / 2) / DEFAULT_OMEGA1; }

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

// Selective SOFT-pulse duration (s) for a target spin in a molecule: matches the
// engine's softPulse() choice T = selectivity / minGap, where minGap is the
// smallest chemical-shift gap (Hz) from the target to any other spin. Kept in
// sync with QuantumSpinSystem.softPulse.
const SOFT_SELECTIVITY = 1.5;   // must match QuantumSpinSystem.softPulse `sel`
export function softDuration(ctx, spin) {
  const { n, offsetHz } = ctx;
  const nuT = offsetHz[spin];
  let minGap = Infinity;
  for (let k = 0; k < n; k++) {
    if (k === spin) continue;
    const gap = Math.abs(offsetHz[k] - nuT);
    if (gap > 0 && gap < minGap) minGap = gap;
  }
  if (!isFinite(minGap)) minGap = 1000;
  return SOFT_SELECTIVITY / minGap;
}

// Stamp a compile-time duration onto each 'soft' op (so opsDuration/runner know
// the timing without re-deriving it). Mutates ops in place; returns ops.
function stampSoftDurations(ctx, ops) {
  for (const op of ops) {
    if (op.kind === 'soft') op.durationSeconds = softDuration(ctx, op.spin);
  }
  return ops;
}

// Sum of primitive-op durations (rf/soft/delay carry time; vz/ipulse instant).
export function opsDuration(ops, omega1 = DEFAULT_OMEGA1) {
  let d = 0;
  for (const op of ops) {
    if (op.kind === 'rf') d += Math.abs(op.angle) / (op.omega1 || omega1);
    else if (op.kind === 'soft') d += op.durationSeconds || 0;
    else if (op.kind === 'delay') d += op.tau;
  }
  return d;
}

// compileGate(name, { targets, angle, molecule }) → { ops, idealUnitary,
// durationSeconds }. `molecule` defaults to the 3-spin SpinQ demo (legacy).
export function compileGate(name, { targets = [], angle = PI / 2, molecule } = {}) {
  const ctx = contextFor(molecule);
  if (SINGLE_GATES.has(name)) {
    const spin = targets[0];
    const ops = stampSoftDurations(ctx, singleQubitOps(name, spin, angle, ctx.homo));
    return {
      ops,
      idealUnitary: singleQubitUnitary(ctx, name, spin, angle),
      durationSeconds: opsDuration(ops),
    };
  }
  // Two-qubit gates. For homonuclear molecules these are DISABLED (see
  // HOMO_TWO_QUBIT_ENABLED): selective soft-π spectator refocusing does not
  // reach the fidelity bar within reason for the shipped homo molecules.
  if (name === 'CZ' || name === 'CNOT' || name === 'CX') {
    if (ctx.homo && !HOMO_TWO_QUBIT_ENABLED) {
      throw new Error(
        `two-qubit gate ${name} is disabled for homonuclear molecule `
        + `"${ctx.mol.id}" (experimental — selective soft-π refocusing below `
        + `fidelity bar). Use a heteronuclear molecule for entangling gates.`);
    }
  }
  if (name === 'CZ') {
    const [i, j] = targets;
    const { ops, durationSeconds } = czOps(ctx, i, j);
    return { ops: stampSoftDurations(ctx, ops), idealUnitary: idealCZ(ctx, i, j), durationSeconds };
  }
  if (name === 'CNOT' || name === 'CX') {
    const [c, g] = targets;
    const { ops, durationSeconds } = cnotOps(ctx, c, g);
    return { ops: stampSoftDurations(ctx, ops), idealUnitary: idealCNOT(ctx, c, g), durationSeconds };
  }
  throw new Error(`unknown gate ${name}`);
}

// Backward-compatible J lookup on the DEFAULT molecule (some code imports jHz).
export function jHz(i, j) { return contextFor().jHz(i, j); }

// compileCircuit(circuit, molecule) → { schedule, durationSeconds, columns }.
export function compileCircuit(circuit, molecule) {
  const schedule = [];
  const columns = [];
  let total = 0;
  circuit.forEach((column, colIdx) => {
    const colOps = [];
    const gates = [];
    for (const g of column) {
      const compiled = compileGate(g.name, { targets: g.targets, angle: g.angle, molecule });
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
  contextFor, idealCZ, idealCNOT, singleQubitUnitary, embed2, eye, rot, czOps,
  cnotOps, singleQubitOps, H2,
};
