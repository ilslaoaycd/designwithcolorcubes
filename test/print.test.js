import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseCode } from "../site/js/cubecode.js";
import * as P from "../site/js/print3d.js";
import { CLASSIC, shapes, artRegions, layout } from "../site/js/lidart.js";
import { presetSpec, PRESETS, spotCodes, clean, encode, decode, words, lidStyle } from "../site/js/boxcode.js";
import { designsFor, makeDesigns } from "../site/js/designs.js";
import { slicerLinks } from "../site/js/slicers.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
/** Volume of a closed mesh (divergence theorem). */
const volume = (m) => {
  let v = 0;
  for (let i = 0; i < m.t.length; i += 3) {
    const [a, b, c] = [m.t[i], m.t[i + 1], m.t[i + 2]].map((k) => m.v.slice(3 * k, 3 * k + 3));
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
};
const patterns = JSON.parse(read("site/data/patterns.json"));
const type = JSON.parse(read("site/data/lid-type.json"));

test("trays come out the size of Isaac's 7×7 tray, closed, for every size", () => {
  const [t7] = P.trayParts(7, 7);
  const b = t7.bounds();
  assert.deepEqual(b.hi.map((v) => Math.round(v * 100) / 100), [196, 196, 18]);
  for (let n = 2; n <= 10; n++) for (const m of [n, Math.max(2, n - 3)]) {
    const [t] = P.trayParts(n, m);
    assert.equal(P.openEdges(t), 0, `${n}x${m}`);
  }
  // With its top edges chamfered it is Isaac's Fusion tray to the cubic millimetre.
  assert.ok(Math.abs(volume(t7) - 147133.7) < 0.5, `tray volume ${volume(t7).toFixed(1)}`);
  const pocketFloor = t7.v.filter((_, i) => i % 3 === 2 && Math.abs(t7.v[i] - P.TRAY.floor) < 1e-9).length;
  assert.equal(pocketFloor, 4, "a square pocket floor");
});

test("the lid's ledge holds the tray's rim, with the cubes clear of the artwork", () => {
  for (const [c, r] of [[7, 7], [2, 2], [10, 4]]) {
    const l = P.lidSize(c, r), t = P.traySize(c, r);
    const [walls] = P.lidParts(c, r, []);
    assert.equal(P.openEdges(walls), 0, `${c}x${r} walls`);
    // The ledge's edge: 2 mm inside the tray's outside, all round, from the plate to LEDGE_TOP.
    const xs = (z) => walls.v.filter((_, i) => i % 3 === 0 && Math.abs(walls.v[i + 2] - z) < 1e-9);
    const edge = Math.min(...xs(P.LEDGE_TOP).filter((x) => x > P.LID.wall + 0.1));
    assert.ok(Math.abs(l.w - 2 * edge - (t.w - 2 * P.LID.ledge)) < 1e-6, `${c}x${r} ledge opening`);
    assert.ok(t.w - 2 * P.LID.ledge > t.pocketW + 1, "the opening clears the cubes");
  }
  assert.ok(P.LEDGE_TOP - P.LID.plate >= P.TRAY.floor + P.CUBE - P.TRAY.height, "cubes clear the plate");
  assert.ok(Math.abs(P.LEDGE_TOP + P.TRAY.height - P.LID.height) < 0.1, "the tray's bottom is level with the rim");
  const [w7] = P.lidParts(7, 7, []);
  assert.deepEqual(w7.bounds().hi.map((v) => Math.round(v * 100) / 100), [200.3, 200.3, 33]);
  assert.ok(Math.abs(volume(w7) - 67135.6) < 200, `walls ${volume(w7).toFixed(1)} vs Isaac's 67135.6`);
});

test("the lid fits over the tray and matches the 7×7 lid's outside size", () => {
  const l = P.lidSize(7, 7), t = P.traySize(7, 7);
  assert.equal(Math.round(l.w * 100) / 100, 200.3);
  assert.ok(l.topW - t.w > 0.5, "clearance round the tray");
});

test("a cube is eight closed parts in four colors that fill it, recessed or flat", async () => {
  const { volume, L } = await import("../site/js/cubeparts.js");
  for (const faces of ["recessed", "flat"]) {
    const parts = P.cubeParts(faces);
    assert.equal(parts.length, 8);
    assert.deepEqual([...new Set(parts.map((m) => m.color))].sort(), ["blue", "red", "white", "yellow"]);
    let sum = 0;
    for (const m of parts) {
      assert.equal(P.openEdges(m), 0, `${faces} ${m.name}`);
      const v = volume(m.v, m.t);
      assert.ok(v > 0, `${faces} ${m.name} faces outward`);
      sum += v;
      for (const x of m.v) assert.ok(x >= -1e-9 && x <= L + 1e-9, `${faces} ${m.name} inside the cube`);
    }
    // Flat fills the cube; recessed leaves the two pockets (a 24 mm triangle, 0.78 mm deep).
    const air = L ** 3 - sum;
    if (faces === "flat") assert.ok(Math.abs(air) < 1e-6, `flat leaves ${air}`);
    else assert.ok(air > 400 && air < 460, `recessed pockets ${air}`);
  }
  // The light skin is exactly half the face when flat.
  const skin = P.cubeParts("flat").find((m) => m.name === "cube-split-by-yellow");
  const top = [];
  for (let i = 0; i < skin.v.length; i += 3) if (Math.abs(skin.v[i] - L) < 1e-6) top.push([skin.v[i + 1], skin.v[i + 2]]);
  assert.deepEqual(top.sort((a, b) => a[0] - b[0] || a[1] - b[1]), [[0, 0], [0, L], [L, 0]]);
});

const SPECS = {
  classic: CLASSIC,
  own_words_4x4: { ...presetSpec("text", 4, 4), labels: [{ ...presetSpec("text").labels[0], lines: [{ text: "Made for Sam", big: true }, { text: "Christmas 2026 é&?", big: false }] }] },
  words_left_9x9_white_panel: { ...presetSpec("text", 9, 9), labels: [{ ...presetSpec("text").labels[0], align: "l", fill: "white", ink: "red" }] },
  classic_6x5_no_frame: { ...presetSpec("classic", 6, 5), frame: "none" },
  big_10x10: presetSpec("big", 10, 10),
  big_3x9: presetSpec("big", 3, 9),
  small_grid_5x7: clean({ ...presetSpec("classic", 5, 7), grid: 6, labels: [{ ...presetSpec("classic").labels[0], c: 1, r: 1, w: 4, h: 4 }] }),
  all_designs_2x2_some_empty: clean({ cols: 2, rows: 2, grid: 4, empty: [0, 5, 6], stars: "yellow" }),
  two_labels_8x3: clean({ cols: 8, rows: 3, grid: 4, labels: [
    { c: 0, r: 0, w: 2, h: 1, fill: "red", ink: "white", align: "l", style: "rubik", lines: [{ text: "Left", big: true }] },
    { c: 2, r: 0, w: 2, h: 1, fill: "none", ink: "blue", align: "r", style: "rubik", lines: [{ text: "Right", big: true }] },
    { c: 1, r: 1, w: 2, h: 2, fill: "blue", ink: "white", align: "c", style: "classic", lines: [] }] })
};
const codesFor = (spec) => spotCodes(spec, designsFor(spec.cols, spec.rows, patterns));

test("every lid makes closed color layers that tile the whole top, with grooves between the cubes", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    const built = shapes(spec, codesFor(spec), type);
    const parts = P.lidParts(spec.cols, spec.rows, artRegions(built));
    let art = 0, grout = 0;
    for (const m of parts) {
      assert.equal(P.openEdges(m), 0, `${name}: ${m.name}`);
      if (m.name.startsWith("lid-art-")) art += volume(m);
      if (m.name.startsWith("lid-grout-")) {
        grout += volume(m);
        assert.ok(Math.abs(m.bounds().lo[2] - P.LID.groove) < 1e-9, `${name}: the backing starts ${P.LID.groove} mm up`);
      }
    }
    // The backing is 0.2 mm thick over the grooves' area, so the grooves take twice its volume.
    const top = Math.abs(P.area(P.topOutline(spec.cols, spec.rows)));
    if (built.facts.designs) assert.ok(grout > 0, `${name}: grooves`);
    assert.ok(Math.abs(art + 3 * grout - top * P.LID.art) < 1e-4 * top * P.LID.art, `${name}: art ${art.toFixed(2)} + grooves vs ${(top * P.LID.art).toFixed(2)}`);
    // Every groove is wide enough to stay open: between cubes and round each design's edge.
    for (const s of built.shapes.filter((x) => x.groove)) {
      const box = (r) => { const xs = r.filter((_, i) => i % 2 === 0), ys = r.filter((_, i) => i % 2); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
      const [ox0, oy0, ox1, oy1] = box(s.poly[0]);
      const tiles = s.poly.slice(1).map(box);
      const ix0 = Math.min(...tiles.map((t) => t[0])), iy0 = Math.min(...tiles.map((t) => t[1]));
      const ix1 = Math.max(...tiles.map((t) => t[2])), iy1 = Math.max(...tiles.map((t) => t[3]));
      for (const gap of [ix0 - ox0, iy0 - oy0, ox1 - ix1, oy1 - iy1]) assert.ok(gap >= 0.7 - 1e-9, `${name}: edge groove ${gap.toFixed(2)}`);
      const sorted = [...new Set(tiles.map((t) => t[0].toFixed(4)))].map(Number).sort((a, b) => a - b);
      const w = tiles[0][2] - tiles[0][0];
      for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] - w >= 0.7 - 1e-3, `${name}: groove between cubes`);
    }
  }
});

