import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync as fsExists } from "node:fs";
const require_fs = () => ({ existsSync: fsExists });
import worker from "../workers/site/src/index.js";
import { parseCode, toReadable } from "../site/js/cubecode.js";
import { faceShapes, faceGeometry, traySVG, codeSVG, CUBE } from "../site/js/cubeface.js";

// A stand-in for the static files binding: it reports which path the Worker asked for.
const env = { ASSETS: { fetch: async (req) => new Response(new URL(req.url).pathname) } };
const served = async (path) => (await worker.fetch(new Request("https://designwithcolorcubes.org" + path), env)).text();

test("any tray code or the canvas under /designer/ gets the designer page", async () => {
  assert.equal(await served("/designer/"), "/designer/");
  assert.equal(await served("/designer/686w313-868w131"), "/designer/");
  assert.equal(await served("/designer/77RNP42PXF425QXNXI6TDZEJNCRAEPDI013X"), "/designer/");
  assert.equal(await served("/designer/canvas"), "/designer/");
});

test("any address under /box/ and /print/ gets that page; their files are served as themselves", async () => {
  assert.equal(await served("/box/7x5"), "/box/");
  assert.equal(await served("/box/7x5/Km0JEkmAUAA"), "/box/");
  assert.equal(await served("/print/9x9/Km0JEkmAUAA"), "/print/");
  assert.equal(await served("/box/box.js"), "/box/box.js");
});

test("a real file under /designer/ is served as itself", async () => {
  assert.equal(await served("/designer/app.js"), "/designer/app.js");
});

const patterns = JSON.parse(readFileSync(new URL("../site/data/patterns.json", import.meta.url), "utf8"));

test("every lid design is a valid 7x7 tray in canonical form", () => {
  assert.equal(patterns.lid.length, 12);
  const ids = new Set();
  for (const p of patterns.lid) {
    const parsed = parseCode(p.code);
    assert.equal(parsed.error, undefined, p.id);
    assert.equal(parsed.w, 7, p.id);
    assert.equal(parsed.h, 7, p.id);
    assert.equal(parsed.filled, 0, p.id);
    assert.equal(toReadable(parsed.grid, 7, 7), p.code, p.id);
    ids.add(p.id);
  }
  assert.equal(ids.size, 12);
});

test("no preset only turns around its center (pinwheels read as a swastika)", async () => {
  const { mirrorLR, mirrorTB, turnCW } = await import("../tools/patterns-src.mjs");
  // The few Isaac approved are marked { turns: true } in tools/presets.mjs; a mark must be true.
  const { PRESETS } = await import("../tools/presets.mjs");
  const approved = new Set(PRESETS.filter((p) => p[2]?.turns).map((p) => p[1]));
  const corner = (d, c) => (d < 8 ? 4 : 8) + c;
  const transpose = (d) => (d >= 4 ? corner(d, [0, 3, 2, 1][(d - 4) % 4]) : d);
  for (const p of patterns.presets) {
    const { grid, w, h } = parseCode(p.code);
    const at = (r, c) => grid[r * w + c];
    const every = (f) => grid.every((d, i) => f(Math.floor(i / w), i % w) === d);
    const mirrored = every((r, c) => mirrorLR(at(r, w - 1 - c))) || every((r, c) => mirrorTB(at(h - 1 - r, c))) ||
      (w === h && every((r, c) => transpose(at(c, r)))) ||
      (w === h && every((r, c) => transpose(mirrorLR(mirrorTB(at(w - 1 - c, h - 1 - r))))));
    const turns = (w === h && every((r, c) => turnCW(at(w - 1 - c, r)))) || every((r, c) => turnCW(turnCW(at(h - 1 - r, w - 1 - c))));
    if (approved.has(p.code)) assert.ok(turns && !mirrored, `${p.id} is marked { turns: true } but doesn't only turn`);
    else assert.ok(mirrored || !turns, `${p.id} turns around its center without a mirror line`);
  }
});

