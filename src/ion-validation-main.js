// =============================================================================
// ion-validation-main.js — UI for the Experiment↔Theory validation page
// (ion-validation.html). Overlays measured data on the paper's validated trade-off
// theory (E1–E6). INTEGRITY: measured data is plotted exactly as entered — never
// fitted, shifted, or rescaled to match theory. Theory: ion-validation.js (trade-off,
// exact 4×4 coherent + calibrated incoherent rate model), ion-jitter.js (timing),
// ion-msn(-shape)/ion-ms-pm/ion-modes (waveforms & modes).
// =============================================================================
import { tradeoffCurve, crossoverDeltaOmega, recommend, incoherentSingle, coherentGBC, gateTau, toPhysical } from './ion-validation.js';
import { jitterCurve, mulberry32 } from './ion-jitter.js';
import { IonChain } from './ion-modes.js';
import { chainModes, chainClosureCOM, displacement } from './ion-msn.js';
import { solveShapeRobust } from './ion-msn-shape.js';

const S = { eta: 0.10, deltaKHz: 50, K: 1, N: 3, pairIdx: 0, ndot: 1.0, T2ms: 0, nbar: 1, dw: 0.05 };
const DELTACOM = 0.2;                          // chain drive→COM detuning (ω_z units); ω_z = δ/DELTACOM
const wzKHz = () => S.deltaKHz / DELTACOM;      // trap frequency implied by the user's δ
const $ = (id) => document.getElementById(id);
const clr = () => { const s = getComputedStyle(document.body), g = (n, d) => (s.getPropertyValue(n).trim() || d);
  return { text: g('--text', '#c9d1d9'), muted: g('--muted', '#8b949e'), border: g('--border', '#30363d'), accent: g('--accent', '#4A90D9'), bg: g('--bg', '#0d1117'),
    green: '#50C878', red: '#ff5c6c', violet: '#b57edc', orange: '#FF8C00' }; };
const fmtHz = (kHz) => kHz >= 1000 ? (kHz / 1000).toFixed(2) + ' MHz' : kHz.toFixed(1) + ' kHz';
const registry = {};   // per-plot { spec, csv, caption } for export buttons

// pairs of ions for the current N (0-indexed) — enumerated for the pair slider
function pairs(N) { const out = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) out.push([i, j]); return out; }

// derived physical/dimensionless quantities from the config
function derive() {
  const ph = toPhysical({ deltaHz: S.deltaKHz * 1e3 });
  const kappa = ph.kappaFromNdot(S.ndot * 1e3);                 // ṅ [phonons/ms] → κ
  const gammaPhi = S.T2ms > 0 ? ph.gammaFromT2(S.T2ms * 1e-3) : 0;
  const tauDimless = gateTau(1, S.K), tauSec = ph.tauSeconds(tauDimless);
  return { ph, kappa, gammaPhi, tauDimless, tauSec, dwToKHz: (dw) => dw * S.deltaKHz };
}
// real chain modes + closure operating point (for waveform-based panels)
let _spec = null, _specN = 0;
function chain() {
  if (_specN !== S.N) { _spec = new IonChain({ N: S.N }).modes(S.N).modes; _specN = S.N; }
  const pr = pairs(S.N), pair = pr[Math.min(S.pairIdx, pr.length - 1)];
  const op = chainClosureCOM(S.N, { eta0: S.eta, deltaCOM: DELTACOM, K: S.K });
  const modes = chainModes(_spec, pair, { eta0: S.eta, Omega: op.Omega, muDrive: op.muDrive, nbar: S.nbar });
  return { spec: _spec, pair, op, modes, tau: op.tau };
}