test("the 1930s layout puts twelve designs round the title, as on the original lid", () => {
  const L = layout(CLASSIC);
  assert.equal(L.spots.length, 12);
  assert.equal(L.stars.length, 12);
  assert.ok(Math.abs(L.spots[0].w - 39) < 1.5, `spot ${L.spots[0].w}`);
  assert.equal(shapes(CLASSIC, codesFor(CLASSIC), type).facts.designs, 12);
});

test("a cube on the lid is the same size for every set, square or not", () => {
  const sizes = [];
  for (let c = 2; c <= 10; c++) for (const r of [2, 5, 10]) {
    const L = layout(presetSpec("classic", c, r));
    sizes.push(L.cube);
    assert.ok(Math.abs(L.sw / L.sh - c / r) < 1e-9, `${c}x${r} spots keep the set's shape`);
    assert.ok(L.gap.x > 1 && L.gap.y > 1, `${c}x${r} gaps`);
  }
  assert.ok(Math.max(...sizes) - Math.min(...sizes) < 1e-9);
});

test("box codes round-trip every preset, picks, empty spots and words", () => {
  for (const name of Object.keys(PRESETS)) {
    for (const [c, r] of [[7, 7], [4, 9], [10, 2]]) {
      const s = presetSpec(name, c, r);
      assert.deepEqual(decode(encode(s), words(s)), s, `${name} ${c}x${r}`);
    }
  }
  const s = clean({ ...presetSpec("text", 5, 6), empty: [0, 3], picks: { 1: makeDesigns(5, 6)[2].code } });
  s.labels[0].lines.push({ text: "Für Sam & Jo ~ 2026", big: false });
  const back = decode(encode(s), words(s));
  assert.deepEqual(back.picks, s.picks);
  assert.deepEqual(back.empty, s.empty);
  assert.equal(back.labels[0].lines[1].text, "Für Sam & Jo - 2026");
  assert.ok(encode(presetSpec("classic")).length < 16);
});

