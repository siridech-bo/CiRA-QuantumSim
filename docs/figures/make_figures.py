#!/usr/bin/env python3
"""
make_figures.py — publication figures for the robust-MS-gate manuscript
(docs/robust-ms-gate-manuscript.md). Reproduces the E1–E3 trade-off results.

Data are the committed outputs of src/ion-pipeline.js (single-mode ⁴⁰Ca⁺, η=0.1,
δ≡1, K=1; rates in units of δ). Re-emit with the pipeline to refresh. Run:

    python docs/figures/make_figures.py     # → Fig3/Fig4/Fig5 .png (+ .pdf)
"""
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

plt.rcParams.update({
    "font.size": 10, "font.family": "serif", "mathtext.fontset": "cm",
    "axes.linewidth": 0.8, "figure.dpi": 150, "savefig.dpi": 300, "savefig.bbox": "tight",
})
OUT = Path(__file__).parent
C_SINGLE, C_GBC, C_ACC = "#c0392b", "#2471a3", "#117a4d"


def save(fig, name):
    fig.savefig(OUT / f"{name}.png"); fig.savefig(OUT / f"{name}.pdf")
    print("wrote", name)


# ---- Fig 1 — toolchain schematic (design -> verify -> sweep) ----
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
fig, ax = plt.subplots(figsize=(6.6, 2.6)); ax.set_xlim(0, 100); ax.set_ylim(0, 40); ax.axis("off")


def box(x, y, w, h, title, sub, fc):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6,rounding_size=1.5",
                                fc=fc, ec="#333", lw=1.0))
    ax.text(x + w / 2, y + h * 0.62, title, ha="center", va="center", fontsize=8.5, fontweight="bold")
    ax.text(x + w / 2, y + h * 0.26, sub, ha="center", va="center", fontsize=6.8, color="#333")


def arrow(x1, y1, x2, y2, lbl=""):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=11,
                                 color="#555", lw=1.1, shrinkA=2, shrinkB=2))
    if lbl:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 2.2, lbl, ha="center", fontsize=6.5, color="#555", style="italic")


box(1, 22, 17, 13, "ion-modes", "Coulomb chain\n$\\{\\omega_m, b^m_j\\}$", "#eef3f8")
box(24, 22, 20, 13, "ion-msn(-shape)", "analytic designer (U1)\n$\\Theta,\\alpha_m$; robust $\\Omega(t)$", "#e9f2ec")
box(24, 3, 20, 13, "ion-gbc", "asym. error + GBC (U2)\n$4{\\times}4$, $\\varepsilon^2{\\to}\\varepsilon^4$", "#f6eee9")
box(51, 13, 20, 13, "ion-ms", "Lindblad verifier (U3)\nshaped $\\Omega(t)$, $\\Delta\\omega$, noise", "#eef3f8")
box(78, 13, 20, 13, "ion-pipeline", "design->verify->sweep (U4)\ntrade-off map", "#e9f2ec")
arrow(18, 28.5, 24, 28.5)
arrow(45, 25.5, 51, 21.5); ax.text(48.5, 25.0, "$\\Omega(t)$", ha="center", fontsize=6.5, color="#555", style="italic")
arrow(45, 10.5, 51, 15.0); ax.text(48.5, 10.4, "$\\varepsilon^4$", ha="center", fontsize=6.5, color="#555", style="italic")
arrow(71, 19.5, 78, 19.5)
ax.text(50, 37.5, "Fig. 1 — toolchain: analytic design ($O(M)$)  →  open-system verify  →  noise sweep",
        ha="center", fontsize=9)
save(fig, "Fig1_toolchain")