test("no two presets of one size are the same design turned or mirrored", async () => {
  const { mirrorLR, turnCW } = await import("../tools/patterns-src.mjs");
  const turn = (g, n) => g.map((_, i) => turnCW(g[(n - 1 - (i % n)) * n + Math.floor(i / n)]));
  const mirror = (g, n) => g.map((_, i) => mirrorLR(g[i - (i % n) + n - 1 - (i % n)]));
  const seen = new Map();
  for (const p of patterns.presets) {
    const { grid, w, h } = parseCode(p.code);
    let looks = [grid.join()];
    if (w === h) {
      looks = [];
      let g = grid;
      for (let i = 0; i < 4; i++) { looks.push(g.join(), mirror(g, w).join()); g = turn(g, w); }
    }
    const key = `${w}x${h}:` + looks.sort()[0];
    assert.ok(!seen.has(key), `${p.id} is ${seen.get(key)} turned or mirrored`);
    seen.set(key, p.id);
  }
});

test("presets go from the smallest tray to the biggest, with unique ids", () => {
  const cubes = patterns.presets.map((p) => p.w * p.h);
  assert.deepEqual(cubes, [...cubes].sort((a, b) => a - b));
  assert.equal(new Set(patterns.presets.map((p) => p.id)).size, patterns.presets.length);
});

test("faces draw a light triangle only when split", () => {
  for (let d = 0; d < 12; d++) {
    const svg = faceShapes(d, 0, 0, 100, { edge: false });
    assert.equal((svg.match(/<rect/g) || []).length, 1);
    assert.equal((svg.match(/<polygon/g) || []).length, d < 4 ? 0 : 1);
  }
});

test("the light triangle sits inside a 1.7 mm rim with its long side on the true diagonal", () => {
  const m = 100 * 1.7 / 27.5;
  for (let d = 4; d < 12; d++) {
    const { tri } = faceGeometry(d);
    const pts = tri.map(([x, y]) => [x * 100, y * 100]);
    // The square corner is m in from both edges it touches.
    const [cx, cy] = pts[0];
    assert.ok(Math.abs(Math.min(cx, 100 - cx) - m) < 1e-9 && Math.abs(Math.min(cy, 100 - cy) - m) < 1e-9, `look ${d}`);
    // The two sharp corners lie on the diagonal that runs between the dark corner's neighbours.
    const corner = d % 4; // 0 TL, 1 TR, 2 BR, 3 BL
    for (const [x, y] of pts.slice(1)) {
      const onDiag = corner % 2 === 0 ? x + y : x - y + 100;
      assert.ok(Math.abs(onDiag - 100) < 1e-9, `look ${d}: (${x}, ${y}) is off the diagonal`);
    }
  }
  // Blue corner top-left: the yellow triangle is bottom-right.
  assert.match(faceShapes(4, 0, 0, 100), /points="93\.818,93\.818 93\.818,6\.182 6\.182,93\.818"/);
});

test("a tray drawing has one face per cube, and a bad code draws nothing", () => {
  const svg = traySVG(parseCode("wbwb-bwbw").grid, 4, 2, { edge: false });
  assert.equal((svg.match(/<rect/g) || []).length, 8);
  assert.equal(codeSVG("not a code!"), "");
});

test("the cube's opposite faces are the color pairs that swap when a tray is flipped", () => {
  assert.deepEqual([CUBE.front, CUBE.back].sort(), [0, 1]); // red and white
  assert.deepEqual([CUBE.top, CUBE.bottom].sort(), [2, 3]); // blue and yellow
  assert.ok(CUBE.right >= 4 && CUBE.right < 8);              // blue/yellow split
  assert.ok(CUBE.left >= 8);                                 // red/white split
});

test("every local file the pages link to exists", async () => {
  const { existsSync } = await import("node:fs");
  const pages = ["index.html", "patterns/index.html", "designer/index.html", "box/index.html", "print/index.html", "contribute/index.html", "downloads/index.html", "history/index.html", "404.html"];
  const missing = [];
  for (const page of pages) {
    const html = readFileSync(new URL("../site/" + page, import.meta.url), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)].map((m) => m[1]);
    const sets = [...html.matchAll(/(?:srcset|imagesrcset)="([^"]+)"/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+/)[0]));
    for (const ref of [...refs, ...sets]) {
      if (ref === "/" || ref.endsWith("/")) continue;
      // A design link is a page the Worker serves for any tray code that parses.
      if (ref.startsWith("/designer/") && parseCode(ref.slice("/designer/".length))) continue;
      // So is any set size under /box/ and /print/ (see the test above).
      if (/^\/(box|print)\/\d+x\d+(\/|$)/.test(ref)) continue;
      if (!existsSync(new URL("../site" + ref, import.meta.url))) missing.push(page + ": " + ref);
    }
  }
  assert.deepEqual(missing, []);
});

