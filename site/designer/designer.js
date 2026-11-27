// designer.js — the Color Cubes designer app: state, undo, keyboard, sheets, sharing, export.
// The canvas itself (drawing, selecting, panning, zooming, painting) lives in board.js, the PDF
// in pdf.js and the 3D view in view3d.js. MIT licensed.

import { CODE, MIN_SIZE, MAX_SIZE, EDITIONS, faceName, turn, underside, turnOver, toReadable, toCompact, parseCode } from "/js/cubecode.js";
import { SHORT_ORIGIN, DESIGNER_PATH } from "/js/config.js";
import { PAPERS, paper, setPaper } from "/js/paper.js";
import { faceSVG, traySVG, faceShapes, codeSVG, faceGeometry } from "/js/cubeface.js";
import { Board, key, unkey, loadScans, scanAtlas, readStyle, isScan, STYLES, pair, setFlatFaces, flatFaces } from "/designer/board.js";
import { readSaved, writeSaved, remember, contentKey, isBlank, toBackup, fromBackup, SAVED_KEY } from "/designer/saved.js";

const $ = (id) => document.getElementById(id);
const STORE = "colorcubes:designer:v2";
const START = "686w313-868w131-686w313-wwwwwww-313w686-131w868-313w686"; // Quadrants, from Isaac's table
const SHORT = SHORT_ORIGIN + "/";

// ---------------------------------------------------------------------------------------------
// Board

let face = 4;
let tool = "paint";
const history = { undo: [], redo: [] };

const board = new Board($("board"), {
  getFace: () => face,
  getTool: () => tool,
  onStroke: (changes) => record({ changes }),
  onView: (settled) => { if (settled) save(); },
  onSelect: () => { saySelection(); syncSelBar(); },
  onTurn: (look) => setFace(look) // a tapped cube turned; the picked face follows it
});

// ---------------------------------------------------------------------------------------------
// Undo and redo. An entry holds cube changes (key -> [before, after]) and/or a change of tray
// size or mode ({ from: {mode, w, h}, to: {...} }).

function record(entry) {
  if (!entry.changes) entry.changes = new Map();
  if (!entry.changes.size && !entry.dims) return;
  history.undo.push(entry);
  if (history.undo.length > 300) history.undo.shift();
  history.redo.length = 0;
  changed();
}

function applyEntry(entry, dir) {
  for (const [k, [before, after]] of entry.changes) {
    const v = dir < 0 ? before : after;
    if (v === null) board.cells.delete(k);
    else board.cells.set(k, v);
  }
  if (entry.dims) {
    const d = dir < 0 ? entry.dims.from : entry.dims.to;
    board.mode = d.mode;
    board.w = d.w;
    board.h = d.h;
    board.clearSelection();
    board.fit();
  }
}

function undo() {
  const e = history.undo.pop();
  if (!e) { toast("Nothing to undo."); return; }
  applyEntry(e, -1);
  history.redo.push(e);
  changed();
  toast("Undone");
}
function redo() {
  const e = history.redo.pop();
  if (!e) { toast("Nothing to redo."); return; }
  applyEntry(e, 1);
  history.undo.push(e);
  changed();
  toast("Redone");
}

/** Change several cubes (and maybe the tray) as one undoable step. */
function batch(fn, dimsTo) {
  const from = { mode: board.mode, w: board.w, h: board.h };
  board.beginStroke();
  fn();
  const changes = board.stroke.changes;
  board.stroke = null;
  let dims;
  if (dimsTo && (dimsTo.mode !== from.mode || dimsTo.w !== from.w || dimsTo.h !== from.h)) {
    dims = { from, to: dimsTo };
    board.mode = dimsTo.mode;
    board.w = dimsTo.w;
    board.h = dimsTo.h;
  }
  record({ changes, dims });
  return !!dims;
}

// ---------------------------------------------------------------------------------------------
// The tray as a code

function trayGrid() {
  const g = [];
  for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) g.push(board.faceAt(x, y) ?? 0);
  return g;
}
const readable = () => toReadable(trayGrid(), board.w, board.h);

/** Lay a whole tray down (a design, a pasted code, a flip): one undo step, nothing left outside it. */
function layTray(grid, w, h) {
  const resized = batch(() => {
    for (const k of [...board.cells.keys()]) {
      const [x, y] = unkey(k);
      if (x < 0 || y < 0 || x >= w || y >= h) board.set(x, y, null);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) board.set(x, y, grid[y * w + x]);
  }, { mode: "tray", w, h });
  if (resized) { board.clearSelection(); board.fit(); }
  board.requestDraw();
}

// ---------------------------------------------------------------------------------------------
// Whenever something changes

function changed() {
  board.requestDraw();
  $("undo").disabled = !history.undo.length;
  $("redo").disabled = !history.redo.length;
  // On narrow phones the word "Tray" (or "table") drops so the size still shows.
  $("title").innerHTML = board.mode === "tray" ? `<span class="lbl">Tray </span>${board.w}×${board.h}` : `Free<span class="lbl"> table</span>`;
  $("view-3d").disabled = board.mode !== "tray";
  $("view-3d").title = board.mode === "tray" ? "See the tray in 3D (V)" : "3D is for trays, not the free table";
  writeUrl();
  save();
  rememberLater();
  syncTraySheet();
  saySelection();
  if (openSheet === "share") renderShare();
  if (view3d) view3d.setTray(trayGrid(), board.w, board.h);
}

// On the real site the state lives in the path: /designer/{readable code} or /designer/canvas.
// Anywhere else (a local file, a preview under another path) it falls back to the #hash.
const PATH_MODE = location.pathname.indexOf(DESIGNER_PATH) === 0;
let urlTimer = 0;
function writeUrl(now) {
  clearTimeout(urlTimer);
  const go = () => {
    const value = board.mode === "tray" ? readable() : "canvas";
    try {
      if (PATH_MODE) {
        const next = DESIGNER_PATH + value;
        if (location.pathname !== next || location.search) history_.replaceState(history_.state, "", next);
      } else if (location.hash.slice(1) !== value) {
        history_.replaceState(history_.state, "", "#" + value);
      }
    } catch (e) { /* some embedded views refuse URL changes */ }
  };
  if (now) go();
  else urlTimer = setTimeout(go, 250);
}
const history_ = window.history;

function readUrl() {
  let raw = "";
  try {
    raw = decodeURIComponent(PATH_MODE ? location.pathname.slice(DESIGNER_PATH.length) : location.hash.slice(1)).trim();
  } catch (e) { return { error: "That link isn't readable." }; }
  if (!raw) return null;
  if (raw.toLowerCase() === "canvas") return "canvas";
  return parseCode(raw);
}

// ---------------------------------------------------------------------------------------------
// Saving in this browser

let saveTimer = 0;
let canSave = true;
function save() {
  if (!canSave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  if (!canSave) return;
  const cells = [];
  for (const [k, d] of board.cells) {
    const [x, y] = unkey(k);
    cells.push([x, y, d]);
  }
  const data = {
    v: 3, mode: board.mode, w: board.w, h: board.h, style: board.style, codes: board.showCodes, flat: flatFaces(), face,
    cells, cur, pristine
  };
  try { localStorage.setItem(STORE, JSON.stringify(data)); }
  catch (e) { canSave = false; toast("This browser isn't letting the page save. Your work stays until you close it."); }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!data || (data.v !== 2 && data.v !== 3) || !Array.isArray(data.cells)) return null;
    for (const c of data.cells) {
      if (Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1]) && Number.isInteger(c[2]) && c[2] >= 0 && c[2] < 12) {
        board.cells.set(key(c[0], c[1]), c[2]);
      }
    }
    const size = (n) => Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE;
    if (data.mode === "free" || data.mode === "tray") board.mode = data.mode;
    if (size(data.w) && size(data.h)) { board.w = data.w; board.h = data.h; }
    // Before v3, solid was the default and saved either way, so those saves start on printed.
    board.style = data.v >= 3 ? readStyle(data.style) : readStyle(data.style === "solid" ? "" : data.style);
    board.showCodes = !!data.codes;
    setFlatFaces(!!data.flat);
    if (Number.isInteger(data.face) && data.face >= 0 && data.face < 12) face = data.face;
    return data;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Your designs: every design you change is kept in this browser (saved.js has the rules).

