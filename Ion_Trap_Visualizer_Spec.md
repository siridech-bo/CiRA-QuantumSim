# CiRA QuantumSim — Substrate 3: Trapped-Ion Process Visualizer

**Status:** specification, not yet implemented
**Sibling documents:** `NMR_3D_Visualizer_Spec.md` (Substrate 1), `CLAUDE.md` (build guidance)
**Entry point:** `ion.html`

---

## 1. Purpose

Trapped-ion quantum computing is hard to learn because five distinct physics problems —
confinement, collective motion, cooling, coherent control, and measurement — are normally
presented fused together. This substrate separates them into modules that can each be run,
perturbed, and broken independently.

The teaching claim of the whole substrate: **every module must expose a control that pushes
the standard textbook approximation past its validity.** Seeing *where* a formula stops
working is the intuition that specialists most often lack. A module without a "break it"
control is incomplete.

### Design continuity with Substrate 1

This is not a new project. It reuses the existing house architecture:

- Pure client-side JavaScript, ES modules, no backend, no build step
- `math.js` for linear algebra and FFT, `three.js` for Bloch spheres only
- Canvas 2D for every plot and diagram
- Served by `serve.py` (the `no-store` dev server — never `python -m http.server`)
- Real physics, no mocks; every claim backed by an assertion in `npm test`
- Day/night theme via the existing `src/theme.js`

### The reuse that makes this cheap

The resonant red sideband in the Lamb–Dicke regime **is** the Jaynes–Cummings Hamiltonian
already implemented in `src/jc.js`:

$$H_{\text{RSB}} = \frac{\eta\Omega}{2}\left(a\sigma^+ + a^\dagger\sigma^-\right)
\quad\longleftrightarrow\quad \chi\left(a\sigma^+ + a^\dagger\sigma^-\right)$$

The blue sideband is anti-JC. The dispersive **DJC** term $\chi' a^\dagger a\,\sigma_z$ is
the geometric-phase regime the Mølmer–Sørensen gate lives in. `src/wigner.js`,
`src/jc-ui.js`, `src/scene.js`, `src/fid.js`, `src/spectrum.js`, `src/heatmap.js` and
`src/theme.js` all port with little or no change.

`src/ion.js` is therefore a **generalization** of `src/jc.js`, not a replacement. The JC page
must keep working unchanged.

---

## 2. Physics engine — `src/ion.js`

### 2.1 Hilbert space

Two internal levels ⊗ truncated motional Fock space.

- `N_FOCK` default `30`, configurable; `dim = 2 * N_FOCK`
- Basis index convention: **`idx = s * N_FOCK + n`**, with `s ∈ {0 = g, 1 = e}`

  This keeps the $gg$ and $ee$ population blocks contiguous (`[0, N)` and `[N, 2N)`), so the
  level diagram can slice populations without a scatter/gather.
- The engine must expose `truncationOccupancy()` = population in the top 3 Fock states, and
  the UI must warn when it exceeds `1e-4`. Silent truncation error is the most likely way
  this simulation lies to a student.

### 2.2 Hamiltonian

Work in the frame rotating at the laser frequency, keeping the motional term. Under the
optical rotating-wave approximation **only** — no sideband RWA:

$$\frac{H}{\hbar} = -\delta\,\lvert e\rangle\langle e\rvert
\;+\; \omega_z\,a^\dagger a
\;+\; \frac{\Omega}{2}\left[\sigma^+ D(i\eta) + \sigma^- D(i\eta)^\dagger\right]$$

where $\delta = \omega_L - \omega_0$ is the laser detuning and
$D(i\eta) = \exp\!\left[i\eta(a + a^\dagger)\right]$.

**This single Hamiltonian must be the default path.** Carrier resonance at $\delta = 0$, red
sideband at $\delta = -\omega_z$ and blue sideband at $\delta = +\omega_z$ then *emerge* from
detuning versus Rabi frequency — they are not hard-wired. This mirrors the emergent
soft-pulse selectivity already established in Substrate 1, and it is what makes the
"resolved-sideband regime" a discoverable fact rather than an assumption.

