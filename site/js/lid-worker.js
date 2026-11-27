// lid-worker.js — makes a lid's closed parts (print3d.js lidParts) off the page's main thread, for
// the print page and the box designer's 3D view: the lid's art layers are the heaviest thing the
// site builds, half a second or more on a phone. Gets { id, spec, codes, type } (type, lid-type.json,
// only once; later messages may leave it out) and answers { id, parts }: each part's name, color,
// vertices (Float64Array, the same numbers lidParts made, for the print files) and triangles
// (Uint32Array), and for the 3D view the triangles laid out flat with a normal per vertex and a
// bounding sphere, as three.js would work them out. Arrays are handed over without copying.
// MIT licensed.

import { shapes, artRegions } from "./lidart.js";
import { lidParts } from "./print3d.js";

let type = null;

/** Flat-shaded triangles for three.js: positions, face normals, and a sphere round them. */
function view(v, t) {
  const pos = new Float32Array(t.length * 3), nor = new Float32Array(t.length * 3);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) {
    const a = 3 * t[i], b = 3 * t[i + 1], c = 3 * t[i + 2];
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 3; k++) {
      const s = 3 * t[i + k], o = 3 * (i + k);
      for (let d = 0; d < 3; d++) {
        pos[o + d] = v[s + d];
        if (v[s + d] < lo[d]) lo[d] = v[s + d];
        if (v[s + d] > hi[d]) hi[d] = v[s + d];
      }
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
    }
  }
  const center = [0, 1, 2].map((d) => (lo[d] + hi[d]) / 2);
  let r2 = 0;
  for (let i = 0; i < v.length; i += 3) {
    const dx = v[i] - center[0], dy = v[i + 1] - center[1], dz = v[i + 2] - center[2];
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
  }
  return { pos, nor, sphere: [...center, Math.sqrt(r2)] };
}

self.onmessage = (e) => {
  const { id, spec, codes } = e.data;
  if (e.data.type) type = e.data.type;
  try {
    const parts = lidParts(spec.cols, spec.rows, artRegions(shapes(spec, codes, type)), { wallColor: spec.walls })
      .map((m) => ({ name: m.name, color: m.color, v: Float64Array.from(m.v), t: Uint32Array.from(m.t), view: view(m.v, m.t) }));
    self.postMessage({ id, parts }, parts.flatMap((p) => [p.v.buffer, p.t.buffer, p.view.pos.buffer, p.view.nor.buffer]));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
