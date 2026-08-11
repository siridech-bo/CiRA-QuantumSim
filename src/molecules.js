// =============================================================================
// molecules.js — the MOLECULE LIBRARY driving the n-spin quantum engine.
//
// Each Molecule is a plain data record describing a real (or teaching) NMR spin
// system: its nuclei (isotope, colors, display offset, T1/T2), the physical
// scalar J-coupling matrix (n×n symmetric, Hz, zero diagonal), and provenance.
// The engine (src/quantum.js) and gate compiler (src/gates.js) read EVERYTHING
// from a Molecule — no physics constants are hardcoded elsewhere.
//
// SCOPE (Phase 1+2): heteronuclear AND homonuclear, weak-coupling. Homonuclear
// molecules set `addressing:'homo'` and use their REAL chemical-shift offsets
// directly (the engine's rotating-frame detunings) — see the OFFSET CONVENTION
// note below. Both shipped homonuclear molecules are `couplingModel:'weak'`
// (verified |Δν| >> |J|); the engine ALSO supports `couplingModel:'full'`
// (isotropic flip-flop J) for future strongly-coupled molecules, but no shipped
// molecule uses it. Selective soft (shaped) pulses realize single-qubit gates on
// homonuclear molecules — see src/quantum.js softPulse() and src/gates.js.
//
// OFFSET CONVENTION (important — differs by addressing):
//   * HETERONUCLEAR (addressing:'hetero'): real rotating-frame offsets are 0 Hz
//     (each nucleus sits on its own RF channel / carrier, on resonance). The app
//     substitutes small DISPLAY offsets (offsetHz) so the Bloch vectors visibly
//     precess in the 3D scene and the FID/spectrum show structure. These offsets
//     are a VISUALIZATION parameter ONLY — the REAL physics (J, T1, T2) uses the
//     verified literature numbers.
//   * HOMONUCLEAR (addressing:'homo'): all spins are the SAME nucleus (all ¹³C)
//     sharing ONE RF channel, distinguished ONLY by chemical shift. The offsetHz
//     values here are the REAL chemical-shift offsets (Hz) from the cited papers.
//     A HARD pulse rotates ALL spins at once; selectivity (single-qubit
//     addressing) comes from frequency-selective SOFT pulses tuned to a target
//     spin's resonance. These offsets are REAL PHYSICS, not display cosmetics.
//
// Molecule shape:
//   { id, name, description, field_T,
//     addressing:'hetero'|'homo', couplingModel:'weak'|'full',
//     nuclei:[{ label, isotope, color, offsetHz, T1, T2 }],
//     J: <n×n symmetric Hz matrix, diagonal 0>, source:'<citation>' }
// =============================================================================

// Build a symmetric n×n J matrix (Hz, zero diagonal) from a list of
// { i, j, J } pair entries. Missing pairs are 0.
function jMatrix(n, pairs) {
  const J = [];
  for (let i = 0; i < n; i++) J.push(new Array(n).fill(0));
  for (const { i, j, J: v } of pairs) {
    J[i][j] = v;
    J[j][i] = v;
  }
  return J;
}

// ---------------------------------------------------------------------------
// 1) Existing 3-spin SPINQ Gemini teaching demo — the DEFAULT molecule.
//    ¹H / ³¹P / ¹⁹F. Numbers UNCHANGED from the original SPINQ_PARAMS so the
//    engine's no-arg default behaves identically and the legacy tests pass.
//    Source: existing SPINQ_PARAMS (synthetic teaching values; see CLAUDE.md).
//    All offsets here are the original DISPLAY offsets (12/20/30 Hz).
// ---------------------------------------------------------------------------
const SPINQ3 = {
  id: 'spinq3',
  name: 'SpinQ 3-spin (¹H·³¹P·¹⁹F)',
  description: 'SPINQ Gemini teaching demo — synthetic ¹H/³¹P/¹⁹F 3-qubit system.',
  field_T: 1.084,
  addressing: 'hetero',
  couplingModel: 'weak',
  nuclei: [
    // offsetHz are DISPLAY-ONLY precession rates (teaching values).
    { label: '¹H',  isotope: '1H',  color: 0x4A90D9, offsetHz: 12, T1: 5.0, T2: 0.20 },
    { label: '³¹P', isotope: '31P', color: 0x50C878, offsetHz: 20, T1: 4.5, T2: 0.15 },
    { label: '¹⁹F', isotope: '19F', color: 0xFF8C00, offsetHz: 30, T1: 6.0, T2: 0.25 },
  ],
  // Physical scalar couplings (Hz): H-P=42, H-F=220, P-F=430.
  J: jMatrix(3, [
    { i: 0, j: 1, J: 42 },
    { i: 0, j: 2, J: 220 },
    { i: 1, j: 2, J: 430 },
  ]),
  source: 'Existing SPINQ_PARAMS (synthetic teaching values, CLAUDE.md).',
};

