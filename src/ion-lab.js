// =============================================================================
// ion-lab.js — the "🔬 In the lab" overlay: links each trapped-ion MODULE's
// abstract simulation to the REAL apparatus that implements it. Each module can
// carry two reference atoms — ⁴⁰Ca⁺ (optical, Innsbruck) and ¹⁷¹Yb⁺ (microwave /
// MAGIC, Wunderlich) — each with an energy-level diagram, an apparatus schematic,
// and a table mapping every visualizer control to the physical device + the value
// actually used in experiment, with links into the Library reader. An embedded AI
// copilot (BYO key, shared app-wide) lets the user ask about it. Prototype: M3.
// =============================================================================
import { explainStream, hasApiKey, setApiKey } from './claude-client.js';

const READER = (file) => 'pdf.html?file=' + encodeURIComponent(file);

// ---- SVG diagrams (theme-aware via ion-lab.css classes) --------------------
const CA_ENERGY_SVG = `
<svg class="lab-svg" viewBox="0 0 440 300" role="img" aria-label="⁴⁰Ca⁺ level scheme">
  <line class="lvl" x1="55" y1="265" x2="175" y2="265"/><text class="lvl-lbl" x="30" y="269">S₁/₂</text>
  <line class="lvl" x1="150" y1="95"  x2="260" y2="95"/><text class="lvl-lbl" x="265" y="99">P₁/₂</text>
  <line class="lvl" x1="160" y1="68"  x2="270" y2="68"/><text class="lvl-lbl" x="275" y="72">P₃/₂</text>
  <line class="lvl" x1="270" y1="196" x2="390" y2="196"/><text class="lvl-lbl" x="395" y="200">D₅/₂</text>
  <line class="lvl" x1="270" y1="168" x2="390" y2="168"/><text class="lvl-lbl" x="395" y="172">D₃/₂</text>
  <line class="tr tr-cool" x1="112" y1="265" x2="180" y2="95"/><text class="tr-lbl" x="70" y="185">397 nm</text>
  <line class="tr tr-rp"   x1="300" y1="168" x2="238" y2="95"/><text class="tr-lbl" x="300" y="135">866 nm</text>
  <line class="tr tr-rp"   x1="330" y1="196" x2="250" y2="68"/><text class="tr-lbl" x="336" y="140">854 nm</text>
  <line class="tr tr-qubit" x1="158" y1="265" x2="292" y2="196"/><text class="tr-lbl q" x="188" y="243">729 nm</text>
  <text class="tr-note" x="150" y="288">carrier δ=0 · red sideband δ=−ω_z · blue δ=+ω_z (on 729 nm)</text>
</svg>`;
const CA_APPARATUS_SVG = `
<svg class="lab-svg" viewBox="0 0 440 230" role="img" aria-label="Ca apparatus">
  <rect class="box" x="150" y="80" width="150" height="66" rx="8"/>
  <text class="box-lbl" x="225" y="160" text-anchor="middle">linear Paul trap (RF + DC endcaps)</text>
  <circle class="ion" cx="225" cy="113" r="6"/><text class="tr-lbl" x="225" y="98" text-anchor="middle">⁴⁰Ca⁺</text>
  <rect class="aom" x="40" y="98" width="56" height="30" rx="4"/><text class="aom-lbl" x="68" y="117" text-anchor="middle">AOM</text>
  <text class="tr-lbl q" x="10" y="94">729 nm</text>
  <line class="beam q" x1="96" y1="113" x2="150" y2="113" marker-end="url(#arh)"/><text class="cap" x="68" y="146" text-anchor="middle">sets δ, Ω</text>
  <line class="beam cool" x1="60" y1="205" x2="205" y2="128" marker-end="url(#arh)"/><text class="tr-lbl" x="40" y="217">397 + 866 nm  (Doppler + repump)</text>
  <line class="beam det" x1="225" y1="80" x2="225" y2="42" marker-end="url(#arh)"/>
  <polygon class="lens" points="205,42 245,42 225,26"/><rect class="box small" x="255" y="24" width="70" height="24" rx="4"/>
  <text class="cap" x="290" y="40" text-anchor="middle">PMT / EMCCD</text><text class="cap" x="150" y="40">397 nm fluorescence</text>
  <defs><marker id="arh" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="arh"/></marker></defs>
</svg>`;
const YB_ENERGY_SVG = `
<svg class="lab-svg" viewBox="0 0 742 470" role="img" aria-label="¹⁷¹Yb⁺ full level scheme">
  <defs><marker id="ua" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" refX="7.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="arh"/></marker></defs>

  <!-- ²P₁/₂ (left, top) -->
  <line class="lvl" x1="72" y1="90" x2="192" y2="90"/><text class="hf-lbl" x="198" y="94">F=1</text>
  <line class="lvl" x1="72" y1="104" x2="192" y2="104"/><text class="hf-lbl" x="198" y="108">F=0</text>
  <text class="lvl-lbl" x="66" y="101" text-anchor="end">²P₁/₂</text>
  <text class="mod-lbl" x="10" y="126">369.5 nm</text><text class="mod-lbl" x="10" y="138">23 MHz</text><text class="mod-lbl" x="10" y="150">Cooling</text>
  <text class="hf-lbl" x="210" y="120">2.1 GHz</text>

  <!-- ²S₁/₂ (left, bottom) — qubit -->
  <line class="lvl" x1="72" y1="405" x2="192" y2="405"/><text class="hf-lbl" x="198" y="409">F=1</text>
  <line class="lvl" x1="72" y1="419" x2="192" y2="419"/><text class="hf-lbl" x="198" y="423">F=0</text>
  <text class="lvl-lbl" x="66" y="416" text-anchor="end">²S₁/₂</text>
  <text class="tr-lbl q" x="98" y="438">12.6 GHz</text>

  <!-- 369.5 nm cooling + EOM modulation (vertical) -->
  <line class="tr tr-cool" x1="150" y1="405" x2="150" y2="106" marker-end="url(#ua)"/>
  <line class="tr tr-cool thin" x1="112" y1="405" x2="112" y2="106" marker-end="url(#ua)"/>
  <line class="tr tr-cool thin" x1="131" y1="405" x2="131" y2="106" marker-end="url(#ua)"/>
  <text class="mod-lbl" x="112" y="258" transform="rotate(-90 112 258)" text-anchor="middle">Modulation EOM 14.7 GHz</text>
  <text class="mod-lbl" x="131" y="258" transform="rotate(-90 131 258)" text-anchor="middle">Modulation EOM 2.1 GHz</text>
  <text class="mod-lbl" x="150" y="258" transform="rotate(-90 150 258)" text-anchor="middle">Diode laser 369.5 nm</text>

  <!-- ²D₃/₂ (middle) -->
  <line class="lvl" x1="382" y1="250" x2="502" y2="250"/><text class="hf-lbl" x="508" y="254">F=2</text>
  <line class="lvl" x1="382" y1="264" x2="502" y2="264"/><text class="hf-lbl" x="508" y="268">F=1</text>
  <text class="lvl-lbl" x="508" y="283">²D₃/₂</text>
  <text class="hf-lbl" x="320" y="261">0.86 GHz</text>

  <!-- ³[3/2]₁/₂ (935 upper) -->
  <line class="lvl" x1="402" y1="150" x2="522" y2="150"/><text class="hf-lbl" x="528" y="154">F=0</text>
  <line class="lvl" x1="402" y1="164" x2="522" y2="164"/><text class="hf-lbl" x="528" y="168">F=1</text>
  <text class="lvl-lbl sm" x="462" y="142" text-anchor="middle">³[3/2]₁/₂</text>
  <text class="hf-lbl" x="366" y="161">2.2 GHz</text>

  <!-- 935.2 nm Repump 1 + EOM -->
  <line class="tr tr-rp" x1="462" y1="250" x2="462" y2="166" marker-end="url(#ua)"/>
  <line class="tr tr-rp thin" x1="432" y1="250" x2="432" y2="166" marker-end="url(#ua)"/>
  <text class="mod-lbl" x="432" y="208" transform="rotate(-90 432 208)" text-anchor="middle">EOM 3.07 GHz</text>
  <text class="mod-lbl" x="462" y="208" transform="rotate(-90 462 208)" text-anchor="middle">Diode 935.2 nm</text>
  <text class="mod-lbl" x="300" y="206">935.2 nm</text><text class="mod-lbl" x="300" y="218">4.2 MHz</text><text class="mod-lbl" x="300" y="230">Repump 1</text>

  <!-- 435.5 nm E2 clock (²S₁/₂ F=0 → ²D₃/₂ F=2) -->
  <line class="tr tr-clock" x1="192" y1="419" x2="384" y2="251" marker-end="url(#ua)"/>
  <text class="mod-lbl clk" x="286" y="350">435.5 nm</text><text class="mod-lbl clk" x="286" y="362">E2, 3.1 Hz</text><text class="mod-lbl clk" x="286" y="374">Clock transition</text>

  <!-- ²F₇/₂ (right, low) -->
  <line class="lvl" x1="600" y1="330" x2="700" y2="330"/><text class="hf-lbl" x="706" y="334">F=4</text>
  <line class="lvl" x1="600" y1="344" x2="700" y2="344"/><text class="hf-lbl" x="706" y="348">F=3</text>
  <text class="lvl-lbl" x="594" y="341" text-anchor="end">²F₇/₂</text>
  <text class="hf-lbl" x="628" y="364">3.6 GHz</text>

  <!-- ¹[3/2]₃/₂ (760 upper, top-right) -->
  <line class="lvl" x1="470" y1="70" x2="590" y2="70"/><text class="hf-lbl" x="596" y="74">F=2</text>
  <line class="lvl" x1="470" y1="84" x2="590" y2="84"/><text class="hf-lbl" x="596" y="88">F=1</text>
  <text class="lvl-lbl sm" x="464" y="67" text-anchor="end">¹[3/2]₃/₂</text>
  <text class="hf-lbl" x="434" y="81">1.7 GHz</text>

  <!-- 760 nm Repump 2 (E2) + EOM (diagonal) -->
  <line class="tr tr-rp" x1="628" y1="330" x2="550" y2="86" marker-end="url(#ua)"/>
  <line class="tr tr-rp thin" x1="656" y1="330" x2="578" y2="86" marker-end="url(#ua)"/>
  <text class="mod-lbl" x="662" y="150">760 nm</text><text class="mod-lbl" x="662" y="162">E2</text><text class="mod-lbl" x="662" y="174">Repump 2</text>
  <text class="mod-lbl" x="596" y="235" transform="rotate(-72 596 235)" text-anchor="middle">Modulation EOM 5.3 GHz</text>
  <text class="mod-lbl" x="624" y="243" transform="rotate(-72 624 243)" text-anchor="middle">Diode laser 760 nm</text>

  <!-- decay paths (dotted) -->
  <line class="decay" x1="412" y1="164" x2="198" y2="405"/>
  <line class="decay" x1="550" y1="84" x2="410" y2="250"/>
  <line class="decay" x1="472" y1="80" x2="198" y2="405"/>

  <text class="lvl-lbl" x="371" y="460" text-anchor="middle">¹⁷¹Yb⁺ — full level scheme (not to scale)</text>
</svg>`;
const YB_APPARATUS_SVG = `
<svg class="lab-svg" viewBox="0 0 470 214" role="img" aria-label="¹⁷¹Yb⁺ apparatus (MAGIC)">
  <rect class="box" x="150" y="82" width="150" height="56" rx="8"/>
  <circle class="ion" cx="215" cy="110" r="6"/><text class="tr-lbl" x="228" y="114">¹⁷¹Yb⁺</text>
  <text class="box-lbl" x="225" y="160" text-anchor="middle">linear Paul trap + static magnetic gradient (MAGIC)</text>
  <!-- microwave source (laser-free qubit drive) -->
  <polygon class="aom" points="40,96 40,124 94,110"/><text class="aom-lbl" x="55" y="90">μw</text>
  <line class="beam q" x1="94" y1="110" x2="150" y2="110" marker-end="url(#arh)"/>
  <text class="cap q" x="46" y="150">12.6 GHz → δ, Ω</text>
  <!-- static B-gradient: rising field along the trap axis -->
  <line class="grad" x1="168" y1="78" x2="168" y2="70"/><line class="grad" x1="192" y1="78" x2="192" y2="64"/>
  <line class="grad" x1="216" y1="78" x2="216" y2="56"/><line class="grad" x1="240" y1="78" x2="240" y2="48"/>
  <text class="cap q" x="150" y="40">∂B/∂z (MAGIC) → η_eff</text>
  <!-- cooling / repump -->
  <line class="beam cool" x1="55" y1="205" x2="196" y2="122" marker-end="url(#arh)"/>
  <text class="tr-lbl" x="40" y="212">369 + 935 nm  (Doppler + repump)</text>
  <!-- detection -->
  <line class="beam det" x1="240" y1="98" x2="352" y2="48" marker-end="url(#arh)"/>
  <polygon class="lens" points="338,52 372,44 356,66"/><rect class="box small" x="374" y="40" width="72" height="24" rx="4"/>
  <text class="cap" x="410" y="56" text-anchor="middle">PMT / EMCCD</text>
  <text class="cap" x="300" y="34">369 nm fluorescence</text>
  <defs><marker id="arh" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="arh"/></marker></defs>
</svg>`;

