# Trapped-Ion Physics — Verified Constants & Conventions (Substrate 3)

Source-of-truth for `src/ion.js` and `test/ion.test.mjs`. Every value here is either backed by
a primary source (adversarially verified in a deep-research pass) or independently recomputed.
**No number enters the code without a citation here** — same discipline as the NMR molecule
parameters. Where sources differ, the **hardcoded convention** is stated explicitly.

Primary sources: **Wineland et al., J. Res. NIST 103, 259 (1998)** [W98]; **Meekhof et al.,
PRL 76, 1796 (1996)** [M96]; **Steane, Appl. Phys. B 64, 623 (1997) / quant-ph/9608011** [S97];
**James, Appl. Phys. B 66, 181 (1998)** [J98]; **Leibfried–Blatt–Monroe–Wineland, RMP 75, 281
(2003)** [RMP]; **Sørensen & Mølmer, PRL 82, 1971 (1999) & PRA 62, 022311 (2000)** [SM].

---

## 1. Lamb–Dicke parameter — HIGH confidence [W98, S97]
```
η = |k| cosθ · x0 = k·z0 = cosθ·√(E_R/ħω_z),   x0 = z0 = √(ħ/2 m ω_z),  E_R = (ħk)²/2m
```
Compute η in-app from λ, m, ω_z (spec §2.8) — do not hardcode the bare number.
Verified numeric (recomputed independently, matches research):

| System | λ | ω_z/2π | x0 | η |
|---|---|---|---|---|
| ⁴⁰Ca⁺ 729 nm (S₁/₂–D₅/₂) | 729 nm | 1.0 MHz | 11.24 nm | **0.097** |
| ⁴⁰Ca⁺ 397 nm (S₁/₂–P₁/₂) | 397 nm | 1.0 MHz | 11.24 nm | **0.178** |
| ⁹Be⁺ (NIST) | — | ~11 MHz | ~7 nm | ~0.20 |

Convention: cosθ (geometric projection) is folded into the axial component of **k**; for a
Raman/two-photon drive **k** means the effective Δk. COM mode of an N-ion string scales the
coupling by **1/√N** (effective mass Nm).

## 2. Laser–ion coupling on the Fock basis (EXACT) — HIGH [W98 Eq.18/70, Cahill–Glauber]
```
⟨n+s | D(iη) | n⟩ = e^(−η²/2) (iη)^s √(n!/(n+s)!) L_n^(s)(η²)
Ω_{n,n+s} = Ω₀ · e^(−η²/2) · η^|s| · √(n<!/n>!) · L_{n<}^{|s|}(η²)     (n< = min, n> = max)
```
This is the **default coupling path** (spec §2.2–2.3). Generalized Laguerre `L` by upward
recurrence, carry √(n<!/n>!) as an incremental product (factorial closed form overflows above
n≈20 — W98/spec both warn). Cache the matrix; invalidate on η change.
**Debye–Waller caution:** apply `e^(−η²/2)` EITHER inside the exact element OR as a separate
carrier factor — never both (double-counting).

## 3. Lamb–Dicke-limit Rabi frequencies + dark state — HIGH (most-corroborated, 7 claims) [W98, M96, RMP]
Sign convention (uniform across all primary sources — **hardcode this**):
- **carrier** δ=0: `Ω_{n,n} = Ω` (exact `Ω·e^(−η²/2)`; first order `Ω(1−η²n)`), motion unchanged.
- **red sideband** δ=−ω_z: `|↓,n⟩→|↑,n−1⟩` at `Ω_{n,n−1} = ηΩ√n`  ⇒ Jaynes–Cummings `η(σ⁺a + a†σ⁻)`.
- **blue sideband** δ=+ω_z: `|↓,n⟩→|↑,n+1⟩` at `Ω_{n,n+1} = ηΩ√(n+1)` ⇒ anti-JC `η(a†σ⁺ + aσ⁻)`.
- **|↓,0⟩ is DARK on the red sideband** (√0 = 0) — sharp, unit-testable (`P_e < 1e-10`), and it
  is the same physics that makes ground-state cooling detectable. M96 measured √(n+1) at η=0.202.

This confirms the spec's `jc.js` reuse thesis exactly: red sideband = JC, blue = anti-JC.

## 4. Lamb–Dicke validity + where 'ld' breaks — HIGH [W98]
Regime condition: `η²⟨(a+a†)²⟩ = η²(2n+1) ≪ 1`. At **η=0.5, n=10 → η²(2n+1)=5.25 ≫ 1** ⇒ the
linearized `ηΩ√n` form breaks down entirely (assert `'exact'` vs `'ld'` diverge >10% here;
assert they agree <1% for η²(2n+1)<0.1). The exact Laguerre element (§2) is valid in all regimes.

## 5. Motional heating (thermal bath) — HIGH [W98 Eq.62]
```
L₋ = √(κ(n̄_bath+1)) a ,   L₊ = √(κ n̄_bath) a† ,   dn̄/dt = κ n̄_bath  (no drive)
```
Ground-state escape time `t* = 1/(n̄κ)`. Expose the user parameter as the heating rate
`dn̄/dt` in **quanta/s** (what experimentalists quote). Matches spec §2.5 verbatim.

