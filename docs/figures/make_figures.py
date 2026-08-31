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

print("done ->", OUT)
