// print3d.js — 3D files for Color Cubes, made in the browser or in Node: a tray for any number of
// cubes, plates of cubes, and lids with artwork in four colors. Also writes STL, 3MF and zip.
// No dependencies beyond the vendored earcut. MIT licensed (see LICENSE).
//
// Units are millimetres, z up, the print bed at z = 0. Every part is a closed mesh with shared
// vertices, so slicers read it without repairs.
//
// The sizes copy Isaac's Fusion models of the 7×7 set (models/): a 26.95 mm printed cube, a tray
// whose pocket leaves 1.69 mm of play across seven cubes inside 2.83 mm walls, and a lid that
// clears the tray by 0.4 mm a side, 33 mm tall, printed artwork-down with the art in a 0.6 mm
// layer under a white plate. Inside, a ledge 2 mm wide holds the tray's rim, so the cubes stand
// clear of the artwork; the lines between the cubes on the lid are 0.4 mm grooves in its face.

import earcut from "./vendor/earcut.js";
import { cubeParts as makeCubeParts } from "./cubeparts.js";

export const CUBE = 26.95;
export const PLATE_GAP = 3;
export const TRAY = { play: 1.69, wall: 2.83, floor: 3, height: 18, chamfer: 2, edge: 1 };
export const LID = { clearance: 0.4, wall: 1.75, plate: 3, art: 0.6, groove: 0.4, chamfer: 3.26, height: 33, edge: 1, ledge: 2 };
/**
 * Slicer settings a lid needs (Bambu Studio and OrcaSlicer read them from the 3MF): no brim, as an
 * automatic brim rings every cube on the face and fills the grooves between them.
 */
export const LID_SETTINGS = { brim_type: "no_brim" };
/** Room a printer with one nozzle needs beside the lid for the tower it purges into between colors. */
export const TOWER = 45;
/** Top of the ledge inside the lid: the cubes stand this high above the plate, with 0.05 mm to spare. */
export const LEDGE_TOP = LID.plate + TRAY.floor + CUBE - TRAY.height + 0.05;

/** Filaments, in the order the 3MF lists them (the same order as models/3mf). */
export const FILAMENTS = [
  { id: "white", name: "White", hex: "#F4ECD8" },
  { id: "blue", name: "Blue", hex: "#1E2A5A" },
  { id: "yellow", name: "Yellow", hex: "#E3B23C" },
  { id: "red", name: "Red", hex: "#C0272D" }
];
const FIL_INDEX = Object.fromEntries(FILAMENTS.map((f, i) => [f.id, i]));

// ---------------------------------------------------------------------------------------------
// Sizes

/** Outside size of the tray for cols × rows cubes. */
export function traySize(cols, rows) {
  const pocket = (n) => n * CUBE + TRAY.play;
  return { w: pocket(cols) + 2 * TRAY.wall, h: pocket(rows) + 2 * TRAY.wall, pocketW: pocket(cols), pocketH: pocket(rows) };
}

/** Outside size of the lid, and the size of its printed top (inside the walls). */
export function lidSize(cols, rows) {
  const t = traySize(cols, rows);
  const iw = t.w + 2 * LID.clearance, ih = t.h + 2 * LID.clearance;
  return { w: iw + 2 * LID.wall, h: ih + 2 * LID.wall, topW: iw, topH: ih, height: LID.height };
}

/** Width of a square plate of k × k cubes. */
export const plateSize = (k) => k * CUBE + (k - 1) * PLATE_GAP;

/** Room left round each piece on the bed, in mm. */
export const BED_MARGIN = 10;
/** Common square bed sizes, smallest first, to say what fits. Brand-neutral on purpose. */
export const BEDS = [180, 220, 235, 256, 300, 350];

/**
 * The bed a set needs, long side first: in one color (the lid alone), and in four colors on a
 * printer with one nozzle, which purges into a tower beside the lid. square is the smallest
 * common square bed that takes the four-color lid (null if none does).
 */
