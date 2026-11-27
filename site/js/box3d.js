// box3d.js — the lid and the tray in 3D, and (on the download page) the tray filled with cubes
// laid out in a design, in whatever four colors were chosen. three.js loads only when this
// module does. MIT licensed (see LICENSE).
//
// startBox3D(host, get) draws into host; get() hands back what to show:
//   { spec, lid: [Mesh] or null (not made yet), colors: { white, red, yellow, blue } → hex,
//     cubes?: { code }, flat? }
// Call update() after anything changes. What's built is kept: a new lid (a different array) or
// tray size rebuilds that part, new colors only repaint. It draws only when something changed or
// the view is being turned, and not while it's off screen. The cubes are drawn from their faces
// rather than from the print model, whose split faces are overlapping parts that only a slicer
// sorts out, as one instanced mesh.

import { lidSize, traySize, trayParts, CUBE, TRAY } from "./print3d.js";
import { parseCode } from "./cubecode.js";

// The cube model sits as it prints: red on top (+z), white under it, blue toward +y, yellow toward
// -y, the blue/yellow split face toward +x and the red/white one toward -x. On both split faces
// the dark corner points at the red and blue sides, (0, +1, +1).
const FACES = { "0,0,1": 1, "0,0,-1": 0, "0,1,0": 3, "0,-1,0": 2, "1,0,0": "by", "-1,0,0": "rw" };
const DARK = [0, 1, 1];

/** The 24 turns of a cube, as 3 × 3 matrices (rows). */
function turns() {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const m = [0, 1, 2].map((i) => { const row = [0, 0, 0]; row[p[i]] = s & (1 << i) ? -1 : 1; return row; });
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if (det === 1) out.push(m);
  }
  return out;
}
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

/**
 * One cube as it sits in the model's frame (see FACES), as flat triangles with a color role per
 * vertex: [{ p: [x, y, z] × 3, role }]. Each split face's dark triangle sits in the corner toward
 * the red and blue sides, its light triangle inside a rim as on the real cube (cubeface.js RIM),
 * or with flat true, exactly half the face with no rim.
 */
export function cubeTriangles(size = CUBE, { flat = false } = {}) {
  const h = size / 2, rim = flat ? 0 : (1.7 / 27.5) * size;
  const tris = [];
  // A face: normal axis k with sign sgn, and its two in-plane axes a, b (+a × +b = outward).
  const face = (k, sgn, a, b, fill) => {
    const at = (u, v) => { const q = [0, 0, 0]; q[k] = sgn * h; q[a] = u; q[b] = v; return q; };
    const quad = (u0, v0, u1, v1, role) => {
      const A = at(u0, v0), B = at(u1, v0), C = at(u1, v1), D = at(u0, v1);
      tris.push({ p: sgn > 0 ? [A, B, C] : [A, C, B], role }, { p: sgn > 0 ? [A, C, D] : [A, D, C], role });
    };
    if (typeof fill === "string") return quad(-h, -h, h, h, fill);
    // Split: the dark color fills the face; the light triangle, corner away from dark, sits a hair proud.
    quad(-h, -h, h, h, fill.dark);
    const out = sgn * (h + 0.05);
    const P = (u, v) => { const q = [0, 0, 0]; q[k] = out; q[a] = u; q[b] = v; return q; };
    // a and b are y and z here; the light corner is (-y, -z).
    const L = [P(-h + rim, -h + rim), P(h - rim, -h + rim), P(-h + rim, h - rim)];
    tris.push({ p: sgn > 0 ? L : [L[0], L[2], L[1]], role: fill.light });
  };
  face(2, 1, 0, 1, "red");
  face(2, -1, 0, 1, "white");
  face(1, 1, 2, 0, "blue");
  face(1, -1, 2, 0, "yellow");
  face(0, 1, 1, 2, { dark: "blue", light: "yellow" });
  face(0, -1, 1, 2, { dark: "red", light: "white" });
  return tris;
}

/** The turn that shows look d on top, its dark corner where the tray code says (seen from above, y up). */
const turnCache = new Map();
export function turnFor(d) {
  if (!turnCache.has(d)) turnCache.set(d, findTurn(d));
  return turnCache.get(d);
}
function findTurn(d) {
  const CORNER = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // TL, TR, BR, BL
  for (const m of turns()) {
    // Which face ends up on top: the one whose normal m takes to +z, i.e. the third row of m.
    const n = m[2];
    const face = FACES[n.join(",")];
    if (d < 4) { if (face === d) return m; continue; }
    if (face !== (d < 8 ? "by" : "rw")) continue;
    const u = mul(m, DARK);
    const [cx, cy] = CORNER[(d - 4) % 4];
    if (Math.sign(u[0]) === cx && Math.sign(u[1]) === cy) return m;
  }
  return null;
}

