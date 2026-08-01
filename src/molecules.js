// =============================================================================
// molecules.js — the MOLECULE LIBRARY driving the n-spin quantum engine.
//
// Each Molecule is a plain data record describing a real (or teaching) NMR spin
// system: its nuclei (isotope, colors, display offset, T1/T2), the physical
// scalar J-coupling matrix (n×n symmetric, Hz, zero diagonal), and provenance.
// The engine (src/quantum.js) and gate compiler (src/gates.js) read EVERYTHING
// from a Molecule — no physics constants are hardcoded elsewhere.
//
// SCOPE (Phase 1): heteronuclear, weak-coupling ONLY. `addressing:'hetero'`,
// `couplingModel:'weak'`. Homonuclear systems + soft selective pulses + the full
// isotropic (flip-flop) J Hamiltonian are a LATER phase — see
// docs/multi-molecule-extension-plan.md §Phase 2. Do NOT add them here.
//
// DISPLAY-OFFSET CONVENTION (important): real heteronuclear rotating-frame
// offsets are 0 Hz (each nucleus sits on its own RF channel / carrier, on
// resonance). The app substitutes small DISPLAY offsets (offsetHz) so the Bloch
// vectors visibly precess in the 3D scene and the FID/spectrum show structure.
// These offsets are a VISUALIZATION parameter ONLY — the REAL physics (J, T1,
// T2) uses the verified literature numbers. Each molecule marks its offsets as
// display-only below.
//
// Molecule shape:
//   { id, name, description, field_T, addressing:'hetero', couplingModel:'weak',
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
// Registry + accessors.
// ---------------------------------------------------------------------------
const REGISTRY = [SPINQ3, DMP, CHLOROFORM];
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

// List all molecules with id, name, and qubit count (for the UI picker).
export function listMolecules() {
  return REGISTRY.map((m) => ({ id: m.id, name: m.name, n: m.nuclei.length }));
}

export { SPINQ3, DMP, CHLOROFORM };
