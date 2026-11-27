// lidart.js — the artwork on a Color Cubes lid: where the designs, the labels, the lettering and
// the stars go for a set of any size, as flat shapes in the four filament colors. The same
// shapes draw the preview (SVG) and, triangulated, become the lid's colored layer (print3d.js).
// MIT licensed (see LICENSE).
//
// Millimetres, seen from above, origin at the bottom-left corner of the lid's top, y up.
// Every shape that touches another of the same color shares its edge points with it exactly, so
// each color's layer comes out as one closed solid.

import { parseCode } from "./cubecode.js";
import { CELL_MM, coverage, presetSpec } from "./boxcode.js";
import { lidSize, topOutline, triangulate, orient } from "./print3d.js";

/** Preview colors (the printed set's, as in cubeface.js PRINTED_FLAT). */
export const SHOW = { white: "#FFFFFF", red: "#E5333B", yellow: "#F6CF4B", blue: "#2563B8" };
export const COLOR_IDS = ["white", "red", "yellow", "blue"];

/** The 1930s lid: 7×7, twelve designs round a blue panel with the original lettering (boxcode.js). */
export const CLASSIC = presetSpec("classic", 7, 7);

// Proportions measured from the 1930s lid (Isaac's cover, 200 mm): 39 mm spots with 3.4 mm to the
// frame and 10 mm between them, so of the room the spots leave, the two margins take about a
// fifth and the gaps the rest. Stars 4.7 mm across sit in the gaps.
const MARGIN = 0.0925;
const look = (d) => (d < 4 ? null : d < 8 ? { pair: "by", corner: d - 4 } : { pair: "rw", corner: d - 8 });
const SOLID = ["white", "red", "yellow", "blue"];

/** The dark color behind the cubes in a design: the frame's, if it's red or blue, else blue. */
export const grout = (spec) => (spec.frame === "red" || spec.frame === "blue" ? spec.frame : "blue");
/**
 * How far each cube sits inside its square, in mm. The lines between cubes (twice this) are
 * grooves in the printed face, so they must stay open after the first layer's squish: 0.7 mm
 * at the least, wider on bigger cubes.
 */
export const groutWidth = (cell) => Math.max(0.35, 0.045 * cell);

/**
 * Where everything goes, in millimetres; nothing is drawn yet. spec is a box design (boxcode.js);
 * codes, if given, is the tray code in each spot (null for an empty one), which decides where the
 * stars go. Returns { W, H, frame, field, cube, spots, labels, stars, gap }.
 */
