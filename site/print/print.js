// print.js — step 3 of "Print a set": choose the four filament colors, see the cubes, tray and
// lid in them, and download every file (all at once in a zip, or one by one), as 3MF or STL, or
// open the ready-made ones in a slicer. Every file in the chosen colors is made here in the
// browser (print3d.js); the slicer links open the matching files under /files/, which a slicer
// fetches itself, in the original colors. The address carries the set and its box:
//   /print/7x7/{box code}?t=…&c=FFFFFF-E5333B-F6CF4B-2563B8
// MIT licensed (see LICENSE).

import { COLORS } from "/js/cubecode.js";
import { traySVG } from "/js/cubeface.js";
import { SHOW, shapes, lidSVG } from "/js/lidart.js";
import { lidSize, traySize, plateSize, beds, cubePlates, trayParts, cubeParts, plateOffsets, to3MF, toSTL, zip, Mesh, BED_MARGIN, LID_SETTINGS } from "/js/print3d.js";
import { buildLid } from "/js/lidbuild.js";
import * as BC from "/js/boxcode.js";
import { designsFor } from "/js/designs.js";
import { slicerLinks, SLICERS } from "/js/slicers.js";
import { parseCode } from "/js/cubecode.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const ROLES = ["white", "red", "yellow", "blue"];
const ROLE_NAMES = { white: "White", red: "Red", yellow: "Yellow", blue: "Blue" };
const KEY = "colorcubes:print";

// Filament colors to choose from: plain names and typical PLA shades. A color picker covers the rest.
const PALETTE = [
  ["White", "#FFFFFF"], ["Ivory", "#F4ECD8"], ["Light grey", "#C9C9C9"], ["Grey", "#7F7F7F"], ["Black", "#222222"],
  ["Red", "#E5333B"], ["Orange", "#F28C28"], ["Yellow", "#F6CF4B"], ["Lime", "#9BCB3C"], ["Green", "#2E9D4F"],
  ["Teal", "#1F9E9A"], ["Sky blue", "#5DADE2"], ["Blue", "#2563B8"], ["Navy", "#1E2A5A"], ["Purple", "#7A4EB5"],
  ["Pink", "#F08DB5"], ["Brown", "#8B5A2B"], ["Gold", "#C9A227"]
];
const DEFAULT = Object.fromEntries(ROLES.map((r) => [r, SHOW[r].toUpperCase()]));

