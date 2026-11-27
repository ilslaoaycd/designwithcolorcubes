// build_patterns.mjs — builds the preset designs and the printable pattern sheets.
//
//   site/data/patterns.json                    presets for the designer and the website
//                                              (keeps the "lid" section written by build_artwork.py)
//   artwork/patterns/sheets/*.svg              printable pattern sheets and a blank worksheet
//   artwork/patterns/designs/<id>.svg          every design on its own
//   site/downloads/patterns/*.svg              the sheets again, to open from the website
//   site/downloads/patterns/designs/<id>.svg   every design again, for the Files page
//                                              (whose Download all zips them in the browser)
//
// The designs themselves are listed, best first within each size, in tools/presets.mjs.
// Run from the repository root:  node tools/build_patterns.mjs

import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toReadable, parseCode, COLORS, CODE } from "../site/js/cubecode.js";
import { faceShapes } from "../site/js/cubeface.js";
import { PRESETS } from "./presets.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => join(ROOT, ...p);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------------------------
// The preset list

const data = JSON.parse(readFileSync(at("site/data/patterns.json"), "utf8"));
// Smallest trays first; within a size, the order in presets.mjs (best first).
const presets = PRESETS.map(([name, text], i) => {
  const t = parseCode(text);
  if (t.error) throw new Error(name + ": " + t.error);
  if (t.filled) throw new Error(name + ": a row is short");
  return { id: `${slug(name)}-${t.w}x${t.h}`, name, w: t.w, h: t.h, code: toReadable(t.grid, t.w, t.h), i };
}).sort((a, b) => a.w * a.h - b.w * b.h || a.w - b.w || a.i - b.i).map(({ i, ...p }) => p);
const ids = new Set([...data.lid, ...presets].map((p) => p.id));
if (ids.size !== data.lid.length + presets.length) throw new Error("two designs share an id");
const codes = new Set(presets.map((p) => p.code));
if (codes.size !== presets.length) throw new Error("two presets have the same tray code");

delete data.groups;
data.presets = presets;
writeFileSync(at("site/data/patterns.json"), JSON.stringify(data, null, 2) + "\n");
console.log("site/data/patterns.json: %d lid designs, %d presets", data.lid.length, presets.length);

// ---------------------------------------------------------------------------------------------
// Drawing helpers (millimetres)

const FONT = "Rubik, 'Trebuchet MS', Verdana, sans-serif";
const MONO = "'Courier New', Courier, monospace";
const PAGE = { w: 210, h: 279 }; // fits both A4 and US Letter

function tray(grid, w, h, x, y, size) {
  const gap = 0.04;
  const s = size / (Math.max(w, h) + (Math.max(w, h) - 1) * gap);
  const ox = x + (size - (w * s + (w - 1) * gap * s)) / 2;
  const oy = y + (size - (h * s + (h - 1) * gap * s)) / 2;
  let out = "";
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) out += faceShapes(grid[r * w + c], ox + c * s * (1 + gap), oy + r * s * (1 + gap), s);
  }
  return out;
}

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push((cx + rr * Math.cos(a)).toFixed(2) + "," + (cy + rr * Math.sin(a)).toFixed(2));
  }
  return `<polygon points="${pts.join(" ")}" fill="${COLORS.red}"/>`;
}

