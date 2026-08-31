# Response to Reviewer

We thank the reviewer for a careful, constructive assessment and for recognizing the
practical value of the coherent–incoherent trade-off maps. Below we respond to every
point. Reviewer comments are in *italics*; our responses follow, with pointers to the
revised manuscript. All changes are in the manuscript file; no results were altered,
and two of the reviewer's requests prompted **new computations** (a phase-modulated
robust-gate comparison, E6, and an $N_{\rm Fock}$ convergence study).

A brief note before the point-by-point: several minor items (the "typos"
*compensat ion* / *veri fy* / *gatetime*, and "Appendices A–E not visible") appear to
originate from a **PDF rendering** of the manuscript rather than the source. We address
each specifically below.

---

## Major concerns

### 1. Scalability of the open-system verification

*"The Lindblad integrator is limited to M≤3 modes and N≤4 ions… the open-system
verification—the key contribution—does not [scale]. The manuscript should discuss
whether approximate methods… could extend this to larger systems."*

**Response.** We agree and have added a dedicated *Scalability* paragraph to the
Limitations (Sec. VII). The key points now made explicit:

- The bottleneck is **not** a $2^N$ wall. A single pairwise MS gate involves only the
  driven pair plus the modes it couples to (the register $2^N$ lives at the circuit
  level, as in any digital simulation), so the cost is set by the **mode count $M$**,
  not the chain length $N$.
- Three concrete routes extend it to larger $M$: **(i)** reduced-mode models made
  *quantitatively controlled* by our own E5 result (a spectator's incoherent weight
  falls off with detuning — slopes $9.8/2.1/0.08$ — so truncating to the near-resonant
  modes carries a computable $\lesssim\!10\%$ error bar); **(ii)** quantum-trajectory
  (MCWF) unravelling, replacing the $\dim^2$ density matrix with an ensemble of $\dim$
  statevectors (the closed statevector path is already implemented in `ion-ms-exact`);
  **(iii)** adiabatic elimination of far-detuned modes or a second-order cumulant
  expansion in $\kappa\tau$ ($O(\dim)$). A tensor-network treatment of the motional
  chain is a further option.

### 2. Experimental implementation details

*"…doesn't address required bandwidth, calibration overhead, sensitivity to pulse
timing errors, complexity vs. fidelity gain."*

**Response.** Added an *Experimental considerations* paragraph (Sec. VII):

- **Bandwidth.** The waveform is piecewise-constant with $n_{\rm seg}=4M+4$ segments;
  for $M=3$ over a $\tau\sim100\,\mu$s gate this is a $\sim\!160\,$kHz amplitude-update
  rate, well within standard AWG/DDS control of an AOM.
- **Peak drive.** The amplitude-modulated robust waveform's peak Rabi frequency exceeds
  the constant-closure value by a few-fold ($\sim\!4\times$); the phase-modulated variant
  (new E6, below) removes this by keeping the amplitude constant.
- **Calibration.** The design is fixed by the *same* physical inputs as a standard MS
  gate (mode frequencies, $\eta$, one global Rabi scale) — no per-segment tuning.
- **Timing errors.** This is a distinct axis from the frequency robustness we optimize;
  the palindromic symmetry of the App-C waveform makes first-order segment-boundary
  timing errors partially self-cancel. A dedicated numerical timing-jitter study is
  readily run in the verifier and is flagged as follow-up.

### 3. Quasi-static / correlated noise

*"The analysis assumes Γ constant during the gate… Real heating may have temporal
correlations or 1/f character. How robust are these conclusions to time-varying noise?"*

**Response.** Added a *Noise model* paragraph (Sec. VII). The dissipator is Markovian
with constant rates, appropriate for the incoherent **floor** (MS gates are short against
typical heating-correlation times) and for white dephasing; it does **not** capture $1/f$
or correlated heating, which would require a filter-function or explicit-bath treatment
and would shift the numerical $\Delta\omega^\times$. We make two clarifying points: (a) the
two *limiting* timescales are both modeled — *quasi-static* coherent drift is precisely
what the symmetric-robust waveform's $\partial_\delta\alpha=0$ insensitivity targets, and
white incoherent noise is the Lindblad term; only intermediate colored noise is out of
scope. (b) The trade-off **structure** ($\Delta\omega^\times\!\propto\!\sqrt{I_{\rm incoh}}$)
is generic — it needs only that $I_{\rm incoh}$ grow monotonically with gate time, true for
any positive-weight spectrum — so the qualitative verdict is robust even where the exact
crossover value would move.

### 4. Missing comparison to alternative approaches

*"…doesn't benchmark against… machine-learning-optimized pulses, dynamical decoupling
embedded in MS gates, alternative robust gate schemes (amplitude-shaped + phase-modulated
hybrids)."*

