// Lets the tests import .wasm files the way Wrangler does: as a compiled WebAssembly.Module, and
// resolves the site's root-relative imports ("/js/cubecode.js") to files under site/.
// Used by `npm test` (node --import ./test/wasm-loader.mjs --test).
import { register } from "node:module";

const SITE = new URL("../site/", import.meta.url).href;
register("data:text/javascript," + encodeURIComponent(`
const SITE = ${JSON.stringify(SITE)};
export async function resolve(spec, context, next) {
  if (/^\\/(js|designer|box)\\//.test(spec)) return { url: SITE + spec.slice(1), shortCircuit: true };
  return next(spec, context);
}
export async function load(url, context, next) {
  if (!url.endsWith(".wasm")) return next(url, context);
  return {
    format: "module",
    shortCircuit: true,
    source: "import { readFileSync } from 'node:fs';" +
      "export default new WebAssembly.Module(readFileSync(new URL(" + JSON.stringify(url) + ")));"
  };
}`));