test("links made before the grid had its own rows still open the same lid", async () => {
  const { tokenSize } = await import("../site/js/boxcode.js");
  // Version 1 tokens, made by the earlier code.
  const classic = decode("Kq0JEkmBAAA");
  assert.equal(lidStyle(classic), "classic");
  assert.deepEqual([classic.cols, classic.rows, classic.grid, classic.gridRows], [7, 7, 4, 4]);
  const text = decode("Jq0JEkmAPAAIAA", ["Color Cubes"]);
  assert.deepEqual([text.cols, text.rows, text.grid, text.gridRows], [5, 7, 4, 4]);
  assert.deepEqual(text.empty, [0, 15]);
  assert.equal(text.labels[0].lines[0].text, "Color Cubes");
  assert.equal(lidStyle(decode("JOEBAAA")), "big");
  assert.deepEqual(tokenSize("Jq0JEkmAPAAIAA"), { cols: 5, rows: 7 });
});

test("lids of every shape keep even gaps and a panel shaped for words", async () => {
  const { lidSize } = await import("../site/js/print3d.js");
  const { fitGrid } = await import("../site/js/boxcode.js");
  for (let c = 2; c <= 10; c++) for (let r = 2; r <= 10; r++) {
    for (const name of ["classic", "full", "text"]) {
      const s = presetSpec(name, c, r);
      const L = layout(s);
      assert.ok(Math.abs(L.gap.x - L.gap.y) < 1e-9, `${name} ${c}x${r} gaps ${L.gap.x} ${L.gap.y}`);
      assert.ok(L.gap.x >= 3, `${name} ${c}x${r} gap ${L.gap.x}`);
      assert.ok(L.spots.length >= 6, `${name} ${c}x${r} designs`);
      if (name !== "full" && Math.max(c, r) / Math.min(c, r) <= 2) {
        const p = L.labels[0];
        assert.ok(p.w / p.h > 0.7 && p.w / p.h < 2.1, `${name} ${c}x${r} panel ${(p.w / p.h).toFixed(2)}`);
      }
    }
    // fitGrid works from its own copy of the lid's size.
    const f = fitGrid(c, r);
    assert.ok(f.gx <= 4 && f.gy <= 4 && Math.max(f.gx, f.gy) === 4);
    const ls = lidSize(c, r);
    assert.ok(Math.abs(ls.topW - (c * 26.95 + 1.69 + 5.66 + 0.8)) < 1e-9);
  }
  assert.equal(lidStyle(presetSpec("full", 7, 7)), "full");
  assert.equal(layout(presetSpec("full", 7, 7)).spots.length, 16);
});

