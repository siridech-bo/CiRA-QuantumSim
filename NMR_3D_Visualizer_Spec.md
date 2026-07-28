# NMR Spin Physics 3D Visualizer — Side Project Spec

**Priority:** Fun / educational side project. Not on the QRC research critical path.

**Goal:** Build a web-based 3D interactive visualizer that shows what ACTUALLY happens
inside an NMR quantum reservoir — real physics, not gate-model abstraction. Think
tkimhofer's NMR visualisation (https://tkimhofer.github.io/nmr_visualisation/) but
upgraded from single classical Bloch vector to multi-spin quantum density matrix with
J-couplings, matching our SPINQ Gemini Lab's 3-spin system.

**Why:** Nothing like this exists on the web. Current tools are either pretty but no
physics (bloch.kherb.io), or real physics but native apps (SpinDrops). A web tool with
real Lindblad physics + Three.js 3D would be unique and useful for teaching at KMITL.

---

## What to Build

A single-page web app with two panels:

**Left panel: 3D visualization (Three.js)**
- Three Bloch spheres arranged side by side, labeled ¹H, ³¹P, ¹⁹F
- Each sphere shows a magnetization vector (arrow) for that nucleus
- Vectors animate in real time: precession, relaxation, pulse response
- J-coupling lines between spheres (visual indicator of coupling strength)
- Color coding: H = blue, P = green, F = orange

**Right panel: Signal displays**
- FID signal trace (real + imaginary channels, scrolling in real time)
- Spectrum (live FFT of FID, updating as signal evolves)
- Small density matrix heatmap (4×4 for each 2-spin pair, or 8×8 for full 3-spin)

**Bottom: Control bar**
- Play / Pause / Reset buttons
- Speed slider (simulation time scale)
- RF pulse buttons: 90°x, 90°y, 180°x, custom angle
- Target nucleus selector: H only, P only, F only, all
- Encoding demo: slider for input value s → shows θ = arcsin(√s) → applies pulse
- Toggle: relaxation ON/OFF (see effect of T1/T2)
- Toggle: J-coupling ON/OFF (see effect of spin-spin interaction)
- τ slider: evolution time per step

---

## Physics Engine

### Option A: Python Backend (recommended — reuse existing code)

Use the existing `backend/app/qrc/system.py` as the physics engine:

```
Browser (Three.js) ←→ WebSocket ←→ FastAPI server ←→ system.py (QuTiP)
```

**Server streams state data to browser at ~30 fps:**
```json
{
  "t": 0.0023,
  "bloch_vectors": {
    "H": {"x": 0.45, "y": 0.32, "z": 0.83},
    "P": {"x": -0.12, "y": 0.67, "z": 0.72},
    "F": {"x": 0.78, "y": -0.21, "z": 0.58}
  },
  "fid": {"real": 0.034, "imag": -0.012},
  "density_matrix_real": [[...8x8...]],
}
```

**How to extract Bloch vectors from density matrix ρ:**
```python
# For spin k in an N-spin system:
# Bloch vector components = Tr(ρ · σ_k) for σ = σx, σy, σz
# where σ_k = I ⊗ ... ⊗ σ ⊗ ... ⊗ I (σ at position k)

import numpy as np
from qutip import sigmax, sigmay, sigmaz, identity, tensor

def bloch_vector(rho, spin_index, n_spins):
    ops = []
    for pauli in [sigmax(), sigmay(), sigmaz()]:
        op_list = [identity(2)] * n_spins
        op_list[spin_index] = pauli
        full_op = tensor(op_list)
        ops.append(np.real((rho * full_op).tr()))
    return {"x": ops[0], "y": ops[1], "z": ops[2]}
```

**Pros:** Real Lindblad physics, already validated, handles everything.
**Cons:** Requires Python server running, slight latency.

### Option B: JavaScript Physics (simpler deployment, less accurate)

Implement simplified Bloch equations directly in JavaScript for each spin:

