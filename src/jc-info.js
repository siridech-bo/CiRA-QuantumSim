// =============================================================================
// jc-info.js — long-form, source-cited educational content for the Jaynes-Cummings
// qubit-boson reservoir (jc.html). Keyed by the `data-info="..."` strings there.
//
// Grounded in the engine (src/jc.js — Hamiltonians Eq. 3 / Eq. 5) and the Wigner
// module (src/wigner.js). Citations point only to real primary sources.
// Consumed by src/info.js:  initInfo(JC_INFO).
// =============================================================================

const R = {
  JC63:  { tag: 'JC63',  cite: 'Jaynes & Cummings, “Comparison of quantum and semiclassical radiation theories with application to the beam maser,” Proc. IEEE 51, 89 (1963).', href: 'https://doi.org/10.1109/PROC.1963.1664' },
  SK93:  { tag: 'SK93',  cite: 'Shore & Knight, “The Jaynes–Cummings Model,” J. Mod. Opt. 40, 1195 (1993).', href: 'https://doi.org/10.1080/09500349314551321' },
  DGZ26: { tag: 'DGZ26', cite: 'Das, Giorgi & Zambrini, “Quantum reservoir computing in Jaynes-Cummings models,” Phys. Rev. Research 8, 023148 (2026); arXiv:2510.00171. (This substrate’s source paper.)', href: 'https://arxiv.org/abs/2510.00171' },
  Blais: { tag: 'Blais04', cite: 'Blais, Huang, Wallraff, Girvin & Schoelkopf, “Cavity quantum electrodynamics for superconducting electrical circuits,” Phys. Rev. A 69, 062320 (2004).', href: 'https://doi.org/10.1103/PhysRevA.69.062320' },
  CG69:  { tag: 'CG69',  cite: 'Cahill & Glauber, “Ordered Expansions in Boson Amplitude Operators,” Phys. Rev. 177, 1857 (1969).', href: 'https://doi.org/10.1103/PhysRev.177.1857' },
  Wig32: { tag: 'Wigner32', cite: 'Wigner, “On the Quantum Correction For Thermodynamic Equilibrium,” Phys. Rev. 40, 749 (1932).', href: 'https://doi.org/10.1103/PhysRev.40.749' },
  Lind:  { tag: 'Lindblad76', cite: 'Lindblad, “On the generators of quantum dynamical semigroups,” Commun. Math. Phys. 48, 119 (1976).', href: 'https://doi.org/10.1007/BF01608499' },
  FN17:  { tag: 'FN17',  cite: 'Fujii & Nakajima, “Harnessing Disordered-Ensemble Quantum Dynamics for Machine Learning,” Phys. Rev. Applied 8, 024030 (2017).', href: 'https://doi.org/10.1103/PhysRevApplied.8.024030' },
  Mujal: { tag: 'Mujal21', cite: 'Mujal, Martínez-Peña, Nokkala, García-Beni, Giorgi, Soriano & Zambrini, “Opportunities in Quantum Reservoir Computing and Extreme Learning Machines,” Adv. Quantum Technol. 4, 2100027 (2021).', href: 'https://doi.org/10.1002/qute.202100027' },
};