let spec, patterns, type, files = [];
let colors = { ...DEFAULT };
let openRole = null; // the color whose palette is showing
let opts = { format: "3mf", slicer: "", faces: "recessed" };
try { opts = { ...opts, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { /* private mode */ }

const nameOf = (hex) => (PALETTE.find(([, h]) => h.toUpperCase() === hex.toUpperCase()) || [`Custom ${hex.toUpperCase()}`])[0];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isDefault = () => ROLES.every((r) => colors[r] === DEFAULT[r]);
const filaments = () => ROLES.map((r) => ({ id: r, name: nameOf(colors[r]), hex: colors[r] }));
const touchOnly = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
const mb = (b) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(1)} MB`);

// ---------------------------------------------------------------------------------------------
// The address

function fromAddress() {
  const q = new URLSearchParams(location.search);
  const path = BC.readPath(location.pathname, "/print/");
  let s = null;
  if (path && path.token) s = BC.decode(path.token, q.getAll("t"));
  if (!s) s = BC.defaultSpec(path ? path.cols : 7, path ? path.rows : 7);
  if (q.has("faces")) opts.faces = q.get("faces") === "flat" ? "flat" : "recessed";
  const c = (q.get("c") || "").split("-");
  if (c.length === 4 && c.every((h) => /^[0-9a-f]{6}$/i.test(h))) ROLES.forEach((r, i) => { colors[r] = "#" + c[i].toUpperCase(); });
  return s;
}
function writeAddress() {
  const c = isDefault() ? null : ROLES.map((r) => colors[r].slice(1)).join("-");
  const faces = opts.faces === "flat" ? "flat" : null;
  try { history.replaceState(null, "", BC.boxPath(spec, "/print/") + BC.query(spec, { c, faces })); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// What gets printed

const tag = () => `${spec.cols}x${spec.rows}`;
const bed = () => { const b = beds(spec.cols, spec.rows); return b.square || b.four[0]; };

/** Cube plates for this set, on the bed the lid needs in four colors: full plates, then the rest. */
function plates() {
  const { k, full, rest } = cubePlates(spec.cols * spec.rows, bed());
  // The same plate twice is one file printed twice.
  const out = full ? [{ k, count: k * k, times: full }] : [];
  if (rest) { let j = 1; while (j * j < rest) j++; out.push({ k: j, count: rest, times: 1 }); }
  return out;
}

let built = null;
function lidBuilt() {
  if (!built) built = shapes(spec, BC.spotCodes(spec, designsFor(spec.cols, spec.rows, patterns)), type);
  return built;
}
// The lid's closed parts. They don't change with the colors (the box design is fixed on this page)
// and are the heaviest thing here to make, so they're made once, off the main thread (lidbuild.js),
// for the 3D view and the downloads alike.
let lidPromise = null, lidReady = null;
function lidMeshes() {
  if (!lidPromise) {
    lidPromise = buildLid(spec, BC.spotCodes(spec, designsFor(spec.cols, spec.rows, patterns)), type);
    lidPromise.then((parts) => { lidReady = parts; if (three) three.update(); }, () => { lidPromise = null; });
  }
  return lidPromise;
}
/** Rename a part for the color it prints in: lid-art-red → lid-art-green. */
function named(m) {
  const out = new Mesh(m.name, m.color);
  out.v = m.v; out.t = m.t;
  const n = slug(nameOf(colors[m.color] || DEFAULT.white));
  out.name = m.name.replace(/(white|red|yellow|blue)$/, n);
  return out;
}

/** Every file, each as { id, label, sub, make(format) → [[filename, bytes]], url? (a ready-made file) }. */
function items() {
  const list = [];
  const meta = (title) => ({ Title: title, Description: "Made at https://designwithcolorcubes.org/print/" });
  const fil = filaments();
  for (const p of plates()) {
    const name = `cubes-${p.count}`;
    const ready = p.count === p.k * p.k && opts.faces !== "flat" ? `/files/plates/cubes-${p.k}x${p.k}` : null;
    list.push({
      id: name, label: `${p.count} cubes on one plate`, sub: `${p.times > 1 ? `Print it ${p.times} times. ` : ""}Four colors: a ${Math.ceil(plateSize(p.k) + BED_MARGIN)} mm square of bed, and room beside it for the purge tower.`,
      ready,
      make: async (f) => {
        const cp = cubeParts(opts.faces).map(named);
        const at = plateOffsets(p.k, p.count);
        if (f === "3mf") return [[`color-cubes-${name}.3mf`, await to3MF([{ name: `${p.count} Color Cubes`, parts: cp, items: at, paint: true }], meta(`${p.count} Color Cubes`), fil)]];
        return cp.map((m) => [`color-cubes-${name}/${m.name}.stl`, toSTL(m, at)]);
      }
    });
  }
  const square = spec.cols === spec.rows;
  list.push({
    id: "tray", label: `Tray for ${spec.cols} × ${spec.rows}`, sub: `One color, ${nameOf(colors[spec.walls]).toLowerCase()}.`,
    ready: square ? `/files/trays/tray-${tag()}` : null,
    make: async (f) => {
      const t = trayParts(spec.cols, spec.rows).map((m) => { const x = named(m); x.color = spec.walls; x.name = `tray-${tag()}`; return x; });
      if (f === "3mf") return [[`color-cubes-tray-${tag()}.3mf`, await to3MF([{ name: `Color Cubes tray ${tag()}`, parts: t }], meta(`Color Cubes tray, ${tag()}`), fil)]];
      return [[`color-cubes-tray-${tag()}.stl`, toSTL(t)]];
    }
  });
  list.push({
    id: "lid", label: `Lid for ${spec.cols} × ${spec.rows}`, sub: "Four colors, printed upside down with the artwork on the bed.",
    // No ready-made lid: the one in /files/ is the set as first printed, without the grooves
    // between the cubes, so the lid is always made here.
    make: async (f) => {
      const lp = (await lidMeshes()).map(named);
      if (f === "3mf") return [[`color-cubes-lid-${tag()}.3mf`, await to3MF([{ name: `Color Cubes lid ${tag()}`, parts: lp, settings: LID_SETTINGS }], meta(`Color Cubes lid, ${tag()}`), fil)]];
      return lp.map((m) => [`color-cubes-lid-${tag()}/${m.name}.stl`, toSTL(m)]);
    }
  });
  return list;
}

function readme() {
  const lines = [
    `Color Cubes, a ${spec.cols} x ${spec.rows} set (${spec.cols * spec.rows} cubes)`,
    "Made at https://designwithcolorcubes.org",
    "",
    "Colors (each part is named for the filament it prints in):",
    ...ROLES.map((r) => `  ${ROLE_NAMES[r].padEnd(7)} parts  ->  ${nameOf(colors[r])} (${colors[r]})`),
    "",
    opts.faces === "flat"
      ? "Split faces: flat, the two triangles flush, each half the face."
      : "Split faces: recessed, the light triangle in a pocket inside a rim of the dark color, as on the 1930s cubes.",
    "Printed with: 0.2 mm layers, 2 walls, 15% infill, no supports, no raft.",
    "The cubes need a printer that changes filament on its own within a layer.",
    `A printer with one nozzle purges into a tower between colors: allow ${beds(spec.cols, spec.rows).four.join(" x ")} mm of bed, and set the purge tower (the prime tower in Bambu Studio, OrcaSlicer and Cura; the wipe tower in PrusaSlicer) to 35 mm wide; some slicers start at 60 mm, which won't fit.`,
    "The lid prints upside down, artwork on the bed, and needs no brim. The tray is one color.",
    "",
    "Box design: " + location.origin + BC.boxPath(spec) + BC.query(spec),
    "",
    "Models and artwork by Isaac Lloyd, CC BY 4.0:",
    "https://creativecommons.org/licenses/by/4.0/"
  ];
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// Drawing

