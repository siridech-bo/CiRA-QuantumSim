// =============================================================================
// circuit-ui.js — the quantum-circuit editor (SpinQ-Gemini-style).
//
// Renders a 3-row × N-column gate grid, a gate palette, a QASM text view, and a
// projection-probability histogram. Placing gates builds a `circuit` model
// (array of columns; each column an array of { name, targets, angle }) which
// main.js compiles (gates.js) and runs (runner.js) on the REAL engine.
//
// Qubit rows: q0 ¹H, q1 ³¹P, q2 ¹⁹F.  Two-qubit gates (CNOT/CZ) are placed by
// clicking a control cell then a target cell; the connector is drawn across the
// column. This module is pure DOM/canvas — it never touches physics directly.
// =============================================================================
import { plotColors } from './theme.js';

// Default qubit labels (3-spin SpinQ demo). A molecule switch replaces these
// via setMolecule(labels).
const DEFAULT_QUBIT_LABELS = ['q0 ¹H', 'q1 ³¹P', 'q2 ¹⁹F'];
const N_COLS = 12;

// Palette: single-qubit + two-qubit gates. `angle:true` ⇒ prompt for an angle.
const PALETTE = [
  { name: 'H' }, { name: 'I' }, { name: 'X' }, { name: 'Y' }, { name: 'Z' },
  { name: 'SX', label: '√X' }, { name: 'SY', label: '√Y' }, { name: 'SZ', label: '√Z' },
  { name: 'Rx', angle: true }, { name: 'Ry', angle: true }, { name: 'Rz', angle: true },
  { name: 'CNOT', two: true }, { name: 'CZ', two: true },
];

const TWO_Q = new Set(['CNOT', 'CZ']);

export class CircuitUI {
  // container elements: { palette, grid, qasm, histogram, duration }
  // callbacks: { onChange(circuit) }
  constructor(els, callbacks = {}) {
    this.els = els;
    this.cb = callbacks;
    this.selected = null;         // selected palette gate name
    this.pendingAngle = Math.PI / 2;
    this.pendingControl = null;   // { name, qubit, col } while placing a 2-qubit gate
    // Model: grid[col] = array of gate placements. Each placement:
    //   { name, targets:[...spins], angle, col }. Single-qubit occupies 1 row.
    this.gates = [];              // flat list of placements
    this.playCol = -1;
    // Qubit count / labels come from the active molecule; default = 3-spin demo.
    this.qubitLabels = (callbacks.qubitLabels || DEFAULT_QUBIT_LABELS).slice();
    this.nQubits = this.qubitLabels.length;
    this._buildPalette();
    this._buildGrid();
    this.render();
  }

  // Rebuild the grid for a new molecule (labels = ['q0 ¹H', 'q1 ³¹P', ...]).
  // Clears any placed gates (they may reference removed qubit rows).
  setMolecule(labels) {
    this.qubitLabels = labels.slice();
    this.nQubits = labels.length;
    this.gates = [];
    this.pendingControl = null;
    this.playCol = -1;
    this._buildGrid();
    this.render();
    this._emit();
  }

  // ---- circuit model → columns (for the compiler) ---------------------------
  // Group placements by column, preserving order. Returns array of columns.
  toCircuit() {
    const cols = [];
    for (let c = 0; c < N_COLS; c++) {
      const inCol = this.gates.filter((g) => g.col === c);
      if (inCol.length) cols.push(inCol.map((g) => ({ name: g.name, targets: g.targets.slice(), angle: g.angle })));
    }
    return cols;
  }

  // Map a stored column index (0..N_COLS) to its compiled-circuit index (only
  // non-empty columns are compiled). Used to align the playhead.
  compiledColOf(storeCol) {
    let idx = -1;
    for (let c = 0; c <= storeCol; c++) {
      if (this.gates.some((g) => g.col === c)) idx++;
    }
    return idx;
  }
  // Inverse: compiled index → store column (for the playhead highlight).
  storeColOfCompiled(compiledIdx) {
    let idx = -1;
    for (let c = 0; c < N_COLS; c++) {
      if (this.gates.some((g) => g.col === c)) { idx++; if (idx === compiledIdx) return c; }
    }
    return -1;
  }

  clear() {
    this.gates = [];
    this.pendingControl = null;
    this.playCol = -1;
    this.render();
    this._emit();
  }

  setPlayColumn(compiledIdx) {
    this.playCol = compiledIdx < 0 ? -1 : this.storeColOfCompiled(compiledIdx);
    this._paintPlayhead();
  }