```javascript
// Simplified 3-spin Bloch equations with J-coupling
class SpinSystem {
  constructor() {
    // SPINQ Gemini Lab parameters
    this.spins = [
      { name: '¹H', freq: 27.3e6, T1: 5.0, T2: 0.2, M: [0, 0, 1] },
      { name: '³¹P', freq: 11.0e6, T1: 4.5, T2: 0.15, M: [0, 0, 1] },
      { name: '¹⁹F', freq: 25.5e6, T1: 6.0, T2: 0.25, M: [0, 0, 1] },
    ];
    // J-couplings (Hz)
    this.J = { HP: 42, HF: 220, PF: 430 };
  }

  // Bloch equation step (rotating frame, per spin)
  step(dt) {
    for (let i = 0; i < 3; i++) {
      const s = this.spins[i];
      const [Mx, My, Mz] = s.M;

      // Precession (offset from rotating frame)
      const dw = 0; // in rotating frame, offset = 0 for on-resonance

      // Relaxation
      const dMx = -Mx / s.T2;
      const dMy = -My / s.T2;
      const dMz = (1.0 - Mz) / s.T1;

      // J-coupling effect (simplified: modulates precession frequency)
      // Full quantum treatment would need density matrix
      // This is approximate but visually correct for education

      s.M = [
        Mx + dMx * dt,
        My + dMy * dt,
        Mz + dMz * dt,
      ];
    }
  }

  // Apply RF pulse (rotation around specified axis)
  applyPulse(spinIndex, angle, axis = 'x') {
    const s = this.spins[spinIndex];
    const [Mx, My, Mz] = s.M;
    const c = Math.cos(angle), sin = Math.sin(angle);

    if (axis === 'x') {
      s.M = [Mx, My * c - Mz * sin, My * sin + Mz * c];
    } else if (axis === 'y') {
      s.M = [Mx * c + Mz * sin, My, -Mx * sin + Mz * c];
    }
  }

  // FID signal (sum of transverse components)
  fid() {
    let real = 0, imag = 0;
    for (const s of this.spins) {
      real += s.M[1]; // My
      imag += s.M[0]; // Mx
    }
    return { real, imag };
  }
}
```

**Pros:** Pure frontend, no server needed, instant deployment, GitHub Pages.
**Cons:** Classical Bloch only (no quantum entanglement, no density matrix,
J-coupling is approximate). Honest about limitation: this is Level 1-2 physics,
not Level 4 like our QRC simulator.

**Recommendation:** Start with Option B for quick results. Upgrade to Option A
later if it becomes a real project.

---

## 3D Rendering (Three.js)

### Bloch Sphere

```javascript
import * as THREE from 'three';

function createBlochSphere(radius = 1) {
  const group = new THREE.Group();

  // Wireframe sphere
  const sphereGeo = new THREE.SphereGeometry(radius, 32, 16);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0x444444, wireframe: true, transparent: true, opacity: 0.15
  });
  group.add(new THREE.Mesh(sphereGeo, sphereMat));

  // Axes
  const axisLen = radius * 1.3;
  group.add(createAxis([0, 0, 0], [axisLen, 0, 0], 0xff0000, 'x'));
  group.add(createAxis([0, 0, 0], [0, axisLen, 0], 0x00ff00, 'y'));
  group.add(createAxis([0, 0, 0], [0, 0, axisLen], 0x0000ff, 'z'));

  // Equator circle
  const eqGeo = new THREE.RingGeometry(radius - 0.01, radius + 0.01, 64);
  const eqMat = new THREE.MeshBasicMaterial({
    color: 0x666666, side: THREE.DoubleSide, transparent: true, opacity: 0.3
  });
  const equator = new THREE.Mesh(eqGeo, eqMat);
  equator.rotation.x = Math.PI / 2;
  group.add(equator);

  return group;
}

function createMagVector(color = 0xffffff) {
  const dir = new THREE.Vector3(0, 0, 1);
  const origin = new THREE.Vector3(0, 0, 0);
  return new THREE.ArrowHelper(dir, origin, 1, color, 0.12, 0.08);
}
```

### Layout

```
┌─────────────────────────────────────────────────┐
│  [¹H Bloch]     [³¹P Bloch]     [¹⁹F Bloch]    │
│   sphere          sphere          sphere         │
│              J=42Hz    J=430Hz                   │
│         J=220Hz                                  │
├─────────────────────────────────────────────────┤
│  FID Signal ═══════════════════════════════      │
│  Spectrum   ▁▂▃▅▇▅▃▂▁  ▁▃▇▃▁   ▁▂▅▂▁          │
├─────────────────────────────────────────────────┤
│ [▶Play] [⏸] [↺Reset]  Speed:[====]  τ:[====]   │
│ [90°x] [90°y] [180°x]  Target: [H][P][F][All]   │
│ Encoding: s=[====] → θ=0.42 → [Apply]           │
│ [✓Relaxation] [✓J-coupling]                      │
└─────────────────────────────────────────────────┘
```