export function layout(spec, codes) {
  const size = lidSize(spec.cols, spec.rows);
  const W = size.topW, H = size.topH;
  // Always a band round the edge, so the field's square corners stay inside the top's cut corners.
  // With no frame it takes the background color.
  const frame = Math.max(2.5, 0.02 * Math.min(W, H));
  const field = { x: frame, y: frame, w: W - 2 * frame, h: H - 2 * frame };
  const N = spec.grid, M = spec.gridRows ?? N, big = N === 1 && M === 1;
  // The same size of cube on every lid; only if a grid can't fit (it always does from 2 to 10
  // cubes a side) does it shrink.
  // One big design fills the lid instead.
  const K = Math.max(N, M);
  let cube = big ? Infinity : CELL_MM / K;
  cube = Math.min(cube, ((big ? 0.94 : 0.9) * field.w) / (N * spec.cols), ((big ? 0.94 : 0.9) * field.h) / (M * spec.rows));
  const sw = spec.cols * cube, sh = spec.rows * cube;
  // The room the spots leave goes a fifth to the margins, the rest to the gaps; across and down
  // get the same gap (the smaller), and whichever way has more room centers the grid in it.
  const gapFor = (len, n, s) => (n > 1 ? ((len - n * s) * (1 - 2 * MARGIN)) / (n - 1) : 0);
  const gap = big ? 0 : Math.min(...[[field.w, N, sw], [field.h, M, sh]].filter(([, n]) => n > 1).map(([len, n, s]) => gapFor(len, n, s)));
  const room = (len, n, s) => ({ m: (len - n * s - (n - 1) * gap) / 2, gap });
  const X = room(field.w, N, sw), Y = room(field.h, M, sh);
  const xs = Array.from({ length: N }, (_, c) => field.x + X.m + c * (sw + X.gap));
  // Rows count from the top; y is up, so a row's spots start lower the further down it is.
  const ys = Array.from({ length: M }, (_, r) => field.y + field.h - Y.m - r * (sh + Y.gap) - sh);
  const cover = coverage(spec);
  const out = { W, H, frame, field, cube, sw, sh, xs, ys, gap: { x: X.gap, y: Y.gap }, spots: [], labels: [], stars: [] };
  const empty = new Set(spec.empty);
  const has = (i) => (codes ? !!codes[i] : !empty.has(i));
  for (let i = 0; i < N * M; i++) {
    if (cover[i] >= 0) continue;
    const c = i % N, r = Math.floor(i / N);
    out.spots.push({ x: xs[c], y: ys[r], w: sw, h: sh, s: Math.max(sw, sh), i, c, r, design: has(i) });
  }
  // A label covers its spots and reaches into the gaps round them: most of the way toward a
  // design, half way toward another label, not at all at the edge of the field.
  spec.labels.forEach((l, k) => {
    const reach = (cells, gap) => {
      if (!cells.length) return 0;
      return cells.some((i) => cover[i] >= 0 && cover[i] !== k) ? 0.4 * gap : 0.74 * gap;
    };
    const col = (c) => (c < 0 || c >= N ? [] : Array.from({ length: l.h }, (_, j) => (l.r + j) * N + c));
    const row = (r) => (r < 0 || r >= M ? [] : Array.from({ length: l.w }, (_, j) => r * N + l.c + j));
    const x0 = xs[l.c] - reach(col(l.c - 1), X.gap);
    const x1 = xs[l.c + l.w - 1] + sw + reach(col(l.c + l.w), X.gap);
    const y1 = ys[l.r] + sh + reach(row(l.r - 1), Y.gap);
    const y0 = ys[l.r + l.h - 1] - reach(row(l.r + l.h), Y.gap);
    out.labels.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, k });
  });
  if (spec.stars !== "none" && !big) {
    // A star in the middle of the gap between two designs side by side.
    const rad = 0.235 * gap;
    for (let i = 0; i < N * M; i++) {
      if (cover[i] >= 0 || !has(i)) continue;
      const c = i % N, r = Math.floor(i / N);
      const right = i + 1, below = i + N;
      if (c + 1 < N && cover[right] < 0 && has(right)) out.stars.push({ x: xs[c] + sw + X.gap / 2, y: ys[r] + sh / 2, r: rad });
      if (r + 1 < M && cover[below] < 0 && has(below)) out.stars.push({ x: xs[c] + sw / 2, y: ys[r] - Y.gap / 2, r: rad });
    }
  }
  return out;
}

/** A five-pointed star, point up, as a counter-clockwise ring. */
export function starRing(cx, cy, r) {
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.382 : r;
    ring.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  return ring;
}

/**
 * Lay out a line of Rubik text. Returns polygons (in mm, y up) with the baseline at y = 0 and the
 * line starting at x = 0, and the line's width. cap is the capital height in mm.
 */
export function rubikLine(type, text, cap) {
  const em = cap / type.cap;
  const track = 0.03;
  let x = 0;
  const polys = [];
  for (const ch of text) {
    const g = type.glyphs[ch] || type.glyphs["?"];
    for (const poly of g.p) polys.push(poly.map((r) => r.map((v, i) => (i % 2 ? v * em : x + v * em))));
    x += (g.a + track) * em;
  }
  return { polys, w: Math.max(0, x - track * em) };
}

/**
 * The words in a label: the original lettering, or the label's lines in Rubik, as large as fits,
 * lined up left, centered or right. Returns { polys (text color), counters (label color),
 * stars, minCap (mm) }.
 */
