// =============================================================================
// ion-levels.js — the double-ladder level diagram (Substrate 3 signature element).
// Canvas 2D (NOT three.js: crisp text/labels matter here). Spec §3.1.
//
// Two internal manifolds (g lower, e upper), each carrying a truncated Fock ladder.
// Visual channels:
//   • rung length + brightness  = population ρ_nn in that basis state
//   • rung vertical position     = energy: within a manifold, honest ħω_z·n spacing
//   • arrow thickness            = |Ω_{n,n'}| × current field amplitude Ω
//   • arrow glow / saturation    = resonance proximity of that transition to δ
//   • dashed downward arrows     = spontaneous emission Γ (e → g)
//   • faint ghost rungs          = the distribution ~GHOST_LAG frames ago
//
// Two hard problems, both solved on-screen:
//   1. AXIS BREAK. ω_0/2π ~10¹⁵ Hz vs ω_z/2π ~10⁶ Hz can't be to scale — the two
//      manifolds are drawn separated by a labelled zigzag break; within-manifold
//      spacing stays honest. A motional-zoom control stretches the ω_z ladder.
//   2. DYNAMIC RANGE. During cooling n̄ runs ~11 → 0.01, so rung length maps
//      through sqrt / soft-log as a LABELLED toggle, never a silent transform.
//
// THE FLAGSHIP CONTROL: a draggable detuning line. Drag it and the arrow family
// that ignites changes — carrier at δ=0, red at −ω_z, blue at +ω_z. Resolved-
// sideband spectroscopy in one gesture. The line lives on a δ strip at the bottom;
// dragging calls back with the new δ, the host sets engine.setDetuning(δ), and the
// glowing family emerges from the resonance factor — it is NOT hard-wired.
//
// API (matches heatmap.js / jc-ui.js convention):
//   const d = new LevelDiagram(canvas, { theme, onDetuning });
//   d.draw({ popG, popE, coupling, detuning, rabi, omegaZ, gamma });
// Full redraw per frame is fine (<1 ms for ~60 rungs).
// =============================================================================
import { plotColors } from './theme.js';

const GHOST_LAG = 30;        // frames of delay for the ghost-trail snapshot

export class LevelDiagram {
  constructor(canvas, { theme, onDetuning } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onDetuning = onDetuning || (() => {});
    this.theme = theme;

    // Display state (host wires these to controls).
    this.motionalZoom = 1;        // stretch factor on the ω_z ladder
    this.lengthMap = 'sqrt';      // 'linear' | 'sqrt' | 'log' — rung-length transform
    this.showGhost = true;

    // Ghost-trail ring of {g,e} population snapshots.
    this._ring = [];
    // Cached last draw args (so a control change / drag repaints without the engine).
    this._last = null;
    // δ-strip geometry, recomputed each draw; used for hit-testing the drag.
    this._strip = null;
    this._dragging = false;

    this._bindDrag();
  }

  setMotionalZoom(z) { this.motionalZoom = z; this.redraw(); }
  setLengthMap(m)    { this.lengthMap = m; this.redraw(); }
  setGhost(on)       { this.showGhost = !!on; this.redraw(); }

  // Repaint from the cached args (no fresh engine data needed).
  redraw() { if (this._last) this.draw(this._last, false); }

  // ---- dynamic-range map for rung length (labelled, never silent) -----------
  _mapLen(p) {
    const x = Math.max(0, Math.min(1, p));
    if (this.lengthMap === 'linear') return x;
    if (this.lengthMap === 'log') {
      // soft log: compresses 4+ decades into [0,1], floor at ~1e-4.
      const f = 1e-4;
      return Math.log10(Math.max(x, f) / f) / Math.log10(1 / f);
    }
    return Math.sqrt(x);   // default sqrt
  }