// -----------------------------------------------------------------------------
// Generic XY plot: theory lines + measured points (with error bars) + vlines.
// spec = { xlabel, ylabel, xlog, ylog, xrange:[a,b], yrange:[a,b]|null,
//          series:[{kind:'line'|'points', pts:[{x,y,err?}], color, width?, label}],
//          vlines:[{x,color,label,dash?}], legend?:bool }
// -----------------------------------------------------------------------------
function plot(canvas, spec) {
  const ctx = canvas.getContext('2d'), col = clr(), w = canvas.width, h = canvas.height;
  const pad = { l: 62, r: 14, t: 14, b: 40 }; ctx.clearRect(0, 0, w, h);
  const pw = w - pad.l - pad.r, phh = h - pad.t - pad.b;
  const [x0, x1] = spec.xrange; let [y0, y1] = spec.yrange || autoY(spec);
  const tx = (v) => spec.xlog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0);
  const ty = (v) => spec.ylog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0);
  const px = (v) => pad.l + pw * Math.max(0, Math.min(1, tx(v)));
  const py = (v) => pad.t + phh * (1 - Math.max(0, Math.min(1, ty(v))));
  // grid + ticks
  ctx.strokeStyle = col.border; ctx.fillStyle = col.muted; ctx.lineWidth = 1; ctx.font = '10px system-ui, sans-serif';
  const xticks = spec.xlog ? decades(x0, x1) : linticks(x0, x1, 5);
  const yticks = spec.ylog ? decades(y0, y1) : linticks(y0, y1, 5);
  ctx.textAlign = 'center';
  for (const t of xticks) { const X = px(t); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(X, pad.t); ctx.lineTo(X, pad.t + phh); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmtTick(t, spec.xlog), X, pad.t + phh + 14); }
  ctx.textAlign = 'right';
  for (const t of yticks) { const Y = py(t); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(pad.l, Y); ctx.lineTo(pad.l + pw, Y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmtTick(t, spec.ylog), pad.l - 6, Y + 3); }
  ctx.strokeStyle = col.border; ctx.globalAlpha = 1; ctx.strokeRect(pad.l, pad.t, pw, phh);
  // axis labels
  ctx.fillStyle = col.muted; ctx.textAlign = 'center'; ctx.font = '11px system-ui';
  ctx.fillText(spec.xlabel, pad.l + pw / 2, h - 6);
  ctx.save(); ctx.translate(15, pad.t + phh / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(spec.ylabel, 0, 0); ctx.restore();
  // vlines
  for (const v of spec.vlines || []) { if (v.x < x0 || v.x > x1) continue; const X = px(v.x); ctx.strokeStyle = v.color; ctx.setLineDash(v.dash || [5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X, pad.t); ctx.lineTo(X, pad.t + phh); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = v.color; ctx.textAlign = 'left'; ctx.fillText(v.label, X + 4, pad.t + 12); }
  // series
  for (const s of spec.series) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width || 2;
    if (s.kind === 'line') { ctx.beginPath(); let started = false; for (const p of s.pts) { if (!Number.isFinite(p.y) || (spec.ylog && p.y <= 0)) { started = false; continue; } const X = px(p.x), Y = py(p.y); started ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); started = true; } ctx.stroke(); }
    else { for (const p of s.pts) { if (!Number.isFinite(p.y) || (spec.ylog && p.y <= 0)) continue; const X = px(p.x), Y = py(p.y); if (p.err) { const Yhi = py(Math.max(y0, p.y + p.err)), Ylo = py(spec.ylog ? Math.max(y0, p.y - p.err) : p.y - p.err); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X, Yhi); ctx.lineTo(X, Ylo); ctx.moveTo(X - 3, Yhi); ctx.lineTo(X + 3, Yhi); ctx.moveTo(X - 3, Ylo); ctx.lineTo(X + 3, Ylo); ctx.stroke(); } ctx.beginPath(); ctx.arc(X, Y, 3.4, 0, 7); ctx.fill(); } }
  }
  // legend
  if (spec.legend !== false) { let ly = pad.t + 6; ctx.textAlign = 'left'; ctx.font = '10.5px system-ui'; for (const s of spec.series) { ctx.fillStyle = s.color; ctx.fillRect(pad.l + pw - 130, ly - 7, 10, 3); ctx.fillStyle = col.text; ctx.fillText(s.label, pad.l + pw - 116, ly - 3); ly += 14; } }
  registry[spec.key] = registry[spec.key] || {}; registry[spec.key].spec = spec;
}
function autoY(spec) {
  let lo = Infinity, hi = -Infinity;
  for (const s of spec.series) for (const p of s.pts) { if (!Number.isFinite(p.y)) continue; if (spec.ylog && p.y <= 0) continue; lo = Math.min(lo, p.y - (p.err || 0)); hi = Math.max(hi, p.y + (p.err || 0)); }
  if (!Number.isFinite(lo)) return [0, 1];
  if (spec.ylog) return [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
  const m = (hi - lo) * 0.08 || 0.1; return [Math.min(0, lo - m), hi + m];
}
const linticks = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
function decades(a, b) { const out = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) out.push(Math.pow(10, e)); return out; }
function fmtTick(v, log) { if (log) { const e = Math.round(Math.log10(v)); return '10' + supers(e); } if (Math.abs(v) >= 100 || (v !== 0 && Math.abs(v) < 0.01)) return v.toExponential(0); return (+v.toFixed(3)).toString(); }
const supers = (e) => (e < 0 ? '⁻' : '') + String(Math.abs(e)).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');