export const ION_LAB = {
  M3: {
    heading: 'M3 · In the lab — sideband spectroscopy',
    atoms: {
      Ca: {
        label: '⁴⁰Ca⁺ · optical (Innsbruck)',
        intro: `M3's carrier and red/blue sidebands, in a real ⁴⁰Ca⁺ experiment, are <b>laser spectroscopy of a single ion</b>:
          a narrow <b>729 nm</b> laser drives the <code>S₁/₂–D₅/₂</code> "clock" transition, and its detuning selects the carrier
          or a motional sideband. Below is the atom, the apparatus, and what each slider corresponds to on the optical table.`,
        energySvg: CA_ENERGY_SVG,
        energyCaption: `<b>⁴⁰Ca⁺ level scheme.</b> The qubit is <code>S₁/₂</code>↔<code>D₅/₂</code> (metastable, τ≈1.1 s), driven on the
          narrow <b>729 nm</b> quadrupole line — where M3's sidebands live. <b>397 nm</b> does Doppler cooling &amp; readout; <b>866</b>
          repumps D₃/₂; <b>854</b> quenches D₅/₂ (sideband cooling, M5).`,
        apparatusSvg: CA_APPARATUS_SVG,
        apparatusCaption: `<b>Apparatus.</b> The 729 nm beam passes through an <b>AOM</b> that shifts its frequency (→ detuning δ) and
          power (→ Rabi Ω) — the AOM <i>is</i> the M3 "δ" and "Ω" sliders. 397 nm Doppler-cools and reads out; 866 nm repumps D₃/₂;
          the 397 nm fluorescence is collected on a PMT/EMCCD.`,
        paramRows: [
          ['λ (nm) = 729', '729 nm Ti:Sapphire laser locked to a high-finesse cavity, on the S₁/₂–D₅/₂ quadrupole line', '729 nm', 'the Lamb–Dicke parameter η'],
          ['ν_z (MHz)', 'axial secular frequency — DC endcap voltages + electrode geometry', '≈ 2π × 1 MHz', 'ω_z (and η ∝ 1/√ω_z)'],
          ['δ / ω_z', '729 detuning via a double-pass AOM. carrier=0, RSB=−ω_z, BSB=+ω_z (AOM shifted ∓ν_z)', 'AOM shift 0 / ∓1 MHz', 'which line (carrier/RSB/BSB)'],
          ['Ω / ω_z', '729 Rabi frequency — 729 beam intensity &amp; focus. Kept ≪ ω_z so sidebands stay resolved', '2π × (1–50 kHz)', 'carrier &amp; sideband strength'],
          ['spontaneous emission Γ', 'the D₅/₂ qubit line is metastable (Γ/2π ≈ 0.14 Hz) — that narrowness is why it is the qubit. The broad P₁/₂ (397 nm, Γ/2π ≈ 22 MHz) is used only for cooling/detection', 'qubit ≈ 0.14 Hz', 'decoherence during a pulse'],
          ['coupling = exact D(iη)', 'the real ion obeys the full displacement operator; "Lamb–Dicke"/"JC" are teaching foils', '—', 'coupling model'],
        ],
        paramNote: `The visualizer runs in <b>natural units</b> (ω_z ≡ 1). Set <b>ν_z ≈ 1 MHz</b> and the app's computed
          <b>η ≈ 0.097</b> (729 nm) is exactly the experimental value.`,
        sources: [
          ['Cooling techniques for trapped ions (Segal &amp; Wunderlich)', '26-cooling-techniques-for-trapped-ions.pdf', 'Fig. 2 — the ⁴⁰Ca⁺ level scheme'],
          ['Chwalla PhD thesis (Innsbruck, 2009)', 'thesis-2009-chwalla-precision-spectroscopy-ca-ions.pdf', '729 nm laser &amp; sideband spectroscopy'],
          ['Roos PhD thesis (Innsbruck, 2000)', 'thesis-2000-roos-controlling-the-quantum-state-of-trapped-ions.pdf', 'trap + laser apparatus, sideband cooling'],
          ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'trap RF-resonator circuit (Fig. a)'],
        ],
      },
      Yb: {
        label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
        wideEnergy: true,
        intro: `For <b>¹⁷¹Yb⁺</b> — the atom of the Wunderlich/Siegen group (and its spin-out eleQtron) — the qubit is a
          ground-state hyperfine pair <code>²S₁/₂ F=0↔F=1</code> near <b>12.6 GHz</b>, driven by microwaves rather than a laser.
          What makes M3's motional sidebands addressable is a static <b>magnetic-field gradient (MAGIC)</b>, which ties the ion's
          position to its spin frequency. That coupling appears only on a magnetically <i>sensitive</i> transition, so the working
          pair is <code>|F=0,mF=0⟩↔|F=1,mF=+1⟩</code> rather than the field-insensitive clock line — a <b>laser-free</b> route to
          M3's sidebands.`,
        energySvg: YB_ENERGY_SVG,
        energyCaption: `<b>¹⁷¹Yb⁺ — full level scheme</b> (after the source publication). The MAGIC qubit is <code>²S₁/₂ F=0↔F=1</code> near
          <b>12.6 GHz</b> (microwave; zero-field splitting 12.642 812 GHz), on a field-<i>sensitive</i> mF component so the gradient
          shifts it with position. Lasers: <b>369.5 nm</b> (23 MHz) cools/reads out on ²S₁/₂–²P₁/₂; <b>935.2 nm</b> repumps ²D₃/₂ →
          ³[3/2]₁/₂ (Repump 1); <b>760 nm</b> (E2) repumps metastable ²F₇/₂ → ¹[3/2]₃/₂ (Repump 2). EOM sidebands (14.7 / 2.1 / 3.07 /
          5.3 GHz) address the hyperfine components. ¹⁷¹Yb⁺ also carries a <b>435.5 nm</b> E2 optical clock/qubit (²S₁/₂→²D₃/₂,
          3.1 Hz), shown here but not used by the MAGIC microwave gate.`,
        apparatusSvg: YB_APPARATUS_SVG,
        apparatusCaption: `<b>Apparatus (MAGIC).</b> A microwave horn (12.6 GHz) drives the qubit — its frequency sets the detuning δ,
          its power sets the Rabi Ω. A static gradient <b>∂B/∂z</b> makes the spin frequency position-dependent, supplying the
          effective spin–motion coupling <b>η_eff</b> — the role the 729 nm laser's photon recoil plays in Ca⁺. 369 nm Doppler-cools
          and reads out (fluorescence); 935 nm repumps the ²D₃/₂ leak.`,
        paramRows: [
          ['λ / η (computed)', 'NOT a laser wavelength — for ¹⁷¹Yb⁺ the coupling is the EFFECTIVE Lamb–Dicke parameter from a static magnetic-field gradient ∂B/∂z (MAGIC). The sim\'s η stands in for this η_eff', 'gradient ~20–150 T/m ⇒ η_eff ~10⁻³–10⁻²', 'effective spin–motion coupling'],
          ['ν_z (MHz)', 'axial secular frequency — DC voltages + geometry', '≈ 2π × (0.1–1) MHz', 'ω_z (and η_eff)'],
          ['δ / ω_z', 'detuning of the 12.6 GHz microwave (or RF) from the qubit, set by the synthesizer. carrier=0, RSB=−ω_z, BSB=+ω_z', 'synth offset 0 / ∓ω_z', 'carrier / red / blue sideband'],
          ['Ω / ω_z', 'microwave/RF Rabi frequency — set by the microwave power; can be strong', '2π × (1–100 kHz)', 'pulse strength'],
          ['spontaneous emission Γ', 'the ground-state hyperfine qubit has essentially NO spontaneous emission; but because MAGIC needs a field-sensitive transition, coherence is limited by magnetic-field noise (dephasing), not Γ. 369 nm ²P₁/₂ (Γ/2π ≈ 19.6 MHz) is used only for cooling/detection', 'qubit ~0 (dephasing-limited)', 'decoherence'],
          ['coupling = exact D(iη)', 'MAGIC supplies the spin–motion coupling; the qubit is driven with long-wavelength radiation, so gates are "laser-free"', '—', 'coupling model'],
        ],
        paramNote: `This is the <b>¹⁷¹Yb⁺ / MAGIC</b> route (Wunderlich, Siegen; eleQtron). Key difference from Ca⁺: <b>no qubit laser</b> —
          the effective Lamb–Dicke parameter comes from the magnetic-field gradient, and the qubit is a 12.6 GHz field-sensitive
          microwave hyperfine transition. The visualizer's λ/η control represents η_eff here.`,
        sources: [
          ['Ion trap quantum logic using long wavelength radiation (Mintert &amp; Wunderlich)', '62-ion-trap-quantum-logic-using-long-wavelength-radiation.pdf', 'the foundational MAGIC proposal'],
          ['Individual addressing &amp; coupling motional/spin states with rf (Johanning et al.)', '44-individual-addressing-of-trapped-ions-and-coupling-of-m.pdf', 'rf/microwave sidebands in a gradient'],
          ['Designer Spin Pseudomolecule in a magnetic gradient (Khromova et al.)', '32-designer-spin-pseudomolecule-implemented-with-trapped-i.pdf', 'MAGIC spin–spin coupling'],
          ['Blueprint for a microwave trapped-ion quantum computer (Lekitsch et al.)', '16-blueprint-for-a-microwave-trapped-ion-quantum-computer.pdf', 'full microwave-QC architecture'],
        ],
      },
    },
  },
};

// =============================================================================
// M1 · Paul trap.  The trap hardware is identical for both atoms — only MASS
// differs (q ∝ 1/m, ω_z ∝ 1/√m at fixed voltages), so the diagrams are shared.
// =============================================================================
const M1_RADIAL_SVG = `
<svg class="lab-svg" viewBox="0 0 300 252" role="img" aria-label="linear Paul trap — radial cross-section">
  <circle class="elec-rf" cx="88" cy="74" r="20"/><text class="tr-lbl q" x="88" y="44" text-anchor="middle">RF</text>
  <circle class="elec-rf" cx="212" cy="178" r="20"/><text class="tr-lbl q" x="212" y="216" text-anchor="middle">RF</text>
  <circle class="elec-gnd" cx="212" cy="74" r="20"/><text class="cap" x="212" y="44" text-anchor="middle">0 V</text>
  <circle class="elec-gnd" cx="88" cy="178" r="20"/><text class="cap" x="88" y="216" text-anchor="middle">0 V</text>
  <ellipse class="field" cx="150" cy="126" rx="33" ry="33"/>
  <circle class="ion" cx="150" cy="126" r="6"/>
  <line class="dim" x1="150" y1="126" x2="196" y2="96"/><text class="cap" x="176" y="106">r₀</text>
  <text class="box-lbl" x="150" y="242" text-anchor="middle">radial RF pseudopotential ⇒ secular ω_r</text>
</svg>`;
const M1_AXIAL_SVG = `
<svg class="lab-svg" viewBox="0 0 330 210" role="img" aria-label="linear Paul trap — axial view">
  <line class="rail" x1="72" y1="62" x2="258" y2="62"/><line class="rail" x1="72" y1="150" x2="258" y2="150"/>
  <text class="cap q" x="165" y="54" text-anchor="middle">RF blade rails (radial)</text>
  <rect class="elec-gnd" x="44" y="70" width="15" height="72" rx="3"/><rect class="elec-gnd" x="271" y="70" width="15" height="72" rx="3"/>
  <text class="cap" x="51" y="162" text-anchor="middle">+U</text><text class="cap" x="278" y="162" text-anchor="middle">+U</text>
  <path class="well" d="M108,90 Q165,150 222,90"/>
  <circle class="ion" cx="150" cy="122" r="5"/><circle class="ion" cx="165" cy="122" r="5"/><circle class="ion" cx="180" cy="122" r="5"/>
  <line class="dim" x1="150" y1="133" x2="180" y2="133"/><text class="cap" x="165" y="145" text-anchor="middle">z₀</text>
  <text class="box-lbl" x="165" y="192" text-anchor="middle">DC endcaps ⇒ axial well ω_z</text>
</svg>`;

