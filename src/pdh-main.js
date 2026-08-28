// =============================================================================
// pdh-main.js — UI + canvas rendering for the PDH lock simulator (pdh.html).
// Three panels: (0) Fabry–Pérot cavity, (1) EOM sidebands → error signal,
// (2) time-domain closed-loop lock (fast current + slow PZT). Physics: pdh.js.
// =============================================================================
import * as P from './pdh.js';

// ---- shared parameters ------------------------------------------------------
const params = { finesse: 1000, fsr: 1500, Omega: 20, beta: 1.0, demodPhase: 0 }; // demodPhase in radians
const loop = { Kp: 0.6, Ki: 0.8, Kslow: 0.03, tauFast: 0.05, tauSlow: 2, delay: 0.06, noise: 0.03, drift: 0.004, dt: 0.02 };

function rOf() { return P.finesseToR(params.finesse); }
function linewidth() { return P.cavityLinewidth(params.fsr, params.finesse); }
function cavityCfg() { return { r: rOf(), fsr: params.fsr, Omega: params.Omega, beta: params.beta, demodPhase: params.demodPhase, power: 1 }; }

// ---- theme colors from CSS vars (theme-aware) -------------------------------
function C() {
  const s = getComputedStyle(document.body);
  const g = (n, d) => (s.getPropertyValue(n).trim() || d);
  return {
    text: g('--text', '#e8eaed'), muted: g('--muted', '#9aa0a6'), border: g('--border', '#3c4043'),
    accent: g('--accent', '#4A90D9'), accent2: g('--accent2', '#FF8C00'),
    green: '#50C878', red: '#ff5c6c', blue: '#4aa3ff', violet: '#b57edc',
  };
}

// ---- canvas helpers ---------------------------------------------------------
function axes(ctx, w, h, pad, col) {
  ctx.strokeStyle = col.border; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.stroke();
  ctx.globalAlpha = 1;
}
function poly(ctx, pts, color, lw = 1.6) {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}
function vline(ctx, x, y0, y1, color, dash = [3, 3]) {
  ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}
function label(ctx, txt, x, y, color, align = 'left', font = '11px system-ui, sans-serif') {
  ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
}

// ---- Panel 0: Fabry–Pérot cavity -------------------------------------------
const fpC = document.getElementById('fp-canvas'), fpX = fpC.getContext('2d');
function drawFP() {
  const col = C(), w = fpC.width, h = fpC.height, pad = { l: 34, r: 40, t: 12, b: 24 };
  fpX.clearRect(0, 0, w, h);
  const r = rOf(), fsr = params.fsr, lw = linewidth();
  // Fixed ±15 MHz window (NOT ±N·linewidth) so the resonance visibly sharpens with
  // finesse and broadens with FSR — an auto-zoom in linewidths would normalize that away.
  const X = 15;
  const xOf = (nu) => pad.l + (nu + X) / (2 * X) * (w - pad.l - pad.r);
  const yInt = (v) => pad.t + (1 - v) * (h - pad.t - pad.b);          // intensity [0,1]
  const yPh = (p) => pad.t + (0.5 - p / (2 * Math.PI)) * (h - pad.t - pad.b); // phase [-π,π]
  axes(fpX, w, h, pad, col);
  vline(fpX, xOf(0), pad.t, h - pad.b, col.muted, [2, 3]);
  const N = 500, T = [], R = [], PH = [];
  for (let i = 0; i <= N; i++) {
    const nu = -X + 2 * X * i / N;
    T.push([xOf(nu), yInt(P.transmittedIntensity(nu, r, fsr))]);
    R.push([xOf(nu), yInt(P.reflectedIntensity(nu, r, fsr))]);
    PH.push([xOf(nu), yPh(P.reflectedPhase(nu, r, fsr))]);
  }
  poly(fpX, PH, col.green, 1.3);       // reflected phase (dispersive)
  poly(fpX, R, col.red, 1.8);          // reflection dip
  poly(fpX, T, col.blue, 1.8);         // transmission peak
  label(fpX, 'transmission', pad.l + 6, pad.t + 12, col.blue);
  label(fpX, 'reflection', pad.l + 92, pad.t + 12, col.red);
  label(fpX, 'refl. phase', pad.l + 168, pad.t + 12, col.green);
  label(fpX, 'detuning from resonance (MHz)', w - pad.r, h - 6, col.muted, 'right', '10px system-ui');
  label(fpX, `±${X.toFixed(1)}`, pad.l, h - 6, col.muted, 'left', '10px system-ui');
  document.getElementById('fp-readout').innerHTML =
    `Finesse <b>ℱ = ${params.finesse}</b> · FSR <b>${fsr} MHz</b> · linewidth (FWHM) <b>${lw.toFixed(2)} MHz</b> = FSR/ℱ. ` +
    `On resonance the reflection dips to ~0 (impedance-matched) and the reflected phase swings by 2π — the steep phase is the PDH lever.`;
}

