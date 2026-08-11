// =============================================================================
// nmr-info.js — long-form, source-cited educational content for the NMR spin
// substrate (index.html). Keyed by the same `data-info="..."` strings used there.
//
// Grounded in the engine (src/quantum.js, src/gates.js) and the molecule registry
// (src/molecules.js), which already carries the cited literature parameters.
// Citations point only to real primary sources. Consumed by src/info.js:
//   initInfo(NMR_INFO).
// =============================================================================

const R = {
  VC05:  { tag: 'VC05',  cite: 'Vandersypen & Chuang, “NMR techniques for quantum control and computation,” Rev. Mod. Phys. 76, 1037 (2005); arXiv:quant-ph/0404064.', href: 'https://doi.org/10.1103/RevModPhys.76.1037' },
  Levitt:{ tag: 'Levitt08', cite: 'Levitt, “Spin Dynamics: Basics of Nuclear Magnetic Resonance,” 2nd ed., Wiley (2008).' },
  EBW:   { tag: 'EBW87',  cite: 'Ernst, Bodenhausen & Wokaun, “Principles of Nuclear Magnetic Resonance in One and Two Dimensions,” Oxford Univ. Press (1987).' },
  Bloch: { tag: 'Bloch46', cite: 'Bloch, “Nuclear Induction,” Phys. Rev. 70, 460 (1946).', href: 'https://doi.org/10.1103/PhysRev.70.460' },
  Lind:  { tag: 'Lindblad76', cite: 'Lindblad, “On the generators of quantum dynamical semigroups,” Commun. Math. Phys. 48, 119 (1976).', href: 'https://doi.org/10.1007/BF01608499' },
  GKS:   { tag: 'GKS76',  cite: 'Gorini, Kossakowski & Sudarshan, “Completely positive dynamical semigroups of N-level systems,” J. Math. Phys. 17, 821 (1976).', href: 'https://doi.org/10.1063/1.522979' },
  Hou21: { tag: 'Hou21',  cite: 'Hou et al., “SpinQ Gemini: a desktop quantum computing platform for education and research,” EPJ Quantum Technol. 8, 20 (2021); arXiv:2101.10017.', href: 'https://arxiv.org/abs/2101.10017' },
  Peng02: { tag: 'Peng02', cite: 'Peng, Zhu, Fang, Feng, Liu & Gao, “Experimental Implementation of Hogg’s Algorithm on a Three-Quantum-bit NMR Quantum Computer,” Phys. Rev. A 65, 042315 (2002); arXiv:quant-ph/0108068 — the 3-spin ¹³C system used for the alanine parameters.', href: 'https://arxiv.org/abs/quant-ph/0108068' },
  Liu07:  { tag: 'Liu07',  cite: 'Liu, Zhang & Long, “Simulation of four-body interaction in a nuclear magnetic resonance quantum information processor,” arXiv:0704.1181 (2007) — the 4-spin ¹³C (crotonic-acid) system; T2 from arXiv:1710.03646.', href: 'https://arxiv.org/abs/0704.1181' },
  Chcl3: { tag: 'CHCl3',  cite: 'Chloroform ¹H·¹³C benchmark parameters: arXiv:quant-ph/0405050 & arXiv:quant-ph/0604112.', href: 'https://arxiv.org/abs/quant-ph/0405050' },
  FN17:  { tag: 'FN17',   cite: 'Fujii & Nakajima, “Harnessing Disordered-Ensemble Quantum Dynamics for Machine Learning,” Phys. Rev. Applied 8, 024030 (2017); arXiv:1602.08159.', href: 'https://doi.org/10.1103/PhysRevApplied.8.024030' },
};

