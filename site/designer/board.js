// board.js — the designer's canvas: a table of cubes you can paint, select, pan and zoom like a map.
//
// The world is measured in cubes. A cube at (x, y) covers [x, x+1) × [y, y+1). In tray mode a
// tray of w × h sits with its top-left corner at (0, 0). In free mode there is no tray at all.
//
// Zoom is in screen pixels per cube and is always kept between two limits:
//   - zoomed in, a few cubes fill the shorter side of the screen;
//   - zoomed out, the whole tray (or everything drawn so far) still fills a fair part of it.
//
// Selection: one or more cubes stay selected until you click outside the tray or press Esc.
// The cursor is the selected cube the keyboard moves from; Shift extends a rectangle from the
// anchor, Ctrl (Cmd) adds or removes one cube. With the Select tool a drag draws a box, and
// Shift or Ctrl (or a finger, which has no keys) adds to what is already selected.
//
// MIT licensed (see LICENSE).

import { turn } from "/js/cubecode.js";
import { faceGeometry, RADIUS, EDGE } from "/js/cubeface.js";

const TRAY_PAD = 0.25;        // room around the tray outline when fitting the view, in cubes
const FREE_PAD = 3;           // cubes of room kept around drawn artwork
const EMPTY_SPAN = 14;        // an empty free canvas shows about this many cubes across
const GAP = 1.5;              // space between cubes, in screen pixels, at every zoom
const OUTLINE = 2;            // tray outline, in screen pixels

export const key = (x, y) => x + "," + y;
export const unkey = (k) => k.split(",").map(Number);
/** Split faces of the same color pair: 1 for blue/yellow, 2 for red/white, 0 for solids. */
export const pair = (d) => (d < 4 ? 0 : d < 8 ? 1 : 2);

export const STYLES = ["printed", "scanned", "solid"];
/** Saved styles: "embossed" and "flat" are now "solid", "wood" is "scanned"; anything else is the
 *  default, printed. */
export const readStyle = (s) => (s === "scanned" || s === "wood" ? "scanned" : s === "solid" || s === "embossed" || s === "flat" ? "solid" : "printed");
/** Styles drawn from scans rather than shapes. */
export const isScan = (s) => s === "scanned" || s === "printed";

// The two scan styles draw each face from a scan: "scanned" from an original 1930s cube,
// "printed" from a 3D-printed one. Each has all twelve looks in one texture (4 across, 3 down, in
// code order), in a large and a small size, each face with a little transparent padding so
// neighbours never bleed in. A style's textures load only when it is picked.
const ATLASES = {
  scanned: { big: { src: "/img/faces/atlas.webp", cell: 244, face: 240 }, small: { src: "/img/faces/atlas-96.webp", cell: 100, face: 96 } },
  printed: { big: { src: "/img/faces/printed/atlas.webp", cell: 244, face: 240 }, small: { src: "/img/faces/printed/atlas-96.webp", cell: 100, face: 96 } }
};
const loading = {};
/** Load a scan style's textures, then call onReady. Solid needs nothing and calls it at once. */
export function loadScans(onReady, style = "printed") {
  if (!ATLASES[style]) return Promise.resolve().then(onReady);
  if (!loading[style]) {
    loading[style] = Promise.all(Object.values(ATLASES[style]).map((a) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { a.img = img; resolve(); };
      img.onerror = resolve;
      img.src = a.src;
    })));
  }
  return loading[style].then(onReady);
}
/** A scan style's large atlas and its layout, once loaded (for exports). */
export const scanAtlas = (style = "printed") => (ATLASES[style] && ATLASES[style].big.img ? ATLASES[style].big : null);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r > 0.5 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Draw look d in a box at (x, y) with side s. `px` is how many device pixels s covers. */
// Solid cubes with flat faces: no rim round the light triangle (the designer's Flat triangles box).
let FLAT = false;
export function setFlatFaces(on) { FLAT = !!on; }
export const flatFaces = () => FLAT;