  // ---- pointer → detuning drag ---------------------------------------------
  _bindDrag() {
    const c = this.canvas;
    const pick = (ev) => {
      const r = c.getBoundingClientRect();
      const x = (ev.clientX - r.left) * (c.width / r.width);
      const y = (ev.clientY - r.top) * (c.height / r.height);
      return { x, y };
    };
    const toDelta = (x) => {
      const s = this._strip; if (!s) return null;
      const frac = Math.max(0, Math.min(1, (x - s.x0) / s.w));
      return s.dMin + frac * (s.dMax - s.dMin);
    };
    const onMove = (ev) => {
      if (!this._dragging) return;
      const { x } = pick(ev);
      const d = toDelta(x);
      if (d !== null) this.onDetuning(d);
      ev.preventDefault();
    };
    const onUp = () => { this._dragging = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    c.addEventListener('pointerdown', (ev) => {
      const { x, y } = pick(ev);
      const s = this._strip; if (!s) return;
      // Grab anywhere on the δ strip (generous hit region).
      if (y >= s.y - 4 && y <= s.y + s.h + 4) {
        this._dragging = true;
        const d = toDelta(x); if (d !== null) this.onDetuning(d);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        ev.preventDefault();
      }
    });
    c.style.touchAction = 'none';
    c.style.cursor = 'crosshair';
  }

  // =========================================================================
  // draw({ popG, popE, coupling, detuning, rabi, omegaZ, gamma })
  //   popG,popE : Float64Array(N) diagonal populations of |g,n⟩,|e,n⟩
  //   coupling  : Float64Array(N*N) row-major Ω_{m,n}=Ω|D[m][n]| (couplingMatrix())
  //   detuning  : δ ; rabi : Ω ; omegaZ : ω_z ; gamma : Γ (SE, 0 if off)
  // =========================================================================
  draw(args, snapshot = true) {
    this._last = args;
    const { popG, popE, coupling, detuning, rabi, omegaZ, gamma } = args;
    const N = popG.length;
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const c = plotColors();
    ctx.clearRect(0, 0, w, h);

    // Advance the ghost ring once per real frame (not on control-only redraws).
    if (snapshot) {
      this._ring.push({ g: Float64Array.from(popG), e: Float64Array.from(popE) });
      if (this._ring.length > GHOST_LAG + 1) this._ring.shift();
    }
    const ghost = this.showGhost && this._ring.length > GHOST_LAG ? this._ring[0] : null;

    // ---- layout regions ----------------------------------------------------
    const padL = 46, padR = 12, padT = 16;
    const stripH = 44;                       // δ strip at the bottom
    const gap = 26;                          // zigzag axis-break gap
    const ladTop = padT, ladBot = h - stripH - 10;
    const ladH = ladBot - ladTop;
    const bandH = (ladH - gap) / 2;
    const eTop = ladTop, eBot = ladTop + bandH;             // e manifold band
    const gTop = eBot + gap, gBot = gTop + bandH;           // g manifold band
    const x0 = padL;                          // rung baseline (left)
    const Lmax = w - padL - padR - 8;         // max rung length

    // Rung spacing (honest ω_z within a manifold) × motional zoom.
    const baseSpacing = bandH / Math.max(6, N);
    const dy = baseSpacing * this.motionalZoom;

    // y of |g,n⟩ (energy ω_z·n, increasing UP from gBot) and |e,n⟩ (up from eBot).
    const yG = (n) => gBot - n * dy;
    const yE = (n) => eBot - n * dy;

    // ---- max coupling for arrow-thickness normalisation --------------------
    let cMax = 1e-12;
    for (let i = 0; i < coupling.length; i++) if (coupling[i] > cMax) cMax = coupling[i];

    // ---- arrows (drawn first, under the rungs) -----------------------------
    // Resonance factor: family with resonance at δ_res glows when δ ≈ δ_res.
    const wRes = Math.max(0.18 * omegaZ, rabi);   // resolution width
    const resFactor = (dRes) => 1 / (1 + ((detuning - dRes) / wRes) ** 2);
    const gRes = resFactor(0), rRes = resFactor(-omegaZ), bRes = resFactor(+omegaZ);

    const drawArrow = (n, np, col, glow, thick) => {
      if (n < 0 || n >= N || np < 0 || np >= N) return;
      const y1 = yG(n), y2 = yE(np);
      // both endpoints must sit inside their manifold bands (clips over-zoom).
      if (y1 < gTop - 2 || y1 > gBot + 2 || y2 < eTop - 2 || y2 > eBot + 2) return;
      // small horizontal offset per family so they don't overlap
      const dx = col === c.ionCarrier ? 0 : (col === c.ionBlue ? 10 : -10);
      const ax = x0 + 16 + dx;
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.8 * glow;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.6, 3.2 * thick);
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 * glow;
      ctx.beginPath();
      ctx.moveTo(ax, y1);
      ctx.lineTo(ax, y2);
      ctx.stroke();
      // arrowhead at the e end
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ax, y2); ctx.lineTo(ax - 3, y2 + 6); ctx.lineTo(ax + 3, y2 + 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    for (let n = 0; n < N; n++) {
      const src = popG[n];
      const vis = 0.25 + 0.75 * Math.min(1, src * 6);   // populated sources stand out
      // carrier g,n → e,n ; red g,n → e,n−1 ; blue g,n → e,n+1
      drawArrow(n, n,     c.ionCarrier, gRes * vis, coupling[n * N + n] / cMax);
      drawArrow(n, n - 1, c.ionRed,     rRes * vis, coupling[(n - 1 >= 0 ? (n - 1) : 0) * N + n] / cMax);
      drawArrow(n, n + 1, c.ionBlue,    bRes * vis, coupling[(n + 1 < N ? (n + 1) : 0) * N + n] / cMax);
    }

    // ---- spontaneous-emission dashed downward arrows (e,n → g,n) -----------
    if (gamma > 0) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = c.text;
      for (let n = 0; n < N; n++) {
        if (popE[n] < 1e-3) continue;
        const y2 = yE(n), y1 = yG(n);
        if (y2 < eTop - 2 || y1 > gBot + 2) continue;
        ctx.globalAlpha = 0.15 + 0.5 * Math.min(1, popE[n] * 4);
        ctx.lineWidth = 1;
        const ax = x0 + Lmax * 0.72;
        ctx.beginPath(); ctx.moveTo(ax, y2); ctx.lineTo(ax, y1); ctx.stroke();
      }
      ctx.restore();
    }

    // ---- rungs (ghost first, faint; then live) -----------------------------
    const drawRung = (y, len, col, alpha) => {
      if (y < padT - 2 || y > ladBot + 2) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + Math.max(2, len), y); ctx.stroke();
      ctx.globalAlpha = 1;
    };