export const NMR_INFO = {

  'engine-overview': {
    kicker: 'The engine',
    title: 'What this simulation actually computes',
    symbol: 'ρ on 2ⁿ-dim Hilbert space,  n = # spins',
    body: `
      <p>This is a genuine quantum simulation, not a classical Bloch-vector cartoon. It integrates
      the <b>Lindblad master equation</b> for the full <code>2ⁿ×2ⁿ</code> density matrix ρ of an
      n-spin nuclear-spin system (n = the number of nuclei in the chosen molecule), by RK4 with an
      adaptive internal sub-step:</p>
      <span class="eq">dρ/dt = −i[H, ρ] + Σ_k ( L_k ρ L_k† − ½{L_k†L_k, ρ} )</span>
      <p>The Hamiltonian is the real weak-coupling NMR Hamiltonian — Zeeman/chemical-shift offsets
      plus scalar J-coupling — and the collapse operators <code>L_k</code> encode T1/T2 relaxation.
      Because ρ is the true density matrix, entanglement, coherences and multi-spin order are all
      represented honestly: the FID, spectrum, projection histogram and |ρ| heatmap on the right
      are all expectation values <code>Tr(ρ·Ô)</code> of this one evolving state. The earlier
      classical single-vector MVP was removed precisely so nothing here is faked.</p>`,
    refs: [R.Lind, R.GKS, R.VC05],
  },

  'molecule': {
    kicker: 'Configuration',
    title: 'Molecule — the spin system being simulated',
    symbol: 'nuclei, chemical shifts, J-matrix, T1/T2',
    body: `
      <p>Everything the engine does is read from a <b>molecule record</b>: its nuclei (isotope,
      colour, chemical-shift offset, T1, T2), the physical scalar-coupling matrix <code>J</code>
      (Hz), and the field. Switching molecule rebuilds the engine, the 3D scene (one Bloch sphere
      per spin), the circuit grid, and the histogram. The shipped library uses <b>verified
      literature numbers</b> (J, T1, T2 are real; heteronuclear display offsets are cosmetic so the
      vectors visibly precess):</p>
      <ul>
        <li><b>SpinQ 3-spin (¹H·³¹P·¹⁹F)</b> — the default teaching demo (synthetic values).</li>
        <li><b>Dimethylphosphite (¹H·³¹P)</b> — the real SpinQ Gemini sample, J=697.4 Hz.</li>
        <li><b>Chloroform (¹H·¹³C)</b> — the classic AX 2-qubit system, J=215.5 Hz.</li>
        <li><b>¹³C-alanine (3×¹³C)</b> and <b>crotonic acid (4×¹³C)</b> — <b>homonuclear</b>: all the
            same nucleus, addressed only by chemical shift, using frequency-selective soft pulses.</li>
      </ul>`,
    refs: [R.Hou21, R.Peng02, R.Liu07, R.Chcl3],
  },

  'speed': {
    kicker: 'Playback',
    title: 'Playback speed',
    symbol: 'wall-clock scaling of the integration',
    body: `
      <p>Cosmetic. It scales how much simulated time advances per animation frame — useful because
      NMR timescales span milliseconds (J-evolution) to seconds (T1). It changes only the mapping
      from real seconds to simulated time; the RK4 step and all physics results are identical.
      (High-chemical-shift homonuclear spins precess fast, so slowing playback helps you actually
      see them.)</p>`,
    refs: [],
  },

  'rf-pulse': {
    kicker: 'Control',
    title: 'RF pulses — 90°x, 90°y, 180°x',
    symbol: 'resonant B₁ rotation of the spin(s)',
    body: `
      <p>A radio-frequency pulse resonant with a nucleus rotates its magnetization about an axis in
      the transverse plane, by an angle set by the pulse area <code>θ=γB₁·t</code>. These buttons
      apply the textbook hard pulses:</p>
      <ul>
        <li><b>90°x / 90°y</b> — tip the spin from the z-axis into the transverse plane (creating the
            precessing magnetization that gives an FID), about x or y respectively;</li>
        <li><b>180°x</b> — a full inversion / refocusing pulse (the heart of spin echoes).</li>
      </ul>
      <p>On <b>heteronuclear</b> molecules each nucleus has its own channel, so a pulse is selective
      by construction. On <b>homonuclear</b> molecules a hard pulse hits <i>all</i> spins at once —
      single-spin addressing then requires frequency-selective <b>soft</b> pulses, whose selectivity
      is emergent from the pulse bandwidth vs the chemical-shift separation.</p>`,
    refs: [R.Levitt, R.VC05],
  },

  'target': {
    kicker: 'Control',
    title: 'Target nucleus',
    symbol: 'which spin the pulse / encoding acts on',
    body: `
      <p>Selects which nucleus the next RF pulse or QRC encoding is applied to. In a real
      heteronuclear NMR machine this corresponds to choosing the RF channel tuned to that isotope’s
      Larmor frequency (¹H, ³¹P, ¹⁹F, ¹³C … all resonate at very different frequencies in the same
      field, so they are independently addressable). For homonuclear samples the “target” instead
      picks which chemical-shift-resolved line the selective soft pulse is centred on.</p>`,
    refs: [R.Levitt, R.VC05],
  },

  'encoding': {
    kicker: 'QRC demo',
    title: 'Input encoding  θ = arcsin(√s)',
    symbol: 's ∈ [0,1]  →  rotation angle θ',
    body: `
      <p>This is the input step of a <b>quantum reservoir computing</b> (QRC) demo. A scalar input
      <code>s∈[0,1]</code> is mapped to a rotation angle <code>θ=arcsin(√s)</code> and applied to the
      target spin as a real <code>Rx(θ)</code> pulse, so the input controls how far the spin is
      tipped away from the ground state (θ sweeps <code>0→π/2</code> as <code>s</code> goes
      <code>0→1</code>). This <code>arcsin(√)</code> map is a common QRC / quantum-machine-learning
      feature-encoding because it spreads the input smoothly across the Bloch-sphere tipping
      angle.</p>
      <p>In QRC the encoded state is then let to evolve under the (fixed, complex) spin dynamics —
      the “reservoir” — and a simple linear readout of the resulting observables performs the
      learning. Here you can watch a single encoded input propagate through the real n-spin
      dynamics; the coupling network does the nonlinear mixing for free.</p>`,
    refs: [R.FN17, R.VC05],
  },

  'relaxation': {
    kicker: 'Physics toggle',
    title: 'Relaxation  (T1 / T2)',
    symbol: 'amplitude damping (T1) + dephasing (T2)',
    body: `
      <p>Real nuclear spins lose coherence and return to equilibrium. This toggle turns on the
      Lindblad collapse operators that model it:</p>
      <ul>
        <li><b>T1 (longitudinal / spin-lattice):</b> magnetization relaxes back toward the z-axis
            (thermal equilibrium) — amplitude damping. Seconds-scale in liquids.</li>
        <li><b>T2 (transverse / spin-spin):</b> the phase of the precessing transverse magnetization
            randomizes — pure dephasing — so the FID <b>decays</b> and the spectral lines acquire a
            finite width <code>∼1/πT2</code>. Always <code>T2 ≤ 2T1</code>.</li>
      </ul>
      <p>Turn it off and the dynamics are perfectly unitary (the FID rings forever, lines are
      infinitely sharp); turn it on and you see the honest decay set by each molecule’s measured
      T1/T2.</p>`,
    refs: [R.Bloch, R.Levitt, R.Lind],
  },

  'jcoupling': {
    kicker: 'Physics toggle',
    title: 'Scalar J-coupling',
    symbol: 'H_J = Σ 2π J_ij I_z^i I_z^j  (weak coupling)',
    body: `
      <p>Nuclei talk to each other through the bonding electrons — the <b>scalar (J) coupling</b>.
      In the weak-coupling (secular) limit used here it is the Ising-like term</p>
      <span class="eq">H_J = Σ_{i&lt;j} 2π J_ij · I_z^i I_z^j</span>
      <p>Two visible consequences: it <b>splits</b> each spectral line into a multiplet (a spin
      coupled to a neighbour resonates at slightly different frequencies depending on the
      neighbour’s state — the origin of NMR’s information content), and it is the <b>entangling</b>
      interaction that two-qubit gates exploit: a controlled-phase gate is just free evolution under
      J for a time <code>1/(2J)</code>. Toggle it off and the multiplets collapse to single lines
      and the spins evolve independently. J is a real, measured quantity for each molecule.</p>`,
    refs: [R.Levitt, R.EBW, R.VC05],
  },

  'circuit': {
    kicker: 'Center panel',
    title: 'Quantum circuit → real pulse sequences',
    symbol: 'gates compile to timed RF pulses + J-delays',
    body: `
      <p>This is a SpinQ-style gate editor, but the gates are <b>not</b> abstract matrices pasted
      onto the state — each compiles to a <b>physically real pulse sequence</b> that runs on the same
      Lindblad engine and takes real time:</p>
      <ul>
        <li><b>Single-qubit gates</b> → finite RF pulses integrated under the full Hamiltonian
            (Rz is done as a virtual-Z frame shift, as on real hardware).</li>
        <li><b>Two-qubit CZ / CNOT</b> → genuine J-coupling free evolution for <code>t=1/(2J)</code>
            with spectator refocusing and virtual-Z corrections. So CZ(¹H,³¹P) really takes
            ~11.9 ms and decoheres more than a gate on a stronger coupling.</li>
      </ul>
      <p>The “Duration” readout is the true wall-clock length of the compiled sequence, and the QASM
      panel shows the gate list. This is the honest cost of doing quantum logic in real spin
      hardware — slow gates decohere more, exactly as they must.</p>`,
    refs: [R.VC05, R.Levitt],
  },

  'bloch-spheres': {
    kicker: 'Center panel',
    title: 'Bloch spheres (one per spin)',
    symbol: 'vector = (⟨2Iₓ⟩,⟨2I_y⟩,⟨2I_z⟩) per nucleus',
    body: `
      <p>Each nucleus gets its own Bloch sphere; the arrow is that spin’s local magnetization,
      the single-spin expectation values extracted from the full density matrix by tracing out the
      other spins. A 90° pulse tips a vector into the equatorial plane, where it <b>precesses</b> at
      its chemical-shift offset; relaxation shrinks it (T2, in-plane) and pulls it back to the pole
      (T1). J-coupling lines between spheres mark the coupled pairs.</p>
      <p>One honest subtlety: when spins become <b>entangled</b>, the individual Bloch vectors
      shrink <i>inside</i> their spheres — a single arrow cannot capture a correlated multi-spin
      state. That shortening is a real, visible signature that the true state lives in the
      <code>2ⁿ</code>-dimensional space, not in n separate arrows.</p>`,
    refs: [R.Bloch, R.Levitt, R.VC05],
  },

  'fid': {
    kicker: 'Graph',
    title: 'FID — free-induction decay',
    symbol: 'real = Σ⟨I_y⟩,  imag = Σ⟨I_x⟩',
    body: `
      <p>The <b>free-induction decay</b> is the raw NMR signal: after a pulse tips magnetization into
      the transverse plane, the precessing spins induce an oscillating voltage in the detection
      coil. Here it is the sum of the transverse components across all spins (real and imaginary
      quadratures). Each spin contributes an oscillation at its own frequency, so the FID is a sum
      of decaying sinusoids — a beat pattern whose <b>envelope decays</b> at the T2 rate. It looks
      like noise but contains everything: Fourier-transforming it gives the spectrum.</p>`,
    refs: [R.Bloch, R.Levitt, R.EBW],
  },

  'spectrum': {
    kicker: 'Graph',
    title: 'Spectrum — live FFT of the FID',
    symbol: 'peaks at chemical shifts, split by J',
    body: `
      <p>The Fourier transform of the FID, computed live. This is what a spectroscopist actually
      reads: each spin appears as a peak at its <b>chemical-shift</b> frequency, and scalar coupling
      <b>splits</b> each peak into a multiplet (a doublet for one coupling partner, a triplet for two
      equivalent partners, and so on — the spacing is exactly J in Hz). Peak <b>width</b> is set by
      T2 (<code>∼1/πT2</code>). Turn off J-coupling and the multiplets merge to single lines; turn off
      relaxation and the lines become infinitely sharp spikes. A small absolute noise floor is drawn
      so an equilibrium (no-signal) state doesn’t render a fake blob.</p>`,
    refs: [R.Levitt, R.EBW, R.VC05],
  },

  'histogram': {
    kicker: 'Graph',
    title: 'Projection probability',
    symbol: 'diagonal of ρ in the computational basis',
    body: `
      <p>The probability of measuring each computational-basis state <code>|0…0⟩ … |1…1⟩</code> — the
      <code>2ⁿ</code> diagonal elements of the density matrix, i.e. what a projective z-measurement
      of all spins would yield. It is the bridge from the continuous spin dynamics to a discrete
      quantum-computing readout: after a circuit, this histogram shows the output distribution (e.g.
      the two-peak signature of a Bell state, or the encoded QRC output). Because it is read from
      the real ρ, populations always sum to 1 and reflect genuine quantum interference.</p>`,
    refs: [R.VC05, R.Levitt],
  },

  'heatmap': {
    kicker: 'Graph',
    title: '|ρ| density-matrix heatmap',
    symbol: 'magnitudes |ρ_ij|, 2ⁿ × 2ⁿ',
    body: `
      <p>The magnitude of every element of the <code>2ⁿ×2ⁿ</code> density matrix. The <b>diagonal</b>
      is the populations (the histogram); the <b>off-diagonal</b> elements are coherences — the
      genuinely quantum content. You can read the state from the pattern: thermal equilibrium is
      nearly diagonal; a superposition lights up off-diagonal blocks; T2 relaxation erodes them back
      toward the diagonal; and entanglement between spins shows as coherences linking their blocks.
      This is the entire state the engine evolves — nothing here is summarized or approximated.</p>`,
    refs: [R.VC05, R.Levitt],
  },

  'qasm': {
    kicker: 'Panel',
    title: 'QASM — the compiled gate list',
    symbol: 'human-readable circuit listing',
    body: `
      <p>A running, human-readable listing of the gates you have placed, in an OpenQASM-like syntax.
      It is the logical description of the circuit — the same gates that the compiler turns into the
      timed RF-pulse-and-J-delay schedule actually executed on the engine. Handy for seeing the
      circuit as code, exporting it, or checking that a gate you dropped landed where you intended.</p>`,
    refs: [R.VC05],
  },
};
