// =============================================================================
// gates.test.mjs — validates the gate compiler + runner against the REAL engine.
//
//   node test/gates.test.mjs
//
// Relaxation OFF unless a test says otherwise. Prints PASS/FAIL with measured
// fidelities and gate durations; exits non-zero on any failure.
//
// Verification strategy: single-qubit gates & CZ are checked by state/operator
// fidelity vs. the IDEAL unitaries. CNOT via truth table + Bell state. The
// histogram cross-check compares engine populations() to the pure-statevector
// reference simulator. A decoherence check (relax ON) proves timing is physical.
// =============================================================================

import assert from 'node:assert';
import { QuantumSpinSystem, _internal } from '../src/quantum.js';
import { compileGate, compileCircuit, _gatesInternal } from '../src/gates.js';
import { simulateIdeal, zeroState, applyU } from '../src/ideal-sim.js';

const { DIM, IDX, zerosF, mmul, daggerF } = _internal;
const PI = Math.PI;
let passes = 0, failures = 0;

function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// ---- flat-matrix / statevector helpers --------------------------------------
function matVec(U, v) { return applyU(U, v); }

// State fidelity |⟨ψ_ideal|ψ_real⟩|² for two 8-vectors (Float64 [re,im]).
function stateFidelity(a, b) {
  let re = 0, im = 0;
  for (let k = 0; k < DIM; k++) {
    const ar = a[2 * k], ai = a[2 * k + 1];  // conj(a)
    const br = b[2 * k], bi = b[2 * k + 1];
    re += ar * br + ai * bi;
    im += ar * bi - ai * br;
  }
  return re * re + im * im;
}

// Extract the engine's density matrix as a flat complex 8x8 (Float64 [re,im]).
function rhoFlat(sys) { return Float64Array.from(sys.rhoM); }

// ⟨ψ|ρ|ψ⟩ fidelity between a pure ideal state vector ψ and engine ρ.
function statePurityFidelity(psi, rho) {
  // F = ψ† ρ ψ = Σ_ij conj(ψ_i) ρ_ij ψ_j
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++) {
    const pir = psi[2 * i], pii = psi[2 * i + 1];
    for (let j = 0; j < DIM; j++) {
      const idx = IDX(i, j);
      const rr = rho[idx], ri = rho[idx + 1];
      const vjr = psi[2 * j], vji = psi[2 * j + 1];
      // conj(psi_i) * rho_ij * psi_j
      // conj(psi_i) = (pir, -pii)
      const t1r = pir * rr + pii * ri;   // (pir - i pii)(rr + i ri) real
      const t1i = pir * ri - pii * rr;   // imag
      re += t1r * vjr - t1i * vji;
      im += t1r * vji + t1i * vjr;
    }
  }
  return re;   // ρ Hermitian ⇒ real
}

// Prepare a chosen single-qubit input state on `spin`, others |0⟩, into a fresh
// engine (as a pure |ψ⟩⟨ψ|). Returns { sys, psi } where psi is the full 8-vec.
function prepInput(spin, which) {
  const sys = new QuantumSpinSystem({ relaxation: false, coupling: false });
  // single-qubit amplitudes for the target
  let a0, a1; // |0>, |1>
  const s = 1 / Math.sqrt(2);
  if (which === '0')      { a0 = [1, 0]; a1 = [0, 0]; }
  else if (which === '1') { a0 = [0, 0]; a1 = [1, 0]; }
  else if (which === '+') { a0 = [s, 0]; a1 = [s, 0]; }
  else if (which === '+i'){ a0 = [s, 0]; a1 = [0, s]; }
  // Build full 8-vector: target spin amp ⊗ |0⟩ on the others.
  const psi = new Float64Array(2 * DIM);
  for (let b = 0; b < DIM; b++) {
    const bit = (b >> (2 - spin)) & 1;
    // other two qubits must be 0
    const others = b & ~(1 << (2 - spin));
    if (others !== 0) continue;
    const amp = bit === 0 ? a0 : a1;
    psi[2 * b] = amp[0]; psi[2 * b + 1] = amp[1];
  }
  // Set engine ρ = |ψ⟩⟨ψ|.
  const rho = zerosF();
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const pir = psi[2 * i], pii = psi[2 * i + 1];
      const pjr = psi[2 * j], pji = psi[2 * j + 1];
      // psi_i * conj(psi_j)
      const re = pir * pjr + pii * pji;
      const im = pii * pjr - pir * pji;
      rho[IDX(i, j)] = re; rho[IDX(i, j) + 1] = im;
    }
  sys.rhoM = rho;
  return { sys, psi };
}