---

## Specific Demos to Include

### Demo 1: Basic Precession and Relaxation
- Start with all spins at equilibrium (M along z)
- Apply 90°x pulse to H
- Watch H precess and decay (T2 = 200 ms)
- Watch H recover along z (T1 = 5 s)
- FID shows decaying oscillation

### Demo 2: J-Coupling Effect
- Apply 90° pulse to H
- Toggle J-coupling ON
- Watch H precession frequency modulated by P and F coupling
- Spectrum shows splitting pattern

### Demo 3: QRC Encoding Demo
- Show input slider s = 0 → 1
- Compute θ = arcsin(√s)
- Apply Rx(θ) to selected nuclei
- Show how different s values create different quantum states
- "This is how data enters the quantum reservoir"

### Demo 4: Reservoir Evolution
- Encode input → evolve for τ → measure FID → show features
- Encode next input → evolve → measure
- Show how FID changes with each new input (fading memory)
- "This is quantum reservoir computing in action"

---

## Tech Stack

```
Frontend:
  - Three.js (3D rendering)
  - Chart.js or Plotly.js (FID and spectrum plots)
  - Vanilla JS or React (UI)
  - WebSocket client (if using Python backend)

Backend (Option A only):
  - FastAPI + uvicorn
  - QuTiP (quantum simulation)
  - WebSocket server

Deployment:
  - Option B: GitHub Pages (static, no server)
  - Option A: Docker container or university server
```

---

## SPINQ Gemini Lab Parameters (Use These)

```javascript
const SPINQ_PARAMS = {
  nuclei: [
    { symbol: '¹H',   name: 'Hydrogen',    freq_MHz: 27.3,  T1: 5.0, T2: 0.20, color: '#4A90D9' },
    { symbol: '³¹P',  name: 'Phosphorus',   freq_MHz: 11.0,  T1: 4.5, T2: 0.15, color: '#50C878' },
    { symbol: '¹⁹F',  name: 'Fluorine',     freq_MHz: 25.5,  T1: 6.0, T2: 0.25, color: '#FF8C00' },
  ],
  couplings: [
    { pair: 'H-P', J_Hz: 42  },
    { pair: 'H-F', J_Hz: 220 },
    { pair: 'P-F', J_Hz: 430 },
  ],
  B0_T: 1.084,  // approximate field strength
};
```

---

## What Makes This Different from Existing Tools

| Feature | bloch.kherb.io | tkimhofer | SpinDrops | **This project** |
|---------|:-:|:-:|:-:|:-:|
| Web-based | ✅ | ✅ | ❌ (app) | ✅ |
| 3D visualization | ✅ | ✅ | ✅ | ✅ |
| Multiple spins | ❌ | ❌ | ✅ (1-3) | ✅ (3) |
| T1/T2 relaxation | ❌ | ✅ | Partial | ✅ |
| J-coupling | ❌ | ❌ | ✅ | ✅ |
| FID generation | ❌ | ✅ | ✅ | ✅ |
| Live spectrum | ❌ | ❌ | ✅ | ✅ |
| QRC demo mode | ❌ | ❌ | ❌ | ✅ |
| Real SPINQ params | ❌ | ❌ | ❌ | ✅ |
| Density matrix | ❌ | ❌ | ✅ | Option A only |

---

## Scope Control

**MVP (1-2 days):**
- Option B (JS Bloch equations)
- 3 Bloch spheres with vectors
- 90° pulse button
- T1/T2 relaxation animation
- FID trace

**V2 (1 week):**
- Add J-coupling (approximate)
- Add spectrum (live FFT)
- Add encoding demo slider
- Add control toggles

**V3 (if it becomes a real project):**
- Option A backend (real Lindblad physics)
- Density matrix visualization
- Full QRC encoding → evolution → readout demo
- Export to presentation/paper figures

---

## Reference Implementations to Study

- **tkimhofer:** https://github.com/tkimhofer/nmr_visualisation (Three.js + Bloch equations, best starting point for 3D)
- **Blochy:** https://github.com/kherb27/Blochy (clean UI, Plotly.js for sphere, good for controls)
- **SpinDrops:** https://spindrops.org/ (DROPS representation, density matrix, best physics reference)
- **DRCMR:** https://www.drcmr.dk/BlochSimulator/ (multi-isochromate, good for understanding multiple spins)

---

**This is a fun side project — don't let it distract from the QRC research.
Start with the MVP, show it works, iterate if there's interest.**
