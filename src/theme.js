// Theme-aware plot colors. Canvas draw code reads these so the signal plots
// (FID, spectrum, histogram, heatmap) follow the app's light/dark theme.
// Values come from CSS custom properties on <html data-theme>; cached and
// invalidated on theme change via invalidatePlotColors().

let cache = null;

export function plotColors() {
  if (cache) return cache;
  const s = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (s.getPropertyValue(name).trim() || fallback);
  cache = {
    bg:     v('--plot', '#0a0d12'),
    line:   v('--plot-line', '#30363d'),
    text:   v('--plot-text', '#b6c2cf'),
    empty:  v('--plot-empty', '#21324a'),
    accent: v('--accent', '#4A90D9'),
    // JC / Wigner extras: a second trace color (quadrature) + the diverging
    // Wigner endpoints (negative ↔ zero ↔ positive). Zero maps to the plot bg.
    accent2:  v('--accent2', '#FF8C00'),
    wignerNeg: v('--wigner-neg', '#2b6cff'),   // blue  = negative (non-classical)
    wignerPos: v('--wigner-pos', '#ff3b5c'),   // red   = positive
    // Trapped-ion substrate (ion-levels.js / ion-traces.js). Additive keys — the
    // red/blue sideband families, carrier, ground/excited rungs, ghost trail.
    ionRed:     v('--ion-red', '#ff5c6c'),     // red sideband (RSB, δ=−ω_z)
    ionBlue:    v('--ion-blue', '#4aa3ff'),    // blue sideband (BSB, δ=+ω_z)
    ionCarrier: v('--ion-carrier', '#b98cff'), // carrier (δ=0)
    ionRungG:   v('--ion-rung-g', '#50C878'),  // ground-manifold rungs
    ionRungE:   v('--ion-rung-e', '#FF8C00'),  // excited-manifold rungs
    ionGhost:   v('--ion-ghost', '#5b6b7f'),   // ghost-trail rungs (~30 frames ago)
  };
  return cache;
}

export function invalidatePlotColors() { cache = null; }