export function beds(cols, rows) {
  const l = lidSize(cols, rows);
  const big = Math.max(l.w, l.h), small = Math.min(l.w, l.h);
  const one = [Math.ceil(big + BED_MARGIN), Math.ceil(small + BED_MARGIN)];
  const four = [Math.ceil(big + BED_MARGIN), Math.ceil(small + TOWER)].sort((a, b) => b - a);
  return { one, four, square: BEDS.find((b) => b >= four[0]) || null };
}

/**
 * The cubes' plates on a square bed: full plates of the biggest square that fits with its purge
 * tower beside it, then one for the rest. Returns { k, full, rest, count }.
 */
export function cubePlates(total, bed) {
  let k = 1;
  while (k < 10 && plateSize(k + 1) + Math.max(BED_MARGIN, TOWER) <= bed) k++;
  const full = Math.floor(total / (k * k)), rest = total - full * k * k;
  return { k, full, rest, count: full + (rest ? 1 : 0) };
}

// ---------------------------------------------------------------------------------------------
// Polygons. A ring is a flat array [x0, y0, x1, y1, ...]; a polygon is [outer, ...holes].

export function area(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return a / 2;
}
function reverse(ring) {
  const out = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
  return out;
}
/** Counter-clockwise (y up) outer ring and clockwise holes. */
export function orient(poly) {
  return poly.map((r, i) => ((area(r) > 0) === (i === 0) ? r : reverse(r)));
}

/** A rectangle with its corners cut at 45° by c. Counter-clockwise. */
export function chamferRect(x0, y0, x1, y1, c = 0) {
  if (c <= 0) return [x0, y0, x1, y0, x1, y1, x0, y1];
  return [x0 + c, y0, x1 - c, y0, x1, y0 + c, x1, y1 - c, x1 - c, y1, x0 + c, y1, x0, y1 - c, x0, y0 + c];
}

/** A rectangle whose sides pass through extra points: xs and ys are the cuts along each side. */
export function gridRect(x0, y0, x1, y1, xs, ys) {
  const r = [];
  for (const x of xs) r.push(x, y0);          // bottom, left to right (xs includes both ends)
  for (const y of ys.slice(1)) r.push(x1, y);  // right, upward
  for (const x of xs.slice(0, -1).reverse()) r.push(x, y1);
  for (const y of ys.slice(1, -1).reverse()) r.push(x0, y);
  return r;
}

