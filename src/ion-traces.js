// =============================================================================
// ion-traces.js — "what comes out of the atom" (Substrate 3, spec §3.2). Four
// canvas-2D plots following the fid.js pattern, all theme-aware via plotColors():
//   1. PeTrace          — P_e(t) Rabi flopping. Collapses even with T₂ OFF,
//                         because each Fock state flops at Ω_n ∝ √(n+1): the
//                         clearest demonstration that inhomogeneous dephasing ≠
//                         decoherence. Optional coherent-vs-thermal comparison.
//   2. FluorescenceTrace — R(t)=Γ·ρ_ee with Poisson SHOT NOISE. What a PMT records.
//   3. NbarTrace        — n̄(t) cooling curve.
//   4. ExcitationSpectrum — final P_e vs swept δ (carrier + RSB + BSB).
//
// The shot-noise generator `poissonSample` is written ONCE here and exported so
// the readout module (M8) reuses it (spec §3.2).
// =============================================================================
import { plotColors } from './theme.js';

// ---------------------------------------------------------------------------
// Poisson sampler — Knuth for small λ, Gaussian approximation for large λ.
// Written once; M8 (photon histograms) reuses it. (spec §3.2)
// ---------------------------------------------------------------------------
export function poissonSample(lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }
  // large λ: Gaussian(λ, λ) rounded, clamped ≥ 0
  const g = lambda + Math.sqrt(lambda) * gaussStd();
  return Math.max(0, Math.round(g));
}
function gaussStd() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Base scrolling single-series trace (auto-scaled), shared by P_e and n̄.
// ---------------------------------------------------------------------------
class ScrollTrace {
  constructor(canvas, { maxPoints = 480, label = '', fixed01 = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.label = label;
    this.fixed01 = fixed01;      // lock y-axis to [0,1] (P_e)
    this.A = [];
    this.B = [];                 // optional overlay series (e.g. coherent vs thermal)
    this.labelB = null;
  }
  push(a, b) {
    this.A.push(a);
    if (b !== undefined && b !== null) this.B.push(b);
    if (this.A.length > this.maxPoints) this.A.shift();
    if (this.B.length > this.maxPoints) this.B.shift();
  }
  clear() { this.A = []; this.B = []; }
  setOverlayLabel(l) { this.labelB = l; }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const pad = 6, base = h - 14;

    let lo, hi;
    if (this.fixed01) { lo = 0; hi = 1; }
    else {
      const all = this.B.length ? this.A.concat(this.B) : this.A;
      if (all.length < 2) { this._empty(col, w, h); return; }
      lo = Math.min(...all); hi = Math.max(...all);
      if (hi - lo < 1e-9) { hi += 0.5; lo = Math.max(0, lo - 0.5); }
    }
    if (this.A.length < 2) { this._empty(col, w, h); return; }

    const mapY = (v) => pad + (1 - (v - lo) / (hi - lo)) * (base - pad);
    const mapX = (i, len) => (i / (this.maxPoints - 1)) * (w - 2) + 1;

    // baseline + axis label
    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
    ctx.globalAlpha = 1;

    const series = (arr, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = mapX(i), y = mapY(arr[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    series(this.A, col.accent);
    if (this.B.length) series(this.B, col.accent2);

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = col.accent; ctx.fillText(this.label, 6, 12);
    if (this.B.length && this.labelB) { ctx.fillStyle = col.accent2; ctx.fillText(this.labelB, 6 + 9 * this.label.length + 14, 12); }
    ctx.fillStyle = col.text; ctx.textAlign = 'right';
    ctx.fillText(this.fixed01 ? '[0, 1]' : `[${lo.toFixed(2)}, ${hi.toFixed(2)}]`, w - 4, 12);
    ctx.textAlign = 'left';
  }
  _empty(col, w, h) {
    col = col || plotColors();
    this.ctx.fillStyle = col.text; this.ctx.font = '11px system-ui, sans-serif';
    this.ctx.fillText('run to accumulate…', 8, h / 2);
  }
}

// 1. P_e(t) — locked to [0,1]; supports an overlay B series (coherent vs thermal).
export class PeTrace extends ScrollTrace {
  constructor(canvas) { super(canvas, { label: 'P_e', fixed01: true }); }
}

// 3. n̄(t) — auto-scaled ≥ 0.
export class NbarTrace extends ScrollTrace {
  constructor(canvas) { super(canvas, { label: 'n̄' }); }
}

// ---------------------------------------------------------------------------
// 2. FluorescenceTrace — R(t)=Γ·ρ_ee, sampled with Poisson shot noise. Plots the
// smooth expected count-rate and the noisy per-bin counts (dots).
// ---------------------------------------------------------------------------
export class FluorescenceTrace {
  constructor(canvas, { maxPoints = 240, binTime = 1 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.binTime = binTime;      // integration time per PMT bin (sim units)
    this.rate = [];              // Γ·ρ_ee expected rate
    this.counts = [];            // Poisson-sampled counts / binTime
  }
  // push the instantaneous rate R = Γ·ρ_ee; the trace samples shot noise.
  push(R) {
    const lambda = Math.max(0, R * this.binTime);
    this.rate.push(R);
    this.counts.push(poissonSample(lambda) / this.binTime);
    if (this.rate.length > this.maxPoints) { this.rate.shift(); this.counts.shift(); }
  }
  clear() { this.rate = []; this.counts = []; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const pad = 6, base = h - 14;
    if (this.rate.length < 2) {
      ctx.fillStyle = col.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('run to accumulate fluorescence…', 8, h / 2); return;
    }
    const hi = Math.max(1e-9, ...this.counts, ...this.rate);
    const mapY = (v) => pad + (1 - v / hi) * (base - pad);
    const mapX = (i) => (i / (this.maxPoints - 1)) * (w - 2) + 1;

    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
    ctx.globalAlpha = 1;

    // shot-noise counts as faint dots
    ctx.fillStyle = col.accent2; ctx.globalAlpha = 0.55;
    for (let i = 0; i < this.counts.length; i++) {
      ctx.beginPath(); ctx.arc(mapX(i), mapY(this.counts[i]), 1.3, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // expected rate as a line
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < this.rate.length; i++) {
      const x = mapX(i), y = mapY(this.rate[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = col.accent; ctx.fillText('R=Γρ_ee', 6, 12);
    ctx.fillStyle = col.accent2; ctx.fillText('shot noise', 66, 12);
  }
}

// ---------------------------------------------------------------------------
// 4. ExcitationSpectrum — final P_e vs swept detuning δ. Consumes { delta[],
// pe[], omegaZ }. Marks carrier (0), RSB (−ω_z), BSB (+ω_z). When Ω > ω_z the
// sidebands stop being resolved (M3 "break it") — visible directly here.
// ---------------------------------------------------------------------------
export class ExcitationSpectrum {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
  }
  set(data) { this.data = data; }
  clear() { this.data = null; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 6, padB = 16, padT = 6;
    if (!this.data || this.data.delta.length < 2) {
      ctx.fillStyle = col.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('scan δ to build the excitation spectrum…', 8, h / 2); return;
    }
    const { delta, pe, omegaZ } = this.data;
    const dMin = delta[0], dMax = delta[delta.length - 1];
    const peMax = Math.max(1e-6, ...pe);
    const xOf = (d) => padL + ((d - dMin) / (dMax - dMin)) * (w - padL - 4);
    const yOf = (p) => padT + (1 - p / peMax) * (h - padT - padB);

    // resonance guide lines
    const guides = [[-omegaZ, col.ionRed, 'RSB'], [0, col.ionCarrier, 'carrier'], [omegaZ, col.ionBlue, 'BSB']];
    ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const [d, cc, lbl] of guides) {
      if (d < dMin || d > dMax) continue;
      const x = xOf(d);
      ctx.strokeStyle = cc; ctx.globalAlpha = 0.4; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = cc;
      ctx.fillText(lbl, x, h - 4);
    }
    ctx.textAlign = 'left';

    // spectrum trace
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < delta.length; i++) {
      const x = xOf(delta[i]), y = yOf(pe[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = col.text; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`P_e vs δ  (max ${peMax.toFixed(2)})`, 6, 12);
    ctx.textAlign = 'right'; ctx.fillText('δ / ω_z', w - 4, 12); ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------------------
// 5. DopplerScan (M4) — steady-state n̄ vs swept detuning δ. Consumes { delta[],
// nbar[], Gamma }. Marks the optimum δ=−Γ/2 (dashed) and highlights the scan
// minimum. The minimum sitting at −Γ/2, and n̄ rising toward the carrier (δ→0)
// and running away on the blue side, is the whole M4 story in one plot.
// ---------------------------------------------------------------------------
export class DopplerScan {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
  }
  set(data) { this.data = data; }
  clear() { this.data = null; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 30, padR = 8, padB = 18, padT = 8;
    if (!this.data || this.data.delta.length < 2) {
      ctx.fillStyle = col.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('scan δ to map the Doppler floor n̄(δ)…', 8, h / 2); return;
    }
    const { delta, nbar, Gamma } = this.data;
    const dMin = delta[0], dMax = delta[delta.length - 1];
    const nMax = Math.max(1e-6, ...nbar) * 1.1;
    const xOf = (d) => padL + ((d - dMin) / (dMax - dMin)) * (w - padL - padR);
    const yOf = (n) => padT + (1 - n / nMax) * (h - padT - padB);

    // y grid + axis
    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    // guides: carrier δ=0 and the Doppler optimum δ=−Γ/2
    const half = -Gamma / 2;
    const guides = [[0, col.ionCarrier, 'δ=0'], [half, col.ionRed, '−Γ/2']];
    ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const [d, cc, lbl] of guides) {
      if (d < dMin || d > dMax) continue;
      const x = xOf(d);
      ctx.strokeStyle = cc; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = cc;
      ctx.fillText(lbl, x, h - 5);
    }
    ctx.textAlign = 'left';

    // n̄(δ) curve
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < delta.length; i++) {
      const x = xOf(delta[i]), y = yOf(nbar[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // highlight the minimum
    let mi = 0; for (let i = 1; i < nbar.length; i++) if (nbar[i] < nbar[mi]) mi = i;
    ctx.fillStyle = col.ionRungG;
    ctx.beginPath(); ctx.arc(xOf(delta[mi]), yOf(nbar[mi]), 4, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = col.text; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = col.text; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`n̄_ss vs δ  (min at δ≈${delta[mi].toFixed(2)})`, 6, 12);
    ctx.textAlign = 'right'; ctx.fillText('δ / ω_z', w - 4, 12); ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------------------
// 6. RabiTrace (M9) — P_e vs drive time as a resonant/off-resonant carrier flops
// the qubit. Consumes { t[], pe[] } (P_e locked to [0,1]); dashed guide at P_e=½.
// The oscillation at Ω (and its damping under dephasing) is the whole M9 story.
// ---------------------------------------------------------------------------
export class RabiTrace {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
  }
  set(data) { this.data = data; }
  clear() { this.data = null; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 26, padR = 8, padB = 18, padT = 8;
    if (!this.data || this.data.t.length < 2) {
      ctx.fillStyle = col.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('press Run — drive the carrier and watch P_e flop…', 8, h / 2); return;
    }
    const { t, pe } = this.data;
    const tMax = t[t.length - 1] || 1;
    const xOf = (x) => padL + (x / tMax) * (w - padL - padR);
    const yOf = (p) => padT + (1 - p) * (h - padT - padB);

    // axes + P_e=½ guide
    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(padL, yOf(0.5)); ctx.lineTo(w - padR, yOf(0.5)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // P_e(t) curve
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < t.length; i++) {
      const x = xOf(t[i]), y = yOf(pe[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = col.text; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('P_e vs drive time (Rabi flop)', 6, 12);
    ctx.textAlign = 'right'; ctx.fillText('t · ω_z', w - 4, 12); ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------------------
// 7. RamseyTrace (M10) — P_e vs free-precession time T: Ramsey fringes at the
// detuning δ, whose contrast decays at T₂*. Consumes { t[], pe[], delta }. The
// decaying fringes ARE the coherence-time measurement.
// ---------------------------------------------------------------------------
export class RamseyTrace {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
  }
  set(data) { this.data = data; }
  clear() { this.data = null; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 26, padR = 8, padB = 18, padT = 8;
    if (!this.data || this.data.t.length < 2) {
      ctx.fillStyle = col.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('press Run — sweep the Ramsey delay T to build the fringes…', 8, h / 2); return;
    }
    const { t, pe, delta } = this.data;
    const tMax = t[t.length - 1] || 1;
    const xOf = (x) => padL + (x / tMax) * (w - padL - padR);
    const yOf = (p) => padT + (1 - p) * (h - padT - padB);

    // axes + P_e=½ guide (the fringe midline)
    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(padL, yOf(0.5)); ctx.lineTo(w - padR, yOf(0.5)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // fringe curve
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < t.length; i++) {
      const x = xOf(t[i]), y = yOf(pe[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = col.text; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`Ramsey fringes  (δ=${(delta || 0).toFixed(2)})`, 6, 12);
    ctx.textAlign = 'right'; ctx.fillText('T · ω_z', w - 4, 12); ctx.textAlign = 'left';
  }
}