// parse "x, y[, err]" lines (commas or whitespace); ignores blanks/comments
function parseData(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const p = l.split(/[,\s]+/).map(Number); return { x: p[0], y: p[1], err: p.length > 2 ? Math.abs(p[2]) : 0 };
  }).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
}
// χ²/dof of data vs a theory function y(x)
function chi2dof(data, yfun) {
  let s = 0, n = 0; for (const d of data) { const yt = yfun(d.x); const e = d.err || Math.max(1e-9, 0.1 * Math.abs(d.y)); s += ((d.y - yt) / e) ** 2; n++; }
  return { chi2: s, dof: Math.max(1, n), red: s / Math.max(1, n), n };
}

// =============================================================================
// Recommendation card + Phase-2 core
// =============================================================================
function renderRecommendation(d) {
  const col = clr(), rec = recommend({ delta: 1, K: S.K, deltaOmega: S.dw, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi });
  const dwx = crossoverDeltaOmega({ delta: 1, K: S.K, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi });
  const vc = rec.kStar === 1 ? col.orange : col.green;
  const dwxTxt = dwx == null ? 'none (GBC never wins in range)' : `${dwx.toFixed(3)} δ = ${fmtHz(dwx * S.deltaKHz)}`;
  $('iv-rec').innerHTML =
    `<div><div class="verdict" style="color:${vc}">${rec.verdict}</div><span>optimal depth k* = ${rec.kStar} · one GBC or none (E4)</span></div>` +
    `<span>your Δω = <span class="k">${S.dw.toFixed(3)} δ</span> = ${fmtHz(S.dw * S.deltaKHz)}</span>` +
    `<span>crossover Δω<sup>×</sup> = <span class="k">${dwxTxt}</span></span>` +
    `<span>gate τ = <span class="k">${(d.tauSec * 1e6).toFixed(1)} µs</span></span>` +
    `<span>predicted 1−F: single <span class="k">${rec.single.toExponential(2)}</span> · GBC <span class="k">${rec.gbc.toExponential(2)}</span></span>`;
}

function renderCrossover(d) {
  const col = clr(), dws = linticks(0, 0.3, 120);
  const curve = tradeoffCurve({ delta: 1, K: S.K, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi, deltaOmegas: dws });
  const dwx = crossoverDeltaOmega({ delta: 1, K: S.K, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi });
  const dataS = parseData($('ta-cross-s').value), dataG = parseData($('ta-cross-g').value);
  const spec = { key: 'cross', xlabel: 'center-line error Δω  (units of δ)', ylabel: '1 − F', xlog: false, ylog: false, xrange: [0, 0.3], yrange: null,
    series: [
      { kind: 'line', pts: curve.map((c) => ({ x: c.deltaOmega, y: c.single })), color: col.accent, label: 'single (theory)' },
      { kind: 'line', pts: curve.map((c) => ({ x: c.deltaOmega, y: c.gbc })), color: col.orange, label: 'GBC (theory)' },
    ], vlines: dwx == null ? [] : [{ x: dwx, color: col.violet, label: `Δω× ${dwx.toFixed(3)}` }] };
  if (dataS.length) spec.series.push({ kind: 'points', pts: dataS, color: col.accent, label: 'single (meas.)' });
  if (dataG.length) spec.series.push({ kind: 'points', pts: dataG, color: col.orange, label: 'GBC (meas.)' });
  plot($('cv-cross'), spec);
  // metric: χ² per dataset + extracted experimental crossover (single−gbc sign change)
  const ythS = (x) => tradeoffCurve({ K: S.K, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi, deltaOmegas: [x] })[0].single;
  const ythG = (x) => tradeoffCurve({ K: S.K, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi, deltaOmegas: [x] })[0].gbc;
  let msg = `Predicted crossover Δω<sup>×</sup> = <b>${dwx == null ? '—' : dwx.toFixed(3)} δ</b>`;
  let expX = null;
  if (dataS.length >= 2 && dataG.length >= 2) { expX = extractCrossover(dataS, dataG); if (expX != null) msg += ` · measured Δω<sup>×</sup> ≈ <b>${expX.toFixed(3)} δ</b> = ${fmtHz(expX * S.deltaKHz)}`; }
  const cS = dataS.length ? chi2dof(dataS, ythS) : null, cG = dataG.length ? chi2dof(dataG, ythG) : null;
  if (cS) msg += ` · single χ²/dof = ${cS.red.toFixed(2)} (N=${cS.n})`;
  if (cG) msg += ` · GBC χ²/dof = ${cG.red.toFixed(2)} (N=${cG.n})`;
  const good = (!cS || cS.red < 3) && (!cG || cG.red < 3);
  $('m-cross').className = 'iv-metric ' + ((cS || cG) ? (good ? 'ok' : 'bad') : '');
  $('m-cross').innerHTML = msg;
  registry.cross.csv = () => csvJoin(['delta_omega', 'single_theory', 'gbc_theory'], curve.map((c) => [c.deltaOmega, c.single, c.gbc]));
  registry.cross.caption = `Gate infidelity vs center-line error Δω for the single robust gate and GBC (δ=${S.deltaKHz} kHz, ṅ=${S.ndot} phonon/ms, n̄=${S.nbar}). ` +
    `Predicted crossover Δω×=${dwx == null ? '—' : dwx.toFixed(3)}δ` + (expX != null ? `; measured ${expX.toFixed(3)}δ (=${fmtHz(expX * S.deltaKHz)})` : '') +
    (cS ? `; single χ²/dof=${cS.red.toFixed(2)}` : '') + (cG ? `, GBC χ²/dof=${cG.red.toFixed(2)}` : '') + '. Theory: leading-order model matching the E1–E3 map.';
}
// interpolate where measured single crosses measured gbc (both sorted by x)
function extractCrossover(dS, dG) {
  const S2 = [...dS].sort((a, b) => a.x - b.x), G2 = [...dG].sort((a, b) => a.x - b.x);
  const lo = Math.max(S2[0].x, G2[0].x), hi = Math.min(S2[S2.length - 1].x, G2[G2.length - 1].x);
  const interp = (arr, x) => { for (let i = 1; i < arr.length; i++) if (arr[i].x >= x) { const t = (x - arr[i - 1].x) / (arr[i].x - arr[i - 1].x || 1); return arr[i - 1].y + t * (arr[i].y - arr[i - 1].y); } return arr[arr.length - 1].y; };
  let prev = null;
  for (let k = 0; k <= 100; k++) { const x = lo + (hi - lo) * k / 100, diff = interp(S2, x) - interp(G2, x); if (prev != null && prev < 0 && diff >= 0) return x; prev = diff; }
  return null;
}

