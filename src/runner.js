// =============================================================================
// runner.js — executes a compiled TIMED schedule against a live
// QuantumSpinSystem in scaled real (wall-clock) time so the visualization
// animates as each gate fires.
//
// It walks the primitive ops (rf / vz / delay), advancing the engine in small
// sub-steps and sampling fid() at the fixed DWELL (matching main.js) so the FID,
// spectrum, Bloch spheres and heatmap update live, and moving a playhead over
// the currently-executing circuit column.
//
// Timing law: the compiled schedule has REAL durations (µs–ms). We map sim-time
// to wall-clock via `speed` (sim seconds advanced per real second). Two-qubit
// gate delays run under H_system with J-coupling FORCED ON (the compiler owns
// coupling, independent of the UI J toggle). Relaxation follows the engine flag.
// =============================================================================

const DWELL = 1e-3;   // FID sample interval (match main.js)

export class CircuitRunner {
  // system: QuantumSpinSystem. callbacks: {
  //   onSample(fidSample), onTick(state), onColumn(colIdx), onDone(), onGate(gate)
  // }
  constructor(system, callbacks = {}) {
    this.system = system;
    this.cb = callbacks;
    this.compiled = null;      // { schedule, durationSeconds, columns }
    this.reset();
  }

  load(compiled) {
    this.compiled = compiled;
    this.reset();
  }

  reset() {
    this.opIndex = 0;
    this.simTime = 0;          // total sim-time elapsed in the schedule
    this.sampleAccum = 0;      // for fixed-DWELL sampling
    this.running = false;
    this.done = false;
    this.currentCol = -1;
    // Per-op progress (for delays/pulses split across frames).
    this._opRemaining = 0;
    this._opStarted = false;
  }

  start() { if (this.compiled) this.running = true; }
  pause() { this.running = false; }

  // Advance the schedule by up to `dtSim` sim-seconds this frame. Called from
  // the animation loop with dtSim = dtReal * speed (already clamped by caller).
  // If `stopAtColumn` is given, halts before starting any op in a later column
  // (used by Step mode). Zero-duration ops (vz/ipulse) still respect this so a
  // step ends exactly at the column boundary.
  advance(dtSim, stopAtColumn = null) {
    if (!this.running || !this.compiled) return;
    let budget = dtSim;
    // Restore engine coupling ON for the whole run (compiler owns coupling).
    while (budget > 1e-12 && this.opIndex < this.compiled.schedule.length) {
      const op = this.compiled.schedule[this.opIndex];
      if (stopAtColumn !== null && op._col !== stopAtColumn && !this._opStarted) break;
      this._maybeEnterColumn(op);

      if (op.kind === 'vz') {
        // Instantaneous frame change — no time consumed.
        this.system.virtualZ(op.spin, op.angle);
        this._advanceOp();
        continue;
      }

      if (op.kind === 'ipulse') {
        // Instantaneous (hard) refocusing pulse — exact unitary, no time.
        this.system.applyPulse(op.spin, op.angle, op.axis);
        this._advanceOp();
        continue;
      }

      // Timed op (rf or delay): determine its total duration once.
      if (!this._opStarted) {
        this._opRemaining = this._opDuration(op);
        this._opStarted = true;
        this._opCtx = this._beginTimedOp(op);
      }

      const chunk = Math.min(budget, this._opRemaining);
      this._runChunk(op, chunk);
      this._opRemaining -= chunk;
      budget -= chunk;
      this.simTime += chunk;

      if (this._opRemaining <= 1e-12) {
        this._endTimedOp(op, this._opCtx);
        this._advanceOp();
      }
    }

    if (this.opIndex >= this.compiled.schedule.length && !this.done) {
      this.done = true;
      this.running = false;
      this.currentCol = -1;
      if (this.cb.onColumn) this.cb.onColumn(-1);
      if (this.cb.onDone) this.cb.onDone();
    }
  }

