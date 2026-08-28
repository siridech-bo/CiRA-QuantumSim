// =============================================================================
// ion-verifier-main.js — UI for the trapped-ion MS-gate verifier (ion-verifier.html).
// Three static panels driven by the analytic kernel (src/ion-msn.js) on a real
// Coulomb-chain mode spectrum (src/ion-modes.js): (1) phase-space loop closure,
// (2) F(δ_COM, Ω) calibration landscape, (3) per-mode error attribution.
// No animation — everything recomputes + redraws on a control change.
// =============================================================================
import { IonChain } from './ion-modes.js';
import { chainModes, chainClosureCOM, report, bellFidelity, displacement, THETA_MS } from './ion-msn.js';

const S = { N: 4, i: 1, j: 3, eta0: 0.06, deltaCOM: 0.2, K: 1, omScale: 1.0, nbar: 0 };
const MC = ['#4A90D9', '#FF8C00', '#50C878', '#b57edc', '#ff5c6c', '#4aa3ff', '#e0c04a'];
const modeName = (p, freq) => `${p === 0 ? 'COM' : 'm' + (p + 1)} (${freq.toFixed(2)})`;

function C() {
  const s = getComputedStyle(document.body), g = (n, d) => (s.getPropertyValue(n).trim() || d);
  return {
    text: g('--text', '#c9d1d9'), muted: g('--muted', '#8b949e'), border: g('--border', '#30363d'),
    accent: g('--accent', '#4A90D9'), panel: g('--panel', '#161b22'), bg: g('--bg', '#0d1117'),
    green: '#50C878', red: '#ff5c6c', violet: '#b57edc',
  };
}
const fidColor = (F) => `hsl(${Math.max(0, Math.min(120, (F - 0.5) / 0.5 * 120))}, 68%, 48%)`;
function label(ctx, t, x, y, col, align = 'left', font = '11px system-ui, sans-serif') {
  ctx.fillStyle = col; ctx.font = font; ctx.textAlign = align; ctx.fillText(t, x, y); ctx.textAlign = 'left';
}

// ---- compute current configuration ------------------------------------------
let spec = null, specN = 0;
function compute() {
  if (specN !== S.N) { spec = new IonChain({ N: S.N }).modes(S.N).modes; specN = S.N; }
  let i = Math.min(S.i, S.N), j = Math.min(S.j, S.N);
  if (i === j) j = i < S.N ? i + 1 : i - 1;
  const pair = [Math.min(i, j) - 1, Math.max(i, j) - 1];
  const op = chainClosureCOM(S.N, { eta0: S.eta0, deltaCOM: S.deltaCOM, K: S.K });
  const Omega = op.Omega * S.omScale;
  const modes = chainModes(spec, pair, { eta0: S.eta0, Omega, muDrive: op.muDrive, nbar: S.nbar });
  return { pair, op, Omega, modes, rep: report(modes, op.tau), tau: op.tau };
}

// ---- Panel 1: phase-space loops ---------------------------------------------
const cvL = document.getElementById('cv-loops'), ctxL = cvL.getContext('2d');
function drawLoops(st) {
  const col = C(), w = cvL.width, h = cvL.height, cx = w / 2, cy = h / 2;
  ctxL.clearRect(0, 0, w, h);
  const NP = 240, trajs = st.modes.map((m) => {
    const es = [m.g[0] >= 0 ? 1 : -1, m.g[1] >= 0 ? 1 : -1];
    const pts = [];
    for (let k = 0; k <= NP; k++) { const t = st.tau * k / NP; pts.push(displacement(m, es, t)); }
    return pts;
  });
  let maxR = 1e-9;
  for (const pts of trajs) for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.re, p.im));
  const sc = Math.min(w, h) * 0.42 / maxR;
  // axes + origin
  ctxL.strokeStyle = col.border; ctxL.globalAlpha = 0.5; ctxL.lineWidth = 1;
  ctxL.beginPath(); ctxL.moveTo(20, cy); ctxL.lineTo(w - 20, cy); ctxL.moveTo(cx, 14); ctxL.lineTo(cx, h - 14); ctxL.stroke();
  ctxL.globalAlpha = 1;
  ctxL.fillStyle = col.muted; ctxL.beginPath(); ctxL.arc(cx, cy, 3, 0, 7); ctxL.fill();
  label(ctxL, 'Re⟨α⟩', w - 22, cy - 6, col.muted, 'right', '10px system-ui');
  label(ctxL, 'Im⟨α⟩', cx + 6, 22, col.muted, 'left', '10px system-ui');
  // each mode's loop
  st.modes.forEach((m, p) => {
    const color = MC[p % MC.length], pts = trajs[p];
    ctxL.strokeStyle = color; ctxL.lineWidth = p === 0 ? 2.4 : 1.6; ctxL.globalAlpha = p === 0 ? 1 : 0.85;
    ctxL.beginPath();
    pts.forEach((a, k) => { const x = cx + a.re * sc, y = cy - a.im * sc; k ? ctxL.lineTo(x, y) : ctxL.moveTo(x, y); });
    ctxL.stroke(); ctxL.globalAlpha = 1;
    const end = pts[pts.length - 1], ex = cx + end.re * sc, ey = cy - end.im * sc;
    ctxL.fillStyle = color; ctxL.beginPath(); ctxL.arc(ex, ey, 4, 0, 7); ctxL.fill();
  });
  // legend
  const lg = document.getElementById('lg-loops');
  lg.innerHTML = st.modes.map((m, p) => {
    const r = st.rep.closure[p];
    return `<span class="sw" style="background:${MC[p % MC.length]}"></span>${modeName(p, spec[p].freq)} — ` +
      `residual <b>${r.residual.toExponential(1)}</b> ${r.closed ? '✓ closed' : '✗ open'}`;
  }).join('');
}