function renderEps4(d) {
  const col = clr(), dws = []; for (let e = -1.82; e <= -0.82; e += 0.025) dws.push(Math.pow(10, e));   // 0.015 .. 0.15 (clean ε⁴, pre-saturation)
  const tau = gateTau(1, S.K);
  const gbc = dws.map((dw) => ({ x: dw, y: Math.max(1e-14, coherentGBC(dw * tau)) }));
  // reference slopes anchored at the smallest Δω
  const x0 = dws[0], y0 = gbc[0].y;
  const ref2 = dws.map((dw) => ({ x: dw, y: y0 * (dw / x0) ** 2 }));
  const ref4 = dws.map((dw) => ({ x: dw, y: y0 * (dw / x0) ** 4 }));
  const data = parseData($('ta-eps4').value);
  // auto y-range from the GBC theory + data (log decades), so the curve fills the plot
  const yvals = gbc.map((p) => p.y).concat(data.map((p) => p.y)).filter((y) => y > 0);
  const ylo = Math.pow(10, Math.floor(Math.log10(Math.min(...yvals))));
  const yhi = Math.pow(10, Math.ceil(Math.log10(Math.max(...yvals))));
  const spec = { key: 'eps4', xlabel: 'Δω  (units of δ)', ylabel: '1 − F (GBC)', xlog: true, ylog: true, xrange: [0.012, 0.18], yrange: [ylo, yhi],
    series: [ { kind: 'line', pts: ref2, color: col.muted, width: 1, label: 'ε² slope' }, { kind: 'line', pts: ref4, color: col.violet, width: 1, label: 'ε⁴ slope' }, { kind: 'line', pts: gbc, color: col.orange, label: 'GBC (theory)' } ] };
  if (data.length) spec.series.push({ kind: 'points', pts: data, color: col.orange, label: 'GBC (meas.)' });
  plot($('cv-eps4'), spec);
  let msg = 'Theory slope → ε⁴.';
  if (data.length >= 2) { const p = logslope(data); msg = `Measured log–log slope = <b>${p.toFixed(2)}</b> (expect 4 for GBC; 2 = uncompensated).`; $('m-eps4').className = 'iv-metric ' + (p > 3.2 ? 'ok' : 'bad'); }
  else $('m-eps4').className = 'iv-metric';
  $('m-eps4').innerHTML = msg;
  registry.eps4.csv = () => csvJoin(['delta_omega', 'gbc_theory'], gbc.map((c) => [c.x, c.y]));
  registry.eps4.caption = `GBC infidelity vs Δω (log–log), showing the ε⁴ suppression (δ=${S.deltaKHz} kHz)` + (data.length >= 2 ? `; measured slope ${logslope(data).toFixed(2)}` : '') + '.';
}
function logslope(data) { const d = [...data].filter((p) => p.y > 0).sort((a, b) => a.x - b.x); if (d.length < 2) return NaN; const a = d[0], b = d[d.length - 1]; return Math.log(b.y / a.y) / Math.log(b.x / a.x); }