test("a set starts with the 1930s lid from 6 × 6 up, and with words below that", async () => {
  const { defaultSpec, lidStyle, boxPath } = await import("../site/js/boxcode.js");
  assert.equal(lidStyle(defaultSpec(6, 6)), "classic");
  assert.equal(lidStyle(defaultSpec(5, 9)), "text");
  assert.equal(lidStyle(presetSpec("big", 4, 4)), "big");
  assert.equal(boxPath(defaultSpec(7, 5)), "/box/7x5");
  assert.equal(boxPath(defaultSpec(7, 7)), "/box/7x7");
  assert.match(boxPath(presetSpec("big", 7, 7)), /^\/box\/7x7\/\w+/);
});

test("made-up designs fit their tray and never only turn around the middle", async () => {
  const { mirrorLR, mirrorTB, turnCW } = await import("../tools/patterns-src.mjs");
  const corner = (d, c) => (d < 8 ? 4 : 8) + c;
  const transpose = (d) => (d >= 4 ? corner(d, [0, 3, 2, 1][(d - 4) % 4]) : d);
  for (let w = 2; w <= 10; w++) for (let h = 2; h <= 10; h++) {
    for (const d of makeDesigns(w, h)) {
      const { grid, error, w: pw, h: ph } = parseCode(d.code);
      assert.equal(error, undefined, `${d.name} ${w}x${h}`);
      assert.deepEqual([pw, ph], [w, h]);
      const at = (r, c) => grid[r * w + c];
      const every = (f) => grid.every((x, i) => f(Math.floor(i / w), i % w) === x);
      const mirrored = every((r, c) => mirrorLR(at(r, w - 1 - c))) || every((r, c) => mirrorTB(at(h - 1 - r, c))) ||
        (w === h && every((r, c) => transpose(at(c, r)))) ||
        (w === h && every((r, c) => transpose(mirrorLR(mirrorTB(at(w - 1 - c, h - 1 - r))))));
      const turns = (w === h && every((r, c) => turnCW(at(w - 1 - c, r)))) || every((r, c) => turnCW(turnCW(at(h - 1 - r, w - 1 - c))));
      assert.ok(mirrored || !turns, `${d.name} ${w}x${h} only turns around its center`);
    }
  }
});

test("3MF and zip writers make files a zip reader accepts", async () => {
  const { inflateRawSync } = await import("node:zlib");
  const bytes = await P.to3MF([{ name: "Tray", parts: P.trayParts(4, 4) }]);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 4);
  // The model is the third entry; inflate it and check it parses as far as a regex can tell.
  let o = 0;
  for (let i = 0; i < 2; i++) o += 30 + dv.getUint16(o + 26, true) + dv.getUint32(o + 18, true);
  const method = dv.getUint16(o + 8, true), size = dv.getUint32(o + 18, true), start = o + 30 + dv.getUint16(o + 26, true);
  const data = bytes.subarray(start, start + size);
  const xml = new TextDecoder().decode(method === 8 ? inflateRawSync(data) : data);
  assert.match(xml, /<basematerials id="1">/);
  assert.match(xml, /<item objectid="\d+" transform="1 0 0 0 1 0 0 0 1 0 0 0"\/>/);
});