let cur = null;         // id of the entry the design on screen is saved in, if any
let pristine = null;    // content of a design laid down whole and not changed yet: not saved until it is
let pendingName = "";   // name for the next new entry (the preset or saved design it started from)
let canKeep = true;
let rememberTimer = 0;

/** The design on screen in the form the list stores. */
function snapshot() {
  if (board.mode === "tray") return { mode: "tray", w: board.w, h: board.h, code: readable() };
  const cells = [...board.cells].map(([k, d]) => [...unkey(k), d]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { mode: "free", cells };
}
const nowKey = () => contentKey(snapshot());

function rememberLater() {
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => rememberNow(), 1200);
}

/** Put the design on screen into the list now. With keep (Save, Share) it's frozen as it is. */
function rememberNow(keep = false) {
  clearTimeout(rememberTimer);
  if (!canKeep) return null;
  const snap = snapshot();
  if (!keep && (contentKey(snap) === pristine || isBlank(snap))) return null;
  let r;
  try {
    r = remember(readSaved(localStorage), snap, { cur, keep, name: pendingName });
    if (r.changed) writeSaved(localStorage, r.items);
  } catch (e) {
    canKeep = false;
    toast("This browser isn't letting the page keep your designs. Back up what's there from Your designs.");
    return null;
  }
  cur = r.id;
  pristine = null;
  pendingName = "";
  save();
  if (openSheet === "designs") renderDesigns();
  return r;
}

/** Before laying down a whole new design: keep the one on screen, then start fresh. */
function detach(name = "") {
  rememberNow();
  cur = null;
  pendingName = name;
}
/** After laying it down: it isn't saved until it's changed. */
function laid() {
  pristine = nowKey();
  save();
}

// Ask once for storage the browser won't clear on its own, when someone first saves on purpose.
let askedPersist = false;
function askPersist() {
  if (askedPersist) return;
  askedPersist = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* not offered */ }
}

function saveDesign() {
  const r = rememberNow(true);
  if (!r) return;
  askPersist();
  toast(r.changed ? "Saved in Your designs." : "Already saved in Your designs.");
}

// Leaving the page (closing the tab, switching apps on a phone) saves at once.
function flush() { rememberNow(); saveNow(); }
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// ---------------------------------------------------------------------------------------------
// Messages

let toastTimer = 0;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function saySelection() {
  const c = board.cursor;
  if (!c) { $("cursor-say").textContent = "Nothing selected"; return; }
  const d = board.faceAt(c.x, c.y);
  const where = board.mode === "tray" ? `Row ${c.y + 1}, column ${c.x + 1}` : `Column ${c.x}, row ${c.y}`;
  const more = board.sel.size > 1 ? `. ${board.sel.size} cubes selected` : "";
  $("cursor-say").textContent = `${where}: ${d === undefined ? "empty" : faceName(d)}${more}`;
}

// ---------------------------------------------------------------------------------------------
// Dock: tools, colors and rotations

document.querySelectorAll(".tool[data-tool]").forEach((b) => {
  b.addEventListener("click", () => setTool(b.dataset.tool));
});
function setTool(t) {
  tool = t;
  document.querySelectorAll(".tool[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
  board.canvas.classList.toggle("pan", t === "pan");
  syncSelBar();
}

// Six color buttons: four solids, then the two split pairs, shown at the rotation in hand.
// Each has a letter; the four rotations have the numbers 1–4.
let rotation = 0;   // corner of the dark triangle for split faces: 0 TL, 1 TR, 2 BR, 3 BL
let lastPair = 1;   // the split pair the rotation buttons use when a solid is in hand
const COLORS = [
  { key: "w", look: () => 0, name: "White" },
  { key: "r", look: () => 1, name: "Red" },
  { key: "y", look: () => 2, name: "Yellow" },
  { key: "b", look: () => 3, name: "Blue" },
  { key: "n", look: () => 4 + rotation, name: "Blue and yellow", pair: 1 },
  { key: "m", look: () => 8 + rotation, name: "Red and white", pair: 2 }
];
const CORNER_NAMES = ["top left", "top right", "bottom right", "bottom left"];

const faceBtns = COLORS.map((f) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "face-btn";
  b.addEventListener("click", () => {
    if (f.pair && face === f.look()) rotation = (rotation + 1) % 4;
    pickColor(f, false);
  });
  $("faces").appendChild(b);
  return [b, f];
});