**Response.** We added a direct benchmark as a **new experiment (E6, Sec. VI)** and a
supporting argument (Sec. VII). We implemented a physically distinct robust scheme — a
**phase-modulated** (PM) waveform with *constant* amplitude and piecewise-constant laser
phase $\varphi(t)$ (the Milne *et al.* [Milne20] family), designed by solving for phases
that enforce loop closure $\alpha(\tau)=0$ *and* first-order robustness
$\partial_\delta\alpha(\tau)=0$ — and compared it head-to-head with our amplitude-modulated
(AM) designer on the same mode at the same $\tau$ (a shared evaluator, cross-checked to
reproduce the AM $|\Theta|=\pi/8$ exactly, scores both):

| | AM (amplitude-mod.) | PM (phase-mod.) |
|---|---|---|
| gate time $\tau$ | $2\pi$ | $2\pi$ (identical) |
| closure $\|\alpha(\tau)\|$ | $\sim10^{-16}$ | $\sim10^{-16}$ |
| $\delta$-robustness | quadratic | quadratic (ratio $3.97$) |
| $\|\Theta\|$ | $\pi/8$ | $\pi/8$ |
| peak Rabi $\Omega$ | $19.0$ (swinging) | $8.9$ (constant) |
| $\int_0^\tau|\alpha(t)|^2dt$ (heating) | $1.00$ | $0.31$ |

This makes the central point concrete: at equal gate time both schemes close, are
first-order $\delta$-robust, and entangle identically, so **both sit at the same crossover
$\Delta\omega^\times$** — the trade-off is set by the gate *time*, not the shaping *method*.
Methods differ only in *sub-leading, channel-specific* cost; here the PM gate is in fact
gentler ($\sim\!2\times$ lower, constant peak drive and $\sim\!3\times$ smaller heating
excursion). Benchmarking any further method (GRAPE/ML, DD-embedded, hybrids) therefore
reduces to comparing gate times and peak drives at equal robustness — which the verifier
performs uniformly. We regard a full GRAPE/ML sweep as beyond the scope of this study but
now enabled by the framework.

### 5. Figure E1 / additive-decomposition justification

*"Is this precisely 4τ, or approximately? …the additive decomposition method… needs
clearer justification—why is the cross-term negligible?"*

**Response.** Clarified in the method note (Sec. VI):

- The GBC gate time is **exactly** $4\tau$ in two-qubit operations ($\tau+2\tau+\tau$);
  the "$\approx$" flags only the neglected global-$\Pi$ single-qubit pulses (fast carrier
  $\pi$-rotations, taken ideal as in [Zhang25]).
- The channels separate by order: the post-GBC coherent residual is $O(\varepsilon^4)$
  and the incoherent error is $O(\kappa\tau\,\bar n)$, so their **cross-term is
  $O(\varepsilon^4\!\cdot\!\kappa\tau)$** — a product of two independently small quantities,
  negligible against either alone. (Even the uncompensated single gate has a cross-term
  only $O(\varepsilon^2\kappa\tau)$.) We therefore combine the validated coherent piece and
  the numerically-exact incoherent piece additively, and explicitly do **not** claim the
  sub-leading cross term.

---

## Minor issues

**Notation ($\Delta\omega$ vs $\varepsilon$).** We now define $\varepsilon\equiv\Delta\omega\tau$
(the dimensionless per-gate phase error) at first use in the abstract and keep both
symbols with that cross-reference.

**Zhang25 "appears to be the authors' own work."** It is **not** — Zhang *et al.*
(arXiv:2501.02847) is an **independent group**. We have made this explicit in the
*Relation to prior work* paragraph (Sec. I): their symmetric/asymmetric-robust waveform and
GBC construction are prior art that we reproduce as validation baselines (Sec. IV, Fig. 2)
and build upon. Our contributions are now itemized as **N1–N5**, all on the open-system /
trade-off side (design→verify pipeline; the trade-off map and $\sqrt{I}$ law; the
optimal-depth result; the $N$-ion / target-mode-dominance finding; and species-independence
plus the non-RWA/beyond-LD bound).

**Figure quality.** Two clarifications. (a) **Error bars:** the simulations are
*deterministic* (fixed-tolerance RK4; no stochastic sampling), so statistical error bars do
not apply; the relevant uncertainty is numerical (integrator tolerance + Fock truncation,
$\sim\!10^{-6}$), now quantified via the convergence study (Technical Q3 below). (b) **Axis
labels:** frequencies are in units of the reference detuning ($\delta\equiv1$ sets the
frequency unit), stated in the captions; the $\sqrt{I_{\rm incoh}}$ scaling in Fig. E3 (E3)
is the reported fit.

**Typos ("compensat ion", "veri fy", "gatetime").** These strings **do not occur** in the
manuscript source — a text search returns zero matches, and "gate time" is already two
words throughout. They are line-break hyphenation artifacts introduced by the PDF renderer;
we will ensure the compiled version disables bad hyphenation.

**Appendices A–E.** The manuscript contains one appendix (Appendix A, the
paper$\leftrightarrow$code notation map). The only other in-text "appendix" references are
already written as "[Zhang25 App. A]" and "[Zhang25 App. C]" — i.e. they point explicitly to
*[Zhang25]'s* appendices (their Magnus bound and robust-waveform derivation), not to ours. We
do not claim Appendices B–E; if the reviewer expected a fuller appendix set, we are happy to
promote the additive-decomposition argument and the convergence/method-comparison data into
dedicated appendices in the next revision.

