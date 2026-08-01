# CLAUDE.md

## Project: CiRA QuantumSim — NMR Spin Physics 3D Visualizer

A web-based, interactive 3D visualizer of what actually happens inside an NMR quantum
reservoir (real spin physics, not gate-model abstraction). It models the 3-spin system
of a SPINQ Gemini Lab machine (¹H, ³¹P, ¹⁹F) with Bloch spheres, FID, live spectrum,
J-couplings, and a quantum-reservoir-computing (QRC) encoding demo.

**Status: real quantum engine built (Option A, in-browser).** The app now runs a genuine
**8×8 density-matrix Lindblad simulation** in pure JS (math.js) — no Python backend. The
earlier classical single-vector Bloch MVP (Option B) has been **removed**
(`src/physics.js` is gone). Read [NMR_3D_Visualizer_Spec.md](NMR_3D_Visualizer_Spec.md)
(design) and [README.md](README.md) (current architecture) before changing physics.
This is an educational **side project** for teaching at KMITL — explicitly *not* on the
QRC research critical path. Keep scope tight.

### Molecule library (n-spin, multi-molecule)
The engine is now **molecule-driven and generalized to arbitrary n spins** (2ⁿ density
matrix), not fixed to 3. `src/molecules.js` is the registry: each `Molecule` has nuclei
(label/isotope/color/display-offset/T1/T2), an n×n J-matrix (Hz), field, `addressing`
('hetero'), and `couplingModel` ('weak'), with a cited source. Shipped molecules:
`spinq3` (the original ¹H/³¹P/¹⁹F 3-spin demo, **default**), `dmp` (real SpinQ Gemini
¹H·³¹P sample, J=697.4 Hz, arXiv:2101.10017), `chloroform` (¹H·¹³C, J=215.5 Hz).
**Verified literature numbers only** — display offsets are cosmetic (real hetero offsets=0),
J/T1/T2 are real. The left-sidebar molecule picker calls `loadMolecule(id)` which rebuilds
engine + scene (n spheres) + circuit grid (n rows) + target radios + histogram (2ⁿ bars).
- Backward compat: `new QuantumSpinSystem()` (no args) = the `spinq3` molecule, identical to
  before — this is why the legacy suites pass unchanged. Don't break it.
- Perf: weak-coupling H is diagonal, so free-evolution uses an **O(dim²) elementwise
  commutator** (numerically identical to dense). Real-time target n≤~5. Statevector relax-off
  fast path (n=6–7) and homonuclear/soft-pulse support are **not built yet** — see
  [docs/multi-molecule-extension-plan.md](docs/multi-molecule-extension-plan.md) Phases 2–3.

### Homonuclear molecules + selective soft pulses (Phase 2)
`addressing:'homo'` molecules (all same nucleus, e.g. all-¹³C) share one RF channel and
are distinguished only by chemical shift — their `offsetHz` are REAL chemical shifts (not
display cosmetics). Shipped: `alanine` (3×¹³C, quant-ph/0108068) and `crotonic` (4×¹³C,
arXiv:0704.1181). Single-qubit gates on homo molecules compile to `soft` ops →
`QuantumSpinSystem.softPulse()`: a finite Gaussian pulse on a **shared channel (drives ALL
spins, Σₖσₓ/σᵧ)** integrated under the full Hamiltonian. **Selectivity is EMERGENT** — a
spectator at detuning Δ is only weakly excited when the pulse bandwidth (~1/T) ≪ |Δ| — NOT
hard-wired to the target. (A prior version drove only the target spin, faking selectivity;
QA caught it. The regression test in homonuclear.test.mjs asserts a short/broadband pulse
LOSES selectivity — keep it.) Honest fidelity: alanine >0.99, crotonic ~0.965–0.984
(coupling-during-pulse error; real NMR-QC uses refocusing/optimal control — out of scope).
Homonuclear **two-qubit gates are disabled** (`HOMO_TWO_QUBIT_ENABLED=false`) — selective
refocusing couldn't clear the fidelity bar; don't silently enable them. `couplingModel:'full'`
(isotropic flip-flop `Σ2πJ(IxIx+IyIy+IzIz)`) is implemented for future strongly-coupled
molecules but both shipped homo molecules are weak. FID dwell / spectrum window adapt per
molecule (homo real offsets reach ~21 kHz).

Physics is validated by `test/physics.test.mjs`, `test/gates.test.mjs`,
`test/molecules.test.mjs`, and `test/homonuclear.test.mjs` (`npm test` runs all four, node
assert; the homonuclear suite is slow — crotonic is dim-16 with finite-pulse integration). **Any change to `src/quantum.js` or `src/gates.js` must keep all tests
green** — physics.test asserts Tr(ρ)=1, Hermiticity, positivity, unitary purity, exact
T1/T2 rates, and emergent J-coupling FFT splitting; gates.test asserts every gate's compiled
pulse sequence matches its ideal unitary to >0.999 fidelity, CZ/CNOT correctness, and that
real decoherence lowers fidelity (slow gates more than fast).

