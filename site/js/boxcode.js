// boxcode.js — a box design (the lid and tray for a set of any size) as a short code for links.
// Shared by the box designer, the download page and the colorcubes.org short-link Worker.
// Pure functions, no DOM, no dependencies beyond cubecode.js. MIT licensed (see LICENSE).
//
// The lid's top is a grid of spots, `grid` across and `gridRows` down (1–6 each). Every spot
// shows a design the size of the set (cols × rows cubes), always drawn at the same scale: a cube
// on the lid is CELL_MM / (the larger of the two) millimetres whatever the size of the set, so a
// bigger set has bigger spots and the grid keeps the same rhythm. Square sets get 4 × 4 spots;
// other shapes get the grid and title panel that suit them (fitGrid). Labels (the title panel, or
// any words) cover a block of spots; every other spot shows a design unless it has been emptied.
//
// A design as data:
//   { cols, rows, grid, gridRows, frame, background, stars, walls, same,
//     labels: [{ c, r, w, h, fill, ink, align, style, lines: [{ text, big }] }],
//     picks: { [spot]: readable tray code }, empty: [spot, ...], one: code | null }
// Spots are numbered row by row from the top left: spot = r * grid + c.
//
// As a link: /box/{cols}x{rows}/{token}?t=line~line&t=… The token is base64url of a few packed
// bytes, then "~" and a compact tray code for each picked spot. Words go in the query as
// themselves, one t per label, lines split by "~".

import { parseCode, toReadable, toCompact } from "./cubecode.js";

export const COLOR_IDS = ["white", "red", "yellow", "blue"];
export const MIN = 2, MAX = 10;
export const GRID_MIN = 1, GRID_MAX = 6;
/** A cube on the lid is CELL_MM / grid millimetres: the 1930s lid's 39 mm spots hold 7 cubes, 4 across. */
export const CELL_MM = (39 / 7) * 4;

const ALIGN = ["c", "l", "r"];
const STYLES = ["rubik", "classic"];
const OPT = ["none", ...COLOR_IDS];

export const clampSize = (n) => Math.max(MIN, Math.min(MAX, Math.round(Number(n) || 7)));

/** The 1930s lid's title panel: the middle of a 4 × 4 grid, blue, with the original lettering. */
export const CLASSIC_PANEL = { c: 1, r: 1, w: 2, h: 2, fill: "blue", ink: "white", align: "c", style: "classic", lines: [] };

/** The 1930s panel needs room for its lettering: sets of at least 6 × 6. */
export const classicFits = (cols, rows) => cols >= 6 && rows >= 6;

// The lid's printed top, as print3d.js lidSize() works it out (a test holds the two equal); kept
// here so the short-link Worker needn't load the mesh code.
const TOP = (n) => n * 26.95 + 1.69 + 2 * 2.83 + 2 * 0.4;
const SPOT_MARGIN = 0.34;  // the margin round the grid, as a share of a gap (the 1930s lid)

/**
 * The grid of spots, and the title panel's place, that suit a set: square sets get the 1930s
 * 4 × 4 with a 2 × 2 panel in the middle. Other shapes try 4 spots the long way and 2 to 4 the
 * other (the same cube scale) with centered panels, and keep the one that wastes least of the lid, keeps the gaps even
 * and roomy, leaves a panel shaped for lettering (no taller than 4:3, no wider than 9:5) and still
 * shows at least eight designs. withPanel false: only the grid. Returns { gx, gy, panel | null }.
 */
