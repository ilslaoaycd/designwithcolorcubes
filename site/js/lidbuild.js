// lidbuild.js — a lid's closed parts (print3d.js lidParts), made in lid-worker.js so the page stays
// responsive while they're built, or here on the main thread if the browser can't run module
// workers. Shared by the print page and the box designer. MIT licensed.

import { shapes, artRegions } from "./lidart.js";
import { lidParts, Mesh } from "./print3d.js";

let worker = null, sentType = null, next = 0;
const waiting = new Map();

function here(spec, codes, type) {
  return lidParts(spec.cols, spec.rows, artRegions(shapes(spec, codes, type)), { wallColor: spec.walls });
}

/**
 * The lid's parts for a box design: spec (boxcode.js), codes (BC.spotCodes) and type
 * (lid-type.json). Resolves to print3d.js Meshes, the same as lidParts makes; from the worker each
 * also has view, its triangles ready for three.js (see lid-worker.js), which box3d.js uses.
 */
export function buildLid(spec, codes, type) {
  if (!worker && worker !== false) {
    try {
      worker = new Worker(new URL("./lid-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (e) => {
        const w = waiting.get(e.data.id);
        if (!w) return;
        waiting.delete(e.data.id);
        if (e.data.error) w.reject(new Error(e.data.error));
        else w.resolve(e.data.parts.map((p) => Object.assign(new Mesh(p.name, p.color), { v: p.v, t: p.t, view: p.view })));
      };
      worker.onerror = () => {
        // The worker didn't start (no module workers): build everything here from now on.
        worker = false;
        for (const w of waiting.values()) w.fallback();
        waiting.clear();
      };
    } catch (e) {
      worker = false;
    }
  }
  if (!worker) return Promise.resolve().then(() => here(spec, codes, type));
  const id = ++next;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, fallback: () => { try { resolve(here(spec, codes, type)); } catch (e) { reject(e); } } });
    const msg = { id, spec: JSON.parse(JSON.stringify(spec)), codes };
    if (sentType !== type) { msg.type = type; sentType = type; }
    worker.postMessage(msg);
  });
}
