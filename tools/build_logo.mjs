// build_logo.mjs — the site's mark: four cubes (tray 74-25) with the light triangles in the outer
// corners, in the colors of the 3D-printed set. Each cube shows a sliver of its darker side along
// the bottom, so the mark reads as cubes rather than tiles. The face geometry (light triangle inside
// a 1.7 mm rim, long side on the diagonal) comes from cubeface.js, so it matches every other cube.
//
//   site/img/mark.svg            the mark on its own, clear background (page headers, README)
//   site/favicon.svg             the mark on a navy tile, so it holds up in light and dark tabs
//   the page headers and footers the inline <svg class="mark"> in every page is replaced in place
//   --png also writes the bitmap icons (ICONS below), through Playwright's Chromium:
//   site/favicon.ico, favicon-96x96.png, apple-touch-icon(-precomposed).png,
//   site/img/icon-192.png, icon-512.png, icon-maskable-512.png
//
// Run from the repository root:  node tools/build_logo.mjs [--png]

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseCode } from "../site/js/cubecode.js";
import { faceGeometry, PRINTED_FLAT } from "../site/js/cubeface.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The printed set's filament colors (PRINTED_FLAT in cubeface.js) and a darker shade of each for
// the cube's side. Keyed by the solid colors cubeface.js hands back.
const SIDES = { "#C0272D": "#A81F27", "#F4ECD8": "#C9CCD2", "#1E2A5A": "#173F80", "#E3B23C": "#C69A22" };
const PRINTED = Object.fromEntries(Object.keys(SIDES).map((c) => [c, { face: PRINTED_FLAT[c], side: SIDES[c] }]));
export const NAVY = "#1E2A5A";

const n = (v) => Math.round(v * 100) / 100;
const CUBE = 100, GAP = 7, RADIUS = 14, SIDE = 9; // in a cube's own units

/** The four cubes, as SVG shapes in a (2 * CUBE + GAP) square box at (x, y), scaled by k. */
function cubes(x0 = 0, y0 = 0, k = 1) {
  const { grid } = parseCode("74-25");
  let out = "";
  grid.forEach((d, i) => {
    const x = x0 + (i % 2) * (CUBE + GAP) * k, y = y0 + Math.floor(i / 2) * (CUBE + GAP) * k;
    const s = CUBE * k, top = (CUBE - SIDE) * k, r = n(RADIUS * k);
    const g = faceGeometry(d);
    const dark = PRINTED[g.base];
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${r}" fill="${dark.side}"/>`;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(top)}" rx="${r}" fill="${dark.face}"/>`;
    if (g.tri) {
      const pts = g.tri.map(([px, py]) => n(x + px * s) + "," + n(y + py * top)).join(" ");
      out += `<polygon points="${pts}" fill="${PRINTED[g.light].face}"/>`;
    }
  });
  return out;
}

const BOX = 2 * CUBE + GAP;

/** The mark with a clear background. */
export function markSVG(attrs = 'xmlns="http://www.w3.org/2000/svg"') {
  return `<svg ${attrs} viewBox="0 0 ${BOX} ${BOX}">${cubes()}</svg>`;
}

/** The mark on a navy tile. pad is the margin as a fraction of the tile; radius likewise. */
export function tileSVG({ pad = 0.1, radius = 0.22, size = 512 } = {}) {
  const p = pad * size, k = (size - 2 * p) / BOX;
  const ground = `<rect width="${size}" height="${size}"${radius ? ` rx="${n(radius * size)}"` : ""} fill="${NAVY}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${ground}${cubes(p, p, k)}</svg>`;
}

const PAGES = ["site/index.html", "site/patterns/index.html", "site/box/index.html", "site/print/index.html", "site/contribute/index.html", "site/404.html"];

function writeSVGs() {
  writeFileSync(join(ROOT, "site/img/mark.svg"), markSVG() + "\n");
  writeFileSync(join(ROOT, "site/favicon.svg"), tileSVG({ pad: 0.08, radius: 0.2 }) + "\n");
  const inline = markSVG('class="mark" aria-hidden="true"');
  for (const page of PAGES) {
    const file = join(ROOT, page);
    const html = readFileSync(file, "utf8");
    // Every copy: the header's and the footer's.
    const next = html.replace(/<svg class="mark"[\s\S]*?<\/svg>/g, inline);
    if (next === html && !html.includes(inline)) throw new Error(page + " has no <svg class=\"mark\"> to replace");
    writeFileSync(file, next);
  }
  console.log("site/img/mark.svg\nsite/favicon.svg\n" + PAGES.map((p) => p + " (header mark)").join("\n"));
}

/**
 * A .ico of uncompressed 32-bit bitmaps (BGRA plus the 1-bit AND mask). PNG entries would be
 * smaller, but some favicon fetchers and older readers only understand bitmaps.
 * images: [{ size, rgba }] with rgba straight (not premultiplied), top row first.
 */
function ico(images) {
  const entries = images.map(({ size, rgba }) => {
    const maskRow = Math.ceil(size / 32) * 4;
    const dib = Buffer.alloc(40 + size * size * 4 + maskRow * size);
    dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8);
    dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14);
    dib.writeUInt32LE(size * size * 4 + maskRow * size, 20);
    for (let y = 0; y < size; y++) {
      const row = size - 1 - y; // bitmaps run bottom-up
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4, o = 40 + (row * size + x) * 4;
        dib[o] = rgba[i + 2]; dib[o + 1] = rgba[i + 1]; dib[o + 2] = rgba[i]; dib[o + 3] = rgba[i + 3];
        if (rgba[i + 3] === 0) dib[40 + size * size * 4 + row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { size, data: dib };
  });
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((p) => p.data)]);
}