# ---- Fig 1 (Option A, v2.1) — two robustness-axis recast -------------------
# Design stage now shows BOTH robustness families on orthogonal error axes:
#   symmetric (motional) axis  -> ion-msn-shape (AM waveform) + ion-smooth (AESE)
#   asymmetric (center-line)   -> ion-gbc (GBC)
# both feeding one open-system verifier, then the sweep driver.
fig, ax = plt.subplots(figsize=(7.2, 3.5)); ax.set_xlim(0, 100); ax.set_ylim(0, 46); ax.axis("off")
C_SYM, C_ASYM = "#eaf2fb", "#fbeee8"   # symmetric-axis / asymmetric-axis tints
# chain
box(1, 18, 14, 10, "ion-modes", "Coulomb chain\n$\\{\\omega_m,b^m_j\\}$", "#eef3f8")
# symmetric (motional) axis — two design methods
box(20, 32, 21, 9.5, "ion-msn-shape", "AM robust $\\Omega(t)$ (U1)\nclose $\\alpha_m$, $\\partial_\\delta\\alpha{=}0$", C_SYM)
box(20, 20.5, 21, 9.5, "ion-smooth", "smooth gate / AESE\nadiabatic $\\delta(t)$ ramp", C_SYM)
# asymmetric (center-line) axis
box(20, 6, 21, 9.5, "ion-gbc", "center-line $\\sigma_z$ + GBC (U2)\n$\\varepsilon^2\\!\\to\\!\\varepsilon^4$", C_ASYM)
# verifier + sweep
box(48, 18, 22, 12, "ion-ms / -mm", "open-system Lindblad (U3)\nshaped $\\Omega(t)$, $\\Delta\\omega$, heating", "#eef3f8")
box(77, 18, 22, 12, "ion-pipeline", "design$\\to$verify$\\to$sweep (U4)\ntrade-off + smooth$\\times$GBC map", "#e9f2ec")
ax.text(59, 15.2, "$+$ ion-ms-exact: non-RWA / beyond-LD bound", ha="center", fontsize=6.3, color="#777", style="italic")
# axis grouping labels
ax.text(30.5, 43.4, "symmetric (motional) axis", ha="center", fontsize=7.3, color="#2f6fb0", fontweight="bold")
ax.text(30.5, 3.4, "asymmetric (center-line) axis", ha="center", fontsize=7.3, color="#b5651d", fontweight="bold")
# arrows: chain -> each design box
arrow(15, 25, 20, 36.5); arrow(15, 23.5, 20, 25.2); arrow(15, 22, 20, 10.7)
# design -> verifier (converging)
arrow(41, 36.5, 48, 26); ax.text(45, 33.0, "$\\Omega(t)$", ha="center", fontsize=6.3, color="#555", style="italic")
arrow(41, 25.2, 48, 24)
arrow(41, 10.7, 48, 22); ax.text(45, 13.6, "$\\varepsilon^4$", ha="center", fontsize=6.3, color="#555", style="italic")
arrow(70, 24, 77, 24)
ax.text(50, 45, "Fig. 1 (v2.1) — two robustness axes: symmetric shaping (AM / smooth-AESE) "
        "$\\;\\oplus\\;$ asymmetric GBC  $\\to$  one open-system verifier  $\\to$  combining map",
        ha="center", fontsize=8)
save(fig, "Fig1_toolchain_v2")

# ---- Fig 2 — closed-system validation (B1 engine agreement, B2 ε²->ε⁴) ----
fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.6, 2.7))
# B2: coherent scaling, uncompensated ~ε² vs GBC ~ε⁴ (U2 data)
eps = np.array([0.02, 0.04, 0.08, 0.16])
unc = np.array([1.297e-4, 5.186e-4, 2.073e-3, 8.262e-3])
gbc = np.array([1.370e-8, 2.191e-7, 3.498e-6, 5.556e-5])
a1.loglog(eps, unc, "o", color=C_SINGLE, label="uncompensated")
a1.loglog(eps, gbc, "s", color=C_GBC, label="GBC")
a1.loglog(eps, unc[0] * (eps / eps[0])**2, "--", color=C_SINGLE, lw=0.8, alpha=0.7, label="$\\propto\\varepsilon^2$")
a1.loglog(eps, gbc[0] * (eps / eps[0])**4, "--", color=C_GBC, lw=0.8, alpha=0.7, label="$\\propto\\varepsilon^4$")
a1.set_xlabel("$\\varepsilon=\\Delta\\omega\\,\\tau$"); a1.set_ylabel("infidelity $1-F$")
a1.legend(frameon=False, fontsize=7, loc="lower right"); a1.grid(True, which="both", alpha=0.15)
a1.set_xticks([0.02, 0.05, 0.1]); a1.set_xticklabels(["0.02", "0.05", "0.1"]); a1.minorticks_off()
a1.set_title("(a) GBC: $\\varepsilon^2\\!\\to\\!\\varepsilon^4$", fontsize=9)
# B1: numeric (Lindblad) vs analytic (4x4) Bell fidelity agree across Δω (U3 cross-check)
dwv = np.array([0.005, 0.010, 0.020])
num = np.array([0.999688, 0.998757, 0.995052])
ana = np.array([0.999600, 0.998401, 0.993622])
a2.plot(dwv, 1 - ana, "-", color="#888", lw=3, alpha=0.5, label="analytic $4{\\times}4$ (U2)")
a2.plot(dwv, 1 - num, "o", color=C_GBC, ms=5, label="numeric Lindblad (U3)")
a2.set_xlabel("$\\Delta\\omega$ (units of $\\delta$)"); a2.set_ylabel("infidelity $1-F$")
a2.legend(frameon=False, fontsize=7); a2.grid(True, alpha=0.15)
a2.set_title("(b) numeric $\\leftrightarrow$ analytic", fontsize=9)
fig.suptitle("Fig. 2 — closed-system validation", fontsize=9, y=1.02)
fig.tight_layout()
save(fig, "Fig2_validation")