function renderPenalty(d) {
  const Is = incoherentSingle({ tau: d.tauDimless, kappa: d.kappa, nbar: S.nbar, gammaPhi: d.gammaPhi });
  const ms = parseFloat($('in-floor-s').value), mg = parseFloat($('in-floor-g').value);
  let msg = `Predicted incoherent floor: single <b>${Is.toExponential(2)}</b>, GBC (4τ) <b>${(4 * Is).toExponential(2)}</b> — ratio <b>4.0×</b>.`;
  let cls = '';
  if (Number.isFinite(ms) && Number.isFinite(mg) && ms > 0) { const r = mg / ms; msg += ` &nbsp; Measured ratio = <b>${r.toFixed(2)}×</b> (single ${ms.toExponential(2)}, GBC ${mg.toExponential(2)}).`; cls = (r > 3.3 && r < 4.7) ? 'ok' : 'bad'; }
  $('m-penalty').className = 'iv-metric ' + cls; $('m-penalty').innerHTML = msg;
}

// =============================================================================
// Phase-1 feasibility calculators
// =============================================================================
function renderBandwidth(d) {
  const M = Math.max(1, Math.min(6, parseInt($('in-M').value) || 3)), nseg = 4 * M + 4;
  const rateKHz = nseg / (d.tauSec * 1e3);   // segments per gate / gate-time(ms) = kHz
  const awg = parseFloat($('in-awg').value), dac = parseFloat($('in-dac').value);
  // amplitude dynamic range from the actual robust waveform
  const c = chain(); let dr = NaN;
  try { const sol = solveShapeRobust(c.modes, c.tau); if (sol.ok) { const a = sol.pulse.amp.map(Math.abs).filter((x) => x > 1e-9); dr = Math.max(...a) / Math.min(...a); } } catch (e) { }
  const bitsNeeded = Number.isFinite(dr) ? Math.ceil(Math.log2(dr / 0.01)) : NaN;   // 1% amplitude resolution
  let msg = `n_seg = 4M+4 = <b>${nseg}</b> · gate τ = ${(d.tauSec * 1e6).toFixed(1)} µs · required update rate = <b>${rateKHz.toFixed(0)} kHz</b>`;
  if (Number.isFinite(dr)) msg += ` · amplitude dynamic range ≈ ${dr.toFixed(1)}× ⇒ ≥ <b>${bitsNeeded} bits</b> for 1% resolution`;
  let cls = '';
  if (Number.isFinite(awg)) { const pass = awg >= rateKHz; msg += `<br>AWG update ${awg} kHz — <span class="passfail ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'INSUFFICIENT'}</span> (need ${rateKHz.toFixed(0)} kHz)`; cls = pass ? 'ok' : 'bad'; }
  if (Number.isFinite(dac) && Number.isFinite(bitsNeeded)) { const pass = dac >= bitsNeeded; msg += ` · DAC ${dac} bits — <span class="passfail ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'MARGINAL'}</span> (need ≥${bitsNeeded})`; if (!pass) cls = 'bad'; }
  $('m-bw').className = 'iv-metric ' + cls; $('m-bw').innerHTML = msg;
}
function renderPeak(d) {
  const col = clr(), c = chain(), OmClosKHz = c.op.Omega * wzKHz();   // Ω_closure (ω_z-unit) → kHz
  let amPeak = NaN;
  try { const sol = solveShapeRobust(c.modes, c.tau); if (sol.ok) amPeak = Math.max(...sol.pulse.amp.map(Math.abs)) / c.op.Omega; } catch (e) { }
  const pmPeak = Number.isFinite(amPeak) ? 0.5 * amPeak : NaN;   // E6: PM ≈ ½ AM peak (constant amplitude); multi-mode PM designer not yet built
  const rows = [ ['constant closure', 1, OmClosKHz, ''], ['robust AM (this design)', amPeak, amPeak * OmClosKHz, ''], ['robust PM (constant, est.)', pmPeak, pmPeak * OmClosKHz, ' est.'], ['GBC (same peak as its legs)', amPeak, amPeak * OmClosKHz, ''] ];
  const lasMax = parseFloat($('in-om-max').value);
  let html = '<tr><th>scheme</th><th>peak Ω / Ω_closure</th><th>peak Ω (kHz)</th>' + (Number.isFinite(lasMax) ? '<th>headroom</th>' : '') + '</tr>';
  for (const [name, ratio, kHz, tag] of rows) {
    const r = Number.isFinite(ratio) ? ratio.toFixed(2) + '×' + tag : '—', k = Number.isFinite(kHz) ? fmtHz(kHz) + tag : '—';
    let hd = ''; if (Number.isFinite(lasMax) && Number.isFinite(kHz)) { const pass = lasMax >= kHz; hd = `<td><span class="passfail ${pass ? 'pass' : 'fail'}">${pass ? 'OK' : 'OVER'}</span></td>`; }
    html += `<tr><td>${name}</td><td>${r}</td><td>${k}</td>${Number.isFinite(lasMax) ? hd : ''}</tr>`;
  }
  $('tb-peak').innerHTML = html + `<tr><td colspan="${Number.isFinite(lasMax) ? 4 : 3}" style="color:var(--muted);font-size:11px;border:0;padding-top:6px">Ω_closure(${S.N}-ion COM) = ${fmtHz(OmClosKHz)} at δ=${S.deltaKHz} kHz, η=${S.eta}. PM est. from the E6 single-mode ~½ reduction.</td></tr>`;
}
function renderCal(d) {
  const c = chain(); let t0 = performance.now(), ms = NaN;
  try { solveShapeRobust(c.modes, c.tau); ms = performance.now() - t0; } catch (e) { }
  $('cal-solve').textContent = Number.isFinite(ms) ? `${ms.toFixed(1)} ms (measured, this browser)` : '—';
  $('m-cal').innerHTML = `Robust waveform for the current ${S.N}-ion chain solved in <b>${Number.isFinite(ms) ? ms.toFixed(1) + ' ms' : '—'}</b> — negligible vs. the physical characterization steps below, which are identical to a standard MS gate.`;
}

