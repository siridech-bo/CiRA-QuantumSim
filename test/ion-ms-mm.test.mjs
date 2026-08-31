// test/ion-ms-mm.test.mjs — E5 multi-mode open-system MS verifier (src/ion-ms-mm.js).
// Validates that the M-mode Lindblad engine (dim 4·∏N_Fock) reduces EXACTLY to the
// single-mode MSGate, reproduces the analytic multi-mode kernel (ion-msn), stays CPTP
// under per-mode heating, and that the incoherent sensitivity is TARGET-mode dominated
// (the E5 headline: spectator modes barely move the trade-off crossover).
import assert from 'node:assert';
import { MSGateMM } from '../src/ion-ms-mm.js';
import { MSGate } from '../src/ion-ms.js';
import { twoIonAxial, bellFidelity } from '../src/ion-msn.js';

let n = 0; const ok = (m) => { console.log(`  ok ${++n} - ${m}`); };

// ---- A. M=1 reduces EXACTLY to the single-mode MSGate --------------------------------
{
  const NF = 16, Om = 5;   // closure: δ=1, K=1, η=0.1 ⇒ ηΩ=δ/2 ⇒ Ω=5
  const ref = new MSGate({ N_FOCK: NF, eta: 0.1, delta: 1, K: 1 }); ref.runGate();
  const mm = new MSGateMM({ Nfock: [NF], modes: [{ delta: 1, eta: 0.1, bvec: [1, 1] }], Omega: Om }); mm.runGate();
  assert.ok(Math.abs(ref.bellFidelity() - mm.bellFidelity()) < 1e-5, 'M=1 Bell F matches MSGate at closure');
  assert.ok(Math.abs(mm.traceRho() - 1) < 1e-9, 'M=1 CPTP Tr=1');
  ok('M=1 reproduces MSGate at closure (F to <1e-5, Tr=1)');

  const r2 = new MSGate({ N_FOCK: NF, eta: 0.1, delta: 1, K: 1, deltaOmega: 0.02 }); r2.runGate();
  const m2 = new MSGateMM({ Nfock: [NF], modes: [{ delta: 1, eta: 0.1, bvec: [1, 1] }], Omega: Om, deltaOmega: 0.02 }); m2.runGate();
  assert.ok(Math.abs(r2.bellFidelity() - m2.bellFidelity()) < 1e-5, 'M=1 matches MSGate under Δω asymmetric error');
  ok('M=1 reproduces MSGate under Δω center-line error');
}

// ---- B. M=1 stays CPTP under heating + dephasing -------------------------------------
{
  const mm = new MSGateMM({ Nfock: [16], modes: [{ delta: 1, eta: 0.1, bvec: [1, 1], nBath: 1.0 }], Omega: 5, kappa: 0.01, gammaPhi: 0.005 });
  mm.runGate();
  assert.ok(Math.abs(mm.traceRho() - 1) < 1e-8, 'Tr=1 under heating+dephasing');
  for (const p of mm.qubitPopulations()) assert.ok(p > -1e-9 && p < 1 + 1e-9, 'qubit populations in [0,1]');
  ok('M=1 CPTP-preserving under heating + dephasing');
}

// ---- C. M=2 (COM+stretch) reproduces the analytic multi-mode kernel ------------------
{
  const dCOM = 0.3, mu = 1 + dCOM, Om = dCOM / 2 / (0.1 / Math.SQRT2), tau = 2 * Math.PI / dCOM;
  const etaC = 0.1 / Math.SQRT2, etaS = 0.1 / Math.SQRT2 * Math.pow(1 / Math.sqrt(3), 0.5), dSTR = dCOM - (Math.sqrt(3) - 1);
  const Fana = bellFidelity(twoIonAxial(0.1, Om, mu), tau);
  const mm = new MSGateMM({ Nfock: [10, 4], modes: [{ delta: dCOM, eta: etaC, bvec: [1, 1] }, { delta: dSTR, eta: etaS, bvec: [1, -1] }], Omega: Om });
  mm.runGate();
  assert.ok(Math.abs(mm.bellFidelity() - Fana) < 3e-3, `M=2 Bell F ${mm.bellFidelity().toFixed(4)} matches analytic ${Fana.toFixed(4)}`);
  assert.ok(Math.abs(mm.traceRho() - 1) < 1e-8, 'M=2 CPTP Tr=1');
  ok('M=2 (COM+stretch) reproduces analytic twoIonAxial (F to <3e-3, Tr=1)');
}

