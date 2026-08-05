// =============================================================================
// wigner.js — exact Wigner function of a (truncated) bosonic density matrix in
// the Fock basis, via the standard Cahill–Glauber / associated-Laguerre kernel.
//
// For a density matrix ρ expressed in the number basis {|n⟩}, the Wigner
// function at a phase-space point α = (x + i p)/√2 is
//
//   W(x,p) = (2/π) Σ_{m,n} ρ_{m,n} W_{n,m}(α)
//
// where W_{n,m}(α) are the Fock-basis Wigner "matrix elements". Using the
// associated Laguerre form (Cahill & Glauber, Phys. Rev. 177, 1882 (1969)),
// for n ≥ m:
//
//   W_{n,m}(α) = (2/π) (−1)^m √(m!/n!) (2α*)^{n−m} e^{−2|α|²} L_m^{(n−m)}(4|α|²)
//
// and W_{m,n} = conj(W_{n,m}). ρ is Hermitian, so the double sum is real.
//
// Here we adopt the convention X = (a+a†)/√2, P = (a−a†)/(i√2) (matches jc.js),
// i.e. α = (x + i p)/√2, so |α|² = (x²+p²)/2. With this normalization the
// vacuum |0⟩ gives W(x,p) = (1/π) e^{−(x²+p²)}, a Gaussian of unit integral.
//
// Validated (see test/jc.test.mjs): ∫W dx dp ≈ 1; vacuum → positive Gaussian at
// the origin (no negativity); Fock |1⟩ → NEGATIVE at the origin (W(0,0) < 0).
// =============================================================================

// Real prefactor kernel c_{n,m}(r²) = (−1)^m √(m!/n!) · (2)^{(n−m)/2}·? — we
// fold the α-power magnitude/phase in at evaluation time. We precompute, per
// (n,m) with n≥m, the constant K_{n,m} = (−1)^m √(m!/n!) and evaluate the rest
// (the (2α*)^{n−m} factor and the Laguerre polynomial) numerically per grid
// point. This is O(Nc²) per grid point — fine for Nc≈15 on a 60×60 grid.

// Associated Laguerre polynomial L_k^{(a)}(x) via the stable recurrence:
//   L_0^{(a)} = 1
//   L_1^{(a)} = 1 + a − x
//   (k+1)L_{k+1}^{(a)} = (2k+1+a−x)L_k^{(a)} − (k+a)L_{k−1}^{(a)}
function laguerre(k, a, x) {
  if (k === 0) return 1;
  let Lkm1 = 1;                 // L_0
  let Lk = 1 + a - x;           // L_1
  for (let i = 1; i < k; i++) {
    const Lkp1 = ((2 * i + 1 + a - x) * Lk - (i + a) * Lkm1) / (i + 1);
    Lkm1 = Lk;
    Lk = Lkp1;
  }
  return Lk;
}

// Precompute K_{n,m} = (−1)^m √(m!/n!) for 0 ≤ m ≤ n < Nc.
function buildKtable(Nc) {
  // log-factorials for stability.
  const logf = new Float64Array(Nc + 1);
  for (let i = 2; i <= Nc; i++) logf[i] = logf[i - 1] + Math.log(i);
  const K = [];
  for (let n = 0; n < Nc; n++) {
    K[n] = new Float64Array(n + 1);
    for (let m = 0; m <= n; m++) {
      const sign = (m % 2 === 0) ? 1 : -1;
      // √(m!/n!) = exp( (logf[m] − logf[n]) / 2 )
      K[n][m] = sign * Math.exp(0.5 * (logf[m] - logf[n]));
    }
  }
  return K;
}

