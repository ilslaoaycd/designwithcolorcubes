// designs.js — designs for a tray of any size, made on the spot by mirroring or repeating a few
// simple rules, so every set size (square or not) has designs for the lid and the previews.
// Like the presets, nothing here only turns around its center (a pinwheel can read as a
// swastika): each design is mirrored across both center lines or repeated in rows.
// Pure functions, no DOM. MIT licensed (see LICENSE).
//
// A look is a digit 0–11 (see cubecode.js): 0 white, 1 red, 2 yellow, 3 blue, 4–7 blue/yellow
// with the blue corner at TL, TR, BR, BL, 8–11 red/white with the red corner the same way.

import { toReadable } from "./cubecode.js";

const W = 0, R = 1, Y = 2, B = 3;
const BY = (corner) => 4 + corner, RW = (corner) => 8 + corner;
const TL = 0, TR = 1, BR = 2, BL = 3;
const split = (d) => d >= 4;
const corner = (d, c) => (d < 8 ? 4 : 8) + c;
const mirrorLR = (d) => (split(d) ? corner(d, [1, 0, 3, 2][(d - 4) % 4]) : d);
const mirrorTB = (d) => (split(d) ? corner(d, [3, 2, 1, 0][(d - 4) % 4]) : d);
// The solid a split face falls back to on a middle row or column, where it can't mirror onto itself.
const flat = (d) => (d < 4 ? d : d < 8 ? B : R);

/**
 * Mirror the top-left quarter across both center lines. q(r, c, mr, mc) gives the look at row r,
 * column c of the quarter, which is mr rows by mc columns (the middle row and column included
 * when the size is odd).
 */
function quarter(w, h, q) {
  const mr = Math.ceil(h / 2), mc = Math.ceil(w / 2);
  const grid = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const rr = r < mr ? r : h - 1 - r, cc = c < mc ? c : w - 1 - c;
      let d = q(rr, cc, mr, mc);
      if ((w % 2 && cc === mc - 1) || (h % 2 && rr === mr - 1)) d = flat(d);
      if (c >= mc) d = mirrorLR(d);
      if (r >= mr) d = mirrorTB(d);
      grid.push(d);
    }
  }
  return grid;
}

/** Fill the tray from f(r, c). */
const each = (w, h, f) => Array.from({ length: w * h }, (_, i) => f(Math.floor(i / w), i % w));

const RECIPES = [
  ["Diamond", (w, h) => quarter(w, h, (r, c, mr, mc) => {
    const t = Math.min(mr, mc) - 1, s = r + c;
    return s < t ? W : s === t ? RW(BR) : R;
  })],
  ["Frames", (w, h) => each(w, h, (r, c) => [B, Y, B, W, R][Math.min(r, c, h - 1 - r, w - 1 - c) % 5])],
  ["Points to the middle", (w, h) => quarter(w, h, () => BY(BR))],
  ["Points outward", (w, h) => quarter(w, h, () => RW(TL))],
  ["Checkerboard", (w, h) => quarter(w, h, (r, c) => ((r + c) % 2 ? W : R))],
  ["Chevrons", (w, h) => each(w, h, (r, c) => (c % 2 ? BY(TL) : BY(TR)))],
  ["Crossed stripes", (w, h) => quarter(w, h, () => BY(TL))],
  ["Zigzag", (w, h) => each(w, h, (r, c) => (r % 2 ? RW(BL) : RW(TL)))],
  ["Cross", (w, h) => each(w, h, (r, c) => {
    const mid = (n, i) => (n % 2 ? i === (n - 1) / 2 : i === n / 2 || i === n / 2 - 1);
    return mid(w, c) || mid(h, r) ? W : B;
  })],
  ["Bow tie", (w, h) => quarter(w, h, (r, c) => (c > r ? Y : c === r ? BY(TR) : B))],
  ["Diagonal stripes", (w, h) => each(w, h, () => RW(TL))],
  ["Window", (w, h) => quarter(w, h, (r, c) => (r === 0 || c === 0 ? R : (r + c) % 2 ? BY(BR) : Y))]
];

/** Designs for a w × h tray: [{ id, name, w, h, code }], readable codes. */
export function makeDesigns(w, h) {
  return RECIPES.map(([name, f]) => ({
    id: "auto-" + name.toLowerCase().replace(/\W+/g, "-"),
    name, w, h,
    code: toReadable(f(w, h), w, h)
  }));
}

/**
 * Every design for a w × h tray, best first: for 7×7 the twelve from the 1930s lid, then the
 * presets drawn for this size, then the made-up ones above. patterns is /data/patterns.json.
 */
export function designsFor(w, h, patterns) {
  const lid = patterns && w === 7 && h === 7 ? patterns.lid : [];
  const presets = patterns ? patterns.presets.filter((p) => p.w === w && p.h === h) : [];
  const seen = new Set();
  const out = [];
  for (const p of [...lid, ...presets, ...makeDesigns(w, h)]) {
    if (seen.has(p.code)) continue;
    seen.add(p.code);
    out.push(p);
  }
  return out;
}