function greyFace(i) {
  const g = faceGeometry(4 + i);
  const pts = g.tri.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(" ");
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="5" fill="var(--rot-dark)"/><polygon points="${pts}" fill="var(--rot-light)"/></svg>`;
}
const rotBtns = [0, 1, 2, 3].map((i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "rot-btn";
  b.innerHTML = greyFace(i) + `<kbd class="key">${i + 1}</kbd>`;
  b.setAttribute("aria-label", `Dark corner ${CORNER_NAMES[i]} (${i + 1})`);
  b.addEventListener("click", () => pickRotation(i));
  $("rotations").appendChild(b);
  return b;
});


function setFace(d) {
  face = d;
  if (d >= 4) { rotation = d % 4; lastPair = pair(d); }
  for (const [b, f] of faceBtns) {
    const look = f.look();
    b.innerHTML = faceSVG(look) + `<kbd class="key">${f.key.toUpperCase()}</kbd>`;
    b.setAttribute("aria-pressed", String(look === face));
    const what = f.pair ? `${f.name}, ${faceName(look).split(", ")[1]}` : f.name;
    b.setAttribute("aria-label", `${what} (${f.key.toUpperCase()})`);
  }
  rotBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(face >= 4 && rotation === i)));
  save();
}

/**
 * Pick a color (from a button or its letter). From the keyboard, or with the Select tool, it
 * also paints the selection. The Select tool stays in hand; any other tool goes back to Paint.
 */
function pickColor(f, paintSelection) {
  setFace(f.look());
  if (tool === "select") paintSelection = true;
  else if (tool !== "paint") setTool("paint");
  if (paintSelection) paintSelected(face);
}

/**
 * Pick a rotation (a button or 1–4). Selected split cubes turn to it as well, so a cube just
 * tapped can be turned from the buttons; on a phone there are no number keys to do it.
 */
function pickRotation(i) {
  rotation = i;
  const p = pair(face) || lastPair;
  setFace((p === 1 ? 4 : 8) + i);
  if (tool !== "paint" && tool !== "select") setTool("paint");
  const cells = board.selected().filter(([x, y]) => pair(board.faceAt(x, y) ?? 0) !== 0);
  if (cells.length) batch(() => { for (const [x, y] of cells) { const d = board.faceAt(x, y); board.set(x, y, d - (d % 4) + i); } });
}

function paintSelected(d) {
  const cells = board.selected();
  if (!cells.length) return;
  batch(() => { for (const [x, y] of cells) board.set(x, y, d); });
}
function turnSelected() {
  const cells = board.selected().filter(([x, y]) => (board.faceAt(x, y) ?? 0) >= 4);
  if (!cells.length) return;
  batch(() => { for (const [x, y] of cells) board.set(x, y, turn(board.faceAt(x, y))); });
  const c = board.cursor && board.faceAt(board.cursor.x, board.cursor.y);
  if (c >= 4) setFace(c);
}
function eraseSelected() {
  const cells = board.selected();
  if (!cells.length) return;
  batch(() => { for (const [x, y] of cells) board.set(x, y, null); });
}

// ---------------------------------------------------------------------------------------------
// Copy, cut and paste. The clipboard gets the selection's box as a readable code (holes in a
// ragged selection read as white), so a block pastes into another tab or straight into the code
// field. Inside the designer the exact cubes are kept, holes and all.

let clip = null; // { w, h, cells: [[dx, dy, look]], text }

function copySelection() {
  const b = board.selectionBounds();
  if (!b) { toast("Select some cubes first."); return null; }
  const cells = [];
  for (const k of board.sel) {
    const [x, y] = unkey(k);
    const d = board.faceAt(x, y);
    if (d !== undefined) cells.push([x - b.x, y - b.y, d]);
  }
  if (!cells.length) { toast("There are no cubes there to copy."); return null; }
  const rows = Array.from({ length: b.h }, () => new Array(b.w).fill(CODE[0]));
  for (const [dx, dy, d] of cells) rows[dy][dx] = CODE[d];
  clip = { w: b.w, h: b.h, cells, text: rows.map((r) => r.join("")).join("-") };
  syncSelBar();
  return clip;
}

/** Turn pasted text into cubes: a block copied here, a readable code of any size, a compact code or a designer link. */
function clipFromText(text) {
  const t = (text || "").trim();
  if (!t) return null;
  if (clip && t === clip.text) return clip;
  const code = t.includes("/") ? decodeURIComponent(t.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop()) : t;
  if (/^[wryb1-8]+(-[wryb1-8]+)*$/i.test(code)) {
    const rows = code.toLowerCase().split("-");
    if (rows.length > 40 || rows.some((r) => r.length > 40)) return null;
    const cells = [];
    rows.forEach((r, dy) => [...r].forEach((ch, dx) => cells.push([dx, dy, CODE.indexOf(ch)])));
    return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, cells, text: code };
  }
  const parsed = parseCode(code);
  if (parsed.error) return null;
  const cells = parsed.grid.map((d, i) => [i % parsed.w, Math.floor(i / parsed.w), d]);
  return { w: parsed.w, h: parsed.h, cells, text: code };
}

/** Lay a block down with its top-left corner at the selection (or the cursor), as one undo step. */
function pasteClip(c) {
  if (in3D()) return;
  if (!c) { toast("Copy some cubes first, or a tray code."); return; }
  const b = board.selectionBounds();
  let { x, y } = b || board.cursor || board.startCell();
  if (board.mode === "tray") {
    // Keep the block inside the tray when it fits; otherwise the part that hangs over is left off.
    x = Math.max(0, Math.min(x, board.w - c.w));
    y = Math.max(0, Math.min(y, board.h - c.h));
  }
  const keys = [];
  batch(() => {
    for (const [dx, dy, d] of c.cells) {
      if (!board.canPaint(x + dx, y + dy)) continue;
      board.set(x + dx, y + dy, d);
      keys.push(key(x + dx, y + dy));
    }
  });
  if (!keys.length) { toast("That doesn't fit here."); return; }
  board.selectKeys(keys, { x, y });
  board.requestDraw();
  toast(keys.length < c.cells.length ? `Pasted ${keys.length} of ${c.cells.length} cubes; the rest are off the tray.` : `Pasted ${keys.length} cube${keys.length === 1 ? "" : "s"}.`);
}

const cubes = (k) => `${k} cube${k === 1 ? "" : "s"}`;
const sheetOrTyping = (t) => openSheet || in3D() || typingIn(t) || String(getSelection() || "").length > 0;

document.addEventListener("copy", (e) => {
  if (sheetOrTyping(e.target) || !board.sel.size) return;
  const c = copySelection();
  if (!c) return;
  e.clipboardData.setData("text/plain", c.text);
  e.preventDefault();
  toast(`Copied ${cubes(c.cells.length)}.`);
});
document.addEventListener("cut", (e) => {
  if (sheetOrTyping(e.target) || !board.sel.size) return;
  const c = copySelection();
  if (!c) return;
  e.clipboardData.setData("text/plain", c.text);
  e.preventDefault();
  eraseSelected();
  toast(`Cut ${cubes(c.cells.length)}.`);
});
document.addEventListener("paste", (e) => {
  if (sheetOrTyping(e.target)) return;
  const text = e.clipboardData.getData("text/plain");
  e.preventDefault();
  const c = clipFromText(text) || (text.trim() ? null : clip);
  if (!c && text.trim()) { toast("That isn't a tray code or cubes copied from the designer."); return; }
  pasteClip(c);
});

$("sel-copy").addEventListener("click", () => {
  const c = copySelection();
  if (!c) return;
  if (navigator.clipboard) navigator.clipboard.writeText(c.text).catch(() => {});
  toast(`Copied ${cubes(c.cells.length)}.`);
});
$("sel-cut").addEventListener("click", () => {
  const c = copySelection();
  if (!c) return;
  if (navigator.clipboard) navigator.clipboard.writeText(c.text).catch(() => {});
  eraseSelected();
  toast(`Cut ${cubes(c.cells.length)}.`);
});
$("sel-paste").addEventListener("click", async () => {
  if (clip) { pasteClip(clip); return; }
  try { pasteClip(clipFromText(await navigator.clipboard.readText())); }
  catch (err) { pasteClip(null); }
});

/** The Copy, Cut and Paste bar shows with the Select tool. */
function syncSelBar() {
  const bar = $("sel-bar");
  if (!bar) return;
  const on = tool === "select";
  bar.hidden = !on;
  bar.closest(".stage").classList.toggle("has-bar", on);
  $("sel-copy").disabled = $("sel-cut").disabled = !board.sel.size;
}

// ---------------------------------------------------------------------------------------------
// Look: theme, cube style, 2D or 3D

const THEME_KEY = "colorcubes:theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => (document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light")) === "dark";
function syncTheme() {
  const dark = isDark();
  $("theme").setAttribute("aria-pressed", String(dark));
  $("theme").title = dark ? "Switch to light mode" : "Switch to dark mode"; // the name stays "Dark mode"; aria-pressed says which
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#141518" : "#F1F0EC");
  board.readColors();
  board.requestDraw();
  if (view3d) view3d.setTheme(getComputedStyle(document.body).getPropertyValue("--canvas").trim());
}
$("theme").addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* not saved; still switches */ }
  syncTheme();
});
darkQuery.addEventListener("change", syncTheme);

function setStyle(s) {
  board.style = s;
  loadScans(() => { board.requestDraw(); setFace(face); }, s);
  document.querySelectorAll("[data-style]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === s)));
  setFace(face);
  renderPresets();
  if (view3d) view3d.setStyle(s);
  syncFlat();
  syncExportNotes();
  changed();
}
// Flat triangles: only for solid cubes (the textures are recessed, like the cubes they were made from).
function syncFlat() {
  $("flat-row").hidden = board.style !== "solid";
  $("flat-faces").checked = flatFaces();
}
$("flat-faces").addEventListener("change", () => {
  setFlatFaces($("flat-faces").checked);
  board.requestDraw();
  changed();
});
document.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => setStyle(b.dataset.style)));

// The 3D view: three.js and the cube model load the first time it opens.
let view3d = null;
let view3dLoading = false;
async function open3D() {
  if (view3d || view3dLoading) return;
  if (board.mode !== "tray") { toast("3D is for trays. Switch to a tray to see it in 3D."); return; }
  view3dLoading = true;
  $("view-3d").setAttribute("aria-pressed", "true");
  $("view-2d").setAttribute("aria-pressed", "false");
  document.querySelector(".app").classList.add("in-3d");
  $("view3d-status").hidden = false;
  try {
    const { View3D } = await import("/designer/view3d.js");
    view3d = await View3D.create($("view3d"), {
      grid: trayGrid(), w: board.w, h: board.h, style: board.style,
      background: getComputedStyle(document.body).getPropertyValue("--canvas").trim()
    });
    $("view3d-status").hidden = true;
  } catch (err) {
    $("view3d-status").textContent = "The 3D view didn't load. Check your connection and try again.";
    view3dLoading = false;
    setTimeout(close3D, 2500);
    return;
  }
  view3dLoading = false;
}
function close3D() {
  if (view3d) { view3d.dispose(); view3d = null; }
  view3dLoading = false;
  $("view3d-status").hidden = true;
  $("view3d-status").textContent = "Loading the 3D tray…";
  document.querySelector(".app").classList.remove("in-3d");
  $("view-3d").setAttribute("aria-pressed", "false");
  $("view-2d").setAttribute("aria-pressed", "true");
  board.resize();
}
$("view-3d").addEventListener("click", open3D);
$("view-2d").addEventListener("click", close3D);
const in3D = () => document.querySelector(".app").classList.contains("in-3d");

// ---------------------------------------------------------------------------------------------
// Flip, undo, zoom buttons

$("flip").addEventListener("click", flip);
function flip() {
  if (board.mode === "tray") {
    const flipped = turnOver(trayGrid(), board.w, board.h);
    layTray(flipped, board.w, board.h);
    toast("Flipped over. Flip again to turn it back.");
    return;
  }
  const b = board.artBounds();
  if (!b) { toast("Nothing on the table to flip yet."); return; }
  const old = [...board.cells];
  batch(() => {
    for (const [k] of old) board.set(...unkey(k), null);
    for (const [k, d] of old) {
      const [x, y] = unkey(k);
      board.set(2 * b.x + b.w - 1 - x, y, underside(d));
    }
  });
  board.clearSelection();
  toast("Flipped over. Flip again to turn it back.");
}

$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
$("zoom-in").addEventListener("click", () => board.zoomAt(board.vw / 2, board.vh / 2, 1.3));
$("zoom-out").addEventListener("click", () => board.zoomAt(board.vw / 2, board.vh / 2, 1 / 1.3));
$("fit").addEventListener("click", () => board.fit());

// ---------------------------------------------------------------------------------------------
// Keyboard. Works anywhere on the page except while typing in a field or with a sheet open.
//
//   W R Y B    solid white, red, yellow, blue       N M   blue/yellow, red/white split
//   1 2 3 4    dark corner top left … bottom left   T     turn the selection clockwise
//   arrows     move (hold to slide), Shift extends  Ctrl A select all, Esc lets go
//   Enter      paint the selection                  Delete erase it
//   F flip · V 3D · S cube style · + − 0 zoom · Ctrl Z / Ctrl Y undo and redo · Ctrl P print · ? keys

const canvas = board.canvas;
const typingIn = (t) => t && t.closest && t.closest("textarea, input, select, [contenteditable]");
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Holding an arrow: one step at once, then after a short pause the cursor slides. The slide
// speed is in screen distance, so zoomed out it covers more cubes per second.
const held = new Map();
let slide = null;
let slideTimer = 0;
function slideTick() {
  const now = performance.now();
  if (!slide || !held.size) { stopSlide(); return; }
  if (now - slide.start > 300) {
    const dt = Math.min(0.05, (now - slide.last) / 1000);
    const rate = Math.min(40, Math.max(6, 650 / board.zoom)); // cubes per second
    slide.acc += dt * rate;
    while (slide.acc >= 1) {
      slide.acc -= 1;
      let dx = 0, dy = 0;
      for (const [ddx, ddy] of held.values()) { dx += ddx; dy += ddy; }
      board.moveCursor(Math.sign(dx), Math.sign(dy), slide.shift, true);
    }
  }
  slide.last = now;
}
function stopSlide() { held.clear(); slide = null; clearInterval(slideTimer); slideTimer = 0; }

document.addEventListener("keydown", (e) => {
  const typing = typingIn(e.target);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  // Shortcuts that work almost everywhere.
  if (mod && !e.altKey && k === "p") { e.preventDefault(); exportAs("print"); return; }
  if (mod && !e.altKey && k === "s") { e.preventDefault(); saveDesign(); return; }
  if (e.key === "Escape") {
    if (openSheet) { closeSheet(); return; }
    if (in3D()) { close3D(); return; }
    board.clearSelection();
    return;
  }
  if (typing || openSheet) return;
  if (mod && !e.altKey) {
    if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === "y") { e.preventDefault(); redo(); }
    else if (k === "a" && !in3D()) { e.preventDefault(); board.selectAll(); }
    return;
  }
  if (e.altKey) return;

  if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); showSheet("keys"); return; }
  if (k === "v") { e.preventDefault(); if (in3D()) close3D(); else open3D(); return; }
  if (k === "s") { e.preventDefault(); setStyle(STYLES[(STYLES.indexOf(board.style) + 1) % STYLES.length]); return; }
  if (in3D()) return;

  if (ARROWS[e.key]) {
    e.preventDefault();
    if (e.repeat) return; // our own slide takes over from the key repeat
    held.set(e.key, ARROWS[e.key]);
    const [dx, dy] = ARROWS[e.key];
    board.moveCursor(dx, dy, e.shiftKey);
    if (!slide) {
      const now = performance.now();
      slide = { start: now, last: now, acc: 0, shift: e.shiftKey };
      clearInterval(slideTimer);
      slideTimer = setInterval(slideTick, 16);
    }
    else { slide.start = performance.now(); slide.acc = 0; slide.shift = e.shiftKey; }
    return;
  }
  if (e.key === " ") {
    e.preventDefault();
    board.spaceHeld = true;
    canvas.classList.add("pan");
    return;
  }
  const color = COLORS.find((f) => f.key === k);
  if (color) { e.preventDefault(); pickColor(color, true); return; }
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); pickRotation(Number(e.key) - 1); return; }
  if (e.key === "Enter") {
    e.preventDefault();
    if (!board.cursor) { board.moveCursor(0, 0); return; }
    if (board.sel.size === 1) {
      // One cube: paint it, or turn it if it already shows the picked pair.
      batch(() => board.paintCell(board.cursor.x, board.cursor.y, true));
    } else paintSelected(face);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    eraseSelected();
  } else if (k === "t") {
    turnSelected();
  } else if (e.key === "+" || e.key === "=") {
    board.zoomAt(board.vw / 2, board.vh / 2, 1.3);
  } else if (e.key === "-" || e.key === "_") {
    board.zoomAt(board.vw / 2, board.vh / 2, 1 / 1.3);
  } else if (e.key === "0") {
    board.fit();
  } else if (k === "f") {
    flip();
  } else {
    return;
  }
  saySelection();
});
document.addEventListener("keyup", (e) => {
  if (ARROWS[e.key]) {
    held.delete(e.key);
    if (!held.size) stopSlide();
  }
  if (e.key === " ") {
    board.spaceHeld = false;
    canvas.classList.toggle("pan", tool === "pan");
  }
});
window.addEventListener("blur", () => { board.spaceHeld = false; stopSlide(); });

// ---------------------------------------------------------------------------------------------
// Sheets: full screen on phones, a drawer (or a centered panel) on wide screens. Each one adds a
// history entry, so the back button and the phone's back swipe close it. Dragging a sheet to the
// right closes it too.

let openSheet = null;
let returnFocus = null;
const scrim = $("scrim");
const app = document.querySelector(".app");

function showSheet(name) {
  if (openSheet === name) return;
  if (openSheet) hideSheet(true);
  stopSlide();
  const el = $("sheet-" + name);
  returnFocus = document.activeElement;
  openSheet = name;
  if (name === "share") { rememberNow(true); askPersist(); renderShare(); }
  if (name === "tray") syncTraySheet();
  if (name === "designs") renderDesigns();
  el.hidden = false;
  scrim.hidden = false;
  app.inert = true;
  requestAnimationFrame(() => {
    if (openSheet !== name) return; // closed again before it could slide in
    el.classList.add("open");
    scrim.classList.add("show");
  });
  history_.pushState({ sheet: name }, "");
  el.querySelector("[data-close]").focus({ preventScroll: true });
}

function hideSheet(swap) {
  const name = openSheet;
  if (!name) return;
  const el = $("sheet-" + name);
  openSheet = null;
  el.classList.remove("open", "dragging");
  el.style.transform = "";
  if (!swap) {
    scrim.classList.remove("show");
    scrim.style.opacity = "";
    app.inert = false;
    setTimeout(() => { if (!openSheet) scrim.hidden = true; }, 260);
    if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
  }
  setTimeout(() => { if (openSheet !== name) el.hidden = true; }, 260);
}

// Closing from the page (Esc, the back button in a sheet, the scrim) hides the sheet at once and
// steps history back past its entry; that one popstate is then ignored, so a sheet opened in the
// meantime stays open.
let skipPop = 0;
function closeSheet() {
  if (!openSheet) return;
  hideSheet();
  if (history_.state && history_.state.sheet) { skipPop++; history_.back(); }
}

window.addEventListener("popstate", () => {
  if (skipPop) { skipPop--; return; }
  if (openSheet) hideSheet();
  writeUrl(true);
});

$("open-tray").addEventListener("click", () => showSheet("tray"));
$("open-share").addEventListener("click", () => showSheet("share"));
$("open-designs").addEventListener("click", () => showSheet("designs"));
$("open-export").addEventListener("click", () => showSheet("export"));
$("open-help").addEventListener("click", () => showSheet("help"));
$("open-keys").addEventListener("click", () => showSheet("keys"));
$("help-keys").addEventListener("click", () => showSheet("keys"));
scrim.addEventListener("click", closeSheet);
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));

document.querySelectorAll(".sheet").forEach((el) => {
  let start = null;
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest("textarea, input, select")) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), drag: false, id: e.pointerId };
  });
  el.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.drag) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (dx > 12 && dx > Math.abs(dy) * 1.3) {
        start.drag = true;
        el.classList.add("dragging");
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      } else return;
    }
    const x = Math.max(0, dx);
    el.style.transform = `translateX(${x}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - x / el.offsetWidth));
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const s = start;
    start = null;
    if (!s.drag) return;
    const dx = e.clientX - s.x;
    const speed = dx / Math.max(1, performance.now() - s.t);
    el.classList.remove("dragging");
    if (dx > el.offsetWidth * 0.3 || speed > 0.5) {
      closeSheet();
    } else {
      el.style.transform = "";
      scrim.style.opacity = "";
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
});

