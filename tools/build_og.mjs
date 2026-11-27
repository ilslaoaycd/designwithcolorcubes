// build_og.mjs — link-preview pictures (1200×630) for the designer and box designer pages: navy
// ground, Rubik, cream and yellow title, cubes on the right. (The other pages use photographs,
// from tools/build_og_previews.py.)
// The trays are drawn by cubeface.js in the printed set's colors (PRINTED_FLAT), like the mark
// and the per-tray previews the site Worker draws (workers/site/src/og.js).
//
//   site/img/og-designer.png
//   site/img/og-box.png         (the 1930s lid, drawn by lidart.js like the box designer)
//
// Needs Playwright with Chromium (the same as tools/render_scenes.py).
// Run from the repository root:  node tools/build_og.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeSVG, PRINTED_FLAT } from "../site/js/cubeface.js";
import { CLASSIC, shapes, lidSVG } from "../site/js/lidart.js";
import { spotCodes } from "../site/js/boxcode.js";
import { designsFor } from "../site/js/designs.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const patterns = JSON.parse(readFileSync(join(ROOT, "site/data/patterns.json"), "utf8"));
const byId = Object.fromEntries([...patterns.lid, ...patterns.presets].map((p) => [p.id, p]));
const fontURL = "data:font/woff2;base64," + readFileSync(join(ROOT, "site/fonts/rubik-latin.woff2")).toString("base64");

const tray = (code, gap = 0.05) =>
  codeSVG(code, { palette: PRINTED_FLAT, edge: false, radius: 0.04, gap, background: "#141C40" })
    .replace("<svg ", '<svg style="display:block;width:100%;height:100%" ');

function page(title, accent, sub, art) {
  return `<!DOCTYPE html><html><head><style>
@font-face { font-family: Rubik; src: url(${fontURL}) format("woff2"); font-weight: 300 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { background: #1E2A5A; font-family: Rubik; color: #F4ECD8; position: relative; }
.text { position: absolute; left: 64px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
h1 { margin: 0; font-weight: 800; font-size: 92px; line-height: 0.98; letter-spacing: -1px; }
h1 span { color: #E3B23C; display: block; }
p { margin: 34px 0 0; font-size: 34px; line-height: 1.3; font-weight: 400; max-width: 520px; }
.art { position: absolute; right: 0; top: 0; bottom: 0; width: 560px; }
.art > div { position: absolute; padding: 10px; background: #141C40; border-radius: 10px; box-shadow: 0 18px 40px rgba(0,0,0,.35); }
.band { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; display: flex; }
.band i { flex: 1; }
</style></head><body>
<div class="text"><h1>${title}<span>${accent}</span></h1><p>${sub}</p></div>
<div class="art">${art}</div>
<div class="band"><i style="background:#E5333B"></i><i style="background:#F6CF4B"></i><i style="background:#2563B8"></i><i style="background:#F4ECD8"></i></div>
</body></html>`;
}

const at = (x, y, size, rot, code) =>
  `<div style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg)">${tray(code)}</div>`;

const lidType = JSON.parse(readFileSync(join(ROOT, "site/data/lid-type.json"), "utf8"));
const lid = lidSVG(shapes(CLASSIC, spotCodes(CLASSIC, designsFor(7, 7, patterns)), lidType)).replace(/<svg ([^>]*?)width="[^"]*" height="[^"]*"/, '<svg style="display:block;width:100%;height:100%" $1');

const PAGES = {
  "og-box.png": page("Box", "designer", "Your own designs and words on the lid, for a set of any size. Download it ready to print.",
    `<div style="left:40px;top:56px;width:470px;height:470px;padding:0;background:none;transform:rotate(-3deg)">${lid}</div>`),
  "og-designer.png": page("Color Cubes", "Designer", "Lay out a tray, see it in 3D, print it and share it with a short link.",
    at(70, 95, 430, -4, byId["lid-01"].code))
};

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [file, html] of Object.entries(PAGES)) {
  await tab.setContent(html);
  await tab.evaluate(() => document.fonts.ready);
  writeFileSync(join(ROOT, "site/img", file), await tab.screenshot({ type: "png" }));
  console.log("site/img/" + file);
}
await browser.close();
