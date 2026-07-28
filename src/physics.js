// Option B physics engine: simplified classical Bloch equations per spin.
// Honest Level 1-2 physics — no entanglement, no density matrix, J-coupling
// deferred to V2. See NMR_3D_Visualizer_Spec.md §"Physics Engine".

// SPINQ Gemini Lab parameters (canonical — see CLAUDE.md).
// `offset_Hz` is a *display* precession rate in the rotating frame: the real
// MHz Larmor frequencies are far too fast to visualize, so we use small
// chemical-shift-like offsets that give a few visible cycles within T2.
export const SPINQ_PARAMS = {
  nuclei: [
    { symbol: '¹H',  name: 'Hydrogen',   T1: 5.0, T2: 0.20, color: 0x4A90D9, offset_Hz: 12 },
    { symbol: '³¹P', name: 'Phosphorus', T1: 4.5, T2: 0.15, color: 0x50C878, offset_Hz: 20 },
    { symbol: '¹⁹F', name: 'Fluorine',   T1: 6.0, T2: 0.25, color: 0xFF8C00, offset_Hz: 30 },
  ],
  couplings: [ { pair: 'H-P', J_Hz: 42 }, { pair: 'H-F', J_Hz: 220 }, { pair: 'P-F', J_Hz: 430 } ],
  B0_T: 1.084,
};

const TWO_PI = Math.PI * 2;

export class SpinSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;
    // Each spin starts at thermal equilibrium: M along +z.
    this.spins = SPINQ_PARAMS.nuclei.map((n) => ({
      ...n,
      M: [0, 0, 1], // [Mx, My, Mz]
    }));
  }

  // Advance the system by dt seconds of simulation time (with relaxation on/off).
  // Uses small fixed sub-steps so large frame dt stays numerically stable.
  step(dt, relaxation = true) {
    const SUB = 0.001; // 1 ms integration step
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(SUB, remaining);
      this._substep(h, relaxation);
      remaining -= h;
    }
    this.t += dt;
  }

  _substep(h, relaxation) {
    for (const s of this.spins) {
      const [Mx, My, Mz] = s.M;
      const w = TWO_PI * s.offset_Hz; // rotating-frame precession rate (rad/s)

      // Precession about z: dMx = -w*My, dMy = +w*Mx
      let dMx = -w * My;
      let dMy = w * Mx;
      let dMz = 0;

      if (relaxation) {
        dMx += -Mx / s.T2;
        dMy += -My / s.T2;
        dMz += (1.0 - Mz) / s.T1;
      }

      s.M = [Mx + dMx * h, My + dMy * h, Mz + dMz * h];
    }
  }

  // Apply an RF pulse (rotation by `angle` radians about `axis`) to one spin
  // index, or to all spins when spinIndex === 'all'.
  applyPulse(spinIndex, angle, axis = 'x') {
    const targets = spinIndex === 'all'
      ? this.spins
      : [this.spins[spinIndex]];
    const c = Math.cos(angle), sn = Math.sin(angle);
    for (const s of targets) {
      const [Mx, My, Mz] = s.M;
      if (axis === 'x') {
        s.M = [Mx, My * c - Mz * sn, My * sn + Mz * c];
      } else if (axis === 'y') {
        s.M = [Mx * c + Mz * sn, My, -Mx * sn + Mz * c];
      } else if (axis === 'z') {
        s.M = [Mx * c - My * sn, Mx * sn + My * c, Mz];
      }
    }
  }

  // QRC encoding: input s in [0,1] -> theta = arcsin(sqrt(s)) -> Rx(theta).
  encode(sValue, spinIndex = 'all') {
    const theta = Math.asin(Math.sqrt(Math.max(0, Math.min(1, sValue))));
    this.applyPulse(spinIndex, theta, 'x');
    return theta;
  }

  // FID = sum of transverse components (spec convention: real=ΣMy, imag=ΣMx).
  fid() {
    let real = 0, imag = 0;
    for (const s of this.spins) {
      real += s.M[1];
      imag += s.M[0];
    }
    return { real, imag };
  }
}