export function fitGrid(cols, rows, withPanel = true) {
  if (cols === rows) return { gx: 4, gy: 4, panel: withPanel ? { c: 1, r: 1, w: 2, h: 2 } : null };
  const W = TOP(cols), H = TOP(rows);
  const frame = Math.max(2.5, 0.02 * Math.min(W, H));
  const fw = W - 2 * frame, fh = H - 2 * frame;
  const s = CELL_MM / 4, sw = cols * s, sh = rows * s;
  let best = null;
  // The longer way always has 4 spots, so a cube on the lid stays CELL_MM / 4 for every set.
  for (let gx = 2; gx <= 4; gx++) for (let gy = 2; gy <= 4; gy++) {
    if (Math.max(gx, gy) !== 4) continue;
    const gapX = (fw - gx * sw) / (gx - 1 + 2 * SPOT_MARGIN), gapY = (fh - gy * sh) / (gy - 1 + 2 * SPOT_MARGIN);
    const g = Math.min(gapX, gapY);
    if (g < 3) continue;
    const usedW = gx * sw + (gx - 1) * g, usedH = gy * sh + (gy - 1) * g;
    const base = 3 * (1 - (usedW * usedH) / (fw * fh)) + (0.3 * Math.abs(gapX - gapY)) / g + 0.15 * Math.max(0, 5 - g);
    const panels = [];
    if (withPanel) {
      for (let w = 1; w <= gx; w++) for (let h = 1; h < gy; h++) {
        if (!((gx - w) % 2) && !((gy - h) % 2)) panels.push({ c: (gx - w) / 2, r: (gy - h) / 2, w, h });
      }
    } else panels.push(null);
    for (const p of panels) {
      const n = gx * gy - (p ? p.w * p.h : 0);
      let score = base + 0.25 * Math.max(0, 8 - n) + 0.05 * Math.max(0, n - 24);
      if (p) {
        const a = (p.w * sw + (p.w + 0.48) * g) / (p.h * sh + (p.h + 0.48) * g);
        score += 3 * Math.max(0, Math.log(0.75 / a), Math.log(a / 1.8));
      }
      if (!best || score < best.score) best = { gx, gy, panel: p, score };
    }
  }
  return best ? { gx: best.gx, gy: best.gy, panel: best.panel } : { gx: 4, gy: 4, panel: withPanel ? { c: 1, r: 1, w: 2, h: 2 } : null };
}

/**
 * The four kinds of lid. Every spot shows a design; what changes is the middle.
 *   classic  designs round the blue "Design with Color Cubes" panel, as on the 1930s lid
 *   full     designs all over the lid, no panel
 *   text     designs round a panel with your own words
 *   big      one big design filling the lid
 */
export const PRESETS = {
  classic: { label: "Design with Color Cubes", make: (f) => ({ labels: [{ ...CLASSIC_PANEL, ...f.panel }] }) },
  full: { label: "Fill the lid with designs", panel: false, make: () => ({ labels: [] }) },
  text: { label: "Your own words", make: (f) => ({ labels: [{ ...CLASSIC_PANEL, ...f.panel, style: "rubik", lines: [{ text: "Color Cubes", big: true }] }] }) },
  big: { label: "One big design", make: () => ({ grid: 1, gridRows: 1, labels: [], stars: "none" }) }
};

/** A whole design from a preset, for a set of cols × rows. */
export function presetSpec(name, cols = 7, rows = 7) {
  const p = PRESETS[name] || PRESETS.classic;
  const f = fitGrid(clampSize(cols), clampSize(rows), p.panel !== false);
  return clean({ cols, rows, grid: f.gx, gridRows: f.gy, frame: "red", background: "white", stars: "red", walls: "red", ...p.make(f) });
}

/** The lid a set starts with: the 1930s one where it fits, else the panel with words. */
export const defaultSpec = (cols = 7, rows = 7) => presetSpec(classicFits(cols, rows) ? "classic" : "text", cols, rows);

/** Which of the four a design is. */
export function lidStyle(spec) {
  if (spec.grid === 1 && (spec.gridRows ?? 1) === 1) return "big";
  if (!spec.labels.length) return "full";
  return spec.labels[0].style === "classic" ? "classic" : "text";
}

const pick = (v, list, def) => (list.includes(v) ? v : def);

/** Check a design and fill in anything missing. Labels that overlap or fall off the grid go. */
export function clean(s = {}) {
  const fit = (v, d) => Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(Number(v) || d)));
  const grid = fit(s.grid, 4), gridRows = fit(s.gridRows, grid);
  const out = {
    cols: clampSize(s.cols), rows: clampSize(s.rows), grid, gridRows,
    frame: pick(s.frame, OPT, "red"),
    background: pick(s.background, COLOR_IDS, "white"),
    stars: pick(s.stars, OPT, "red"),
    walls: pick(s.walls, COLOR_IDS, "red"),
    same: !!s.same,
    one: typeof s.one === "string" && !parseCode(s.one).error ? s.one : null,
    labels: [], picks: {}, empty: []
  };
  const taken = new Set();
  for (const l of Array.isArray(s.labels) ? s.labels.slice(0, 6) : []) {
    const c = Math.round(l.c), r = Math.round(l.r), w = Math.round(l.w), h = Math.round(l.h);
    if (!(c >= 0 && r >= 0 && w >= 1 && h >= 1 && c + w <= grid && r + h <= gridRows)) continue;
    const cells = [];
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) cells.push(y * grid + x);
    if (cells.some((k) => taken.has(k))) continue;
    cells.forEach((k) => taken.add(k));
    out.labels.push({
      c, r, w, h,
      fill: pick(l.fill, OPT, "blue"),
      ink: pick(l.ink, COLOR_IDS, "white"),
      align: pick(l.align, ALIGN, "c"),
      style: pick(l.style, STYLES, "rubik"),
      lines: (Array.isArray(l.lines) ? l.lines : []).slice(0, 4).map((x) => ({ text: String(x.text ?? "").slice(0, 40), big: !!x.big }))
    });
  }
  const spots = grid * gridRows;
  if (s.picks && typeof s.picks === "object") {
    for (const [k, v] of Object.entries(s.picks)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= spots || taken.has(i) || typeof v !== "string") continue;
      const p = parseCode(v);
      if (!p.error && p.w === out.cols && p.h === out.rows) out.picks[i] = toReadable(p.grid, p.w, p.h);
    }
  }
  if (Array.isArray(s.empty)) out.empty = [...new Set(s.empty.map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < spots && !taken.has(i)).sort((a, b) => a - b);
  if (out.one) { const p = parseCode(out.one); if (p.w !== out.cols || p.h !== out.rows) out.one = null; }
  return out;
}

