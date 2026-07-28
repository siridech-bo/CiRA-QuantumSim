# CiRA QuantumSim — NMR Spin Physics 3D Visualizer

Interactive 3D visualizer of a 3-spin NMR quantum reservoir (SPINQ Gemini Lab:
¹H, ³¹P, ¹⁹F). Educational side project — see
[NMR_3D_Visualizer_Spec.md](NMR_3D_Visualizer_Spec.md) for the full design and
[CLAUDE.md](CLAUDE.md) for build guidance.

## Status

**Real quantum engine (Option A, in-browser).** The old classical single-vector
Bloch MVP has been replaced with a genuine **8×8 density-matrix Lindblad
simulation** running entirely in JavaScript (math.js for linear algebra + FFT —
no Python backend required).

- Real Lindblad master equation `dρ/dt = −i[H,ρ] + Σ_c(cρc† − ½{c†c,ρ})`,
  integrated with a 4th-order Runge–Kutta stepper (fixed internal sub-step).
- 3 spin-1/2 nuclei, Hilbert dim 8; true ZZ **J-coupling** (H-P 42, H-F 220,
  P-F 430 Hz), togglable at runtime (rebuilds H).
- T1/T2 relaxation via per-spin amplitude + pure-dephasing collapse operators
  (togglable; OFF ⇒ unitary evolution, purity preserved).
- Instantaneous RF pulses `U = exp(−i(α/2)σ_a)`: 90°x / 90°y / 180°x,
  per-nucleus or all.
- Three Bloch spheres with live vectors from `Tr(ρ σ_k)` (Three.js) + J lines.
- Complex FID `Σ_k (b_x + i b_y)`, live FFT **spectrum** (Hz axis), and an
  **8×8 |ρ| heatmap**.
- QRC **encoding demo**: `s → θ = arcsin(√s) → Rx(θ)`.

## Run

Install the math.js dependency once (used by the node tests; the browser loads
the same version from a CDN via the import map), then serve the folder over HTTP
(ES modules don't work from `file://`):

```powershell
npm install
# then serve statically:
python -m http.server 8000   # or: npx serve .
```

Then open <http://localhost:8000/>.

## Tests

```powershell
npm test        # node test/physics.test.mjs
```

Asserts trace/Hermiticity/positivity of ρ, unitary purity conservation, the
90°x Bloch result, quantitative T1/T2 decay, the equilibrium fixed point, and
J-coupling multiplet splitting via FFT. All physics is real (no mocks).

## Layout

```
index.html         two-panel layout + control bar (import map for three + mathjs)
src/quantum.js     QuantumSpinSystem — 8×8 density matrix, Lindblad RK4, pulses,
                   encode, blochVectors, fid, rho/rhoAbs, SPINQ_PARAMS
src/scene.js       BlochScene — Three.js spheres + arrows + J-coupling lines
src/fid.js         FidPlot — canvas complex-FID trace
src/spectrum.js    Spectrum — accumulate FID at fixed dwell, math.js FFT → canvas
src/heatmap.js     DensityHeatmap — 8×8 |ρ| heatmap
src/main.js        loop + UI wiring
test/physics.test.mjs   node assert-based physics test suite
```
