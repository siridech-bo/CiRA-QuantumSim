// =============================================================================
// ideal-sim.js — a PURE statevector reference simulator.
//
// Multiplies the ideal gate unitaries (from gates.js) to compute the expected
// output distribution of a circuit with NO physics (no timing, no relaxation,
// no coupling delays). Used ONLY to VALIDATE the real density-matrix engine and
// to cross-check the projection-probability histogram. It is NEVER the app's
// physics.
//
// State: a 2^n-vector of complex amplitudes (Float64Array length 2·2^n,
// [re,im]), basis b = Σ q_k·2^(n−1−k) with |0…0⟩ = index 0. Defaults to n=3
// (DIM=8) for backward compatibility; pass a dim to size for other molecules.
// =============================================================================

import { compileGate, _gatesInternal } from './gates.js';
import { _internal } from './quantum.js';

const { DIM: DIM3, IDX: IDX3 } = _internal;
const IDXof = (DIM) => (i, j) => 2 * (i * DIM + j);

// Fresh |0…0⟩ state vector for a dim-sized register (default 8).
export function zeroState(dim = DIM3) {
  const v = new Float64Array(2 * dim);
  v[0] = 1;
  return v;
}

// Apply a flat dim×dim unitary U to state vector v → new vector. dim inferred
// from v's length (v has 2·dim entries).
export function applyU(U, v) {
  const dim = v.length / 2;
  const IDX = IDXof(dim);
  const out = new Float64Array(2 * dim);
  for (let i = 0; i < dim; i++) {
    let re = 0, im = 0;
    for (let k = 0; k < dim; k++) {
      const u = IDX(i, k);
      const ur = U[u], ui = U[u + 1];
      const vr = v[2 * k], vi = v[2 * k + 1];
      re += ur * vr - ui * vi;
      im += ur * vi + ui * vr;
    }
    out[2 * i] = re; out[2 * i + 1] = im;
  }
  return out;
}

// Run a circuit (array of columns of gate specs) on |0…0⟩ using ideal unitaries.
// `molecule` sizes the register (defaults to the 3-spin SpinQ demo).
// Returns { state, probs } where probs[b] = |amp_b|².
export function simulateIdeal(circuit, molecule) {
  const n = molecule ? molecule.nuclei.length : 3;
  const dim = 1 << n;
  let v = zeroState(dim);
  for (const column of circuit) {
    for (const g of column) {
      const { idealUnitary } = compileGate(g.name, { targets: g.targets, angle: g.angle, molecule });
      v = applyU(idealUnitary, v);
    }
  }
  const probs = new Array(dim);
  for (let b = 0; b < dim; b++) probs[b] = v[2 * b] ** 2 + v[2 * b + 1] ** 2;
  return { state: v, probs };
}

export { _gatesInternal };