/** Triangulate a polygon with holes into flat 2D triangles [ax, ay, bx, by, cx, cy, ...]. */
export function triangulate(poly) {
  const flat = [];
  const holes = [];
  for (let i = 0; i < poly.length; i++) {
    if (i) holes.push(flat.length / 2);
    for (const v of poly[i]) flat.push(v);
  }
  const idx = earcut(flat, holes, 2);
  const out = [];
  for (const k of idx) out.push(flat[2 * k], flat[2 * k + 1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Meshes

const KEY = 1e4; // vertices closer than 0.1 µm are the same vertex

export class Mesh {
  constructor(name = "part", color = "white") {
    this.name = name;
    this.color = color;
    this.v = [];
    this.t = [];
    this.index = new Map();
  }
  vert(x, y, z) {
    const k = Math.round(x * KEY) + "," + Math.round(y * KEY) + "," + Math.round(z * KEY);
    let i = this.index.get(k);
    if (i === undefined) {
      i = this.v.length / 3;
      this.v.push(x, y, z);
      this.index.set(k, i);
    }
    return i;
  }
  tri(a, b, c) {
    if (a !== b && b !== c && a !== c) this.t.push(a, b, c);
  }
  get triangles() { return this.t.length / 3; }
  bounds() {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.v.length; i++) {
      lo[i % 3] = Math.min(lo[i % 3], this.v[i]);
      hi[i % 3] = Math.max(hi[i % 3], this.v[i]);
    }
    return { lo, hi };
  }
}

/** A flat face of 2D triangles at height z, facing up or down. */
function face(mesh, tris, z, up) {
  for (let i = 0; i < tris.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = tris.slice(i, i + 6);
    const ccw = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
    const a = mesh.vert(ax, ay, z), b = mesh.vert(bx, by, z), c = mesh.vert(cx, cy, z);
    if (ccw === up) mesh.tri(a, b, c);
    else mesh.tri(a, c, b);
  }
}

/** One upright wall from (ax, ay) to (bx, by), facing right of that direction. */
function wall(mesh, ax, ay, bx, by, z0, z1) {
  const a0 = mesh.vert(ax, ay, z0), b0 = mesh.vert(bx, by, z0);
  const a1 = mesh.vert(ax, ay, z1), b1 = mesh.vert(bx, by, z1);
  mesh.tri(a0, b0, b1);
  mesh.tri(a0, b1, a1);
}

/** Upright walls along a ring from z0 to z1. An outer ring runs counter-clockwise, a hole clockwise. */
function walls(mesh, ring, z0, z1) {
  const n = ring.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    wall(mesh, ring[i], ring[i + 1], ring[j], ring[j + 1], z0, z1);
  }
}

/** A chamfered rectangle moved in by d on every side (its 45° corners move in by d too). */
export function insetRect(x0, y0, x1, y1, c, d) {
  return chamferRect(x0 + d, y0 + d, x1 - d, y1 - d, Math.max(0.01, c - d * (2 - Math.SQRT2)));
}

/**
 * A closed solid swept round a loop of rings: each step is [ring, z], every ring with the same
 * number of points and running counter-clockwise. The loop goes up the outside, across the top,
 * down the inside and back across the bottom; neighbouring rings are joined point to point, so
 * a step between two rings at one height makes a flat band.
 */
export function sweep(mesh, loop) {
  for (let k = 0; k < loop.length; k++) band(mesh, ...loop[k], ...loop[(k + 1) % loop.length]);
  return mesh;
}

/**
 * The band from ring A at za to ring B at zb (same number of points, both counter-clockwise).
 * Going up the outside it faces out; going down an inside (a pocket) it faces into the hollow.
 */
export function band(mesh, A, za, B, zb) {
  const n = A.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const ai = mesh.vert(A[i], A[i + 1], za), aj = mesh.vert(A[j], A[j + 1], za);
    const bi = mesh.vert(B[i], B[i + 1], zb), bj = mesh.vert(B[j], B[j + 1], zb);
    mesh.tri(ai, aj, bj);
    mesh.tri(ai, bj, bi);
  }
  return mesh;
}

/** Extrude polygons (with holes) from z0 to z1 into a closed solid. */
export function prism(mesh, polys, z0, z1) {
  for (const p of polys) {
    const poly = orient(p);
    const tris = triangulate(poly);
    face(mesh, tris, z0, false);
    face(mesh, tris, z1, true);
    for (const r of poly) walls(mesh, r, z0, z1);
  }
  return mesh;
}

/**
 * Extrude a set of 2D triangles that tile a region (sharing whole edges, no T-junctions) into
 * one closed solid: top and bottom faces from the triangles, walls only on the region's outline.
 */
export function slab(mesh, tris, z0, z1) {
  const P = (x, y) => Math.round(x * KEY) + "," + Math.round(y * KEY);
  tris = unpinch(tris, P);
  const edges = new Map(); // undirected key -> count
  const directed = [];
  for (let i = 0; i < tris.length; i += 6) {
    let [ax, ay, bx, by, cx, cy] = tris.slice(i, i + 6);
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [bx, by, cx, cy] = [cx, cy, bx, by];
    for (const [px, py, qx, qy] of [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]]) {
      const p = P(px, py), q = P(qx, qy);
      const k = p < q ? p + "|" + q : q + "|" + p;
      edges.set(k, (edges.get(k) || 0) + 1);
      directed.push([k, px, py, qx, qy]);
    }
  }
  face(mesh, tris, z0, false);
  face(mesh, tris, z1, true);
  for (const [k, px, py, qx, qy] of directed) if (edges.get(k) === 1) wall(mesh, px, py, qx, qy, z0, z1);
  return mesh;
}

/**
 * Where two parts of a region touch only at a corner (a checkerboard of one color, say), the
 * extruded walls would meet along an edge shared by four faces, which slicers call non-manifold.
 * Give each separate fan of triangles round such a corner its own copy of the point, moved
 * 1 µm into that fan, so every edge ends up with exactly two faces.
 */
