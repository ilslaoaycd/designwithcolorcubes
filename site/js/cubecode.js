// cubecode.js — the Color Cubes tray code format.
// Shared by the designer (site/designer) and the colorcubes.org short-link Worker.
// Pure functions, no DOM, no dependencies. MIT licensed (see LICENSE).
//
// A tray is `w` columns × `h` rows of cubes (2–10 each). Each cube shows one of 12 looks,
// stored as a digit 0–11 in row-major order (top-left first).
//
// Two text forms of the same tray:
//   Readable: one character per cube, a dash between rows      686w313-868w131-…
//   Short:    "1" + one base-36 number holding the size, any symmetry and the cubes, squeezed
//             with an adaptive arithmetic coder (toCompact). What links and QR codes use.
//   Compact, first version (still read): size prefix + base-36 image number, fixed length
//                                                               77RNP42PXF425QXNXI6TDZEJNCRAEPDI013X
// See docs/tray-code.md for the full rules.

export const MIN_SIZE = 2;
export const MAX_SIZE = 10;

// Code character for each look, in digit order 0–11.
export const CODE = ["w", "r", "y", "b", "1", "2", "3", "4", "5", "6", "7", "8"];

// Shades from the Color Cubes reference (page 4). Fixed; not themed.
export const COLORS = {
  red: "#C0272D",
  white: "#F4ECD8", // cream, as on surviving sets
  blue: "#1E2A5A",  // navy
  yellow: "#E3B23C"
};

// Known editions (reference page 5). No. 14's size is inferred from its lid, not documented.
export const EDITIONS = [
  { w: 4, h: 4, set: "No. 4" },
  { w: 6, h: 6, set: "No. 14", inferred: true },
  { w: 7, h: 7, set: "No. 34", isDefault: true },
  { w: 9, h: 9, set: "No. 44" }
];

