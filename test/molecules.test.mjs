// =============================================================================
// molecules.test.mjs — n-spin engine + molecule-library validation (node assert).
//
//   node test/molecules.test.mjs   (or: npm test)
//
// Covers:
//   (a) build each molecule: dim=2^n, Tr(ρ)=1 / Hermitian / PSD at init, after a
//       pulse, and after a 0.3 s evolution;
//   (b) DMP & chloroform T1/T2 rates match the verified numbers (exp-decay fit);
//   (c) generalized CZ fidelity >0.999 for DMP (2-spin, no spectator) and the
//       3-spin molecule (regression), relaxation OFF;
//   (d) diagonal-H commutator matches a DENSE-commutator reference to ~1e-10
//       over several steps;
//   (e) populations() sums to 1 for 2-spin and 3-spin systems.
// Prints PASS/FAIL with numbers; exits non-zero on any failure.
// =============================================================================

import { create, all } from 'mathjs';
import { QuantumSpinSystem, flatOps } from '../src/quantum.js';
import { getMolecule, listMolecules, DEFAULT_MOLECULE_ID } from '../src/molecules.js';
import { compileGate } from '../src/gates.js';

const math = create(all);
let passes = 0, failures = 0;
function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// ---- helpers over the engine's math.js ρ -----------------------------------
function traceReal(M) { const t = math.trace(M); return typeof t === 'object' ? t.re : t; }
function maxHermitianDeviation(M, DIM) {
  const data = M.toArray();
  let mx = 0;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const dev = math.abs(math.subtract(data[i][j], math.conj(data[j][i])));
      if (dev > mx) mx = dev;
    }
  return mx;
}
function minEigenvalue(M) {
  const res = math.eigs(M);
  const vals = res.values.toArray().map((v) => (typeof v === 'object' ? v.re : v));
  return Math.min(...vals);
}

// =============================================================================
// (a) Build each molecule; invariants at init / after a pulse / after 0.3 s.
// =============================================================================
for (const { id } of listMolecules()) {
  const mol = getMolecule(id);
  const n = mol.nuclei.length;
  const sys = new QuantumSpinSystem({ molecule: mol, relaxation: true, coupling: true });

  const dimOk = sys.dim === (1 << n) && sys.nSpins === n;
  report(`(a) ${id}: dim=2^n (=${1 << n}) & nSpins=${n}`, dimOk,
    `dim=${sys.dim}, nSpins=${sys.nSpins}`);

  const checkpoints = [['init', sys.rho()]];
  sys.applyPulse(0, Math.PI / 2, 'x');
  checkpoints.push(['after 90x(q0)', sys.rho()]);
  sys.step(0.3, { relaxation: true });
  checkpoints.push(['after 0.3s', sys.rho()]);

  for (const [label, M] of checkpoints) {
    const tr = traceReal(M);
    const herm = maxHermitianDeviation(M, sys.dim);
    const minEig = minEigenvalue(M);
    const ok = Math.abs(tr - 1) < 1e-9 && herm < 1e-9 && minEig > -1e-9;
    report(`(a) ${id} @ ${label}: Tr=1, Hermitian, PSD`, ok,
      `Tr=${tr.toFixed(10)}, max|ρ−ρ†|=${herm.toExponential(2)}, minEig=${minEig.toExponential(2)}`);
  }
}

// =============================================================================
// (b) DMP & chloroform T1/T2 rates match verified numbers (exp-decay fit).
//     Method: zero display offsets & coupling to isolate relaxation. 90x on the
//     target spin → transverse |xy| decays as exp(−t/T2); bz recovers as
//     1−exp(−t/T1). Fit each rate from two well-separated time samples and check
//     within a few percent.
// =============================================================================
function fitRelax(id, spin) {
  const mol = getMolecule(id);
  const sys = new QuantumSpinSystem({ molecule: mol, relaxation: true, coupling: false });
  // Zero display offsets so |xy| decays purely by T2 (no in-plane precession).
  sys.params.nuclei.forEach((nu) => { nu.offset_Hz = 0; });
  sys._buildHamiltonian();
  sys.applyPulse(spin, Math.PI / 2, 'x');

  const { T1, T2 } = mol.nuclei[spin];
  // Sample times: fraction of T2 for transverse; fraction of T1 for recovery.
  const tA = 0.5 * T2, tB = 1.5 * T2;
  sys.step(tA, { relaxation: true });
  const bA = sys.blochVector(spin);
  sys.step(tB - tA, { relaxation: true });
  const bB = sys.blochVector(spin);
  const transA = Math.hypot(bA.x, bA.y), transB = Math.hypot(bB.x, bB.y);
  // exp(−tA/T2)/exp(−tB/T2) = exp((tB−tA)/T2) ⇒ T2fit = (tB−tA)/ln(transA/transB).
  const T2fit = (tB - tA) / Math.log(transA / transB);

  // T1: recovery bz = 1−exp(−t/T1). Use two T1-scaled samples on a fresh system.
  const sys2 = new QuantumSpinSystem({ molecule: mol, relaxation: true, coupling: false });
  sys2.params.nuclei.forEach((nu) => { nu.offset_Hz = 0; });
  sys2._buildHamiltonian();
  sys2.applyPulse(spin, Math.PI / 2, 'x');   // bz=0 initially
  const t1A = 0.3 * T1, t1B = 0.9 * T1;
  sys2.step(t1A, { relaxation: true });
  const z1 = sys2.blochVector(spin).z;
  sys2.step(t1B - t1A, { relaxation: true });
  const z2 = sys2.blochVector(spin).z;
  // 1−bz = exp(−t/T1) ⇒ T1fit = (t1B−t1A)/ln((1−z1)/(1−z2)).
  const T1fit = (t1B - t1A) / Math.log((1 - z1) / (1 - z2));
  return { T1, T2, T1fit, T2fit };
}

