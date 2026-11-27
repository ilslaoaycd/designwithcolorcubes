// og.js — the link-preview picture for a shared tray: a 1200×630 PNG of the tray, drawn with the
// face geometry from cubeface.js in the printed set's colors (PRINTED_FLAT).
//
// The free Workers plan allows 10 ms of CPU a request, and a fresh Worker runs JavaScript
// unoptimized, so the drawing and compressing happen in WebAssembly (og.c, built to og.wasm by
// tools/build_og_wasm.sh), which runs at full speed from the first request. This file decides
// everything about the picture (the layout, and each look's colors and light triangle from
// cubeface.js), hands it to og.wasm as a small table, and gets the finished PNG back.
//
// The picture is built as rows of runs (a color index and a length): straight edges sit on
// whole pixels, and only the two or three pixels where a light triangle's 45° diagonal crosses a
// row are blended. rows() below is the reference for those runs; the tests check that og.wasm
// draws exactly the same pixels.

import { faceGeometry, RIM, PRINTED_FLAT } from "../../../site/js/cubeface.js";
import WASM from "./og.wasm"; // a compiled WebAssembly.Module (Wrangler's default for .wasm)

export const WIDTH = 1200;
export const HEIGHT = 630;

const BACKGROUND = "#ECEAE4"; // the hero's light grey
const TRAY = "#1E2A5A";       // navy, the site's ink color
const LEVELS = 16;            // blend steps along a diagonal
const BAND = 12;              // the four-color band along the bottom edge

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** The palette: background, tray, the four colors, then LEVELS-1 blends for each split pair. */
function buildPalette() {
  const colors = [BACKGROUND, TRAY, ...Object.values(PRINTED_FLAT)].map(hex);
  const index = { bg: 0, tray: 1 };
  Object.keys(PRINTED_FLAT).forEach((c, i) => { index[c] = 2 + i; });
  const blends = {};
  for (const [dark, light] of [["#C0272D", "#F4ECD8"], ["#1E2A5A", "#E3B23C"]]) {
    const a = hex(PRINTED_FLAT[dark]), b = hex(PRINTED_FLAT[light]);
    const row = [index[dark]];
    for (let k = 1; k < LEVELS; k++) {
      const t = k / LEVELS;
      row.push(colors.length);
      colors.push(a.map((v, j) => Math.round(v + (b[j] - v) * t)));
    }
    row.push(index[light]);
    blends[dark + light] = row; // row[k]: k/LEVELS of the light color
  }
  return { colors, index, blends };
}
const PAL = buildPalette();
export const PALETTE = PAL.colors;

/** The four colors along the bottom edge, as runs. */
const BAND_RUNS = [];
["#C0272D", "#E3B23C", "#1E2A5A", "tray"].forEach((col, i) =>
  BAND_RUNS.push(PAL.index[col], Math.round((i + 1) * WIDTH / 4) - Math.round(i * WIDTH / 4)));

/** Fraction of a unit pixel, centred `d` from a 45° line, that lies on the far side (0..1). */
function coverage(d) {
  // d is measured along the line's normal in units of x + y, so the pixel spans d in [-1, 1].
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return d >= 0 ? 1 - (1 - d) * (1 - d) / 2 : (1 + d) * (1 + d) / 2;
}

/** Where everything goes: the cube size, gaps and the tray's place, all in whole pixels. */
function layout(w, h) {
  const margin = 54, gapF = 0.05, padF = 0.22;
  const s = Math.floor(Math.min(
    (WIDTH - 2 * margin) / (w + (w - 1) * gapF + 2 * padF),
    (HEIGHT - 2 * margin) / (h + (h - 1) * gapF + 2 * padF)
  ));
  const gap = Math.max(2, Math.round(s * gapF));
  const pad = Math.max(6, Math.round(s * padF));
  const tw = w * s + (w - 1) * gap + 2 * pad, th = h * s + (h - 1) * gap + 2 * pad;
  return { s, gap, pad, tw, th, tx: Math.round((WIDTH - tw) / 2), ty: Math.round((HEIGHT - th) / 2), m: Math.max(1, Math.round(RIM * s)) };
}

/** Each split face's triangle, in the terms the row loop needs. */
function triangle(g) {
  // The light triangle is the rim box cut by the diagonal, on the side of its square corner.
  // Its diagonal is x + y = 1 or x - y = 0 in the face's own unit square.
  const [[qx, qy], [ax, ay]] = g.tri;
  const sum = Math.abs(ax + ay - 1) < 1e-9;
  const b = sum ? 1 : -1, c = sum ? 1 : 0;
  return { b, c, side: Math.sign(qx + b * qy - c), steps: PAL.blends[g.base + g.light] };
}

/**
 * The picture as rows of runs: an array of HEIGHT rows, each a flat array [value, length, …]
 * whose lengths add up to WIDTH. Neighbouring runs never share a value. Rows that are alike are
 * the same array. This is the reference og.c follows; the Worker itself doesn't call it.
 */
