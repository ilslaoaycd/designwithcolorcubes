// box.js — the box designer: a lid (and tray) for a set of Color Cubes of any size. The lid has
// designs the size of the set round a middle panel (the 1930s lettering or your own words), designs
// all over it, or one big design. Tap a design on the lid to change it; drag it onto another to swap them.
// The layout and artwork come from /js/lidart.js, the 3D files from /js/print3d.js; everything is
// made in the browser. The whole design lives in the page address:
//   /box/7x7                      the lid a 7 × 7 set starts with
//   /box/7x5/{token}?t=…          any other design (boxcode.js); ?set marks the print-a-set steps
// MIT licensed (see LICENSE).

import { parseCode, toReadable } from "/js/cubecode.js";
import { codeSVG } from "/js/cubeface.js";
import { SHOW, COLOR_IDS, shapes, artRegions, lidSVG } from "/js/lidart.js";
import { lidSize, traySize, lidParts, trayParts, to3MF, toSTL, zip, FILAMENTS, LID_SETTINGS } from "/js/print3d.js";
import * as BC from "/js/boxcode.js";
import { designsFor } from "/js/designs.js";
import { buildLid } from "/js/lidbuild.js";
import { SHORT_ORIGIN } from "/js/config.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const NAMES = { white: "White", red: "Red", yellow: "Yellow", blue: "Blue", none: "None" };

let patterns = null;
let type = null;
let spec = null;
let designs = [];
let codes = [];
let built = null;
let flow = false;    // reached from "Print a set": show the steps and lead on to the files

// ---------------------------------------------------------------------------------------------
// The address

/** The design from the page address, including the old #base64(JSON) links. */
function fromAddress() {
  const q = new URLSearchParams(location.search);
  flow = q.has("set");
  const path = BC.readPath(location.pathname);
  if (path && path.token) {
    const s = BC.decode(path.token, q.getAll("t"));
    if (s) return s;
  }
  if (path) return BC.defaultSpec(path.cols, path.rows);
  if (location.hash.length > 1) {
    try {
      const old = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1).replace(/-/g, "+").replace(/_/g, "/")))));
      return fromOld(old);
    } catch (e) { /* not an old link */ }
  }
  const cols = Number(q.get("cols")), rows = Number(q.get("rows"));
  return BC.defaultSpec(cols || 7, rows || cols || 7);
}

/** A design saved by the first box designer (layouts ring, rows, title and single). */
function fromOld(o) {
  const custom = o.lettering === "custom" && Array.isArray(o.lines);
  const s = BC.presetSpec(o.layout === "single" ? "big" : custom ? "text" : "classic", o.cols, o.rows);
  for (const k of ["frame", "background", "stars", "walls"]) if (o[k]) s[k] = o[k];
  if (s.labels[0]) {
    if (o.panel) s.labels[0].fill = o.panel;
    if (o.ink) s.labels[0].ink = o.ink;
    if (custom) s.labels[0].lines = o.lines.filter((l) => l.text).map((l) => ({ text: l.text, big: l.size === "large" }));
  }
  return BC.clean(s);
}

const pagePath = () => BC.boxPath(spec) + BC.query(spec, flow ? { set: "1" } : {});
const filesPath = () => BC.boxPath(spec, "/print/") + BC.query(spec);
const shortLink = () => `${SHORT_ORIGIN}/b/${BC.encode(spec)}${BC.query(spec)}`;

// ---------------------------------------------------------------------------------------------
// Drawing

