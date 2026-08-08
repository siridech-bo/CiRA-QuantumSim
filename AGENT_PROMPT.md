# Agent prompt — implement Substrate 3 (Trapped-Ion Visualizer)

Paste the text below to the coding agent, with `Ion_Trap_Visualizer_Spec.md` placed in the
repo root next to `NMR_3D_Visualizer_Spec.md`.

---

## Task

You are working in the **CiRA QuantumSim** repository — an in-browser quantum physics
visualizer with two existing substrates: an NMR spin simulator (`index.html`) and a
Jaynes–Cummings qubit-boson reservoir (`jc.html`). Both are real density-matrix Lindblad
simulations in pure JavaScript with no backend.

Add a third substrate: a **trapped-ion quantum computing process visualizer** at
`ion.html`. The full specification is in `Ion_Trap_Visualizer_Spec.md` — read it completely
before writing any code, along with `README.md`, `CLAUDE.md` and `src/jc.js`.

## Why this substrate exists

Trapped-ion QC is hard to learn because confinement, collective motion, cooling, coherent
control and measurement are always taught fused together. This substrate separates them into
independently runnable modules.

**The teaching claim that governs every design decision:** each module must expose a control
that pushes the standard textbook approximation past its validity. Seeing *where* a formula
breaks is the intuition specialists most often lack. A module with no "break it" control is
incomplete and should not be marked done.

## The key insight that makes this cheap

`src/jc.js` already contains most of the sideband physics. The resonant red sideband in the
Lamb–Dicke regime **is** the Jaynes–Cummings Hamiltonian:

    H_RSB = (ηΩ/2)(a σ⁺ + a† σ⁻)   ←→   χ(a σ⁺ + a† σ⁻)

The blue sideband is anti-JC. The dispersive DJC term `χ' a†a σz` is the geometric-phase
regime the Mølmer–Sørensen gate lives in.

So `src/ion.js` is a **generalization** of `src/jc.js`, not a replacement. What is genuinely
new is only: the Lamb–Dicke parameter η with exact Laguerre matrix elements, a thermal
motional bath (`jc.js` has zero-temperature loss only), a spontaneous-emission recoil kernel,
and two classical solvers for the trap and the normal modes.

`src/wigner.js`, `src/scene.js`, `src/spectrum.js`, `src/fid.js`, `src/heatmap.js`,
`src/theme.js` and `serve.py` are reused as-is.

## Hard constraints

1. **Pure client-side JavaScript, ES modules, no backend, no build step.** `math.js` for
   linear algebra and FFT, `three.js` for Bloch spheres only. If it needs `npm run build`, it
   is wrong.
2. **Canvas 2D for every plot and diagram**, including the level diagram. Not Three.js —
   crisp text labels matter more than depth.
3. **Real physics, no mocks, no placeholder numbers.** Every physical claim the UI makes must
   be backed by an assertion in `npm test`. This is the standard the existing 114 assertions
   set; do not lower it.
4. **Sideband selectivity must be emergent** from detuning versus Rabi frequency, never
   hard-wired — exactly as soft-pulse selectivity is emergent in Substrate 1. Implement the
   full displacement operator `D(iη) = exp[iη(a+a†)]` as the default coupling path. Carrier,
   red sideband and blue sideband then fall out of the detuning on their own. The `'ld'`,
   `'jc'` and `'ajc'` modes exist for comparison and for demonstrating failure, not as the
   primary path.
5. **Substrates 1 and 2 must not change behaviour.** `index.html` and `jc.html` behave
   identically after your work lands. All existing tests keep passing.
6. **Use `serve.py`, never `python -m http.server`** — the plain server caches ES modules and
   silently runs a stale mix.
7. Day/night theme via the existing `src/theme.js`. Match the existing visual language;
   do not introduce a new design identity.

## Physics you must get right

Take these from the spec, but three points cause the most bugs:

- **Laguerre recurrence, not closed form.** The factorial-ratio closed form overflows above
  n ≈ 20. Use the upward recurrence and carry `sqrt(n!/n'!)` as a running incremental product.
  Cache the whole matrix; invalidate only on η change.
- **Basis index `idx = s * N_FOCK + n`**, `s ∈ {0=g, 1=e}` — this keeps the gg and ee
  population blocks contiguous so the level diagram can slice without gather.
- **Truncation must be observable.** Expose `truncationOccupancy()` and warn in the UI above
  `1e-4`. Silent Fock truncation error is the most likely way this simulation quietly lies.

## Two visualization problems that need real solutions

1. **Axis break in the level diagram.** ω₀/2π ~ 10¹⁵ Hz against ω_z/2π ~ 10⁶ Hz. Drawn to
   scale the motional structure is invisible. Separate the two manifolds with a labelled
   zigzag break and keep the within-manifold spacing honest.
2. **Dynamic range in rung length.** During cooling n̄ runs from ~11 to ~0.01. Map through
   `sqrt` or a soft log, or the high-n tail vanishes exactly when it becomes interesting.
   Make the mapping a labelled toggle, never a silent transform.

The **draggable detuning line** is the single highest-value control in the application. Drag
it, and the arrow family that ignites changes — carrier at δ=0, red sideband at −ω_z, blue at
+ω_z. Build it early and make it feel good.

## Reuse to notice

Feed `P_e(t)` into the **existing** `src/spectrum.js` unchanged. Its math.js FFT returns peaks
at each Ω_n — which is the phonon number distribution P(n). That is the Meekhof/NIST 1996
measurement, reproduced with code already written and tested. Do not write a second FFT.

## Build order

Work in phases. Do not start a phase until the previous phase's tests pass.

**Phase 1 — the spine (do this first, ship it, stop).**
- `src/ion.js` — engine
- `test/ion.test.mjs` — assertions 1–9 from spec §6
- `src/ion-levels.js` — the double-ladder diagram
- `src/ion-traces.js` — P_e(t), fluorescence with Poisson shot noise, n̄(t), excitation spectrum
- `ion.html`, `src/ion-ui.js`, `src/ion-main.js`, `src/ion.css`
- Modules M3 (sideband spectroscopy) and M5 (sideband cooling)
- Extend the top-bar substrate switcher to **NMR | Jaynes–Cummings | Trapped Ion**

**Phase 2 — context.** `src/ion-modes.js` (Paul trap Mathieu + Coulomb normal modes,
classical, independent of the engine) for M1 and M2; then M4 (Doppler cooling) and M6
(single-qubit gates).

**Phase 3 — the payoff.** `src/ion-ms.js` for M7 (Mølmer–Sørensen, 2 qubits ⊗ 1 mode, dim 80
at N_FOCK=20), rendering the phase-space loop with the existing `src/wigner.js`; then M8
(readout histograms, reusing the Phase 1 shot-noise generator).

## Definition of done for Phase 1

- `npm test` passes, existing suites included, with the new assertions from spec §6
- A user can set n̄, run sideband cooling, watch the ladder depopulate downward, and see the
  red sideband amplitude vanish as n̄ → 0
- The same user can measure n̄ two independent ways — sideband asymmetry
  `n̄ = r/(1−r)` and an FFT of the Rabi flopping — and get agreement with the value they set
- Switching the coupling mode from `'exact'` to `'ld'` at η = 0.5 visibly changes the answer
- Turning T₂ off entirely still shows Rabi collapse from the spread of Ω_n alone

## Ask before assuming

If the spec is ambiguous on a physics choice, ask rather than guessing — a plausible-looking
wrong coefficient is worse here than a blocked task, because the whole point of the substrate
is that students can trust what it shows them.