// ---- Panel 1: EOM sidebands → error signal ---------------------------------
const erC = document.getElementById('err-canvas'), erX = erC.getContext('2d');
function drawErr() {
  const col = C(), w = erC.width, h = erC.height, pad = { l: 30, r: 12, t: 14, b: 24 };
  erX.clearRect(0, 0, w, h);
  const cfg = cavityCfg(), lw = linewidth(), Om = params.Omega;
  const X = Om + 6 * lw;
  const xOf = (nu) => pad.l + (nu + X) / (2 * X) * (w - pad.l - pad.r);
  const mid = pad.t + 0.5 * (h - pad.t - pad.b);
  axes(erX, w, h, pad, col);
  // sideband + carrier resonance markers
  vline(erX, xOf(0), pad.t, h - pad.b, col.muted, [2, 3]);
  vline(erX, xOf(-Om), pad.t, h - pad.b, col.violet, [2, 3]);
  vline(erX, xOf(Om), pad.t, h - pad.b, col.violet, [2, 3]);
  label(erX, 'carrier', xOf(0), h - pad.b + 14, col.muted, 'center', '9px system-ui');
  label(erX, '−Ω', xOf(-Om), h - pad.b + 14, col.violet, 'center', '9px system-ui');
  label(erX, '+Ω', xOf(Om), h - pad.b + 14, col.violet, 'center', '9px system-ui');
  const N = 600, RP = [], ER = [];
  let emax = 1e-9;
  const raw = [];
  for (let i = 0; i <= N; i++) { const nu = -X + 2 * X * i / N; const e = P.pdhError(nu, cfg); raw.push([nu, e]); emax = Math.max(emax, Math.abs(e)); }
  for (let i = 0; i <= N; i++) {
    const nu = -X + 2 * X * i / N;
    const refl = P.reflectedPowerWithSidebands(nu, cfg);      // [0,1]
    RP.push([xOf(nu), pad.t + (1 - refl) * 0.42 * (h - pad.t - pad.b) + 0.02 * (h - pad.t - pad.b)]);
    ER.push([xOf(nu), mid - (raw[i][1] / emax) * 0.42 * (h - pad.t - pad.b)]);
  }
  // zero line for the error signal
  ctxLine(erX, pad.l, mid, w - pad.r, mid, col.border, 0.5);
  poly(erX, RP, col.muted, 1.4);       // reflected power (dip + 2 sidebands)
  poly(erX, ER, col.accent, 2);        // PDH error signal (the discriminant)
  label(erX, 'reflected power (carrier + sidebands)', pad.l + 6, pad.t + 12, col.muted);
  label(erX, 'PDH error signal ε(ν)', pad.l + 6, mid + 40, col.accent);
  label(erX, 'detuning (MHz)', w - pad.r, h - 6, col.muted, 'right', '10px system-ui');
  const D = P.discriminantSlope(cfg);
  document.getElementById('err-readout').innerHTML =
    `Sidebands at <b>±Ω = ±${Om} MHz</b> (Ω/linewidth = <b>${(Om / lw).toFixed(1)}</b>) · mod. depth β=${params.beta.toFixed(2)} ` +
    `(J₀=${P.besselJ(0, params.beta).toFixed(2)}, J₁=${P.besselJ(1, params.beta).toFixed(2)}) · demod φ=${(params.demodPhase * 180 / Math.PI).toFixed(0)}°. ` +
    `Discriminant slope <b>dε/dν = ${D.toFixed(3)}</b> — the steep zero-crossing at resonance is what the servo locks to.`;
}
function ctxLine(ctx, x0, y0, x1, y1, color, alpha = 1) { ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalAlpha = 1; }

