// Three.js rendering: three Bloch spheres side by side with magnetization arrows.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SPHERE_SPACING = 3.0;

function createAxis(from, to, color) {
  const mat = new THREE.LineBasicMaterial({ color });
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...from),
    new THREE.Vector3(...to),
  ]);
  return new THREE.Line(geo, mat);
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

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true, transparent: true, opacity: 0.15 })
  );
  group.add(sphere);

  const a = radius * 1.3;
  group.add(createAxis([-a, 0, 0], [a, 0, 0], 0xaa3333)); // x
  group.add(createAxis([0, -a, 0], [0, a, 0], 0x33aa33)); // y
  group.add(createAxis([0, 0, -a], [0, 0, a], 0x3333aa)); // z

  const equator = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.012, radius + 0.012, 64),
    new THREE.MeshBasicMaterial({ color: 0x666666, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    // Build one sphere + arrow per nucleus, centered as a row.
    const radius = 1;
    const offsetX = -(nuclei.length - 1) / 2 * SPHERE_SPACING;
    this.arrows = [];
    this.centers = [];
    nuclei.forEach((n, i) => {
      const sphere = createBlochSphere(radius, n.symbol, n.color);
      sphere.position.x = offsetX + i * SPHERE_SPACING;
      this.scene.add(sphere);
      this.centers.push(new THREE.Vector3(sphere.position.x, 0, 0));

      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1, n.color, 0.22, 0.14
      );
      sphere.add(arrow);
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
      if (len > 1e-6) dir.normalize();
      this.arrows[i].setDirection(dir);
      this.arrows[i].setLength(Math.max(0.05, len), 0.22, 0.14);
    });
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