const M1_CA_ROWS = [
  ['q (RF)', 'Mathieu q = 2QV_RF/(mΩ_RF²r₀²) — radial confinement set by the RF amplitude V_RF at drive Ω_RF on the blades', 'V_RF~200–500 V, Ω_RF/2π~20–30 MHz ⇒ q~0.2–0.4', 'radial secular ω_r, stability'],
  ['a (DC)', 'Mathieu a = −4QU_DC/(mΩ_RF²r₀²) — a small DC bias that splits the radial frequencies', '|a| ≪ q (near 0)', 'radial anisotropy'],
  ['ν_z (MHz)', 'axial secular frequency from the DC endcaps: ω_z=√(2κQU_ec/(m z₀²)) ∝ 1/√m', '≈1 MHz (U_ec a few V)', 'ω_z → η'],
  ['q* ≈ 0.908', 'the a=0 stability edge (the sim finds it by bisection); push q past it and the ion is lost', '—', 'trap stability limit'],
];
const M1_YB_ROWS = [
  ['q (RF)', 'same trap; q ∝ 1/m, so at the SAME V_RF, Ω_RF the heavier ¹⁷¹Yb⁺ sits at q_Yb=(40/171)·q_Ca — deeper inside the stable zone', 'runs ~2× stronger RF (or larger q) to match Ca confinement', 'radial secular ω_r'],
  ['a (DC)', 'same Mathieu a ∝ 1/m', '|a| ≪ q', 'radial anisotropy'],
  ['ν_z (MHz)', 'ω_z ∝ 1/√m ⇒ at the same U_ec, ¹⁷¹Yb⁺ ω_z is √(40/171)=0.48× Ca — so a higher endcap voltage reaches ~1 MHz', '≈0.5–1 MHz (higher U_ec)', 'ω_z → η_eff'],
  ['q* ≈ 0.908', 'the SAME universal edge — in dimensionless (a,q) the stability diagram is mass-independent', '—', 'trap stability limit'],
];
const M1_SOURCES = [
  ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'trap RF-resonator circuit & Mathieu confinement'],
  ['Ion-trajectory analysis for micromotion minimization (Berkeland-style)', '21-ion-trajectory-analysis-for-micromotion-minimization-an.pdf', 'secular motion + micromotion in the RF field'],
  ['Scalable chip-based 3D ion traps', '01-scalable-chip-based-3d-ion-traps.pdf', 'real trap electrode geometry'],
];
ION_LAB.M1 = {
  heading: 'M1 · In the lab — the Paul trap',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `The Paul trap is why there's a harmonic oscillator at all. For both ⁴⁰Ca⁺ and ¹⁷¹Yb⁺ it is the <b>same hardware</b> —
        a linear RF (Paul) trap: RF on the blade electrodes makes a radial <b>pseudopotential</b>, DC endcaps confine along the axis.
        The a–q Mathieu stability and the loss edge <code>q*≈0.908</code> are universal; what the two atoms differ in is set entirely by <b>mass</b>.`,
      energySvg: M1_RADIAL_SVG,
      energyCaption: `<b>Radial cross-section.</b> Four blade electrodes; RF on one diagonal pair (the other grounded) makes an oscillating
        quadrupole whose time-average is a harmonic <b>pseudopotential</b> of radius ~r₀ — the ion sits at the RF null (micromotion-free).`,
      apparatusSvg: M1_AXIAL_SVG,
      apparatusCaption: `<b>Axial view.</b> The RF blades run along z; two DC <b>endcaps</b> at ±z₀ add the axial harmonic well of frequency
        <b>ω_z</b> — the mode M3–M7 all use. ⁴⁰Ca⁺: U_ec of a few volts gives ω_z≈1 MHz.`,
      paramRows: M1_CA_ROWS,
      paramNote: `In dimensionless (a,q) coordinates the stability diagram is <b>universal</b>; at fixed voltages ⁴⁰Ca⁺ has q∝1/m and
        ω_z∝1/√m. Set <b>ν_z≈1 MHz</b> to match a typical ⁴⁰Ca⁺ trap.`,
      sources: M1_SOURCES,
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same linear Paul trap as ⁴⁰Ca⁺ — RF blades for radial confinement, DC endcaps for the axial well. The only physics that
        changes with the atom is <b>mass</b>: the heavier ¹⁷¹Yb⁺ has Mathieu q∝1/m and secular ω_z∝1/√m, so a real ¹⁷¹Yb⁺ trap runs
        <b>stronger RF and higher endcap voltage</b> to reach the same confinement. (MAGIC then adds a static ∂B/∂z gradient on top — see M3/M6/M7.)`,
      energySvg: M1_RADIAL_SVG,
      energyCaption: `<b>Radial cross-section.</b> Identical blade geometry; for the same V_RF the heavier ¹⁷¹Yb⁺ sits at a smaller q
        (q∝1/m), i.e. deeper inside the stable region — so more RF drive is used to reach a comparable radial ω_r.`,
      apparatusSvg: M1_AXIAL_SVG,
      apparatusCaption: `<b>Axial view.</b> Same endcaps; because ω_z∝1/√m, at equal U_ec the ¹⁷¹Yb⁺ axial frequency is 0.48× the ⁴⁰Ca⁺
        value — a higher endcap voltage is applied to recover ω_z≈1 MHz.`,
      paramRows: M1_YB_ROWS,
      paramNote: `The (a,q) stability edge q*≈0.908 is mass-independent; only the voltage-to-frequency scaling differs (q∝1/m, ω_z∝1/√m).
        For ¹⁷¹Yb⁺, ν_z≈0.5–1 MHz at correspondingly higher electrode voltages.`,
      sources: M1_SOURCES,
    },
  },
};

// =============================================================================
// M2 · Coulomb normal modes.  Single wide figure (string + mode vectors); the
// mode-frequency RATIOS are geometry-set (mass-independent), only ω_z scales.
// =============================================================================
const M2_MODES_SVG = `
<svg class="lab-svg" viewBox="0 0 470 250" role="img" aria-label="ion-string normal modes">
  <defs><marker id="ma" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <path class="well" d="M60,60 Q235,150 410,60"/>
  <circle class="ion" cx="150" cy="120" r="7"/><circle class="ion" cx="205" cy="127" r="7"/><circle class="ion" cx="265" cy="127" r="7"/><circle class="ion" cx="320" cy="120" r="7"/>
  <text class="box-lbl" x="235" y="152" text-anchor="middle">N ions: axial harmonic well + Coulomb repulsion ⇒ a string</text>
  <text class="tr-lbl q" x="30" y="188">COM · ω_z</text>
  <line class="mode" x1="150" y1="192" x2="172" y2="192" marker-end="url(#ma)"/><line class="mode" x1="205" y1="192" x2="227" y2="192" marker-end="url(#ma)"/>
  <line class="mode" x1="265" y1="192" x2="287" y2="192" marker-end="url(#ma)"/><line class="mode" x1="320" y1="192" x2="342" y2="192" marker-end="url(#ma)"/>
  <text class="tr-lbl q" x="30" y="222">stretch · √3·ω_z</text>
  <line class="mode" x1="172" y1="222" x2="150" y2="222" marker-end="url(#ma)"/><line class="mode" x1="227" y1="222" x2="205" y2="222" marker-end="url(#ma)"/>
  <line class="mode" x1="265" y1="222" x2="287" y2="222" marker-end="url(#ma)"/><line class="mode" x1="320" y1="222" x2="342" y2="222" marker-end="url(#ma)"/>
  <text class="tr-note" x="30" y="244">COM = ω_z for any N; two-ion stretch = √3·ω_z — ratios are geometry-set (mass-independent)</text>
</svg>`;
const M2_SOURCES = [
  ['Isospaced linear ion strings', '20-isospaced-linear-ion-strings.pdf', 'equilibrium positions & axial modes of the string'],
  ['Designing spin–spin interactions with 1D & 2D ion arrays', '34-designing-spin-spin-interactions-with-one-and-two-dimen.pdf', 'normal modes as the bus for spin–spin coupling'],
  ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'collective-mode treatment (COM, stretch)'],
];
ION_LAB.M2 = {
  heading: 'M2 · In the lab — Coulomb normal modes',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Load N ions into the axial well and Coulomb repulsion spaces them into a <b>string</b>; its shared vibrational modes are the
        quantum bus a two-qubit gate (M7) rides. The <b>COM</b> mode is ω_z for any N; the two-ion <b>stretch</b> is √3·ω_z. Same trap
        for both atoms — mass only rescales the absolute frequencies (ω_z∝1/√m); the mode ratios are fixed by geometry.`,
      energySvg: M2_MODES_SVG,
      energyCaption: `<b>Normal modes of the string.</b> Top: equilibrium positions (denser in the middle). Below: the two lowest axial
        modes — <b>COM</b> (all ions in phase, at ω_z) and <b>stretch</b> (ions counter-move, at √3·ω_z). Modes come from
        eigen-decomposing the Coulomb Hessian.`,
      paramRows: [
        ['N ions', 'number of ions loaded (photoionization); sets the number of axial modes', '2–5 (linear chain)', 'mode count'],
        ['ν_z (MHz)', 'axial COM frequency = single-ion ω_z; the two-ion stretch is √3·ω_z', '≈1 MHz COM ⇒ 1.73 MHz stretch', 'mode-frequency scale'],
        ['mode order', 'COM (in phase) lowest, then stretch, … — the gate (M7) picks one as its bus', 'COM=ω_z, stretch=√3·ω_z, …', 'which mode carries the gate'],
        ['zigzag', 'raise N or soften the transverse confinement → the linear chain buckles (transverse mode goes soft)', 'axial/radial ratio limit', 'chain stability'],
      ],
      paramNote: `The mode-frequency <b>ratios</b> (COM : stretch = 1 : √3 for two ions) are geometry-set and mass-independent — identical
        for ⁴⁰Ca⁺ and ¹⁷¹Yb⁺. Only the absolute scale ω_z∝1/√m differs. The COM mode is the usual M7 bus.`,
      sources: M2_SOURCES,
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Identical picture to ⁴⁰Ca⁺: N ions form a Coulomb string whose COM and stretch modes are the gate bus. Because ω_z∝1/√m, a
        ¹⁷¹Yb⁺ chain's absolute mode frequencies are ~0.48× a ⁴⁰Ca⁺ chain in the same trap — but the <b>ratios</b> (√3, …) are unchanged.
        In MAGIC schemes these motional modes carry the gradient-induced spin–spin coupling (M7).`,
      energySvg: M2_MODES_SVG,
      energyCaption: `<b>Normal modes of the string.</b> Same eigenstructure as ⁴⁰Ca⁺ (COM at ω_z, stretch at √3·ω_z) — the shapes are set
        by geometry, not the ion. Only the overall frequency scale (ω_z∝1/√m) is lower for the heavier ¹⁷¹Yb⁺.`,
      paramRows: [
        ['N ions', 'same photoionization loading; sets the axial-mode count', '2–5', 'mode count'],
        ['ν_z (MHz)', 'COM ∝ 1/√m ⇒ for the same trap ¹⁷¹Yb⁺ COM is 0.48× ⁴⁰Ca⁺; the √3 stretch ratio is unchanged', '≈0.5–1 MHz COM', 'mode-frequency scale'],
        ['mode order', 'same eigenstructure — COM, stretch, … ratios identical to ⁴⁰Ca⁺', 'COM, √3·COM, …', 'gate bus'],
        ['sympathetic cooling', '¹⁷¹Yb⁺ is often co-trapped with a coolant species; the two masses reshape the mode vectors', 'e.g. ¹⁷¹Yb⁺ + a coolant ion', 'mode composition'],
      ],
      paramNote: `Geometry-set ratios (COM : stretch = 1 : √3) are mass-independent and identical to ⁴⁰Ca⁺. Only ω_z∝1/√m rescales the
        absolute frequencies; in MAGIC these modes mediate the gradient-induced J-coupling used by the M7 gate.`,
      sources: M2_SOURCES,
    },
  },
};

// =============================================================================
// M4 · Doppler cooling — broad dipole, red-detuned. Atom differs only in the
// cooling line (⁴⁰Ca⁺ 397 nm Γ≈22 MHz; ¹⁷¹Yb⁺ 369.5 nm Γ≈19.6 MHz).
// =============================================================================
const dopplerSvg = (lam, gam) => `
<svg class="lab-svg" viewBox="0 0 410 250" role="img" aria-label="Doppler cooling cycle">
  <defs><marker id="da" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" refX="7.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="arh"/></marker></defs>
  <rect class="broad" x="80" y="58" width="180" height="20"/>
  <line class="lvl" x1="80" y1="68" x2="260" y2="68"/>
  <text class="lvl-lbl" x="268" y="64">²P₁/₂</text><text class="cap" x="268" y="79">Γ/2π≈${gam} MHz</text>
  <line class="dim dash" x1="80" y1="68" x2="340" y2="68"/><text class="cap" x="300" y="52">resonance</text>
  <line class="lvl" x1="80" y1="205" x2="260" y2="205"/><text class="lvl-lbl" x="268" y="209">²S₁/₂</text>
  <line class="tr tr-cool" x1="140" y1="205" x2="140" y2="82" marker-end="url(#da)"/>
  <text class="tr-lbl q" x="58" y="148">${lam} nm</text><text class="cap q" x="58" y="162">δ&lt;0 (red)</text>
  <line class="tr-emit" x1="200" y1="80" x2="200" y2="203" marker-end="url(#da)"/><text class="tr-lbl" x="208" y="150">Γ emit</text>
  <text class="tr-note" x="58" y="234">broad Γ≫ω_z (unresolved); friction max at δ=−Γ/2 ⇒ floor n̄≈Γ/2ω_z</text>
</svg>`;
const M4_SOURCES = [
  ['Cooling techniques for trapped ions (Segal &amp; Wunderlich)', '26-cooling-techniques-for-trapped-ions.pdf', 'Doppler theory, limit, and level schemes'],
  ['Roos PhD thesis (Innsbruck, 2000)', 'thesis-2000-roos-controlling-the-quantum-state-of-trapped-ions.pdf', 'Doppler + resolved-sideband cooling in ⁴⁰Ca⁺'],
  ['Enhancement of laser cooling by a magnetic gradient (Wunderlich)', '38-enhancement-of-laser-cooling-by-the-use-of-magnetic-gra.pdf', 'cooling with the MAGIC gradient'],
];
const M4_NOTE = `LD-valid regime: this O(η̃²) recoil kernel is honest only for <code>η̃²(2n̄+1)≪1</code>, so the sim runs at moderate
  <code>Γ/ω_z≈3–6</code> where the floor is a few quanta and <code>n̄_ss=c·Γ/2ω_z</code> (c≈0.5–0.65). The textbook
  <code>n̄=Γ/2ω_z</code> is the <code>Γ≫ω_z</code> asymptote (⁴⁰Ca⁺: n̄≈10.8) — exactly where the LD kernel breaks down. That break-down IS the lesson.`;
ION_LAB.M4 = {
  heading: 'M4 · In the lab — Doppler cooling',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Doppler cooling is the OPPOSITE regime to M5: a <b>broad</b> dipole line (Γ≫ω_z, sidebands unresolved), driven
        <b>red</b> of resonance. A moving ion Doppler-shifts toward resonance on the counter-propagating beam, scatters more, and is
        pushed back — velocity-dependent friction that balances recoil heating at a steady <b>n̄≈Γ/2ω_z</b>. ⁴⁰Ca⁺ cools on the
        <b>397 nm</b> S₁/₂–P₁/₂ line (866 nm repumps the D₃/₂ leak).`,
      energySvg: dopplerSvg('397', '22'),
      energyCaption: `<b>⁴⁰Ca⁺ Doppler cycle.</b> The 397 nm S₁/₂–P₁/₂ dipole (Γ/2π≈22 MHz) is driven <b>red-detuned</b> (δ&lt;0); spontaneous
        emission (Γ) carries away the energy. Friction is strongest at <b>δ=−Γ/2</b>. 866 nm (not shown) repumps the D₃/₂ leak.`,
      paramRows: [
        ['Γ / ω_z', 'the cooling-transition LINEWIDTH — ⁴⁰Ca⁺ S₁/₂–P₁/₂ at 397 nm, Γ/2π≈22 MHz (broad ⇒ sidebands unresolved)', 'Γ/2π≈22 MHz (≫ ω_z)', 'cooling bandwidth'],
        ['δ / ω_z', '397 laser detuning below resonance; friction peaks at δ=−Γ/2', 'δ≈−Γ/2 (≈−2π×11 MHz)', 'friction / cooling rate'],
        ['Ω / ω_z', '397 intensity — kept near/below saturation', 's ≲ 1', 'scatter rate'],
        ['initial n̄', 'starting motional occupation (hot, e.g. just after loading)', 'n̄ ~ many', 'cooling start point'],
      ],
      paramNote: M4_NOTE,
      sources: M4_SOURCES,
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same Doppler physics, different line: ¹⁷¹Yb⁺ cools on the <b>369.5 nm</b> S₁/₂–P₁/₂ dipole (Γ/2π≈19.6 MHz), with
        <b>935 nm</b> repumping the D₃/₂ leak. Red-detuned scattering gives velocity-dependent friction and the same
        <b>n̄≈Γ/2ω_z</b> Doppler floor — the pre-cool before microwave/Raman ground-state cooling (M5).`,
      energySvg: dopplerSvg('369.5', '19.6'),
      energyCaption: `<b>¹⁷¹Yb⁺ Doppler cycle.</b> The 369.5 nm S₁/₂–P₁/₂ dipole (Γ/2π≈19.6 MHz) driven <b>red</b> (δ&lt;0), recycled by
        spontaneous emission; 935 nm (not shown) repumps ²D₃/₂. Optimum friction at <b>δ=−Γ/2</b>.`,
      paramRows: [
        ['Γ / ω_z', '¹⁷¹Yb⁺ cools on S₁/₂–P₁/₂ at 369.5 nm, Γ/2π≈19.6 MHz (broad)', 'Γ/2π≈19.6 MHz (≫ ω_z)', 'cooling bandwidth'],
        ['δ / ω_z', '369 detuning below resonance; δ=−Γ/2 optimal', 'δ≈−Γ/2 (≈−2π×9.8 MHz)', 'friction / cooling rate'],
        ['Ω / ω_z', '369 intensity (935 repump keeps it cycling)', 's ≲ 1', 'scatter rate'],
        ['initial n̄', 'starting motional occupation (hot)', 'n̄ ~ many', 'cooling start point'],
      ],
      paramNote: M4_NOTE,
      sources: M4_SOURCES,
    },
  },
};

// =============================================================================
// M5 · Resolved-sideband (ground-state) cooling — RSB drive + dissipative recycle.
// ⁴⁰Ca⁺: 729 nm RSB + 854 nm quench.  ¹⁷¹Yb⁺: RF/microwave RSB via the MAGIC
// gradient (Wunderlich, paper 14) + 369 optical-pumping recycle.
// =============================================================================
const M5_LADDER_SVG = `
<svg class="lab-svg" viewBox="0 0 430 262" role="img" aria-label="resolved-sideband cooling ladder">
  <defs><marker id="sa" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <text class="lvl-lbl" x="120" y="92" text-anchor="middle">|g,n⟩</text>
  <line class="lvl" x1="82" y1="210" x2="162" y2="210"/><text class="hf-lbl" x="74" y="214" text-anchor="end">n=0</text>
  <line class="lvl" x1="82" y1="165" x2="162" y2="165"/><text class="hf-lbl" x="74" y="169" text-anchor="end">n=1</text>
  <line class="lvl" x1="82" y1="120" x2="162" y2="120"/><text class="hf-lbl" x="74" y="124" text-anchor="end">n=2</text>
  <text class="lvl-lbl" x="300" y="92" text-anchor="middle">|e,n⟩</text>
  <line class="lvl" x1="260" y1="210" x2="340" y2="210"/><text class="hf-lbl" x="346" y="214">n=0</text>
  <line class="lvl" x1="260" y1="165" x2="340" y2="165"/><text class="hf-lbl" x="346" y="169">n=1</text>
  <line class="lvl" x1="260" y1="120" x2="340" y2="120"/><text class="hf-lbl" x="346" y="124">n=2</text>
  <line class="tr tr-cool" x1="162" y1="120" x2="260" y2="165" marker-end="url(#sa)"/>
  <line class="tr tr-cool" x1="162" y1="165" x2="260" y2="210" marker-end="url(#sa)"/>
  <text class="tr-lbl q" x="176" y="138">RSB δ=−ω_z</text>
  <line class="tr-emit" x1="260" y1="165" x2="164" y2="165" marker-end="url(#sa)"/>
  <line class="tr-emit" x1="260" y1="210" x2="164" y2="210" marker-end="url(#sa)"/>
  <text class="tr-lbl" x="176" y="182">recycle Δn≈0</text>
  <circle class="ion" cx="120" cy="210" r="5"/><text class="tr-lbl q" x="86" y="234">dark |g,0⟩</text>
  <text class="tr-note" x="70" y="252">each cycle removes one phonon; |g,0⟩ is dark ⇒ n̄→0 (ground state)</text>
</svg>`;
ION_LAB.M5 = {
  heading: 'M5 · In the lab — resolved-sideband cooling',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Ground-state cooling. Park the drive on the <b>red sideband</b> (δ=−ω_z): every <code>|g,n⟩→|e,n−1⟩</code> removes one
        phonon, and a dissipative recycle returns the ion to <code>|g,n−1⟩</code> with Δn≈0. Repeat down to <code>|g,0⟩</code>, which is
        <b>dark</b> (no red sideband exists from n=0) ⇒ n̄→0. ⁴⁰Ca⁺ drives the narrow <b>729 nm</b> RSB and quenches with <b>854 nm</b>.`,
      energySvg: M5_LADDER_SVG,
      energyCaption: `<b>⁴⁰Ca⁺ RSB cooling.</b> The narrow 729 nm S₁/₂–D₅/₂ line is parked at δ=−ω_z; 854 nm quenches D₅/₂→P₃/₂ so it
        re-decays quickly (fast recycle). The RSB amplitude vanishes as n̄→0 because <code>|g,0⟩</code> has no lower rung.`,
      paramRows: [
        ['δ / ω_z (=−1)', 'park the 729 nm laser on the RED sideband: |g,n⟩→|e,n−1⟩ removes one phonon', 'δ=−ω_z (≈−2π×1 MHz)', 'the cooling sideband'],
        ['Ω / ω_z', '729 RSB Rabi — weak &amp; resolved (Ω≪ω_z)', '2π×(1–20 kHz)', 'cooling rate'],
        ['Γ_eff (quench)', '854 nm quenches D₅/₂→P₃/₂; its intensity sets the effective recycle linewidth', '854 intensity → Γ_eff', 'recycle rate'],
        ['heating', 'anomalous heating competes with cooling; the floor is where they balance', 'ṅ̄ small ⇒ n̄≪1', 'ground-state floor'],
      ],
      paramNote: `Resolved-sideband cooling reaches <b>n̄≪1</b> (true ground state) — far below the M4 Doppler floor — because the narrow
        729 nm line resolves the ±ω_z sidebands. Raising the motional-bath heating lifts the floor (a "break it").`,
      sources: [
        ['Roos PhD thesis (Innsbruck, 2000)', 'thesis-2000-roos-controlling-the-quantum-state-of-trapped-ions.pdf', '729 nm sideband cooling to the ground state'],
        ['Cooling techniques for trapped ions (Segal &amp; Wunderlich)', '26-cooling-techniques-for-trapped-ions.pdf', 'resolved-sideband cooling theory'],
        ['Simultaneous cooling of axial modes in a linear chain', '49-simultaneous-cooling-of-axial-vibrational-modes-in-a-li.pdf', 'multi-mode sideband cooling'],
      ],
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same ladder, laser-free drive. In MAGIC the static ∂B/∂z gradient gives the qubit a motional sideband, so ¹⁷¹Yb⁺ can be
        <b>RF/microwave</b> sideband-cooled (Wunderlich): drive the RSB of the 12.6 GHz transition (δ=−ω_z) and recycle by optical
        pumping on <b>369 nm</b>. Because η_eff is small the RSB is slow, but it needs no cooling laser on the qubit.`,
      energySvg: M5_LADDER_SVG,
      energyCaption: `<b>¹⁷¹Yb⁺ RSB cooling (MAGIC).</b> The gradient-induced η_eff makes a red sideband of the 12.6 GHz microwave/RF
        transition; 369 nm optical pumping provides the dissipative recycle. Slower than laser RSB (small η_eff) but laser-free on the qubit.`,
      paramRows: [
        ['δ / ω_z (=−1)', 'drive the RED sideband of the 12.6 GHz transition (RF/microwave), enabled by the MAGIC gradient: |g,n⟩→|e,n−1⟩', 'δ=−ω_z', 'the cooling sideband'],
        ['Ω / ω_z', 'RF/microwave RSB Rabi ∝ η_eff·Ω_carrier — weak because η_eff is small', 'slow (small η_eff)', 'cooling rate'],
        ['Γ_eff (recycle)', '369 nm optical pumping (+935 repump) recycles |e⟩→|g⟩ — the dissipation', '369 pumping → Γ_eff', 'recycle rate'],
        ['heating', 'gradient/field noise + anomalous heating set the floor', 'ṅ̄ small ⇒ n̄≪1', 'ground-state floor'],
      ],
      paramNote: `The Wunderlich group demonstrated RF-sideband ground-state cooling using exactly this gradient-induced coupling (η_eff) —
        laser-free on the qubit, at the price of a slower rate. Optical pumping on 369 nm supplies the entropy-removing dissipation.`,
      sources: [
        ['Radio-frequency sideband cooling &amp; sympathetic cooling (Wunderlich)', '14-radio-frequency-sideband-cooling-and-sympathetic-coolin.pdf', 'RF sideband cooling via the magnetic gradient'],
        ['Cooling techniques for trapped ions (Segal &amp; Wunderlich)', '26-cooling-techniques-for-trapped-ions.pdf', 'sideband-cooling theory, both routes'],
        ['Enhancement of laser cooling by a magnetic gradient (Wunderlich)', '38-enhancement-of-laser-cooling-by-the-use-of-magnetic-gra.pdf', 'gradient-assisted cooling'],
      ],
    },
  },
};

// =============================================================================
// M6 · Single-qubit gate — resonant carrier drive = Rx(θ); off-resonant = AC Stark.
// ⁴⁰Ca⁺: 729 nm laser carrier.  ¹⁷¹Yb⁺: 12.6 GHz microwave carrier (laser-free).
// =============================================================================
const M6_DRIVE_SVG = `
<svg class="lab-svg" viewBox="0 0 400 240" role="img" aria-label="single-qubit carrier drive">
  <defs><marker id="m6a" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <line class="lvl" x1="70" y1="188" x2="212" y2="188"/><text class="lvl-lbl" x="62" y="192" text-anchor="end">|g⟩</text>
  <line class="lvl" x1="70" y1="84" x2="212" y2="84"/><text class="lvl-lbl" x="62" y="88" text-anchor="end">|e⟩</text>
  <line class="lvl dash" x1="70" y1="68" x2="212" y2="68"/>
  <line class="tr tr-qubit" x1="130" y1="188" x2="130" y2="88" marker-end="url(#m6a)"/>
  <text class="tr-lbl q" x="138" y="122">carrier δ=0</text><text class="tr-lbl q" x="138" y="136">Ω</text>
  <line class="tr tr-cool thin" x1="184" y1="188" x2="184" y2="72" marker-end="url(#m6a)"/><text class="cap" x="190" y="150">δ≠0</text>
  <text class="tr-note" x="62" y="214">area Ω·t = θ (π = bit flip); δ≠0 ⇒ AC Stark, precession √(δ²+Ω²)</text>
  <circle class="bloch" cx="322" cy="126" r="44"/><ellipse class="bloch-eq" cx="322" cy="126" rx="44" ry="14"/>
  <line class="bloch-ax" x1="322" y1="74" x2="322" y2="178"/>
  <path class="rot" d="M298,102 A34,34 0 1 1 294,150" marker-end="url(#m6a)"/>
  <text class="tr-lbl q" x="322" y="66" text-anchor="middle">Rx(θ)</text>
</svg>`;
ION_LAB.M6 = {
  heading: 'M6 · In the lab — single-qubit gate',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `A resonant <b>carrier</b> pulse (δ=0) of area <code>Ω·t</code> rotates the qubit on the Bloch sphere — a real
        <b>Rx(θ)</b>. Off-resonant (δ≠0) it precesses at the generalized Rabi <code>√(δ²+Ω²)</code> with a light shift <code>≈Ω²/4δ</code>
        (AC Stark). ⁴⁰Ca⁺ drives the carrier with the narrow <b>729 nm</b> laser; selectivity is emergent (Ω≪ω_z keeps the sidebands quiet).`,
      energySvg: M6_DRIVE_SVG,
      energyCaption: `<b>⁴⁰Ca⁺ carrier gate.</b> The 729 nm laser on resonance (δ=0) drives <code>|g⟩↔|e⟩</code> at Rabi Ω — a bit-flip at
        area π. A double-pass AOM sets Ω (intensity) and the small δ (AC-Stark axis tilt).`,
      paramRows: [
        ['θ / π', 'the Bloch rotation angle = pulse AREA Ω·t, set by the 729 pulse DURATION at fixed Ω', 'π (flip), π/2', 'rotation angle'],
        ['Ω / ω_z (pulse)', '729 carrier Rabi from the beam intensity; resolved gates keep Ω≪ω_z (else the sidebands fire → break it)', '2π×(10–100 kHz)', 'pulse speed / selectivity'],
        ['δ / ω_z (AC Stark)', 'off-resonant detuning (or a Stark beam) ⇒ precession √(δ²+Ω²), light shift ≈Ω²/4δ', 'small', 'axis tilt / phase'],
      ],
      paramNote: `The engine exposes a real Ω→σ_x drive (no phase), so it does native <b>Rx</b>; Rz is virtual. Selectivity is EMERGENT
        from Ω vs ω_z — shorten the pulse (Ω→ω_z) and the bandwidth reaches the sidebands, heating the motion (the M6 "break it").`,
      sources: [
        ['Chwalla PhD thesis (Innsbruck, 2009)', 'thesis-2009-chwalla-precision-spectroscopy-ca-ions.pdf', '729 nm carrier Rabi & single-qubit control'],
        ['Fault-tolerant Hahn–Ramsey interferometry with pulsed sequences', '24-fault-tolerant-hahn-ramsey-interferometry-with-pulse-se.pdf', 'robust single-qubit pulses'],
        ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'carrier vs sideband Rabi, AC Stark'],
      ],
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same Bloch-sphere Rx(θ), driven by <b>microwaves</b> instead of a laser: a resonant 12.6 GHz carrier pulse of area
        <code>Ω·t</code> rotates the ¹⁷¹Yb⁺ hyperfine qubit. Microwave gates are laser-free and can be fast; off-resonant driving gives
        the same AC-Stark <code>√(δ²+Ω²)</code> precession, and magnetic-field noise sets the coherence.`,
      energySvg: M6_DRIVE_SVG,
      energyCaption: `<b>¹⁷¹Yb⁺ carrier gate.</b> A 12.6 GHz microwave pulse on resonance (δ=0) drives <code>|g⟩↔|e⟩</code> at Rabi Ω — a
        bit-flip at area π. The microwave frequency sets δ, its power sets Ω. No qubit laser needed.`,
      paramRows: [
        ['θ / π', 'rotation angle = area Ω·t of the 12.6 GHz microwave, set by pulse duration', 'π, π/2', 'rotation angle'],
        ['Ω / ω_z (pulse)', 'microwave carrier Rabi from the microwave power; can be strong (fast, laser-free gates)', '2π×(1–100 kHz)', 'pulse speed'],
        ['δ / ω_z (AC Stark)', 'microwave detuning ⇒ generalized Rabi √(δ²+Ω²); B-field noise also shifts the qubit', 'small', 'axis tilt / dephasing'],
      ],
      paramNote: `Microwave single-qubit gates on ¹⁷¹Yb⁺ reach very high fidelity (no photon-scattering error). The main limit is
        magnetic-field-noise dephasing on the field-sensitive transition — mitigated in practice with dynamical decoupling / dressed states.`,
      sources: [
        ['Versatile microwave-driven trapped-ion spin system', '18-versatile-microwave-driven-trapped-ion-spin-system-for.pdf', 'microwave single-qubit control of ¹⁷¹Yb⁺'],
        ['Fault-tolerant Hahn–Ramsey interferometry with pulsed sequences', '24-fault-tolerant-hahn-ramsey-interferometry-with-pulse-se.pdf', 'robust microwave pulses / decoupling'],
        ['A trapped-ion quantum byte with 10⁻⁵ next-neighbour crosstalk', '27-a-trapped-ion-based-quantum-byte-with-105-next-neighbou.pdf', 'individually-addressed microwave qubits'],
      ],
    },
  },
};