/** Which label covers each spot (its index), or -1. */
export function coverage(spec) {
  const N = spec.grid;
  const out = new Array(N * (spec.gridRows ?? N)).fill(-1);
  spec.labels.forEach((l, i) => {
    for (let y = l.r; y < l.r + l.h; y++) for (let x = l.c; x < l.c + l.w; x++) out[y * N + x] = i;
  });
  return out;
}

/**
 * The tray code in each spot (null where a label covers it or it's empty), given the list of
 * designs for this size (designs.js designsFor). Spots take the designs in turn unless one was
 * picked; with `same`, every spot shows `one`.
 */
export function spotCodes(spec, designs) {
  const cover = coverage(spec);
  const empty = new Set(spec.empty);
  const list = designs.map((d) => d.code);
  let n = 0;
  return cover.map((lab, i) => {
    if (lab >= 0 || empty.has(i)) return null;
    const base = spec.same ? spec.one || list[0] : list[n % list.length];
    n++;
    return spec.picks[i] || base || null;
  });
}

// ---------------------------------------------------------------------------------------------
// Packing

class Bits {
  constructor(bytes) { this.b = bytes || []; this.n = 0; }
  put(v, k) { for (let i = k - 1; i >= 0; i--) { const at = this.n >> 3; if (at >= this.b.length) this.b.push(0); if ((v >> i) & 1) this.b[at] |= 0x80 >> (this.n & 7); this.n++; } }
  get(k) {
    let v = 0;
    for (let i = 0; i < k; i++) {
      const at = this.n >> 3;
      if (at >= this.b.length) throw new Error("short");
      v = (v << 1) | ((this.b[at] >> (7 - (this.n & 7))) & 1);
      this.n++;
    }
    return v;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    const k = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < k; j++) s += B64[(v >> (18 - 6 * j)) & 63];
  }
  return s;
}
function unb64(s) {
  const out = [];
  let v = 0, bits = 0;
  for (const ch of s) {
    const x = B64.indexOf(ch);
    if (x < 0) throw new Error("bad");
    v = (v << 6) | x; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((v >> bits) & 255); }
  }
  return out;
}

// Version 1 had one grid size for both ways; version 2 adds the grid's rows after it.
const VERSION = 2;

/** The token for a design (without the words). */
export function encode(spec) {
  const s = clean(spec);
  const w = new Bits();
  w.put(VERSION, 3);
  w.put(s.cols - MIN, 4); w.put(s.rows - MIN, 4);
  w.put(s.grid - 1, 3); w.put(s.gridRows - 1, 3);
  w.put(OPT.indexOf(s.frame), 3); w.put(COLOR_IDS.indexOf(s.background), 2);
  w.put(OPT.indexOf(s.stars), 3); w.put(COLOR_IDS.indexOf(s.walls), 2);
  w.put(s.same ? 1 : 0, 1);
  w.put(s.labels.length, 3);
  for (const l of s.labels) {
    w.put(l.c, 3); w.put(l.r, 3); w.put(l.w - 1, 3); w.put(l.h - 1, 3);
    w.put(OPT.indexOf(l.fill), 3); w.put(COLOR_IDS.indexOf(l.ink), 2);
    w.put(ALIGN.indexOf(l.align), 2); w.put(STYLES.indexOf(l.style), 1);
    w.put(l.lines.length, 3);
    for (const x of l.lines) w.put(x.big ? 1 : 0, 1);
  }
  w.put(s.empty.length ? 1 : 0, 1);
  if (s.empty.length) { const e = new Set(s.empty); for (let i = 0; i < s.grid * s.gridRows; i++) w.put(e.has(i) ? 1 : 0, 1); }
  const picked = Object.keys(s.picks).map(Number).sort((a, b) => a - b);
  w.put(picked.length, 6);
  for (const i of picked) w.put(i, 6);
  const codes = picked.map((i) => s.picks[i]);
  if (s.same && s.one) codes.push(s.one);
  return [b64(w.b), ...codes.map((c) => { const p = parseCode(c); return toCompact(p.grid, p.w, p.h); })].join("~");
}

