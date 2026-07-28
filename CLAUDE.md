# CLAUDE.md

## Project: CiRA QuantumSim — NMR Spin Physics 3D Visualizer

A web-based, interactive 3D visualizer of what actually happens inside an NMR quantum
reservoir (real spin physics, not gate-model abstraction). It models the 3-spin system
of a SPINQ Gemini Lab machine (¹H, ³¹P, ¹⁹F) with Bloch spheres, FID, live spectrum,
J-couplings, and a quantum-reservoir-computing (QRC) encoding demo.

**Status: greenfield.** As of this file's creation the repo contains only
[NMR_3D_Visualizer_Spec.md](NMR_3D_Visualizer_Spec.md) — the full design spec. No code,
build tooling, or git repo exists yet. Read the spec before doing anything; it is the
source of truth. This is an educational **side project** for teaching at KMITL — it is
explicitly *not* on the QRC research critical path. Keep scope tight.

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