// =============================================================================
// Phase-3 panels
// =============================================================================
function renderJitter(d) {
  const col = clr(), c = chain(); let sol = null;
  try { sol = solveShapeRobust(c.modes, c.tau); } catch (e) { }
  const spec = { key: 'jit', xlabel: 'boundary timing jitter σ_t  (ns)', ylabel: '1 − F', xlog: false, ylog: false, xrange: [0, 120], yrange: null, series: [], vlines: [] };
  const sig = (ns) => (ns * 1e-9 / d.tauSec) * c.tau;   // σ_t[s]/τ_phys × (dimensionless τ) = jitter in pulse-boundary units
  const nsList = linticks(0, 120, 12);
  if (sol && sol.ok) {
    const curve = jitterCurve(c.modes, sol.pulse, nsList.map(sig), { realizations: 150, rng: mulberry32(4242), thetaTarget: sol.thetaTarget });
    spec.series.push({ kind: 'line', pts: nsList.map((ns, i) => ({ x: ns, y: curve[i].infidelity })), color: col.accent, label: 'robust shaped (theory)' });
    spec.series.push({ kind: 'line', pts: [{ x: 0, y: 1 - sol.fidelity }, { x: 120, y: 1 - sol.fidelity }], color: col.green, width: 1, label: 'constant (immune)' });
  }
  const data = parseData($('ta-jit').value);
  if (data.length) spec.series.push({ kind: 'points', pts: data, color: col.accent, label: 'measured' });
  plot($('cv-jit'), spec);
  let msg = `Theory: 1−F ∝ σ_t² (independent AWG jitter); constant gate immune; common skew ~30× suppressed. σ_t in ns, converted with δ=${S.deltaKHz} kHz (τ=${(d.tauSec * 1e6).toFixed(0)} µs).`;
  if (data.length >= 2) { const p = logslope(data.filter((q) => q.x > 0)); msg = `Measured jitter scaling ≈ σ_t^<b>${p.toFixed(2)}</b> (expect 2). ` + msg; }
  $('m-jit').className = 'iv-metric'; $('m-jit').innerHTML = msg;
  registry.jit.csv = () => { if (!sol || !sol.ok) return 'no waveform'; const cv = jitterCurve(c.modes, sol.pulse, nsList.map(sig), { realizations: 150, rng: mulberry32(4242), thetaTarget: sol.thetaTarget }); return csvJoin(['sigma_t_ns', 'infidelity_theory'], nsList.map((ns, i) => [ns, cv[i].infidelity])); };
  registry.jit.caption = `Fidelity vs boundary timing jitter σ_t for the robust shaped pulse; theory ∝σ_t² (independent AWG jitter), constant gate immune (δ=${S.deltaKHz} kHz).`;
}
function renderSpecies() {
  const caX = parseFloat($('in-ca-dwx').value), caO = parseFloat($('in-ca-om').value), ybX = parseFloat($('in-yb-dwx').value), ybO = parseFloat($('in-yb-om').value);
  let msg = 'Prediction: Δω<sup>×</sup> identical (dimensionless); Ω_closure ∝ 1/η ⇒ ratio Ω_Ca/Ω_Yb ≈ η_Yb/η_Ca = 0.19/0.10 = 1.9.';
  let cls = '';
  if ([caX, ybX].every(Number.isFinite)) { const dev = Math.abs(caX - ybX) / ((caX + ybX) / 2); msg += `<br>Measured Δω<sup>×</sup>: Ca ${caX.toFixed(3)}, Yb ${ybX.toFixed(3)} — differ by <b>${(100 * dev).toFixed(1)}%</b> (universality holds if ≲ few %). `; cls = dev < 0.1 ? 'ok' : 'bad'; }
  if ([caO, ybO].every(Number.isFinite) && ybO > 0) { const r = caO / ybO; msg += `Ω ratio = <b>${r.toFixed(2)}</b> (predict ≈1.9).`; }
  $('m-spec').className = 'iv-metric ' + cls; $('m-spec').innerHTML = msg;
}
function renderLoad(d) {
  const col = clr(), c = chain();
  // theory proxy: per-mode heating sensitivity ∝ ∫|α_m(t)|² dt over the gate (target-dominated)
  const NP = 160, slopes = c.modes.map((m) => {
    const es = [m.g[0] >= 0 ? 1 : -1, m.g[1] >= 0 ? 1 : -1]; let acc = 0;
    for (let k = 0; k <= NP; k++) { const a = displacement(m, es, c.tau * k / NP); acc += (a.re * a.re + a.im * a.im); }
    return acc / (NP + 1) * (2 * S.nbar + 1);
  });
  const mx = Math.max(...slopes, 1e-12), rel = slopes.map((s) => s / mx);
  const data = parseData($('ta-load').value);
  const dmap = {}; for (const p of data) dmap[Math.round(p.x)] = p.y;
  const dmax = Math.max(...data.map((p) => p.y), 1e-12);
  // bar chart via plot() as points is awkward; draw bars directly
  const cv = $('cv-load'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height, pad = { l: 54, r: 14, t: 16, b: 46 }; ctx.clearRect(0, 0, w, h);
  const pw = w - pad.l - pad.r, phh = h - pad.t - pad.b, bw = pw / slopes.length;
  ctx.strokeStyle = col.border; ctx.strokeRect(pad.l, pad.t, pw, phh);
  ctx.fillStyle = col.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.fillText('1.0', pad.l - 5, pad.t + 4); ctx.fillText('0', pad.l - 5, pad.t + phh + 3);
  ctx.save(); ctx.translate(14, pad.t + phh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('relative sensitivity', 0, 0); ctx.restore();
  slopes.forEach((s, p) => {
    const x = pad.l + p * bw, bh = phh * rel[p];
    ctx.fillStyle = p === 0 ? col.accent : col.violet; ctx.globalAlpha = 0.85; ctx.fillRect(x + bw * 0.16, pad.t + phh - bh, bw * 0.36, bh); ctx.globalAlpha = 1;
    ctx.fillStyle = col.text; ctx.textAlign = 'center'; ctx.fillText(rel[p].toFixed(2), x + bw * 0.34, pad.t + phh - bh - 4);
    const md = dmap[p]; if (md != null) { const bhm = phh * (md / dmax); ctx.fillStyle = col.orange; ctx.globalAlpha = 0.85; ctx.fillRect(x + bw * 0.52, pad.t + phh - bhm, bw * 0.36, bhm); ctx.globalAlpha = 1; }
    ctx.fillStyle = col.muted; ctx.fillText(p === 0 ? 'COM' : 'm' + (p + 1), x + bw / 2, pad.t + phh + 14);
  });
  ctx.fillStyle = col.accent; ctx.textAlign = 'left'; ctx.fillText('■ theory', pad.l + 6, pad.t + 12); ctx.fillStyle = col.orange; ctx.fillText('■ measured', pad.l + 66, pad.t + 12);
  const spectFrac = (rel.slice(1).reduce((a, b) => a + b, 0)) / (rel[0] || 1);
  $('m-load').className = 'iv-metric'; $('m-load').innerHTML = `Theory: spectators sum to <b>${(100 * spectFrac).toFixed(0)}%</b> of the target-mode sensitivity (target-dominated, E5). Bars normalized to COM; overlay your measured slopes.`;
  registry.load = registry.load || {}; registry.load.csv = () => csvJoin(['mode', 'rel_sensitivity_theory'], rel.map((r, i) => [i, r]));
}
function renderAlt() {
  const c = chain(); let am = NaN; try { const s = solveShapeRobust(c.modes, c.tau); if (s.ok) am = Math.max(...s.pulse.amp.map(Math.abs)) / c.op.Omega; } catch (e) { }
  const rows = [ ['standard MS (constant)', '1×τ', '1×', 'none — fails at Δω>0'], ['robust AM', '1×τ', Number.isFinite(am) ? am.toFixed(1) + '×' : '—', 'symmetric-drift + (with GBC) Δω'], ['robust PM', '1×τ', '≈2× (constant)', 'same as AM, lower/flat peak'], ['GBC', '4×τ', Number.isFinite(am) ? am.toFixed(1) + '×' : '—', 'asymmetric Δω to ε⁴'], ['min-Rabi (Huo et al.)', 'input-only', 'input-only', 'not yet in designer'] ];
  let html = '<tr><th>method</th><th>gate time</th><th>peak Ω/closure</th><th>robustness</th></tr>';
  for (const r of rows) html += `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`;
  $('tb-alt').innerHTML = html;
}

// =============================================================================
// exports
// =============================================================================
function csvJoin(head, rows) { return head.join(',') + '\n' + rows.map((r) => r.map((x) => (typeof x === 'number' ? x : x)).join(',')).join('\n'); }
function download(name, text, type = 'text/csv') { const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
function canvasFor(key) { return { cross: 'cv-cross', eps4: 'cv-eps4', jit: 'cv-jit', load: 'cv-load' }[key]; }
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-plot]'); if (!b) return;
  const key = b.dataset.plot, act = b.dataset.act, reg = registry[key] || {};
  if (act === 'png') { const cv = $(canvasFor(key)); cv.toBlob((blob) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `ms-validation-${key}.png`; a.click(); URL.revokeObjectURL(u); }); }
  else if (act === 'csv' && reg.csv) download(`ms-validation-${key}.csv`, reg.csv());
  else if (act === 'cap' && reg.caption) { navigator.clipboard?.writeText(reg.caption); b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy caption'), 1200); }
});