// =============================================================================
// M7 · Mølmer–Sørensen two-qubit gate — bichromatic spin-dependent force drives a
// phase-space loop; the enclosed geometric phase entangles. ⁴⁰Ca⁺: 729 bichromatic.
// ¹⁷¹Yb⁺: laser-free, gradient-induced (MAGIC) spin–spin coupling.
// =============================================================================
const M7_LOOP_SVG = `
<svg class="lab-svg" viewBox="0 0 360 252" role="img" aria-label="Mølmer–Sørensen phase-space loop">
  <defs><marker id="m7a" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <line class="axis" x1="55" y1="150" x2="300" y2="150" marker-end="url(#m7a)"/><text class="cap" x="306" y="154">⟨X⟩</text>
  <line class="axis" x1="180" y1="232" x2="180" y2="40" marker-end="url(#m7a)"/><text class="cap" x="186" y="46">⟨P⟩</text>
  <circle class="loop" cx="180" cy="105" r="45"/>
  <path class="loopdir" d="M180,150 A45,45 0 0 1 224,98" marker-end="url(#m7a)"/>
  <circle class="ion" cx="180" cy="150" r="5"/><text class="tr-lbl q" x="188" y="170">start/end = vacuum</text>
  <text class="tr-lbl q" x="230" y="86">loop (K)</text>
  <text class="tr-note" x="40" y="246">closes at τ_g = 2πK/δ; enclosed area = geometric phase ⇒ Bell state</text>
</svg>`;
ION_LAB.M7 = {
  heading: 'M7 · In the lab — Mølmer–Sørensen gate',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Two qubits share one motional mode. A <b>bichromatic</b> spin-dependent force (symmetric red+blue detuning ±δ) pushes the
        shared mode around a <b>phase-space loop</b> that closes at <code>τ_g=2πK/δ</code>; the enclosed area is a geometric phase that
        entangles the qubits (<code>|gg⟩→(|gg⟩+i|ee⟩)/√2</code>) and returns the motion to vacuum. ⁴⁰Ca⁺ uses a <b>729 nm</b> bichromatic pair.`,
      energySvg: M7_LOOP_SVG,
      energyCaption: `<b>Phase-space loop (⟨X⟩–⟨P⟩).</b> The spin-dependent force drives the shared mode out and back; the loop closes at
        τ_g, disentangling spin from motion, while the enclosed geometric phase makes the Bell state. K = number of loops.`,
      paramRows: [
        ['δ (symmetric)', 'the bichromatic 729 detuning ±δ from the carrier (red+blue sidebands); the loop closes at τ_g=2πK/δ', 'δ ~ 2π×(10–100 kHz)', 'gate time & closure'],
        ['K loops', 'number of phase-space loops before closure; the geometric phase ∝ enclosed area', '1 (or more)', 'phase / gate time'],
        ['ηΩ', 'spin–motion coupling × Rabi; set ηΩ=δ/(2√K) for a maximally-entangling (Bell) gate', 'ηΩ = δ/(2√K)', 'entangling strength'],
        ['δ mismatch (break it)', 'mis-set δ off closure ⇒ the loop doesn\'t close, residual spin–motion entanglement, Bell fidelity drops', '0 (ideal)', 'gate error'],
      ],
      paramNote: `The ⁴⁰Ca⁺ MS gate is driven with a 729 nm bichromatic field on a cooled motional mode (M2/M5). Because it's geometric
        (closed loop), it is first-order insensitive to the mode's thermal occupation — a key robustness of the MS scheme.`,
      sources: [
        ['The role of higher-order terms in trapped-ion quantum computing', '02-the-role-of-higher-order-terms-in-trapped-ion-quantum-c.pdf', 'MS gate beyond the Lamb–Dicke approximation'],
        ['Robust two-qubit gates using pulsed dynamical decoupling', '05-robust-two-qubit-gates-using-pulsed-dynamical-decouplin.pdf', 'making the entangling gate noise-robust'],
        ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'spin-dependent force & geometric phase'],
      ],
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same geometric-phase entangler, <b>laser-free</b>. In MAGIC the static ∂B/∂z gradient turns the shared motion into an
        always-on <b>spin–spin J-coupling</b> between qubits; microwaves then drive the two-qubit gate. Equivalently, the gradient supplies
        the η_eff of a bichromatic phase-space loop — no 729 laser, the Wunderlich/eleQtron route.`,
      energySvg: M7_LOOP_SVG,
      energyCaption: `<b>Phase-space loop (⟨X⟩–⟨P⟩).</b> Same closed-loop geometric phase — but here the spin–motion coupling η_eff comes
        from the magnetic gradient, so the "force" is applied with microwaves/RF rather than a bichromatic laser.`,
      paramRows: [
        ['δ (symmetric)', 'MAGIC gives an always-on J-coupling; the microwave-driven gate has the same closure τ_g=2πK/δ in the effective bichromatic picture', 'set by gradient & drive', 'gate time & closure'],
        ['K loops', 'same geometric-phase / phase-space-loop structure', '1', 'phase / gate time'],
        ['ηΩ', 'here η is η_eff (from ∂B/∂z); the effective coupling J ∝ (η_eff Ω)²/δ sets the entangling rate', 'J from the gradient', 'entangling strength'],
        ['δ mismatch (break it)', 'same closure sensitivity — off-closure leaves residual spin–motion entanglement', '0 (ideal)', 'gate error'],
      ],
      paramNote: `Because η_eff is small, gradient-based MS gates are slower than laser gates — the Wunderlich/eleQtron program uses stronger
        gradients, dynamical decoupling and shaped pulses to reach high fidelity. The payoff: entangling gates with <b>no lasers on the qubit</b>.`,
      sources: [
        ['Fast, robust and laser-free universal entangling gates', '04-fast-robust-and-laser-free-universal-entangling-gates-f.pdf', 'the laser-free (MAGIC-style) two-qubit gate'],
        ['Robust two-qubit gates using pulsed dynamical decoupling', '05-robust-two-qubit-gates-using-pulsed-dynamical-decouplin.pdf', 'noise-robust gradient gates'],
        ['The role of higher-order terms in trapped-ion quantum computing', '02-the-role-of-higher-order-terms-in-trapped-ion-quantum-c.pdf', 'corrections to the geometric-phase gate'],
      ],
    },
  },
};

// =============================================================================
// M8 · State readout — state-selective fluorescence: bright |g⟩ scatters, dark
// |e⟩ (shelved) does not. ⁴⁰Ca⁺: 397 nm cycling + D₅/₂ shelf. ¹⁷¹Yb⁺: 369 nm + F=0 dark.
// =============================================================================
const M8_READOUT_SVG = `
<svg class="lab-svg" viewBox="0 0 420 236" role="img" aria-label="state-selective fluorescence readout">
  <defs><marker id="m8a" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <line class="lvl" x1="60" y1="196" x2="150" y2="196"/><text class="cap" x="105" y="212" text-anchor="middle">bright |g⟩ (S₁/₂)</text>
  <rect class="broad" x="60" y="78" width="90" height="14"/><line class="lvl" x1="60" y1="85" x2="150" y2="85"/><text class="cap" x="105" y="72" text-anchor="middle">P₁/₂</text>
  <line class="tr tr-cool" x1="92" y1="196" x2="92" y2="92" marker-end="url(#m8a)"/>
  <line class="tr-emit" x1="116" y1="90" x2="116" y2="194" marker-end="url(#m8a)"/>
  <text class="tr-lbl q" x="40" y="146">397/369</text>
  <line class="lvl" x1="220" y1="150" x2="310" y2="150"/><text class="lvl-lbl" x="316" y="154">|e⟩</text><text class="cap" x="265" y="168" text-anchor="middle">dark: shelved (D₅/₂ / F=0)</text>
  <line class="photon" x1="132" y1="80" x2="300" y2="52" marker-end="url(#m8a)"/>
  <line class="photon" x1="128" y1="92" x2="300" y2="66"/>
  <rect class="box small" x="308" y="42" width="82" height="26" rx="4"/><text class="cap" x="349" y="59" text-anchor="middle">PMT / EMCCD</text>
  <text class="tr-note" x="40" y="224">bright scatters ⇒ many photons; dark ⇒ ≈0. Threshold the count ⇒ fidelity F</text>
