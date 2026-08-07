# CiRA QuantumSim — NMR Spin Physics 3D Visualizer

Interactive, in-browser visualizer of **real quantum spin physics** — a genuine
density-matrix Lindblad simulation of NMR quantum-computing systems, plus a second
qubit-boson (Jaynes–Cummings) reservoir substrate. Pure JavaScript (math.js for linear
algebra + FFT), no backend. Educational side project for teaching at KMITL — see
[NMR_3D_Visualizer_Spec.md](NMR_3D_Visualizer_Spec.md) (design),
[CLAUDE.md](CLAUDE.md) (build guidance), and
[docs/multi-molecule-extension-plan.md](docs/multi-molecule-extension-plan.md) (roadmap).

Everything is **real physics, no mocks** — validated by 114 assertions across 5 node test
suites (`npm test`).

## Substrate 1 — NMR spins (`index.html`)

A genuine **2ⁿ density-matrix Lindblad** simulation, generalized to arbitrary n spins and
driven by a **molecule library**:

- Master equation `dρ/dt = −i[H,ρ] + Σ_c(cρc† − ½{c†c,ρ})`, RK4-integrated. Weak-coupling
  H is diagonal ⇒ O(dim²) elementwise commutator fast path (numerically exact).
- **Molecule picker** — 5 real molecules with cited literature parameters:

  | Molecule | Spins | Type | J (Hz) | Source |
  |---|---|---|---|---|
  | SpinQ 3-spin ¹H·³¹P·¹⁹F (default) | 3 | hetero | 42 / 220 / 430 | teaching demo |
  | Dimethylphosphite ¹H·³¹P | 2 | hetero | 697.4 | arXiv:2101.10017 (SpinQ Gemini) |
  | Chloroform ¹H·¹³C | 2 | hetero | 215.5 | arXiv:quant-ph/0405050 |
  | ¹³C-alanine | 3 | **homo** | 34.9 / 53.8 / 1.2 | arXiv:quant-ph/0108068 |
  | Crotonic acid (4×¹³C) | 4 | **homo** | see molecules.js | arXiv:0704.1181 |

- **Heteronuclear** gates use hard channel-selective pulses; **homonuclear** single-qubit
  gates use genuine **frequency-selective soft (Gaussian) pulses** — selectivity is
  *emergent* from detuning-vs-bandwidth (a shared-channel drive), not hard-wired.
- **Quantum circuit editor** (SpinQ-style): gates compile to *physically real* pulse
  sequences on the live engine — single-qubit = finite RF pulses; Rz = virtual-Z;
  **CZ/CNOT = real J-coupling free evolution for t=1/(2J)** with spectator refocusing. A
  CZ(¹H,³¹P) genuinely takes ~11.9 ms and decoheres more than a CZ(¹H,¹⁹F). Homonuclear
  two-qubit gates are disabled (selective refocusing below the fidelity bar — see CLAUDE.md).
- **T1/T2 relaxation** via per-spin amplitude + pure-dephasing collapse operators (togglable).
- **Visuals**: n Bloch spheres with bold shaded 3D vectors from `Tr(ρ σ_k)` (Three.js),
  complex FID, live FFT **spectrum**, 2ⁿ **|ρ| heatmap**, projection-probability histogram.
- **QRC encoding demo**: `s → θ = arcsin(√s) → Rx(θ)`.
- Day/night theme.

## Substrate 2 — Jaynes–Cummings qubit-boson reservoir (`jc.html`)

A separate visualizer implementing the QRC reservoir from Das, Giorgi & Zambrini,
*Phys. Rev. Research* **8**, 023148 (2026): a qubit ⊗ truncated-Fock cavity (dim ~30), real
Lindblad master equation with cavity loss `√κ a`, both **JC** `χ(aσ⁺+a†σ⁻)` and dispersive
**DJC** `χ′a†aσz` Hamiltonians. Input is encoded as the cavity **drive amplitude β**.

- **Live visuals**: the bosonic **Wigner function** (phase space, with non-classical
  *negativity*), the qubit **Bloch sphere**, **Fock-state populations**, and a ⟨N⟩ trace.
