// =============================================================================
// ion-modes-ui.js — canvas-2D views for the two CLASSICAL modules (Phase 2a):
//   • MathieuView — M1 Paul trap: the a–q stability diagram (operating point +
//     derived q* boundary) and the animated secular+micromotion trajectory. The
//     q slider is the break-it control: push q past q* ≈ 0.908 and the trajectory
//     visibly diverges.
//   • ChainView — M2 Coulomb normal modes: equilibrium ion positions, the mode-
//     frequency bar spectrum, and the eigenvector (mode-shape) display. The N
//     control is the break-it axis: raise N and watch the chain compress and the
//     spectrum fill in, up to the zigzag threshold (which is annotated).
//
// Both are self-contained (own rAF for animation) and theme-aware via plotColors().
// They drive the solvers in src/ion-modes.js and NEVER touch the density-matrix
// engine (src/ion.js). Substrates 1 & 2 are untouched.
// =============================================================================
import { plotColors } from './theme.js';
import { MathieuTrap, IonChain } from './ion-modes.js';

// ===========================================================================
// M1 — Paul-trap Mathieu view.
// ===========================================================================
export class MathieuView {
  constructor({ stabilityCanvas, trajCanvas, statusEl }) {
    this.sc = stabilityCanvas;
    this.scx = stabilityCanvas.getContext('2d');
    this.tc = trajCanvas;
    this.tcx = trajCanvas.getContext('2d');
    this.statusEl = statusEl;

    this.a = 0;
    this.q = 0.4;
    this.trap = new MathieuTrap({ a: this.a, q: this.q });

    // Derive the a=0 boundary q* ONCE (from the monodromy bisection).
    this.qStar = MathieuTrap.lowestBoundaryQ(0, { steps: 2000, iters: 70 });
    // Precompute the stability map for the diagram background.
    this.map = MathieuTrap.stabilityMap({ aMin: -0.3, aMax: 0.3, qMin: 0, qMax: 1.15, na: 41, nq: 61, steps: 260 });

    this._running = false;
    this._rafT = 0;
    this._phase = 0;      // animation phase into the trajectory
  }

  setQ(q) { this.q = q; this.trap.setParams({ q }); this.drawStability(); }
  setA(a) { this.a = a; this.trap.setParams({ a }); this.drawStability(); }

  show() { this._running = true; this.drawStability(); this._loop(); }
  hide() { this._running = false; cancelAnimationFrame(this._rafT); }

  // ---- a–q stability diagram ------------------------------------------------
  drawStability() {
    const ctx = this.scx, w = this.sc.width, h = this.sc.height, col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 44, padR = 14, padT = 14, padB = 30;
    const { aAxis, qAxis, na, nq, stable } = this.map;
    const qMin = qAxis[0], qMax = qAxis[nq - 1], aMin = aAxis[0], aMax = aAxis[na - 1];
    const xOf = (q) => padL + (q - qMin) / (qMax - qMin) * (w - padL - padR);
    const yOf = (a) => padT + (1 - (a - aMin) / (aMax - aMin)) * (h - padT - padB);

    // shaded stable cells
    const cw = (w - padL - padR) / (nq - 1), ch = (h - padT - padB) / (na - 1);
    ctx.fillStyle = col.ionRungG; ctx.globalAlpha = 0.16;
    for (let i = 0; i < na; i++)
      for (let j = 0; j < nq; j++)
        if (stable[i * nq + j]) ctx.fillRect(xOf(qAxis[j]) - cw / 2, yOf(aAxis[i]) - ch / 2, cw + 0.8, ch + 0.8);
    ctx.globalAlpha = 1;

    // axes
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(w - padR, yOf(0)); ctx.stroke();      // a=0 line
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.stroke();

    // derived q* boundary at a=0
    const xs = xOf(this.qStar);
    ctx.strokeStyle = col.ionRed; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xs, padT); ctx.lineTo(xs, h - padB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col.ionRed; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`q* ≈ ${this.qStar.toFixed(3)}`, xs, padT + 10);

    // operating point
    const px = xOf(this.q), py = yOf(this.a);
    const stableNow = this.trap.isStable(1500);
    ctx.fillStyle = stableNow ? col.ionBlue : col.ionRed;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = col.text; ctx.lineWidth = 1; ctx.stroke();