// Link previews for shared trays.
import { trayMeta } from "../workers/site/src/index.js";
import { trayPNG, WIDTH, HEIGHT } from "../workers/site/src/og.js";

test("a tray address gets its own title and preview picture; other designer paths don't", () => {
  const m = trayMeta("/designer/WBWB-bwbw");
  assert.equal(m.title, "A 4×2 Color Cubes design");
  assert.equal(m.url, "https://designwithcolorcubes.org/designer/wbwb-bwbw");
  assert.equal(m.image, "https://designwithcolorcubes.org/designer/og/wbwb-bwbw.png");
  assert.equal(trayMeta("/designer/"), null);
  assert.equal(trayMeta("/designer/canvas"), null);
  assert.equal(trayMeta("/designer/not-a-code!"), null);
});

test("the preview picture is a 1200×630 palette PNG, and a bad code is a 404", async () => {
  const p = parseCode("74-25");
  const png = await trayPNG(p.grid, p.w, p.h);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const v = new DataView(png.buffer, png.byteOffset);
  assert.equal(v.getUint32(16), WIDTH);
  assert.equal(v.getUint32(20), HEIGHT);
  assert.equal(png[25], 3); // palette
  const res = await worker.fetch(new Request("https://designwithcolorcubes.org/designer/og/74-25.png"), env);
  assert.equal(res.headers.get("Content-Type"), "image/png");
  assert.equal((await worker.fetch(new Request("https://designwithcolorcubes.org/designer/og/nope!.png"), env)).status, 404);
});

test("the WebAssembly PNG decodes to exactly the pixels og.js's reference rows describe", async () => {
  const { inflateSync, crc32 } = await import("node:zlib");
  const { rows, PALETTE } = await import("../workers/site/src/og.js");
  const looks = "wryb12345678";
  const random = (n) => Array.from({ length: n }, () => Array.from({ length: n }, () => looks[Math.floor(Math.random() * 12)]).join("")).join("-");
  const codes = ["74-25", "wbwb-bwbw-wbwb", patterns.lid[0].code, patterns.lid[3].code, random(3), random(7), random(10)];
  for (const code of codes) {
    const p = parseCode(code);
    const png = Buffer.from(trayPNG(p.grid, p.w, p.h));
    // Walk the chunks, checking each one's CRC.
    const chunks = {};
    for (let at = 8; at < png.length;) {
      const len = png.readUInt32BE(at), type = png.toString("latin1", at + 4, at + 8);
      const data = png.subarray(at + 8, at + 8 + len);
      assert.equal(png.readUInt32BE(at + 8 + len), crc32(png.subarray(at + 4, at + 8 + len)), `${code} ${type} CRC`);
      chunks[type] = data;
      at += 12 + len;
    }
    assert.deepEqual([...chunks.PLTE], PALETTE.flat(), code);
    const raw = inflateSync(chunks.IDAT); // throws on a bad stream or Adler-32
    assert.equal(raw.length, (WIDTH + 1) * HEIGHT, code);
    const runs = rows(p.grid, p.w, p.h);
    for (let y = 0; y < HEIGHT; y++) {
      const row = raw.subarray(y * (WIDTH + 1), (y + 1) * (WIDTH + 1));
      const expect = Buffer.alloc(WIDTH + 1);
      for (let i = 0, x = 1; i < runs[y].length; i += 2) { expect.fill(runs[y][i], x, x + runs[y][i + 1]); x += runs[y][i + 1]; }
      if (!row.equals(expect)) assert.fail(`${code}: row ${y} differs from the reference`);
    }
  }
});