function build() {
  designs = designsFor(spec.cols, spec.rows, patterns);
  codes = BC.spotCodes(spec, designs);
  built = shapes(spec, codes, type);
  draw();
  const f = built.facts;
  const ls = lidSize(spec.cols, spec.rows);
  const bits = [`Lid ${ls.w.toFixed(0)} × ${ls.h.toFixed(0)} mm`];
  if (f.designs) bits.push(`${f.designs} design${f.designs === 1 ? "" : "s"}`);
  if (f.cap) bits.push(`letters ${f.cap.toFixed(1)} mm tall`);
  $("facts").textContent = bits.join(" · ");
  const note = $("text-note");
  const small = f.cap && f.cap < 3;
  // Characters the lettering doesn't have (emoji, most non-Latin scripts) print as "?".
  const missing = [...new Set(spec.labels.flatMap((l) => (l.style === "rubik" ? (l.lines || []) : []))
    .flatMap((line) => [...(line.text || "")])
    .filter((ch) => ch.trim() && type?.rubik && !type.rubik.glyphs[ch]))];
  const notes = [];
  if (missing.length) notes.push(`The lettering has no ${missing.join(" ")}, so ${missing.length === 1 ? "it prints" : "they print"} as a question mark.`);
  if (small) notes.push(`The smallest letters come out ${f.cap.toFixed(1)} mm tall, fine detail for a 0.4 mm nozzle. Fewer or shorter words, or a bigger block, print more cleanly.`);
  note.hidden = !notes.length;
  note.textContent = notes.join(" ");
  if (three) three.update();
}

/** The lid, with a target over each design to tap and drag. */
function draw() {
  $("preview").innerHTML = lidSVG(built, { spotIds: true });
}

function syncControls() {
  $("cols").value = spec.cols;
  $("rows").value = spec.rows;
  $("rows").disabled = !$("any-shape").checked;
  const l = lidSize(spec.cols, spec.rows);
  const shape = spec.cols === spec.rows ? "square" : `${spec.cols}:${spec.rows}`;
  $("size-note").textContent = `${spec.cols * spec.rows} cubes · ${shape} · lid ${l.w.toFixed(0)} × ${l.h.toFixed(0)} mm`;
  const style = BC.lidStyle(spec);
  const fits = BC.classicFits(spec.cols, spec.rows);
  $("styles").querySelectorAll("input").forEach((i) => {
    i.checked = i.value === style;
    if (i.value === "classic") i.disabled = !fits;
  });
  $("style-note").hidden = fits;
  for (const k of ["frame", "background", "stars", "walls"]) {
    $("colors").querySelectorAll(`[data-k="${k}"] button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === spec[k])));
  }
  $("colors").querySelector('[data-k="stars"]').hidden = style === "big";
  const words = style === "text";
  $("words").hidden = !words;
  if (words) {
    const lab = spec.labels[0];
    $("lines").querySelectorAll(".line").forEach((row, i) => {
      const x = lab.lines[i] || { text: "", big: false };
      const input = row.querySelector("input");
      if (document.activeElement !== input) input.value = x.text;
      row.querySelector("select").value = x.big ? "big" : "small";
    });
    $("align").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.align === lab.align)));
    $("words").querySelectorAll(".color-row").forEach((row) => row.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === lab[row.dataset.k]))));
  }
  $("steps").hidden = !flow;
  $("next").href = filesPath();
  $("step-files").href = filesPath();
  $("step-size").href = `/?size=${spec.cols}x${spec.rows}#print`;
  $("next-group").classList.toggle("lead", flow);
  $("dl-group").hidden = flow;
}

/** Switch the middle of the lid, keeping the colors and any words already written. */
function setStyle(style) {
  const keep = { frame: spec.frame, background: spec.background, walls: spec.walls };
  const old = spec.labels[0];
  const next = BC.presetSpec(style, spec.cols, spec.rows);
  Object.assign(next, keep, { picks: spec.grid === next.grid && spec.gridRows === next.gridRows ? spec.picks : {} });
  if (style !== "big") next.stars = spec.stars === "none" ? "red" : spec.stars;
  if (style === "text" && old && old.style === "rubik") next.labels[0] = { ...old };
  else if (style === "text" && old) next.labels[0] = { ...next.labels[0], fill: old.fill, ink: old.ink };
  spec = next;
  changed();
}

let urlTimer = 0;
function changed({ controls = true } = {}) {
  spec = BC.clean(spec);
  if (controls) syncControls();
  build();
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    try { history.replaceState(null, "", pagePath()); } catch (e) { /* ignore */ }
    $("next").href = filesPath();
    $("step-files").href = filesPath();
  }, 250);
}

// ---------------------------------------------------------------------------------------------
// Tapping and dragging on the lid

