// =============================================================================
// spectrum.js — live magnitude spectrum from accumulated complex FID samples.
//
// Accumulates complex FID samples { real, imag } at a FIXED dwell time, runs a
// math.js FFT over the most recent power-of-two window, and renders the
// magnitude spectrum to a canvas with a frequency axis in Hz.
// =============================================================================

import { create, all } from 'mathjs';
import { plotColors } from './theme.js';
const math = create(all);

export class Spectrum {
  // dwell: sampling interval in seconds (fixed). fftSize: power of two.
  constructor(canvas, { dwell = 1e-3, fftSize = 1024 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dwell = dwell;
    this.fftSize = fftSize;
    this.buf = [];               // ring of complex samples (math.complex)
  }

  setDwell(dwell) { this.dwell = dwell; }

  clear() { this.buf = []; }

  // Push one complex FID sample.
  push(sample) {
    this.buf.push(math.complex(sample.real, sample.imag));
    // Keep at most fftSize samples (sliding window).
    if (this.buf.length > this.fftSize) this.buf.shift();
  }

  // Compute the shifted magnitude spectrum. Returns { freq[], mag[] } or null.
  compute() {
    const N = this.fftSize;
    if (this.buf.length < N) return null;

    // Exponential apodization to suppress truncation ringing (line broadening).
    const lb = 3.0; // Hz
    const windowed = new Array(N);
    for (let n = 0; n < N; n++) {
      const w = Math.exp(-Math.PI * lb * n * this.dwell);
      const c = this.buf[n];
      windowed[n] = math.complex(c.re * w, c.im * w);
    }

    const specRaw = math.fft(windowed);
    const spec = Array.isArray(specRaw) ? specRaw : specRaw.toArray();

    const df = 1 / (N * this.dwell);
    const freq = new Array(N);
    const mag = new Array(N);
    for (let n = 0; n < N; n++) {
      const c = spec[n];
      mag[n] = Math.hypot(c.re, c.im);
      freq[n] = (n < N / 2 ? n : n - N) * df; // fftshift-style Hz axis
    }
    // Reorder into ascending frequency for plotting.
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => freq[a] - freq[b]);
    return {
      freq: order.map((i) => freq[i]),
      mag: order.map((i) => mag[i]),
    };
  }

  draw() {
    const { ctx, canvas } = this;
    const col = plotColors();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // baseline
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 16);
    ctx.lineTo(w, h - 16);
    ctx.stroke();

    const res = this.compute();
    if (!res) {
      ctx.fillStyle = col.text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`accumulating FID… (${this.buf.length}/${this.fftSize})`, 10, h / 2);
      return;
    }

    const { freq, mag } = res;
    const N = freq.length;
    // Display only the central band where our display offsets + multiplets live.
    const fMax = 0.5 / this.dwell;          // Nyquist
    const fView = Math.min(300, fMax);      // Hz half-window to display
    // Absolute noise floor. Real FID peaks are O(10–100); equilibrium noise is
    // ~1e-14. Normalizing to max(FLOOR, peak) means a silent (equilibrium)
    // window divides tiny noise by FLOOR and stays flat, while any genuine
    // signal (peak >> FLOOR) auto-scales normally.
    const NOISE_FLOOR = 0.5;
    const maxMag = Math.max(NOISE_FLOOR, ...mag);

    const xOf = (f) => ((f + fView) / (2 * fView)) * w;
    const yOf = (m) => (h - 16) - (m / maxMag) * (h - 26);

    // frequency grid + labels
    ctx.fillStyle = col.text;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let f = -Math.floor(fView / 100) * 100; f <= fView; f += 100) {
      const x = xOf(f);
      ctx.strokeStyle = col.line;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 16); ctx.stroke();
      ctx.fillText(`${f}`, x, h - 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Hz', w - 20, h - 4);

    // spectrum trace
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < N; i++) {
      if (freq[i] < -fView || freq[i] > fView) continue;
      const x = xOf(freq[i]);
      const y = yOf(mag[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
