# Multi-Molecule Extension — Research Findings & Plan

Goal: extend the simulator from its fixed 3-spin heteronuclear (¹H/³¹P/¹⁹F) system to
support **real NMR-QC benchmark molecules (2–7 spins), a user-defined molecule library,
and homonuclear systems**. Scope confirmed with the user: real molecules + custom library,
up to ~7 spins, homonuclear support included.

Sourced from a deep-research pass (see citations). **Confidence policy:** physics claims
below were adversarially verified; the *numeric parameter tables* (J-matrices, shifts,
T1/T2) were **NOT** verified and must be extracted from primary papers before hardcoding
(see §Phase 0).

---

## 1. Physics: heteronuclear vs homonuclear (verified)

| | Heteronuclear (current) | Homonuclear (new) |
|---|---|---|
| Addressing | Separate RF channel per species; distinct Larmor freqs (MHz apart) | One channel; spins distinguished only by chemical-shift dispersion |
| Single-qubit gates | Trivial hard pulses; drift H ignored during brief pulse | **Frequency/transition-selective soft (shaped) pulses**, min length set by smallest resonance gap; must evolve under full drift+control H |
| Coupling Hamiltonian | Weak-coupling **secular ZZ**: `H = Σ 2π νᵢ Izᵢ + Σ 2π Jᵢⱼ Izᵢ Izⱼ` — always valid (|Δν|~MHz ≫ J~Hz) | Weak ZZ still "regularly assumed" for weakly-coupled liquids; but if `|Δν|` not ≫ `|J|` → **strong coupling**: full isotropic `Σ 2π Jᵢⱼ(IzIz+IxIx+IyIy)` with flip-flop terms |
| Strong-coupling consequence | n/a | Zeeman & coupling don't commute; eigenstates mix; spins lose clean qubit identity; only transition-selective pulses well-defined |

Key criterion: **weak coupling valid when `2Jᵢⱼ ≪ |νᵢ − νⱼ|`** (Vandersypen & Chuang RMP 2005).
For our purposes: heteronuclear → always weak; weakly-coupled liquid homonuclear (alanine,
crotonic acid) → weak ZZ is a good educational approximation; solid-state/strong (malonic
acid) → out of scope.

Selective single-qubit gates in homonuclear systems: shaped soft pulses (Gaussian, Hermite,
SLR, BURP) — bandwidth/selectivity trades against duration (longer = more selective); or
hard-pulse-and-delay sequences (Jump-and-Return). Simulator must integrate a **finite-
duration RF envelope under the full Hamiltonian** (we already do finite-duration RF for
heteronuclear — this generalizes it).

## 2. Canonical molecules (identities verified; numbers TO BE SOURCED)

| Molecule | Spins | Nuclei | Type | Notes / primary source |
|---|---|---|---|---|
| Dimethylphosphite (DMP) | 2 | ¹H, ³¹P | hetero | **SPINQ Gemini sample**. J(¹H-³¹P) = **697.4 Hz** (verified); Larmor 42.6/17.2 MHz @1 T. arXiv:2101.10017 (EPJ QT 2021) |
| Chloroform | 2 | ¹H, ¹³C | hetero | Classic AX. J≈215 Hz *(unverified — re-source)*. Vandersypen–Chuang RMP 2005 |
| Our ¹H/³¹P/¹⁹F | 3 | ¹H,³¹P,¹⁹F | hetero | Already in app |
| ¹³C-alanine | 3 | 3×¹³C | **homo** | Weakly-coupled liquid. 2024 review; Knill/Laflamme |
| Crotonic acid | 4 (→7) | 4×¹³C (+¹H) | **homo** | 4-qubit ¹³C; extends to ~7 qubits via 2 protons + methyl. quant-ph/0101034 |
| Malonic acid | 3 | 3×¹³C | homo (solid) | **Strong/dipolar — out of scope**, note only. PRA 73,022305 |
| Perfluorobutadienyl Fe complex | 7 | 5×¹⁹F + 2×¹³C | mixed | **2001 Shor factor-15**. Nature 414:883 (2001), arXiv quant-ph/0112176 |

## 3. Pseudo-pure states (PPS) — for realistic initial states (optional)

Three canonical methods: **spatial averaging** (Cory, gradients), **logical labelling**
(Gershenfeld–Chuang, ancillas), **temporal averaging** (Knill–Chuang–Laflamme, multiple
runs, no ancilla/gradient — quant-ph/9706053). Educational value: show why NMR starts from
a thermal (highly mixed) state, not |000…⟩. Low priority; a later toggle.

## 4. Scaling 8×8 → 128×128 (engineering analysis; research found no citable JS benchmark)

