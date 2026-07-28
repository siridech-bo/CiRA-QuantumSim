// =============================================================================
// heatmap.js — 8x8 |ρ| density-matrix heatmap on a 2D canvas.
// Consumes rhoAbs() (plain 8x8 array of magnitudes). Brighter = larger |ρ_ij|.
// =============================================================================

export class DensityHeatmap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // Viridis-ish colormap for value v in [0,1].
  static color(v) {
    v = Math.max(0, Math.min(1, v));
    // simple dark-blue -> teal -> yellow ramp
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.6 * v - 0.4)));
    const g = Math.round(255 * Math.min(1, Math.max(0, 1.4 * v)));
    const b = Math.round(255 * Math.min(1, Math.max(0, 0.9 - 0.9 * v) + 0.25));
    return `rgb(${r},${g},${b})`;
  }

  draw(rhoAbs) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!rhoAbs) return;

    const N = rhoAbs.length; // 8
    const cell = Math.floor(Math.min(w, h) / N);
    const x0 = (w - cell * N) / 2;
    const y0 = (h - cell * N) / 2;

    // Normalize to the current max magnitude (Tr ρ = 1 bounds diagonal ≤ 1).
    let max = 1e-9;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) max = Math.max(max, rhoAbs[i][j]);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        ctx.fillStyle = DensityHeatmap.color(rhoAbs[i][j] / max);
        ctx.fillRect(x0 + j * cell, y0 + i * cell, cell - 1, cell - 1);
      }
    }

    // grid label
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('|ρ| (8×8)', x0, y0 - 3);
  }
}