---

## Technical questions

**Q1 — E4 optimal depth: is $k^\*\ge2$ (at $\varepsilon\gtrsim0.34$, $I_{\rm incoh}\lesssim10^{-5}$)
experimentally relevant?** No — and that is precisely the point. $\varepsilon=\Delta\omega\tau\approx0.34$
means a center-line error comparable to the gate detuning $\delta$ (a $\sim\!34\%$
miscalibration) in a near-ideal trap; no realistic gate operates there. For **all** physical
errors ($\varepsilon\lesssim0.2$) the optimum is $k^\*\in\{0,1\}$ — one GBC or none. We state
this explicitly in E4.

**Q2 — Sensitivity to neglecting cross-terms $E_{p,q}$ in the QCQP / multi-ion gates.** The
open-system verifier carries **all** inter-mode correlations explicitly (it integrates the
full density matrix with no commuting-basis factorization). Its agreement with the analytic
engine — $|\Delta F|=1\times10^{-6}$ ($M=2$) and $4.6\times10^{-4}$ ($M=3$) — therefore
*certifies* that the analytic mode-separable evaluation neglects nothing important at these
mode counts: the spin operators $\sigma_x^{(j)}$ genuinely commute, so the multi-mode
geometric phase is exact, not a cross-term-truncated approximation. We added a sentence to
E5 making this certification explicit.

**Q3 — Mode-truncation convergence ($N_{\rm Fock}=18$).** We verified it and added the data
(Sec. VII). The single-gate incoherent infidelity is **identical to five significant figures
across $N_{\rm Fock}=12$–$28$** at every heating rate tested (e.g. $8.231\times10^{-2}$ at
$\kappa=0.02$; $1.727\times10^{-1}$ at $\kappa=0.05$, a $17\%$ infidelity). Truncation does
not affect the incoherent floor even at high heating; $N_{\rm Fock}=16$–$18$ is amply
converged.

---

## Summary of changes (Priority fixes)

| Reviewer priority fix | Status | Where |
|---|---|---|
| Discuss scalability / approximate methods for larger systems | **Done** | Sec. VII (Scalability) |
| Add experimental feasibility (bandwidth, calibration, timing) | **Done** | Sec. VII (Experimental considerations) |
| Clarify the additive decomposition for GBC cost | **Done** | Sec. VI (method note) |
| Comparison to ≥1 alternative robust-gate method | **Done (new E6)** | Sec. VI (E6), Sec. VII |
| Address the quasi-static noise assumption | **Done** | Sec. VII (Noise model) |
| ($+$) $N_{\rm Fock}$ convergence, notation, prior-work delineation | **Done** | Sec. VII, abstract, Sec. I |

We believe these revisions address all of the reviewer's concerns and thank them again for
feedback that materially strengthened the paper.

---

## Response to the second (pre-acceptance) list

We thank the reviewer for the final actionable items and have applied all four to the
LaTeX source (`docs/robust-ms-gate.tex`), which is now fully synchronized with the
manuscript (U1–U4, E1–E6, non-RWA/beyond-LD) and mirrored in the markdown.

1. **Explicit experimental mapping.** Added a worked physical example to the abstract and
   to Sec. VI: a COM mode at $\omega_z=2\pi\times1$ MHz driven at $\delta=2\pi\times50$ kHz
   gives $\tau\approx20\,\mu$s; a heating rate $\dot{\bar n}\approx1$ phonon/ms corresponds
   to $\kappa\approx3\times10^{-3}$ (via $\kappa=\dot{\bar n}/\delta$), for which
   $\Delta\omega^\times\approx0.055\Rightarrow2\pi\times2.7$ kHz. Table III now carries a
   physical-Hz column, and the Fig. 3 (E3) caption states the Hz span for the reference
   $\delta$. (We note the crossover value matches the reviewer's suggested $\sim\!2\pi\times2.5$
   kHz; we corrected the heating-rate figure to the self-consistent $\sim\!1$ phonon/ms, since
   $10$ phonons/ms would give $\kappa\approx3\times10^{-2}$, an order larger.)

2. **Independent-group citation.** Sec. I now reads: "...the symmetric/asymmetric-robust
   waveform and GBC construction were recently developed by an *independent group*, Zhang
   *et al.* [Zhang25], whose coherent-error results we reproduce as validation baselines...".

3. **Figure formatting and captions.** All captions are now self-contained and state their
   dimensionless units ($\delta\equiv1$); the E3 caption and Table III give the physical-Hz
   equivalent for the reference $\delta$. Figures are generated as vector PDF (and PNG) by
   `make_figures.py` and included via `\includegraphics`; the final build uses the PDFs.

4. **Typographical polish.** Added a `\hyphenation{...}` block for the compound/code terms
   and non-breaking spaces (`gate~time`, `$2\pi\times50$~kHz`, `20~$\mu$s`) at the points the
   reviewer flagged, so the compiled PDF no longer breaks these awkwardly.