for (const [id, spins] of [['dmp', [0, 1]], ['chloroform', [0, 1]]]) {
  const mol = getMolecule(id);
  for (const spin of spins) {
    const { T1, T2, T1fit, T2fit } = fitRelax(id, spin);
    const relT1 = Math.abs(T1fit - T1) / T1;
    const relT2 = Math.abs(T2fit - T2) / T2;
    const ok = relT1 < 0.03 && relT2 < 0.03;
    report(`(b) ${id} ${mol.nuclei[spin].label}: T1/T2 rates match verified`, ok,
      `T1 ${T1fit.toFixed(3)}s vs ${T1}s (${(relT1 * 100).toFixed(2)}%), ` +
      `T2 ${T2fit.toFixed(4)}s vs ${T2}s (${(relT2 * 100).toFixed(2)}%)`);
  }
}

// =============================================================================
// (c) Generalized CZ fidelity >0.999 for DMP (2-spin, NO spectator) and the
//     3-spin molecule (regression), relaxation OFF. Reconstruct the compiled
//     sequence's net unitary and compare to ideal CZ up to global phase.
// =============================================================================
function runOps(sys, ops) {
  for (const op of ops) {
    if (op.kind === 'rf') sys.rfPulse({ spin: op.spin, phase: op.phase, angle: op.angle, omega1: op.omega1 });
    else if (op.kind === 'vz') sys.virtualZ(op.spin, op.angle);
    else if (op.kind === 'ipulse') sys.applyPulse(op.spin, op.angle, op.axis);
    else if (op.kind === 'delay') {
      const had = sys.coupling; if (!had) sys.setCoupling(true);
      sys.step(op.tau); if (!had) sys.setCoupling(false);
    }
  }
}

// Reconstruct the net unitary from a compiled op sequence (relax OFF). Same
// scheme as gates.test.mjs (relative-phase-preserving column extraction).
function reconstructUnitary(mol, ops) {
  const F = flatOps(mol.nuclei.length);
  const { DIM, IDX, zerosF } = F;
  const makeSys = () => new QuantumSpinSystem({ molecule: mol, relaxation: false, coupling: true });
  const REF = 0;
  const U = zerosF();
  {
    const sys = makeSys();
    const rho = zerosF(); rho[IDX(REF, REF)] = 1; sys.rhoM = rho;
    runOps(sys, ops);
    const norm = Math.sqrt(sys.rhoM[IDX(REF, REF)]);
    for (let i = 0; i < DIM; i++) {
      U[IDX(i, REF)] = sys.rhoM[IDX(i, REF)] / norm;
      U[IDX(i, REF) + 1] = sys.rhoM[IDX(i, REF) + 1] / norm;
    }
  }
  // anchor global phase so U[REF,REF] real+.
  {
    const ph = Math.atan2(U[IDX(REF, REF) + 1], U[IDX(REF, REF)]);
    const c = Math.cos(-ph), s = Math.sin(-ph);
    for (let i = 0; i < DIM; i++) {
      const r = U[IDX(i, REF)], m = U[IDX(i, REF) + 1];
      U[IDX(i, REF)] = r * c - m * s;
      U[IDX(i, REF) + 1] = r * s + m * c;
    }
  }
  for (let b = 0; b < DIM; b++) {
    if (b === REF) continue;
    const sys = makeSys();
    const sHalf = 1 / Math.sqrt(2);
    const psi = new Float64Array(2 * DIM);
    psi[2 * REF] = sHalf; psi[2 * b] = sHalf;
    const rho = zerosF();
    for (let i = 0; i < DIM; i++)
      for (let j = 0; j < DIM; j++) {
        rho[IDX(i, j)] = psi[2 * i] * psi[2 * j] + psi[2 * i + 1] * psi[2 * j + 1];
        rho[IDX(i, j) + 1] = psi[2 * i + 1] * psi[2 * j] - psi[2 * i] * psi[2 * j + 1];
      }
    sys.rhoM = rho;
    runOps(sys, ops);
    // extract pure ψ_out (largest-diagonal reference row).
    let r = 0, best = -1;
    for (let i = 0; i < DIM; i++) { const d = sys.rhoM[IDX(i, i)]; if (d > best) { best = d; r = i; } }
    const nrm = Math.sqrt(best);
    const psiOut = new Float64Array(2 * DIM);
    for (let i = 0; i < DIM; i++) {
      psiOut[2 * i] = sys.rhoM[IDX(i, r)] / nrm;
      psiOut[2 * i + 1] = sys.rhoM[IDX(i, r) + 1] / nrm;
    }
    // fix ψ_out global phase against U[:,REF].
    let re = 0, im = 0;
    for (let i = 0; i < DIM; i++) {
      const cr = U[IDX(i, REF)], ci = U[IDX(i, REF) + 1];
      const pr = psiOut[2 * i], pi = psiOut[2 * i + 1];
      re += cr * pr + ci * pi; im += cr * pi - ci * pr;
    }
    const ph = Math.atan2(im, re);
    const c = Math.cos(-ph), s = Math.sin(-ph);
    for (let i = 0; i < DIM; i++) {
      const rr = psiOut[2 * i], mm = psiOut[2 * i + 1];
      psiOut[2 * i] = rr * c - mm * s;
      psiOut[2 * i + 1] = rr * s + mm * c;
    }
    for (let i = 0; i < DIM; i++) {
      U[IDX(i, b)] = Math.sqrt(2) * psiOut[2 * i] - U[IDX(i, REF)];
      U[IDX(i, b) + 1] = Math.sqrt(2) * psiOut[2 * i + 1] - U[IDX(i, REF) + 1];
    }
  }
  return { U, F };
}

