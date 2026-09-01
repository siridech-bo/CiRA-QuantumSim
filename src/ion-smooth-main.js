// =============================================================================
// ion-smooth-main.js — UI for the smooth-gate × GBC combining playground
// (ion-smooth.html). Explores which of {plain, smooth, GBC, smooth+GBC} minimizes
// gate infidelity across the two error axes (symmetric Δδ / asymmetric Δω) and where
// combining pays off. Backend: src/ion-smooth.js (+ ion-validation for the ε²/ε⁴ axis).
// =============================================================================
import { buildContext, residualPair, integrateAlpha, filterFunction } from './ion-smooth.js';
import { coherentSingle, coherentGBC } from './ion-validation.js';

// Coherent-error lookup over ε=Δω·τ, built ONCE at load — the ε²/ε⁴ gates use a mathjs
// 4×4 eig per call, far too slow to run per win-map cell; interpolating a table keeps
// redraws interactive. ε up to DW_MAX·τ_s(max) ≈ 3.
const EPS_MAX = 3.6, NE = 360, _cSt = [], _cGt = [];
for (let i = 0; i <= NE; i++) { const e = EPS_MAX * i / NE; _cSt.push(coherentSingle(e)); _cGt.push(coherentGBC(e)); }
const interp = (tab, e) => { const x = Math.min(EPS_MAX, Math.max(0, e)) / EPS_MAX * NE, i = Math.floor(x); return i >= NE ? tab[NE] : tab[i] + (x - i) * (tab[i + 1] - tab[i]); };
const cS = (e) => interp(_cSt, e), cG = (e) => interp(_cGt, e);
const NAMES = ['plain', 'smooth', 'gbc', 'smoothGbc'];
function schemesFast(c, { rP, rS }, { deltaOmega = 0, nbar = 0, kappa = 0, gammaPhi = 0 } = {}) {
  const th = 2 * nbar + 1, symP = th * rP * rP, symS = th * rS * rS, incP = kappa * c.excP * th + gammaPhi * c.tauP, incS = kappa * c.excS * th + gammaPhi * c.tauS;
  return { plain: symP + cS(deltaOmega * c.tauP) + incP, smooth: symS + cS(deltaOmega * c.tauS) + incS, gbc: symP + cG(deltaOmega * c.tauP) + 4 * incP, smoothGbc: symS + cG(deltaOmega * c.tauS) + 4 * incS };
}
const winner = (v) => NAMES.reduce((b, k) => (v[k] < v[b] ? k : b), 'plain');
function crossoverDeltaOmega(c, res, base, a, b, { max = DW_MAX } = {}) {
  const f = (dw) => { const v = schemesFast(c, res, { ...base, deltaOmega: dw }); return v[a] - v[b]; };
  let prev = f(0), pdw = 0; for (let i = 1; i <= 400; i++) { const dw = max * i / 400, d = f(dw); if (prev < 0 && d >= 0) return pdw + prev / (prev - d) * (dw - pdw); prev = d; pdw = dw; } return null;
}
const schemes = schemesFast;   // render functions use the fast path
// interpolate the cached residual grid at an arbitrary Δδ (no per-redraw ODE)
function resAt(G, dd) { const x = dd / DD_MAX * NX - 0.5, i = Math.max(0, Math.min(NX - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i)), a = G.resCols[i].res, b = G.resCols[i + 1].res; return { rP: a.rP + f * (b.rP - a.rP), rS: a.rS + f * (b.rS - a.rS) }; }

const S = { deltaMax: 18, tauD: 40, deltaOmega: 0.004, deltaDrift: 0.02, nbar: 3, kappa: 1, gphi: 1 };
const DW_MAX = 0.012, DD_MAX = 0.05;
const SCHEME = { plain: { c: '#8b949e', label: 'plain (DESE)' }, smooth: { c: '#4A90D9', label: 'smooth (AESE)' }, gbc: { c: '#FF8C00', label: 'GBC' }, smoothGbc: { c: '#50C878', label: 'smooth+GBC' } };
const $ = (id) => document.getElementById(id);
const clr = () => { const s = getComputedStyle(document.body), g = (n, d) => (s.getPropertyValue(n).trim() || d); return { text: g('--text', '#c9d1d9'), muted: g('--muted', '#8b949e'), border: g('--border', '#30363d'), accent: g('--accent', '#4A90D9'), bg: g('--bg', '#0d1117'), red: '#ff5c6c' }; };
const linticks = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

