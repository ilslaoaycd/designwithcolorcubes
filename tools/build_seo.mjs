// build_seo.mjs — the parts of the pages that search engines read, kept in step with the data.
//
//   node tools/build_seo.mjs
//
// From site/data/patterns.json (the one place the designs are counted):
//   site/patterns/index.html   the design count in its title, description, preview tags and JSON-LD
//                              (with an ItemList of the first designs), the count shown under the
//                              heading, and the designs it opens on (7 × 7, the lid's twelve first) as
//                              plain HTML between the "designs" markers, so the list is there
//                              without JavaScript. patterns-page.js replaces it with the filterable
//                              grid, drawn the same way.
//   site/downloads/index.html, site/agents.md, site/llms.txt   the same count where they give it
// From the pages themselves:
//   site/sitemap.xml           every page that isn't noindex, at its canonical URL, with its preview
//                              picture and the date it last changed (in git, or today if it has
//                              uncommitted changes)
// Then every JSON-LD block on every page is parsed, and the script stops if one doesn't.
// MIT licensed (see LICENSE).

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { SITE_ORIGIN, DESIGNER_PATH } from "../site/js/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const at = (...p) => join(SITE, ...p);
const read = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function write(f, text) {
  const before = existsSync(f) ? read(f) : null;
  if (before === text) return;
  writeFileSync(f, text);
  console.log("wrote", relative(ROOT, f).replace(/\\/g, "/"));
}
function replaceAll(text, re, to, file) {
  if (!re.test(text)) throw new Error(`${file}: nothing matches ${re}`);
  return text.replace(re, to);
}

// ---------------------------------------------------------------------------------------------
// The designs

const data = JSON.parse(read(at("data/patterns.json")));
const TOTAL = data.lid.length + data.presets.length;
// The patterns page opens on 7 × 7 (DEFAULT_SIZE in patterns-page.js): one group, the lid's twelve
// first, then the other 7 × 7 designs.
const DEFAULT_SIZE = "7x7";
const groups = [
  ["7 × 7", [...data.lid, ...data.presets.filter((p) => `${p.w}x${p.h}` === DEFAULT_SIZE)]]
];
const opening = groups.flatMap(([, list]) => list);
for (const p of [...data.lid, ...data.presets]) {
  if (!existsSync(at("downloads/patterns/designs", p.id + ".svg"))) throw new Error(`no picture for ${p.id}`);
}

const alt = (p) => `${p.name}, a ${p.w} by ${p.h} Color Cubes design`;
// The same card as patterns-page.js, with the design's picture as an image in place of the drawing.
const card = (p) => `<li class="pat-card" data-code="${p.code}" data-id="${p.id}">`
  + `<button type="button" class="pat-look" data-show="${p.id}" aria-label="${esc(p.name)}, ${p.w} by ${p.h}: a larger view">`
  + `<img class="ph" src="/downloads/patterns/designs/${p.id}.svg" alt="${esc(alt(p))}" width="168" height="168" loading="lazy" decoding="async"></button>`
  + `<div class="pat-name"><b title="${esc(p.name)}">${esc(p.name)}</b> <span>${p.w} × ${p.h}</span></div>`
  + `<div class="pat-acts"><a href="${DESIGNER_PATH}${p.code}">Open</a></div></li>`;
const listHTML = groups.map(([title, list]) =>
  `<h2 class="pat-group">${title} <span>${list.length}</span></h2>\n<ul class="pat-grid">\n${list.map(card).join("\n")}\n</ul>`).join("\n");

{
  const f = at("patterns/index.html");
  let s = read(f);
  s = replaceAll(s, /<title>[^<]*<\/title>/, `<title>${TOTAL} Color Cubes patterns · Design with Color Cubes</title>`, f);
  s = replaceAll(s, /\d+ designs for Color Cubes:/g, `${TOTAL} designs for Color Cubes:`, f);
  s = replaceAll(s, /\d+ Color Cubes patterns/g, `${TOTAL} Color Cubes patterns`, f);
  s = replaceAll(s, /(<p class="pat-count" id="count"[^>]*>)[^<]*/, `$1${opening.length} designs`, f);
  s = replaceAll(s, /(<div id="groups">)[\s\S]*?(<\/div>\n\s*<noscript>)/,
    `$1<!-- designs: tools/build_seo.mjs -->\n${listHTML}\n<!-- /designs -->$2`, f);

  // JSON-LD: the collection's size, and its first designs as an ItemList.
  s = s.replace(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/, (m, json) => {
    const ld = JSON.parse(json);
    const page = ld["@graph"].find((n) => n["@type"] === "CollectionPage");
    page.mainEntity = {
      "@type": "ItemList",
      "name": "Color Cubes designs",
      "numberOfItems": TOTAL,
      "itemListOrder": "https://schema.org/ItemListUnordered",
      "itemListElement": opening.slice(0, 50).map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "name": `${p.name}, ${p.w} × ${p.h}`,
        "url": SITE_ORIGIN + DESIGNER_PATH + p.code,
        "image": `${SITE_ORIGIN}/downloads/patterns/designs/${p.id}.svg`
      }))
    };
    return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 1)}\n</script>`;
  });
  write(f, s);
}

// The count anywhere else it's given.
for (const [file, re, to] of [
  ["downloads/index.html", /all \d+ designs/g, `all ${TOTAL} designs`],
  ["agents.md", /\d+ ready-made designs/g, `${TOTAL} ready-made designs`],
  ["llms.txt", /\d+ ready-made designs/g, `${TOTAL} ready-made designs`]
]) write(at(file), replaceAll(read(at(file)), re, to, file));

// ---------------------------------------------------------------------------------------------
// The sitemap

function pages(dir = SITE) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const index = join(dir, e.name, "index.html");
      if (existsSync(index)) out.push(index);
    }
  }
  return [join(SITE, "index.html"), ...out.sort()];
}
const today = new Date().toISOString().slice(0, 10);
function lastChanged(f) {
  const rel = relative(ROOT, f);
  const dirty = execFileSync("git", ["status", "--porcelain", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) return today;
  return execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim() || today;
}
const entries = [];
for (const f of pages()) {
  const s = read(f);
  if (/<meta name="robots" content="[^"]*noindex/.test(s)) continue;
  const canonical = (s.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (!canonical) throw new Error(`${f}: no canonical URL`);
  const image = (s.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  entries.push({ canonical, image, lastmod: lastChanged(f) });
}
// The order people find them in: home, then the pages by path.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `  <url>
    <loc>${e.canonical}</loc>
    <lastmod>${e.lastmod}</lastmod>${e.image ? `
    <image:image><image:loc>${e.image}</image:loc></image:image>` : ""}
  </url>`).join("\n")}
</urlset>
`;
write(at("sitemap.xml"), xml);

// ---------------------------------------------------------------------------------------------
// Every JSON-LD block must parse.

let blocks = 0;
for (const f of [...pages(), at("404.html")]) {
  for (const m of read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let ld;
    try { ld = JSON.parse(m[1]); } catch (e) { throw new Error(`${relative(ROOT, f)}: JSON-LD doesn't parse: ${e.message}`); }
    if (ld["@context"] !== "https://schema.org") throw new Error(`${relative(ROOT, f)}: JSON-LD without the schema.org context`);
    blocks++;
  }
}
console.log("%d designs, %d on the opening view; %d pages in the sitemap; %d JSON-LD blocks parse", TOTAL, opening.length, entries.length, blocks);