const ICONS = {
  // Browsers, search engines and link previews. Google wants a multiple of 48 px; 96 covers
  // high-density screens.
  "favicon.ico": "16, 32 and 48 px bitmaps",
  "favicon-96x96.png": 96,
  // iOS home screen; full-bleed navy because iOS rounds the corners itself. Some crawlers and
  // old iOS versions still ask for the -precomposed name.
  "apple-touch-icon.png": 180,
  "apple-touch-icon-precomposed.png": 180,
  // The web app manifest.
  "img/icon-192.png": 192,
  "img/icon-512.png": 512,
  "img/icon-maskable-512.png": 512
};

async function writePNGs() {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const uri = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const shot = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style><img width="${size}" height="${size}" src="${uri(svg)}">`);
    await page.waitForFunction(() => document.images[0].complete);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const pixels = (svg, size) => page.evaluate(async ([src, size]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, size, size);
    return Array.from(g.getImageData(0, 0, size, size).data);
  }, [uri(svg), size]);

  const fav = tileSVG({ pad: 0.08, radius: 0.2 });
  // Small sizes get a little less padding so the cubes stay as large as they can.
  const small = tileSVG({ pad: 0.04, radius: 0.16 });
  const touch = tileSVG({ pad: 0.14, radius: 0 });
  const out = {
    "favicon.ico": ico([
      { size: 16, rgba: await pixels(small, 16) },
      { size: 32, rgba: await pixels(small, 32) },
      { size: 48, rgba: await pixels(fav, 48) }
    ]),
    "favicon-96x96.png": await shot(fav, 96),
    "apple-touch-icon.png": await shot(touch, 180),
    "img/icon-192.png": await shot(fav, 192),
    "img/icon-512.png": await shot(fav, 512),
    // Maskable: full bleed, with the cubes inside the 80% safe circle.
    "img/icon-maskable-512.png": await shot(tileSVG({ pad: 0.2, radius: 0 }), 512)
  };
  out["apple-touch-icon-precomposed.png"] = out["apple-touch-icon.png"];
  await browser.close();
  for (const name of Object.keys(ICONS)) {
    writeFileSync(join(ROOT, "site", name), out[name]);
    console.log("site/" + name);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeSVGs();
  if (process.argv.includes("--png")) await writePNGs();
}