const noise = () => ({ nbar: S.nbar, kappa: S.kappa * 1e-4, gammaPhi: S.gphi * 1e-4 });
const NX = 36, NY = 26;   // win-map grid

// Protocol-dependent heavy compute is cached and only rebuilt when δ_max/τ_d change;
// error/noise sliders then only re-color the map + redraw cheap curves.
let _g = null, _key = '';
function grid() {
  const k = `${S.deltaMax}_${S.tauD}`;
  if (k === _key) return _g;
  const c = buildContext({ deltaMax: S.deltaMax, deltaMin: 1, tauD: S.tauD, tauRamp: 3, tc: 0 });
  const resCols = []; for (let ix = 0; ix < NX; ix++) { const dd = DD_MAX * (ix + 0.5) / NX; resCols.push({ dd, res: residualPair(c, dd, 900) }); }
  const ws = []; for (let e = -1.7; e <= 0.4; e += 0.07) ws.push(Math.pow(10, e));
  const filterD = ws.map((w) => ({ x: w, y: Math.max(1e-14, filterFunction(c.dese, w, { N: 1200 })) }));
  const filterS = ws.map((w) => ({ x: w, y: Math.max(1e-14, filterFunction(c.sm, w, { N: 1200 })) }));
  const tD = integrateAlpha(c.dese, { N: 1200 }).traj, tS = integrateAlpha(c.sm, { N: 2500 }).traj;
  _g = { c, resCols, filterD, filterS, tD, tS }; _key = k; return _g;
}

// ---- generic line plot (log-y optional) --------------------------------------
function linePlot(canvas, spec) {
  const ctxc = canvas.getContext('2d'), col = clr(), w = canvas.width, h = canvas.height, pad = { l: 60, r: 14, t: 14, b: 38 };
  ctxc.clearRect(0, 0, w, h); const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const [x0, x1] = spec.xrange, [y0, y1] = spec.yrange;
  const px = (v) => pad.l + pw * Math.max(0, Math.min(1, (v - x0) / (x1 - x0)));
  const ly = (v) => spec.ylog ? (Math.log10(Math.max(v, y0)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0);
  const py = (v) => pad.t + ph * (1 - Math.max(0, Math.min(1, ly(v))));
  ctxc.strokeStyle = col.border; ctxc.fillStyle = col.muted; ctxc.font = '10px system-ui'; ctxc.lineWidth = 1;
  const yt = spec.ylog ? logdec(y0, y1) : linticks(y0, y1, 5); ctxc.textAlign = 'right';
  for (const t of yt) { const Y = py(t); ctxc.globalAlpha = 0.22; ctxc.beginPath(); ctxc.moveTo(pad.l, Y); ctxc.lineTo(pad.l + pw, Y); ctxc.stroke(); ctxc.globalAlpha = 1; ctxc.fillText(spec.ylog ? '10' + sup(Math.round(Math.log10(t))) : (+t.toFixed(3)), pad.l - 6, Y + 3); }
  const xt = linticks(x0, x1, 5); ctxc.textAlign = 'center';
  for (const t of xt) { const X = px(t); ctxc.fillText((+t.toFixed(4)), X, pad.t + ph + 14); }
  ctxc.strokeStyle = col.border; ctxc.strokeRect(pad.l, pad.t, pw, ph);
  ctxc.fillText(spec.xlabel, pad.l + pw / 2, h - 5);
  ctxc.save(); ctxc.translate(14, pad.t + ph / 2); ctxc.rotate(-Math.PI / 2); ctxc.fillText(spec.ylabel, 0, 0); ctxc.restore();
  for (const v of spec.vlines || []) { if (v.x < x0 || v.x > x1) continue; const X = px(v.x); ctxc.strokeStyle = v.color; ctxc.setLineDash([5, 4]); ctxc.beginPath(); ctxc.moveTo(X, pad.t); ctxc.lineTo(X, pad.t + ph); ctxc.stroke(); ctxc.setLineDash([]); ctxc.fillStyle = v.color; ctxc.textAlign = 'left'; ctxc.fillText(v.label, X + 3, pad.t + 11); }
  for (const s of spec.series) { ctxc.strokeStyle = s.color; ctxc.lineWidth = s.width || 2; ctxc.beginPath(); let st = false; for (const p of s.pts) { if (!Number.isFinite(p.y) || (spec.ylog && p.y <= 0)) { st = false; continue; } const X = px(p.x), Y = py(p.y); st ? ctxc.lineTo(X, Y) : ctxc.moveTo(X, Y); st = true; } ctxc.stroke(); }
  if (spec.mark) { ctxc.strokeStyle = '#fff'; ctxc.lineWidth = 2; const X = px(spec.mark.x), Y = py(spec.mark.y); ctxc.beginPath(); ctxc.moveTo(X - 5, Y - 5); ctxc.lineTo(X + 5, Y + 5); ctxc.moveTo(X + 5, Y - 5); ctxc.lineTo(X - 5, Y + 5); ctxc.stroke(); }
}
const logdec = (a, b) => { const o = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) o.push(Math.pow(10, e)); return o; };
const sup = (e) => (e < 0 ? '⁻' : '') + String(Math.abs(e)).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');

