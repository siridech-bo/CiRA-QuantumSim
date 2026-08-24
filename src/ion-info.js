// =============================================================================
// ion-info.js — long-form, source-cited educational content for the Trapped-Ion
// visualizer. Keyed by the same `data-info="..."` strings used in ion.html.
//
// Every physical claim here is grounded in the in-repo verified physics sheets
// (docs/ion-physics-constants.md, docs/ion-recoil-kernel-physics.md) and the
// engine (src/ion.js, src/ion-ms.js, src/ion-readout.js). Citations point ONLY
// to the primary sources those sheets were adversarially verified against — no
// invented references. House rule: real physics, real sources.
//
// Consumed by src/info.js: initInfo(ION_INFO).
// =============================================================================

// ---- shared reference objects (cite once, reuse everywhere) -----------------
const R = {
  W98:  { tag: 'W98',  cite: 'Wineland, Monroe, Itano, Leibfried, King & Meekhof, “Experimental Issues in Coherent Quantum-State Manipulation of Trapped Atomic Ions,” J. Res. NIST 103, 259 (1998).', href: 'https://doi.org/10.6028/jres.103.019' },
  M96:  { tag: 'M96',  cite: 'Meekhof, Monroe, King, Itano & Wineland, “Generation of Nonclassical Motional States of a Trapped Atom,” Phys. Rev. Lett. 76, 1796 (1996).', href: 'https://doi.org/10.1103/PhysRevLett.76.1796' },
  S97:  { tag: 'S97',  cite: 'Steane, “The ion trap quantum information processor,” Appl. Phys. B 64, 623 (1997); arXiv:quant-ph/9608011.', href: 'https://arxiv.org/abs/quant-ph/9608011' },
  J98:  { tag: 'J98',  cite: 'James, “Quantum dynamics of cold trapped ions with application to quantum computation,” Appl. Phys. B 66, 181 (1998); arXiv:quant-ph/9702053.', href: 'https://arxiv.org/abs/quant-ph/9702053' },
  RMP:  { tag: 'RMP',  cite: 'Leibfried, Blatt, Monroe & Wineland, “Quantum dynamics of single trapped ions,” Rev. Mod. Phys. 75, 281 (2003).', href: 'https://doi.org/10.1103/RevModPhys.75.281' },
  SM:   { tag: 'SM',   cite: 'Sørensen & Mølmer, “Quantum Computation with Ions in Thermal Motion,” Phys. Rev. Lett. 82, 1971 (1999); “Entanglement and quantum computation with ions in thermal motion,” Phys. Rev. A 62, 022311 (2000).', href: 'https://doi.org/10.1103/PhysRevLett.82.1971' },
  WT:   { tag: 'WT',   cite: 'Wallentowitz & Toschek, Phys. Rev. A 78, 043412 (2008); arXiv:0808.1272.', href: 'https://arxiv.org/abs/0808.1272' },
  Sten: { tag: 'Stenholm86', cite: 'Stenholm, “The semiclassical theory of laser cooling,” Rev. Mod. Phys. 58, 699 (1986).', href: 'https://doi.org/10.1103/RevModPhys.58.699' },
  WI79: { tag: 'WI79', cite: 'Wineland & Itano, “Laser cooling of atoms,” Phys. Rev. A 20, 1521 (1979).', href: 'https://doi.org/10.1103/PhysRevA.20.1521' },
  Ph24: { tag: 'Phatak24', cite: 'Phatak et al., Phys. Rev. A 110, 043116 (2024); arXiv:2406.19153.', href: 'https://arxiv.org/abs/2406.19153' },
  Esch: { tag: 'Eschner03', cite: 'Eschner, Morigi, Schmidt-Kaler & Blatt, “Laser cooling of trapped ions,” J. Opt. Soc. Am. B 20, 1003 (2003).', href: 'https://doi.org/10.1364/JOSAB.20.001003' },
  Paul: { tag: 'Paul90', cite: 'Paul, “Electromagnetic traps for charged and neutral particles” (Nobel lecture), Rev. Mod. Phys. 62, 531 (1990).', href: 'https://doi.org/10.1103/RevModPhys.62.531' },
  Ghosh:{ tag: 'Ghosh95', cite: 'Ghosh, “Ion Traps,” Oxford University Press (1995).' },
  CG69: { tag: 'CG69', cite: 'Cahill & Glauber, “Ordered Expansions in Boson Amplitude Operators,” Phys. Rev. 177, 1857 (1969).', href: 'https://doi.org/10.1103/PhysRev.177.1857' },
};