// Execute a compiled gate's primitive ops on an engine (relax as set).
// rf → engine.rfPulse; vz → engine.virtualZ; delay → engine.step (coupling ON).
function runOps(sys, ops) {
  const prevCoupling = sys.coupling;
  for (const op of ops) {
    if (op.kind === 'rf') {
      sys.rfPulse({ spin: op.spin, phase: op.phase, angle: op.angle, omega1: op.omega1 });
    } else if (op.kind === 'vz') {
      sys.virtualZ(op.spin, op.angle);
    } else if (op.kind === 'ipulse') {
      sys.applyPulse(op.spin, op.angle, op.axis);
    } else if (op.kind === 'delay') {
      const had = sys.coupling;
      if (!had) sys.setCoupling(true);
      sys.step(op.tau);
      if (!had) sys.setCoupling(false);
    }
  }
  sys.setCoupling(prevCoupling);
}

// =============================================================================
// Test 1: single-qubit gates on {|0⟩,|1⟩,|+⟩,|+i⟩}, state fidelity vs ideal.
// =============================================================================
{
  const gates = [
    ['I', null], ['X', null], ['Y', null], ['Z', null],
    ['SX', null], ['SY', null], ['SZ', null], ['H', null],
    ['Rx', 0.7], ['Ry', 1.3], ['Rz', 2.1],
  ];
  const inputs = ['0', '1', '+', '+i'];
  const spin = 0; // ¹H
  for (const [name, angle] of gates) {
    let minF = 1;
    for (const which of inputs) {
      const { sys, psi } = prepInput(spin, which);
      const compiled = compileGate(name, { targets: [spin], angle: angle ?? PI / 2 });
      const idealPsi = matVec(compiled.idealUnitary, psi);
      runOps(sys, compiled.ops);
      const F = statePurityFidelity(idealPsi, rhoFlat(sys));
      minF = Math.min(minF, F);
    }
    report(`T1 single-qubit ${name}${angle != null ? `(${angle})` : ''} fidelity>0.999`,
      minF > 0.999, `min F=${minF.toFixed(6)}`);
  }
}

// =============================================================================
// Test 2: virtual-Z correctness — Rz(θ) matches exp(−iθσz/2) on several θ.
// =============================================================================
{
  let ok = true; const detail = [];
  for (const theta of [0.3, 1.0, PI / 2, PI, 2.5]) {
    const { sys, psi } = prepInput(0, '+');   // Rz acts nontrivially on |+⟩
    const compiled = compileGate('Rz', { targets: [0], angle: theta });
    const idealPsi = matVec(compiled.idealUnitary, psi);
    runOps(sys, compiled.ops);
    const F = statePurityFidelity(idealPsi, rhoFlat(sys));
    detail.push(`θ=${theta.toFixed(2)}:F=${F.toFixed(6)}`);
    if (F < 0.999999) ok = false;
  }
  report('T2 virtual-Z Rz(θ)=exp(−iθσz/2)', ok, detail.join(' '));
}