export function drawFace(ctx, d, x, y, s, style, px = s) {
  const A = ATLASES[style];
  if (A) {
    const a = px > 60 && A.big.img ? A.big : A.small.img ? A.small : A.big.img ? A.big : null;
    if (a) {
      const pad = (a.cell - a.face) / 2;
      ctx.drawImage(a.img, (d % 4) * a.cell + pad, Math.floor(d / 4) * a.cell + pad, a.face, a.face, x, y, s, s);
      return;
    }
  }
  const g = faceGeometry(d, { flat: FLAT });
  const detail = px >= 14;
  ctx.fillStyle = g.base;
  roundRect(ctx, x, y, s, s, detail ? RADIUS * s : 0);
  ctx.fill();
  if (g.tri) {
    ctx.beginPath();
    ctx.moveTo(x + g.tri[0][0] * s, y + g.tri[0][1] * s);
    ctx.lineTo(x + g.tri[1][0] * s, y + g.tri[1][1] * s);
    ctx.lineTo(x + g.tri[2][0] * s, y + g.tri[2][1] * s);
    ctx.closePath();
    ctx.fillStyle = g.light;
    ctx.fill();
  }
  if (px >= 28) {
    const e = EDGE * s;
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = g.shade;
    ctx.lineWidth = e;
    roundRect(ctx, x + e / 2, y + e / 2, s - e, s - e, Math.max(0, RADIUS * s - e / 2));
    ctx.stroke();
    ctx.globalAlpha /= 0.55;
  }
}

const CODE_CH = ["w", "r", "y", "b", "1", "2", "3", "4", "5", "6", "7", "8"];
const ease = (t) => 1 - Math.pow(1 - t, 3);