    // labels
    ctx.fillStyle = col.text; ctx.textAlign = 'center'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('q  (RF drive strength)', padL + (w - padL - padR) / 2, h - 8);
    ctx.save(); ctx.translate(12, padT + (h - padT - padB) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('a (DC)', 0, 0); ctx.restore();
    ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = stableNow ? col.ionRungG : col.ionRed;
    ctx.fillText(stableNow ? '● STABLE (|Tr M| < 2)' : '● UNSTABLE (|Tr M| > 2)', padL + 4, h - padB - 6);

    if (this.statusEl) {
      const tr = this.trap.constructor.traceMonodromy(this.a, this.q, 1500);
      const beta = MathieuTrap.betaSecular(this.a, this.q);
      this.statusEl.innerHTML =
        `a=${this.a.toFixed(3)}, q=${this.q.toFixed(3)} · Tr M=${tr.toFixed(3)} · ` +
        `β_sec≈${beta.toFixed(3)} · ${stableNow ? 'stable' : 'UNSTABLE — ion is not trapped'}`;
    }
  }

  // ---- trajectory: secular + micromotion (animated sweep) -------------------
  _loop() {
    if (!this._running) return;
    this._phase += 0.012;
    if (this._phase > 1) this._phase = 0;
    this.drawTrajectory();
    this._rafT = requestAnimationFrame(() => this._loop());
  }

  drawTrajectory() {
    const ctx = this.tcx, w = this.tc.width, h = this.tc.height, col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 8, padR = 8, padT = 14, padB = 16;
    const tauMax = 8 * Math.PI;
    const tr = this.trap.trajectory({ u0: 1, v0: 0, tauMax, steps: 2400 });
    const n = tr.tau.length;

    // y-scale: clamp so a diverging (unstable) run still shows the blow-up onset
    let amp = 0; for (let i = 0; i < n; i++) amp = Math.max(amp, Math.abs(tr.u[i]));
    amp = Math.min(amp, 6);   // cap so the secular motion stays legible
    amp = Math.max(amp, 1.2);
    const xOf = (i) => padL + (tr.tau[i] / tauMax) * (w - padL - padR);
    const yOf = (u) => padT + (1 - (u / amp + 1) / 2) * (h - padT - padB);

    // zero axis
    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(w - padR, yOf(0)); ctx.stroke();
    ctx.globalAlpha = 1;

    // pseudopotential secular envelope (dashed)
    ctx.strokeStyle = col.ionCarrier; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = xOf(i), y = yOf(tr.uSec[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);

    // full trajectory (secular + micromotion), swept in by the animation phase
    const cut = Math.max(2, Math.floor(this._phase * n));
    ctx.strokeStyle = tr.diverged ? col.ionRed : col.ionBlue; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < cut; i++) {
      const yc = Math.max(padT - 4, Math.min(h - padB + 4, yOf(tr.u[i])));
      const x = xOf(i); i === 0 ? ctx.moveTo(x, yc) : ctx.lineTo(x, yc);
    }
    ctx.stroke();
    // moving dot
    if (cut > 1) {
      ctx.fillStyle = tr.diverged ? col.ionRed : col.ionBlue;
      ctx.beginPath(); ctx.arc(xOf(cut - 1), Math.max(padT - 4, Math.min(h - padB + 4, yOf(tr.u[cut - 1]))), 3, 0, 2 * Math.PI); ctx.fill();
    }

    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = col.ionBlue; ctx.fillText('u(τ): secular + micromotion', 8, 11);
    ctx.fillStyle = col.ionCarrier; ctx.fillText('secular envelope', w - 108, 11);
    if (tr.diverged) { ctx.fillStyle = col.ionRed; ctx.textAlign = 'center'; ctx.fillText('⚠ q > q* — trajectory DIVERGES (ion lost)', w / 2, h - 4); }
  }
}

// ===========================================================================
// M2 — Coulomb normal-mode view.
// ===========================================================================
export class ChainView {
  constructor({ posCanvas, barCanvas, shapeCanvas, statusEl }) {
    this.pc = posCanvas; this.pcx = posCanvas.getContext('2d');
    this.bc = barCanvas; this.bcx = barCanvas.getContext('2d');
    this.sc = shapeCanvas; this.scx = shapeCanvas.getContext('2d');
    this.statusEl = statusEl;
    this.N = 2;
    this.selMode = 0;
    this.chain = new IonChain({ N: this.N });
    this._recompute();

    // click a bar to select a mode shape
    this.bc.style.cursor = 'pointer';
    this.bc.addEventListener('click', (ev) => {
      const r = this.bc.getBoundingClientRect();
      const x = (ev.clientX - r.left) * (this.bc.width / r.width);
      const padL = 30, padR = 10;
      const bw = (this.bc.width - padL - padR) / this.N;
      const idx = Math.floor((x - padL) / bw);
      if (idx >= 0 && idx < this.N) { this.selMode = idx; this.drawBars(); this.drawShape(); }
    });
  }

  setN(N) { this.N = N; this.selMode = Math.min(this.selMode, N - 1); this._recompute(); this.drawAll(); }

  _recompute() {
    this.data = this.chain.setN(this.N).modes(this.N);
    this.zigzag = this.chain.zigzagCriticalRatio(this.N);
  }

