// cubeface.js — the shape of a Color Cube face, drawn as SVG (and shared with the designer's canvas).
// Used by the landing page, the designer and the artwork build, so every drawing of a cube
// matches. Pure functions: no DOM, no dependencies. MIT licensed (see LICENSE).
//
// A "look" is a digit 0–11, as in cubecode.js: 0–3 solid (white, red, yellow, blue),
// 4–7 blue/yellow with the blue corner at TL, TR, BR, BL, and 8–11 red/white the same way.
//
// The geometry is measured from an original cube (see artwork/assets/README.md): a 27.5 mm face
// whose light triangle sits inside a 1.7 mm rim of the dark color along its two outer edges.
// The triangle's long side lies exactly on the face's diagonal.

import { faceColors, parseCode } from "./cubecode.js";

/** Rim along the light triangle's outer edges, as a fraction of the face (1.7 mm of 27.5 mm). */
export const RIM = 1.7 / 27.5;
/** Corner rounding, as a fraction of the face. */
export const RADIUS = 0.05;
/** The thin worn edge drawn just inside each face, as a fraction of the face. */
export const EDGE = 0.015;

// A darker shade of each color for the worn edge, from the image pack's vector faces.
const SHADE = { "#F4ECD8": "#D9CDB0", "#C0272D": "#8F1C21", "#E3B23C": "#B98C24", "#1E2A5A": "#121A3A" };

/**
 * Flat stand-ins for the 3D-printed set's filament colors, read off the renders, keyed by the
 * solid colors above. Used by the logo and the link-preview pictures (opts.palette below).
 */
export const PRINTED_FLAT = { "#C0272D": "#E5333B", "#F4ECD8": "#FFFFFF", "#1E2A5A": "#2563B8", "#E3B23C": "#F6CF4B" };

/**
 * Everything needed to draw look d in a unit square (0..1):
 *   base   the color that fills the face (the dark color on a split face)
 *   shade  the edge color
 *   tri    the light triangle as three [x, y] points, already turned, or null for a solid face
 *   light  the light triangle's color, or null
 * opts.flat: no rim, the light triangle exactly half the face (as the flat printed cubes).
 */
export function faceGeometry(d, opts = {}) {
  const { bg, fg, corner } = faceColors(d);
  if (fg === null) return { base: bg, shade: SHADE[bg], tri: null, light: null };
  const m = opts.flat ? 0 : RIM;
  // Drawn for the dark corner at top-left, then turned a quarter per corner step about the centre.
  let pts = [[1 - m, 1 - m], [1 - m, m], [m, 1 - m]];
  for (let i = 0; i < corner; i++) pts = pts.map(([x, y]) => [1 - y, x]);
  return { base: fg, shade: SHADE[fg], tri: pts, light: bg };
}

const n = (v) => Math.round(v * 1000) / 1000;

/**
 * SVG markup (no <svg> wrapper) for one face in a box at (x, y) with side `s`.
 * opts.edge: draw the thin worn edge (default true). opts.radius: corner rounding, a fraction of
 * the face (default RADIUS; 0 for square corners). opts.palette: a map from the solid colors to
 * others, such as PRINTED_FLAT. opts.flat: no rim round the light triangle.
 */
export function faceShapes(d, x = 0, y = 0, s = 100, opts = {}) {
  const g = faceGeometry(d, opts);
  const pal = (c) => (opts.palette && opts.palette[c]) || c;
  const r = n((opts.radius === undefined ? RADIUS : opts.radius) * s);
  let out = `<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${r}" fill="${pal(g.base)}"/>`;
  if (g.tri) {
    out += `<polygon points="${g.tri.map(([px, py]) => n(x + px * s) + "," + n(y + py * s)).join(" ")}" fill="${pal(g.light)}"/>`;
  }
  if (opts.edge !== false) {
    const e = EDGE * s;
    out += `<rect x="${n(x + e / 2)}" y="${n(y + e / 2)}" width="${n(s - e)}" height="${n(s - e)}" rx="${n(Math.max(0, r - e / 2))}" fill="none" stroke="${g.shade}" stroke-width="${n(e)}" opacity="0.55"/>`;
  }
  return out;
}

/** A complete <svg> for one face. */
export function faceSVG(d, opts = {}) {
  const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${label}>${faceShapes(d, 0, 0, 100, opts)}</svg>`;
}

/**
 * A complete <svg> for a tray. `grid` is the row-major list of looks, w × h.
 * opts: gap (space between cubes, in cube widths; default 0.03), edge, radius, palette, label,
 * background (a color drawn behind the cubes and showing in the gaps; default none).
 */
export function traySVG(grid, w, h, opts = {}) {
  const s = 100;
  const gap = (opts.gap === undefined ? 0.03 : opts.gap) * s;
  const W = w * s + (w - 1) * gap;
  const H = h * s + (h - 1) * gap;
  let body = opts.background ? `<rect width="${n(W)}" height="${n(H)}" fill="${opts.background}"/>` : "";
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      body += faceShapes(grid[r * w + c], c * (s + gap), r * (s + gap), s, opts);
    }
  }
  const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}"${label}>${body}</svg>`;
}

/** A tray <svg> straight from a readable or compact code. Returns "" if the code can't be read. */
export function codeSVG(code, opts = {}) {
  const p = parseCode(code);
  return p.error ? "" : traySVG(p.grid, p.w, p.h, opts);
}

// The six faces of one cube, as the looks seen from outside with the cube sitting so that
// red faces you and blue is on top. Every Color Cube is painted the same way: red is opposite
// white, blue is opposite yellow, and on both split faces the dark triangle touches the red
// and blue sides.
export const CUBE = {
  front: 1,  // red
  back: 0,   // white
  top: 3,    // blue
  bottom: 2, // yellow
  right: 4,  // blue/yellow, blue corner toward the top front
  left: 9    // red/white, red corner toward the top front
};
