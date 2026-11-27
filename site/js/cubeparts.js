// cubeparts.js — one Color Cube as closed meshes, one per color region, for the print files.
// Pure functions, no dependencies. MIT licensed (see LICENSE).
//
// The cube is 26.95 mm (the printed size), corner at the origin, z up: red on top (+z), white
// underneath, blue +y, yellow −y, the blue/yellow split face +x and the red/white one −x. Each
// face is a pyramid to the cube's center. On a split face the light triangle sits toward the
// yellow and white sides and the dark half toward red and blue, as on every original cube.
//
// Two kinds of split face:
//   recessed  as the 1930s cubes: the light triangle sits in a pocket inside a 1.47 mm rim of the
//             dark color along its two outer edges, its long side on the diagonal (measured from
//             the print model: a 0.284 mm wall, then a 45° chamfer to a floor 0.784 mm down)
//   flat      the two triangles flush, each exactly half the face, no rim
// Either way the split face is two parts: the dark color, and a skin of the light color under the
// light triangle (0.5 mm thick when flat, reaching 1.3 mm down when recessed), so a slicer gives
// each its own filament without any painting.

export const L = 26.95;
const RIM = 1.47, WALL = 0.284, FLOOR = 0.784, SKIN_DOWN = 1.3, FLAT_SKIN = 0.5;
const C = L / 2;

// Each face maps (a, b, depth) on the face to a point in the cube: a and b run 0–L across the
// face, depth runs inward. The split faces put a = b = 0 at the yellow/white corner.
const FACES = [
  { id: "red", color: "red", at: (a, b, d) => [a, b, L - d] },
  { id: "white", color: "white", at: (a, b, d) => [a, b, d] },
  { id: "blue", color: "blue", at: (a, b, d) => [a, L - d, b] },
  { id: "yellow", color: "yellow", at: (a, b, d) => [a, d, b] },
  { id: "split-by", dark: "blue", light: "yellow", at: (a, b, d) => [L - d, a, b] },
  { id: "split-rw", dark: "red", light: "white", at: (a, b, d) => [d, a, b] }
];

/** A closed mesh from polygons (each a list of [a, b, depth] on one face): merges vertices,
    fans each polygon into triangles, then turns every triangle the same way round and outward. */
function solid(name, color, face, polys) {
  const v = [], t = [], index = new Map();
  const vert = (p) => {
    const q = face.at(...p);
    const key = q.map((x) => Math.round(x * 1e5)).join();
    if (!index.has(key)) { index.set(key, v.length / 3); v.push(...q.map((x) => Math.round(x * 1e6) / 1e6)); }
    return index.get(key);
  };
  for (const poly of polys) {
    const ids = poly.map(vert);
    for (let i = 1; i + 1 < ids.length; i++) t.push(ids[0], ids[i], ids[i + 1]);
  }
  orient(v, t);
  return { name, color, v, t };
}

/** Make neighbouring triangles agree (each shared edge walked both ways), then face outward. */
function orient(v, t) {
  const n = t.length / 3;
  const edges = new Map();
  const key = (a, b) => (a < b ? a + "," + b : b + "," + a);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const e = key(t[3 * i + k], t[3 * i + (k + 1) % 3]);
    (edges.get(e) || edges.set(e, []).get(e)).push(i);
  }
  const dir = (i, a, b) => { for (let k = 0; k < 3; k++) if (t[3 * i + k] === a && t[3 * i + (k + 1) % 3] === b) return true; return false; };
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = 1;
    const queue = [s];
    while (queue.length) {
      const i = queue.pop();
      for (let k = 0; k < 3; k++) {
        const a = t[3 * i + k], b = t[3 * i + (k + 1) % 3];
        for (const j of edges.get(key(a, b))) {
          if (j === i || seen[j]) continue;
          if (dir(j, a, b)) { const x = t[3 * j + 1]; t[3 * j + 1] = t[3 * j + 2]; t[3 * j + 2] = x; }
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
  }
  if (volume(v, t) < 0) for (let i = 0; i < t.length; i += 3) { const x = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = x; }
}

/** Signed volume of a closed mesh (positive when its triangles face outward). */
export function volume(v, t) {
  let s = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i], t[i + 1], t[i + 2]].map((k) => v.slice(3 * k, 3 * k + 3));
    s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return s / 6;
}