/** The set size in a token, without reading the rest: { cols, rows } or null. */
export function tokenSize(token) {
  try {
    const r = new Bits(unb64(String(token).split("~")[0].slice(0, 4)));
    const v = r.get(3);
    if (v !== 1 && v !== VERSION) return null;
    return { cols: r.get(4) + MIN, rows: r.get(4) + MIN };
  } catch (e) { return null; }
}

/** A design from a token and its words (an array of strings, one per label, lines split by "~"). */
export function decode(token, words = []) {
  try {
    const [head, ...codes] = String(token).split("~");
    const r = new Bits(unb64(head));
    const v = r.get(3);
    if (v !== 1 && v !== VERSION) return null;
    const s = { cols: r.get(4) + MIN, rows: r.get(4) + MIN, grid: r.get(3) + 1 };
    s.gridRows = v === 1 ? s.grid : r.get(3) + 1;
    s.frame = OPT[r.get(3)]; s.background = COLOR_IDS[r.get(2)];
    s.stars = OPT[r.get(3)]; s.walls = COLOR_IDS[r.get(2)];
    s.same = !!r.get(1);
    s.labels = [];
    const nl = r.get(3);
    for (let i = 0; i < nl; i++) {
      const l = { c: r.get(3), r: r.get(3), w: r.get(3) + 1, h: r.get(3) + 1, fill: OPT[r.get(3)], ink: COLOR_IDS[r.get(2)], align: ALIGN[r.get(2)], style: STYLES[r.get(1)] };
      const n = r.get(3);
      const text = String(words[i] ?? "").split("~");
      l.lines = Array.from({ length: n }, (_, j) => ({ big: !!r.get(1), text: text[j] ?? "" }));
      s.labels.push(l);
    }
    s.empty = [];
    if (r.get(1)) for (let i = 0; i < s.grid * s.gridRows; i++) if (r.get(1)) s.empty.push(i);
    const np = r.get(6);
    const at = Array.from({ length: np }, () => r.get(6));
    s.picks = {};
    at.forEach((i, k) => { const p = parseCode(codes[k] || ""); if (!p.error) s.picks[i] = toReadable(p.grid, p.w, p.h); });
    if (s.same && codes[np]) { const p = parseCode(codes[np]); if (!p.error) s.one = toReadable(p.grid, p.w, p.h); }
    return clean(s);
  } catch (e) { return null; }
}

/** The words of each label for the query: one string per label, lines joined by "~". */
export function words(spec) {
  return spec.labels.map((l) => l.lines.map((x) => x.text.replace(/~/g, "-")).join("~"));
}

/** Query string for the words (and anything extra), "" when there are none. */
export function query(spec, extra = {}) {
  const q = new URLSearchParams();
  const w = words(spec);
  // One t per label, in order; none at all when no label has words.
  if (w.some((x) => x.replace(/~/g, ""))) for (const x of w) q.append("t", x);
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") q.append(k, v);
  const s = q.toString().replace(/%7E/gi, "~");
  return s ? "?" + s : "";
}

/** The path of a design on the site: /box/7x7 for the lid a set starts with, else /box/7x7/{token}. */
export function boxPath(spec, base = "/box/") {
  const s = clean(spec);
  const size = `${s.cols}x${s.rows}`;
  const token = encode(s);
  const d = defaultSpec(s.cols, s.rows);
  const plain = token === encode(d) && words(s).join("|") === words(d).join("|");
  return plain ? base + size : `${base}${size}/${token}`;
}

/** Read a path like /box/7x7/{token}: { cols, rows, token } (token may be ""), or null. */
export function readPath(pathname, base = "/box/") {
  let rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  try { rest = decodeURIComponent(rest); } catch (e) { /* keep */ }
  const m = rest.replace(/\/+$/, "").match(/^(\d{1,2})\s*[x×*]\s*(\d{1,2})(?:\/(.*))?$/i);
  if (!m) return null;
  return { cols: clampSize(m[1]), rows: clampSize(m[2]), token: m[3] || "" };
}