// =============================================================================
// redraw + wiring
// =============================================================================
function redraw() {
  const d = derive();
  renderRecommendation(d); renderCrossover(d); renderEps4(d); renderPenalty(d);
  renderBandwidth(d); renderPeak(d); renderCal(d);
  renderJitter(d); renderSpecies(); renderLoad(d); renderAlt();
}
function wire(id, key, valId, fmt, after) {
  const el = $(id), v = $(valId); if (!el) return;
  el.addEventListener('input', () => { S[key] = parseFloat(el.value); if (v) v.textContent = fmt(S[key]); if (after) after(); redraw(); }); if (v) v.textContent = fmt(S[key]);
}
function updatePairMax() { const pr = pairs(S.N), el = $('c-pair'); el.max = pr.length - 1; if (S.pairIdx > pr.length - 1) S.pairIdx = 0; el.value = S.pairIdx; const p = pr[S.pairIdx]; $('v-pair').textContent = `${p[0] + 1},${p[1] + 1}`; }
wire('c-eta', 'eta', 'v-eta', (x) => x.toFixed(2), () => setPreset(null));
wire('c-delta', 'deltaKHz', 'v-delta', (x) => x.toFixed(0));
wire('c-K', 'K', 'v-K', (x) => x.toFixed(0));
wire('c-N', 'N', 'v-N', (x) => x.toFixed(0), updatePairMax);
wire('c-pair', 'pairIdx', 'v-pair', () => { const p = pairs(S.N)[S.pairIdx]; return `${p[0] + 1},${p[1] + 1}`; });
wire('c-ndot', 'ndot', 'v-ndot', (x) => x.toFixed(2));
wire('c-T2', 'T2ms', 'v-T2', (x) => x > 0 ? x.toFixed(0) : '∞');
wire('c-nbar', 'nbar', 'v-nbar', (x) => x.toFixed(1));
wire('c-dw', 'dw', 'v-dw', (x) => x.toFixed(3));
for (const [id, key, eta] of [['p-ca', 'ca', 0.10], ['p-yb', 'yb', 0.19]]) $(id).addEventListener('click', () => { S.eta = eta; $('c-eta').value = eta; $('v-eta').textContent = eta.toFixed(2); setPreset(key); redraw(); });
function setPreset(w) { $('p-ca').classList.toggle('on', w === 'ca'); $('p-yb').classList.toggle('on', w === 'yb'); }
for (const id of ['ta-cross-s', 'ta-cross-g', 'ta-eps4', 'ta-jit', 'ta-load', 'in-floor-s', 'in-floor-g', 'in-M', 'in-awg', 'in-dac', 'in-om-max', 'in-ca-dwx', 'in-ca-om', 'in-yb-dwx', 'in-yb-om']) $(id)?.addEventListener('input', redraw);

updatePairMax(); setPreset('ca'); redraw();
