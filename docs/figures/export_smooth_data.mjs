// =============================================================================
// export_smooth_data.mjs — dump the smooth×GBC (E7) figure data as JSON so
// make_figures.py can render Fig. 6 from REAL engine output (no hand-typed numbers).
// Parameters mirror the ion-smooth.html playground defaults exactly, so the paper
// figure and the interactive tool agree.  Run:
//     node docs/figures/export_smooth_data.mjs   # -> docs/figures/smooth_data.json
// =============================================================================
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContext, residualPair, filterFunction } from '../../src/ion-smooth.js';
import { coherentSingle, coherentGBC } from '../../src/ion-validation.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- playground defaults (ion-smooth-main.js) --------------------------------
const P = { deltaMax: 18, deltaMin: 1, tauD: 40, tauRamp: 3, tc: 0 };
const NOISE = { nbar: 3, kappa: 1e-4, gammaPhi: 1e-4 };   // kappa/gphi sliders =1 -> ×1e-4
const DW_MAX = 0.012, DD_MAX = 0.05;
const NX = 36, NY = 26;

const ctx = buildContext(P);
const NAMES = ['plain', 'smooth', 'gbc', 'smoothGbc'];

// exact schemes() with the same lookup-free coherent gates the engine uses
function schemes(c, { rP, rS }, { deltaOmega = 0, nbar = 0, kappa = 0, gammaPhi = 0 }) {
  const th = 2 * nbar + 1, symP = th * rP * rP, symS = th * rS * rS;
  const incP = kappa * c.excP * th + gammaPhi * c.tauP, incS = kappa * c.excS * th + gammaPhi * c.tauS;
  return {
    plain: symP + coherentSingle(deltaOmega * c.tauP) + incP,
    smooth: symS + coherentSingle(deltaOmega * c.tauS) + incS,
    gbc: symP + coherentGBC(deltaOmega * c.tauP) + 4 * incP,
    smoothGbc: symS + coherentGBC(deltaOmega * c.tauS) + 4 * incS,
  };
}
const winner = (v) => NAMES.reduce((b, k) => (v[k] < v[b] ? k : b), 'plain');

// --- Panel (a): win-map over (Δδ, Δω) ----------------------------------------
const resCols = [];
for (let ix = 0; ix < NX; ix++) { const dd = DD_MAX * (ix + 0.5) / NX; resCols.push({ dd, res: residualPair(ctx, dd, 900) }); }
const winMap = [];   // [iy][ix] -> scheme index
for (let iy = 0; iy < NY; iy++) {
  const dw = DW_MAX * (iy + 0.5) / NY, row = [];
  for (let ix = 0; ix < NX; ix++) row.push(NAMES.indexOf(winner(schemes(ctx, resCols[ix].res, { ...NOISE, deltaOmega: dw }))));
  winMap.push(row);
}

// --- Panel (b): filter function F(ω), DESE vs AESE ---------------------------
const ws = []; for (let e = -1.7; e <= 0.4; e += 0.05) ws.push(Math.pow(10, e));
const filterD = ws.map((w) => ({ x: w, y: Math.max(1e-14, filterFunction(ctx.dese, w, { N: 1400 })) }));
const filterS = ws.map((w) => ({ x: w, y: Math.max(1e-14, filterFunction(ctx.sm, w, { N: 1400 })) }));

// --- summary scalars quoted in the text --------------------------------------
// symmetric-axis suppression at a representative static drift, and thresholds.
function crossover(res, a, b, max = DW_MAX, N = 800) {
  const f = (dw) => { const v = schemes(ctx, res, { ...NOISE, deltaOmega: dw }); return v[a] - v[b]; };
  let prev = f(0), pdw = 0;
  for (let i = 1; i <= N; i++) { const dw = max * i / N, d = f(dw); if (prev < 0 && d >= 0) return pdw + prev / (prev - d) * (dw - pdw); prev = d; pdw = dw; }
  return null;
}
const resMid = residualPair(ctx, 0.02, 4000);
const suppression = resMid.rP / resMid.rS;      // DESE residual / AESE residual at Δδ=0.02
const filtRatioLow = filterD[0].y / filterS[0].y;

const out = {
  params: { ...P, ...NOISE, DW_MAX, DD_MAX, NX, NY },
  tau: { plain: ctx.tauP, smooth: ctx.tauS, ratio: ctx.tauS / ctx.tauP },
  excursion: { plain: ctx.excP, smooth: ctx.excS },
  winMap, names: NAMES,
  filterD, filterS,
  scalars: {
    suppression_at_dd0p02: suppression,
    filter_ratio_low_omega: filtRatioLow,
    thr_add_gbc_on_smooth: crossover(resMid, 'smooth', 'smoothGbc'),
    thr_add_gbc_on_plain: crossover(resMid, 'plain', 'gbc'),
    res_dese_dd0p02: resMid.rP, res_aese_dd0p02: resMid.rS,
  },
};
writeFileSync(join(HERE, 'smooth_data.json'), JSON.stringify(out, null, 1));
console.log('wrote smooth_data.json');
console.log('  tau_s/tau_p =', out.tau.ratio.toFixed(1));
console.log('  AESE spin-motion suppression @Δδ=0.02 =', suppression.toFixed(0), '×');
console.log('  filter ratio (low ω) DESE/AESE =', filtRatioLow.toExponential(2));
console.log('  add-GBC threshold on smooth Δω× =', out.scalars.thr_add_gbc_on_smooth?.toExponential(3));
console.log('  add-GBC threshold on plain  Δω× =', out.scalars.thr_add_gbc_on_plain?.toExponential(3));