## 6. Doppler cooling limit — HIGH [S97, W98] — ⚠ FACTOR-OF-2 CONVENTION
```
k_B T_D = ħΓ/2   (HARDCODE THIS: total-energy form, at δ = −Γ/2)
```
Do **NOT** use `ħΓ/4k_B` (the kinetic-energy form in W98 Eq.106) — a competing claim using it was
refuted here; mixing them is a factor-of-2 bug. Requires resolved-sideband condition `Γ ≪ ω_z`.
Verified for ⁴⁰Ca⁺ 397 nm (Γ/2π = 21.6 MHz) at ω_z/2π = 1 MHz (recomputed independently):
**T_D = 0.518 mK**, `n̄ = k_B T_D/ħω_z = Γ/2ω_z = 10.8`.

## 7. Resolved-sideband cooling floor — HIGH [W98, S97 Eq.28] — ⚠ O(1) PREFACTOR AMBIGUITY
Red-detuned δ=−ω_z, requires ω_z ≫ Γ. Leading form (hardcode for the assertion):
```
n̄_min ≈ (Γ_eff / 2ω_z)²        ⇒  n̄_min = 0.25 (Γ_eff/ω_z)²
```
Full single-beam forms differ by an O(1) recoil/geometry prefactor: `5Γ²/16ω_z²` (=0.3125),
or `13Γ²/80ω_z²` (=0.1625, with dipole α≈2/5). **Assert the SCALING `∝ (Γ_eff/ω_z)²` and the
BOUND (n̄<0.01 for Γ_eff/ω_z=0.1), NOT the exact prefactor** — the coefficient is convention-
dependent and would make the test brittle (spec §6.14 already says this). `Γ_eff = Γ` for a bare
narrow transition; for a quench/Raman scheme it is the effective broadened linewidth (spec §2.9).

## 8. Mølmer–Sørensen gate — HIGH [SM, Monroe notes, Azuma preprint] — ⚠ convention flags
Bichromatic drive symmetric about the qubit: `ω₁,₂ = ω_eg ∓ δ̃`, `δ̃ = ν + Δν`, `|Δν/ν| ≪ 1`.
Geometric loop-closing convention (use this, matches spec §M7):
```
τ_g = 2πK/δ ,   ηΩ = δ/(2√K)   (K = integer # of phase-space loops)
```
At loop closure: Bell state `(|gg⟩ + i|ee⟩)/√2` (global phase `e^(−iπ/4)`), residual spin–motion
entanglement → 0, fidelity → 1. Mis-set δ ⇒ loop fails to close, fidelity drops (spec §6.16).
Flags: dispersive period `T_MS = πΔν/(2η²Ω²)` (equivalent parametrization); `χ=(ηΩ)²/Δν` vs
`(ηΩ)²/(2Δν)` differ by 2 across sources; the i-sign/global phase are detuning-sign conventions.
**Hardcode one detuning sign + one χ convention.**

## 9. Coulomb normal modes — HIGH [J98]
Axial COM mode = **ω_z for any N** (exact, N-independent). Two-ion axial **stretch = √3 ω_z**.
Two-ion equilibrium spacing (from J98 directly — see §Open below):
```
d = (e² / (2πε₀ m ω_z²))^(1/3)
```

## Convention lock (single self-consistent set — hardcode all of these)
1. Doppler: `T_D = ħΓ/2k_B` (total energy), never `ħΓ/4`.
2. η: cosθ folded into axial |k|; Raman ⇒ effective Δk.
3. Sidebands: red = δ=−ω_z (lowers n), blue = δ=+ω_z (raises n).
4. Sideband-cooling: assert scaling `(Γ_eff/2ω_z)²` + bound, not the O(1) prefactor.
5. MS: one detuning sign, one χ; treat Bell global phase/i-sign as convention.
6. Debye–Waller `e^(−η²/2)`: inside the Laguerre element OR a separate carrier factor, not both.

## ⚠ OPEN / not pinned by this research pass — source before unit-testing
- **Recoil-kernel spontaneous emission** (spec §2.5): ✅ **NOW RESOLVED** — see
  [`docs/ion-recoil-kernel-physics.md`](ion-recoil-kernel-physics.md). A dedicated research pass
  pinned it: exact dissipator RMP Eq. 87–88 with dipole pattern Y(z)=3(1+z²)/4, three-operator
  O(η̃²) form `c₀=√(Γ(1−2ξη̃²))σ⁻, c±=√(Γξη̃²)σ⁻a^(†)`, and the disputed **ξ is
  orientation-dependent: (2−cos²θₐ)/5 = 1/5 (π ∥ z), 2/5 (σ ⊥ z, default), 1/3 (iso)** — the
  earlier "refutation" had computed the parallel case. η̃ (emitted 397 nm photon) is kept
  separate from the drive η. Phase 1 still ships the motion-preserving form; the kernel is added
  in Phase 2c behind a `recoil:'kernel'` toggle, as a prerequisite for M4 (Doppler).
- **Paul-trap Mathieu** (spec M1): `q ≈ 0.908` (β=1 boundary, a=0) and
  `ω_sec ≈ (ω_RF/2)√(a + q²/2)` were not covered by a surviving claim — standard textbook, but
  source from Ghosh *Ion Traps* or RMP §II before asserting.
- **Two-ion spacing** `d = (e²/2πε₀mω_z²)^(1/3)`: companion mode freqs (ω_z, √3ω_z) are verified;
  confirm the spacing prefactor directly from J98.

## Net effect on the Phase-1 plan
Items 1–8 (the whole flagship `ion.js` + M3 + M5 path) are primary-source-verified. The only
Phase-1-relevant caution is the recoil kernel → start with motion-preserving spontaneous
emission (already the recommended Phase-1 choice). Paul trap (M1) and the spacing prefactor are
Phase-2, and have clear textbook sources to pin before they ship.