// ---------------------------------------------------------------------------
// 2) Dimethylphosphite (DMP) — the REAL SpinQ Gemini 2-qubit sample. ¹H·³¹P.
//    Verified physics: J(¹H-³¹P) = 697.4 Hz; ¹H T1=4.0s, T2=0.3s;
//    ³¹P T1=7.2s, T2=0.5s; B0=1 T; Larmor 42.6/17.2 MHz; REAL rotating-frame
//    offsets = 0 Hz (both on resonance).
//    Source: Hou et al., EPJ Quantum Technol. 8, 20 (2021), arXiv:2101.10017.
// ---------------------------------------------------------------------------
const DMP = {
  id: 'dmp',
  name: 'Dimethylphosphite (¹H·³¹P)',
  description: 'Real SpinQ Gemini 2-qubit sample. J(¹H-³¹P)=697.4 Hz.',
  field_T: 1.0,
  addressing: 'hetero',
  couplingModel: 'weak',
  nuclei: [
    // REAL rotating-frame offsets are 0 Hz (on resonance). offsetHz below is
    // DISPLAY-ONLY so the Bloch vectors precess visibly (¹H=15, ³¹P=25 Hz).
    { label: '¹H',  isotope: '1H',  color: 0x4A90D9, offsetHz: 15, T1: 4.0, T2: 0.3 },
    { label: '³¹P', isotope: '31P', color: 0x50C878, offsetHz: 25, T1: 7.2, T2: 0.5 },
  ],
  // Real physical coupling.
  J: jMatrix(2, [{ i: 0, j: 1, J: 697.4 }]),
  source: 'Hou et al., EPJ Quantum Technol. 8, 20 (2021), arXiv:2101.10017.',
};

// ---------------------------------------------------------------------------
// 3) Chloroform — classic ¹H·¹³C AX 2-qubit system.
//    Verified physics: J(¹H-¹³C) = 215.5 Hz; ¹H T1=20s, T2=7.5s;
//    ¹³C T1=20s, T2=0.30s; 11.7 T.
//    Source: arXiv:quant-ph/0405050 & quant-ph/0604112.
// ---------------------------------------------------------------------------
const CHLOROFORM = {
  id: 'chloroform',
  name: 'Chloroform (¹H·¹³C)',
  description: 'Classic AX 2-qubit system. J(¹H-¹³C)=215.5 Hz.',
  field_T: 11.7,
  addressing: 'hetero',
  couplingModel: 'weak',
  nuclei: [
    // REAL rotating-frame offsets are 0 Hz (on resonance). offsetHz below is
    // DISPLAY-ONLY so the Bloch vectors precess visibly (¹H=15, ¹³C=25 Hz).
    { label: '¹H',  isotope: '1H',  color: 0x4A90D9, offsetHz: 15, T1: 20,  T2: 7.5 },
    { label: '¹³C', isotope: '13C', color: 0xC0C0C8, offsetHz: 25, T1: 20,  T2: 0.30 },
  ],
  // Real physical coupling.
  J: jMatrix(2, [{ i: 0, j: 1, J: 215.5 }]),
  source: 'arXiv:quant-ph/0405050 & quant-ph/0604112.',
};

