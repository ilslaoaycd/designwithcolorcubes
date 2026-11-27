// patterns-page.js — every design from /data/patterns.json in one grid, filtered from the side (by
// tray size, colors and name), each card with Open, PDF and Print. A card opens a larger view in a
// dialog; on a phone it is a full screen you swipe right (or go back) to leave, like an app's screen.
// Trays are drawn as they near the screen, since there are hundreds. The PDF comes from the
// designer's own writer (designer/pdf.js), loaded with the QR library only when asked for.
// MIT licensed (see LICENSE).

import { codeSVG } from "./cubeface.js";
import { parseCode, toCompact } from "./cubecode.js";
import { DESIGNER_PATH, SHORT_ORIGIN } from "./config.js";
import { paper } from "./paper.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const out = $("groups");

// Colors: which of the four a design shows (w r y b by look: 0–3 solid, 4–7 blue/yellow, 8–11 red/white).
const COLOR_FILTERS = [
  ["any", "Any colors"],
  ["rw", "Red and white"],
  ["by", "Blue and yellow"],
  ["mixed", "Three or four colors"]
];
function colorsOf(grid) {
  const set = new Set();
  for (const d of grid) {
    if (d < 4) set.add("wryb"[d]);
    else if (d < 8) set.add("y").add("b");
    else set.add("r").add("w");
  }
  return set;
}
function colorKind(set) {
  if ([...set].every((c) => c === "r" || c === "w")) return "rw";
  if ([...set].every((c) => c === "b" || c === "y")) return "by";
  return "mixed";
}

/** Plain words about a design: how many cubes, and how many show a split face. */
function facts(p) {
  const n = p.w * p.h, split = p.grid.filter((d) => d >= 4).length;
  const kinds = { rw: "red and white", by: "blue and yellow", mixed: [...p.colors].length === 4 ? "all four colors" : "three colors" };
  const bits = [`${p.w} × ${p.h}`, `${n} cubes`, `${split ? `${split} turned to a split face` : "solid faces only"}`, kinds[p.kind]];
  if (p.lid) bits.push("one of the twelve on the 1930s lid");
  return bits.join(" · ");
}

let all = [];
let shown = [];           // the designs that pass the filters, in order, for the dialog's next/prev
// 7 × 7 first: the size of the 1930s set, and of the twelve designs on its lid.
const DEFAULT_SIZE = "7x7";
let state = { size: DEFAULT_SIZE, colors: "any", q: "" };

// ---------------------------------------------------------------------------------------------
// The grid

const drawCard = (el) => { const ph = el.querySelector(".ph"); if (ph) ph.outerHTML = codeSVG(el.dataset.code, { gap: 0.04 }); };
const seen = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { seen.unobserve(e.target); drawCard(e.target); }
  }, { rootMargin: "800px 0px" })
  : null;

const card = (p) => `
  <li class="pat-card" data-code="${p.code}" data-id="${p.id}">
    <button type="button" class="pat-look" data-show="${p.id}" aria-label="${esc(p.name)}, ${p.w} by ${p.h}: a larger view"><i class="ph"></i></button>
    <div class="pat-name"><b title="${esc(p.name)}">${esc(p.name)}</b> <span>${p.w} × ${p.h}</span></div>
    <div class="pat-acts">
      <a href="${DESIGNER_PATH}${p.code}">Open</a>
      <button type="button" data-pdf="${p.id}">PDF</button>
      <button type="button" data-print="${p.id}">Print</button>
    </div>
  </li>`;

function groups() {
  const q = state.q.trim().toLowerCase();
  const keep = (p) => (state.colors === "any" || p.kind === state.colors) && (!q || p.name.toLowerCase().includes(q));
  const out = [];
  if (state.size === "lid") {
    const lid = all.filter((p) => p.lid && keep(p));
    if (lid.length) out.push(["From the 1930s lid", lid]);
    return out;
  }
  for (const s of sizes()) {
    if (state.size !== "all" && state.size !== s) continue;
    // The lid's twelve are 7 × 7, and lead that size.
    const list = [...all.filter((p) => p.lid && p.size === s && keep(p)), ...all.filter((p) => !p.lid && p.size === s && keep(p))];
    const [w, h] = s.split("x");
    if (list.length) out.push([`${w} × ${h}`, list]);
  }
  return out;
}
const sizes = () => [...new Set(all.filter((p) => !p.lid).map((p) => p.size))].sort((a, b) => parseInt(a) - parseInt(b));

function render() {
  const g = groups();
  shown = g.flatMap(([, list]) => list);
  $("count").textContent = shown.length === 1 ? "1 design" : `${shown.length} designs`;
  if (seen) seen.disconnect();
  out.innerHTML = g.length
    ? g.map(([title, list]) => `<h2 class="pat-group">${title} <span>${list.length}</span></h2><ul class="pat-grid">${list.map(card).join("")}</ul>`).join("")
    : `<p class="pat-none">No designs match. <button type="button" class="pat-reset" id="reset">Show them all</button></p>`;
  out.querySelectorAll(".pat-card").forEach((el) => (seen ? seen.observe(el) : drawCard(el)));
  $("reset")?.addEventListener("click", () => { state = { size: "all", colors: "any", q: "" }; $("q").value = ""; syncFilters(); render(); });
  writeAddress();
}