// Evaluate W at a single (x,p) from a flat Nc×Nc [re,im] boson density matrix.
//   rhoB : Float64Array length 2·Nc·Nc, interleaved [re,im], row-major.
//   Returns the real Wigner value W(x,p).
//
// Convention (matches jc.js quadratures X=(a+a†)/√2, P=(a−a†)/(i√2), [X,P]=i):
// complex phase-space point α = (x + i p)/√2, and the Wigner function normalized
// so ∫W dx dp = 1. For a diagonal Fock state |n⟩ this reduces to the textbook
//   W_n(x,p) = (−1)^n/π · e^{−(x²+p²)} · L_n(2(x²+p²)),
// so vacuum → +1/π at origin and Fock |1⟩ → −1/π at origin.
//
// General (Cahill–Glauber, associated-Laguerre) form used here, for n ≥ m:
//   W'_{n,m}(α) = (1/π) K_{n,m} (2α*)^{n−m} e^{−2|α|²} L_m^{(n−m)}(4|α|²),
//   K_{n,m} = (−1)^m √(m!/n!),
//   W(x,p) = Σ_{m,n} ρ_{m,n} W'_{n,m}(α)  (real, since ρ and W' are Hermitian).
function wignerAt(rhoB, Nc, K, x, p) {
  // α = (x + i p)/√2 ; |α|² = (x²+p²)/2.
  const ax = x / Math.SQRT2, ap = p / Math.SQRT2;
  const abs2 = ax * ax + ap * ap;           // = (x²+p²)/2
  const expf = Math.exp(-2 * abs2);         // e^{−(x²+p²)}
  const L4 = 4 * abs2;                       // 2(x²+p²)
  // Phase term built incrementally as d increases. The imaginary sign is +2·ap
  // (not −2·ap) so the Wigner p-axis matches the physical momentum quadrature
  // P=(a−a†)/(i√2): the p-marginal of W then equals Tr(ρ·P). (Diagonal Fock
  // states are rotationally symmetric, so this sign doesn't affect their
  // negativity — only the p-orientation of asymmetric/driven states.)
  const two_astar_re = 2 * ax, two_astar_im = 2 * ap;

  const OIDX = (i, j) => 2 * (i * Nc + j);
  const invPi = 1 / Math.PI;

  let W = 0;
  // Sum over n ≥ m; add the (m,n) mirror via Hermiticity: for n>m the pair
  // ρ_{m,n} W'_{n,m} + ρ_{n,m} W'_{m,n} = 2 Re(ρ_{m,n} W'_{n,m}); the diagonal
  // n=m contributes ρ_{n,n} W'_{n,n} (real) once.
  for (let n = 0; n < Nc; n++) {
    for (let m = 0; m <= n; m++) {
      const d = n - m;                       // n − m ≥ 0
      // (2α*)^d : complex power.
      let pr = 1, pi = 0;
      for (let k = 0; k < d; k++) {
        const nr = pr * two_astar_re - pi * two_astar_im;
        const ni = pr * two_astar_im + pi * two_astar_re;
        pr = nr; pi = ni;
      }
      const lag = laguerre(m, d, L4);
      const kernel = invPi * K[n][m] * expf * lag;   // real scalar × (2α*)^d
      const wRe = kernel * pr, wIm = kernel * pi;

      // ρ_{m,n} (row m, col n).
      const idx = OIDX(m, n);
      const rRe = rhoB[idx], rIm = rhoB[idx + 1];

      if (d === 0) {
        W += rRe * wRe;                      // diagonal, real
      } else {
        W += 2 * (rRe * wRe - rIm * wIm);    // 2 Re(ρ_{m,n} W'_{n,m})
      }
    }
  }
  return W;
}

// -----------------------------------------------------------------------------
// wignerGrid(rhoBoson, { xmax, n }) → { W, x, p, min, xmax, n }
//   rhoBoson : flat Nc×Nc [re,im] (from JCReservoir.rhoBoson()); its Nc is read
//              from rhoBoson._Nc or inferred from length.
//   xmax     : half-width of the (symmetric) x,p window (default 5).
//   n        : grid resolution per axis (default 60).
// Returns W as a 2D array W[i][j] where i indexes p (rows), j indexes x (cols),
// plus the axis sample arrays, and min(W) (the negativity marker).
// -----------------------------------------------------------------------------
export function wignerGrid(rhoBoson, opts = {}) {
  const xmax = opts.xmax !== undefined ? opts.xmax : 5;
  const n = opts.n !== undefined ? opts.n : 60;
  const Nc = rhoBoson._Nc || Math.round(Math.sqrt(rhoBoson.length / 2));
  const K = buildKtable(Nc);

  const xs = new Float64Array(n), ps = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (n === 1) ? 0 : (i / (n - 1)) * 2 - 1;   // −1..1
    xs[i] = t * xmax;
    ps[i] = t * xmax;
  }

  const W = [];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) {          // rows = p
    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) {        // cols = x
      const w = wignerAt(rhoBoson, Nc, K, xs[j], ps[i]);
      row[j] = w;
      if (w < mn) mn = w;
      if (w > mx) mx = w;
    }
    W.push(row);
  }
  return { W, x: xs, p: ps, min: mn, max: mx, xmax, n };
}

// Numerical integral ∫∫ W dx dp over the grid (sum × cell area). Should ≈ 1 for
// a properly truncated ρ with enough window. Handy for validation.
export function wignerIntegral(grid) {
  const { W, xmax, n } = grid;
  if (n < 2) return NaN;
  const dx = (2 * xmax) / (n - 1);
  const cell = dx * dx;
  let s = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) s += W[i][j];
  return s * cell;
}