function mapped() {
  // cubeface draws with the 1930s colors (cubecode COLORS); swap each for its chosen filament.
  return { [COLORS.white]: colors.white, [COLORS.red]: colors.red, [COLORS.yellow]: colors.yellow, [COLORS.blue]: colors.blue };
}

function drawFlat() {
  const lid = lidSVG(lidBuilt(), { colors }).replace(/<svg ([^>]*?)width="[^"]*" height="[^"]*"/, "<svg $1");
  const code = designsFor(spec.cols, spec.rows, patterns)[0].code;
  const p = parseCode(code);
  const tray = traySVG(p.grid, p.w, p.h, { palette: mapped(), edge: false, gap: 0.04, background: colors[spec.walls], label: "The cubes laid out in the tray", flat: opts.faces === "flat" });
  $("preview-2d").innerHTML = `<figure>${lid}<figcaption>The lid</figcaption></figure><figure><div class="tray-wrap" style="background:${colors[spec.walls]}">${tray}</div><figcaption>The cubes in the tray</figcaption></figure>`;
}

function renderMaps() {
  $("maps").innerHTML = ROLES.map((r) => `
    <div class="map${openRole === r ? " open" : ""}" data-role="${r}">
      <span class="from" style="--c:${DEFAULT[r]}">${ROLE_NAMES[r]}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="to"><span class="chip" style="--c:${colors[r]}"></span>${esc(nameOf(colors[r]))}</span>
      <button type="button" class="link-btn change" aria-expanded="${openRole === r}">${openRole === r ? "Done" : "Change"}</button>
      <div class="swatches" role="group" aria-label="Print the ${ROLE_NAMES[r].toLowerCase()} parts in"${openRole === r ? "" : " hidden"}>
        ${PALETTE.map(([n, h]) => `<button type="button" data-hex="${h}" title="${n}" aria-label="${n}" aria-pressed="${h.toUpperCase() === colors[r]}" style="--c:${h}"></button>`).join("")}
        <label class="custom" title="Any other color"><input type="color" value="${colors[r].toLowerCase()}" aria-label="Any other color for the ${ROLE_NAMES[r].toLowerCase()} parts"><span>Other</span></label>
      </div>
    </div>`).join("");
  $("reset-colors").hidden = isDefault();
}

