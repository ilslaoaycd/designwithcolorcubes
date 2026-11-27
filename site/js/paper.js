// paper.js — the paper size for printable PDFs: US Letter or A4. Letter where it's the usual size
// (judged from the browser's languages), A4 everywhere else, unless someone has picked one; the
// pick is kept in this browser. Shared by the designer and the patterns page. MIT licensed.

export const PAPERS = {
  letter: { label: "Letter", w: 612, h: 792 }, // 8.5 × 11 in, in points
  a4: { label: "A4", w: 595.28, h: 841.89 }    // 210 × 297 mm
};
const KEY = "colorcubes-paper";
// Where Letter is the usual paper.
const LETTER = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "CR", "GT", "SV", "NI", "PA", "DO", "PR", "BZ"]);

function guess() {
  const langs = (typeof navigator !== "undefined" && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of langs) {
    const region = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/.exec(l || "")?.[1];
    if (region) return LETTER.has(region.toUpperCase()) ? "letter" : "a4";
  }
  return "letter";
}

export function paper() {
  try { const p = localStorage.getItem(KEY); if (PAPERS[p]) return p; } catch (e) { /* ignore */ }
  return guess();
}

export function setPaper(p) {
  if (!PAPERS[p]) return;
  try { localStorage.setItem(KEY, p); } catch (e) { /* ignore */ }
}
