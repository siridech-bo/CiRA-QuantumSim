// Lightweight scrolling FID trace on a 2D canvas (dependency-free for the MVP;
// swap for Chart.js/Plotly and add a live spectrum in V2).

export class FidPlot {
  constructor(canvas, maxPoints = 480) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.real = [];
    this.imag = [];
  }

  push(sample) {
    this.real.push(sample.real);
    this.imag.push(sample.imag);
    if (this.real.length > this.maxPoints) {
      this.real.shift();
      this.imag.shift();
    }
  }

  clear() {
    this.real = [];
    this.imag = [];
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);

    // midline
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Auto-scale to peak transverse magnetization (3 spins -> max ~3).
    const scale = mid / 3.2;
    this._trace(this.real, '#4A90D9', scale, mid, w);
    this._trace(this.imag, '#FF8C00', scale, mid, w);
  }

  _trace(data, color, scale, mid, w) {
    if (data.length < 2) return;
    const { ctx } = this;
    const dx = w / this.maxPoints;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * dx;
      const y = mid - v * scale;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