export function lettering(label, box, type, { stars = true } = {}) {
  const pad = 0.08 * Math.min(box.w, box.h);
  let inner = { x: box.x + pad, y: box.y + pad, w: box.w - 2 * pad, h: box.h - 2 * pad };
  const deco = [];
  if (stars && label.style === "classic" && box.h > 0.45 * box.w) {
    // Two stars on the panel's middle line, above and below the words, as on the original.
    const r = Math.min(0.033 * box.w, 0.07 * box.h);
    deco.push({ x: box.x + box.w / 2, y: box.y + box.h - pad - r, r }, { x: box.x + box.w / 2, y: box.y + pad + r, r });
    inner = { ...inner, y: inner.y + 2.6 * r, h: inner.h - 5.2 * r };
  }
  const lines = [];
  if (label.style === "classic" && type.classic) {
    const c = type.classic;
    // Relative sizes from the cover: script, title and tag, with the cover's spacing.
    for (const [k, gap] of [["script", 0], ["title", 3.2], ["tag", 4.2]]) {
      lines.push({ w: c[k].w, h: c[k].h, gap, polys: c[k].p.map((poly) => poly.map((r) => r.map((v, i) => (i % 2 ? c[k].h - v : v)))), cap: k === "tag" ? 5.2 : k === "title" ? 23 : 8 });
    }
  } else {
    for (const line of label.lines.filter((l) => l.text.trim())) {
      const cap = line.big ? 10 : 4.5;
      const L = rubikLine(type.rubik, line.text.trim(), cap);
      const descent = type.rubik.desc * (cap / type.rubik.cap);
      lines.push({ w: L.w, h: cap + descent * 0.6, base: descent * 0.6, gap: lines.length ? cap * 0.55 : 0, polys: L.polys, cap });
    }
  }
  if (!lines.length) return { polys: [], counters: [], stars: deco, minCap: Infinity };
  const natW = Math.max(...lines.map((l) => l.w));
  const natH = lines.reduce((a, l) => a + l.h + l.gap, 0);
  const k = Math.min(inner.w / natW, inner.h / natH);
  let y = inner.y + inner.h / 2 + (natH * k) / 2; // top of the block
  const polys = [];
  const align = label.style === "classic" ? "c" : label.align;
  for (const l of lines) {
    y -= l.gap * k;
    const ox = align === "l" ? inner.x : align === "r" ? inner.x + inner.w - l.w * k : inner.x + (inner.w - l.w * k) / 2;
    const baseY = y - l.h * k + (l.base || 0) * k;
    for (const poly of l.polys) {
      // Classic lines are drawn from their own top-left corner (converted to y up above, so 0 is
      // the bottom); Rubik lines from their baseline.
      polys.push(poly.map((r) => r.map((v, i) => (i % 2 ? (l.base === undefined ? y - l.h * k + v * k : baseY + v * k) : ox + v * k))));
    }
    y -= l.h * k;
  }
  const counters = [];
  for (const p of polys) for (const hole of p.slice(1)) counters.push([hole]);
  return { polys, counters, stars: deco, minCap: Math.min(...lines.map((l) => l.cap * k)) };
}

/**
 * Every shape on the lid as { color, poly }, in drawing order, plus the facts worth showing.
 * codes is the tray code in each spot (boxcode.spotCodes), null where there's no design.
 */
