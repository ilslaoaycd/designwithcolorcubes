// build_tray_fan.mjs — a row of tray renders to point at and open, written into a page.
//
//   node tools/build_tray_fan.mjs
//
// For each fan below, writes a <ul class="tray-fan"> between the page's
//   <!-- tray-fan: {name} -->  and  <!-- /tray-fan -->
// markers: one link per design to the designer, with its render from site/img/{dir}/ (made by
// python tools/render_scenes.py --set={set}). The look (overlap, tilt, coming to the front when
// pointed at) is .tray-fan in site/css/site.css, so any page can carry one.
//
// The order is worked out, not listed: the biggest trays at the two ends, then from the outside in
// the smallest pair, the next biggest pair and so on, so the row is balanced about its middle with
// big and small taking turns. Each tray gets a small steady tilt and lift, and smaller trays lie
// on top of bigger ones. MIT licensed (see LICENSE).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

const FANS = [
  // The History page's foot: the home page's row in the original cubes, in dark trays.
  { name: "history", page: "site/history/index.html", set: "row", dir: "trays-original", label: "Designs in the original cubes" },
  // The patterns page's foot: the same designs in printed cubes and white trays (the home page's row).
  { name: "patterns", page: "site/patterns/index.html", set: "row", dir: "trays", label: "Designs in printed cubes" }
];

// Renders are 1.31 px a millimetre; one unit of --w is a cube's pitch (27.5 mm) at that scale.
const UNIT_PX = 36.05;

/** A WebP's width and height, from its header. */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${file}: not a WebP`);
}

/** Codes of a tray set, as listed in tools/render-scenes.html. */
function setCodes(set) {
  const m = new RegExp(`\\n  ${set}: \\{[\\s\\S]*?codes: \\[([\\s\\S]*?)\\]`).exec(read("tools", "render-scenes.html"));
  if (!m) throw new Error(`no tray set ${set}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Biggest at the ends, then smallest, then next biggest..., mirrored from the outside in. */
function balanced(items) {
  const left = [], right = [];
  const pool = [...items].sort((a, b) => b.cubes - a.cubes || a.code.localeCompare(b.code));
  let big = true;
  while (pool.length) {
    const take = () => (big ? pool.shift() : pool.pop());
    left.push(take());
    if (pool.length) right.unshift(take());
    big = !big;
  }
  return [...left, ...right];
}

const data = JSON.parse(read("site", "data", "patterns.json"));
const byCode = new Map([...data.presets, ...data.lid].map((p) => [p.code, p]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

for (const fan of FANS) {
  const items = setCodes(fan.set).map((code) => {
    const rows = code.split("-"), w = rows[0].length, h = rows.length;
    const [pw, ph] = webpSize(join(ROOT, "site", "img", fan.dir, code + ".webp"));
    const half = Math.round(pw / 2);
    const name = byCode.get(code)?.name || `A ${w} by ${h} design`;
    return { code, w, h, cubes: w * h, pw, ph, half, name };
  });
  const order = balanced(items);
  const lis = order.map((t, i) => {
    // A steady small tilt, alternating in direction, and a little lift for every third.
    const r = ((i % 2 ? 1 : -1) * (1.2 + ((i * 7) % 5) * 0.45)).toFixed(1);
    const y = [0, 0.35, -0.2][i % 3];
    const src = `/img/${fan.dir}/${t.code}`;
    // Smaller trays lie on top of bigger ones, so none is hidden.
    const z = 1 + Math.round((100 - t.cubes) / 10);
    return `    <li style="--w: ${(t.pw / UNIT_PX).toFixed(3)}; --r: ${r}deg; --y: ${y}; --z: ${z}">`
      + `<a href="/designer/${t.code}" title="${esc(t.name)}" aria-label="${esc(t.name)}, ${t.w} by ${t.h}: open it in the designer">`
      + `<img src="${src}.webp" srcset="${src}-${t.half}.webp ${t.half}w, ${src}.webp ${t.pw}w" sizes="calc(${(t.pw / UNIT_PX).toFixed(3)} * 1.3vw)"`
      + ` width="${t.pw}" height="${t.ph}" loading="lazy" decoding="async" alt="${esc(t.name)}, a ${t.w} by ${t.h} Color Cubes design"></a></li>`;
  });
  const html = `<!-- tray-fan: ${fan.name} -->\n  <ul class="tray-fan" aria-label="${fan.label}; each opens in the designer">\n${lis.join("\n")}\n  </ul>\n  <!-- /tray-fan -->`;
  const file = join(ROOT, fan.page);
  const page = read(fan.page);
  const re = new RegExp(`<!-- tray-fan: ${fan.name} -->[\\s\\S]*?<!-- /tray-fan -->`);
  if (!re.test(page)) throw new Error(`${fan.page}: no <!-- tray-fan: ${fan.name} --> markers`);
  const next = page.replace(re, html);
  if (next !== page) { writeFileSync(file, next); console.log("wrote", fan.page); }
  console.log(`${fan.name}: ${order.map((t) => `${t.w}x${t.h}`).join(" ")}`);
}