  // ---- palette --------------------------------------------------------------
  _buildPalette() {
    const p = this.els.palette;
    p.innerHTML = '';
    PALETTE.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'gate-btn';
      b.textContent = g.label || g.name;
      b.dataset.name = g.name;
      b.title = g.two ? `${g.name}: click control cell, then target cell`
        : (g.angle ? `${g.name}(θ): prompts for angle` : g.name);
      b.addEventListener('click', () => this._selectGate(g, b));
      p.appendChild(b);
    });
  }

  _selectGate(g, btn) {
    this.els.palette.querySelectorAll('.gate-btn').forEach((x) => x.classList.remove('sel'));
    btn.classList.add('sel');
    this.selected = g.name;
    this.pendingControl = null;
    if (g.angle) {
      const val = prompt(`Angle θ for ${g.name} (radians)`, this.pendingAngle.toFixed(4));
      if (val !== null) {
        const parsed = this._parseAngle(val);
        if (!Number.isNaN(parsed)) this.pendingAngle = parsed;
      }
    }
  }

  _parseAngle(s) {
    s = s.trim();
    // allow "pi", "pi/2", "π/2", plain numbers.
    s = s.replace(/π|pi/gi, `${Math.PI}`);
    try { /* eslint-disable no-new-func */ return Function(`"use strict";return (${s})`)(); }
    catch { return parseFloat(s); }
  }

  // ---- grid -----------------------------------------------------------------
  _buildGrid() {
    const grid = this.els.grid;
    grid.innerHTML = '';
    grid.style.setProperty('--cols', N_COLS);
    this.cells = [];
    for (let q = 0; q < this.nQubits; q++) {
      // row label
      const lbl = document.createElement('div');
      lbl.className = 'q-label';
      lbl.textContent = this.qubitLabels[q];
      grid.appendChild(lbl);
      for (let c = 0; c < N_COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'q-cell';
        cell.dataset.q = q; cell.dataset.c = c;
        cell.addEventListener('click', () => this._clickCell(q, c));
        grid.appendChild(cell);
        this.cells.push(cell);
      }
    }
  }

  _clickCell(q, c) {
    if (!this.selected) return;
    const name = this.selected;

    // Existing gate here? clicking it removes it.
    const existing = this.gates.find((g) => g.col === c && g.targets.includes(q));
    if (existing && !this.pendingControl) {
      this.gates = this.gates.filter((g) => g !== existing);
      this.render(); this._emit(); return;
    }

    if (TWO_Q.has(name)) {
      if (!this.pendingControl) {
        this.pendingControl = { name, qubit: q, col: c };
        this._paintPending();
        return;
      }
      // second click = target
      const ctrl = this.pendingControl;
      if (q === ctrl.qubit) { this.pendingControl = null; this.render(); return; }
      // both must be in the same column; force target into control's column.
      const col = ctrl.col;
      // remove anything occupying those cells in that column
      this.gates = this.gates.filter((g) => !(g.col === col && (g.targets.includes(ctrl.qubit) || g.targets.includes(q))));
      // targets order: [control, target]
      this.gates.push({ name, targets: [ctrl.qubit, q], angle: null, col });
      this.pendingControl = null;
      this.render(); this._emit(); return;
    }

    // single-qubit: replace whatever is in that cell
    this.gates = this.gates.filter((g) => !(g.col === c && g.targets.includes(q)));
    const angle = (name === 'Rx' || name === 'Ry' || name === 'Rz') ? this.pendingAngle : null;
    this.gates.push({ name, targets: [q], angle, col: c });
    this.render(); this._emit();
  }

  // ---- rendering ------------------------------------------------------------
  render() {
    // clear cell contents + connectors
    this.cells.forEach((cell) => { cell.innerHTML = ''; cell.className = 'q-cell'; });
    // draw gates
    for (const g of this.gates) {
      if (TWO_Q.has(g.name)) this._paintTwoQubit(g);
      else this._paintSingle(g);
    }
    this._paintPending();
    this._paintPlayhead();
    this._renderQasm();
  }

  _cellAt(q, c) { return this.cells[q * N_COLS + c]; }

  _paintSingle(g) {
    const cell = this._cellAt(g.targets[0], g.col);
    cell.classList.add('filled');
    let txt = g.name === 'SX' ? '√X' : g.name === 'SY' ? '√Y' : g.name === 'SZ' ? '√Z' : g.name;
    if (g.angle != null) txt = `${g.name}(${(g.angle / Math.PI).toFixed(2)}π)`;
    const chip = document.createElement('div');
    chip.className = 'gate-chip';
    chip.textContent = txt;
    cell.appendChild(chip);
  }

  _paintTwoQubit(g) {
    const [ctrl, tgt] = g.targets;
    const cCtrl = this._cellAt(ctrl, g.col);
    const cTgt = this._cellAt(tgt, g.col);
    cCtrl.classList.add('filled');
    cTgt.classList.add('filled');
    // control dot
    const dot = document.createElement('div');
    dot.className = 'ctrl-dot';
    cCtrl.appendChild(dot);
    // target symbol: ⊕ for CNOT, ▣(Z) for CZ
    const sym = document.createElement('div');
    sym.className = 'gate-chip two';
    sym.textContent = g.name === 'CNOT' ? '⊕' : 'Z';
    cTgt.appendChild(sym);
    // vertical connector across intermediate rows (drawn on cells in between)
    const lo = Math.min(ctrl, tgt), hi = Math.max(ctrl, tgt);
    for (let q = lo; q <= hi; q++) {
      const cell = this._cellAt(q, g.col);
      const conn = document.createElement('div');
      conn.className = 'v-conn';
      if (q === lo) conn.classList.add('down');
      else if (q === hi) conn.classList.add('up');
      else conn.classList.add('mid');
      cell.appendChild(conn);
    }
  }

  _paintPending() {
    if (!this.pendingControl) return;
    const cell = this._cellAt(this.pendingControl.qubit, this.pendingControl.col);
    cell.classList.add('pending');
  }

  _paintPlayhead() {
    this.cells.forEach((cell) => cell.classList.remove('playing'));
    if (this.playCol < 0) return;
    for (let q = 0; q < this.nQubits; q++) this._cellAt(q, this.playCol).classList.add('playing');
  }

  // ---- QASM text view -------------------------------------------------------
  _renderQasm() {
    const lines = ['OPENQASM 2.0;', 'include "qelib1.inc";', `qreg q[${this.nQubits}];`, ''];
    for (const col of this.toCircuit()) {
      for (const g of col) {
        lines.push(this._qasmLine(g));
      }
    }
    this.els.qasm.textContent = lines.join('\n');
  }

  _qasmLine(g) {
    const q = (i) => `q[${i}]`;
    switch (g.name) {
      case 'I': return `id ${q(g.targets[0])};`;
      case 'H': return `h ${q(g.targets[0])};`;
      case 'X': return `x ${q(g.targets[0])};`;
      case 'Y': return `y ${q(g.targets[0])};`;
      case 'Z': return `z ${q(g.targets[0])};`;
      case 'SX': return `sx ${q(g.targets[0])};`;
      case 'SY': return `ry(pi/2) ${q(g.targets[0])};`;
      case 'SZ': return `s ${q(g.targets[0])};`;
      case 'Rx': return `rx(${g.angle.toFixed(4)}) ${q(g.targets[0])};`;
      case 'Ry': return `ry(${g.angle.toFixed(4)}) ${q(g.targets[0])};`;
      case 'Rz': return `rz(${g.angle.toFixed(4)}) ${q(g.targets[0])};`;
      case 'CNOT': return `cx ${q(g.targets[0])},${q(g.targets[1])};`;
      case 'CZ': return `cz ${q(g.targets[0])},${q(g.targets[1])};`;
      default: return `// ${g.name}`;
    }
  }

  setDuration(seconds) {
    if (this.els.duration) this.els.duration.textContent = `${(seconds * 1000).toFixed(2)} ms`;
  }

  _emit() { if (this.cb.onChange) this.cb.onChange(this.toCircuit()); }
}