function page(title, body, sub) {
  const { w, h } = PAGE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>${esc(title)}</title>
<rect width="${w}" height="${h}" fill="${COLORS.white}"/>
<rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="${COLORS.red}" stroke-width="1.6"/>
<rect x="9.5" y="9.5" width="${w - 19}" height="${h - 19}" fill="none" stroke="${COLORS.red}" stroke-width="0.35"/>
<rect x="${w / 2 - 62}" y="15" width="124" height="17" fill="${COLORS.blue}"/>
${star(w / 2 - 54, 23.5, 2.6)}${star(w / 2 + 54, 23.5, 2.6)}
<text x="${w / 2}" y="26.4" text-anchor="middle" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing="0.6" fill="${COLORS.white}">COLOR CUBES</text>
<text x="${w / 2}" y="38.5" text-anchor="middle" font-family="${FONT}" font-size="4.6" fill="${COLORS.blue}">${esc(sub)}</text>
${body}
<text x="${w / 2}" y="${h - 13}" text-anchor="middle" font-family="${FONT}" font-size="2.8" fill="${COLORS.blue}">designwithcolorcubes.org  ·  Type a code into the designer to open it.  ·  Free to print and share, CC BY 4.0</text>
</svg>
`;
}

function sheet(items, sub) {
  const cols = 3, size = 40, pitchX = 58, pitchY = 54;
  const x0 = (PAGE.w - (cols - 1) * pitchX - size) / 2, y0 = 46;
  let body = "";
  items.forEach((p, i) => {
    const x = x0 + (i % cols) * pitchX, y = y0 + Math.floor(i / cols) * pitchY;
    const grid = parseCode(p.code).grid;
    body += `<rect x="${x - 0.6}" y="${y - 0.6}" width="${size + 1.2}" height="${size + 1.2}" fill="#C9BFA6"/>`;
    body += `<g>${tray(grid, p.w, p.h, x, y, size)}</g>`;
    body += `<text x="${x + size / 2}" y="${y + size + 4.6}" text-anchor="middle" font-family="${FONT}" font-size="3.3" fill="${COLORS.blue}">${esc(p.name)}</text>`;
    const code = p.code.length > 40 ? p.code.slice(0, 39) + "…" : p.code;
    body += `<text x="${x + size / 2}" y="${y + size + 8.2}" text-anchor="middle" font-family="${MONO}" font-size="${p.code.length > 30 ? 1.8 : 2.2}" fill="${COLORS.blue}" opacity="0.8">${esc(code)}</text>`;
  });
  return page("Color Cubes pattern sheet", body, sub);
}

function worksheet() {
  // Four empty 7 × 7 trays to color in, with a key of the twelve looks and their code letters.
  let body = "";
  const size = 80, gx = [17, 113], gy = [46, 136];
  for (const y of gy) {
    for (const x of gx) {
      const s = size / 7;
      body += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" stroke="${COLORS.blue}" stroke-width="0.5"/>`;
      for (let i = 1; i < 7; i++) {
        body += `<line x1="${x + i * s}" y1="${y}" x2="${x + i * s}" y2="${y + size}" stroke="${COLORS.blue}" stroke-width="0.2"/>`;
        body += `<line x1="${x}" y1="${y + i * s}" x2="${x + size}" y2="${y + i * s}" stroke="${COLORS.blue}" stroke-width="0.2"/>`;
      }
    }
  }
  const ky = 226, ks = 11, kx0 = (PAGE.w - 12 * ks - 11 * 3) / 2;
  body += `<text x="${PAGE.w / 2}" y="${ky - 3}" text-anchor="middle" font-family="${FONT}" font-size="3.3" fill="${COLORS.blue}">The twelve ways a cube can face up, with the letter or number each one gets in a tray code</text>`;
  for (let d = 0; d < 12; d++) {
    const x = kx0 + d * (ks + 3);
    body += faceShapes(d, x, ky, ks);
    body += `<rect x="${x}" y="${ky}" width="${ks}" height="${ks}" fill="none" stroke="${COLORS.blue}" stroke-width="0.2"/>`;
    body += `<text x="${x + ks / 2}" y="${ky + ks + 4.5}" text-anchor="middle" font-family="${MONO}" font-size="3.6" font-weight="700" fill="${COLORS.blue}">${CODE[d]}</text>`;
  }
  return page("Color Cubes worksheet", body, "Worksheet: draw your own designs");
}

// ---------------------------------------------------------------------------------------------
// Write the sheets and the single designs

const OUT = at("artwork/patterns");
rmSync(OUT, { recursive: true, force: true });
rmSync(at("site/downloads/patterns"), { recursive: true, force: true });
for (const d of ["sheets", "designs"]) mkdirSync(join(OUT, d), { recursive: true });
mkdirSync(at("site/downloads/patterns"), { recursive: true });

const lidItems = data.lid.map((p) => ({ ...p, name: p.name }));
const pages = [[lidItems, "The twelve designs from the lid"]];
// Each size starts on a new page, best designs first.
for (const size of [...new Set(presets.map((p) => `${p.w} × ${p.h}`))]) {
  const list = presets.filter((p) => `${p.w} × ${p.h}` === size);
  for (let i = 0; i < list.length; i += 12) pages.push([list.slice(i, i + 12), `Designs for a ${size} tray`]);
}

const sheetFiles = [];
pages.forEach(([items, sub], n) => {
  const name = `pattern-sheet-${String(n + 1).padStart(2, "0")}.svg`;
  const svg = sheet(items, sub);
  writeFileSync(join(OUT, "sheets", name), svg);
  writeFileSync(at("site/downloads/patterns", name), svg);
  sheetFiles.push(name);
});
writeFileSync(join(OUT, "sheets", "worksheet-7x7.svg"), worksheet());
writeFileSync(at("site/downloads/patterns", "worksheet-7x7.svg"), worksheet());
sheetFiles.push("worksheet-7x7.svg");
console.log("artwork/patterns/sheets: %d sheets", sheetFiles.length);

for (const p of [...data.lid, ...presets]) {
  const grid = parseCode(p.code).grid;
  const s = 100, gap = 3;
  const W = p.w * s + (p.w - 1) * gap, H = p.h * s + (p.h - 1) * gap;
  let body = "";
  for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) body += faceShapes(grid[r * p.w + c], c * (s + gap), r * (s + gap), s);
  writeFileSync(join(OUT, "designs", `${p.id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><title>${esc(p.name)} (${p.code})</title>${body}</svg>\n`);
}
console.log("artwork/patterns/designs: %d files", readdirSync(join(OUT, "designs")).length);

// The single designs again, under the website's downloads (the Files page lists them).
mkdirSync(at("site/downloads/patterns/designs"), { recursive: true });
for (const f of readdirSync(join(OUT, "designs")).sort()) writeFileSync(at("site/downloads/patterns/designs", f), readFileSync(join(OUT, "designs", f)));
console.log("site/downloads/patterns/designs: %d files", readdirSync(at("site/downloads/patterns/designs")).length);