// ---------------------------------------------------------------------------------------------
// Tray sheet

const sizeChips = $("size-chips");
for (const ed of EDITIONS) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.w = ed.w;
  b.dataset.h = ed.h;
  b.innerHTML = `${ed.w}×${ed.h}<small>${ed.set}</small>`;
  b.addEventListener("click", () => resizeTray(ed.w, ed.h));
  sizeChips.appendChild(b);
}
for (const id of ["cols", "rows"]) {
  const sel = $(id);
  for (let n = MIN_SIZE; n <= MAX_SIZE; n++) sel.add(new Option(String(n), String(n)));
  sel.addEventListener("change", () => resizeTray(Number($("cols").value), Number($("rows").value)));
}

/**
 * Change the tray size, keeping the design centered: growing adds white around it, shrinking
 * trims evenly from both sides (one undo step brings back what was trimmed).
 */
function resizeTray(w, h) {
  if (board.mode === "tray" && w === board.w && h === board.h) return;
  if (board.mode === "tray") {
    const dx = Math.trunc((w - board.w) / 2), dy = Math.trunc((h - board.h) / 2);
    const old = [...board.cells];
    batch(() => {
      for (const [k] of old) board.set(...unkey(k), null);
      for (const [k, d] of old) {
        const [x, y] = unkey(k);
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) board.set(nx, ny, d);
      }
    }, { mode: "tray", w, h });
  } else {
    batch(() => {}, { mode: "tray", w, h });
  }
  board.clearSelection();
  board.fit();
  changed();
  toast(`Tray is ${w}×${h}. Undo brings back anything trimmed.`);
}