// ---- Panel 2: F(δ_COM, Ω) heatmap -------------------------------------------
const cvH = document.getElementById('cv-heat'), ctxH = cvH.getContext('2d');
const DX0 = 0.05, DX1 = 0.6, OY0 = 0.6, OY1 = 1.4;
function drawHeat(st) {
  const col = C(), w = cvH.width, h = cvH.height, pad = { l: 52, r: 14, t: 12, b: 30 };
  ctxH.clearRect(0, 0, w, h);
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b, NXc = 96, NYc = 52;
  const cw = pw / NXc, ch = ph / NYc;
  for (let ix = 0; ix < NXc; ix++) {
    const dx = DX0 + (DX1 - DX0) * (ix + 0.5) / NXc;
    const op = chainClosureCOM(S.N, { eta0: S.eta0, deltaCOM: dx, K: S.K });
    for (let iy = 0; iy < NYc; iy++) {
      const oy = OY0 + (OY1 - OY0) * (iy + 0.5) / NYc;
      const modes = chainModes(spec, st.pair, { eta0: S.eta0, Omega: op.Omega * oy, muDrive: op.muDrive, nbar: S.nbar });
      const F = bellFidelity(modes, op.tau);
      ctxH.fillStyle = fidColor(F);
      ctxH.fillRect(pad.l + ix * cw, pad.t + (NYc - 1 - iy) * ch, cw + 1, ch + 1);
    }
  }
  // operating-point marker
  const mx = pad.l + pw * (S.deltaCOM - DX0) / (DX1 - DX0);
  const my = pad.t + ph * (1 - (S.omScale - OY0) / (OY1 - OY0));
  ctxH.strokeStyle = '#fff'; ctxH.lineWidth = 2;
  ctxH.beginPath(); ctxH.moveTo(mx - 6, my - 6); ctxH.lineTo(mx + 6, my + 6); ctxH.moveTo(mx + 6, my - 6); ctxH.lineTo(mx - 6, my + 6); ctxH.stroke();
  // axes
  ctxH.strokeStyle = col.border; ctxH.strokeRect(pad.l, pad.t, pw, ph);
  for (let g = 0; g <= 5; g++) {
    const dx = DX0 + (DX1 - DX0) * g / 5, x = pad.l + pw * g / 5;
    label(ctxH, dx.toFixed(2), x, h - pad.b + 14, col.muted, 'center', '9px system-ui');
  }
  label(ctxH, 'δ_COM  (drive → COM, units ω_z)', pad.l + pw / 2, h - 4, col.muted, 'center', '10px system-ui');
  for (let g = 0; g <= 4; g++) {
    const oy = OY0 + (OY1 - OY0) * g / 4, y = pad.t + ph * (1 - g / 4);
    label(ctxH, oy.toFixed(1), pad.l - 6, y + 3, col.muted, 'right', '9px system-ui');
  }
  ctxH.save(); ctxH.translate(13, pad.t + ph / 2); ctxH.rotate(-Math.PI / 2);
  label(ctxH, 'Ω / Ω_closure', 0, 0, col.muted, 'center', '10px system-ui'); ctxH.restore();
  document.getElementById('lg-heat').innerHTML =
    `Fidelity: <span class="sw" style="background:${fidColor(1)}"></span>1.0 &nbsp; <span class="sw" style="background:${fidColor(0.85)}"></span>0.85 &nbsp; <span class="sw" style="background:${fidColor(0.7)}"></span>0.7 &nbsp; <span class="sw" style="background:${fidColor(0.5)}"></span>≤0.5 &nbsp;·&nbsp; ✕ = current operating point`;
}

