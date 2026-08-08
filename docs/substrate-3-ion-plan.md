# Substrate 3 — Trapped-Ion Visualizer: Plan, Assessment & Locked Decisions

Companion to the full spec [`Ion_Trap_Visualizer_Spec.md`](../Ion_Trap_Visualizer_Spec.md),
the agent brief [`AGENT_PROMPT.md`](../AGENT_PROMPT.md), and the verified physics numbers in
[`docs/ion-physics-constants.md`](ion-physics-constants.md). This file records *why* we're
building it this way and *what was decided* before code.

## 1. What this is

A third physical substrate for CiRA QuantumSim: a **1D single-ion Lindblad simulator**
(two internal levels ⊗ truncated motional Fock space) on a dedicated page `ion.html`, plus two
classical solvers (Paul trap, Coulomb normal modes) and a two-ion Mølmer–Sørensen module.
Pedagogical spine: **every module exposes a "break it" control** that pushes a textbook
approximation past its validity. Substrates 1 (NMR, `index.html`) and 2 (JC, `jc.html`) are
untouched.

## 2. Assessment (my read of the spec)

**Strengths — this is an unusually well-scoped brief:**
- The reuse thesis is real and I confirmed it in code: `src/jc.js` already has the JC
  (`χ(aσ⁺+a†σ⁻)` = red sideband) and anti-JC (blue sideband) Hamiltonians and the flat-complex
  RK4 Lindblad core. `src/ion.js` is a *generalization* of `jc.js`, not a rewrite. `wigner.js`,
  `spectrum.js`, `fid.js`, `scene.js`, `heatmap.js`, `theme.js`, `serve.py` port as-is.
- "Emergent sideband selectivity" (full `D(iη)` as the default path; carrier/RSB/BSB emerge from
  detuning) is exactly the standard QA already enforces on the homonuclear soft pulses — and it
  caught a faked version there. The right bar.
- The `spectrum.js`-FFT-of-P_e(t) → phonon-distribution reuse is genuinely elegant (Meekhof/NIST
  1996 measurement, code already written and tested).
- Spec §6 gives concrete, assertable physics (dark state, LD approximation working AND failing,
  thermometry two ways, Doppler limit, MS loop closure). That list *is* the QA gate.

**Risks to manage:**
- **Scale.** 8 modules, ~10 source files, 3 test suites — a mini-project, not a feature. Phase
  hard; verify each phase before the next.
- **Performance.** Unlike the NMR engine, the driven ion Hamiltonian (full displacement operator)
  is **non-diagonal**, so no diagonal fast path during driving; cooling animates over many
  windows. Dim-60 dense (N_FOCK=30) will be slower than the dim-30 JC (~370 ms/window); MS is
  dim-80. Expect slow-motion cooling like crotonic. Validate perf in Phase 1, default N_FOCK≈25.
- **Level diagram is the hardest deliverable**, not the engine: 10¹⁵-vs-10⁶ Hz axis break,
  sqrt/log dynamic-range toggle, ghost trail, draggable detuning line.

## 3. Physics status (from the verified constants sheet)

Deep research (23/25 claims verified vs Wineland NIST 1998, Meekhof PRL 1996, Steane/James,
Sørensen–Mølmer) confirms the spec on **8 of 10 items**; I independently recomputed
η(Ca⁺ 729/397 nm)=0.097/0.178 and Doppler T_D=0.518 mK / n̄=10.8. See the constants sheet for
exact formulas, numbers, citations, and the hardcoded convention choices (Doppler = ħΓ/2k_B not
ħΓ/4; sideband-cooling assert scaling not prefactor; MS χ convention; red/blue sign; Debye–Waller
no double-count).

## 4. Locked decisions (before coding)

1. **Phase-1 spontaneous emission = motion-preserving** `c = √Γ |g⟩⟨e| ⊗ I`. The recoil kernel
   (ξ≈2/5) is the *one* piece the research could **not** cleanly pin (a candidate claim was
   refuted), so it is **deferred to Phase 2** with a dedicated primary derivation before it is
   unit-tested. Confirmed by the literature, not a shortcut.
2. **Default N_FOCK = 25** (with the truncation warning above `1e-4` doing its job) for
   interactivity; user-configurable up to ~30.
3. **Sideband cooling = effective-linewidth Γ_eff model** (spec §2.9), labelled as such; tests
   assert the **scaling `(Γ_eff/2ω_z)²` and the bound**, never the O(1) prefactor.
4. **Full `D(iη)` is the default coupling path**; `'ld'`/`'jc'`/`'ajc'` modes exist for
   comparison and for demonstrating failure. Selectivity is emergent, never hard-wired.
5. **Dedicated page `ion.html`**, sibling to `jc.html`; the NMR and JC apps must be
   behaviourally byte-identical after this lands.

## 5. Build phases (do not start a phase before the previous phase's tests pass)

- **Phase 1a — engine spine (STARTING NOW).** `src/ion.js` + `test/ion.test.mjs` (spec §6
  assertions 1–9). Verify the physics against the constants sheet before any pixels. Coder →
  adversarial QA → my own verification.
- **Phase 1b — flagship visuals + modules.** `src/ion-levels.js` (double-ladder + draggable
  detuning line), `src/ion-traces.js` (P_e collapse-without-decoherence, fluorescence + shot
  noise, n̄(t), excitation spectrum), `ion.html` + `ion-ui.js` + `ion-main.js` + `ion.css`,
  modules M3 (sideband spectroscopy) & M5 (sideband cooling), top-bar switcher →
  **NMR | Jaynes–Cummings | Trapped Ion**. Spectrum reuse for thermometry.
- **Phase 2 — context.** `src/ion-modes.js` (Paul-trap Mathieu — pin `q≈0.908` from a source
  first — + Coulomb normal modes) for M1/M2; M4 (Doppler), M6 (single-qubit); add the
  **recoil-kernel** spontaneous emission with a dedicated derivation + tests.
- **Phase 3 — payoff.** `src/ion-ms.js` for M7 (Mølmer–Sørensen, 2 qubits ⊗ 1 mode, dim 80),
  phase-space loop via `wigner.js`; M8 (readout histograms, reusing the Phase-1b shot-noise gen).

## 6. Process

Same as every substantive feature in this repo: detailed coder brief → **independent adversarial
QA** against the spec §6 assertions and the constants sheet → **my own verification** (run the
suite, re-derive a couple of results) before handoff. No number ships unless it traces to the
constants sheet or a cited source. Existing 114 assertions across 5 suites must stay green.