$("mode-tray").addEventListener("click", () => setMode("tray"));
$("mode-free").addEventListener("click", () => setMode("free"));
function setMode(m) {
  if (board.mode === m) return;
  if (m === "free" && in3D()) close3D();
  detach();
  batch(() => {}, { mode: m, w: board.w, h: board.h });
  laid();
  board.clearSelection();
  if (m === "tray") board.fit();
  else board.clampView();
  changed();
  toast(m === "tray" ? "Back in the tray." : "Free table: lay cubes anywhere.");
}

$("show-codes").addEventListener("change", (e) => {
  board.showCodes = e.target.checked;
  changed();
});

$("random").addEventListener("click", () => {
  const v = new Uint32Array(board.w * board.h);
  crypto.getRandomValues(v);
  detach();
  layTray(Array.from(v, (n) => n % 12), board.w, board.h);
  laid();
  toast("Random tray. Undo to go back.");
});

$("clear").addEventListener("click", () => {
  if (board.mode === "tray") {
    detach();
    batch(() => { for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) board.set(x, y, null); });
    laid();
    toast("Cleared the tray to white. Undo to go back.");
    return;
  }
  if (!board.cells.size) { toast("The table is already empty."); return; }
  $("confirm-text").textContent = `Take all ${board.cells.size.toLocaleString("en-US")} cubes off the table? Undo can still bring them back.`;
  $("confirm").hidden = false;
  $("confirm-no").focus();
});
$("confirm-no").addEventListener("click", () => { $("confirm").hidden = true; });
$("confirm-yes").addEventListener("click", () => {
  const keys = [...board.cells.keys()];
  detach();
  batch(() => { for (const k of keys) board.set(...unkey(k), null); });
  laid();
  $("confirm").hidden = true;
  board.clearSelection();
  board.fit();
  toast("Cleared the table.");
});

function syncTraySheet() {
  const tray = board.mode === "tray";
  $("mode-tray").setAttribute("aria-pressed", String(tray));
  $("mode-free").setAttribute("aria-pressed", String(!tray));
  $("tray-only").hidden = !tray;
  $("free-note").hidden = tray;
  $("random").hidden = !tray;
  $("cols").value = String(board.w);
  $("rows").value = String(board.h);
  sizeChips.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-pressed", String(tray && Number(b.dataset.w) === board.w && Number(b.dataset.h) === board.h));
  });
  document.querySelectorAll("[data-style]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === board.style)));
  $("show-codes").checked = board.showCodes;
  $("designs-note").textContent = tray
    ? "Tap one to lay it in the tray. Undo puts back what was there."
    : "Tap one to lay it in the middle of the view.";
}