/** Millimetres (y down, as the SVG) under a pointer. */
function svgPoint(e) {
  const svg = $("preview").querySelector("svg");
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
/** The grid spot under a point, clamped to the grid: { c, r }. */
function cellAt(p) {
  const L = built.layout, N = spec.grid, M = spec.gridRows;
  const top = L.H - (L.ys[0] + L.sh); // the first row's top edge, y down
  const c = Math.floor((p.x - L.xs[0] + L.gap.x / 2) / (L.sw + L.gap.x));
  const r = Math.floor((p.y - top + L.gap.y / 2) / (L.sh + L.gap.y));
  return { c: Math.max(0, Math.min(N - 1, c)), r: Math.max(0, Math.min(M - 1, r)) };
}

let drag = null;

function ghost(at, ok) {
  const L = built.layout;
  const svg = $("preview").querySelector("svg");
  svg.querySelector(".ghost")?.remove();
  if (!at) return;
  const x = L.xs[at.c], y = L.H - (L.ys[at.r] + L.sh);
  svg.insertAdjacentHTML("beforeend", `<rect class="ghost${ok ? "" : " no"}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${L.sw.toFixed(2)}" height="${L.sh.toFixed(2)}"/>`);
}

function setupLid() {
  const pv = $("preview");
  pv.addEventListener("pointerdown", (e) => {
    const t = e.target.closest("[data-spot], [data-label]");
    if (!t || e.button > 0) return;
    e.preventDefault();
    if (t.dataset.label !== undefined) {
      // The panel: go to its words, if they're yours.
      if (BC.lidStyle(spec) === "text") $("lines").querySelector("input").focus();
      return;
    }
    drag = { i: Number(t.dataset.spot), moved: false, x: e.clientX, y: e.clientY, target: null };
    pv.setPointerCapture(e.pointerId);
  });
  pv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    pv.classList.add("dragging");
    const at = cellAt(svgPoint(e));
    const j = at.r * spec.grid + at.c;
    const free = BC.coverage(spec)[j] < 0;
    drag.target = free ? j : null;
    ghost(at, free);
  });
  pv.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    pv.classList.remove("dragging");
    if (!d.moved) openPicker(d.i);
    else if (d.target !== null && d.target !== d.i) swapSpots(d.i, d.target);
    else draw();
  });
  pv.addEventListener("pointercancel", () => { drag = null; pv.classList.remove("dragging"); draw(); });
}

/** Swap what two spots show (a design, or nothing). */
function swapSpots(a, b) {
  const ca = codes[a], cb = codes[b];
  const empty = new Set(spec.empty);
  const put = (i, code) => {
    if (code) { spec.picks[i] = code; empty.delete(i); } else { delete spec.picks[i]; empty.add(i); }
  };
  put(a, cb);
  put(b, ca);
  spec.empty = [...empty];
  changed();
}

// ---------------------------------------------------------------------------------------------
// Controls

function swatches(withNone) {
  return (withNone ? ["none", ...COLOR_IDS] : COLOR_IDS).map((c) => `<button type="button" data-c="${c}" aria-label="${NAMES[c]}" title="${NAMES[c]}" style="--c:${c === "none" ? "transparent" : SHOW[c]}"></button>`).join("");
}

