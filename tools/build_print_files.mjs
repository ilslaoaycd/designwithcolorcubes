// build_print_files.mjs — the print files the website serves one by one, so people download only
// what they need:
//
//   site/files/...                 every file in models/ (3MF, STL, OBJ, slicer project, Fusion
//                                  sources, README and LICENSE), copied as they are
//   site/files/trays/tray-NxN.*    a tray for N × N cubes, N = 2 to 10, as 3MF and STL
//   site/files/plates/cubes-KxK.3mf  K × K cubes laid out 3 mm apart, K = 2 to 10, one plate each
//   models/3mf/color-cube*.3mf, models/stl/color-cube/   the cube, made by site/js/cubeparts.js
//   site/downloads/color-cubes-7x7-*.zip   the 7×7 zips, rebuilt from models/ to match
//   site/data/files.json           the list the print picker reads: path, size and what each is
//
//   node tools/build_print_files.mjs
//
// The trays and plates come from site/js/print3d.js, the same code the box designer runs in the
// browser for other sizes. MIT licensed.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../site/js/print3d.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => join(ROOT, ...p);
const OUT = at("site/files");

// The cube: eight closed parts in four colors from site/js/cubeparts.js, so every split face
// prints in its two colors without any painting in the slicer. It replaces the cube files that
// tools/build_models.py made (whose split faces were one material each) in models/, and the 7×7
// zips are rebuilt to match.
const cube = P.cubeParts("recessed");
const cubeMeta = (title) => ({ Title: title });
writeFileSync(at("models/3mf/color-cube.3mf"), await P.to3MF([{ name: "Color Cube", parts: cube, paint: true }], cubeMeta("Color Cube")));
for (const k of [5, 7]) {
  writeFileSync(at(`models/3mf/color-cubes-plate-${k * k}.3mf`), await P.to3MF([{ name: "Color Cube", parts: cube, items: P.plateOffsets(k), paint: true }], cubeMeta(`Color Cubes, plate of ${k * k}`)));
}
rmSync(at("models/stl/color-cube"), { recursive: true, force: true });
mkdirSync(at("models/stl/color-cube"), { recursive: true });
for (const m of cube) writeFileSync(at(`models/stl/color-cube/${m.name}.stl`), P.toSTL(m));
// The OBJ too, one object per part with its color from color-cube.mtl (the old OBJ's split faces
// were one color each).
{
  const lines = ["# Color Cube - Isaac Lloyd, CC BY 4.0, https://designwithcolorcubes.org", "# units: millimetres", "mtllib color-cube.mtl"];
  const n = (x) => String(+x.toFixed(5));
  let base = 1;
  for (const m of cube) {
    lines.push(`o ${m.name}`, `usemtl ${m.color}`);
    for (let i = 0; i < m.v.length; i += 3) lines.push(`v ${n(m.v[i])} ${n(m.v[i + 1])} ${n(m.v[i + 2])}`);
    for (let i = 0; i < m.t.length; i += 3) lines.push(`f ${m.t[i] + base} ${m.t[i + 1] + base} ${m.t[i + 2] + base}`);
    base += m.v.length / 3;
  }
  writeFileSync(at("models/obj/color-cube.obj"), lines.join("\n") + "\n");
}

// Copy models/ as it is.
rmSync(OUT, { recursive: true, force: true });
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const f of walk(at("models"))) {
  const to = join(OUT, relative(at("models"), f));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(f, to);
}

// Trays and plates.
mkdirSync(join(OUT, "trays"), { recursive: true });
mkdirSync(join(OUT, "plates"), { recursive: true });
const meta = (title) => ({ Title: title });
for (let n = 2; n <= 10; n++) {
  const tray = P.trayParts(n, n);
  writeFileSync(join(OUT, "trays", `tray-${n}x${n}.3mf`), await P.to3MF([{ name: `Tray for ${n}×${n} Color Cubes`, parts: tray }], meta(`Color Cubes tray, ${n}×${n}`)));
  writeFileSync(join(OUT, "trays", `tray-${n}x${n}.stl`), P.toSTL(tray));
  writeFileSync(join(OUT, "plates", `cubes-${n}x${n}.3mf`), await P.to3MF([{ name: "Color Cube", parts: cube, items: P.plateOffsets(n), paint: true }], meta(`Color Cubes, plate of ${n * n}`)));
}