function unpinch(tris, P) {
  tris = tris.slice();
  const at = new Map(); // point key -> [triangle index, corner]
  for (let i = 0; i < tris.length; i += 6) {
    for (let c = 0; c < 3; c++) {
      const k = P(tris[i + 2 * c], tris[i + 2 * c + 1]);
      if (!at.has(k)) at.set(k, []);
      at.get(k).push([i, c]);
    }
  }
  for (const list of at.values()) {
    if (list.length < 2) continue;
    // Fans: triangles round this point joined when they share another point.
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const others = list.map(([i, c]) => [1, 2].map((d) => P(tris[i + 2 * ((c + d) % 3)], tris[i + 2 * ((c + d) % 3) + 1])));
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (others[a].some((k) => others[b].includes(k))) parent[find(a)] = find(b);
      }
    }
    const fans = new Map();
    list.forEach((_, a) => { const r = find(a); if (!fans.has(r)) fans.set(r, []); fans.get(r).push(a); });
    if (fans.size < 2) continue;
    [...fans.values()].slice(1).forEach((fan) => {
      let cx = 0, cy = 0;
      for (const a of fan) {
        const [i] = list[a];
        cx += (tris[i] + tris[i + 2] + tris[i + 4]) / 3;
        cy += (tris[i + 1] + tris[i + 3] + tris[i + 5]) / 3;
      }
      const [i0, c0] = list[fan[0]];
      const px = tris[i0 + 2 * c0], py = tris[i0 + 2 * c0 + 1];
      cx = cx / fan.length - px;
      cy = cy / fan.length - py;
      const l = Math.hypot(cx, cy) || 1;
      const nx = px + (cx / l) * 1e-3, ny = py + (cy / l) * 1e-3;
      for (const a of fan) {
        const [i, c] = list[a];
        tris[i + 2 * c] = nx;
        tris[i + 2 * c + 1] = ny;
      }
    });
  }
  return tris;
}

/** Check a mesh is closed: every edge is used once in each direction. Returns the bad edge count. */
export function openEdges(mesh) {
  const count = new Map();
  for (let i = 0; i < mesh.t.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.t[i + e], b = mesh.t[i + (e + 1) % 3];
      const k = a + "," + b;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, n] of count) {
    const [a, b] = k.split(",");
    if (count.get(b + "," + a) !== n) bad++;
  }
  return bad;
}

// ---------------------------------------------------------------------------------------------
// The tray

/** A tray for cols × rows cubes: one part. Its corner sits at the origin. */
export function trayParts(cols, rows) {
  const s = traySize(cols, rows);
  const m = new Mesh(`tray-${cols}x${rows}`, "white");
  const e = TRAY.edge, H = TRAY.height;
  // The top edges, outside and round the pocket, are chamfered by 1 mm.
  const outer = chamferRect(0, 0, s.w, s.h, TRAY.chamfer);
  const outerTop = insetRect(0, 0, s.w, s.h, TRAY.chamfer, e);
  const pocket = chamferRect(TRAY.wall, TRAY.wall, s.w - TRAY.wall, s.h - TRAY.wall, 0);
  const pocketTop = chamferRect(TRAY.wall - e, TRAY.wall - e, s.w - TRAY.wall + e, s.h - TRAY.wall + e, 0);
  face(m, triangulate([outer]), 0, false);
  walls(m, outer, 0, H - e);
  band(m, outer, H - e, outerTop, H);
  face(m, triangulate([outerTop, reverse(pocketTop)]), H, true);
  band(m, pocketTop, H, pocket, H - e);
  walls(m, reverse(pocket), TRAY.floor, H - e);
  face(m, triangulate([pocket]), TRAY.floor, true);
  return [m];
}

// ---------------------------------------------------------------------------------------------
// Cubes. One cube is eight closed parts in four colors (cubeparts.js): a pyramid for each solid
// face, and the dark half and the light skin of each split face, recessed or flat.

/** The cube's parts as meshes. faces: "recessed" (as the 1930s cubes) or "flat". */
export function cubeParts(faces = "recessed") {
  return makeCubeParts(faces).map((p) => {
    const m = new Mesh(p.name, p.color);
    m.v = p.v;
    m.t = p.t;
    return m;
  });
}