// The face square, its corners counter-clockwise from the light corner, and the center.
const SQ = [[0, 0, 0], [L, 0, 0], [L, L, 0], [0, L, 0]];
const APEX = [C, C, C];
const sides = () => SQ.map((p, i) => [p, SQ[(i + 1) % 4], APEX]);

function solidFace(face) {
  return [solid(`cube-${face.id}`, face.color, face, [SQ, ...sides()])];
}

function recessed(face) {
  const s = 0.5; // the chamfer, 45°, from the wall's foot to the floor
  const tri = (r, h, d) => [[r, r, d], [L - h - r, r, d], [r, L - h - r, d]];
  const A0 = tri(RIM, 0, 0), A1 = tri(RIM, 0, WALL), A2 = tri(RIM, 0, SKIN_DOWN);
  const B = tri(RIM + s, s * Math.SQRT2, FLOOR);
  const quads = (P, Q) => P.map((p, i) => [p, P[(i + 1) % 3], Q[(i + 1) % 3], Q[i]]);
  const [P1, P2, P3] = A0;
  // The skin: the floor, the chamfer round it, straight walls down from the chamfer, a bottom.
  const light = solid(`cube-${face.id}-${face.light}`, face.light, face, [B, ...quads(A1, B), ...quads(A1, A2), A2]);
  // The rest of the face: the rim and the dark half on the surface, the pocket's upper wall, the
  // skin's walls and bottom, and the pyramid's four sides.
  const dark = solid(`cube-${face.id}-${face.dark}`, face.dark, face, [
    [SQ[0], SQ[1], P2, P1], [SQ[0], P1, P3, SQ[3]],
    [SQ[2], SQ[3], P3], [SQ[2], P3, P2], [SQ[2], P2, SQ[1]],
    ...quads(A0, A1), ...quads(A1, A2), A2, ...sides()
  ]);
  return [dark, light];
}

function flat(face) {
  const T = FLAT_SKIN;
  // At depth T the pyramid has shrunk by T on every side; the light half's section is a triangle
  // whose corners lie on the pyramid's edges, so the diagonal cut stays square to the face.
  const t0 = [T, T, T], t1 = [L - T, T, T], t3 = [T, L - T, T];
  const light = solid(`cube-${face.id}-${face.light}`, face.light, face, [
    [SQ[0], SQ[1], SQ[3]], [t0, t1, t3],
    [SQ[0], SQ[1], t1, t0], [SQ[3], SQ[0], t0, t3], [SQ[1], SQ[3], t3, t1]
  ]);
  const dark = solid(`cube-${face.id}-${face.dark}`, face.dark, face, [
    [SQ[1], SQ[2], SQ[3]], [SQ[1], SQ[3], t3, t1], [t0, t1, t3],
    // The two sides by the dark half, each split where the skin's corner meets its edge.
    [SQ[1], SQ[2], t1], [t1, SQ[2], APEX], [SQ[2], SQ[3], t3], [SQ[2], t3, APEX],
    // The two sides by the light half, below the skin.
    [t0, t1, APEX], [t3, t0, APEX]
  ]);
  return [dark, light];
}

/**
 * The parts of one cube: [{ name, color, v (mm), t }], eight closed meshes in four colors.
 * faces: "recessed" (the 1930s cubes, the default) or "flat".
 */
export function cubeParts(faces = "recessed") {
  return FACES.flatMap((f) => (f.color ? solidFace(f) : faces === "flat" ? flat(f) : recessed(f)));
}