</svg>`;
ION_LAB.M8 = {
  heading: 'M8 · In the lab — state readout',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Readout is <b>state-selective fluorescence</b>. The bright state <code>|g⟩</code>=S₁/₂ scatters the <b>397 nm</b> probe
        (cycling, 866 repump) and floods the PMT with photons; the dark/shelved state <code>|e⟩</code>=D₅/₂ scatters nothing. Over a window
        <code>t_d</code> the counts are Poisson — mean <code>R·t_d</code> (bright) vs ≈0 (dark) — and a threshold discriminates them.`,
      energySvg: M8_READOUT_SVG,
      energyCaption: `<b>⁴⁰Ca⁺ readout.</b> 397 nm cycles S₁/₂↔P₁/₂ (bright, many photons on the PMT); the qubit's D₅/₂ population is
        <b>shelved</b> and stays dark. 866 nm keeps the cycle closed (D₃/₂ repump).`,
      paramRows: [
        ['t_d (window)', 'detection integration time; the PMT/EMCCD collects photons. Longer t_d ⇒ cleaner bright/dark separation', '~100 µs – 1 ms', 'histogram separation, F'],
        ['R scatter (bright)', '397 nm scatter rate of bright S₁/₂ (cycling with 866 repump); mean bright count n̄=R·t_d', 'R·t_d ~ 10–40 counts', 'bright peak position'],
        ['R_bg (dark)', 'background/dark-count rate (stray light + off-resonant scatter of the shelf)', 'small (few counts)', 'dark peak / overlap'],
      ],
      paramNote: `Fidelity <code>F=1−½[P(&lt;thr|bright)+P(≥thr|dark)]</code> at the optimal threshold; it rises to 1 as the bright/dark
        Poisson histograms separate (longer t_d or higher R). Shorten t_d and they overlap — the M8 "break it".`,
      sources: [
        ['Chwalla PhD thesis (Innsbruck, 2009)', 'thesis-2009-chwalla-precision-spectroscopy-ca-ions.pdf', '397 nm detection & electron shelving in ⁴⁰Ca⁺'],
        ['Roos PhD thesis (Innsbruck, 2000)', 'thesis-2000-roos-controlling-the-quantum-state-of-trapped-ions.pdf', 'state detection & discrimination'],
        ['Cooling techniques for trapped ions (Segal &amp; Wunderlich)', '26-cooling-techniques-for-trapped-ions.pdf', 'fluorescence detection basics'],
      ],
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same idea on the hyperfine qubit: <b>369 nm</b> resonantly cycles the bright <code>|F=1⟩</code> manifold (many photons)
        while the dark <code>|F=0⟩</code> is off-resonant and stays dark. A PMT count over <code>t_d</code>, Poisson-distributed, is
        thresholded to read the qubit. High-fidelity hyperfine readout is a strength of ¹⁷¹Yb⁺.`,
      energySvg: M8_READOUT_SVG,
      energyCaption: `<b>¹⁷¹Yb⁺ readout.</b> 369.5 nm cycles the bright <code>|F=1⟩</code>↔P₁/₂ (photons on the PMT); the dark
        <code>|F=0⟩</code> is 12.6 GHz off-resonant and scatters ≈0. 935 nm keeps the cycle closed (D₃/₂ repump).`,
      paramRows: [
        ['t_d (window)', 'detection window on the 369 nm fluorescence; longer ⇒ better separation', '~100 µs – 1 ms', 'separation, F'],
        ['R scatter (bright)', '369 nm scatter rate of bright |F=1⟩ (cycling); mean bright count n̄=R·t_d', 'R·t_d ~ 10–40 counts', 'bright peak'],
        ['R_bg (dark)', 'dark |F=0⟩ background — mostly off-resonant leakage into the bright cycle', 'small', 'overlap / error'],
      ],
      paramNote: `The dark-state error is set by off-resonant excitation of |F=0⟩ during the 369 nm pulse (finite 12.6 GHz splitting).
        As with Ca⁺, F→1 as t_d·R grows; shorten t_d and the Poisson histograms overlap (the "break it").`,
      sources: [
        ['State-selective detection of hyperfine qubits', '25-state-selective-detection-of-hyperfine-qubits.pdf', 'high-fidelity 369 nm readout of ¹⁷¹Yb⁺'],
        ['Versatile microwave-driven trapped-ion spin system', '18-versatile-microwave-driven-trapped-ion-spin-system-for.pdf', 'state preparation & detection in ¹⁷¹Yb⁺'],
        ['A trapped-ion quantum byte with 10⁻⁵ next-neighbour crosstalk', '27-a-trapped-ion-based-quantum-byte-with-105-next-neighbou.pdf', 'multi-ion detection & addressing'],
      ],
    },
  },
};

// =============================================================================
// M9 · Rabi oscillations and M10 · Ramsey interferometry — single-qubit
// characterization. The experiment diagram is atom-agnostic (the pulse story);
// the atom differs only in the drive (⁴⁰Ca⁺ 729 nm laser vs ¹⁷¹Yb⁺ 12.6 GHz μw).
// Curves are computed so the sin²/fringe shapes are exact.
// =============================================================================
const _rabiPath = (() => {
  let d = '';
  for (let i = 0; i <= 72; i++) { const t = i / 72; const pe = Math.sin(3 * Math.PI * t) ** 2;
    const x = 200 + t * 224, y = 185 - pe * 130; d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' '; }
  return d.trim();
})();
const M9_FLOP_SVG = `
<svg class="lab-svg" viewBox="0 0 460 232" role="img" aria-label="Rabi flopping">
  <defs><marker id="r9" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="6.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <line class="lvl" x1="42" y1="178" x2="150" y2="178"/><text class="lvl-lbl" x="36" y="182" text-anchor="end">|g⟩</text>
  <line class="lvl" x1="42" y1="66" x2="150" y2="66"/><text class="lvl-lbl" x="36" y="70" text-anchor="end">|e⟩</text>
  <line class="tr tr-qubit" x1="96" y1="178" x2="96" y2="70" marker-end="url(#r9)"/>
  <text class="tr-lbl q" x="104" y="116">carrier</text><text class="tr-lbl q" x="104" y="130">δ=0, Ω</text>
  <line class="axis" x1="200" y1="185" x2="440" y2="185" marker-end="url(#r9)"/><text class="cap" x="444" y="189">t</text>
  <line class="axis" x1="200" y1="185" x2="200" y2="48" marker-end="url(#r9)"/><text class="cap" x="196" y="46" text-anchor="end">P_e</text>
  <line class="dim dash" x1="200" y1="55" x2="424" y2="55"/><text class="cap" x="196" y="59" text-anchor="end">1</text>
  <path class="loopdir" d="${_rabiPath}"/>
  <text class="tr-note" x="40" y="212">P_e(t)=sin²(Ω_eff·t/2) — first peak = π-pulse, first ½-crossing = π/2; γ_φ damps it</text>
