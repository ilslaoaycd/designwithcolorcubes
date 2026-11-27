// Main site Worker for designwithcolorcubes.org.
//
// Everything in site/ is served as a static file without running this script. It runs only for
// /designer/*, /box/* and /print/* (see run_worker_first in wrangler.jsonc):
//
//   /box/{size}[/{box code}]     the box designer page, which reads the design from the address
//   /print/{size}[/{box code}]   the colors-and-files page, likewise
//   /designer/{tray code}       the one designer page, which reads the code from the address. Its
//                               title and link-preview tags are rewritten to describe that tray.
//   /designer/og/{code}.png     the tray's link-preview picture (og.js), cached at the edge
//   /designer/canvas, …         the designer page as it is
//   /print/f/{sha256}/{name}.3mf a file the print page made, handed to a slicer: the page POSTs the
//                               3MF here, it's kept in the edge cache for a day under its hash,
//                               and the slicer's "open" link GETs it

import { parseCode, toReadable } from "../../../site/js/cubecode.js";
import { SITE_ORIGIN, DESIGNER_PATH } from "../../../site/js/config.js";
import { trayPNG, WIDTH, HEIGHT } from "./og.js";

const OG_PREFIX = DESIGNER_PATH + "og/";

/** Title and preview tags for a tray, or null when the path isn't a tray code. */
export function trayMeta(pathname) {
  let raw = pathname.slice(DESIGNER_PATH.length);
  try { raw = decodeURIComponent(raw); } catch (e) { /* keep it as it is */ }
  raw = raw.replace(/\/+$/, "");
  if (!raw || raw.toLowerCase() === "canvas") return null;
  const p = parseCode(raw);
  if (p.error) return null;
  const code = toReadable(p.grid, p.w, p.h);
  const size = `${p.w}×${p.h}`;
  return {
    title: `A ${size} Color Cubes design`,
    description: `A ${size} tray of Color Cubes, the 1930s pattern toy. Open it in the designer to change it, see it in 3D, print it, or start your own.`,
    url: SITE_ORIGIN + DESIGNER_PATH + code,
    image: SITE_ORIGIN + OG_PREFIX + code + ".png",
    alt: `A ${size} pattern of red, white, blue and yellow cubes.`
  };
}

function setContent(value) {
  return { element(el) { el.setAttribute("content", value); } };
}

/** The page with its robots tag set to noindex, follow (in the HTML, for crawlers that don't run scripts). */
function noindex(page) {
  if (typeof HTMLRewriter === "undefined" || !page.ok) return page;
  return new HTMLRewriter().on('meta[name="robots"]', setContent("noindex, follow")).transform(page);
}