test("agents.md only points at designs that parse and files that exist", async () => {
  const { existsSync } = await import("node:fs");
  const md = readFileSync(new URL("../site/agents.md", import.meta.url), "utf8");
  const designs = [...md.matchAll(/designwithcolorcubes\.org\/designer\/([0-9a-z-]+)(?=[\s)`]|$)/gi)].map((m) => m[1]);
  assert.ok(designs.length > 0);
  for (const code of designs) assert.equal(parseCode(code).error, undefined, code);
  for (const m of md.matchAll(/colorcubes\.org\/([0-9A-Z]{6,})\b/g)) assert.equal(parseCode(m[1]).error, undefined, m[1]);
  const files = [...md.matchAll(/`((?:patterns\/)?[\w.-]+\.(?:zip|svg))`/g)].map((m) => m[1]);
  assert.ok(files.length >= 3);
  const missing = files.filter((f) => !existsSync(new URL("../site/downloads/" + f, import.meta.url)));
  assert.deepEqual(missing, []);
  for (const page of ["/data/patterns.json", "/sitemap.xml", "/designer/index.html", "/patterns/index.html"]) {
    assert.ok(existsSync(new URL("../site" + page, import.meta.url)), page);
  }
});

test("the scripts and stylesheets of Worker-routed pages are served as static files", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const conf = readFileSync(new URL("../workers/site/wrangler.jsonc", import.meta.url), "utf8");
  const rules = JSON.parse(conf.match(/"run_worker_first":\s*(\[[^\]]*\])/)[1]);
  for (const dir of ["designer", "box", "print"]) {
    assert.ok(rules.includes(`/${dir}/*`), dir);
    const skipped = rules.filter((r) => r.startsWith(`!/${dir}/`)).map((r) => r.match(/\*(\.\w+)$/)?.[1]);
    for (const f of readdirSync(new URL(`../site/${dir}/`, import.meta.url))) {
      if (f === "index.html") continue;
      assert.ok(skipped.includes(f.slice(f.lastIndexOf("."))), `site/${dir}/${f} would run the Worker`);
    }
  }
});

test("nothing the site serves still names the old non-commercial license", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { inflateRawSync } = await import("node:zlib");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../site/", import.meta.url)); // a real path on Windows too
  const old = /BY-NC-SA|by-nc-sa|NonCommercial/;
  const bad = [];
  // The 3MF's model file, read straight from its zip (local headers; no data descriptors).
  const modelText = (buf) => {
    let out = "";
    for (let at = 0; buf.readUInt32LE(at) === 0x04034b50;) {
      const method = buf.readUInt16LE(at + 8), size = buf.readUInt32LE(at + 18);
      const nameLen = buf.readUInt16LE(at + 26), extra = buf.readUInt16LE(at + 28);
      const name = buf.toString("utf8", at + 30, at + 30 + nameLen);
      const data = buf.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
      if (name.endsWith(".model")) out += (method === 8 ? inflateRawSync(data) : data).toString("utf8");
      at += 30 + nameLen + extra + size;
    }
    return out;
  };
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = dir + f;
      if (statSync(p).isDirectory()) { if (f !== "vendor") walk(p + "/"); continue; }
      const ext = f.slice(f.lastIndexOf("."));
      if ([".html", ".md", ".txt", ".js", ".svg", ".json", ".obj", ".mtl"].includes(ext)) {
        if (old.test(readFileSync(p, "utf8"))) bad.push(p.slice(root.length));
      } else if (ext === ".3mf" && !p.includes("/projects/")) {
        if (old.test(modelText(readFileSync(p)))) bad.push(p.slice(root.length));
      }
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});

test("every file and thumbnail on the Files page exists, and each section has a Download all", () => {
  const { existsSync } = require_fs();
  const data = JSON.parse(readFileSync(new URL("../site/data/downloads.json", import.meta.url), "utf8"));
  const page = readFileSync(new URL("../site/downloads/index.html", import.meta.url), "utf8");
  const missing = [];
  for (const s of data.sections) {
    assert.ok(page.includes(`data-all="${s.id}"`), `${s.id} has Download all`);
    for (const f of s.files) if (!existsSync(new URL("../site" + f.path, import.meta.url))) missing.push(f.path);
  }
  for (const m of page.matchAll(/<img src="(\/[^"]+)"/g)) if (!existsSync(new URL("../site" + m[1], import.meta.url))) missing.push(m[1]);
  assert.deepEqual(missing, []);
  assert.ok(data.sections.reduce((n, s) => n + s.files.length, 0) > 1000);
  // Pinwheel scenes stay out of the pictures (the approved quilt-block presets are designs, not scenes).
  assert.ok(!/\/downloads\/(?!patterns\/)[^"]*pinwheel/i.test(page), "no pinwheel scenes in the gallery");
});

test("a file for a slicer is kept under its hash, and only if it is that 3MF", async () => {
  const P = await import("../site/js/print3d.js");
  const { createHash } = await import("node:crypto");
  // A stand-in for the edge cache.
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } } };
  try {
    const bytes = await P.to3MF([{ name: "Tray", parts: P.trayParts(3, 3) }], { Title: "Tray" });
    const hash = createHash("sha256").update(bytes).digest("hex");
    const at = (h, name = "color-cubes-tray-3x3.3mf") => "https://designwithcolorcubes.org/print/f/" + h + "/" + name;
    const call = (u, init) => worker.fetch(new Request(u, init), env, { waitUntil: () => {} });
    assert.equal((await call(at(hash))).status, 404, "nothing there yet");
    assert.equal((await call(at("0".repeat(64)), { method: "POST", body: bytes })).status, 400, "hash must match");
    const junk = new TextEncoder().encode("not a 3mf");
    assert.equal((await call(at(createHash("sha256").update(junk).digest("hex")), { method: "POST", body: junk })).status, 415);
    assert.equal((await call(at(hash), { method: "POST", body: bytes })).status, 204);
    const got = await call(at(hash));
    assert.equal(got.status, 200);
    assert.match(got.headers.get("content-disposition"), /attachment; filename="color-cubes-tray-3x3\.3mf"/);
    assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes);
    assert.equal((await call(at(hash, "x.stl"))).status, 404, "3MF only");
  } finally {
    delete globalThis.caches;
  }
});

test("the patterns page, Files page and sitemap agree with the data (tools/build_seo.mjs)", () => {
  const read = (p) => readFileSync(new URL("../site/" + p, import.meta.url), "utf8");
  const data = JSON.parse(read("data/patterns.json"));
  const total = data.lid.length + data.presets.length;
  const page = read("patterns/index.html");
  for (const m of page.matchAll(/(\d+) (?:designs for Color Cubes|Color Cubes patterns)/g)) assert.equal(Number(m[1]), total, m[0]);
  assert.match(page, new RegExp(`"numberOfItems": ${total}`));
  const opening = data.lid.length + data.presets.filter((p) => p.w === 7 && p.h === 7).length;
  assert.equal((page.match(/<li class="pat-card"/g) || []).length, opening, "the opening designs are in the HTML");
  assert.match(read("downloads/index.html"), new RegExp(`all ${total} designs`));
  // The sitemap lists every page that may be indexed, and none that may not.
  const sitemap = read("sitemap.xml");
  for (const p of ["", "box/", "contribute/", "designer/", "downloads/", "history/", "patterns/"]) assert.ok(sitemap.includes(`<loc>https://designwithcolorcubes.org/${p}</loc>`), p);
  assert.ok(!sitemap.includes("/print/"));
});

test("only the home page has a hero: every other page's header is just the bar", async () => {
  const { readdirSync, existsSync } = await import("node:fs");
  const site = new URL("../site/", import.meta.url);
  const pages = ["404.html", ...readdirSync(site, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(new URL(e.name + "/index.html", site)))
    .map((e) => e.name + "/index.html")];
  const css = readFileSync(new URL("css/site.css", site), "utf8");
  assert.ok(!/\.page-top\b/.test(css), "site.css has no hero (.page-top) rules to reuse");
  for (const page of pages) {
    const html = readFileSync(new URL(page, site), "utf8");
    assert.ok(!/\bpage-top\b/.test(html), `${page} uses the old hero class`);
    const header = /<header class="band[^"]*">([\s\S]*?)<\/header>/.exec(html);
    if (!header) continue; // the designer has its own toolbar
    const rest = header[1].replace(/<div class="bar">[\s\S]*?<\/nav>\s*<\/div>/, "").trim();
    assert.equal(rest, "", `${page}: the header holds more than the bar (a heading, picture or buttons belong on the page, under it)`);
  }
});
