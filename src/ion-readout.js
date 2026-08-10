// =============================================================================
// ion-readout.js — M8 state-selective fluorescence readout (spec §4 M8).
//
// State-selective detection of a shelving qubit: the "bright" state |g⟩ (S₁/₂)
// scatters the 397 nm probe and fluoresces; the "dark"/shelved state |e⟩ (D₅/₂)
// does not. Over a detection window t_d the PMT collects a Poisson-distributed
// photon count:
//   bright  |g⟩:  n̄_bright = R_scatter · t_d   →  count ~ Poisson(n̄_bright)
//   dark    |e⟩:  n̄_dark   = R_bg      · t_d   →  count ~ Poisson(n̄_dark)
// Discrimination picks an integer THRESHOLD: classify count ≥ thr as bright,
// count < thr as dark. The average readout error and fidelity are
//   E = ½[ P(count<thr | bright) + P(count≥thr | dark) ],   F = 1 − E.
// The optimal threshold minimizes the Poisson overlap; it sits between n̄_dark
// and n̄_bright. Everything here is EMERGENT from t_d·R versus the Poisson width
// √n̄ — shortening t_d shrinks n̄_bright until the two Poisson histograms overlap
// and F collapses. Nothing is hard-wired to the input state.
//
// This module holds ONLY the Poisson statistics (analytic PMF, optimal-threshold
// search, fidelity, histogram binning). The live photon-count SAMPLER is the
// single Poisson generator already written in ion-traces.js — reused here, never
// re-implemented (spec §3.2).
// =============================================================================

// ---------------------------------------------------------------------------
// Poisson PMF over k = 0..kMax for mean λ, as a Float64Array (index = count).
// Stable upward recurrence P(0)=e^{-λ}, P(k)=P(k−1)·λ/k (no factorial overflow;
// e^{-λ} only underflows for λ ≳ 700, far above any detection-window mean here).
// ---------------------------------------------------------------------------
export function poissonPMFArray(lambda, kMax) {
  const p = new Float64Array(kMax + 1);
  if (!(lambda > 0)) { p[0] = 1; return p; }        // λ=0 ⇒ all mass at k=0
  p[0] = Math.exp(-lambda);
  for (let k = 1; k <= kMax; k++) p[k] = p[k - 1] * lambda / k;
  return p;
}

// Single-point Poisson PMF P(k; λ).
export function poissonPMF(k, lambda) {
  if (k < 0) return 0;
  if (!(lambda > 0)) return k === 0 ? 1 : 0;
  // log form for a single value: exp(k·lnλ − λ − ln k!)
  let lnFact = 0;
  for (let i = 2; i <= k; i++) lnFact += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - lnFact);
}

// A sensible upper count bound covering both distributions' tails (~10σ).
function countBound(lambdaBright, lambdaDark) {
  const hi = Math.max(lambdaBright, lambdaDark);
  return Math.max(8, Math.ceil(hi + 10 * Math.sqrt(hi + 1) + 10));
}

// ---------------------------------------------------------------------------
// Readout error / fidelity at a GIVEN integer threshold thr (classify count ≥ thr
// as bright). Equal-prior average error E = ½[errBright + errDark]:
//   errBright = P(count < thr | bright) = Σ_{k=0}^{thr−1} PMF(k; λ_bright)
//   errDark   = P(count ≥ thr | dark)   = Σ_{k=thr}^{∞}  PMF(k; λ_dark)
// F = 1 − E. This is exactly one minus the Poisson OVERLAP that the histograms show.
// ---------------------------------------------------------------------------
export function readoutFidelityAt(threshold, lambdaBright, lambdaDark) {
  const kMax = countBound(lambdaBright, lambdaDark);
  const pB = poissonPMFArray(lambdaBright, kMax);
  const pD = poissonPMFArray(lambdaDark, kMax);
  const thr = Math.max(0, Math.round(threshold));
  let errBright = 0;                                 // P(count < thr | bright)
  for (let k = 0; k < thr && k <= kMax; k++) errBright += pB[k];
  let errDark = 0;                                   // P(count ≥ thr | dark)
  for (let k = thr; k <= kMax; k++) errDark += pD[k];
  const error = 0.5 * (errBright + errDark);
  return { fidelity: 1 - error, error, errBright, errDark, threshold: thr };
}

// ---------------------------------------------------------------------------
// Optimal threshold: the integer thr in [0, kMax+1] that MINIMIZES the Poisson
// overlap (maximizes F). Returns the full readout report at that threshold.
// The minimizer lands strictly between n̄_dark and n̄_bright whenever they differ.
// ---------------------------------------------------------------------------
export function optimalThreshold(lambdaBright, lambdaDark) {
  const kMax = countBound(lambdaBright, lambdaDark);
  const pB = poissonPMFArray(lambdaBright, kMax);
  const pD = poissonPMFArray(lambdaDark, kMax);
  // Prefix sums so each threshold is O(1).
  //   errBright(thr) = Σ_{k<thr} pB[k]   (increasing in thr)
  //   errDark(thr)   = Σ_{k≥thr} pD[k]   (decreasing in thr)
  let best = null;
  let errBright = 0;                                 // thr = 0
  let errDark = 0; for (let k = 0; k <= kMax; k++) errDark += pD[k];
  for (let thr = 0; thr <= kMax + 1; thr++) {
    const error = 0.5 * (errBright + errDark);
    if (best === null || error < best.error - 1e-15) {
      best = { threshold: thr, error, errBright, errDark, fidelity: 1 - error };
    }
    // advance to thr+1: count `thr` moves from the dark-tail into the bright-tail
    if (thr <= kMax) { errBright += pB[thr]; errDark -= pD[thr]; }
  }
  return best;
}

// Convenience: fidelity at the optimal threshold for means n̄_bright=R·t_d, n̄_dark=R_bg·t_d.
export function readoutFidelity({ R, Rbg, td }) {
  return optimalThreshold(R * td, Rbg * td);
}

// ---------------------------------------------------------------------------
// Histogram binning: integer photon-count samples → Float64Array of frequencies
// (index = count) up to `kMax`. Counts above kMax pile into the last bin.
// ---------------------------------------------------------------------------
export function binCounts(samples, kMax) {
  const h = new Float64Array(kMax + 1);
  for (let i = 0; i < samples.length; i++) {
    const c = Math.min(kMax, Math.max(0, samples[i] | 0));
    h[c] += 1;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Empirical classification error from already-sampled shots, at a threshold —
// used by the test to confirm the sampled shots obey the analytic Poisson error
// (F is from statistics, not hard-wired). brightSamples/darkSamples are integer
// photon counts drawn from Poisson(λ_bright)/Poisson(λ_dark).
// ---------------------------------------------------------------------------
export function empiricalError(brightSamples, darkSamples, threshold) {
  const thr = Math.max(0, Math.round(threshold));
  let misB = 0;                                      // bright shots called dark
  for (const c of brightSamples) if (c < thr) misB++;
  let misD = 0;                                      // dark shots called bright
  for (const c of darkSamples) if (c >= thr) misD++;
  const errBright = misB / Math.max(1, brightSamples.length);
  const errDark = misD / Math.max(1, darkSamples.length);
  return { error: 0.5 * (errBright + errDark), errBright, errDark, fidelity: 1 - 0.5 * (errBright + errDark) };
}