/** Offsets of k × k cubes on a plate, 3 mm apart. */
export function plateOffsets(k, count = k * k) {
  const out = [];
  for (let i = 0; i < count; i++) out.push([(i % k) * (CUBE + PLATE_GAP), Math.floor(i / k) * (CUBE + PLATE_GAP), 0]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The lid. `art` is a list of { color, tris } in top-view millimetres, origin at the top's
// bottom-left corner (inside the walls), y up. The lid prints face-down, so the art is mirrored
// left to right into the model.

/** The outline of the lid's printed top, in its own frame (origin at its bottom-left corner). */
export function topOutline(cols, rows) {
  const s = lidSize(cols, rows);
  return chamferRect(0, 0, s.topW, s.topH, TOP_CHAMFER);
}
const TOP_CHAMFER = Math.max(0.5, LID.chamfer - LID.wall * 0.414);

/** The opening the ledge inside the lid leaves: the tray's outside less 2 mm a side. */
export function ledgeOpening(cols, rows) {
  const s = lidSize(cols, rows);
  const d = LID.wall + LID.clearance + LID.ledge; // from the lid's outside to the ledge's edge
  return insetRect(LID.wall, LID.wall, s.w - LID.wall, s.h - LID.wall, TOP_CHAMFER, d - LID.wall);
}

export function lidParts(cols, rows, art, { wallColor = "red" } = {}) {
  const s = lidSize(cols, rows);
  const w = LID.wall, e = LID.edge, Ht = LID.height;
  const inner = chamferRect(w, w, s.w - w, s.h - w, TOP_CHAMFER);
  const outer = chamferRect(0, 0, s.w, s.h, LID.chamfer);
  const outerEdge = insetRect(0, 0, s.w, s.h, LID.chamfer, e);
  const ledge = ledgeOpening(cols, rows);
  const parts = [];
  // The walls, as printed (face down): chamfered 1 mm at the face and at the rim; inside, from
  // the plate up to LEDGE_TOP, a ledge the tray's rim rests on.
  const walls = new Mesh(`lid-walls-${wallColor}`, wallColor);
  sweep(walls, [
    [outerEdge, 0], [outer, e], [outer, Ht - e], [outerEdge, Ht],
    [inner, Ht], [inner, LEDGE_TOP], [ledge, LEDGE_TOP], [ledge, LID.plate], [inner, LID.plate], [inner, 0]
  ]);
  parts.push(walls);
  const top = new Mesh("lid-top-white", "white");
  prism(top, [[inner]], LID.art, LID.plate);
  parts.push(top);
  // The art covers the whole top. Mirror x for printing face-down and move it inside the walls.
  // Each color is one layer from the face up; the backing behind the cubes starts two layers
  // up, leaving grooves in the face between the cubes.
  const byKey = new Map();
  for (const r of art) {
    const k = r.color + (r.groove ? "/groove" : "");
    const list = byKey.get(k) || [];
    for (let i = 0; i < r.tris.length; i += 2) list.push(s.w - w - r.tris[i], w + r.tris[i + 1]);
    byKey.set(k, list);
  }
  for (const groove of [false, true]) {
    for (const f of FILAMENTS) {
      const tris = byKey.get(f.id + (groove ? "/groove" : ""));
      if (!tris || !tris.length) continue;
      parts.push(slab(new Mesh(`lid-${groove ? "grout" : "art"}-${f.id}`, f.id), tris, groove ? LID.groove : 0, LID.art));
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Writers

/** Binary STL of one or more meshes (offset by [dx, dy, dz] each, if given). */
export function toSTL(meshes, offsets = [[0, 0, 0]]) {
  meshes = [].concat(meshes);
  let n = 0;
  for (const m of meshes) n += m.triangles * offsets.length;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  const head = "Color Cubes, designwithcolorcubes.org";
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  let o = 84;
  for (const [dx, dy, dz] of offsets) {
    for (const m of meshes) {
      const v = m.v;
      for (let i = 0; i < m.t.length; i += 3) {
        const p = [m.t[i], m.t[i + 1], m.t[i + 2]].map((k) => [v[3 * k] + dx, v[3 * k + 1] + dy, v[3 * k + 2] + dz]);
        const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
        const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (const f of [nx, ny, nz, ...p[0], ...p[1], ...p[2]]) { dv.setFloat32(o, f, true); o += 4; }
        o += 2;
      }
    }
  }
  return new Uint8Array(buf);
}

const num = (x) => {
  const s = x.toFixed(4);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Bambu Studio and OrcaSlicer paint codes for filaments 1 to 4 (their "paint_color" attribute).
const PAINT = ["4", "8", "0C", "1C"];

/**
 * Lay out objects for a 3MF: ids for every part mesh and for one parent object per copy (Bambu
 * Studio and OrcaSlicer load each build item as an object of its own, so each copy gets one to
 * carry its filaments). objects is a list of { name, parts: [Mesh], items: [[dx, dy, dz], ...],
 * paint?, settings? }: paint puts each part's filament on its triangles as Bambu/OrcaSlicer
 * paint (for the cubes, as in Isaac's project; on a lid it bleeds colors between layers), and
 * settings are slicer settings for the object, such as { brim_type: "no_brim" }.
 */
function plan3MF(objects) {
  let id = 2;
  return objects.map((o) => {
    const parts = o.parts.map((m) => ({ m, id: id++ }));
    const copies = (o.items || [[0, 0, 0]]).map((at, k) => ({ id: id++, at, name: k ? `${o.name} ${k + 1}` : o.name }));
    return { parts, copies, paint: !!o.paint, settings: o.settings || {} };
  });
}

/**
 * A 3MF model (the XML) laid out like the files in models/3mf: one mesh object per color part,
 * a parent object made of those parts for each copy, and one build item per copy. Objects
 * marked paint carry Bambu/OrcaSlicer paint in each part's filament, which other slicers ignore.
 */
export function modelXML(objects, meta = {}, filaments = FILAMENTS) {
  const out = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`);
  const md = { Title: "Color Cubes", Designer: "Isaac Lloyd", LicenseTerms: "CC BY 4.0", Description: "Design With Color Cubes, https://designwithcolorcubes.org", ...meta };
  for (const [k, v] of Object.entries(md)) out.push(` <metadata name="${k}">${xmlEsc(v)}</metadata>\n`);
  out.push(` <resources>\n  <basematerials id="1">\n`);
  // Same order as FILAMENTS, so a part's pindex stays put when the colors are swapped for others.
  for (const f of FILAMENTS) {
    const g = filaments.find((x) => x.id === f.id) || f;
    out.push(`   <base name="${xmlEsc(g.name)}" displaycolor="${g.hex.toUpperCase()}FF"/>\n`);
  }
  out.push(`  </basematerials>\n`);
  const build = [];
  for (const { parts, copies, paint } of plan3MF(objects)) {
    for (const { m, id } of parts) {
      const fi = FIL_INDEX[m.color] ?? 0;
      out.push(`  <object id="${id}" type="model" name="${xmlEsc(m.name)}" pid="1" pindex="${fi}">\n   <mesh>\n    <vertices>\n`);
      const v = m.v;
      const rows = [];
      for (let i = 0; i < v.length; i += 3) rows.push(`     <vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>`);
      out.push(rows.join("\n"), "\n    </vertices>\n    <triangles>\n");
      const tr = [];
      const extra = paint ? ` paint_color="${PAINT[fi]}"` : "";
      for (let i = 0; i < m.t.length; i += 3) tr.push(`     <triangle v1="${m.t[i]}" v2="${m.t[i + 1]}" v3="${m.t[i + 2]}"${extra}/>`);
      out.push(tr.join("\n"), "\n    </triangles>\n   </mesh>\n  </object>\n");
    }
    for (const c of copies) {
      out.push(`  <object id="${c.id}" type="model" name="${xmlEsc(c.name)}">\n   <components>\n`);
      for (const p of parts) out.push(`    <component objectid="${p.id}"/>\n`);
      out.push(`   </components>\n  </object>\n`);
      const [dx, dy, dz] = c.at;
      build.push(`  <item objectid="${c.id}" transform="1 0 0 0 1 0 0 0 1 ${num(dx)} ${num(dy)} ${num(dz)}"/>`);
    }
  }
  out.push(` </resources>\n <build>\n${build.join("\n")}\n </build>\n</model>\n`);
  return out.join("");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/**
 * Bambu Studio and OrcaSlicer ignore the 3MF's materials but read their own settings file, so
 * every part opens on its filament (1 white, 2 blue, 3 yellow, 4 red, as in FILAMENTS).
 */
export function modelSettings(objects) {
  const out = [`<?xml version="1.0" encoding="UTF-8"?>\n<config>\n`];
  for (const { parts, copies, settings } of plan3MF(objects)) {
    const ext = (m) => (FIL_INDEX[m.color] ?? 0) + 1;
    for (const c of copies) {
      out.push(` <object id="${c.id}">\n  <metadata key="name" value="${xmlEsc(c.name)}"/>\n  <metadata key="extruder" value="${ext(parts[0].m)}"/>\n`);
      for (const [k, v] of Object.entries(settings)) out.push(`  <metadata key="${xmlEsc(k)}" value="${xmlEsc(v)}"/>\n`);
      for (const { m, id } of parts) {
        out.push(`  <part id="${id}" subtype="normal_part">\n   <metadata key="name" value="${xmlEsc(m.name)}"/>\n   <metadata key="extruder" value="${ext(m)}"/>\n  </part>\n`);
      }
      out.push(` </object>\n`);
    }
  }
  out.push(`</config>\n`);
  return out.join("");
}

/**
 * A 3MF file (zip bytes). filaments, if given, swaps the four colors for others: a list of
 * { id: "white" | "red" | "yellow" | "blue", name, hex } in any order.
 */
export function to3MF(objects, meta, filaments) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", RELS],
    ["3D/3dmodel.model", modelXML(objects, meta, filaments)],
    ["Metadata/model_settings.config", modelSettings(objects)]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Zip (deflated when CompressionStream exists, else stored)

let CRC;
function crc32(bytes) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("deflate-raw");
  const res = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await res.arrayBuffer());
}

/** Zip entries [[name, string | Uint8Array], ...]. Resolves to the zip's bytes. */
export async function zip(entries) {
  const enc = new TextEncoder();
  const files = [];
  for (const [name, data] of entries) {
    const raw = typeof data === "string" ? enc.encode(data) : data;
    const packed = await deflate(raw);
    const use = packed && packed.length < raw.length;
    files.push({ name: enc.encode(name), raw, data: use ? packed : raw, method: use ? 8 : 0, crc: crc32(raw) });
  }
  let size = 22;
  for (const f of files) size += 30 + f.name.length + f.data.length + 46 + f.name.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let o = 0;
  const local = [];
  for (const f of files) {
    local.push(o);
    dv.setUint32(o, 0x04034b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 0x0800, true);
    dv.setUint16(o + 8, f.method, true); dv.setUint32(o + 10, 0, true);
    dv.setUint32(o + 14, f.crc, true); dv.setUint32(o + 18, f.data.length, true); dv.setUint32(o + 22, f.raw.length, true);
    dv.setUint16(o + 26, f.name.length, true); dv.setUint16(o + 28, 0, true);
    out.set(f.name, o + 30);
    out.set(f.data, o + 30 + f.name.length);
    o += 30 + f.name.length + f.data.length;
  }
  const cd = o;
  files.forEach((f, i) => {
    dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true); dv.setUint16(o + 8, 0x0800, true);
    dv.setUint16(o + 10, f.method, true); dv.setUint32(o + 12, 0, true);
    dv.setUint32(o + 16, f.crc, true); dv.setUint32(o + 20, f.data.length, true); dv.setUint32(o + 24, f.raw.length, true);
    dv.setUint16(o + 28, f.name.length, true); dv.setUint16(o + 30, 0, true); dv.setUint16(o + 32, 0, true);
    dv.setUint16(o + 34, 0, true); dv.setUint16(o + 36, 0, true); dv.setUint32(o + 38, 0, true); dv.setUint32(o + 42, local[i], true);
    out.set(f.name, o + 46);
    o += 46 + f.name.length;
  });
  dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 8, files.length, true); dv.setUint16(o + 10, files.length, true);
  dv.setUint32(o + 12, o - cd, true); dv.setUint32(o + 16, cd, true);
  return out.subarray(0, o + 22);
}