async function previewImage(request, url, ctx) {
  const name = decodeURIComponent(url.pathname.slice(OG_PREFIX.length)).replace(/\.png$/i, "");
  const p = parseCode(name);
  if (p.error) return new Response("Not a tray code", { status: 404 });

  // Every spelling of a tray shares one cache entry, under its readable code.
  const key = new Request(SITE_ORIGIN + OG_PREFIX + toReadable(p.grid, p.w, p.h) + ".png");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const res = new Response(await trayPNG(p.grid, p.w, p.h), {
    headers: {
      "Content-Type": "image/png",
      // A code always draws the same picture.
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
  if (cache) {
    const put = cache.put(key, res.clone());
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return request.method === "HEAD" ? new Response(null, res) : res;
}

// ---------------------------------------------------------------------------------------------
// Files for slicers. The print page makes every file in the browser; to open one in a slicer, which
// downloads it from a link, the page sends it here first. Nothing is built or stored here: the
// bytes must hash to the name, look like a 3MF, and stay in this data center's cache for a day,
// which is all a slicer opened a moment later needs. A miss says so and points back to the page.

const FILE_PREFIX = "/print/f/";
const MAX_FILE = 8 * 1024 * 1024;
const FILE_PATH = /^\/print\/f\/([0-9a-f]{64})\/([a-z0-9][a-z0-9.-]{0,80}\.3mf)$/;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Bytes that start like a zip and name a 3MF model part: enough to keep this to 3MF files. Only
    the zip's directory at the end is read (and the first few headers), to stay well inside the
    free plan's CPU time. */
function looks3MF(bytes) {
  if (bytes.length < 30 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) return false;
  const needle = [..."3D/3dmodel.model"].map((c) => c.charCodeAt(0));
  const tail = Math.max(0, bytes.length - 4096);
  outer: for (let i = 0; i + needle.length <= bytes.length; i = i === 2048 && tail > 2048 ? tail : i + 1) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export async function slicerFile(request, url, ctx) {
  const m = url.pathname.match(FILE_PATH);
  if (!m) return new Response("Not a file address", { status: 404 });
  const [, hash, name] = m;
  const key = new Request(SITE_ORIGIN + FILE_PREFIX + hash + "/" + name);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (request.method === "POST") {
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_FILE) return new Response("Too big", { status: 413 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > MAX_FILE) return new Response("Too big", { status: 413 });
    if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== hash) return new Response("The file doesn't match its name", { status: 400 });
    if (!looks3MF(bytes)) return new Response("Not a 3MF file", { status: 415 });
    const res = new Response(bytes, {
      headers: {
        "Content-Type": "model/3mf",
        // Cura reads the type from here; the others from the address.
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, max-age=86400",
        "X-Robots-Tag": "noindex"
      }
    });
    if (cache) {
      const put = cache.put(key, res);
      if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
    }
    return new Response(null, { status: 204 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
  const hit = cache ? await cache.match(key) : null;
  if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
  return new Response("This file was made for a slicer and has expired. Make it again at " + SITE_ORIGIN + "/print/\n", {
    status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" }
  });
}

/** Pages that read their state from the rest of the address: the prefix and the page they serve. */
const APP_PAGES = ["/box/", "/print/"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(FILE_PREFIX)) return slicerFile(request, url, ctx);

    const app = APP_PAGES.find((p) => url.pathname.startsWith(p));
    if (app) {
      const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      if (last.includes(".")) return env.ASSETS.fetch(request);
      const page = await env.ASSETS.fetch(new Request(new URL(app, url), request));
      // /box/7x7, /box/9x6/{box code} and the like are the one page, which canonicalizes to /box/:
      // keep them out of search results so it isn't listed twice. (/print/ is noindex already.)
      return url.pathname === app ? page : noindex(page);
    }

    if (url.pathname.startsWith(OG_PREFIX)) return previewImage(request, url, ctx);

    const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    // A real file under /designer/ (anything with an extension) is served as it is.
    if (last.includes(".")) return env.ASSETS.fetch(request);

    // Any other /designer/… path is the designer page. The address bar keeps the tray code.
    const page = await env.ASSETS.fetch(new Request(new URL(DESIGNER_PATH, url), request));
    const meta = trayMeta(url.pathname);
    if (!meta) return url.pathname === DESIGNER_PATH ? page : noindex(page); // /designer/canvas and the like
    if (typeof HTMLRewriter === "undefined" || !page.ok) return page;

    // A shared tray: describe it in the page title and the link-preview tags. These pages stay
    // out of search results (there is one per possible tray); the designer itself is indexed.
    return new HTMLRewriter()
      .on("title", { element(el) { el.setInnerContent(meta.title + " · Design with Color Cubes"); } })
      .on('meta[name="description"]', setContent(meta.description))
      .on('meta[name="robots"]', setContent("noindex, follow"))
      .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", meta.url); } })
      .on('meta[property="og:title"]', setContent(meta.title))
      .on('meta[property="og:description"]', setContent(meta.description))
      .on('meta[property="og:url"]', setContent(meta.url))
      .on('meta[property="og:image"]', setContent(meta.image))
      .on('meta[property="og:image:width"]', setContent(String(WIDTH)))
      .on('meta[property="og:image:height"]', setContent(String(HEIGHT)))
      .on('meta[property="og:image:alt"]', setContent(meta.alt))
      .on('meta[name="twitter:title"]', setContent(meta.title))
      .on('meta[name="twitter:description"]', setContent(meta.description))
      .on('meta[name="twitter:image"]', setContent(meta.image))
      .on('meta[name="twitter:image:alt"]', setContent(meta.alt))
      .transform(page);
  }
};
