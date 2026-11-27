// cube3d.js — one Color Cube in 3D that you can turn with a finger or the mouse.
// Uses the model in /models/ (a 27.5 mm cube measured from an original, in metres) and a
// vendored copy of three.js 0.160. Loaded only when someone asks for it. MIT licensed.

import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/three/addons/environments/RoomEnvironment.js";

const H = 0.0275 / 2;
const DIST = 0.13;

function load(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

// The cube in three finishes: scanned from an original, scanned from a 3D-printed cube, and the
// flat reference colors.
const FINISHES = {
  printed: { url: "/models/color-cube-printed.glb", label: "3D printed" },
  original: { url: "/models/color-cube.glb", label: "Original" },
  flat: { url: "/models/color-cube-flat.glb", label: "Flat colors" }
};

/**
 * Start the cube in `host`, showing `finish`. onFinish(name) is called when someone picks a
 * finish on the cube's own switch. `only` limits the switch to some finishes; with just one there
 * is no switch. Returns { setFinish(name) } for the page to drive it too.
 */
export async function startCube(host, finish = "printed", onFinish = () => {}, { only } = {}) {
  const offered = only || Object.keys(FINISHES);
  const loader = new GLTFLoader();
  const models = {};
  const loadFinish = (name) => {
    if (!models[name]) {
      models[name] = load(loader, FINISHES[name].url).then((g) => {
        g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        g.scene.visible = false;
        scene.add(g.scene);
        return g.scene;
      });
    }
    return models[name];
  };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "A Color Cube in 3D. Drag to turn it.");
  canvas.setAttribute("role", "img");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 10);
  camera.position.set(-0.55, 0.62, 0.55).normalize().multiplyScalar(DIST);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.07;
  controls.maxDistance = 0.2;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotate = !still;
  controls.autoRotateSpeed = 1.4;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-0.08, 0.16, 0.06);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -0.05, right: 0.05, top: 0.05, bottom: -0.05, near: 0.01, far: 0.5 });
  key.shadow.radius = 6;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 0.55));
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(0.06, -0.14, 0.05);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -H - 0.0002;
  ground.receiveShadow = true;
  scene.add(ground);

  let shown = finish;
  async function setFinish(name) {
    if (!FINISHES[name] || !offered.includes(name)) return;
    shown = name;
    sw.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === name)));
    const model = await loadFinish(name);
    if (shown !== name) return; // another finish was picked while this one loaded
    for (const m of Object.values(models)) (await m).visible = false;
    model.visible = true;
  }
  await loadFinish(finish);

  // Swap the poster for the canvas and a switch between the finishes.
  host.querySelector(".poster").remove();
  host.append(canvas);
  const sw = document.createElement("div");
  sw.className = "switch";
  sw.setAttribute("role", "group");
  sw.setAttribute("aria-label", "Cube finish");
  sw.innerHTML = offered.map((k) => `<button type="button" aria-pressed="false" data-k="${k}">${FINISHES[k].label}</button>`).join("");
  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setFinish(b.dataset.k);
    onFinish(b.dataset.k);
  });
  if (offered.length > 1) host.append(sw);
  await setFinish(finish);

  const resize = () => {
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  // Only draw while the cube is on screen.
  let visible = true;
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(host);

  function frame() {
    if (!visible) return;
    controls.update();
    ground.visible = camera.position.y > -H;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  return { setFinish };
}