</svg>`;
const _ramseyPath = (() => {
  let d = '';
  for (let i = 0; i <= 90; i++) { const T = i / 90; const env = Math.exp(-2.0 * T);
    const pe = 0.5 * (1 + env * Math.cos(9 * Math.PI * T)); const x = 34 + T * 404, y = 236 - pe * 74;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' '; }
  return d.trim();
})();
const M10_RAMSEY_SVG = `
<svg class="lab-svg" viewBox="0 0 470 250" role="img" aria-label="Ramsey sequence and fringes">
  <defs><marker id="r10" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="6.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>
  <line class="axis" x1="30" y1="86" x2="444" y2="86" marker-end="url(#r10)"/><text class="cap" x="448" y="90">t</text>
  <rect class="aom" x="60" y="66" width="26" height="40" rx="3"/><text class="tr-lbl q" x="73" y="58" text-anchor="middle">π/2</text>
  <rect class="aom" x="330" y="66" width="26" height="40" rx="3"/><text class="tr-lbl q" x="343" y="58" text-anchor="middle">π/2</text>
  <line class="dim" x1="86" y1="116" x2="330" y2="116"/>
  <text class="cap q" x="208" y="132" text-anchor="middle">free precession T (Bloch winds by δ·T)</text>
  <text class="tr-lbl" x="366" y="90">measure P_e</text>
  <line class="axis" x1="34" y1="240" x2="444" y2="240" marker-end="url(#r10)"/><text class="cap" x="448" y="244">T</text>
  <line class="axis" x1="34" y1="240" x2="34" y2="156" marker-end="url(#r10)"/><text class="cap" x="30" y="154" text-anchor="end">P_e</text>
  <line class="dim dash" x1="34" y1="199" x2="438" y2="199"/><text class="cap" x="30" y="203" text-anchor="end">½</text>
  <path class="loopdir" d="${_ramseyPath}"/>
  <text class="tr-note" x="150" y="152">fringes P_e(T)=½[1+cos δT] — envelope decays at T₂*</text>
</svg>`;
const M9_SOURCES_CA = [
  ['Chwalla PhD thesis (Innsbruck, 2009)', 'thesis-2009-chwalla-precision-spectroscopy-ca-ions.pdf', '729 nm carrier Rabi &amp; pulse calibration'],
  ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'Rabi flopping &amp; the carrier Rabi frequency'],
];
const M9_SOURCES_YB = [
  ['Versatile microwave-driven trapped-ion spin system', '18-versatile-microwave-driven-trapped-ion-spin-system-for.pdf', 'microwave-driven Rabi oscillations in ¹⁷¹Yb⁺'],
  ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'Rabi flopping fundamentals'],
];
ION_LAB.M9 = {
  heading: 'M9 · In the lab — Rabi oscillations',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Rabi flopping is the first calibration on any ion: drive the carrier and the qubit oscillates between |g⟩ and |e⟩ at the
        Rabi frequency Ω. For ⁴⁰Ca⁺ the drive is the <b>729 nm</b> laser (gated by an AOM); the flop period 2π/Ω defines the π and π/2
        pulse times used by every other gate.`,
      energySvg: M9_FLOP_SVG,
      energyCaption: `<b>⁴⁰Ca⁺ Rabi flop.</b> A resonant 729 nm carrier pulse rotates the qubit; P_e(t)=sin²(Ωt/2). Ω is set by the 729
        beam intensity (AOM amplitude), and the pulse length (AOM gate time) picks the rotation angle. Detuning → generalized Rabi √(δ²+Ω²).`,
      paramRows: [
        ['Ω / ω_z', '729 carrier Rabi frequency — set by the 729 nm laser intensity via the AOM; the flop period is 2π/Ω', '2π×(10–100 kHz)', 'flop rate / π-pulse time'],
        ['δ / ω_z', '729 detuning from the qubit line (AOM frequency offset) → generalized Rabi √(δ²+Ω²), lower contrast', 'AOM offset', 'flop frequency &amp; contrast'],
        ['γ_φ', 'dephasing during the drive — 729 laser phase noise + magnetic-field noise; damps the flops', 'laser / B-field noise', 'flop decay'],
      ],
      paramNote: `Rabi flopping <b>calibrates</b> the pulse areas (π, π/2) that every M6/M7/M10 sequence relies on. The flop frequency is
        read straight off the period; the decay measures coherence during the drive.`,
      sources: M9_SOURCES_CA,
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same flop, laser-free drive: ¹⁷¹Yb⁺ is driven by a <b>12.6 GHz microwave</b> pulse, so P_e oscillates at the microwave Rabi
        frequency Ω (set by the microwave power). Microwave Rabi flopping calibrates the π/2 and π pulses for the hyperfine qubit.`,
      energySvg: M9_FLOP_SVG,
      energyCaption: `<b>¹⁷¹Yb⁺ Rabi flop.</b> A resonant 12.6 GHz microwave pulse flops the hyperfine qubit; P_e(t)=sin²(Ωt/2). Ω is set by
        the microwave power, the pulse length by the sequence generator. No qubit laser needed.`,
      paramRows: [
        ['Ω / ω_z', '12.6 GHz microwave Rabi — set by the microwave power; laser-free and can be fast', '2π×(1–100 kHz)', 'flop rate / π-pulse time'],
        ['δ / ω_z', 'microwave detuning from the qubit (synthesizer offset) → generalized Rabi √(δ²+Ω²)', 'synth offset', 'flop frequency &amp; contrast'],
        ['γ_φ', 'dephasing — magnetic-field noise on the field-sensitive transition; damps the flops', 'B-field noise', 'flop decay'],
      ],
      paramNote: `Microwave Rabi flopping is very clean (no photon-scattering error); the main limit is B-noise dephasing on the
        field-sensitive transition. The flop frequency is the microwave Rabi Ω.`,
      sources: M9_SOURCES_YB,
    },
  },
};
ION_LAB.M10 = {
  heading: 'M10 · In the lab — Ramsey interferometry',
  atoms: {
    Ca: {
      label: '⁴⁰Ca⁺ · optical (Innsbruck)',
      intro: `Ramsey is the coherence-time measurement: <b>π/2 → wait T → π/2</b>. During the wait the qubit precesses at the detuning δ,
        so scanning T gives fringes P_e(T)=½[1+cos δT]. For ⁴⁰Ca⁺ the two π/2 pulses are 729 nm; the fringe decay measures the optical
        qubit's T₂* (laser + magnetic-field noise).`,
      energySvg: M10_RAMSEY_SVG,
      energyCaption: `<b>⁴⁰Ca⁺ Ramsey sequence.</b> Two 729 nm π/2 pulses bracket a free-precession interval T. The fringe frequency reads
        the detuning δ; the decaying envelope reads the coherence time T₂*.`,
      paramRows: [
        ['δ / ω_z', 'the 729 detuning from the qubit — read out as the fringe frequency (fringe period 2π/δ)', 'AOM / synth offset', 'fringe frequency'],
        ['γ_φ → T₂*', 'dephasing during the free precession — 729 laser + magnetic-field noise; sets the fringe-envelope decay', 'B-field / laser noise', 'T₂* (fringe decay)'],
        ['T (free precession)', 'the wait between the two π/2 pulses, set by the sequence generator', 'µs – ms', 'accumulated phase δT'],
      ],
      paramNote: `Ramsey is <b>the</b> way coherence time is measured: fringe frequency = detuning, envelope decay = T₂*. Optical ⁴⁰Ca⁺
        qubits reach ms-scale T₂* (laser-linewidth / field-noise limited).`,
      sources: [
        ['Fault-tolerant Hahn–Ramsey interferometry with pulsed sequences', '24-fault-tolerant-hahn-ramsey-interferometry-with-pulse-se.pdf', 'Ramsey interferometry &amp; robust variants'],
        ['Chwalla PhD thesis (Innsbruck, 2009)', 'thesis-2009-chwalla-precision-spectroscopy-ca-ions.pdf', '729 nm Ramsey spectroscopy &amp; coherence'],
        ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'Ramsey method &amp; coherence limits'],
      ],
    },
    Yb: {
      label: '¹⁷¹Yb⁺ · microwave / MAGIC (Wunderlich)',
      intro: `Same interferometer, microwave pulses: two <b>12.6 GHz</b> π/2 pulses bracket a free-precession time T. The fringe frequency
        reads the microwave detuning; the envelope decay reads T₂*. For the field-sensitive hyperfine qubit T₂* is B-noise limited —
        extended in practice with dynamical decoupling / dressed states.`,
      energySvg: M10_RAMSEY_SVG,
      energyCaption: `<b>¹⁷¹Yb⁺ Ramsey sequence.</b> Two 12.6 GHz microwave π/2 pulses bracket a free-precession interval T; fringes at δ,
        contrast decaying at T₂*. Laser-free — the qubit sees only microwaves during the sequence.`,
      paramRows: [
        ['δ / ω_z', 'microwave detuning from the 12.6 GHz qubit → fringe frequency (period 2π/δ)', 'synth offset', 'fringe frequency'],
        ['γ_φ → T₂*', 'dephasing from magnetic-field noise (field-sensitive qubit); Ramsey measures T₂* directly', 'B-field noise', 'T₂* (fringe decay)'],
        ['T (free precession)', 'the wait between π/2 pulses, set by the microwave sequence', 'µs – ms', 'accumulated phase δT'],
      ],
      paramNote: `The field-sensitive ¹⁷¹Yb⁺ qubit has a shorter bare T₂* than the field-insensitive clock line, but Ramsey + dynamical
        decoupling recovers long coherence. The fringe frequency reads the detuning δ.`,
      sources: [
        ['Fault-tolerant Hahn–Ramsey interferometry with pulsed sequences', '24-fault-tolerant-hahn-ramsey-interferometry-with-pulse-se.pdf', 'Ramsey / decoupling for microwave qubits'],
        ['Versatile microwave-driven trapped-ion spin system', '18-versatile-microwave-driven-trapped-ion-spin-system-for.pdf', 'microwave Ramsey &amp; coherence in ¹⁷¹Yb⁺'],
        ['Wineland et al. 1998 (W98)', 'ref-1998-wineland-experimental-issues-in-coherent-quantum-state.pdf', 'Ramsey method fundamentals'],
      ],
    },
  },
};