function unitaryFidelity(F, Uideal, Ureal) {
  const { DIM, IDX, mmul, daggerF } = F;
  const P = mmul(daggerF(Uideal), Ureal);
  let re = 0, im = 0;
  for (let i = 0; i < DIM; i++) { const d = IDX(i, i); re += P[d]; im += P[d + 1]; }
  return (Math.hypot(re, im) / DIM) ** 2;
}

for (const [id, i, j] of [['dmp', 0, 1], [DEFAULT_MOLECULE_ID, 0, 1], [DEFAULT_MOLECULE_ID, 0, 2]]) {
  const mol = getMolecule(id);
  const compiled = compileGate('CZ', { targets: [i, j], molecule: mol });
  const { U, F } = reconstructUnitary(mol, compiled.ops);
  const fid = unitaryFidelity(F, compiled.idealUnitary, U);
  const nSpec = mol.nuclei.length - 2;
  report(`(c) CZ(${id} ${i},${j}) fidelity>0.999 [${nSpec} spectator${nSpec === 1 ? '' : 's'}]`,
    fid > 0.999, `F=${fid.toFixed(6)}, t=${(compiled.durationSeconds * 1000).toFixed(3)} ms`);
}

// =============================================================================
// (d) Diagonal-H commutator matches a DENSE-commutator reference to ~1e-10 over
//     several steps. Build two identical DMP engines; force one to use the dense
//     path (clear _Hdiagonal). Prepare a nontrivial coherent state, step both,
//     compare ρ elementwise. (Relaxation OFF to isolate the coherent path.)
// =============================================================================
{
  const mol = getMolecule('dmp');
  const sysFast = new QuantumSpinSystem({ molecule: mol, relaxation: false, coupling: true });
  const sysDense = new QuantumSpinSystem({ molecule: mol, relaxation: false, coupling: true });
  // Nontrivial state with off-diagonal coherences: 90y on both spins.
  for (const sys of [sysFast, sysDense]) {
    sys.applyPulse(0, Math.PI / 2, 'y');
    sys.applyPulse(1, Math.PI / 3, 'x');
  }
  // sysFast keeps the diagonal fast path; sysDense forced onto the dense matmul.
  sysDense._Hdiagonal = false;

  let maxErr = 0;
  for (let step = 0; step < 8; step++) {
    sysFast.step(0.002);
    sysDense.step(0.002);
    for (let n = 0; n < sysFast.mlen; n++) {
      const e = Math.abs(sysFast.rhoM[n] - sysDense.rhoM[n]);
      if (e > maxErr) maxErr = e;
    }
  }
  report('(d) diagonal-H commutator ≈ dense reference (~1e-10)', maxErr < 1e-10,
    `max|Δρ|=${maxErr.toExponential(3)} over 8 steps`);
}

// =============================================================================
// (e) populations() sums to 1 for a 2-spin and a 3-spin system (after a pulse +
//     evolution, relaxation ON).
// =============================================================================
for (const id of ['dmp', DEFAULT_MOLECULE_ID]) {
  const mol = getMolecule(id);
  const sys = new QuantumSpinSystem({ molecule: mol, relaxation: true, coupling: true });
  sys.applyPulse('all', Math.PI / 2, 'x');
  sys.step(0.1, { relaxation: true });
  const p = sys.populations();
  const sum = p.reduce((a, b) => a + b, 0);
  report(`(e) ${id} populations() sum=1 (${p.length} bars)`, Math.abs(sum - 1) < 1e-9,
    `Σp=${sum.toFixed(12)}`);
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