export function shapes(spec, codes, type) {
  const L = layout(spec, codes);
  const out = [];
  const holes = [];
  const outline = topOutline(spec.cols, spec.rows);
  const f = L.field;
  const fieldRing = [f.x, f.y, f.x + f.w, f.y, f.x + f.w, f.y + f.h, f.x, f.y + f.h];
  out.push({ color: spec.frame === "none" ? spec.background : spec.frame, poly: [outline, fieldRing.slice()], frame: true });

  // Designs: each cube a square of two triangles, all at the lid's one cube size.
  const cells = [];
  let designs = 0;
  for (const sp of L.spots) {
    const t = codes && codes[sp.i] ? parseCode(codes[sp.i]) : null;
    if (!t || t.error) continue;
    designs++;
    const cell = Math.min(sp.w / t.w, sp.h / t.h);
    const x0 = sp.x + (sp.w - cell * t.w) / 2, y1 = sp.y + sp.h - (sp.h - cell * t.h) / 2;
    const xs = Array.from({ length: t.w + 1 }, (_, c) => x0 + c * cell);
    const ys = Array.from({ length: t.h + 1 }, (_, r) => y1 - (t.h - r) * cell); // bottom to top
    // Each cube sits a little inside its square, on a dark backing, so the cubes read as separate
    // tiles (white ones too, against a white lid) as on the printed lid. The backing starts two
    // layers up, so between the cubes the printed face has a groove: cubes of one color still
    // read apart, as do the outer cubes against a frame of their color. The backing reaches g
    // past the design, so the groove round its edge is as wide as the ones between cubes.
    const g = groutWidth(cell);
    const spot = [xs[0] - g, ys[0] - g, xs[t.w] + g, ys[0] - g, xs[t.w] + g, ys[t.h] + g, xs[0] - g, ys[t.h] + g];
    holes.push(spot);
    const tiles = [];
    for (let r = 0; r < t.h; r++) {
      for (let c = 0; c < t.w; c++) {
        const d = t.grid[r * t.w + c];
        const yT = ys[t.h - r] - g, yB = ys[t.h - r - 1] + g, xL = xs[c] + g, xR = xs[c + 1] - g;
        const TL = [xL, yT], TR = [xR, yT], BR = [xR, yB], BL = [xL, yB];
        tiles.push([xL, yB, xR, yB, xR, yT, xL, yT]);
        const lk = look(d);
        if (!lk) {
          cells.push({ color: SOLID[d], tri: [...BL, ...BR, ...TR] }, { color: SOLID[d], tri: [...BL, ...TR, ...TL] });
          continue;
        }
        const dark = lk.pair === "by" ? "blue" : "red", light = lk.pair === "by" ? "yellow" : "white";
        // The dark triangle has its square corner at TL, TR, BR or BL.
        const tris = [
          [[TL, TR, BL], [TR, BR, BL]],
          [[TR, BR, TL], [BR, BL, TL]],
          [[BR, BL, TR], [BL, TL, TR]],
          [[BL, TL, BR], [TL, TR, BR]]
        ][lk.corner];
        cells.push({ color: dark, tri: tris[0].flat() }, { color: light, tri: tris[1].flat() });
      }
    }
    out.push({ color: grout(spec), poly: [spot, ...tiles], under: true, groove: true });
  }

  // Labels: a block of color (or of the background) with the words on it.
  let minCap = Infinity;
  L.labels.forEach((p) => {
    const label = spec.labels[p.k];
    const fill = label.fill === "none" ? spec.background : label.fill;
    const ring = [p.x, p.y, p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.x, p.y + p.h];
    holes.push(ring);
    const text = lettering(label, p, type, { stars: spec.stars !== "none" });
    minCap = Math.min(minCap, text.minCap);
    const deco = text.stars.map((s) => starRing(s.x, s.y, s.r));
    out.push({ color: fill, poly: [ring, ...text.polys.map((g) => g[0]), ...deco] });
    for (const g of text.polys) out.push({ color: label.ink, poly: g });
    for (const c of text.counters) out.push({ color: fill, poly: c });
    for (const s of deco) out.push({ color: label.ink, poly: [s] });
  });
  for (const s of L.stars) {
    const ring = starRing(s.x, s.y, s.r);
    holes.push(ring);
    out.push({ color: spec.stars, poly: [ring] });
  }
  out.unshift({ color: spec.background, poly: [fieldRing, ...holes] });
  return {
    shapes: out, cells, layout: L,
    facts: { designs, cell: designs ? L.cube : null, cap: isFinite(minCap) ? minCap : null }
  };
}

