// =============================================================================
// jc.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/jc.test.mjs        (or: npm test)
//
// Real-physics validation of the Jaynes-Cummings qubit-boson reservoir engine
// (src/jc.js) and the Fock-basis Wigner function (src/wigner.js). Prints
// PASS/FAIL per test with measured numbers; exits non-zero on any failure.
//
// Reservoir from Das, Giorgi, Zambrini, PRR 8, 023148 (2026).
// =============================================================================

import assert from 'node:assert';
import { create, all } from 'mathjs';
import { JCReservoir } from '../src/jc.js';
import { wignerGrid, wignerIntegral } from '../src/wigner.js';

const math = create(all);
let failures = 0, passes = 0;

function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// Pull the engine's flat ρ into a math.js complex matrix (dim×dim).
function rhoMathMatrix(sys) {
  const DIM = sys.dim, r = sys.rho();
  const IDX = (i, j) => 2 * (i * DIM + j);
  const data = [];
  for (let i = 0; i < DIM; i++) {
    data[i] = [];
    for (let j = 0; j < DIM; j++) {
      const idx = IDX(i, j);
      data[i][j] = math.complex(r[idx], r[idx + 1]);
    }
  }
  return math.matrix(data);
}
function maxHermitianDeviation(M) {
  const data = M.toArray(), DIM = data.length;
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
function traceReal(M) { const t = math.trace(M); return typeof t === 'object' ? t.re : t; }

// Deterministic PRNG so ESP / random-sequence tests are reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Test 1 — Invariants: Tr(ρ)=1, Hermitian, PSD at init, after a driven window,
// and after free decay, at several time points.
// =============================================================================
{
  const sys = new JCReservoir({ regime: 'JC', Nc: 12, chi: 1, kappa: 0.1, deltaA: 1, deltaB: 1, alpha: 0 });
  const checkpoints = [];
  checkpoints.push(['init', rhoMathMatrix(sys)]);
  sys.evolveWindow(0.7, 10);                       // one driven input window
  checkpoints.push(['after driven window', rhoMathMatrix(sys)]);
  sys.setBeta(0);
  sys.step(5);                                     // free decay
  checkpoints.push(['after free decay t=5', rhoMathMatrix(sys)]);
  sys.step(10);
  checkpoints.push(['after free decay t=15', rhoMathMatrix(sys)]);

  let allOk = true, worstTr = 0, worstHerm = 0, worstNeg = 0;
  for (const [label, M] of checkpoints) {
    const tr = traceReal(M);
    const herm = maxHermitianDeviation(M);
    const minEig = minEigenvalue(M);
    worstTr = Math.max(worstTr, Math.abs(tr - 1));
    worstHerm = Math.max(worstHerm, herm);
    worstNeg = Math.min(worstNeg, minEig);
    const ok = Math.abs(tr - 1) < 1e-6 && herm < 1e-9 && minEig > -1e-8;
    if (!ok) { allOk = false; console.log(`      [${label}] tr=${tr}, herm=${herm}, minEig=${minEig}`); }
  }
  report('T1 invariants (Tr=1, Hermitian, PSD) at init/driven/decay',
    allOk, `max|Tr−1|=${worstTr.toExponential(2)}, maxHermDev=${worstHerm.toExponential(2)}, minEig=${worstNeg.toExponential(2)}`);
}

// =============================================================================
// Test 2 — Vacuum Rabi (definitive JC check): undriven (β=0,α=0), resonant,
// NO dissipation (κ=0), start |e,0⟩. ⟨N⟩ oscillates 0↔1 with period π/χ
// (frequency 2χ): ⟨N⟩≈1 at t=π/(2χ), ≈0 at t=π/χ; ⟨σz⟩ anti-correlates.
// Resonance |0,e⟩↔|1,g⟩ requires the two states degenerate; with H = Δ_a σz +
// Δ_b a†a + ... that is 2Δ_a = Δ_b. We use the fully resonant Δ_a=Δ_b=0.
// =============================================================================
{
  const chi = 1;
  const mk = () => { const s = new JCReservoir({ regime: 'JC', Nc: 15, chi, kappa: 0, deltaA: 0, deltaB: 0, alpha: 0 }); s.setFockQubit(0, 'e'); return s; };

  const sHalf = mk(); sHalf.step(Math.PI / (2 * chi));
  const N_half = sHalf.photonNumber(), sz_half = sHalf.sigmaZ();

  const sFull = mk(); sFull.step(Math.PI / chi);
  const N_full = sFull.photonNumber(), sz_full = sFull.sigmaZ();

  // Anti-correlation of ⟨N⟩ and ⟨σz⟩ across a fine sweep + measured period.
  const s = mk();
  let ok = true, prevN = 0;
  const dt = 0.05; let firstPeak = null;
  for (let k = 1; k <= Math.round((Math.PI / chi) / dt); k++) {
    s.step(dt);
    const N = s.photonNumber(), sz = s.sigmaZ();
    // n + (sz+1)/2 conserved (excitation number = 1) ⇒ N ≈ (1−sz)/2.
    if (Math.abs(N - (1 - sz) / 2) > 1e-3) ok = false;
    if (firstPeak === null && N < prevN) firstPeak = (k - 1) * dt;   // peak location
    prevN = N;
  }
  const measuredPeriod = firstPeak !== null ? 2 * firstPeak : NaN;   // half-period at first peak
  const rabiOk = Math.abs(N_half - 1) < 5e-3 && Math.abs(N_full) < 5e-3
    && Math.abs(sz_half + 1) < 5e-3 && Math.abs(sz_full - 1) < 5e-3 && ok
    && Math.abs(measuredPeriod - Math.PI / chi) < 0.1;
  report('T2 vacuum Rabi: ⟨N⟩ 0↔1 at freq 2χ, ⟨σz⟩ anti-correlated',
    rabiOk,
    `N(π/2χ)=${N_half.toFixed(4)} (→1), N(π/χ)=${N_full.toFixed(4)} (→0), ` +
    `σz(π/2χ)=${sz_half.toFixed(4)} (→−1); measured period=${measuredPeriod.toFixed(4)}, π/χ=${(Math.PI / chi).toFixed(4)}`);
}

// =============================================================================
// Test 3 — Cavity decay: prepare ⟨N⟩>0, β=0, α=0, κ>0, χ=0 (no coherent qubit
// exchange). Assert ⟨N⟩(t) ≈ ⟨N⟩₀ e^{−κt} within a few %.
// =============================================================================
{
  const kappa = 0.1, N0 = 2;
  let ok = true, worst = 0;
  for (const t of [1, 2, 4, 8]) {
    const s = new JCReservoir({ regime: 'JC', Nc: 15, chi: 0, kappa, deltaA: 0, deltaB: 1, alpha: 0 });
    s.setFockQubit(2, 'g'); s.setBeta(0);
    s.step(t);
    const N = s.photonNumber(), exp = N0 * Math.exp(-kappa * t);
    const rel = Math.abs(N - exp) / exp;
    worst = Math.max(worst, rel);
    if (rel > 0.02) ok = false;
  }
  report('T3 cavity decay ⟨N⟩(t)=⟨N⟩₀·e^(−κt)', ok, `worst rel.err=${(worst * 100).toFixed(3)}% (< 2%)`);
}

// =============================================================================
// Test 4 — Wigner: ∫W≈1 for vacuum, |1⟩, and a driven state; vacuum min(W)≥−tiny
// (no negativity); Fock |1⟩ has W(0,0)<0 (negativity present).
// =============================================================================
{
  const s = new JCReservoir({ regime: 'JC', Nc: 15 });

  // vacuum
  s.reset();
  let g = wignerGrid(s.rhoBoson(), { xmax: 5, n: 81 });
  const intVac = wignerIntegral(g), minVac = g.min, w00Vac = g.W[40][40];

  // Fock |1⟩
  s.setFockQubit(1, 'g');
  g = wignerGrid(s.rhoBoson(), { xmax: 5, n: 81 });
  const intOne = wignerIntegral(g), w00One = g.W[40][40];

  // driven state (has some photons)
  s.reset(); s.evolveWindow(1.0, 10);
  g = wignerGrid(s.rhoBoson(), { xmax: 6, n: 81 });
  const intDrv = wignerIntegral(g);

  const ok = Math.abs(intVac - 1) < 0.02 && Math.abs(intOne - 1) < 0.02 && Math.abs(intDrv - 1) < 0.03
    && minVac > -1e-6 && w00One < -0.1;
  report('T4 Wigner: ∫W≈1, vacuum≥0, Fock|1⟩ W(0,0)<0 (negativity)',
    ok,
    `∫vac=${intVac.toFixed(4)}, ∫|1⟩=${intOne.toFixed(4)}, ∫driven=${intDrv.toFixed(4)}; ` +
    `min(W_vac)=${minVac.toExponential(2)}, W_|1⟩(0,0)=${w00One.toFixed(4)} (=−1/π=${(-1 / Math.PI).toFixed(4)})`);

  // T4b — the Wigner phase-space AXES must match the physical quadratures
  // (guards against a P-axis sign flip). Drive displaces ⟨X⟩, then free cavity
  // evolution rotates it into ⟨P⟩; the Wigner x/p centroids must equal ⟨X⟩/⟨P⟩.
  const sd = new JCReservoir({ regime: 'JC', Nc: 18, chi: 0, kappa: 0, deltaA: 0, deltaB: 1, alpha: 0 });
  sd.setBeta(0.7); for (let i = 0; i < 30; i++) sd.step(0.03);
  sd.setBeta(0);   for (let i = 0; i < 40; i++) sd.step(0.03);
  const Xexp = sd.quadX(), Pexp = sd.quadP();
  const gd = wignerGrid(sd.rhoBoson(), { xmax: 6, n: 81 });
  const dxc = gd.x[1] - gd.x[0], dpc = gd.p[1] - gd.p[0];
  let xc = 0, pc = 0;
  for (let i = 0; i < gd.n; i++) for (let j = 0; j < gd.n; j++) { xc += gd.x[j] * gd.W[i][j]; pc += gd.p[i] * gd.W[i][j]; }
  xc *= dxc * dpc; pc *= dxc * dpc;
  const axesOk = Math.abs(Pexp) > 0.1 && Math.abs(xc - Xexp) < 0.05 && Math.abs(pc - Pexp) < 0.05;
  report('T4b Wigner x/p axes match physical ⟨X⟩,⟨P⟩ (no axis sign flip)',
    axesOk, `⟨X⟩=${Xexp.toFixed(3)} xc=${xc.toFixed(3)} | ⟨P⟩=${Pexp.toFixed(3)} pc=${pc.toFixed(3)}`);
}

// =============================================================================
// Test 5 — Partial traces: Tr(ρ_boson)=1, Tr(ρ_qubit)=1; |qubitBloch|≤1;
// |g⟩,|e⟩,|+⟩ prep give the expected Bloch vectors.
// =============================================================================
{
  const s = new JCReservoir({ regime: 'JC', Nc: 15 });
  s.evolveWindow(0.6, 10);

  // Tr(ρ_boson) and Tr(ρ_qubit).
  const rb = s.rhoBoson(); const Nc = s.Nc;
  let trB = 0; for (let n = 0; n < Nc; n++) trB += rb[2 * (n * Nc + n)];
  const rq = s.rhoQubit();
  const trQ = rq[0] + rq[2 * (1 * 2 + 1)];
  const bl = s.qubitBloch();
  const mag = Math.hypot(bl.x, bl.y, bl.z);

  // Bloch of prepared qubit states on vacuum. Convention: q=0 |e⟩ (z=+1),
  // q=1 |g⟩ (z=−1), |+⟩ = (|e⟩+|g⟩)/√2 (x=+1). setQubitBloch(theta,phi):
  //   |ψ⟩ = cos(θ/2)|e⟩ + e^{iφ} sin(θ/2)|g⟩.
  const sg = new JCReservoir({ regime: 'JC', Nc: 15 }); sg.setQubitBloch(Math.PI, 0);            // |g⟩
  const se = new JCReservoir({ regime: 'JC', Nc: 15 }); se.setQubitBloch(0, 0);                  // |e⟩
  const sp = new JCReservoir({ regime: 'JC', Nc: 15 }); sp.setQubitBloch(Math.PI / 2, 0);        // |+⟩
  const si = new JCReservoir({ regime: 'JC', Nc: 15 }); si.setQubitBloch(Math.PI / 2, Math.PI / 2); // |+i⟩
  const bg = sg.qubitBloch(), be = se.qubitBloch(), bp = sp.qubitBloch(), bi = si.qubitBloch();

  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const gOk = near(bg.z, -1) && near(bg.x, 0) && near(bg.y, 0);
  const eOk = near(be.z, +1) && near(be.x, 0) && near(be.y, 0);
  const pOk = near(bp.x, +1) && near(bp.z, 0) && near(bp.y, 0);
  const iOk = near(bi.y, +1) && near(bi.x, 0) && near(bi.z, 0);   // σy sign guard

  const ok = Math.abs(trB - 1) < 1e-9 && Math.abs(trQ - 1) < 1e-9 && mag <= 1 + 1e-9 && gOk && eOk && pOk && iOk;
  report('T5 partial traces + qubit Bloch conventions',
    ok,
    `Tr(ρ_b)=${trB.toFixed(6)}, Tr(ρ_q)=${trQ.toFixed(6)}, |bloch(driven)|=${mag.toFixed(4)}≤1; ` +
    `|g⟩→z=${bg.z.toFixed(2)}, |e⟩→z=${be.z.toFixed(2)}, |+⟩→x=${bp.x.toFixed(2)}`);
}

// =============================================================================
// Test 6 — DJC sanity: with α=0 the DJC dynamics keeps ⟨σz⟩ conserved
// (qubit-boson separable per the paper); non-constant when α≠0.
// =============================================================================
{
  const rng = mulberry32(7);
  // α = 0 : ⟨σz⟩ conserved.
  const s0 = new JCReservoir({ regime: 'DJC', Nc: 15, chiP: 1, kappa: 0.1, alpha: 0 });
  s0.setQubitBloch(Math.PI / 2, 0.4);   // superposition (σz=0) on vacuum
  const sz0 = s0.sigmaZ();
  let drift = 0;
  for (let i = 0; i < 8; i++) { s0.evolveWindow(rng(), 6); drift = Math.max(drift, Math.abs(s0.sigmaZ() - sz0)); }

  // α ≠ 0 : ⟨σz⟩ changes.
  const s1 = new JCReservoir({ regime: 'DJC', Nc: 15, chiP: 1, kappa: 0.1, alpha: 1 });
  s1.setQubitBloch(Math.PI / 2, 0.4);
  const sz1i = s1.sigmaZ();
  for (let i = 0; i < 8; i++) s1.evolveWindow(0.5, 6);
  const szChange = Math.abs(s1.sigmaZ() - sz1i);

  const ok = drift < 1e-9 && szChange > 1e-3;
  report('T6 DJC: ⟨σz⟩ conserved when α=0, changes when α≠0',
    ok, `α=0 drift=${drift.toExponential(2)} (≈0); α=1 Δ⟨σz⟩=${szChange.toFixed(4)} (>0)`);
}

// =============================================================================
// Test 7 — Echo-state property (fading memory): two different bosonic initial
// states, after a driven random β-sequence (κ=0.1), converge to a small
// tolerance in ⟨N⟩ and ⟨X⟩ — proving initial-state independence.
// =============================================================================
{
  const rng = mulberry32(2024);
  const NW = 26;
  const seq = Array.from({ length: NW }, () => rng());
  function run(seedFn) {
    const r = new JCReservoir({ regime: 'JC', Nc: 15, chi: 1, kappa: 0.1, deltaA: 1, deltaB: 1, alpha: 0 });
    seedFn(r);
    for (const b of seq) r.evolveWindow(b, 10);
    return { N: r.photonNumber(), X: r.quadX() };
  }
  const a = run((r) => r.reset());                 // |0,g⟩
  const b = run((r) => r.setFockQubit(3, 'e'));    // |3,e⟩ (very different)
  const dN = Math.abs(a.N - b.N), dX = Math.abs(a.X - b.X);
  const ok = dN < 1e-3 && dX < 1e-3;
  report('T7 echo-state property (fading memory) convergence',
    ok, `after ${NW} windows: |ΔN|=${dN.toExponential(2)}, |ΔX|=${dX.toExponential(2)} (< 1e-3)`);
}

// =============================================================================
// Test 8 — Truncation adequacy: for default params the top Fock level stays
// < ~1e-3 over a driven run (Nc=15 is enough).
// =============================================================================
{
  const rng = mulberry32(99);
  const s = new JCReservoir({ regime: 'JC', Nc: 15, chi: 1, kappa: 0.1, deltaA: 1, deltaB: 1, alpha: 0 });
  let maxTop = 0;
  for (let i = 0; i < 20; i++) {
    s.evolveWindow(rng(), 10);
    maxTop = Math.max(maxTop, s.fockPopulations()[s.Nc - 1]);
  }
  const ok = maxTop < 1e-3;
  report('T8 truncation adequacy (top Fock pop < 1e-3, Nc=15)',
    ok, `max top-level population = ${maxTop.toExponential(3)}`);
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