// =============================================================================
// Test 3: CZ(i,j) for all three pairs. Reconstruct the compiled sequence's net
// unitary by evolving each of the 8 computational basis states (relax OFF), then
// compare to ideal CZ_{ij}⊗I_s up to global phase. Print fidelity + duration.
// =============================================================================
function reconstructUnitary(makeSys, ops) {
  // Build the compiled sequence's net 8x8 unitary column by column, with a
  // CONSISTENT global phase across columns. For each basis state b (except a
  // fixed reference REF), prepare the superposition (|REF⟩+|b⟩)/√2, run the ops,
  // and read the two amplitudes U[:,REF] and U[:,b] out of the pure ρ. Because
  // both share the same evolution, their RELATIVE phase is preserved — which is
  // exactly what a diagonal gate like CZ needs. We anchor the global phase so
  // U[REF,REF] is real-positive.
  const REF = 0;
  const U = zerosF();
  // First get U[:,REF] alone from |REF⟩.
  {
    const sys = makeSys();
    const rho = zerosF(); rho[IDX(REF, REF)] = 1; sys.rhoM = rho;
    runOps(sys, ops);
    // pure state ψ: ψ_i = ρ_{i,REF}/sqrt(ρ_{REF,REF}); anchor ψ_REF real+.
    readColumn(sys, REF, U, REF);
  }
  anchorGlobalPhase(U, REF, REF);
  for (let b = 0; b < DIM; b++) {
    if (b === REF) continue;
    const sys = makeSys();
    // prepare (|REF⟩+|b⟩)/√2 as a pure density matrix.
    const s = 1 / Math.sqrt(2);
    const psi = new Float64Array(2 * DIM);
    psi[2 * REF] = s; psi[2 * b] = s;
    const rho = zerosF();
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        rho[IDX(i, j)] = psi[2 * i] * psi[2 * j] + psi[2 * i + 1] * psi[2 * j + 1];
        rho[IDX(i, j) + 1] = psi[2 * i + 1] * psi[2 * j] - psi[2 * i] * psi[2 * j + 1];
      }
    sys.rhoM = rho;
    runOps(sys, ops);
    // Read U[:,b]: ψ_out = U·(|REF⟩+|b⟩)/√2 = (U[:,REF]+U[:,b])/√2.
    // From pure ρ, ψ_out_i = ρ_{i,k}/conj(ψ_out_k) for a well-populated k.
    // Pick reference row k = REF (its amplitude includes U[REF,REF]≈known).
    // Extract full ψ_out with global phase fixed by matching U[REF,REF].
    const psiOut = extractPure(sys);
    // psiOut has an unknown global phase e^{iφ}. Fix φ by requiring the REF-row
    // overlap with the known column: component along U[:,REF]. Simplest: rotate
    // so that ⟨U[:,REF]| ψ_out⟩ is real-positive (that inner product should be
    // 1/√2 for a unitary). Then U[:,b] = √2·ψ_out − U[:,REF].
    fixPhaseAgainstColumn(psiOut, U, REF);
    for (let i = 0; i < DIM; i++) {
      const outR = Math.sqrt(2) * psiOut[2 * i] - U[IDX(i, REF)];
      const outI = Math.sqrt(2) * psiOut[2 * i + 1] - U[IDX(i, REF) + 1];
      U[IDX(i, b)] = outR; U[IDX(i, b) + 1] = outI;
    }
  }
  return U;
}

// Read column `col` of U from a pure ρ = |ψ⟩⟨ψ| where ψ = U|refBasis⟩.
function readColumn(sys, refBasis, U, col) {
  const norm = Math.sqrt(sys.rhoM[IDX(refBasis, refBasis)]);
  for (let i = 0; i < DIM; i++) {
    U[IDX(i, col)] = sys.rhoM[IDX(i, refBasis)] / norm;
    U[IDX(i, col) + 1] = sys.rhoM[IDX(i, refBasis) + 1] / norm;
  }
}

// Extract the pure state ψ from ρ=|ψ⟩⟨ψ| (up to global phase): use the row with
// the largest diagonal as reference and read that column of ρ.
function extractPure(sys) {
  let r = 0, best = -1;
  for (let i = 0; i < DIM; i++) { const d = sys.rhoM[IDX(i, i)]; if (d > best) { best = d; r = i; } }
  const norm = Math.sqrt(best);
  const psi = new Float64Array(2 * DIM);
  for (let i = 0; i < DIM; i++) {
    psi[2 * i] = sys.rhoM[IDX(i, r)] / norm;
    psi[2 * i + 1] = sys.rhoM[IDX(i, r) + 1] / norm;
  }
  return psi;
}

function anchorGlobalPhase(U, row, col) {
  const re = U[IDX(row, col)], im = U[IDX(row, col) + 1];
  const ph = Math.atan2(im, re);
  const c = Math.cos(-ph), s = Math.sin(-ph);
  for (let i = 0; i < DIM; i++) {
    const r = U[IDX(i, col)], m = U[IDX(i, col) + 1];
    U[IDX(i, col)] = r * c - m * s;
    U[IDX(i, col) + 1] = r * s + m * c;
  }
}

// Rotate ψ's global phase so ⟨col|ψ⟩ (col of U) is real-positive.
function fixPhaseAgainstColumn(psi, U, col) {
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++) {
    const cr = U[IDX(i, col)], ci = U[IDX(i, col) + 1]; // conj
    const pr = psi[2 * i], pi = psi[2 * i + 1];
    re += cr * pr + ci * pi;
    im += cr * pi - ci * pr;
  }
  const ph = Math.atan2(im, re);
  const c = Math.cos(-ph), s = Math.sin(-ph);
  for (let i = 0; i < DIM; i++) {
    const r = psi[2 * i], m = psi[2 * i + 1];
    psi[2 * i] = r * c - m * s;
    psi[2 * i + 1] = r * s + m * c;
  }
}