Density-matrix Lindblad cost scales as **O((2ⁿ)³)** per matrix product:
- n=3: 8³ = 512 · n=4: 16³ = 4k (8×) · n=5: 32³ = 33k (64×) · n=7: 128³ = 2.1M (**~4000×** vs n=3).
- **Dense real-time Lindblad is realistic to ~n=4–5 in JS; n=6–7 is not.**

Fast paths (standard, to implement):
1. **Statevector fast path when relaxation is OFF** — evolve a 2ⁿ complex *vector* under
   Schrödinger (matrix-vector, O((2ⁿ)²): 128² = 16k for n=7 — cheap). Default for n≥5.
2. **Diagonal free-evolution** — the weak-coupling Zeeman+ZZ Hamiltonian is diagonal, so
   delays are O(2ⁿ) phase multiplications (no matmul). Only pulses/flip-flop need full ops.
3. **Offline compute + cached trajectory** for the big 5–7 spin demos (compute fast, animate
   playback) instead of real-time Lindblad.

QuTiP (`mesolve`) is the reference for correctness cross-checks (dense/sparse). PULSEE exists
but is single-spin — not a drop-in multi-spin engine.

## 5. Authoritative citations

- **Vandersypen & Chuang, "NMR techniques for quantum control and computation," Rev. Mod.
  Phys. 76, 1037 (2005)** — the canonical reference; has molecule parameter tables. (Cite the
  RMP DOI 10.1103/RevModPhys.76.1037; note arXiv /pdf mirrors were unreliable in the search.)
- **"Controlling NMR spin systems for quantum computation," arXiv:2402.01308 (2024 review).**
- **SPINQ Gemini device paper**, EPJ Quantum Technology (2021), arXiv:2101.10017.
- **Vandersypen et al., Nature 414:883 (2001)**, arXiv quant-ph/0112176 (7-spin Shor).
- PPS: Knill, Chuang, Laflamme, quant-ph/9706053.

---

# Extension Plan (phased)

Principle: **never break the verified 3-spin engine**; generalize behind a Molecule model and
ship incrementally. Each phase keeps all existing tests green and adds new ones.

### Phase 0 — Data model + parameter sourcing (gated)
- Define `Molecule` schema: `{ id, name, field_T, nuclei:[{label,isotope,offsetHz,color,T1,T2}],
  J: n×n Hz matrix, couplingModel:'weak'|'full', addressing:'hetero'|'homo', source:citation }`.
- **Extract & verify** exact numeric params from primary papers (RMP 2005 tables, SPINQ
  2101.10017, Nature 2001) — dispatch a focused extraction+verification pass. **No number
  goes in the app unsourced.** Start with what's already trusted: DMP (J=697.4 Hz) + our
  3-spin.

### Phase 1 — n-spin engine (heteronuclear, weak coupling)
- Generalize `quantum.js` to arbitrary n: 2ⁿ density matrix, operator/Hamiltonian/collapse
  builders driven by a `Molecule`. Keep weak ZZ.
- Add **statevector fast path** (relax off) + **diagonal free-evolution** optimization.
- `scene.js`: render n spheres (generalized layout up to 7). `circuit-ui.js`: n qubit rows.
  `gates.js`: n-spin compilation. Molecule picker loads heteronuclear molecules (DMP 2-spin,
  our 3-spin, chloroform).
- Generalize tests to n-spin; statevector-vs-density cross-check.

### Phase 2 — Homonuclear + selective pulses
- Full isotropic J Hamiltonian option (flip-flop terms) selectable per molecule.
- **Frequency-selective soft pulses** (Gaussian envelope, finite duration integrated under
  full H); gate compiler chooses hard (hetero) vs soft-selective (homo). Restrict to
  weakly-coupled liquids (alanine, crotonic acid); document strong-coupling as out of scope.
- Add ¹³C-alanine (3) and crotonic acid (4). Tests: pulse selectivity + gate fidelity.

### Phase 3 — Big systems + custom + PPS
- Statevector real-time for 5–7 spins; 7-spin Shor molecule as a showcase (relax-off).
- **Custom molecule editor** (enter n, isotopes, offsets, J-matrix, T1/T2 → validate → run).
- Optional PPS initial-state (temporal averaging) toggle.

### Risks / decisions
- **Unverified numbers** = top risk → Phase 0 sourcing gate.
- **7-spin real-time density matrix infeasible in JS** → statevector fast path + diagonal H;
  density-matrix Lindblad realistically capped ~4–5 spins real-time.
- **Homonuclear strong coupling** → restricted to weakly-coupled liquids for the educational sim.
- **Large scope** → phased; Phase 1 already delivers 2-spin DMP (real Gemini molecule) value.
