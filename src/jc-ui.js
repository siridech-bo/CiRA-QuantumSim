// =============================================================================
// jc-ui.js — canvas visualizers for the Jaynes-Cummings reservoir page:
//   • WignerPlot     — diverging heatmap of the reduced-boson Wigner function
//                      (blue = negative / non-classical, white = 0, red = +),
//                      with X–P axes and a live min(W) negativity readout.
//   • FockBar        — |cₙ|² Fock-population bar chart.
//   • TracePlot      — scrolling ⟨N⟩ (and a second series, e.g. ⟨X⟩) time trace.
// All read theme.js plot colors so they follow the app light/dark theme.
// =============================================================================
import { plotColors } from './theme.js';

// Linear interpolation between two "#rrggbb" hex colors, t∈[0,1].
function lerpHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return [r, g, bl];
}

// -----------------------------------------------------------------------------
// WignerPlot — diverging heatmap. Consumes a wignerGrid() result { W, xmax, n,
// min, max }. The color scale is SYMMETRIC about 0 (±M where M = max|W|) so
// negativity reads as a distinct hue (blue) vs positive (red).
// -----------------------------------------------------------------------------
export class WignerPlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._img = null;
  }

  // grid: from wignerGrid(rhoBoson, {...}). Draws W[i][j] with i=p (top→bottom
  // is +p→−p), j=x (left→right is −x→+x). Returns min(W) for the caller.
  draw(grid) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const c = plotColors();
    ctx.clearRect(0, 0, w, h);
    if (!grid) return NaN;

    const { W, n, xmax } = grid;
    // Symmetric scale about 0 for a true diverging map.
    const M = Math.max(Math.abs(grid.min), Math.abs(grid.max), 1e-12);

    // Plot area leaves a margin for axis labels.
    const pad = 24;
    const size = Math.min(w, h) - pad;
    const x0 = pad, y0 = 4;

    // Build an offscreen n×n image and scale it into the plot box.
    if (!this._img || this._img.width !== n) this._img = ctx.createImageData(n, n);
    const img = this._img;
    // Parse plot bg (zero color) once.
    const bg = c.bg.startsWith('#') ? c.bg : '#0a0d12';
    const zero = [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16)];

    for (let i = 0; i < n; i++) {         // rows: i=0 is p=−xmax ; flip so +p up
      const srcRow = n - 1 - i;
      for (let j = 0; j < n; j++) {       // cols: j=0 is x=−xmax
        const v = W[srcRow][j] / M;       // in [−1,1]
        let rgb;
        if (v >= 0) rgb = lerpHex(rgbToHex(zero), c.wignerPos, Math.min(1, v));
        else rgb = lerpHex(rgbToHex(zero), c.wignerNeg, Math.min(1, -v));
        const o = 4 * (i * n + j);
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
      }
    }
    // Nearest-neighbor upscale via a temp canvas.
    if (!this._tmp) { this._tmp = document.createElement('canvas'); }
    this._tmp.width = n; this._tmp.height = n;
    this._tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._tmp, x0, y0, size, size);

    // Axes (X horizontal, P vertical) + labels.
    ctx.strokeStyle = c.line; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + size / 2); ctx.lineTo(x0 + size, y0 + size / 2); // x-axis
    ctx.moveTo(x0 + size / 2, y0); ctx.lineTo(x0 + size / 2, y0 + size); // p-axis
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('X', x0 + size - 6, y0 + size / 2 - 5);
    ctx.textAlign = 'left';
    ctx.fillText('P', x0 + size / 2 + 5, y0 + 10);
    ctx.textAlign = 'left';
    ctx.fillText(`−${xmax}`, x0, y0 + size + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`+${xmax}`, x0 + size, y0 + size + 14);

    return grid.min;
  }
}

function rgbToHex(rgb) {
  return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------------------------------
// FockBar — |cₙ|² bar chart. Consumes fockPopulations() (length Nc, Σ=1).
// -----------------------------------------------------------------------------
export class FockBar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  draw(pops) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const c = plotColors();
    ctx.clearRect(0, 0, w, h);
    if (!pops || !pops.length) return;

    const Nc = pops.length;
    const pad = 20, base = h - 16;
    const plotW = w - pad - 4, plotH = base - 6;
    const bw = plotW / Nc;
    const max = Math.max(0.05, ...pops);

    // baseline
    ctx.strokeStyle = c.line; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(pad, base); ctx.lineTo(w - 4, base); ctx.stroke();
    ctx.globalAlpha = 1;

    for (let n = 0; n < Nc; n++) {
      const bh = (pops[n] / max) * plotH;
      ctx.fillStyle = c.accent;
      ctx.fillRect(pad + n * bw + 1, base - bh, Math.max(1, bw - 2), bh);
    }
    // labels
    ctx.fillStyle = c.text; ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let n = 0; n < Nc; n += Math.ceil(Nc / 8)) ctx.fillText(String(n), pad + n * bw + bw / 2, h - 3);
    ctx.textAlign = 'left';
    ctx.fillText('|cₙ|²', 2, 10);
    ctx.fillText(`n (max=${max.toFixed(2)})`, w - 92, 10);
  }
}

// -----------------------------------------------------------------------------
// TracePlot — scrolling time trace of one or two series (⟨N⟩ primary, optional
// second like ⟨X⟩). Auto-scales the vertical axis to the visible window.
// -----------------------------------------------------------------------------
export class TracePlot {
  constructor(canvas, { maxPoints = 300, labelA = '⟨N⟩', labelB = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.labelA = labelA; this.labelB = labelB;
    this.A = []; this.B = [];
  }
  push(a, b) {
    this.A.push(a);
    if (b !== undefined && b !== null) this.B.push(b);
    if (this.A.length > this.maxPoints) this.A.shift();
    if (this.B.length > this.maxPoints) this.B.shift();
  }
  clear() { this.A = []; this.B = []; }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const c = plotColors();
    ctx.clearRect(0, 0, w, h);
    const all = this.B.length ? this.A.concat(this.B) : this.A;
    if (all.length < 2) {
      ctx.fillStyle = c.text; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('run to accumulate trace…', 8, h / 2);
      return;
    }
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
    const pad = 6;
    const mapY = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
    const mapX = (i, len) => (i / (len - 1)) * (w - 2) + 1;

    // zero line if in range
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = c.line; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(0, mapY(0)); ctx.lineTo(w, mapY(0)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const drawSeries = (arr, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = mapX(i, arr.length), y = mapY(arr[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawSeries(this.A, c.accent);
    if (this.B.length) drawSeries(this.B, c.accent2);

    // legend + range
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = c.accent; ctx.fillText(this.labelA, 6, 12);
    if (this.labelB) { ctx.fillStyle = c.accent2; ctx.fillText(this.labelB, 44, 12); }
    ctx.fillStyle = c.text; ctx.textAlign = 'right';
    ctx.fillText(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]`, w - 4, 12);
    ctx.textAlign = 'left';
  }
}
