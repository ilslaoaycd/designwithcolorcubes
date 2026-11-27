// slicers.js — "Open in slicer" links for print files on this site. MIT licensed.
//
// Each desktop slicer below registers a URL scheme and, given ?file=<url>, downloads the file
// itself and opens it. Checked against each slicer's source in November 2026 (notes in
// docs/slicer-links.md):
//
//   OrcaSlicer, Elegoo Slicer, Creality Print, Snapmaker Orca: any https host, 3MF or STL.
//   Bambu Studio, QIDI Studio: 3MF only, and they ask "not from a trusted site, open anyway?".
//   UltiMaker Cura: STL, and 3MF because site/_headers sends Content-Disposition for each file.
//   PrusaSlicer: only opens files from its allowed marketplaces (Printables, Thingiverse,
//   Cults3D), so it gets a plain download instead.
//
// The file URL must be absolute https, end in .3mf or .stl, and carry no query string. It is
// percent-encoded exactly once; every slicer decodes it once.

const enc = encodeURIComponent;
const isMac = () => typeof navigator !== "undefined"
  && /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent)
  && !/iphone|ipad/i.test(navigator.userAgent);

/** In the order the buttons show. Brand-neutral: alphabetical. */
export const SLICERS = [
  { id: "bambu", label: "Bambu Studio", types: ["3mf"], link: (u) => (isMac() ? `bambustudioopen://${enc(u)}` : `bambustudio://open?file=${enc(u)}`) },
  { id: "creality", label: "Creality Print", types: ["3mf", "stl"], link: (u) => `crealityprintlink://open?file=${enc(u)}` },
  { id: "cura", label: "UltiMaker Cura", types: ["3mf", "stl"], link: (u) => `cura://open?file=${enc(u)}` },
  { id: "elegoo", label: "Elegoo Slicer", types: ["3mf", "stl"], link: (u) => `elegooslicer://open?file=${enc(u)}` },
  { id: "orca", label: "OrcaSlicer", types: ["3mf", "stl"], link: (u) => `orcaslicer://open?file=${enc(u)}` },
  { id: "qidi", label: "QIDI Studio", types: ["3mf"], link: (u) => (isMac() ? `qidistudioopen://${enc(u)}` : `qidistudio://open?file=${enc(u)}`) },
  { id: "snapmaker", label: "Snapmaker Orca", types: ["3mf", "stl"], link: (u) => `snapmaker-orca://open?file=${enc(u)}` }
];

/** Links to open an absolute file URL in each slicer that takes its type. */
export function slicerLinks(absUrl) {
  const ext = new URL(absUrl).pathname.split(".").pop().toLowerCase();
  return SLICERS.filter((s) => s.types.includes(ext)).map((s) => ({ id: s.id, label: s.label, href: s.link(absUrl) }));
}
