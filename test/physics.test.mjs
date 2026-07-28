// =============================================================================
// physics.test.mjs — runnable node test suite (no framework; node:assert).
//
//   node test/physics.test.mjs      (or: npm test)
//
// Asserts the real quantum engine's core invariants + quantitative physics.
// Prints PASS/FAIL per test with measured numbers; exits non-zero on any fail.
// =============================================================================

import assert from 'node:assert';
import { create, all } from 'mathjs';
import { QuantumSpinSystem, SPINQ_PARAMS } from '../src/quantum.js';

const math = create(all);
const DIM = 8;
let failures = 0;
let passes = 0;

function report(name, ok, detail) {
  if (ok) { passes++; console.log(`PASS  ${name}${detail ? '  —  ' + detail : ''}`); }
  else    { failures++; console.log(`FAIL  ${name}${detail ? '  —  ' + detail : ''}`); }
}

// ---- helpers to inspect ρ (pull the math.js matrix out of the engine) -------
function rhoMathMatrix(sys) { return sys.rho(); }

function maxHermitianDeviation(M) {
  // max |M − M†|
  const data = M.toArray();
  let mx = 0;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const a = data[i][j];
      const b = data[j][i];
      const dev = math.abs(math.subtract(a, math.conj(b)));
      if (dev > mx) mx = dev;
    }
  return mx;
}

function minEigenvalue(M) {
  // ρ is Hermitian; eigenvalues are real. Use math.eigs.
  const res = math.eigs(M);
  const vals = res.values.toArray().map((v) => (typeof v === 'object' ? v.re : v));
  return Math.min(...vals);
}

function traceReal(M) {
  const t = math.trace(M);
  return typeof t === 'object' ? t.re : t;
}

// =============================================================================
// Test 1–3: Tr(ρ)=1, Hermitian, PSD  at init / after 90x / after 0.5s w/ relax.
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: true, coupling: true });

  const checkpoints = [];
  checkpoints.push(['init', rhoMathMatrix(sys)]);

  sys.applyPulse(0, Math.PI / 2, 'x'); // 90x on H
  checkpoints.push(['after 90x(H)', rhoMathMatrix(sys)]);

  sys.step(0.5, { relaxation: true }); // 0.5 s evolution with relaxation
  checkpoints.push(['after 0.5s relax', rhoMathMatrix(sys)]);

  for (const [label, M] of checkpoints) {
    const tr = traceReal(M);
    report(`T1 Tr(ρ)=1 @ ${label}`, Math.abs(tr - 1) < 1e-9, `Tr=${tr.toFixed(12)}`);

    const herm = maxHermitianDeviation(M);
    report(`T2 Hermitian @ ${label}`, herm < 1e-9, `max|ρ−ρ†|=${herm.toExponential(3)}`);

    const minEig = minEigenvalue(M);
    report(`T3 PSD @ ${label}`, minEig > -1e-9, `min eig=${minEig.toExponential(3)}`);
  }
}

// =============================================================================
// Test 4: Unitary evolution (relaxation OFF) preserves purity Tr(ρ²)=1 and
// |Bloch|=1 over 0.3 s after a 90x pulse on H.
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: false, coupling: true });
  sys.applyPulse(0, Math.PI / 2, 'x');
  sys.step(0.3, { relaxation: false });

  const pur = sys.purity();
  report('T4 purity Tr(ρ²)=1 (unitary)', Math.abs(pur - 1) < 1e-6, `Tr(ρ²)=${pur.toFixed(9)}`);

  // |Bloch| of H should stay 1 (pure single-spin state, unentangled here since
  // ZZ coupling with an all-up partner only adds a z-phase → H stays on Bloch
  // sphere surface). Check all three spins' |Bloch|.
  let okAll = true, detail = [];
  for (let k = 0; k < 3; k++) {
    const b = sys.blochVector(k);
    const mag = Math.hypot(b.x, b.y, b.z);
    detail.push(`|b${k}|=${mag.toFixed(6)}`);
    if (Math.abs(mag - 1) > 1e-6) okAll = false;
  }
  report('T4 |Bloch|=1 (unitary)', okAll, detail.join(' '));
}

// =============================================================================
// Test 5: 90x on equilibrium single spin gives Bloch ≈ (0, −1, 0).
//   Derivation: start |0>, Bloch (0,0,+1). U=exp(−i(π/4)σx) rotates the Bloch
//   vector +90° about x (right-handed): y'=y cosα − z sinα, z'=y sinα + z cosα.
//   With α=π/2, (0,0,1) → y=−sin(π/2)=−1, z=cos(π/2)=0  ⇒ (0, −1, 0).
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: false, coupling: false });
  sys.applyPulse(0, Math.PI / 2, 'x'); // H only
  const b = sys.blochVector(0);
  const ok = Math.abs(b.x - 0) < 1e-9 && Math.abs(b.y - (-1)) < 1e-9 && Math.abs(b.z - 0) < 1e-9;
  report('T5 90x(H) → (0,−1,0)', ok,
    `b=(${b.x.toFixed(6)}, ${b.y.toFixed(6)}, ${b.z.toFixed(6)})`);
}

