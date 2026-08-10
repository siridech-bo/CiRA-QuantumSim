# CiRA QuantumSim — Design & Status Snapshot

A living snapshot of what's designed and built. For per-topic depth see the specs
(`NMR_3D_Visualizer_Spec.md`, `Ion_Trap_Visualizer_Spec.md`), the plan docs
(`docs/substrate-3-ion-plan.md`, `docs/multi-molecule-extension-plan.md`), and the verified
physics sheets (`docs/ion-physics-constants.md`, `docs/ion-recoil-kernel-physics.md`).

## The whole app in one line

A real, in-browser quantum-physics visualizer — **three independent physical substrates**, all
genuine density-matrix Lindblad simulations in pure JavaScript (math.js + three.js), no backend,
no build step, served by `serve.py`. Every physical claim is backed by a `npm test` assertion
(**141 assertions across 7 suites**, all green). House rule: *real physics, no mocks; selectivity
is always emergent, never hard-wired.*

## Substrate 1 — NMR spins (`index.html`) ✅ shipped
n-spin (2ⁿ) density-matrix Lindblad engine, molecule-driven. 5 real molecules with cited params
(SpinQ 3-spin, DMP, chloroform, ¹³C-alanine, crotonic acid). Heteronuclear hard pulses +
homonuclear frequency-selective soft pulses (emergent selectivity). Real-pulse quantum circuit
editor (CZ/CNOT = genuine J-coupling evolution). Bloch spheres, FID, live FFT spectrum, |ρ|
heatmap, projection histogram, QRC encoding demo, day/night theme.
Files: `quantum.js` (engine), `molecules.js`, `gates.js`, `ideal-sim.js`, `runner.js`,
`circuit-ui.js`, `scene.js`, `fid.js`, `spectrum.js`, `heatmap.js`, `theme.js`, `main.js`.
Suites: physics (17), gates (23), molecules (30), homonuclear (35).

## Substrate 2 — Jaynes-Cummings qubit-boson reservoir (`jc.html`) ✅ shipped
Qubit ⊗ truncated-Fock cavity (dim ~30), real Lindblad with cavity loss; JC + dispersive DJC
Hamiltonians; input = cavity drive amplitude β. Live Wigner function (with non-classical
negativity), qubit Bloch sphere, Fock populations, ⟨N⟩ trace. From Das/Giorgi/Zambrini PRR 8,
023148 (2026). QRC memory benchmark deferred to a Python/QuTiP script (not built).
Files: `jc.js`, `wigner.js`, `jc-ui.js`, `jc-main.js`, `jc.css`. Suite: jc (9).

## Substrate 3 — Trapped-ion process visualizer (`ion.html`) 🔧 in progress (Phase 2)
1D single-ion Lindblad engine (2 levels ⊗ truncated Fock) + two classical solvers. Pedagogical
spine: every module has a **"break-it" control** that pushes a textbook approximation past its
validity. `ion.js` generalizes `jc.js` (the red sideband IS the JC Hamiltonian). Built against
the verified `docs/ion-physics-constants.md` and `docs/ion-recoil-kernel-physics.md`.

### Modules (8 planned; 5 done)
| # | Module | Engine | Status | Break-it |
|---|---|---|---|---|
| M1 | Paul trap (Mathieu a–q stability, micromotion) | classical | ✅ | push q past 0.908 → ion lost |
| M2 | Normal modes (Coulomb equilibrium, mode freqs/vectors) | classical | ✅ | raise N → chain zigzags |
| M3 | Sideband spectroscopy (level diagram + detuning scan) | `ion.js` | ✅ | Ω>ω_z → sidebands unresolve |
| M4 | Doppler cooling | `ion.js` | ✅ | detune blue → heating |
| M5 | Sideband cooling ★ | `ion.js` | ✅ | raise heating → cooling stalls |
| M6 | Single-qubit gates (Bloch, AC Stark) | `ion.js` | ✅ | shorten pulse → not selective |
| M7 | Mølmer-Sørensen gate (phase-space loop, Bell) | `ion-ms.js` | ⬜ Phase 3 | mis-set δ → loop won't close |
| M8 | Readout (shelving, photon histograms) | `ion.js` | ⬜ Phase 3 | short window → histograms overlap |