  show() { this.drawAll(); }
  hide() {}

  drawAll() { this.drawPositions(); this.drawBars(); this.drawShape(); this._status(); }

  _status() {
    if (!this.statusEl) return;
    const eig = this.data.eigenvalues.map((e) => e.toFixed(3)).join(', ');
    this.statusEl.innerHTML =
      `N=${this.N} · eigenvalues λ = [${eig}] · ω = √λ·ω_z · ` +
      `COM = ω_z (N-independent) · zigzag when ω_x/ω_z &lt; ${this.zigzag.toFixed(3)} (linear-chain limit)`;
  }

  // ---- equilibrium ion positions on the axis --------------------------------
  drawPositions() {
    const ctx = this.pcx, w = this.pc.width, h = this.pc.height, col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const pad = 24, yc = h / 2;
    const u = this.data.positions;
    const span = Math.max(1, u[u.length - 1] - u[0]) * 1.15;
    const xOf = (x) => w / 2 + (x / span) * (w - 2 * pad);

    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(pad, yc); ctx.lineTo(w - pad, yc); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < u.length; i++) {
      ctx.fillStyle = col.ionRungE;
      ctx.beginPath(); ctx.arc(xOf(u[i]), yc, 7, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = col.text; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col.text; ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(u[i].toFixed(2), xOf(u[i]), yc + 20);
    }
    ctx.fillStyle = col.text; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('equilibrium positions (units of ℓ)', 6, 12);
  }

  // ---- mode-frequency bar spectrum ------------------------------------------
  drawBars() {
    const ctx = this.bcx, w = this.bc.width, h = this.bc.height, col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const padL = 30, padR = 10, padT = 14, padB = 18;
    const freqs = this.data.frequencies;
    const fMax = Math.max(1.2, ...freqs) * 1.1;
    const bw = (w - padL - padR) / this.N;
    const yOf = (f) => padT + (1 - f / fMax) * (h - padT - padB);

    // ω_z reference line (COM)
    ctx.strokeStyle = col.line; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, yOf(1)); ctx.lineTo(w - padR, yOf(1)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col.text; ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('ω_z', padL - 3, yOf(1) + 3);

    for (let i = 0; i < this.N; i++) {
      const x = padL + i * bw + bw * 0.18, bwid = bw * 0.64;
      const y = yOf(freqs[i]);
      ctx.fillStyle = i === this.selMode ? col.ionBlue : col.ionRungG;
      ctx.globalAlpha = i === this.selMode ? 1 : 0.75;
      ctx.fillRect(x, y, bwid, (h - padB) - y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.text; ctx.textAlign = 'center'; ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(freqs[i].toFixed(2), x + bwid / 2, y - 3);
    }
    ctx.fillStyle = col.text; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('mode freq (ω/ω_z) — click a bar', 6, 11);
  }

  // ---- eigenvector (mode shape) as per-ion arrows ---------------------------
  drawShape() {
    const ctx = this.scx, w = this.sc.width, h = this.sc.height, col = plotColors();
    ctx.clearRect(0, 0, w, h);
    const pad = 24, yc = h / 2;
    const u = this.data.positions;
    const vec = this.data.modes[this.selMode].vector;
    const span = Math.max(1, u[u.length - 1] - u[0]) * 1.15;
    const xOf = (x) => w / 2 + (x / span) * (w - 2 * pad);
    const vmax = Math.max(1e-9, ...vec.map(Math.abs));

    ctx.strokeStyle = col.line; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(pad, yc); ctx.lineTo(w - pad, yc); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < u.length; i++) {
      const x = xOf(u[i]);
      ctx.fillStyle = col.ionRungE;
      ctx.beginPath(); ctx.arc(x, yc, 6, 0, 2 * Math.PI); ctx.fill();
      // displacement arrow (axial) proportional to eigenvector component
      const disp = (vec[i] / vmax) * (pad * 0.9);
      ctx.strokeStyle = disp >= 0 ? col.ionBlue : col.ionRed;
      ctx.fillStyle = disp >= 0 ? col.ionBlue : col.ionRed;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, yc); ctx.lineTo(x + disp, yc); ctx.stroke();
      const s = Math.sign(disp) || 1;
      ctx.beginPath(); ctx.moveTo(x + disp, yc); ctx.lineTo(x + disp - 5 * s, yc - 3); ctx.lineTo(x + disp - 5 * s, yc + 3); ctx.closePath(); ctx.fill();
    }
    const names = ['COM', 'stretch', 'breathing'];
    const label = this.selMode < names.length ? names[this.selMode] : `mode ${this.selMode + 1}`;
    ctx.fillStyle = col.text; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`mode shape: ${label} (ω=${this.data.frequencies[this.selMode].toFixed(3)} ω_z)`, 6, 12);
  }
}
