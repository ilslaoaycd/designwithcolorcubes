// Redirect Worker for every hostname that isn't the main site.
//
// Short links (colorcubes.org and www.colorcubes.org):
//   colorcubes.org/                 -> 301 https://designwithcolorcubes.org/
//   colorcubes.org/{code}           -> 302 https://designwithcolorcubes.org/designer/{readable code}
//   colorcubes.org/{bad code}       -> 302 https://designwithcolorcubes.org/designer/?invalid={code}
//   colorcubes.org/{file.ext}       -> 301 https://designwithcolorcubes.org/{file.ext} (favicon.ico, …)
//   colorcubes.org/b/{box code}?t=… -> 302 https://designwithcolorcubes.org/box/{size}/{box code}?t=…
//                                      (a box design, site/js/boxcode.js; the words stay in the query)
//
// Whole-site redirects (path and query kept):
//   designwithcolorcubes.com, www.designwithcolorcubes.com, www.designwithcolorcubes.org
//                                   -> 301 https://designwithcolorcubes.org/{path}{query}
//
// {code} may be readable (686w313-868w131-…) or compact (77RNP42…), in any case. QR codes send
// the whole URL in capitals, e.g. HTTPS://COLORCUBES.ORG/77RNP42…; parseCode handles that.
// The code format is shared with the designer: site/js/cubecode.js.

import { parseCode, toReadable } from "../../../site/js/cubecode.js";
import { SITE_ORIGIN, DESIGNER_PATH } from "../../../site/js/config.js";
import { tokenSize } from "../../../site/js/boxcode.js";

// Hostnames that mirror the main site, path for path.
const MIRROR_HOSTS = new Set([
  "designwithcolorcubes.com",
  "www.designwithcolorcubes.com",
  "www.designwithcolorcubes.org"
]);

// Browsers that have seen these hosts over HTTPS keep using HTTPS (no preload).
const HSTS = "max-age=31536000; includeSubDomains";

function redirect(location, status, cacheSeconds) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": cacheSeconds ? "public, max-age=" + cacheSeconds : "no-store",
      "Strict-Transport-Security": HSTS
    }
  });
}

/** Where a request to a mirror hostname goes, or null if the hostname is a short-link host. */
export function mirror(url) {
  if (!MIRROR_HOSTS.has(url.hostname.toLowerCase())) return null;
  return { location: SITE_ORIGIN + url.pathname + url.search, status: 301, cache: 86400 };
}

/** Where a short-link path goes: { location, status, cache? }. search is the query, kept for box links. */
export function resolve(pathname, search = "") {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch (e) {
    path = pathname;
  }
  path = path.replace(/^\/+|\/+$/g, "");

  if (path === "") return { location: SITE_ORIGIN + "/", status: 301 };
  // A box design. Its code is case-sensitive, so it goes on exactly as it came.
  const box = pathname.match(/^\/+b\/+([A-Za-z0-9_~-]+)\/*$/);
  if (box) {
    const size = tokenSize(box[1]);
    if (!size) return { location: SITE_ORIGIN + "/box/", status: 302 };
    return { location: `${SITE_ORIGIN}/box/${size.cols}x${size.rows}/${box[1]}${search}`, status: 302, cache: 86400 };
  }
  // Codes never contain a dot, so a file name (favicon.ico, apple-touch-icon.png, …) is one of
  // the main site's files.
  if (path.includes(".")) return { location: SITE_ORIGIN + "/" + path, status: 301, cache: 86400 };

  const res = parseCode(path);
  if (res.error) {
    return { location: SITE_ORIGIN + DESIGNER_PATH + "?invalid=" + encodeURIComponent(path.slice(0, 120)), status: 302 };
  }
  // Always land on the canonical readable form so the address bar is human-editable.
  return { location: SITE_ORIGIN + DESIGNER_PATH + toReadable(res.grid, res.w, res.h), status: 302, cache: 86400 };
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    const m = mirror(url);
    if (m) return redirect(m.location, m.status, m.cache);

    if (url.pathname.toLowerCase() === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Strict-Transport-Security": HSTS } });
    }
    const r = resolve(url.pathname, url.search);
    return redirect(r.location, r.status, r.cache);
  }
};
