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
  };
  return cache;
}

export function invalidatePlotColors() { cache = null; }