### Engine physics (verified, `ion.js`)
Full displacement operator `D(iη)=exp[iη(a+a†)]` as the DEFAULT coupling (exact Laguerre matrix
elements by recurrence — verified to ~2e-15 vs `expm`); carrier/red/blue sidebands **emerge**
from detuning vs Rabi; `|g,0⟩` dark on the red sideband; exact/ld/jc/ajc coupling modes;
motion-preserving spontaneous emission (recoil kernel = Phase 2c, now sourced), motional thermal
bath, pure dephasing. η computed from real ⁴⁰Ca⁺ quantities (0.097 @729 nm, 0.178 @397 nm).

### Signature visuals
`ion-levels.js` — double-ladder level diagram (energy-positioned rungs, population brightness,
coupling-weighted arrows, spontaneous-emission dashes, ghost trail, labelled axis break,
sqrt/log dynamic-range toggle, and the **draggable detuning line**). `ion-traces.js` — P_e Rabi
flopping (collapses with ZERO decoherence from the Ω_n spread), fluorescence + Poisson shot
noise, n̄(t), excitation spectrum. Phonon thermometry reuses `spectrum.js` (Meekhof/NIST 1996):
n̄ measured two independent ways (sideband asymmetry + Rabi-flop FFT) that agree.

### Files
`ion.js` (engine), `ion-modes.js` (Mathieu + normal modes), `ion-levels.js`, `ion-traces.js`,
`ion-gates.js` (M6 driver), `ion-modes-ui.js` (M1/M2 views), `ion-ui.js`, `ion-main.js`,
`ion.css`, `ion.html`. Suites: ion (16), ion-modes (11).

### Status: Phase 2 COMPLETE ✅
All six context modules (M1–M6) + the recoil kernel are shipped and verified. Ion suite 27
assertions; **152 total across 7 suites**. The recoil kernel is the sourced three-operator
O(η̃²) form (ξ=2/5 σ-default); M4 Doppler is honest LD-regime (asserts the real coefficient
c≈0.5–0.65 rising toward 1, documenting where the canonical Γ/2ω_z breaks down).

### Remaining work — Phase 3 (the payoff)
- **M7 — Mølmer-Sørensen gate** (`ion-ms.js`, 2 qubits ⊗ 1 mode, dim ~80): bichromatic drive,
  phase-space displacement loop rendered via `wigner.js`, Bell fidelity; break-it: mis-set δ so
  the loop won't close. Verified physics in `docs/ion-physics-constants.md` §8.
- **M8 — Readout** (shelving, photon histograms, discrimination fidelity), reusing the Phase-1b
  Poisson shot-noise generator; break-it: shorten the detection window → histograms overlap.
- **Optional (Phase 2d)** — exact non-LD angle-integrated recoil dissipator (`recoil:'full'`) to
  validate the literal canonical Doppler T_D=ħΓ/2k_B at the ⁴⁰Ca⁺ n̄≈10 regime.

## Process (every phase)
Coder → **independent adversarial QA** (re-derives physics from scratch, hunts faked/rigged
results) → **my own verification** (run suites, re-derive key numbers) → commit. This has caught
real faked-physics bugs pre-commit (JC Wigner P-sign flip; homonuclear fake selectivity; ion
Wigner-vs-quadrature axis). Numbers are sourced (literature) or derived (first principles) — never
guessed. Reused/verified constants live in the `docs/*-physics-constants.md` / `*-physics.md`
sheets that the test assertions pin against.

## Reused across substrates
`theme.js` (day/night), `serve.py` (no-store dev server), `scene.js` BlochScene (NMR spheres, JC
qubit, ion M6 qubit), `spectrum.js` FFT (NMR spectrum, JC, ion phonon thermometry), `wigner.js`
(JC now, ion M7 later), `fid.js` pattern (all canvas traces).
