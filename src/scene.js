// Three.js rendering: three Bloch spheres side by side with bold, shaded 3D
// magnetization arrows (cylinder shaft + cone head), lit for depth so each
// nucleus's vector reads clearly. Arrow direction/length come from the real
// Tr(ρ·σ_k) Bloch vectors.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SPHERE_SPACING = 3.0;
const UP = new THREE.Vector3(0, 1, 0);

// ---- Bold magnetization arrow: a thick shaft + cone head as a solid, shaded
// mesh group. Points along +Y locally; setVector() orients + scales it. --------
class BoldArrow {
  constructor(color) {
    this.obj = new THREE.Group();
    this.shaftR = 0.055;
    this.headR0 = 0.14;
    this.headLen0 = 0.30;

    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.35,
      emissive: new THREE.Color(color).multiplyScalar(0.18), // stays readable in shadow / light theme
    });
    this.mat = mat;

    // Unit shaft (height 1 along +Y, base at origin) — scaled in setVector().
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(this.shaftR, this.shaftR, 1, 20), mat);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(this.headR0, this.headLen0, 28), mat);
    this.obj.add(this.shaft);
    this.obj.add(this.head);
    this.obj.renderOrder = 2; // draw over the translucent sphere fill

    this.setVector(UP, 1);
  }

  // dir: unit THREE.Vector3; L: total arrow length in [~0.1, 1].
  setVector(dir, L) {
    const hLen = Math.min(this.headLen0, L * 0.55);   // head shrinks for short arrows
    const hScale = hLen / this.headLen0;
    const shaftLen = Math.max(0.001, L - hLen);

    this.shaft.scale.set(1, shaftLen, 1);
    this.shaft.position.y = shaftLen / 2;

    this.head.scale.set(hScale, hScale, hScale);
    this.head.position.y = shaftLen + hLen / 2;

    this.obj.quaternion.setFromUnitVectors(UP, dir);
  }
}

// Thin bright tube axis (crisp regardless of lighting), spanning -len..+len.
function createAxisTube(axis, len, color) {
  const geo = new THREE.CylinderGeometry(0.012, 0.012, len * 2, 12);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(0.8, 0.8, 0.8);
  return sprite;
}

function createBlochSphere(radius, label, labelColor) {
  const group = new THREE.Group();

  // Faint translucent solid fill so the bold arrow reads against a surface.
  const fill = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.985, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x8a97a8, transparent: true, opacity: 0.06, depthWrite: false })
  );
  group.add(fill);

  // Wireframe shell.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x556072, wireframe: true, transparent: true, opacity: 0.16 })
  );
  group.add(sphere);

  const a = radius * 1.3;
  group.add(createAxisTube('x', a, 0xc85c5c)); // x
  group.add(createAxisTube('y', a, 0x5cc85c)); // y (physics z, up)
  group.add(createAxisTube('z', a, 0x5c7cc8)); // z

  const equator = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.012, radius + 0.012, 64),
    new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
  );
  equator.rotation.x = Math.PI / 2;
  group.add(equator);

  const labelSprite = makeLabel(label, labelColor);
  labelSprite.position.set(0, radius + 0.55, 0);
  group.add(labelSprite);

  return group;
}

export class BlochScene {
  constructor(container, nuclei) {
    this.container = container;
    const w = container.clientWidth, h = container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 2.2, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    // Lighting: gives the shaded arrows their 3D "pop".
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-6, 2, -4);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    // Build one sphere + bold arrow per nucleus, centered as a row.
    const radius = 1;
    const offsetX = -(nuclei.length - 1) / 2 * SPHERE_SPACING;
    this.arrows = [];
    this.centers = [];
    nuclei.forEach((n, i) => {
      const sphere = createBlochSphere(radius, n.symbol, n.color);
      sphere.position.x = offsetX + i * SPHERE_SPACING;
      this.scene.add(sphere);
      this.centers.push(new THREE.Vector3(sphere.position.x, 0, 0));

      const arrow = new BoldArrow(n.color);
      sphere.add(arrow.obj);
      this.arrows.push(arrow);
    });

    // J-coupling connector lines between sphere centers (toggled by setCoupling).
    this.couplingLines = [];
    const pairs = [[0, 1], [0, 2], [1, 2]];
    pairs.forEach(([a, b]) => {
      const mat = new THREE.LineDashedMaterial({ color: 0x777777, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.5 });
      const geo = new THREE.BufferGeometry().setFromPoints([
        this.centers[a].clone().add(new THREE.Vector3(0, -radius - 0.15, 0)),
        this.centers[b].clone().add(new THREE.Vector3(0, -radius - 0.15, 0)),
      ]);
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.scene.add(line);
      this.couplingLines.push(line);
    });

    window.addEventListener('resize', () => this._onResize());
    // The grid layout isn't final when this runs at module load, so the initial
    // clientWidth/Height can be wrong (leaving dead space below the canvas).
    // A ResizeObserver keeps the canvas exactly filling its panel whenever the
    // container's size settles or changes.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(container);
    }
  }

  // Show/hide the J-coupling connector lines.
  setCoupling(on) {
    for (const l of this.couplingLines) l.visible = on;
  }

  // Set the 3D scene background (follows the app's light/dark theme).
  setBackground(hex) {
    this.scene.background = new THREE.Color(hex);
  }

  // blochVectors: array of { x, y, z } in PHYSICS coords (each in [-1,1]).
  // Map to Three.js display axes: physics z -> three y (up), physics y -> -three z,
  // physics x -> three x. (Keeps a right-handed view consistent with the old code.)
  update(blochVectors) {
    blochVectors.forEach((b, i) => {
      const len = Math.hypot(b.x, b.y, b.z);
      const dir = new THREE.Vector3(b.x, b.z, -b.y);
      if (len > 1e-6) dir.normalize(); else dir.copy(UP);
      this.arrows[i].setVector(dir, Math.max(0.1, len));
    });
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;   // panel not laid out yet
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