// Operator fidelity up to global phase between two unitaries (flat 8x8):
//   F = |Tr(U_ideal† U_real)| / DIM  (then squared for a "fidelity").
function unitaryFidelity(Uideal, Ureal) {
  const Ud = daggerF(Uideal);
  const P = mmul(Ud, Ureal);
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += P[d]; im += P[d + 1]; }
  const absTr = Math.hypot(re, im);
  return (absTr / DIM) ** 2;
}

{
  const pairs = [[0, 2, 'H-F'], [0, 1, 'H-P'], [1, 2, 'P-F']];
  for (const [i, j, label] of pairs) {
    const compiled = compileGate('CZ', { targets: [i, j] });
    const makeSys = () => new QuantumSpinSystem({ relaxation: false, coupling: true });
    const Ureal = reconstructUnitary(makeSys, compiled.ops);
    const F = unitaryFidelity(compiled.idealUnitary, Ureal);
    report(`T3 CZ(${label}) fidelity>0.999`, F > 0.999,
      `F=${F.toFixed(6)}, t=${(compiled.durationSeconds * 1000).toFixed(3)} ms`);
  }
}

// =============================================================================
// Test 4: CNOT truth table (one pair) + Bell state from H+CNOT.
// =============================================================================
{
  // CNOT(control=0 (H), target=2 (F)). Truth table on basis inputs.
  const c = 0, g = 2;
  const compiled = compileGate('CNOT', { targets: [c, g] });
  const cases = [
    // [input q0 q1 q2, expected q0 q1 q2]
    [[0, 0, 0], [0, 0, 0]],
    [[1, 0, 0], [1, 0, 1]],   // control=1 flips target
    [[1, 0, 1], [1, 0, 0]],
    [[0, 0, 1], [0, 0, 1]],   // control=0 leaves target
  ];
  let ok = true; const detail = [];
  for (const [inp, exp] of cases) {
    const sys = new QuantumSpinSystem({ relaxation: false, coupling: true });
    const bIn = 4 * inp[0] + 2 * inp[1] + inp[2];
    const rho = zerosF(); rho[IDX(bIn, bIn)] = 1; sys.rhoM = rho;
    runOps(sys, compiled.ops);
    const pops = sys.populations();
    const bExp = 4 * exp[0] + 2 * exp[1] + exp[2];
    const p = pops[bExp];
    detail.push(`${inp.join('')}→P[${exp.join('')}]=${p.toFixed(4)}`);
    if (p < 0.99) ok = false;
  }
  report('T4 CNOT(H,F) truth table', ok, detail.join(' '));

  // Bell: H on control(0) then CNOT(0,2) → (|000⟩+|101⟩)/√2. ρ fidelity>0.99.
  const sys = new QuantumSpinSystem({ relaxation: false, coupling: true });
  runOps(sys, compileGate('H', { targets: [0] }).ops);
  runOps(sys, compiled.ops);
  const bell = new Float64Array(2 * DIM);
  const s = 1 / Math.sqrt(2);
  bell[2 * 0] = s;       // |000>
  bell[2 * 5] = s;       // |101>
  const F = statePurityFidelity(bell, rhoFlat(sys));
  report('T4 Bell H(0)+CNOT(0,2) fidelity>0.99', F > 0.99, `F=${F.toFixed(6)}`);
}

// =============================================================================
// Test 5: histogram cross-check — engine populations() (relax off) match the
// ideal statevector distribution within 1e-3, for a few small circuits.
// =============================================================================
{
  const circuits = [
    // circuit = array of columns; each column = array of gate specs.
    [[{ name: 'H', targets: [0] }]],
    [[{ name: 'X', targets: [1] }], [{ name: 'H', targets: [2] }]],
    [[{ name: 'H', targets: [0] }], [{ name: 'CNOT', targets: [0, 2] }]],
  ];
  circuits.forEach((circ, idx) => {
    const { probs } = simulateIdeal(circ);
    const sys = new QuantumSpinSystem({ relaxation: false, coupling: true });
    const { schedule } = compileCircuit(circ);
    runOps(sys, schedule);
    const pops = sys.populations();
    let mx = 0;
    for (let b = 0; b < DIM; b++) mx = Math.max(mx, Math.abs(pops[b] - probs[b]));
    report(`T5 histogram circuit#${idx + 1} matches ideal (<1e-3)`, mx < 1e-3,
      `max|Δp|=${mx.toExponential(3)}`);
  });
}