// ---------------------------------------------------------------------------
// Projection-probability histogram: 2^n bars for |q0 … q(n−1)⟩ populations.
// n is inferred from the probs array length (2, 4, 8, …); labels stay legible
// for small n.
// ---------------------------------------------------------------------------
export class Histogram {
  constructor(canvas, nQubits = 3) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nQubits = nQubits;
    this.probs = new Array(1 << nQubits).fill(0);
    this.probs[0] = 1; // |0…0⟩
  }

  // Rebuild for a new qubit count (resets to |0…0⟩).
  setQubits(nQubits) {
    this.nQubits = nQubits;
    this.probs = new Array(1 << nQubits).fill(0);
    this.probs[0] = 1;
    this.draw();
  }

  set(probs) { this.probs = probs; this.draw(); }

  draw() {
    const { ctx, canvas } = this;
    const col = plotColors();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const N = this.probs.length;
    const nBits = Math.round(Math.log2(N));
    const padL = 8, padB = 24, padT = 8, padR = 8;
    const plotW = w - padL - padR, plotH = h - padB - padT;
    const bw = plotW / N;
    // baseline
    ctx.strokeStyle = col.line;
    ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    // Shrink bit-label font as N grows so labels stay legible.
    const labelFont = N <= 8 ? 9 : N <= 16 ? 8 : 6.5;
    ctx.textAlign = 'center';
    for (let b = 0; b < N; b++) {
      const p = Math.max(0, Math.min(1, this.probs[b]));
      const bh = p * plotH;
      const x = padL + b * bw;
      // bar
      ctx.fillStyle = p > 0.001 ? col.accent : col.empty;
      ctx.fillRect(x + 2, h - padB - bh, Math.max(1, bw - 4), bh);
      // value label (only when there's room)
      if (p > 0.02 && N <= 16) {
        ctx.fillStyle = col.text;
        ctx.font = `${labelFont}px ui-monospace, monospace`;
        ctx.fillText(p.toFixed(2), x + bw / 2, h - padB - bh - 3);
      }
      // basis label |q0…>
      ctx.fillStyle = col.text;
      ctx.font = `${labelFont}px ui-monospace, monospace`;
      const bits = b.toString(2).padStart(nBits, '0');
      ctx.fillText(bits, x + bw / 2, h - padB + 12);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = col.text;
    ctx.font = '9px ui-monospace, monospace';
    const qs = Array.from({ length: nBits }, (_, i) => `q${i}`).join(' ');
    ctx.fillText(`|${qs}⟩`, padL, padT + 2);
  }
}