function setup() {
  for (const id of ["cols", "rows"]) {
    for (let n = BC.MIN; n <= BC.MAX; n++) $(id).add(new Option(String(n), String(n)));
    $(id).addEventListener("change", () => {
      spec[id] = Number($(id).value);
      if (!$("any-shape").checked) spec.cols = spec.rows = Number($(id).value);
      spec.picks = {};
      // A new size gets the grid and panel that suit its shape, keeping the colors and words.
      const style = BC.lidStyle(spec);
      setStyle(style === "classic" && !BC.classicFits(spec.cols, spec.rows) ? "text" : style);
    });
  }
  // Square sets unless asked: the rows follow the columns until the box is ticked.
  $("any-shape").checked = spec.cols !== spec.rows;
  $("any-shape").addEventListener("change", () => {
    if ($("any-shape").checked) { syncControls(); return; }
    spec.rows = spec.cols;
    spec.picks = {};
    const style = BC.lidStyle(spec);
    setStyle(style === "classic" && !BC.classicFits(spec.cols, spec.rows) ? "text" : style);
  });
  $("styles").addEventListener("change", (e) => setStyle(e.target.value));

  // Words, when they're yours
  $("lines").innerHTML = [0, 1, 2, 3].map((i) => `
    <div class="line">
      <label class="sr" for="line-${i}">Line ${i + 1}</label>
      <input type="text" id="line-${i}" maxlength="40" placeholder="${i ? `Line ${i + 1}` : "Color Cubes"}">
      <select aria-label="Size of line ${i + 1}"><option value="big">Big</option><option value="small">Small</option></select>
    </div>`).join("");
  let typing = 0;
  const readLines = () => {
    const l = spec.labels[0];
    if (!l) return;
    const rows = [...$("lines").querySelectorAll(".line")].map((row) => ({ text: row.querySelector("input").value, big: row.querySelector("select").value === "big" }));
    let last = rows.length;
    while (last > 1 && !rows[last - 1].text) last--;
    l.lines = rows.slice(0, last);
    clearTimeout(typing);
    typing = setTimeout(() => changed(), 120);
  };
  $("lines").addEventListener("input", readLines);
  $("lines").addEventListener("change", readLines);
  $("words").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    const l = spec.labels[0];
    if (!b || !l) return;
    if (b.dataset.align) l.align = b.dataset.align;
    else if (b.dataset.c) l[b.closest(".color-row").dataset.k] = b.dataset.c;
    else return;
    changed();
  });
  $("words").querySelector('[data-k="fill"] .swatches').innerHTML = swatches(true);
  $("words").querySelector('[data-k="ink"] .swatches').innerHTML = swatches(false);

  // Colors of the lid
  const ROWS = [["frame", "Frame", true], ["background", "Background"], ["stars", "Stars", true], ["walls", "Sides and tray"]];
  $("colors").innerHTML = ROWS.map(([k, label, none]) => `
    <div class="color-row" data-k="${k}">
      <span>${label}</span>
      <div class="swatches" role="group" aria-label="${label} color">${swatches(none)}</div>
    </div>`).join("");
  $("colors").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    spec[b.closest(".color-row").dataset.k] = b.dataset.c;
    changed();
  });

  $("view-2d").addEventListener("click", () => setView("2d"));
  $("view-3d").addEventListener("click", () => setView("3d"));

  setupDownloads();
  $("copy-link").addEventListener("click", async () => {
    const b = $("copy-link");
    try { await navigator.clipboard.writeText(shortLink()); b.textContent = "Link copied"; }
    catch (e) { prompt("Copy this link", shortLink()); }
    setTimeout(() => { b.textContent = "Copy a link to this box"; }, 2200);
  });
}

// ---------------------------------------------------------------------------------------------
// The design picker: only designs the size of the set fit its spots.

let pickIndex = 0;

function openPicker(i) {
  pickIndex = i;
  $("picker-h").textContent = `Choose a ${spec.cols} × ${spec.rows} design`;
  $("picker-list").innerHTML = designs.map((p) => `<li><button type="button" data-code="${esc(p.code)}">${codeSVG(p.code, { gap: 0.04 })}<span>${esc(p.name)}</span></button></li>`).join("");
  $("paste").value = "";
  $("paste-err").hidden = true;
  $("picker").showModal();
}
function usePick(code) {
  spec.picks[pickIndex] = code;
  spec.empty = spec.empty.filter((k) => k !== pickIndex);
  $("picker").close();
  changed();
}

function setupPicker() {
  $("picker-list").addEventListener("click", (e) => { const b = e.target.closest("[data-code]"); if (b) usePick(b.dataset.code); });
  const tryPaste = () => {
    let raw = $("paste").value.trim();
    if (raw.includes("/")) raw = raw.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop();
    try { raw = decodeURIComponent(raw); } catch (e) { /* keep */ }
    const p = parseCode(raw);
    const err = p.error || (p.w !== spec.cols || p.h !== spec.rows ? `That design is ${p.w} × ${p.h}; this lid's spots hold ${spec.cols} × ${spec.rows} designs.` : "");
    if (err) { $("paste-err").textContent = err; $("paste-err").hidden = false; return; }
    usePick(toReadable(p.grid, p.w, p.h));
  };
  $("paste-use").addEventListener("click", tryPaste);
  $("paste").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryPaste(); } });
  $("picker").addEventListener("click", (e) => { if (e.target === $("picker")) $("picker").close(); });
}

