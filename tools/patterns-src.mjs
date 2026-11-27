// patterns-src.mjs — face and tray helpers for making designs: transforms of a face, and small
// recipes (mirror a quarter, repeat a tile, a rule per cube) that build a tray. The preset designs
// themselves are listed as tray codes in tools/presets.mjs.
//
// A look is a digit 0–11 (see site/js/cubecode.js). In the recipes below a face is written with
// the tray-code letters: w r y b for solid faces, 1–4 for the blue/yellow face with its blue
// corner at top-left, top-right, bottom-right, bottom-left, and 5–8 for the red/white face with
// its red corner in the same four places.

import { CODE, turnOver } from "../site/js/cubecode.js";

const L = (ch) => CODE.indexOf(ch);
const isSplit = (d) => d >= 4;
const withCorner = (d, c) => (d < 8 ? 4 : 8) + c;
const cornerOf = (d) => (d - 4) % 4;

// Face transforms. Corners are numbered 0 TL, 1 TR, 2 BR, 3 BL.
export const mirrorLR = (d) => (isSplit(d) ? withCorner(d, [1, 0, 3, 2][cornerOf(d)]) : d);
export const mirrorTB = (d) => (isSplit(d) ? withCorner(d, [3, 2, 1, 0][cornerOf(d)]) : d);
export const turnCW = (d) => (isSplit(d) ? withCorner(d, (cornerOf(d) + 1) % 4) : d);
/** The tray turned over onto a table (see turnOver in cubecode.js). */
export const flipTray = (t) => ({ ...t, grid: turnOver(t.grid, t.w, t.h) });
// Swap the two color pairs: red/white faces become blue/yellow faces and back.
export const swapPairs = (d) => (isSplit(d) ? (d < 8 ? d + 4 : d - 4) : [2, 3, 0, 1][d]);

const rows = (s) => s.trim().split(/\s+/).map((r) => [...r].map(L));

/** A full tray written out row by row. */
export function plain(text) {
  const g = rows(text);
  return { w: g[0].length, h: g.length, grid: g.flat() };
}

/**
 * Mirror the top-left quarter across both center lines. For an odd size the quarter includes
 * the middle row and column, whose faces should be solid (a split face can't mirror onto itself).
 */
export function mirror4(quarter, n) {
  const q = rows(quarter);
  const m = Math.ceil(n / 2);
  const grid = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const rr = r < m ? r : n - 1 - r;
      const cc = c < m ? c : n - 1 - c;
      let d = q[rr][cc];
      if (c >= m) d = mirrorLR(d);
      if (r >= m) d = mirrorTB(d);
      grid.push(d);
    }
  }
  return { w: n, h: n, grid };
}

/** Repeat a small tile across the tray. */
export function repeat(tile, w, h, dx = 0, dy = 0) {
  const t = rows(tile);
  const grid = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) grid.push(t[(r + dy) % t.length][(c + dx) % t[0].length]);
  }
  return { w, h, grid };
}

/** Make a face from a rule f(row, col, n) that returns a tray-code letter. */
export function rule(n, f, h = n) {
  const grid = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < n; c++) grid.push(L(f(r, c, n)));
  return { w: n, h, grid };
}

export const map = (design, fn) => ({ ...design, grid: design.grid.map(fn) });

// ---------------------------------------------------------------------------------------------
// Distances used by rule() recipes.

const ring = (r, c, n) => Math.min(r, c, n - 1 - r, n - 1 - c);
const cheb = (r, c, n) => Math.max(Math.abs(r - (n - 1) / 2), Math.abs(c - (n - 1) / 2));
const diamondDist = (r, c, n) => Math.abs(r - (n - 1) / 2) + Math.abs(c - (n - 1) / 2);

export { ring, cheb, diamondDist };