// ---------------------------------------------------------------------------------------------
// Filters: a list down the side on a wide screen, two short rows above the grid on a phone.

function option(group, value, label, checked) {
  return `<label><input type="radio" name="${group}" value="${value}"${checked ? " checked" : ""}><span>${label}</span></label>`;
}
function buildFilters() {
  const counts = (s) => all.filter((p) => !p.lid && p.size === s).length;
  $("sizes").innerHTML = option("size", "all", `All sizes <small>${all.length}</small>`)
    + option("size", "lid", `The 1930s lid <small>12</small>`)
    + sizes().map((s) => option("size", s, `${s.replace("x", " × ")} <small>${counts(s) + (s === DEFAULT_SIZE ? 12 : 0)}</small>`, s === DEFAULT_SIZE)).join("");
  $("colors").innerHTML = COLOR_FILTERS.map(([v, l], i) => option("colors", v, l, i === 0)).join("");
  $("sizes").addEventListener("change", (e) => { state.size = e.target.value; render(); scrollToGrid(); });
  $("colors").addEventListener("change", (e) => { state.colors = e.target.value; render(); scrollToGrid(); });
  let t = 0;
  $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = $("q").value; render(); }, 150); });
}
function syncFilters() {
  for (const [id, v] of [["sizes", state.size], ["colors", state.colors]]) {
    $(id).querySelectorAll("input").forEach((i) => { i.checked = i.value === v; });
  }
}
function scrollToGrid() {
  // On a phone the filters sit above the grid; bring the first design up after a change.
  if (matchMedia("(max-width: 820px)").matches) out.scrollIntoView({ block: "start", behavior: "smooth" });
}

// ---------------------------------------------------------------------------------------------
// The address: filters in the query (replaced as they change), the open design in the hash (a
// history entry of its own, so Back and the phone's swipe-back close it).

function writeAddress() {
  const q = new URLSearchParams();
  if (state.size !== DEFAULT_SIZE) q.set("size", state.size);
  if (state.colors !== "any") q.set("colors", state.colors);
  if (state.q.trim()) q.set("q", state.q.trim());
  const s = q.toString();
  try { history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) { /* ignore */ }
}
function readAddress() {
  const q = new URLSearchParams(location.search);
  const size = q.get("size");
  if (size && (size === "all" || size === "lid" || all.some((p) => p.size === size))) state.size = size;
  // Older links: #7×7 or #all.
  const old = decodeURIComponent(location.hash.slice(1)).replace("×", "x");
  if (old === "all" || /^\d+x\d+$/.test(old)) {
    if (old === "all" || all.some((p) => p.size === old)) state.size = old;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  if (COLOR_FILTERS.some(([v]) => v === q.get("colors"))) state.colors = q.get("colors");
  if (q.get("q")) { state.q = q.get("q"); $("q").value = state.q; }
}
const openFromHash = () => all.find((p) => location.hash === "#" + p.id);

// ---------------------------------------------------------------------------------------------
// PDF and print, as in the designer

let qrLoading = null;
function loadQR() {
  if (typeof qrcode !== "undefined") return Promise.resolve();
  return (qrLoading ||= new Promise((resolve) => {
    const s = Object.assign(document.createElement("script"), { src: "/js/vendor/qrcode.js" });
    s.onload = s.onerror = () => resolve();
    document.head.append(s);
  }));
}
function qrFor(text) {
  if (typeof qrcode === "undefined") return null;
  const upper = text.toUpperCase();
  const alnum = /^[0-9A-Z $%*+\-.\/:]*$/.test(upper);
  const q = qrcode(0, "M");
  q.addData(alnum ? upper : text, alnum ? "Alphanumeric" : "Byte");
  q.make();
  return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}
async function pdfFor(p) {
  const [{ makeTrayPdf, printPdf }] = await Promise.all([import("/designer/pdf.js"), loadQR()]);
  const cells = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) cells.push({ x, y, d: p.grid[y * p.w + x] });
  const link = SHORT_ORIGIN + "/" + toCompact(p.grid, p.w, p.h);
  const pdf = makeTrayPdf({
    cols: p.w, rows: p.h, cells, tray: true, faces: null,
    title: `${p.name}, ${p.w}×${p.h}`, link, qr: qrFor(link), paper: paper(),
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  });
  return { blob: new Blob([pdf], { type: "application/pdf" }), printPdf };
}
async function busy(button, label, job) {
  const was = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { await job(); } catch (e) { button.textContent = "Didn’t work"; await new Promise((r) => setTimeout(r, 2000)); }
  button.textContent = was;
  button.disabled = false;
}
const downloadPdf = (p, button) => busy(button, "Making…", async () => {
  const { blob } = await pdfFor(p);
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `color-cubes-${p.id}.pdf` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
});
const printDesign = (p, button) => busy(button, "Opening…", async () => {
  const { blob, printPdf } = await pdfFor(p);
  await Promise.race([printPdf(blob), new Promise((r) => setTimeout(r, 2500))]);
});