export async function startBox3D(host, get) {
  const [THREE, { OrbitControls }] = await Promise.all([
    import("./vendor/three/three.module.min.js"),
    import("./vendor/three/addons/controls/OrbitControls.js")
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.querySelector(".status")?.remove();
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b4aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-1, 2, 1.4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2; // our z up is three's y up
  scene.add(world);
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.55 }));
    return mats.get(hex);
  };
  const geo = (m) => {
    const g = new THREE.BufferGeometry();
    if (m.view) {
      // Laid out by lid-worker.js already, off the main thread.
      g.setAttribute("position", new THREE.BufferAttribute(m.view.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.view.nor, 3));
      const [x, y, z, r] = m.view.sphere;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
      return g;
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.v, 3));
    g.setIndex(Array.from(m.t));
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    return flat;
  };

  /** The cube as one geometry, its colors per vertex from each triangle's role (see paint). */
  const makeCubeGeo = (flat) => {
    const tris = cubeTriangles(CUBE - 0.5, { flat });
    const pos = [], roles = [];
    for (const t of tris) for (const q of t.p) { pos.push(...q); roles.push(t.role); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.computeVertexNormals();
    g.userData.roles = roles;
    return g;
  };
  const paint = (g, colors) => {
    const col = g.getAttribute("color"), c = new THREE.Color();
    g.userData.roles.forEach((role, i) => { c.set(colors[role]); col.setXYZ(i, c.r, c.g, c.b); });
    col.needsUpdate = true;
  };
  const cubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });

  // What's built, kept between updates.
  let lidG = null, lidOf = null;          // the lid and the parts it was made from
  const trayG = new THREE.Group();        // the tray, and the cubes in it
  world.add(trayG);
  let trayBody = null, trayKey = "";
  let cubeGeo = null, cubeFlat = null, cubeColors = "", cubes = null, cubeKey = "";
  let first = true;
  let lastKey = "";
  // Take a group out and free its geometry (the cube's is shared, and freed when it's replaced).
  const drop = (o) => {
    if (!o) return;
    o.parent?.remove(o);
    o.traverse((x) => { if (x.geometry && x.geometry !== cubeGeo) x.geometry.dispose(); });
  };

  function update() {
    const { spec, lid, colors, cubes: want, flat } = get();
    const ls = lidSize(spec.cols, spec.rows), ts = traySize(spec.cols, spec.rows);
    const size = `${spec.cols}x${spec.rows}`;

    // The lid as it sits on a table, art up: turned over from how it prints.
    if (lid !== lidOf) {
      drop(lidG);
      lidG = null;
      lidOf = lid;
      if (lid) {
        lidG = new THREE.Group();
        for (const m of lid) {
          const mesh = new THREE.Mesh(geo(m));
          mesh.userData.color = m.color;
          lidG.add(mesh);
        }
        lidG.rotation.y = Math.PI;
        world.add(lidG);
      }
    }
    if (lidG) {
      lidG.position.set(ls.w, 0, ls.height);
      for (const mesh of lidG.children) mesh.material = mat(colors[mesh.userData.color]);
    }

    if (size !== trayKey) {
      drop(trayBody);
      trayBody = new THREE.Group();
      for (const m of trayParts(spec.cols, spec.rows)) trayBody.add(new THREE.Mesh(geo(m)));
      trayG.add(trayBody);
      trayKey = size;
    }
    for (const mesh of trayBody.children) mesh.material = mat(colors[spec.walls] || colors.white);
    trayG.position.set(ls.w + 24, (ls.h - ts.h) / 2, 0);

    const p = want ? parseCode(want.code) : null;
    if (p && !p.error) {
      if (!cubeGeo || cubeFlat !== !!flat) {
        const old = cubeGeo;
        cubeGeo = makeCubeGeo(!!flat);
        cubeFlat = !!flat;
        cubeColors = "";
        if (cubes) cubes.geometry = cubeGeo;
        old?.dispose();
      }
      const ck = ["white", "red", "yellow", "blue"].map((r) => colors[r]).join();
      if (ck !== cubeColors) { paint(cubeGeo, colors); cubeColors = ck; }
      if (want.code !== cubeKey) {
        drop(cubes);
        cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, p.w * p.h);
        const x0 = TRAY.wall + TRAY.play / 2 + CUBE / 2, y0 = TRAY.wall + TRAY.play / 2 + CUBE / 2;
        const one = new THREE.Matrix4();
        for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
          const m = turnFor(p.grid[r * p.w + c]);
          one.set(m[0][0], m[0][1], m[0][2], x0 + c * CUBE, m[1][0], m[1][1], m[1][2], y0 + (p.h - 1 - r) * CUBE, m[2][0], m[2][1], m[2][2], TRAY.floor + CUBE / 2, 0, 0, 0, 1);
          cubes.setMatrixAt(r * p.w + c, one);
        }
        cubes.instanceMatrix.needsUpdate = true;
        cubes.computeBoundingSphere();
        trayG.add(cubes);
        cubeKey = want.code;
      }
    } else if (cubes) {
      drop(cubes);
      cubes = null;
      cubeKey = "";
    }

    const span = ls.w + 24 + ts.w;
    if (first || size !== lastKey) {
      first = false;
      lastKey = size;
      camera.position.set(span * 0.5, span * 1.25, span * 0.95);
    }
    controls.target.set(span / 2, 10, -ls.h / 2);
    wake();
  }

  // Draw only when something changed, or while the view is turned or still easing to a stop, and
  // only while it's on screen.
  let running = false, dirty = true, onScreen = true, ready = false;
  const showing = () => ready && onScreen && !host.hidden && host.offsetParent !== null;
  function wake() {
    dirty = true;
    if (!running && showing()) { running = true; requestAnimationFrame(frame); }
  }
  function frame() {
    if (!showing()) { running = false; return; }
    const moved = controls.update();
    if (moved || dirty) {
      dirty = false;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }
  controls.addEventListener("change", wake);
  controls.addEventListener("start", wake);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) wake();
    }).observe(host);
  }
  const resize = () => {
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    wake();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  update();
  // Compile the shaders before the first frame, in parallel where the browser can, rather than
  // all at once inside it.
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* draw anyway */ }
  ready = true;
  update(); // again: anything (a lid from the worker) that arrived while it compiled
  return { update };
}