    if (ghost) {
      for (let n = 0; n < N; n++) {
        drawRung(yE(n), Lmax * this._mapLen(ghost.e[n]), c.ionGhost, 0.28);
        drawRung(yG(n), Lmax * this._mapLen(ghost.g[n]), c.ionGhost, 0.28);
      }
    }
    for (let n = 0; n < N; n++) {
      const bE = 0.35 + 0.65 * Math.min(1, popE[n] * 4);
      const bG = 0.35 + 0.65 * Math.min(1, popG[n] * 4);
      drawRung(yE(n), Lmax * this._mapLen(popE[n]), c.ionRungE, bE);
      drawRung(yG(n), Lmax * this._mapLen(popG[n]), c.ionRungG, bG);
    }

    // ---- axis break (zigzag) + manifold labels -----------------------------
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    const yz = eBot + gap / 2;
    ctx.beginPath();
    for (let x = x0 - 6, up = true; x < w - padR; x += 8, up = !up) {
      const yy = yz + (up ? -4 : 4);
      if (x === x0 - 6) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.text;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⤒ internal splitting ħω₀ (~10¹⁵ Hz, not to scale)', x0, yz + 3);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = c.ionRungE;
    ctx.fillText('|e,n⟩', 4, eTop + 10);
    ctx.fillStyle = c.ionRungG;
    ctx.fillText('|g,n⟩', 4, gTop + 12);

    // n-axis ticks (honest ω_z spacing) on the g manifold
    ctx.fillStyle = c.text; ctx.globalAlpha = 0.7; ctx.font = '9px system-ui, sans-serif';
    for (let n = 0; n < N; n++) {
      const y = yG(n);
      if (y < gTop || y > gBot + 2) continue;
      ctx.fillText(String(n), 26, y + 3);
    }
    ctx.globalAlpha = 1;

    // ---- δ strip (draggable detuning line) ---------------------------------
    this._drawStrip(ctx, c, x0, w - padR - x0, h - stripH, stripH, detuning, omegaZ,
      { g: gRes, r: rRes, b: bRes });
  }

  _drawStrip(ctx, c, x0, sw, sy, sh, delta, omegaZ, res) {
    const dMax = 1.6 * omegaZ, dMin = -1.6 * omegaZ;
    this._strip = { x0, w: sw, y: sy + 12, h: sh - 14, dMin, dMax };
    const xOf = (d) => x0 + ((d - dMin) / (dMax - dMin)) * sw;

    // baseline axis
    const yb = sy + 12 + (sh - 14) / 2;
    ctx.strokeStyle = c.line; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0 + sw, yb); ctx.stroke();
    ctx.globalAlpha = 1;

    // resonance markers: RSB (−ω_z), carrier (0), BSB (+ω_z)
    const marks = [
      { d: -omegaZ, col: c.ionRed,     label: 'RSB −ω_z', glow: res.r },
      { d: 0,       col: c.ionCarrier, label: 'carrier',  glow: res.g },
      { d: +omegaZ, col: c.ionBlue,    label: 'BSB +ω_z', glow: res.b },
    ];
    ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const m of marks) {
      const x = xOf(m.d);
      ctx.strokeStyle = m.col; ctx.globalAlpha = 0.3 + 0.7 * m.glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, sy + 14); ctx.lineTo(x, sy + sh - 4); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = m.col;
      ctx.fillText(m.label, x, sy + sh + 0);
    }

    // draggable δ handle
    const xh = xOf(delta);
    ctx.fillStyle = c.text; ctx.globalAlpha = 1;
    ctx.strokeStyle = c.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xh, sy + 12); ctx.lineTo(xh, sy + sh - 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(xh, sy + 12, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`δ = ${delta.toFixed(2)} ω_z  ·  drag ⇄`, x0, sy + 8);
    ctx.textAlign = 'left';
  }
}
