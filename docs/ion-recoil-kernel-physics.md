# Spontaneous-Emission Recoil Kernel — Verified Physics (Substrate 3, Phase 2c)

Source-of-truth for the recoil-resolved spontaneous-emission dissipator in `src/ion.js` (the
piece deferred from Phase 1 because an earlier research pass could not pin the ξ factor). A
dedicated deep-research pass (19/25 claims verified) has now resolved it against primary
sources. **No coefficient enters the code without a citation here.** Companion to
[`docs/ion-physics-constants.md`](ion-physics-constants.md).

Primary sources: **Leibfried, Blatt, Monroe & Wineland, Rev. Mod. Phys. 75, 281 (2003)**
[RMP] Eqs. 87–88, 112; **Wallentowitz & Toschek, PRA 78, 043412 (2008)** [WT] (arXiv:0808.1272)
Eqs. 6–9, A4; **Stenholm, Rev. Mod. Phys. 58, 699 (1986)**; **Wineland & Itano, NIST TN 1124 /
PRA 20, 1521 (1979)**; **Phatak et al., PRA 110, 043116 (2024)** (arXiv:2406.19153) Eqs. 8–9, 38;
**Eschner, Morigi, Schmidt-Kaler & Blatt, JOSA B 20, 1003 (2003)**.

---

## The crux, resolved: ξ is orientation-dependent (why "2/5" was disputed)

The angular projection factor is **NOT a universal number**:
```
ξ = ⟨(n̂·ẑ)²⟩_dipole = (2 − cos²θₐ)/5
```
where θₐ is the angle between the transition **dipole** and the **motional (z) axis**:

| Geometry | Transition | Dipole pattern μ(s), s=cosθ | ξ |
|---|---|---|---|
| Dipole ∥ z | Δm=0 (π) | (3/4)(1−s²) | **1/5** |
| Dipole ⊥ z | Δm=±1 (σ) | (3/8)(1+s²) | **2/5** ← RMP default |
| Orientation-averaged | isotropic | — | **1/3** |

General normalized pattern (WT Eq. A4): `μ_a(s) = (3/8)[1 + cos²θₐ + s²(1 − 3cos²θₐ)]`.
**Resolution of the earlier "refutation":** 2/5 is the σ/perpendicular value (RMP's default,
`Y(z)=3(1+z²)/4`, citing Stenholm 1986); 1/5 is the π/parallel value. The prior pass computed
the parallel case and thought 2/5 wrong. Both are primary-sourced. **The spec's ξ≈2/5 is
correct for the perpendicular/σ geometry.** (HIGH confidence — WT Eq. A4, RMP, Eschner.)

## 1. Exact continuous dissipator — HIGH [RMP Eqs. 87–88]
```
L_d ρ = (Γ/2)(2 σ⁻ ρ̃ σ⁺ − σ⁺σ⁻ ρ − ρ σ⁺σ⁻)
ρ̃ = (1/2) ∫₋₁¹ dz  Y(z)  e^{i k x̂ z} ρ e^{−i k x̂ z},   Y(z) = 3(1+z²)/4,   k x̂ = η̃ (a+a†)
```
`Y(z)` = dipole angular distribution (σ default); `z=cosθ` = emission-direction projection on
the z axis; `k` = **emitted-photon** wavevector. Normalization `(1/2)∫₋₁¹ Y = 1`, `⟨z²⟩ = 2/5`
both check.

## 2. η̃ ≠ η (emitted photon vs drive) — HIGH [RMP text at Eq. 112, WT Eq. 9]
The emitted-photon Lamb-Dicke parameter `η̃ = k_emit·x₀` is **not** the drive `η`, "because the
emitted photon can go in any direction, not only along the wave vector of the cooling beam"
(RMP verbatim). **Hardcode η̃ as a separate emitted-photon parameter** tied to the emission
frequency (for ⁴⁰Ca⁺ cooling this is the 397 nm S₁/₂–P₁/₂ photon).

## 3. Minimal simulator-ready form (Lamb-Dicke O(η̃²)) — HIGH [RMP expanded; Phatak Eqs. 8–9]
Expanding `e^{i k x̂} ≈ 1 + i η̃ (a+a†)` (valid `η̃²(2n+1) ≪ 1`) gives exactly the **three-operator**
structure (the correct minimal reduction; the a, a† are **unnormalized** so `⟨n|a†a|n⟩=n`,
`⟨n|aa†|n⟩=n+1` produce the correct asymmetric down/up recoil rates):
```
c₀ = √(Γ (1 − 2 ξ η̃²)) · σ⁻ ⊗ I     (motion-preserving decay, Debye–Waller-reduced)
c₋ = √(Γ  ξ η̃²)        · σ⁻ ⊗ a      (recoil removes one phonon)
c₊ = √(Γ  ξ η̃²)        · σ⁻ ⊗ a†     (recoil adds one phonon)
```
This IS the spec §2.5 recoil kernel — now confirmed, with ξ set by geometry (§crux).