  // Run one whole circuit column synchronously (for Step mode). Executes every
  // op tagged with the current column, sampling the FID as it goes, then stops
  // at the column boundary. Returns after one column (or at schedule end).
  step() {
    if (!this.compiled) return;
    if (this.opIndex >= this.compiled.schedule.length) return;
    const startCol = this.compiled.schedule[this.opIndex]._col;
    this.running = true;
    // Advance a generous budget but STOP at the next column boundary. A large
    // budget lets the whole column's ops (delays, pulses, vz) run in one call.
    this.advance(1.0, startCol);
    this.running = false;
  }

  _maybeEnterColumn(op) {
    if (op._col !== undefined && op._col !== this.currentCol) {
      this.currentCol = op._col;
      if (this.cb.onColumn) this.cb.onColumn(op._col);
    }
  }

  _advanceOp() {
    this.opIndex++;
    this._opStarted = false;
    this._opRemaining = 0;
    this._opCtx = null;
  }

  _opDuration(op) {
    if (op.kind === 'rf') return Math.abs(op.angle) / op.omega1;
    if (op.kind === 'delay') return op.tau;
    return 0;
  }

  // Prepare a timed op: for rf, inject H_rf; for delay, force coupling ON.
  _beginTimedOp(op) {
    if (op.kind === 'rf') {
      // Build H_rf and add to the engine Hamiltonian for the pulse's duration.
      // Tighten the sub-step for RF stability (omega1·h ≪ 1); see quantum.js.
      const ctx = { Hsave: this.system.H, subSave: this.system.subStep, diagSave: this.system._Hdiagonal };
      const Hrf = _buildHrfFlat(this.system, op);
      this.system.H = this._addHrf(this.system.H, Hrf);
      // H_rf breaks the diagonal-H fast path → engine falls back to the dense
      // commutator for the pulse's duration.
      this.system._Hdiagonal = false;
      this.system.subStep = Math.min(this.system.subStep, 1 / (100 * (op.omega1 / (2 * Math.PI))));
      return ctx;
    }
    if (op.kind === 'delay') {
      // Force coupling ON during two-qubit gate delays (compiler owns coupling).
      const prevCoupling = this.system.coupling;
      if (!prevCoupling) this.system.setCoupling(true);
      return { prevCoupling };
    }
    return null;
  }

  _endTimedOp(op, ctx) {
    if (op.kind === 'rf') {
      this.system.H = ctx.Hsave;   // restore system Hamiltonian
      this.system.subStep = ctx.subSave;
      this.system._Hdiagonal = ctx.diagSave;
    } else if (op.kind === 'delay') {
      if (ctx && ctx.prevCoupling === false) this.system.setCoupling(false);
    }
  }

  // Advance the engine by `chunk` sim-seconds under whatever H is current,
  // sampling the FID every DWELL.
  _runChunk(op, chunk) {
    let remaining = chunk;
    while (remaining > 1e-12) {
      const toNextSample = DWELL - this.sampleAccum;
      const h = Math.min(remaining, toNextSample, this.system.subStep * 4);
      // Step the engine (RK4 internal substeps); use step() which subdivides.
      this.system.step(h);
      remaining -= h;
      this.sampleAccum += h;
      if (this.sampleAccum >= DWELL - 1e-12) {
        this.sampleAccum = 0;
        if (this.cb.onSample) this.cb.onSample(this.system.fid());
      }
    }
    if (this.cb.onTick) this.cb.onTick(this.system);
  }

  _addHrf(H, Hrf) {
    const out = Float64Array.from(H);
    for (let n = 0; n < out.length; n++) out[n] += Hrf[n];
    return out;
  }
}

// H_rf = (omega1/2)(cosφ σx + sinφ σy) on op.spin, as a flat 2^n×2^n, using the
// ENGINE's embedded operators (so it works for any molecule / n).
function _buildHrfFlat(system, op) {
  const MLEN = system.mlen;
  const Hrf = new Float64Array(MLEN);
  const cx = Math.cos(op.phase), sy = Math.sin(op.phase);
  const w1 = op.omega1;
  const X = system.SXk[op.spin], Y = system.SYk[op.spin];
  for (let n = 0; n < MLEN; n++) Hrf[n] = 0.5 * w1 * (cx * X[n] + sy * Y[n]);
  return Hrf;
}