test("3MF files carry each part's filament for Bambu Studio and OrcaSlicer, one object per copy", () => {
  const cube = P.cubeParts();
  const objects = [{ name: "Cubes", parts: cube, items: P.plateOffsets(2, 3), paint: true }];
  const xml = P.modelXML(objects), cfg = P.modelSettings(objects);
  const items = [...xml.matchAll(/<item objectid="(\d+)"/g)].map((m) => m[1]);
  const parents = [...xml.matchAll(/<object id="(\d+)" type="model" name="[^"]*">\s*<components>/g)].map((m) => m[1]);
  assert.equal(items.length, 3);
  assert.deepEqual(items, parents, "each build item has its own parent object");
  const fil = { white: 1, blue: 2, yellow: 3, red: 4 };
  for (const id of parents) {
    const obj = new RegExp(`<object id="${id}">([\\s\\S]*?)</object>`).exec(cfg);
    assert.ok(obj, `settings for object ${id}`);
    const parts = [...obj[1].matchAll(/<part id="(\d+)"[\s\S]*?value="([^"]+)"\/>\s*<metadata key="extruder" value="(\d)"/g)];
    assert.equal(parts.length, 8);
    for (const [, , name, ext] of parts) assert.equal(+ext, fil[cube.find((m) => m.name === name).color], name);
  }
  // Paint in each part's own filament, for slicers that sort colors by paint.
  assert.match(xml, /name="cube-split-by-blue"[^>]*>[\s\S]*?paint_color="8"/);
  const lid = [{ name: "Lid", parts: P.lidParts(3, 3, []), settings: P.LID_SETTINGS }];
  assert.ok(!P.modelXML(lid).includes("paint_color"), "lids aren't painted: paint bleeds their colors between layers");
  assert.match(P.modelSettings(lid), /<metadata key="brim_type" value="no_brim"\/>/);
});

test("a set's bed leaves room for the purge tower, and 7 × 7 cubes go on one plate", () => {
  const b = P.beds(7, 7);
  assert.deepEqual(b.one, [211, 211]);
  assert.deepEqual(b.four, [246, 211]);
  assert.equal(b.square, 256);
  assert.deepEqual(P.cubePlates(49, b.square), { k: 7, full: 1, rest: 0, count: 1 });
  for (let n = 2; n <= 10; n++) {
    const bb = P.beds(n, n), p = P.cubePlates(n * n, bb.square || bb.four[0]);
    assert.ok(P.plateSize(p.k) + P.TOWER <= (bb.square || bb.four[0]), `${n}x${n} plate and tower fit`);
  }
});

test("slicer links encode the file once and skip slicers that can't open the type", () => {
  const u = "https://designwithcolorcubes.org/files/trays/tray-4x4.stl";
  const links = slicerLinks(u);
  assert.ok(!links.some((l) => l.id === "bambu" || l.id === "qidi"), "Bambu and QIDI open 3MF only");
  const orca = links.find((l) => l.id === "orca");
  assert.equal(orca.href, "orcaslicer://open?file=" + encodeURIComponent(u));
  assert.ok(slicerLinks(u.replace(".stl", ".3mf")).some((l) => l.id === "bambu"));
});

test("every print file listed exists and is sent as a named download", () => {
  const { files } = JSON.parse(read("site/data/files.json"));
  const headers = read("site/_headers");
  assert.ok(files.length > 40);
  for (const f of files) {
    assert.ok(existsSync(new URL("../site" + f.path, import.meta.url)), f.path);
    if (/\.(3mf|stl)$/.test(f.path)) assert.ok(headers.includes(`${f.path}\n  Content-Disposition: attachment; filename="${f.path.split("/").pop()}"`), f.path);
  }
  assert.ok(headers.split("\n").filter((l) => l.startsWith("/")).length <= 100, "Workers allow 100 _headers rules");
});

test("agents.md and the home page only point at print files that exist", () => {
  for (const page of ["site/agents.md", "site/index.html"]) {
    const text = read(page);
    for (const m of text.matchAll(/\/files\/[\w./-]+\.(?:3mf|stl|obj|mtl|f3d|txt)/g)) {
      assert.ok(existsSync(new URL("../site" + m[0], import.meta.url)), `${page}: ${m[0]}`);
    }
  }
});