// Designs, filtered by size. 7×7 (the standard set) first.
let designs = [];
let designSize = null;
fetch("/data/patterns.json")
  .then((r) => r.json())
  .then((data) => {
    designs = [...data.lid.map((p) => ({ ...p, group: "lid" })), ...data.presets];
    const sizes = [...new Set(designs.map((p) => `${p.w}×${p.h}`))].sort((a, b) => parseInt(a) - parseInt(b));
    designSize = sizes.includes(`${board.w}×${board.h}`) ? `${board.w}×${board.h}` : "7×7";
    const chips = $("design-sizes");
    for (const s of sizes) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s;
      b.addEventListener("click", () => { designSize = s; renderPresets(); });
      chips.appendChild(b);
    }
    renderPresets();
  })
  .catch(() => { $("designs-note").textContent = "The designs couldn't load. Check your connection and try again."; });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function renderPresets() {
  if (!designs.length) return;
  $("design-sizes").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === designSize)));
  const list = designs.filter((p) => `${p.w}×${p.h}` === designSize);
  // A size can have a hundred designs: draw each tray as it nears the view.
  if (presetSeen) presetSeen.disconnect();
  $("presets").innerHTML = list.map((p, i) =>
    `<li><button type="button" data-i="${i}"><i class="ph"></i>${esc(p.name)}</button></li>`
  ).join("");
  $("presets").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => usePreset(list[Number(b.dataset.i)]));
    if (presetSeen) presetSeen.observe(b); else drawPreset(b, list);
  });
  presetList = list;
}

let presetList = [];
const drawPreset = (b, list = presetList) => {
  const ph = b.querySelector(".ph");
  if (ph) ph.outerHTML = codeSVG(list[Number(b.dataset.i)].code, { gap: 0.04 });
};
const presetSeen = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { presetSeen.unobserve(e.target); drawPreset(e.target); }
  }, { rootMargin: "400px 0px" })
  : null;

function usePreset(p) {
  const { grid, w, h } = parseCode(p.code);
  // In a tray a preset is a new design; on the free table it's added to what's there.
  const fresh = board.mode === "tray";
  if (fresh) detach(p.name);
  if (board.mode === "tray") {
    layTray(grid, w, h);
    board.fit();
  } else {
    const x0 = Math.floor(board.cx - w / 2), y0 = Math.floor(board.cy - h / 2);
    batch(() => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) board.set(x0 + x, y0 + y, grid[y * w + x]); });
  }
  if (fresh) laid();
  closeSheet();
  toast(`${p.name}. Paint over it, flip it or share it.`);
}

// ---------------------------------------------------------------------------------------------
// Share sheet: the link and its QR code first, the tray code tucked below.

const codeEl = $("code");
function renderShare() {
  const tray = board.mode === "tray";
  $("share-tray").hidden = !tray;
  $("share-free").hidden = tray;
  if (!tray) return;
  const grid = trayGrid();
  const read = toReadable(grid, board.w, board.h);
  const compact = toCompact(grid, board.w, board.h);
  if (document.activeElement !== codeEl) {
    codeEl.value = read;
    setErr("");
  }
  $("share-preview").innerHTML = traySVG(grid, board.w, board.h, { gap: 0.04, label: `This ${board.w}×${board.h} tray` });
  $("share-size").textContent = `${board.w}×${board.h} tray, ${board.w * board.h} cubes`;
  $("link-compact").textContent = SHORT.replace(/^https?:\/\//, "") + compact;
  $("link-compact").dataset.url = SHORT + compact;
  $("link-readable").textContent = SHORT + read;
  $("native-share").hidden = !navigator.share;
  drawQR(SHORT + compact);
}

function setErr(msg) {
  $("code-err").textContent = msg;
  codeEl.setAttribute("aria-invalid", msg ? "true" : "false");
}
let codeTimer = 0;
codeEl.addEventListener("input", () => {
  clearTimeout(codeTimer);
  codeTimer = setTimeout(() => {
    const res = parseCode(codeEl.value);
    if (res.error) { setErr(res.error); return; }
    setErr("");
    if (toReadable(res.grid, res.w, res.h) !== readable()) layTray(res.grid, res.w, res.h);
  }, 300);
});
codeEl.addEventListener("blur", () => { if (!$("code-err").textContent) codeEl.value = readable(); });

const ALNUM = /^[0-9A-Z $%*+\-.\/:]*$/;
/** QR code for text, as { size, dark(r, c) }, or null if the library didn't load. */
function qrFor(text) {
  if (typeof qrcode === "undefined") return null;
  const upper = text.toUpperCase();
  const alnum = ALNUM.test(upper);
  const q = qrcode(0, "M");
  q.addData(alnum ? upper : text, alnum ? "Alphanumeric" : "Byte");
  q.make();
  return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}
function drawQR(text) {
  const el = $("qr");
  const q = qrFor(text);
  if (!q) { $("qr-note").textContent = "The QR code couldn't load. Check your connection and reload."; return; }
  const pad = 4, size = q.size + pad * 2;
  let d = "";
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.dark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  el.setAttribute("viewBox", `0 0 ${size} ${size}`);
  el.innerHTML = `<rect width="${size}" height="${size}" fill="#FFFFFF"/><path d="${d}" fill="#000000"/>`;
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    ta.remove();
    toast(ok ? msg : "Couldn't copy here. Select the text and copy it yourself.");
  }
}
$("copy-compact").addEventListener("click", () => copy($("link-compact").dataset.url, "Copied the link."));
$("copy-readable").addEventListener("click", () => copy($("link-readable").textContent, "Copied the long link."));
$("copy-code").addEventListener("click", () => copy(readable(), "Copied the code."));
$("native-share").addEventListener("click", () => {
  navigator.share({ title: "Color Cubes tray", url: $("link-compact").dataset.url }).catch(() => {});
});
$("download-qr").addEventListener("click", () => {
  const svg = $("qr").outerHTML.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  download(new Blob([svg], { type: "image/svg+xml" }), fileBase() + "-qr.svg");
});

// ---------------------------------------------------------------------------------------------
// Your designs sheet: everything kept in this browser, newest first.

let designsFilter = "all";
let confirmDelete = null; // id whose delete button is asking "Delete?"

const defaultName = (e) => (e.mode === "tray" ? `${e.w}×${e.h} tray` : "Free table");

function when(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 && new Date(t).getDate() === new Date().getDate()) return `${Math.round(s / 3600)} h ago`;
  const d = new Date(t), today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d >= yesterday) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** A small picture of a saved design. */
function thumbSVG(e) {
  if (e.mode === "tray") return codeSVG(e.code, { gap: 0.04 });
  if (!e.cells.length) return `<svg viewBox="0 0 100 100" aria-hidden="true"></svg>`;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of e.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = 100, g = 4, W = (x1 - x0 + 1) * (s + g) - g, H = (y1 - y0 + 1) * (s + g) - g;
  const side = Math.max(W, H);
  let body = "";
  for (const [x, y, d] of e.cells) body += faceShapes(d, (x - x0) * (s + g) + (side - W) / 2, (y - y0) * (s + g) + (side - H) / 2, s);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" aria-hidden="true">${body}</svg>`;
}

const ICON_RENAME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4.5l5 5L10 19H5v-5z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