// =============================================================================
// Test 6: real-decoherence check (relax ON). (a) Bell fidelity lower with relax
// on than off. (b) CZ(H,P) (slow, 11.9 ms) loses MORE fidelity than CZ(H,F)
// (fast, 2.3 ms). Proves timing/decoherence is physical.
// =============================================================================
{
  // (a) Bell relax on vs off.
  function bellFidelity(relax) {
    const sys = new QuantumSpinSystem({ relaxation: relax, coupling: true });
    runOpsRelax(sys, compileGate('H', { targets: [0] }).ops, relax);
    runOpsRelax(sys, compileGate('CNOT', { targets: [0, 2] }).ops, relax);
    const bell = new Float64Array(2 * DIM);
    const s = 1 / Math.sqrt(2);
    bell[0] = s; bell[2 * 5] = s;
    return statePurityFidelity(bell, rhoFlat(sys));
  }
  const Foff = bellFidelity(false);
  const Fon = bellFidelity(true);
  report('T6a Bell fidelity(relax ON) < fidelity(relax OFF)', Fon < Foff,
    `off=${Foff.toFixed(6)} on=${Fon.toFixed(6)} Δ=${(Foff - Fon).toExponential(3)}`);

  // (b) CZ fidelity loss: H-P (slow) vs H-F (fast).
  function czFidelityLoss(i, j) {
    const compiled = compileGate('CZ', { targets: [i, j] });
    // input |11⟩ on i,j (the state CZ phases) as a superposition to expose loss:
    // use |+⟩ on both i,j so CZ produces entanglement whose fidelity is sensitive.
    function run(relax) {
      const sys = new QuantumSpinSystem({ relaxation: relax, coupling: true });
      // prepare |+⟩_i |+⟩_j |0⟩_s
      runOpsRelax(sys, compileGate('H', { targets: [i] }).ops, relax);
      runOpsRelax(sys, compileGate('H', { targets: [j] }).ops, relax);
      runOpsRelax(sys, compiled.ops, relax);
      return sys;
    }
    // ideal final state from ideal unitaries
    let v = zeroState();
    v = applyU(compileGate('H', { targets: [i] }).idealUnitary, v);
    v = applyU(compileGate('H', { targets: [j] }).idealUnitary, v);
    v = applyU(compiled.idealUnitary, v);
    const sysOn = run(true);
    return statePurityFidelity(v, rhoFlat(sysOn));
  }
  const Fhp = czFidelityLoss(0, 1);  // H-P slow 11.9 ms
  const Fhf = czFidelityLoss(0, 2);  // H-F fast 2.3 ms
  report('T6b CZ(H-P) slow loses MORE fidelity than CZ(H-F) fast', Fhp < Fhf,
    `F(H-P)=${Fhp.toFixed(6)} F(H-F)=${Fhf.toFixed(6)}`);
}

// runOps variant honoring the relax flag (delays keep coupling ON).
function runOpsRelax(sys, ops, relax) {
  sys.setRelaxation(relax);
  for (const op of ops) {
    if (op.kind === 'rf') {
      sys.rfPulse({ spin: op.spin, phase: op.phase, angle: op.angle, omega1: op.omega1 });
    } else if (op.kind === 'vz') {
      sys.virtualZ(op.spin, op.angle);
    } else if (op.kind === 'ipulse') {
      sys.applyPulse(op.spin, op.angle, op.axis);
    } else if (op.kind === 'delay') {
      const had = sys.coupling; if (!had) sys.setCoupling(true);
      sys.step(op.tau);
      if (!had) sys.setCoupling(false);
    }
  }
}

// =============================================================================
// Test 7: timing — compiled two-qubit gate durations ≈ 1/(2J) (± pulse widths).
// =============================================================================
{
  const pairs = [[0, 2, 'H-F', 220], [0, 1, 'H-P', 42], [1, 2, 'P-F', 430]];
  let ok = true; const detail = [];
  for (const [i, j, label, J] of pairs) {
    const compiled = compileGate('CZ', { targets: [i, j] });
    const tExpected = 1 / (2 * J);
    // duration includes the spectator π (one full π pulse ≈ π/omega1) worth of RF.
    const diff = Math.abs(compiled.durationSeconds - tExpected);
    const pulseWidth = PI / (2 * Math.PI * 3000);  // one π pulse width
    const okPair = diff < 3 * pulseWidth;
    detail.push(`${label}: t=${(compiled.durationSeconds * 1000).toFixed(3)}ms (1/2J=${(tExpected * 1000).toFixed(3)}ms)`);
    if (!okPair) ok = false;
  }
  report('T7 CZ durations ≈ 1/(2J)', ok, detail.join(' | '));
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