// ---- Panel 3: error-attribution bars ----------------------------------------
const cvA = document.getElementById('cv-attr'), ctxA = cvA.getContext('2d');
function drawAttr(st) {
  const col = C(), w = cvA.width, h = cvA.height, pad = { l: 14, r: 14, t: 16, b: 40 };
  ctxA.clearRect(0, 0, w, h);
  const items = [{ name: 'phase', val: st.rep.attribution.phase, color: col.violet }]
    .concat(st.rep.attribution.decoherence.perMode.map((m, p) => ({ name: modeName(p, spec[p].freq), val: m.infidelity, color: MC[p % MC.length] })));
  const maxV = Math.max(1e-6, ...items.map((it) => it.val));
  const bw = (w - pad.l - pad.r) / items.length, ph = h - pad.t - pad.b;
  items.forEach((it, k) => {
    const x = pad.l + k * bw, bh = ph * Math.min(1, it.val / maxV);
    ctxA.fillStyle = it.color; ctxA.globalAlpha = 0.9;
    ctxA.fillRect(x + bw * 0.18, pad.t + ph - bh, bw * 0.64, bh); ctxA.globalAlpha = 1;
    label(ctxA, it.val < 1e-4 ? '~0' : it.val.toFixed(3), x + bw / 2, pad.t + ph - bh - 4, col.text, 'center', '10px system-ui');
    label(ctxA, it.name, x + bw / 2, h - pad.b + 15, col.muted, 'center', '10px system-ui');
  });
  label(ctxA, `infidelity contributions  (total 1−F = ${(1 - st.rep.fidelity).toFixed(3)})`, pad.l, 11, col.muted, 'left', '10px system-ui');
}

// ---- summary strip ----------------------------------------------------------
function drawSummary(st) {
  const col = C(), F = st.rep.fidelity, nClosed = st.rep.closure.filter((c) => c.closed).length;
  document.getElementById('iv-summary').innerHTML =
    `<span class="big" style="color:${fidColor(F)}">F = ${F.toFixed(4)}</span>` +
    `<span>Θ = <span class="k">${st.rep.theta.toFixed(4)}</span> (target π/8 = ${THETA_MS.toFixed(4)}, Δ=${st.rep.phaseError.toFixed(4)})</span>` +
    `<span>gate τ = <span class="k">${st.tau.toFixed(2)}</span> /ω_z</span>` +
    `<span>Ω = <span class="k">${st.Omega.toFixed(3)}</span></span>` +
    `<span>modes closed: <span class="k">${nClosed}/${st.modes.length}</span></span>` +
    `<span>gate on ions <span class="k">${st.pair[0] + 1} &amp; ${st.pair[1] + 1}</span> of ${S.N}</span>`;
}

// ---- redraw all -------------------------------------------------------------
function redraw() {
  const st = compute();
  drawSummary(st); drawLoops(st); drawHeat(st); drawAttr(st);
}

// ---- wire controls ----------------------------------------------------------
function wire(id, key, valId, fmt, after) {
  const el = document.getElementById(id), v = document.getElementById(valId);
  el.addEventListener('input', () => {
    S[key] = parseFloat(el.value);
    if (v) v.textContent = fmt(S[key]);
    if (after) after();
    redraw();
  });
  if (v) v.textContent = fmt(S[key]);
}
function clampPairMax() {
  for (const id of ['c-i', 'c-j']) document.getElementById(id).max = S.N;
  S.i = Math.min(S.i, S.N); S.j = Math.min(S.j, S.N);
  document.getElementById('c-i').value = S.i; document.getElementById('c-j').value = S.j;
  document.getElementById('v-i').textContent = S.i; document.getElementById('v-j').textContent = S.j;
}
wire('c-N', 'N', 'v-N', (x) => x.toFixed(0), clampPairMax);
wire('c-i', 'i', 'v-i', (x) => x.toFixed(0));
wire('c-j', 'j', 'v-j', (x) => x.toFixed(0));
wire('c-eta', 'eta0', 'v-eta', (x) => x.toFixed(3), () => setPreset(null));
wire('c-dcom', 'deltaCOM', 'v-dcom', (x) => x.toFixed(2));
wire('c-K', 'K', 'v-K', (x) => x.toFixed(0));
wire('c-om', 'omScale', 'v-om', (x) => x.toFixed(2));
wire('c-nbar', 'nbar', 'v-nbar', (x) => x.toFixed(1));

function setPreset(which) {
  document.getElementById('p-ca').classList.toggle('on', which === 'ca');
  document.getElementById('p-yb').classList.toggle('on', which === 'yb');
}
for (const [id, key] of [['p-ca', 'ca'], ['p-yb', 'yb']]) {
  document.getElementById(id).addEventListener('click', (e) => {
    S.eta0 = parseFloat(e.target.dataset.eta);
    document.getElementById('c-eta').value = S.eta0;
    document.getElementById('v-eta').textContent = S.eta0.toFixed(3);
    setPreset(key); redraw();
  });
}

setPreset('ca');
redraw();