### Quantum circuit editor (real pulse sequences)
A SpinQ-style gate editor compiles gates to PHYSICALLY REAL pulse sequences that run on the
same Lindblad engine — never abstract matrices applied as the physics. Modules:
- `src/gates.js` — compiler: gate → timed primitives (`rf` finite selective pulse, `vz`
  virtual-Z, `delay` free evolution, `ipulse` hard refocusing) + ideal unitary + duration.
  Single-qubit = finite RF pulses integrated under H_sys+H_rf; Rz = virtual-Z; **two-qubit
  CZ/CNOT = real J-coupling free evolution for t=1/(2J) with spectator refocusing + vz shift
  corrections**. So CZ(¹H,³¹P) genuinely takes ~11.9 ms and decoheres more than CZ(¹H,¹⁹F).
- `src/ideal-sim.js` — statevector reference simulator; **validation only, never the app's
  physics path**.
- `src/runner.js` — executes a compiled schedule against the live engine in scaled wall-clock
  time so the spheres/FID/spectrum/heatmap/histogram animate as each gate fires.
- `src/circuit-ui.js` — palette + grid + QASM view + playhead + `Histogram`.
Invariant: gates must remain REAL pulses/evolution. Do not shortcut Rx/Ry or the two-qubit
entangling core with `applyUnitary`; `applyUnitary` is for `virtualZ` and tests only.

## Architecture (planned)

Single-page web app, two panels + control bar:
- **Left:** three Bloch spheres (¹H blue, ³¹P green, ¹⁹F orange) with animated
  magnetization vectors and J-coupling lines. Rendered with **Three.js**.
- **Right:** FID trace (real/imag), live FFT spectrum, density-matrix heatmap.
  Plots with Chart.js or Plotly.js.
- **Bottom:** Play/Pause/Reset, speed & τ sliders, RF pulse buttons (90°x, 90°y,
  180°x, custom), target-nucleus selector, encoding demo slider, relaxation & J toggles.

### Physics engine — two options (see spec §"Physics Engine")
- **Option B (start here):** simplified Bloch equations in **pure JavaScript**. No
  server, deploys to GitHub Pages. Classical only — honest Level 1-2 physics, J-coupling
  approximate, no entanglement/density matrix.
- **Option A (later/V3):** Python **FastAPI + QuTiP** backend streaming state to the
  browser over **WebSocket** at ~30 fps, reusing `backend/app/qrc/system.py`. Real
  Lindblad physics + true density matrix. Bloch vectors extracted via `Tr(ρ · σ_k)`.

Recommendation from the spec: build Option B first, upgrade to Option A only if the
project gains traction.

## Roadmap / scope control

- **MVP (1-2 days):** Option B, 3 Bloch spheres + vectors, 90° pulse, T1/T2 relaxation
  animation, FID trace.
- **V2 (~1 week):** approximate J-coupling, live FFT spectrum, encoding demo slider,
  control toggles.
- **V3 (only if it becomes real):** Option A backend, density-matrix viz, full QRC
  encode→evolve→readout demo, figure export.

Do not build ahead of the current stage. Prefer shipping a working MVP over completeness.

## Canonical physics parameters (SPINQ Gemini Lab — use exactly these)

```js
const SPINQ_PARAMS = {
  nuclei: [
    { symbol: '¹H',  name: 'Hydrogen',   freq_MHz: 27.3, T1: 5.0, T2: 0.20, color: '#4A90D9' },
    { symbol: '³¹P', name: 'Phosphorus', freq_MHz: 11.0, T1: 4.5, T2: 0.15, color: '#50C878' },
    { symbol: '¹⁹F', name: 'Fluorine',   freq_MHz: 25.5, T1: 6.0, T2: 0.25, color: '#FF8C00' },
  ],
  couplings: [ { pair: 'H-P', J_Hz: 42 }, { pair: 'H-F', J_Hz: 220 }, { pair: 'P-F', J_Hz: 430 } ],
  B0_T: 1.084,
};
```

- T1/T2 in seconds; J in Hz; frequencies in MHz. Colors are the fixed color code.
- QRC encoding rule: input `s ∈ [0,1]` → `θ = arcsin(√s)` → apply `Rx(θ)` to target nuclei.
- FID = sum of transverse components across spins (`real += My`, `imag += Mx`).

## Conventions

- No package manager or framework is chosen yet. UI may be vanilla JS or React —
  default to the simplest thing that ships the MVP (vanilla + Three.js) unless the user
  asks for React.
- When implementing, follow the reference code and layout diagrams already in the spec
  rather than inventing new structures.
- Environment: Windows, PowerShell primary shell. No git repo yet — offer to `git init`
  before any commit work.

## Reference implementations to study (from spec)

- tkimhofer/nmr_visualisation (Three.js + Bloch — best 3D starting point)
- kherb27/Blochy (clean UI/controls)
- spindrops.org (best physics reference, density matrix)
- drcmr.dk/BlochSimulator (multiple spins)