// ---- Panel 2: closed-loop lock (animated) ----------------------------------
const lkC = document.getElementById('lock-canvas'), lkX = lkC.getContext('2d');
let lock = null, nuBuf = [], NBUF = 520, running = false;
function rebuildLock(keepEngaged = false) {
  const wasLocked = lock ? lock.locked : false;
  lock = new P.PDHLock({ ...cavityCfg(), ...loop, nu0: lock ? lock.nu : 0 }, Math.random);
  lock.setLocked(keepEngaged ? wasLocked : false);
  if (!keepEngaged) nuBuf = [];
}
function drawLock() {
  const col = C(), w = lkC.width, h = lkC.height, pad = { l: 40, r: 12, t: 12, b: 20 };
  lkX.clearRect(0, 0, w, h);
  const lw = linewidth();
  let amax = 0.4; for (const v of nuBuf) amax = Math.max(amax, Math.abs(v)); amax *= 1.15;
  const yOf = (nu) => pad.t + (0.5 - nu / (2 * amax)) * (h - pad.t - pad.b);
  const xOf = (i) => pad.l + i / (NBUF - 1) * (w - pad.l - pad.r);
  // resonance band (±linewidth/2) + zero line
  lkX.fillStyle = col.green; lkX.globalAlpha = 0.10;
  lkX.fillRect(pad.l, yOf(lw / 2), w - pad.l - pad.r, Math.max(1, yOf(-lw / 2) - yOf(lw / 2)));
  lkX.globalAlpha = 1;
  ctxLine(lkX, pad.l, yOf(0), w - pad.r, yOf(0), col.green, 0.6);
  axes(lkX, w, h, pad, col);
  if (nuBuf.length > 1) {
    const pts = nuBuf.map((v, i) => [xOf(i + (NBUF - nuBuf.length)), yOf(v)]);
    poly(lkX, pts, lock && lock.locked ? col.accent : col.muted, 1.6);
  }
  label(lkX, 'resonance', pad.l + 4, yOf(0) - 4, col.green, 'left', '9px system-ui');
  label(lkX, `±${amax.toFixed(2)} MHz`, pad.l - 4, pad.t + 8, col.muted, 'right', '9px system-ui');
  label(lkX, 'laser detuning ν(t)  →  time', w - pad.r, h - 6, col.muted, 'right', '10px system-ui');
  // residual over recent window
  const recent = nuBuf.slice(-160);
  const rms = recent.length ? Math.sqrt(recent.reduce((s, v) => s + v * v, 0) / recent.length) : 0;
  const st = lock && lock.locked;
  const captured = st && Math.abs(lock.nu) < 3 * lw;
  document.getElementById('lock-readout').innerHTML =
    `<b style="color:${st ? (captured ? col.green : col.accent2) : col.muted}">${st ? (captured ? 'LOCKED' : 'engaged — out of capture') : 'free-running'}</b> · ` +
    `residual (RMS) <b>${rms.toFixed(3)} MHz</b>` + (st ? ` = ${(rms / lw).toFixed(2)} linewidths` : '') +
    `. Fast P=${loop.Kp.toFixed(1)}/I=${loop.Ki.toFixed(1)}, PZT=${loop.Kslow.toFixed(3)}. ` +
    `Free-running the laser wanders (drift+noise); engage and the servo pulls it onto resonance.`;
}
function frame() {
  const stepsPerFrame = 10;
  for (let k = 0; k < stepsPerFrame; k++) { lock.step(); }
  nuBuf.push(lock.nu); if (nuBuf.length > NBUF) nuBuf.shift();
  drawLock();
  requestAnimationFrame(frame);
}

// ---- controls ---------------------------------------------------------------
function wire(id, onChange, fmt) {
  const el = document.getElementById(id), val = document.getElementById(id + '-val');
  const h = () => { const v = parseFloat(el.value); if (val) val.textContent = fmt(v); onChange(v); };
  el.addEventListener('input', h); h();
}
// Panel 0
wire('fp-finesse', (v) => { params.finesse = v; drawFP(); drawErr(); rebuildLock(true); }, (v) => String(Math.round(v)));
wire('fp-fsr', (v) => { params.fsr = v; drawFP(); drawErr(); rebuildLock(true); }, (v) => String(Math.round(v)));
// Panel 1
wire('err-omega', (v) => { params.Omega = v; drawErr(); rebuildLock(true); }, (v) => v.toFixed(0));
wire('err-beta', (v) => { params.beta = v; drawErr(); rebuildLock(true); }, (v) => v.toFixed(2));
wire('err-phase', (v) => { params.demodPhase = v * Math.PI / 180; drawErr(); rebuildLock(true); }, (v) => v.toFixed(0) + '°');
// Panel 2
wire('lk-kp', (v) => { loop.Kp = v; if (lock) lock.cfg.Kp = v; }, (v) => v.toFixed(1));
wire('lk-ki', (v) => { loop.Ki = v; if (lock) lock.cfg.Ki = v; }, (v) => v.toFixed(1));
wire('lk-ks', (v) => { loop.Kslow = v; if (lock) lock.cfg.Kslow = v; }, (v) => v.toFixed(3));
wire('lk-noise', (v) => { loop.noise = v; if (lock) lock.cfg.noise = v; }, (v) => v.toFixed(3));
wire('lk-drift', (v) => { loop.drift = v; if (lock) lock.cfg.drift = v; }, (v) => v.toFixed(3));
const toggleBtn = document.getElementById('lock-toggle');
toggleBtn.addEventListener('click', () => {
  const on = !lock.locked; lock.setLocked(on);
  toggleBtn.textContent = on ? 'Unlock' : 'Engage lock';
  toggleBtn.classList.toggle('on', on);
});
document.getElementById('lock-kick').addEventListener('click', () => { lock.nuFree += 4 + 4 * Math.random(); });

// ---- boot -------------------------------------------------------------------
drawFP(); drawErr(); rebuildLock(false); running = true; requestAnimationFrame(frame);