// The list for the print picker.
const KINDS = [
  [/^3mf\/color-cube\.3mf$/, "cube", "3mf", "One cube"],
  [/^3mf\/color-cubes-plate-(\d+)\.3mf$/, "plate-original", "3mf", "Plate of $1 cubes"],
  [/^3mf\/tray-7x7\.3mf$/, "tray", "3mf", "Tray, 7×7"],
  [/^3mf\/lid-7x7\.3mf$/, "lid", "3mf", "Lid, 7×7, the 1930s artwork"],
  [/^stl\/color-cube\/(.+)\.stl$/, "cube", "stl", "$1"],
  [/^stl\/tray-7x7\/(.+)\.stl$/, "tray", "stl", "Tray, 7×7"],
  [/^stl\/lid-7x7\/(.+)\.stl$/, "lid", "stl", "$1"],
  [/^obj\/(.+)\.(obj|mtl)$/, "obj", "obj", "$1.$2"],
  [/^projects\/bambu-studio-orcaslicer\/(.+)\.3mf$/, "project", "3mf", "Bambu Studio 2.4+ / OrcaSlicer 2.5+ project"],
  [/^source\/(.+)\.f3d$/, "source", "f3d", "$1"],
  [/^trays\/tray-(\d+)x\d+\.(3mf|stl)$/, "tray-n", "$2", "Tray, $1×$1"],
  [/^plates\/cubes-(\d+)x\d+\.3mf$/, "plate", "3mf", "Plate of $1×$1 cubes"],
  [/^(README|LICENSE)\.txt$/, "doc", "txt", "$1"]
];
const files = [];
for (const f of walk(OUT).sort()) {
  const path = relative(OUT, f).split("\\").join("/");
  const k = KINDS.find(([re]) => re.test(path));
  if (!k) throw new Error("no kind for " + path);
  const m = path.match(k[0]);
  const fill = (s) => s.replace(/\$(\d)/g, (_, i) => m[i]);
  const entry = { path: "/files/" + path, bytes: statSync(f).size, kind: k[1], format: fill(k[2]), label: fill(k[3]) };
  const n = path.match(/(\d+)x\1/);
  if (n) entry.n = Number(n[1]);
  files.push(entry);
}
// Each print file is sent as a download with its name, which Cura needs to open a 3MF from a link
// (it reads the type from Content-Disposition). Written between markers in site/_headers.
const BEGIN = "# --- print files (tools/build_print_files.mjs) ---", END = "# --- end of print files ---";
const headers = readFileSync(at("site/_headers"), "utf8");
const block = [BEGIN, ...files.filter((f) => /\.(3mf|stl|obj|mtl|f3d)$/.test(f.path)).flatMap((f) => [
  f.path, `  Content-Disposition: attachment; filename="${f.path.split("/").pop()}"`, ""]), END].join("\n");
const start = headers.indexOf(BEGIN), end = headers.indexOf(END);
writeFileSync(at("site/_headers"), start >= 0 ? headers.slice(0, start) + block + headers.slice(end + END.length) : headers.trimEnd() + "\n\n/files/*\n  Cache-Control: public, max-age=86400\n\n" + block + "\n");

writeFileSync(at("site/data/files.json"), JSON.stringify({ cube: P.CUBE, gap: P.PLATE_GAP, files }, null, 1) + "\n");
const total = files.reduce((a, f) => a + f.bytes, 0);
console.log(`site/files: ${files.length} files, ${(total / 1e6).toFixed(1)} MB; site/data/files.json`);

// The 7×7 zips, as tools/build_models.py lays them out, from models/ as it is now.
const tree = (dir) => walk(at("models", dir)).sort().map((f) => [relative(at("models"), f).split("\\").join("/"), f]);
const notes = [["README.txt", at("models/README.txt")], ["LICENSE.txt", at("models/LICENSE.txt")]];
const ZIPS = {
  "color-cubes-7x7-set.zip": [...notes, ...tree("3mf"), ...tree("stl"), ...tree("obj"), ...tree("projects")],
  "color-cubes-7x7-3mf.zip": [...notes, ...tree("3mf")],
  "color-cubes-7x7-stl.zip": [...notes, ...tree("stl")],
  "color-cubes-7x7-obj.zip": [...notes, ...tree("obj")]
};
for (const [name, list] of Object.entries(ZIPS)) {
  writeFileSync(at("site/downloads", name), await P.zip(list.map(([n, f]) => [n, new Uint8Array(readFileSync(f))])));
  console.log(`site/downloads/${name}: ${list.length} files`);
}
