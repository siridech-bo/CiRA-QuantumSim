# CiRA QuantumSim — NMR Spin Physics 3D Visualizer

Interactive 3D visualizer of a 3-spin NMR quantum reservoir (SPINQ Gemini Lab:
¹H, ³¹P, ¹⁹F). Educational side project — see
[NMR_3D_Visualizer_Spec.md](NMR_3D_Visualizer_Spec.md) for the full design and
[CLAUDE.md](CLAUDE.md) for build guidance.

## Status

**MVP (Option B)** — classical Bloch physics in pure JavaScript, no backend:

- Three Bloch spheres with live magnetization vectors (Three.js)
- 90°x / 90°y / 180°x RF pulses, targetable per nucleus or all
- T1/T2 relaxation animation (toggleable)
- Scrolling FID trace (ΣMy real, ΣMx imag)
- Play/Pause/Reset, simulation-speed slider, orbit camera

Honest scope: this is Level 1-2 classical physics — no entanglement, no density
matrix, and J-coupling/spectrum are deferred to V2 (see spec roadmap).

## Run

No build step or dependencies to install — Three.js loads from a CDN via an
import map. Just serve the folder over HTTP (ES modules don't work from `file://`):

```powershell
# Python
python -m http.server 8000
# or Node
npx serve .
```

Then open <http://localhost:8000/>.

## Layout

```
index.html        two-panel layout + control bar
src/physics.js    SpinSystem — Bloch equations, pulses, FID, SPINQ_PARAMS
src/scene.js      BlochScene — Three.js spheres + magnetization arrows
src/fid.js        FidPlot — canvas FID trace
src/main.js       loop + UI wiring
```

## Next (V2)

Approximate J-coupling, live FFT spectrum, encoding-demo slider
(`θ = arcsin(√s)`), density-matrix heatmap. See spec §"Scope Control".