- Regime toggle (JC ⇄ DJC), χ/κ/α/Δ sliders, single-window inject, and an input-sequence
  mode to watch fading memory.
- The memory-capacity benchmark (STM / Parity-Check / Mackey-Glass, ridge readout) is
  planned as a **separate Python/QuTiP script** — not built yet.

The NMR app and its engine are entirely independent of this page.

## Run

```powershell
npm install
python serve.py 8000
```

Then open <http://localhost:8000/> (NMR) — switch to the JC substrate via the top-bar
"Substrate: NMR | Jaynes-Cummings" link, or open <http://localhost:8000/jc.html>.

> **Use `serve.py`, not `python -m http.server`.** The plain server sends no `Cache-Control`
> header, so Chrome caches JS modules and can run a stale mix (symptom: the molecule/display
> changes don't take, or `X is not a function` errors). `serve.py` sends `no-store` on every
> response. If you're mid-session on the plain server, do a one-time
> **DevTools → right-click reload → "Empty Cache and Hard Reload"**.

## Tests

```powershell
npm test        # runs all 5 suites (node assert)
```

- `physics.test.mjs` — Tr(ρ)=1, Hermiticity, positivity, unitary purity, exact T1/T2 rates,
  J-coupling FFT splitting.
- `gates.test.mjs` — every gate's compiled pulse sequence matches its ideal unitary to
  >0.999 fidelity; CZ/CNOT correctness; real decoherence lowers fidelity (slow gates more).
- `molecules.test.mjs` — n-spin generalization, per-molecule invariants + T1/T2, diagonal-H
  fast path matches dense, generalized CZ.
- `homonuclear.test.mjs` — soft-pulse **selectivity is emergent** (short/broadband pulses
  lose it), homonuclear gate fidelity, isotropic-J option. *(Slow: crotonic is dim-16 with
  finite-pulse integration.)*
- `jc.test.mjs` — invariants, **vacuum Rabi at freq 2χ**, cavity decay `e^(−κt)`, Wigner
  ∫=1 + Fock-|1⟩ = −1/π negativity + axis-vs-quadrature match, qubit-Bloch signs, DJC ⟨σz⟩
  conservation, echo-state fading memory.

## Layout

```
index.html            NMR app: 3-column shell (molecule picker · circuit + scene · results)
jc.html               Jaynes-Cummings reservoir page
serve.py              no-store static dev server (avoids stale module caching)

src/quantum.js        QuantumSpinSystem — n-spin 2ⁿ density matrix, Lindblad RK4, pulses,
                      soft pulses, encode, blochVectors, fid, rho/rhoAbs, populations
src/molecules.js      Molecule registry (5 molecules) + viewParams (adaptive dwell/spectrum)
src/gates.js          gate → real pulse-sequence compiler (rf / soft / vz / delay / ipulse)
src/ideal-sim.js      statevector reference simulator (validation only)
src/runner.js         executes a compiled schedule against the live engine in scaled time
src/circuit-ui.js     circuit editor (palette / grid / QASM) + projection histogram
src/scene.js          BlochScene — Three.js spheres, bold 3D arrows, J-lines, lighting
src/fid.js            FidPlot — canvas complex-FID trace
src/spectrum.js       Spectrum — FID accumulation + math.js FFT → canvas (adaptive window)
src/heatmap.js        DensityHeatmap — 2ⁿ |ρ| heatmap
src/theme.js          light/dark plot colors
src/main.js           NMR app loop + UI wiring (self-calibrating per-frame step budget)

src/jc.js             JCReservoir — qubit ⊗ Fock Lindblad engine (JC + DJC)
src/wigner.js         exact Fock-basis (Cahill–Glauber) Wigner function
src/jc-ui.js          Wigner heatmap / Fock bars / trace canvases
src/jc-main.js        JC page loop + UI wiring
src/jc.css            JC page styling

test/*.test.mjs       5 node assert-based physics/gate suites
docs/                 research findings + phased multi-molecule extension plan
```