// =============================================================================
// Full optical setup — a beam-path layout per atom (shared across that atom's
// modules), with callouts mapping each key optic to the sim control it sets.
// ⁴⁰Ca⁺ = laser table (Innsbruck-style); ¹⁷¹Yb⁺ = microwave + MAGIC gradient.
// =============================================================================
const CA_SETUP_SVG = `
<svg class="lab-svg" viewBox="0 0 940 560" role="img" aria-label="⁴⁰Ca⁺ full optical setup">
  <defs><marker id="sb" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>

  <!-- lasers -->
  <rect class="laser" x="12" y="54" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="72" text-anchor="middle">729 nm</text>
  <rect class="laser" x="12" y="176" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="194" text-anchor="middle">397 nm</text>
  <rect class="laser" x="12" y="300" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="318" text-anchor="middle">866 / 854</text>
  <rect class="laser" x="12" y="424" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="442" text-anchor="middle">375 / 422</text>

  <!-- 729 addressed beam (red): AOM · f=50 · λ/2 · f=200 · λ/2 · xyz-focus -->
  <line class="beam b729" x1="106" y1="68" x2="120" y2="68"/>
  <rect class="aom" x="120" y="55" width="32" height="26" rx="3"/><text class="opt-lbl sm" x="136" y="72" text-anchor="middle">AOM</text>
  <line class="beam b729" x1="152" y1="68" x2="372" y2="68"/>
  <ellipse class="lens" cx="188" cy="68" rx="4" ry="11"/><text class="opt-lbl sm" x="188" y="47" text-anchor="middle">f=50</text>
  <rect class="wp" x="222" y="56" width="7" height="24"/><text class="opt-lbl sm" x="225" y="49" text-anchor="middle">λ/2</text>
  <ellipse class="lens" cx="262" cy="68" rx="4" ry="11"/><text class="opt-lbl sm" x="262" y="47" text-anchor="middle">f=200</text>
  <rect class="wp" x="300" y="56" width="7" height="24"/><text class="opt-lbl sm" x="303" y="49" text-anchor="middle">λ/2</text>
  <ellipse class="lens" cx="342" cy="68" rx="4" ry="11"/><text class="opt-lbl sm" x="342" y="92" text-anchor="middle">f=35·xyz</text>
  <line class="mirror" x1="364" y1="60" x2="380" y2="76"/>
  <line class="beam b729" x1="372" y1="68" x2="656" y2="248" marker-end="url(#sb)"/>
  <text class="call q" x="150" y="106">729 addressed → δ, Ω (M3·M5·M6·M7)</text>

  <!-- 397 Doppler/detection (blue) + Raman branch -->
  <line class="beam b397" x1="106" y1="190" x2="120" y2="190"/>
  <rect class="aom" x="120" y="177" width="32" height="26" rx="3"/><text class="opt-lbl sm" x="136" y="194" text-anchor="middle">AOM</text>
  <line class="beam b397" x1="152" y1="190" x2="378" y2="190"/>
  <rect class="pbs" x="176" y="178" width="24" height="24"/><line class="pbs-d" x1="176" y1="202" x2="200" y2="178"/>
  <rect class="wp" x="230" y="178" width="7" height="24"/><text class="opt-lbl sm" x="233" y="172" text-anchor="middle">λ/2</text>
  <ellipse class="lens" cx="272" cy="190" rx="4" ry="11"/><text class="opt-lbl sm" x="272" y="169" text-anchor="middle">f=100</text>
  <ellipse class="lens" cx="330" cy="190" rx="4" ry="11"/><text class="opt-lbl sm" x="330" y="214" text-anchor="middle">f=300·xyz</text>
  <line class="mirror" x1="370" y1="182" x2="386" y2="198"/>
  <line class="beam b397" x1="378" y1="190" x2="656" y2="262" marker-end="url(#sb)"/>
  <text class="call" x="150" y="232">397: Doppler cool (M4) + detect (M8)</text>
  <line class="beam b397" x1="188" y1="178" x2="188" y2="126"/>
  <rect class="wp" x="184" y="122" width="7" height="8"/><text class="opt-lbl sm" x="202" y="118" text-anchor="middle">λ/4</text>
  <line class="mirror" x1="180" y1="118" x2="196" y2="134"/>
  <line class="beam b397" x1="188" y1="126" x2="652" y2="242" marker-end="url(#sb)"/>
  <text class="call" x="412" y="150">Raman σ (397 nm)</text>

  <!-- 866/854 repump/quench (orange) -->
  <line class="beam brep" x1="106" y1="314" x2="200" y2="314"/><line class="mirror" x1="192" y1="306" x2="208" y2="322"/>
  <line class="beam brep" x1="200" y1="314" x2="656" y2="278" marker-end="url(#sb)"/>
  <text class="call" x="150" y="338">866 repump (M4/M8) · 854 quench (M5)</text>

  <!-- 375/422 photoionization (purple) -->
  <line class="beam bload" x1="106" y1="438" x2="260" y2="438"/>
  <ellipse class="lens" cx="188" cy="438" rx="4" ry="11"/><text class="opt-lbl sm" x="188" y="417" text-anchor="middle">f=35</text>
  <line class="mirror" x1="252" y1="430" x2="268" y2="446"/>
  <line class="beam bload" x1="260" y1="438" x2="656" y2="292" marker-end="url(#sb)"/>
  <text class="call" x="150" y="462">375/422: photoionize → load ion (M1)</text>

  <!-- 8-blade trap + magnetic coils (B_D, B_σ, B_grad) -->
  <polygon class="elec-gnd" points="710,208 750,208 736,234 724,234"/>
  <polygon class="elec-gnd" points="710,312 724,286 736,286 750,312"/>
  <polygon class="elec-gnd" points="668,238 696,250 696,270 668,282"/>
  <polygon class="elec-gnd" points="792,238 792,282 764,270 764,250"/>
  <circle class="ion" cx="730" cy="260" r="6"/>
  <rect class="coil-bd" x="684" y="208" width="26" height="24" rx="2"/><text class="coil-lbl" x="697" y="224" text-anchor="middle">B_D</text>
  <rect class="coil-bd" x="752" y="288" width="26" height="24" rx="2"/><text class="coil-lbl" x="765" y="304" text-anchor="middle">B_D</text>
  <rect class="coil-bs" x="752" y="208" width="26" height="24" rx="2"/><text class="coil-lbl" x="765" y="224" text-anchor="middle">B_σ</text>
  <rect class="coil-bs" x="684" y="288" width="26" height="24" rx="2"/><text class="coil-lbl" x="697" y="304" text-anchor="middle">B_σ</text>
  <rect class="coil-bg" x="717" y="176" width="26" height="24" rx="2"/><text class="coil-lbl" x="730" y="192" text-anchor="middle">B_g</text>
  <text class="opt-lbl" x="730" y="342" text-anchor="middle">linear Paul trap (8 blades) + B_D / B_σ / B_grad coils</text>

  <!-- imaging → camera / PMT -->
  <line class="beam b397 dash" x1="794" y1="252" x2="874" y2="176" marker-end="url(#sb)"/>
  <ellipse class="lens" cx="836" cy="214" rx="11" ry="5"/><text class="opt-lbl sm" x="836" y="234" text-anchor="middle">f=300</text>
  <rect class="box small" x="866" y="144" width="66" height="26" rx="4"/><text class="opt-lbl sm" x="899" y="161" text-anchor="middle">camera</text>
  <text class="call" x="812" y="134">detection (397 nm) — M8</text>
</svg>`;
const YB_SETUP_SVG = `
<svg class="lab-svg" viewBox="0 0 940 560" role="img" aria-label="¹⁷¹Yb⁺ full microwave / MAGIC setup">
  <defs><marker id="sb2" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" class="arh"/></marker></defs>

  <!-- microwave chain: synth → amplifier → horn -->
  <rect class="laser" x="12" y="54" width="108" height="28" rx="4"/><text class="opt-lbl sm" x="66" y="72" text-anchor="middle">μw synth 12.6 GHz</text>
  <polygon class="aom" points="128,57 128,81 154,69"/><text class="opt-lbl sm" x="139" y="51" text-anchor="middle">amp</text>
  <polygon class="aom" points="164,55 164,83 202,69"/><text class="opt-lbl sm" x="176" y="49" text-anchor="middle">horn</text>
  <line class="beam bmw" x1="202" y1="69" x2="656" y2="250" marker-end="url(#sb2)"/>
  <text class="call q" x="150" y="112">μw 12.6 GHz → δ, Ω (M3·M5·M6·M7)</text>

  <!-- 369.5 Doppler/detection -->
  <rect class="laser" x="12" y="176" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="194" text-anchor="middle">369.5 nm</text>
  <line class="beam b397" x1="106" y1="190" x2="120" y2="190"/>
  <rect class="aom" x="120" y="177" width="32" height="26" rx="3"/><text class="opt-lbl sm" x="136" y="194" text-anchor="middle">AOM</text>
  <line class="beam b397" x1="152" y1="190" x2="378" y2="190"/>
  <rect class="pbs" x="176" y="178" width="24" height="24"/><line class="pbs-d" x1="176" y1="202" x2="200" y2="178"/>
  <rect class="wp" x="230" y="178" width="7" height="24"/><text class="opt-lbl sm" x="233" y="172" text-anchor="middle">λ/2</text>
  <ellipse class="lens" cx="272" cy="190" rx="4" ry="11"/><text class="opt-lbl sm" x="272" y="169" text-anchor="middle">f=100</text>
  <ellipse class="lens" cx="330" cy="190" rx="4" ry="11"/><text class="opt-lbl sm" x="330" y="214" text-anchor="middle">f=300·xyz</text>
  <line class="mirror" x1="370" y1="182" x2="386" y2="198"/>
  <line class="beam b397" x1="378" y1="190" x2="656" y2="262" marker-end="url(#sb2)"/>
  <text class="call" x="150" y="232">369: Doppler cool (M4) + detect (M8)</text>

  <!-- 935/638 repumps -->
  <rect class="laser" x="12" y="300" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="318" text-anchor="middle">935 / 638</text>
  <line class="beam brep" x1="106" y1="314" x2="200" y2="314"/><line class="mirror" x1="192" y1="306" x2="208" y2="322"/>
  <line class="beam brep" x1="200" y1="314" x2="656" y2="278" marker-end="url(#sb2)"/>
  <text class="call" x="150" y="338">935 repump (D₃/₂) · 638 repump (F₇/₂)</text>

  <!-- 399/369 photoionization -->
  <rect class="laser" x="12" y="424" width="94" height="28" rx="4"/><text class="opt-lbl" x="59" y="442" text-anchor="middle">399 / 369</text>
  <line class="beam bload" x1="106" y1="438" x2="260" y2="438"/>
  <ellipse class="lens" cx="188" cy="438" rx="4" ry="11"/><text class="opt-lbl sm" x="188" y="417" text-anchor="middle">f=35</text>
  <line class="mirror" x1="252" y1="430" x2="268" y2="446"/>
  <line class="beam bload" x1="260" y1="438" x2="656" y2="292" marker-end="url(#sb2)"/>
  <text class="call" x="150" y="462">399/369: photoionize → load ion (M1)</text>

  <!-- trap + MAGIC gradient coils -->
  <rect class="coil grad" x="676" y="198" width="110" height="15" rx="3"/><rect class="coil grad" x="676" y="309" width="110" height="15" rx="3"/>
  <line class="gradv" x1="696" y1="236" x2="696" y2="228"/><line class="gradv" x1="718" y1="238" x2="718" y2="224"/><line class="gradv" x1="740" y1="240" x2="740" y2="220"/><line class="gradv" x1="762" y1="242" x2="762" y2="216"/>
  <polygon class="elec-gnd" points="712,242 750,242 737,260 725,260"/>
  <polygon class="elec-gnd" points="712,298 725,280 737,280 750,298"/>
  <polygon class="elec-gnd" points="674,250 700,260 700,280 674,290"/>
  <polygon class="elec-gnd" points="788,250 788,290 762,280 762,260"/>
  <circle class="ion" cx="730" cy="270" r="6"/>
  <text class="opt-lbl" x="730" y="348" text-anchor="middle">Paul trap + static ∂B/∂z gradient (MAGIC)</text>
  <text class="call q" x="632" y="196">∂B/∂z → η_eff (M3·M5·M7)</text>

  <!-- detection → camera -->
  <line class="beam b397 dash" x1="794" y1="262" x2="874" y2="186" marker-end="url(#sb2)"/>
  <ellipse class="lens" cx="836" cy="224" rx="11" ry="5"/><text class="opt-lbl sm" x="836" y="244" text-anchor="middle">f=300</text>
  <rect class="box small" x="866" y="154" width="66" height="26" rx="4"/><text class="opt-lbl sm" x="899" y="171" text-anchor="middle">camera</text>
  <text class="call" x="812" y="144">detection (369 nm) — M8</text>
</svg>`;
const ATOM_SETUP = {
  Ca: { svg: CA_SETUP_SVG, caption: `<b>⁴⁰Ca⁺ laser table.</b> Each beam is shaped by lenses (f=50/100/200/300/35 mm), λ/2 &amp; λ/4 plates, PBS cubes and fold
    mirrors, and frequency/amplitude-controlled by an <b>AOM</b> before the trap: the 729 nm AOM <i>is</i> the δ &amp; Ω knobs (M3·M5·M6·M7);
    397 nm does M4 Doppler cooling, M8 detection and the Raman σ beams; 866/854 repump &amp; quench; 375/422 photoionize to load (M1). The
    ion sits in an 8-blade linear trap with <b>B_D / B_σ</b> (quantization) and <b>B_grad</b> coils; fluorescence is imaged (f=300) onto a
    camera/PMT (M8). Faithful to the Innsbruck-style layout in the thesis sources (a real table folds the paths more tightly).` },
  Yb: { svg: YB_SETUP_SVG, caption: `<b>¹⁷¹Yb⁺ microwave + MAGIC layout.</b> The qubit is driven by a <b>microwave chain</b> (synth → amp → horn, 12.6 GHz → δ, Ω) —
    no qubit laser. A static <b>∂B/∂z gradient</b> across the trap supplies the effective Lamb–Dicke η_eff for sidebands &amp; gates (M3·M5·M7).
    369.5 nm (AOM, f=100/300 lenses, λ/2, PBS) does M4 cooling and M8 detection; 935/638 repump the D₃/₂ &amp; F₇/₂ leaks; 399/369 photoionize
    to load (M1); fluorescence is imaged (f=300) onto a camera. The entangling physics moves from the laser table to the magnetic gradient.` },
};