/**
 * The art as triangles by color, for print3d.lidParts: { color, tris } for each color's layer,
 * and { color, tris, groove: true } for the backing behind the cubes, which starts higher up.
 */
export function artRegions(built) {
  const by = new Map();
  const add = (color, tris, groove = false) => {
    const k = color + (groove ? "/groove" : "");
    if (!by.has(k)) by.set(k, { color, tris: [], ...(groove ? { groove: true } : {}) });
    const list = by.get(k).tris;
    for (const v of tris) list.push(v);
  };
  for (const s of built.shapes) add(s.color, triangulate(orient(s.poly)), !!s.groove);
  for (const c of built.cells) add(c.color, c.tri);
  return [...by.values()];
}

const pathOf = (poly, H) => poly.map((r) => {
  let d = "";
  for (let i = 0; i < r.length; i += 2) d += (i ? "L" : "M") + r[i].toFixed(2) + " " + (H - r[i + 1]).toFixed(2);
  return d + "Z";
}).join("");

/** The lid as SVG, true size in millimetres. With layers, each color is its own group (for modelling). */
export function lidSVG(built, { layers = false, colors = SHOW, spotIds = false } = {}) {
  const { W, H } = built.layout;
  const groups = new Map();
  const add = (color, el) => { if (!groups.has(color)) groups.set(color, []); groups.get(color).push(el); };
  const fill = (c) => colors[c] || c;
  // The backing behind the cubes is printed two layers back, as grooves: shown a shade darker.
  const shade = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return "#" + [16, 8, 0].map((k) => Math.round(((n >> k) & 255) * 0.62).toString(16).padStart(2, "0")).join("");
  };
  for (const s of built.shapes) add(s.color, `<path d="${pathOf(s.poly, H)}" fill-rule="evenodd" fill="${fill(s.color)}"/>`);
  // Cells: merge each cube's two triangles' outlines so no hairlines show between them.
  for (const c of built.cells) add(c.color, `<path d="${pathOf([c.tri], H)}" fill="${fill(c.color)}" stroke="${fill(c.color)}" stroke-width="0.2" stroke-linejoin="round"/>`);
  let body;
  if (layers) {
    body = [...groups].map(([c, els]) => `<g id="${c}" inkscape:groupmode="layer" inkscape:label="${c}">${els.join("")}</g>`).join("");
  } else {
    // On screen, draw each shape's outline filled (holes and all) under what sits in its holes,
    // so no hairline of the page shows along shared edges.
    const solid = (s) => `<path d="${pathOf([s.poly[0]], H)}" fill="${s.groove ? shade(fill(s.color)) : fill(s.color)}"/>`;
    const holed = (s) => `<path d="${pathOf(s.poly, H)}" fill-rule="evenodd" fill="${fill(s.color)}"/>`;
    const [bg, ...rest] = built.shapes;
    body = solid(bg)
      + rest.filter((s) => s.under).map(solid).join("")
      + built.cells.map((c) => `<path d="${pathOf([c.tri], H)}" fill="${fill(c.color)}" stroke="${fill(c.color)}" stroke-width="0.2" stroke-linejoin="round"/>`).join("")
      + rest.filter((s) => !s.under).map((s) => (s.frame ? holed(s) : solid(s))).join("");
  }
  // For the box designer: a target over every spot and label, to tap and drag.
  const box = (b) => `x="${b.x.toFixed(2)}" y="${(H - b.y - b.h).toFixed(2)}" width="${b.w.toFixed(2)}" height="${b.h.toFixed(2)}"`;
  const spots = spotIds
    ? built.layout.spots.map((s) => `<rect class="spot${s.design ? "" : " empty"}" data-spot="${s.i}" ${box(s)}/>`).join("")
      + built.layout.labels.map((l) => `<rect class="label" data-label="${l.k}" ${box(l)}/>`).join("")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg"${layers ? ' xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"' : ""} width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">${body}${spots}</svg>`;
}
