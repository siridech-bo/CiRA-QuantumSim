// =============================================================================
// ion-wizard.js — guided-walkthrough step scripts for the Trapped-Ion modules.
//
// Consumed by src/wizard.js (initWizard). Keyed by module id; each step has a
// short title, an actionable instruction (HTML), and a `target` CSS selector for
// the control it highlights. Every target is a real element id in ion.html, and
// every button/slider named matches the actual UI, so the student can follow along
// by clicking exactly what is highlighted.
// =============================================================================

export const ION_WIZARDS = {

  M1: {
    title: 'M1 · Paul trap',
    steps: [
      { title: 'What you’ll do', target: '#m1-stability',
        body: 'Find the trap’s <b>stability region</b>, then break it. This module is the classical Mathieu equation — no quantum engine runs here; it’s where the harmonic oscillator (every phonon later) comes from.' },
      { title: 'Set a stable point', target: '#m1-q',
        body: 'Drag <b>q (RF)</b> to about <b>0.4</b>. On the stability diagram the operating point ● sits inside the shaded tongue, and the trajectory below stays bounded.' },
      { title: 'Secular + micromotion', target: '#m1-traj',
        body: 'Look at the trajectory: a slow <b>secular</b> oscillation carries a fast <b>micromotion</b> ripple at the RF frequency, bounded by the smooth pseudopotential envelope.' },
      { title: 'Break it — lose the ion', target: '#m1-q',
        body: 'Now push <b>q</b> past <b>0.908</b>. The point leaves the stability tongue and the trajectory diverges — the ion is ejected. That <code>q*</code> boundary is computed from the Floquet matrix, not hard-coded.' },
      { title: 'Try the DC axis', target: '#m1-a',
        body: 'Nudge <b>a (DC)</b> to tilt the stability region and watch the tongue shift. Set a→0, q→0.4 to re-trap.' },
    ],
  },

  M2: {
    title: 'M2 · Normal modes',
    steps: [
      { title: 'What you’ll do', target: '#m2-bars',
        body: 'See how several ions share <b>quantized motional modes</b> — the “bus” a two-qubit gate later uses. Modes come from diagonalizing James’s Coulomb Hessian.' },
      { title: 'Two ions', target: '#m2-n',
        body: 'Set <b>N ions = 2</b>. The spectrum shows the <b>centre-of-mass</b> mode at <code>ω_z</code> and the <b>stretch</b> mode at <code>√3·ω_z</code>.' },
      { title: 'Inspect a mode', target: '#m2-bars',
        body: 'Click a bar in the spectrum to see its eigenvector below: COM has both ions moving together; stretch has them moving oppositely.' },
      { title: 'Add ions', target: '#m2-n',
        body: 'Raise <b>N</b> and watch the equilibrium positions bunch toward the centre while the spectrum fills in with more modes.' },
    ],
  },

  M3: {
    title: 'M3 · Sidebands',
    steps: [
      { title: 'What you’ll do', target: '#levels-canvas',
        body: 'Do laser spectroscopy of the ion: light up the <b>carrier</b> and the <b>red/blue sidebands</b>, which emerge purely from the detuning δ.' },
      { title: 'Prepare a warm state', target: '#btn-prepare',
        body: 'With a <b>thermal</b> motional state selected, press <b>Prepare state</b> so several Fock rungs are populated (something for the sidebands to act on).' },
      { title: 'Ignite the red sideband', target: '#delta',
        body: 'Drag the <b>δ line</b> on the diagram — or the <b>δ/ω_z</b> slider — to <b>−1</b>. The red-sideband arrows <code>|g,n⟩→|e,n−1⟩</code> light up. Notice <code>|g,0⟩</code> is dark (√0 = 0).' },
      { title: 'Carrier, then blue', target: '#delta',
        body: 'Set δ = <b>0</b> for the carrier (motion unchanged), then δ = <b>+1</b> for the blue sideband <code>|g,n⟩→|e,n+1⟩</code>.' },
      { title: 'Build the spectrum', target: '#btn-scan',
        body: 'Press <b>Scan δ → excitation spectrum</b>. It sweeps δ and plots P_e — the carrier flanked by both resolved sidebands (spacing = ω_z).' },
      { title: 'Break it — lose resolution', target: '#rabi',
        body: 'Raise <b>Ω/ω_z</b> above 1. The pulse bandwidth (~Ω) now exceeds the sideband spacing, so the lines merge into the carrier — sidebands unresolved.' },
    ],
  },

  M4: {
    title: 'M4 · Doppler cool',
    steps: [
      { title: 'What you’ll do', target: '#m4-cool',
        body: 'Broad-linewidth (Γ≳ω_z), red-detuned cooling to a few quanta — and map the <b>Doppler floor</b>, lowest at δ = −Γ/2.' },
      { title: 'Start warm', target: '#m4-nbar0',
        body: 'Set <b>initial n̄</b> to about <b>4</b>, then press <b>Start Doppler cooling</b>.' },
      { title: 'Watch it cool', target: '#nbar-canvas',
        body: 'On the right, the <b>n̄(t) cooling curve</b> relaxes from n̄₀ toward the floor. The floor is a well-defined equilibrium temperature, independent of where you started.' },
      { title: 'Map the floor', target: '#m4-scan',
        body: 'Press <b>Scan δ → n̄ floor map</b>. It runs a steady state at each δ and draws the U-curve with its minimum at δ = −Γ/2. (It runs many simulations — give it a few seconds.)' },
      { title: 'Break it — heat instead', target: '#m4-delta',
        body: 'Drag <b>δ/ω_z</b> to the <b>blue</b> (positive) side and re-cool. Friction reverses into anti-friction and n̄ runs away upward.' },
    ],
  },

  M5: {
    title: 'M5 · Sideband cool',
    steps: [
      { title: 'What you’ll do', target: '#levels-canvas',
        body: 'Resolved-sideband cooling to the motional <b>ground state</b>: drive the red sideband with spontaneous emission on, and the ladder ratchets downward.' },
      { title: 'Prepare a warm state', target: '#btn-prepare',
        body: 'Select a <b>thermal</b> state and press <b>Prepare state</b> so there is something to cool.' },
      { title: 'Cool to the ground', target: '#btn-cool',
        body: 'Press <b>Start sideband cooling (RSB + SE)</b>. Watch n̄ fall as population ratchets down; the red sideband fades away as <code>|g,0⟩</code> becomes dark.' },
      { title: 'Break it — stall the cooling', target: '#chk-bath',
        body: 'Turn on the <b>motional bath (heating)</b> and raise its rate. Cooling now balances heating and stalls at a higher floor.' },
    ],
  },

  M6: {
    title: 'M6 · 1-qubit gate',
    steps: [
      { title: 'What you’ll do', target: '#m6-scene',
        body: 'Rotate the qubit on its Bloch sphere with real carrier pulses — genuine <code>Rx(θ)</code> gates driven by the Lindblad engine.' },
      { title: 'Half flip', target: '#m6-rx90',
        body: 'Press <b>Rx(π/2)</b>. The Bloch arrow tips from the pole to the equator — an equal superposition.' },
      { title: 'Full flip', target: '#m6-rx180',
        body: 'Press <b>Rx(π)</b> — a complete <code>|g⟩↔|e⟩</code> swap (the qubit NOT gate).' },
      { title: 'Any angle', target: '#m6-theta',
        body: 'Set <b>θ/π</b> with the slider, then press <b>Apply Rx(θ·π)</b> to rotate by an arbitrary angle.' },
      { title: 'AC-Stark tilt', target: '#m6-delta',
        body: 'Set a non-zero <b>δ/ω_z</b> and press <b>Precess about tilted axis</b> — off resonance the rotation axis tilts and the state precesses at <code>√(δ²+Ω²)</code>.' },
      { title: 'Break it — lose selectivity', target: '#m6-rabi',
        body: 'Raise <b>Ω/ω_z</b> toward/above 1 and re-fire a gate. The broad, fast pulse reaches the motional sidebands, the motion heats (n̄↑) and the gate fidelity drops.' },
    ],
  },

  M7: {
    title: 'M7 · MS gate',
    steps: [
      { title: 'What you’ll do', target: '#m7-loop',
        body: 'Run a two-qubit <b>Mølmer–Sørensen</b> gate: a spin-dependent force drives a phase-space loop that closes and leaves the qubits in a Bell state.' },
      { title: 'Run the gate', target: '#m7-run',
        body: 'Press <b>Run MS gate</b> from <code>|gg,0⟩</code>. Watch the phase-space loop trace out and return to the origin at <code>τ_g</code>.' },
      { title: 'Read the Bell state', target: '#m7-pops',
        body: 'Populations settle to a 50/50 split of <code>|gg⟩</code> and <code>|ee⟩</code>, the readout reports Bell fidelity ≈ 1, and the mode’s Wigner returns to the vacuum blob (motion disentangled).' },
      { title: 'Break it — leave the loop open', target: '#m7-derr',
        body: 'Set a non-zero <b>Δδ</b> mismatch and run again. The loop no longer closes at <code>τ_g</code>, residual spin–motion entanglement lingers, and the fidelity drops.' },
      { title: 'Reset', target: '#m7-reset',
        body: 'Press <b>Reset to |gg,0⟩</b> to start over with a clean state.' },
    ],
  },

  M8: {
    title: 'M8 · Readout',
    steps: [
      { title: 'What you’ll do', target: '#m8-hist',
        body: 'State-selective fluorescence readout: bright <code>|g⟩</code> scatters photons, dark <code>|e⟩</code> doesn’t. A threshold on the Poisson counts tells them apart.' },
      { title: 'Clean separation', target: '#m8-hist',
        body: 'With a long detection window the bright and dark Poisson histograms are well separated → high readout fidelity. Note the threshold sitting between the two humps.' },
      { title: 'Resample the shots', target: '#m8-resample',
        body: 'Press <b>Resample shots</b> to draw fresh Poisson-distributed photon counts. The bars jump around (real shot noise) but the fidelity stays put — it comes from statistics, not a fixed answer.' },
      { title: 'Break it — overlap the humps', target: '#m8-td',
        body: 'Shorten the <b>detection window t_d</b>. Fewer photons ⇒ the bright hump slides into the dark one, they overlap, and the readout fidelity collapses.' },
      { title: 'Recover with brightness', target: '#m8-r',
        body: 'Raise <b>R scatter</b> to pull the histograms apart again at the same t_d — the alternative to simply integrating longer.' },
    ],
  },

  M9: {
    title: 'M9 · Rabi oscillations',
    steps: [
      { title: 'What you’ll do', target: '#m9-trace-canvas',
        body: 'Drive the carrier and watch the qubit <b>flop</b> between |g⟩ and |e⟩ — the most basic calibration in the lab. On resonance <code>P_e(t)=sin²(Ωt/2)</code>.' },
      { title: 'Set the Rabi frequency', target: '#m9-rabi',
        body: 'Set <b>Ω/ω_z ≈ 1</b>. Ω sets the flop rate: the period is <code>2π/Ω</code>, a <b>π-pulse</b> (full inversion) takes t=π/Ω, a <b>π/2</b> half that.' },
      { title: 'Run it', target: '#m9-run',
        body: 'Press <b>Run Rabi flops</b>. P_e draws live, oscillating 0→1→0 at Ω. The first peak is your π-pulse; the first crossing of ½ is your π/2.' },
      { title: 'Detune it', target: '#m9-delta',
        body: 'Raise <b>δ</b> and re-run: the flops speed up to <code>√(δ²+Ω²)</code> but no longer reach 1 — the contrast drops to <code>Ω²/(δ²+Ω²)</code>. That is the generalized Rabi.' },
      { title: 'Break it — dephasing', target: '#m9-gphi',
        body: 'Raise <b>γ_φ</b> and re-run: the flops <b>damp</b> toward P_e=½ as coherence is lost during the drive — real decoherence straight from the master equation.' },
    ],
  },

  M10: {
    title: 'M10 · Ramsey interferometry',
    steps: [
      { title: 'What you’ll do', target: '#m10-trace-canvas',
        body: 'Measure coherence: <b>π/2 → wait T → π/2</b>. Sweeping T builds <b>Ramsey fringes</b> whose decaying envelope is the coherence time T₂*.' },
      { title: 'Set the detuning', target: '#m10-delta',
        body: 'Set <b>δ ≈ 1</b>. The detuning is the <b>fringe frequency</b>: <code>P_e(T)=½[1+cos(δT)]</code>, so the fringe period 2π/δ reads δ back out.' },
      { title: 'Run the scan', target: '#m10-run',
        body: 'Press <b>Run Ramsey scan</b>. Each point is a full π/2–wait–π/2 sequence on the real engine; the fringes build up left to right.' },
      { title: 'Break it — kill coherence', target: '#m10-gphi',
        body: 'Raise <b>γ_φ</b> and re-run: the fringe envelope <b>collapses faster</b> — a shorter <code>T₂*≈1/γ_φ</code>. This is exactly how coherence time is measured.' },
      { title: 'Longer delays', target: '#m10-tmax',
        body: 'Increase <b>T max</b> to see more fringe periods and the full envelope decay. Beyond T₂* the fringes wash out to a flat ½.' },
    ],
  },
};