export const JC_INFO = {

  'engine-overview': {
    kicker: 'The engine',
    title: 'What this simulation actually computes',
    symbol: 'ρ on ℋ = Fock(Nc) ⊗ qubit,  dim = 2·Nc',
    body: `
      <p>A real cavity-QED substrate: a single bosonic <b>cavity mode</b> (truncated to Nc Fock
      levels) coupled to one <b>qubit</b> (two-level atom). It integrates the Lindblad master
      equation for the full <code>2Nc×2Nc</code> density matrix ρ by RK4, with cavity photon loss as
      a genuine dissipator:</p>
      <span class="eq">dρ/dt = −i[H, ρ] + κ( a ρ a† − ½{a†a, ρ} )</span>
      <p>It reproduces the reservoir of Das, Giorgi & Zambrini (Phys. Rev. Research 8, 023148,
      2026): an input signal is encoded as the cavity <b>drive amplitude β</b>, the qubit+cavity
      dynamics act as the computational “reservoir,” and a linear readout of the observables does
      the learning. Everything you see — the qubit Bloch vector, the Wigner function, ⟨N⟩ — is a
      real <code>Tr(ρ·Ô)</code> of this evolving state. This page is a separate substrate; it shares
      no state with the NMR engine.</p>`,
    refs: [R.DGZ26, R.JC63, R.Lind],
  },

  'regime': {
    kicker: 'Model choice',
    title: 'Regime — JC vs. dispersive (DJC)',
    symbol: 'H_JC = χ(aσ⁺+a†σ⁻)   |   H_DJC = χ′ a†a σz',
    body: `
      <p>Two Hamiltonians for the same qubit+cavity, selectable here:</p>
      <ul>
        <li><b>JC (Jaynes–Cummings):</b> <code>H = Δ_a σz + Δ_b a†a + χ(aσ⁺ + a†σ⁻) + iβ(a−a†) + α σx</code>.
            The <code>χ(aσ⁺+a†σ⁻)</code> term <b>exchanges</b> one excitation between qubit and cavity
            — absorb a photon, excite the atom, and back. This is the fundamental model of light–matter
            interaction, and it is exactly the resonant red-sideband term of the trapped-ion substrate.</li>
        <li><b>DJC (dispersive):</b> <code>H = χ′ a†a σz + iβ(a−a†) + α σx</code>. In the far-detuned
            limit the exchange averages out, leaving a photon-number-dependent qubit frequency shift
            <code>χ′ a†a σz</code>. No excitation is exchanged, so <b>⟨σz⟩ is conserved</b> (at α=0) —
            the cavity and qubit only <b>dephase</b> each other. This is the readout mechanism of
            circuit QED.</li>
      </ul>
      <p>Switching regimes changes which non-classical structure the cavity develops — try both and
      watch the Wigner function.</p>`,
    refs: [R.JC63, R.Blais, R.DGZ26],
  },

  'speed': {
    kicker: 'Playback',
    title: 'Playback speed',
    symbol: 'wall-clock scaling of the integration',
    body: `
      <p>Cosmetic. Scales how much simulated time advances per animation frame so you can slow down
      fast vacuum-Rabi oscillations or fast-forward slow cavity decay. It does not change the RK4
      step or any physics result — only the real-seconds-to-simulated-time mapping.</p>`,
    refs: [],
  },

  'beta': {
    kicker: 'Parameter (the input)',
    title: 'Drive amplitude  β  — the reservoir input',
    symbol: 'H_drive = iβ(t)(a − a†)',
    body: `
      <p>β is the coherent drive on the cavity, <code>iβ(a−a†)</code> — and in this reservoir it <b>is
      the input signal</b>. A value <code>s</code> to be processed is written in as β and held constant
      for one evolution window (duration dt); the next input updates β. Physically the drive
      <b>displaces</b> the cavity field (pushes it around phase space, injecting photons), and the
      subsequent qubit+cavity dynamics transform that input non-linearly.</p>
      <p>This is the encoding step of quantum reservoir computing: a stream of scalar inputs becomes a
      stream of drive amplitudes, and the reservoir’s memory of past inputs (see the input sequence)
      is what lets a simple linear readout compute temporal functions of the signal.</p>`,
    refs: [R.DGZ26, R.FN17],
  },

  'dt': {
    kicker: 'Parameter',
    title: 'Injection window  dt',
    symbol: 'time each input β is held before the next',
    body: `
      <p>How long each input β is applied before the next one arrives — the duration of one
      “reservoir step.” It sets how far the qubit+cavity evolve under a given input, and therefore how
      strongly one input is mixed with the memory of earlier ones. Too short and the reservoir barely
      responds; too long (relative to the cavity lifetime 1/κ) and it fully relaxes, erasing memory
      between steps. The interplay of dt with κ is what tunes the reservoir’s <b>fading memory</b>.</p>`,
    refs: [R.DGZ26, R.Mujal],
  },

  'input-sequence': {
    kicker: 'QRC demo',
    title: 'Input sequence — feeding a time series',
    symbol: 'β₁, β₂, … held for dt each',
    body: `
      <p>Feeds a stream of random inputs as successive drive amplitudes (one per dt window), so you
      can watch the reservoir process a <b>time series</b> rather than a single value. This exposes
      the two properties a useful reservoir must have:</p>
      <ul>
        <li><b>Echo-state / fading memory:</b> the current state depends on recent inputs but
            <i>forgets</i> the distant past — so the reservoir gives reproducible, input-driven
            responses (the state converges regardless of initial condition).</li>
        <li><b>Nonlinear mixing:</b> the qubit+cavity dynamics combine present and past inputs
            nonlinearly, which is exactly the resource a linear readout needs to compute things like
            short-term memory or parity of the input stream.</li>
      </ul>
      <p>The number of windows sets the length of the fed sequence.</p>`,
    refs: [R.DGZ26, R.FN17, R.Mujal],
  },

  'chi': {
    kicker: 'Parameter',
    title: 'JC coupling  χ',
    symbol: 'χ(aσ⁺ + a†σ⁻);  vacuum Rabi = 2χ',
    body: `
      <p>χ is the light–matter coupling strength in the Jaynes–Cummings term
      <code>χ(aσ⁺+a†σ⁻)</code>: the rate at which a single excitation is swapped between the cavity and
      the qubit. Its clearest signature is the <b>vacuum Rabi oscillation</b> — starting from
      <code>|e,0⟩</code> (excited atom, empty cavity), the system oscillates coherently to
      <code>|g,1⟩</code> (ground atom, one photon) and back at frequency <b>2χ</b>, exchanging a
      photon that does not yet exist as a real field. More generally the n-photon Rabi frequency is
      <code>2χ√(n+1)</code>. Stronger χ ⇒ faster, deeper exchange and richer reservoir dynamics.</p>`,
    refs: [R.JC63, R.SK93, R.DGZ26],
  },

  'chiP': {
    kicker: 'Parameter',
    title: 'Dispersive coupling  χ′',
    symbol: 'H_DJC = χ′ a†a σz  (photon-number qubit shift)',
    body: `
      <p>χ′ is the strength of the <b>dispersive</b> interaction <code>χ′ a†a σz</code>, active in the
      DJC regime. Here the qubit and cavity never exchange energy; instead the qubit’s frequency is
      <b>shifted in proportion to the photon number</b> (and, equivalently, the cavity frequency shifts
      depending on the qubit state). Because it commutes with σz, it <b>conserves ⟨σz⟩</b> — the qubit
      populations are frozen while its <i>phase</i> winds at a photon-number-dependent rate. This
      number-dependent phase is precisely how superconducting circuits read out a qubit without
      destroying it, and it drives the cavity toward number-cat / dephased states you can see in the
      Wigner plot.</p>`,
    refs: [R.Blais, R.DGZ26],
  },

  'kappa': {
    kicker: 'Dissipator',
    title: 'Cavity loss  κ',
    symbol: 'L = √κ · a;   ⟨N⟩ decays as e^(−κt)',
    body: `
      <p>Real cavities leak photons. This is the one dissipator here, a Lindblad collapse operator
      <code>L=√κ·a</code> that removes one photon at a time, so with no drive the photon number decays
      as <code>⟨N⟩(t)=⟨N⟩₀e^(−κt)</code> (cavity lifetime 1/κ). κ is essential to the reservoir, not a
      nuisance: it is the <b>irreversibility</b> that gives the system its <b>fading memory</b> — old
      inputs leak away, so the reservoir stays responsive to new ones rather than saturating. Set κ→0
      and the dynamics become unitary and never forget (no echo-state property); raise κ and memory
      shortens.</p>`,
    refs: [R.Lind, R.DGZ26, R.Mujal],
  },

  'alpha': {
    kicker: 'Parameter',
    title: 'Qubit tuning drive  α',
    symbol: 'H = … + α σx  (fixed, not an input)',
    body: `
      <p>α is a constant transverse drive on the qubit, <code>α σx</code>. Unlike β it is <b>not</b> an
      input — it is a fixed knob that keeps the qubit dynamics active and mixes the qubit’s
      populations so the reservoir explores more of its Hilbert space. It defaults to 0 in the JC
      regime (the exchange coupling already stirs the qubit) and to a non-zero value in the DJC regime
      (where <code>χ′a†aσz</code> alone would only dephase and leave ⟨σz⟩ frozen — α σx reintroduces the
      population dynamics needed for a rich reservoir).</p>`,
    refs: [R.DGZ26],
  },

  'deltaA': {
    kicker: 'Parameter',
    title: 'Qubit detuning  Δ_a',
    symbol: 'H = Δ_a σz + …',
    body: `
      <p>Δ_a scales the qubit term <code>Δ_a σz</code>. Because σz=diag(1,−1) here, the qubit
      transition frequency is <code>2Δ_a</code>. Together with the cavity frequency Δ_b it sets
      whether the JC exchange is <b>resonant</b> — the states <code>|e,0⟩</code> and <code>|g,1⟩</code>
      are degenerate when <code>2Δ_a=Δ_b</code>, giving strong photon–atom swapping and clean
      vacuum-Rabi oscillations — or <b>dispersive</b>, when the qubit–cavity detuning
      <code>2Δ_a−Δ_b</code> greatly exceeds χ and the exchange averages into the χ′-type number
      shift. Detuning thus interpolates between the two regimes and changes how the reservoir
      transforms its inputs.</p>`,
    refs: [R.JC63, R.Blais, R.DGZ26],
  },

  'deltaB': {
    kicker: 'Parameter',
    title: 'Cavity detuning  Δ_b',
    symbol: 'H = … + Δ_b a†a + …',
    body: `
      <p>Δ_b is the cavity-mode frequency in the rotating frame — the <code>Δ_b a†a</code> term. With a
      non-zero Δ_b the injected field <b>rotates</b> in phase space (its <code>⟨X⟩,⟨P⟩</code> precess),
      which you can watch in the Wigner plot and the ⟨X⟩ trace. The qubit–cavity detuning
      <code>2Δ_a−Δ_b</code> (the qubit frequency is <code>2Δ_a</code>, since σz=diag(1,−1)) decides
      resonant-JC vs dispersive behaviour; Δ_b on its own also controls how a driven coherent state
      swirls around before it either exchanges with the qubit or leaks away through κ.</p>`,
    refs: [R.JC63, R.DGZ26],
  },

  'Nc': {
    kicker: 'Numerics',
    title: 'Fock cutoff  Nc',
    symbol: 'photon levels kept;  dim = 2·Nc',
    body: `
      <p>The cavity mode has infinitely many photon states <code>|0⟩,|1⟩,|2⟩,…</code>; the simulation
      keeps only the lowest Nc. This is the one unphysical knob: if a strong drive β pushes appreciable
      population into the top Fock levels, the truncation reflects it back and the results become
      unreliable — raise Nc until the highest-level populations are negligible. Larger Nc is safer but
      costs <code>dim=2Nc</code> and the RK4 work grows as <code>dim³</code> per step, so it trades
      accuracy against speed.</p>`,
    refs: [R.DGZ26],
  },

  'qubit-bloch': {
    kicker: 'Center panel',
    title: 'Qubit Bloch sphere',
    symbol: 'reduced qubit ρ (partial trace over cavity)',
    body: `
      <p>The qubit’s state as a Bloch vector, obtained by <b>tracing out the cavity</b> from the joint
      density matrix, <code>ρ_qubit=Tr_cav(ρ)</code>. In the JC regime you can watch it oscillate as the
      excitation sloshes to the cavity and back (vacuum Rabi). A key honest feature: as the qubit
      becomes <b>entangled</b> with the cavity, its reduced Bloch vector shrinks <i>inside</i> the
      sphere — a pure joint state can still give a mixed qubit. That contraction is a direct visual
      measure of qubit–cavity entanglement, and cavity loss (κ) mixes it further.</p>`,
    refs: [R.JC63, R.SK93, R.DGZ26],
  },

  'wigner': {
    kicker: 'Center panel',
    title: 'Wigner function  W(X,P)',
    symbol: 'phase-space quasi-probability;  W<0 ⇒ non-classical',
    body: `
      <p>A complete phase-space portrait of the cavity’s reduced state — the Wigner quasi-probability
      distribution over the field quadratures X (position-like) and P (momentum-like), computed exactly
      in the Fock basis (Cahill–Glauber). A coherent or thermal state shows a single positive Gaussian
      blob; but genuinely quantum states — photon-number (Fock) states, cats produced by the dispersive
      coupling — develop <b>negative regions</b> (drawn blue). Wigner negativity is a rigorous
      signature of <b>non-classicality</b>: no classical probability distribution can be negative. The
      panel reports min(W); when it drops below zero the cavity has left the classical world.</p>`,
    refs: [R.Wig32, R.CG69, R.DGZ26],
  },

  'observables': {
    kicker: 'Live readouts',
    title: 'Live observables',
    symbol: 'all are Tr(ρ·Ô) of the live state',
    body: `
      <p>Instantaneous expectation values of the evolving density matrix — each a real
      <code>Tr(ρ·Ô)</code>, not a stored parameter. Typically the mean photon number
      <code>⟨N⟩=⟨a†a⟩</code>, the field quadratures <code>⟨X⟩,⟨P⟩</code>, the qubit inversion
      <code>⟨σz⟩</code>, the state <b>purity</b> <code>Tr(ρ²)</code> (which drops below 1 as cavity loss
      or qubit–cavity entanglement mixes the state), and min(W). These are exactly the features a QRC
      linear readout would be trained on.</p>`,
    refs: [R.DGZ26, R.Mujal],
  },

  'trace': {
    kicker: 'Graph',
    title: '⟨N⟩ / ⟨X⟩ time trace',
    symbol: 'mean photon number & field quadrature vs time',
    body: `
      <p>The history of the mean photon number <code>⟨N⟩=⟨a†a⟩</code> and a field quadrature
      <code>⟨X⟩</code>. With the drive off, ⟨N⟩ decays as <code>e^(−κt)</code> — the cavity emptying at
      its loss rate. Under a drive it rises and, if the cavity is detuned (Δ_b≠0), ⟨X⟩ oscillates as the
      coherent field rotates in phase space. Feeding an input sequence, this trace is the reservoir’s
      raw response to the signal — the time series a readout learns to map onto a target.</p>`,
    refs: [R.DGZ26, R.Mujal],
  },

  'fock': {
    kicker: 'Graph',
    title: 'Fock populations',
    symbol: 'P(n) = ⟨n|ρ_cav|n⟩',
    body: `
      <p>The photon-number distribution of the cavity — the probability P(n) of finding exactly n
      photons (the diagonal of the cavity’s reduced density matrix). A coherent drive gives a
      Poissonian spread; loss pulls population down toward <code>|0⟩</code>; the JC exchange and
      dispersive dynamics can carve out distinctly non-Poissonian, number-sculpted distributions. It is
      also your <b>truncation check</b>: if the highest bars (near n=Nc−1) are not negligible, raise Nc
      or the simulation may be clipping real dynamics.</p>`,
    refs: [R.DGZ26, R.CG69],
  },
};
