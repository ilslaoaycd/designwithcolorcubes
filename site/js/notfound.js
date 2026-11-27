// notfound.js — the 404 page: an endless tray of 3D-printed cubes filling the screen in an abstract
// pattern, with 404 spelled out in red cubes laid on it in the middle. Drag to move the tray
// (it never ends), tap a cube to turn it. Also writes the missing address into the message.
// MIT licensed (see LICENSE).

import { turn } from "/js/cubecode.js";
import { drawFace, loadScans } from "/designer/board.js";

const canvas = document.getElementById("grid");
const plate = document.getElementById("plate");
const ctx = canvas.getContext("2d");

// The plate, 13 × 7 spots: 404 in red cubes laid straight on the pattern, with a spot of room
// all round. "." is the pattern showing through.
const FOUR = ["r.r", "r.r", "rrr", "..r", "..r"];
const ZERO = ["rrr", "r.r", "r.r", "r.r", "rrr"];
const PLATE = [".".repeat(13)];
for (let r = 0; r < 5; r++) PLATE.push("." + FOUR[r] + "." + ZERO[r] + "." + FOUR[r] + ".");
PLATE.push(".".repeat(13));
const PW = PLATE[0].length, PH = PLATE.length;
const CODE = ["w", "r", "y", "b", "1", "2", "3", "4", "5", "6", "7", "8"];

const turned = new Map();  // "i,j" -> look, for cubes someone has turned

// A steady pseudo-random number in [0, 1) for each spot (and a salt, for separate streams).
function hash(i, j, salt = 0) {
  let h = Math.imul(i * 374761393 + j * 668265263 + salt * 2246822519, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise: random values on a coarse lattice, eased in between, two octaves.
function noise(x, y, salt) {
  const one = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return one(x, y, salt) * 0.7 + one(x * 2.3 + 17, y * 2.3 + 5, salt + 1) * 0.3;
}

// Solid colors as looks: 0 white, 1 red, 2 yellow, 3 blue. Blue pairs with yellow and red with
// white on the split faces (4–7 blue corner TL TR BR BL, 8–11 red corner the same).
const PARTNER = { 3: 2, 2: 3, 1: 0, 0: 1 };
const DARK = (c) => c === 1 || c === 3;
const CORNER_DIRS = [[[0, -1], [-1, 0]], [[0, -1], [1, 0]], [[0, 1], [1, 0]], [[0, 1], [-1, 0]]];
/** Round a color field's corners: where two sides of a spot meet its partner color, split it. */
function smoothed(color) {
  return (i, j) => {
    const c = color(i, j), p = PARTNER[c], base = c >= 2 ? 4 : 8;
    for (let k = 0; k < 4; k++) {
      const [[ax, ay], [bx, by]] = CORNER_DIRS[k];
      if (color(i + ax, j + ay) === p && color(i + bx, j + by) === p
        && color(i - ax, j - ay) !== p && color(i - bx, j - by) !== p) {
        return base + (DARK(p) ? k : (k + 2) % 4);
      }
    }
    return c;
  };
}

// The pattern: big soft shapes of blue and yellow with islands of red, the blue and yellow
// edges rounded with split faces. No red within five cubes of the 404, so its red stands apart.
const nearPlate = (i, j) => i >= -5 && i < PW + 5 && j >= -5 && j < PH + 5;
const FIELD = smoothed((i, j) => {
  if (!nearPlate(i, j) && noise(i / 6, j / 6, 61) > 0.66) return 1;
  return noise(i / 8, j / 8, 3) < 0.5 ? 3 : 2;
});

function look(i, j) {
  const key = i + "," + j;
  if (turned.has(key)) return turned.get(key);
  if (i >= 0 && i < PW && j >= 0 && j < PH && PLATE[j][i] !== ".") return CODE.indexOf(PLATE[j][i]);
  return FIELD(i, j);
}

// Each cube sits a little off true, as if laid by hand: a steady small turn and nudge per spot.
function wobble(i, j) {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  const a = ((h & 0xff) / 255 - 0.5) * 0.045;
  const dx = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.04;
  const dy = (((h >>> 16) & 0xff) / 255 - 0.5) * 0.04;
  return [a, dx, dy];
}

let pitch = 56, dpr = 1, W = 0, H = 0;
let pan = { x: 0, y: 0 };  // CSS pixels the tray has been dragged
let origin = { x: 0, y: 0 };  // where the plate's top-left spot is before dragging

function layout() {
  // As big as fits across, and no more than about a third of the screen's height.
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const next = Math.max(18, Math.min(60, Math.floor((vw - 24) / PW), Math.floor(vh * 0.32 / PH)));
  if (next !== pitch) pan = { x: 0, y: 0 };
  pitch = next;
  plate.style.width = PW * pitch + "px";
  plate.style.height = PH * pitch + "px";
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const r = plate.getBoundingClientRect();
  origin = { x: r.left, y: r.top };
  draw();
}

function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const ox = origin.x + pan.x, oy = origin.y + pan.y;
  const s = pitch * 0.9, inset = (pitch - s) / 2, r = s * 0.07;
  const i0 = Math.floor(-ox / pitch) - 1, i1 = Math.ceil((W - ox) / pitch) + 1;
  const j0 = Math.floor(-oy / pitch) - 1, j1 = Math.ceil((H - oy) / pitch) + 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = ox + i * pitch + inset, y = oy + j * pitch + inset;
    const d = look(i, j);
    const [a, dx, dy] = wobble(i, j);
    ctx.save();
    ctx.translate(x + s / 2 + dx * s, y + s / 2 + dy * s);
    ctx.rotate(a);
    ctx.fillStyle = "rgb(0 0 0 / 0.32)";
    rounded(-s / 2 + s * 0.03, -s / 2 + s * 0.06, s, s, r); ctx.fill();
    drawFace(ctx, d, -s / 2, -s / 2, s, "printed", s * dpr);
    ctx.restore();
  }
}

// Drag to move the tray; a press that hardly moves turns the cube under it.
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();  // no text selection while dragging
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  canvas.classList.add("dragging");
  pan = { x: drag.px + dx, y: drag.py + dy };
  requestDraw();
});
const end = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && e.type === "pointerup") {
    const i = Math.floor((e.clientX - origin.x - pan.x) / pitch);
    const j = Math.floor((e.clientY - origin.y - pan.y) / pitch);
    const d = look(i, j);
    turned.set(i + "," + j, turn(d) === d ? (d + 1) % 4 : turn(d));
    requestDraw();
  }
  canvas.classList.remove("dragging");
  drag = null;
};
canvas.addEventListener("pointerup", end);
canvas.addEventListener("pointercancel", end);

let queued = false;
function requestDraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}

document.getElementById("path").textContent = location.pathname;
window.addEventListener("resize", layout);
layout();
loadScans(draw, "printed");