function renderFiles() {
  const list = items();
  const slicer = SLICERS.find((s) => s.id === opts.slicer);
  $("format").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === opts.format)));
  $("faces").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.faces === opts.faces)));
  $("faces-note").textContent = opts.faces === "flat"
    ? "Split faces flat: two triangles flush, each half the face, no rim."
    : "Split faces recessed, as on the 1930s cubes: the light triangle in a shallow pocket inside a rim of the dark color.";
  $("slicer").value = opts.slicer;
  $("format-note").textContent = opts.format === "3mf"
    ? "3MF keeps the colors: in Bambu Studio and OrcaSlicer each part opens on its filament, so set up four filaments there before opening (with only one, everything prints in it); in other slicers, give each part the filament its name says."
    : "STL has no colors, so each color is its own file. Load a part's files together as one object with parts.";
  $("all-note").textContent = `A zip of the ${list.length} files${opts.format === "stl" ? " (one STL per color)" : ""}, with a note of the colors.`;
  $("file-list").innerHTML = list.map((it) => {
    const types = it.readyTypes || ["3mf", "stl"];
    const ready = it.ready && types.includes(opts.format) ? files.find((f) => f.path === `${it.ready}.${opts.format}`) : null;
    let open = "";
    if (slicer && !touchOnly()) {
      // A ready-made file in the original colors opens straight from /files/; anything else is
      // made here and handed to the slicer through the site (sendToSlicer).
      const plain = ready && opts.format === "3mf" && isDefault();
      const link = plain ? slicerLinks(new URL(ready.path, location.origin).href).find((l) => l.id === slicer.id) : null;
      open = link
        ? `<a class="open" href="${esc(link.href)}">Open in ${esc(slicer.label)}</a>`
        : `<button type="button" class="open" data-open="${it.id}">Open in ${esc(slicer.label)}</button>`;
    } else if (opts.slicer === "prusa") {
      open = `<span class="why">PrusaSlicer only opens links from a few sites, so download the files and open them in PrusaSlicer.</span>`;
    }
    return `<li class="file-item">
      <div><b>${esc(it.label)}</b> <small>${esc(it.sub)}</small></div>
      <div class="file-acts"><button type="button" class="get" data-id="${it.id}">Download ${opts.format.toUpperCase()}</button>${open}</div>
    </li>`;
  }).join("");
}