# ---- Fig 3 — E1: incoherent baseline (Δω=0), single vs GBC vs heating κ ----
kappa = np.array([2e-3, 5e-3, 1e-2, 2e-2])
e1_single = np.array([9.291e-3, 2.274e-2, 4.395e-2, 8.231e-2])
e1_gbc = np.array([3.600e-2, 8.423e-2, 1.521e-1, 2.542e-1])
fig, ax = plt.subplots(figsize=(3.4, 2.7))
ax.loglog(kappa, e1_single, "o-", color=C_SINGLE, label="single robust gate ($\\tau$)")
ax.loglog(kappa, e1_gbc, "s-", color=C_GBC, label="GBC sequence ($\\approx\\!4\\tau$)")
ax.loglog(kappa, 4 * e1_single, "--", color="gray", lw=0.9, label="$4\\times$ single")
ax.set_xlabel("heating rate $\\kappa$ (units of $\\delta$)")
ax.set_ylabel("infidelity $1-F$  ($\\Delta\\omega=0$)")
ax.legend(frameon=False, fontsize=8); ax.grid(True, which="both", alpha=0.15)
ax.set_title("E1 — incoherent cost of GBC's gate time", fontsize=9)
save(fig, "Fig3_E1_incoherent")

# ---- Fig 4 — E2: trade-off curve (fixed noise), single ∝ Δω² vs GBC flat ----
dw = np.arange(0, 0.0601, 0.005)
e2_single = np.array([2.162, 2.200, 2.298, 2.456, 2.672, 2.947, 3.280,
                      3.669, 4.114, 4.614, 5.167, 5.772, 6.429]) * 1e-2
e2_gbc = np.array([8.205, 8.205, 8.205, 8.206, 8.207, 8.210, 8.215,
                   8.224, 8.238, 8.258, 8.285, 8.321, 8.368]) * 1e-2
xcross = 0.070
fig, ax = plt.subplots(figsize=(3.4, 2.7))
ax.plot(dw, e2_single * 1e2, "o-", color=C_SINGLE, ms=4, label="single robust ($\\propto\\Delta\\omega^2$)")
ax.plot(dw, e2_gbc * 1e2, "s-", color=C_GBC, ms=4, label="GBC ($\\varepsilon^4$ + $4\\tau$ incoh.)")
ax.axvline(xcross, color=C_ACC, ls=":", lw=1.2)
ax.text(xcross, 3.0, "  $\\Delta\\omega^\\times\\!\\approx\\!0.07$", color=C_ACC, fontsize=8, va="center")
ax.set_xlabel("asymmetric error $\\Delta\\omega$ (units of $\\delta$)")
ax.set_ylabel("infidelity $1-F$  ($\\times 10^{-2}$)")
ax.legend(frameon=False, fontsize=8, loc="center left"); ax.grid(True, alpha=0.15)
ax.set_title("E2 — trade-off curve  ($\\kappa\\!=\\!3\\!\\times\\!10^{-3}$)", fontsize=9)
save(fig, "Fig4_E2_tradeoff")