// ---------------------------------------------------------------------------------------------
// Downloads (standalone): the lid and tray on their own. The whole set is on /print/.

function save(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const tag = () => `${spec.cols}x${spec.rows}`;
const meta = (title) => ({ Title: title, Description: "Made with the box designer at https://designwithcolorcubes.org/box/" });
const lidMeshes = () => lidParts(spec.cols, spec.rows, artRegions(built), { wallColor: spec.walls });
// The lid for the 3D view, made off the main thread (lidbuild.js). The last one made stays on
// screen while the next is made, if it's the same size.
let lid3d = null, lid3dKey = "", lid3dSize = "";
function lidFor3D() {
  const key = BC.encode(spec) + BC.query(spec) + "|" + codes.join(",");
  if (key !== lid3dKey) {
    lid3dKey = key;
    const size = tag();
    buildLid(spec, codes, type).then((parts) => {
      if (lid3dKey !== key) return; // something changed since; a newer lid is on its way
      lid3d = parts;
      lid3dSize = size;
      if (three) three.update();
    }, () => {});
  }
  return lid3dSize === tag() ? lid3d : null;
}

function setupDownloads() {
  const items = [
    ["lid-3mf", "Lid", "3MF, one part per color"],
    ["tray-3mf", "Tray", "3MF, one color"],
    ["lid-stl", "Lid as STL", "A zip with one file per color"],
    ["tray-stl", "Tray as STL", "One file"],
    ["svg", "Lid artwork", "SVG, a layer per color, true size"]
  ];
  $("downloads").innerHTML = items.map(([k, label, sub]) => `<button type="button" class="dl-item" data-k="${k}"><b>${label}</b> <small>${sub}</small></button>`).join("");
  $("downloads").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    const k = b.dataset.k;
    b.disabled = true;
    try {
      if (k === "lid-3mf") save(await to3MF([{ name: `Color Cubes lid ${tag()}`, parts: lidMeshes(), settings: LID_SETTINGS }], meta(`Color Cubes lid, ${tag()}`)), `color-cubes-lid-${tag()}.3mf`, "model/3mf");
      else if (k === "tray-3mf") save(await to3MF([{ name: `Color Cubes tray ${tag()}`, parts: trayParts(spec.cols, spec.rows) }], meta(`Color Cubes tray, ${tag()}`)), `color-cubes-tray-${tag()}.3mf`, "model/3mf");
      else if (k === "tray-stl") save(toSTL(trayParts(spec.cols, spec.rows)), `color-cubes-tray-${tag()}.stl`, "model/stl");
      else if (k === "lid-stl") save(await zip(lidMeshes().map((m) => [`${m.name}.stl`, toSTL(m)])), `color-cubes-lid-${tag()}-stl.zip`, "application/zip");
      else if (k === "svg") save(lidSVG(built, { layers: true, colors: Object.fromEntries(FILAMENTS.map((f) => [f.id, f.hex])) }), `color-cubes-lid-${tag()}.svg`, "image/svg+xml");
    } finally { b.disabled = false; }
  });
}

// ---------------------------------------------------------------------------------------------
// 3D view (three.js, loaded when asked for)

let three = null;
async function setView(v) {
  $("view-2d").setAttribute("aria-pressed", String(v === "2d"));
  $("view-3d").setAttribute("aria-pressed", String(v === "3d"));
  $("preview").hidden = v !== "2d";
  $("preview-3d").hidden = v !== "3d";
  $("hint").classList.toggle("off", v !== "2d");
  if (v === "3d" && !three) {
    const { startBox3D } = await import("/js/box3d.js");
    three = await startBox3D($("preview-3d"), () => ({ spec, lid: lidFor3D(), colors: SHOW }));
  }
  if (three) three.update();
}

// ---------------------------------------------------------------------------------------------

async function main() {
  [patterns, type] = await Promise.all([
    fetch("/data/patterns.json").then((r) => r.json()),
    fetch("/data/lid-type.json").then((r) => r.json())
  ]);
  spec = BC.clean(fromAddress());
  setup();
  setupPicker();
  setupLid();
  changed();
}

main().catch((e) => {
  $("preview").innerHTML = `<p class="status">The box designer couldn't start: ${esc(e.message)}</p>`;
});