function renderDesigns() {
  const all = readSaved(localStorage).sort((a, b) => b.updated - a.updated);
  const savedCount = all.filter((e) => e.saved).length;
  $("designs-filter").querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.f === designsFilter));
    if (b.dataset.f === "saved") b.textContent = `Saved (${savedCount})`;
    if (b.dataset.f === "all") b.textContent = `All (${all.length})`;
  });
  const list = designsFilter === "saved" ? all.filter((e) => e.saved) : all;
  const here = nowKey();
  $("saved-empty").hidden = list.length > 0;
  $("saved-empty").textContent = all.length
    ? "Nothing saved yet. Press Save this design, or share one, and it stays here as it was."
    : "Nothing here yet. Change a design and it shows up here; Save or Share keeps it as it is.";
  $("saved-list").innerHTML = list.map((e) => {
    const name = esc(e.name || defaultName(e));
    const open = e.id === cur || contentKey(e) === here;
    const size = e.mode === "tray" ? `${e.w}×${e.h}` : `${e.cells.length} cubes`;
    const meta = `${size} · ${e.saved ? "Saved" : "Edited"} ${when(e.updated)}`;
    return `<li class="saved-item${open ? " here" : ""}" data-id="${esc(e.id)}">
      <button class="saved-open" type="button" data-act="open" aria-label="Open ${name}">${thumbSVG(e)}</button>
      <div class="saved-text">
        <span class="saved-name">${e.saved ? '<span class="star" title="Saved" aria-label="Saved">★</span>' : ""}<span class="nm">${name}</span></span>
        <small>${meta}${open ? " · on screen" : ""}</small>
      </div>
      <div class="saved-acts">
        <button type="button" class="mini" data-act="rename" aria-label="Rename ${name}" title="Rename">${ICON_RENAME}</button>
        <button type="button" class="mini del${confirmDelete === e.id ? " asking" : ""}" data-act="delete" aria-label="${confirmDelete === e.id ? "Tap again to delete" : "Delete"} ${name}" title="Delete">${confirmDelete === e.id ? "Delete?" : ICON_DELETE}</button>
      </div>
    </li>`;
  }).join("");
  $("save-design").textContent = all.some((e) => e.saved && contentKey(e) === here) ? "Saved ✓" : "Save this design";
}

$("designs-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  designsFilter = b.dataset.f;
  renderDesigns();
});
$("save-design").addEventListener("click", () => { saveDesign(); renderDesigns(); });

let deleteTimer = 0;
$("saved-list").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  const items = readSaved(localStorage);
  const e = items.find((i) => i.id === id);
  if (!e) { renderDesigns(); return; }
  if (b.dataset.act === "open") openSaved(e);
  else if (b.dataset.act === "rename") startRename(b.closest("li"), e);
  else if (b.dataset.act === "delete") {
    clearTimeout(deleteTimer);
    if (confirmDelete !== id) {
      confirmDelete = id;
      renderDesigns();
      deleteTimer = setTimeout(() => { confirmDelete = null; if (openSheet === "designs") renderDesigns(); }, 3500);
      $("saved-list").querySelector(`[data-id="${CSS.escape(id)}"] .del`)?.focus();
      return;
    }
    confirmDelete = null;
    try { writeSaved(localStorage, items.filter((i) => i.id !== id)); } catch (err) { /* reading still works */ }
    // Deleting the design on screen doesn't bring it straight back: it's kept again only once changed.
    if (id === cur || contentKey(e) === nowKey()) { cur = null; pristine = nowKey(); save(); }
    renderDesigns();
    toast(`Deleted ${e.name || defaultName(e)}.`);
  }
});

function startRename(li, e) {
  const nm = li.querySelector(".nm");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rename";
  input.maxLength = 80;
  input.value = e.name || defaultName(e);
  input.setAttribute("aria-label", "Name");
  nm.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    if (ok) {
      const items = readSaved(localStorage);
      const t = items.find((i) => i.id === e.id);
      const v = input.value.trim();
      if (t) { t.name = v === defaultName(t) ? "" : v; try { writeSaved(localStorage, items); } catch (err) { /* ignore */ } }
    }
    renderDesigns();
  };
  input.addEventListener("keydown", (k) => {
    if (k.key === "Enter") { k.preventDefault(); finish(true); }
    else if (k.key === "Escape") { k.preventDefault(); k.stopPropagation(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

/** Lay a saved design on the board, as one undo step. Changing a saved one starts a new entry. */
function openSaved(e) {
  rememberNow();
  if (contentKey(e) === nowKey()) { cur = e.id; closeSheet(); return; }
  if (e.mode === "tray") {
    const p = parseCode(e.code);
    layTray(p.grid, p.w, p.h);
    board.fit();
  } else {
    if (in3D()) close3D();
    const old = [...board.cells.keys()];
    batch(() => {
      for (const k of old) board.set(...unkey(k), null);
      for (const [x, y, d] of e.cells) board.set(x, y, d);
    }, { mode: "free", w: board.w, h: board.h });
    board.clearSelection();
    board.fit();
  }
  cur = e.id;
  pendingName = e.name;
  laid();
  closeSheet();
  toast(`Opened ${e.name || defaultName(e)}. Undo goes back.`);
}

$("backup").addEventListener("click", () => {
  rememberNow();
  const items = readSaved(localStorage);
  if (!items.length) { toast("There's nothing to back up yet."); return; }
  const day = new Date().toISOString().slice(0, 10);
  download(new Blob([toBackup(items)], { type: "application/json" }), `color-cubes-designs-${day}.json`);
  toast(`Saved a backup of ${items.length} design${items.length === 1 ? "" : "s"}.`);
});
$("restore").addEventListener("click", () => $("restore-file").click());
$("restore-file").addEventListener("change", async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  const r = fromBackup(readSaved(localStorage), await f.text());
  if (r.error) { toast(r.error); return; }
  try { writeSaved(localStorage, r.items); } catch (err) { toast("This browser is out of room for designs."); return; }
  renderDesigns();
  toast(r.added ? `Added ${r.added} design${r.added === 1 ? "" : "s"} from the backup.` : "Everything in that backup is already here.");
});

// Another tab changed the list.
window.addEventListener("storage", (ev) => { if (ev.key === SAVED_KEY && openSheet === "designs") renderDesigns(); });

// ---------------------------------------------------------------------------------------------
// Export: PDF (download or print), PNG and SVG, all in the cube style on screen.

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileBase = () => (board.mode === "tray" ? "color-cubes-" + toCompact(trayGrid(), board.w, board.h) : "color-cubes-table");

/** What an export draws: the whole tray, or everything on the free table. */
function exportArea() {
  if (board.mode === "tray") return { rect: { x: 0, y: 0, w: board.w, h: board.h }, tray: true };
  const b = board.artBounds();
  return b ? { rect: b, tray: false } : null;
}
const lookAt = (x, y, tray) => (tray ? board.faceAt(x, y) : board.cells.get(key(x, y)));

/** The scanned faces, cut from the atlas, as canvases. Waits for the atlas the first time. */
async function scannedFaces(size) {
  await new Promise((resolve) => loadScans(resolve, board.style));
  const a = scanAtlas(board.style);
  if (!a) return null;
  const pad = (a.cell - a.face) / 2;
  return Array.from({ length: 12 }, (_, d) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.drawImage(a.img, (d % 4) * a.cell + pad, Math.floor(d / 4) * a.cell + pad, a.face, a.face, 0, 0, size, size);
    return c;
  });
}

const EXPORTS = [
  { kind: "pdf", title: "PDF", desc: "A printable page with the tray, its code and a QR code" },
  { kind: "print", title: "Print", desc: "Straight to the printer", hint: "Ctrl P" },
  { kind: "png", title: "PNG picture", desc: "For messages and social posts" },
  { kind: "svg", title: "SVG drawing", desc: "Sharp at any size, opens in drawing apps" }
];
const EXPORT_ICONS = {
  pdf: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 14h6M10 17h4"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  png: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  svg: '<path d="M4 20L20 4"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v6a6 6 0 006 6h6"/>'
};
document.querySelectorAll(".export-list").forEach((ul) => {
  ul.innerHTML = EXPORTS.map((x) =>
    `<li><button type="button" data-export="${x.kind}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EXPORT_ICONS[x.kind]}</svg><span><b>${x.title}</b> <small>${x.desc}</small></span>${x.hint ? `<kbd class="key-hint">${x.hint}</kbd>` : ""}</button></li>`
  ).join("");
  // The paper for PDF and Print, under the list.
  ul.insertAdjacentHTML("afterend", `<div class="paper-row"><span class="note" id="${ul.closest("#sheet-export") ? "paper-l" : "paper-lm"}">Paper for PDF and Print</span>`
    + `<div class="chips" role="group" aria-labelledby="${ul.closest("#sheet-export") ? "paper-l" : "paper-lm"}">`
    + Object.entries(PAPERS).map(([k, p]) => `<button type="button" data-paper="${k}" aria-pressed="false">${p.label}</button>`).join("")
    + `</div></div>`);
});
function syncPaper() {
  const p = paper();
  document.querySelectorAll("[data-paper]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paper === p)));
}
syncPaper();
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-export]");
  if (b) exportAs(b.dataset.export);
  const p = e.target.closest("[data-paper]");
  if (p) { setPaper(p.dataset.paper); syncPaper(); }
});
const STYLE_NAMES = { solid: "Solid", scanned: "Original", printed: "Printed" };
function syncExportNotes() {
  const s = STYLE_NAMES[board.style];
  document.querySelectorAll(".export-style").forEach((el) => { el.textContent = s; });
}