export const ION_INFO = {

  // =========================================================================
  //  ORIENTATION
  // =========================================================================
  'engine-overview': {
    kicker: 'The engine',
    title: 'What this simulation actually computes',
    symbol: 'ρ on ℋ = {|g⟩,|e⟩} ⊗ Fock(N),  dim = 2N',
    body: `
      <p>This is not a cartoon. Under the hood the app integrates the <b>Lindblad master
      equation</b> for the full density matrix ρ of a single ion — two internal electronic
      levels <code>|g⟩,|e⟩</code> tensored with a truncated harmonic-oscillator (motional
      Fock) space of <code>N</code> levels — so the state lives in a <code>2N</code>-dimensional
      Hilbert space.</p>
      <span class="eq">dρ/dt = −i[H, ρ] + Σ_c ( L_c ρ L_c† − ½{L_c†L_c, ρ} )</span>
      <p>The Hamiltonian is written in the frame rotating at the laser frequency (optical
      rotating-wave approximation only — <b>no</b> sideband RWA):</p>
      <span class="eq">H = −δ|e⟩⟨e| + ω_z a†a + (Ω/2)[σ⁺D(iη) + σ⁻D(iη)†]</span>
      <p>Because the <b>full displacement operator</b> <code>D(iη)=exp[iη(a+a†)]</code> is kept
      (not linearized), the carrier and the red/blue sidebands are never hard-wired — they
      <b>emerge</b> from the laser detuning δ versus the Rabi frequency Ω. Time is integrated by
      a fixed RK4 with an adaptive internal sub-step; ρ is re-Hermitized each frame. Every panel
      you see (Bloch vector, populations, fluorescence, n̄) is a genuine expectation value
      <code>Tr(ρ·Ô)</code> of this one evolving state.</p>`,
    refs: [R.W98, R.RMP, R.M96],
  },

  'modules-overview': {
    kicker: 'How to read this page',
    title: 'The eight modules — one physical story',
    body: `
      <p>The tabs walk the full life of a trapped-ion qubit, and most of them run on the
      <i>same</i> engine so you can see how one piece of physics becomes the next:</p>
      <ul>
        <li><b>M1 Paul trap</b> — why there is a harmonic oscillator at all (RF confinement).</li>
        <li><b>M2 Normal modes</b> — many ions share quantized motional modes (the future gate bus).</li>
        <li><b>M3 Sidebands</b> — laser spectroscopy of the ion: carrier + red/blue sidebands.</li>
        <li><b>M4 Doppler cooling</b> — broad-linewidth pre-cooling to a few quanta.</li>
        <li><b>M5 Sideband cooling</b> — resolved-sideband cooling to the motional ground state.</li>
        <li><b>M6 Single-qubit gate</b> — a carrier pulse rotates the qubit on the Bloch sphere.</li>
        <li><b>M7 Mølmer–Sørensen gate</b> — a shared mode entangles two qubits (Bell state).</li>
        <li><b>M8 Readout</b> — state-selective fluorescence tells you g vs e.</li>
      </ul>
      <p>Every module carries a <b>“break-it” control</b> that deliberately pushes a textbook
      approximation past its regime of validity, so you can watch the idealization fail rather
      than take it on faith.</p>`,
    refs: [R.RMP, R.W98],
  },

  // =========================================================================
  //  LASER DRIVE (M3 / M5 shared)
  // =========================================================================
  'delta': {
    kicker: 'Parameter',
    title: 'Laser detuning  δ = ω_L − ω₀',
    symbol: 'units of ω_z  ·  δ=0 carrier, δ=−ω_z red, δ=+ω_z blue',
    body: `
      <p>δ is how far the drive laser frequency sits from the bare internal
      transition <code>ω₀</code>, measured here in units of the trap frequency <code>ω_z</code>.
      It is the single knob that selects <i>which</i> transition the laser is resonant with,
      because absorbing a photon can also change the motional quantum number n:</p>
      <ul>
        <li><b>δ = 0 — carrier:</b> <code>|g,n⟩↔|e,n⟩</code>, motion unchanged.</li>
        <li><b>δ = −ω_z — red sideband (RSB):</b> <code>|g,n⟩↔|e,n−1⟩</code>, removes one phonon.
            This term is exactly the <b>Jaynes–Cummings</b> interaction <code>η(σ⁺a+σ⁻a†)</code>.</li>
        <li><b>δ = +ω_z — blue sideband (BSB):</b> <code>|g,n⟩↔|e,n+1⟩</code>, adds one phonon
            (anti-Jaynes–Cummings).</li>
      </ul>
      <p>The energy ladder makes this exact: <code>E(g,n)=ω_z n</code>, <code>E(e,n)=−δ+ω_z n</code>,
      so resonance <code>E(e,n′)=E(g,n)</code> happens precisely at <code>δ=(n′−n)ω_z</code>.
      Drag the δ line on the level diagram and watch the matching arrow family light up. The
      sidebands are only <b>resolved</b> — cleanly separable — when the drive is weaker and
      slower than the trap, <code>Ω≪ω_z</code>.</p>`,
    refs: [R.W98, R.RMP, R.M96],
  },

  'rabi': {
    kicker: 'Parameter',
    title: 'Rabi frequency  Ω',
    symbol: 'units of ω_z  ·  carrier coupling strength',
    body: `
      <p>Ω sets how strongly the laser couples <code>|g⟩</code> and <code>|e⟩</code> — the bare
      (carrier) flopping rate. The <i>effective</i> rate on any given transition is Ω times a
      motional matrix element of the displacement operator:</p>
      <span class="eq">Ω_{n,n+s} = Ω · e^(−η²/2) · η^|s| · √(n&lt;!/n&gt;!) · L_{n&lt;}^{|s|}(η²)</span>
      <p>where <code>L</code> is a generalized Laguerre polynomial (the app computes this exactly,
      by recurrence, in all regimes). Two consequences you can see live:</p>
      <ul>
        <li><b>Sideband strengths scale with √n.</b> The red sideband runs at <code>ηΩ√n</code>,
            the blue at <code>ηΩ√(n+1)</code> — sidebands are a factor ~η weaker than the carrier.</li>
        <li><b>Ω sets the spectral bandwidth.</b> A pulse of strength Ω has frequency width ~Ω. Only
            if <code>Ω≪ω_z</code> is that bandwidth narrower than the sideband spacing, so the
            sidebands stay <b>resolved</b>. Push Ω past ω_z (the “break-it”) and the carrier and
            sidebands smear together — selectivity is lost.</li>
      </ul>`,
    refs: [R.W98, R.M96, R.RMP],
  },

  'coupling': {
    kicker: 'Model choice',
    title: 'Coupling model — exact D(iη) vs. Lamb–Dicke vs. JC / anti-JC',
    symbol: "'exact' | 'ld' | 'jc' | 'ajc'",
    body: `
      <p>This selects which laser–ion coupling operator the engine uses. The default is the honest one:</p>
      <ul>
        <li><b>exact D(iη):</b> the full displacement operator <code>D(iη)=exp[iη(a+a†)]</code>,
            with Fock matrix elements <code>⟨n′|D(iη)|n⟩ = e^(−η²/2)(iη)^s √(n&lt;!/n&gt;!)L_{n&lt;}^{|s|}(η²)</code>.
            Valid for any η and any n. <b>This is the physics path;</b> the others are teaching foils.</li>
        <li><b>Lamb–Dicke (ld):</b> the linearization <code>e^(iη(a+a†)) ≈ 1 + iη(a+a†)</code>, keeping only the
            carrier and first sidebands. Valid only when <code>η²(2n+1) ≪ 1</code>.</li>
        <li><b>JC (jc):</b> keep the red-sideband term alone, <code>D→η·a</code> — the pure
            Jaynes–Cummings model (this is literally what the cavity-QED substrate simulates).</li>
        <li><b>anti-JC (ajc):</b> keep the blue-sideband term alone, <code>D→η·a†</code>.</li>
      </ul>
      <p>Set a warm state (n≈10) and a stiff coupling (η≈0.5) and compare <b>exact</b> against
      <b>ld</b>: they diverge by &gt;10% — you are watching the Lamb–Dicke approximation break
      exactly where the sheet says it should (<code>η²(2n+1)≫1</code>).</p>`,
    refs: [R.W98, R.RMP, R.CG69],
  },

  // =========================================================================
  //  TRAP → η
  // =========================================================================
  'eta': {
    kicker: 'Derived quantity',
    title: 'Lamb–Dicke parameter  η',
    symbol: 'η = k·x₀ = k·√(ħ/2mω_z)  ·  dimensionless',
    body: `
      <p>η is the single most important number in trapped-ion coupling: it is the ratio of the
      ion’s ground-state wavepacket size <code>x₀=√(ħ/2mω_z)</code> to the laser wavelength
      (through the wavevector k),</p>
      <span class="eq">η = k·x₀ = cosθ·√(E_R/ħω_z),   E_R = (ħk)²/2m  (recoil energy)</span>
      <p>Physically, η measures how much a single absorbed photon disturbs the ion’s motion. It is
      <b>not</b> a free slider here — the app <b>computes</b> it from the ion mass, the drive
      wavelength, and the trap frequency, so it stays physically consistent. For ⁴⁰Ca⁺ at a
      1&nbsp;MHz trap: <code>η≈0.097</code> on the 729&nbsp;nm qubit line, <code>η≈0.178</code> on the
      397&nbsp;nm cooling line.</p>
      <p><b>The Lamb–Dicke regime</b> is <code>η²(2n+1)≪1</code>: the wavepacket is far smaller than
      the wavelength, sidebands are weak (∝η) and the linearized model works. Stiffen the trap
      (raise ν_z) and watch η <i>fall</i> — a genuine lesson, not a cosmetic slider.</p>`,
    refs: [R.W98, R.S97, R.RMP],
  },

  'lambda': {
    kicker: 'Parameter',
    title: 'Drive wavelength  λ',
    symbol: '729 nm (S₁/₂–D₅/₂ qubit) | 397 nm (S₁/₂–P₁/₂ cooling)',
    body: `
      <p>The laser wavelength enters only through the wavevector <code>k=2π/λ</code>, which sets η
      (see the η note). The two choices correspond to the two real ⁴⁰Ca⁺ transitions this
      simulation is calibrated to:</p>
      <ul>
        <li><b>729 nm</b> — the narrow <code>S₁/₂–D₅/₂</code> electric-quadrupole “clock” line used as
            the <b>qubit</b> and for coherent gates. Long-lived D₅/₂ ⇒ a good shelving state.
            Gives <code>η≈0.097</code>.</li>
        <li><b>397 nm</b> — the broad <code>S₁/₂–P₁/₂</code> dipole line used for <b>Doppler cooling</b>
            and <b>fluorescence readout</b>. Shorter λ ⇒ larger k ⇒ <code>η≈0.178</code>.</li>
      </ul>
      <p>Because η∝1/λ, the bluer 397 nm light couples ~1.8× more strongly to the motion — which is
      exactly why it both cools efficiently and scatters brightly for detection.</p>`,
    refs: [R.W98, R.RMP],
  },

  'nutrap': {
    kicker: 'Parameter',
    title: 'Trap (secular) frequency  ν_z',
    symbol: 'MHz  ·  the physical axial oscillation frequency',
    body: `
      <p>ν_z is the real, physical frequency of the ion’s harmonic oscillation in the trap (the
      pseudopotential secular frequency from M1). It sets the phonon energy quantum <code>ħω_z</code>
      and the wavepacket size <code>x₀=√(ħ/2mω_z)</code>.</p>
      <p>Everywhere else in the app frequencies are quoted in units of ω_z (so the working
      <code>ω_z≡1</code>); ν_z only enters the <b>absolute</b> quantities — most importantly η,
      through <code>η=k√(ħ/2mω_z) ∝ 1/√ω_z</code>. Stiffen the trap and:</p>
      <ul>
        <li>the wavepacket shrinks, so <b>η falls</b> (weaker sidebands, deeper Lamb–Dicke regime);</li>
        <li>sidebands move further from the carrier (easier to resolve, <code>Ω≪ω_z</code>);</li>
        <li>the Doppler and sideband-cooling floors, quoted as n̄, shift because they scale with
            <code>Γ/ω_z</code>.</li>
      </ul>`,
    refs: [R.W98, R.RMP, R.Ghosh],
  },

  // =========================================================================
  //  DISSIPATORS
  // =========================================================================
  'se': {
    kicker: 'Dissipator',
    title: 'Spontaneous emission  Γ',
    symbol: 'collapse operator  c = √Γ · σ⁻ ⊗ I  (recoil=none)',
    body: `
      <p>An ion in <code>|e⟩</code> decays to <code>|g⟩</code> by emitting a photon at rate Γ. In the
      master equation this is a Lindblad collapse operator. In the default
      <b>“motion-preserving”</b> form the decay ignores photon recoil:</p>
      <span class="eq">c = √Γ · σ⁻ ⊗ I     (σ⁻ = |g⟩⟨e|)</span>
      <p>This alone already teaches two things: it destroys internal coherence (turn it on and
      watch the Bloch vector shrink toward the south pole / the Rabi oscillations damp), and it is
      the <b>irreversibility</b> that makes cooling possible — a closed unitary system can never
      lower its entropy. Turning recoil <i>on</i> (see the recoil-kernel note) upgrades this single
      operator to a three-operator kernel that also exchanges phonons with the emitted photon —
      the microscopic origin of the Doppler heating that sets the cooling limit.</p>`,
    refs: [R.RMP, R.W98],
  },

  'bath': {
    kicker: 'Dissipator',
    title: 'Motional heating bath  ṅ̄',
    symbol: 'L₋=√(κ(n̄+1)) a,  L₊=√(κ n̄) a†,  dn̄/dt = κ n̄_bath',
    body: `
      <p>Real traps heat: fluctuating patch potentials on the electrodes drive the motion, so an
      ion prepared in the ground state slowly climbs the Fock ladder. This is modelled as coupling
      to a thermal bath of mean occupation <code>n̄_bath</code> via two collapse operators,</p>
      <span class="eq">L₋ = √(κ(n̄_bath+1)) · a,     L₊ = √(κ n̄_bath) · a†</span>
      <p>whose net effect with the drive off is a constant heating rate <code>dn̄/dt = κ n̄_bath</code>.
      The control is exposed as that heating rate in <b>quanta per second</b> — exactly the figure
      of merit experimentalists quote for a trap. It is the enemy of every cooling and gate
      protocol here: in sideband cooling (M5) raise it and the cooling <b>stalls</b> at a higher
      floor (heating balances the cooling); in a gate it adds decoherence.</p>`,
    refs: [R.W98, R.RMP],
  },

  'dephase': {
    kicker: 'Dissipator',
    title: 'Pure dephasing  γ_φ',
    symbol: 'L_φ = √(γ_φ/2) · σz ⊗ I',
    body: `
      <p>Laser phase noise and magnetic-field fluctuations randomize the <i>relative phase</i> of
      <code>|g⟩</code> and <code>|e⟩</code> without changing their populations. This is a
      <b>T₂-type</b> process, represented by the collapse operator</p>
      <span class="eq">L_φ = √(γ_φ/2) · σz</span>
      <p>It kills the off-diagonal coherences of ρ (the |g⟩⟨e| elements) while leaving the
      diagonal populations untouched. On the Bloch sphere it shrinks the vector toward the z-axis
      but never moves it up or down; on the P_e(t) trace it damps the Rabi contrast without
      changing the mean. It is the cleanest illustration that coherence and population are
      independent resources — dephasing takes only the former.</p>`,
    refs: [R.RMP, R.W98],
  },

  'recoil': {
    kicker: 'Dissipator (advanced)',
    title: 'Spontaneous-emission recoil kernel  (η̃²)',
    symbol: 'three-operator O(η̃²) Lamb–Dicke form',
    body: `
      <p>When the ion emits a photon it recoils, exchanging momentum with its own motion — this is
      the microscopic <b>heating</b> that opposes laser cooling and ultimately sets the Doppler
      limit. Switching the recoil kernel on replaces the single motion-preserving decay operator
      with three operators (the Lamb–Dicke <code>O(η̃²)</code> reduction of the exact
      angle-integrated dissipator, RMP Eqs. 87–88):</p>
      <span class="eq">c₀ = √(Γ(1−2ξη̃²)) · σ⁻⊗I    (Debye–Waller-reduced decay)
c₋ = √(Γ ξ η̃²) · σ⁻⊗a       (recoil removes a phonon, rate ∝ n)
c₊ = √(Γ ξ η̃²) · σ⁻⊗a†      (recoil adds a phonon,   rate ∝ n+1)</span>
      <p>Two subtleties this makes visible. First, <b>η̃ is the emitted-photon</b> Lamb–Dicke
      parameter — the photon flies off in a random direction, so it is <i>not</i> the drive η; it
      is tied to the 397 nm emission line. Second, the up/down asymmetry (<code>n</code> vs
      <code>n+1</code>) is what gives net heating even from the ground state. Valid only in the
      Lamb–Dicke regime <code>η̃²(2n+1)≪1</code> — the same O(η̃²) expansion, honest about its own
      limits.</p>`,
    refs: [R.RMP, R.WT, R.Ph24, R.Sten],
  },

  'geometry': {
    kicker: 'Parameter (advanced)',
    title: 'Recoil geometry  ξ = ⟨(n̂·ẑ)²⟩',
    symbol: 'σ ⊥z: 2/5  ·  π ∥z: 1/5  ·  isotropic: 1/3',
    body: `
      <p>The recoil kernel’s strength carries a purely geometric factor ξ: the mean-square
      projection of the emission direction onto the motional (z) axis, averaged over the dipole
      radiation pattern of the transition,</p>
      <span class="eq">ξ = ⟨(n̂·ẑ)²⟩_dipole = (2 − cos²θ_a)/5</span>
      <p>where θ_a is the angle between the transition dipole and the trap axis:</p>
      <ul>
        <li><b>σ (Δm=±1), dipole ⊥ z — ξ = 2/5</b> (the RMP default, matches the ⁴⁰Ca⁺ 397 nm cooling geometry);</li>
        <li><b>π (Δm=0), dipole ∥ z — ξ = 1/5</b>;</li>
        <li><b>isotropic (orientation-averaged) — ξ = 1/3</b>.</li>
      </ul>
      <p>This is the factor whose value was historically disputed (“is it 2/5?”): it is not a
      universal number — it depends on the emission geometry. Switching π↔σ changes the recoil
      heating by the 1/5-vs-2/5 ratio, which you can see in the cooling floor.</p>`,
    refs: [R.RMP, R.WT, R.Esch, R.Sten],
  },

  // =========================================================================
  //  TRUNCATION / DIAGRAM / PLAYBACK / STATE
  // =========================================================================
  'nfock': {
    kicker: 'Numerics',
    title: 'Fock-space cutoff  N_FOCK',
    symbol: 'motional levels kept  ·  dim = 2·N_FOCK',
    body: `
      <p>The harmonic oscillator has infinitely many levels <code>|0⟩,|1⟩,|2⟩,…</code>; a computer
      keeps only the lowest <code>N_FOCK</code> of them. This is the one genuinely
      <b>unphysical</b> knob in the simulation — an honest tool must tell you when it is lying.</p>
      <p>The app therefore watches the population in the <b>top three</b> Fock states
      (the “truncation occupancy” readout above the level diagram). If a warm or strongly driven
      state pushes appreciable probability into the ceiling, that number turns red and warns
      <i>“raise N_FOCK — the simulation may be lying,”</i> because probability that should have
      flowed to higher levels is being reflected back down. Larger N_FOCK is safer but costs
      <code>dim=2N</code> and the RK4 work scales as <code>dim³</code> per step — the usual
      accuracy/speed trade.</p>`,
    refs: [R.W98],
  },

  'init-state': {
    kicker: 'Preparation',
    title: 'Initial motional state — vacuum, Fock, thermal, coherent',
    symbol: '|g,0⟩ | |g,n⟩ | thermal n̄ | coherent |α⟩',
    body: `
      <p>The qubit starts in <code>|g⟩</code>; you choose the <i>motional</i> state it is dressed
      with, and each one behaves visibly differently under the same drive:</p>
      <ul>
        <li><b>|g,0⟩ ground state:</b> the motional vacuum — the target of all cooling. On the red
            sideband it is <b>dark</b> (nothing below n=0 to couple to).</li>
        <li><b>Fock |g,n⟩:</b> a definite phonon number. Rabi flops at a single clean rate
            <code>ηΩ√n</code> — the cleanest sideband signal.</li>
        <li><b>Thermal n̄:</b> a Boltzmann mixture, <code>P(n)=n̄ⁿ/(1+n̄)ⁿ⁺¹</code> — what Doppler
            cooling leaves behind. A spread of Rabi rates ⇒ the flopping <b>collapses</b> (dephases)
            even with zero decoherence.</li>
        <li><b>Coherent |α⟩:</b> a displaced, minimum-uncertainty “classical-like” state with
            Poissonian <code>P(n)</code>. Shows sharp <b>collapse-and-revival</b> — the signature
            Meekhof et al. measured.</li>
      </ul>`,
    refs: [R.M96, R.W98],
  },

  'speed': {
    kicker: 'Playback',
    title: 'Playback speed',
    symbol: 'wall-clock scaling of the integration',
    body: `
      <p>A cosmetic control: it scales how much simulated time is advanced per animation frame, so
      you can slow a fast Rabi flop down to watch it or fast-forward a slow cooling curve. It does
      <b>not</b> change any physics — the RK4 step size and the results are identical; only the
      mapping from real seconds to simulated <code>1/ω_z</code> units changes. (The engine also
      self-calibrates the number of sub-steps per frame so playback stays smooth without losing
      accuracy.)</p>`,
    refs: [],
  },

  'zoom': {
    kicker: 'Diagram',
    title: 'Motional zoom',
    symbol: 'visual spacing of the Fock rungs',
    body: `
      <p>Cosmetic. The motional energy spacing <code>ħω_z</code> is tiny next to the internal
      optical splitting <code>ħω₀</code> (~10⁵× smaller — the level diagram already shows the axis
      as “not to scale”). This slider vertically stretches the Fock rungs so you can see individual
      phonon levels and which one the laser is addressing. No effect on the simulation.</p>`,
    refs: [],
  },

  'lenmap': {
    kicker: 'Diagram',
    title: 'Rung-length mapping',
    symbol: 'sqrt | soft-log | linear',
    body: `
      <p>Cosmetic display option. Each Fock rung’s drawn length encodes its population. Because
      populations span many orders of magnitude (a cooled state is almost all in |0⟩), a plain
      linear map hides the small rungs. <b>sqrt</b> and <b>soft-log</b> compress the dynamic range
      so faint but physically important populations (e.g. the residual tail during cooling) stay
      visible. Purely a rendering choice — the underlying ρ is unchanged.</p>`,
    refs: [],
  },

  'ghost': {
    kicker: 'Diagram',
    title: 'Ghost trail',
    symbol: '~30-frame fading history',
    body: `
      <p>Cosmetic. Overlays a fading trail of the last ~30 frames of the populations so you can see
      the <i>direction</i> of motion — populations flowing up the ladder (heating) or ratcheting
      down (cooling) — instead of just the instantaneous snapshot. No effect on the physics.</p>`,
    refs: [],
  },

  // =========================================================================
  //  M1 — PAUL TRAP
  // =========================================================================
  'm1-q': {
    kicker: 'Parameter',
    title: 'Mathieu  q  (RF confinement)',
    symbol: 'q = 2QV_RF/(m Ω_RF² r₀²)  ·  stable for q ≲ 0.908',
    body: `
      <p>A static electric field cannot trap a charge in 3D (Earnshaw’s theorem), so a Paul trap
      uses a rapidly oscillating RF field. The ion’s motion obeys the <b>Mathieu equation</b></p>
      <span class="eq">ü + [a − 2q·cos(2τ)] u = 0,    τ = Ω_RF t/2</span>
      <p>and q is the dimensionless RF drive strength. For small q the fast “micromotion” at Ω_RF
      averages into an effective harmonic <b>pseudopotential</b> with secular frequency
      <code>ω_sec ≈ (Ω_RF/2)√(a + q²/2)</code> — that is where the trap’s harmonic oscillator (and
      hence every phonon in this whole app) comes from.</p>
      <p>But confinement is only stable in a band. The app finds the a=0 stability edge
      <code>q*≈0.908</code> by bisecting the <b>monodromy (Floquet) matrix</b> condition
      <code>|Tr M|&lt;2</code> — it is <i>derived</i>, not hard-coded. <b>Break it:</b> push q past
      q* and the full ODE trajectory diverges — the ion is lost.</p>`,
    refs: [R.Paul, R.Ghosh, R.RMP],
  },

  'm1-a': {
    kicker: 'Parameter',
    title: 'Mathieu  a  (DC confinement)',
    symbol: 'a = 4QU_DC/(m Ω_RF² r₀²)  ·  static component',
    body: `
      <p>a is the dimensionless <i>static</i> (DC) contribution to the trapping potential, the
      companion of q in the Mathieu equation <code>ü+[a−2q cos(2τ)]u=0</code>. It tilts the
      stability region: positive a stiffens one axis while weakening another (real traps must keep
      <i>all</i> axes simultaneously stable, which carves out the familiar Mathieu stability
      tongue). In this 1D module you can move the operating point <code>(a,q)</code> around the
      stability diagram and watch the trajectory stay bounded inside the tongue and diverge
      outside it. The boundary itself is computed from the Floquet monodromy matrix, not drawn from
      a lookup table.</p>`,
    refs: [R.Paul, R.Ghosh],
  },

  // =========================================================================
  //  M2 — NORMAL MODES
  // =========================================================================
  'm2-n': {
    kicker: 'Parameter',
    title: 'Number of ions  N',
    symbol: 'linear Coulomb crystal in a shared well',
    body: `
      <p>Put N ions in one axial well and they repel via the Coulomb force, settling into a
      linear crystal. Small oscillations about equilibrium decompose into <b>normal modes</b> found
      by diagonalizing James’s Hessian matrix. Two exact results anchor the picture:</p>
      <ul>
        <li>the <b>centre-of-mass</b> mode is always at <code>ω_z</code>, independent of N;</li>
        <li>for two ions the <b>stretch</b> mode is at <code>√3·ω_z</code>.</li>
      </ul>
      <p>These shared modes are the whole point: a two-qubit gate (M7) uses one of them as a
      quantum <b>bus</b> to carry entanglement between ions that never touch. <b>Break it:</b> raise
      N and the equilibrium spacing compresses non-uniformly; past a critical trap
      anisotropy the linear chain buckles into a zigzag as the lowest transverse mode goes soft.</p>`,
    refs: [R.J98, R.RMP],
  },

  // =========================================================================
  //  M6 — SINGLE-QUBIT GATE
  // =========================================================================
  'm6-theta': {
    kicker: 'Parameter',
    title: 'Rotation angle  θ  (carrier pulse area)',
    symbol: 'θ = Ω_eff · t  ·  a real Rx(θ) on the qubit',
    body: `
      <p>On resonance (δ=0) the carrier drives Rabi oscillations between <code>|g⟩</code> and
      <code>|e⟩</code>. The accumulated pulse <b>area</b> <code>θ=Ω_eff·t</code> is the rotation
      angle on the Bloch sphere: the engine exposes a real coupling <code>(Ω/2)σx</code>, so this
      is a genuine <b>Rx(θ)</b> rotation about the x-axis — not a matrix pasted onto the state.</p>
      <ul>
        <li><b>θ=π (a “π pulse”)</b> fully swaps <code>|g⟩↔|e⟩</code> — the qubit NOT gate;</li>
        <li><b>θ=π/2</b> makes an equal superposition (equator of the sphere);</li>
        <li><b>θ=2π</b> returns to the start — but note the state picks up the physical −1 phase.</li>
      </ul>
      <p>There is no native Ry because the drive carries no phase here; a real machine would shift
      the laser phase by 90° to rotate about y.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm6-rabi': {
    kicker: 'Parameter (break-it)',
    title: 'Pulse strength  Ω / ω_z  (gate selectivity)',
    symbol: 'Ω≪ω_z clean carrier · Ω→ω_z motion heats',
    body: `
      <p>A single-qubit gate is supposed to touch only the internal state and leave the motion
      alone. That works only if the pulse is <b>spectrally selective</b>: its bandwidth ~Ω must be
      narrower than the distance ω_z to the motional sidebands. So <code>Ω≪ω_z</code> gives a clean
      carrier rotation with n̄ essentially unchanged.</p>
      <p><b>Break it:</b> raise Ω toward or above ω_z. The pulse is now so short (and broad) that its
      spectrum reaches the ±ω_z sidebands, the laser accidentally drives motional transitions, the
      ion heats (n̄ grows) and the internal state becomes entangled with the motion — dropping the
      gate fidelity. Crucially, this selectivity is <b>emergent</b> from Ω vs ω_z, never hard-wired:
      the same Hamiltonian just stops being selective when you break the timescale separation.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm6-delta': {
    kicker: 'Parameter',
    title: 'AC-Stark detuning  δ / ω_z  (off-resonant tilt)',
    symbol: 'Ω_gen = √(δ²+Ω²),  light shift ≈ Ω²/4δ',
    body: `
      <p>Detune the carrier off resonance and the Bloch-sphere rotation axis tilts away from x
      toward z. The state precesses at the <b>generalized Rabi frequency</b></p>
      <span class="eq">Ω_gen = √(δ² + Ω²)</span>
      <p>and never fully reaches the excited state (the flopping amplitude drops to
      <code>Ω²/(δ²+Ω²)</code>). In the far-detuned limit the drive stops transferring population
      and instead just <b>shifts the levels</b> — the <b>AC Stark / light shift</b>
      <code>≈Ω²/4δ</code>, a pure z-rotation. This is both a nuisance (an unwanted phase in gates)
      and a tool (a way to do virtual-Z rotations and to tune qubit frequencies with light). The
      “measure” button reads off Ω_gen and the light shift from the actual dynamics so you can
      check the formula.</p>`,
    refs: [R.W98, R.RMP],
  },

  // =========================================================================
  //  M4 — DOPPLER COOLING
  // =========================================================================
  'm4-gamma': {
    kicker: 'Parameter',
    title: 'Linewidth  Γ / ω_z  (Doppler regime)',
    symbol: 'broad Γ ≳ ω_z  ·  sidebands unresolved',
    body: `
      <p>Doppler cooling is the <b>opposite</b> regime to sideband cooling: it uses a <b>broad</b>
      transition, <code>Γ≳ω_z</code>, so the motional sidebands are <i>not</i> resolved — the atom
      responds to its Doppler shift rather than to individual phonon lines. Γ is that natural
      linewidth (for the real ⁴⁰Ca⁺ 397 nm line, Γ/2π≈21.6 MHz).</p>
      <p>A broad line is what makes velocity-dependent scattering — friction — possible, but it also
      sets the ultimate temperature: the faster the excited state decays, the more recoil kicks per
      unit time. Balancing friction against recoil heating gives the <b>Doppler limit</b>
      <code>k_BT_D=ħΓ/2</code>, i.e. <code>n̄≈Γ/2ω_z</code>. Note the tension: a bigger Γ cools
      faster but to a <i>hotter</i> floor.</p>`,
    refs: [R.S97, R.WI79, R.Sten, R.RMP],
  },

  'm4-delta': {
    kicker: 'Parameter (break-it)',
    title: 'Doppler detuning  δ / ω_z  (red = cool, blue = heat)',
    symbol: 'optimum δ = −Γ/2',
    body: `
      <p>For Doppler cooling the laser must be <b>red-detuned</b> (<code>δ&lt;0</code>). An ion moving
      toward the beam sees it Doppler-shifted up, closer to resonance, so it scatters more and is
      pushed back — a velocity-dependent friction force. The friction is strongest, and the cooling
      floor lowest, at</p>
      <span class="eq">δ = −Γ/2   ⇒   k_B T_D = ħΓ/2,   n̄ ≈ Γ/2ω_z</span>
      <p><b>Break it:</b> drag δ to the <b>blue</b> side (<code>δ&gt;0</code>). Now the faster-moving ion
      scatters <i>less</i>, friction reverses into <b>anti-friction</b>, and the motion runs away —
      the ion heats instead of cools. Watch n̄(t) climb on the right. This sign is the entire
      difference between cooling and heating.</p>`,
    refs: [R.WI79, R.S97, R.Sten],
  },

  'm4-rabi': {
    kicker: 'Parameter',
    title: 'Doppler drive strength  Ω / ω_z',
    symbol: 'saturation of the cooling transition',
    body: `
      <p>Ω sets how hard the broad cooling transition is driven — effectively the saturation
      parameter. Stronger driving scatters more photons per second, so cooling is <b>faster</b>,
      but at high saturation power-broadening and increased excited-state population raise the
      recoil heating, so the achievable floor degrades. The classic Doppler-limit result
      <code>k_BT_D=ħΓ/2</code> is the low-saturation ideal; in practice one trades cooling speed
      against final temperature with this knob. Here it mainly sets how quickly n̄(t) relaxes to
      its steady state.</p>`,
    refs: [R.WI79, R.Sten, R.RMP],
  },

  'm4-nbar0': {
    kicker: 'Preparation',
    title: 'Initial mean occupation  n̄₀',
    symbol: 'starting thermal phonon number',
    body: `
      <p>The warm starting point: the ion begins in a thermal motional state of mean phonon number
      n̄₀ (as an ion loaded from an oven or after imperfect cooling would). Doppler cooling then
      drives n̄(t) down from here toward the steady-state floor <code>≈Γ/2ω_z</code>. Starting
      hotter just means a longer descent; the floor it converges to is set by the Γ/δ balance, not
      by n̄₀ — a nice demonstration that laser cooling has a well-defined equilibrium temperature
      independent of the initial one.</p>`,
    refs: [R.WI79, R.S97],
  },

  // =========================================================================
  //  M7 — MØLMER–SØRENSEN
  // =========================================================================
  'm7-delta': {
    kicker: 'Parameter',
    title: 'MS detuning  δ  (from the sideband)',
    symbol: 'τ_g = 2πK/δ,   loop-closure ηΩ = δ/(2√K)',
    body: `
      <p>The Mølmer–Sørensen gate drives both qubits with a <b>bichromatic</b> field symmetric
      about the carrier, detuned by δ from the motional sidebands. The spin-dependent force pushes
      the shared mode around a loop in motional phase space:</p>
      <span class="eq">H = (ηΩ/2) S_x (a e^(−iδt) + a† e^(+iδt)),    S_x = σx⁽¹⁾+σx⁽²⁾</span>
      <p>δ sets the <b>size and duration</b> of that loop. The loop closes — the motion returns
      exactly to where it started, disentangling from the qubits — after a time
      <code>τ_g=2πK/δ</code> (K = number of loops). At closure the enclosed area is a geometric
      phase that entangles the two qubits into a Bell state. Larger δ ⇒ a smaller, faster loop.</p>`,
    refs: [R.SM, R.RMP],
  },

  'm7-k': {
    kicker: 'Parameter',
    title: 'Number of phase-space loops  K',
    symbol: 'integer;  gate time τ_g = 2πK/δ',
    body: `
      <p>K is how many times the mode traces its closed loop in phase space before the gate ends.
      Any positive integer K gives a valid gate — the geometric phase (the enclosed area) is what
      matters, and the loop-closure condition <code>ηΩ=δ/(2√K)</code> re-tunes the drive strength so
      the enclosed phase is exactly the maximally-entangling amount — a <code>σx⊗σx</code> rotation
      of <code>π/4</code> (geometric coefficient <code>Θ=π/8</code> in <code>U=exp[iΘS_x²]</code>) —
      at <code>τ_g=2πK/δ</code>.</p>
      <p>Why choose K&gt;1? A larger K means a smaller loop at fixed δ, hence a weaker required drive
      and less sensitivity to certain errors — a real experimental knob. Here it lets you see that
      the <i>same</i> Bell state is reached by geometrically different paths.</p>`,
    refs: [R.SM, R.RMP],
  },

  'm7-derr': {
    kicker: 'Parameter (break-it)',
    title: 'Detuning mismatch  Δδ',
    symbol: 'loop fails to close ⇒ Bell fidelity drops',
    body: `
      <p>The MS gate’s magic is that at exactly <code>τ_g=2πK/δ</code> the phase-space loop
      <b>closes</b>, so the motion completely disentangles from the qubits and only the pure
      two-qubit geometric phase remains — the Bell state <code>(|gg⟩+i|ee⟩)/√2</code> with fidelity
      →1, <i>independent of the motional temperature</i> (that is the Sørensen–Mølmer insight).</p>
      <p><b>Break it:</b> offset δ from its loop-closing value by Δδ. Now at the scheduled gate time
      the loop is <b>open</b> — the mode is left displaced and still entangled with the spins.
      Tracing out that residual spin–motion entanglement mixes the two-qubit state and the Bell
      fidelity drops. Watch the phase-space loop on the left fail to return to the origin.</p>`,
    refs: [R.SM, R.RMP],
  },

  // =========================================================================
  //  M8 — READOUT
  // =========================================================================
  'm8-td': {
    kicker: 'Parameter (break-it)',
    title: 'Detection window  t_d',
    symbol: 'n̄_bright = R·t_d  vs  Poisson width √n̄',
    body: `
      <p>Readout collects photons for a time t_d. The <b>bright</b> state <code>|g⟩</code> scatters
      the 397 nm probe at rate R, so the PMT sees a mean of <code>n̄_bright=R·t_d</code> photons; the
      <b>dark</b>/shelved state <code>|e⟩</code> sees only background <code>R_bg·t_d≈0</code>. Both
      counts are <b>Poisson</b>-distributed, with spread <code>√n̄</code>.</p>
      <p>Discrimination works when the two Poisson humps separate — i.e. when the gap
      <code>R·t_d</code> exceeds the width <code>√(R·t_d)</code>. <b>Break it:</b> shorten t_d.
      Fewer photons ⇒ the bright hump slides toward the dark one, they <b>overlap</b>, and the
      readout fidelity collapses. The separation is <b>emergent</b> from <code>t_d·R</code> versus
      <code>√n̄</code> — nothing is hard-wired to the true state.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm8-r': {
    kicker: 'Parameter',
    title: 'Scatter rate  R',
    symbol: 'R = Γ·ρ_ee × collection efficiency',
    body: `
      <p>R is the detected bright-state photon rate: the on-resonance 397 nm scattering rate
      <code>Γρ_ee</code> multiplied by the fraction of photons the optics actually collect (solid
      angle × detector efficiency — typically only ~10⁻³–10⁻², which is the real experimental
      bottleneck). Together with t_d it fixes the bright mean <code>n̄_bright=R·t_d</code>. Raising R
      (brighter transition, better optics) separates the bright and dark Poisson histograms and
      lifts the readout fidelity toward 1 for the same detection time — the alternative to simply
      integrating longer.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm8-rbg': {
    kicker: 'Parameter',
    title: 'Background rate  R_bg',
    symbol: 'dark-state / stray-light counts',
    body: `
      <p>R_bg is the count rate when the ion is <b>dark</b>: stray laser scatter, PMT dark counts,
      and off-resonant excitation of the shelved state. It sets the dark mean
      <code>n̄_dark=R_bg·t_d</code>, which should be ≈0 for good readout. Raising it slides the dark
      Poisson histogram to the right, into the bright one — eroding the separation and lowering
      fidelity even when the bright signal is strong. It is the practical floor on how short a
      detection window (or how dim a transition) you can get away with.</p>`,
    refs: [R.W98, R.RMP],
  },

  // =========================================================================
  //  GRAPHS / PANELS
  // =========================================================================
  'levels-diagram': {
    kicker: 'Graph',
    title: 'Double-ladder level diagram',
    symbol: 'two internal manifolds × the Fock ladder',
    body: `
      <p>The heart of the visualizer. Two vertical ladders — the <code>|g,n⟩</code> and
      <code>|e,n⟩</code> manifolds — each rung a motional Fock state n, separated internally by the
      huge optical splitting <code>ħω₀</code> (drawn with an axis break; it is really ~10⁵× the rung
      spacing). Rung <b>brightness</b> is that state’s population; the coloured <b>arrows</b> are the
      laser-driven transitions the current detuning ignites, with thickness ∝ the coupling strength
      <code>Ω_{n′,n}=Ω|⟨n′|D(iη)|n⟩|</code>. Dashed downward arrows are spontaneous emission.</p>
      <p>Drag the δ line to move between the carrier (δ=0, horizontal arrows), the red sideband
      (δ=−ω_z, down-and-across), and the blue sideband (δ=+ω_z, up-and-across). The
      <b>|g,0⟩-dark-on-red</b> effect is visible directly: the lowest red-sideband arrow has zero
      length because <code>√0=0</code>. Everything shown is read straight from the live ρ.</p>`,
    refs: [R.W98, R.M96, R.RMP],
  },

  'm1-stability': {
    kicker: 'Graph',
    title: 'Mathieu a–q stability diagram',
    symbol: 'stable ⟺ |Tr M| < 2  (Floquet)',
    body: `
      <p>The map of which trap settings actually confine the ion. For each <code>(a,q)</code> the app
      integrates one RF period of the Mathieu equation to build the <b>monodromy (Floquet) matrix</b>
      M, then tests <code>|Tr M|&lt;2</code> — the exact condition for bounded (stable) solutions.
      The shaded region is the stability tongue; the marker is your operating point. The a=0 edge
      lands at the textbook <code>q*≈0.908</code>, found here by bisection rather than lookup.
      Move the point outside the tongue and the companion trajectory plot diverges.</p>`,
    refs: [R.Paul, R.Ghosh, R.RMP],
  },

  'm1-traj': {
    kicker: 'Graph',
    title: 'Trajectory: secular motion + micromotion',
    symbol: 'u(τ) vs pseudopotential envelope',
    body: `
      <p>The ion’s actual position vs time inside the RF trap. Two timescales superpose: the slow
      <b>secular</b> oscillation at <code>ω_sec≈(Ω_RF/2)√(a+q²/2)</code> (the harmonic motion that
      becomes “the phonon mode” everywhere else in the app) and the fast <b>micromotion</b> at the
      RF frequency Ω_RF riding on top of it. The smooth envelope is the effective
      <b>pseudopotential</b> approximation. Inside the stability region the trajectory stays bounded
      by that envelope; push q past q* and it grows without bound — the ion is ejected.</p>`,
    refs: [R.Paul, R.Ghosh],
  },

  'm2-positions': {
    kicker: 'Graph',
    title: 'Equilibrium ion positions',
    symbol: 'harmonic well vs Coulomb repulsion',
    body: `
      <p>Where N ions sit when the axial harmonic confinement balances their mutual Coulomb
      repulsion, found by Newton iteration on the force equations. The spacing is <b>not</b> uniform:
      ions bunch at the centre and spread at the ends, because the central ions feel repulsion from
      both sides. This non-uniform spacing is a real experimental headache (it detunes individual
      addressing) and sets the geometry whose small oscillations give the normal modes.</p>`,
    refs: [R.J98],
  },

  'm2-bars': {
    kicker: 'Graph',
    title: 'Normal-mode frequency spectrum',
    symbol: 'eigenvalues of James’s Hessian',
    body: `
      <p>The axial normal-mode frequencies, the square-roots of the eigenvalues of the Coulomb
      Hessian (James 1998). The lowest is always the <b>centre-of-mass</b> mode at exactly
      <code>ω_z</code> (all ions move together — Coulomb forces cancel); the next for two ions is the
      <b>stretch</b> mode at <code>√3·ω_z</code>. These are the quantized “bus” modes a multi-ion
      gate uses. Click a bar to see its shape below.</p>`,
    refs: [R.J98, R.RMP],
  },

  'm2-shape': {
    kicker: 'Graph',
    title: 'Mode shape (eigenvector)',
    symbol: 'per-ion axial displacement',
    body: `
      <p>The selected normal mode’s eigenvector: the relative amplitude and sign of each ion’s
      displacement. The COM mode has all arrows equal and in-phase; the stretch mode has the ions
      moving oppositely; higher modes alternate. A two-qubit gate couples to <i>one</i> of these
      patterns, so which mode you pick — and how much each ion participates in it — determines how
      the entangling interaction is distributed across the chain.</p>`,
    refs: [R.J98],
  },

  'm6-bloch': {
    kicker: 'Graph',
    title: 'Internal-state Bloch sphere',
    symbol: 'vector = (⟨σx⟩,⟨σy⟩,⟨σz⟩) reduced over motion',
    body: `
      <p>The qubit’s internal state as a Bloch vector, <b>traced over the motion</b>:
      <code>⟨σk⟩=Tr(ρ σk)</code>. North pole = <code>|e⟩</code>, south = <code>|g⟩</code>, equator =
      superpositions. A resonant carrier pulse rotates the vector about x (Rx); an off-resonant
      pulse tilts the axis (AC Stark). Watch the <b>length</b> of the vector: pure states sit on the
      surface, but if a too-strong pulse entangles the qubit with the motion (or decoherence acts),
      the reduced vector shrinks <i>inside</i> the sphere — a direct picture of losing qubit purity
      to the motional degree of freedom.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm4-scan': {
    kicker: 'Graph',
    title: 'Steady-state n̄ vs detuning',
    symbol: 'floor map;  minimum at δ = −Γ/2',
    body: `
      <p>Sweeps the laser detuning and, for each δ, runs the ion to its cooling steady state and
      plots the final n̄. The result is a U-shaped curve: deep cooling on the <b>red</b> side with a
      minimum at <code>δ=−Γ/2</code> (the Doppler optimum), rising back up near resonance, and
      turning to <b>heating</b> (runaway n̄) on the <b>blue</b> side. It is the cleanest single view
      of why the sign and size of the detuning matter, and where the <code>k_BT_D=ħΓ/2</code> limit
      comes from.</p>`,
    refs: [R.WI79, R.S97, R.Sten],
  },

  'm4-floor': {
    kicker: 'Readout',
    title: 'Measured floor vs the canonical Doppler limit',
    symbol: 'n̄_ss = c·Γ/2ω_z,  honest about c',
    body: `
      <p>Compares the n̄ the simulation actually reaches against the textbook Doppler limit
      <code>n̄=Γ/2ω_z</code>. An honest caveat is built in: the recoil kernel used here is an
      <code>O(η̃²)</code> Lamb–Dicke expansion, valid only for <code>η̃²(2n+1)≪1</code>, so we run at
      moderate <code>Γ/ω_z≈3–6</code> where the engine gives <code>n̄_ss=c·Γ/2ω_z</code> with
      <code>c≈0.5–0.65</code> (partially-resolved sidebands over-cool below the asymptote). The
      canonical <code>n̄=Γ/2ω_z</code> is the <code>Γ≫ω_z</code> limit — precisely where this LD
      kernel breaks down. That break-down is the lesson, not a bug: the readout shows you both
      numbers and the ratio.</p>`,
    refs: [R.WI79, R.Sten, R.Ph24, R.RMP],
  },

  'm7-loop': {
    kicker: 'Graph',
    title: 'Phase-space loop  ⟨X⟩–⟨P⟩',
    symbol: 'closes at τ_g ⇒ motion disentangles',
    body: `
      <p>The trajectory of the shared motional mode in phase space (its <code>⟨X⟩,⟨P⟩</code>) during
      the gate, for the <code>|++⟩</code> spin component. The spin-dependent force pushes the mode
      out along a loop; the enclosed <b>area</b> is the geometric phase that does the entangling. The
      whole gate hinges on the loop <b>closing</b> — returning exactly to the origin at
      <code>τ_g=2πK/δ</code> — because only then is the motion left in its original state,
      disentangled from the qubits, so the final two-qubit state is pure. Mis-set δ (the break-it)
      and you can watch the loop miss the origin.</p>`,
    refs: [R.SM, R.RMP],
  },

  'm7-wigner': {
    kicker: 'Graph',
    title: 'Reduced-mode Wigner function  W(x,p)',
    symbol: 'vacuum blob at closure, cat mid-loop',
    body: `
      <p>The Wigner quasi-probability of the motional mode alone (qubits traced out) — a full phase-
      space portrait of its quantum state. During the gate the spin-dependent force pushes the two
      spin components in opposite directions, so mid-loop the mode is in a <b>Schrödinger-cat</b>-like
      superposition of two displaced blobs (with interference fringes — the tell-tale of genuine
      quantum superposition). At loop closure <code>τ_g</code> the blobs recombine back to the single
      round <b>vacuum</b> blob at the origin: the motion has returned home, confirming it is no
      longer entangled with the qubits.</p>`,
    refs: [R.SM, R.CG69, R.RMP],
  },

  'm7-pops': {
    kicker: 'Graph',
    title: 'Two-qubit populations',
    symbol: '|gg⟩ |ge⟩ |eg⟩ |ee⟩',
    body: `
      <p>The populations of the four two-qubit basis states through the gate. Starting from
      <code>|gg⟩</code>, an ideal MS gate produces the Bell state <code>(|gg⟩+i|ee⟩)/√2</code>:
      population flows into <code>|gg⟩</code> and <code>|ee⟩</code> in equal measure while
      <code>|ge⟩,|eg⟩</code> stay empty (the force couples the <i>symmetric</i> spin states). At
      <code>τ_g</code> you read a clean 50/50 split — the fingerprint of the maximally entangled
      state — and the readout reports the Bell-state fidelity extracted from the full ρ.</p>`,
    refs: [R.SM, R.RMP],
  },

  'm8-hist': {
    kicker: 'Graph',
    title: 'Photon-count histograms (bright vs dark)',
    symbol: 'two Poissonians + discrimination threshold',
    body: `
      <p>The distributions of detected photon counts for the bright <code>|g⟩</code> and dark
      <code>|e⟩</code> states over the window t_d, both <b>Poisson</b> with means
      <code>R·t_d</code> and <code>R_bg·t_d</code>. Overlaid are the sampled bars (actual random
      shots — real shot noise, drawn from a Poisson generator) and the analytic PMF, plus the
      <b>threshold</b>: counts above it are called “bright”, below “dark”. The readout error is the
      shaded overlap of the two humps, <code>E=½[P(&lt;thr|bright)+P(≥thr|dark)]</code>. When the
      humps separate cleanly, discrimination is near-perfect; shorten t_d and watch them merge.</p>`,
    refs: [R.W98, R.RMP],
  },

  'm8-sweep': {
    kicker: 'Graph',
    title: 'Readout fidelity vs detection window',
    symbol: 'F(t_d) at the optimal threshold',
    body: `
      <p>Fidelity <code>F=1−E</code> at the optimal threshold as a function of the detection time
      t_d, with the current setting marked. It rises from ~0.5 (no photons, a coin flip) toward 1 as
      t_d lengthens and the bright/dark Poisson histograms pull apart. The curve makes the core
      trade-off quantitative: <b>longer detection buys fidelity</b>, but every microsecond of readout
      is time the qubit can decohere or be lost — real experiments pick the shortest t_d that clears
      their fidelity target.</p>`,
    refs: [R.W98, R.RMP],
  },

  // =========================================================================
  //  RIGHT-SIDEBAR READOUTS
  // =========================================================================
  'observables': {
    kicker: 'Live readouts',
    title: 'Live observables',
    symbol: 'all are Tr(ρ·Ô) of the live state',
    body: `
      <p>Instantaneous expectation values of the evolving density matrix — every one is a genuine
      <code>Tr(ρ·Ô)</code>, not a stored parameter:</p>
      <ul>
        <li><b>n̄ = ⟨a†a⟩</b> — mean phonon number (the motional “temperature”).</li>
        <li><b>P_e = Tr(ρ|e⟩⟨e|)</b> — excited-state population.</li>
        <li><b>purity = Tr(ρ²)</b> — 1 for a pure state, &lt;1 once decoherence or entanglement with
            the motion mixes the qubit.</li>
        <li><b>η</b> — the computed Lamb–Dicke parameter (from mass, λ, ω_z).</li>
        <li><b>δ/ω_z, Ω/ω_z</b> — the current drive settings.</li>
        <li><b>t</b> — elapsed simulated time in units of 1/ω_z.</li>
        <li><b>dim = 2·N_FOCK</b> — the size of the Hilbert space being integrated.</li>
      </ul>`,
    refs: [R.W98, R.RMP],
  },

  'pe-trace': {
    kicker: 'Graph',
    title: 'P_e(t) — Rabi flopping',
    symbol: 'excited-state population vs time',
    body: `
      <p>The excited-state population versus time. On the carrier a pure Fock state gives clean
      sinusoidal Rabi flopping at <code>ηΩ√n</code>-type rates. Two effects degrade it, both
      physically meaningful:</p>
      <ul>
        <li><b>Dephasing from a spread of n:</b> a thermal or coherent motional state contains many n,
            each flopping at a different rate, so the oscillation <b>collapses</b> — even with zero
            decoherence. (Coherent states then <b>revive</b> — the Meekhof et al. signature.)</li>
        <li><b>Real decoherence:</b> turn on spontaneous emission or dephasing and the envelope damps
            toward a steady state.</li>
      </ul>`,
    refs: [R.M96, R.W98],
  },

  'fluor': {
    kicker: 'Graph',
    title: 'Fluorescence  R = Γ·ρ_ee',
    symbol: 'scattered-photon rate + Poisson shot noise',
    body: `
      <p>The photon-scattering rate <code>R=Γ·ρ_ee</code> — proportional to the excited-state
      population — which is what a PMT/camera actually sees. It is drawn with <b>Poisson shot
      noise</b>, because photon counting is fundamentally discrete and random: the visible scatter
      in the trace is genuine counting statistics, not numerical noise. This is the bridge between
      the abstract density matrix and a real lab signal, and the physical basis for the M8 readout
      histograms.</p>`,
    refs: [R.W98, R.RMP],
  },

  'nbar-trace': {
    kicker: 'Graph',
    title: 'n̄(t) — cooling curve',
    symbol: '⟨a†a⟩ vs time',
    body: `
      <p>The mean phonon number over time — the single clearest measure of whether the motion is
      heating or cooling. During sideband cooling (M5) it ratchets down toward the ground state;
      during Doppler cooling (M4) it relaxes to the Doppler floor; with the heating bath on it
      creeps up; blue-detuned it runs away. The approach is typically exponential toward the
      steady-state balance of cooling against heating, and the floor it settles at is the physically
      meaningful number (e.g. <code>Γ/2ω_z</code> for Doppler).</p>`,
    refs: [R.WI79, R.RMP],
  },

  'spectrum': {
    kicker: 'Graph',
    title: 'Excitation spectrum (M3)',
    symbol: 'P_e vs scanned detuning δ',
    body: `
      <p>Built by scanning the laser detuning and recording the excitation P_e at each δ: a
      spectroscopic fingerprint of the ion showing the <b>carrier</b> peak at δ=0 flanked by the
      <b>red</b> (−ω_z) and <b>blue</b> (+ω_z) sidebands. Two readable features: the sideband
      <b>spacing</b> directly measures the trap frequency ω_z, and the red/blue <b>height
      asymmetry</b> measures the temperature — for a thermal state the ratio of red to blue sideband
      areas is <code>n̄/(n̄+1)</code>, one of the two independent thermometers below.</p>`,
    refs: [R.M96, R.W98, R.RMP],
  },

  'thermometry': {
    kicker: 'Measurement',
    title: 'Thermometry — two independent n̄',
    symbol: 'sideband asymmetry  &  Rabi-flop FFT',
    body: `
      <p>Measures the mean phonon number two <b>independent</b> ways and checks they agree —
      exactly how the NIST group validated their numbers (Meekhof et al. 1996):</p>
      <ul>
        <li><b>Sideband asymmetry:</b> the ratio of red- to blue-sideband strength is
            <code>n̄/(n̄+1)</code>, so their imbalance fixes n̄. As n̄→0 the red sideband vanishes
            (|g,0⟩ is dark) — a sharp, background-free ground-state signal.</li>
        <li><b>Rabi-flop FFT:</b> a thermal state’s carrier flopping is a sum of frequencies
            <code>Ω_n∝√n</code>; Fourier-transforming P_e(t) recovers the Fock distribution P(n) and
            hence n̄.</li>
      </ul>
      <p>Two methods, one number — that agreement is the point.</p>`,
    refs: [R.M96, R.W98],
  },

  'heatmap': {
    kicker: 'Graph',
    title: '|ρ| density-matrix heatmap',
    symbol: 'magnitudes |ρ_ij|, dim × dim',
    body: `
      <p>A direct picture of the full quantum state: the magnitude of every element of the
      <code>2N×2N</code> density matrix, ρ_ij, as a grid. The <b>diagonal</b> is the populations; the
      <b>off-diagonal</b> blocks are coherences — the genuinely quantum part. You can read the
      physics off the pattern: a thermal state is diagonal (no coherences); a coherent drive lights
      up off-diagonal stripes; decoherence erodes them back toward the diagonal; and entanglement
      between the internal state and the motion shows up as structure linking the g and e blocks.
      This is the whole state the engine integrates — nothing here is summarized or faked.</p>`,
    refs: [R.W98, R.RMP],
  },

  // ===== M9 Rabi oscillations =====
  'm9-rabi': {
    kicker: 'Parameter',
    title: 'Rabi frequency  Ω / ω_z',
    symbol: 'P_e(t) = sin²(Ωt/2),  period 2π/Ω',
    body: `
      <p>Drive the carrier on resonance and the qubit undergoes <b>Rabi flopping</b>: the excited-state
      population oscillates as <code>P_e(t)=sin²(Ω·t/2)</code>, sweeping cleanly between |g⟩ and |e⟩ at
      the Rabi frequency <b>Ω</b> (set by the drive strength — laser intensity for ⁴⁰Ca⁺, microwave
      power for ¹⁷¹Yb⁺).</p>
      <p>This is the most basic calibration in the lab: the flop period <code>2π/Ω</code> defines the
      pulse areas — a <b>π-pulse</b> (t=π/Ω) fully inverts the qubit (P_e=1), a <b>π/2-pulse</b> makes an
      equal superposition (P_e=½). In a trapped ion the carrier Rabi is reduced by the Debye–Waller
      factor <code>e^{−η²/2}</code> and is only weakly n-dependent, so the flops stay coherent at low n̄.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm9-delta': {
    kicker: 'Parameter',
    title: 'Detuning  δ / ω_z  (generalized Rabi)',
    symbol: 'Ω_eff = √(δ²+Ω²),  contrast Ω²/(δ²+Ω²)',
    body: `
      <p>Move the drive off resonance and the flopping changes in two ways at once: it speeds up to the
      <b>generalized Rabi frequency</b> <code>Ω_eff=√(δ²+Ω²)</code>, and its amplitude shrinks — the qubit
      no longer reaches |e⟩, peaking at a contrast <code>Ω²/(δ²+Ω²)</code>.</p>
      <p>So a detuned drive is <b>faster but shallower</b>. This is the same physics behind the M6 AC-Stark
      tilt (the rotation axis leaves the equator), seen here directly in the flop curve.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm9-gphi': {
    kicker: 'Parameter (break-it)',
    title: 'Dephasing  γ_φ  (damped flops)',
    symbol: 'coherence decays → oscillations damp',
    body: `
      <p>Pure dephasing (magnetic-field noise, laser phase noise) randomizes the qubit phase during the
      drive, so the Rabi oscillations <b>lose amplitude over time</b> and settle toward P_e=½. At γ_φ=0
      the ideal engine flops forever; raise γ_φ and the envelope decays — the same Lindblad dissipator
      that limits real gate fidelity.</p>
      <p>This is honest, emergent decoherence: the engine integrates the full master equation, so the
      damping is a consequence of the dissipator, never a hand-added envelope.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm9-trace': {
    kicker: 'Plot',
    title: 'P_e vs drive time (the Rabi flop)',
    symbol: 'oscillation frequency = Ω_eff',
    body: `
      <p>Excited-state population versus how long the carrier has been driven. On resonance it is a clean
      <code>sin²(Ωt/2)</code>; the first maximum is the π-pulse time, the first crossing of ½ the π/2 time.
      Detuning raises the frequency and lowers the peaks; dephasing damps them toward ½. Read Ω off the
      period, read the coherence off how fast the flops fade.</p>`,
    refs: [R.W98],
  },
  'm9-floor': {
    kicker: 'Readout',
    title: 'Flop readout',
    symbol: 'Ω_eff, period, peak P_e',
    body: `
      <p>After a run this reports the generalized Rabi frequency <code>Ω_eff=√(δ²+Ω²)</code>, the flop
      period <code>2π/Ω_eff</code>, and the measured peak P_e (which should equal the ideal contrast
      <code>Ω²/Ω_eff²</code> unless dephasing has reduced it).</p>`,
    refs: [R.W98],
  },

  // ===== M10 Ramsey interferometry =====
  'm10-delta': {
    kicker: 'Parameter',
    title: 'Detuning  δ / ω_z  (fringe frequency)',
    symbol: 'P_e(T) = ½[1 + cos(δT)]',
    body: `
      <p>In a Ramsey sequence — <code>π/2</code>, free precession for time <code>T</code>, <code>π/2</code> —
      the qubit sits on the Bloch equator during the wait and precesses at the detuning δ. The final π/2
      converts that accumulated phase into a population, giving <b>Ramsey fringes</b>
      <code>P_e(T)=½[1+cos(δT)]</code>.</p>
      <p>The <b>fringe frequency is the detuning</b>: reading the fringe period <code>2π/δ</code> measures how
      far the drive is from the qubit resonance. This is the basis of precision spectroscopy and of atomic
      clocks — Ramsey's separated-oscillatory-fields method.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm10-gphi': {
    kicker: 'Parameter (break-it)',
    title: 'Dephasing  γ_φ  →  coherence time T₂*',
    symbol: 'fringe contrast ∝ e^{−T/T₂*},  T₂* ≈ 1/γ_φ',
    body: `
      <p>The whole point of Ramsey is measuring <b>coherence</b>. Phase noise during the free-precession
      interval T scrambles the accumulated phase, so the <b>fringe contrast decays</b> as the delay grows —
      the envelope is the coherence time <code>T₂*≈1/γ_φ</code>.</p>
      <p><b>Break it:</b> raise γ_φ and the fringes collapse to a flat line at P_e=½ sooner. There is no
      free-parameter fudge here: the contrast decay falls straight out of the pure-dephasing Lindblad term
      integrated across the wait.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm10-tmax': {
    kicker: 'Parameter',
    title: 'Maximum Ramsey delay  T_max',
    symbol: 'sets the range of the fringe scan',
    body: `
      <p>How far out in free-precession time T the scan sweeps. Longer T_max shows more fringe periods and
      more of the decay envelope — but if T_max ≫ T₂* the tail is just flat noise at ½. Pick T_max to see a
      few fringes AND the envelope fall.</p>`,
    refs: [R.W98],
  },
  'm10-trace': {
    kicker: 'Plot',
    title: 'P_e vs Ramsey delay T (the fringes)',
    symbol: 'frequency = δ · envelope = T₂*',
    body: `
      <p>Excited-state population versus the free-precession delay. Two independent things are visible at
      once: the <b>fringe frequency</b> (= the detuning δ) and the <b>decay of the fringe contrast</b>
      (= the coherence time T₂*). Every point is a full π/2–wait–π/2 sequence run on the real Lindblad
      engine, so the decaying fringes are the genuine simulated coherence, not a drawn-on envelope.</p>`,
    refs: [R.W98, R.RMP],
  },
  'm10-floor': {
    kicker: 'Readout',
    title: 'Fringe readout',
    symbol: 'δ (fringe freq), T₂* ≈ 1/γ_φ',
    body: `
      <p>After a scan this reports the fringe frequency <code>δ</code> and its period <code>2π/δ</code>, plus
      the coherence time <code>T₂*≈1/γ_φ</code> that sets how fast the fringe envelope decays.</p>`,
    refs: [R.W98],
  },
};