// =============================================================================
// Test 6: Quantitative relaxation. After 90x on H, transverse magnitude decays
// as exp(−t/T2_H) and bz recovers as 1 − exp(−t/T1_H). Coupling OFF and offset
// set to 0 to isolate relaxation from precession/coupling mixing. We rebuild a
// dedicated system with H offset zeroed for a clean comparison.
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: true, coupling: false });
  // Zero the display offsets so transverse magnitude = |Bloch_xy| decays purely
  // by T2 (precession only rotates within the xy-plane, magnitude unaffected —
  // but zeroing keeps the comparison unambiguous). Rebuild H.
  sys.params.nuclei.forEach((n) => { n.offset_Hz = 0; });
  sys._buildHamiltonian();

  sys.applyPulse(0, Math.PI / 2, 'x'); // H → (0,−1,0)

  const T1 = SPINQ_PARAMS.nuclei[0].T1; // 5.0
  const T2 = SPINQ_PARAMS.nuclei[0].T2; // 0.20
  const samples = [0.05, 0.10, 0.20];
  let okDecay = true, okRecov = true;
  const detail = [];
  let tPrev = 0;
  for (const t of samples) {
    sys.step(t - tPrev, { relaxation: true });
    tPrev = t;
    const b = sys.blochVector(0);
    const trans = Math.hypot(b.x, b.y);
    const expTrans = Math.exp(-t / T2);
    const expBz = 1 - Math.exp(-t / T1);
    const relTrans = Math.abs(trans - expTrans) / expTrans;
    const relBz = Math.abs(b.z - expBz) / Math.max(1e-6, expBz);
    detail.push(`t=${t}: |xy|=${trans.toFixed(4)}(exp ${expTrans.toFixed(4)}), bz=${b.z.toFixed(4)}(exp ${expBz.toFixed(4)})`);
    if (relTrans > 0.03) okDecay = false;  // within 3%
    if (relBz > 0.05) okRecov = false;     // within 5% (bz small, more sensitive)
  }
  report('T6 transverse decay ≈ exp(−t/T2)', okDecay, detail.join(' | '));
  report('T6 bz recovery ≈ 1−exp(−t/T1)', okRecov, '');
}

// =============================================================================
// Test 7: Equilibrium ρ0 = |000><000| is a fixed point. No pulse; after 1 s ρ
// is unchanged (±1e-6). Relaxation ON (equilibrium is the relaxation fixed pt).
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: true, coupling: true });
  const before = sys.rhoAbs();
  const b0 = sys.blochVector(0);
  sys.step(1.0, { relaxation: true });
  const after = sys.rhoAbs();
  let mx = 0;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++)
      mx = Math.max(mx, Math.abs(before[i][j] - after[i][j]));
  const b1 = sys.blochVector(0);
  report('T7 equilibrium fixed point', mx < 1e-6,
    `max|Δρ|=${mx.toExponential(3)}, bz: ${b0.z.toFixed(6)}→${b1.z.toFixed(6)}`);
}