function render() {
  built = null;
  const l = lidSize(spec.cols, spec.rows);
  const b = beds(spec.cols, spec.rows);
  $("facts").textContent = `${spec.cols * spec.rows} cubes · lid ${l.w.toFixed(0)} × ${l.h.toFixed(0)} mm · needs a ${b.four[0]} × ${b.four[1]} mm bed with a purge tower (${b.one[0]} × ${b.one[1]} mm without)`;
  renderMaps();
  renderFiles();
  if (!$("preview-2d").hidden) drawFlat();
  if (three) three.update();
  $("step-box").href = BC.boxPath(spec) + BC.query(spec, { set: "1" });
  $("step-size").href = `/?size=${tag()}#print`;
  writeAddress();
  try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// Opening in a slicer. Slicers download a file from a link, so a file made here goes to the site
// first: the 3MF is posted to /print/f/{its SHA-256}/{name}, which keeps it at the edge for a day
// (workers/site/src/index.js), and the slicer is sent that address. Always the 3MF, which carries
// the colors, whatever file type is chosen for downloads.

async function sendToSlicer(button) {
  const it = items().find((x) => x.id === button.dataset.open);
  const slicer = SLICERS.find((s) => s.id === opts.slicer);
  if (!it || !slicer) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Getting it ready…";
  try {
    const [[file, bytes]] = await it.make("3mf");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const name = file.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
    const path = `/print/f/${hash}/${name}`;
    const res = await fetch(path, { method: "POST", body: bytes, headers: { "Content-Type": "model/3mf" } });
    if (!res.ok) throw new Error(String(res.status));
    const link = slicerLinks(new URL(path, location.origin).href).find((l) => l.id === slicer.id);
    location.href = link.href;
    button.textContent = `Sent to ${slicer.label}`;
    // The file waits in one Cloudflare data center; a browser behind a VPN or relay may have left
    // it somewhere the slicer won't look.
    const acts = button.closest(".file-acts");
    if (acts && !acts.querySelector(".why")) acts.insertAdjacentHTML("beforeend", `<span class="why">If ${esc(slicer.label)} can't open it, download the file here and open it there.</span>`);
    setTimeout(() => { button.textContent = label; button.disabled = false; }, 4000);
  } catch (e) {
    button.textContent = "Couldn't send it. Download it instead.";
    setTimeout(() => { button.textContent = label; button.disabled = false; }, 5000);
  }
}

// ---------------------------------------------------------------------------------------------
// Saving

function save(bytes, name, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function busy(button, job) {
  const was = button.textContent;
  button.disabled = true;
  button.textContent = "Making the files…";
  await new Promise((r) => setTimeout(r, 30)); // let the label show before the work
  try { await job(); } finally { button.disabled = false; button.textContent = was; }
}

// ---------------------------------------------------------------------------------------------
// 3D

let three = null;
async function start3D() {
  lidMeshes(); // started now, made while three.js loads; the lid joins the view when it's ready
  try {
    const { startBox3D } = await import("/js/box3d.js");
    const code = designsFor(spec.cols, spec.rows, patterns)[0].code;
    three = await startBox3D($("preview-3d"), () => ({
      spec,
      lid: lidReady,
      colors,
      cubes: { code },
      flat: opts.faces === "flat"
    }));
  } catch (e) {
    $("preview-3d").innerHTML = `<p class="status">The 3D view didn't load, so here it is flat.</p>`;
    setView("2d");
  }
}
function setView(v) {
  $("view-3d").setAttribute("aria-pressed", String(v === "3d"));
  $("view-2d").setAttribute("aria-pressed", String(v === "2d"));
  $("preview-3d").hidden = v !== "3d";
  $("preview-2d").hidden = v !== "2d";
  $("hint").classList.toggle("off", v !== "3d");
  if (v === "2d") drawFlat();
  if (three) three.update();
}

// ---------------------------------------------------------------------------------------------

async function main() {
  [patterns, type] = await Promise.all([
    fetch("/data/patterns.json").then((r) => r.json()),
    fetch("/data/lid-type.json").then((r) => r.json())
  ]);
  try { files = (await (await fetch("/data/files.json")).json()).files; } catch (e) { files = []; }
  spec = fromAddress();

  $("slicer").innerHTML = `<option value="">None, just download</option>`
    + SLICERS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")
    + `<option value="prusa">PrusaSlicer</option>`;
  $("slicer").addEventListener("change", () => { opts.slicer = $("slicer").value; render(); });
  $("format").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { opts.format = b.dataset.f; render(); } });
  $("faces").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { opts.faces = b.dataset.faces; render(); } });

  $("maps").addEventListener("click", (e) => {
    const ch = e.target.closest("button.change");
    if (ch) { const r = ch.closest(".map").dataset.role; openRole = openRole === r ? null : r; renderMaps(); return; }
    const b = e.target.closest("button[data-hex]");
    if (!b) return;
    colors[b.closest(".map").dataset.role] = b.dataset.hex.toUpperCase();
    render();
  });
  $("maps").addEventListener("change", (e) => {
    if (e.target.type !== "color") return;
    colors[e.target.closest(".map").dataset.role] = e.target.value.toUpperCase();
    render();
  });
  $("reset-colors").addEventListener("click", () => { colors = { ...DEFAULT }; render(); });

  $("file-list").addEventListener("click", (e) => {
    const o = e.target.closest("button[data-open]");
    if (o) { sendToSlicer(o); return; }
    const b = e.target.closest("button.get");
    if (!b) return;
    const it = items().find((x) => x.id === b.dataset.id);
    busy(b, async () => {
      const out = await it.make(opts.format);
      if (out.length === 1) save(out[0][1], out[0][0]);
      else save(await zip(out), out[0][0].split("/")[0] + ".zip", "application/zip");
    });
  });
  $("get-all").addEventListener("click", () => busy($("get-all"), async () => {
    const all = [["README.txt", readme()]];
    for (const it of items()) for (const [n, bytes] of await it.make(opts.format)) all.push([n, bytes]);
    save(await zip(all), `color-cubes-${tag()}-${opts.format}.zip`, "application/zip");
  }));

  $("view-3d").addEventListener("click", () => setView("3d"));
  $("view-2d").addEventListener("click", () => setView("2d"));
  render();
  start3D();
}

main().catch((e) => {
  $("preview-3d").innerHTML = `<p class="status">This page couldn't start: ${esc(e.message)}</p>`;
});