// ---- Panel 1: win-map over (Δδ, Δω) ------------------------------------------
function renderMap() {
  const G = grid(), c = G.c, col = clr(), cv = $('cv-map'), g = cv.getContext('2d'), w = cv.width, h = cv.height, pad = { l: 62, r: 14, t: 12, b: 40 };
  g.clearRect(0, 0, w, h); const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b, cw = pw / NX, ch = ph / NY, nz = noise();
  for (let ix = 0; ix < NX; ix++) {
    const res = G.resCols[ix].res;
    for (let iy = 0; iy < NY; iy++) { const dw = DW_MAX * (iy + 0.5) / NY, wn = winner(schemes(c, res, { ...nz, deltaOmega: dw })); g.fillStyle = SCHEME[wn].c; g.globalAlpha = 0.82; g.fillRect(pad.l + ix * cw, pad.t + (NY - 1 - iy) * ch, cw + 1, ch + 1); }
  }
  g.globalAlpha = 1;
  const mx = pad.l + pw * S.deltaDrift / DD_MAX, my = pad.t + ph * (1 - S.deltaOmega / DW_MAX);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(mx - 6, my - 6); g.lineTo(mx + 6, my + 6); g.moveTo(mx + 6, my - 6); g.lineTo(mx - 6, my + 6); g.stroke();
  g.strokeStyle = col.border; g.strokeRect(pad.l, pad.t, pw, ph);
  g.fillStyle = col.muted; g.font = '10px system-ui'; g.textAlign = 'center';
  for (let k = 0; k <= 5; k++) g.fillText((DD_MAX * k / 5).toFixed(3), pad.l + pw * k / 5, h - pad.b + 14);
  g.fillText('Δδ  mode-frequency (symmetric) error', pad.l + pw / 2, h - 4);
  g.textAlign = 'right'; for (let k = 0; k <= 5; k++) g.fillText((DW_MAX * k / 5).toFixed(4), pad.l - 5, pad.t + ph * (1 - k / 5) + 3);
  g.save(); g.translate(13, pad.t + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('Δω center-line (asymmetric)', 0, 0); g.restore();
  $('lg-map').innerHTML = Object.values(SCHEME).map((s) => `<span class="sw" style="background:${s.c}"></span>${s.label}`).join('') + ' &nbsp;·&nbsp; ✕ = operating point';
}

// ---- Panel 2: net infidelity vs Δω -------------------------------------------
function renderCurve() {
  const G = grid(), c = G.c, col = clr(), nz = noise(), dws = linticks(0, DW_MAX, 120), res = resAt(G, S.deltaDrift);
  const rows = dws.map((dw) => ({ dw, v: schemes(c, res, { ...nz, deltaOmega: dw }) }));
  const series = Object.keys(SCHEME).map((k) => ({ color: SCHEME[k].c, label: SCHEME[k].label, pts: rows.map((r) => ({ x: r.dw, y: r.v[k] })) }));
  const all = rows.flatMap((r) => Object.values(r.v)).filter((y) => y > 0);
  const ylo = Math.pow(10, Math.floor(Math.log10(Math.min(...all)))), yhi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
  const dwxSG = crossoverDeltaOmega(c, res, nz, 'smooth', 'smoothGbc', { max: DW_MAX });
  const dwxPG = crossoverDeltaOmega(c, res, nz, 'plain', 'gbc', { max: DW_MAX });
  const vlines = []; if (dwxSG != null) vlines.push({ x: dwxSG, color: '#50C878', label: 'GBC pays (smooth)' }); if (dwxPG != null) vlines.push({ x: dwxPG, color: '#FF8C00', label: 'GBC pays (plain)' });
  linePlot($('cv-curve'), { xlabel: 'Δω center-line error (units of δ_min)', ylabel: '1 − F', xrange: [0, DW_MAX], yrange: [ylo, yhi], ylog: true, series, vlines, mark: null });
  $('lg-curve').innerHTML = Object.values(SCHEME).map((s) => `<span class="sw" style="background:${s.c}"></span>${s.label}`).join('') +
    `<br>threshold Δω× (add GBC): on smooth = <b style="color:#50C878">${dwxSG == null ? '—' : dwxSG.toExponential(2)}</b>, on plain = <b style="color:#FF8C00">${dwxPG == null ? 'never in range' : dwxPG.toExponential(2)}</b>`;
}

// ---- Panel 3: δ(t) & Ω(t) schedule -------------------------------------------
function renderSched() {
  const c = grid().c, col = clr(), cv = $('cv-sched'), g = cv.getContext('2d'), w = cv.width, h = cv.height, pad = { l: 40, r: 40, t: 16, b: 26 };
  g.clearRect(0, 0, w, h); const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b, tau = c.sm.tau, N = 300;
  g.strokeStyle = col.border; g.strokeRect(pad.l, pad.t, pw, ph);
  const dMax = S.deltaMax, drawLine = (fn, cc, norm) => { g.strokeStyle = cc; g.lineWidth = 2; g.beginPath(); for (let k = 0; k <= N; k++) { const t = tau * k / N, X = pad.l + pw * k / N, Y = pad.t + ph * (1 - fn(t) / norm); k ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); };
  drawLine(c.sm.deltaFn, col.accent, dMax * 1.05);
  const OmMax = Math.max(...linticks(0, tau, 50).map(c.sm.omegaFn)) * 1.05 || 1;
  drawLine(c.sm.omegaFn, '#50C878', OmMax);
  g.fillStyle = col.accent; g.font = '10px system-ui'; g.textAlign = 'left'; g.fillText('δ(t)', pad.l + 4, pad.t + 12);
  g.fillStyle = '#50C878'; g.fillText('Ω(t)', pad.l + 34, pad.t + 12);
  g.fillStyle = col.muted; g.textAlign = 'center'; g.fillText('time  (0 → τ = ' + tau.toFixed(0) + '/δ_min)', pad.l + pw / 2, h - 6);
}

// ---- Panel 4: phase-space α(t) -----------------------------------------------
function renderPhase() {
  const G = grid(), c = G.c, col = clr(), cv = $('cv-phase'), g = cv.getContext('2d'), w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
  g.clearRect(0, 0, w, h);
  const tD = G.tD, tS = G.tS, tSo = integrateAlpha(c.sm, { N: 2500, deltaShift: () => S.deltaDrift }).traj;
  let mR = 1e-9; for (const tr of [tD, tS, tSo]) for (const a of tr) mR = Math.max(mR, Math.abs(a.re), Math.abs(a.im)); const sc = Math.min(w, h) * 0.42 / mR;
  g.strokeStyle = col.border; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(14, cy); g.lineTo(w - 14, cy); g.moveTo(cx, 10); g.lineTo(cx, h - 10); g.stroke(); g.globalAlpha = 1;
  g.fillStyle = col.muted; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
  const draw = (tr, cc, dash) => { g.strokeStyle = cc; g.lineWidth = 1.6; g.setLineDash(dash || []); g.beginPath(); tr.forEach((a, k) => { const x = cx + a.re * sc, y = cy - a.im * sc; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); };
  draw(tD, col.muted); draw(tSo, '#50C878', [4, 3]); draw(tS, col.accent);
  g.font = '10px system-ui'; g.textAlign = 'left'; g.fillStyle = col.muted; g.fillText('DESE loop', 14, 14); g.fillStyle = col.accent; g.fillText('smooth (AESE)', 14, 27); g.fillStyle = '#50C878'; g.fillText('smooth + Δδ offset', 14, 40);
  g.fillStyle = col.muted; g.textAlign = 'right'; g.fillText('Re⟨α⟩', w - 14, cy - 5); g.textAlign = 'left'; g.fillText('Im⟨α⟩', cx + 5, 20);
}

// ---- Panel 5: filter function ------------------------------------------------
function renderFilter() {
  const G = grid(), col = clr(), fD = G.filterD, fS = G.filterS;
  const all = fD.concat(fS).map((p) => p.y).filter((y) => y > 0);
  linePlot($('cv-filter'), { xlabel: 'ω  mode-frequency-noise frequency (units of δ_min)', ylabel: 'F(ω)  sensitivity', xrange: [0.02, 2.5], yrange: [Math.pow(10, Math.floor(Math.log10(Math.min(...all)))), Math.pow(10, Math.ceil(Math.log10(Math.max(...all))))], ylog: true,
    series: [{ color: col.muted, label: 'DESE', pts: fD }, { color: col.accent, label: 'smooth', pts: fS }] });
  $('lg-filter').innerHTML = `<span class="sw" style="background:${col.muted}"></span>constant-δ (DESE) &nbsp; <span class="sw" style="background:${col.accent}"></span>smooth (AESE) — orders of magnitude lower at small ω`;
}

// ---- recommendation card -----------------------------------------------------
function renderRec() {
  const G = grid(), c = G.c, col = clr(), nz = noise(), res = resAt(G, S.deltaDrift), v = schemes(c, res, { ...nz, deltaOmega: S.deltaOmega }), wn = winner(v);
  const dwxSG = crossoverDeltaOmega(c, res, nz, 'smooth', 'smoothGbc', { max: DW_MAX });
  $('sg-rec').innerHTML =
    `<div><div class="verdict" style="color:${SCHEME[wn].c}">${SCHEME[wn].label}</div><span>lowest infidelity at your operating point</span></div>` +
    `<span>1−F: plain <span class="k">${v.plain.toExponential(2)}</span> · smooth <span class="k">${v.smooth.toExponential(2)}</span> · GBC <span class="k">${v.gbc.toExponential(2)}</span> · smooth+GBC <span class="k">${v.smoothGbc.toExponential(2)}</span></span>` +
    `<span>τ_smooth/τ_plain = <span class="k">${(c.tauS / c.tauP).toFixed(0)}×</span></span>` +
    `<span>add-GBC threshold on smooth: Δω× = <span class="k">${dwxSG == null ? '—' : dwxSG.toExponential(2)}</span></span>`;
}

function redraw() { renderRec(); renderMap(); renderCurve(); renderSched(); renderPhase(); renderFilter(); }
function wire(id, key, valId, fmt) { const el = $(id), v = $(valId); el.addEventListener('input', () => { S[key] = parseFloat(el.value); if (v) v.textContent = fmt(S[key]); redraw(); }); if (v) v.textContent = fmt(S[key]); }
wire('c-dmax', 'deltaMax', 'v-dmax', (x) => x.toFixed(0));
wire('c-taud', 'tauD', 'v-taud', (x) => x.toFixed(0));
wire('c-dw', 'deltaOmega', 'v-dw', (x) => x.toFixed(4));
wire('c-dd', 'deltaDrift', 'v-dd', (x) => x.toFixed(3));
wire('c-nbar', 'nbar', 'v-nbar', (x) => x.toFixed(1));
wire('c-kappa', 'kappa', 'v-kappa', (x) => x.toFixed(2));
wire('c-gphi', 'gphi', 'v-gphi', (x) => x.toFixed(2));
redraw();