// ---------------------------------------------------------------------------
// 4) ¹³C-alanine — 3-qubit HOMONUCLEAR (all ¹³C). Weakly coupled liquid.
//    Distinct carbons: C1 = carbonyl (COOH), C2 = Cα, C3 = methyl (CH3). All
//    share ONE ¹³C channel (125.77 MHz); addressed only by chemical shift.
//    REAL chemical-shift offsets (Hz, NOT display cosmetics — homonuclear
//    addressing depends on them):
//      C1 = −4320,  C2 = 0,  C3 = +15793
//    REAL scalar couplings (Hz): J(C1-C2)=34.94, J(C2-C3)=53.81, J(C1-C3)=1.21.
//    T1 (s): 20.3, 2.8, 1.5;  T2 (s): 1.3, 0.41, 0.81.
//    Weak coupling valid: |Δν| (thousands of Hz) >> |J| (tens of Hz).
//    Source: Peng, Zhu, Fang, Feng, Liu & Gao, "Experimental Implementation of
//    Hogg's Algorithm on a Three-Quantum-bit NMR Quantum Computer," Phys. Rev. A
//    65, 042315 (2002), arXiv:quant-ph/0108068 (3-spin ¹³C, 125.77 MHz).
//    [Citation corrected 2026-08: the earlier "Kim et al., PRA 66, 022311" was a
//     mis-attribution — that vol/page is an unrelated paper; the arXiv id above is
//     the real 3-qubit ¹³C NMR source. Physical J/shift/T values are unchanged.]
// ---------------------------------------------------------------------------
const ALANINE = {
  id: 'alanine',
  name: '¹³C-alanine (3× ¹³C, homonuclear)',
  description: 'Homonuclear 3-qubit ¹³C system (C1 carbonyl, C2 Cα, C3 methyl). '
    + 'Single-qubit gates use frequency-selective soft pulses.',
  field_T: 11.74,   // 125.77 MHz ¹³C ≈ 11.74 T
  addressing: 'homo',
  couplingModel: 'weak',   // verified weak: |Δν| >> |J|
  nuclei: [
    // offsetHz are REAL ¹³C chemical-shift offsets (Hz), not display values.
    // Distinct carbon-ish colors so the three ¹³C spheres are distinguishable.
    { label: 'C1', isotope: '13C', color: 0x9AA0A6, offsetHz: -4320,  T1: 20.3, T2: 1.3  },
    { label: 'C2', isotope: '13C', color: 0xB0785A, offsetHz: 0,      T1: 2.8,  T2: 0.41 },
    { label: 'C3', isotope: '13C', color: 0x6FA8B0, offsetHz: 15793,  T1: 1.5,  T2: 0.81 },
  ],
  J: jMatrix(3, [
    { i: 0, j: 1, J: 34.94 },
    { i: 1, j: 2, J: 53.81 },
    { i: 0, j: 2, J: 1.21 },
  ]),
  source: 'Peng, Zhu, Fang, Feng, Liu & Gao, Phys. Rev. A 65, 042315 (2002), arXiv:quant-ph/0108068.',
};

// ---------------------------------------------------------------------------
// 5) Crotonic acid — 4-qubit HOMONUCLEAR (all ¹³C). Weakly coupled liquid.
//    Carbons: C1 = COOH, C2, C3, C4 = CH3. One ¹³C channel (500 MHz ¹H spectro-
//    meter). REAL chemical-shift offsets (Hz):
//      C1 = 21468.9,  C2 = 15255.6,  C3 = 18668.0,  C4 = 2190.4
//    REAL couplings (Hz): J12=72.4, J13=−1.3, J14=7.0, J23=70.3, J24=−1.6,
//    J34=41.3.
//    T2 (s): C1=0.84, C2=0.92, C3=0.66, C4=0.79 (source arXiv:1710.03646).
//    T1 (s): NOT PUBLISHED — the values below (C1=10, C2=3, C3=3, C4=2) are
//    UNPUBLISHED ENGINEERING ESTIMATES for the relaxation animation ONLY, NOT
//    from any source. Tests fit T2 strictly and treat T1 loosely/skip.
//    Weak coupling valid: |Δν| (thousands of Hz) >> |J| (tens of Hz).
//    Source: Liu, Zhang & Long, "Simulation of four-body interaction in a nuclear
//    magnetic resonance quantum information processor," arXiv:0704.1181 (2007) —
//    4-spin ¹³C system (500 MHz spectrometer); T2 from arXiv:1710.03646.
//    [Citation corrected 2026-08: the earlier "Peng et al., PRL 100, 140501 (2008)"
//     was a mis-attribution (that PRL is Ryan-Moussa-Baugh-Laflamme algorithmic
//     cooling, a different arXiv); 0704.1181 is the 4-qubit ¹³C source the repo
//     points to. Physical J/shift/T2 values are unchanged.]
// ---------------------------------------------------------------------------
const CROTONIC = {
  id: 'crotonic',
  name: 'Crotonic acid (4× ¹³C, homonuclear)',
  description: 'Homonuclear 4-qubit ¹³C system (C1 COOH, C2, C3, C4 CH3). '
    + 'Single-qubit gates use frequency-selective soft pulses.',
  field_T: 11.74,   // 500 MHz ¹H ⇒ ~125.7 MHz ¹³C ≈ 11.74 T
  addressing: 'homo',
  couplingModel: 'weak',   // verified weak: |Δν| >> |J|
  nuclei: [
    // offsetHz are REAL ¹³C chemical-shift offsets (Hz), not display values.
    { label: 'C1', isotope: '13C', color: 0x9AA0A6, offsetHz: 21468.9, T1: 10, T2: 0.84 },
    { label: 'C2', isotope: '13C', color: 0xB0785A, offsetHz: 15255.6, T1: 3,  T2: 0.92 },
    { label: 'C3', isotope: '13C', color: 0x6FA8B0, offsetHz: 18668.0, T1: 3,  T2: 0.66 },
    { label: 'C4', isotope: '13C', color: 0xC7B15A, offsetHz: 2190.4,  T1: 2,  T2: 0.79 },
  ],
  // T1 above are UNPUBLISHED ESTIMATES (not from a source) — see block comment.
  J: jMatrix(4, [
    { i: 0, j: 1, J: 72.4 },
    { i: 0, j: 2, J: -1.3 },
    { i: 0, j: 3, J: 7.0 },
    { i: 1, j: 2, J: 70.3 },
    { i: 1, j: 3, J: -1.6 },
    { i: 2, j: 3, J: 41.3 },
  ]),
  source: 'Liu, Zhang & Long, arXiv:0704.1181 (2007); T2 from arXiv:1710.03646. '
    + 'T1 are unpublished estimates.',
};