## 4. Resolved-sideband cooling floor — HIGH [RMP Eq. 112; Phatak Eq. 38]
```
n̄ ≈ (Γ̃/2ν)² [ (η̃/η)² + 1/4 ]        (ν ≫ Γ̃; bracket is O(1))
   = (1/4)(Γ/ν)² (α + 1/4)            (equivalent tweezer form, α = geometry constant)
```
The `(η̃/η)²` term is the recoil-heating contribution (magnitude set by ξ/geometry); the `1/4`
is the off-resonant carrier/counter-rotating term. Our existing Phase-1b test T14 asserts the
**scaling `(Γ_eff/2ω_z)²` + the bound**, which is consistent with this (the O(1) bracket is
exactly the convention-dependent prefactor we deliberately do NOT assert precisely).

## 5. Doppler limit from the same master equation — HIGH [NIST TN 1124; Stenholm]
Balancing recoil/momentum-diffusion heating vs friction: minimize
`⟨E⟩ = (1+α) ħ(γ₂²+Δ²)/(−4Δ)` over detuning → optimum **Δ = −γ₂ = −Γ/2**, and for α≈1
```
k_B T_D = ħγ₂ = ħΓ/2,   n̄ ≈ Γ/2ω_z   (Doppler limit)
```
Reproduces the already-verified `T_D = ħΓ/2k_B` (constants sheet §6). This is what M4 will use.

## ⚠ Convention lock — hardcode ONE self-consistent set
1. **Geometry/ξ:** pick the transition geometry and set ξ accordingly. **Default: σ / perpendicular
   ⇒ ξ = 2/5, Y(z)=3(1+z²)/4** (RMP default; matches the ⁴⁰Ca⁺ 397 nm cooling dipole and the
   spec). Expose the geometry as a labelled UI choice (π→1/5, σ→2/5, iso→1/3) since it changes
   the recoil heating.
2. **η̃ separate from η:** η̃ = emitted-photon LD parameter (397 nm), distinct from the drive η.
3. **Do NOT double-count:** the dipole-weighted ξ (2/5 family) and the "order-unity α" family
   (NIST: α≈1 for 1D, 1/3 isotropic; RMP text) are DIFFERENT accounting schemes for the same
   physics — use one, never both. We use the dipole-ξ three-operator form (item 3).
4. **Debye–Waller once:** the `(1 − 2ξη̃²)` in c₀ is the trace-preserving counter-term to the
   recoil operators; don't also apply a separate carrier reduction.

## Simulator implementation plan (Phase 2c → then M4)
- Add a `recoil: 'none' | 'kernel'` mode to `ion.js` spontaneous emission. `'none'` = the current
  motion-preserving `√Γ σ⁻⊗I` (Phase 1). `'kernel'` = the three operators above with a molecule/
  transition **geometry** (`'sigma'`=2/5 default, `'pi'`=1/5, `'iso'`=1/3) and a separate **η̃**.
- Tests (`test/ion.test.mjs`): (a) trace-preserving + CPTP (Σc†c consistent, Tr conserved);
  (b) with drive off, the recoil kernel alone heats from |g,0⟩ at the expected O(η̃²) rate and the
  up/down asymmetry gives the correct n, n+1 scaling; (c) the sideband-cooling floor with the
  kernel still obeys the `(Γ_eff/2ω_z)²` scaling + bound (don't assert the O(1) prefactor);
  (d) switching geometry π↔σ changes the recoil heating by the 1/5 vs 2/5 ratio.
- **M4 (Doppler)** then builds on the kernel: broad-linewidth (Γ≳ω_z) red-detuned cooling to the
  balance floor; assert `T_D = ħΓ/2k_B` at Δ=−Γ/2 within ~10%, and n̄≈Γ/2ω_z. Break-it: detune
  blue → heating.

## Provenance notes
- 6 of 25 verified claims were refuted — all were the parallel-vs-perpendicular ξ confusion or
  mis-attributed prefactors; the synthesis above is the reconciled, cross-checked set.
- Eschner JOSA B 2003 is paywalled at Optica; free copy at quantumoptics.at; its 2/5 dipole
  heating factor was corroborated via RMP 2003 and Stenholm 1986.