// ---------------------------------------------------------------------------
let backdrop = null, titleEl = null, atomBar = null, contentEl = null;
let chatThread = null, chatInput = null, chatSend = null, chatKeyRow = null, chatKeyInput = null;
let lastFocus = null, curEntry = null, curAtom = null, curContext = '', chatHistory = [], chatStreaming = false;
let onApplyAtom = null;   // optional callback: push this atom's real numbers into the sim

function ensureDialog() {
  if (backdrop) return;
  backdrop = document.createElement('div');
  backdrop.className = 'lab-backdrop';
  backdrop.innerHTML = `
    <div class="lab-dialog" role="dialog" aria-modal="true">
      <div class="lab-head">
        <h3 class="lab-title"></h3>
        <div class="lab-atombar"></div>
        <button class="lab-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="lab-body"><div class="lab-content"></div></div>
      <div class="lab-chat">
        <h4>Ask the AI copilot about this setup</h4>
        <div class="lab-chat-key" hidden>
          <input class="lab-key-input" type="password" autocomplete="off" placeholder="Paste your Anthropic API key (sk-ant-…) to chat" />
          <button class="lab-key-save" type="button">Save</button>
        </div>
        <div class="lab-chat-thread"></div>
        <div class="lab-chat-ask">
          <textarea class="lab-chat-input" rows="1" placeholder="Ask about the apparatus, lasers, or settings…"></textarea>
          <button class="lab-chat-send" type="button">Ask</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  titleEl = backdrop.querySelector('.lab-title');
  atomBar = backdrop.querySelector('.lab-atombar');
  contentEl = backdrop.querySelector('.lab-content');
  chatThread = backdrop.querySelector('.lab-chat-thread');
  chatInput = backdrop.querySelector('.lab-chat-input');
  chatSend = backdrop.querySelector('.lab-chat-send');
  chatKeyRow = backdrop.querySelector('.lab-chat-key');
  chatKeyInput = backdrop.querySelector('.lab-key-input');

  backdrop.querySelector('.lab-close').addEventListener('click', closeLab);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeLab(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeLab(); });
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  backdrop.querySelector('.lab-key-save').addEventListener('click', () => {
    const k = chatKeyInput.value.trim(); if (k) { setApiKey(k); chatKeyInput.value = ''; chatKeyRow.hidden = true; chatInput.focus(); }
  });
  window.addEventListener('storage', (e) => { if (e.key === 'anthropic-api-key' || e.key === null) chatKeyRow.hidden = hasApiKey(); });
}

function renderAtom(atomKey) {
  const a = curEntry.atoms[atomKey]; curAtom = atomKey;
  atomBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.atom === atomKey));
  const rows = a.paramRows.map((r) =>
    `<tr><td class="p-sim">${r[0]}</td><td>${r[1]}</td><td class="p-val">${r[2]}</td><td class="p-set">${r[3]}</td></tr>`).join('');
  const sources = a.sources.map(([label, file, note]) =>
    `<li><a href="${READER(file)}" target="_blank" rel="noopener">${label}</a> — ${note} <span class="lab-open">📖 reader</span></li>`).join('');
  const sym = a.label.split(' ')[0];
  const applyBar = onApplyAtom
    ? `<div class="lab-apply">
         <button type="button" class="lab-apply-btn">⚙ Load these ${sym} numbers into the simulator</button>
         <span class="lab-apply-note" role="status"></span>
       </div>` : '';
  contentEl.innerHTML = `
    <p class="lab-intro">${a.intro}</p>
    ${applyBar}
    <div class="lab-grid">
      <figure class="lab-fig${(a.wideEnergy || !a.apparatusSvg) ? ' wide' : ''}">${a.energySvg}<figcaption>${a.energyCaption}</figcaption></figure>
      ${a.apparatusSvg ? `<figure class="lab-fig">${a.apparatusSvg}<figcaption>${a.apparatusCaption}</figcaption></figure>` : ''}
    </div>
    <h4 class="lab-h4">What the visualizer's controls mean on the real setup</h4>
    <div class="lab-tablewrap"><table class="lab-table">
      <thead><tr><th>Visualizer control</th><th>Real device / how it is set</th><th>Typical ${sym} value</th><th>Sets in the sim</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="lab-note">${a.paramNote}</p>
    <h4 class="lab-h4">Read the real thing (opens in the AI reader)</h4>
    <ul class="lab-sources">${sources}</ul>
    ${ATOM_SETUP[atomKey] ? `<div class="lab-setup">
      <button type="button" class="lab-setup-btn">🔧 Full optical setup — map every knob to the real table</button>
      <div class="lab-setup-body"><figure class="lab-fig wide">${ATOM_SETUP[atomKey].svg}<figcaption>${ATOM_SETUP[atomKey].caption}</figcaption></figure></div>
    </div>` : ''}`;
  const applyBtn = contentEl.querySelector('.lab-apply-btn');
  if (applyBtn && onApplyAtom) applyBtn.addEventListener('click', () => {
    const summary = onApplyAtom(curAtom);
    const noteEl = contentEl.querySelector('.lab-apply-note');
    if (noteEl) noteEl.textContent = summary ? '✓ ' + summary : '✓ Loaded into the simulator.';
  });
  // "Full optical setup" accordion — a real <button> + class toggle (bulletproof
  // clicks, no <details> quirks); scroll it into view so the diagram isn't left
  // below the fold when it expands at the bottom of the scroll area.
  const setupBtn = contentEl.querySelector('.lab-setup-btn');
  if (setupBtn) setupBtn.addEventListener('click', () => {
    const box = setupBtn.closest('.lab-setup');
    const opened = box.classList.toggle('open');
    if (opened) setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  });
  // chat context = plain text of this atom's content
  curContext = [a.intro, a.energyCaption, a.apparatusCaption,
    a.paramRows.map((r) => `${r[0]}: ${r[1]} — typical ${r[2]}; sets ${r[3]}`).join('\n'), a.paramNote]
    .join('\n\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  chatHistory = [];
  chatThread.innerHTML = '<p class="lab-chat-empty">Ask about this apparatus, the lasers/microwaves, or how a slider maps to a real setting.</p>';
  document.querySelector('.lab-body').scrollTop = 0;
}

export function openLab(moduleId, moduleName) {
  ensureDialog();
  curEntry = ION_LAB[moduleId];
  titleEl.textContent = curEntry ? curEntry.heading : `${moduleName || moduleId} · In the lab`;
  if (curEntry && curEntry.atoms) {
    atomBar.innerHTML = Object.entries(curEntry.atoms).map(([k, a], i) =>
      `<button type="button" data-atom="${k}" class="${i === 0 ? 'on' : ''}">${a.label}</button>`).join('');
    atomBar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => renderAtom(b.dataset.atom)));
    atomBar.hidden = false;
    renderAtom(Object.keys(curEntry.atoms)[0]);
  } else {
    atomBar.hidden = true;
    contentEl.innerHTML = `<p class="lab-intro">The <b>In-the-lab</b> hardware view for <b>${moduleName || moduleId}</b> isn't built yet —
      the <b>M3</b> prototype is live (open M3 → <b>🔬 In the lab</b>). Tell me to build this module next.</p>`;
    curContext = ''; chatHistory = []; chatThread.innerHTML = '';
  }
  chatKeyRow.hidden = hasApiKey(); chatStreaming = false; chatSend.disabled = false;
  lastFocus = document.activeElement;
  backdrop.classList.add('open');
  backdrop.querySelector('.lab-close').focus();
}
export function closeLab() {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}
export function initLab(opts = {}) { onApplyAtom = opts.onApplyAtom || null; ensureDialog(); }

// ---- chat -------------------------------------------------------------------
function addChat(cls, text) {
  const empty = chatThread.querySelector('.lab-chat-empty'); if (empty) empty.remove();
  const el = document.createElement('div'); el.className = 'ic-msg ic-' + cls;
  const who = document.createElement('div'); who.className = 'ic-who'; who.textContent = cls === 'user' ? 'You' : 'Claude';
  const body = document.createElement('div'); body.className = 'ic-body'; body.textContent = text || '';
  el.appendChild(who); el.appendChild(body); chatThread.appendChild(el); chatThread.scrollTop = chatThread.scrollHeight;
  return body;
}
function sendChat() {
  if (chatStreaming || !curContext) return;
  const q = chatInput.value.trim(); if (!q) return;
  if (!hasApiKey()) { chatKeyRow.hidden = false; chatKeyInput.focus(); return; }
  chatInput.value = '';
  addChat('user', q);
  const bubble = addChat('ai', '');
  chatStreaming = true; chatSend.disabled = true;
  const atomLabel = curEntry.atoms[curAtom].label;
  explainStream({
    system: `You are the AI copilot for the CiRA QuantumSim "In the lab" view. The user is looking at how the "${curEntry.heading}" module maps to a real ${atomLabel} experiment. Discuss the apparatus, the energy-level scheme, and how the visualizer's controls correspond to real hardware settings, grounded in the card text below and standard trapped-ion experimental practice. Be rigorous and concise; use plain-text math (no LaTeX). If the card doesn't cover something, say so.`,
    contextText: curContext,
    selectionText: `${curEntry.heading} — ${atomLabel}`,
    question: q,
    history: chatHistory,
  }, {
    onDelta: (t) => { bubble.textContent += t; chatThread.scrollTop = chatThread.scrollHeight; },
    onDone: (full) => { chatStreaming = false; chatSend.disabled = false; chatHistory.push({ role: 'user', content: q }); chatHistory.push({ role: 'assistant', content: full }); if (chatHistory.length > 10) chatHistory.splice(0, chatHistory.length - 10); },
    onError: (e) => { chatStreaming = false; chatSend.disabled = false; bubble.parentElement.classList.add('err'); bubble.textContent = 'Error: ' + e.message; },
  });
}