# ---- Fig 5 — E3: crossover Δω× vs incoherent floor, with √I scaling ----
I_incoh = np.array([1.41e-3, 3.28e-3, 6.99e-3, 1.38e-2, 2.71e-2])   # single-gate incoherent
cross = np.array([0.015, 0.025, 0.045, 0.055, 0.085])
fig, ax = plt.subplots(figsize=(3.4, 2.7))
ax.plot(I_incoh, cross, "D-", color=C_ACC, ms=5, label="crossover $\\Delta\\omega^\\times$")
xf = np.linspace(I_incoh[0] * 0.8, I_incoh[-1] * 1.2, 50)
k = cross[2] / np.sqrt(I_incoh[2])
ax.plot(xf, k * np.sqrt(xf), "--", color="gray", lw=0.9, label="$\\propto\\sqrt{I_{\\rm incoh}}$")
ax.set_xscale("log")
ax.set_xlabel("single-gate incoherent floor $I_{\\rm incoh}$")
ax.set_ylabel("crossover $\\Delta\\omega^\\times$ (units of $\\delta$)")
ax.fill_between(xf, 0, k * np.sqrt(xf), color=C_SINGLE, alpha=0.06)
ax.fill_between(xf, k * np.sqrt(xf), 0.11, color=C_GBC, alpha=0.06)
ax.text(2e-3, 0.02, "single wins", color=C_SINGLE, fontsize=8)
ax.text(6e-3, 0.095, "GBC wins", color=C_GBC, fontsize=8)
ax.set_ylim(0, 0.11)
ax.legend(frameon=False, fontsize=8, loc="upper left"); ax.grid(True, which="both", alpha=0.15)
ax.set_title("E3 — where GBC pays off vs trap noise", fontsize=9)
save(fig, "Fig5_E3_crossover")

# ---- Fig 6 (v2.1) — smooth gate × GBC: win-map + filter function (E7) ------
# Data: docs/figures/smooth_data.json, emitted by export_smooth_data.mjs from the
# validated ion-smooth engine (playground defaults: δ_max=18, τ_d=40, n̄=3, κ=γ_φ=1e-4).
import json
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch
_sd_path = OUT / "smooth_data.json"
if _sd_path.exists():
    sd = json.loads(_sd_path.read_text())
    SCH_C = {"plain": "#8b949e", "smooth": "#4A90D9", "gbc": "#FF8C00", "smoothGbc": "#50C878"}
    SCH_L = {"plain": "plain (DESE)", "smooth": "smooth (AESE)", "gbc": "GBC", "smoothGbc": "smooth+GBC"}
    names = sd["names"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.2, 2.9))
    # (a) win-map over (Δδ, Δω)
    cmap = ListedColormap([SCH_C[n] for n in names])
    wm = np.array(sd["winMap"])                      # [iy][ix], iy=0 is smallest Δω
    a1.imshow(wm, origin="lower", aspect="auto", cmap=cmap, vmin=0, vmax=len(names) - 1,
              extent=[0, sd["params"]["DD_MAX"], 0, sd["params"]["DW_MAX"]], interpolation="nearest", alpha=0.9)
    a1.set_xlabel("$\\Delta\\delta$  mode-frequency (symmetric) error")
    a1.set_ylabel("$\\Delta\\omega$  center-line (asymmetric)")
    a1.set_title("(a) which scheme wins", fontsize=9)
    present = [names[i] for i in np.unique(wm)]
    a1.legend(handles=[Patch(fc=SCH_C[n], label=SCH_L[n]) for n in present],
              frameon=False, fontsize=6.6, loc="upper left")
    # (b) filter function F(ω), DESE vs AESE
    fD, fS = sd["filterD"], sd["filterS"]
    a2.loglog([p["x"] for p in fD], [p["y"] for p in fD], "-", color=SCH_C["plain"], lw=1.8, label="constant-$\\delta$ (DESE)")
    a2.loglog([p["x"] for p in fS], [p["y"] for p in fS], "-", color=SCH_C["smooth"], lw=1.8, label="smooth (AESE)")
    a2.set_xlabel("$\\omega$  mode-freq-noise frequency (units of $\\delta_{\\min}$)")
    a2.set_ylabel("filter $F(\\omega)$  sensitivity")
    a2.set_title("(b) motional-noise filter", fontsize=9)
    a2.legend(frameon=False, fontsize=7, loc="lower right"); a2.grid(True, which="both", alpha=0.15)
    sc = sd["scalars"]
    fig.suptitle("Fig. 6 — smooth$\\times$GBC: orthogonal robustness axes  "
                 "($\\tau_s/\\tau_p\\!=\\!%.0f$, AESE suppression $\\sim\\!%.0f\\times$)"
                 % (sd["tau"]["ratio"], sc["suppression_at_dd0p02"]), fontsize=8.5, y=1.03)
    fig.tight_layout()
    save(fig, "Fig6_smooth_gbc")
else:
    print("skip Fig6 — run:  node docs/figures/export_smooth_data.mjs")

print("done ->", OUT)