// ---------------------------------------------------------------------------
// Registry + accessors.
// ---------------------------------------------------------------------------
const REGISTRY = [SPINQ3, DMP, CHLOROFORM, ALANINE, CROTONIC];
const BY_ID = new Map(REGISTRY.map((m) => [m.id, m]));

// The default molecule id (the existing 3-spin demo).
export const DEFAULT_MOLECULE_ID = 'spinq3';

// Number of spins in a molecule.
export function nSpinsOf(mol) { return mol.nuclei.length; }

// Look up a molecule by id (throws on unknown id).
export function getMolecule(id) {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`unknown molecule id "${id}"`);
  return m;
}

// Convenience: the default molecule record.
export function defaultMolecule() { return getMolecule(DEFAULT_MOLECULE_ID); }

// List all molecules with id, name, qubit count, and addressing (for the UI).
export function listMolecules() {
  return REGISTRY.map((m) => ({
    id: m.id, name: m.name, n: m.nuclei.length, addressing: m.addressing,
  }));
}

// Convenience predicate: is this molecule homonuclear (shared RF channel)?
export function isHomonuclear(mol) { return mol.addressing === 'homo'; }

// Largest |offset| (Hz) across a molecule's nuclei — drives adaptive dwell /
// spectrum window (homonuclear real offsets can reach ~21 kHz).
export function maxAbsOffsetHz(mol) {
  return mol.nuclei.reduce((mx, nu) => Math.max(mx, Math.abs(nu.offsetHz)), 0);
}

// Adaptive FID/spectrum view parameters for a molecule. Homonuclear real
// offsets are large (up to ~21 kHz) so the fixed 1 ms dwell / ±300 Hz window
// would ALIAS. We shrink the dwell so Nyquist (0.5/dwell) covers the largest
// offset + multiplet, and widen the spectrum half-window to match.
//   * heteronuclear (offsets ~tens of Hz): keep dwell=1 ms, view=±300 Hz.
//   * homonuclear: dwell = min(1 ms, 1/(4·maxAbsOffset)); view = maxAbsOffset +
//     maxJ + margin. Fast 3D precession for high-shift spins is physically
//     honest (the speed slider mitigates it).
// Returns { dwell (s), viewHz (Hz half-window) }.
export function viewParams(mol) {
  const maxOff = maxAbsOffsetHz(mol);
  const maxJ = maxAbsJHz(mol);
  const BASE_DWELL = 1e-3;      // 1 ms  → ±500 Hz Nyquist
  const BASE_VIEW = 300;        // ±300 Hz display window (heteronuclear)
  if (mol.addressing !== 'homo' || maxOff <= 250) {
    return { dwell: BASE_DWELL, viewHz: BASE_VIEW };
  }
  // Homonuclear: dwell so Nyquist ≳ maxOff (factor 4 gives headroom for the
  // multiplet + apodization); never coarser than 1 ms.
  const dwell = Math.min(BASE_DWELL, 1 / (4 * maxOff));
  const viewHz = maxOff + maxJ + 500;   // +500 Hz margin for the multiplet
  return { dwell, viewHz };
}

// Largest |J| (Hz) across a molecule's coupling matrix.
export function maxAbsJHz(mol) {
  let mx = 0;
  const n = mol.nuclei.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      mx = Math.max(mx, Math.abs(mol.J[i][j]));
  return mx;
}

export { SPINQ3, DMP, CHLOROFORM, ALANINE, CROTONIC };