const SOLID_NAMES = ["white (cream)", "red", "yellow", "blue"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** Human description of a look (0–11). */
export function faceName(d) {
  if (d < 4) return "solid " + SOLID_NAMES[d];
  if (d < 8) return "blue/yellow, blue corner " + CORNERS[d - 4];
  return "red/white, red corner " + CORNERS[d - 8];
}

/** Fill and triangle colors for a look: { bg, fg|null, corner|null } where corner 0–3 = TL, TR, BR, BL. */
export function faceColors(d) {
  if (d < 4) return { bg: [COLORS.white, COLORS.red, COLORS.yellow, COLORS.blue][d], fg: null, corner: null };
  if (d < 8) return { bg: COLORS.yellow, fg: COLORS.blue, corner: d - 4 };
  return { bg: COLORS.white, fg: COLORS.red, corner: d - 8 };
}

/** The same face turned a quarter clockwise. Solids are unchanged. */
export function turn(d) {
  return d < 4 ? d : d - (d % 4) + ((d % 4) + 1) % 4;
}

/**
 * The face on the underside of a cube showing look d, as seen once the tray is turned over
 * left to right. Every cube is painted the same way: red is opposite white, blue opposite
 * yellow, and the blue/yellow face opposite the red/white face with their dark corners back to
 * back. Turning the tray over mirrors that corner left to right.
 */
export function underside(d) {
  if (d < 4) return [1, 0, 3, 2][d];
  const corner = [1, 0, 3, 2][d % 4];
  return (d < 8 ? 8 : 4) + corner;
}

/** The tray you see after turning it over onto a table, left side to right. */
export function turnOver(grid, w, h) {
  const out = new Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) out[r * w + (w - 1 - c)] = underside(grid[r * w + c]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Readable form
// ---------------------------------------------------------------------------

/** Canonical readable code: lowercase, one dash between rows. */
export function toReadable(grid, w, h) {
  const rows = [];
  for (let r = 0; r < h; r++) {
    rows.push(grid.slice(r * w, r * w + w).map((d) => CODE[d]).join(""));
  }
  return rows.join("-");
}

// ---------------------------------------------------------------------------
// Image number and compact form
// ---------------------------------------------------------------------------

const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lenCache = new Map();

/** Number of base-36 characters needed for any image of `cells` cubes (smallest L with 36^L >= 12^cells). */
export function compactLen(cells) {
  if (lenCache.has(cells)) return lenCache.get(cells);
  const target = 12n ** BigInt(cells);
  let L = 0;
  let p = 1n;
  while (p < target) { p *= 36n; L++; }
  lenCache.set(cells, L);
  return L;
}

/** Image number: the grid read as a base-12 number, top-left cube most significant. */
export function gridToId(grid) {
  let id = 0n;
  for (let i = 0; i < grid.length; i++) id = id * 12n + BigInt(grid[i]);
  return id;
}

export function idToGrid(id, cells) {
  const g = new Array(cells);
  for (let i = cells - 1; i >= 0; i--) { g[i] = Number(id % 12n); id = id / 12n; }
  return g;
}

/**
 * The first compact form: size prefix + zero-padded base-36 image number, fixed length per size.
 * Still read by parseCode; new links use toCompact (the short form below).
 */
export function toCompactV1(grid, w, h) {
  let n = gridToId(grid);
  let s = "";
  do { s = B36[Number(n % 36n)] + s; n = n / 36n; } while (n > 0n);
  return B36[w] + B36[h] + s.padStart(compactLen(w * h), "0");
}

// ---------------------------------------------------------------------------
// Parsing (accepts either form, any case)
// ---------------------------------------------------------------------------

/**
 * Parse a readable or compact code.
 * Returns { grid, w, h, kind: "readable"|"compact", filled } or { error }.
 * `filled` is how many missing cubes in short rows were filled with white (readable only).
 */
export function parseCode(input) {
  let s = String(input == null ? "" : input).trim().replace(/^#/, "");
  if (!s) return { error: "Type a code, or paint the tray." };

  // No separators anywhere means compact.
  if (!/[\s\-_]/.test(s)) {
    const up = s.toUpperCase();
    if (!/^[0-9A-Z]+$/.test(up)) return { error: "A compact code uses only 0–9 and A–Z." };
    if (up[0] === SHORT_MARK) return fromShort(up.slice(1));
    const w = B36.indexOf(up[0]);
    const h = B36.indexOf(up[1]);
    if (up.length < 3 || w < MIN_SIZE || w > MAX_SIZE || h < MIN_SIZE || h > MAX_SIZE) {
      return { error: "A compact code starts with the tray size: columns then rows, 2–9 or A for 10 (77 is 7×7). A readable code needs dashes between rows." };
    }
    const body = up.slice(2);
    const L = compactLen(w * h);
    if (body.length > L) return { error: "That's " + body.length + " characters after the size; a " + w + "×" + h + " code has " + L + "." };
    let n = 0n;
    for (const ch of body) n = n * 36n + BigInt(B36.indexOf(ch));
    if (n >= 12n ** BigInt(w * h)) return { error: "That compact code is past the last " + w + "×" + h + " image." };
    return { grid: idToGrid(n, w * h), w, h, kind: "compact", filled: 0 };
  }

  // Readable. Spaces and underscores count as dashes; repeated separators collapse.
  s = s.toLowerCase().replace(/[\s\-_]+/g, "-").replace(/^-|-$/g, "");
  const groups = s.split("-");
  const h = groups.length;
  if (h < MIN_SIZE) return { error: "A readable code needs at least 2 rows, with a dash between rows." };
  if (h > MAX_SIZE) return { error: "That code has " + h + " rows. Trays go up to 10." };
  let w = 0;
  for (const gr of groups) w = Math.max(w, gr.length);
  if (w < MIN_SIZE) return { error: "Rows need at least 2 cubes." };
  if (w > MAX_SIZE) {
    const r = groups.findIndex((gr) => gr.length > MAX_SIZE);
    return { error: "Row " + (r + 1) + " has " + groups[r].length + " cubes. Rows go up to 10." };
  }
  const grid = [];
  let filled = 0;
  for (let r = 0; r < h; r++) {
    const row = groups[r];
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      if (ch === undefined) { grid.push(0); filled++; continue; }
      const d = CODE.indexOf(ch);
      if (d < 0) return { error: "“" + ch + "” in row " + (r + 1) + " isn't a cube code. Use w, r, y, b or 1–8." };
      grid.push(d);
    }
  }
  return { grid, w, h, kind: "readable", filled };
}

// ---------------------------------------------------------------------------
// Short form: the compact code links and QR codes use now
// ---------------------------------------------------------------------------
//
// "1" then one base-36 number. Old compact codes start with the column count (2–9 or A), so a
// leading 1 can't be mistaken for one. The number is an arithmetic code of, in order:
//   columns − 2 and rows − 2 (1 of 9 each),
//   the layout (1 of 11): the symmetry the design has, or "crop" (white outside a rectangle),
//   for crop, the rectangle (left, top, width, height),
//   then each cube that isn't a copy of an earlier one, row by row.
// Cubes are coded with counts that adapt as the code goes: how often each look has come up so
// far, and how often it has followed the look to its left and the look above. Patterns repeat,
// so they come out short. The encoder tries every layout the tray allows and keeps the shortest.
// Exact arithmetic with BigInt, so the encoder and decoder always agree.

const SHORT_MARK = "1";

// Turning or mirroring a tray moves each cube and turns its look: the dark corner's new place.
const CORNER_MAP = {
  lr: [1, 0, 3, 2], tb: [3, 2, 1, 0], r180: [2, 3, 0, 1], r90: [1, 2, 3, 0], r270: [3, 0, 1, 2],
  tr: [0, 3, 2, 1], atr: [2, 1, 0, 3]
};
const MOVE = {
  lr: (r, c, w, h) => [r, w - 1 - c],
  tb: (r, c, w, h) => [h - 1 - r, c],
  r180: (r, c, w, h) => [h - 1 - r, w - 1 - c],
  r90: (r, c, w, h) => [c, w - 1 - r],
  r270: (r, c, w, h) => [h - 1 - c, r],
  tr: (r, c) => [c, r],
  atr: (r, c, w, h) => [w - 1 - c, h - 1 - r]
};
// Layouts 0–9 are symmetries (the 90° and diagonal ones only for square trays); 10 is crop.
const LAYOUTS = [[], ["lr"], ["tb"], ["r180"], ["lr", "tb", "r180"], ["r90", "r180", "r270"],
  ["lr", "tb", "r180", "r90", "r270", "tr", "atr"], ["tr"], ["atr"], ["tr", "atr", "r180"]];
const CROP = LAYOUTS.length;
const SQUARE_ONLY = new Set(["r90", "r270", "tr", "atr"]);
const moved = (d, t) => (d < 4 ? d : d - (d % 4) + CORNER_MAP[t][d % 4]);

function hasLayout(grid, w, h, g) {
  if (w !== h && g.some((t) => SQUARE_ONLY.has(t))) return false;
  for (const t of g) {
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const [r2, c2] = MOVE[t](r, c, w, h);
      if (grid[r2 * w + c2] !== moved(grid[r * w + c], t)) return false;
    }
  }
  return true;
}

// The adaptive model for cube looks. Integer counts, identical on both sides.
function cubeModel() {
  const G = new Array(12).fill(0);
  const CL = Array.from({ length: 13 }, () => new Array(12).fill(0));
  const CU = Array.from({ length: 13 }, () => new Array(12).fill(0));
  return {
    freqs(L, U) {
      const f = new Array(12);
      for (let s = 0; s < 12; s++) f[s] = 1 + 2 * G[s] + 8 * CL[L][s] + 8 * CU[U][s] + (s === L ? 2 : 0) + (s === U ? 2 : 0);
      return f;
    },
    see(L, U, s) { G[s]++; CL[L][s]++; CU[U][s]++; }
  };
}

/**
 * Walk the cubes a layout codes, row by row. For each coded cube, `code(freqs, i)` returns its
 * look (encoder: the real one; decoder: read from the stream); copies are filled in as it goes.
 * Returns the full grid.
 */
function walk(w, h, layout, rect, code) {
  const grid = new Array(w * h).fill(rect ? 0 : -1);
  const model = cubeModel();
  const g = layout === CROP ? [] : LAYOUTS[layout];
  const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0, cw = rect ? rect.w : w, ch = rect ? rect.h : h;
  for (let r = y0; r < y0 + ch; r++) {
    for (let c = x0; c < x0 + cw; c++) {
      const i = r * w + c;
      if (!rect && grid[i] !== -1) continue;
      const L = c > x0 ? grid[i - 1] : 12, U = r > y0 ? grid[i - w] : 12;
      const s = code(model.freqs(L, U), i);
      model.see(L, U, s);
      grid[i] = s;
      for (const t of g) {
        const [r2, c2] = MOVE[t](r, c, w, h);
        if (grid[r2 * w + c2] === -1) grid[r2 * w + c2] = moved(s, t);
      }
    }
  }
  return grid;
}

const sum = (f) => f.reduce((a, b) => a + b, 0);
const ones = (n) => new Array(n).fill(1);

// Arithmetic coder over exact fractions: the message is the interval [low/D, (low+range)/D).
function encoder() {
  let low = 0n, range = 1n, D = 1n;
  return {
    put(f, s) {
      let cum = 0;
      for (let k = 0; k < s; k++) cum += f[k];
      const tot = sum(f);
      low = low * BigInt(tot) + BigInt(cum) * range;
      range *= BigInt(f[s]);
      D *= BigInt(tot);
    },
    uniform(n, s) { this.put(ones(n), s); },
    /** The shortest base-36 string whose value, as a fraction, falls inside the interval. */
    finish() {
      for (let k = 1, S = 36n; ; k++, S *= 36n) {
        const x = (low * S + D - 1n) / D;
        if (x * D < (low + range) * S) {
          let out = "", n = x;
          for (let j = 0; j < k; j++) { out = B36[Number(n % 36n)] + out; n /= 36n; }
          return out;
        }
      }
    }
  };
}

function decoder(body) {
  let X = 0n, S = 1n;
  for (const ch of body) { X = X * 36n + BigInt(B36.indexOf(ch)); S *= 36n; }
  let low = 0n, range = 1n, D = 1n;
  return {
    get(f) {
      const tot = sum(f);
      const q = Number(((X * D - low * S) * BigInt(tot)) / (range * S));
      let s = 0, cum = 0;
      while (s < f.length - 1 && cum + f[s] <= q) { cum += f[s]; s++; }
      low = low * BigInt(tot) + BigInt(cum) * range;
      range *= BigInt(f[s]);
      D *= BigInt(tot);
      return s;
    },
    uniform(n) { return this.get(ones(n)); }
  };
}

const SIZES = MAX_SIZE - MIN_SIZE + 1;

function encodeWith(grid, w, h, layout, rect) {
  const e = encoder();
  e.uniform(SIZES, w - MIN_SIZE);
  e.uniform(SIZES, h - MIN_SIZE);
  e.uniform(LAYOUTS.length + 1, layout);
  if (rect) {
    e.uniform(w, rect.x);
    e.uniform(h, rect.y);
    e.uniform(w - rect.x, rect.w - 1);
    e.uniform(h - rect.y, rect.h - 1);
  }
  walk(w, h, layout, rect, (f, i) => { e.put(f, grid[i]); return grid[i]; });
  return e.finish();
}

/** Short code: uppercase, "1" + base 36, the shortest of every layout the tray allows (or the first form if that is shorter). */
export function toCompact(grid, w, h) {
  let best = null;
  const consider = (layout, rect) => {
    const body = encodeWith(grid, w, h, layout, rect);
    if (!best || body.length < best.length) best = body;
  };
  LAYOUTS.forEach((g, layout) => { if (hasLayout(grid, w, h, g)) consider(layout, null); });
  // Crop to the cubes that aren't white, when there's a white border to leave out.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  grid.forEach((d, i) => {
    if (!d) return;
    const r = Math.floor(i / w), c = i % w;
    x0 = Math.min(x0, c); y0 = Math.min(y0, r); x1 = Math.max(x1, c); y1 = Math.max(y1, r);
  });
  if (x1 < 0) consider(CROP, { x: 0, y: 0, w: 1, h: 1 });
  else if (x1 - x0 + 1 < w || y1 - y0 + 1 < h) consider(CROP, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  // A tray with no pattern at all can come out a little longer than the first form; never use more.
  const v1 = toCompactV1(grid, w, h);
  return SHORT_MARK.length + best.length <= v1.length ? SHORT_MARK + best : v1;
}

function fromShort(body) {
  if (!body) return { error: "That code is too short." };
  const d = decoder(body);
  const w = d.uniform(SIZES) + MIN_SIZE;
  const h = d.uniform(SIZES) + MIN_SIZE;
  const layout = d.uniform(LAYOUTS.length + 1);
  let rect = null;
  if (layout === CROP) {
    const x = d.uniform(w), y = d.uniform(h);
    rect = { x, y, w: d.uniform(w - x) + 1, h: d.uniform(h - y) + 1 };
  } else if (w !== h && LAYOUTS[layout].some((t) => SQUARE_ONLY.has(t))) {
    return { error: "That code isn't a tray." };
  }
  const grid = walk(w, h, layout, rect, (f) => d.get(f));
  return { grid, w, h, kind: "compact", filled: 0 };
}