// =============================================================================
// Test 8: J-coupling splitting. Enable coupling, 90x on H, collect complex FID
// at a fixed dwell time, FFT, and assert the ¹H region shows peaks split by
// ~42 Hz (H-P) and ~220 Hz (H-F). Relaxation OFF so peaks stay sharp.
//
// The ¹H multiplet under weak ZZ coupling to P and F is a doublet-of-doublets:
// H precesses at ν_H ± J_HP/2 ± J_HF/2. So the H region contains 4 lines with
// spacings {42, 220} Hz. We detect peaks and check both spacings appear.
// =============================================================================
{
  const sys = new QuantumSpinSystem({ relaxation: false, coupling: true });

  // A J-multiplet on H arises from the ENSEMBLE of coupling-partner states: H
  // precesses at ν_H ± J_HP/2 ± J_HF/2 depending on whether P and F are up or
  // down. Our idealized equilibrium ρ0 = |000><000| has P,F perfectly UP, so H
  // would show only ONE line. To expose the physical multiplet we prepare the
  // coupling partners P,F in the maximally-mixed state (I/2 each) — the high-
  // temperature NMR ensemble — while H stays up:  ρ0 = |0><0|_H ⊗ (I/2)_P ⊗ (I/2)_F.
  // The J values driving the splitting are the true PHYSICAL couplings.
  // rhoM is a flat Float64Array (length 128), interleaved [re,im], element
  // (i,j) at 2*(i*8+j). Set the 4 diagonal entries with H=up to 1/4 each.
  const m0 = new Float64Array(2 * 8 * 8);
  // basis index = 4*H + 2*P + 1*F (H is the most-significant tensor factor).
  for (const p of [0, 1]) for (const f of [0, 1]) {
    const idx = 0 * 4 + p * 2 + f;
    m0[2 * (idx * 8 + idx)] = 0.25; // real part on the diagonal
  }
  sys.rhoM = m0;

  sys.applyPulse(0, Math.PI / 2, 'x'); // 90x on H

  // Dwell chosen to resolve tens of Hz. N points, dwell dt → freq resolution
  // = 1/(N·dt). Bandwidth = 1/dt. Use dt=1 ms (BW 1000 Hz, ±500) and N=4096
  // → resolution ≈ 0.244 Hz. Collect ONLY H's contribution to isolate its
  // multiplet cleanly (sum-FID would overlap P,F multiplets).
  const dt = 1e-3;
  const N = 4096;
  const samplesRe = new Array(N);
  const samplesIm = new Array(N);
  for (let n = 0; n < N; n++) {
    const b = sys.blochVector(0);          // H only
    samplesRe[n] = b.x;
    samplesIm[n] = b.y;
    sys.step(dt, { relaxation: false });
  }

  // Apply a mild exponential apodization to reduce truncation ringing.
  const lb = 2.0; // Hz line broadening
  for (let n = 0; n < N; n++) {
    const w = Math.exp(-Math.PI * lb * n * dt);
    samplesRe[n] *= w;
    samplesIm[n] *= w;
  }

  // FFT via math.js on complex samples.
  const cplx = samplesRe.map((re, n) => math.complex(re, samplesIm[n]));
  // math.fft on a plain array returns a plain array of complex numbers.
  const specRaw = math.fft(cplx);
  const specArr = Array.isArray(specRaw) ? specRaw : specRaw.toArray();

  // Build magnitude spectrum with frequency axis in Hz (fftshift).
  const mag = new Array(N);
  const freq = new Array(N);
  const df = 1 / (N * dt);
  for (let n = 0; n < N; n++) {
    const c = specArr[n];
    mag[n] = Math.hypot(c.re, c.im);
    // frequency for bin n (unshifted): n<N/2 → n·df ; else (n−N)·df
    freq[n] = (n < N / 2 ? n : n - N) * df;
  }

  // Peak picking: local maxima above a threshold.
  const maxMag = Math.max(...mag);
  const thresh = maxMag * 0.15;
  const peaks = [];
  for (let n = 0; n < N; n++) {
    const nl = (n - 1 + N) % N, nr = (n + 1) % N;
    if (mag[n] > thresh && mag[n] >= mag[nl] && mag[n] > mag[nr]) {
      peaks.push({ f: freq[n], m: mag[n] });
    }
  }
  peaks.sort((a, b) => a.f - b.f);
  const peakFreqs = peaks.map((p) => p.f);

  // Adjacent spacings (for reporting the doublet spacing).
  const adjSpacings = [];
  for (let i = 1; i < peakFreqs.length; i++) {
    adjSpacings.push(peakFreqs[i] - peakFreqs[i - 1]);
  }
  // ALL pairwise positive spacings. The H multiplet is a doublet-of-doublets:
  // the small (42 Hz) splitting is an adjacent spacing, while the larger
  // (220 Hz) H-F splitting shows up as the separation between the two doublet
  // groups — i.e. a non-adjacent pairwise difference. So we scan all pairs.
  const allSpacings = [];
  for (let i = 0; i < peakFreqs.length; i++)
    for (let j = i + 1; j < peakFreqs.length; j++)
      allSpacings.push(peakFreqs[j] - peakFreqs[i]);

  console.log(`      T8 detected H peaks (Hz): [${peakFreqs.map((f) => f.toFixed(1)).join(', ')}]`);
  console.log(`      T8 adjacent spacings (Hz): [${adjSpacings.map((s) => s.toFixed(1)).join(', ')}]`);
  console.log(`      T8 all pairwise spacings (Hz): [${allSpacings.map((s) => s.toFixed(1)).join(', ')}]`);

  const near = (target, tol) => allSpacings.some((s) => Math.abs(s - target) < tol);
  const has42 = near(42, 5);
  const has220 = near(220, 8);
  report('T8 H-P splitting ~42 Hz present', has42, `pairwise ${allSpacings.map((s) => s.toFixed(0)).join(',')}`);
  report('T8 H-F splitting ~220 Hz present', has220, '');
}

// =============================================================================
console.log(`\n${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