export function rows(grid, w, h) {
  const { s, m, gap, pad, tx, tw, ty, th } = layout(w, h);
  const tri = [], base = [];
  for (const d of grid) {
    const g = faceGeometry(d);
    tri.push(g.tri ? triangle(g) : null);
    base.push(PAL.index[g.base]);
  }
  const BG = PAL.index.bg, TR = PAL.index.tray;
  const right = WIDTH - tx - tw;
  const plain = [BG, WIDTH];
  const rim = [BG, tx, TR, tw, BG, right];
  const band = BAND_RUNS;

  const out = new Array(HEIGHT);
  let flat = null, flatRow = -1; // the rows of a row of cubes that miss every triangle are alike
  for (let y = 0; y < HEIGHT; y++) {
    if (y >= HEIGHT - BAND) { out[y] = band; continue; }
    if (y < ty || y >= ty + th) { out[y] = plain; continue; }
    const ry = y - ty - pad;
    const r = Math.floor(ry / (s + gap)), fy = ry - r * (s + gap); // row of cubes, and y within it
    if (ry < 0 || r >= h || fy >= s) { out[y] = rim; continue; }
    const crossing = fy >= m && fy < s - m;
    if (!crossing && flatRow === r) { out[y] = flat; continue; }

    // Each look's runs across this row of pixels, worked out once and reused for every cube.
    const memo = new Array(12);
    const run = [BG, tx, TR, pad];
    for (let c = 0, i = r * w; c < w; c++, i++) {
      if (c) run.push(TR, gap);
      const t = tri[i];
      if (!crossing || !t) { run.push(base[i], s); continue; }
      let f = memo[grid[i]];
      if (!f) {
        const { b, c: cu, side, steps } = t;
        const xa = m, xb = s - m; // the rim box, in the face's own pixels [xa, xb)
        // Signed distance from pixel x's centre to the diagonal: d(x) = side · (x + K).
        const K = 0.5 + b * (fy + 0.5) - cu * s;
        const lo = Math.min(xb, Math.max(xa, Math.floor(-1 - K)));
        const hi = Math.max(lo - 1, Math.min(xb - 1, Math.ceil(1 - K)));
        const B = base[i], light = steps[LEVELS];
        f = [B, xa];
        const add = (v, n) => {
          if (n <= 0) return;
          if (f[f.length - 2] === v) f[f.length - 1] += n; else f.push(v, n);
        };
        add(side > 0 ? B : light, lo - xa);
        for (let x = lo; x <= hi; x++) add(steps[Math.round(coverage(side * (x + K)) * LEVELS)], 1);
        add(side > 0 ? light : B, xb - 1 - hi);
        add(B, m);
        memo[grid[i]] = f;
      }
      // A face starts and ends in its base color, never the tray's, so nothing merges here.
      for (let k = 0; k < f.length; k++) run.push(f[k]);
    }
    run.push(TR, pad, BG, right);
    out[y] = run;
    if (!crossing) { flat = run; flatRow = r; }
  }
  return out;
}

// --- The WebAssembly half ---------------------------------------------------------------------

const LOOK = 23; // ints per look in og.c: base, light, hasTri, b, c, side, steps[LEVELS + 1]
const P_LOOKS = 32, P_GRID = P_LOOKS + 12 * LOOK;

/** Every look's colors and triangle, as og.c reads them. */
const LOOKS = (() => {
  const out = new Int32Array(12 * LOOK);
  for (let d = 0; d < 12; d++) {
    const g = faceGeometry(d), o = d * LOOK;
    out[o] = PAL.index[g.base];
    if (!g.tri) continue;
    const t = triangle(g);
    out[o + 1] = PAL.index[g.light];
    out[o + 2] = 1; out[o + 3] = t.b; out[o + 4] = t.c; out[o + 5] = t.side;
    out.set(t.steps, o + 6);
  }
  return out;
})();

let wasm = null;

/** The finished PNG for a parsed tray (2×2 to 10×10). */
export function trayPNG(grid, w, h) {
  if (!wasm) {
    wasm = new WebAssembly.Instance(WASM, {}).exports;
    new Uint8Array(wasm.memory.buffer, wasm.palette(), PAL.colors.length * 3).set(PAL.colors.flat());
  }
  const L = layout(w, h);
  const P = new Int32Array(wasm.memory.buffer, wasm.params(), P_GRID + 100);
  P.set([w, h, L.s, L.m, L.gap, L.pad, L.tx, L.tw, L.ty, L.th, PAL.index.bg, PAL.index.tray, BAND, PAL.colors.length]);
  P.set(BAND_RUNS, 14);
  P.set(LOOKS, P_LOOKS);
  P.set(grid, P_GRID);
  const n = wasm.render();
  return new Uint8Array(wasm.memory.buffer, wasm.png(), n).slice();
}