// ---- D. E5 headline: incoherent sensitivity is TARGET-mode dominated -----------------
{
  const dCOM = 0.3, Om = dCOM / 2 / (0.1 / Math.SQRT2), etaC = 0.1 / Math.SQRT2;
  const etaS = 0.1 / Math.SQRT2 * Math.pow(1 / Math.sqrt(3), 0.5), dSTR = dCOM - (Math.sqrt(3) - 1);
  const two = [{ delta: dCOM, eta: etaC, bvec: [1, 1], nBath: 0.5 }, { delta: dSTR, eta: etaS, bvec: [1, -1], nBath: 0.5 }];
  const inf = (kap) => { const g = new MSGateMM({ Nfock: [10, 4], modes: two, Omega: Om, kappa: kap }); g.runGate(); return { f: 1 - g.bellFidelity(), tr: g.traceRho() }; };
  const k = 0.008, base = inf([0, 0]);
  const tgt = inf([k, 0]), spc = inf([0, k]);
  assert.ok(Math.abs(tgt.tr - 1) < 1e-8 && Math.abs(spc.tr - 1) < 1e-8, 'per-mode heating stays CPTP');
  const sTarget = (tgt.f - base.f) / k, sSpec = (spc.f - base.f) / k;
  assert.ok(sTarget > 0, 'target-mode heating raises infidelity');
  assert.ok(sSpec < 0.5 * sTarget, `spectator incoherent slope ${sSpec.toFixed(3)} << target ${sTarget.toFixed(3)}`);
  ok(`E5: incoherent error is target-mode dominated (spectator/target ≈ ${(sSpec / sTarget).toFixed(2)})`);
}

// ---- E. M=3 generalizes (general-M code path: strides, 3 mode ops, 3 dissipators) ----
// Fast CPTP smoke test on a short evolution — the tight analytic match (dim-640 3-ion
// chain, |ΔF|=4.6e-4) is validated offline (too slow for the suite). Guards the M≥3 path.
{
  const three = [
    { delta: 0.5, eta: 0.06, bvec: [0.577, 0.577], nBath: 0.5 },   // COM-like target
    { delta: -0.7, eta: 0.05, bvec: [0.707, -0.707], nBath: 0.5 },  // stretch-like spectator
    { delta: -1.3, eta: 0.03, bvec: [0.408, 0.408], nBath: 0.5 },   // Egyptian-like spectator
  ];
  const g = new MSGateMM({ Nfock: [6, 3, 3], modes: three, Omega: 4.0, kappa: [0.01, 0.01, 0.01], gammaPhi: 0.004 });
  g.reset(); g.step(3.0);   // partial evolution under all 3 modes + heating + dephasing
  assert.strictEqual(g.dim, 4 * 6 * 3 * 3, 'M=3 dimension = 4·∏N_Fock');
  assert.ok(Math.abs(g.traceRho() - 1) < 1e-8, `M=3 CPTP Tr=1 (got ${g.traceRho().toFixed(9)})`);
  for (const p of g.qubitPopulations()) assert.ok(p > -1e-9 && p < 1 + 1e-9, 'M=3 qubit populations in [0,1]');
  ok('M=3 general-M path runs CPTP-preservingly (3 modes + heating + dephasing)');
}

console.log(`\nion-ms-mm: ${n} tests passed`);
