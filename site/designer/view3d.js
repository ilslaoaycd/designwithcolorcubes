// view3d.js — the designer's 3D view: the tray built from real cubes you can turn and look at.
// View only. Uses the cube model in /models/ (measured from an original, in metres) and the
// vendored three.js; both load the first time someone opens the view. MIT licensed.

import * as THREE from "/js/vendor/three/three.module.min.js";
import { OrbitControls } from "/js/vendor/three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "/js/vendor/three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "/js/vendor/three/addons/environments/RoomEnvironment.js";

const SIZE = 0.0275;            // one cube, 27.5 mm
const PITCH = SIZE + 0.0005;    // cubes sit almost touching in the tray
const MODELS = { scanned: "/models/color-cube.glb", printed: "/models/color-cube-printed.glb", solid: "/models/color-cube-flat.glb" };

// The model's faces (model/README.txt): +Y up, −Z north. North red, east yellow, south white,
// west blue. Top red/white and bottom blue/yellow, each with its dark triangle in the north-west
// corner. Looks follow cubecode.js: 0 white, 1 red, 2 yellow, 3 blue, 4–7 blue/yellow and 8–11
// red/white by the dark corner (top-left, top-right, bottom-right, bottom-left as seen from above
// with north at the top).
const FACES = [
  { normal: [0, 1, 0], split: 8, dark: [-1, 0, -1] },
  { normal: [0, -1, 0], split: 4, dark: [-1, 0, -1] },
  { normal: [0, 0, -1], look: 1 },
  { normal: [1, 0, 0], look: 2 },
  { normal: [0, 0, 1], look: 0 },
  { normal: [-1, 0, 0], look: 3 }
];

/** For each look, the rotations (out of the cube's 24) that put it on top, the right way round. */
function orientations() {
  const out = Array.from({ length: 12 }, () => []);
  const seen = new Set();
  const e = new THREE.Euler();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    e.set((a * Math.PI) / 2, (b * Math.PI) / 2, (c * Math.PI) / 2);
    const q = new THREE.Quaternion().setFromEuler(e);
    const id = q.toArray().map((v) => Math.round(v * 1000) * Math.sign(q.w || 1)).join();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const f of FACES) {
      const up = new THREE.Vector3(...f.normal).applyQuaternion(q);
      if (up.y < 0.9) continue;
      let look = f.look;
      if (look === undefined) {
        const d = new THREE.Vector3(...f.dark).applyQuaternion(q);
        const corner = d.x < 0 ? (d.z < 0 ? 0 : 3) : (d.z < 0 ? 1 : 2);
        look = f.split + corner;
      }
      out[look].push(q);
    }
  }
  return out;
}

const loader = new GLTFLoader();
const models = {};
function loadModel(style) {
  if (!models[style]) {
    models[style] = new Promise((resolve, reject) => loader.load(MODELS[style], (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      resolve(g.scene);
    }, undefined, reject));
  }
  return models[style];
}

export class View3D {
  static async create(host, opts) {
    const v = new View3D(host, opts);
    await v.build();
    return v;
  }

  constructor(host, { grid, w, h, style }) {
    this.host = host;
    this.grid = grid;
    this.w = w;
    this.h = h;
    this.style = style;
    this.turns = orientations();
    this.dirty = true;
    this.alive = true;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "The tray in 3D. Drag to turn it, scroll or pinch to zoom.");
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.005, 20);
    this.controls = new OrbitControls(this.camera, canvas);
    // The whole way round, underneath included, to see the bottoms of the cubes.
    Object.assign(this.controls, { enableDamping: true, enablePan: false, maxPolarAngle: Math.PI - 0.05, minPolarAngle: 0.05 });
    this.controls.addEventListener("change", () => { this.dirty = true; });

    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 5;
    this.key.shadow.bias = -0.0004;
    scene.add(this.key, this.key.target);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4ac, 0.5));
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(0.4, 0.3, 0.6);
    scene.add(fill);
    // A soft light from below, for when the camera goes under the tray.
    const under = new THREE.DirectionalLight(0xffffff, 1.9);
    under.position.set(-0.3, -1, 0.4);
    scene.add(under);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -SIZE / 2 - 0.0001;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.tray = new THREE.Group();
    scene.add(this.tray);

    host.append(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  async build() {
    const template = await loadModel(this.style);
    if (!this.alive) return;
    this.tray.clear();
    const { w, h, grid } = this;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const d = grid[r * w + c];
        const choices = this.turns[d];
        // Solid looks can sit any way round; vary them like a real tray.
        const q = choices[(r * 7 + c * 3) % choices.length];
        const cube = template.clone();
        cube.quaternion.copy(q);
        cube.position.set((c - (w - 1) / 2) * PITCH, 0, (r - (h - 1) / 2) * PITCH);
        this.tray.add(cube);
      }
    }
    this.frame();
    this.dirty = true;
  }

  /** Point the camera and the light at the whole tray, from the front and above. */
  frame() {
    const span = Math.max(this.w, this.h) * PITCH;
    const dist = (span * 0.78) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1, this.camera.aspect);
    this.camera.position.set(0, dist * 0.78, dist * 0.62);
    this.controls.target.set(0, -SIZE * 0.2, 0);
    this.controls.minDistance = dist * 0.35;
    this.controls.maxDistance = dist * 2.2;
    this.controls.update();
    this.key.position.set(-span * 0.9, span * 2.2, span * 0.7);
    Object.assign(this.key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.01, far: span * 6 });
    this.key.shadow.camera.updateProjectionMatrix();
  }

  setTray(grid, w, h) {
    const same = w === this.w && h === this.h && grid.join() === this.grid.join();
    if (same) return;
    const resized = w !== this.w || h !== this.h;
    Object.assign(this, { grid, w, h });
    this.build().then(() => { if (!resized) this.dirty = true; });
  }

  setStyle(style) {
    if (style === this.style) return;
    this.style = style;
    const cam = this.camera.position.clone(), target = this.controls.target.clone();
    this.build().then(() => {
      // Keep the view where it was when only the cube style changes.
      this.camera.position.copy(cam);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
    });
  }

  setTheme() { this.dirty = true; }

  /** Is the camera under the table? */
  get below() { return this.camera.position.y < this.controls.target.y; }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = r.width / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  loop() {
    if (!this.alive) return;
    this.ground.visible = !this.below;
    this.controls.update();
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.loop);
  }

  dispose() {
    this.alive = false;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