### 2.3 Displacement matrix elements

For $n' \geq n$:

$$\langle n'\rvert D(i\eta)\lvert n\rangle
= e^{-\eta^2/2}\,(i\eta)^{n'-n}\sqrt{\frac{n!}{n'!}}\;L_n^{(n'-n)}\!\left(\eta^2\right)$$

For $n' < n$ use $\langle n'|D|n\rangle = \left(\langle n|D^\dagger|n'\rangle\right)^*$ with
the same formula and indices swapped.

Generalized Laguerre polynomials by upward recurrence (do **not** use a factorial-ratio
closed form — it overflows above $n \approx 20$; carry $\sqrt{n!/n'!}$ as a running product
in log space or as an incremental product):

```
L_0^(a)(x) = 1
L_1^(a)(x) = 1 + a - x
(k+1) L_{k+1}^(a)(x) = (2k + 1 + a - x) L_k^(a)(x) - (k + a) L_{k-1}^(a)(x)
```

The full matrix is $\eta$-dependent only, so cache it and invalidate on $\eta$ change.

### 2.4 Approximation modes (the "break it" axis)

`setCouplingMode(mode)` with:

| Mode | Matrix elements | Purpose |
|---|---|---|
| `'exact'` | full $D(i\eta)$ above | ground truth, default |
| `'ld'` | $\Omega_{n,n}=\Omega(1-\eta^2 n)$, $\Omega_{n,n-1}=\Omega\eta\sqrt{n}$, $\Omega_{n,n+1}=\Omega\eta\sqrt{n+1}$, all other $\Delta n$ zero | Lamb–Dicke |
| `'jc'` | red sideband only, $\frac{\eta\Omega}{2}(a\sigma^+ + \text{h.c.})$ | the `jc.js` limit |
| `'ajc'` | blue sideband only | anti-JC |

The UI must be able to overlay `'exact'` against `'ld'` in the same plot. The Lamb–Dicke
approximation visibly fails once $\eta\sqrt{n+1} \gtrsim 0.3$; that failure is a deliverable,
not a bug.

### 2.5 Dissipators

Lindblad form as in Substrate 1:
$\dot\rho = -\tfrac{i}{\hbar}[H,\rho] + \sum_c \left(c\rho c^\dagger - \tfrac12\{c^\dagger c, \rho\}\right)$

**Spontaneous emission**, two selectable treatments:

- `recoil: 'none'` — $c = \sqrt{\Gamma}\,\lvert g\rangle\langle e\rvert \otimes I$
  (motion-preserving; pedagogically useful but wrong at the recoil limit)
- `recoil: 'kernel'` — three operators, expanding the emission recoil to $O(\tilde\eta^2)$
  and averaging the dipole pattern over solid angle projected onto the mode axis
  ($\xi \approx 2/5$ for a dipole transition):

  ```
  c_0 = sqrt(Γ (1 - 2 ξ η̃²)) · |g><e| ⊗ I
  c_- = sqrt(Γ ξ η̃²)         · |g><e| ⊗ a
  c_+ = sqrt(Γ ξ η̃²)         · |g><e| ⊗ a†
  ```

  The unnormalised $a$, $a^\dagger$ give the correct $n$ and $n+1$ rate scaling. `η̃` is the
  Lamb–Dicke parameter of the *emitted* photon, generally ≠ the drive `η`.

**Motional bath** (anomalous heating — the reason sideband cooling has a floor):

```
L_- = sqrt(κ (n̄_bath + 1)) · a
L_+ = sqrt(κ  n̄_bath     ) · a†
```

Expose the user-facing parameter as the heating rate $\dot{\bar n} = \kappa\,\bar n_{\text{bath}}$
in quanta per second, which is what experimentalists actually quote.

**Pure dephasing:** $L_\phi = \sqrt{\gamma_\phi/2}\;\sigma_z \otimes I$.

All three groups individually togglable.

### 2.6 Integration

RK4, reusing the self-calibrating per-frame step budget from `src/main.js`. At `N_FOCK = 30`
the density matrix is 60×60; a dense RK4 step is trivial. Do not prematurely add a sparse
path — but *do* keep the diagonal-$H$ fast-path idea in mind for the free-evolution segments.

### 2.7 Derived quantities the engine must expose

```js
populations()        // { g: Float64Array(N), e: Float64Array(N) }
nBar()               // <a†a>
pExcited()           // Tr(ρ |e><e|)
blochVector()        // internal-state Bloch vector, reduced over motion
rho(), rhoAbs()      // for the heatmap
couplingMatrix()     // Ω_{n,n'} currently in force — drives the level diagram
detuning(), rabi()   // current drive parameters
truncationOccupancy()
fockDistribution()   // diag over motion, traced over internal state
```

### 2.8 Lamb–Dicke parameter from real quantities

$$\eta = k\cos\theta\,\sqrt{\frac{\hbar}{2 m \omega_z}}$$

Compute it in-app from wavelength, ion mass and trap frequency rather than accepting it as a
bare number. Seeing $\eta$ fall as the trap stiffens is itself a lesson.

### 2.9 Default parameter set — ⁴⁰Ca⁺

| Parameter | Value | Note |
|---|---|---|
| Ion mass | 40 u | ⁴⁰Ca⁺ |
| Axial trap frequency $\omega_z/2\pi$ | 1.0 MHz | |
| Qubit transition | 729 nm, $S_{1/2}\!-\!D_{5/2}$ | quadrupole |
| $\eta$ (729 nm, axial, 1 MHz) | ≈ 0.10 | computed, not hard-coded |
| Cooling transition | 397 nm, $S_{1/2}\!-\!P_{1/2}$ | |
| $\Gamma/2\pi$ (397 nm) | 21.6 MHz | |
| $\eta$ (397 nm) | ≈ 0.18 | |
| Heating rate | 10 quanta/s | typical modern trap |
| Doppler limit | $T_D \approx 0.52$ mK, $\bar n \approx 11$ | derived check |

For sideband cooling use an **effective linewidth** $\Gamma_{\text{eff}}$ as a free
parameter (representing a quench or a narrow transition) rather than modelling the full
three-level quench scheme. Keep the physics honest by labelling it as such in the UI.

---

## 3. Visualization components

### 3.1 `src/ion-levels.js` — the double-ladder diagram (signature element)

This is the visual identity of the substrate. Canvas 2D, **not** Three.js — crisp text labels
matter more than depth here.

Two internal manifolds, each carrying a Fock ladder.

| Visual channel | Encodes |
|---|---|
| Rung length and brightness | population $\rho_{nn}$ in that basis state |
| Rung vertical position | true energy $\hbar\omega_0\delta_{s,e} + \hbar\omega_z n$ |
| Arrow thickness | $\lvert\Omega_{n,n'}\rvert \times$ current field amplitude |
| Arrow glow / saturation | resonance factor — proximity of that transition to $\delta$ |
| Dashed downward arrows | spontaneous emission $\Gamma_{n\to n'}$ |
| Faint ghost rungs | the distribution ~30 frames ago |

The three transition families then read off geometrically: **carrier** horizontal,
**red sideband** down one rung, **blue sideband** up one rung. Sideband cooling becomes a
visible ratchet — up on the RSB, back down carrier-like on decay, net phonon loss per cycle.

**Required solutions to two real problems:**

1. **Axis break.** $\omega_0/2\pi \sim 10^{15}$ Hz against $\omega_z/2\pi \sim 10^6$ Hz. To
   scale, the motional structure is invisible. Draw the two manifolds separated by a labelled
   gap with a zigzag break, and keep the *within-manifold* spacing honest. Add a zoom control
   on the motional scale.
2. **Dynamic range.** During cooling $\bar n$ runs from ~11 down to ~0.01. Map rung length
   through `sqrt` (or a soft log) or the high-$n$ tail disappears exactly when it becomes
   interesting. Make the mapping a labelled toggle, never a silent transform.

**The highest-value control in the entire application:** a draggable detuning line. Drag it
and watch which arrow family ignites — carrier at $\delta = 0$, RSB at $-\omega_z$, BSB at
$+\omega_z$. This single interaction explains resolved-sideband spectroscopy better than a
page of prose.

API, matching the `heatmap.js` convention:

```js
const diagram = new LevelDiagram(canvasEl, { theme });
diagram.draw({ popG, popE, coupling, detuning, rabi, omegaZ, gamma });
```

Redraw cost for ~60 rungs and ~180 arrows is well under a millisecond; full redraw per frame
is fine.

### 3.2 `src/ion-traces.js` — what comes out of the atom

Four traces, canvas 2D, following the `fid.js` pattern.

1. **$P_e(t)$ — Rabi flopping.** The direct analogue of the NMR FID, with an important
   difference: it collapses even with **zero decoherence**, because each Fock state flops at
   its own $\Omega_n \propto \sqrt{n+1}$. Collapse and revival from the frequency spread
   alone. The app must let a user switch $T_2$ off entirely and watch the collapse persist —
   that is the single clearest demonstration that inhomogeneous dephasing ≠ decoherence.
2. **Fluorescence rate** $R(t) = \Gamma\rho_{ee}(t)$, with Poisson shot noise applied. This
   is what a PMT records. The same generator feeds the readout module's histograms — write
   it once.
3. **$\bar n(t)$** — the cooling curve.
4. **Excitation spectrum** — sweep $\delta$, plot final $P_e$: carrier plus both sidebands.

### 3.3 Spectrum reuse — the best reuse in the project

Feed $P_e(t)$ into the **existing** `src/spectrum.js` unchanged. Its `math.js` FFT then
returns peaks at each $\Omega_n$ — which *is* the phonon number distribution $P(n)$. That is
the Meekhof/NIST 1996 measurement, reproduced with code already written and already tested.

### 3.4 The exercise this enables

The app must make it possible to measure $\bar n$ two independent ways and compare:

- **Sideband asymmetry:** $\bar n = \dfrac{r}{1-r}$, with $r = A_{\text{red}}/A_{\text{blue}}$
- **FFT of the Rabi flopping:** fit $P(n)$ directly

When both agree with the $\bar n$ that was set, the student has performed real ion-trap
thermometry. The red sideband vanishing as $\bar n \to 0$ — because $\lvert g,0\rangle$ has
no rung below it — is the same dark state the test suite asserts.

Add a **coherent-vs-thermal motional state toggle**: coherent gives clean sharp revivals,
thermal gives a smeared collapse. Same engine, very different signal.

---

## 4. Modules

Each module is a tab within `ion.html` sharing one engine instance, except M1 and M2 which
are classical and carry their own solvers.

| # | Module | Engine | "Break it" control |
|---|---|---|---|
| M1 | **Paul trap** — RF pseudopotential, Mathieu $a$–$q$ stability, micromotion | classical ODE | push $q$ past 0.908 into instability |
| M2 | **Normal modes** — Coulomb equilibrium, mode frequencies and eigenvectors | eigendecomposition | raise ion number until the chain zigzags |
| M3 | **Sideband spectroscopy** — level diagram + detuning scan | `ion.js` | drive $\Omega > \omega_z$: sidebands stop being resolved |
| M4 | **Doppler cooling** — $T_D$ vs detuning | `ion.js` | detune blue and watch heating |
| M5 | **Sideband cooling** ★ flagship | `ion.js` | raise the heating rate until cooling stalls |
| M6 | **Single-qubit gates** — Bloch, AC Stark, off-resonant scattering | `ion.js` | shorten the pulse until it is no longer spectrally selective |
| M7 | **Mølmer–Sørensen gate** — phase-space loop, Bell fidelity | `ion-ms.js` | mis-set $\delta$ so the loop fails to close |
| M8 | **Readout** — shelving, photon histograms, discrimination fidelity | `ion.js` | shorten the detection window until the histograms overlap |

### M1 — Paul trap

Mathieu equation $\ddot u + [a - 2q\cos(2\tau)]u = 0$. Plot the $a$–$q$ stability diagram with
the operating point marked, and animate the secular + micromotion trajectory. Purely
classical; no density matrix. This module answers "why is there a harmonic oscillator at
all?", which everything downstream assumes without explanation.

### M2 — Normal modes

Solve the 1D Coulomb equilibrium for $N$ ions in a harmonic well (Newton iteration on the
force balance), build the Hessian, eigendecompose. Show mode frequencies and eigenvectors —
centre-of-mass, breathing, and above. Sets up which mode M7 uses as the gate bus.

### M7 — Mølmer–Sørensen

Two qubits ⊗ one mode: $\dim = 4 \times N_{\text{FOCK}}$. With `N_FOCK = 20` that is 80 —
comfortably inside the existing RK4 loop.

Bichromatic drive detuned by $\delta$ from both sidebands. The phase-space displacement loop
closes at

$$\tau_g = \frac{2\pi K}{\delta}, \qquad \eta\Omega = \frac{\delta}{2\sqrt{K}}$$

for integer $K$ loops. Render the loop with the existing `src/wigner.js` and
`src/jc-ui.js`. When $\delta$ is mis-set the loop visibly fails to close and residual
spin–motion entanglement drags the Bell fidelity down — the most legible failure mode in the
whole application.

---

## 5. Layout

```
ion.html                  Ion page: 3-pane shell (controls · level diagram · traces + spectrum)
src/ion.js                IonSystem — 2 ⊗ N_FOCK density matrix, Lindblad RK4,
                          exact/LD/JC/anti-JC couplings, recoil kernel, motional bath
src/ion-levels.js         LevelDiagram — double-ladder canvas, axis break, ghost trail
src/ion-traces.js         P_e(t), fluorescence + shot noise, n̄(t), excitation spectrum
src/ion-modes.js          Paul-trap Mathieu solver + Coulomb normal modes (classical)
src/ion-ms.js             MS gate engine — 2 qubits ⊗ 1 mode
src/ion-ui.js             module tabs, sliders, draggable detuning line
src/ion-main.js           page loop + wiring, self-calibrating step budget
src/ion.css               page styling

test/ion.test.mjs         engine physics + coupling matrix elements
test/ion-modes.test.mjs   Mathieu stability + normal-mode structure
test/ion-ms.test.mjs      MS loop closure and Bell fidelity
```

Reused unchanged: `src/wigner.js`, `src/scene.js`, `src/spectrum.js`, `src/fid.js`,
`src/heatmap.js`, `src/theme.js`, `serve.py`.

Top-bar substrate switcher extends to: **NMR | Jaynes–Cummings | Trapped Ion**.

---

## 6. Validation — `test/ion.test.mjs`

Node `assert`, same shape as `jc.test.mjs`. Nothing ships without these.

**Invariants**
1. $\mathrm{Tr}\rho = 1$, Hermiticity, positive semidefiniteness at all times
2. Unitary evolution (all dissipators off) preserves purity $\mathrm{Tr}\rho^2 = 1$
3. Truncation occupancy stays below `1e-6` for the default parameter set

**Coupling matrix elements**
4. Red sideband from $\lvert g,n\rangle$ flops at $\eta\Omega\sqrt{n}$
5. Blue sideband from $\lvert g,n\rangle$ flops at $\eta\Omega\sqrt{n+1}$
6. **$\lvert g,0\rangle$ is dark on the red sideband** — $P_e$ stays below `1e-10`. Sharp,
   unambiguous, and it is the same physics that makes ground-state cooling detectable.
7. Carrier Debye–Waller: $\Omega_{n,n}/\Omega = 1 - \eta^2 n$ to first order
8. `'exact'` and `'ld'` agree to <1% for $\eta\sqrt{n+1} < 0.1$, and **diverge by >10%** for
   $\eta = 0.5$, $n = 10$. Both halves must be asserted — the approximation working *and*
   failing.

**Emergent sideband selectivity**
9. Starting from $\lvert g,1\rangle$ with $\delta = -\omega_z$ and $\Omega \ll \omega_z$,
   population transfers to $\lvert e,0\rangle$ and not $\lvert e,2\rangle$. Raising $\Omega$
   above $\omega_z$ destroys the selectivity. Selectivity must be **emergent**, never
   hard-wired — the same standard `homonuclear.test.mjs` holds Substrate 1 to.

**Thermometry**
10. FFT of $P_e(t)$ from a thermal state recovers $P(n)$ within tolerance
11. Sideband asymmetry $r = A_{\text{red}}/A_{\text{blue}}$ gives $\bar n = r/(1-r)$,
    recovering the $\bar n$ that was set

**Cooling and heating**
12. Heating only (no drive): $\mathrm{d}\bar n/\mathrm{d}t = \kappa\bar n_{\text{bath}}$ exactly
13. Doppler limit $T_D = \hbar\Gamma/2k_B$ at $\delta = -\Gamma/2$, within 10%
14. Sideband cooling steady state scales as $(\Gamma_{\text{eff}}/2\omega_z)^2$ and stays
    below 0.01 for $\Gamma_{\text{eff}}/\omega_z = 0.1$. Assert the **scaling and the
    bound**, not a precise coefficient — the exact prefactor depends on the recoil kernel
    and would make the test brittle.

**MS gate — `test/ion-ms.test.mjs`**
15. At $\tau_g = 2\pi K/\delta$ with $\eta\Omega = \delta/2\sqrt{K}$: Bell state fidelity
    > 0.999 and residual spin–motion entanglement → 0
16. Mis-set $\delta$ by 10%: loop fails to close, fidelity drops measurably

**Classical modules — `test/ion-modes.test.mjs`**
17. Mathieu stability boundary at $q \approx 0.908$ for $a = 0$
18. Two-ion equilibrium spacing matches the analytic $\left(2 e^2/4\pi\varepsilon_0 m\omega_z^2\right)^{1/3}$
19. Centre-of-mass mode frequency = $\omega_z$ for any ion number; breathing mode = $\sqrt{3}\,\omega_z$

---

## 7. Build phases

**Phase 1 — the spine.** `src/ion.js` + `test/ion.test.mjs` (assertions 1–9), then
`src/ion-levels.js` and `src/ion-traces.js`, wired into M3 and M5. This is the flagship path
and everything else hangs off it. Ship this before starting anything below.

**Phase 2 — context.** M1 and M2 (`src/ion-modes.js`, classical, independent of the engine),
then M4 and M6.

**Phase 3 — the payoff.** M7 (`src/ion-ms.js` + phase-space rendering) and M8.

Do not begin a phase before the previous phase's tests pass.

---

## 8. Non-goals

- No backend, no build step, no framework. If it needs `npm run build`, it is out of scope.
- No 3D ion-crystal rendering beyond what M2 needs. Three.js is for Bloch spheres.
- Not a research-grade simulator. It must be *correct*, but 3D cooling, real-space
  trajectories and multi-mode gates are out of scope — as the positronium Lindblad
  literature notes, those need Monte Carlo, not density matrices.
- No modification of Substrate 1 or 2 behaviour. `index.html` and `jc.html` must be
  byte-identical in behaviour after this work lands.