let exporting = false;
async function exportAs(kind) {
  if (exporting) return;
  const area = exportArea();
  if (!area) { toast("Nothing on the table to export yet."); return; }
  exporting = true;
  try {
    if (kind === "png") await exportPNG(area);
    else if (kind === "svg") await exportSVG(area);
    else await exportPDF(area, kind === "print");
  } catch (err) {
    if (kind === "print") window.print();
    else toast("That export didn't work. Try again, or try another format.");
  } finally {
    exporting = false;
  }
}

async function exportPNG({ rect, tray }) {
  await new Promise((resolve) => loadScans(resolve, board.style));
  const px = Math.max(16, Math.min(160, Math.floor(4000 / Math.max(rect.w, rect.h))));
  board.render(rect, px, tray).toBlob((b) => download(b, fileBase() + ".png"), "image/png");
  toast("Saved a PNG.");
}

async function exportSVG({ rect, tray }) {
  const s = 100, gap = 3, pad = 30;
  const W = rect.w * (s + gap) - gap + 2 * pad, H = rect.h * (s + gap) - gap + 2 * pad;
  let body = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  let defs = "";
  const scans = isScan(board.style) ? await scannedFaces(240) : null;
  const used = new Set();
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const d = lookAt(x, y, tray);
      if (d === undefined) continue;
      const X = pad + (x - rect.x) * (s + gap), Y = pad + (y - rect.y) * (s + gap);
      if (scans) { used.add(d); body += `<use href="#f${d}" x="${X}" y="${Y}"/>`; }
      else body += faceShapes(d, X, Y, s, { flat: flatFaces() });
    }
  }
  if (scans) {
    for (const d of used) defs += `<image id="f${d}" width="${s}" height="${s}" href="${scans[d].toDataURL("image/png")}"/>`;
    defs = `<defs>${defs}</defs>`;
  }
  if (tray) body += `<rect x="${pad - 2}" y="${pad - 2}" width="${W - 2 * pad + 4}" height="${H - 2 * pad + 4}" fill="none" stroke="#000000" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs}${body}</svg>`;
  download(new Blob([svg], { type: "image/svg+xml" }), fileBase() + ".svg");
  toast("Saved an SVG.");
}

async function exportPDF({ rect, tray }, print) {
  toast(print ? "Getting the page ready to print…" : "Making the PDF…");
  const { makeTrayPdf, printPdf } = await import("/designer/pdf.js");
  const cells = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const d = lookAt(x, y, tray);
      if (d !== undefined) cells.push({ x: x - rect.x, y: y - rect.y, d });
    }
  }
  let faces = null;
  if (isScan(board.style)) {
    const scans = await scannedFaces(240);
    if (scans) {
      faces = await Promise.all(scans.map((c) => {
        // JPEG has no transparency: put each scan on white first.
        const w = document.createElement("canvas");
        w.width = w.height = c.width;
        const ctx = w.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w.width, w.height);
        ctx.drawImage(c, 0, 0);
        return new Promise((resolve) => w.toBlob(async (b) => resolve({ bytes: new Uint8Array(await b.arrayBuffer()), size: w.width }), "image/jpeg", 0.9));
      }));
    }
  }
  const grid = tray ? trayGrid() : null;
  const compact = tray ? toCompact(grid, board.w, board.h) : null;
  const pdf = makeTrayPdf({
    cols: rect.w, rows: rect.h, cells, tray, faces, flat: !faces && flatFaces(),
    title: tray ? `Tray ${board.w}×${board.h}` : "Free table",
    link: tray ? SHORT + compact : null,
    qr: tray ? qrFor(SHORT + compact) : null,
    paper: paper(),
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  });
  const blob = new Blob([pdf], { type: "application/pdf" });
  if (print) await printPdf(blob);
  else { download(blob, fileBase() + ".pdf"); toast("Saved a PDF."); }
}

// ---------------------------------------------------------------------------------------------
// Start

const saved = load();
// What was on screen last time, to tell a reload (carry on with the same entry) from a link.
const savedKey = saved ? nowKey() : null;
loadScans(() => { board.requestDraw(); setFace(face); }, board.style);
const start = readUrl();
let invalid = null;
try { invalid = new URLSearchParams(location.search).get("invalid"); } catch (e) { /* old browsers */ }

if (start && start !== "canvas" && !start.error) {
  board.mode = "tray";
  board.w = start.w;
  board.h = start.h;
  for (const k of [...board.cells.keys()]) {
    const [x, y] = unkey(k);
    if (x < 0 || y < 0 || x >= start.w || y >= start.h) board.cells.delete(k);
  }
  for (let y = 0; y < start.h; y++) for (let x = 0; x < start.w; x++) board.cells.set(key(x, y), start.grid[y * start.w + x]);
} else if (start === "canvas") {
  board.mode = "free";
} else if (!saved) {
  const q = parseCode(START);
  board.mode = "tray";
  board.w = q.w;
  board.h = q.h;
  for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) board.cells.set(key(x, y), q.grid[y * q.w + x]);
}

{
  const k = nowKey();
  if (saved && k === savedKey) {
    cur = typeof saved.cur === "string" ? saved.cur : null;
    pristine = typeof saved.pristine === "string" ? saved.pristine : null;
  } else {
    pristine = k; // a link, or the starting design: kept once it's changed
  }
  if (k === contentKey({ mode: "tray", code: START })) pristine = k;
}

setFace(face);
setTool("paint");
syncTheme();
syncExportNotes();
syncFlat();
document.querySelectorAll("[data-style]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === board.style)));
board.resize();
// Always open centered on the tray (or on everything drawn), whatever screen it was saved on.
board.fit(false);
changed();
history.undo.length = 0;
$("undo").disabled = true;
saySelection();

if ((start && start.error) || invalid) {
  toast("That link's code couldn't be read" + (start && start.error ? ": " + start.error : "."));
} else if (start && start !== "canvas") {
  toast(start.kind === "compact" ? "Opened the tray from the link." : `Opened a ${start.w}×${start.h} tray.`);
}

new ResizeObserver(() => board.resize()).observe(canvas);