// ---------------------------------------------------------------------------------------------
// The larger view

const modal = $("modal");
const frame = modal.querySelector(".m-frame");
let current = null;

function fill(p) {
  current = p;
  $("m-art").innerHTML = codeSVG(p.code, { gap: 0.03, label: `${p.name}, a ${p.w} by ${p.h} design` });
  $("m-name").textContent = p.name;
  $("m-facts").textContent = facts(p);
  $("m-code").textContent = p.code;
  $("m-open").href = DESIGNER_PATH + p.code;
  const i = shown.indexOf(p);
  $("m-prev").disabled = i <= 0;
  $("m-next").disabled = i < 0 || i >= shown.length - 1;
}
function show(p, { push = true } = {}) {
  fill(p);
  if (push) {
    try { history.pushState({ design: p.id }, "", location.pathname + location.search + "#" + p.id); } catch (e) { /* ignore */ }
  }
  frame.style.transform = "";
  if (!modal.open) {
    modal.showModal();
    modal.classList.remove("leaving");
    requestAnimationFrame(() => modal.classList.add("in"));
  }
}
function step(by) {
  const i = shown.indexOf(current);
  const p = shown[i + by];
  if (!p) return;
  fill(p);
  try { history.replaceState({ design: p.id }, "", location.pathname + location.search + "#" + p.id); } catch (e) { /* ignore */ }
}
/** Leave the larger view: through history when it added an entry, so Back stays in step. */
function leave() {
  if (history.state && history.state.design) history.back();
  else hide();
}
function hide() {
  if (!modal.open) return;
  modal.classList.remove("in");
  modal.classList.add("leaving");
  const done = () => { modal.classList.remove("leaving"); frame.style.transform = ""; if (modal.open) modal.close(); };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) done();
  else setTimeout(done, 200);
  const card = current && out.querySelector(`[data-id="${current.id}"] .pat-look`);
  if (card) card.focus({ preventScroll: true });
}

addEventListener("popstate", () => {
  const p = openFromHash();
  if (p) show(p, { push: false });
  else hide();
});
modal.addEventListener("cancel", (e) => { e.preventDefault(); leave(); });
modal.addEventListener("click", (e) => { if (e.target === modal) leave(); });
$("m-close").addEventListener("click", leave);
$("m-prev").addEventListener("click", () => step(-1));
$("m-next").addEventListener("click", () => step(1));
$("m-pdf").addEventListener("click", (e) => downloadPdf(current, e.currentTarget));
$("m-print").addEventListener("click", (e) => printDesign(current, e.currentTarget));
modal.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});

// Swipe right to go back, as on a phone's app screens: the view follows the finger and leaves past
// a quarter of the width (or on a quick flick); otherwise it springs back.
(() => {
  let start = null;
  frame.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest("a, button")) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, horizontal: null, id: e.pointerId };
  });
  frame.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (start.horizontal === null && Math.hypot(dx, dy) > 8) start.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!start.horizontal) return;
    start.dx = Math.max(0, dx);
    frame.style.transition = "none";
    frame.style.transform = `translateX(${start.dx}px)`;
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const { dx, t, horizontal } = start;
    start = null;
    frame.style.transition = "";
    if (!horizontal) return;
    const fast = dx / Math.max(1, performance.now() - t) > 0.6;
    if (dx > frame.offsetWidth * 0.25 || (fast && dx > 40)) {
      frame.style.transform = "translateX(100%)";
      leave();
    } else frame.style.transform = "";
  };
  frame.addEventListener("pointerup", end);
  frame.addEventListener("pointercancel", end);
})();

// ---------------------------------------------------------------------------------------------
// Cards

out.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const id = b.dataset.show || b.dataset.pdf || b.dataset.print;
  const p = all.find((x) => x.id === id);
  if (!p) return;
  if (b.dataset.show) show(p);
  else if (b.dataset.pdf) downloadPdf(p, b);
  else printDesign(p, b);
});

fetch("/data/patterns.json")
  .then((res) => res.json())
  .then((data) => {
    const make = (p, lid) => {
      const grid = parseCode(p.code).grid;
      const colors = colorsOf(grid);
      return { ...p, lid, grid, colors, kind: colorKind(colors), size: `${p.w}x${p.h}` };
    };
    all = [...data.lid.map((p) => make(p, true)), ...data.presets.map((p) => make(p, false))];
    buildFilters();
    readAddress();
    syncFilters();
    render();
    const p = openFromHash();
    if (p) {
      // Opened from a link: put the grid underneath it in history, so Back shows the grid.
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
      show(p);
    }
  })
  .catch(() => {
    out.innerHTML = `<p>The designs couldn't load. The <a href="/downloads/#patterns">pattern sheets</a> have all of them.</p>`;
  });