export class Board {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    // getFace(), getTool(), onStroke(changes), onView(settled), onSelect(), onTurn(look)
    this.hooks = hooks;
    this.cells = new Map();
    this.mode = "tray";
    this.w = 7;
    this.h = 7;
    this.style = "printed";
    this.showCodes = false;
    this.zoom = 40;
    this.cx = 3.5;
    this.cy = 3.5;
    this.vw = 1;
    this.vh = 1;
    this.dpr = 1;
    this.sel = new Set();     // keys of selected cubes
    this.cursor = null;       // {x, y}: the selected cube the keyboard moves from
    this.anchor = null;       // {x, y}: where a Shift range starts
    this.hover = null;
    this.spaceHeld = false;
    this.pointers = new Map();
    this.gesture = null;
    this.stroke = null;
    this.anim = null;
    this.frame = 0;
    this.colors = {};
    this.readColors();
    this.bind();
  }

  readColors() {
    const cs = getComputedStyle(this.canvas);
    const v = (n, f) => cs.getPropertyValue(n).trim() || f;
    this.colors = {
      table: v("--canvas", "#F1F0EC"),
      grid: v("--grid", "rgba(23,24,27,0.09)"),
      outline: v("--tray-line", "#000000"),
      ink: v("--ink", "#17181B"),
      halo: v("--canvas", "#F1F0EC"),
      accent: v("--select", "#2F7BF6"),
      tint: v("--select-tint", "rgba(47,123,246,0.18)")
    };
  }

  // ---------- geometry ----------

  toScreen(wx, wy) {
    return [(wx - this.cx) * this.zoom + this.vw / 2, (wy - this.cy) * this.zoom + this.vh / 2];
  }
  toWorld(sx, sy) {
    return [(sx - this.vw / 2) / this.zoom + this.cx, (sy - this.vh / 2) / this.zoom + this.cy];
  }
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  cellAt(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    return [Math.floor(wx), Math.floor(wy)];
  }
  inTray(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  canPaint(x, y) {
    return this.mode === "free" || this.inTray(x, y);
  }

  /** Bounds of everything drawn, or null. */
  artBounds() {
    if (this.cells.size === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of this.cells.keys()) {
      const [x, y] = unkey(k);
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** The area the view must keep in sight. */
  content() {
    if (this.mode === "tray") return { x: -TRAY_PAD, y: -TRAY_PAD, w: this.w + 2 * TRAY_PAD, h: this.h + 2 * TRAY_PAD };
    const b = this.artBounds();
    if (!b) return { x: this.cx - EMPTY_SPAN / 2, y: this.cy - EMPTY_SPAN / 2, w: EMPTY_SPAN, h: EMPTY_SPAN };
    return { x: b.x - FREE_PAD, y: b.y - FREE_PAD, w: b.w + 2 * FREE_PAD, h: b.h + 2 * FREE_PAD };
  }

  fitZoom(rect) {
    const m = Math.min(28, this.vw * 0.06);
    return Math.max(0.5, Math.min((this.vw - 2 * m) / rect.w, (this.vh - 2 * m) / rect.h));
  }

  limits() {
    const short = Math.min(this.vw, this.vh);
    const c = this.content();
    const fit = this.fitZoom(c);
    let max = Math.min(280, Math.max(40, short / 2.2));
    let min;
    if (this.mode === "tray") {
      min = fit * 0.7;
    } else {
      min = Math.min(fit * 0.8, short / EMPTY_SPAN);
    }
    max = Math.max(max, fit);
    return { min: Math.min(min, max), max };
  }

  clampView() {
    const { min, max } = this.limits();
    this.zoom = Math.min(max, Math.max(min, this.zoom));
    const c = this.content();
    // The keyboard cursor may lead the view a little past drawn artwork on a free table.
    const cur = this.mode === "free" && this.cursor ? this.cursor : null;
    const x0 = Math.min(c.x, cur ? cur.x - 1 : Infinity), x1 = Math.max(c.x + c.w, cur ? cur.x + 2 : -Infinity);
    const y0 = Math.min(c.y, cur ? cur.y - 1 : Infinity), y1 = Math.max(c.y + c.h, cur ? cur.y + 2 : -Infinity);
    this.cx = Math.min(x1, Math.max(x0, this.cx));
    this.cy = Math.min(y1, Math.max(y0, this.cy));
  }

  fitTarget() {
    const c = this.content();
    const { min, max } = this.limits();
    const z = Math.min(max, Math.max(min, this.fitZoom(c)));
    return { zoom: z, cx: c.x + c.w / 2, cy: c.y + c.h / 2 };
  }

  fit(animate = true) {
    this.animateTo(this.fitTarget(), animate);
  }

  animateTo(t, animate = true) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce) {
      Object.assign(this, t);
      this.anim = null;
      this.clampView();
      this.requestDraw();
      this.hooks.onView();
      return;
    }
    this.anim = { from: { zoom: this.zoom, cx: this.cx, cy: this.cy }, to: t, start: performance.now(), dur: 260 };
    this.requestDraw();
  }

  zoomAt(sx, sy, factor) {
    this.anim = null;
    const [wx, wy] = this.toWorld(sx, sy);
    const { min, max } = this.limits();
    this.zoom = Math.min(max, Math.max(min, this.zoom * factor));
    this.cx = wx - (sx - this.vw / 2) / this.zoom;
    this.cy = wy - (sy - this.vh / 2) / this.zoom;
    this.clampView();
    this.requestDraw();
    this.hooks.onView();
  }

  panBy(dx, dy) {
    this.anim = null;
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clampView();
    this.requestDraw();
    this.hooks.onView();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.readColors();
    this.clampView();
    this.draw();
  }

  // ---------- painting ----------

  faceAt(x, y) {
    const v = this.cells.get(key(x, y));
    if (v !== undefined) return v;
    return this.inTray(x, y) && this.mode === "tray" ? 0 : undefined;
  }

  /** Change one cube and note it in the current stroke for undo. */
  set(x, y, d) {
    const k = key(x, y);
    const before = this.cells.has(k) ? this.cells.get(k) : null;
    if (before === d) return false;
    if (d === null) this.cells.delete(k);
    else this.cells.set(k, d);
    if (this.stroke) {
      const prev = this.stroke.changes.get(k);
      this.stroke.changes.set(k, [prev ? prev[0] : before, d]);
      this.stroke.count++;
    }
    return true;
  }

  /** Would painting this cube turn it rather than repaint it? (It already shows the picked pair.) */
  turnsAt(x, y) {
    if (this.hooks.getTool() !== "paint" || !this.canPaint(x, y)) return false;
    const now = this.faceAt(x, y);
    const p = pair(this.hooks.getFace());
    return p !== 0 && now !== undefined && pair(now) === p;
  }

  /** Paint one cube. With allowTurn, a split cube already showing the picked pair turns a quarter clockwise. */
  paintCell(x, y, allowTurn) {
    if (!this.canPaint(x, y)) return;
    const tool = this.hooks.getTool();
    if (tool === "erase") {
      this.set(x, y, null);
    } else if (allowTurn && this.turnsAt(x, y)) {
      const next = turn(this.faceAt(x, y));
      this.set(x, y, next);
      if (this.hooks.onTurn) this.hooks.onTurn(next);
    } else {
      const face = this.hooks.getFace();
      if (this.faceAt(x, y) !== face) this.set(x, y, face);
    }
    this.requestDraw();
  }

  paintLine(x0, y0, x1, y1) {
    // Bresenham, so a quick drag doesn't skip cubes.
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (let i = 0; i < 400; i++) {
      this.paintCell(x, y, false);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  beginStroke() {
    this.stroke = { changes: new Map(), count: 0 };
  }
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (s && s.changes.size) this.hooks.onStroke(s.changes);
  }
  cancelStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    for (const [k, [before]] of s.changes) {
      if (before === null) this.cells.delete(k);
      else this.cells.set(k, before);
    }
    this.requestDraw();
  }

  // ---------- selection ----------

  /** Selected cubes that can be painted, as [x, y] pairs. */
  selected() {
    const out = [];
    for (const k of this.sel) {
      const [x, y] = unkey(k);
      if (this.canPaint(x, y)) out.push([x, y]);
    }
    return out;
  }

  /**
   * Select a cube. how: "only" (just this one), "toggle" (add or remove it), "range" (the
   * rectangle from the anchor to it).
   */
  select(x, y, how = "only") {
    if (!this.canPaint(x, y)) return;
    if (how === "range" && this.anchor) {
      this.sel.clear();
      const x0 = Math.min(this.anchor.x, x), x1 = Math.max(this.anchor.x, x);
      const y0 = Math.min(this.anchor.y, y), y1 = Math.max(this.anchor.y, y);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) this.sel.add(key(xx, yy));
    } else if (how === "toggle") {
      const k = key(x, y);
      if (this.sel.has(k) && this.sel.size > 1) this.sel.delete(k);
      else this.sel.add(k);
      this.anchor = { x, y };
    } else {
      this.sel.clear();
      this.sel.add(key(x, y));
      this.anchor = { x, y };
    }
    this.cursor = { x, y };
    this.requestDraw();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  /**
   * Select the box from (x0, y0) to (x1, y1), on top of `base` (a Set of keys, or nothing).
   * Cubes outside the tray are left out. The cursor goes to (x1, y1).
   */
  selectBox(x0, y0, x1, y1, base) {
    this.sel = new Set(base || []);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (this.canPaint(x, y)) this.sel.add(key(x, y));
    }
    this.anchor = { x: x0, y: y0 };
    this.cursor = { x: x1, y: y1 };
    this.requestDraw();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  /** Select exactly these keys (after a paste), with the cursor on `at`. */
  selectKeys(keys, at) {
    this.sel = new Set(keys);
    this.anchor = at;
    this.cursor = at;
    this.requestDraw();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  /** The smallest box around the selection, or null. */
  selectionBounds() {
    if (!this.sel.size) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of this.sel) {
      const [x, y] = unkey(k);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  clearSelection() {
    if (!this.sel.size && !this.cursor) return;
    this.sel.clear();
    this.cursor = null;
    this.anchor = null;
    this.requestDraw();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  /** Select every cube in the tray, or everything drawn on a free table. */
  selectAll() {
    this.sel.clear();
    if (this.mode === "tray") {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.sel.add(key(x, y));
      this.anchor = { x: 0, y: 0 };
      this.cursor = this.cursor && this.inTray(this.cursor.x, this.cursor.y) ? this.cursor : { x: 0, y: 0 };
    } else {
      for (const k of this.cells.keys()) this.sel.add(k);
      const first = this.sel.size ? unkey(this.sel.values().next().value) : null;
      this.cursor = this.cursor || (first ? { x: first[0], y: first[1] } : null);
      this.anchor = this.cursor;
    }
    this.requestDraw();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  /**
   * Move the keyboard cursor by (dx, dy). With extend, grow the selection from the anchor;
   * otherwise select only the new cube. The view follows: smoothly for single steps, directly
   * while an arrow is held.
   */
  moveCursor(dx, dy, extend = false, instant = false) {
    let { x, y } = this.cursor || this.startCell();
    if (this.cursor) { x += dx; y += dy; }
    if (this.mode === "tray") {
      x = Math.min(this.w - 1, Math.max(0, x));
      y = Math.min(this.h - 1, Math.max(0, y));
    }
    if (extend) {
      if (!this.anchor) this.anchor = this.cursor || { x, y };
      this.select(x, y, "range");
    } else {
      this.select(x, y, "only");
    }
    this.keepInView(x, y, instant);
  }

  /** Where the keyboard starts when nothing is selected: the cube in the middle of the view. */
  startCell() {
    let [x, y] = this.toWorld(this.vw / 2, this.vh / 2).map(Math.floor);
    if (this.mode === "tray") {
      x = Math.min(this.w - 1, Math.max(0, x));
      y = Math.min(this.h - 1, Math.max(0, y));
    }
    return { x, y };
  }

  keepInView(x, y, instant) {
    const m = Math.min(this.zoom * 1.5, Math.min(this.vw, this.vh) / 4);
    const [px, py] = this.toScreen(x + 0.5, y + 0.5);
    let ddx = 0, ddy = 0;
    if (px < m) ddx = px - m; else if (px > this.vw - m) ddx = px - (this.vw - m);
    if (py < m) ddy = py - m; else if (py > this.vh - m) ddy = py - (this.vh - m);
    if (!ddx && !ddy) return;
    const to = { zoom: this.zoom, cx: this.cx + ddx / this.zoom, cy: this.cy + ddy / this.zoom };
    if (instant) { Object.assign(this, to); this.anim = null; this.clampView(); this.requestDraw(); }
    else this.animateTo(to);
  }

  // ---------- input ----------

  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.down(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    c.addEventListener("pointerup", (e) => this.up(e));
    c.addEventListener("pointercancel", (e) => this.up(e, true));
    c.addEventListener("pointerleave", () => { if (this.hover) { this.hover = null; this.requestDraw(); } });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    // Safari's trackpad pinch
    c.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  down(e) {
    if (e.button === 2) return;
    e.preventDefault();
    this.canvas.focus({ preventScroll: true });
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.anim = null;

    if (this.pointers.size === 2) {
      // A second finger: this is a pinch, not a paint. Take back a stroke that only just began.
      if (this.stroke) {
        if (this.stroke.count <= 2) this.cancelStroke();
        else this.endStroke();
      }
      const [a, b] = [...this.pointers.values()];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      this.gesture = { kind: "pinch", dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid, zoom: this.zoom, world: this.toWorld(mid[0], mid[1]) };
      return;
    }
    if (this.pointers.size > 2) return;

    const [x, y] = this.cellAt(p[0], p[1]);
    const outside = !this.canPaint(x, y);
    const boxing = this.hooks.getTool() === "select" && e.button === 0 && !this.spaceHeld;
    const pan = e.button === 1 || this.spaceHeld || this.hooks.getTool() === "pan" || (outside && !boxing);
    if (pan) {
      // Pressing outside the tray lets go of the selection; a drag from there still moves the view.
      if (outside && e.button === 0 && !this.spaceHeld) this.clearSelection();
      this.gesture = { kind: "pan", last: p };
      this.canvas.classList.add("grabbing");
      return;
    }
    // The Select tool: a drag draws a box. Shift, Ctrl or Cmd (or a finger) keeps what was
    // already selected; then a tap adds or removes one cube.
    // A box can start beside the tray; it takes in the cubes it reaches.
    if (boxing) {
      const add = e.shiftKey || e.ctrlKey || e.metaKey || e.pointerType === "touch" || e.pointerType === "pen";
      const sx = this.mode === "tray" ? Math.min(this.w - 1, Math.max(0, x)) : x;
      const sy = this.mode === "tray" ? Math.min(this.h - 1, Math.max(0, y)) : y;
      this.gesture = { kind: "box", start: [sx, sy], last: outside ? [x, y] : [sx, sy], base: add ? new Set(this.sel) : null, moved: false, outside };
      if (outside && !add) this.clearSelection();
      else if (!add) this.selectBox(sx, sy, sx, sy);
      return;
    }
    // Shift selects a rectangle, Ctrl or Cmd adds or removes one cube. Neither paints.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      this.select(x, y, e.shiftKey ? "range" : "toggle");
      this.gesture = { kind: "select", last: [x, y], range: e.shiftKey };
      return;
    }
    this.select(x, y, "only");
    // On a cube that already shows the picked pair, wait: a tap turns it, a drag paints over it.
    if (this.turnsAt(x, y)) {
      this.gesture = { kind: "tap", last: [x, y] };
      return;
    }
    this.gesture = { kind: "paint", last: [x, y] };
    this.beginStroke();
    this.paintCell(x, y, false);
  }

  move(e) {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        const [x, y] = this.cellAt(p[0], p[1]);
        const h = this.canPaint(x, y) && this.hooks.getTool() !== "pan" && !this.spaceHeld ? [x, y] : null;
        if (String(h) !== String(this.hover)) { this.hover = h; this.requestDraw(); }
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === "pinch" && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      const { min, max } = this.limits();
      this.zoom = Math.min(max, Math.max(min, g.zoom * (dist / g.dist)));
      this.cx = g.world[0] - (mid[0] - this.vw / 2) / this.zoom;
      this.cy = g.world[1] - (mid[1] - this.vh / 2) / this.zoom;
      this.clampView();
      this.requestDraw();
      this.hooks.onView();
    } else if (g.kind === "pan") {
      this.panBy(p[0] - g.last[0], p[1] - g.last[1]);
      g.last = p;
    } else if (g.kind === "box") {
      let [x, y] = this.cellAt(p[0], p[1]);
      if (this.mode === "tray") {
        x = Math.min(this.w - 1, Math.max(0, x));
        y = Math.min(this.h - 1, Math.max(0, y));
      }
      if (x !== g.last[0] || y !== g.last[1]) {
        g.moved = true;
        g.last = [x, y];
        this.selectBox(g.start[0], g.start[1], x, y, g.base);
      }
    } else if (g.kind === "select") {
      const [x, y] = this.cellAt(p[0], p[1]);
      if ((x !== g.last[0] || y !== g.last[1]) && this.canPaint(x, y)) {
        if (!g.range) { this.anchor = { x: g.last[0], y: g.last[1] }; g.range = true; }
        this.select(x, y, "range");
        g.last = [x, y];
      }
    } else if (g.kind === "paint" || g.kind === "tap") {
      const [x, y] = this.cellAt(p[0], p[1]);
      if (x !== g.last[0] || y !== g.last[1]) {
        if (g.kind === "tap") {
          // It became a drag: paint the cube it started on, then carry on painting.
          g.kind = "paint";
          this.beginStroke();
          this.paintCell(g.last[0], g.last[1], false);
        }
        this.paintLine(g.last[0], g.last[1], x, y);
        g.last = [x, y];
        if (this.canPaint(x, y)) this.select(x, y, "only");
      }
    }
  }

  up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g && g.kind === "paint") {
      if (cancelled) this.cancelStroke();
      else this.endStroke();
    } else if (g && g.kind === "box" && !g.moved && !cancelled && g.base && !g.outside) {
      this.select(g.start[0], g.start[1], "toggle");
    } else if (g && g.kind === "tap" && !cancelled && this.pointers.size === 0) {
      this.beginStroke();
      this.paintCell(g.last[0], g.last[1], true);
      this.endStroke();
    }
    if (this.pointers.size === 1 && g && g.kind === "pinch") {
      // One finger left after a pinch: let it pan, never paint.
      const p = [...this.pointers.values()][0];
      this.gesture = { kind: "pan", last: p };
      return;
    }
    if (this.pointers.size === 0) {
      this.gesture = null;
      this.canvas.classList.remove("grabbing");
      this.hooks.onView(true);
    }
  }

  wheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vh : 1;
    const p = this.local(e);
    if (e.shiftKey && !e.ctrlKey) {
      this.panBy(-(e.deltaX || e.deltaY) * unit, 0);
      return;
    }
    // Plain wheel and trackpad pinch both zoom around the pointer.
    const dy = e.deltaY * unit;
    this.zoomAt(p[0], p[1], Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022)));
  }

  // ---------- drawing ----------

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.anim) {
        const a = this.anim;
        const t = Math.min(1, (performance.now() - a.start) / a.dur);
        const k = ease(t);
        this.zoom = a.from.zoom + (a.to.zoom - a.from.zoom) * k;
        this.cx = a.from.cx + (a.to.cx - a.from.cx) * k;
        this.cy = a.from.cy + (a.to.cy - a.from.cy) * k;
        if (t >= 1) {
          this.anim = null;
          this.clampView();
          this.hooks.onView(true);
        } else {
          this.requestDraw();
        }
      }
      this.draw();
    });
  }

  draw() {
    const { ctx, dpr, zoom: z } = this;
    const col = this.colors;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.table;
    ctx.fillRect(0, 0, this.vw, this.vh);

    const [wx0, wy0] = this.toWorld(0, 0);
    const [wx1, wy1] = this.toWorld(this.vw, this.vh);
    const gx0 = Math.floor(wx0), gy0 = Math.floor(wy0), gx1 = Math.ceil(wx1), gy1 = Math.ceil(wy1);
    const sx = (x) => (x - this.cx) * z + this.vw / 2;
    const sy = (y) => (y - this.cy) * z + this.vh / 2;
    // The gap stays the same few pixels at any zoom; only when cubes get tiny does it shrink.
    const gap = Math.max(1 / dpr, Math.min(GAP, z * 0.12));
    // Snap a screen position to the device pixel grid, so hairlines stay crisp.
    const crisp = (v) => (Math.round(v * dpr) + 0.5) / dpr;

    // An endless grid of empty cube spaces, in both modes. Left out when cubes are tiny.
    if (z >= 6) {
      ctx.strokeStyle = col.grid;
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let x = gx0; x <= gx1; x++) { const p = crisp(sx(x)); ctx.moveTo(p, 0); ctx.lineTo(p, this.vh); }
      for (let y = gy0; y <= gy1; y++) { const p = crisp(sy(y)); ctx.moveTo(0, p); ctx.lineTo(this.vw, p); }
      ctx.stroke();
    }

    const visibleCount = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
    const drawCell = (x, y, d, faded) => {
      if (x < gx0 - 1 || x > gx1 || y < gy0 - 1 || y > gy1) return;
      if (faded) ctx.globalAlpha = 0.35;
      drawFace(ctx, d, sx(x) + gap / 2, sy(y) + gap / 2, z - gap, this.style, (z - gap) * dpr);
      if (faded) ctx.globalAlpha = 1;
    };

    if (this.mode === "tray") {
      for (let y = Math.max(0, gy0); y < Math.min(this.h, gy1 + 1); y++) {
        for (let x = Math.max(0, gx0); x < Math.min(this.w, gx1 + 1); x++) drawCell(x, y, this.faceAt(x, y), false);
      }
      for (const [k, d] of this.cells) {
        const [x, y] = unkey(k);
        if (!this.inTray(x, y)) drawCell(x, y, d, true);
      }
    } else if (this.cells.size < visibleCount) {
      for (const [k, d] of this.cells) {
        const [x, y] = unkey(k);
        drawCell(x, y, d, false);
      }
    } else {
      for (let y = gy0; y <= gy1; y++) {
        for (let x = gx0; x <= gx1; x++) {
          const d = this.cells.get(key(x, y));
          if (d !== undefined) drawCell(x, y, d, false);
        }
      }
    }

    // The tray: one thin outline just outside its cubes.
    if (this.mode === "tray") {
      ctx.strokeStyle = col.outline;
      ctx.lineWidth = OUTLINE;
      ctx.strokeRect(sx(0) - OUTLINE / 2, sy(0) - OUTLINE / 2, this.w * z + OUTLINE, this.h * z + OUTLINE);
    }

    // Code letters, once the cubes are big enough to hold them.
    if (this.showCodes && z >= 26) {
      ctx.font = `600 ${Math.round(z * 0.3)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = (x, y, d) => {
        const cx = sx(x) + z / 2, cy = sy(y) + z / 2, r = z * 0.2;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#161A26";
        ctx.fillText(CODE_CH[d], cx, cy + 1);
      };
      for (let y = gy0; y <= gy1; y++) {
        for (let x = gx0; x <= gx1; x++) {
          const d = this.faceAt(x, y);
          if (d !== undefined && (this.mode === "free" || this.inTray(x, y))) label(x, y, d);
        }
      }
    }

    const ring = (x, y, color, width, out = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(sx(x) - out + width / 2, sy(y) - out + width / 2, z + 2 * out - width, z + 2 * out - width);
    };

    // Hover: a light outline under the mouse.
    if (this.hover && !this.gesture && !this.sel.has(key(this.hover[0], this.hover[1]))) {
      ring(this.hover[0], this.hover[1], col.halo, 3);
      ring(this.hover[0], this.hover[1], col.ink, 1.5);
    }

    // Selection: a tint on every selected cube, an outline around the whole selection, and a
    // heavy ring with a halo on the cursor cube so it reads against any color.
    if (this.sel.size) {
      ctx.fillStyle = col.tint;
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      const multi = this.sel.size > 1;
      ctx.beginPath();
      for (const k of this.sel) {
        const [x, y] = unkey(k);
        if (x < gx0 - 1 || x > gx1 || y < gy0 - 1 || y > gy1) continue;
        if (multi) ctx.fillRect(sx(x), sy(y), z, z);
        // Outline only the edges that face an unselected neighbour.
        const X = sx(x), Y = sy(y);
        if (!this.sel.has(key(x, y - 1))) { ctx.moveTo(X, Y); ctx.lineTo(X + z, Y); }
        if (!this.sel.has(key(x + 1, y))) { ctx.moveTo(X + z, Y); ctx.lineTo(X + z, Y + z); }
        if (!this.sel.has(key(x, y + 1))) { ctx.moveTo(X, Y + z); ctx.lineTo(X + z, Y + z); }
        if (!this.sel.has(key(x - 1, y))) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + z); }
      }
      if (multi) ctx.stroke();
    }
    if (this.cursor && this.sel.has(key(this.cursor.x, this.cursor.y))) {
      const { x, y } = this.cursor;
      const w = Math.max(2.5, Math.min(4, z * 0.06));
      ring(x, y, col.halo, w + 4, w / 2 + 2);
      ring(x, y, col.accent, w, w / 2);
    }
  }

  /**
   * Draw the given area to a fresh canvas for download, on white with the same thin gaps
   * (scaled to the picture) and, for a tray, its outline.
   */
  render(rect, px, withTray) {
    const out = document.createElement("canvas");
    const pad = px * 0.3;
    out.width = Math.round(rect.w * px + 2 * pad);
    out.height = Math.round(rect.h * px + 2 * pad);
    const c = out.getContext("2d");
    const gap = Math.max(1, px * 0.025);
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, out.width, out.height);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const d = withTray ? this.faceAt(x, y) : this.cells.get(key(x, y));
        if (d !== undefined) drawFace(c, d, pad + (x - rect.x) * px + gap / 2, pad + (y - rect.y) * px + gap / 2, px - gap, this.style);
      }
    }
    if (withTray) {
      const lw = Math.max(2, px * 0.04);
      c.strokeStyle = "#000000";
      c.lineWidth = lw;
      c.strokeRect(pad - lw / 2, pad - lw / 2, rect.w * px + lw, rect.h * px + lw);
    }
    return out;
  }
}
