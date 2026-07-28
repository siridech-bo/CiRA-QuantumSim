// =============================================================================
// ideal-sim.js — a PURE statevector reference simulator.
//
// Multiplies the ideal gate unitaries (from gates.js) to compute the expected
// output distribution of a circuit with NO physics (no timing, no relaxation,
// no coupling delays). Used ONLY to VALIDATE the real density-matrix engine and
// to cross-check the projection-probability histogram. It is NEVER the app's
// physics.
//
// State: an 8-vector of complex amplitudes (Float64Array length 16, [re,im]),
// basis b = 4·q0 + 2·q1 + q2 with |000⟩ = index 0.
// =============================================================================

import { compileGate, _gatesInternal } from './gates.js';
import { _internal } from './quantum.js';

const { DIM, IDX } = _internal;

// Fresh |000⟩ state vector.
export function zeroState() {
  const v = new Float64Array(2 * DIM);
  v[0] = 1;   // amplitude of |000⟩
  return v;
}

// Apply a flat 8x8 unitary U to state vector v → new vector.
export function applyU(U, v) {
  const out = new Float64Array(2 * DIM);
  for (let i = 0; i < DIM; i++) {
    let re = 0, im = 0;
    for (let k = 0; k < DIM; k++) {
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

// Run a circuit (array of columns of gate specs) on |000⟩ using ideal unitaries.
// Returns { state, probs } where probs[b] = |amp_b|².
export function simulateIdeal(circuit) {
  let v = zeroState();
  for (const column of circuit) {
    for (const g of column) {
      const { idealUnitary } = compileGate(g.name, { targets: g.targets, angle: g.angle });
      v = applyU(idealUnitary, v);
    }
  }
  const probs = new Array(DIM);
  for (let b = 0; b < DIM; b++) probs[b] = v[2 * b] ** 2 + v[2 * b + 1] ** 2;
  return { state: v, probs };
}

export { _gatesInternal };
